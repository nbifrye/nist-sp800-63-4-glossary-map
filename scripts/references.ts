import { searchHeading, textSlice, type Definition, type Reference, type Term } from '../src/model.ts';
import type { Extracted } from './extract.ts';

export function forms(heading: string): { form: string; singularized: boolean }[] {
  const base = searchHeading(heading), last = base.split(' ').at(-1)!;
  const irregular: Record<string, string> = { person: 'people', child: 'children', man: 'men', woman: 'women' };
  let variant: string, singularized = false;
  if (irregular[last]) variant = base.slice(0, -last.length) + irregular[last];
  else if (last.endsWith('ies')) { variant = base.slice(0, -3) + 'y'; singularized = true; }
  else if (last.endsWith('s') && !last.endsWith('ss') && !last.endsWith('us')) { variant = base.slice(0, -1); singularized = true; }
  else if (/[^aeiou]y$/.test(last)) variant = base.slice(0, -1) + 'ies';
  else if (/(s|x|ch|sh)$/.test(last)) variant = base + 'es';
  else variant = base + 's';
  return variant === base ? [{ form: base, singularized: false }] : [{ form: base, singularized: false }, { form: variant, singularized }];
}

export function references(definition: Extracted | Definition, terms: Pick<Term, 'id' | 'heading'>[]): Reference[] {
  const candidates: { start: number; end: number; target: string; singularized: boolean }[] = [];
  for (const term of terms) for (const { form, singularized } of forms(term.heading)) {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_-])${escaped}(?![\\p{L}\\p{N}_-])`, 'giu');
    for (const match of definition.english.matchAll(pattern)) {
      const start = Array.from(definition.english.slice(0, match.index)).length;
      candidates.push({ start, end: start + Array.from(match[0]).length, target: term.id, singularized });
    }
  }
  candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start || a.target.localeCompare(b.target));
  const chosen: Reference[] = [];
  for (const { singularized, ...candidate } of candidates) {
    const { start, end } = candidate;
    if (chosen.some(reference => reference.start < end && start < reference.end)) continue;
    const phrase = textSlice(definition.english, start, end), prefix = textSlice(definition.english, 0, start);
    const directive = /\b(?:See(?: also)?|Synonymous with)\s+[^.!?]*$/i.test(prefix);
    const linked = definition.links.some(link => link.text.toLowerCase() === phrase.toLowerCase() && /#(?:def|term-)/.test(link.url));
    const sourceEmphasis = definition.emphasis.some(span => span.start <= start && end <= span.end);
    if (singularized && !(directive || linked || sourceEmphasis)) continue;
    chosen.push({ ...candidate, phrase, sourceEmphasis, kind: directive || linked || sourceEmphasis ? 'explicit' : 'lexical',
      rule: directive ? 'see-directive' : linked ? 'glossary-link' : sourceEmphasis ? 'source-italic' : 'heading-longest-boundary-v3' });
  }
  return chosen.sort((a, b) => a.start - b.start);
}
