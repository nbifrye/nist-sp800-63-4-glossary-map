import type { Corpus } from '../model.ts';
import { clusteringMethods, layoutMethods } from '../analysis/methods.ts';
import { button, disclosure, el, field, select } from '../ui.ts';
import type { ExplorerState } from './state.ts';
import { createSearch } from './search.ts';
export function createControls(host: HTMLElement, data: Corpus, initial: ExplorerState, change: (patch: Partial<ExplorerState>) => void, compare: () => void, reset: () => void, showGroup: (index: number) => void) {
  host.classList.add('explorer-controls');
  const clustering = select(clusteringMethods, initial.clustering, value => change({ clustering: value as ExplorerState['clustering'] }));
  const layout = select(layoutMethods, initial.layout, value => change({ layout: value as ExplorerState['layout'] }));
  const scope = select([{ id: 'all', label: 'すべての用語' }, { id: 'local', label: '選択用語の周辺' }], initial.scope, value => change({ scope: value as ExplorerState['scope'] }));
  const search = createSearch(data, selectedTerm => change({ selectedTerm }));
  const source = select([{ id: '', label: 'すべての出典' }, ...Object.entries(data.manifest.documents).map(([id, doc]) => ({ id, label: doc.label }))], initial.source, value => change({ source: value }));
  const kind = select([{ id: '', label: 'すべての参照' }, { id: 'explicit', label: '原典の明示参照' }, { id: 'lexical', label: '独自の語句対応' }], initial.kind, value => change({ kind: value }));
  const group = select([{ id: '', label: 'すべてのグループ' }], '', value => { options.open = false; showGroup(value ? Number(value) : -1); });
  const parametersForm = el('form', '', 'parameters');
  let state = initial, previousMethod = '';
  const methodNote = el('p', '', 'note');
  parametersForm.addEventListener('submit', event => {
    event.preventDefault(); if (!parametersForm.reportValidity()) return;
    const values = Object.fromEntries([...parametersForm.querySelectorAll('input')].map(input => [input.name, Number(input.value)]));
    change({ settings: { ...state.settings, [state.layout]: values } });
  });
  const compareButton = button('手法を比較', () => { options.open = false; compare(); });
  const primary = el('div', '', 'control-grid'); primary.append(field('用語グループの検出', clustering), field('グラフの配置', layout));
  const filters = el('div', '', 'control-grid'); filters.append(field('出典で絞る', source), field('参照の種類', kind), field('用語グループを調べる', group));
  const panel = el('div', '', 'settings-panel');
  const panelHeader = el('div', '', 'settings-heading'); panelHeader.append(el('h2', '表示設定'));
  const options = disclosure('表示設定', panel); options.classList.add('settings');
  const close = button('×', () => { options.open = false; options.querySelector('summary')!.focus(); }, 'icon-button'); close.setAttribute('aria-label', '表示設定を閉じる'); panelHeader.append(close);
  panel.append(panelHeader, primary, filters, disclosure('計算条件', methodNote, parametersForm, button('配置を初期状態に戻す', reset)), compareButton,
    disclosure('グラフの読み方', el('p', '実線：原典の明示参照。破線：独自の語句対応。矢印は定義から参照先の用語へ向かいます。', 'note'), el('p', '拡大すると用語名を表示。用語を選ぶと定義、線を選ぶと根拠を表示。ドラッグで移動、＋／−で拡大縮小、0で全体表示。矢印キーでパン、Shift＋矢印キーで選択用語を移動できます。', 'note'), el('p', '用語グループは独自の自動分類です。参照関係は依存関係や学習順序を示しません。', 'note')));
  const scopeField = field('表示範囲', scope); scopeField.classList.add('scope-field');
  host.append(search.root, scopeField, options);
  const dismiss = (event: PointerEvent) => { if (!options.contains(event.target as Node)) options.open = false; };
  document.addEventListener('pointerdown', dismiss);
  options.addEventListener('keydown', event => { if (event.key === 'Escape') { options.open = false; options.querySelector('summary')!.focus(); } });

  function update(next: ExplorerState, force = false) {
    state = next; clustering.value = state.clustering; layout.value = state.layout; source.value = state.source; kind.value = state.kind; search.update(state.selectedTerm); scope.value = state.scope;
    scope.options[1].disabled = !state.selectedTerm;
    const filterCount = [state.source, state.kind].filter(Boolean).length;
    options.querySelector('summary')!.textContent = filterCount ? `表示設定 · ${filterCount}` : '表示設定';
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
    destroy() { search.destroy(); document.removeEventListener('pointerdown', dismiss); host.replaceChildren(); },
  };
}
