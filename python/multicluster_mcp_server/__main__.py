
from multicluster_mcp_server.core.mcp_instance import mcp
from multicluster_mcp_server.tools.cluster import clusters
from multicluster_mcp_server.tools.connect import connect_cluster
from multicluster_mcp_server.tools.kubectl import kube_executor
from multicluster_mcp_server.tools.prometheus import prometheus
  
def main():
    mcp.run()

if __name__ == "__main__":
    main()