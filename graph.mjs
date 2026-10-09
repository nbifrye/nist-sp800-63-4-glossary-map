import {aggregateEdges,validateLayout,scopeGraph,bounds,edgePath} from './graph-model.mjs';
const NS='http://www.w3.org/2000/svg';
const make=(tag,attrs={},text='')=>{const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);e.textContent=text;return e;};
const svgEl=(tag,attrs={},text='')=>{const e=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);e.textContent=text;return e;};
const colors=['#246b5b','#66529a','#246a8b','#99642c','#914f72','#52793a','#4f639e','#87652e','#8f4c43','#3f7376'];
export function createExplorer(host,data,index,layout,onSelect) {
  validateLayout(layout,data);
  const overallPositions=new Map(layout.nodes.map(n=>[n.id,{...n}]));
  let positions=overallPositions;
  const localLayouts=new Map();
  const primaryLabels=new Set(layout.clusters.map(c=>layout.nodes.filter(n=>n.cluster===c.id).sort((a,b)=>b.degree-a.degree||a.id.localeCompare(b.id))[0].id));
  const originals=new Map(layout.nodes.map(n=>[n.id,{...n}]));
  let mode='overall',selected='',source='',kind='',cluster='',scoped,edges=[],scale=1,tx=0,ty=0,frame=0;
  let nodeElements=new Map(),edgeElements=new Map(),adjacent=new Map(),hulls=new Map();
  let gesture=null,lastLabelScale=null;
  const pointers=new Map();
  const controls=make('div',{class:'explorer-controls'});
  const overall=make('button',{type:'button','aria-pressed':'true'},'全体グラフ');
  const local=make('button',{type:'button','aria-pressed':'false'},'選択用語の局所グラフ');
  const plus=make('button',{type:'button','aria-label':'グラフを拡大'},'＋');
  const minus=make('button',{type:'button','aria-label':'グラフを縮小'},'−');
  const fitButton=make('button',{type:'button'},'表示中の全用語に合わせる');
  const reset=make('button',{type:'button'},'配置を戻す');
  const relationSelect=make('select',{id:'graph-relation','aria-label':'参照関係の根拠を探す'});
  relationSelect.addEventListener('change',()=>{const edge=edges.find(e=>e.id===relationSelect.value);if(edge)showEdge(edge);});
  const find=make('select',{id:'graph-find','aria-label':'グラフ上で用語を探す'});
  find.append(make('option',{value:''},'用語へズーム…'));
  for(const t of data.terms)find.append(make('option',{value:t.id},t.heading));
  controls.append(overall,local,minus,plus,fitButton,reset,find,relationSelect);
  const clusterLabel=make('label',{for:'cluster-select'},'自動検出された用語群');
  const clusterSelect=make('select',{id:'cluster-select'});
  clusterSelect.append(make('option',{value:''},'すべての用語群'));
  layout.clusters.forEach((c,i)=>clusterSelect.append(make('option',{value:c.id},`${String(i+1).padStart(2,'0')} · ${c.members.length===1?'単独用語':c.members.length+' 用語'} · ${c.label}`)));
  const clusterControls=make('div',{class:'cluster-controls'});clusterControls.append(clusterLabel,clusterSelect);
  const info=make('p',{class:'graph-info',role:'status'});
  const svg=svgEl('svg',{class:'network',role:'group',tabindex:0,'aria-label':'用語グラフ。背景をドラッグして移動、ホイールでズーム。用語をドラッグして配置、Enter で詳細へ。矢印キーで移動、プラス・マイナスでズーム、0で全体に合わせる。'});
  const defs=svgEl('defs'),marker=svgEl('marker',{id:'network-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:8,markerHeight:8,orient:'auto',markerUnits:'userSpaceOnUse'});
  marker.append(svgEl('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#496b5b'}));defs.append(marker);
  const world=svgEl('g',{class:'network-world'}), hullLayer=svgEl('g',{class:'hull-layer','aria-hidden':'true'}),edgeLayer=svgEl('g',{class:'edge-layer'}),nodeLayer=svgEl('g',{class:'node-layer'});
  world.append(hullLayer,edgeLayer,nodeLayer);svg.append(defs,world);
  const canvas=make('div',{class:'network-canvas'});canvas.append(svg);
  const zoomStatus=make('span',{class:'zoom-status','aria-live':'off'});
  const instructions=make('p',{class:'note'},'背景をドラッグして平行移動、ホイール／ピンチ／＋−でズーム。用語をドラッグして配置できます。用語をクリックまたは Enter で定義へ。フォーカス中の用語は矢印キーでも移動できます。ラベルは重なりを避けて表示し、低倍率では主要用語に絞ります。用語の名前はホバー・フォーカスや群の構成一覧でも確認できます。実線＝原典の明示参照、破線＝独自の語句対応。矢印は参照元 → 参照先です。');
  const disclaimer=make('p',{class:'cluster-disclaimer'},'用語群は参照構造から自動検出したものです。NIST の公式な分類ではありません。群番号・位置・色は概念の依存関係や学習順序を示しません。');
  const inspector=make('section',{class:'graph-inspector','aria-label':'グラフの用語群と参照の探索'});
  host.replaceChildren(controls,clusterControls,info,canvas,zoomStatus,instructions,disclaimer,inspector);

  function size(){return {width:svg.clientWidth||900,height:svg.clientHeight||620};}
  function point(event){const rect=svg.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top};}
  function toWorld(p){return{x:(p.x-tx)/scale,y:(p.y-ty)/scale};}
  function applyView(forceLabels=false){
    world.setAttribute('transform',`translate(${tx} ${ty}) scale(${scale})`);svg.dataset.scale=String(scale);zoomStatus.textContent=`拡大率 ${Math.round(scale*100)}%`;
    if(!forceLabels&&lastLabelScale===scale)return;
    lastLabelScale=scale;
    const occupied=[];
    const ordered=[...nodeElements].sort(([a],[b])=>(b===selected)-(a===selected)||positions.get(b).degree-positions.get(a).degree);
    for(const[nid,g]of ordered){
      const n=positions.get(nid),text=g.querySelector('text'),active=nid===selected||document.activeElement===g;
      const box={x:tx+n.x*scale+9*scale+5,y:ty+n.y*scale-9,width:index.terms.get(nid).heading.length*6.1,height:15};
      const collision=occupied.some(b=>box.x<b.x+b.width+5&&box.x+box.width+5>b.x&&box.y<b.y+b.height+3&&box.y+box.height+3>b.y);
      const visible=active||((scale>=.7||primaryLabels.has(nid)||cluster)&&!collision);
      text.classList.toggle('quiet-label',!visible);if(visible){text.setAttribute('transform',`scale(${1/scale})`);text.setAttribute('x',String(9*scale+5));occupied.push(box);}
    }
    for(const g of hulls.values()){const text=g.querySelector('text');text.setAttribute('transform',`translate(${text.dataset.anchorX} ${Number(text.dataset.anchorY)-14/scale}) scale(${1/scale})`);}
  }
  function queueView(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;applyView();});}
  function zoom(factor,anchor={x:size().width/2,y:size().height/2}){const w=toWorld(anchor);scale=Math.max(.08,Math.min(5,scale*factor));tx=anchor.x-w.x*scale;ty=anchor.y-w.y*scale;queueView();}
  function fit(nodes=scoped.nodes){const b=bounds(nodes,75),s=size();scale=Math.min(2,Math.max(.08,Math.min((s.width-45)/b.width,(s.height-65)/b.height)));tx=(s.width-b.width*scale)/2-b.x*scale;ty=(s.height-b.height*scale)/2-b.y*scale;applyView();}
  function edgeLabel(e){return `${index.terms.get(e.source).heading} → ${index.terms.get(e.target).heading} · ${e.entries.length} 出現`;}
  function showEdge(e){
    for(const g of edgeElements.values())g.classList.remove('inspected');edgeElements.get(e.id)?.classList.add('inspected');
    inspector.replaceChildren(make('h3',{},edgeLabel(e)),make('p',{class:'note'},'同じ参照元・参照先を1本にまとめています。以下にすべての出現と文書別の根拠を示します。'));
    const list=make('ul',{class:'network-evidence'});
    for(const entry of e.entries){const r=entry.reference,d=entry.definition;const li=make('li');
      const link=make('a',{href:`#${e.source}?definition=${encodeURIComponent(d.id)}`},`${data.manifest.documents[d.source].label} の定義を読む`);
      li.append(link,make('span',{class:'badge '+r.kind},r.kind==='explicit'?'原典の明示参照':'独自の語句対応'),make('p',{lang:'en'},d.english.slice(Math.max(0,r.start-55),r.start)+'【'+r.phrase+'】'+d.english.slice(r.end,r.end+90)),make('p',{class:'note'},`原文位置 ${r.start}–${r.end} → ${index.terms.get(e.target).heading}`));list.append(li);
    }inspector.append(list);
    const back=make('button',{type:'button',class:'inspector-back'},cluster?'群の構成に戻る':'探索案内に戻る');back.addEventListener('click',()=>{for(const g of edgeElements.values())g.classList.remove('inspected');showCluster();});inspector.append(back);
  }
  function showCluster(){
    inspector.replaceChildren();if(!cluster){inspector.append(make('p',{class:'note'},'用語群を選ぶと構成用語と群内の参照を確認できます。グラフの線を選ぶと、出典別の根拠を表示します。'));return;}
    const c=layout.clusters.find(c=>c.id===cluster),members=new Set(c.members),internal=edges.filter(e=>members.has(e.source)&&members.has(e.target));
    inspector.append(make('h3',{},`群 ${c.id.slice(-2)} · ${c.members.length} 用語 / 群内 ${internal.length} 関係`),make('p',{class:'note'},c.label+' · この所属は全データで検出し、出典条件を変えても維持します。'));
    const list=make('ul',{class:'cluster-members'});
    for(const id of c.members){const li=make('li'),a=make('a',{href:'#'+id},index.terms.get(id).heading);li.append(a);list.append(li);}inspector.append(list);
    const details=make('details');details.append(make('summary',{},'群内の参照関係を探索する'));
    const pairs=make('ul',{class:'cluster-relations'});
    for(const e of internal){const li=make('li'),button=make('button',{type:'button'},edgeLabel(e));button.addEventListener('click',()=>showEdge(e));li.append(button);pairs.append(li);}details.append(pairs);inspector.append(details);
  }
  function revealLabel(g){const text=g.querySelector('text');text.setAttribute('transform',`scale(${1/scale})`);text.setAttribute('x',String(9*scale+5));text.classList.remove('quiet-label');}
  function moveNode(id,x,y){
    const n=positions.get(id);n.x=x;n.y=y;
    const g=nodeElements.get(id);g.setAttribute('transform',`translate(${x} ${y})`);g.dataset.x=String(x);g.dataset.y=String(y);revealLabel(g);
    for(const edge of adjacent.get(id)||[]) for(const p of edgeElements.get(edge.id).querySelectorAll('path'))p.setAttribute('d',edgePath(edge,positions));
    updateHull(n.cluster);
  }
  function updateHull(clusterId){const g=hulls.get(clusterId);if(!g)return;const members=scoped.nodes.filter(n=>n.cluster===clusterId);const b=bounds(members,35);g.querySelector('rect').setAttribute('x',String(b.x));g.querySelector('rect').setAttribute('y',String(b.y));g.querySelector('rect').setAttribute('width',String(b.width));g.querySelector('rect').setAttribute('height',String(b.height));const text=g.querySelector('text');text.dataset.anchorX=String(b.x);text.dataset.anchorY=String(b.y);text.setAttribute('transform',`translate(${b.x} ${b.y-14/scale}) scale(${1/scale})`);}
  function highlight(){
    const members=cluster?new Set(layout.clusters.find(c=>c.id===cluster).members):null;
    for(const[id,g]of nodeElements){g.classList.toggle('chosen',id===selected);g.classList.toggle('muted',!!members&&!members.has(id));}
    for(const e of scoped.edges){const g=edgeElements.get(e.id);g.classList.toggle('muted',!!members&&(!members.has(e.source)||!members.has(e.target)));g.classList.toggle('emphasized',members?members.has(e.source)&&members.has(e.target):e.source===selected||e.target===selected);}
    for(const[id,g]of hulls)g.classList.toggle('muted',!!cluster&&id!==cluster);
    applyView(true);
  }
  function draw(fitView=true){
    if(mode==='local'){
      const scope=scopeGraph([...overallPositions.values()],edges,mode,selected);
      const key=selected+'|'+source+'|'+kind;
      if(!localLayouts.has(key)){
        const map=new Map();let ordinal=0;
        const peers=scope.nodes.filter(n=>n.id!==selected).sort((a,b)=>a.cluster.localeCompare(b.cluster)||b.degree-a.degree);
        map.set(selected,{...overallPositions.get(selected),x:0,y:0});
        for(let ring=0,offset=0;offset<peers.length;ring++){
          const count=Math.min(8+ring*8,peers.length-offset),radius=140+ring*125;
          for(let i=0;i<count;i++){const n=peers[offset+i],angle=2*Math.PI*i/count-Math.PI/2;map.set(n.id,{...n,x:Math.cos(angle)*radius,y:Math.sin(angle)*radius});}
          offset+=count;
        }localLayouts.set(key,map);
      }positions=localLayouts.get(key);
    }else positions=overallPositions;
    scoped=scopeGraph([...positions.values()],edges,mode,selected);nodeLayer.replaceChildren();edgeLayer.replaceChildren();hullLayer.replaceChildren();nodeElements=new Map();edgeElements=new Map();adjacent=new Map();hulls=new Map();
    for(const c of layout.clusters){if(!scoped.nodes.some(n=>n.cluster===c.id))continue;const g=svgEl('g',{class:'cluster-hull','data-cluster':c.id});g.append(svgEl('rect',{rx:35,fill:colors[(Number(c.id.slice(-2))-1)%colors.length]}),svgEl('text',{'font-size':12},`群 ${c.id.slice(-2)} · ${c.members.length} 用語`));hulls.set(c.id,g);hullLayer.append(g);updateHull(c.id);}
    for(const e of scoped.edges){const g=svgEl('g',{class:'network-edge',role:'button',tabindex:-1,'aria-label':edgeLabel(e),'data-edge':e.id});g.append(svgEl('title',{},edgeLabel(e)),svgEl('path',{class:'edge-hit',d:edgePath(e,positions)}));
      for(const type of [...new Set(e.entries.map(v=>v.reference.kind))])g.append(svgEl('path',{class:'connection '+type,d:edgePath(e,positions),'marker-end':'url(#network-arrow)',...(e.entries.some(v=>v.reference.kind!==type)?{transform:type==='lexical'?'translate(0 5)':'translate(0 -2)'}:{})}));
      g.addEventListener('click',()=>showEdge(e));g.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();showEdge(e);inspector.scrollIntoView({block:'nearest'});}});
      edgeElements.set(e.id,g);edgeLayer.append(g);for(const id of new Set([e.source,e.target])){if(!adjacent.has(id))adjacent.set(id,[]);adjacent.get(id).push(e);}
    }
    for(const n of scoped.nodes){const heading=index.terms.get(n.id).heading,g=svgEl('g',{class:'network-node',role:'button',tabindex:0,'aria-label':`${heading} · 群 ${n.cluster.slice(-2)} · Enterで定義へ、矢印キーで配置`,'data-node':n.id,'data-x':n.x,'data-y':n.y,transform:`translate(${n.x} ${n.y})`});
      g.append(svgEl('title',{},`${heading} / 群 ${n.cluster.slice(-2)}`),svgEl('circle',{r:9,fill:colors[(Number(n.cluster.slice(-2))-1)%colors.length]}),svgEl('text',{x:12,y:4,'font-size':11},heading));
      g.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();onSelect(n.id);}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopPropagation();const dx=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0,dy=event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0;moveNode(n.id,n.x+dx*15/scale,n.y+dy*15/scale);}});
      g.addEventListener('pointerenter',()=>revealLabel(g));
      g.addEventListener('pointerleave',()=>applyView(true));
      g.addEventListener('focus',()=>{revealLabel(g);});
      nodeElements.set(n.id,g);nodeLayer.append(g);
    }
    relationSelect.replaceChildren(make('option',{value:''},'参照関係の根拠を見る…'));
    for(const edge of scoped.edges)relationSelect.append(make('option',{value:edge.id},edgeLabel(edge)));
    overall.setAttribute('aria-pressed',String(mode==='overall'));local.setAttribute('aria-pressed',String(mode==='local'));
    const occurrences=scoped.edges.reduce((n,e)=>n+e.entries.length,0);
    info.textContent=`${mode==='overall'?'全体':'局所'}：${scoped.nodes.length} 用語 / ${scoped.edges.length} 方向付き関係 / ${occurrences} 出現${source||kind?'（参照元の出典・参照種別で絞り込み中）':''}`;
    svg.dataset.mode=mode;svg.dataset.nodeCount=String(scoped.nodes.length);svg.dataset.edgeCount=String(scoped.edges.length);svg.dataset.occurrences=String(occurrences);
    if(fitView)fit();highlight();showCluster();
  }
  overall.addEventListener('click',()=>{mode='overall';draw();canvas.scrollIntoView({block:'center'});});local.addEventListener('click',()=>{mode='local';draw();canvas.scrollIntoView({block:'center'});});
  plus.addEventListener('click',()=>zoom(1.3));minus.addEventListener('click',()=>zoom(1/1.3));fitButton.addEventListener('click',()=>fit());
  reset.addEventListener('click',()=>{if(mode==='overall')for(const[id,n]of overallPositions)Object.assign(n,originals.get(id));else localLayouts.delete(selected+'|'+source+'|'+kind);draw();});
  find.addEventListener('change',()=>{if(!find.value)return;if(mode==='local'&&!positions.has(find.value)){mode='overall';draw(false);}const n=positions.get(find.value);scale=1.4;tx=size().width/2-n.x*scale;ty=size().height/2-n.y*scale;applyView();nodeElements.get(n.id).focus({preventScroll:true});canvas.scrollIntoView({block:'center'});});
  clusterSelect.addEventListener('change',()=>{cluster=clusterSelect.value;highlight();showCluster();if(cluster){if(mode==='local'){mode='overall';draw(false);}const members=positionsArray().filter(n=>n.cluster===cluster);fit(members);}else fit();});
  const positionsArray=()=>[...positions.values()];
  svg.addEventListener('wheel',event=>{event.preventDefault();zoom(Math.exp(-event.deltaY*.0015),point(event));},{passive:false});
  svg.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;const p=point(event);pointers.set(event.pointerId,p);svg.setPointerCapture(event.pointerId);
    if(pointers.size===2){const[a,b]=[...pointers.values()],center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};gesture={type:'pinch',world:toWorld(center),distance:Math.hypot(a.x-b.x,a.y-b.y),scale};return;}
    const id=event.target.closest('[data-node]')?.dataset.node;
    const w=toWorld(p);gesture=id?{type:'node',id,start:p,offset:{x:w.x-positions.get(id).x,y:w.y-positions.get(id).y},moved:false}:{type:'pan',start:p,tx,ty,moved:false,edge:event.target.closest('[data-edge]')?.dataset.edge};
  });
  svg.addEventListener('pointermove',event=>{
    if(!pointers.has(event.pointerId)||!gesture)return;const p=point(event);pointers.set(event.pointerId,p);
    if(gesture.type==='pinch'&&pointers.size===2){const[a,b]=[...pointers.values()],center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};scale=Math.max(.08,Math.min(5,gesture.scale*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,gesture.distance)));tx=center.x-gesture.world.x*scale;ty=center.y-gesture.world.y*scale;queueView();return;}
    if(gesture.type==='pinch')return;
    const dx=p.x-gesture.start.x,dy=p.y-gesture.start.y;if(Math.hypot(dx,dy)>4)gesture.moved=true;
    if(gesture.type==='node'){const w=toWorld(p);moveNode(gesture.id,w.x-gesture.offset.x,w.y-gesture.offset.y);}else{tx=gesture.tx+dx;ty=gesture.ty+dy;queueView();}
  });
  function endPointer(event){pointers.delete(event.pointerId);if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);const ended=gesture;gesture=null;if(event.type==='pointerup'&&ended?.type==='node'&&!ended.moved)onSelect(ended.id);else if(event.type==='pointerup'&&ended?.edge&&!ended.moved)showEdge(edges.find(e=>e.id===ended.edge));}
  svg.addEventListener('pointerup',endPointer);svg.addEventListener('pointercancel',endPointer);
  svg.addEventListener('keydown',event=>{if(event.target!==svg)return;const s=size();if(['+','=','-','0','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))event.preventDefault();if(['+','='].includes(event.key))zoom(1.3);else if(event.key==='-')zoom(1/1.3);else if(event.key==='0')fit();else if(event.key==='ArrowLeft'){tx+=50;queueView();}else if(event.key==='ArrowRight'){tx-=50;queueView();}else if(event.key==='ArrowUp'){ty+=50;queueView();}else if(event.key==='ArrowDown'){ty-=50;queueView();}});
  let oldWidth=0;const observer=new ResizeObserver(()=>{const width=size().width;if(oldWidth===0||Math.abs(width-oldWidth)>100){oldWidth=width;if(scoped)fit();}});observer.observe(canvas);
  return {update(id,newSource='',newKind=''){local.disabled=!id;if(!id)mode='overall';const changed=selected!==id||source!==newSource||kind!==newKind;selected=id;source=newSource;kind=newKind;edges=aggregateEdges(data,source,kind);if(changed||!scoped)draw(!scoped||mode==='local');else highlight();},destroy(){observer.disconnect();if(frame)cancelAnimationFrame(frame);}};
}
