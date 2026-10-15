import type { AnalysisGraph } from '../model.ts';

export function uniquePairs(graph: AnalysisGraph, directed = false): [string, string][] {
  const pairs = new Map<string, [string, string]>();
  for (const [a, b] of graph.pairs) if (a !== b) {
    const pair: [string, string] = directed || a < b ? [a, b] : [b, a];
    pairs.set(JSON.stringify(pair), pair);
  }
  return [...pairs.values()].sort(([a, b], [c, d]) => a < c ? -1 : a > c ? 1 : b < d ? -1 : b > d ? 1 : 0);
}

export function canonicalGraph(graph: AnalysisGraph): AnalysisGraph {
  const ids = [...graph.ids].sort(), members = new Set(ids);
  if (members.size !== ids.length || graph.pairs.some(([a, b]) => !members.has(a) || !members.has(b))) throw Error('分析グラフの用語 ID が不正です。');
  return { ids, pairs: uniquePairs(graph, true) };
}

export function adjacency(graph: AnalysisGraph, directed = false): Map<string, Set<string>> {
  const result = new Map(graph.ids.map(id => [id, new Set<string>()]));
  for (const [a, b] of graph.pairs) if (a !== b) {
    result.get(a)!.add(b);
    if (!directed) result.get(b)!.add(a);
  }
  return result;
}
export function components(graph: AnalysisGraph): string[][] {
  const neighbors = adjacency(graph), remaining = new Set(graph.ids), groups: string[][] = [];
  while (remaining.size) {
    const root = remaining.values().next().value!, group = [root]; remaining.delete(root);
    for (let i = 0; i < group.length; i++) for (const w of [...neighbors.get(group[i])!].sort()) if (remaining.delete(w)) group.push(w);
    groups.push(group.sort());
  }
  return groups.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}
