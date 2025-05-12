import sys
import os
import base64
from kubernetes import config, client
from kubernetes.client import ApiClient, ApiException
from kubernetes.dynamic import DynamicClient
from kubernetes.dynamic.exceptions import NotFoundError
import urllib3
import logging
import time
from pathlib import Path

# Add project root to PYTHONPATH
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from multicluster_mcp_server.utils.logging_config import setup_logging
# Disable warnings for unverified HTTPS requests
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

server_name = "multicluster-mcp-server"
logger = setup_logging(server_name, level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO))


def create_or_update_managed_service_account(cluster: str, mcp_server: str = server_name):
    config.load_kube_config()
    api_client = ApiClient()
    dyn_client = DynamicClient(api_client)

    msa_resource = dyn_client.resources.get(
        api_version="authentication.open-cluster-management.io/v1beta1",
        kind="ManagedServiceAccount"
    )

    msa_manifest = {
        "apiVersion": "authentication.open-cluster-management.io/v1beta1",
        "kind": "ManagedServiceAccount",
        "metadata": {
            "name": mcp_server,
            "namespace": cluster
        },
        "spec": {
            "rotation": {}
        }
    }

    try:
        # Check if it already exists
        msa_resource.get(name=mcp_server, namespace=cluster)
        # Patch (update) if exists
        response = msa_resource.patch(
            name=mcp_server,
            namespace=cluster,
            body=msa_manifest,
            content_type="application/merge-patch+json"
        )
        logger.debug(f"Updated existing ManagedServiceAccount '{mcp_server}' in namespace '{cluster}'")
    except NotFoundError:
        # Create if not found
        response = msa_resource.create(body=msa_manifest, namespace=cluster)
        logger.debug(f"Created new ManagedServiceAccount '{mcp_server}' in namespace '{cluster}'")
    except Exception as e:
        logger.error(f"Failed to create or update ManagedServiceAccount: {e}")
        return None

    return response.to_dict()

def create_or_update_rbac(cluster: str, mcp_server: str = server_name, cluster_role: str = "cluster-admin"):
    config.load_kube_config()
    dyn_client = DynamicClient(ApiClient())

    # Get ManifestWork resource handle
    work_client = dyn_client.resources.get(
        api_version="work.open-cluster-management.io/v1",
        kind="ManifestWork"
    )

    # Define ClusterRoleBinding payload
    cluster_role_binding = {
        "apiVersion": "rbac.authorization.k8s.io/v1",
        "kind": "ClusterRoleBinding",
        "metadata": {
            "name": f"{mcp_server}-binding"
        },
        "roleRef": {
            "apiGroup": "rbac.authorization.k8s.io",
            "kind": "ClusterRole",
            "name": cluster_role
        },
        "subjects": [
            {
                "kind": "ServiceAccount",
                "name": mcp_server,
                "namespace": "open-cluster-management-agent-addon"
            }
        ]
    }

    # Create ManifestWork with ClusterRoleBinding
    manifestwork = {
        "apiVersion": "work.open-cluster-management.io/v1",
        "kind": "ManifestWork",
        "metadata": {
            "name": mcp_server,
            "namespace": cluster
        },
        "spec": {
            "workload": {
                "manifests": [cluster_role_binding]
            }
        }
    }

    try:
        # Check if it exists
        work_client.get(name=mcp_server, namespace=cluster)
        response = work_client.patch(
            name=mcp_server,
            namespace=cluster,
            body=manifestwork,
            content_type="application/merge-patch+json"
        )
        logger.debug(f"Updated ClusterRoleBinding ManifestWork '{mcp_server}' in cluster '{cluster}'")
    except NotFoundError:
        response = work_client.create(body=manifestwork, namespace=cluster)
        logger.debug(f"Created ManifestWork '{mcp_server}' in cluster '{cluster}'")
    except Exception as e:
        logger.error(f"Failed to create/update ManifestWork: {e}")
        return None
    return response.to_dict()

def get_secret_with_timeout(namespace: str, name: str, timeout_seconds: int = 300, poll_interval: int = 5):
    config.load_kube_config()
    v1 = client.CoreV1Api()
    start_time = time.time()
    while time.time() - start_time < timeout_seconds:
        try:
            secret = v1.read_namespaced_secret(name=name, namespace=namespace)
            if secret.data and "ca.crt" in secret.data and "token" in secret.data:
                return secret
            else:
                logger.warning(f"Secret '{name}' found but missing expected keys in namespace '{namespace}'. Retrying...")
        except ApiException as e:
            if e.status != 404:
                logger.error(f"Error while retrieving secret '{name}': {e}")
            # else: Secret not found yet — retry

        logger.debug(f"Waiting for secret '{name}' in namespace '{namespace}'...")
        time.sleep(poll_interval)

    logger.error(f"Timed out waiting for secret '{name}' in namespace '{namespace}' after {timeout_seconds} seconds.")
    return None
  
def get_managed_cluster_url(cluster_name: str) -> str | None:
    """
    Returns the 'spec.managedClusterClientConfigs[0].url' for the given ManagedCluster.
    Logs and returns None if the resource or URL is not available.
    """
    config.load_kube_config()
    dyn_client = DynamicClient(ApiClient())

    managed_cluster_res = dyn_client.resources.get(
        api_version="cluster.open-cluster-management.io/v1",
        kind="ManagedCluster"
    )

    try:
        mc = managed_cluster_res.get(name=cluster_name)
        url = (mc.spec.get("managedClusterClientConfigs") or [{}])[0].get("url")
        if not url:
            logger.warning(f"'spec.url' not found for ManagedCluster '{cluster_name}'")
        return url
    except NotFoundError:
        logger.warning(f"ManagedCluster '{cluster_name}' not found.")
        return None
    except Exception as e:
        logger.error(f"Error retrieving ManagedCluster '{cluster_name}': {e}")
        return None

def get_kubeconfig_file(cluster, mcp_server: str = server_name) -> str:
    return f"/tmp/{mcp_server}.{cluster}"

def generate_kubeconfig_file_from_secret(secret, server_url: str, mcp_server: str) -> str:
    secret_data = secret.data
    cluster = secret.metadata.namespace

    if not secret_data or "ca.crt" not in secret_data or "token" not in secret_data:
        return f"Secret {cluster}/{secret.metadata.name} is missing 'ca.crt' or 'token'."

    try:
        ca_crt = secret_data["ca.crt"]
        token = base64.b64decode(secret_data["token"]).decode("utf-8")
    except Exception as e:
        return f"Failed to decode secret data: {e}"

    kubeconfig = f"""apiVersion: v1
kind: Config
clusters:
- name: cluster
  cluster:
    certificate-authority-data: {ca_crt}
    server: {server_url}
contexts:
- name: context
  context:
    cluster: cluster
    user: user
    namespace: {cluster}
current-context: context
users:
- name: user
  user:
    token: {token}
"""

    path = Path(get_kubeconfig_file(cluster, mcp_server))
    try:
        path.write_text(kubeconfig)
        return str(path)
    except Exception as e:
        return f"Failed to write kubeconfig: {e}"

def setup_cluster_access(cluster: str, cluster_role: str = "cluster-admin", mcp_server: str = server_name):
    logger.debug(f"Setting up ManagedServiceAccount and RBAC for cluster: {cluster}")
    
    msa_result = create_or_update_managed_service_account(cluster, mcp_server)
    if not msa_result:
        logger.error("Failed to set up ManagedServiceAccount. Skipping RBAC setup.")
        return None
    
    rbac_result = create_or_update_rbac(cluster, mcp_server, cluster_role)
    if not rbac_result:
        logger.error("RBAC (ManifestWork) setup failed.")
        return None
      
    server_url = get_managed_cluster_url(cluster_name=cluster)
    if not server_url:
        logger.error(f"API server URL not found for ManagedCluster '{cluster}'.")
        return None
    
    token_secret = get_secret_with_timeout(cluster, mcp_server)
    if not token_secret:
      logger.error(f"Failed to get the service account token for cluster: {cluster}")
      return None
    
    kubeconfig_path_or_error = generate_kubeconfig_file_from_secret(token_secret, server_url, mcp_server)
    if not kubeconfig_path_or_error.startswith("/tmp/"):
        logger.error(kubeconfig_path_or_error)
        return None
      
    logger.debug(f"Generate the kubeconfig file: {kubeconfig_path_or_error}")
    return kubeconfig_path_or_error

# Example usage
if __name__ == "__main__":
    result = setup_cluster_access("hub1")
    print(result)
