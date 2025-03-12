import * as k8s from '@kubernetes/client-node';
import * as fs from 'fs';
import * as path from 'path';
import { CallToolRequest, CallToolRequestSchema, CallToolResult } from "@modelcontextprotocol/sdk/types";
import { isErrored } from 'stream';
import { error } from 'console';


const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const client = k8s.KubernetesObjectApi.makeApiClient(kc);

const multiClusterMCPServer = "multicluster-mcp-server"

let clusterToServerMap: Map<string, string> = new Map()

// it will create the managedserviceaccount multicluster-mcp-server for the listed namespace 
export async function listClusters(request: CallToolRequest): Promise<CallToolResult> {
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

  clusterToServerMap = new Map(
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

  // console.log(JSON.stringify(response.items[0], null, 2))
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

export async function applyServiceAccountWithClusterRole(request: CallToolRequest): Promise<CallToolResult> {
  const { cluster, clusterRole } = request.params.arguments as { cluster: string, clusterRole?: k8s.KubernetesObject }
  // https://open-cluster-management.io/docs/getting-started/integration/managed-serviceaccount/
  const msa = {
    apiVersion: 'authentication.open-cluster-management.io/v1beta1',
    kind: 'ManagedServiceAccount',
    metadata: {
      name: multiClusterMCPServer,
      namespace: cluster,
    },
    spec: {
      rotation: {},
    },
  }

  const response = await client.patch<k8s.KubernetesObject>(msa, undefined, undefined, "multicluster-mcp-server", true, k8s.PatchStrategy.ServerSideApply)
  if (!response) {
    console.warn("patched mangedserviceaccount with empty response")
  }

  // list all the clusters
  const _ = listClusters({ params: { name: "list_clusters", arguments: {} }, method: "tools/call" })

  const errMessage = await createKubeConfigFile(multiClusterMCPServer, cluster)
  if (errMessage) {
    console.warn(errMessage)
  }

  // if the clusterRole is empty, return directly
  if (!clusterRole) {
    // console.warn(`Not attaching any permissions for ServiceAccount: ${multiClusterMCPServer}`);
    return {
      content: [{
        type: "text",
        text: `Created ServiceAccount ${multiClusterMCPServer} on cluster ${cluster}, but no ClusterRole attached!`
      }],
    }
  }

  const clusterRoleBinding = {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "ClusterRoleBinding",
    metadata: {
      name: `${multiClusterMCPServer}-binding`,
    },
    roleRef: {
      apiGroup: "rbac.authorization.k8s.io",
      kind: "ClusterRole",
      name: clusterRole.metadata?.name,
    },
    subjects: [
      {
        kind: "ServiceAccount",
        name: multiClusterMCPServer,
        namespace: "open-cluster-management-agent-addon", // default namespace
      },
    ],
  };

  // create manifestWork to binding the clusterRole into the serviceAccount
  const permission = {
    apiVersion: 'work.open-cluster-management.io/v1',
    kind: 'ManifestWork',
    metadata: {
      name: multiClusterMCPServer,
      namespace: cluster,
    },
    spec: {
      workload: {
        manifests: [
          clusterRole,
          clusterRoleBinding,
        ]
      }
    },
  }
  const manifestsResponse = await client.patch<k8s.KubernetesObject>(permission, undefined, undefined, "multicluster-mcp-server", true, k8s.PatchStrategy.ServerSideApply);
  // return manifestsResponse
  return {
    content: [{
      type: "text",
      text: `Created ServiceAccount ${multiClusterMCPServer} and attached ClusterRole ${clusterRole.metadata?.name} on cluster ${cluster} successfully!`
    }],
  }
}

export async function applyServiceAccountWithAdmin(request: CallToolRequest): Promise<CallToolResult> {
  const { cluster } = request.params.arguments as { cluster: string }

  // https://open-cluster-management.io/docs/getting-started/integration/managed-serviceaccount/
  const msa = {
    apiVersion: 'authentication.open-cluster-management.io/v1beta1',
    kind: 'ManagedServiceAccount',
    metadata: {
      name: multiClusterMCPServer,
      namespace: cluster,
    },
    spec: {
      rotation: {},
    },
  }

  const [response, listResponse] = await Promise.all([
    client.patch<k8s.KubernetesObject>(
      msa,
      undefined,
      undefined,
      "multicluster-mcp-server",
      true,
      k8s.PatchStrategy.ServerSideApply
    ),
    listClusters({ params: { name: "list_clusters", arguments: {} }, method: "tools/call" })
  ]);

  if (!response) {
    console.warn("Patched ManagedServiceAccount with empty response");
  }

  const clusterRoleBinding = {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "ClusterRoleBinding",
    metadata: {
      name: `${multiClusterMCPServer}-binding`,
    },
    roleRef: {
      apiGroup: "rbac.authorization.k8s.io",
      kind: "ClusterRole",
      name: "cluster-admin", // default clusterRole name for kubernetes admin
    },
    subjects: [
      {
        kind: "ServiceAccount",
        name: multiClusterMCPServer,
        namespace: "open-cluster-management-agent-addon", // default namespace
      },
    ],
  };

  // create manifestWork to binding the clusterRole into the serviceAccount
  const permission = {
    apiVersion: 'work.open-cluster-management.io/v1',
    kind: 'ManifestWork',
    metadata: {
      name: multiClusterMCPServer,
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

  let result = `Successfully created ServiceAccount ${multiClusterMCPServer} and assigned the cluster-admin ClusterRole to it on cluster ${cluster}`;
  let isErrored = false
  try {
    const [tokenSecret, manifestsResponse] = await Promise.all([
      getSecretWithRetry(cluster, multiClusterMCPServer),
      // createKubeConfigFile(multiClusterMCPServer, cluster),
      client.patch<k8s.KubernetesObject>(permission, undefined, undefined, "multicluster-mcp-server", true, k8s.PatchStrategy.ServerSideApply)
    ]);

    if (typeof tokenSecret == 'string') {
      throw error(tokenSecret)
    } else {
      const errMessage = generateKubeConfig(tokenSecret)
      if (errMessage) {
        throw error(errMessage)
      }
    }
  } catch (error: any) {
    isErrored = true
    result = `Failed to generate KUBECONFIG for ${cluster}: ${error}`
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

export function getKubeConfig(namespace: string): string {
  return `/tmp/${multiClusterMCPServer}.${namespace}`
}


async function getSecretWithRetry(namespace: string, secretName: string, retries: number = 3, delay: number = 5000): Promise<string | k8s.V1Secret> {
  const coreApi = kc.makeApiClient(k8s.CoreV1Api);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await coreApi.readNamespacedSecret({ name: secretName, namespace: namespace });
      const secretData = response.data;

      if (!secretData || !secretData["ca.crt"] || !secretData["token"]) {
        return `Secret ${secretName} in namespace ${namespace} does not contain a valid kubeconfig.`;
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

function generateKubeConfig(secret: k8s.V1Secret): string {
  const secretData = secret.data;
  const cluster = secret.metadata?.namespace || ""
  if (!secretData || !secretData["ca.crt"] || !secretData["token"]) {
    return `Secret ${secret.metadata?.namespace}/ ${secret.metadata?.name} contain a valid token or ca.crt.`;
  }

  const caCrt = secretData["ca.crt"];
  // Step 2: Decode Secret Data (Base64 -> String)
  const token = Buffer.from(secretData["token"], "base64").toString("utf-8");
  const server = clusterToServerMap.get(cluster)

  if (!server) {
    return "No current cluster server URL found in the clusters"
  }

  // Step 3: Construct the Kubeconfig YAML String
  const kubeconfigYaml = `apiVersion: v1
kind: Config
clusters:
- name: cluster
  cluster:
    certificate-authority-data: ${caCrt}
    server: ${server}
contexts:
- name: context
  context:
    cluster: cluster
    user: user
    namespace: ${cluster}
current-context: context
users:
- name: user
  user:
    token: ${token}
`;

  // Step 4: Write to kubeconfig.yaml File
  const fullPath = path.resolve(getKubeConfig(cluster));
  fs.writeFileSync(fullPath, kubeconfigYaml);
  // console.log(`Kubeconfig file created: ${fullPath}`);
  return "";
}

// the secret name is "multicluster-mcp-server", namespace is the cluster name
export async function createKubeConfigFile(secretName: string, namespace: string): Promise<string> {
  try {
    const outputPath = getKubeConfig(namespace)
    // Step 1: Retrieve the Secret
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    const response = await coreApi.readNamespacedSecret({ name: secretName, namespace: namespace });
    const secretData = response.data;
    if (!secretData || !secretData["ca.crt"] || !secretData["token"]) {
      return `Secret ${secretName} in namespace ${namespace} does not contain a valid kubeconfig.`;
    }

    const caCrt = secretData["ca.crt"];
    // Step 2: Decode Secret Data (Base64 -> String)
    const token = Buffer.from(secretData["token"], "base64").toString("utf-8");
    const server = clusterToServerMap.get(namespace)

    if (!server) {
      return "No current cluster server URL found in the clusters"
    }

    // Step 3: Construct the Kubeconfig YAML String
    const kubeconfigYaml = `apiVersion: v1
kind: Config
clusters:
- name: cluster
  cluster:
    certificate-authority-data: ${caCrt}
    server: ${server}
contexts:
- name: context
  context:
    cluster: cluster
    user: user
    namespace: ${namespace}
current-context: context
users:
- name: user
  user:
    token: ${token}
`;

    // Step 4: Write to kubeconfig.yaml File
    const fullPath = path.resolve(outputPath);
    fs.writeFileSync(fullPath, kubeconfigYaml);
    // console.log(`Kubeconfig file created: ${fullPath}`);
    return "";
  } catch (error) {
    return `Error creating Kubeconfig file from Secret ${secretName}: ${error}`;
  }
}


// async function main() {
//   const clusters = await listClusters({ params: { name: "list_clusters", arguments: {} }, method: "tools/call" }); // Now resolves to string[]
//   console.log(clusters);
//   const results = await Promise.all(
//     Array.from(clusterToServerMap.keys()).map((cluster) => applyServiceAccountWithAdmin({ params: { name: "list_clusters", arguments: { cluster: cluster } }, method: "tools/call" }))
//   );
//   console.log("Permission Result:", results);
// }

// main();
// npx ts-node test-listClusters.ts
