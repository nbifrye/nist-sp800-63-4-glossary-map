"""Deterministic greedy modularity communities and collision-free static layout.

Only unique undirected non-self term pairs enter community detection; document
repetitions, direction, and explicit/lexical evidence remain in the corpus.
"""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def communities(ids, pairs):
    groups = {i:{i} for i in ids}
    links = {i:{} for i in ids}
    for a,b in pairs:
        if a != b:
            links[a][b] = 1
            links[b][a] = 1
    m = len([p for p in pairs if p[0] != p[1]])
    if not m:
        return list(groups.values()), 0.0
    volumes = {i:len(links[i]) for i in ids}
    while True:
        best = None
        for a in sorted(groups):
            for b,weight in sorted(links[a].items()):
                if a >= b:
                    continue
                gain = weight/m - volumes[a]*volumes[b]/(2*m*m)
                candidate = (gain,a,b)
                if gain > 1e-12 and (best is None or gain > best[0]+1e-12):
                    best = candidate
        if best is None:
            break
        _,a,b = best
        groups[a] |= groups.pop(b)
        volumes[a] += volumes.pop(b)
        links[a].pop(b,None)
        for neighbor,weight in list(links[b].items()):
            if neighbor == a:
                continue
            links[a][neighbor] = links[a].get(neighbor,0)+weight
            links[neighbor][a] = links[a][neighbor]
            links[neighbor].pop(b,None)
        links.pop(b)
    result = sorted(groups.values(),key=lambda g:(-len(g),sorted(g)))
    degree = {i:0 for i in ids}
    for a,b in pairs:
        if a!=b:
            degree[a]+=1;degree[b]+=1
    q = sum(sum(a in g and b in g for a,b in pairs if a!=b)/m - (sum(degree[n] for n in g)/(2*m))**2 for g in result)
    return result,q


def create_layout(data):
    terms = {t['id']:t for t in data['terms']}
    pairs = {tuple(sorted((t['id'],r['target']))) for t in data['terms'] for d in t['definitions'] for r in d['references'] if t['id'] != r['target']}
    groups,q = communities(sorted(terms),sorted(pairs))
    degree = {i:0 for i in terms}
    for a,b in pairs:
        degree[a]+=1;degree[b]+=1
    nodes,clusters = [],[]
    # Place largest groups in separate tiles. Each group uses a phyllotactic
    # disk with fixed minimum separation; cross-group edges remain visible.
    radii = [max(90,math.sqrt(len(g))*43) for g in groups]
    pack_x = pack_y = row_height = 0
    golden_angle = math.pi*(3-math.sqrt(5))
    for n,group in enumerate(groups):
        tile = 2*(radii[n]+45)+70
        if pack_x and pack_x+tile>2200:
            pack_x=0;pack_y+=row_height;row_height=0
        cx=pack_x+tile/2;cy=pack_y+tile/2
        pack_x+=tile;row_height=max(row_height,tile)
        ordered=sorted(group,key=lambda i:(-degree[i],terms[i]['heading'].casefold()))
        cluster_id=f'cluster-{n+1:02}'
        clusters.append({'id':cluster_id,'members':sorted(group),'label':' / '.join(terms[i]['heading'] for i in ordered[:3]),'x':round(cx,2),'y':round(cy,2),'radius':round(radii[n]+35,2)})
        for i,term_id in enumerate(ordered):
            radius=math.sqrt(i)*43
            angle=i*golden_angle
            nodes.append({'id':term_id,'cluster':cluster_id,'x':round(cx+radius*math.cos(angle),2),'y':round(cy+radius*math.sin(angle),2),'degree':degree[term_id]})
    return {'schemaVersion':1,'algorithm':'greedy-modularity-undirected-unique-v1','layoutVersion':'cluster-phyllotaxis-v1','modularity':round(q,6),'undirectedPairs':len(pairs),'nodes':sorted(nodes,key=lambda n:n['id']),'clusters':clusters}

if __name__=='__main__':
    raw=(ROOT/'data/glossary.json').read_bytes()
    layout=create_layout(json.loads(raw))
    layout['corpusSha256']=hashlib.sha256(raw).hexdigest()
    (ROOT/'data/layout.json').write_text(json.dumps(layout,ensure_ascii=False,indent=2)+'\n')
    print(f'{len(layout["nodes"])} nodes; {len(layout["clusters"])} communities; modularity {layout["modularity"]}')
