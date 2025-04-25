
import {
  Tool
} from "@modelcontextprotocol/sdk/types";

export const KUBE_EXECUTOR: Tool = {
  name: "kube_executor",
  description: "Securely run a kubectl command or apply YAML. Provide either 'command' or 'yaml'.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The full kubectl command to execute. Must start with 'kubectl'.",
        nullable: true
      },
      yaml: {
        type: "string",
        description: "YAML configuration to apply, provided as a string.",
        nullable: true,
      },
      cluster: {
        type: "string",
        description: "The cluster name in a multi-cluster environment. Defaults to the hub cluster.",
        default: "default",
      },
    },
    required: []
  }
};


export const MANAGED_CLUSTERS: Tool = {
  name: "clusters",
  description: "Retrieves a list of Kubernetes clusters (also known as managed clusters or spoke clusters).",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  },
  outputSchema: {
    type: "string",
    description: "the clusters managed by the current cluster (known as hub cluster)"
  }
};

export const CONNECT_WITH_ROLE: Tool = {
  name: "connect_cluster_via_role",
  description: "Generates the KUBECONFIG for the managed cluster and binds it to the specified ClusterRole (default: cluster-admin).",
  inputSchema: {
    type: "object",
    properties: {
      cluster: {
        type: "string",
        description: "The target cluster where the ServiceAccount will be created for the KUBECONFIG."
      },
      clusterRole: {
        type: "string",
        description: "The ClusterRole defining permissions to access the cluster",
        default: "cluster-admin"
      }
    },
    required: ["cluster"]
  },
  outputSchema: {
    type: "string",
    description: "A message indicating the success or failure of the operation."
  }
};