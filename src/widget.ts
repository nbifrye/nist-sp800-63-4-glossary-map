import corpus from './generated/corpus.json';
import { mountExplorer, type ExplorerOptions } from './explorer/explorer.ts';
import type { Corpus } from './model.ts';
import { version } from '../package.json';
// A fixed release bundles the corpus, algorithms and inline worker together.
export function mount(container: HTMLElement, options: Omit<ExplorerOptions, 'data'> = {}) {
  return mountExplorer(container, { ...options, data: corpus as Corpus, embedded: options.embedded ?? true });
}
export { version };
