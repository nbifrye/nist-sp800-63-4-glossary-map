"""Static, deterministic placement algorithms; no client-side simulation."""
import math
import random
from collections import deque


def adjacency(ids,pairs):
    result={v:set() for v in ids}
    for a,b in pairs:
        if a!=b: result[a].add(b);result[b].add(a)
    return result


def components(ids,pairs):
    neighbors=adjacency(ids,pairs);remaining=set(ids);groups=[]
    while remaining:
        start=min(remaining);remaining.remove(start);group={start};todo=[start]
        while todo:
            for w in sorted(neighbors[todo.pop()]):
                if w in remaining:remaining.remove(w);group.add(w);todo.append(w)
        groups.append(group)
    return sorted(groups,key=lambda g:(-len(g),sorted(g)))


def distances(ids,pairs):
    neighbors=adjacency(ids,pairs);result={}
    for start in sorted(ids):
        result[start]={start:0};todo=deque([start])
        while todo:
            v=todo.popleft()
            for w in sorted(neighbors[v]):
                if w not in result[start]:result[start][w]=result[start][v]+1;todo.append(w)
    return result


def separated(coordinates):
    """Uniform scale preserves angles/objective ratios while separating nodes."""
    ids=sorted(coordinates)
    if len(ids)<2:return coordinates
    minimum=min(math.hypot(coordinates[a]['x']-coordinates[b]['x'],coordinates[a]['y']-coordinates[b]['y']) for i,a in enumerate(ids) for b in ids[i+1:])
    if minimum<1e-9:raise ValueError('placement produced coincident vertices')
    factor=max(1,42/minimum)
    return {v:{**coordinates[v],'x':round(coordinates[v]['x']*factor,2),'y':round(coordinates[v]['y']*factor,2)} for v in ids}


def pack_components(ids,pairs,algorithm):
    coordinates={};x=y=row_height=0
    for group in components(ids,pairs):
        local=separated(algorithm(sorted(group),{(a,b) for a,b in pairs if a in group and b in group}))
        xmin=min(p['x'] for p in local.values());ymin=min(p['y'] for p in local.values())
        width=max(p['x'] for p in local.values())-xmin+140;height=max(p['y'] for p in local.values())-ymin+140
        if x and x+width>2600:x=0;y+=row_height;row_height=0
        for v,p in local.items():coordinates[v]={**p,'x':round(p['x']-xmin+x+70,2),'y':round(p['y']-ymin+y+70,2)}
        x+=width;row_height=max(row_height,height)
    return coordinates


def circle(ids,pairs):
    neighbors=adjacency(ids,pairs);order=sorted(ids,key=lambda v:(-len(neighbors[v]),v));radius=max(90,len(ids)*45/(2*math.pi))
    if len(ids)==1:return {ids[0]:{'x':0,'y':0}}
    return {v:{'x':radius*math.cos(2*math.pi*n/len(ids)),'y':radius*math.sin(2*math.pi*n/len(ids))} for n,v in enumerate(order)}


def radial(ids,pairs):
    neighbors=adjacency(ids,pairs);root=min(ids,key=lambda v:(-len(neighbors[v]),v));hops=distances(ids,pairs)[root]
    coords={root:{'x':0,'y':0,'hop':0,'root':root}};radius=0
    for hop in range(1,max(hops.values(),default=0)+1):
        layer=sorted((v for v in ids if hops[v]==hop),key=lambda v:(-len(neighbors[v]),v))
        radius=max(radius+140,len(layer)*45/(2*math.pi))
        for n,v in enumerate(layer):
            angle=2*math.pi*n/len(layer)-math.pi/2
            coords[v]={'x':radius*math.cos(angle),'y':radius*math.sin(angle),'hop':hop,'root':root}
    return coords


def initial_positions(ids):
    rng=random.Random(42)
    return {v:[rng.uniform(-350,350),rng.uniform(-350,350)] for v in sorted(ids)}


def force_directed(ids,pairs):
    if len(ids)==1:return {ids[0]:{'x':0,'y':0}}
    positions=initial_positions(ids);edges=sorted({tuple(sorted((a,b))) for a,b in pairs if a!=b});k=math.sqrt(700*700/len(ids))
    for step in range(250):
        displacement={v:[0.0,0.0] for v in ids};temperature=45*(1-step/250)
        for i,a in enumerate(ids):
            for b in ids[i+1:]:
                dx=positions[a][0]-positions[b][0];dy=positions[a][1]-positions[b][1];distance=max(.001,math.hypot(dx,dy));factor=k*k/(distance*distance)
                fx=dx*factor;fy=dy*factor
                displacement[a][0]+=fx;displacement[a][1]+=fy;displacement[b][0]-=fx;displacement[b][1]-=fy
        for a,b in edges:
            dx=positions[a][0]-positions[b][0];dy=positions[a][1]-positions[b][1];distance=math.hypot(dx,dy);factor=distance/k
            fx=dx*factor;fy=dy*factor
            displacement[a][0]-=fx;displacement[a][1]-=fy;displacement[b][0]+=fx;displacement[b][1]+=fy
        for v in ids:
            dx,dy=displacement[v];length=math.hypot(dx,dy)
            if length:positions[v][0]+=dx/length*min(length,temperature);positions[v][1]+=dy/length*min(length,temperature)
        # Translation only: unlike gravity, centering does not change pair forces.
        mx=sum(p[0] for p in positions.values())/len(ids);my=sum(p[1] for p in positions.values())/len(ids)
        for p in positions.values():p[0]-=mx;p[1]-=my
    return {v:{'x':positions[v][0],'y':positions[v][1]} for v in ids}


def stress_value(positions,shortest,unit=90):
    ids=sorted(positions)
    return sum((math.hypot(positions[a][0]-positions[b][0],positions[a][1]-positions[b][1])-unit*shortest[a][b])**2/(unit*shortest[a][b])**2 for i,a in enumerate(ids) for b in ids[i+1:] if b in shortest[a])


def stress_relaxation(ids,pairs):
    if len(ids)==1:return {ids[0]:{'x':0,'y':0}}
    shortest=distances(ids,pairs);positions=initial_positions(ids);previous=stress_value(positions,shortest)
    for _ in range(180):
        proposal={}
        for a in ids:
            sx=sy=total=0.0
            for b in ids:
                if a==b:continue
                target=90*shortest[a][b];weight=1/(target*target);dx=positions[a][0]-positions[b][0];dy=positions[a][1]-positions[b][1];distance=max(1e-9,math.hypot(dx,dy))
                sx+=weight*(positions[b][0]+target*dx/distance);sy+=weight*(positions[b][1]+target*dy/distance);total+=weight
            proposal[a]=[sx/total,sy/total]
        fraction=1.0;accepted=False
        while fraction>=1/128:
            candidate={v:[positions[v][i]+fraction*(proposal[v][i]-positions[v][i]) for i in [0,1]] for v in ids}
            value=stress_value(candidate,shortest)
            if value<previous-1e-8:positions=candidate;previous=value;accepted=True;break
            fraction/=2
        if not accepted:break
    return {v:{'x':positions[v][0],'y':positions[v][1]} for v in ids}


def placement_metrics(coordinates,pairs):
    edges=sorted({tuple(sorted((a,b))) for a,b in pairs if a!=b})
    lengths=[math.hypot(coordinates[a]['x']-coordinates[b]['x'],coordinates[a]['y']-coordinates[b]['y']) for a,b in edges]
    mean=sum(lengths)/len(lengths) if lengths else 0
    diagonal=math.hypot(max(p['x'] for p in coordinates.values())-min(p['x'] for p in coordinates.values()),max(p['y'] for p in coordinates.values())-min(p['y'] for p in coordinates.values()))
    def cross(a,b,c):return (b['x']-a['x'])*(c['y']-a['y'])-(b['y']-a['y'])*(c['x']-a['x'])
    crossings=0
    for i,(a,b) in enumerate(edges):
        for c,d in edges[i+1:]:
            if len({a,b,c,d})<4:continue
            pa,pb,pc,pd=(coordinates[v] for v in [a,b,c,d])
            if cross(pa,pb,pc)*cross(pa,pb,pd)<-1e-9 and cross(pc,pd,pa)*cross(pc,pd,pb)<-1e-9:crossings+=1
    return {'straightEdgeCrossings':crossings,'meanEdgeLengthNormalized':round(mean/diagonal,6) if diagonal else 0,'edgeLengthCV':round(math.sqrt(sum((d-mean)**2 for d in lengths)/len(lengths))/mean,6) if mean else 0}
