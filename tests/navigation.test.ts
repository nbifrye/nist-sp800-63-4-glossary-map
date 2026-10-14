import test from 'node:test';
import assert from 'node:assert/strict';
import { buildData } from '../scripts/build-data.ts';
import { readState, stateUrl } from '../src/site/navigation.ts';
import { defaultState } from '../src/explorer/state.ts';
test('URLs round trip algorithm settings and selections, and reject untrusted parameters', async () => {
  const data = await buildData(), url = new URL('https://example.org/project/');
  const state = { view: 'graph' as const, query: 'identity', graph: { ...defaultState, layout: 'force' as const, clustering: 'flow' as const, selectedTerm: data.terms[0].id, settings: { force: { iterations: 20, repulsion: 2, seed: 9 } } } };
  assert.deepEqual(readState(stateUrl(url, state), data), state);
  const malicious = readState(new URL('https://example.org/?view=oops&cluster=oops&layout=oops&term=missing&scope=local&settings={"force":{"iterations":-1}}'), data);
  assert.equal(malicious.view, 'reader'); assert.deepEqual(malicious.graph, defaultState);
});
