import test from 'node:test';
import assert from 'node:assert/strict';
import { cluster, modularity, stationaryFlow, mapEquation } from '../src/analysis/clustering.ts';
import { acyclicPairs, layering, orderLayers, place, placementMetrics, ranks, seeded, solve, distances, stressValue } from '../src/analysis/layout.ts';
import { clusteringMethods, layoutMethods, parameters } from '../src/analysis/methods.ts';
import { analysisGraph, type AnalysisGraph } from '../src/model.ts';
import { buildData } from '../scripts/build-data.ts';

const graph: AnalysisGraph = { ids: [...'abcdefz'], pairs: [['a', 'b'], ['b', 'a'], ['b', 'c'], ['c', 'a'], ['c', 'd'], ['d', 'e'], ['e', 'f'], ['f', 'd'], ['a', 'a']] };
test('all community methods cover isolates and retain the graph; density scores match an independent sum', () => {
  const original = structuredClone(graph);
  for (const method of clusteringMethods) {
    const result = cluster(graph, method.id);
    assert.deepEqual(result.groups.flat().sort(), [...graph.ids].sort());
    assert.deepEqual(cluster(graph, method.id), result);
    if (method.id !== 'scc' && method.id !== 'flow') {
      const directed = method.id === 'directed';
      const pairs = new Set(graph.pairs.filter(([a, b]) => a !== b).map(([a, b]) => `${a}${b}`));
      if (!directed) for (const [a, b] of [...pairs]) pairs.add(`${b}${a}`);
      const out = (a: string) => [...pairs].filter(edge => edge[0] === a).length;
      const incoming = (a: string) => [...pairs].filter(edge => edge[1] === a).length;
      let expected = 0;
      for (const group of result.groups) for (const a of group) for (const b of group) expected += (Number(pairs.has(a + b)) - out(a) * incoming(b) / pairs.size) / pairs.size;
      assert.ok(Math.abs(expected - result.score!.value) < 1e-10);
      assert.equal(modularity(graph, result.groups, directed), result.score!.value);
    }
  }
  assert.deepEqual(graph, original);
  assert.deepEqual(cluster(graph, 'scc').groups, [['a', 'b', 'c'], ['d', 'e', 'f'], ['z']]);
  const cliques = { ...graph, pairs: graph.pairs.filter(([a, b]) => a !== 'c' || b !== 'd') };
  for (const method of ['undirected', 'directed', 'louvain'] as const) assert.deepEqual(cluster(cliques, method).groups, [['a', 'b', 'c'], ['d', 'e', 'f'], ['z']]);
});

test('stationary flow conserves probability and map equation matches an independent entropy calculation', () => {
  const { p, flux } = stationaryFlow(graph), partition = cluster(graph, 'flow');
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  p.forEach((value, i) => assert.ok(Math.abs(flux.reduce((sum, row) => sum + row[i], 0) - value) < 1e-12));
  const groups = partition.groups.map(group => group.map(id => graph.ids.indexOf(id)));
  const exits = groups.map(group => group.reduce((sum, a) => sum + flux[a].reduce((total, value, b) => total + (group.includes(b) ? 0 : value), 0), 0));
  const entropy = (weights: number[]) => { const total = weights.reduce((a, b) => a + b, 0); return total ? weights.reduce((sum, w) => w > 0 ? sum - w * Math.log2(w / total) : sum, 0) : 0; };
  const independent = entropy(exits) + groups.reduce((sum, group, i) => sum + entropy([exits[i], ...group.map(a => p[a])]), 0);
  assert.ok(Math.abs(independent - partition.score!.value) < 1e-12);
  assert.ok(Math.abs(mapEquation(p, flux, groups) - independent) < 1e-12);
});

test('layouts are reproducible and independent of partition except grouped placement', () => {
  const a = cluster(graph, 'louvain'), b = cluster(graph, 'scc');
  for (const method of layoutMethods) {
    const first = place(graph, method.id, a), second = place(graph, method.id, b);
    assert.deepEqual(first, place(graph, method.id, a));
    assert.deepEqual(Object.keys(first.positions).sort(), [...graph.ids].sort());
    for (const point of Object.values(first.positions)) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    if (method.id !== 'grouped') assert.deepEqual(first, second);
  }
  assert.throws(() => place(graph, 'force', a, { seed: -1 }), /範囲外/);
  assert.throws(() => ranks(graph), /DAG/);
  assert.deepEqual(ranks({ ids: ['a', 'b', 'c'], pairs: [['a', 'b'], ['b', 'c']] }), { a: 0, b: 1, c: 2 });
});

test('feedback arcs are reversed only inside strongly connected components', () => {
  const oriented = acyclicPairs(graph), scc = cluster(graph, 'scc').groups, kept = new Set(oriented.map(pair => JSON.stringify(pair)));
  assert.doesNotThrow(() => ranks({ ids: graph.ids, pairs: oriented }));
  const reversed = graph.pairs.filter(([a, b]) => a !== b && !kept.has(JSON.stringify([a, b])));
  for (const [a, b] of reversed) assert.ok(scc.some(group => group.includes(a) && group.includes(b)));
  // a ↔ b, b → c → a needs one reversal (a → b), and d → e → f → d needs one.
  assert.equal(reversed.length, 2);
  for (const [a, b] of graph.pairs) if (a !== b) assert.ok(oriented.some(([c, d]) => c === a && d === b || c === b && d === a));
  assert.deepEqual(acyclicPairs({ ids: [...graph.ids].reverse(), pairs: [...graph.pairs].reverse() }), oriented);
});

test('layering attains the minimum total arc length found by exhaustive search', () => {
  const random = seeded(7);
  for (let trial = 0; trial < 60; trial++) {
    const n = 2 + Math.floor(random() * 4), ids = Array.from({ length: n }, (_, i) => String(i)), pairs: [string, string][] = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (b === a + 1 && random() < .5 || random() < .4) pairs.push([String(a), String(b)]);
    const rank = layering({ ids, pairs }), length = (r: Record<string, number>) => pairs.reduce((sum, [a, b]) => sum + r[b] - r[a], 0);
    for (const [a, b] of pairs) assert.ok(rank[b] - rank[a] >= 1);
    let minimum = Infinity;
    for (let code = 0; code < n ** n; code++) {
      const r = Object.fromEntries(ids.map((id, i) => [id, Math.floor(code / n ** i) % n]));
      if (pairs.every(([a, b]) => r[b] - r[a] >= 1)) minimum = Math.min(minimum, length(r));
    }
    // Isolated vertices are fixed to the first layer and do not affect the length.
    assert.equal(length(rank), minimum, JSON.stringify(pairs));
  }
  // Longest-path layering puts both sources on layer 0; the optimum pulls c next to its target.
  assert.deepEqual(layering({ ids: [...'abcd'], pairs: [['a', 'b'], ['b', 'd'], ['c', 'd']] }), { a: 0, b: 1, c: 1, d: 2 });
});

test('layer ordering keeps one vertex per arc step and removes avoidable crossings', () => {
  const twisted: AnalysisGraph = { ids: [...'abcd'], pairs: [['a', 'd'], ['b', 'c']] };
  assert.deepEqual(orderLayers(twisted, { a: 0, b: 0, c: 1, d: 1 }, 1), [['a', 'b'], ['d', 'c']]);
  assert.deepEqual(orderLayers(twisted, { a: 0, b: 0, c: 1, d: 1 }, 0), [['a', 'b'], ['c', 'd']]);
  const pairs = acyclicPairs(graph), rank = layering({ ids: graph.ids, pairs }), layers = orderLayers({ ids: graph.ids, pairs }, rank, 24);
  assert.deepEqual(layers.flat().filter(id => !id.startsWith('@')).sort(), graph.ids);
  for (const id of graph.ids) assert.equal(layers.findIndex(layer => layer.includes(id)), rank[id]);
  assert.equal(layers.flat().length, graph.ids.length + pairs.reduce((sum, [a, b]) => sum + rank[b] - rank[a] - 1, 0));
});

test('stress majorization reduces stress; crossings exclude shared endpoints, contact and duplicate directions', () => {
  const path: AnalysisGraph = { ids: [...'abcde'], pairs: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e']] };
  const p = parameters(layoutMethods.find(method => method.id === 'stress')!);
  const initial = solve(path, 'stress', { ...p, iterations: 0 }), final = solve(path, 'stress', p), shortest = distances(path);
  assert.ok(stressValue(final, shortest, p.unit) < stressValue(initial, shortest, p.unit));
  const points = { a: { x: 0, y: 0 }, b: { x: 10, y: 10 }, c: { x: 0, y: 10 }, d: { x: 10, y: 0 } };
  assert.equal(placementMetrics(points, { ids: [...'abcd'], pairs: [['a', 'b'], ['c', 'd'], ['b', 'a']] }).crossings, 1);
  assert.equal(placementMetrics(points, { ids: [...'abcd'], pairs: [['a', 'b'], ['a', 'c']] }).crossings, 0);
});

test('all corpus combinations keep complete memberships, coordinates and source evidence', async () => {
  const corpus = await buildData(), graph = analysisGraph(corpus);
  const snapshot = JSON.stringify(graph);
  const partitions = clusteringMethods.map(method => cluster(graph, method.id));
  const positions = new Map<string, unknown>();
  for (const partition of partitions) {
    assert.deepEqual(partition.groups.flat().sort(), graph.ids);
    for (const method of layoutMethods) {
      const result = place(graph, method.id, partition);
      assert.equal(Object.keys(result.positions).length, graph.ids.length);
      if (method.id !== 'grouped') {
        if (positions.has(method.id)) assert.deepEqual(result.positions, positions.get(method.id));
        positions.set(method.id, result.positions);
      }
    }
  }
  assert.equal(JSON.stringify(graph), snapshot);
});

test('majorization solves a single edge exactly and monotonically decreases path stress', () => {
  const edge: AnalysisGraph = { ids: ['a', 'b'], pairs: [['a', 'b']] };
  const p = { unit: 90, iterations: 1, seed: 42 };
  const points = solve(edge, 'stress', p);
  assert.ok(Math.abs(Math.hypot(points.a.x - points.b.x, points.a.y - points.b.y) - p.unit) < 1e-10);
  const path: AnalysisGraph = { ids: [...'abcde'], pairs: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e']] };
  const shortest = distances(path);
  let previous = Infinity;
  for (let iterations = 0; iterations <= 20; iterations++) {
    const value = stressValue(solve(path, 'stress', { ...p, iterations }), shortest, p.unit);
    assert.ok(value <= previous + 1e-10, `${iterations}: ${value} > ${previous}`);
    previous = value;
  }
  assert.ok(previous < 0.02);
  const disconnected = solve(graph, 'stress', { ...p, iterations: 20 });
  assert.equal(Object.keys(disconnected).length, graph.ids.length);
  assert.ok(Object.values(disconnected).every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test('crossing counts do not depend on coordinate scale', () => {
  for (const scale of [1e-100, 1e-6, 1, 1e6, 1e100]) {
    const points = { a: { x: 0, y: 0 }, b: { x: scale, y: scale }, c: { x: 0, y: scale }, d: { x: scale, y: 0 } };
    assert.equal(placementMetrics(points, { ids: [...'abcd'], pairs: [['a', 'b'], ['c', 'd']] }).crossings, 1);
  }
});

test('group spacing changes the gap without overlapping group bounds', () => {
  const ids = Array.from({ length: 80 }, (_, i) => String(i));
  const groups = [ids.slice(0, 40), ids.slice(40)];
  const result = place({ ids, pairs: [] }, 'grouped', { method: 'scc', groups, score: null }, { within: 2, between: .5 });
  const bounds = groups.map(group => {
    const points = group.map(id => result.positions[id]);
    return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) };
  });
  assert.ok(bounds[0].right < bounds[1].left || bounds[0].bottom < bounds[1].top);
});

test('all methods handle empty, edgeless, two-node and symmetric complete graphs', () => {
  const complete: AnalysisGraph = { ids: [...'abcdef'], pairs: [] };
  for (const a of complete.ids) for (const b of complete.ids) if (a < b) complete.pairs.push([a, b]);
  for (const input of [{ ids: [], pairs: [] }, { ids: ['a'], pairs: [['a', 'a']] }, { ids: [...'abc'], pairs: [] }, { ids: ['a', 'b'], pairs: [['a', 'b']] }, complete] as AnalysisGraph[]) {
    for (const method of clusteringMethods) {
      const partition = cluster(input, method.id);
      assert.deepEqual(partition.groups.flat().sort(), input.ids);
      if (partition.score) assert.ok(Number.isFinite(partition.score.value));
    }
    for (const method of layoutMethods) {
      const result = place(input, method.id, cluster(input, 'spectral'));
      assert.deepEqual(Object.keys(result.positions).sort(), input.ids);
      const points = Object.values(result.positions);
      for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) assert.ok(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) > 1e-9);
    }
  }
  assert.deepEqual(cluster(complete, 'spectral').groups, [complete.ids]);
});

test('input order, duplicate arcs and self references do not change analysis', () => {
  const permuted: AnalysisGraph = { ids: [...graph.ids].reverse(), pairs: [...graph.pairs, ...graph.pairs, ...graph.ids.map(id => [id, id] as [string, string])].reverse() };
  for (const method of clusteringMethods) assert.deepEqual(cluster(permuted, method.id), cluster(graph, method.id));
  const partition = cluster(graph, 'louvain');
  for (const method of layoutMethods) assert.deepEqual(place(permuted, method.id, partition), place(graph, method.id, partition));
  const unusual: AnalysisGraph = { ids: ['a|b', 'c', 'a', 'b|c', '@0-1'], pairs: [['a|b', 'c'], ['a', 'b|c'], ['c', '@0-1']] };
  for (const method of clusteringMethods) assert.deepEqual(cluster(unusual, method.id).groups.flat().sort(), [...unusual.ids].sort());
  for (const method of layoutMethods) assert.equal(Object.keys(place(unusual, method.id, cluster(unusual, 'scc')).positions).length, 5);
});

test('spectral recursion separates four cliques while retaining the original null model', () => {
  const ids = Array.from({ length: 16 }, (_, i) => String(i).padStart(2, '0')), pairs: [string, string][] = [];
  const groups = Array.from({ length: 4 }, (_, c) => ids.slice(c * 4, c * 4 + 4));
  for (const group of groups) for (const a of group) for (const b of group) if (a < b) pairs.push([a, b]);
  for (let i = 0; i < 4; i++) pairs.push([groups[i][3], groups[(i + 1) % 4][0]]);
  assert.deepEqual(cluster({ ids, pairs }, 'spectral').groups, groups);
});

test('greedy optimizers stop only when no pair merge improves their objective', () => {
  let state = 17;
  const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (let sample = 0; sample < 30; sample++) {
    const input: AnalysisGraph = { ids: [...'abcdef'], pairs: [] };
    for (const a of input.ids) for (const b of input.ids) if (a !== b && random() < .25) input.pairs.push([a, b]);
    const { p, flux } = stationaryFlow(input);
    for (const method of ['undirected', 'directed', 'flow'] as const) {
      const { groups } = cluster(input, method);
      const score = (g: string[][]) => method === 'flow' ? -mapEquation(p, flux, g.map(group => group.map(id => input.ids.indexOf(id)))) : modularity(input, g, method === 'directed');
      const value = score(groups);
      assert.ok(value >= score(input.ids.map(id => [id])) - 1e-10);
      for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
        const merged = groups.filter((_, k) => k !== i && k !== j).concat([[...groups[i], ...groups[j]]]);
        assert.ok(score(merged) <= value + 1e-10, `${method} left an improving merge`);
      }
    }
    assert.ok(cluster(input, 'louvain').score!.value >= modularity(input, input.ids.map(id => [id])) - 1e-10);
  }
});

test('strong components agree with independent reachability on every three-node digraph', () => {
  const ids = [...'abc'], arcs = ids.flatMap(a => ids.filter(b => a !== b).map(b => [a, b] as [string, string]));
  for (let bits = 0; bits < 2 ** arcs.length; bits++) {
    const input = { ids, pairs: arcs.filter((_, i) => bits & (1 << i)) };
    const reach = ids.map(a => ids.map(b => a === b || input.pairs.some(([v, w]) => v === a && w === b)));
    for (let k = 0; k < ids.length; k++) for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) reach[i][j] ||= reach[i][k] && reach[k][j];
    const { groups } = cluster(input, 'scc');
    for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) assert.equal(groups.some(g => g.includes(ids[i]) && g.includes(ids[j])), reach[i][j] && reach[j][i]);
  }
});

test('one force step matches the analytical two-body attraction, repulsion and temperature cap', () => {
  const edge: AnalysisGraph = { ids: ['a', 'b'], pairs: [['a', 'b']] };
  for (const repulsion of [.2, 1, 3]) {
    const p = { seed: 42, iterations: 0, repulsion }, initial = solve(edge, 'force', p);
    const distance = (points: typeof initial) => Math.hypot(points.a.x - points.b.x, points.a.y - points.b.y);
    const r = distance(initial), k = Math.sqrt(490000 / 2), force = repulsion * k * k / r - r * r / k;
    const expected = Math.abs(r + 2 * Math.sign(force) * Math.min(Math.abs(force), 45));
    assert.ok(Math.abs(distance(solve(edge, 'force', { ...p, iterations: 1 })) - expected) < 1e-10);
  }
});
