"""Deterministic directed structural analyses, with all original edges retained."""
import math


def strongly_connected(ids, pairs):
    adjacency = {i: [] for i in ids}
    for a, b in sorted(pairs):
        adjacency[a].append(b)
    clock = 0
    indices, low, stack, active, groups = {}, {}, [], set(), []

    def visit(v):
        nonlocal clock
        indices[v] = low[v] = clock
        clock += 1
        stack.append(v); active.add(v)
        for w in adjacency[v]:
            if w not in indices:
                visit(w); low[v] = min(low[v], low[w])
            elif w in active:
                low[v] = min(low[v], indices[w])
        if low[v] == indices[v]:
            group = set()
            while True:
                w = stack.pop(); active.remove(w); group.add(w)
                if w == v:
                    break
            groups.append(group)
    for v in sorted(ids):
        if v not in indices:
            visit(v)
    return sorted(groups, key=lambda g: (-len(g), sorted(g)))


def directed_modularity(ids, pairs):
    """Greedy merges using Leicht-Newman Q, not their spectral optimizer."""
    pairs = {(a, b) for a, b in pairs if a != b}
    groups = {i: {i} for i in ids}
    m = len(pairs)
    if not m:
        return list(groups.values()), 0.0
    outgoing = {i: 0 for i in ids}; incoming = dict(outgoing)
    links = {i: {} for i in ids}
    for a, b in sorted(pairs):
        outgoing[a] += 1; incoming[b] += 1
        links[a][b] = links[a].get(b, 0) + 1
        links[b][a] = links[b].get(a, 0) + 1
    while True:
        best = None
        for a in sorted(groups):
            for b, weight in sorted(links[a].items()):
                if a >= b:
                    continue
                gain = weight / m - (outgoing[a]*incoming[b] + outgoing[b]*incoming[a]) / (m*m)
                if gain > 1e-12 and (best is None or gain > best[0]+1e-12):
                    best = (gain, a, b)
        if best is None:
            break
        _, a, b = best
        groups[a] |= groups.pop(b)
        outgoing[a] += outgoing.pop(b); incoming[a] += incoming.pop(b)
        links[a].pop(b, None)
        for neighbor, weight in list(links[b].items()):
            if neighbor == a:
                continue
            links[a][neighbor] = links[a].get(neighbor, 0) + weight
            links[neighbor][a] = links[a][neighbor]
            links[neighbor].pop(b, None)
        links.pop(b)
    result = sorted(groups.values(), key=lambda g: (-len(g), sorted(g)))
    kout = {i: 0 for i in ids}; kin = dict(kout)
    for a, b in pairs:
        kout[a] += 1; kin[b] += 1
    q = sum(sum(a in g and b in g for a, b in pairs)/m - sum(kout[i] for i in g)*sum(kin[i] for i in g)/(m*m) for g in result)
    return result, q


def ranks(ids, pairs):
    """Longest path from sources of a DAG; rejects cycles."""
    incoming = {i: 0 for i in ids}; successors = {i: [] for i in ids}
    for a, b in sorted(set(pairs)):
        incoming[b] += 1; successors[a].append(b)
    ready = sorted(i for i in ids if incoming[i] == 0)
    result = {i: 0 for i in ids}; count = 0
    while ready:
        v = ready.pop(0); count += 1
        for w in successors[v]:
            result[w] = max(result[w], result[v]+1)
            incoming[w] -= 1
            if incoming[w] == 0:
                ready.append(w); ready.sort()
    if count != len(ids):
        raise ValueError('rank input must be acyclic')
    return result


def layered(ids, pairs):
    """DFS back-edge reversal, longest-path ranks, barycenter sweeps.

    Virtual vertices only affect ordering, never the visible graph/evidence.
    This is a Sugiyama-style heuristic, not dot's network simplex algorithm.
    """
    adjacency = {i: [] for i in ids}
    for a, b in sorted(pairs):
        if a != b:
            adjacency[a].append(b)
    state, oriented, reversed_edges = {}, set(), []
    def visit(v):
        state[v] = 1
        for w in adjacency[v]:
            if state.get(w) == 1:
                oriented.add((w, v)); reversed_edges.append((v, w))
            else:
                oriented.add((v, w))
                if w not in state:
                    visit(w)
        state[v] = 2
    for v in sorted(ids):
        if v not in state:
            visit(v)
    rank = ranks(ids, oriented)
    previous = {i: [] for i in ids}; following = {i: [] for i in ids}
    for ordinal, (a, b) in enumerate(sorted(oriented)):
        chain = [a]
        for level in range(rank[a]+1, rank[b]):
            v = f'@virtual-{ordinal}-{level}'
            rank[v] = level; previous[v] = []; following[v] = []; chain.append(v)
        chain.append(b)
        for v, w in zip(chain, chain[1:]):
            following[v].append(w); previous[w].append(v)
    layers = [sorted(v for v in rank if rank[v] == r) for r in range(max(rank.values(), default=0)+1)]
    order = {v: n for layer in layers for n, v in enumerate(layer)}
    for sweep in range(8):
        neighbors = previous if sweep % 2 == 0 else following
        for layer in (layers if sweep % 2 == 0 else reversed(layers)):
            layer.sort(key=lambda v: (sum(order[w] for w in neighbors[v])/len(neighbors[v]) if neighbors[v] else order[v], v))
            order.update({v: n for n, v in enumerate(layer)})
    coordinates = {}
    for r, layer in enumerate(layers):
        visible = [v for v in layer if v in ids]
        for n, v in enumerate(visible):
            coordinates[v] = {'x': round((n-(len(visible)-1)/2)*85, 2), 'y': r*140, 'rank': r}
    return coordinates, {'levels': len(layers), 'feedbackEdges': len(reversed_edges)}


def analyses(data, baseline):
    from layout import communities
    from community_methods import label_propagation,louvain,flow_communities,undirected_q
    from placement_methods import pack_components,circle,radial,force_directed,stress_relaxation,placement_metrics
    ids = sorted(t['id'] for t in data['terms'])
    terms = {t['id']: t for t in data['terms']}
    pairs = {(t['id'], r['target']) for t in data['terms'] for d in t['definitions'] for r in d['references'] if t['id'] != r['target']}
    degree = {n['id']: n['degree'] for n in baseline['nodes']}
    undirected, uq = communities(ids, sorted({tuple(sorted(p)) for p in pairs}))
    directed, dq = directed_modularity(ids, pairs)
    scc = strongly_connected(ids, pairs)
    membership = {v: n for n, g in enumerate(scc) for v in g}
    dag = {(membership[a], membership[b]) for a, b in pairs if membership[a] != membership[b]}
    component_ranks = ranks(list(range(len(scc))), dag)
    scc_coordinates = {}
    band_y = 0
    for level in sorted(set(component_ranks.values())):
        ordinal = 0
        for n in sorted(i for i in component_ranks if component_ranks[i] == level):
            for v in sorted(scc[n]):
                # Fold wide ranks into bands while keeping every inter-component
                # edge strictly downward. Rank denotes a band, not a single row.
                scc_coordinates[v] = {'x': (ordinal % 12)*320, 'y': band_y+(ordinal//12)*70, 'rank': level, 'component': n+1}
                ordinal += 1
        band_y += max(1, math.ceil(ordinal/12))*70+100
    layer_coordinates, layer_stats = layered(ids, pairs)
    labels=label_propagation(ids,pairs);multilevel=louvain(ids,pairs);flow,code_length,flow_settings=flow_communities(ids,pairs)
    methods = [('undirected', undirected, uq), ('directed', directed, dq), ('scc', scc, None), ('label',labels,undirected_q(ids,pairs,labels)),('louvain',multilevel,undirected_q(ids,pairs,multilevel)),('flow',flow,None)]
    extra_coordinates={name:pack_components(ids,pairs,algorithm) for name,algorithm in [('force',force_directed),('stress',stress_relaxation),('radial',radial),('circle',circle)]}
    fixed_metrics={name:placement_metrics(coords,pairs) for name,coords in [('condensation',scc_coordinates),('layered',layer_coordinates),*extra_coordinates.items()]}

    variants = []
    for method, groups, q in methods:
        clusters, grouped = [], {}
        pack_x = pack_y = row_height = 0
        for n, group in enumerate(groups):
            radius = max(35 if method == "scc" else 90, math.sqrt(len(group))*43)
            tile = 2*(radius+(20 if method == "scc" else 45))+(30 if method == "scc" else 70)
            if pack_x and pack_x+tile > 2200:
                pack_x = 0; pack_y += row_height; row_height = 0
            cx, cy = pack_x+tile/2, pack_y+tile/2
            pack_x += tile; row_height = max(row_height, tile)
            ordered = sorted(group, key=lambda i: (-degree[i], terms[i]['heading'].casefold()))
            cluster = f'cluster-{n+1:02}'
            clusters.append({'id': cluster, 'members': sorted(group), 'label': ' / '.join(terms[i]['heading'] for i in ordered[:3]), 'x': round(cx, 2), 'y': round(cy, 2), 'radius': round(radius+35, 2)})
            for ordinal, v in enumerate(ordered):
                angle = ordinal*math.pi*(3-math.sqrt(5)); r = math.sqrt(ordinal)*43
                grouped[v] = {'x': round(cx+r*math.cos(angle), 2), 'y': round(cy+r*math.sin(angle), 2)}
        for placement, coordinates in [('grouped', grouped), ('condensation', scc_coordinates), ('layered', layer_coordinates), *extra_coordinates.items()]:
            nodes = [{'id': v, 'cluster': c['id'], 'degree': degree[v], **coordinates[v]} for c in clusters for v in c['members']]
            variants.append({'id': f'{method}-{placement}', 'communityMethod': method, 'placementMethod': placement, 'schemaVersion': 1, 'algorithm': 'structural-analysis-v1', 'nodes': sorted(nodes, key=lambda n: n['id']), 'clusters': clusters, 'settings':flow_settings if method=='flow' else {'resolution':1,'visitation':'sorted','tieBreak':'retain-current-then-sorted'} if method=='louvain' else {'iterationLimit':100,'visitation':'degree-descending','tieBreak':'retain-current-then-sorted'} if method=='label' else {}, 'placementSettings': {'seed':42,'iterations':250} if placement=='force' else {'seed':42,'iterationLimit':180,'unitDistance':90,'solver':'weighted-relaxation-with-line-search'} if placement=='stress' else {'root':'maximum-undirected-degree','traversal':'undirected-BFS'} if placement=='radial' else {}, 'metrics': {**(placement_metrics(grouped,pairs) if placement=='grouped' else fixed_metrics[placement]), **({'codeLength':round(code_length,6)} if method=='flow' else {}), 'groups': len(groups), 'singletons': sum(len(g) == 1 for g in groups), 'largestGroup': max(map(len, groups)), 'modularity': round(q, 6) if q is not None else None, **({'levels': max(component_ranks.values())+1, 'components': len(scc)} if placement == 'condensation' else layer_stats if placement == 'layered' else {})}})
    return variants
