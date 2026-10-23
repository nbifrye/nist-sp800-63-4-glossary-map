import { searchHeading, textSlice, type Definition, type Reference, type Term } from '../src/model.ts';
import type { Extracted } from './extract.ts';

export interface ImplicitRules {
  rules: string[];
  roleNouns: string[];
  exclusions: { rule: string; context: string; reason: string }[];
}
export const noImplicitRules: ImplicitRules = { rules: [], roleNouns: [], exclusions: [] };

export function forms(heading: string): string[] {
  const base = searchHeading(heading), last = base.split(' ').at(-1)!;
  const irregular: Record<string, string> = { person: 'people', child: 'children', man: 'men', woman: 'women' };
  let variant: string;
  if (irregular[last]) variant = base.slice(0, -last.length) + irregular[last];
  else if (last.endsWith('ies')) variant = base.slice(0, -3) + 'y';
  else if (last.endsWith('s') && !last.endsWith('ss') && !last.endsWith('us')) variant = base.slice(0, -1);
  else if (/[^aeiou]y$/.test(last)) variant = base.slice(0, -1) + 'ies';
  else if (/(s|x|ch|sh)$/.test(last)) variant = base + 'es';
  else variant = base + 's';
  return variant === base ? [base] : [base, variant];
}

const acronym = (heading: string) => heading.match(/\s+\(([A-Za-z0-9/-]+)\)$/)?.[1];
const escape = (form: string) => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
const bounded = (forms: string[], flags: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${forms.map(escape).join('|')})(?![\\p{L}\\p{N}_-])`, flags);

// Phrases the source marks as references come first. Unmarked phrases are added
// only where they plainly name a term: the heading's own acronym, a multi-word
// heading, or a listed role noun. Other bare words (subject, controls) stay out.
export function references(definition: Extracted | Definition, terms: Pick<Term, 'id' | 'heading'>[], implicit = noImplicitRules): Reference[] {
  // Unmarked mentions of the defined term itself block shorter overlapping matches but are not kept.
  const explicit: Reference[] = [], unmarked: Reference[] = [], mentions = new Set<Reference>();
  const lower = definition.english.toLowerCase();
  const excluded = (rule: string, index: number, length: number) => implicit.exclusions.some(exclusion => {
    if (exclusion.rule !== rule) return false;
    const context = exclusion.context.toLowerCase();
    for (let at = lower.indexOf(context); at >= 0; at = lower.indexOf(context, at + 1)) {
      if (at <= index && index + length <= at + context.length) return true;
    }
    return false;
  });
  for (const term of terms) {
    const short = acronym(term.heading), words = searchHeading(term.heading).split(' ').length;
    const rule = words > 1 ? 'multiword-heading' : implicit.roleNouns.includes(term.heading) ? 'role-noun' : null;
    const patterns: [RegExp, string | null][] = [[bounded(forms(term.heading), 'giu'), rule && implicit.rules.includes(rule) ? rule : null]];
    if (short && implicit.rules.includes('heading-acronym')) patterns.push([bounded([short, short + 's'], 'gu'), 'heading-acronym']);
    for (const [pattern, implicitRule] of patterns) for (const match of definition.english.matchAll(pattern)) {
      const start = Array.from(definition.english.slice(0, match.index)).length, end = start + Array.from(match[0]).length;
      const phrase = textSlice(definition.english, start, end), prefix = textSlice(definition.english, 0, start);
      const directive = /\b(?:See(?: also)?|Synonymous with)\s+[^.!?]*$/i.test(prefix);
      const linked = definition.links.some(link => link.text.toLowerCase() === phrase.toLowerCase() && /#(?:def|term-)/.test(link.url));
      const sourceEmphasis = definition.emphasis.some(span => span.start <= start && end <= span.end);
      if (implicitRule !== 'heading-acronym' && (directive || linked || sourceEmphasis)) {
        explicit.push({ target: term.id, start, end, phrase, sourceEmphasis,
          rule: directive ? 'see-directive' : linked ? 'glossary-link' : 'source-italic' });
      } else if (implicitRule && !excluded(implicitRule, match.index!, match[0].length)) {
        const reference = { target: term.id, start, end, phrase, sourceEmphasis, rule: implicitRule };
        unmarked.push(reference);
        if (term.heading === definition.heading) mentions.add(reference);
      }
    }
  }
  const order = (a: Reference, b: Reference) => (b.end - b.start) - (a.end - a.start) || a.start - b.start || a.target.localeCompare(b.target);
  const chosen: Reference[] = [];
  for (const candidate of [...explicit.sort(order), ...unmarked.sort(order)]) {
    if (chosen.some(reference => reference.start < candidate.end && candidate.start < reference.end)) continue;
    chosen.push(candidate);
  }
  return chosen.filter(reference => !mentions.has(reference)).sort((a, b) => a.start - b.start);
}
