import json
import math
import sys
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from community_methods import label_propagation,louvain,flow_communities,random_walk,map_equation,undirected_q
from placement_methods import pack_components,circle,radial,force_directed,stress_relaxation,stress_value,distances,initial_positions,placement_metrics

class DiverseTests(unittest.TestCase):
    def test_louvain_and_labels_cliques_with_isolated_vertex(self):
        ids=list('abcdefz');pairs={(a,b) for g in ['abc','def'] for a in g for b in g if a!=b}|{('c','d')}
        expected={frozenset('abc'),frozenset('def'),frozenset('z')}
        for method in [label_propagation,louvain]:
            test_pairs=pairs-{('c','d')} if method==label_propagation else pairs
            groups=method(ids,test_pairs)
            self.assertEqual({frozenset(g) for g in groups},expected)
            self.assertGreater(undirected_q(ids,test_pairs,groups),.3)
            self.assertEqual(method(ids,set()),[{v} for v in ids])
    def test_recorded_random_walk_stationary_and_code_length(self):
        ids=list('abcdz');pairs={('a','b'),('b','a'),('b','c'),('c','d'),('d','c')}
        p,flux=random_walk(ids,pairs)
        self.assertAlmostEqual(sum(p.values()),1)
        for v in ids:
            self.assertAlmostEqual(sum(flux[v].values()),p[v],places=11)
            self.assertAlmostEqual(sum(flux[w][v] for w in ids),p[v],places=11)
        groups,score,settings=flow_communities(ids,pairs)
        self.assertEqual(sorted(v for g in groups for v in g),ids)
        # Independent entropy formulation, including recorded teleportation.
        exits=[sum(flux[a][b] for a in g for b in ids if b not in g) for g in groups]
        def entropy(values):
            total=sum(values)
            return -sum((x/total)*math.log2(x/total) for x in values if x>0) if total else 0
        expected=sum(exits)*entropy(exits)+sum((q+sum(p[v] for v in g))*entropy([q]+[p[v] for v in sorted(g)]) for q,g in zip(exits,groups))
        self.assertAlmostEqual(score,expected,places=10)
        self.assertLessEqual(score,map_equation(p,flux,[{v} for v in ids])+1e-9)
        self.assertEqual(settings['teleportation'],.15)
    def test_different_layouts_with_disconnected_components_and_hops(self):
        ids=list('abcdefz');pairs={('a','b'),('b','c'),('c','d'),('b','e'),('e','f')}
        results=[]
        for method in [circle,radial,force_directed,stress_relaxation]:
            result=pack_components(ids,pairs,method);results.append(result)
            self.assertEqual(set(result),set(ids))
            self.assertEqual(result,pack_components(ids,pairs,method))
            for i,a in enumerate(ids):
                for b in ids[i+1:]:self.assertGreater(math.hypot(result[a]['x']-result[b]['x'],result[a]['y']-result[b]['y']),35)
        self.assertEqual(len({json.dumps(x,sort_keys=True) for x in results}),4)
        radial_result=results[1];shortest=distances(ids,pairs)
        for v,p in radial_result.items():self.assertEqual(p['hop'],shortest[p['root']][v])
    def test_distance_stress_decreases_and_crossings_have_clear_definition(self):
        ids=list('abcde');pairs={('a','b'),('b','c'),('c','d'),('d','e')}
        shortest=distances(ids,pairs);initial=initial_positions(ids);final=stress_relaxation(ids,pairs)
        self.assertLess(stress_value({v:[p['x'],p['y']] for v,p in final.items()},shortest),stress_value(initial,shortest))
        points={'a':{'x':0,'y':0},'b':{'x':10,'y':10},'c':{'x':0,'y':10},'d':{'x':10,'y':0}}
        self.assertEqual(placement_metrics(points,{('a','b'),('c','d'),('b','a')})['straightEdgeCrossings'],1)
        self.assertEqual(placement_metrics(points,{('a','b'),('a','c')})['straightEdgeCrossings'],0)
    def test_corpus_density_scores_flow_score_and_shared_coordinates(self):
        data=json.loads((ROOT/'data/glossary.json').read_text());layout=json.loads((ROOT/'data/layout.json').read_text());ids=sorted(t['id'] for t in data['terms'])
        pairs={(t['id'],r['target']) for t in data['terms'] for d in t['definitions'] for r in d['references'] if t['id']!=r['target']}
        for method in ['label','louvain']:
            variant=next(v for v in layout['analyses'] if v['id']==method+'-grouped')
            self.assertAlmostEqual(undirected_q(ids,pairs,[set(c['members']) for c in variant['clusters']]),variant['metrics']['modularity'],places=6)
        flow=next(v for v in layout['analyses'] if v['id']=='flow-grouped');p,flux=random_walk(ids,pairs)
        self.assertAlmostEqual(map_equation(p,flux,[set(c['members']) for c in flow['clusters']]),flow['metrics']['codeLength'],places=6)
        for placement in ['force','stress','circle','radial','layered','condensation']:
            variants=[v for v in layout['analyses'] if v['placementMethod']==placement]
            positions=[[(n['id'],n['x'],n['y']) for n in v['nodes']] for v in variants]
            self.assertTrue(all(p==positions[0] for p in positions))
