import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root } from './build-data.ts';
import { extract, digest } from './extract.ts';
import type { Corpus } from '../src/model.ts';

const manifest = JSON.parse(await readFile(resolve(root, 'sources/manifest.json'), 'utf8')) as Corpus['manifest'];
const report = [];
for (const [source, metadata] of Object.entries(manifest.documents)) {
  try {
    const response = await fetch(metadata.url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const raw = new Uint8Array(await response.arrayBuffer());
    const fresh = new Map(extract(new TextDecoder().decode(raw), source, metadata.url, metadata.glossaryAnchor).map(definition => [definition.heading, definition.hash]));
    const old = new Map(extract(await readFile(resolve(root, `sources/${source}.html`), 'utf8'), source, metadata.url, metadata.glossaryAnchor).map(definition => [definition.heading, definition.hash]));
    const added = [...fresh.keys()].filter(key => !old.has(key));
    const removed = [...old.keys()].filter(key => !fresh.has(key));
    const changed = [...fresh.keys()].filter(key => old.has(key) && old.get(key) !== fresh.get(key));
    report.push({ source, htmlChanged: digest(raw) !== metadata.sha256, added, removed, changed });
    if (added.length || removed.length || changed.length) process.exitCode = 1;
  } catch (error) {
    report.push({ source, error: String(error) }); process.exitCode = 1;
  }
}
console.log(JSON.stringify(report, null, 2));
