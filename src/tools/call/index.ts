
import {
  CallToolResult,
  CallToolRequest,
} from "@modelcontextprotocol/sdk/types";
import { KUBECTL_EXECUTOR, LIST_CLUSTERS, APPLY_SA_WITH_ADMIN } from "../list";
import { executeKubectlCommand } from "./kubectl"
import { listClusters, applyServiceAccountWithAdmin } from "./multiple-cluster";

export const toolCallHandlers: Map<string, (request: CallToolRequest) => Promise<CallToolResult>> = new Map();
// toolCallHandlers.set(LIST_RESOURCE.name, listResources)
// toolCallHandlers.set(GET_RESOURCE.name, getResource)
// toolCallHandlers.set(APPLY_RESOURCE.name, applyResource)
// toolCallHandlers.set(PATCH_RESOURCE.name, patchResource)
// toolCallHandlers.set(DELETE_RESOURCE.name, deleteResource)
// toolCallHandlers.set(LOG_RESOURCE.name, logResource)

toolCallHandlers.set(KUBECTL_EXECUTOR.name, executeKubectlCommand)
toolCallHandlers.set(LIST_CLUSTERS.name, listClusters)
toolCallHandlers.set(APPLY_SA_WITH_ADMIN.name, applyServiceAccountWithAdmin)

