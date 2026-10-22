import AnalysisWorker from '../analysis/worker.ts?worker&inline';
import { analysisGraph, aggregateEdges, scopeGraph, validateCorpus, type Corpus } from '../model.ts';
import type { AnalysisResponse, AnalysisRequest } from '../analysis/worker.ts';
import type { Partition } from '../analysis/clustering.ts';
import type { LayoutResult, Positions } from '../analysis/layout.ts';
import { createRenderer } from './renderer.ts';
import { createControls } from './controls.ts';
import { createInspector } from './inspector.ts';
import { defaultState, normalizeState, type ExplorerState } from './state.ts';
import { button, el } from '../ui.ts';
import './explorer.css';
export { type ExplorerState, defaultState } from './state.ts';
export interface ExplorerOptions {
  data: Corpus;
  initialState?: Partial<ExplorerState>;
  onStateChange?: (state: ExplorerState) => void;
  onRead?: (id: string) => void;
  embedded?: boolean;
}

export function mountExplorer(container: HTMLElement, options: ExplorerOptions) {
  const data = validateCorpus(options.data);
  let state = normalizeState(data, options.initialState), partition: Partition | null = null, layout: LayoutResult | null = null;
  let graph = analysisGraph(data, state);
  let destroyed = false, sequence = 0, currentRequest = 0, comparisonRequest = 0, activeGroup: number | null = null, needsFit = true;
  let currentKey = '', firstRender = true, analysisPending = false;
  const manual = new Map<string, Positions>();
  const root = el('section', '', 'glossary-explorer'); root.setAttribute('aria-label', '用語の関係グラフ');
  root.setAttribute('aria-busy', 'true');
  if (options.embedded) root.classList.add('embedded');
  const tools = el('div'), workspace = el('div', '', 'explorer-workspace'), graphColumn = el('div', '', 'graph-column');
  const toolbar = el('div', '', 'graph-toolbar'), canvas = el('div', '', 'graph-canvas'), detail = el('aside');
  const status = el('p', '初期配置を計算しています…', 'graph-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  let resolveReady: () => void, rejectReady: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // Callers may choose to handle startup through the inline error and retry UI.
  void ready.catch(() => {});
  const inspector = createInspector(detail, data, id => updateState({ selectedTerm: id }), options.onRead, () => {
    detail.hidden = true; activeGroup = null; comparisonRequest = 0; controls.busy(analysisPending); controls.clearGroup(); updateState({ selectedTerm: null, scope: 'all' }); render(false); canvas.focus();
  });
  const renderer = createRenderer(canvas, data, id => updateState({ selectedTerm: id }), id => {
    const edge = visible().edges.find(edge => edge.id === id); if (edge) inspector.showEdge(edge);
  }, (id, point) => {
    const positions = manual.get(currentKey) || displayedPositions(); positions[id] = point; manual.set(currentKey, positions);
    if (manual.size > 64) manual.delete(manual.keys().next().value!);
  }, () => {
    if (destroyed || !firstRender) return;
    root.dataset.ready = 'true'; root.setAttribute('aria-busy', 'false'); firstRender = false;
    toolbar.querySelectorAll('button').forEach(node => { node.disabled = false; });
    updateStatus(); resolveReady!();
  });
  const zoomOut = button('−', () => renderer.zoom(1 / 1.25)), zoomIn = button('＋', () => renderer.zoom(1.25));
  zoomOut.setAttribute('aria-label', 'グラフを縮小'); zoomIn.setAttribute('aria-label', 'グラフを拡大');
  const gestures = button(options.embedded ? 'グラフを操作する' : 'ページをスクロールする', () => {
    const enabled = !renderer.gesturesEnabled; renderer.gestures(enabled); gestures.textContent = enabled ? 'ページをスクロールする' : 'グラフを操作する'; gestures.setAttribute('aria-pressed', String(enabled));
  });
  gestures.setAttribute('aria-pressed', String(!options.embedded)); renderer.gestures(!options.embedded);
  toolbar.append(zoomOut, zoomIn, button('全体を表示', () => renderer.fit()));
  if (options.embedded) toolbar.append(gestures);
  toolbar.querySelectorAll('button').forEach(node => { node.disabled = true; });
  const controls = createControls(tools, data, state, updateState, compare, reset, index => {
    activeGroup = index < 0 ? null : index; render(false);
    if (partition && activeGroup !== null) inspector.showGroup(partition, activeGroup, visible().edges);
  });
  graphColumn.append(canvas, toolbar, status); workspace.append(graphColumn, detail); root.append(tools, workspace);
  container.append(root);
  let worker: Worker | null = null;
  function createWorker() {
    worker?.terminate();
    try { worker = new AnalysisWorker(); }
    catch { worker = null; fail('分類と配置の計算を開始できませんでした。'); return; }
    worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
      if (destroyed) return;
      const response = event.data;
      if (response.id !== currentRequest && response.id !== comparisonRequest) return;
      if (response.error) { fail(response.error); return; }
      if (response.comparison && response.id === comparisonRequest) {
        controls.busy(false); inspector.showComparison(response.comparison, state.clustering); return;
      }
      if (response.id !== currentRequest || !response.partition || !response.layout) return;
      partition = response.partition; layout = response.layout; analysisPending = false; controls.busy(false); activeGroup = null; controls.groups(partition.groups);
      render(needsFit); needsFit = false;
      if (state.selectedTerm) inspector.showTerm(state.selectedTerm, state);
    };
    worker.onerror = event => { event.preventDefault(); if (!destroyed) fail('分類と配置の計算を開始できませんでした。'); };
  }
  function fail(text: string) {
    analysisPending = false; root.setAttribute('aria-busy', 'false');
    controls.busy(false); status.replaceChildren(el('span', text, 'error'), button('再試行', () => { createWorker(); calculate(); }));
    status.setAttribute('role', 'alert'); if (firstRender) rejectReady!(new Error(text));
  }
  function request(compare = false) {
    if (!worker) return;
    const id = ++sequence;
    const scoped = visible(), members = new Set(scoped.ids);
    const analysis = { ids: scoped.ids, pairs: graph.pairs.filter(([a, b]) => members.has(a) && members.has(b)) };
    const request: AnalysisRequest = { id, graph: analysis, clustering: state.clustering, layout: state.layout, values: state.settings[state.layout] || {}, compare };
    if (compare) comparisonRequest = id; else currentRequest = id;
    worker!.postMessage(request);
  }
  function calculate() {
    if (!worker) return;
    analysisPending = true;
    controls.busy(true); status.setAttribute('role', 'status'); status.textContent = '配置を計算しています…'; request();
  }
  function compare() { controls.busy(true); inspector.status('各方式の既定の計算条件で比較用の値を求めています。計算中もグラフを操作できます。'); request(true); }
  function key() { return JSON.stringify([state.source, state.layout, state.layout === 'grouped' ? state.clustering : '', state.settings[state.layout] || {}, state.scope, state.scope === 'local' ? state.selectedTerm : '']); }
  function visible() { return scopeGraph(graph.ids, aggregateEdges(data, state), state.selectedTerm, state.scope === 'local'); }
  function displayedPositions(): Positions {
    if (!layout) return {};
    const stored = manual.get(key()) || {};
    return { ...structuredClone(layout.positions), ...structuredClone(stored) };
  }
  function render(fit: boolean) {
    if (!partition || !layout || destroyed || analysisPending) return;
    const scoped = visible(); currentKey = key();
    renderer.update(scoped.ids, scoped.edges, partition, displayedPositions(), state.selectedTerm, activeGroup, fit);
    root.dataset.clustering = state.clustering; root.dataset.layout = state.layout;
    if (firstRender) status.textContent = 'グラフを準備しています…'; else updateStatus();
  }
  function updateStatus() {
    const scoped = visible();
    status.textContent = `用語 ${scoped.ids.length}語 · 参照関係 ${scoped.edges.length}件${state.scope === 'local' ? ' · 周辺表示' : ''}`;
  }
  function updateState(patch: Partial<ExplorerState>, notify = true) {
    if (destroyed) return;
    const previous = state;
    state = normalizeState(data, { ...state, ...patch });
    if ('selectedTerm' in patch) { activeGroup = null; controls.clearGroup(); }
    const filtersChanged = previous.source !== state.source;
    const viewChanged = previous.scope !== state.scope || filtersChanged || state.scope === 'local' && previous.selectedTerm !== state.selectedTerm;
    if (filtersChanged) graph = analysisGraph(data, state);
    if (viewChanged) {
      activeGroup = null; controls.clearGroup();
      if (!state.selectedTerm) inspector.clear();
    }
    const analysisChanged = viewChanged || previous.clustering !== state.clustering || previous.layout !== state.layout || JSON.stringify(previous.settings) !== JSON.stringify(state.settings);
    controls.update(state, previous.settings !== state.settings && JSON.stringify(previous.settings) !== JSON.stringify(state.settings));
    if (analysisChanged) { comparisonRequest = 0; needsFit ||= previous.layout !== state.layout || state.layout === 'grouped' || viewChanged; calculate(); }
    else renderer.select(state.selectedTerm);
    if (state.selectedTerm) inspector.showTerm(state.selectedTerm, state, 'selectedTerm' in patch);
    else if (previous.selectedTerm) inspector.clear();
    if (notify) options.onStateChange?.(structuredClone(state));
  }
  function reset() {
    manual.delete(key()); const settings = { ...state.settings }; delete settings[state.layout];
    updateState({ settings }); render(true);
  }
  if (state.selectedTerm) inspector.showTerm(state.selectedTerm, state);
  createWorker(); calculate();
  return { ready,
    updateState(patch: Partial<ExplorerState>) { updateState(patch, false); },
    getState() { return structuredClone(state); },
    activate() { renderer.activate(); },
    destroy() { if (destroyed) return; destroyed = true; worker?.terminate(); renderer.destroy(); controls.destroy(); inspector.destroy(); root.remove(); if (firstRender) rejectReady!(new Error('グラフを閉じました。')); },
  };
}
