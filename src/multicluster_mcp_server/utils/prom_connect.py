from kubernetes import client, config
import kubernetes.client
from prometheus_api_client import PrometheusConnect, MetricSnapshotDataFrame, MetricRangeDataFrame

def prom_connect(kubeconfig: str = None) -> PrometheusConnect:
    try:
        if kubeconfig is None:
            api_client = config.new_client_from_config()
        else:
            api_client = config.new_client_from_config(kubeconfig)
        
        # Get Prometheus URL from the custom resource in OpenShift.
        custom_object_api = client.CustomObjectsApi(api_client)
        promRoute = custom_object_api.get_namespaced_custom_object(
            "route.openshift.io", "v1", "openshift-monitoring", "routes", "thanos-querier")
        prom_url = "https://{}".format(promRoute['spec']['host'])

        # Get Kubernetes API token.
        api_token = api_client.configuration.api_key["authorization"]

        pc = PrometheusConnect(url=prom_url, headers={"Authorization": "{}".format(api_token)}, disable_ssl=True)
    
    except Exception as e:
        print("Failure: ",e) 
    
    return pc
