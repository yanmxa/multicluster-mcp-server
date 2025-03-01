
import {
  Tool
} from "@modelcontextprotocol/sdk/types";

export const LIST_RESOURCE: Tool = {
  name: "list_resources",
  description: "List all resources of a specific type in a namespace.",
  inputSchema: {
    type: "object",
    properties: {
      resourceType: { type: "string", description: "The resource type (e.g., Pod, Deployment)." },
      namespace: { type: "string", description: "Namespace of the resources." },
      labelSelector: { type: "string", description: "Optional label selector to filter results.", nullable: true },
      fieldSelector: { type: "string", description: "Optional field selector to filter results.", nullable: true },
      cluster: { type: "string", description: "Optional cluster name for multi-cluster environments.", nullable: true }
    },
    required: ["resourceType", "namespace"]
  }
}

export const GET_RESOURCE: Tool = {
  name: "get_resource",
  description: "Retrieve a specific Kubernetes resource.",
  inputSchema: {
    type: "object",
    properties: {
      resourceType: { type: "string", description: "The resource type (e.g., Pod, Deployment)." },
      resourceName: { type: "string", description: "The name of the resource." },
      namespace: { type: "string", description: "Namespace of the resource." },
      cluster: { type: "string", description: "Optional cluster name for multi-cluster environments.", nullable: true }
    },
    required: ["resourceType", "resourceName", "namespace"]
  }
}

export const APPLY_RESOURCE: Tool = {
  name: "apply_resource",
  description: "Apply a Kubernetes resource declaratively using Server-Side Apply (SSA).",
  inputSchema: {
    type: "object",
    properties: {
      resourceType: { type: "string", description: "The resource type (e.g., Pod, Deployment)." },
      resourceName: { type: "string", description: "The name of the resource." },
      namespace: { type: "string", description: "Namespace of the resource." },
      spec: {
        type: "object", description: "Complete specification of the resource. implement the 'interface KubernetesObject { apiVersion: string; kind: string; metadata?: V1ObjectMeta;}' }",
      },
      cluster: { type: "string", description: "Optional cluster name for multi-cluster environments.", nullable: true }
    },
    required: ["resourceType", "resourceName", "namespace", "spec"]
  }
}

export const PATCH_RESOURCE: Tool = {
  name: "patch_resource",
  description: "Patch a Kubernetes resource using JSON Patch, Merge Patch, or Strategic Merge Patch.",
  inputSchema: {
    type: "object",
    properties: {
      resourceType: { type: "string", description: "The resource type (e.g., Pod, Deployment)." },
      resourceName: { type: "string", description: "The name of the resource." },
      namespace: { type: "string", description: "Namespace of the resource." },
      spec: {
        type: "object", description: "Complete specification of the resource. implement the 'interface KubernetesObject { apiVersion: string; kind: string; metadata?: V1ObjectMeta;}' }",
      },
      patchType: { type: "string", description: "Patch type (application/json-patch+json, application/merge-patch+json, application/strategic-merge-patch+json, application/apply-patch+yaml)." },
      cluster: { type: "string", description: "Optional cluster name for multi-cluster environments.", nullable: true }
    },
    required: ["resourceType", "resourceName", "namespace", "patchData", "patchType"]
  }
}

export const DELETE_RESOURCE: Tool = {
  name: "delete_resource",
  description: "Delete a specific Kubernetes resource.",
  inputSchema: {
    type: "object",
    properties: {
      resourceType: { type: "string", description: "The resource type (e.g., Pod, Deployment)." },
      resourceName: { type: "string", description: "The name of the resource." },
      namespace: { type: "string", description: "Namespace of the resource." },
      propagationPolicy: { type: "string", description: "Propagation policy (Orphan, Background, Foreground).", nullable: true },
      cluster: { type: "string", description: "Optional cluster name for multi-cluster environments.", nullable: true }
    },
    required: ["resourceType", "resourceName", "namespace"]
  }
}

export const LOG_RESOURCE: Tool = {
  name: "log_resource",
  description: "Retrieve logs from a specific Pod or its container.",
  inputSchema: {
    type: "object",
    properties: {
      resourceName: { type: "string", description: "The name of the Pod." },
      namespace: { type: "string", description: "Namespace of the Pod." },
      containerName: { type: "string", description: "Optional container name if the Pod has multiple containers.", nullable: true },
      previous: { type: "boolean", description: "If true, retrieve logs from the previous instance of the container.", nullable: true },
      tailLines: { type: "integer", description: "Number of last lines to fetch from logs.", nullable: true },
      cluster: { type: "string", description: "Optional cluster name for multi-cluster environments.", nullable: true }
    },
    required: ["podName", "namespace"]
  }
}

export const DESCRIBE_RESOURCE: Tool = {
  name: "describe_resource",
  description: "Retrieve detailed information about a Kubernetes resource, including status and events.",
  inputSchema: {
    type: "object",
    properties: {
      resourceType: { type: "string", description: "The resource type (e.g., Pod, Deployment, Node)." },
      resourceName: { type: "string", description: "The name of the resource." },
      namespace: { type: "string", description: "Namespace of the resource (not required for cluster-wide resources like Nodes)." },
      cluster: { type: "string", description: "Optional cluster name for multi-cluster environments.", nullable: true }
    },
    required: ["resourceType", "resourceName"]
  }
}
