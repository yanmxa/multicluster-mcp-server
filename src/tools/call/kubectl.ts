
import k8s, { KubernetesObjectApi, KubeConfig, KubernetesListObject, KubernetesObject, Log, LogOptions, V1APIGroup } from "@kubernetes/client-node";
import { Writable } from 'node:stream';
import { CallToolRequest, CallToolRequestSchema, CallToolResult } from "@modelcontextprotocol/sdk/types";
import { exec } from "child_process";
import util from "util";


const execPromise = util.promisify(exec);

// Validate that the command starts with "kubectl"
function isValidKubectlCommand(command: string): boolean {
  return command.trim().startsWith("kubectl ");
}

// Shell Executor for Kubernetes (`kubectl` only)
export async function executeKubectlCommand(request: CallToolRequest): Promise<CallToolResult> {
  const { command, cluster } = request.params.arguments as {
    command: string;
    cluster?: string;
  };

  try {
    if (typeof command !== "string" || !isValidKubectlCommand(command)) {
      throw new Error("Invalid command: Only 'kubectl' commands are allowed.");
    }

    // Append cluster context if provided
    // const finalCommand = cluster ? `${command} --context=${cluster}` : command;
    // console.log(`Executing: ${finalCommand}`);

    // Prepare environment variables
    const { stdout, stderr } = await execPromise(command, {
      env: {
        ...process.env,
      },
      timeout: 10000
    });

    if (stderr) {
      console.warn("Warning:", stderr);
    }

    return {
      content: [{
        type: "text",
        text: stdout || stderr || "Command executed successfully, but no output returned."
      }],
    } as CallToolResult;
  } catch (error: any) {
    // console.warn("Warning:", error.message);
    return {
      content: [{
        type: "text",
        text: `Error executing kubectl command: ${error.message}`
      }],
    } as CallToolResult;
  }
}
