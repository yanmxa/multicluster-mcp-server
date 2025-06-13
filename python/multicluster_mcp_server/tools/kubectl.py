from typing import Annotated, Optional
from pydantic import Field
import os
import subprocess
import tempfile
import re
from typing import Optional
from multicluster_mcp_server.tools.connect import setup_cluster_access, get_kubeconfig_file

def is_valid_kubectl_command(command: str) -> bool:
    return command.strip().startswith("kubectl ")

def validate_kubeconfig_file(path: str) -> bool:
    return os.path.exists(path)

def inject_kubeconfig(command: str, kubeconfig: str) -> str:
    if not kubeconfig or "--kubeconfig" in command or not command.startswith("kubectl"):
        return command
    return re.sub(r"^kubectl\b", f"kubectl --kubeconfig={kubeconfig}", command, count=1)

from multicluster_mcp_server.core.mcp_instance import mcp
@mcp.tool(description="Securely run a kubectl command or apply YAML. Provide either 'command' or 'yaml'.")
def kube_executor(
    cluster: Annotated[str, Field(description="The cluster name in a multi-cluster environment. Defaults to the hub cluster.")] = "default",
    command: Annotated[Optional[str], Field(description="The full kubectl command to execute. Must start with 'kubectl'.")] = None,
    yaml: Annotated[Optional[str], Field(description="YAML configuration to apply, provided as a string.")] = None,
) -> Annotated[str, Field(description="The execution result")]:
    try:
        if not command and not yaml:
            raise ValueError("Either 'command' or 'yaml' must be provided.")
        if command and yaml:
            raise ValueError("Provide only one of 'command' or 'yaml', not both.")

        kubeconfig_file = None
        if cluster and cluster != "default":
            kubeconfig_file = get_kubeconfig_file(cluster)
            if not validate_kubeconfig_file(kubeconfig_file):
                kubeconfig_file = setup_cluster_access(cluster=cluster)
                if not kubeconfig_file:
                    raise FileNotFoundError(f"KUBECONFIG for cluster '{cluster}' does not exist.")

        if command:
            if not isinstance(command, str) or not is_valid_kubectl_command(command):
                raise ValueError("Invalid command: Only 'kubectl' commands are allowed.")
            final_command = command
        else:
            # Write YAML to a temp file
            if not isinstance(yaml, str) or not yaml.strip():
                raise ValueError("Invalid YAML content.")
            with tempfile.NamedTemporaryFile("w", delete=False, suffix=".yaml") as temp_file:
                temp_file.write(yaml)
                temp_file_path = temp_file.name
            final_command = f"kubectl apply -f {temp_file_path}"

        # Add --kubeconfig if needed
        if kubeconfig_file:
            final_command = inject_kubeconfig(final_command, kubeconfig_file)

        print(f"[debug] Executing: {final_command}")
        result = subprocess.run(final_command, shell=True, capture_output=True, text=True, timeout=10)

        output = result.stdout or result.stderr or "Run kube executor successfully, but no output returned."
        return output
    except Exception as e:
        return f"Error running kube executor: {str(e)}"

# Example usage
if __name__ == "__main__":
    result = kube_executor(command="kubectl get deploy/klusterlet-agent -n open-cluster-management-agent -oyaml", cluster="cluster1")
    print(result)

    result = kube_executor(command="kubectl delete ns my-namespace2", cluster="cluster1")
    print(result)

    create_ns = kube_executor(yaml="""
apiVersion: v1
kind: Namespace
metadata:
  name: my-namespace2
""", cluster="cluster1")
    print(create_ns)
