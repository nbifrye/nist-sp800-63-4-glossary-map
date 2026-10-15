import type { AnalysisGraph } from '../model.ts';
import { adjacency, canonicalGraph, uniquePairs } from './graph.ts';
import { spectralGroups } from './spectral.ts';
export { adjacency } from './graph.ts';
import { clusteringMethods, type ClusteringMethod } from './methods.ts';
export interface Partition { method: ClusteringMethod; groups: string[][]; score: { label: string; value: number } | null }
export const normalizeGroups = (groups: string[][]) => groups.filter(group => group.length).map(group => [...group].sort()).sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));

export function modularity(graph: AnalysisGraph, groups: string[][], directed = false): number {
  const membership = new Map(groups.flatMap((group, i) => group.map(id => [id, i] as const)));
  const pairs = uniquePairs(graph, directed);
  const m = pairs.length;
  if (!m) return 0;
  const incoming = groups.map(() => 0), outgoing = groups.map(() => 0);
  let internal = 0;
  for (const [a, b] of pairs) {
    const ca = membership.get(a)!, cb = membership.get(b)!;
    if (ca === cb) internal++;
    outgoing[ca]++; incoming[cb]++;
    if (!directed) { outgoing[cb]++; incoming[ca]++; }
  }
  return internal / m - groups.reduce((sum, _, i) => sum + outgoing[i] * incoming[i] / (directed ? m * m : 4 * m * m), 0);
}

export function stronglyConnected(graph: AnalysisGraph): string[][] {
  const neighbors = adjacency(graph, true), indices = new Map<string, number>(), low = new Map<string, number>();
  const stack: string[] = [], active = new Set<string>(), groups: string[][] = [];
  let clock = 0;
  function visit(v: string) {
    indices.set(v, clock); low.set(v, clock++); stack.push(v); active.add(v);
    for (const w of [...neighbors.get(v)!].sort()) {
      if (!indices.has(w)) { visit(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
      else if (active.has(w)) low.set(v, Math.min(low.get(v)!, indices.get(w)!));
    }
    if (low.get(v) === indices.get(v)) {
      const group: string[] = [];
      let w: string;
      do { w = stack.pop()!; active.delete(w); group.push(w); } while (w !== v);
      groups.push(group);
    }
  }
  for (const v of [...graph.ids].sort()) if (!indices.has(v)) visit(v);
  return normalizeGroups(groups);
}

function greedy(graph: AnalysisGraph, directed: boolean): string[][] {
  const n = graph.ids.length, indices = new Map(graph.ids.map((id, i) => [id, i]));
  const groups = graph.ids.map(id => [id]), links = Array.from({ length: n }, () => new Float64Array(n));
  const incoming = new Float64Array(n), outgoing = new Float64Array(n);
  const pairs = uniquePairs(graph, directed);
  const m = pairs.length;
  if (!m) return normalizeGroups(groups);
  for (const [a, b] of pairs) {
    const i = indices.get(a)!, j = indices.get(b)!;
    links[i][j]++; links[j][i]++; outgoing[i]++; incoming[j]++;
    if (!directed) { outgoing[j]++; incoming[i]++; }
  }
  const active = new Set(graph.ids.map((_, i) => i));
  while (active.size > 1) {
    let best = 1e-12, chosen: [number, number] | null = null;
    for (const a of active) for (const b of active) if (a < b && links[a][b]) {
      const gain = links[a][b] / m - (outgoing[a] * incoming[b] + outgoing[b] * incoming[a]) / (directed ? m * m : 4 * m * m);
      if (gain > best + 1e-12) { best = gain; chosen = [a, b]; }
    }
    if (!chosen) break;
    const [a, b] = chosen;
    groups[a].push(...groups[b]); active.delete(b);
    incoming[a] += incoming[b]; outgoing[a] += outgoing[b];
    for (const c of active) if (c !== a) links[c][a] = links[a][c] += links[b][c];
  }
  return normalizeGroups([...active].map(i => groups[i]));
}

function labelPropagation(graph: AnalysisGraph): string[][] {
  const neighbors = adjacency(graph), labels = new Map(graph.ids.map(id => [id, id]));
  const order = [...graph.ids].sort((a, b) => neighbors.get(b)!.size - neighbors.get(a)!.size || a.localeCompare(b));
  const seen = new Set<string>();
  for (let iteration = 0; iteration < 100; iteration++) {
    const state = JSON.stringify(graph.ids.map(id => labels.get(id)));
    if (seen.has(state)) break;
    seen.add(state); let changed = false;
    for (const v of order) {
      const counts = new Map<string, number>();
      for (const w of neighbors.get(v)!) counts.set(labels.get(w)!, (counts.get(labels.get(w)!) || 0) + 1);
      if (!counts.size) continue;
      const maximum = Math.max(...counts.values()), options = [...counts.keys()].filter(id => counts.get(id) === maximum).sort();
      const chosen = options.includes(labels.get(v)!) ? labels.get(v)! : options[0];
      if (chosen !== labels.get(v)) { labels.set(v, chosen); changed = true; }
    }
    if (!changed) break;
  }
  return normalizeGroups([...new Set(labels.values())].map(label => graph.ids.filter(id => labels.get(id) === label)));
}

function louvain(graph: AnalysisGraph): string[][] {
  const neighbors = adjacency(graph);
  let members = graph.ids.map(id => [id]);
  let weights: number[][] = graph.ids.map(a => graph.ids.map(b => a !== b && neighbors.get(a)!.has(b) ? 1 : 0));
  for (let level = 0; level < graph.ids.length; level++) {
    const n = members.length, degree = weights.map(row => row.reduce((sum, value) => sum + value, 0)), m2 = degree.reduce((a, b) => a + b, 0);
    if (!m2) return normalizeGroups(members);
    const labels = members.map((_, i) => i), volumes = [...degree];
    for (let iteration = 0; iteration < 100; iteration++) {
      let changed = false;
      for (let v = 0; v < n; v++) {
        const old = labels[v], adjacent = new Map<number, number>();
        for (let w = 0; w < n; w++) if (w !== v && weights[v][w]) adjacent.set(labels[w], (adjacent.get(labels[w]) || 0) + weights[v][w]);
        volumes[old] -= degree[v];
        let chosen = old, best = (adjacent.get(old) || 0) - degree[v] * volumes[old] / m2;
        for (const c of [...adjacent.keys()].sort((a, b) => a - b)) {
          const score = adjacent.get(c)! - degree[v] * volumes[c] / m2;
          if (score > best + 1e-12) { chosen = c; best = score; }
        }
        volumes[chosen] += degree[v];
        if (chosen !== old) { labels[v] = chosen; changed = true; }
      }
      if (!changed) break;
    }
    const distinct = [...new Set(labels)].sort((a, b) => a - b);
    if (distinct.length === n) return normalizeGroups(members);
    const index = new Map(distinct.map((label, i) => [label, i]));
    const next = distinct.map(() => distinct.map(() => 0));
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) next[index.get(labels[a])!][index.get(labels[b])!] += weights[a][b];
    members = distinct.map(label => members.flatMap((group, i) => labels[i] === label ? group : []));
    weights = next;
  }
  return normalizeGroups(members);
}

const xlog = (value: number) => value > 0 ? value * Math.log2(value) : 0;
export function stationaryFlow(graph: AnalysisGraph) {
  const n = graph.ids.length, neighbors = adjacency(graph, true);
  if (!n) return { p: [] as number[], flux: [] as number[][] };
  const transition = graph.ids.map(v => graph.ids.map(w => neighbors.get(v)!.size ? .15 / n + (neighbors.get(v)!.has(w) ? .85 / neighbors.get(v)!.size : 0) : 1 / n));
  let p = graph.ids.map(() => 1 / n);
  for (let iteration = 0; iteration < 1000; iteration++) {
    const next = graph.ids.map((_, w) => p.reduce((sum, value, v) => sum + value * transition[v][w], 0));
    const error = next.reduce((sum, value, i) => sum + Math.abs(value - p[i]), 0);
    p = next; if (error < 1e-13) break;
  }
  return { p, flux: transition.map((row, i) => row.map(value => value * p[i])) };
}
export function mapEquation(p: number[], flux: number[][], groups: number[][]) {
  const exits = groups.map(group => group.reduce((sum, a) => sum + flux[a].reduce((out, value, b) => out + (group.includes(b) ? 0 : value), 0), 0));
  return xlog(exits.reduce((a, b) => a + b, 0)) - 2 * exits.reduce((sum, value) => sum + xlog(value), 0) + groups.reduce((sum, group, i) => sum + xlog(exits[i] + group.reduce((mass, a) => mass + p[a], 0)), 0) - p.reduce((sum, value) => sum + xlog(value), 0);
}
function flowGroups(graph: AnalysisGraph): { groups: string[][]; value: number } {
  const { p, flux } = stationaryFlow(graph), n = graph.ids.length;
  const groups = graph.ids.map((_, i) => [i]), mass = [...p];
  const exits = p.map((_, a) => flux[a].reduce((sum, value, b) => sum + (a === b ? 0 : value), 0));
  const between = flux.map((row, a) => row.map((value, b) => value + flux[b][a]));
  const active = new Set(graph.ids.map((_, i) => i));
  let total = exits.reduce((a, b) => a + b, 0);
  while (active.size > 1) {
    let best = 1e-12, chosen: [number, number, number] | null = null;
    for (const a of active) for (const b of active) if (a < b) {
      const combined = exits[a] + exits[b] - between[a][b];
      const gain = xlog(total) - xlog(total - between[a][b]) - 2 * (xlog(exits[a]) + xlog(exits[b]) - xlog(combined)) + xlog(exits[a] + mass[a]) + xlog(exits[b] + mass[b]) - xlog(combined + mass[a] + mass[b]);
      if (gain > best + 1e-12) { best = gain; chosen = [a, b, combined]; }
    }
    if (!chosen) break;
    const [a, b, combined] = chosen;
    total -= between[a][b]; exits[a] = combined; mass[a] += mass[b]; groups[a].push(...groups[b]); active.delete(b);
    for (const c of active) if (c !== a) between[c][a] = between[a][c] += between[b][c];
  }
  const result = [...active].map(i => groups[i]);
  return { groups: normalizeGroups(result.map(group => group.map(i => graph.ids[i]))), value: n ? mapEquation(p, flux, result) : 0 };
}

export function cluster(graph: AnalysisGraph, method: ClusteringMethod): Partition {
  graph = canonicalGraph(graph);
  if (!clusteringMethods.some(entry => entry.id === method)) throw Error('未知の分類方式です。');
  if (method === 'flow') { const { groups, value } = flowGroups(graph); return { method, groups, score: { label: '符号長 L（bit/step）', value } }; }
  const groups = method === 'spectral' ? normalizeGroups(spectralGroups(graph)) : method === 'scc' ? stronglyConnected(graph) : method === 'label' ? labelPropagation(graph) : method === 'louvain' ? louvain(graph) : greedy(graph, method === 'directed');
  return { method, groups, score: method === 'scc' ? null : { label: method === 'directed' ? '有向 Q' : '無向 Q', value: modularity(graph, groups, method === 'directed') } };
}
