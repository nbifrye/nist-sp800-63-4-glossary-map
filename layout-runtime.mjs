// Optional recalculation uses the same unfiltered, unique reference pairs as
// the stored layouts. Community membership and reference direction stay intact.
export function parameterFields(method){
  const field=(key,label,value,min,max,step=1)=>({key,label,value,min,max,step});
  if(method==='force')return [field('iterations','反復回数',250,10,500),field('repulsion','反発の強さ',1,.2,3,.1),field('seed','初期配置のシード',42,1,9999)];
  if(method==='stress')return [field('iterations','反復回数の上限',180,10,300),field('unit','参照距離 1 あたりの長さ',90,30,200),field('seed','初期配置のシード',42,1,9999)];
  if(['layered','condensation'].includes(method))return [field('horizontal','同じ層の横間隔',1,.3,3,.1),field('vertical','層の縦間隔',1,.3,3,.1),...(method==='layered'?[field('sweeps','交差を減らす並べ替え回数',8,0,40)]:[])];
  if(method==='grouped')return [field('within','群内の間隔',1,.3,2,.1),field('between','群どうしの間隔',1,.5,3,.1)];
  return [field('horizontal','横方向の間隔',1,.3,3,.1),field('vertical','縦方向の間隔',1,.3,3,.1)];
}
function seeded(seed){let state=seed>>>0;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
function components(nodes,edges){
  const neighbors=new Map(nodes.map(n=>[n.id,new Set()]));
  for(const e of edges)if(e.source!==e.target&&neighbors.has(e.source)&&neighbors.has(e.target)){neighbors.get(e.source).add(e.target);neighbors.get(e.target).add(e.source);}
  const remaining=new Set(neighbors.keys()),groups=[];
  while(remaining.size){const root=remaining.values().next().value,group=[root];remaining.delete(root);for(let i=0;i<group.length;i++)for(const id of neighbors.get(group[i]))if(remaining.delete(id))group.push(id);groups.push(group.sort());}
  return {neighbors,groups:groups.sort((a,b)=>b.length-a.length||a[0].localeCompare(b[0]))};
}
function solve(ids,neighbors,method,p){
  const random=seeded(p.seed),positions=ids.map(()=>({x:(random()-.5)*700,y:(random()-.5)*700}));
  if(ids.length===1)return positions.map(()=>({x:0,y:0}));
  const indices=new Map(ids.map((id,i)=>[id,i])),pairs=[];
  ids.forEach((id,a)=>{for(const other of neighbors.get(id)){const b=indices.get(other);if(a<b)pairs.push([a,b]);}});
  if(method==='force'){
    const k=Math.sqrt(490000/ids.length);
    for(let step=0;step<p.iterations;step++){
      const d=ids.map(()=>({x:0,y:0})),temperature=45*(1-step/p.iterations);
      for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++){
        const dx=positions[a].x-positions[b].x,dy=positions[a].y-positions[b].y,f=k*k*p.repulsion/Math.max(.001,dx*dx+dy*dy);
        d[a].x+=dx*f;d[a].y+=dy*f;d[b].x-=dx*f;d[b].y-=dy*f;
      }
      for(const[a,b]of pairs){const dx=positions[a].x-positions[b].x,dy=positions[a].y-positions[b].y,f=Math.hypot(dx,dy)/k;d[a].x-=dx*f;d[a].y-=dy*f;d[b].x+=dx*f;d[b].y+=dy*f;}
      positions.forEach((pos,i)=>{const length=Math.hypot(d[i].x,d[i].y);if(length){const f=Math.min(length,temperature)/length;pos.x+=d[i].x*f;pos.y+=d[i].y*f;}});
    }
  }else{
    const distances=ids.map((id,a)=>{const hops=ids.map(()=>Infinity),queue=[a];hops[a]=0;for(let i=0;i<queue.length;i++)for(const next of neighbors.get(ids[queue[i]])){const b=indices.get(next);if(hops[b]===Infinity){hops[b]=hops[queue[i]]+1;queue.push(b);}}return hops;});
    const objective=positions=>{let total=0;for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++){const target=p.unit*distances[a][b];total+=(Math.hypot(positions[a].x-positions[b].x,positions[a].y-positions[b].y)-target)**2/target**2;}return total;};
    let previous=objective(positions);
    for(let step=0;step<p.iterations;step++){
      const proposal=positions.map((pos,a)=>{let x=0,y=0,total=0;positions.forEach((other,b)=>{if(a===b)return;const target=p.unit*distances[a][b],weight=1/target**2,dx=pos.x-other.x,dy=pos.y-other.y,distance=Math.max(1e-9,Math.hypot(dx,dy));x+=weight*(other.x+target*dx/distance);y+=weight*(other.y+target*dy/distance);total+=weight;});return{x:x/total,y:y/total};});
      let accepted=false;
      for(let fraction=1;fraction>=1/128;fraction/=2){const candidate=positions.map((pos,i)=>({x:pos.x+fraction*(proposal[i].x-pos.x),y:pos.y+fraction*(proposal[i].y-pos.y)})),value=objective(candidate);if(value<previous-1e-8){positions.splice(0,positions.length,...candidate);previous=value;accepted=true;break;}}
      if(!accepted)break;
    }
  }
  let minimum=Infinity;for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++)minimum=Math.min(minimum,Math.hypot(positions[a].x-positions[b].x,positions[a].y-positions[b].y));
  const factor=Math.max(1,42/Math.max(minimum,1e-6));return positions.map(pos=>({x:pos.x*factor,y:pos.y*factor}));
}
// Reorder the stored DAG layers using virtual vertices for long edges.
// Feedback edges are oriented only for ordering; displayed arrows are unchanged.
function orderLayers(nodes,edges,p){
  const ranks=new Map(nodes.map(n=>[n.id,n.rank])),previous=new Map(nodes.map(n=>[n.id,new Set()])),following=new Map(nodes.map(n=>[n.id,new Set()]));
  const unique=new Set();let ordinal=0;
  for(const edge of edges){let a=edge.source,b=edge.target;if(a===b||!ranks.has(a)||!ranks.has(b)||ranks.get(a)===ranks.get(b))continue;if(ranks.get(a)>ranks.get(b))[a,b]=[b,a];const key=a+'|'+b;if(unique.has(key))continue;unique.add(key);const chain=[a];for(let rank=ranks.get(a)+1;rank<ranks.get(b);rank++){const id='virtual-'+ordinal++;ranks.set(id,rank);previous.set(id,new Set());following.set(id,new Set());chain.push(id);}chain.push(b);for(let i=1;i<chain.length;i++){following.get(chain[i-1]).add(chain[i]);previous.get(chain[i]).add(chain[i-1]);}}
  const layers=Array.from({length:Math.max(...ranks.values())+1},(_,rank)=>[...ranks].filter(([,r])=>r===rank).map(([id])=>id).sort());
  const order=new Map();for(const layer of layers)layer.forEach((id,i)=>order.set(id,i));
  for(let sweep=0;sweep<p.sweeps;sweep++){const neighbors=sweep%2?following:previous;for(const layer of sweep%2?[...layers].reverse():layers){const score=id=>{const adjacent=[...neighbors.get(id)];return adjacent.length?adjacent.reduce((s,v)=>s+order.get(v),0)/adjacent.length:order.get(id);};layer.sort((a,b)=>score(a)-score(b)||a.localeCompare(b));layer.forEach((id,i)=>order.set(id,i));}}
  const coordinates=new Map(),visible=new Set(nodes.map(n=>n.id));layers.forEach((layer,rank)=>{const ids=layer.filter(id=>visible.has(id));ids.forEach((id,i)=>coordinates.set(id,{x:(i-(ids.length-1)/2)*85*p.horizontal,y:rank*140*p.vertical}));});return nodes.map(n=>({...n,...coordinates.get(n.id)}));
}
export function calculatePlacement(nodes,edges,method,values){
  const p={};for(const field of parameterFields(method)){const value=values[field.key]??field.value;if(!Number.isFinite(value)||value<field.min||value>field.max||field.step===1&&!Number.isInteger(value))throw Error('計算条件が範囲外です');p[field.key]=value;}
  if(method==='layered')return orderLayers(nodes,edges,p);
  if(!['force','stress'].includes(method)){
    const centers=new Map();if(method==='grouped')for(const n of nodes){if(!centers.has(n.cluster))centers.set(n.cluster,[]);centers.get(n.cluster).push(n);}
    for(const[id,group]of centers)centers.set(id,{x:group.reduce((s,n)=>s+n.x,0)/group.length,y:group.reduce((s,n)=>s+n.y,0)/group.length});
    return nodes.map(n=>{const c=centers.get(n.cluster);return {...n,x:c?c.x*p.between+(n.x-c.x)*p.within:n.x*p.horizontal,y:c?c.y*p.between+(n.y-c.y)*p.within:n.y*p.vertical};});
  }
  const {neighbors,groups}=components(nodes,edges),coordinates=new Map();let x=0,y=0,rowHeight=0;
  for(const ids of groups){const local=solve(ids,neighbors,method,p),minX=Math.min(...local.map(n=>n.x)),minY=Math.min(...local.map(n=>n.y)),width=Math.max(...local.map(n=>n.x))-minX+140,height=Math.max(...local.map(n=>n.y))-minY+140;if(x&&x+width>2600){x=0;y+=rowHeight;rowHeight=0;}ids.forEach((id,i)=>coordinates.set(id,{x:local[i].x-minX+x+70,y:local[i].y-minY+y+70}));x+=width;rowHeight=Math.max(rowHeight,height);}
  return nodes.map(n=>({...n,...coordinates.get(n.id)}));
}
