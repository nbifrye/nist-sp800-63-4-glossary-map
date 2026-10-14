export type ReferenceKind = 'explicit' | 'lexical';
export interface Reference {
  target: string;
  start: number;
  end: number;
  phrase: string;
  kind: ReferenceKind;
  rule: string;
  sourceEmphasis: boolean;
}
export interface Review { status: string; author: string; date: string; note: string }
export interface Source {
  label: string; url: string; glossaryAnchor: string; sha256: string; definitionCount: number;
}
export interface Definition {
  id: string; heading: string; source: string; sourceUrl: string; english: string;
  japanese: string; hash: string; review: Review; references: Reference[];
  emphasis: { start: number; end: number; text: string }[];
  links: { text: string; url: string }[];
}
export interface Term { id: string; heading: string; definitions: Definition[] }
export interface ReviewEvent {
  date: string; actor: string; type: string; scope: string; status: string;
  checks: string[]; limitations?: string; definitionHashes?: string[];
}
export interface Corpus {
  schemaVersion: number; mappingVersion: string;
  manifest: { retrievedAt: string; edition: string; documents: Record<string, Source> };
  terms: Term[]; reviews: ReviewEvent[];
}
export interface Evidence { term: Term; definition: Definition; reference: Reference }
export interface Edge { id: string; source: string; target: string; entries: Evidence[] }
export interface AnalysisGraph { ids: string[]; pairs: [string, string][] }
export interface Filters { source: string; kind: string }

// Stored evidence offsets are Unicode code points, independent of JS UTF-16.
export const textSlice = (text: string, start = 0, end?: number) => Array.from(text).slice(start, end).join('');
export const searchHeading = (heading: string) => heading.replace(/\s+\([A-Za-z0-9/-]+\)$/, '').toLowerCase();
export const filterTerms = (terms: Term[], query: string, source = '') => terms.filter(term =>
  searchHeading(term.heading).includes(query.trim().toLowerCase()) &&
  (!source || term.definitions.some(definition => definition.source === source)));

export function aggregateEdges(data: Corpus, filters: Filters = { source: '', kind: '' }): Edge[] {
  const edges = new Map<string, Edge>();
  for (const term of data.terms) for (const definition of term.definitions) {
    if (filters.source && definition.source !== filters.source) continue;
    for (const reference of definition.references) {
      if (filters.kind && reference.kind !== filters.kind) continue;
      const id = `${term.id}>${reference.target}`;
      if (!edges.has(id)) edges.set(id, { id, source: term.id, target: reference.target, entries: [] });
      edges.get(id)!.entries.push({ term, definition, reference });
    }
  }
  return [...edges.values()];
}

export function analysisGraph(data: Corpus): AnalysisGraph {
  return { ids: data.terms.map(term => term.id).sort(), pairs: aggregateEdges(data)
    .filter(edge => edge.source !== edge.target).map(edge => [edge.source, edge.target] as [string, string])
    .sort(([a, b], [c, d]) => a.localeCompare(c) || b.localeCompare(d)) };
}

export function scopeGraph(ids: string[], edges: Edge[], selected: string | null, local: boolean) {
  if (!local || !selected) return { ids, edges };
  const visible = new Set([selected]);
  for (const edge of edges) if (edge.source === selected || edge.target === selected) {
    visible.add(edge.source); visible.add(edge.target);
  }
  return { ids: ids.filter(id => visible.has(id)), edges: edges.filter(edge => visible.has(edge.source) && visible.has(edge.target)) };
}

export function validateCorpus(data: Corpus): Corpus {
  if (data.schemaVersion !== 2 || !data.terms?.length || !Array.isArray(data.reviews)) throw Error('用語データの形式が不正です。');
  const ids = new Set(data.terms.map(term => term.id));
  if (ids.size !== data.terms.length) throw Error('用語 ID が重複しています。');
  const definitions = new Set<string>(), counts: Record<string, number> = {};
  for (const term of data.terms) {
    if (!term.heading || !term.definitions.length) throw Error('用語の情報が不足しています。');
    for (const definition of term.definitions) {
      const source = data.manifest.documents[definition.source];
      if (!source || definition.heading !== term.heading || !definition.english || !definition.japanese?.trim() ||
          !definition.review?.status || !/^[a-f0-9]{64}$/.test(definition.hash) || definitions.has(definition.id) ||
          definition.sourceUrl !== `${source.url}#${source.glossaryAnchor}`) throw Error(`定義の情報が不正です：${term.heading}`);
      definitions.add(definition.id); counts[definition.source] = (counts[definition.source] || 0) + 1;
      let end = 0;
      for (const reference of definition.references) {
        if (!ids.has(reference.target) || !['explicit', 'lexical'].includes(reference.kind) ||
            !Number.isInteger(reference.start) || !Number.isInteger(reference.end) || reference.start < end || reference.end <= reference.start ||
            reference.end > Array.from(definition.english).length || textSlice(definition.english, reference.start, reference.end) !== reference.phrase) {
          throw Error(`参照根拠が不正です：${term.heading}`);
        }
        end = reference.end;
      }
    }
  }
  for (const [id, source] of Object.entries(data.manifest.documents)) {
    if (counts[id] !== source.definitionCount) throw Error(`原典の定義数と一致しません：${id}`);
  }
  return data;
}
