import json
import math
import sys
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
from analysis import strongly_connected, directed_modularity, layered, ranks

class AnalysisTests(unittest.TestCase):
    def test_scc_mutual_reachability_and_dag_levels(self):
        ids = list('abcdefz')
        pairs = [('a','b'),('b','a'),('b','c'),('c','d'),('d','c'),('d','e'),('e','f'),('f','f')]
        groups = strongly_connected(ids, pairs)
        self.assertEqual({frozenset(g) for g in groups}, {frozenset('ab'),frozenset('cd'),frozenset('e'),frozenset('f'),frozenset('z')})
        self.assertEqual(ranks(list('abc'), [('a','b'),('b','c'),('a','c')]), {'a':0,'b':1,'c':2})
        with self.assertRaises(ValueError): ranks(list('ab'), [('a','b'),('b','a')])
    def test_directed_objective_independently_recomputed(self):
        ids = list('abcdefz')
        pairs = {(a,b) for group in ['abc','def'] for a in group for b in group if a != b} | {('c','d')}
        groups, q = directed_modularity(ids, pairs)
        self.assertEqual({frozenset(g) for g in groups}, {frozenset('abc'),frozenset('def'),frozenset('z')})
        m = len(pairs)
        expected = sum((int((a,b) in pairs)-sum(s==a for s,t in pairs)*sum(t==b for s,t in pairs)/m)/m for g in groups for a in g for b in g)
        self.assertAlmostEqual(q, expected)
        self.assertEqual(directed_modularity(ids, []), ([{i} for i in ids], 0.0))
    def test_layering_retains_every_vertex_and_accounts_for_cycles(self):
        ids = list('abcdz'); pairs = [('a','b'),('b','c'),('c','a'),('c','d')]
        positions, stats = layered(ids, pairs)
        self.assertEqual(set(positions),set(ids))
        self.assertEqual(stats['feedbackEdges'],1)
        self.assertLess(positions['a']['rank'],positions['b']['rank'])
        self.assertLess(positions['b']['rank'],positions['c']['rank'])
        self.assertLess(positions['c']['rank'],positions['d']['rank'])
    def test_corpus_variants_cover_nodes_without_collisions_and_condense_direction(self):
        data = json.loads((ROOT/'data/glossary.json').read_text())
        layout = json.loads((ROOT/'data/layout.json').read_text())
        ids = {t['id'] for t in data['terms']}
        pairs = {(t['id'],r['target']) for t in data['terms'] for d in t['definitions'] for r in d['references'] if t['id'] != r['target']}
        directed = next(v for v in layout['analyses'] if v['id'] == 'directed-grouped')
        m = len(pairs)
        q = sum(sum(a in c['members'] and b in c['members'] for a,b in pairs)/m - sum(a in c['members'] for a,b in pairs)*sum(b in c['members'] for a,b in pairs)/(m*m) for c in directed['clusters'])
        self.assertAlmostEqual(q,directed['metrics']['modularity'],places=6)
        # Independently characterize SCC membership through exhaustive reachability.
        adjacency = {i:[] for i in ids}
        for a,b in pairs: adjacency[a].append(b)
        reachable = {}
        for start in ids:
            visited, pending = {start}, [start]
            while pending:
                for w in adjacency[pending.pop()]:
                    if w not in visited: visited.add(w);pending.append(w)
            reachable[start] = visited
        scc = next(v for v in layout['analyses'] if v['id'] == 'scc-grouped')
        members = {i:c['id'] for c in scc['clusters'] for i in c['members']}
        for a in ids:
            for b in ids:
                self.assertEqual(members[a] == members[b],b in reachable[a] and a in reachable[b])
        self.assertEqual(len(layout['analyses']),9)
        for variant in layout['analyses']:
            self.assertEqual({n['id'] for n in variant['nodes']}, ids)
            self.assertEqual(len(variant['nodes']),len(ids))
            self.assertEqual(sorted(v for c in variant['clusters'] for v in c['members']),sorted(ids))
            for i,a in enumerate(variant['nodes']):
                for b in variant['nodes'][i+1:]:
                    self.assertGreater(math.hypot(a['x']-b['x'], a['y']-b['y']),35)
            if variant['placementMethod'] == 'condensation':
                nodes = {n['id']:n for n in variant['nodes']}
                for t in data['terms']:
                    for d in t['definitions']:
                        for ref in d['references']:
                            a,b = nodes[t['id']],nodes[ref['target']]
                            if a['component'] != b['component']:
                                self.assertLess(a['rank'],b['rank'])
                                self.assertLess(a['y'],b['y'])
