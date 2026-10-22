import { clusteringMethods, layoutMethods, parameters, type ClusteringMethod, type LayoutMethod } from '../analysis/methods.ts';
import type { Corpus } from '../model.ts';
export interface ExplorerState {
  clustering: ClusteringMethod;
  layout: LayoutMethod;
  selectedTerm: string | null;
  scope: 'all' | 'local';
  source: string;
  settings: Partial<Record<LayoutMethod, Record<string, number>>>;
}
export const defaultState: ExplorerState = { clustering: 'louvain', layout: 'grouped', selectedTerm: null, scope: 'all', source: '', settings: {} };
export function normalizeState(data: Corpus, state: Partial<ExplorerState> = {}): ExplorerState {
  const result = { ...defaultState, ...state, settings: {} as ExplorerState['settings'] };
  if (!clusteringMethods.some(method => method.id === result.clustering)) result.clustering = defaultState.clustering;
  if (!layoutMethods.some(method => method.id === result.layout)) result.layout = defaultState.layout;
  if (!data.terms.some(term => term.id === result.selectedTerm)) result.selectedTerm = null;
  if (!data.manifest.documents[result.source]) result.source = '';
  if (result.scope !== 'local' || !result.selectedTerm) result.scope = 'all';
  for (const method of layoutMethods) {
    if (!state.settings?.[method.id]) continue;
    try { result.settings[method.id] = parameters(method, state.settings[method.id]); } catch { /* Invalid URL settings revert to defaults. */ }
  }
  return result;
}
