import { CallToolRequest, CallToolRequestSchema, CallToolResult } from "@modelcontextprotocol/sdk/types";
import { exec } from "child_process";
import util from "util";

const execPromise = util.promisify(exec);

export async function listClusters(request: CallToolRequest): Promise<CallToolResult> {

  const { stdout, stderr } = await execPromise("kubectl get mcl", {
    env: {
      ...process.env,
    },
    timeout: 10000
  });

  return {
    content: [{
      type: "text",
      text: stdout || stderr
    }],
  }
}


// async function main() {
//   const clusters = await listClusters({ params: { name: "clusters", arguments: {} }, method: "tools/call" });
//   console.log(clusters);
// }

// main();
// // npx ts-node ./src/tools/call/clusters.ts
