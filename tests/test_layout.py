import hashlib
import json
import sys
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from layout import create_layout,communities

class LayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=json.loads((ROOT/'data/glossary.json').read_text())
        cls.layout=json.loads((ROOT/'data/layout.json').read_text())
    def test_every_term_and_membership_exactly_once(self):
        ids={t['id'] for t in self.data['terms']}
        self.assertEqual({n['id'] for n in self.layout['nodes']},ids)
        members=[i for c in self.layout['clusters'] for i in c['members']]
        self.assertEqual(len(members),len(ids))
        self.assertEqual(set(members),ids)
        self.assertEqual(self.layout['corpusSha256'],hashlib.sha256((ROOT/'data/glossary.json').read_bytes()).hexdigest())
    def test_layout_reproducibility_and_separation(self):
        expected=dict(self.layout);expected.pop('corpusSha256')
        self.assertEqual(create_layout(self.data),expected)
        import math
        nodes=self.layout['nodes']
        for i,a in enumerate(nodes):
            for b in nodes[i+1:]:self.assertGreater(math.hypot(a['x']-b['x'],a['y']-b['y']),35)
    def test_modularity_against_corpus(self):
        pairs={tuple(sorted((t['id'],r['target']))) for t in self.data['terms'] for d in t['definitions'] for r in d['references'] if t['id']!=r['target']}
        self.assertEqual(len(pairs),self.layout['undirectedPairs'])
        degree={n['id']:0 for n in self.layout['nodes']}
        for a,b in pairs:degree[a]+=1;degree[b]+=1
        m=len(pairs)
        q=0
        for c in self.layout['clusters']:
            members=set(c['members'])
            q+=sum(a in members and b in members for a,b in pairs)/m-(sum(degree[i] for i in members)/(2*m))**2
        self.assertAlmostEqual(q,self.layout['modularity'],places=6)
        self.assertGreater(q,.4)
    def test_known_cliques_and_isolated_node(self):
        ids=list('abcdefz');pairs=[tuple(sorted((a,b))) for group in ['abc','def'] for i,a in enumerate(group) for b in group[i+1:]]+[('c','d')]
        groups,q=communities(ids,pairs)
        self.assertEqual({frozenset(g) for g in groups},{frozenset('abc'),frozenset('def'),frozenset('z')})
        self.assertGreater(q,0)

if __name__=='__main__':unittest.main()
