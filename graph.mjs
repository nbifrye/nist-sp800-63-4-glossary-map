import {aggregateEdges,validateLayout,scopeGraph,bounds,edgeGeometry,hitEdge} from './graph-model.mjs';
const NS='http://www.w3.org/2000/svg';
const make=(tag,attrs={},text='')=>{const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);e.textContent=text;return e;};
const svgEl=(tag,attrs={},text='')=>{const e=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);e.textContent=text;return e;};
const colors=['#246b5b','#66529a','#246a8b','#99642c','#914f72','#52793a','#4f639e','#87652e','#8f4c43','#3f7376'];
export function createExplorer(host,data,index,layout,onSelect,onKindChange=()=>{}) {
  validateLayout(layout,data);
  const overallPositions=new Map(layout.nodes.map(n=>[n.id,{...n}]));
  let positions=overallPositions;
  const localLayouts=new Map();
  const primaryLabels=new Set(layout.clusters.map(c=>layout.nodes.filter(n=>n.cluster===c.id).sort((a,b)=>b.degree-a.degree||a.id.localeCompare(b.id))[0].id));
  const originals=new Map(layout.nodes.map(n=>[n.id,{...n}]));
  let mode='overall',selected='',source='',kind='',cluster='',scoped,edges=[],scale=1,tx=0,ty=0,frame=0;
  let nodeElements=new Map(),edgeElements=new Map(),hulls=new Map();
  let gesture=null,lastLabelScale=null;
  const pointers=new Map();
  const compact=matchMedia('(max-width: 900px)'),coarse=matchMedia('(any-pointer: coarse)');
  let touchActive=false;
  const ownedTouches=new Set();
  let ownedNativeGesture=false;
  const controls=make('div',{class:'explorer-controls'});
  const overall=make('button',{type:'button','aria-pressed':'true'},'すべての用語');
  const local=make('button',{type:'button','aria-pressed':'false'},'選択用語の周辺');
  const plus=make('button',{type:'button','aria-label':'グラフを拡大'},'＋');
  const minus=make('button',{type:'button','aria-label':'グラフを縮小'},'−');
  const fitButton=make('button',{type:'button','aria-label':'表示中の全用語に合わせる'},'全用語に合わせる');
  const reset=make('button',{type:'button'},'ノードの配置を初期状態に戻す');
  const relationSelect=make('select',{id:'graph-relation','aria-label':'参照関係の根拠を探す'});
  relationSelect.addEventListener('change',()=>{const edge=edges.find(e=>e.id===relationSelect.value);if(edge)showEdge(edge,relationSelect);});
  const find=make('select',{id:'graph-find','aria-label':'グラフ上で用語を探す'});
  find.append(make('option',{value:''},'用語へズーム…'));
  for(const t of data.terms)find.append(make('option',{value:t.id},t.heading));
  const findLabel=make('label',{for:'graph-find'},'用語を選択');
  const finder=make('div',{class:'graph-finder'});finder.append(findLabel,find);
  controls.append(overall,local);
  const zoomControls=make('div',{class:'graph-zoom','aria-label':'グラフの拡大縮小'});zoomControls.append(minus,plus,fitButton);
  const advanced=make('details',{class:'graph-settings'});
  const advancedBody=make('div',{class:'graph-settings-body'});
  const kindSelect=make('select',{id:'graph-kind'});
  for(const [value,text]of [['','すべての参照'],['explicit','原典の明示参照のみ'],['lexical','独自の語句対応のみ']])kindSelect.append(make('option',{value},text));
  kindSelect.addEventListener('change',()=>onKindChange(kindSelect.value));
  advancedBody.append(make('label',{for:'graph-kind'},'参照の種類で絞る'),kindSelect);
  advancedBody.append(make('label',{for:'graph-relation'},'参照関係の根拠'),relationSelect,reset);
  advanced.append(make('summary',{},'操作方法・参照一覧・配置のリセット'),advancedBody);
  const clusterLabel=make('label',{for:'cluster-select'},'自動検出された用語群');
  const clusterSelect=make('select',{id:'cluster-select'});
  clusterSelect.append(make('option',{value:''},'すべての用語群'));
  layout.clusters.forEach((c,i)=>clusterSelect.append(make('option',{value:c.id},`${String(i+1).padStart(2,'0')} · ${c.members.length===1?'単独用語':c.members.length+' 用語'} · ${c.label}`)));
  const clusterControls=make('div',{class:'cluster-controls'});clusterControls.append(clusterLabel,clusterSelect);
  const clusterMembers=make('button',{type:'button'},'選択した群の用語一覧を開く');clusterMembers.disabled=true;clusterControls.append(clusterMembers);
  clusterMembers.hidden=true;
  const info=make('p',{class:'graph-info',role:'status'});
  const svg=svgEl('svg',{class:'network',role:'group',tabindex:0,'aria-label':'用語グラフ。背景をドラッグして移動、ホイールでズーム。用語をドラッグして配置、Enter で選択。矢印キーで移動、プラス・マイナスでズーム、0で全体に合わせる。'});
  const defs=svgEl('defs'),marker=svgEl('marker',{id:'network-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:8,markerHeight:8,orient:'auto',markerUnits:'userSpaceOnUse'});
  marker.append(svgEl('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#496b5b'}));defs.append(marker);
  const world=svgEl('g',{class:'network-world'}), hullLayer=svgEl('g',{class:'hull-layer','aria-hidden':'true'}),edgeLayer=svgEl('g',{class:'edge-layer'}),nodeLayer=svgEl('g',{class:'node-layer'});
  world.append(hullLayer,edgeLayer,nodeLayer);svg.append(defs,world);
  const canvas=make('div',{class:'network-canvas'}),edgeCanvas=make('canvas',{class:'edge-canvas','aria-hidden':'true'});
  const stage=make('div',{class:'graph-stage'});stage.append(canvas,zoomControls);
  const selectionBar=make('div',{class:'graph-selection'});
  const context=edgeCanvas.getContext('2d');if(!context)throw Error('このブラウザーでは参照線を描画できません。');
  edgeLayer.setAttribute('aria-hidden','true');canvas.append(edgeCanvas,svg);
  const zoomStatus=make('span',{class:'zoom-status','aria-live':'off'});
  const touchToggle=make('button',{type:'button',class:'touch-toggle','aria-pressed':'false'});
  const touchHint=make('p',{class:'touch-hint',role:'status'});
  const touchTools=make('div',{class:'graph-touch-tools'});touchTools.append(touchHint,touchToggle);
  function setTouchMode(active){
    touchActive=active;gesture=null;pointers.clear();ownedTouches.clear();ownedNativeGesture=false;
    canvas.classList.toggle('touch-active',active);touchToggle.setAttribute('aria-pressed',String(active));
    touchToggle.textContent=active?'ページスクロールに切替':'ドラッグ・ピンチに切替';
    touchHint.textContent=active?'ドラッグ・ピンチ操作中':'ページスクロール中';
  }
  touchToggle.addEventListener('click',()=>setTouchMode(!touchActive));
  // WebKit gesture events and legacy Touch Events need explicit, non-passive
  // cancellation as well as touch-action on the HTML interaction surface.
  function preventNativeGesture(event){if(touchActive&&event.cancelable)event.preventDefault();}
  canvas.addEventListener('touchstart',event=>{if(touchActive)for(const t of event.changedTouches)ownedTouches.add(t.identifier);preventNativeGesture(event);},{passive:false});
  canvas.addEventListener('touchmove',preventNativeGesture,{passive:false});
  const releaseTouches=event=>{for(const t of event.changedTouches)ownedTouches.delete(t.identifier);};
  canvas.addEventListener('touchend',releaseTouches);canvas.addEventListener('touchcancel',releaseTouches);
  function preventOwnedGesture(event){
    if(event.type==='gesturestart')ownedNativeGesture=touchActive&&ownedTouches.size>0;
    if(ownedNativeGesture)preventNativeGesture(event);
    if(event.type==='gestureend')ownedNativeGesture=false;
  }
  // Safari can target a gesture at a common ancestor when fingers straddle
  // the graph boundary. Only a sequence that began in this graph is owned.
  document.addEventListener('gesturestart',preventOwnedGesture,{passive:false,capture:true});
  document.addEventListener('gesturechange',preventOwnedGesture,{passive:false,capture:true});
  document.addEventListener('gestureend',preventOwnedGesture,{passive:false,capture:true});
  const instructions=make('p',{class:'note'},'用語をクリック／Enterで選択し、「定義を読む」で用語集を開きます。線を選ぶと根拠を開きます。背景のドラッグは画面移動、用語のドラッグ・フォーカス中の矢印キーは配置変更です。ホイール／ピンチ／＋−でズーム、0で全用語に合わせます。実線＝原典の明示参照、破線＝独自の語句対応。矢印は参照元 → 参照先です。');
  const disclaimer=make('p',{class:'cluster-disclaimer'},'用語群は参照構造から自動検出したものです。NIST の公式な分類ではありません。群番号・位置・色は概念の依存関係や学習順序を示しません。');
  const inspector=make('section',{class:'graph-inspector','aria-label':'グラフの用語群と参照の探索'});
  const inspectorDialog=make('dialog',{class:'graph-dialog','aria-labelledby':'inspector-title'}),close=make('button',{type:'button',class:'dialog-close'},'閉じる');
  close.addEventListener('click',()=>inspectorDialog.close());inspectorDialog.append(close,inspector);
  let inspectorReturnFocus;
  inspectorDialog.addEventListener('close',()=>{document.body.classList.remove('inspector-open');if(inspectorReturnFocus?.isConnected&&!inspectorReturnFocus.closest('[hidden]'))inspectorReturnFocus.focus({preventScroll:true});});
  function openInspector(trigger=svg){if(!inspectorDialog.open){inspectorReturnFocus=trigger;document.body.classList.add('inspector-open');inspectorDialog.showModal();}close.focus();}
  clusterMembers.addEventListener('click',()=>{showCluster();openInspector(clusterMembers);});
  function selectNode(id){onSelect(id);selectionBar.querySelector('a')?.focus({preventScroll:true});}
  advancedBody.append(instructions);
  host.replaceChildren(controls,finder,selectionBar,info,touchTools,stage,zoomStatus,clusterControls,advanced,disclaimer,inspectorDialog);

  function adaptInput(){
    advanced.open=false;
    setTouchMode(coarse.matches);
    if(scoped)applyView(true);
  }
  compact.addEventListener('change',adaptInput);coarse.addEventListener('change',adaptInput);adaptInput();

  function size(){return {width:svg.clientWidth||900,height:svg.clientHeight||620};}
  function point(event){const rect=svg.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top};}
  function toWorld(p){return{x:(p.x-tx)/scale,y:(p.y-ty)/scale};}
  function applyView(forceLabels=false){
    world.setAttribute('transform',`translate(${tx} ${ty}) scale(${scale})`);svg.dataset.scale=String(scale);zoomStatus.textContent=`拡大率 ${Math.round(scale*100)}%`;
    if(!forceLabels&&lastLabelScale===scale){drawConnections();return;}
    lastLabelScale=scale;
    const occupied=[];
    const ordered=[...nodeElements].sort(([a],[b])=>(b===selected)-(a===selected)||positions.get(b).degree-positions.get(a).degree);
    for(const[nid,g]of ordered){
      const n=positions.get(nid),text=g.querySelector('text'),active=nid===selected||document.activeElement===g;
      const font=compact.matches||coarse.matches?14:11,unit=font*.56;
      g.querySelector('circle').setAttribute('r',String(coarse.matches&&scale>=.7?Math.max(9,22/scale):9));
      const box={x:tx+n.x*scale+9*scale+5,y:ty+n.y*scale-font,width:index.terms.get(nid).heading.length*unit,height:font+4};
      const collision=occupied.some(b=>box.x<b.x+b.width+5&&box.x+box.width+5>b.x&&box.y<b.y+b.height+3&&box.y+box.height+3>b.y);
      const visible=active||((scale>=.7||primaryLabels.has(nid)||cluster)&&!collision);
      text.classList.toggle('quiet-label',!visible);if(visible){text.setAttribute('transform',`scale(${1/scale})`);text.setAttribute('x',String(9*scale+5));occupied.push(box);}
    }
    for(const g of hulls.values()){const text=g.querySelector('text');text.setAttribute('transform',`translate(${text.dataset.anchorX} ${Number(text.dataset.anchorY)-14/scale}) scale(${1/scale})`);}
    drawConnections();
  }
  function drawConnections(){
    if(!scoped)return;
    const view=size(),ratio=Math.min(2,window.devicePixelRatio||1),width=Math.round(view.width*ratio),height=Math.round(view.height*ratio);
    if(edgeCanvas.width!==width||edgeCanvas.height!==height){edgeCanvas.width=width;edgeCanvas.height=height;}
    context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,width,height);
    context.setTransform(ratio*scale,0,0,ratio*scale,ratio*tx,ratio*ty);
    const members=cluster?new Set(layout.clusters.find(c=>c.id===cluster).members):null;
    for(const[id,g]of hulls){
      const rect=g.querySelector('rect'),x=Number(rect.getAttribute('x')),y=Number(rect.getAttribute('y')),w=Number(rect.getAttribute('width')),h=Number(rect.getAttribute('height'));
      context.globalAlpha=cluster&&id!==cluster ? 0.008 : 0.065;context.fillStyle=colors[(Number(id.slice(-2))-1)%colors.length];context.beginPath();context.roundRect(x,y,w,h,35);context.fill();
    }
    // Batch paths by visible style, preserving every directed curve and arrow.
    const batches=new Map();
    for(const edge of scoped.edges){
      const classes=edgeElements.get(edge.id)?.classList,highlighted=classes?.contains('emphasized'),inspected=classes?.contains('inspected');
      const style=inspected?3:members&&(!members.has(edge.source)||!members.has(edge.target))?0:highlighted?2:1;
      const geometry=edgeGeometry(edge,positions),types=[...new Set(edge.entries.map(e=>e.reference.kind))];
      for(const type of types){const key=style+'|'+type;if(!batches.has(key))batches.set(key,{style,type,curves:[]});batches.get(key).curves.push({geometry,offset:types.length>1?(type==='lexical'?5:-2):0});}
    }
    for(const batch of [...batches.values()].sort((a,b)=>a.style-b.style)){
      const {style,type,curves}=batch;context.globalAlpha=[.035,.24,.8,1][style];context.strokeStyle=context.fillStyle=style===3?'#846013':'#496b5b';context.lineWidth=(style===3?2.5:style===2?1.4:1)/scale;
      context.setLineDash(type==='lexical'?[4/scale,3/scale]:[]);context.beginPath();
      for(const{geometry:g,offset}of curves){context.moveTo(g.start.x,g.start.y+offset);if(g.control2)context.bezierCurveTo(g.control.x,g.control.y+offset,g.control2.x,g.control2.y+offset,g.end.x,g.end.y+offset);else context.quadraticCurveTo(g.control.x,g.control.y+offset,g.end.x,g.end.y+offset);}
      context.stroke();context.setLineDash([]);context.beginPath();
      for(const{geometry:g,offset}of curves){const tangent=g.control2||g.control,angle=Math.atan2(g.end.y-tangent.y,g.end.x-tangent.x),length=5/scale;context.moveTo(g.end.x,g.end.y+offset);context.lineTo(g.end.x-length*Math.cos(angle-.5),g.end.y+offset-length*Math.sin(angle-.5));context.lineTo(g.end.x-length*Math.cos(angle+.5),g.end.y+offset-length*Math.sin(angle+.5));context.closePath();}context.fill();
    }
    const circles=new Map();
    for(const n of scoped.nodes){const g=nodeElements.get(n.id),focused=document.activeElement===g,muted=g.classList.contains('muted')&&!focused,chosen=n.id===selected;const key=n.cluster+'|'+muted+'|'+(focused?2:chosen?1:0);if(!circles.has(key))circles.set(key,{cluster:n.cluster,muted,ring:focused?2:chosen?1:0,nodes:[]});circles.get(key).nodes.push(n);}
    for(const batch of circles.values()){context.globalAlpha=batch.muted?.12:1;context.fillStyle=colors[(Number(batch.cluster.slice(-2))-1)%colors.length];context.strokeStyle=batch.ring===2?'#846013':batch.ring===1?'#1c3535':'#ffffff';context.lineWidth=(batch.ring===2?4:batch.ring===1?3.5:1.8)/scale;context.beginPath();for(const n of batch.nodes){context.moveTo(n.x+9,n.y);context.arc(n.x,n.y,9,0,Math.PI*2);}context.fill();context.stroke();}
    // Cached font rasterization (fillText) avoids outlining every glyph per frame.
    const font=compact.matches||coarse.matches?14:11;
    context.setTransform(ratio,0,0,ratio,0,0);context.font=`${font}px system-ui, sans-serif`;
    for(const n of scoped.nodes){const g=nodeElements.get(n.id);if(g.querySelector('text').classList.contains('quiet-label'))continue;const focused=document.activeElement===g;context.globalAlpha=g.classList.contains('muted')&&!focused?.12:1;const text=index.terms.get(n.id).heading,x=tx+n.x*scale+9*scale+5,y=ty+n.y*scale+4;context.fillStyle='#f5f8f2';context.fillRect(x-2,y-font,text.length*font*.56+4,font+4);context.fillStyle='#173535';context.fillText(text,x,y);}
    context.font='bold 12px system-ui, sans-serif';
    for(const[id,g]of hulls){const text=g.querySelector('text');context.globalAlpha=cluster&&id!==cluster?.12:1;const x=tx+Number(text.dataset.anchorX)*scale,y=ty+Number(text.dataset.anchorY)*scale-14;context.fillStyle='#f5f8f2';context.fillRect(x-2,y-12,110,16);context.fillStyle='#173535';context.fillText(text.textContent,x,y);}
    edgeCanvas.dataset.renderedNodes=String(scoped.nodes.length);edgeCanvas.dataset.renderedEdges=String(scoped.edges.length);
  }
  function queueView(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;applyView();});}
  function zoom(factor,anchor={x:size().width/2,y:size().height/2}){const w=toWorld(anchor);scale=Math.max(.08,Math.min(5,scale*factor));tx=anchor.x-w.x*scale;ty=anchor.y-w.y*scale;queueView();}
  function fit(nodes=scoped.nodes){const b=bounds(nodes,75),s=size();scale=Math.min(2,Math.max(.08,Math.min((s.width-45)/b.width,(s.height-65)/b.height)));tx=(s.width-b.width*scale)/2-b.x*scale;ty=(s.height-b.height*scale)/2-b.y*scale;applyView();}
  function edgeLabel(e){return `${index.terms.get(e.source).heading} → ${index.terms.get(e.target).heading} · ${e.entries.length} 出現`;}
  function showEdge(e,trigger=svg){
    for(const g of edgeElements.values())g.classList.remove('inspected');edgeElements.get(e.id)?.classList.add('inspected');drawConnections();
    inspector.replaceChildren(make('h3',{id:'inspector-title'},edgeLabel(e)),make('p',{class:'note'},'参照の根拠。同じ参照元・参照先の全出現を、文書別に確認できます。'));
    const list=make('ul',{class:'network-evidence'});
    for(const entry of e.entries){const r=entry.reference,d=entry.definition;const li=make('li');
      const link=make('a',{href:`#${e.source}?definition=${encodeURIComponent(d.id)}`},`${data.manifest.documents[d.source].label} の定義を読む`);
      li.append(link,make('span',{class:'badge '+r.kind},r.kind==='explicit'?'原典の明示参照':'独自の語句対応'),make('p',{lang:'en'},d.english.slice(Math.max(0,r.start-55),r.start)+'【'+r.phrase+'】'+d.english.slice(r.end,r.end+90)),make('p',{class:'note'},`原文位置 ${r.start}–${r.end} → ${index.terms.get(e.target).heading}`));list.append(li);
    }inspector.append(list);
    if(cluster){const back=make('button',{type:'button',class:'inspector-back'},'群の用語一覧に戻る');back.addEventListener('click',()=>{for(const g of edgeElements.values())g.classList.remove('inspected');drawConnections();showCluster();close.focus();});inspector.append(back);}openInspector(trigger);
  }
  function showCluster(){
    inspector.replaceChildren();if(!cluster){inspector.append(make('p',{class:'note'},'用語群を選ぶと構成用語と群内の参照を確認できます。グラフの線を選ぶと、出典別の根拠を表示します。'));return;}
    const c=layout.clusters.find(c=>c.id===cluster),members=new Set(c.members),internal=edges.filter(e=>members.has(e.source)&&members.has(e.target));
    inspector.append(make('h3',{id:'inspector-title'},`群 ${c.id.slice(-2)} · ${c.members.length} 用語 / 群内 ${internal.length} 関係`),make('p',{class:'note'},'用語名のリンクは定義を開きます。'+c.label+' · この所属は全データで検出し、出典条件を変えても維持します。'));
    const list=make('ul',{class:'cluster-members'});
    for(const id of c.members){const li=make('li'),a=make('a',{href:'#'+id},index.terms.get(id).heading);li.append(a);list.append(li);}inspector.append(list);
    const details=make('details');details.append(make('summary',{},'群内の参照関係を探索する'));
    const pairs=make('ul',{class:'cluster-relations'});
    for(const e of internal){const li=make('li'),button=make('button',{type:'button'},edgeLabel(e));button.addEventListener('click',()=>showEdge(e));li.append(button);pairs.append(li);}details.append(pairs);inspector.append(details);
  }
  function revealLabel(g){const text=g.querySelector('text');text.setAttribute('transform',`scale(${1/scale})`);text.setAttribute('x',String(9*scale+5));text.classList.remove('quiet-label');queueView();}
  function moveNode(id,x,y){
    const n=positions.get(id);n.x=x;n.y=y;
    const g=nodeElements.get(id);g.setAttribute('transform',`translate(${x} ${y})`);g.dataset.x=String(x);g.dataset.y=String(y);revealLabel(g);
    queueView();
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
    scoped=scopeGraph([...positions.values()],edges,mode,selected);nodeLayer.replaceChildren();edgeLayer.replaceChildren();hullLayer.replaceChildren();nodeElements=new Map();edgeElements=new Map();hulls=new Map();
    for(const c of layout.clusters){if(!scoped.nodes.some(n=>n.cluster===c.id))continue;const g=svgEl('g',{class:'cluster-hull','data-cluster':c.id});g.append(svgEl('rect',{rx:35,fill:colors[(Number(c.id.slice(-2))-1)%colors.length]}),svgEl('text',{'font-size':12},`群 ${c.id.slice(-2)} · ${c.members.length} 用語`));hulls.set(c.id,g);hullLayer.append(g);updateHull(c.id);}
    for(const e of scoped.edges){
      const g=svgEl('g',{class:'network-edge','data-edge':e.id});edgeElements.set(e.id,g);edgeLayer.append(g);
    }
    for(const n of scoped.nodes){const heading=index.terms.get(n.id).heading,g=svgEl('g',{class:'network-node',role:'button',tabindex:0,'aria-label':`${heading} · 群 ${n.cluster.slice(-2)} · Enterで選択、矢印キーで配置`,'data-node':n.id,'data-x':n.x,'data-y':n.y,transform:`translate(${n.x} ${n.y})`});
      g.append(svgEl('title',{},`${heading} / 群 ${n.cluster.slice(-2)}`),svgEl('circle',{r:9,fill:colors[(Number(n.cluster.slice(-2))-1)%colors.length]}),svgEl('text',{x:12,y:4,'font-size':11},heading));
      g.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();selectNode(n.id);}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopPropagation();const dx=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0,dy=event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0;moveNode(n.id,n.x+dx*15/scale,n.y+dy*15/scale);}});
      g.addEventListener('pointerenter',()=>revealLabel(g));
      g.addEventListener('pointerleave',()=>applyView(true));
      g.addEventListener('focus',()=>{revealLabel(g);});
      nodeElements.set(n.id,g);nodeLayer.append(g);
    }
    relationSelect.replaceChildren(make('option',{value:''},'参照関係の根拠を見る…'));
    for(const edge of scoped.edges)relationSelect.append(make('option',{value:edge.id},edgeLabel(edge)));
    overall.setAttribute('aria-pressed',String(mode==='overall'));local.setAttribute('aria-pressed',String(mode==='local'));
    const occurrences=scoped.edges.reduce((n,e)=>n+e.entries.length,0);
    info.textContent=`${mode==='overall'?'全体':'周辺'}：${scoped.nodes.length} 用語 / ${scoped.edges.length} 方向付き関係 / ${occurrences} 出現${source?' · 出典：'+data.manifest.documents[source].label:''}${kind?' · '+(kind==='explicit'?'原典の明示参照のみ':'独自の語句対応のみ'):''}`;
    svg.dataset.mode=mode;svg.dataset.nodeCount=String(scoped.nodes.length);svg.dataset.edgeCount=String(scoped.edges.length);svg.dataset.occurrences=String(occurrences);
    if(fitView)fit();highlight();showCluster();
  }
  overall.addEventListener('click',()=>{mode='overall';draw();});local.addEventListener('click',()=>{mode='local';draw();});
  plus.addEventListener('click',()=>zoom(1.3));minus.addEventListener('click',()=>zoom(1/1.3));fitButton.addEventListener('click',()=>fit());
  reset.addEventListener('click',()=>{if(mode==='overall')for(const[id,n]of overallPositions)Object.assign(n,originals.get(id));else localLayouts.delete(selected+'|'+source+'|'+kind);draw();});
  find.addEventListener('change',()=>{if(!find.value)return;selectNode(find.value);if(mode==='local'&&!positions.has(find.value)){mode='overall';draw(false);}const n=positions.get(find.value);scale=1.4;tx=size().width/2-n.x*scale;ty=size().height/2-n.y*scale;applyView();nodeElements.get(n.id).focus({preventScroll:true});});
  clusterSelect.addEventListener('change',()=>{cluster=clusterSelect.value;clusterMembers.disabled=!cluster;clusterMembers.hidden=!cluster;highlight();showCluster();if(cluster){if(mode==='local'){mode='overall';draw(false);}const members=positionsArray().filter(n=>n.cluster===cluster);fit(members);}else fit();});
  const positionsArray=()=>[...positions.values()];
  svg.addEventListener('wheel',event=>{event.preventDefault();zoom(Math.exp(-event.deltaY*.0015),point(event));},{passive:false});
  svg.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    const p=point(event);pointers.set(event.pointerId,p);svg.setPointerCapture(event.pointerId);
    const id=event.target.closest('[data-node]')?.dataset.node;
    if(event.pointerType==='touch'&&coarse.matches&&!touchActive){gesture={type:'tap',id,start:p,moved:false};return;}
    if(pointers.size>=2){const[a,b]=[...pointers.values()],center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};gesture={type:'pinch',world:toWorld(center),distance:Math.hypot(a.x-b.x,a.y-b.y),scale};return;}
    const w=toWorld(p);gesture=id?{type:'node',id,start:p,offset:{x:w.x-positions.get(id).x,y:w.y-positions.get(id).y},moved:false}:{type:'pan',start:p,tx,ty,moved:false,edge:hitEdge(scoped.edges,positions,w,7/scale)?.id};
  });
  svg.addEventListener('pointermove',event=>{
    if(!pointers.has(event.pointerId)||!gesture)return;const p=point(event);pointers.set(event.pointerId,p);
    if(gesture.type==='pinch'&&pointers.size>=2){const[a,b]=[...pointers.values()],center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};scale=Math.max(.08,Math.min(5,gesture.scale*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,gesture.distance)));tx=center.x-gesture.world.x*scale;ty=center.y-gesture.world.y*scale;queueView();return;}
    if(gesture.type==='pinch')return;
    const dx=p.x-gesture.start.x,dy=p.y-gesture.start.y;if(Math.hypot(dx,dy)>4)gesture.moved=true;
    if(gesture.type==='tap')return;
    if(gesture.type==='node'){const w=toWorld(p);moveNode(gesture.id,w.x-gesture.offset.x,w.y-gesture.offset.y);}else{tx=gesture.tx+dx;ty=gesture.ty+dy;queueView();}
  });
  function endPointer(event){
    pointers.delete(event.pointerId);if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);
    const ended=gesture;gesture=null;
    if(pointers.size===1){const p=[...pointers.values()][0];gesture={type:'pan',start:p,tx,ty,moved:true};}
    else if(pointers.size>=2){const[a,b]=[...pointers.values()],center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};gesture={type:'pinch',world:toWorld(center),distance:Math.hypot(a.x-b.x,a.y-b.y),scale};}
    if(!pointers.size&&event.type==='pointerup'&&['node','tap'].includes(ended?.type)&&ended.id&&!ended.moved)selectNode(ended.id);
    else if(!pointers.size&&event.type==='pointerup'&&ended?.edge&&!ended.moved)showEdge(edges.find(e=>e.id===ended.edge));
  }
  svg.addEventListener('pointerup',endPointer);svg.addEventListener('pointercancel',endPointer);
  svg.addEventListener('keydown',event=>{if(event.target!==svg)return;const s=size();if(['+','=','-','0','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))event.preventDefault();if(['+','='].includes(event.key))zoom(1.3);else if(event.key==='-')zoom(1/1.3);else if(event.key==='0')fit();else if(event.key==='ArrowLeft'){tx+=50;queueView();}else if(event.key==='ArrowRight'){tx-=50;queueView();}else if(event.key==='ArrowUp'){ty+=50;queueView();}else if(event.key==='ArrowDown'){ty-=50;queueView();}});
  let oldWidth=0;const observer=new ResizeObserver(()=>{const width=svg.clientWidth;if(!width)return;if(oldWidth===0||Math.abs(width-oldWidth)>100){oldWidth=width;if(scoped)fit();}});observer.observe(canvas);
  return {activate(){if(scoped){if(!oldWidth)fit();else applyView(true);}},closeInspector(){if(inspectorDialog.open)inspectorDialog.close();},setMode(value){mode=value==='local'&&selected?'local':'overall';draw();},update(id,newSource='',newKind=''){local.disabled=!id;if(!id)mode='overall';const changed=selected!==id||source!==newSource||kind!==newKind;selected=id;source=newSource;kind=newKind;kindSelect.value=kind;selectionBar.replaceChildren();if(id){selectionBar.append(make('span',{},'選択中：'+index.terms.get(id).heading),make('a',{href:'#'+id,class:'action-link'},'定義を読む →'));}else selectionBar.append(make('span',{},'用語を選択してください'));edges=aggregateEdges(data,source,kind);if(changed||!scoped)draw(!scoped||mode==='local');else highlight();},destroy(){observer.disconnect();compact.removeEventListener('change',adaptInput);coarse.removeEventListener('change',adaptInput);for(const type of ['gesturestart','gesturechange','gestureend'])document.removeEventListener(type,preventOwnedGesture,true);if(frame)cancelAnimationFrame(frame);}};
}
