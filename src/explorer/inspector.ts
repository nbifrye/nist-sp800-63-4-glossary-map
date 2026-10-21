import { aggregateEdges, textSlice, type Corpus, type Definition, type Edge, type Evidence, type Filters } from '../model.ts';
import type { Partition } from '../analysis/clustering.ts';
import type { Comparison } from '../analysis/worker.ts';
import { clusteringMethods, layoutMethods } from '../analysis/methods.ts';
import { button, disclosure, el, link } from '../ui.ts';

const kindLabel = (kind: string) => kind === 'explicit' ? '原典で明示された参照' : '語句の一致による参照';
const rules: Record<string, string> = { 'see-directive': '参照を指示する表現', 'glossary-link': '原典の用語集へのリンク', 'source-italic': '原典の斜体表現', 'heading-longest-boundary-v3': '単語の境界を保ち、最も長く一致する見出しを採用（複数形の見出しの単数形は除く）' };

export function createInspector(host: HTMLElement, data: Corpus, onSelect: (id: string) => void, onRead?: (id: string) => void, onClose?: () => void) {
  const terms = new Map(data.terms.map(term => [term.id, term]));
  host.classList.add('inspector'); host.setAttribute('aria-label', '用語と参照の詳細');
  const heading = el('h2', '用語を選んで読む'); heading.tabIndex = -1;
  const body = el('div', '', 'inspector-body'); body.tabIndex = 0; body.setAttribute('role', 'region'); body.setAttribute('aria-label', '用語と参照の説明');
  const titlebar = el('div', '', 'inspector-title'); titlebar.append(heading);
  if (onClose) { const close = button('×', onClose, 'icon-button'); close.setAttribute('aria-label', '詳細を閉じる'); titlebar.append(close); }
  host.append(titlebar, body); host.hidden = true;
  body.append(el('p', 'グラフや一覧から用語を選ぶと、出典別の定義と参照関係を表示します。', 'note'));
  function termButton(id: string, text?: string) {
    const node = button(text || terms.get(id)!.heading, () => onSelect(id), 'text-button'); node.lang = 'en'; return node;
  }
  function english(definition: Definition) {
    const p = el('p', '', 'english'); p.lang = 'en'; let offset = 0;
    for (const reference of definition.references) {
      p.append(document.createTextNode(textSlice(definition.english, offset, reference.start)));
      const node = termButton(reference.target, reference.phrase); node.classList.add(reference.kind); node.title = `${terms.get(reference.target)!.heading}：${kindLabel(reference.kind)}`; p.append(node); offset = reference.end;
    }
    p.append(document.createTextNode(textSlice(definition.english, offset))); return p;
  }
  function evidence(entries: Evidence[], direction: 'incoming' | 'outgoing' = 'outgoing') {
    const grouped = new Map<string, Evidence[]>();
    for (const entry of entries) {
      const key = `${entry.definition.id}|${entry.reference.target}|${entry.reference.kind}`;
      if (!grouped.has(key)) grouped.set(key, []); grouped.get(key)!.push(entry);
    }
    const list = el('ul', '', 'evidence-list');
    for (const group of grouped.values()) {
      const { term, definition, reference } = group[0], target = direction === 'incoming' ? term.id : reference.target;
      const li = el('li'), header = el('div'); header.append(termButton(target), el('span', kindLabel(reference.kind), `badge ${reference.kind}`));
      const context = el('p', `参照元：${term.heading} / ${data.manifest.documents[definition.source].label}`, 'note');
      const details = disclosure(`根拠となる原文 · ${group.length} か所`);
      for (const occurrence of group) {
        const r = occurrence.reference, quote = el('p', '', 'quote'); quote.lang = 'en';
        quote.append(document.createTextNode((r.start > 50 ? '…' : '') + textSlice(definition.english, Math.max(0, r.start - 50), r.start)), el('mark', r.phrase), document.createTextNode(textSlice(definition.english, r.end, r.end + 80) + (r.end + 80 < Array.from(definition.english).length ? '…' : '')));
        details.append(quote, el('p', `${rules[r.rule] || r.rule} · 原文中の位置：${r.start}–${r.end}`, 'note'));
      }
      details.append(link('参照元の NIST 原典を開く ↗', definition.sourceUrl)); li.append(header, context, details); list.append(li);
    }
    if (!entries.length) list.append(el('li', 'この条件に該当する参照はありません。', 'note'));
    return list;
  }
  function showTerm(id: string, filters: Filters = { source: '', kind: '' }, focus = false) {
    const term = terms.get(id); if (!term) return;
    host.hidden = false; heading.textContent = term.heading; heading.lang = 'en'; body.replaceChildren();
    if (onRead) body.append(button('用語集で開く ↗', () => onRead(id), 'read-link'));
    const definitions = term.definitions.filter(d => !filters.source || d.source === filters.source);
    if (!definitions.length) body.append(el('p', '選択中の出典には、この用語の定義がありません。出典の絞り込みを解除すると読めます。', 'note'));
    for (const definition of definitions) {
      const card = el('section', '', 'definition-card'); card.dataset.definition = definition.id;
      card.append(el('h3', data.manifest.documents[definition.source].label), el('p', '日本語訳 · 非公式', 'eyebrow'), el('p', definition.japanese, 'japanese'), disclosure('英語原文を読む', english(definition)), link('NIST の原典を開く ↗', definition.sourceUrl));
      const history = disclosure('翻訳の確認情報・原文ハッシュ', el('p', `${definition.review.author} · ${definition.review.date} · ${definition.review.status}`, 'note'), el('p', definition.review.note, 'note'), el('code', definition.hash));
      for (const review of data.reviews.filter(review => review.definitionHashes?.includes(definition.hash))) history.append(el('p', `${review.date} · ${review.actor} · ${review.type}：${review.status}`, 'note'));
      card.append(history); body.append(card);
    }
    const edges = aggregateEdges(data, filters), outgoing = edges.filter(edge => edge.source === id).flatMap(edge => edge.entries), incoming = edges.filter(edge => edge.target === id).flatMap(edge => edge.entries);
    body.append(disclosure(`参照する用語 · ${outgoing.length} か所`, evidence(outgoing)), disclosure(`この用語を参照する定義 · ${incoming.length} か所`, evidence(incoming, 'incoming')));
    if (focus) heading.focus();
    body.scrollTop = 0;
  }
  function showEdge(edge: Edge) {
    host.hidden = false; heading.textContent = '参照関係の根拠'; heading.removeAttribute('lang'); body.replaceChildren();
    const path = el('p', '', 'relation-path'); path.append(termButton(edge.source), document.createTextNode(' → '), termButton(edge.target));
    body.append(path, evidence(edge.entries)); body.scrollTop = 0;
  }
  function showGroup(partition: Partition, index: number, edges: Edge[]) {
    const group = partition.groups[index]; if (!group) return;
    host.hidden = false; heading.textContent = `用語グループ ${index + 1}`; heading.removeAttribute('lang');
    body.replaceChildren(el('p', `${group.length}語 · ${clusteringMethods.find(method => method.id === partition.method)!.label}`, 'note'), el('p', '自動的に求めた分類で、NIST の公式な分類ではありません。', 'note'));
    const list = el('ul', '', 'member-list'); for (const id of group) { const li = el('li'); li.append(termButton(id)); list.append(li); }
    const members = new Set(group), internal = edges.filter(edge => members.has(edge.source) && members.has(edge.target));
    body.append(list, disclosure(`グループ内の参照関係 · ${internal.length} 組`, evidence(internal.flatMap(edge => edge.entries)))); body.scrollTop = 0;
  }
  function showComparison(comparison: Comparison, selectedClustering: string) {
    host.hidden = false; heading.textContent = '手法を比較'; heading.removeAttribute('lang'); body.replaceChildren();
    body.append(el('p', '選択中の表示範囲・出典・参照の種類に合うグラフを使い、同じ用語間の参照を1つにまとめて計算した結果です。自己参照は分析の重みに含めません。各方式は、モジュラリティ Q を大きくするか、符号長 L を小さくすることを目指します。尺度が異なる数値は、そのまま比較できません。', 'note'));
    function table(headers: string[], rows: string[][]) {
      const table = el('table'), thead = el('thead'), heading = el('tr');
      for (const text of headers) { const cell = el('th', text); cell.scope = 'col'; heading.append(cell); } thead.append(heading); table.append(thead);
      const tbody = el('tbody'); for (const row of rows) { const tr = el('tr'); row.forEach((text, i) => { const td = i ? el('td', text) : el('th', text); if (!i) (td as HTMLTableCellElement).scope = 'row'; tr.append(td); }); tbody.append(tr); } table.append(tbody); return table;
    }
    body.append(el('h3', '分類結果'), table(['方式', 'グループ数', '最大グループの用語数', '目的関数'], comparison.partitions.map(partition => [clusteringMethods.find(method => method.id === partition.method)!.label, String(partition.groups.length), String(Math.max(...partition.groups.map(group => group.length))), partition.score ? `${partition.score.label} ${partition.score.value.toFixed(4)}` : '—'])));
    body.append(el('h3', '初期配置'), el('p', `選択中の表示範囲・絞り込み条件と、各方式の既定の計算条件で求めた値です。用語グループ別の配置には「${clusteringMethods.find(method => method.id === selectedClustering)!.label}」の分類を使います。計算条件の変更や手動で動かした座標は、表の値に反映されません。`, 'note'), table(['方式', '線の交差数', '平均の長さ（正規化）', '長さのばらつき（CV）'], comparison.layouts.map(layout => [layoutMethods.find(method => method.id === layout.method)!.label, String(layout.metrics.crossings), layout.metrics.normalizedLength.toFixed(3), layout.metrics.lengthCV.toFixed(3)])));
    body.append(el('p', '交差数は、自己参照、参照の方向、重複を取り除いたうえで、用語間を直線で結んで数えます。線の接触や、端点を共有する箇所は数えません。平均の長さは、配置全体を囲む長方形の対角線で割った値です。CV は、線の長さの標準偏差を平均で割った値で、長さのばらつきを表します。これらは画面上の曲線を測った値ではありません。', 'note'));
    for (const method of [...clusteringMethods, ...layoutMethods]) body.append(disclosure(method.label, el('p', method.description), method.url ? link(method.paper, method.url) : el('p', method.paper, 'note')));
    body.scrollTop = 0;
  }
  return { showTerm, showEdge, showGroup, showComparison,
    clear() { host.hidden = true; heading.textContent = '用語を選んで読む'; heading.removeAttribute('lang'); body.replaceChildren(el('p', '一覧やグラフから用語を選ぶと、定義と参照関係を表示します。', 'note')); },
    status(text: string, error = false) { host.hidden = false; heading.textContent = error ? '表示できません' : '計算中'; body.replaceChildren(el('p', text, error ? 'error' : 'note')); if (error) body.firstElementChild!.setAttribute('role', 'alert'); },
    destroy() { host.replaceChildren(); },
  };
}
