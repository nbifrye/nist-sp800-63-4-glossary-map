import { createHash } from 'node:crypto';
import { parse } from 'parse5';
import type { Definition } from '../src/model.ts';

interface HtmlNode { nodeName: string; value?: string; attrs?: { name: string; value: string }[]; childNodes?: HtmlNode[] }
export type Extracted = Omit<Definition, 'id' | 'japanese' | 'review' | 'references'>;
export const digest = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');
export const normalize = (text: string) => text.replace(/\s+/gu, ' ').trim();
const attribute = (node: HtmlNode, name: string) => node.attrs?.find(attr => attr.name === name)?.value;
const block = new Set(['p', 'li', 'br']);

function flatten(node: HtmlNode, emphasized = false): [string, boolean][] {
  const result: [string, boolean][] = [];
  emphasized ||= node.nodeName === 'em';
  if (node.nodeName === '#text') return Array.from(node.value || '', char => [char, emphasized]);
  for (const child of node.childNodes || []) {
    if (block.has(child.nodeName)) result.push([' ', false]);
    result.push(...flatten(child, emphasized));
    if (block.has(child.nodeName)) result.push([' ', false]);
  }
  return result;
}
function normalizedChars(node: HtmlNode): [string, boolean][] {
  const chars: [string, boolean][] = [];
  let space = false;
  for (const [char, emphasis] of flatten(node)) {
    if (/\s/u.test(char)) space = chars.length > 0;
    else {
      if (space) chars.push([' ', chars.at(-1)![1] && emphasis]);
      chars.push([char, emphasis]); space = false;
    }
  }
  return chars;
}
const text = (node: HtmlNode) => normalizedChars(node).map(([char]) => char).join('');
function* walk(node: HtmlNode): Generator<HtmlNode> {
  yield node;
  for (const child of node.childNodes || []) yield* walk(child);
}

export function extract(html: string, source: string, url: string, anchor: string): Extracted[] {
  const nodes = [...walk(parse(html) as unknown as HtmlNode)];
  const start = nodes.findIndex(node => node.nodeName === 'h1' && attribute(node, 'id') === anchor);
  if (start < 0) throw Error(`用語集の節がありません：${source}`);
  let heading: string | null = null;
  const definitions: Extracted[] = [];
  for (const node of nodes.slice(start + 1)) {
    if (node.nodeName === 'h1') break;
    if (node.nodeName === 'dt') {
      if (heading !== null) throw Error('定義のない見出しがあります。');
      heading = text(node);
    }
    if (node.nodeName !== 'dd') continue;
    if (!heading) throw Error('見出しのない定義があります。');
    const chars = normalizedChars(node), english = chars.map(([char]) => char).join('');
    const emphasis: Definition['emphasis'] = [];
    let span: number | null = null;
    for (let i = 0; i <= chars.length; i++) {
      if (chars[i]?.[1] && span === null) span = i;
      if (!chars[i]?.[1] && span !== null) {
        emphasis.push({ start: span, end: i, text: chars.slice(span, i).map(([char]) => char).join('') }); span = null;
      }
    }
    definitions.push({ heading, english, source, sourceUrl: `${url}#${anchor}`, hash: digest(english), emphasis,
      links: [...walk(node)].filter(node => node.nodeName === 'a').map(node => ({ text: text(node), url: new URL(attribute(node, 'href') || '', url).href })) });
    heading = null;
  }
  if (heading !== null || !definitions.length) throw Error(`用語集が不完全です：${source}`);
  return definitions;
}
