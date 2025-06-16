import { KubeConfig, CustomObjectsApi } from "@kubernetes/client-node";
import { getKubeconfigFile } from "./kubectl";
import * as axios from "axios";
import https from "https";
import dayjs from "dayjs";
import { z } from "zod";

import { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * Connects to the Prometheus `thanos-querier` endpoint, runs a PromQL query:
 *
 * - For `snapshot`: data: [{ pod: 'pod-name', value: 123.45 }]
 * - For `range`:    data: [{ metric: { pod: '...' }, values: [[timestamp, value], ...] }]
 */
export const prometheusDesc = "Queries a Prometheus server (snapshot or range) and returns metrics formatted for charting."

export const prometheusArgs = {
  ql: z.string().describe(
    "The PromQL query string to run against the Prometheus server."
  ),

  data_type: z
    .enum(["snapshot", "range"])
    .describe("Type of query: 'snapshot' (instant) or 'range' (time-series).")
    .default("snapshot"),

  group_by: z
    .string()
    .describe(
      "Label to group results by, such as 'pod' or 'namespace'. If not specified, behavior depends on the query (e.g., 'sum', 'avg')."
    )
    .default("pod"),

  unit: z
    .enum(["auto", "bytes", "MiB", "GiB", "cores", "millicores"])
    .describe(
      "Desired output unit. Use 'auto' to infer from the query content (e.g., memory → MiB, CPU → cores)."
    )
    .default("auto"),

  cluster: z
    .string()
    .describe(
      "Target cluster name in a multi-cluster environment. Defaults to the hub cluster if not provided."
    )
    .default("default")
    .optional(),

  start: z
    .string()
    .describe(
      "(range only) Start time in ISO 8601 format, e.g., '2025-06-06T00:00:00Z'."
    )
    .optional(),

  end: z
    .string()
    .describe(
      "(range only) End time in ISO 8601 format. Defaults to current time if not provided."
    )
    .optional(),

  step: z
    .string()
    .describe(
      "(range only) Resolution step (e.g., '30s', '5m', '1h'). Choose appropriately to keep the sample count under 200."
    )
    .optional(),
};

const prometheusCache = new Map<string, { url: string; token: string }>();

export async function prometheus({
  ql,
  data_type = "snapshot",
  group_by = "pod",
  unit = "auto",
  cluster = "default",
  start,
  end,
  step = "5m",
}: {
  ql: string;
  data_type: "snapshot" | "range";
  group_by: string;
  unit: "auto" | "bytes" | "MiB" | "GiB" | "cores" | "millicores";
  cluster?: string;
  start?: string;
  end?: string;
  step?: string;
}): Promise<CallToolResult> {

  let responseData: any[] = [];

  try {
    const { url, token } = await getPrometheusURL(cluster);

    const headers = { Authorization: token };
    const effectiveUnit = inferUnit(unit, ql);

    const httpsAgent = new https.Agent({ rejectUnauthorized: false });

    if (data_type === "range") {
      const response = await axios.default.get(`${url}/api/v1/query_range`, {
        headers,
        params: {
          query: ql,
          start,
          end,
          step,
        },
        httpsAgent,
        proxy: false,
      });
      responseData = response.data.data.result.map((series: any) => ({
        metric: series.metric,
        values: series.values.map(([timestamp, rawValue]: [number, string]) => [
          dayjs.unix(timestamp).toISOString(),
          Number(rawValue) / (1024 * 1024), // bytes → MiB
        ]),
      }));
    } else {

      const response = await axios.default.get(`${url}/api/v1/query`, {
        headers,
        params: { query: ql },
        httpsAgent,
        proxy: false,
      });

      responseData = response.data.data.result.map(
        (entry: { metric: { [x: string]: any; }; value: (string | number)[]; }) => (
          {
            [group_by]: entry.metric[group_by] || "value",
            value: transformValue(entry.value[1], effectiveUnit),
          }
        ));
    }

    // console.warn(responseData)
    if (responseData.length === 0) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            data: [],
            type: data_type,
            unit: effectiveUnit,
          }),
        }],
      };
      // return { data: [], type: data_type, unit: effectiveUnit };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              data: responseData,
              type: data_type,
              unit: effectiveUnit,
            }),
        }
      ],
    };
  } catch (err: any) {
    console.error(responseData)
    console.error(err)
    return {
      content: [{
        type: "text",
        text: `Failed to query Prometheus: ${err.message || String(err)}`,
      }],
    };
  }
}

export async function getPrometheusURL(cluster?: string): Promise<{ url: string; token: string }> {
  const cacheKey = cluster || "default";

  if (prometheusCache.has(cacheKey)) {
    return prometheusCache.get(cacheKey)!;
  }

  const kubeConfigFile = await getKubeconfigFile(cluster)

  const kc = new KubeConfig();
  if (kubeConfigFile) {
    kc.loadFromFile(kubeConfigFile);
  } else {
    kc.loadFromDefault();
  }

  const customApi = kc.makeApiClient(CustomObjectsApi);
  const res = await customApi.getNamespacedCustomObject({
    group: "route.openshift.io",
    version: "v1",
    namespace: "openshift-monitoring",
    plural: "routes",
    name: "thanos-querier"
  });

  const host = (res as any)?.spec?.host;
  if (!host) {
    throw new Error(`Failed to retrieve Prometheus route from cluster ${cluster}.`);
  }

  const user = kc.getCurrentUser();
  const token = user?.token;
  if (!token) {
    throw new Error(`No token found in KUBECONFIG for cluster ${cluster}.`);
  }

  const result = {
    url: `https://${host}`,
    token: `Bearer ${token}`,
  };

  prometheusCache.set(cacheKey, result);
  return result;
}

function inferUnit(unit: string, query: string): string {
  if (unit !== "auto") return unit;
  const q = query.toLowerCase();
  if (q.includes("memory") || q.includes("bytes")) return "MiB";
  if (q.includes("cpu")) return "cores";
  return "raw";
}

function transformValue(value: string | number, unit: string): number {
  const val = typeof value === "string" ? parseFloat(value) : value;
  switch (unit) {
    case "MiB": return val / (1024 * 1024);
    case "GiB": return val / (1024 * 1024 * 1024);
    case "millicores": return val * 1000;
    default: return val;
  }
}

// async function main() {
//   // let result = await getPrometheusURL();

//   // console.log(result);

//   let res = await prometheus({
//     ql: "sum(container_memory_usage_bytes{namespace=\"open-cluster-management-agent\"}) by (pod)",
//     data_type: "snapshot",
//     group_by: "pod",
//     unit: "MiB",
//     cluster: "cluster2",
//     // start?: string;
//     // end?: string;
//     // step?: string;
//   })
//   console.log(res)

//   // let res = await prometheus({
//   //   ql: "sum(container_memory_usage_bytes{namespace=\"open-cluster-management\",pod=~\"multicluster-operators.*\"}) by (pod)",
//   //   data_type: "range",
//   //   group_by: "pod",
//   //   unit: "MiB",
//   //   // cluster: "cluster2",
//   //   start: "2025-06-08T14:56:46Z",
//   //   end: "2025-06-10T14:56:46Z",
//   //   step: "3h",
//   // })
//   // console.log(JSON.stringify(res, null, "  "))
// }

// main();
// // npx ts-node ./src/tools/prometheus.ts