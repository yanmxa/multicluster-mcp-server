import k8s, { KubernetesObjectApi, KubeConfig, KubernetesListObject, KubernetesObject, Log, LogOptions, V1APIGroup } from "@kubernetes/client-node";
import { Writable } from 'node:stream';
import { CallToolRequest, CallToolRequestSchema, CallToolResult } from "@modelcontextprotocol/sdk/types";
import { getKubeResourceSchema } from "./kube-client.gvk-registry";
import cluster from "cluster";
import { json } from "node:stream/consumers";

// Helper function to initialize Kubernetes client with a specific cluster
function getClientForCluster(cluster?: string): KubernetesObjectApi {
  const kc = new KubeConfig();
  kc.loadFromDefault();

  // if (cluster) {
  //   kc.loadFromCluster(cluster);  // Load specific cluster config
  // } else {
  //   kc.loadFromDefault();  // Default cluster config
  // }
  return k8s.KubernetesObjectApi.makeApiClient(kc);
}

// Helper function to initialize Kubernetes client with a specific cluster
function getLogAPIForCluster(cluster?: string): Log {
  const kc = new KubeConfig();
  kc.loadFromDefault();

  // if (cluster) {
  //   kc.loadFromCluster(cluster);  // Load specific cluster config
  // } else {
  //   kc.loadFromDefault();  // Default cluster config
  // }
  return new Log(kc);
}

interface KubernetesRequest {
  resourceType: string;
  resourceName?: string;
  namespace: string;
  spec?: KubernetesObject;
  patchData?: object;
  patchType?: string;
  propagationPolicy?: string;
  labelSelector?: string;
  fieldSelector?: string;

  // for pod log
  containerName?: string;
  previous?: boolean;
  tailLines?: number;

  // cluster context
  cluster?: string;
}

function isKubernetesRequest(obj: any): obj is KubernetesRequest {
  return obj && typeof obj.resourceType === "string" && typeof obj.namespace === "string";
}

/**
 * List all resources of a given type in a namespace.
 */
export async function listResources(request: CallToolRequest): Promise<CallToolResult> {
  const args = request.params.arguments;
  if (!isKubernetesRequest(args)) {
    throw new Error("Invalid request arguments");
  }
  const { resourceType, namespace, labelSelector, fieldSelector, cluster } = args;
  const client = getClientForCluster(cluster)

  try {
    const { apiVersion, kind } = getKubeResourceSchema(resourceType)
    const listObject: KubernetesListObject<KubernetesObject> = await client.list(
      apiVersion,
      kind,
      namespace,
      "true",
      undefined,
      undefined,
      fieldSelector,
      labelSelector,
      undefined
    )

    // Define available fields for each Kubernetes resource type
    const resourceFields: Record<string, string[]> = {
      Pod: ["NAME", "READY", "STATUS", "RESTARTS", "AGE"],
      Deployment: ["NAME", "READY", "AVAILABLE", "AGE"],
      Service: ["NAME", "TYPE", "CLUSTER-IP", "PORTS", "AGE"],
      StatefulSet: ["NAME", "READY", "AGE"],
      Job: ["NAME", "COMPLETIONS", "DURATION", "AGE"],
      Secret: ["NAME", "TYPE", "DATA", "AGE"],
      ConfigMap: ["NAME", "DATA", "AGE"]
    };

    // Define the type structure for Kubernetes items
    interface KubernetesItem {
      NAME: string;
      READY: string;
      STATUS?: string;
      RESTARTS?: number;
      AGE: string;
      AVAILABLE?: number;
      TYPE?: string;
      DATA?: number;
      "CLUSTER-IP"?: string;
      PORTS?: string;
      COMPLETIONS?: string;
      DURATION?: string;
    }

    // Map the list to the required fields dynamically
    const formattedItems: KubernetesItem[] = listObject.items.map((item: any) => {
      let ready: string = "";

      if (item instanceof k8s.V1Pod) {
        // Ensure item is treated as a Pod
        const pod = item
        // Ensure `spec` and `containers` exist
        const totalContainers = pod.spec?.containers?.length || 0;
        const readyContainers = pod.status?.containerStatuses?.filter((c: k8s.V1ContainerStatus) => c.ready).length || 0;
        ready = totalContainers > 0 ? `${readyContainers}/${totalContainers}` : "";
      } else {
        // For Deployments, StatefulSets, use replicas
        ready = item?.status?.readyReplicas !== undefined && item?.status?.replicas !== undefined
          ? `${item.status.readyReplicas}/${item.status.replicas}`
          : "0/0";
      }

      return {
        NAME: item.metadata?.name || "N/A",
        READY: ready, // Correct READY value
        STATUS: item.status?.phase || "Unknown",
        RESTARTS: item.status?.containerStatuses
          ? item.status.containerStatuses.reduce((sum: number, c: any) => sum + (c.restartCount || 0), 0)
          : 0, // Ensure `reduce()` does not break if `containerStatuses` is undefined
        AGE: item.metadata?.creationTimestamp ? getAge(item.metadata.creationTimestamp) : "N/A",
        DATA: item.data ? Object.keys(item.data).length : -1,
        AVAILABLE: item.status?.availableReplicas,
        TYPE: item.spec?.type || (item.type ? item.type : undefined),
        "CLUSTER-IP": item.spec?.clusterIP || "N/A",
        PORTS: item.spec?.ports
          ? item.spec.ports.map((p: any) => `${p.port}/${p.protocol}`).join(", ")
          : "N/A", // Ensure PORTS does not break if undefined
        COMPLETIONS: item.status?.succeeded !== undefined
          ? `${item.status.succeeded}/${item.spec?.completions || 1}`
          : undefined,
        DURATION: getJobDuration(item.status?.startTime, item.status?.completionTime)
      };
    });


    // Determine the relevant fields based on resource type
    let fields = resourceFields[getKubeResourceSchema(resourceType).kind] || ["NAME", "AGE"];

    // **Filter out columns where all values are empty or undefined**
    fields = fields.filter(field =>
      formattedItems.some(item => item[field as keyof KubernetesItem] !== undefined && item[field as keyof KubernetesItem] !== "" && item[field as keyof KubernetesItem] !== -1)
    );

    let markdownTable = `No resources(${resourceType}) found in ${namespace} namespace.`
    if (listObject.items && listObject.items.length > 0) {
      // Generate Markdown Table dynamically
      markdownTable = [
        `| ${fields.join(" | ")} |`,
        `| ${fields.map(() => "---").join(" | ")} |`,
        ...formattedItems.map(item =>
          `| ${fields.map(field => item[field as keyof KubernetesItem] ?? "").join(" | ")} |`
        )
      ].join("\n").trim();

    }

    return {
      content: [{
        type: "text",
        text: markdownTable
      }]
    } as CallToolResult;
  } catch (error: any) {
    throw new Error(`Error listing ${resourceType}: ${error.message}`);
  }
}

// Helper function to calculate Job duration
function getJobDuration(startTime?: string, completionTime?: string): string {
  if (!startTime) return "N/A";
  const start = new Date(startTime).getTime();
  const end = completionTime ? new Date(completionTime).getTime() : Date.now();
  const durationMs = end - start;
  return durationMs < 60000
    ? `${Math.floor(durationMs / 1000)}s`
    : `${Math.floor(durationMs / 60000)}m`;
}

// Helper function to calculate AGE from timestamp
function getAge(creationTimestamp: string): string {
  const currentTime = new Date();
  const createdAt = new Date(creationTimestamp);
  const diffInMs = currentTime.getTime() - createdAt.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);
  const remainingHours = diffInHours % 24;

  if (diffInHours < 1) {
    return `${diffInMinutes}m`;
  } else if (diffInHours < 24) {
    return `${diffInHours}h${diffInMinutes % 60}m`;
  } else {
    return `${diffInDays}d${remainingHours}h`;
  }
}


// Retrieve a specific Kubernetes resource
export async function getResource(request: CallToolRequest): Promise<CallToolResult> {
  const args = request.params.arguments;
  if (!isKubernetesRequest(args)) {
    throw new Error("Invalid request arguments");
  }
  const { resourceType, resourceName, namespace, cluster } = args;

  try {
    const client = getClientForCluster(cluster); // Initialize client with cluster
    const { apiVersion, kind } = getKubeResourceSchema(resourceType);
    const resource = await client.read(
      {
        apiVersion: apiVersion,
        kind: kind,
        metadata: {
          name: resourceName,
          namespace: namespace,
        },
      }
    );
    return {
      content: [{
        type: "text",
        text: JSON.stringify(resource, null, 2)
      }]
    } as CallToolResult;
  } catch (error: any) {
    throw new Error(`Error retrieving ${resourceType} ${resourceName}: ${error.message}`);
  }
}

// Apply a Kubernetes resource declaratively
export async function applyResource(request: CallToolRequest): Promise<CallToolResult> {
  const args = request.params.arguments;
  if (!isKubernetesRequest(args) || !args.spec) {
    throw new Error("Invalid request arguments or missing spec");
  }
  const { resourceType, resourceName, namespace, spec, cluster } = args;


  try {
    const client = getClientForCluster(cluster); // Initialize client with cluster
    const { apiVersion, kind } = getKubeResourceSchema(resourceType);
    spec.apiVersion = apiVersion
    spec.kind = kind
    if (!spec.metadata) {
      spec.metadata = {};
    }
    spec.metadata.name = resourceName;
    spec.metadata.namespace = namespace

    const result = await client.patch(
      spec
    );
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    } as CallToolResult;
  } catch (error: any) {
    throw new Error(`Error applying ${resourceType} ${resourceName}: ${error.message}`);
  }
}

// Patch a Kubernetes resource
export async function patchResource(request: CallToolRequest): Promise<CallToolResult> {
  const args = request.params.arguments;
  if (!isKubernetesRequest(args) || !args.spec) {
    throw new Error("Invalid request arguments or missing spec");
  }

  if (!isKubernetesRequest(args) || !args.patchData || !args.patchType) {
    throw new Error("Invalid request arguments or missing patch data/type");
  }
  const { resourceType, resourceName, namespace, spec, patchData, patchType, cluster } = args;

  try {
    const client = getClientForCluster(cluster); // Initialize client with cluster
    const { apiVersion, kind } = getKubeResourceSchema(resourceType);

    spec.apiVersion = apiVersion
    spec.kind = kind
    if (!spec.metadata) {
      spec.metadata = {};
    }
    spec.metadata.name = resourceName;
    spec.metadata.namespace = namespace

    const result = await client.patch(
      spec,
      undefined,
      undefined,
      undefined,
      undefined,
      patchType as k8s.PatchStrategy,

    );
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    } as CallToolResult;
  } catch (error: any) {
    throw new Error(`Error patching ${resourceType} ${resourceName}: ${error.message}`);
  }
}

// Delete a specific Kubernetes resource
export async function deleteResource(request: CallToolRequest): Promise<CallToolResult> {
  const args = request.params.arguments;
  if (!isKubernetesRequest(args)) {
    throw new Error("Invalid request arguments");
  }
  const { resourceType, resourceName, namespace, propagationPolicy, cluster } = args;

  try {
    const client = getClientForCluster(cluster); // Initialize client with cluster
    const { apiVersion, kind } = getKubeResourceSchema(resourceType);
    const spec: KubernetesObject = {
      apiVersion: apiVersion,
      kind: kind,
      metadata: {
        name: resourceName,
        namespace: namespace,
      }
    }
    const result = await client.delete(
      spec,
      undefined,
      undefined,
      undefined,
      undefined,
      propagationPolicy,
      undefined
    );
    return {
      content: [{
        type: "text",
        text: `Successfully deleted ${resourceType} ${resourceName}`
      }]
    } as CallToolResult;
  } catch (error: any) {
    throw new Error(`Error deleting ${resourceType} ${resourceName}: ${error.message}`);
  }
}

// Retrieve logs from a specific Pod or container
export async function logResource(request: CallToolRequest): Promise<CallToolResult> {
  const args = request.params.arguments;
  if (!isKubernetesRequest(args)) {
    throw new Error("Invalid request arguments");
  }
  if (!args.resourceName || !args.namespace) {
    throw new Error("Invalid request arguments: missing podName or namespace");
  }
  const { resourceName, namespace, containerName, previous, tailLines, cluster } = args;

  try {
    const client = getClientForCluster(cluster); // Initialize client with cluster
    const log = getLogAPIForCluster(cluster)
    const options: LogOptions = {
      follow: true,
      limitBytes: 100,
      pretty: true,
      previous: previous,
      sinceSeconds: 1,
      tailLines: tailLines,
      timestamps: true,
    };
    const stream = new Writable({
      write(chunk, encoding, callback) {
        callback();
      },
    });
    const logs = await log.log(
      namespace,
      resourceName,
      containerName || "",
      stream,
      options,
    );


    return {
      content: [{
        type: "text",
        text: JSON.stringify(logs, null, 2)
      }]
    } as CallToolResult;
  } catch (error: any) {
    throw new Error(`Error retrieving logs for ${resourceName}: ${error.message}`);
  }
}

// // Retrieve detailed information about a Kubernetes resource
// export async function describeResource(request: CallToolRequest): Promise<CallToolResult> {
//   const args = request.params.arguments;
//   if (!isKubernetesRequest(args)) {
//     throw new Error("Invalid request arguments");
//   }
//   const { resourceType, resourceName, namespace, cluster } = args;

//   try {
//     const client = getClientForCluster(cluster); // Initialize client with cluster
//     const { apiVersion, kind } = getKubeResourceSchema(resourceType);
//     const resourceDescription = await client.describe(
//       apiVersion,
//       kind,
//       resourceName,
//       namespace
//     );
//     return {
//       content: [{
//         type: "text",
//         text: JSON.stringify(resourceDescription, null, 2)
//       }]
//     } as CallToolResult;
//   } catch (error: any) {
//     throw new Error(`Error describing ${resourceType} ${resourceName}: ${error.message}`);
//   }
// }

