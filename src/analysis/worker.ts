import { cluster, type Partition } from './clustering.ts';
import { place, type LayoutResult } from './layout.ts';
import type { AnalysisGraph } from '../model.ts';
import { clusteringMethods, layoutMethods, type ClusteringMethod, type LayoutMethod } from './methods.ts';
export interface AnalysisRequest { id: number; graph: AnalysisGraph; clustering: ClusteringMethod; layout: LayoutMethod; values: Record<string, number>; compare?: boolean }
export interface Comparison { partitions: Partition[]; layouts: LayoutResult[] }
export interface AnalysisResponse { id: number; partition?: Partition; layout?: LayoutResult; comparison?: Comparison; error?: string }

const partitions = new Map<string, Partition>(), placements = new Map<string, LayoutResult>();
let corpus = '';
function partition(graph: AnalysisGraph, method: ClusteringMethod): Partition {
  if (!partitions.has(method)) partitions.set(method, cluster(graph, method));
  return partitions.get(method)!;
}
function layout(graph: AnalysisGraph, method: LayoutMethod, groups: Partition, values: Record<string, number>): LayoutResult {
  const key = JSON.stringify([method, method === 'grouped' ? groups.method : null, Object.entries(values).sort()]);
  if (!placements.has(key)) {
    if (placements.size >= 64) placements.delete(placements.keys().next().value!);
    placements.set(key, place(graph, method, groups, values));
  }
  return placements.get(key)!;
}
globalThis.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const request = event.data;
  try {
    const key = JSON.stringify(request.graph);
    if (key !== corpus) { corpus = key; partitions.clear(); placements.clear(); }
    const groups = partition(request.graph, request.clustering);
    if (request.compare) {
      // One result per method; never duplicate coordinates for a Cartesian product.
      const allPartitions = clusteringMethods.map(method => partition(request.graph, method.id));
      const allLayouts = layoutMethods.map(method => layout(request.graph, method.id, groups, {}));
      globalThis.postMessage({ id: request.id, comparison: { partitions: allPartitions, layouts: allLayouts } } satisfies AnalysisResponse);
    } else globalThis.postMessage({ id: request.id, partition: groups, layout: layout(request.graph, request.layout, groups, request.values) } satisfies AnalysisResponse);
  } catch (error) { globalThis.postMessage({ id: request.id, error: String(error) } satisfies AnalysisResponse); }
};
