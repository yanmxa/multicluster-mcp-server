
export * from "./kube-schema"
export * from "./multiple-cluster"

import {
  KUBECTL_EXECUTOR,
} from "./kube-schema";

import {
  LIST_CLUSTERS,
  APPLY_SA_WITH_ADMIN,
  APPLY_SA_WITH_CLUSTER_ROLE,
  YAML_APPLIER
} from './multiple-cluster'

export const KUBE_TOOLS = [
  KUBECTL_EXECUTOR,
  LIST_CLUSTERS,
  APPLY_SA_WITH_ADMIN,
  YAML_APPLIER,
  // APPLY_SA_WITH_CLUSTER_ROLE
]