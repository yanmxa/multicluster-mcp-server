import { CallToolRequest, CallToolResult } from "@modelcontextprotocol/sdk/types";
import * as k8s from '@kubernetes/client-node';
import { z } from "zod";
import { generateKubeconfig } from "../utils/kubeconfig";

// client from env KUBECONFIG
const kc = new k8s.KubeConfig()
kc.loadFromDefault()
const client = k8s.KubernetesObjectApi.makeApiClient(kc);

// clusterName to APIServer
let clusterToServerAPIMap: Map<string, string> = new Map()

// tool clusters 
export const listClusterDesc = "Retrieves a list of Kubernetes clusters (also known as managed clusters or spoke clusters)."
export const listClustersArgs = {}

export async function listClusters({ }): Promise<CallToolResult> {
  const response = await client.list<k8s.KubernetesObject>("cluster.open-cluster-management.io/v1", "ManagedCluster")
  if (!response || response.items.length == 0) {
    console.warn("no managed clusters on the current cluster")
    return {
      content: [{
        type: "text",
        text: "no managed clusters available on the current cluster"
      }],
    }
  }

  clusterToServerAPIMap = new Map(
    response.items.map((item: any) => {
      const name: string = item.metadata?.name;
      const server: string = item.spec?.managedClusterClientConfigs?.[0]?.url;
      return [name, server];
    })
  );

  // Format table header
  let result = `NAME       HUB ACCEPTED   MANAGED CLUSTER URLS                                                            JOINED   AVAILABLE   AGE\n`;

  // Process each cluster and format the output
  response.items.forEach((item: any) => {
    const name: string = item.metadata?.name || "Unknown";
    const hubAccepted: string = item.spec?.hubAcceptsClient ? "true" : "false";
    const server: string = item.spec?.managedClusterClientConfigs?.[0]?.url || "N/A";

    // Extract conditions
    const joinedCondition = item.status?.conditions?.find((c: any) => c.type === "ManagedClusterJoined")?.status || "False";
    const availableCondition = item.status?.conditions?.find((c: any) => c.type === "ManagedClusterConditionAvailable")?.status || "False";

    // Calculate cluster age
    const creationTimestamp = item.metadata?.creationTimestamp;
    const age = creationTimestamp ? getClusterAge(creationTimestamp) : "N/A";

    // Append formatted row
    result += `${name.padEnd(10)} ${hubAccepted.padEnd(14)} ${server.padEnd(80)} ${joinedCondition.padEnd(8)} ${availableCondition.padEnd(10)} ${age}\n`;
  });

  return {
    content: [{
      type: "text",
      text: result
    }],
  }
}

function getClusterAge(creationTimestamp: string): string {
  const createdDate = new Date(creationTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - createdDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return `${diffDays}d`;
}

export const connectClusterArgs = {
  cluster: z.string().describe("The target cluster where the ServiceAccount will be created for the KUBECONFIG."),
  clusterRole: z.string().default('cluster-admin').describe("The ClusterRole defining permissions to access the cluster")
}

export const connectClusterDesc = "Generates the KUBECONFIG for the managed cluster and binds it to the specified ClusterRole (default: cluster-admin)."

export async function connectCluster({ cluster, clusterRole = "cluster-admin" }: {
  cluster: string, clusterRole?: string
}): Promise<CallToolResult> {
  // https://open-cluster-management.io/docs/getting-started/integration/managed-serviceaccount/
  const mcpServerName = "multicluster-mcp-server"
  const msa = {
    apiVersion: 'authentication.open-cluster-management.io/v1beta1',
    kind: 'ManagedServiceAccount',
    metadata: {
      name: mcpServerName,
      namespace: cluster,
    },
    spec: {
      rotation: {},
    },
  }

  const mca = {
    apiVersion: 'addon.open-cluster-management.io/v1alpha1',
    kind: 'ManagedClusterAddOn',
    metadata: {
      name: "managed-serviceaccount",
      namespace: cluster,
    },
  }

  let result = `Successfully connected to cluster ${cluster} using ServiceAccount ${mcpServerName}, with the ${clusterRole} ClusterRole assigned.`;

  let isErrored = false
  try {

    const [applyMsa, getMca, getClusters] = await Promise.all([
      client.patch<k8s.KubernetesObject>(
        msa,
        undefined,
        undefined,
        mcpServerName,
        true,
        k8s.PatchStrategy.ServerSideApply
      ),
      client.read(mca),
      listClusters({})
    ]);


    if (!applyMsa) {
      console.warn(`Patched ManagedServiceAccount ${msa.metadata.namespace}/${msa.metadata.name} with empty response`);
    }

    const saNamespace = (getMca as any)?.status?.namespace;
    if (!saNamespace) {
      throw new Error(`ManagedServiceAccount ${mca.metadata.namespace}/${mca.metadata.name} not found in the cluster`);
    }

    const clusterRoleBinding = {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "ClusterRoleBinding",
      metadata: {
        name: `${mcpServerName}-clusterrolebinding`,
      },
      roleRef: {
        apiGroup: "rbac.authorization.k8s.io",
        kind: "ClusterRole",
        name: clusterRole, // default clusterRole name for kubernetes admin - "cluster-admin"
      },
      subjects: [
        {
          kind: "ServiceAccount",
          name: mcpServerName,
          namespace: saNamespace,
        },
      ],
    };

    // create manifestWork to binding the clusterRole into the serviceAccount
    const bindingPermissionManifestWork = {
      apiVersion: 'work.open-cluster-management.io/v1',
      kind: 'ManifestWork',
      metadata: {
        name: mcpServerName,
        namespace: cluster,
      },
      spec: {
        workload: {
          manifests: [
            clusterRoleBinding,
          ]
        }
      },
    }

    const [tokenSecret, applyRBACManifest, appliedStatusErrMessage] = await Promise.all([
      getSecretWithRetry(cluster, mcpServerName),
      // createKubeConfigFile(acmMCPServer, cluster),
      client.patch<k8s.KubernetesObject>(
        bindingPermissionManifestWork, undefined, undefined, mcpServerName, true,
        k8s.PatchStrategy.ServerSideApply),
      // get the status
      manifestWorkAppliedErrorMessage(client, mcpServerName, cluster)
    ]);

    // error token
    if (typeof tokenSecret == 'string') {
      throw new Error(tokenSecret)
    }

    // error status
    if (appliedStatusErrMessage != "") {
      throw new Error(appliedStatusErrMessage)
    }

    const kubeConfigErrMessage = generateKubeconfig(tokenSecret, clusterToServerAPIMap);
    if (kubeConfigErrMessage) {
      throw new Error(kubeConfigErrMessage)
    }

  } catch (err: any) {
    isErrored = true
    result = `Failed to generate KUBECONFIG for ${cluster}: ${err}`
  }

  // return manifestsResponse
  return {
    content: [{
      type: "text",
      text: result
    }],
    isErrored: isErrored
  }
}


async function getSecretWithRetry(namespace: string, secretName: string, retries: number = 10, delay: number = 2000): Promise<string | k8s.V1Secret> {
  const coreApi = kc.makeApiClient(k8s.CoreV1Api);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await coreApi.readNamespacedSecret({ name: secretName, namespace: namespace });
      const secretData = response.data;

      if (!secretData || !secretData["ca.crt"] || !secretData["token"]) {
        return `Secret ${secretName} in namespace ${namespace} does not contain a valid token for kubeconfig.`;
      }

      return response; // Return the secret data if it is valid
    } catch (error) {
      // If the secret is not found, retry
      if (attempt < retries) {
        console.warn(`Attempt ${attempt} failed: Secret not found. Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay)); // Delay before retrying
      } else {
        return `Failed to retrieve Secret ${secretName} after ${retries} attempts.`;
      }
    }
  }
  return `Failed to retrieve token Secret ${namespace}/${secretName} after ${retries} attempts.`
}

async function manifestWorkAppliedErrorMessage(
  client: k8s.KubernetesObjectApi,
  name: string,
  namespace: string,
  retryIntervalMs = 2000,
  timeoutMs = 30000
): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const result = await client.read({
      apiVersion: 'work.open-cluster-management.io/v1',
      kind: 'ManifestWork',
      metadata: { name, namespace },
    }) as any;

    const manifestsStatus = result.status?.resourceStatus?.manifests ?? [];

    for (const manifest of manifestsStatus) {
      const conditions = manifest.conditions ?? [];

      const appliedCondition = conditions.find((cond: any) => cond.type === 'Applied');
      // console.log(appliedCondition)
      if (appliedCondition) {
        return appliedCondition.status === 'False'
          ? appliedCondition.message ?? 'Unknown error occurred while applying manifest.'
          : '';
      }
    }

    // Wait before retrying
    await new Promise(resolve => setTimeout(resolve, retryIntervalMs));
  }

  throw new Error(`Timed out waiting for ManifestWork ${name} in ${namespace} to report Applied status.`);
}

// async function main() {
//   const clusters = await connectCluster({ cluster: "cluster1" });
//   console.log(clusters);
// }

// main();
// // npx ts-node ./src/tools/clusters.ts
