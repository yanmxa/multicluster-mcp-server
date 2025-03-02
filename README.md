# Multicluster MCP server

The **Multi-Cluster MCP Server** provides a robust gateway for Generative AI (GenAI) systems to interact with multiple Kubernetes clusters through the Model Context Protocol (MCP). It facilitates comprehensive operations on Kubernetes resources, streamlined multi-cluster management, and delivered interactive cluster observability.

## **🚀 Features**

### 🛠 Kubernetes Cluster Operations

✅ Fully supports `kubectl` to interact with your cluster  
✅ Create, update, and list resources (Deployments, Pods, Services, etc.)  

### 🌍 Multi-Cluster Management** *(via Open Cluster Management)

❌ Access and manage multiple clusters seamlessly  
❌ Interact with multi-cluster APIs, including Managed Clusters, Policies, Add-ons, and more  

### 📊 Cluster Observability

❌ Retrieve and analyze **metrics, logs, and alerts** from integrated clusters  

## Development

Install dependencies:

```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

## **🛠 Installation**  

📌 **Note:** Ensure `kubectl` is installed. By default, the tool uses the **`KUBECONFIG`** environment variable to access the cluster. In a multi-cluster setup, it treats the configured cluster as the **hub cluster**, accessing others through it.

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "y": {
      "command": "/path/to/multicluster-mcp-server/build/index.js"
    }
  }
}
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.

## License

This project is licensed under the [MIT License](LICENSE).
