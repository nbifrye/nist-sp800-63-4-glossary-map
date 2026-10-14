import corpus from '../generated/corpus.json';
import { validateCorpus, type Corpus } from '../model.ts';
import type { mountExplorer } from '../explorer/explorer.ts';
import { createReader } from './reader.ts';
import { readState, stateUrl, type SiteState } from './navigation.ts';
import { button, disclosure, el, link } from '../ui.ts';
import './site.css';
import '../explorer/explorer.css';

const data = validateCorpus(corpus as Corpus);
document.querySelector<HTMLElement>('#startup-status')!.hidden = true;
let state = readState(new URL(location.href), data), explorer: ReturnType<typeof mountExplorer> | undefined;
let loadingGraph = false;
const readerHost = document.querySelector<HTMLElement>('#reader')!, graphHost = document.querySelector<HTMLElement>('#graph')!, about = document.querySelector<HTMLElement>('#about')!;
const reader = createReader(readerHost, data, (patch, push) => {
  const graph = { ...state.graph, selectedTerm: patch.term === undefined ? state.graph.selectedTerm : patch.term, source: patch.source === undefined ? state.graph.source : patch.source };
  update({ ...state, query: patch.query ?? state.query, graph }, push, patch.term !== undefined);
}, () => update({ ...state, view: 'graph', graph: { ...state.graph, scope: state.graph.selectedTerm ? 'local' : 'all' } }, true));

document.querySelector('#corpus-stats')!.textContent = `${data.terms.length} 用語 · ${data.terms.flatMap(term => term.definitions).length} 定義 · ${Object.keys(data.manifest.documents).length} 文書`;
about.append(el('h2', 'このサイトについて'), el('p', 'NIST SP 800-63-4 シリーズの正式版 HTML の Glossary をまとめた非公式サイトです。略称一覧は対象外で、略称による検索・対応付けは行いません。'), el('p', '日本語訳は Codex が作成し、原文と照合したプロジェクト独自の訳です。NIST の公式訳ではなく、独立した人間による査読は行っていません。'), el('p', `対象版：${data.manifest.edition} / 原典取得日：${data.manifest.retrievedAt}`));
const sources = el('ul'); for (const source of Object.values(data.manifest.documents)) { const li = el('li'); li.append(link(source.label, `${source.url}#${source.glossaryAnchor}`)); sources.append(li); } about.append(sources);
about.append(disclosure('参照関係の作り方', el('p', '定義中の表現を、4文書すべての見出しと照合します。単語境界とハイフンを保ち、大文字・小文字と空白の違いを無視し、単数形・複数形の規則を適用します。末尾の括弧内略称は除外し、略称・同義語・語幹からは推測しません。重なる表現は長いものを優先します。'), el('p', 'See、Synonymous with、用語集リンク、原典の斜体表現を明示参照として区別します。各箇所の原文、Unicode 文字単位の開始・終了位置、判定規則、出典を保持します。終了位置は範囲に含みません。'), el('p', '語句が一致しても意味が同じとは限りません。矢印は「参照元の定義 → 定義中に登場する用語」であり、概念上の依存関係や推奨学習順序を示しません。自己参照・循環・文書をまたぐ参照も保持します。'), el('p', `対応付けの基準：${data.mappingVersion}`)));
const reviewHistory = disclosure('内容の確認履歴');
for (const event of [...data.reviews].reverse()) reviewHistory.append(disclosure(`${event.date} · ${event.type}`, el('p', `${event.actor} / ${event.status}`), el('p', event.scope), ...event.checks.map(check => el('p', check)), el('p', event.limitations || '', 'note')));
about.append(reviewHistory, link('ソースコード・要件・更新手順 ↗', 'https://github.com/nbifrye/nist-sp800-63-4-glossary-map'));

async function showGraph() {
  if (loadingGraph) return;
  loadingGraph = true;
  try {
    const { mountExplorer } = await import('../explorer/explorer.ts');
    explorer = mountExplorer(graphHost, { data, initialState: state.graph, onStateChange(graph) {
      const push = graph.selectedTerm !== state.graph.selectedTerm;
      state = { ...state, graph }; history[push ? 'pushState' : 'replaceState'](null, '', stateUrl(new URL(location.href), state));
    }, onRead(id) { update({ ...state, view: 'reader', graph: { ...state.graph, selectedTerm: id } }, true, true); } });
  } catch {
    const error = el('p', 'グラフを読み込めませんでした。', 'error'); error.setAttribute('role', 'alert');
    graphHost.replaceChildren(error, button('再試行', () => { graphHost.replaceChildren(); void showGraph(); }));
  } finally { loadingGraph = false; }
}
function render(focus = false) {
  readerHost.hidden = state.view !== 'reader'; graphHost.hidden = state.view !== 'graph'; about.hidden = state.view !== 'about';
  document.querySelectorAll<HTMLAnchorElement>('[data-view]').forEach(node => {
    node.setAttribute('aria-current', node.dataset.view === state.view ? 'page' : 'false');
    node.href = stateUrl(new URL(location.href), { ...state, view: node.dataset.view as SiteState['view'] }).href;
  });
  if (state.view === 'reader') reader.update(state, focus);
  else if (state.view === 'graph') {
    if (!explorer) {
      void showGraph();
    } else { explorer.updateState(state.graph); requestAnimationFrame(() => explorer!.activate()); }
  }
}
function update(next: SiteState, push: boolean, focus = false) {
  state = next; window.history[push ? 'pushState' : 'replaceState'](null, '', stateUrl(new URL(location.href), state)); render(focus);
}
for (const node of document.querySelectorAll<HTMLAnchorElement>('[data-view]')) node.addEventListener('click', event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); update({ ...state, view: node.dataset.view as SiteState['view'] }, true);
});
window.addEventListener('popstate', () => { state = readState(new URL(location.href), data); render(true); });
window.addEventListener('pagehide', event => { if (!event.persisted) explorer?.destroy(); });
render();
