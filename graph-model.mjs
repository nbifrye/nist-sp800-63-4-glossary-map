// Every directional pair retains all source-specific occurrences for inspection.
export function aggregateEdges(data, source='', kind='') {
  const pairs=new Map();
  for(const term of data.terms) for(const definition of term.definitions) {
    if(source && definition.source!==source) continue;
    for(const reference of definition.references) {
      if(kind && reference.kind!==kind) continue;
      const key=term.id+'>'+reference.target;
      if(!pairs.has(key)) pairs.set(key,{id:key,source:term.id,target:reference.target,entries:[]});
      pairs.get(key).entries.push({term,definition,reference});
    }
  }
  return [...pairs.values()];
}
export function validateLayout(layout,data) {
  if(layout.schemaVersion!==1 || layout.algorithm!=='greedy-modularity-undirected-unique-v1' || !Array.isArray(layout.nodes) || !Array.isArray(layout.clusters)) throw Error('全体グラフの配置データが不正です。');
  const ids=new Set(data.terms.map(t=>t.id)), found=new Set(), membership=new Set();
  for(const n of layout.nodes) {
    if(!ids.has(n.id)||found.has(n.id)||!Number.isFinite(n.x)||!Number.isFinite(n.y)||!Number.isFinite(n.degree)) throw Error('全体グラフの用語が欠落・重複しています。');
    found.add(n.id);
  }
  if(found.size!==ids.size) throw Error('全体グラフの用語が欠落しています。');
  const clusterIds=new Set();
  for(const cluster of layout.clusters) {
    if(clusterIds.has(cluster.id)||!Array.isArray(cluster.members)||!cluster.members.length||!Number.isFinite(cluster.x)||!Number.isFinite(cluster.y)||!Number.isFinite(cluster.radius)||cluster.radius<=0) throw Error('クラスター情報が不正です。');
    clusterIds.add(cluster.id);
    for(const id of cluster.members) {
      if(!ids.has(id)||membership.has(id)||layout.nodes.find(n=>n.id===id).cluster!==cluster.id) throw Error('クラスターの所属が不正です。');
      membership.add(id);
    }
  }
  if(membership.size!==ids.size) throw Error('クラスターの所属が欠落しています。');
  return layout;
}
export function scopeGraph(nodes,edges,mode,selected) {
  if(mode==='overall') return {nodes,edges};
  const ids=new Set([selected]);
  for(const edge of edges) if(edge.source===selected||edge.target===selected){ids.add(edge.source);ids.add(edge.target);}
  return {nodes:nodes.filter(n=>ids.has(n.id)),edges:edges.filter(e=>ids.has(e.source)&&ids.has(e.target))};
}
export function bounds(nodes,padding=60) {
  if(!nodes.length) return {x:0,y:0,width:100,height:100};
  const xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y);
  const minX=Math.min(...xs)-padding,minY=Math.min(...ys)-padding;
  return {x:minX,y:minY,width:Math.max(...xs)-minX+padding,height:Math.max(...ys)-minY+padding};
}
export function edgePath(edge,positions) {
  const a=positions.get(edge.source),b=positions.get(edge.target);
  if(a===b) return `M ${a.x} ${a.y-9} C ${a.x-50} ${a.y-65} ${a.x+50} ${a.y-65} ${a.x+6} ${a.y-8}`;
  const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d;
  // Slight curvature separates reciprocal directed edges.
  return `M ${a.x+ux*10} ${a.y+uy*10} Q ${(a.x+b.x)/2-uy*14} ${(a.y+b.y)/2+ux*14} ${b.x-ux*12} ${b.y-uy*12}`;
}
