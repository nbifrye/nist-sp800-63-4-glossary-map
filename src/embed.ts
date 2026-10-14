import corpus from './generated/corpus.json';
import type { Corpus } from './model.ts';
import { mountExplorer } from './explorer/explorer.ts';
import { readState, stateUrl } from './site/navigation.ts';
import './site/embed.css';

const container = document.querySelector<HTMLElement>('#graph-embed')!;
const data = corpus as Corpus, initial = readState(new URL(location.href), data);
const fullLink = document.querySelector<HTMLAnchorElement>('#open-site')!;
const explorer = mountExplorer(container, { data, initialState: initial.graph, embedded: true,
  onStateChange(graph) {
    const url = stateUrl(new URL(location.href), { view: 'graph', query: '', graph });
    history.replaceState(null, '', url); fullLink.href = stateUrl(new URL('./index.html', location.href), { view: 'graph', query: '', graph }).href;
  },
});
fullLink.href = stateUrl(new URL('./index.html', location.href), { ...initial, view: 'graph' }).href;
window.addEventListener('pagehide', event => { if (!event.persisted) explorer.destroy(); });
