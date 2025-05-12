import { spawn } from "child_process";
import { existsSync } from "fs";
import { CallToolRequest, CallToolResult } from "@modelcontextprotocol/sdk/types";
import { getKubeConfig } from "./multiple-cluster";

// Validate YAML format
function isValidYaml(yaml: string): boolean {
  return yaml.trim().startsWith("---") || yaml.trim().includes("apiVersion:");
}

// Validate kubeconfig file existence
function validateKubeConfig(kubeconfigFile: string): boolean {
  return existsSync(kubeconfigFile);
}

// Apply YAML configuration to Kubernetes cluster
export async function yamlApplier(request: CallToolRequest): Promise<CallToolResult> {
  const { yaml, cluster } = request.params.arguments as {
    yaml: string;
    cluster?: string;
  };

  try {
    if (typeof yaml !== "string" || !isValidYaml(yaml)) {
      throw new Error("Invalid YAML: Must be a valid Kubernetes resource definition.");
    }

    let command = ["kubectl", "apply", "-f", "-"];

    if (cluster && cluster !== "default") {
      const kubeConfigFile = getKubeConfig(cluster);
      if (validateKubeConfig(kubeConfigFile)) {
        command.push(`--kubeconfig=${kubeConfigFile}`);
      } else {
        throw new Error(`KUBECONFIG for cluster '${cluster}' does not exist.`);
      }
    }

    return new Promise((resolve) => {
      const kubectl = spawn(command[0], command.slice(1), { env: process.env });

      let stdout = "";
      let stderr = "";

      kubectl.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      kubectl.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      kubectl.on("close", (code) => {
        resolve({
          content: [
            {
              type: "text",
              text:
                code === 0
                  ? stdout || "YAML applied successfully."
                  : `Error applying YAML: ${stderr}`,
            },
          ],
        } as CallToolResult);
      });

      // Send YAML as stdin input
      kubectl.stdin.write(yaml);
      kubectl.stdin.end();
    });
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error applying YAML: ${error.message}`,
        },
      ],
    } as CallToolResult;
  }
}

async function main() {
  const result = await yamlApplier({
    params: {
      name: "yaml",
      arguments: {
        yaml: `apiVersion: v1
kind: Namespace
metadata:
  name: my-namespace
`,
      }
    }, method: "tools/call",
  }); // Now resolves to string[]
  console.log(result);
}

// main();
// npx ts-node kubectl.ts
