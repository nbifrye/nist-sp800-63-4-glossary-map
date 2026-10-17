import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildData } from '../scripts/build-data.ts';
import { extract, digest } from '../scripts/extract.ts';
import { references } from '../scripts/references.ts';
import { aggregateEdges, analysisGraph, validateCorpus, textSlice, filterTerms } from '../src/model.ts';

test('extract paragraphs, lists, links and per-occurrence emphasis without dropping Unicode', () => {
  const [definition] = extract('<h1 id="def">Glossary</h1><dl><dt>example</dt><dd><p>😀 <em>account</em> and account.</p><ul><li>One</li><li>Two &amp; three</li></ul><a href="#def">account</a></dd></dl><h1>Other</h1><dl><dt>excluded</dt><dd>Ignored</dd></dl>', 'test', 'https://example.org/source.html', 'def');
  assert.equal(definition.english, '😀 account and account. One Two & three account');
  assert.equal(definition.hash, digest(definition.english));
  assert.deepEqual(definition.emphasis, [{ start: 2, end: 9, text: 'account' }]);
  assert.equal(definition.links[0].url, 'https://example.org/source.html#def');
  assert.equal(textSlice(definition.english, 2, 9), 'account');
});

test('longest bounded matches, plurals, directives, italics and acronym exclusion', () => {
  const base = { heading: 'test', source: 'test', sourceUrl: '', hash: '', links: [], emphasis: [] };
  const terms = [{ id: 'mfa', heading: 'multi-factor authentication (MFA)' }, { id: 'auth', heading: 'authentication' }, { id: 'person', heading: 'person' }];
  const refs = references({ ...base, english: '😀 Multi-factor authentication and people. See authentication. MFA pre-authentication.' }, terms);
  assert.deepEqual(refs.map(r => [r.target, r.kind]), [['mfa', 'lexical'], ['person', 'lexical'], ['auth', 'explicit']]);
  assert.equal(refs[0].start, 2);
  const italic = references({ ...base, english: 'authentication and authentication', emphasis: [{ start: 0, end: 14, text: 'authentication' }] }, terms);
  assert.deepEqual(italic.map(r => r.kind), ['explicit', 'lexical']);
});

test('saved sources reproduce complete reviewed definitions and preserve every evidence occurrence', async () => {
  const data = await buildData();
  assert.deepEqual(await buildData(), data);
  for (const term of data.terms) for (const definition of term.definitions) {
    assert.equal(digest(definition.english), definition.hash);
    for (const reference of definition.references) assert.equal(textSlice(definition.english, reference.start, reference.end), reference.phrase);
  }
  const occurrences = data.terms.flatMap(term => term.definitions).reduce((sum, d) => sum + d.references.length, 0);
  assert.equal(aggregateEdges(data).reduce((sum, edge) => sum + edge.entries.length, 0), occurrences);
  assert.equal(data.terms.flatMap(term => term.definitions).length, Object.values(data.manifest.documents).reduce((sum, source) => sum + source.definitionCount, 0));
  assert.equal(filterTerms(data.terms, 'MFA').length, 0);
  const broken = structuredClone(data); broken.terms[0].definitions[0].references[0].target = 'missing';
  assert.throws(() => validateCorpus(broken), /参照根拠/);
  const missingSource = structuredClone(data); delete missingSource.manifest.documents['sp800-63c'];
  assert.throws(() => validateCorpus(missingSource), /原典文書/);
  assert.ok(data.reviews.some(event => event.definitionHashes?.length));
});

test('source HTML hashes detect accidental changes before extracting data', async () => {
  const manifest = JSON.parse(await readFile(new URL('../sources/manifest.json', import.meta.url), 'utf8'));
  for (const [id, source] of Object.entries(manifest.documents) as [string, { sha256: string }][]) {
    assert.equal(digest(await readFile(new URL(`../sources/${id}.html`, import.meta.url))), source.sha256);
  }
});

test('analysis uses only matching source and reference evidence while retaining isolated terms', async () => {
  const data = await buildData(), original = structuredClone(data);
  const all = analysisGraph(data);
  for (const source of ['', ...Object.keys(data.manifest.documents)]) for (const kind of ['', 'explicit', 'lexical']) {
    const expected = new Set<string>();
    for (const term of data.terms) for (const definition of term.definitions) {
      if (source && definition.source !== source) continue;
      for (const reference of definition.references) {
        if ((!kind || reference.kind === kind) && term.id !== reference.target) expected.add(JSON.stringify([term.id, reference.target]));
      }
    }
    const graph = analysisGraph(data, { source, kind });
    assert.deepEqual(graph.ids, all.ids);
    assert.equal(graph.pairs.length, expected.size);
    assert.deepEqual(new Set(graph.pairs.map(pair => JSON.stringify(pair))), expected);
  }
  const empty = structuredClone(data);
  for (const term of empty.terms) for (const definition of term.definitions) definition.references = [];
  assert.deepEqual(analysisGraph(empty, { source: 'sp800-63a', kind: 'explicit' }), { ids: all.ids, pairs: [] });
  assert.deepEqual(data, original);
});
