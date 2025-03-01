
import {
  CallToolResult,
  CallToolRequest,
} from "@modelcontextprotocol/sdk/types";
import { APPLY_RESOURCE, DELETE_RESOURCE, GET_RESOURCE, LIST_RESOURCE, LOG_RESOURCE, PATCH_RESOURCE } from "../list";
import { applyResource, deleteResource, getResource, listResources, logResource, patchResource } from "./kube-client";

export const toolCallHandlers: Map<string, (request: CallToolRequest) => Promise<CallToolResult>> = new Map();

toolCallHandlers.set(LIST_RESOURCE.name, listResources)
toolCallHandlers.set(GET_RESOURCE.name, getResource)
toolCallHandlers.set(APPLY_RESOURCE.name, applyResource)
toolCallHandlers.set(PATCH_RESOURCE.name, patchResource)
toolCallHandlers.set(DELETE_RESOURCE.name, deleteResource)
toolCallHandlers.set(LOG_RESOURCE.name, logResource)