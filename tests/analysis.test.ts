import test from 'node:test';
import assert from 'node:assert/strict';
import { cluster, modularity, stationaryFlow, mapEquation } from '../src/analysis/clustering.ts';
import { place, placementMetrics, ranks, solve, distances, stressValue } from '../src/analysis/layout.ts';
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

test('distance relaxation reduces stress; crossings exclude shared endpoints, contact and duplicate directions', () => {
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
