import hashlib
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from build import DOCS, inventory, references, forms

class CorpusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / 'data/glossary.json').read_text())
        cls.terms = cls.data['terms']
        cls.defs = [d for t in cls.terms for d in t['definitions']]

    def test_complete_source_inventory(self):
        expected = {'sp800-63':189, 'sp800-63a':89, 'sp800-63b':124, 'sp800-63c':94}
        for stem, _, anchor in DOCS:
            raw = (ROOT / 'sources' / (stem + '.html')).read_text()
            # Independent source section/count check, without using the parser.
            section = re.split(r'<h1\b', raw.split(f'<h1 id="{anchor}"', 1)[1], maxsplit=1)[0]
            self.assertEqual(len(re.findall(r'<dt>', section)), expected[stem])
            self.assertEqual(len(re.findall(r'<dd>', section)), expected[stem])
            actual = [d for d in self.defs if d['source'] == stem]
            self.assertEqual(len(actual), expected[stem])
            # Entire dd payload independently stripped of HTML, including list tails.
            from html import unescape
            english = [re.sub(r'\s+', ' ', unescape(re.sub(r'<[^>]*>', '', re.sub(r'</?(?:p|li|br)\b[^>]*>', ' ', s)))).strip() for s in re.findall(r'<dd>(.*?)</dd>', section, re.S)]
            # Inline tags do not change word spacing in these sources.
            headings = [unescape(re.sub(r'<[^>]*>', '', s)).strip() for s in re.findall(r'<dt>(.*?)</dt>', section, re.S)]
            source_defs = dict(zip(headings, english))
            for a in actual:
                self.assertEqual(a['english'], source_defs[a['heading']])

    def test_originals_and_translations_are_bound(self):
        original = {(d['source'], d['heading']):d for d in inventory()}
        self.assertEqual(len(self.defs),496)
        for d in self.defs:
            self.assertEqual(d['english'], original[d['source'],d['heading']]['english'])
            self.assertEqual(d['hash'],hashlib.sha256(d['english'].encode()).hexdigest())
            self.assertTrue(d['japanese'].strip())
            self.assertEqual(d['review']['status'],'editorial-checked')
            self.assertTrue(d['sourceUrl'].startswith('https://pages.nist.gov/800-63-4/'))

    def test_unique_nodes_and_evidence(self):
        self.assertEqual(len(self.terms),189)
        self.assertEqual(len({t['heading'] for t in self.terms}),189)
        ids = {t['id'] for t in self.terms}
        for d in self.defs:
            occupied = set()
            for r in d['references']:
                self.assertIn(r['target'], ids)
                self.assertEqual(r['phrase'],d['english'][r['start']:r['end']])
                span = set(range(r['start'],r['end']))
                self.assertFalse(occupied & span)
                occupied |= span
                self.assertIn(r['kind'], ('explicit','lexical'))

    def test_boundary_plural_longest_and_acronym_rules(self):
        terms = [{'id':'a','heading':'authenticator'}, {'id':'b','heading':'multi-factor authenticator'}, {'id':'c','heading':'relying party (RP)'}]
        d = {'english':'Multi-factor authenticators, authenticators, RP, relying parties; unauthenticator.', 'links':[], 'emphasis':[]}
        refs = references(d, terms)
        self.assertEqual([(r['phrase'],r['target']) for r in refs], [('Multi-factor authenticators','b'),('authenticators','a'),('relying parties','c')])
        self.assertNotIn('rp',forms('relying party (RP)'))

    def test_emphasis_is_an_explicit_reference(self):
        d = {'english':'An authenticator. See authentication.', 'links':[], 'emphasis':[{'start':3,'end':16,'text':'authenticator'},{'start':22,'end':36,'text':'authentication'}]}
        refs = references(d,[{'id':'a','heading':'authenticator'},{'id':'b','heading':'authentication'}])
        self.assertEqual([r['kind'] for r in refs],['explicit','explicit'])
        self.assertEqual([r['rule'] for r in refs],['source-italic','see-directive'])
        # Classification applies to each occurrence, including plural forms,
        # and requires the whole matched phrase to be inside the italic span.
        text = 'authenticators, authenticator, multi-factor authenticator'
        d = {'english':text, 'links':[], 'emphasis':[
            {'start':0,'end':14,'text':text[:14]},
            {'start':text.rindex('authenticator'),'end':len(text),'text':'authenticator'}]}
        refs = references(d,[{'id':'a','heading':'authenticator'},{'id':'b','heading':'multi-factor authenticator'}])
        self.assertEqual([r['kind'] for r in refs],['explicit','lexical','lexical'])
        for definition in self.defs:
            for ref in definition['references']:
                if ref['sourceEmphasis']:
                    self.assertEqual(ref['kind'],'explicit')

    def test_multiple_explicit_targets_and_occurrence_emphasis(self):
        d = {'english':'See authenticator and authentication.', 'links':[], 'emphasis':[{'start':4,'end':17,'text':'authenticator'}]}
        refs = references(d,[{'id':'a','heading':'authenticator'},{'id':'b','heading':'authentication'}])
        self.assertEqual([r['kind'] for r in refs], ['explicit','explicit'])
        self.assertEqual([r['sourceEmphasis'] for r in refs], [True,False])
        d['english']='Synonymous with authentication.'
        self.assertEqual(references(d,[{'id':'b','heading':'authentication'}])[0]['kind'],'explicit')
        for entry in inventory():
            for span in entry['emphasis']:
                self.assertEqual(entry['english'][span['start']:span['end']],span['text'])

    def test_circular_and_cross_document_references(self):
        terms = {t['heading']:t for t in self.terms}
        for source,target in [('validation','attribute validation'),('attribute validation','validation')]:
            self.assertTrue(any(r['target']==terms[target]['id'] for d in terms[source]['definitions'] for r in d['references']))
        # Corpus-wide target lookup, independent of the source's glossary membership.
        local={'english':'federation authority', 'links':[], 'emphasis':[]}
        self.assertEqual(references(local,self.terms)[0]['target'],terms['federation authority']['id'])

if __name__ == '__main__':
    unittest.main()
