import { filterTerms, type Corpus } from '../model.ts';
import { createInspector } from '../explorer/inspector.ts';
import { button, el, field, select } from '../ui.ts';
import type { SiteState } from './navigation.ts';

export function createReader(host: HTMLElement, data: Corpus, change: (patch: { query?: string; term?: string | null; source?: string }, push: boolean) => void, openGraph: () => void) {
  host.classList.add('reader-workspace', 'glossary-explorer');
  const catalog = el('aside', '', 'catalog'); catalog.setAttribute('aria-label', '用語一覧');
  const search = el('input'); search.type = 'search'; search.placeholder = '例：authentication'; search.autocomplete = 'off';
  search.addEventListener('input', () => change({ query: search.value }, false));
  const source = select([{ id: '', label: 'すべての出典' }, ...Object.entries(data.manifest.documents).map(([id, source]) => ({ id, label: source.label }))], '', value => change({ source: value }, false));
  const count = el('p', '', 'note'); count.setAttribute('role', 'status');
  const list = el('ul', '', 'term-list');
  catalog.append(field('英語の見出しで検索', search), field('出典文書で絞る', source), count, list);
  const content = el('section', '', 'reader-content'), actions = el('div', '', 'reader-actions'), detail = el('div', '', 'reader-detail');
  actions.append(button('← 用語一覧', () => { catalog.hidden = false; content.classList.remove('mobile-open'); search.focus(); }, 'back-catalog'), button('この用語の関係グラフ', openGraph));
  content.append(actions, detail); host.append(catalog, content);
  const inspector = createInspector(detail, data, id => change({ term: id }, true));
  let detailKey = '';
  return {
    update(state: SiteState, focus = false) {
      search.value = state.query; source.value = state.graph.source;
      const terms = filterTerms(data.terms, state.query, state.graph.source);
      count.textContent = `${terms.length} / ${data.terms.length} 用語`;
      list.replaceChildren();
      for (const term of terms) {
        const item = el('li'), node = button(term.heading, () => change({ term: term.id }, true));
        node.lang = 'en'; node.setAttribute('aria-current', String(state.graph.selectedTerm === term.id));
        node.append(el('span', `${term.definitions.length} 文書`, 'note')); item.append(node); list.append(item);
      }
      if (!terms.length) list.append(el('li', '該当する用語はありません。', 'note'));
      const key = `${state.graph.selectedTerm}|${state.graph.source}|${state.graph.kind}`;
      const termChanged = key !== detailKey;
      if (state.graph.selectedTerm && (termChanged || focus)) { inspector.showTerm(state.graph.selectedTerm, state.graph, focus); detailKey = key; }
      if (!state.graph.selectedTerm && termChanged) { inspector.clear(); detailKey = key; content.classList.remove('mobile-open'); }
      if ((focus || termChanged) && state.graph.selectedTerm) { content.classList.add('mobile-open'); catalog.hidden = false; }
    },
  };
}
