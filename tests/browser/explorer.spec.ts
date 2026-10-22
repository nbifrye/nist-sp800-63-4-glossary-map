import { clusteringMethods, layoutMethods, parameters } from '../../src/analysis/methods.ts';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { aggregateEdges, analysisGraph, type Corpus } from '../../src/model.ts';
import { cluster } from '../../src/analysis/clustering.ts';
import { place, type Positions } from '../../src/analysis/layout.ts';
import type { AnalysisRequest, AnalysisResponse } from '../../src/analysis/worker.ts';
import type { Core } from 'cytoscape';
const data = JSON.parse(readFileSync(new URL('../../src/generated/corpus.json', import.meta.url), 'utf8')) as Corpus;
const selected = data.terms.find(term => term.heading === 'authentication')!;

async function settings(page: import('@playwright/test').Page | import('@playwright/test').FrameLocator) {
  const panel = page.locator('.settings');
  if (await panel.getAttribute('open') === null) await panel.locator(':scope > summary').click();
}
async function choose(page: import('@playwright/test').Page | import('@playwright/test').FrameLocator) {
  await page.getByRole('searchbox', { name: '英語の見出しで検索' }).fill(selected.heading);
  await page.locator('.term-list button').filter({ hasText: /^authentication\d/ }).click();
}

async function observeAnalysis(page: import('@playwright/test').Page) {
  // Observe real Worker traffic without replacing its calculations.
  await page.addInitScript(() => {
    const requests: AnalysisRequest[] = [], responses: AnalysisResponse[] = [];
    Object.assign(window, { analysisTraffic: { requests, responses } });
    window.Worker = class extends Worker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', event => responses.push(event.data));
      }
      override postMessage(message: AnalysisRequest) { requests.push(message); super.postMessage(message); }
    };
  });
  return () => page.evaluate(() => (window as unknown as { analysisTraffic: { requests: AnalysisRequest[]; responses: AnalysisResponse[] } }).analysisTraffic);
}
function checkPositions(actual: Positions, expected: Positions) {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const id of Object.keys(expected)) {
    expect(actual[id].x).toBeCloseTo(expected[id].x, 8);
    expect(actual[id].y).toBeCloseTo(expected[id].y, 8);
  }
}
async function renderedPositions(page: import('@playwright/test').Page): Promise<Positions> {
  return page.locator('.graph-canvas').evaluate(host => {
    const cy = (host as HTMLElement & { _cyreg: { cy: Core } })._cyreg.cy;
    return Object.fromEntries(cy.nodes().map(node => [node.id(), { ...node.position() }]));
  });
}
function localGraph(id: string, source = '') {
  const graph = analysisGraph(data, { source }), members = new Set([id]);
  for (const [a, b] of graph.pairs) if (a === id || b === id) { members.add(a); members.add(b); }
  return { ids: graph.ids.filter(id => members.has(id)), pairs: graph.pairs.filter(([a, b]) => members.has(a) && members.has(b)) };
}

test('search the graph, read source-specific definitions, search without acronym aliases, follow evidence and restore history', async ({ page }, info) => {
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: '英語の見出しで検索' });
  await search.fill('authentication');
  const result = page.locator('.term-list button').filter({ hasText: /^authentication\d/ });
  if (info.project.name === 'mobile') await result.tap(); else await result.click();
  await expect(page.locator('#graph .inspector h2')).toHaveText('authentication');
  await expect(page.locator('.definition-card')).toHaveCount(selected.definitions.length);
  await page.locator('.definition-card').first().getByText('英語原文を読む', { exact: true }).click();
  await expect(page.locator('.definition-card').first().locator('.english')).toContainText(selected.definitions[0].english.slice(0, 50));
  const next = page.locator('.definition-card').first().locator('.english button').first();
  await next.click();
  await expect(page.locator('#graph .inspector h2')).not.toHaveText('authentication');
  await page.goBack();
  await expect(page.locator('#graph .inspector h2')).toHaveText('authentication');
  await search.fill('MFA');
  await expect(page.locator('.search-results')).toContainText('該当する用語はありません');
});

test('switch independent methods, inspect comparisons, tune parameters and restore a shared URL', async ({ page }) => {
  await page.goto('/?view=graph');
  const graph = page.locator('#graph .glossary-explorer');
  await expect(graph).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.graph-canvas')).toHaveAttribute('data-nodes', String(data.terms.length));
  await settings(page);
  await page.getByLabel('グラフの配置', { exact: true }).selectOption('circle');
  await expect(graph).toHaveAttribute('data-layout', 'circle');
  await page.getByLabel('用語の分類方法', { exact: true }).selectOption('flow');
  await expect(graph).toHaveAttribute('data-clustering', 'flow');
  await expect(page.getByLabel('グラフの配置', { exact: true })).toHaveValue('circle');
  await choose(page);
  await expect(page.locator('#graph .inspector h2')).toHaveText(selected.heading);
  await settings(page);
  await page.getByRole('button', { name: '手法を比較', exact: true }).click();
  await expect(page.locator('#graph table')).toHaveCount(2);
  await expect(page.locator('#graph table').first().locator('tbody tr')).toHaveCount(clusteringMethods.length);
  await expect(page.locator('#graph table').nth(1).locator('tbody tr')).toHaveCount(layoutMethods.length);
  await settings(page);
  await page.getByText('計算条件', { exact: true }).click();
  await page.getByLabel('横方向の間隔', { exact: true }).fill('1.5');
  await page.getByRole('button', { name: '再計算', exact: true }).click();
  await expect(page).toHaveURL(/settings=/);
  const url = page.url();
  await page.reload();
  await expect(graph).toHaveAttribute('data-ready', 'true');
  await expect(page.getByLabel('用語の分類方法', { exact: true })).toHaveValue('flow');
  await settings(page);
  await page.getByText('計算条件', { exact: true }).click();
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
  await page.getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  await expect(page.locator('#graph .inspector')).toBeHidden();
  await expect(page.getByLabel('表示範囲', { exact: true })).toHaveValue('all');
  await page.goBack();
  await expect(page.locator('#graph .inspector h2')).toHaveText(selected.heading);
  await expect(page.getByLabel('表示範囲', { exact: true })).toHaveValue('local');
});

test('source filters recalculate analysis, comparison and shared URLs', async ({ page }) => {
  const traffic = await observeAnalysis(page);
  const source = page.getByLabel('出典で絞る', { exact: true });
  const check = async (source: string) => {
    await expect.poll(async () => {
      const { requests, responses } = await traffic();
      return responses.at(-1)?.id === requests.at(-1)?.id;
    }).toBe(true);
    await expect(page.locator('.graph-status')).toContainText('参照関係');
    const { requests, responses } = await traffic(), request = requests.at(-1)!, response = responses.at(-1)!;
    const graph = analysisGraph(data, { source }), partition = cluster(graph, 'scc');
    expect(request.graph).toEqual(graph);
    expect(response.partition).toEqual(partition);
    checkPositions(response.layout!.positions, place(graph, 'condensation', partition).positions);
    await expect(page.locator('.graph-canvas')).toHaveAttribute('data-edges', String(aggregateEdges(data, { source }).length));
    await expect(page.getByLabel('用語グループを調べる', { exact: true }).locator('option')).toHaveText(['すべてのグループ', ...partition.groups.map((group, i) => `グループ ${i + 1}（${group.length}語）`)]);
  };
  await page.goto('/?cluster=scc&layout=condensation&source=sp800-63a');
  await expect(page.locator('.glossary-explorer')).toHaveAttribute('data-ready', 'true');
  await check('sp800-63a');
  await settings(page);
  await source.selectOption('sp800-63b'); await check('sp800-63b');
  await page.getByRole('button', { name: '手法を比較', exact: true }).click();
  await expect(page.locator('.inspector h2')).toHaveText('手法を比較');
  const { requests, responses } = await traffic();
  expect(requests.at(-1)?.graph).toEqual(analysisGraph(data, { source: 'sp800-63b' }));
  const comparison = responses.at(-1)!.comparison!;
  await expect(page.locator('.inspector table').first().locator('tbody tr')).toHaveCount(clusteringMethods.length);
  expect(comparison.partitions.find(partition => partition.method === 'scc')).toEqual(cluster(requests.at(-1)!.graph, 'scc'));
  checkPositions(comparison.layouts.find(layout => layout.method === 'condensation')!.positions, place(requests.at(-1)!.graph, 'condensation', comparison.partitions.find(partition => partition.method === 'scc')!).positions);
  // Compare displayed metrics with the browser's own results: nearly collinear
  // crossings can differ between JavaScript engines through floating-point rounding.
  for (const [index, layout] of comparison.layouts.entries()) {
    await expect(page.locator('.inspector table').nth(1).locator('tbody tr').nth(index).locator('td')).toHaveText([
      String(layout.metrics.crossings), layout.metrics.normalizedLength.toFixed(3), layout.metrics.lengthCV.toFixed(3),
    ]);
  }
  await settings(page);
  await source.selectOption(''); await check('');
  await expect(page.locator('.inspector')).toBeHidden();
  // Selecting a term creates a history entry; filter changes replace that entry.
  await choose(page); await settings(page);
  await source.selectOption('sp800-63c'); await check('sp800-63c');
  await page.goBack(); await check('');
  await page.reload();
  await expect(page.locator('.glossary-explorer')).toHaveAttribute('data-ready', 'true');
  await check('');
  await settings(page);
  await source.selectOption('sp800-63a'); await source.selectOption('sp800-63b'); await source.selectOption('sp800-63c');
  await check('sp800-63c');
});

test('local scope renders every selected layout and uses its parameters and comparison graph', async ({ page }) => {
  const traffic = await observeAnalysis(page), graph = localGraph(selected.id);
  await page.goto(`/?term=${selected.id}&scope=local&cluster=scc&layout=grouped`);
  await expect(page.locator('.glossary-explorer')).toHaveAttribute('data-ready', 'true');
  const check = async (method: AnalysisRequest['layout'], values = {}) => {
    await expect(page.locator('.glossary-explorer')).toHaveAttribute('data-layout', method);
    await expect(page.locator('.graph-status')).toContainText('周辺表示');
    const { requests, responses } = await traffic(), request = requests.at(-1)!, response = responses.at(-1)!;
    expect(request.graph).toEqual(graph);
    expect(request.layout).toBe(method);
    expect(request.values).toEqual(values);
    expect(response.id).toBe(request.id);
    const partition = cluster(graph, 'scc');
    expect(response.partition).toEqual(partition);
    expect(response.layout!.method).toBe(method);
    expect(response.layout!.settings).toEqual(parameters(layoutMethods.find(entry => entry.id === method)!, values));
    expect(Object.keys(response.layout!.positions).sort()).toEqual(graph.ids);
    // Iterative solvers can converge differently across JavaScript engines.
    if (!['force', 'stress', 'spectral'].includes(method)) checkPositions(response.layout!.positions, place(graph, method, partition, values).positions);
    // Check the actual canvas coordinates too, so a fixed local layout cannot override the result.
    checkPositions(await renderedPositions(page), response.layout!.positions);
  };
  await settings(page);
  for (const { id } of layoutMethods) {
    await page.getByLabel('グラフの配置', { exact: true }).selectOption(id);
    await check(id);
  }
  await page.getByLabel('グラフの配置', { exact: true }).selectOption('force'); await check('force');
  await page.getByText('計算条件', { exact: true }).click();
  await page.getByLabel('反復回数', { exact: true }).fill('20');
  await page.getByLabel('反発の強さ', { exact: true }).fill('2');
  await page.getByLabel('乱数シード', { exact: true }).fill('7');
  await page.getByRole('button', { name: '再計算', exact: true }).click();
  await check('force', { iterations: 20, repulsion: 2, seed: 7 });
  await page.reload();
  await expect(page.locator('.glossary-explorer')).toHaveAttribute('data-ready', 'true');
  await check('force', { iterations: 20, repulsion: 2, seed: 7 });
  await settings(page);
  await page.getByText('計算条件', { exact: true }).click();
  await page.getByRole('button', { name: '配置を初期状態に戻す', exact: true }).click();
  await check('force');
  await page.getByRole('button', { name: '手法を比較', exact: true }).click();
  await expect(page.locator('.inspector h2')).toHaveText('手法を比較');
  const { requests, responses } = await traffic(), comparison = responses.at(-1)!.comparison!;
  expect(requests.at(-1)!.graph).toEqual(graph);
  expect(comparison.partitions.find(p => p.method === 'scc')).toEqual(cluster(graph, 'scc'));
  for (const [index, layout] of comparison.layouts.entries()) {
    expect(Object.keys(layout.positions).sort()).toEqual(graph.ids);
    await expect(page.locator('.inspector table').nth(1).locator('tbody tr').nth(index).locator('td')).toHaveText([
      String(layout.metrics.crossings), layout.metrics.normalizedLength.toFixed(3), layout.metrics.lengthCV.toFixed(3),
    ]);
  }
});

test('scope and term changes recalculate the graph while preserving separate manual positions', async ({ page }) => {
  const traffic = await observeAnalysis(page);
  const check = async (graph: AnalysisRequest['graph']) => {
    await expect.poll(async () => (await traffic()).requests.at(-1)?.graph).toEqual(graph);
    await expect(page.locator('.graph-status')).toContainText('参照関係');
    const { requests, responses } = await traffic();
    expect(requests.at(-1)!.graph).toEqual(graph);
    expect(responses.at(-1)!.id).toBe(requests.at(-1)!.id);
    await expect(page.locator('.graph-canvas')).toHaveAttribute('data-nodes', String(graph.ids.length));
    return responses.at(-1)!.layout!.positions;
  };
  await page.goto(`/?term=${selected.id}&layout=circle`);
  await expect(page.locator('.glossary-explorer')).toHaveAttribute('data-ready', 'true');
  const all = await check(analysisGraph(data));
  const scope = page.getByLabel('表示範囲', { exact: true });
  await scope.selectOption('local');
  const local = await check(localGraph(selected.id));
  checkPositions(await renderedPositions(page), local);
  await page.locator('.graph-canvas').focus(); await page.locator('.graph-canvas').press('Shift+ArrowDown');
  const moved = await renderedPositions(page);
  expect(moved[selected.id].y).toBeGreaterThan(local[selected.id].y);
  // Pick a term outside this neighborhood to ensure scope expansion starts from the full corpus.
  const next = data.terms.find(term => !Object.hasOwn(local, term.id))!;
  await page.getByRole('searchbox', { name: '英語の見出しで検索' }).fill(next.heading);
  await page.locator('.term-list').getByRole('button', { name: `${next.heading} ${next.definitions.length}文書`, exact: true }).click();
  const nextPositions = await check(localGraph(next.id));
  checkPositions(await renderedPositions(page), nextPositions);
  await page.goBack(); await check(localGraph(selected.id));
  checkPositions(await renderedPositions(page), moved);
  await scope.selectOption('all'); await check(analysisGraph(data));
  checkPositions(await renderedPositions(page), all);
  await scope.selectOption('local'); await check(localGraph(selected.id));
  checkPositions(await renderedPositions(page), moved);
  await settings(page);
  await page.getByLabel('出典で絞る', { exact: true }).selectOption('sp800-63a');
  const filtered = await check(localGraph(selected.id, 'sp800-63a'));
  checkPositions(await renderedPositions(page), filtered);
  const isolated = data.terms.find(term => localGraph(term.id, 'sp800-63a').ids.length === 1)!;
  await page.goto(`/?term=${isolated.id}&scope=local&layout=stress&source=sp800-63a`);
  await expect(page.locator('.glossary-explorer')).toHaveAttribute('data-ready', 'true');
  const singleton = await check(localGraph(isolated.id, 'sp800-63a'));
  checkPositions(await renderedPositions(page), singleton);
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
  await settings(page);
  await page.getByLabel('用語グループを調べる', { exact: true }).selectOption('0');
  await expect(page.locator('#graph .inspector h2')).toHaveText('用語グループ 1');
  await expect(page.locator('#graph .member-list li')).not.toHaveCount(0);
  await choose(page);
  await expect(page.locator('#graph .inspector h2')).toHaveText(selected.heading);
  await expect(page.getByLabel('用語グループを調べる', { exact: true })).toHaveValue('');
});

test('a standalone graph fits its containing viewport and exposes definition details', async ({ page }) => {
  await page.goto(`/embed.html?term=${selected.id}`);
  await expect(page.locator('.glossary-explorer')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.inspector h2')).toHaveText(selected.heading);
  await expect(page.getByRole('button', { name: 'グラフを操作する', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '通常サイトで開く ↗' })).toHaveAttribute('href', /term=/);
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
  await choose(frame);
  await expect(frame.locator('.inspector h2')).toHaveText(selected.heading);
  await settings(frame);
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
  await settings(page);
  for (const { id: clustering } of clusteringMethods) {
    await page.getByLabel('用語の分類方法', { exact: true }).selectOption(clustering);
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
    // The first native swipe can still have momentum after the click scrolls
    // the now bottom-aligned toolbar into view. Measure only after it settles.
    await page.evaluate(async () => {
      let previous = scrollY, stable = 0;
      for (let frame = 0; frame < 120 && stable < 8; frame++) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        stable = scrollY === previous ? stable + 1 : 0; previous = scrollY;
      }
    });
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

test('graph loading failures are visible and leave search and definitions usable', async ({ page }) => {
  await page.route('**/index.html*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace("worker-src 'self' blob:", "worker-src 'none'") });
  });
  await page.goto('/index.html?view=graph');
  await expect(page.getByRole('alert')).toContainText('計算を開始できません');
  await choose(page);
  await expect(page.locator('.inspector h2')).toHaveText(selected.heading);
  await expect(page.locator('.definition-card')).toHaveCount(selected.definitions.length);
});

test('graph, search, settings and article embed pass automated accessibility checks', async ({ page }) => {
  for (const path of [`/?term=${selected.id}`, `/?view=graph&term=${selected.id}`, '/embed.html']) {
    await page.goto(path);
    if (path.includes('graph') || path.includes('embed')) await expect(page.locator('.glossary-explorer[data-ready]')).toBeVisible();
    else await expect(page.locator('.definition-card').first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => node.target) }))).toEqual([]);
  }
});

test('graph owns the initial viewport and the catalogue works with a keyboard', async ({ page }, info) => {
  for (const width of [320, 760, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('.glossary-explorer')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.inspector')).toBeHidden();
    await expect(page.locator('#reader, #about, [data-view]')).toHaveCount(0);
    const bounds = await page.locator('.graph-canvas').boundingBox();
    expect(bounds!.height).toBeGreaterThan(680);
    expect(bounds!.width).toBeGreaterThanOrEqual(width - 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (info.project.name === 'chromium') await page.screenshot({ path: info.outputPath(`graph-${width}.png`) });
    const search = page.getByRole('searchbox');
    await search.fill('authentication'); await search.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('.inspector h2')).toHaveText(selected.heading);
    await expect(page.locator('.search-results')).toBeHidden();
    await page.getByRole('button', { name: '詳細を閉じる' }).click();
    await expect(page.locator('.graph-canvas')).toBeFocused();
    await expect(page.locator('.inspector')).toBeHidden();
    await search.fill('zzzzzz'); await search.press('Escape');
    await expect(page.locator('.search-results')).toBeHidden();
    await settings(page); await page.keyboard.press('Escape');
    await expect(page.locator('.settings-panel')).toBeHidden();
  }
});

test('search and settings panels pass accessibility checks while open', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.glossary-explorer')).toHaveAttribute('data-ready', 'true');
  for (const panel of ['search', 'settings']) {
    if (panel === 'search') await page.getByRole('searchbox').fill('identity');
    else await settings(page);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
  }
});
