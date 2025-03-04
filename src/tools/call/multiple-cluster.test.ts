import { listClusters } from './multiple-cluster';
import * as k8s from '@kubernetes/client-node';

//npx jest src/tools/call/multiple-cluster.test.ts
jest.mock('@kubernetes/client-node', () => ({
  KubeConfig: jest.fn().mockImplementation(() => ({
    loadFromDefault: jest.fn(),
  })),
  KubernetesObjectApi: {
    makeApiClient: jest.fn(() => ({
      list: jest.fn().mockResolvedValue({
        items: [
          { metadata: { name: 'cluster-1' } },
          { metadata: { name: 'cluster-2' } },
        ],
      }),
    })),
  },
}));

describe('listClusters', () => {
  it('should return all clusters', async () => {
    const clusters = await listClusters({ params: { name: "list_clusters", arguments: {} }, method: "tools/call" });
    expect(clusters).toEqual(['cluster-1', 'cluster-2']);
  });

});
