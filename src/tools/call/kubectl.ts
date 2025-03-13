
import k8s, { KubernetesObjectApi, KubeConfig, KubernetesListObject, KubernetesObject, Log, LogOptions, V1APIGroup } from "@kubernetes/client-node";
import { Writable } from 'node:stream';
import { CallToolRequest, CallToolRequestSchema, CallToolResult } from "@modelcontextprotocol/sdk/types";
import { exec } from "child_process";
import util from "util";
import { getKubeConfig } from "./multiple-cluster";


const execPromise = util.promisify(exec);

// Validate that the command starts with "kubectl"
function isValidKubectlCommand(command: string): boolean {
  return command.trim().startsWith("kubectl ");
}
import { existsSync } from 'fs';
import { error } from "node:console";
function validateKubeConfig(kubeconfigFile: string) {
  return existsSync(kubeconfigFile);
}


// Shell Executor for Kubernetes (`kubectl` only)
export async function executeKubectlCommand(request: CallToolRequest): Promise<CallToolResult> {
  const { command, cluster } = request.params.arguments as {
    command: string;
    cluster?: string;
  };
  // console.log("command", command)
  // console.log("cluster", cluster)
  try {
    if (typeof command !== "string" || !isValidKubectlCommand(command)) {
      throw new Error("Invalid command: Only 'kubectl' commands are allowed.");
    }

    let finalCommand = command
    if (!command.includes('--kubeconfig') && cluster) {
      const kubeConfigFile = getKubeConfig(cluster)
      if (validateKubeConfig(kubeConfigFile)) {
        finalCommand = `${command} --kubeconfig=${kubeConfigFile}`;
      } else {
        throw error(`KUBECONFIG for cluster ${cluster} does not exist.`)
      }
    }

    // Prepare environment variables
    const { stdout, stderr } = await execPromise(finalCommand, {
      env: {
        ...process.env,
      },
      timeout: 10000
    });

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



async function main() {
  const result = await executeKubectlCommand({
    params: {
      name: "command", arguments: {
        command: "kubectl get pods -n open-cluster-management-agent", cluster: "cluster1"
      }
    }, method: "tools/call",
  }); // Now resolves to string[]
  console.log(result);
}

// main();
// npx ts-node kubectl.ts
