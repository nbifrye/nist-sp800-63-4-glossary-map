import test from 'node:test';
import assert from 'node:assert/strict';
import { buildData } from '../scripts/build-data.ts';
import { readState, stateUrl } from '../src/site/navigation.ts';
import { defaultState } from '../src/explorer/state.ts';
test('URLs round trip algorithm settings and selections, and reject untrusted parameters', async () => {
  const data = await buildData(), url = new URL('https://example.org/project/');
  const state = { view: 'graph' as const, graph: { ...defaultState, layout: 'force' as const, clustering: 'flow' as const, selectedTerm: data.terms[0].id, settings: { force: { iterations: 20, repulsion: 2, seed: 9 } } } };
  assert.deepEqual(readState(stateUrl(url, state), data), state);
  const malicious = readState(new URL('https://example.org/?view=oops&cluster=oops&layout=oops&term=missing&scope=local&settings={"force":{"iterations":-1}}'), data);
  assert.equal(malicious.view, 'graph'); assert.deepEqual(malicious.graph, defaultState);
});

test('legacy page links open the graph and retain the selected term', async () => {
  const data = await buildData();
  for (const view of ['', 'reader', 'about', 'graph']) {
    const state = readState(new URL(`https://example.org/?view=${view}&term=${data.terms[0].id}`), data);
    assert.equal(state.view, 'graph'); assert.equal(state.graph.selectedTerm, data.terms[0].id);
    assert.equal(stateUrl(new URL('https://example.org/'), state).searchParams.has('view'), false);
  }
});
