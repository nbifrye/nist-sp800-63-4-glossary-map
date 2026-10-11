"""Additional reproducible partitions: diffusion, multilevel density, flow coding."""
import math


def normalized_groups(groups):
    return sorted((set(g) for g in groups if g), key=lambda g: (-len(g), sorted(g)))


def undirected_q(ids, pairs, groups):
    pairs = {tuple(sorted((a,b))) for a,b in pairs if a != b}
    if not pairs:
        return 0.0
    degree = {v:0 for v in ids}
    for a,b in pairs: degree[a]+=1;degree[b]+=1
    m = len(pairs)
    return sum(sum(a in g and b in g for a,b in pairs)/m-(sum(degree[v] for v in g)/(2*m))**2 for g in groups)


def label_propagation(ids, pairs):
    """Asynchronous majority updates, fixed order and retain-label tie rule."""
    adjacency = {v:set() for v in ids}
    for a,b in pairs:
        if a!=b: adjacency[a].add(b);adjacency[b].add(a)
    labels = {v:v for v in ids}
    order = sorted(ids, key=lambda v:(-len(adjacency[v]),v))
    seen = set()
    for _ in range(100):
        state = tuple(labels[v] for v in sorted(ids))
        if state in seen: break
        seen.add(state);changed = False
        for v in order:
            counts = {}
            for w in sorted(adjacency[v]): counts[labels[w]]=counts.get(labels[w],0)+1
            if not counts: continue
            highest = max(counts.values())
            candidates = sorted(c for c in counts if counts[c]==highest)
            chosen = labels[v] if labels[v] in candidates else candidates[0]
            if chosen != labels[v]: labels[v]=chosen;changed=True
        if not changed: break
    groups = {}
    for v in ids: groups.setdefault(labels[v],set()).add(v)
    return normalized_groups(groups.values())


def louvain(ids, pairs):
    """Undirected weighted Louvain, fixed visitation/tie order, resolution 1."""
    adjacency = {v:{} for v in ids}
    for a,b in sorted({tuple(sorted((a,b))) for a,b in pairs if a!=b}):
        adjacency[a][b]=1.0;adjacency[b][a]=1.0
    members = {v:{v} for v in ids}
    for _ in range(len(ids)):
        degree = {v:sum(adjacency[v].values()) for v in adjacency}
        m2 = sum(degree.values())
        if not m2: return normalized_groups(members.values())
        labels = {v:v for v in adjacency}; volumes = dict(degree)
        for _ in range(100):
            changed = False
            for v in sorted(adjacency):
                old = labels[v];weights = {}
                for w,weight in sorted(adjacency[v].items()):
                    if w!=v: weights[labels[w]]=weights.get(labels[w],0)+weight
                volumes[old]-=degree[v]
                chosen = old;best = weights.get(old,0)-degree[v]*volumes[old]/m2
                for c in sorted(weights):
                    score = weights[c]-degree[v]*volumes[c]/m2
                    if score > best+1e-12: chosen=c;best=score
                volumes[chosen]+=degree[v]
                if chosen!=old: labels[v]=chosen;changed=True
            if not changed: break
        groups = {}
        for v in sorted(adjacency): groups.setdefault(labels[v],set()).update(members[v])
        if len(groups)==len(adjacency): return normalized_groups(groups.values())
        # Aggregated diagonal stores twice the internal undirected edge weight.
        canonical = {c:min(g) for c,g in groups.items()}
        new_adjacency = {canonical[c]:{} for c in groups}
        for a in sorted(adjacency):
            ca = canonical[labels[a]]
            for b,weight in sorted(adjacency[a].items()):
                cb = canonical[labels[b]]
                new_adjacency[ca][cb]=new_adjacency[ca].get(cb,0)+weight
        adjacency=new_adjacency;members={canonical[c]:g for c,g in groups.items()}
    return normalized_groups(members.values())


def random_walk(ids, pairs, teleport=.15):
    """Recorded teleportation, including uniform transitions for dangling nodes."""
    ids=sorted(ids);n=len(ids)
    if not n: return {},{}
    outgoing={v:set() for v in ids}
    for a,b in pairs:
        if a!=b: outgoing[a].add(b)
    transition={v:{w:(1/n if not outgoing[v] else teleport/n+(1-teleport)/len(outgoing[v])*(w in outgoing[v])) for w in ids} for v in ids}
    p={v:1/n for v in ids}
    for _ in range(1000):
        updated={w:sum(p[v]*transition[v][w] for v in ids) for w in ids}
        error=sum(abs(updated[w]-p[w]) for w in ids);p=updated
        if error<1e-13: break
    flux={v:{w:p[v]*transition[v][w] for w in ids} for v in ids}
    return p,flux


def xlog(x): return x*math.log2(x) if x>0 else 0.0


def map_equation(p, flux, groups):
    exits=[sum(flux[a][b] for a in sorted(g) for b in p if b not in g) for g in groups]
    return xlog(sum(exits))-2*sum(xlog(q) for q in exits)+sum(xlog(q+sum(p[a] for a in sorted(g))) for q,g in zip(exits,groups))-sum(xlog(v) for v in p.values())


def flow_communities(ids, pairs):
    """Two-level map equation optimized by all-pair greedy merges.

    This is NOT the official Infomap optimizer or hierarchical Infomap.
    Teleportation transitions are recorded in the code-length objective.
    """
    p,flux=random_walk(ids,pairs)
    groups={v:{v} for v in sorted(ids)}
    mass=dict(p);exits={v:sum(weight for w,weight in flux[v].items() if w!=v) for v in p}
    between={a:{b:flux[a][b]+flux[b][a] for b in p if a!=b} for a in p}
    total=sum(exits.values())
    while len(groups)>1:
        best=None
        for a in sorted(groups):
            for b in sorted(groups):
                if a>=b: continue
                combined=exits[a]+exits[b]-between[a][b]
                gain=xlog(total)-xlog(total-between[a][b])-2*(xlog(exits[a])+xlog(exits[b])-xlog(combined))+xlog(exits[a]+mass[a])+xlog(exits[b]+mass[b])-xlog(combined+mass[a]+mass[b])
                if gain>1e-12 and (best is None or gain>best[0]+1e-12): best=(gain,a,b,combined)
        if best is None: break
        _,a,b,combined=best
        total-=between[a][b];exits[a]=combined;exits.pop(b);mass[a]+=mass.pop(b);groups[a]|=groups.pop(b)
        between[a].pop(b)
        for c in sorted(groups):
            if c==a: continue
            between[a][c]+=between[b][c];between[c][a]=between[a][c];between[c].pop(b)
        between.pop(b)
    result=normalized_groups(groups.values())
    return result,map_equation(p,flux,result),{'teleportation':.15,'recordTeleportation':True,'optimizer':'greedy-all-pair-merge','stationaryTolerance':1e-13}
