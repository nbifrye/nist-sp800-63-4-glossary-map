import type { Corpus } from '../model.ts';
import { normalizeState, type ExplorerState } from '../explorer/state.ts';
export interface SiteState { view: 'graph'; graph: ExplorerState }
export function readState(url: URL, data: Corpus): SiteState {
  const params = url.searchParams;
  let settings: ExplorerState['settings'] = {};
  try { const parsed = JSON.parse(params.get('settings') || '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) settings = parsed; } catch { /* Unknown URL state uses defaults. */ }
  return {
    view: 'graph',
    graph: normalizeState(data, { selectedTerm: params.get('term'), clustering: params.get('cluster') as ExplorerState['clustering'], layout: params.get('layout') as ExplorerState['layout'], scope: params.get('scope') as ExplorerState['scope'], source: params.get('source') || '', kind: params.get('kind') || '', settings }),
  };
}
export function stateUrl(url: URL, state: SiteState): URL {
  const result = new URL(url); result.search = ''; result.hash = '';
  const pairs: [string, string | null][] = [['term', state.graph.selectedTerm], ['cluster', state.graph.clustering], ['layout', state.graph.layout], ['scope', state.graph.scope === 'all' ? '' : 'local'], ['source', state.graph.source], ['kind', state.graph.kind], ['settings', Object.keys(state.graph.settings).length ? JSON.stringify(state.graph.settings) : '']];
  for (const [key, value] of pairs) if (value) result.searchParams.set(key, value);
  return result;
}
