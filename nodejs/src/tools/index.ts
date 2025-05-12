
import {
  CallToolResult,
  CallToolRequest,
} from "@modelcontextprotocol/sdk/types";
import { KUBE_EXECUTOR, MANAGED_CLUSTERS, CONNECT_WITH_ROLE } from "./list/kube-schema";
import { kubeExecutor } from "./call/kubectl"
import { listClusters, buildClusterConnectionWithRole } from "./call/connection";


// tool call handler
export const toolCallHandlers: Map<string, (request: CallToolRequest) => Promise<CallToolResult>> = new Map();

toolCallHandlers.set(KUBE_EXECUTOR.name, kubeExecutor)
toolCallHandlers.set(MANAGED_CLUSTERS.name, listClusters)
toolCallHandlers.set(CONNECT_WITH_ROLE.name, buildClusterConnectionWithRole)


// tool call list
export const KUBE_TOOLS = [
  KUBE_EXECUTOR,
  MANAGED_CLUSTERS,
  CONNECT_WITH_ROLE,
]