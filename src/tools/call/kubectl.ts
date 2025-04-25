
import { CallToolRequest, CallToolRequestSchema, CallToolResult } from "@modelcontextprotocol/sdk/types";
import { exec } from "child_process";
import util from "util";
import * as fs from 'fs';
import { getKubeConfig } from "./connection";


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
export async function kubeExecutor(request: CallToolRequest): Promise<CallToolResult> {
  const { command, cluster, yaml } = request.params.arguments as {
    command?: string;
    yaml?: string;
    cluster?: string;
  };
  try {
    if (!command && !yaml) {
      throw new Error("Either 'command' or 'yaml' must be provided.");
    }
    if (command && yaml) {
      throw new Error("Provide only one of 'command' or 'yaml', not both.");
    }

    const targetCluster = cluster && cluster !== "default" ? cluster : undefined;
    let kubeConfigFile: string | undefined;
    if (targetCluster) {
      kubeConfigFile = getKubeConfig(targetCluster);
      if (!validateKubeConfig(kubeConfigFile)) {
        throw new Error(`KUBECONFIG for cluster '${targetCluster}' does not exist.`);
      }
    }

    let finalCommand: string;

    if (command) {
      if (typeof command !== "string" || !isValidKubectlCommand(command)) {
        throw new Error("Invalid command: Only 'kubectl' commands are allowed.");
      }
      finalCommand = targetCluster ? `${command} --kubeconfig=${kubeConfigFile}` : command;
    } else {
      // Handle YAML apply
      if (typeof yaml !== "string" || !yaml.trim()) {
        throw new Error("Invalid YAML content.");
      }

      const tempFilePath = "/tmp/acm-mcp-kubectl-temp.yaml";
      await fs.promises.writeFile(tempFilePath, yaml);

      finalCommand = `kubectl apply -f ${tempFilePath}`;
      if (targetCluster) {
        finalCommand += ` --kubeconfig=${kubeConfigFile}`;
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
        text: stdout || stderr || "Run kube executor successfully, but no output returned."
      }],
    } as CallToolResult;
  } catch (err: any) {
    return {
      content: [{
        type: "text",
        text: `Error running kube executor: ${err.message || err}`,
      }],
    } as CallToolResult;
  }
}

// async function main() {
//   let result = await kubeExecutor({
//     params: {
//       name: "kubeExecutor", arguments: {
//         command: "kubectl get pods -n open-cluster-management-agent", cluster: "hub1"
//       }
//     }, method: "tools/call",
//   });
//   console.log(result);

//   let create_result = await kubeExecutor({
//     params: {
//       name: "kubeExecutor",
//       arguments: {
//         yaml: `apiVersion: v1
// kind: Namespace
// metadata:
//   name: my-namespace2`,
//         cluster: "hub2",
//       }
//     }, method: "tools/call",
//   });
//   console.log(create_result);
// }

// main();
// // npx ts-node ./src/tools/call/kubectl.ts