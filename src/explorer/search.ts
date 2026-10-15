import { filterTerms, type Corpus } from '../model.ts';
import { button, el } from '../ui.ts';

// Native search and buttons keep the entire catalogue available without canvas interaction.
export function createSearch(data: Corpus, select: (id: string) => void) {
  const root = el('div', '', 'term-search'), input = el('input');
  input.type = 'search'; input.placeholder = '用語を検索…'; input.autocomplete = 'off';
  input.setAttribute('aria-label', '英語の見出しで検索');
  const results = el('div', '', 'search-results'); results.hidden = true;
  const count = el('p', '', 'search-count'); count.setAttribute('role', 'status');
  const list = el('ul', '', 'term-list'); list.setAttribute('aria-label', '検索結果');
  results.append(count, list); root.append(input, results);
  function render() {
    const terms = filterTerms(data.terms, input.value, '');
    count.textContent = terms.length ? `${terms.length} 用語` : '該当する用語はありません';
    list.replaceChildren();
    for (const term of terms) {
      const li = el('li'), item = button(term.heading, () => {
        input.value = term.heading; results.hidden = true; input.focus(); select(term.id);
      });
      item.lang = 'en'; item.append(el('span', `${term.definitions.length} 文書`, 'note'));
      li.append(item); list.append(li);
    }
  }
  // Safari does not focus buttons on pointer clicks; keep the input focused
  // until click selects the result instead of dismissing the list on blur.
  list.addEventListener('mousedown', event => event.preventDefault());
  input.addEventListener('input', () => { render(); results.hidden = false; });
  input.addEventListener('click', () => { render(); results.hidden = false; });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); results.hidden = true; input.focus(); event.stopPropagation(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.hidden) { render(); results.hidden = false; }
      const items = [...list.querySelectorAll('button')], index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : items.length - 1) : Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
      items[next]?.focus();
    }
    if (event.key === 'Enter' && event.target === input) {
      event.preventDefault();
      if (results.hidden) { render(); results.hidden = false; }
      else list.querySelector('button')?.click();
    }
  });
  root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget as Node)) results.hidden = true; });
  const dismiss = (event: PointerEvent) => { if (!root.contains(event.target as Node)) results.hidden = true; };
  document.addEventListener('pointerdown', dismiss);
  return { root, update(id: string | null) { input.value = data.terms.find(term => term.id === id)?.heading || ''; results.hidden = true; }, destroy() { document.removeEventListener('pointerdown', dismiss); } };
}
