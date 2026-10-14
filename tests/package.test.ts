import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { packageWidget } from '../scripts/package-widget.ts';

test('frozen article bundles survive subsequent builds and detect accidental edits', async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), 'glossary-package-'));
  try {
    await mkdir(resolve(workspace, 'dist-widget'));
    await writeFile(resolve(workspace, 'package.json'), '{"version":"2.0.0"}');
    await writeFile(resolve(workspace, 'dist-widget/glossary-map.js'), 'first');
    await writeFile(resolve(workspace, 'dist-widget/glossary-map.css'), 'css');
    const old = await packageWidget(workspace, true);
    assert.equal(await packageWidget(workspace, true), old);
    await writeFile(resolve(workspace, 'dist-widget/glossary-map.js'), 'second');
    const current = await packageWidget(workspace);
    assert.notEqual(current, old);
    assert.equal(await readFile(resolve(workspace, `dist/releases/${old}/glossary-map.js`), 'utf8'), 'first');
    assert.equal(await readFile(resolve(workspace, 'dist/widget/glossary-map.js'), 'utf8'), 'second');
    await writeFile(resolve(workspace, `releases/${old}/glossary-map.js`), 'accidental edit');
    await assert.rejects(packageWidget(workspace), /固定版/);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});
