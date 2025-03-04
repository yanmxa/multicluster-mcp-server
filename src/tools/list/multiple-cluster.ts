import { Tool } from "@modelcontextprotocol/sdk/types";

export const LIST_CLUSTERS: Tool = {
  name: "list_clusters",
  description: "Retrieves a list of available Kubernetes clusters (also known as managed or spoke clusters).",
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

export const APPLY_SA_WITH_ADMIN: Tool = {
  name: "connect_cluster_with_admin",
  description: "Creates a ServiceAccount, generates a kubeconfig for cluster authentication, and binds it to the cluster-admin ClusterRole in the specified cluster.",
  inputSchema: {
    type: "object",
    properties: {
      cluster: {
        type: "string",
        description: "The target cluster where the ServiceAccount will be created."
      }
    },
    required: ["cluster"]
  },
  outputSchema: {
    type: "string",
    description: "A message indicating the success or failure of the operation."
  }
};


export const APPLY_SA_WITH_CLUSTER_ROLE: Tool = {
  name: "apply_service_account_with_cluster_role",
  description: "Creates a ServiceAccount in the specified cluster and optionally binds it to a ClusterRole. If no ClusterRole is provided, only the ServiceAccount and kubeconfig are created.",
  inputSchema: {
    type: "object",
    properties: {
      cluster: {
        type: "string",
        description: "The cluster where the ServiceAccount will be created."
      },
      clusterRole: {
        type: "object",
        description: "Optional ClusterRole object defining permissions for the ServiceAccount. If omitted, only the ServiceAccount and kubeconfig are created.",
        nullable: true
      }
    },
    required: ["cluster"]
  },
  outputSchema: {
    type: "string",
    description: "The result message indicating whether the operation was successful."
  }
};
