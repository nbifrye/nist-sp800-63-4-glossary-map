import type { AnalysisGraph } from '../model.ts';
import { choleskySolver } from './numerics.ts';
import { adjacency, canonicalGraph, components, uniquePairs } from './graph.ts';
import { spectralCoordinates } from './spectral.ts';
export { components, uniquePairs } from './graph.ts';
import { stronglyConnected, type Partition } from './clustering.ts';
import { layoutMethods, parameters, type LayoutMethod } from './methods.ts';
export interface Point { x: number; y: number }
export type Positions = Record<string, Point>;
export interface LayoutResult {
  method: LayoutMethod; positions: Positions; settings: Record<string, number>;
  metrics: { crossings: number; normalizedLength: number; lengthCV: number };
}
export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
export function distances(graph: AnalysisGraph): Record<string, Record<string, number>> {
  const neighbors = adjacency(graph), result: Record<string, Record<string, number>> = {};
  for (const root of graph.ids) {
    const hops: Record<string, number> = { [root]: 0 }, queue = [root];
    for (let i = 0; i < queue.length; i++) for (const next of neighbors.get(queue[i])!) if (hops[next] === undefined) {
      hops[next] = hops[queue[i]] + 1; queue.push(next);
    }
    result[root] = hops;
  }
  return result;
}
export function stressValue(positions: Positions, shortest: ReturnType<typeof distances>, unit: number) {
  const ids = Object.keys(positions); let total = 0;
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
    const target = unit * shortest[ids[a]][ids[b]];
    if (!Number.isFinite(target)) continue;
    total += (Math.hypot(positions[ids[a]].x - positions[ids[b]].x, positions[ids[a]].y - positions[ids[b]].y) - target) ** 2 / target ** 2;
  }
  return total;
}
export function solve(graph: AnalysisGraph, method: 'force' | 'stress', p: Record<string, number>): Positions {
  const { ids } = graph, random = seeded(p.seed);
  if (!ids.length) return {};
  if (components(graph).length > 1) return pack(graph, component => solve(component, method, p));
  if (ids.length === 1) return { [ids[0]]: { x: 0, y: 0 } };
  let positions: Positions = Object.fromEntries(ids.map(id => [id, { x: (random() - .5) * 700, y: (random() - .5) * 700 }]));
  if (method === 'force') {
    const k = Math.sqrt(490000 / ids.length), pairs = uniquePairs(graph);
    for (let step = 0; step < p.iterations; step++) {
      const displacement: Positions = Object.fromEntries(ids.map(id => [id, { x: 0, y: 0 }])), temperature = 45 * (1 - step / p.iterations);
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j], dx = positions[a].x - positions[b].x, dy = positions[a].y - positions[b].y;
        const f = k * k * p.repulsion / Math.max(.001, dx * dx + dy * dy);
        displacement[a].x += dx * f; displacement[a].y += dy * f; displacement[b].x -= dx * f; displacement[b].y -= dy * f;
      }
      for (const [a, b] of pairs) {
        const dx = positions[a].x - positions[b].x, dy = positions[a].y - positions[b].y, f = Math.hypot(dx, dy) / k;
        displacement[a].x -= dx * f; displacement[a].y -= dy * f; displacement[b].x += dx * f; displacement[b].y += dy * f;
      }
      for (const id of ids) {
        const length = Math.hypot(displacement[id].x, displacement[id].y), f = length ? Math.min(length, temperature) / length : 0;
        positions[id].x += displacement[id].x * f; positions[id].y += displacement[id].y * f;
      }
    }
  } else {
    const shortest = distances(graph), n = ids.length;
    // V is the weighted Laplacian, w_ij = 1 / (unit * hop_ij)^2.
    // Pin vertex 0 to remove translation freedom; the reduced V is positive definite.
    const targets = ids.map(a => ids.map(b => p.unit * shortest[a][b]));
    const weights = targets.map((row, i) => row.map((target, j) => i === j ? 0 : 1 / target ** 2));
    const laplacian = weights.map((row, i) => row.map((w, j) => i === j ? row.reduce((a, b) => a + b, 0) : -w));
    const linearSolve = choleskySolver(laplacian.slice(1).map(row => row.slice(1)));
    let previous = stressValue(positions, shortest, p.unit);
    for (let step = 0; step < p.iterations; step++) {
      const rhsX = Array(n).fill(0), rhsY = Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const dx = positions[ids[i]].x - positions[ids[j]].x, dy = positions[ids[i]].y - positions[ids[j]].y;
        const distance = Math.hypot(dx, dy);
        // A zero coefficient at coincident points is a valid majorizing bound.
        const factor = distance ? weights[i][j] * targets[i][j] / distance : 0;
        rhsX[i] += factor * dx; rhsX[j] -= factor * dx;
        rhsY[i] += factor * dy; rhsY[j] -= factor * dy;
      }
      const x = [0, ...linearSolve(rhsX.slice(1))], y = [0, ...linearSolve(rhsY.slice(1))];
      const candidate = Object.fromEntries(ids.map((id, i) => [id, { x: x[i], y: y[i] }]));
      const value = stressValue(candidate, shortest, p.unit);
      // Exact majorization cannot increase stress. Guard against floating-point drift.
      if (value > previous) break;
      const improvement = previous - value;
      positions = candidate; previous = value;
      if (improvement <= 1e-10 * Math.max(1, previous)) break;
    }
  }
  return positions;
}

function separate(positions: Positions): Positions {
  const values = Object.values(positions); let minimum = Infinity;
  for (let a = 0; a < values.length; a++) for (let b = a + 1; b < values.length; b++) minimum = Math.min(minimum, Math.hypot(values[a].x - values[b].x, values[a].y - values[b].y));
  if (minimum < 1e-9) throw Error('配置計算で用語の位置が重複しました。');
  const factor = Math.max(1, 42 / minimum);
  return Object.fromEntries(Object.entries(positions).map(([id, p]) => [id, { x: p.x * factor, y: p.y * factor }]));
}
function pack(graph: AnalysisGraph, local: (graph: AnalysisGraph) => Positions): Positions {
  const positions: Positions = {}; let x = 0, y = 0, rowHeight = 0;
  for (const ids of components(graph)) {
    const members = new Set(ids), coords = separate(local({ ids, pairs: graph.pairs.filter(([a, b]) => members.has(a) && members.has(b)) }));
    const values = Object.values(coords), minX = Math.min(...values.map(p => p.x)), minY = Math.min(...values.map(p => p.y));
    const width = Math.max(...values.map(p => p.x)) - minX + 160, height = Math.max(...values.map(p => p.y)) - minY + 160;
    if (x && x + width > 2600) { x = 0; y += rowHeight; rowHeight = 0; }
    for (const id of ids) positions[id] = { x: coords[id].x - minX + x + 80, y: coords[id].y - minY + y + 80 };
    x += width; rowHeight = Math.max(rowHeight, height);
  }
  return positions;
}
function circleOrRadial(graph: AnalysisGraph, radial: boolean): Positions {
  const neighbors = adjacency(graph), order = [...graph.ids].sort((a, b) => neighbors.get(b)!.size - neighbors.get(a)!.size || a.localeCompare(b));
  if (order.length === 1) return { [order[0]]: { x: 0, y: 0 } };
  if (!radial) {
    const radius = Math.max(90, order.length * 45 / (2 * Math.PI));
    return Object.fromEntries(order.map((id, i) => [id, { x: radius * Math.cos(2 * Math.PI * i / order.length), y: radius * Math.sin(2 * Math.PI * i / order.length) }]));
  }
  const root = order[0], hops = distances(graph)[root], coords: Positions = { [root]: { x: 0, y: 0 } }; let radius = 0;
  for (let hop = 1; hop <= Math.max(...Object.values(hops)); hop++) {
    const layer = order.filter(id => hops[id] === hop); radius = Math.max(radius + 140, layer.length * 45 / (2 * Math.PI));
    layer.forEach((id, i) => { const angle = 2 * Math.PI * i / layer.length - Math.PI / 2; coords[id] = { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }; });
  }
  return coords;
}

export function ranks(graph: AnalysisGraph): Record<string, number> {
  const next = adjacency(graph, true), incoming: Record<string, number> = Object.fromEntries(graph.ids.map(id => [id, 0])), rank = { ...incoming };
  for (const following of next.values()) for (const id of following) incoming[id]++;
  const ready = graph.ids.filter(id => !incoming[id]).sort(); let visited = 0;
  while (ready.length) {
    const v = ready.shift()!; visited++;
    for (const w of next.get(v)!) {
      rank[w] = Math.max(rank[w], rank[v] + 1);
      if (!--incoming[w]) { ready.push(w); ready.sort(); }
    }
  }
  if (visited !== graph.ids.length) throw Error('層を割り当てるには、有向非巡回グラフ（DAG）が必要です。');
  return rank;
}
function condensation(graph: AnalysisGraph): Positions {
  const groups = stronglyConnected(graph), membership = new Map(groups.flatMap((group, i) => group.map(id => [id, String(i)] as const)));
  const level = ranks({ ids: groups.map((_, i) => String(i)), pairs: graph.pairs.map(([a, b]) => [membership.get(a)!, membership.get(b)!]).filter(([a, b]) => a !== b) as [string, string][] });
  const coords: Positions = {}; let y = 0;
  for (let rank = 0; rank <= Math.max(0, ...Object.values(level)); rank++) {
    let ordinal = 0;
    groups.forEach((group, i) => { if (level[String(i)] === rank) for (const id of group) { coords[id] = { x: (ordinal % 12) * 300, y: y + Math.floor(ordinal / 12) * 70 }; ordinal++; } });
    y += Math.max(1, Math.ceil(ordinal / 12)) * 70 + 100;
  }
  return coords;
}
function layered(graph: AnalysisGraph, sweeps: number): Positions {
  const neighbors = adjacency(graph, true), state = new Map<string, number>(), oriented = new Set<string>();
  function visit(v: string) {
    state.set(v, 1);
    for (const w of [...neighbors.get(v)!].sort()) {
      oriented.add(JSON.stringify(state.get(w) === 1 ? [w, v] : [v, w]));
      if (!state.has(w)) visit(w);
    }
    state.set(v, 2);
  }
  for (const id of graph.ids) if (!state.has(id)) visit(id);
  const pairs = [...oriented].sort().map(pair => JSON.parse(pair) as [string, string]);
  const rank = ranks({ ids: graph.ids, pairs }), previous = new Map(graph.ids.map(id => [id, [] as string[]])), following = new Map(graph.ids.map(id => [id, [] as string[]]));
  let virtualPrefix = '@';
  while (graph.ids.some(id => id.startsWith(virtualPrefix))) virtualPrefix += '@';
  pairs.forEach(([a, b], i) => {
    const chain = [a];
    for (let level = rank[a] + 1; level < rank[b]; level++) {
      const id = `${virtualPrefix}${i}-${level}`; rank[id] = level; previous.set(id, []); following.set(id, []); chain.push(id);
    }
    chain.push(b);
    for (let j = 1; j < chain.length; j++) { following.get(chain[j - 1])!.push(chain[j]); previous.get(chain[j])!.push(chain[j - 1]); }
  });
  const layers = Array.from({ length: Math.max(0, ...Object.values(rank)) + 1 }, (_, r) => Object.keys(rank).filter(id => rank[id] === r).sort());
  const order = new Map<string, number>(); layers.forEach(layer => layer.forEach((id, i) => order.set(id, i)));
  for (let sweep = 0; sweep < sweeps; sweep++) {
    const adjacent = sweep % 2 ? following : previous;
    for (const layer of sweep % 2 ? [...layers].reverse() : layers) {
      const score = (id: string) => adjacent.get(id)!.length ? adjacent.get(id)!.reduce((sum, id) => sum + order.get(id)!, 0) / adjacent.get(id)!.length : order.get(id)!;
      layer.sort((a, b) => score(a) - score(b) || a.localeCompare(b)); layer.forEach((id, i) => order.set(id, i));
    }
  }
  const visible = new Set(graph.ids), coords: Positions = {};
  layers.forEach((layer, rank) => { const ids = layer.filter(id => visible.has(id)); ids.forEach((id, i) => { coords[id] = { x: (i - (ids.length - 1) / 2) * 85, y: rank * 140 }; }); });
  return coords;
}
function grouped(graph: AnalysisGraph, partition: Partition, p: Record<string, number>): Positions {
  const coords: Positions = {}, neighbors = adjacency(graph); let x = 0, y = 0, rowHeight = 0;
  for (const group of partition.groups) {
    const radius = Math.max(70, Math.sqrt(group.length) * 43 * p.within), tile = radius * 2 + 130 * p.between;
    if (x && x + tile > 2600) { x = 0; y += rowHeight; rowHeight = 0; }
    const order = [...group].sort((a, b) => neighbors.get(b)!.size - neighbors.get(a)!.size || a.localeCompare(b));
    order.forEach((id, i) => { const r = Math.sqrt(i) * 43 * p.within, angle = i * Math.PI * (3 - Math.sqrt(5)); coords[id] = { x: x + tile / 2 + r * Math.cos(angle), y: y + tile / 2 + r * Math.sin(angle) }; });
    x += tile; rowHeight = Math.max(rowHeight, tile);
  }
  return coords;
}
export function placementMetrics(positions: Positions, graph: AnalysisGraph): LayoutResult['metrics'] {
  const edges = uniquePairs(graph), values = Object.values(positions);
  const lengths = edges.map(([a, b]) => Math.hypot(positions[a].x - positions[b].x, positions[a].y - positions[b].y));
  const mean = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const diagonal = values.length ? Math.hypot(Math.max(...values.map(p => p.x)) - Math.min(...values.map(p => p.x)), Math.max(...values.map(p => p.y)) - Math.min(...values.map(p => p.y))) : 0;
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) / diagonal * ((c.y - a.y) / diagonal) - (b.y - a.y) / diagonal * ((c.x - a.x) / diagonal);
  const opposite = (a: number, b: number) => a < 0 && b > 0 || a > 0 && b < 0;
  let crossings = 0;
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const [a, b] = edges[i], [c, d] = edges[j];
    if (new Set([a, b, c, d]).size < 4) continue;
    if (opposite(cross(positions[a], positions[b], positions[c]), cross(positions[a], positions[b], positions[d])) && opposite(cross(positions[c], positions[d], positions[a]), cross(positions[c], positions[d], positions[b]))) crossings++;
  }
  return { crossings, normalizedLength: diagonal ? mean / diagonal : 0, lengthCV: mean ? Math.sqrt(lengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lengths.length) / mean : 0 };
}
export function place(graph: AnalysisGraph, method: LayoutMethod, partition: Partition, values: Record<string, number> = {}): LayoutResult {
  graph = canonicalGraph(graph);
  const metadata = layoutMethods.find(entry => entry.id === method);
  if (!metadata) throw Error('指定された配置方式に対応していません。');
  const p = parameters(metadata, values);
  let positions = method === 'grouped' ? grouped(graph, partition, p) : method === 'condensation' ? condensation(graph) : method === 'layered' ? layered(graph, p.sweeps) : pack(graph, subgraph => method === 'force' || method === 'stress' ? solve(subgraph, method, p) : method === 'spectral' ? spectralCoordinates(subgraph) : circleOrRadial(subgraph, method === 'radial'));
  if (method !== 'grouped' && method !== 'force' && method !== 'stress') positions = Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { x: point.x * p.horizontal, y: point.y * p.vertical }]));
  if (Object.keys(positions).length !== graph.ids.length || Object.values(positions).some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw Error('すべての用語について有効な座標を計算できませんでした。');
  return { method, positions, settings: p, metrics: placementMetrics(positions, graph) };
}
