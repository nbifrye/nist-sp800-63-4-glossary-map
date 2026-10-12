export const searchHeading = heading => heading.replace(/\s+\([A-Za-z0-9/-]+\)$/, '').toLowerCase();
export function filterTerms(terms, query, source) {
  const q = query.trim().toLowerCase();
  return terms.filter(t => searchHeading(t.heading).includes(q) && (!source || t.definitions.some(d => d.source === source)));
}
export function indexData(data) {
  if (data.schemaVersion !== 1 || !Array.isArray(data.terms) || data.terms.length !== 189) throw Error('用語データの形式または件数に問題があります。');
  const terms = new Map(data.terms.map(t => [t.id, t]));
  if (terms.size !== data.terms.length) throw Error('用語 ID が重複しています。');
  const incoming = new Map(data.terms.map(t => [t.id, []]));
  const definitions = new Map();
  const counts = {};
  for (const term of data.terms) {
    if (typeof term.heading !== 'string' || !Array.isArray(term.definitions) || !term.definitions.length) throw Error('用語の情報が不足しているか、形式に問題があります。');
    for (const d of term.definitions) {
      if (!data.manifest.documents[d.source] || !/^https:\/\/pages\.nist\.gov\/800-63-4\/sp800-63[a-c]?\.html#(?:def|def-and-acr)$/.test(d.sourceUrl) || !d.sourceUrl.includes('/'+d.source+'.html#') || d.heading !== term.heading || typeof d.english !== 'string' || !d.english || typeof d.japanese !== 'string' || !d.japanese || !d.review || !Array.isArray(d.references) || definitions.has(d.id)) throw Error('定義の情報が不足しているか、形式に問題があります。');
      counts[d.source] = (counts[d.source] || 0) + 1;
      definitions.set(d.id, {term, definition: d});
      for (const ref of d.references) {
        if (!terms.has(ref.target) || !['explicit','lexical'].includes(ref.kind) || !Number.isInteger(ref.start) || !Number.isInteger(ref.end) || ref.start < 0 || ref.end <= ref.start || ref.end > d.english.length || d.english.slice(ref.start, ref.end) !== ref.phrase) throw Error('参照先または原文の該当位置に問題があります。');
        incoming.get(ref.target).push({term, definition: d, reference: ref});
      }
    }
  }
  for (const [id, doc] of Object.entries(data.manifest.documents)) if (counts[id] !== doc.definitionCount) throw Error('出典別の定義数が取得記録と一致しません。');
  return {terms, incoming, definitions};
}
export function relationships(term, index, source = '', kind = '') {
  const accepted = (d, r) => (!source || d.source === source) && (!kind || r.kind === kind);
  return {
    outgoing: term.definitions.flatMap(d => d.references.filter(r => accepted(d,r)).map(r => ({term, definition:d, reference:r}))),
    incoming: index.incoming.get(term.id).filter(e => accepted(e.definition,e.reference)),
  };
}
export function neighbors(entries, direction) {
  const grouped = new Map();
  for (const e of entries) {
    const id = direction === 'incoming' ? e.term.id : e.reference.target;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(e);
  }
  return [...grouped.entries()];
}
