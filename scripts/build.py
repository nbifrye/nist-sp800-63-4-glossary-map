#!/usr/bin/env python3
"""Offline, deterministic extraction of the four saved NIST final HTML glossaries."""
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
DOCS = [('sp800-63', 'SP 800-63-4', 'def'), ('sp800-63a', 'SP 800-63A-4', 'def-and-acr'), ('sp800-63b', 'SP 800-63B-4', 'def-and-acr'), ('sp800-63c', 'SP 800-63C-4', 'def-and-acr')]

def normalize(text):
    return re.sub(r'\s+', ' ', text).strip()

def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()

class Element:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []
    def text(self):
        # Spaces at block boundaries preserve every paragraph/list item.
        return ''.join(c if isinstance(c, str) else (' ' if c.tag in ('p', 'li', 'br') else '') + c.text() + (' ' if c.tag in ('p', 'li') else '') for c in self.children)
    def all(self, tag):
        for c in self.children:
            if isinstance(c, Element):
                if c.tag == tag:
                    yield c
                yield from c.all(tag)

class Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Element()
        self.stack = [self.root]
    def handle_starttag(self, tag, attrs):
        el = Element(tag, attrs)
        self.stack[-1].children.append(el)
        if tag not in ('br', 'hr', 'img', 'meta', 'link', 'input', 'source', 'wbr', 'area', 'base', 'embed', 'param', 'col'):
            self.stack.append(el)
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self.stack[-1].tag == tag:
            self.stack.pop()
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i].tag == tag:
                self.stack = self.stack[:i]
                break
    def handle_data(self, text):
        self.stack[-1].children.append(text)


def emphasis_spans(node):
    chunks = []
    def visit(el, emphasized=False):
        emphasized = emphasized or el.tag == 'em'
        for c in el.children:
            if isinstance(c, str):
                chunks.extend((ch, emphasized) for ch in c)
            else:
                if c.tag in ('p', 'li', 'br'):
                    chunks.append((' ', False))
                visit(c, emphasized)
                if c.tag in ('p', 'li'):
                    chunks.append((' ', False))
    visit(node)
    chars = []
    pending_space = False
    for ch, emphasized in chunks:
        if ch.isspace():
            pending_space = bool(chars)
        else:
            if pending_space:
                chars.append((' ', chars[-1][1] and emphasized))
                pending_space = False
            chars.append((ch, emphasized))
    spans = []
    start = None
    for i, (ch, active) in enumerate(chars + [('', False)]):
        if active and start is None:
            start = i
        if start is not None and not active:
            spans.append({'start':start,'end':i,'text':''.join(x[0] for x in chars[start:i])})
            start = None
    return spans


def extract(stem, label, section):
    path = ROOT / 'sources' / f'{stem}.html'
    parser = Parser()
    parser.feed(path.read_text())
    nodes = []
    def walk(el):
        nodes.append(el)
        for child in el.children:
            if isinstance(child, Element):
                walk(child)
    walk(parser.root)
    start = next(i for i,n in enumerate(nodes) if n.tag == 'h1' and n.attrs.get('id') == section)
    end = next((i for i in range(start+1, len(nodes)) if nodes[i].tag == 'h1'), len(nodes))
    entries = []
    current = None
    url = f'https://pages.nist.gov/800-63-4/{stem}.html'
    for n in nodes[start+1:end]:
        if n.tag == 'dt':
            if current is not None:
                raise ValueError('Heading without definition')
            current = normalize(n.text())
        if n.tag == 'dd':
            if current is None:
                raise ValueError('Definition without heading')
            english = normalize(n.text())
            entries.append({'heading': current, 'english': english, 'source': stem,
                            'sourceUrl': url + '#' + section, 'hash': digest(english),
                            'emphasis': emphasis_spans(n),
                            'links': [{'text': normalize(a.text()), 'url': urljoin(url, a.attrs.get('href', ''))} for a in n.all('a')]})
            current = None
    if current or not entries:
        raise ValueError('Incomplete glossary')
    return entries


def inventory():
    return [entry for args in DOCS for entry in extract(*args)]


def base_heading(heading):
    # Parenthesized uppercase acronyms are not matching/search aliases.
    return re.sub(r'\s+\([A-Za-z0-9/-]+\)$', '', heading).casefold()


def forms(heading):
    base = base_heading(heading)
    irregular = {'person': 'people', 'child': 'children', 'man': 'men', 'woman': 'women'}
    result = {base}
    last = base.split()[-1]
    if last in irregular:
        result.add(base[:-len(last)] + irregular[last])
    elif last.endswith('ies'):
        result.add(base[:-3] + 'y')
    elif last.endswith('s') and not last.endswith(('ss', 'us')):
        result.add(base[:-1])
    elif last.endswith('y') and len(last) > 1 and last[-2] not in 'aeiou':
        result.add(base[:-1] + 'ies')
    elif last.endswith(('s', 'x', 'ch', 'sh')):
        result.add(base + 'es')
    else:
        result.add(base + 's')
    return result


def references(definition, terms):
    candidates = []
    for term in terms:
        for form in forms(term['heading']):
            pattern = r'(?<![\w-])' + re.escape(form).replace(r'\ ', r'\s+') + r'(?![\w-])'
            for match in re.finditer(pattern, definition['english'], re.I):
                candidates.append((match.start(), match.end(), term['id'], form))
    # Longest phrase wins at each position; never emit its nested components.
    chosen = []
    occupied = set()
    for start, end, target, form in sorted(candidates, key=lambda c: (-(c[1]-c[0]), c[0], c[2])):
        if occupied.intersection(range(start, end)):
            continue
        occupied.update(range(start, end))
        phrase = definition['english'][start:end]
        prefix = definition['english'][:start]
        explicit = bool(re.search(r'\b(?:See(?: also)?|Synonymous with)\s+[^.!?]*$', prefix, re.I))
        linked = next((a for a in definition['links'] if a['text'].casefold() == phrase.casefold() and ('#def' in a['url'] or '#term-' in a['url'])), None)
        chosen.append({'target': target, 'start': start, 'end': end, 'phrase': phrase,
                       'kind': 'explicit' if explicit or linked else 'lexical',
                       'rule': 'see-directive' if explicit else 'glossary-link' if linked else 'heading-longest-boundary-v1',
                       'sourceEmphasis': any(em['start'] <= start and end <= em['end'] for em in definition['emphasis'])})
    return sorted(chosen, key=lambda c: c['start'])


def build():
    entries = inventory()
    translations = json.loads((ROOT / 'data/translations.json').read_text())
    manifest = json.loads((ROOT / 'sources/manifest.json').read_text())
    terms = []
    by_heading = {}
    for entry in entries:
        heading = entry['heading']
        if heading not in by_heading:
            term = {'id': 'term-' + digest(heading)[:12], 'heading': heading, 'definitions': []}
            by_heading[heading] = term
            terms.append(term)
        translation = translations[entry['hash']]
        if translation['english'] != entry['english'] or not translation['japanese'].strip():
            raise ValueError('Stale or empty translation: ' + heading)
        definition = dict(entry, id=entry['source'] + ':' + by_heading[heading]['id'], japanese=translation['japanese'], review=translation['review'])
        by_heading[heading]['definitions'].append(definition)
    terms.sort(key=lambda t: t['heading'].casefold())
    for term in terms:
        for d in term['definitions']:
            d['references'] = references(d, terms)
    for stem, _, _ in DOCS:
        if manifest['documents'][stem]['sha256'] != hashlib.sha256((ROOT / 'sources' / f'{stem}.html').read_bytes()).hexdigest():
            raise ValueError('Source changed without manifest update: ' + stem)
    result = {'schemaVersion': 1, 'mappingVersion': 'heading-longest-boundary-v1', 'manifest': manifest, 'terms': terms}
    (ROOT / 'data/glossary.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(terms)} terms, {len(entries)} definitions, {sum(len(d["references"]) for t in terms for d in t["definitions"])} reference occurrences')

if __name__ == '__main__':
    import sys
    if '--inventory' in sys.argv:
        unique = {e['hash']: {'english': e['english'], 'heading': e['heading']} for e in inventory()}
        print(json.dumps(unique, ensure_ascii=False, indent=2))
    else:
        build()
