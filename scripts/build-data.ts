import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { digest, extract } from './extract.ts';
import { references } from './references.ts';
import { validateCorpus, type Corpus, type Review, type ReviewEvent, type Term } from '../src/model.ts';

export const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildData(): Promise<Corpus> {
  const manifest = JSON.parse(await readFile(resolve(root, 'sources/manifest.json'), 'utf8')) as Corpus['manifest'];
  const translations = JSON.parse(await readFile(resolve(root, 'content/translations.json'), 'utf8')) as Record<string, { english: string; japanese: string; review: Review }>;
  const reviews = JSON.parse(await readFile(resolve(root, 'content/reviews.json'), 'utf8')) as ReviewEvent[];
  const terms = new Map<string, Term>();
  for (const [source, metadata] of Object.entries(manifest.documents)) {
    const raw = await readFile(resolve(root, `sources/${source}.html`));
    if (digest(raw) !== metadata.sha256) throw Error(`原典と取得記録のハッシュが一致しません：${source}`);
    const definitions = extract(raw.toString('utf8'), source, metadata.url, metadata.glossaryAnchor);
    if (definitions.length !== metadata.definitionCount) throw Error(`原典と取得記録の定義数が一致しません：${source}`);
    const seen = new Set<string>();
    for (const definition of definitions) {
      if (seen.has(definition.heading)) throw Error(`出典内で見出しが重複しています：${definition.heading}`);
      seen.add(definition.heading);
      const translation = translations[definition.hash];
      if (!translation || translation.english !== definition.english || !translation.japanese.trim()) throw Error(`原文に対応する訳文がありません：${definition.heading}`);
      if (!terms.has(definition.heading)) terms.set(definition.heading, { id: 'term-' + digest(definition.heading).slice(0, 12), heading: definition.heading, definitions: [] });
      const term = terms.get(definition.heading)!;
      term.definitions.push({ ...definition, id: `${source}:${term.id}`, japanese: translation.japanese, review: translation.review, references: [] });
    }
  }
  const sorted = [...terms.values()].sort((a, b) => a.heading.localeCompare(b.heading, 'en'));
  for (const term of sorted) for (const definition of term.definitions) definition.references = references(definition, sorted);
  return validateCorpus({ schemaVersion: 2, mappingVersion: 'heading-longest-boundary-v2', manifest, terms: sorted, reviews });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = await buildData();
  await mkdir(resolve(root, 'src/generated'), { recursive: true });
  await writeFile(resolve(root, 'src/generated/corpus.json'), JSON.stringify(data));
  console.log(`${data.terms.length} terms, ${data.terms.reduce((sum, term) => sum + term.definitions.length, 0)} definitions`);
}
