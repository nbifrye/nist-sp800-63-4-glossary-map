import type { AnalysisGraph } from '../model.ts';
import { adjacency, components } from './graph.ts';
import { symmetricEigen } from './numerics.ts';

// Newman (2006), B^(g)_ij = B_ij - delta_ij sum_{k in g} B_ik.
// Keep the original graph's degrees and 2m even when recursively splitting a group.
export function spectralGroups(graph: AnalysisGraph): string[][] {
  const neighbors = adjacency(graph), degree = new Map(graph.ids.map(id => [id, neighbors.get(id)!.size]));
  const m2 = [...degree.values()].reduce((a, b) => a + b, 0);
  function divide(ids: string[]): string[][] {
    if (ids.length < 2 || !m2) return [ids];
    const matrix = ids.map(a => ids.map(b => Number(neighbors.get(a)!.has(b)) - degree.get(a)! * degree.get(b)! / m2));
    for (let i = 0; i < ids.length; i++) matrix[i][i] -= matrix[i].reduce((a, b) => a + b, 0);
    const leading = symmetricEigen(matrix).at(-1)!;
    if (leading.value <= 1e-10) return [ids];
    const signs = leading.vector.map(value => value >= 0 ? 1 : -1);
    const left = ids.filter((_, i) => signs[i] > 0), right = ids.filter((_, i) => signs[i] < 0);
    const gain = matrix.reduce((sum, row, i) => sum + row.reduce((s, b, j) => s + signs[i] * b * signs[j], 0), 0) / (2 * m2);
    if (!left.length || !right.length || gain <= 1e-12) return [ids];
    return [...divide(left), ...divide(right)];
  }
  // Disconnected components can be separated without reducing Q; isolates remain singletons.
  return components(graph).flatMap(divide);
}

// Hall's quadratic placement: minimize tr(X^T L X), X^T X = I, X^T 1 = 0.
// Return the raw orthonormal embedding so tests can verify the variational problem.
export function spectralEmbedding(graph: AnalysisGraph): Record<string, { x: number; y: number }> {
  const { ids } = graph, neighbors = adjacency(graph);
  if (ids.length < 2) return Object.fromEntries(ids.map(id => [id, { x: 0, y: 0 }]));
  if (components(graph).length !== 1) throw Error('スペクトル配置は連結成分ごとに計算してください。');
  const laplacian = ids.map((a, i) => ids.map((b, j) => i === j ? neighbors.get(a)!.size : -Number(neighbors.get(a)!.has(b))));
  const eigen = symmetricEigen(laplacian);
  return Object.fromEntries(ids.map((id, i) => [id, { x: eigen[1].vector[i], y: eigen[2]?.vector[i] ?? 0 }]));
}

export function spectralCoordinates(graph: AnalysisGraph): Record<string, { x: number; y: number }> {
  const raw = spectralEmbedding(graph), scale = 180 * Math.sqrt(graph.ids.length);
  const placed: { x: number; y: number }[] = [];
  return Object.fromEntries(graph.ids.map(id => {
    const origin = { x: raw[id].x * scale, y: raw[id].y * scale };
    let point = origin;
    // Repeated eigenvalues and graph symmetries may project distinct vertices onto
    // the same point. This deterministic display adjustment is not spectral optimization.
    for (let attempt = 1; placed.some(p => Math.hypot(p.x - point.x, p.y - point.y) < 42); attempt++) {
      const angle = attempt * Math.PI * (3 - Math.sqrt(5)), radius = 42 * Math.sqrt(attempt);
      point = { x: origin.x + radius * Math.cos(angle), y: origin.y + radius * Math.sin(angle) };
    }
    placed.push(point);
    return [id, point];
  }));
}
