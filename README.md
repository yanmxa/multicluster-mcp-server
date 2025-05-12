<!-- [![MseeP Badge](https://mseep.net/pr/yanmxa-multicluster-mcp-server-badge.jpg)](https://mseep.ai/app/yanmxa-multicluster-mcp-server) -->


# Multi-Cluster MCP server

The **Multi-Cluster MCP Server** provides a robust gateway for Generative AI (GenAI) systems to interact with multiple Kubernetes clusters through the Model Context Protocol (MCP). It facilitates comprehensive operations on Kubernetes resources, streamlined multi-cluster management, and delivered interactive cluster observability.

## **🚀 Features**

### 🛠️ MCP Tools - Kubernetes Cluster Awareness
  
- ✅ Retrieve resources from the **hub cluster** (current context)  
- ✅ Retrieve resources from the **managed clusters**  
- ✅ Connect to a **managed cluster** using a specified `ClusterRole`
- ✅ Access resources across multiple Kubernetes clusters(via Open Cluster Management)
- ❌ Retrieve and analyze **metrics, logs, and alerts** from integrated clusters  
- ❌ Interact with multi-cluster APIs, including Managed Clusters, Policies, Add-ons, and more

  ![alt text](images/tools.png)
  <details>
  <summary>Mutiple Kubernetes Clusters Operations</summary>

  [![Watch the demo](https://asciinema.org/a/706281.svg)](https://asciinema.org/a/706281)

  </details>

### 📦 Prompt Templates for Open Cluster Management *(Planning)*

- Provide reusable prompt templates tailored for OCM tasks, streamlining agent interaction and automation

### 📚 MCP Resources for Open Cluster Management *(Planning)*

- Reference official OCM documentation and related resources to support development and integration

### **📌 How to Use**

- Use with MCP Inspector

```bash
mcp dev ./src/multicluster_mcp_server/__main__.py 
```

Configure the server using the following snippet:

```json
{
  "mcpServers": {
    "multicluster-mcp-server": {
      "command": "uvx",
      "args": [
        "multicluster-mcp-server@latest"
      ]
    }
  }
}
```

**Note:** Ensure `kubectl` is installed. By default, the tool uses the **`KUBECONFIG`** environment variable to access the cluster. In a multi-cluster setup, it treats the configured cluster as the **hub cluster**, accessing others through it.

## License

This project is licensed under the [MIT License](LICENSE).
