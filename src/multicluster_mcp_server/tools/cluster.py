from typing import Annotated, Optional
from pydantic import Field
import sys
import os
from kubernetes import config
from kubernetes.client import ApiClient
from kubernetes.dynamic import DynamicClient
from datetime import datetime
import urllib3
import logging

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

from multicluster_mcp_server.tools.connect import setup_cluster_access
from multicluster_mcp_server.utils.logging_config import setup_logging

from multicluster_mcp_server.core.mcp_instance import mcp, server_name
logger = setup_logging(server_name, level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO))

# Global map to cache kubeconfigs: cluster_name -> kubeconfig string
cluster_kubeconfig_map = {}

def get_cluster_age(creation_timestamp: str) -> str:
    created_time = datetime.strptime(creation_timestamp, "%Y-%m-%dT%H:%M:%SZ")
    delta = datetime.utcnow() - created_time
    hours, remainder = divmod(delta.seconds, 3600)
    return f"{delta.days}d{hours:02}"

generate_kubeconfig = False

@mcp.tool(description="Retrieves a list of Kubernetes clusters (also known as managed clusters or spoke clusters).")
def clusters() -> Annotated[str, Field(description="The managed clusters, also known as spoke clusters.")]:
    config.load_kube_config()
    dyn_client = DynamicClient(ApiClient())

    try:
        managed_cluster_res = dyn_client.resources.get(
            api_version="cluster.open-cluster-management.io/v1",
            kind="ManagedCluster"
        )
        response = managed_cluster_res.get()
        items = response.items
    except Exception as e:
        return f"Failed to list clusters: {e}"

    if not items:
        return "No managed clusters available on the current cluster"

    header = (
        f"{'NAME':<12} {'HUB ACCEPTED':<15} {'MANAGED CLUSTER URLS':<80} "
        f"{'JOINED':<8} {'AVAILABLE':<10} {'AGE'}"
    )
    result_lines = [header]

    for item in items:
        metadata = item.metadata
        spec = item.spec or {}
        status = item.status or {}

        name = metadata.name or "Unknown"
        hub_accepted = str(spec.get("hubAcceptsClient", False)).lower()
        server = spec.get("managedClusterClientConfigs", [{}])[0].get("url", "N/A")

        conditions = status.get("conditions", [])
        joined = next((c.get("status") for c in conditions if c.get("type") == "ManagedClusterJoined"), "False")
        available = next((c.get("status") for c in conditions if c.get("type") == "ManagedClusterConditionAvailable"), "False")

        creation_timestamp = metadata.creationTimestamp
        age = get_cluster_age(creation_timestamp) if creation_timestamp else "N/A"

        if generate_kubeconfig:
            try:
                  kubeconfig_path = setup_cluster_access(cluster=name)
                  cluster_kubeconfig_map[name] = kubeconfig_path
            except Exception as e:
                logger.warning(f"Failed to setup access for cluster '{name}': {e}")

        result_lines.append(
            f"{name:<12} {hub_accepted:<15} {server:<80} {joined:<8} {available:<10} {age}"
        )

    return "\n".join(result_lines)


# Example usage
if __name__ == "__main__":
    result = list_clusters()
    print(result)