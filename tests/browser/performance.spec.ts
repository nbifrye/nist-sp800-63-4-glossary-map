import { test, expect } from '@playwright/test';
test.use({ trace: 'off' });
test('full graph responds to continuous zoom within the rendering budget', async ({ page }) => {
  await page.goto('/?view=graph');
  await expect(page.locator('#graph .glossary-explorer')).toHaveAttribute('data-ready', 'true', { timeout: 5000 });
  const timings = await page.locator('.graph-canvas').evaluate(async canvas => {
    const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const measurements: number[] = [];
    for (let i = 0; i < 12; i++) {
      const start = performance.now();
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: i % 2 ? '-' : '+', bubbles: true }));
      await frame(); await frame(); measurements.push(performance.now() - start);
    }
    return measurements;
  });
  const sorted = [...timings].sort((a, b) => a - b);
  const index = .95 * (sorted.length - 1), lower = Math.floor(index);
  const p95 = sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
  expect(timings.reduce((a, b) => a + b, 0)).toBeLessThan(1500);
  expect(p95, `Zoom response times (ms): ${JSON.stringify(timings)}`).toBeLessThan(100);
  expect(Math.max(...timings)).toBeLessThan(250);
});
