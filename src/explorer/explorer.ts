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
  const data = validateCorpus(options.data), graph = analysisGraph(data);
  let state = normalizeState(data, options.initialState), partition: Partition | null = null, layout: LayoutResult | null = null;
  let destroyed = false, sequence = 0, currentRequest = 0, comparisonRequest = 0, activeGroup: number | null = null, needsFit = true;
  let currentKey = '', firstRender = true, analysisPending = false;
  const manual = new Map<string, Positions>();
  const root = el('section', '', 'glossary-explorer'); root.setAttribute('aria-label', '用語の関係グラフ');
  if (options.embedded) root.classList.add('embedded');
  const tools = el('div'), workspace = el('div', '', 'explorer-workspace'), graphColumn = el('div', '', 'graph-column');
  const toolbar = el('div', '', 'graph-toolbar'), canvas = el('div', '', 'graph-canvas'), detail = el('aside');
  const status = el('p', '初期配置を計算しています…', 'graph-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  let resolveReady: () => void, rejectReady: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // Callers may choose to handle startup through the inline error and retry UI.
  void ready.catch(() => {});
  const inspector = createInspector(detail, data, id => updateState({ selectedTerm: id }), options.onRead);
  const renderer = createRenderer(canvas, data, id => updateState({ selectedTerm: id }), id => {
    const edge = visible().edges.find(edge => edge.id === id); if (edge) inspector.showEdge(edge);
  }, (id, point) => {
    const positions = manual.get(currentKey) || displayedPositions(); positions[id] = point; manual.set(currentKey, positions);
    if (manual.size > 64) manual.delete(manual.keys().next().value!);
  });
  const zoomOut = button('−', () => renderer.zoom(1 / 1.25)), zoomIn = button('＋', () => renderer.zoom(1.25));
  zoomOut.setAttribute('aria-label', 'グラフを縮小'); zoomIn.setAttribute('aria-label', 'グラフを拡大');
  const gestures = button(options.embedded ? 'グラフを操作する' : 'ページをスクロールする', () => {
    const enabled = !renderer.gesturesEnabled; renderer.gestures(enabled); gestures.textContent = enabled ? 'ページをスクロールする' : 'グラフを操作する'; gestures.setAttribute('aria-pressed', String(enabled));
  });
  gestures.setAttribute('aria-pressed', String(!options.embedded)); renderer.gestures(!options.embedded);
  toolbar.append(zoomOut, zoomIn, button('全体を表示', () => renderer.fit()), gestures);
  const legend = el('p', '実線：原典の明示参照　破線：独自の語句対応　矢印：定義 → 定義中の用語', 'graph-legend');
  const help = el('p', '用語を選ぶと定義を表示。線を選ぶと原文の根拠を表示。用語はドラッグで移動できます。', 'note');
  const controls = createControls(tools, data, state, updateState, compare, reset, index => {
    activeGroup = index < 0 ? null : index; render(false);
    if (partition && activeGroup !== null) inspector.showGroup(partition, activeGroup, visible().edges);
  });
  graphColumn.append(toolbar, canvas, status, legend, help); workspace.append(graphColumn, detail); root.append(tools, workspace, el('p', '用語グループは NIST の公式な分類ではありません。参照関係は概念上の依存関係や学習順序を示しません。', 'explorer-notice'));
  container.append(root);
  let worker: Worker | null = null;
  function createWorker() {
    worker?.terminate();
    try { worker = new AnalysisWorker(); }
    catch { worker = null; fail('分析の計算を開始できませんでした。'); return; }
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
      if (firstRender) { firstRender = false; resolveReady!(); }
    };
    worker.onerror = event => { event.preventDefault(); if (!destroyed) fail('分析の計算を開始できませんでした。'); };
  }
  function fail(text: string) {
    analysisPending = false;
    controls.busy(false); status.replaceChildren(el('span', text, 'error'), button('再試行', () => { createWorker(); calculate(); }));
    status.setAttribute('role', 'alert'); if (firstRender) rejectReady!(new Error(text));
  }
  function request(compare = false) {
    if (!worker) return;
    const id = ++sequence;
    const request: AnalysisRequest = { id, graph, clustering: state.clustering, layout: state.layout, values: state.settings[state.layout] || {}, compare };
    if (compare) comparisonRequest = id; else currentRequest = id;
    worker!.postMessage(request);
  }
  function calculate() {
    if (!worker) return;
    analysisPending = true;
    controls.busy(true); status.setAttribute('role', 'status'); status.textContent = '配置を計算しています…'; request();
  }
  function compare() { controls.busy(true); inspector.status('全方式の既定条件で計算しています。グラフの操作は続けられます。'); request(true); }
  function key() { return JSON.stringify([state.layout, state.layout === 'grouped' ? state.clustering : '', state.settings[state.layout] || {}, state.scope, state.scope === 'local' ? state.selectedTerm : '']); }
  function visible() { return scopeGraph(graph.ids, aggregateEdges(data, state), state.selectedTerm, state.scope === 'local'); }
  function displayedPositions(): Positions {
    if (!layout) return {};
    const stored = manual.get(key()) || {};
    if (state.scope === 'all') return { ...structuredClone(layout.positions), ...structuredClone(stored) };
    const ids = visible().ids.filter(id => id !== state.selectedTerm), radius = Math.max(180, ids.length * 65 / (2 * Math.PI));
    const positions: Positions = { [state.selectedTerm!]: { x: 0, y: 0 } };
    ids.forEach((id, i) => { const angle = i * 2 * Math.PI / ids.length - Math.PI / 2; positions[id] = { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }; });
    return { ...positions, ...structuredClone(stored) };
  }
  function render(fit: boolean) {
    if (!partition || !layout || destroyed || analysisPending) return;
    const scoped = visible(); currentKey = key();
    renderer.update(scoped.ids, scoped.edges, partition, displayedPositions(), state.selectedTerm, activeGroup, fit);
    root.dataset.ready = 'true'; root.dataset.clustering = state.clustering; root.dataset.layout = state.layout;
    const occurrences = scoped.edges.reduce((sum, edge) => sum + edge.entries.length, 0);
    status.textContent = `${scoped.ids.length} 用語 · ${scoped.edges.length} 参照関係 · ${occurrences} か所の根拠${state.scope === 'local' ? ' · 周辺表示は中央と円周の補助配置です' : ''}`;
  }
  function updateState(patch: Partial<ExplorerState>, notify = true) {
    if (destroyed) return;
    const previous = state;
    state = normalizeState(data, { ...state, ...patch });
    const analysisChanged = previous.clustering !== state.clustering || previous.layout !== state.layout || JSON.stringify(previous.settings) !== JSON.stringify(state.settings);
    const viewChanged = previous.scope !== state.scope || previous.source !== state.source || previous.kind !== state.kind || state.scope === 'local' && previous.selectedTerm !== state.selectedTerm;
    controls.update(state, previous.settings !== state.settings && JSON.stringify(previous.settings) !== JSON.stringify(state.settings));
    if (analysisChanged) { comparisonRequest = 0; needsFit = previous.layout !== state.layout || state.layout === 'grouped' || viewChanged; calculate(); }
    else if (viewChanged) render(true);
    else renderer.select(state.selectedTerm);
    if (state.selectedTerm) inspector.showTerm(state.selectedTerm, state);
    else if (previous.selectedTerm) inspector.clear();
    if (notify) options.onStateChange?.(structuredClone(state));
  }
  function reset() {
    manual.delete(key()); const settings = { ...state.settings }; delete settings[state.layout];
    updateState({ settings }); render(true);
  }
  createWorker(); calculate();
  return { ready,
    updateState(patch: Partial<ExplorerState>) { updateState(patch, false); },
    getState() { return structuredClone(state); },
    activate() { renderer.activate(); },
    destroy() { if (destroyed) return; destroyed = true; worker?.terminate(); renderer.destroy(); controls.destroy(); inspector.destroy(); root.remove(); if (firstRender) rejectReady!(new Error('グラフを閉じました。')); },
  };
}
