import { mkdir, copyFile, cp, readFile, readdir, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { root } from './build-data.ts';

const files = ['glossary-map.js', 'glossary-map.css'];
async function fingerprint(directory: string) {
  const hasher = createHash('sha256');
  for (const file of files) hasher.update(await readFile(resolve(directory, file)));
  return hasher.digest('hex').slice(0, 16);
}
export async function packageWidget(workspace = root, freeze = false) {
  const release = await fingerprint(resolve(workspace, 'dist-widget'));
  const destination = freeze ? resolve(workspace, 'releases', release) : resolve(workspace, 'dist/widget');
  let exists = false;
  try { await access(destination); exists = true; } catch { /* New release. */ }
  if (!freeze || !exists) {
    await mkdir(destination, { recursive: true });
    for (const file of files) await copyFile(resolve(workspace, 'dist-widget', file), resolve(destination, file));
    await writeFile(resolve(destination, 'example.html'), `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Glossary Map widget</title><link rel="stylesheet" href="./glossary-map.css"><style>body{margin:0}#map{height:100dvh;min-height:600px}</style></head>
<body><main id="map"></main><script src="./glossary-map.js"></script><script>
window.demo = GlossaryMap.mount(document.getElementById('map'), { initialState: { clustering: 'louvain', layout: 'grouped' } });
</script></body></html>\n`);
    await writeFile(resolve(destination, 'release.json'), JSON.stringify({ release, version: JSON.parse(await readFile(resolve(workspace, 'package.json'), 'utf8')).version, files }, null, 2) + '\n');
  }
  let releases: string[] = [];
  try { releases = await readdir(resolve(workspace, 'releases')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  for (const name of releases.filter(name => /^[a-f0-9]{16}$/.test(name))) {
    const source = resolve(workspace, 'releases', name);
    if (await fingerprint(source) !== name) throw Error(`固定版の内容と識別子が一致しません：${name}`);
    if (!freeze) await cp(source, resolve(workspace, 'dist/releases', name), { recursive: true });
  }
  return release;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const freeze = process.argv.includes('--freeze');
  console.log(`${freeze ? 'Frozen' : 'Packaged'} widget ${await packageWidget(root, freeze)}`);
}
