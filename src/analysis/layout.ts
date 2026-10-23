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
// Eades, Lin & Smyth (1993): move sinks to the back and sources to the front; otherwise move the
// vertex with the largest outdegree − indegree to the front. Arcs pointing backwards form a feedback arc set.
function greedySequence(ids: string[], pairs: [string, string][]): string[] {
  const out = new Map(ids.map(id => [id, new Set<string>()])), incoming = new Map(ids.map(id => [id, new Set<string>()]));
  for (const [a, b] of pairs) { out.get(a)!.add(b); incoming.get(b)!.add(a); }
  const remaining = new Set([...ids].sort()), front: string[] = [], back: string[] = [];
  const remove = (v: string) => { remaining.delete(v); for (const w of out.get(v)!) incoming.get(w)!.delete(v); for (const u of incoming.get(v)!) out.get(u)!.delete(v); };
  const delta = (v: string) => out.get(v)!.size - incoming.get(v)!.size;
  while (remaining.size) {
    const sink = [...remaining].find(v => !out.get(v)!.size);
    if (sink !== undefined) { back.unshift(sink); remove(sink); continue; }
    const source = [...remaining].find(v => !incoming.get(v)!.size) ?? [...remaining].reduce((best, v) => delta(v) > delta(best) ? v : best);
    front.push(source); remove(source);
  }
  return [...front, ...back];
}
// Orders the strongly connected components topologically and applies the greedy sequence inside each,
// so only arcs within a component are reversed. Mutual references collapse into one arc.
export function acyclicPairs(graph: AnalysisGraph): [string, string][] {
  graph = canonicalGraph(graph);
  const groups = stronglyConnected(graph), membership = new Map(groups.flatMap((group, i) => group.map(id => [id, i] as const)));
  const level = ranks({ ids: groups.map((_, i) => String(i)), pairs: graph.pairs.filter(([a, b]) => membership.get(a) !== membership.get(b)).map(([a, b]) => [String(membership.get(a)), String(membership.get(b))]) });
  const sequence = groups.map((group, i) => ({ group, i })).sort((a, b) => level[a.i] - level[b.i] || a.i - b.i)
    .flatMap(({ group, i }) => greedySequence(group, graph.pairs.filter(([a, b]) => membership.get(a) === i && membership.get(b) === i)));
  const position = new Map(sequence.map((id, i) => [id, i]));
  return uniquePairs({ ids: graph.ids, pairs: graph.pairs.map(([a, b]) => position.get(a)! < position.get(b)! ? [a, b] : [b, a]) }, true);
}
// Gansner et al. (1993), §2: minimise Σ λ(v) − λ(u) over arcs u → v subject to λ(v) − λ(u) ≥ 1.
// The graph must be a connected DAG. The cyclic search for leaving edges follows the paper; the
// iteration limit only guards against degenerate cycling.
function networkSimplex(ids: string[], pairs: [string, string][]): Record<string, number> {
  const rank = ranks({ ids, pairs }), incident = new Map(ids.map(id => [id, [] as number[]]));
  pairs.forEach(([a, b], i) => { incident.get(a)!.push(i); incident.get(b)!.push(i); });
  const slack = (i: number) => rank[pairs[i][1]] - rank[pairs[i][0]] - 1, other = (i: number, v: string) => pairs[i][0] === v ? pairs[i][1] : pairs[i][0];
  const tree = new Set<number>(), reached = new Set([ids[0]]);
  const grow = () => {
    const queue = [...reached];
    for (let k = 0; k < queue.length; k++) for (const i of incident.get(queue[k])!) {
      const w = other(i, queue[k]);
      if (!slack(i) && !reached.has(w)) { reached.add(w); tree.add(i); queue.push(w); }
    }
  };
  for (grow(); reached.size < ids.length; grow()) {
    let best = -1;
    pairs.forEach(([a, b], i) => { if (reached.has(a) !== reached.has(b) && (best < 0 || slack(i) < slack(best))) best = i; });
    const delta = reached.has(pairs[best][0]) ? slack(best) : -slack(best);
    for (const id of reached) rank[id] += delta;
  }
  // The tail component of tree edge t: vertices reachable from its tail without crossing t.
  const tail = (t: number) => {
    const side = new Set([pairs[t][0]]), queue = [pairs[t][0]];
    for (let k = 0; k < queue.length; k++) for (const i of incident.get(queue[k])!) {
      const w = other(i, queue[k]);
      if (i !== t && tree.has(i) && !side.has(w)) { side.add(w); queue.push(w); }
    }
    return side;
  };
  const cutValue = (side: Set<string>) => pairs.reduce((sum, [a, b]) => sum + (side.has(a) && !side.has(b) ? 1 : !side.has(a) && side.has(b) ? -1 : 0), 0);
  let start = 0;
  for (let iteration = 0; iteration < pairs.length * ids.length; iteration++) {
    let leave = -1, side = new Set<string>();
    for (let k = 0; k < pairs.length && leave < 0; k++) {
      const t = (start + k) % pairs.length;
      if (tree.has(t)) { const candidate = tail(t); if (cutValue(candidate) < 0) { leave = t; side = candidate; } }
    }
    if (leave < 0) break;
    // A negative cut value implies an arc from the head component to the tail component.
    let enter = -1;
    pairs.forEach(([a, b], i) => { if (!side.has(a) && side.has(b) && (enter < 0 || slack(i) < slack(enter))) enter = i; });
    const delta = slack(enter);
    for (const id of side) rank[id] -= delta;
    tree.delete(leave); tree.add(enter); start = leave + 1;
  }
  const lowest = Math.min(...ids.map(id => rank[id]));
  return Object.fromEntries(ids.map(id => [id, rank[id] - lowest]));
}
// Network simplex per weakly connected component; isolated terms stay on the first layer. Vertices with
// equal indegree and outdegree then move to the least populated feasible layer, which keeps the total length.
export function layering(graph: AnalysisGraph): Record<string, number> {
  const rank: Record<string, number> = {};
  for (const ids of components(graph)) {
    const members = new Set(ids);
    Object.assign(rank, ids.length > 1 ? networkSimplex(ids, graph.pairs.filter(([a]) => members.has(a))) : { [ids[0]]: 0 });
  }
  const previous = new Map(graph.ids.map(id => [id, [] as string[]])), following = new Map(graph.ids.map(id => [id, [] as string[]])), count = new Map<number, number>();
  for (const [a, b] of graph.pairs) { following.get(a)!.push(b); previous.get(b)!.push(a); }
  for (const id of graph.ids) count.set(rank[id], (count.get(rank[id]) || 0) + 1);
  for (const id of [...graph.ids].sort()) if (previous.get(id)!.length && previous.get(id)!.length === following.get(id)!.length) {
    const low = Math.max(...previous.get(id)!.map(v => rank[v] + 1)), high = Math.min(...following.get(id)!.map(v => rank[v] - 1));
    count.set(rank[id], count.get(rank[id])! - 1);
    for (let r = low; r <= high; r++) if ((count.get(r) || 0) < count.get(rank[id])!) rank[id] = r;
    count.set(rank[id], (count.get(rank[id]) || 0) + 1);
  }
  return rank;
}
// Gansner et al. (1993), §3: the weighted median of adjacent positions; −1 keeps a vertex in place.
function median(values: number[]): number {
  const p = [...values].sort((a, b) => a - b), m = Math.floor(p.length / 2);
  if (!p.length) return -1;
  if (p.length % 2) return p[m];
  const left = p[m - 1] - p[0], right = p[p.length - 1] - p[m];
  return p.length === 2 || !(left + right) ? (p[m - 1] + p[m]) / 2 : (p[m - 1] * right + p[m] * left) / (left + right);
}
// Splits long arcs with virtual vertices, then alternates downward and upward median sweeps with
// transposition of adjacent vertices, keeping the order with the fewest crossings (Gansner et al. 1993, §3).
// Crossings between adjacent layers are counted as inversions (Barth, Jünger & Mutzel 2004).
export function orderLayers(graph: AnalysisGraph, rank: Record<string, number>, sweeps: number): string[][] {
  const names = [...graph.ids], level = graph.ids.map(id => rank[id]), number = new Map(names.map((id, i) => [id, i]));
  const previous: number[][] = names.map(() => []), following: number[][] = names.map(() => []);
  let virtualPrefix = '@';
  while (graph.ids.some(id => id.startsWith(virtualPrefix))) virtualPrefix += '@';
  graph.pairs.forEach(([a, b], i) => {
    const chain = [number.get(a)!];
    for (let r = rank[a] + 1; r < rank[b]; r++) {
      chain.push(names.length); names.push(`${virtualPrefix}${i}-${r}`); level.push(r); previous.push([]); following.push([]);
    }
    chain.push(number.get(b)!);
    for (let j = 1; j < chain.length; j++) { following[chain[j - 1]].push(chain[j]); previous[chain[j]].push(chain[j - 1]); }
  });
  const layers: number[][] = Array.from({ length: Math.max(0, ...level) + 1 }, () => []);
  names.map((_, v) => v).sort((a, b) => names[a] < names[b] ? -1 : 1).forEach(v => layers[level[v]].push(v));
  const position = new Int32Array(names.length), index = () => layers.forEach(layer => layer.forEach((v, i) => { position[v] = i; }));
  const crossings = () => {
    let total = 0;
    for (let r = 0; r + 1 < layers.length; r++) {
      const fenwick = new Int32Array(layers[r + 1].length + 1);
      layers[r].flatMap(v => following[v].map(w => position[w]).sort((a, b) => a - b)).forEach((p, k) => {
        let atMost = 0;
        for (let i = p + 1; i > 0; i -= i & -i) atMost += fenwick[i];
        total += k - atMost;
        for (let i = p + 1; i < fenwick.length; i += i & -i) fenwick[i]++;
      });
    }
    return total;
  };
  // Crossings among the arcs of v and w on both sides when v is left of w.
  const local = (v: number, w: number) => {
    let total = 0;
    for (const adjacent of [previous, following]) for (const a of adjacent[v]) for (const b of adjacent[w]) if (position[a] > position[b]) total++;
    return total;
  };
  const transpose = () => {
    for (let improved = true; improved;) {
      improved = false;
      for (const layer of layers) for (let i = 0; i + 1 < layer.length; i++) if (local(layer[i], layer[i + 1]) > local(layer[i + 1], layer[i])) {
        [layer[i], layer[i + 1]] = [layer[i + 1], layer[i]]; position[layer[i]] = i; position[layer[i + 1]] = i + 1; improved = true;
      }
    }
  };
  index();
  let best = layers.map(layer => [...layer]), fewest = crossings();
  for (let sweep = 0; sweep < sweeps; sweep++) {
    const adjacent = sweep % 2 ? following : previous;
    for (const layer of sweep % 2 ? layers.slice(0, -1).reverse() : layers.slice(1)) {
      const value = new Map(layer.map(v => [v, median(adjacent[v].map(w => position[w]))]));
      const movable = layer.filter(v => value.get(v)! >= 0).sort((a, b) => value.get(a)! - value.get(b)! || position[a] - position[b]);
      let k = 0;
      layer.forEach((v, i) => { if (value.get(v)! >= 0) layer[i] = movable[k++]; });
      layer.forEach((v, i) => { position[v] = i; });
    }
    transpose();
    const count = crossings();
    if (count < fewest) { fewest = count; best = layers.map(layer => [...layer]); }
  }
  return best.map(layer => layer.map(v => names[v]));
}
function condensation(graph: AnalysisGraph, sweeps: number): Positions {
  const groups = stronglyConnected(graph), membership = new Map(groups.flatMap((group, i) => group.map(id => [id, String(i)] as const)));
  const condensed = uniquePairs({ ids: groups.map((_, i) => String(i)), pairs: graph.pairs.map(([a, b]) => [membership.get(a)!, membership.get(b)!]) }, true);
  const ids = groups.map((_, i) => String(i)), layers = orderLayers({ ids, pairs: condensed }, ranks({ ids, pairs: condensed }), sweeps);
  const coords: Positions = {}; let y = 0;
  for (const layer of layers) {
    let ordinal = 0;
    // Virtual vertex IDs start with "@" and match no component index.
    for (const group of layer) for (const id of groups[Number(group)] ?? []) { coords[id] = { x: (ordinal % 12) * 300, y: y + Math.floor(ordinal / 12) * 70 }; ordinal++; }
    y += Math.max(1, Math.ceil(ordinal / 12)) * 70 + 100;
  }
  return coords;
}
function layered(graph: AnalysisGraph, sweeps: number): Positions {
  const pairs = acyclicPairs(graph), visible = new Set(graph.ids), coords: Positions = {};
  orderLayers({ ids: graph.ids, pairs }, layering({ ids: graph.ids, pairs }), sweeps).forEach((layer, rank) => {
    const ids = layer.filter(id => visible.has(id));
    ids.forEach((id, i) => { coords[id] = { x: (i - (ids.length - 1) / 2) * 85, y: rank * 140 }; });
  });
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
  let positions = method === 'grouped' ? grouped(graph, partition, p) : method === 'condensation' ? condensation(graph, p.sweeps) : method === 'layered' ? layered(graph, p.sweeps) : pack(graph, subgraph => method === 'force' || method === 'stress' ? solve(subgraph, method, p) : method === 'spectral' ? spectralCoordinates(subgraph) : circleOrRadial(subgraph, method === 'radial'));
  if (method !== 'grouped' && method !== 'force' && method !== 'stress') positions = Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { x: point.x * p.horizontal, y: point.y * p.vertical }]));
  if (Object.keys(positions).length !== graph.ids.length || Object.values(positions).some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw Error('すべての用語について有効な座標を計算できませんでした。');
  return { method, positions, settings: p, metrics: placementMetrics(positions, graph) };
}
