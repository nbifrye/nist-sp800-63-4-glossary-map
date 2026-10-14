import type { Corpus } from '../model.ts';
import { clusteringMethods, layoutMethods } from '../analysis/methods.ts';
import { button, disclosure, el, field, select } from '../ui.ts';
import type { ExplorerState } from './state.ts';
export function createControls(host: HTMLElement, data: Corpus, initial: ExplorerState, change: (patch: Partial<ExplorerState>) => void, compare: () => void, reset: () => void, showGroup: (index: number) => void) {
  host.classList.add('explorer-controls');
  const clustering = select(clusteringMethods, initial.clustering, value => change({ clustering: value as ExplorerState['clustering'] }));
  const layout = select(layoutMethods, initial.layout, value => change({ layout: value as ExplorerState['layout'] }));
  const scope = select([{ id: 'all', label: 'すべての用語' }, { id: 'local', label: '選択用語の周辺' }], initial.scope, value => change({ scope: value as ExplorerState['scope'] }));
  const find = select([{ id: '', label: '用語を選ぶ…' }, ...data.terms.map(term => ({ id: term.id, label: term.heading }))], initial.selectedTerm || '', value => { if (value) change({ selectedTerm: value }); });
  const source = select([{ id: '', label: 'すべての出典' }, ...Object.entries(data.manifest.documents).map(([id, doc]) => ({ id, label: doc.label }))], initial.source, value => change({ source: value }));
  const kind = select([{ id: '', label: 'すべての参照' }, { id: 'explicit', label: '原典の明示参照' }, { id: 'lexical', label: '独自の語句対応' }], initial.kind, value => change({ kind: value }));
  const group = select([{ id: '', label: 'すべてのグループ' }], '', value => showGroup(value ? Number(value) : -1));
  const parametersForm = el('form', '', 'parameters');
  let state = initial, previousMethod = '';
  const methodNote = el('p', '', 'note');
  parametersForm.addEventListener('submit', event => {
    event.preventDefault(); if (!parametersForm.reportValidity()) return;
    const values = Object.fromEntries([...parametersForm.querySelectorAll('input')].map(input => [input.name, Number(input.value)]));
    change({ settings: { ...state.settings, [state.layout]: values } });
  });
  const compareButton = button('手法を比較', compare);
  const primary = el('div', '', 'control-grid'); primary.append(field('用語を探す', find), field('表示範囲', scope), field('用語グループの検出', clustering), field('グラフの配置', layout));
  const filters = el('div', '', 'control-grid'); filters.append(field('出典で絞る', source), field('参照の種類', kind), field('用語グループを調べる', group));
  const options = disclosure('表示設定・計算条件', filters, methodNote, parametersForm, button('配置を初期状態に戻す', reset));
  host.append(primary, compareButton, options);
  function update(next: ExplorerState, force = false) {
    state = next; clustering.value = state.clustering; layout.value = state.layout; source.value = state.source; kind.value = state.kind; find.value = state.selectedTerm || ''; scope.value = state.scope;
    scope.options[1].disabled = !state.selectedTerm;
    const metadata = layoutMethods.find(method => method.id === state.layout)!;
    methodNote.textContent = metadata.description;
    if (previousMethod !== state.layout || force) {
      parametersForm.replaceChildren();
      for (const option of metadata.fields) {
        const input = el('input'); input.type = 'number'; input.name = option.key; input.min = String(option.min); input.max = String(option.max); input.step = String(option.step); input.value = String(state.settings[state.layout]?.[option.key] ?? option.value);
        parametersForm.append(field(option.label, input));
      }
      const submit = el('button', '再計算'); submit.type = 'submit'; parametersForm.append(submit); previousMethod = state.layout;
    }
  }
  update(initial);
  return { update,
    groups(groups: string[][]) { group.replaceChildren(); const all = el('option', 'すべてのグループ'); all.value = ''; group.append(all); groups.forEach((members, i) => { const option = el('option', `${i + 1} · ${members.length} 用語`); option.value = String(i); group.append(option); }); },
    busy(value: boolean) { compareButton.disabled = value; },
    clearGroup() { group.value = ''; },
    destroy() { host.replaceChildren(); },
  };
}
