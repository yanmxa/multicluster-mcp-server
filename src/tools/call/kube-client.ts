import k8s, { KubernetesObjectApi, KubeConfig, KubernetesListObject, KubernetesObject, Log, LogOptions } from "@kubernetes/client-node";
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

    // Map the list to the required fields
    const formattedItems = listObject.items.map((item: any) => {
      return {
        NAME: item.metadata?.name || 'N/A',
        READY: `${item.status?.replicas || 0}/${item.status?.availableReplicas || 0}`,
        STATUS: item.status?.phase || '',  // Return empty string if phase doesn't exist
        RESTARTS: item.status?.restartCount || 0,
        AGE: item.metadata?.creationTimestamp ? getAge(item.metadata.creationTimestamp) : 'N/A',
      };
    });

    // Convert to Markdown Table format
    let markdownTable = [
      "| NAME | READY | STATUS | RESTARTS | AGE |",
      "| --- | --- | --- | --- | --- |",
      ...formattedItems.map(item => {
        // Only include STATUS column if it has a value
        const statusColumn = item.STATUS ? `| ${item.STATUS}` : '';
        return `| ${item.NAME} | ${item.READY} ${statusColumn} | ${item.RESTARTS} | ${item.AGE} |`;
      })
    ].join("\n");

    if (listObject.items && listObject.items.length == 0) {
      markdownTable = `No resources(${resourceType}) found in ${namespace} namespace.`
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

// Helper function to calculate AGE from timestamp
function getAge(creationTimestamp: string): string {
  const currentTime = new Date();
  const createdAt = new Date(creationTimestamp);
  const diffInMs = currentTime.getTime() - createdAt.getTime();
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));

  if (diffInHours < 24) {
    return `${diffInHours}h`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d`;
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

