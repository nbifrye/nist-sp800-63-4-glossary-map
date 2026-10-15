import test from 'node:test';
import assert from 'node:assert/strict';
import { choleskySolver, symmetricEigen } from '../src/analysis/numerics.ts';
import { spectralEmbedding } from '../src/analysis/spectral.ts';
import { adjacency } from '../src/analysis/graph.ts';

const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);
test('Cholesky solutions satisfy the original linear system for multiple right-hand sides', () => {
  const matrix = [[4, -1, -1], [-1, 3, -1], [-1, -1, 2]], solve = choleskySolver(matrix);
  for (const rhs of [[1, 2, 3], [-4, 0, 7]]) {
    const x = solve(rhs);
    matrix.forEach((row, i) => assert.ok(Math.abs(dot(row, x) - rhs[i]) < 1e-12));
  }
  assert.throws(() => choleskySolver([[1, 1], [1, 1]]), /正定値/);
});

test('Jacobi eigenpairs have small residuals and orthonormal vectors, including repeated and negative eigenvalues', () => {
  const dense = Array.from({ length: 20 }, (_, i) => Array.from({ length: 20 }, (_, j) => Math.sin((i + 1) * (j + 1))));
  for (const matrix of [[], [[3]], [[-100, 0, 0], [0, 2, 1], [0, 1, 2]], [[2, -1, -1], [-1, 2, -1], [-1, -1, 2]], dense]) {
    const snapshot = structuredClone(matrix), eigen = symmetricEigen(matrix);
    for (const { value, vector } of eigen) {
      const residual = Math.hypot(...matrix.map((row, i) => dot(row, vector) - value * vector[i]));
      assert.ok(residual < 1e-9, `residual ${residual}`);
    }
    eigen.forEach((a, i) => eigen.forEach((b, j) => assert.ok(Math.abs(dot(a.vector, b.vector) - Number(i === j)) < 1e-10)));
    assert.deepEqual(matrix, snapshot);
    assert.deepEqual(symmetricEigen(matrix), eigen);
  }
  assert.ok(Math.abs(symmetricEigen([[-100, 0, 0], [0, 2, 1], [0, 1, 2]]).at(-1)!.value - 3) < 1e-12);
  assert.throws(() => symmetricEigen([[0, 1], [0, 0]]), /対称/);
});

test('raw spectral layout attains the known quadratic minimum on a four-cycle', () => {
  const graph = { ids: [...'abcd'], pairs: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']] as [string, string][] };
  const positions = spectralEmbedding(graph), neighbors = adjacency(graph);
  const x = graph.ids.map(id => positions[id].x), y = graph.ids.map(id => positions[id].y);
  assert.ok(Math.abs(x.reduce((a, b) => a + b, 0)) < 1e-10);
  assert.ok(Math.abs(y.reduce((a, b) => a + b, 0)) < 1e-10);
  assert.ok(Math.abs(dot(x, x) - 1) < 1e-10 && Math.abs(dot(y, y) - 1) < 1e-10 && Math.abs(dot(x, y)) < 1e-10);
  let energy = 0;
  for (const a of graph.ids) for (const b of neighbors.get(a)!) energy += (positions[a].x - positions[b].x) ** 2 + (positions[a].y - positions[b].y) ** 2;
  assert.ok(Math.abs(energy / 2 - 4) < 1e-10); // lambda_2 + lambda_3 = 2 + 2.
});
