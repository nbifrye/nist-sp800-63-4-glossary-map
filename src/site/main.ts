import corpus from '../generated/corpus.json';
import { validateCorpus, type Corpus } from '../model.ts';
import type { mountExplorer } from '../explorer/explorer.ts';
import { readState, stateUrl } from './navigation.ts';
import { button, el } from '../ui.ts';
import './site.css';

const data = validateCorpus(corpus as Corpus);
let state = readState(new URL(location.href), data), explorer: ReturnType<typeof mountExplorer> | undefined;
const graphHost = document.querySelector<HTMLElement>('#graph')!;
async function showGraph() {
  try {
    const { mountExplorer } = await import('../explorer/explorer.ts');
    explorer = mountExplorer(graphHost, { data, initialState: state.graph, onStateChange(graph) {
      const push = graph.selectedTerm !== state.graph.selectedTerm;
      state = { ...state, graph };
      history[push ? 'pushState' : 'replaceState'](null, '', stateUrl(new URL(location.href), state));
    } });
    document.querySelector<HTMLElement>('#startup-status')!.hidden = true;
  } catch {
    document.querySelector<HTMLElement>('#startup-status')!.hidden = true;
    const error = el('p', 'グラフを読み込めませんでした。', 'error'); error.setAttribute('role', 'alert');
    graphHost.replaceChildren(error, button('再試行', () => { graphHost.replaceChildren(); void showGraph(); }));
  }
}
window.addEventListener('popstate', () => { state = readState(new URL(location.href), data); explorer?.updateState(state.graph); });
window.addEventListener('pagehide', event => { if (!event.persisted) explorer?.destroy(); });
void showGraph();
