import { KubeConfig, KubernetesObjectApi } from "@kubernetes/client-node";
import * as k8s from '@kubernetes/client-node';

/**
 * Kubernetes resource schemas categorized by API group.
 */
export const kubeResources = [
  // Core API (v1)
  { kind: "Pod", apiVersion: "v1", singular: "pod", plural: "pods", abbreviation: "po" },
  { kind: "Service", apiVersion: "v1", singular: "service", plural: "services", abbreviation: "svc" },
  { kind: "ConfigMap", apiVersion: "v1", singular: "configmap", plural: "configmaps", abbreviation: "cm" },
  { kind: "Secret", apiVersion: "v1", singular: "secret", plural: "secrets", abbreviation: "sec" },
  { kind: "Namespace", apiVersion: "v1", singular: "namespace", plural: "namespaces", abbreviation: "ns" },
  { kind: "Node", apiVersion: "v1", singular: "node", plural: "nodes", abbreviation: "no" },
  { kind: "PersistentVolume", apiVersion: "v1", singular: "persistentvolume", plural: "persistentvolumes", abbreviation: "pv" },
  { kind: "PersistentVolumeClaim", apiVersion: "v1", singular: "persistentvolumeclaim", plural: "persistentvolumeclaims", abbreviation: "pvc" },

  // Apps API (apps/v1)
  { kind: "Deployment", apiVersion: "apps/v1", singular: "deployment", plural: "deployments", abbreviation: "deploy" },
  { kind: "StatefulSet", apiVersion: "apps/v1", singular: "statefulset", plural: "statefulsets", abbreviation: "sts" },
  { kind: "DaemonSet", apiVersion: "apps/v1", singular: "daemonset", plural: "daemonsets", abbreviation: "ds" },

  // Batch API (batch/v1)
  { kind: "Job", apiVersion: "batch/v1", singular: "job", plural: "jobs", abbreviation: "job" },
  { kind: "CronJob", apiVersion: "batch/v1", singular: "cronjob", plural: "cronjobs", abbreviation: "cj" },

  // Networking API (networking.k8s.io/v1)
  { kind: "Ingress", apiVersion: "networking.k8s.io/v1", singular: "ingress", plural: "ingresses", abbreviation: "ing" }
];

/**
 * Create a lookup table for quick access.
 */
const apiGroups = kubeResources.reduce((acc, { kind, apiVersion, singular, plural, abbreviation }) => {
  acc[singular] = { kind, apiVersion };
  acc[plural] = { kind, apiVersion };
  if (abbreviation) acc[abbreviation] = { kind, apiVersion };
  return acc;
}, {} as Record<string, { kind: string; apiVersion: string }>);

/**
 * Retrieves the correct API version and kind for a given Kubernetes resource.
 * Supports Singular (`pod`), Plural (`pods`), and Abbreviations (`po`).
 */
export function getKubeResourceSchema(resourceType: string): { apiVersion: string; kind: string } {
  const normalizedType = resourceType.toLowerCase();
  const resource = apiGroups[normalizedType];

  if (!resource) {
    throw new Error(`Unsupported Kubernetes resource type: '${resourceType}'.`);
  }

  return resource;
}
