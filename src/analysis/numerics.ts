// Factor a symmetric positive definite matrix once, then solve many right-hand sides.
export function choleskySolver(matrix: number[][]): (rhs: number[]) => number[] {
  const n = matrix.length, lower = matrix.map(() => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let value = matrix[i][j];
    for (let k = 0; k < j; k++) value -= lower[i][k] * lower[j][k];
    if (i === j) {
      if (!(value > 0)) throw Error('正定値行列が必要です。');
      lower[i][j] = Math.sqrt(value);
    } else lower[i][j] = value / lower[j][j];
  }
  return rhs => {
    const x = [...rhs];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < i; j++) x[i] -= lower[i][j] * x[j];
      x[i] /= lower[i][i];
    }
    for (let i = n - 1; i >= 0; i--) {
      for (let j = i + 1; j < n; j++) x[i] -= lower[j][i] * x[j];
      x[i] /= lower[i][i];
    }
    return x;
  };
}

export interface Eigenpair { value: number; vector: number[] }
// Cyclic Jacobi rotations for real symmetric matrices. Eigenvalues are algebraically
// ordered (not by magnitude); a large negative eigenvalue must not win a Q split.
export function symmetricEigen(matrix: number[][]): Eigenpair[] {
  const n = matrix.length;
  if (!n) return [];
  if (matrix.some(row => row.length !== n) || matrix.some((row, i) => row.some((v, j) => !Number.isFinite(v) || v !== matrix[j][i]))) throw Error('有限な対称行列が必要です。');
  const a = matrix.map(row => Float64Array.from(row));
  const vectors = matrix.map((_, i) => Float64Array.from({ length: n }, (_, j) => Number(i === j)));
  const norm = Math.sqrt(matrix.reduce((sum, row) => sum + row.reduce((s, v) => s + v * v, 0), 0));
  const tolerance = 1e-12 * Math.max(1, norm);
  for (let sweep = 0; ; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += 2 * a[i][j] ** 2;
    if (Math.sqrt(off) <= tolerance) break;
    if (sweep === 80) throw Error('固有値計算が収束しませんでした。');
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = a[p][q];
      if (Math.abs(apq) <= tolerance / n) continue;
      const tau = (a[q][q] - a[p][p]) / (2 * apq);
      const t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.hypot(1, tau));
      const c = 1 / Math.hypot(1, t), s = t * c;
      a[p][p] -= t * apq; a[q][q] += t * apq; a[p][q] = a[q][p] = 0;
      for (let k = 0; k < n; k++) {
        if (k !== p && k !== q) {
          const kp = a[k][p], kq = a[k][q];
          a[k][p] = a[p][k] = c * kp - s * kq;
          a[k][q] = a[q][k] = s * kp + c * kq;
        }
        const vp = vectors[k][p], vq = vectors[k][q];
        vectors[k][p] = c * vp - s * vq; vectors[k][q] = s * vp + c * vq;
      }
    }
  }
  return Array.from({ length: n }, (_, i) => {
    const vector = vectors.map(row => row[i]);
    const pivot = vector.reduce((best, value, j) => Math.abs(value) > Math.abs(vector[best]) ? j : best, 0);
    if (vector[pivot] < 0) for (let j = 0; j < n; j++) vector[j] *= -1;
    return { value: a[i][i], vector };
  }).sort((a, b) => a.value - b.value);
}
