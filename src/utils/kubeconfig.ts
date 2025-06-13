import * as k8s from '@kubernetes/client-node';
import * as fs from 'fs';
import * as path from 'path';

export function generateKubeconfig(secret: k8s.V1Secret, clusterToServerAPIMap: Map<string, string>): string {
  const secretData = secret.data;
  const cluster = secret.metadata?.namespace || ""
  if (!secretData || !secretData["ca.crt"] || !secretData["token"]) {
    return `Secret ${secret.metadata?.namespace}/ ${secret.metadata?.name} contain a valid token or ca.crt.`;
  }

  const caCrt = secretData["ca.crt"];
  // Step 2: Decode Secret Data (Base64 -> String)
  const token = Buffer.from(secretData["token"], "base64").toString("utf-8");
  const server = clusterToServerAPIMap.get(cluster)

  if (!server) {
    return "No current cluster server URL found in the clusters"
  }

  // Step 3: Construct the Kubeconfig YAML String
  const kubeconfigYaml = `apiVersion: v1
kind: Config
clusters:
- name: cluster
  cluster:
    certificate-authority-data: ${caCrt}
    server: ${server}
contexts:
- name: context
  context:
    cluster: cluster
    user: user
    namespace: ${cluster}
current-context: context
users:
- name: user
  user:
    token: ${token}
`;

  // Step 4: Write to kubeconfig.yaml File
  const fullPath = path.resolve(getKubeconfigPath(cluster));
  fs.writeFileSync(fullPath, kubeconfigYaml);
  // console.log(`Kubeconfig file created: ${fullPath}`);
  return "";
}

export function getKubeconfigPath(cluster: string): string {
  return `/tmp/multicluster-mcp-server-kubeconfig.${cluster}`
}