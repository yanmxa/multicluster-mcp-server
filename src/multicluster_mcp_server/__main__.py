from mcp.server.fastmcp import FastMCP

from typing import Annotated, Optional
from pydantic import  Field

from multicluster_mcp_server.tools.cluster import list_clusters
from multicluster_mcp_server.tools.connect import setup_cluster_access
from multicluster_mcp_server.tools.kubectl import run_kube_executor

mcp = FastMCP("multicluster-mcp-server")

@mcp.tool(description="Retrieves a list of Kubernetes clusters (also known as managed clusters or spoke clusters).")
def clusters() -> Annotated[str, Field(description="The managed clusters, also known as spoke clusters.")]:
    return list_clusters()
  
@mcp.tool(description="Generates the 'KUBECONFIG' for the managed cluster and binds it to the specified ClusterRole (default: cluster-admin).")
def connect_cluster(
    cluster: Annotated[str, Field(description="The target cluster where the ServiceAccount will be created for the KUBECONFIG.")],
    cluster_role: Annotated[str, Field(description="The ClusterRole defining permissions to access the cluster.")] = "cluster-admin",
) -> Annotated[str, Field(description="A message indicating the kubeconfig file or failure of the operation.")]:
    return setup_cluster_access(cluster, cluster_role=cluster_role)

@mcp.tool(description="Securely run a kubectl command or apply YAML. Provide either 'command' or 'yaml'.")
def kube_executor(
    cluster: Annotated[str, Field(description="The cluster name in a multi-cluster environment. Defaults to the hub cluster.")] = "default",
    command: Annotated[Optional[str], Field(description="The full kubectl command to execute. Must start with 'kubectl'.")] = None,
    yaml: Annotated[Optional[str], Field(description="YAML configuration to apply, provided as a string.")] = None,
) -> Annotated[str, Field(description="The execution result")]:
    return run_kube_executor(command, yaml, cluster)


def main():
    mcp.run()

if __name__ == "__main__":
    main()