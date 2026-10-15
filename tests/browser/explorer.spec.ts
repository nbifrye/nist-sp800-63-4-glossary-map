import { clusteringMethods, layoutMethods } from '../../src/analysis/methods.ts';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import type { Corpus } from '../../src/model.ts';
const data = JSON.parse(readFileSync(new URL('../../src/generated/corpus.json', import.meta.url), 'utf8')) as Corpus;
const selected = data.terms.find(term => term.heading === 'authentication')!;

test('read source-specific definitions, search without acronym aliases, follow evidence and restore history', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: '英語の見出しで検索' });
  await search.fill('authentication');
  await page.locator('.term-list button').filter({ hasText: /^authentication\d/ }).click();
  await expect(page.locator('.reader-detail h2')).toHaveText('authentication');
  await expect(page.locator('.definition-card')).toHaveCount(selected.definitions.length);
  await page.locator('.definition-card').first().getByText('英語原文を読む', { exact: true }).click();
  await expect(page.locator('.definition-card').first().locator('.english')).toContainText(selected.definitions[0].english.slice(0, 50));
  const next = page.locator('.definition-card').first().locator('.english button').first();
  await next.click();
  await expect(page.locator('.reader-detail h2')).not.toHaveText('authentication');
  await page.goBack();
  await expect(page.locator('.reader-detail h2')).toHaveText('authentication');
  if (await page.getByRole('button', { name: '← 用語一覧', exact: true }).isVisible()) await page.getByRole('button', { name: '← 用語一覧', exact: true }).click();
  await search.fill('MFA');
  await expect(page.locator('.term-list')).toContainText('該当する用語はありません');
});

test('switch independent methods, inspect comparisons, tune parameters and restore a shared URL', async ({ page }) => {
  await page.goto('/?view=graph');
  const graph = page.locator('#graph .glossary-explorer');
  await expect(graph).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.graph-canvas')).toHaveAttribute('data-nodes', String(data.terms.length));
  await page.getByLabel('グラフの配置', { exact: true }).selectOption('circle');
  await expect(graph).toHaveAttribute('data-layout', 'circle');
  await page.getByLabel('用語グループの検出', { exact: true }).selectOption('flow');
  await expect(graph).toHaveAttribute('data-clustering', 'flow');
  await expect(page.getByLabel('グラフの配置', { exact: true })).toHaveValue('circle');
  await page.getByLabel('用語を探す', { exact: true }).selectOption(selected.id);
  await expect(page.locator('#graph .inspector h2')).toHaveText(selected.heading);
  await page.getByRole('button', { name: '手法を比較', exact: true }).click();
  await expect(page.locator('#graph table')).toHaveCount(2);
  await expect(page.locator('#graph table').first().locator('tbody tr')).toHaveCount(clusteringMethods.length);
  await expect(page.locator('#graph table').nth(1).locator('tbody tr')).toHaveCount(layoutMethods.length);
  await page.getByText('表示設定・計算条件', { exact: true }).click();
  await page.getByLabel('横方向の間隔', { exact: true }).fill('1.5');
  await page.getByRole('button', { name: '再計算', exact: true }).click();
  await expect(page).toHaveURL(/settings=/);
  const url = page.url();
  await page.reload();
  await expect(graph).toHaveAttribute('data-ready', 'true');
  await expect(page.getByLabel('用語グループの検出', { exact: true })).toHaveValue('flow');
  await page.getByText('表示設定・計算条件', { exact: true }).click();
  await expect(page.getByLabel('横方向の間隔', { exact: true })).toHaveValue('1.5');
  expect(page.url()).toBe(url);
  await page.getByRole('button', { name: '配置を初期状態に戻す', exact: true }).click();
  await expect(page).not.toHaveURL(/settings=/);
});

test('scope graph and inspect every source occurrence through HTML alternatives', async ({ page }) => {
  await page.goto(`/?view=graph&term=${selected.id}`);
  await expect(page.locator('#graph .glossary-explorer')).toHaveAttribute('data-ready', 'true');
  await page.getByLabel('表示範囲', { exact: true }).selectOption('local');
  const neighbors = new Set([selected.id]);
  for (const term of data.terms) for (const definition of term.definitions) for (const ref of definition.references) {
    if (term.id === selected.id) neighbors.add(ref.target);
    if (ref.target === selected.id) neighbors.add(term.id);
  }
  await expect(page.locator('.graph-canvas')).toHaveAttribute('data-nodes', String(neighbors.size));
  const outgoing = selected.definitions.reduce((sum, definition) => sum + definition.references.length, 0);
  await page.getByText(`参照する用語 · ${outgoing} か所`, { exact: true }).click();
  await page.locator('#graph .evidence-list details summary').first().click();
  await expect(page.locator('#graph .evidence-list .quote').first()).toBeVisible();
  await page.getByRole('button', { name: '用語集で開く ↗', exact: true }).click();
  await expect(page.locator('.reader-detail h2')).toHaveText(selected.heading);
  await page.goBack();
  await expect(page.getByLabel('表示範囲', { exact: true })).toHaveValue('local');
});

test('keyboard zoom, pan and free placement update the graph without losing definitions', async ({ page }) => {
  await page.goto(`/?view=graph&term=${selected.id}&scope=local`);
  await expect(page.locator('#graph .glossary-explorer')).toHaveAttribute('data-ready', 'true');
  const canvas = page.locator('.graph-canvas');
  await canvas.focus();
  const before = await canvas.screenshot();
  await canvas.press('+'); await canvas.press('ArrowRight');
  const afterPan = await canvas.screenshot();
  expect(before.equals(afterPan)).toBe(false);
  await canvas.press('Shift+ArrowDown');
  const afterMove = await canvas.screenshot();
  expect(afterPan.equals(afterMove)).toBe(false);
  await expect(page.locator('#graph .inspector h2')).toHaveText(selected.heading);
  await canvas.press('0');
  await page.getByText('表示設定・計算条件', { exact: true }).click();
  await page.getByLabel('用語グループを調べる', { exact: true }).selectOption('0');
  await expect(page.locator('#graph .inspector h2')).toHaveText('用語グループ 1');
  await expect(page.locator('#graph .member-list li')).not.toHaveCount(0);
  await page.getByLabel('用語を探す', { exact: true }).selectOption(selected.id);
  await expect(page.locator('#graph .inspector h2')).toHaveText(selected.heading);
  await expect(page.getByLabel('用語グループを調べる', { exact: true })).toHaveValue('');
});

test('a standalone graph fits its containing viewport and exposes definition details', async ({ page }) => {
  await page.goto(`/embed.html?term=${selected.id}`);
  await expect(page.locator('.glossary-explorer')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.inspector h2')).toHaveText(selected.heading);
  await expect(page.getByRole('button', { name: 'グラフを操作する', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'サイトで開く ↗' })).toHaveAttribute('href', /view=graph/);
  const sizes = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, height: innerHeight, bottom: document.querySelector('.glossary-explorer')!.getBoundingClientRect().bottom }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width + 1);
  expect(sizes.bottom).toBeLessThanOrEqual(sizes.height + 1);
});

test('article bundle runs on another origin, shares no page state, and releases workers on destroy', async ({ page }) => {
  await page.goto('/widget/example.html');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  // CodePen-like host: external JS/CSS, isolated iframe, no access to the site app.
  await page.route('https://assets.example/**', route => route.fulfill({ contentType: route.request().url().endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(new URL(`../../dist-widget/${route.request().url().endsWith('.css') ? 'glossary-map.css' : 'glossary-map.js'}`, import.meta.url)) }));
  await page.route('https://article.example/host', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ja"><head><meta charset="utf-8"><link rel="stylesheet" href="https://assets.example/glossary-map.css"><style>body{margin:0}#map{height:100vh}</style></head><body><main id="map"></main><script src="https://assets.example/glossary-map.js"></script><script>window.demo=GlossaryMap.mount(document.getElementById('map'))</script></body></html>` }));
  await page.setContent(`<main><h1>Article</h1><iframe title="Graph" style="width:100%;height:760px;border:0" sandbox="allow-scripts allow-same-origin" src="https://article.example/host"></iframe></main>`);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.glossary-explorer')).toHaveAttribute('data-ready', 'true');
  await frame.getByLabel('用語を探す', { exact: true }).selectOption(selected.id);
  await expect(frame.locator('.inspector h2')).toHaveText(selected.heading);
  await frame.getByLabel('グラフの配置', { exact: true }).selectOption('force');
  await expect(frame.locator('.glossary-explorer')).toHaveAttribute('data-layout', 'force');
  await expect(page).toHaveURL(/\/widget\/example.html$/);
  const child = page.frames().find(frame => frame.url().includes('article.example'))!;
  await child.evaluate(() => { (window as unknown as { demo: { destroy(): void } }).demo.destroy(); });
  await expect(frame.locator('.glossary-explorer')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('all method combinations remain selectable with complete graph data', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Full method matrix is also covered by engine tests.');
  test.setTimeout(120000);
  await page.goto('/?view=graph');
  const graph = page.locator('#graph .glossary-explorer');
  await expect(graph).toHaveAttribute('data-ready', 'true');
  for (const { id: clustering } of clusteringMethods) {
    await page.getByLabel('用語グループの検出', { exact: true }).selectOption(clustering);
    for (const { id: layout } of layoutMethods) {
      await page.getByLabel('グラフの配置', { exact: true }).selectOption(layout);
      await expect(graph).toHaveAttribute('data-clustering', clustering);
      await expect(graph).toHaveAttribute('data-layout', layout);
      await expect(page.locator('.graph-canvas')).toHaveAttribute('data-nodes', String(data.terms.length));
    }
  }
});

test('article readers can scroll over an inactive graph and opt into touch interaction', async ({ browser, browserName, baseURL }) => {
  test.skip(browserName !== 'chromium', 'Native touch injection uses the Chromium protocol.');
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto('/widget/example.html');
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><h1>Article</h1><iframe title="Graph" src="/embed.html" style="width:100%;height:650px;border:0"></iframe><p style="height:1200px">Article continues</p>');
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('.glossary-explorer')).toHaveAttribute('data-ready', 'true');
    const cdp = await context.newCDPSession(page);
    const canvas = frame.locator('.graph-canvas');
    const swipe = async () => {
      const box = (await canvas.boundingBox())!;
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      // synthesizeScrollGesture omits touchmove on Linux Chromium. Send the
      // actual touch sequence so both native scrolling and graph handlers run.
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 10; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 15 }] });
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await swipe();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(50);
    await page.evaluate(() => scrollTo(0, 0));
    await frame.getByRole('button', { name: 'グラフを操作する', exact: true }).click();
    const before = await canvas.screenshot();
    const start = await page.evaluate(() => scrollY);
    await swipe();
    expect(await page.evaluate(() => scrollY)).toBeCloseTo(start, 0);
    expect(before.equals(await canvas.screenshot())).toBe(false);
    await frame.getByRole('button', { name: 'ページをスクロールする', exact: true }).click();
    await swipe();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(start + 50);
  } finally { await context.close(); }
});

test('narrow containers and desktop views keep controls, graph and details reachable', async ({ page }, info) => {
  for (const width of [320, 760, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/embed.html?term=${selected.id}`);
    await expect(page.locator('.glossary-explorer')).toHaveAttribute('data-ready', 'true');
    const bounds = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth, canvas: document.querySelector('.graph-canvas')!.getBoundingClientRect().height, detail: document.querySelector('.inspector-body')!.getBoundingClientRect().height }));
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
    expect(bounds.canvas).toBeGreaterThan(100);
    expect(bounds.detail).toBeGreaterThan(60);
    if (info.project.name === 'chromium') await page.screenshot({ path: info.outputPath(`embed-${width}.png`) });
  }
});

test('data and graph loading failures are visible and leave the reader usable', async ({ page }) => {
  await page.route('**/index.html*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace("worker-src 'self' blob:", "worker-src 'none'") });
  });
  await page.goto('/index.html?view=graph');
  await expect(page.getByRole('alert')).toContainText('計算を開始できません');
  await page.getByRole('link', { name: '用語集', exact: true }).click();
  await expect(page.getByRole('searchbox')).toBeVisible();
});

test('reader, graph and article embed pass automated accessibility checks', async ({ page }) => {
  for (const path of [`/?term=${selected.id}`, `/?view=graph&term=${selected.id}`, '/embed.html']) {
    await page.goto(path);
    if (path.includes('graph') || path.includes('embed')) await expect(page.locator('.glossary-explorer[data-ready]')).toBeVisible();
    else await expect(page.locator('.definition-card').first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => node.target) }))).toEqual([]);
  }
});
