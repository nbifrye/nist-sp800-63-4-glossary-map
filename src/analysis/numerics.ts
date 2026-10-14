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
