import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { exec } from "child_process";
import util from "util";
import { z } from "zod";
import { existsSync } from 'fs';
import { getKubeconfigPath } from "../utils/kubeconfig";
import { connectCluster } from "./clusters";

const execPromise = util.promisify(exec);

// Validate that the command starts with "kubectl"
export function isValidKubectlCommand(command: string): boolean {
  return command.trim().startsWith("kubectl ");
}

export function validateKubeConfig(kubeconfigFile: string) {
  return existsSync(kubeconfigFile);
}

export const kubectlDesc = "Securely run a kubectl command or apply YAML. Provide either 'command' or 'yaml'.";
export const kubectlArgs = {
  command: z
    .string()
    .describe("The full kubectl command to execute. Must start with 'kubectl'."),
  yaml: z
    .string()
    .describe("YAML configuration to apply, provided as a string."),
  cluster: z
    .string()
    .describe("The cluster name in a multi-cluster environment. Defaults to the hub cluster.")
    .default("default"),
};

export async function kubectl({
  command,
  cluster,
  yaml,
}: {
  command?: string;
  yaml?: string;
  cluster?: string;
}): Promise<CallToolResult> {
  try {
    if (!command && !yaml) {
      throw new Error("Either 'command' or 'yaml' must be provided.");
    }
    if (command && yaml) {
      throw new Error("Provide only one of 'command' or 'yaml', not both.");
    }

    const kubeConfigFile = await getKubeconfigFile(cluster);

    let stdout = "";
    let stderr = "";

    if (command) {
      if (typeof command !== "string" || !isValidKubectlCommand(command)) {
        throw new Error("Invalid command: Only 'kubectl' commands are allowed.");
      }

      const finalCommand = kubeConfigFile
        ? `${command} --kubeconfig=${kubeConfigFile}`
        : command;

      const result = await execPromise(finalCommand);
      stdout = result.stdout;
      stderr = result.stderr;
    } else if (yaml) {
      stdout = await applyYaml(yaml, kubeConfigFile)
    }

    return {
      content: [{
        type: "text",
        text: stdout?.trim() || stderr?.trim() || "Run kubectl successfully, but no output returned.",
      }],
    };
  } catch (err: any) {
    return {
      content: [{
        type: "text",
        text: `Error running kubectl: ${err.message || String(err)}`,
      }],
    };
  }
}


function applyYaml(yaml: string, kubeconfig?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = `kubectl${kubeconfig ? ` --kubeconfig=${kubeconfig}` : ""} apply -f -`;
    const child = exec(command, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`kubectl failed: ${stderr || error.message}`));
      }
      resolve(stdout.trim());
    });

    child.stdin?.end(yaml);
  });
}

export async function getKubeconfigFile(cluster?: string): Promise<string | undefined> {

  const targetCluster = cluster && cluster !== "default" ? cluster : undefined;

  let kubeConfigFile: string | undefined;

  if (targetCluster) {
    kubeConfigFile = getKubeconfigPath(targetCluster);
    if (!validateKubeConfig(kubeConfigFile)) {
      const connectResult = await connectCluster({ cluster: targetCluster });
      if (!connectResult || connectResult.isError) {
        throw new Error(
          `Failed to connect to cluster '${cluster}': ${connectResult?.error || "KUBECONFIG file does not exist."
          }`
        );
      }
    }
  }

  return kubeConfigFile
}

// async function main() {
//   let result = await kubectl({
//     command: "kubectl get pods -n open-cluster-management-agent", cluster: "cluster2"
//   });

//   console.log(result);

//   let create_result = await kubectl({
//     yaml: `apiVersion: v1
// kind: Namespace
// metadata:
//   name: my-namespace1`,
//     cluster: "cluster1",
//   });
//   console.log(create_result);
// }

// main();
// // npx ts-node ./src/tools/kubectl.ts