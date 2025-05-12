import * as k8s from '@kubernetes/client-node';
import * as fs from 'fs';
import * as path from 'path';
import { CallToolRequest, CallToolRequestSchema, CallToolResult } from "@modelcontextprotocol/sdk/types";
import { isErrored } from 'stream';
import { error } from 'console';


const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const client = k8s.KubernetesObjectApi.makeApiClient(kc);

const mcpServer = "clusters-mcp-server"

let clusterToServerAPIMap: Map<string, string> = new Map()

export async function buildClusterConnectionWithRole(request: CallToolRequest): Promise<CallToolResult> {
  const { cluster, clusterRole = "cluster-admin" } = request.params.arguments as {
    cluster: string, clusterRole?: string
  }

  // https://open-cluster-management.io/docs/getting-started/integration/managed-serviceaccount/
  const msa = {
    apiVersion: 'authentication.open-cluster-management.io/v1beta1',
    kind: 'ManagedServiceAccount',
    metadata: {
      name: mcpServer,
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
      mcpServer,
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
      name: `${mcpServer}-binding`,
    },
    roleRef: {
      apiGroup: "rbac.authorization.k8s.io",
      kind: "ClusterRole",
      name: clusterRole, // default clusterRole name for kubernetes admin - "cluster-admin"
    },
    subjects: [
      {
        kind: "ServiceAccount",
        name: mcpServer,
        namespace: "open-cluster-management-agent-addon", // default namespace
      },
    ],
  };

  // create manifestWork to binding the clusterRole into the serviceAccount
  const bindingPermissionManifestWork = {
    apiVersion: 'work.open-cluster-management.io/v1',
    kind: 'ManifestWork',
    metadata: {
      name: mcpServer,
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


  let result = `Successfully created ServiceAccount ${mcpServer} and assigned the cluster-admin ClusterRole to it on cluster ${cluster}`;
  let isErrored = false
  try {
    const [tokenSecret, manifestsResponse, statusErrMsg] = await Promise.all([
      getSecretWithRetry(cluster, mcpServer),
      // createKubeConfigFile(acmMCPServer, cluster),
      client.patch<k8s.KubernetesObject>(
        bindingPermissionManifestWork, undefined, undefined, "acm-mcp-server", true,
        k8s.PatchStrategy.ServerSideApply),
      // get the status
      manifestWorkAppliedErrorMessage(client, mcpServer, cluster)
    ]);

    // error token
    if (typeof tokenSecret == 'string') {
      throw error(tokenSecret)
    }
    // error status
    if (statusErrMsg != "") {
      return {
        content: [{
          type: "text",
          text: statusErrMsg
        }],
        isErrored: true
      }
    }
    const kubeConfigErrMessage = generateKubeConfig(tokenSecret)
    if (kubeConfigErrMessage) {
      throw error(kubeConfigErrMessage)
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



export function getKubeConfig(namespace: string): string {
  return `/tmp/${mcpServer}.${namespace}`
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
  const server = clusterToServerAPIMap.get(cluster)

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

// the secret name is "acm-mcp-server", namespace is the cluster name
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
    const server = clusterToServerAPIMap.get(namespace)

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

// async function main() {
//   const response = await buildClusterConnectionWithRole({ params: { name: "clusters", arguments: { cluster: "hub2", clusterRole: "cluster-admin" } }, method: "tools/call" });
//   console.log(response);
// }

// main();
// // npx ts-node ./src/tools/call/conn-cluster.ts
