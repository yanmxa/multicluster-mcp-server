#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  listClusterDesc, listClustersArgs, listClusters,
  connectClusterDesc, connectClusterArgs, connectCluster
} from './tools/clusters';
import { kubectl, kubectlArgs, kubectlDesc } from "./tools/kubectl";
import { prometheusArgs, prometheusDesc, prometheus } from "./tools/prometheus";


const server = new McpServer({
  name: "multicluster-mcp-server",
  version: "0.1.2",
  capabilities: {
    // resources: {},
    tools: {},
    // prompts: {},
  },
})

server.tool(
  "clusters",
  listClusterDesc,
  listClustersArgs, // should be a Zod schema, e.g., z.object({...})
  async (args, extra) => listClusters(args) // ensure listClusters matches (args, extra) => ...
)

server.tool(
  "connect_cluster",
  connectClusterDesc,
  connectClusterArgs,
  async (args, extra) => connectCluster(args) // ensure connectCluster matches (args, extra) => ...
)

server.tool(
  "kubectl",
  kubectlDesc,
  kubectlArgs,
  async (args, extra) => kubectl(args) // ensure connectCluster matches (args, extra) => ...
)

server.tool(
  "prometheus",
  prometheusDesc,
  prometheusArgs,
  async (args, extra) => prometheus(args) // ensure connectCluster matches (args, extra) => ...
)

/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Multicluster MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});