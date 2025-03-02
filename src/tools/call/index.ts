
import {
  CallToolResult,
  CallToolRequest,
} from "@modelcontextprotocol/sdk/types";
import { KUBECTL_EXECUTOR } from "../list";
import { executeKubectlCommand } from "./kubectl"

export const toolCallHandlers: Map<string, (request: CallToolRequest) => Promise<CallToolResult>> = new Map();
// toolCallHandlers.set(LIST_RESOURCE.name, listResources)
// toolCallHandlers.set(GET_RESOURCE.name, getResource)
// toolCallHandlers.set(APPLY_RESOURCE.name, applyResource)
// toolCallHandlers.set(PATCH_RESOURCE.name, patchResource)
// toolCallHandlers.set(DELETE_RESOURCE.name, deleteResource)
// toolCallHandlers.set(LOG_RESOURCE.name, logResource)

toolCallHandlers.set(KUBECTL_EXECUTOR.name, executeKubectlCommand)