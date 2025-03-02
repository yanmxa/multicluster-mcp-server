
import {
  Tool
} from "@modelcontextprotocol/sdk/types";

export const KUBECTL_EXECUTOR: Tool = {
  name: "kubectl_executor",
  description: "Securely execute a kubectl command",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The full kubectl command to execute. Must start with 'kubectl'."
      },
      cluster: {
        type: "string",
        description: "Optional cluster name for multi-cluster environments. Specify only if explicitly provided. If None, remove it!",
        nullable: true
      }
    },
    required: ["command"]
  }
};