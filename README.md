# Multicluster MCP server

The **Multi-Cluster MCP Server** provides a robust gateway for Generative AI (GenAI) systems to interact with multiple Kubernetes clusters through the Model Context Protocol (MCP). It facilitates comprehensive operations on Kubernetes resources, streamlined multi-cluster management, and delivered interactive cluster observability.

## Features

- **Kubernetes Cluster Operations**:

  - Manage Kubernetes resources such as Pods, Deployments, and Services
  - Access and retrieve logs for Kubernetes resources (Pods, Containers)
  - Use fewer resources and tool calls to accomplish operations on a Kubernetes cluster
  
- **Multi-Cluster Management** (via Open Cluster Management):

  - Join and detach clusters within the multi-cluster environment
  - Interact with multi-cluster APIs, including Managed Clusters, Policies, Add-ons, and more
  
- **Cluster Observability**:

  - Retrieve and analyze metrics, logs, and alerts from integrated clusters

## Features

### Resources
- List and access notes via `note://` URIs
- Each note has a title, content and metadata
- Plain text mime type for simple content access

### Tools
- `create_note` - Create new text notes
  - Takes title and content as required parameters
  - Stores note in server state

### Prompts
- `summarize_notes` - Generate a summary of all stored notes
  - Includes all note contents as embedded resources
  - Returns structured prompt for LLM summarization

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

## Installation

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
