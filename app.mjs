import {filterTerms, indexData, relationships, neighbors} from './core.mjs';
const $ = id => document.getElementById(id);
const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  if (tag === 'a') node.tabIndex = 0;
  for (const [key,value] of Object.entries(props)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
};
let data, index, selected, graphPage = 0, referenceKind = '';
const termHref = (id, definition = '') => `#${id}${definition ? '?definition=' + encodeURIComponent(definition) : ''}`;
const label = id => data.manifest.documents[id].label;
const badge = kind => el('span', {class:`badge ${kind}`, text:kind === 'explicit' ? '原典の明示参照' : '独自の語句対応'});
function saveFilters() {
  const url = new URL(location.href);
  for (const [key,value] of [['q',$('search').value], ['source',$('source').value], ['kind',referenceKind]]) {
    if (value) url.searchParams.set(key,value); else url.searchParams.delete(key);
  }
  history.replaceState(null,'',url);
}
function renderCatalog() {
  const terms = filterTerms(data.terms, $('search').value, $('source').value);
  $('result-count').textContent = `${terms.length} / ${data.terms.length} 用語`;
  const fragment = document.createDocumentFragment();
  for (const term of terms) fragment.append(el('li',{}, [el('a',{href:termHref(term.id),class:'term-link','aria-current':String(term.id===selected?.id)},[el('b',{text:term.heading,lang:'en'}),el('span',{text:`${term.definitions.length} 文書`})])]));
  if (!terms.length) fragment.append(el('li',{class:'empty',text:'該当する用語はありません。見出しや出典条件を変更してください。'}));
  $('terms').replaceChildren(fragment);
}
function english(d) {
  const p = el('p',{class:'english',lang:'en'});
  let offset = 0;
  for (const r of d.references) {
    p.append(document.createTextNode(d.english.slice(offset,r.start)));
    const target = index.terms.get(r.target);
    p.append(el('a',{href:termHref(target.id),class:`ref-inline ${r.kind}`,text:r.phrase,title:`${target.heading} — ${r.kind==='explicit'?'原典の明示参照':'独自の語句対応'}`}));
    offset = r.end;
  }
  p.append(document.createTextNode(d.english.slice(offset)));
  return p;
}
function definitionCard(d, open) {
  const details = el('details',{class:'definition',id:'definition-'+d.id});
  details.open = open;
  details.append(el('summary',{text:label(d.source)+' · '+data.manifest.edition}), el('div',{class:'definition-body'},[
    el('p',{class:'language-label',text:'ENGLISH / NIST 原文'}), english(d),
    el('p',{class:'language-label',text:'日本語 / プロジェクト独自訳'}),el('p',{class:'japanese',text:d.japanese}),
    el('p',{class:'source-link'},[el('a',{href:d.sourceUrl,text:'NIST 原典の Glossary を開く ↗'}),document.createTextNode(' · '),el('a',{href:termHref(selected.id,d.id),text:'この定義へのリンク'})]),
    el('p',{class:'provenance',text:`翻訳・対照確認：${d.review.author} · ${d.review.date} / ${d.review.note} 定義 SHA-256: ${d.hash}`})
  ]));
  return details;
}
function evidenceList(entries, direction) {
  const list = el('ul',{class:'evidence-list'});
  const grouped = new Map();
  for (const e of entries) {
    const key = [e.definition.id,e.reference.target,e.reference.kind].join('|');
    if (!grouped.has(key)) grouped.set(key,[]);
    grouped.get(key).push(e);
  }
  for (const group of grouped.values()) {
    const e = group[0], target = direction==='incoming' ? e.term : index.terms.get(e.reference.target);
    const phrases = [...new Set(group.map(x=>x.reference.phrase))];
    const item = el('li',{class:'evidence'},[
      el('a',{href:termHref(target.id,direction==='incoming'?e.definition.id:''),text:target.heading,lang:'en'}),
      el('p',{class:'note',text:`参照元の定義：${e.term.heading} / ${label(e.definition.source)}`}),
      el('p',{class:'quote',text:phrases.map(p=>'“'+p+'”').join(' / '),lang:'en'}), badge(e.reference.kind),
      el('p',{class:'note',text:`${group.length} 出現 · 規則：${e.reference.rule}${e.reference.sourceEmphasis?' · 原典の斜体表現':''}`}),
      el('a',{href:e.definition.sourceUrl,text:'参照元の NIST 原典 ↗'})
    ]);
    const more = el('details',{},[el('summary',{text:'根拠の文脈・原文位置'})]);
    for (const occurrence of group) {
      const r = occurrence.reference, text = e.definition.english;
      more.append(el('p',{class:'quote',lang:'en',text:`${r.start>55?'…':''}${text.slice(Math.max(0,r.start-55),r.start)}【${r.phrase}】${text.slice(r.end,r.end+90)}${r.end+90<text.length?'…':''}`}));
      more.append(el('p',{class:'note',text:`原文位置 ${r.start}–${r.end}（0 始まり、末尾を含まない） → ${index.terms.get(r.target).heading}`}));
    }
    item.append(more);
    list.append(item);
  }
  if (!entries.length) list.append(el('li',{class:'empty',text:'この条件に該当する参照はありません。'}));
  return list;
}
function svgNode(tag, attrs = {}, text = '') {
  const node = document.createElementNS('http://www.w3.org/2000/svg',tag);
  for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);
  if (text) node.textContent = text;
  return node;
}
function renderGraph(rel, container) {
  container.replaceChildren();
  const left = neighbors(rel.incoming,'incoming').filter(([id])=>id!==selected.id);
  const right = neighbors(rel.outgoing,'outgoing').filter(([id])=>id!==selected.id);
  const pageSize = 10, pages = Math.max(1,Math.ceil(Math.max(left.length,right.length)/pageSize));
  graphPage = Math.min(graphPage,pages-1);
  const visibleLeft = left.slice(graphPage*pageSize,(graphPage+1)*pageSize), visibleRight = right.slice(graphPage*pageSize,(graphPage+1)*pageSize);
  const count = Math.max(visibleLeft.length,visibleRight.length,1), height = Math.max(240,count*58+100), mid = height/2;
  const svg = svgNode('svg',{class:'graph',width:850,height,viewBox:`0 0 850 ${height}`,role:'group','aria-label':`参照方向のグラフ：参照元の定義から ${selected.heading} へ、${selected.heading} の定義から参照先へ。詳細は下の参照一覧でも確認できます。`});
  const defs = svgNode('defs'), marker = svgNode('marker',{id:'arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto'});
  marker.append(svgNode('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#496b5b'}));defs.append(marker);svg.append(defs);
  svg.append(svgNode('text',{x:25,y:28,class:'graph-caption'},`参照元 → 選択用語 (${left.length})`), svgNode('text',{x:625,y:28,class:'graph-caption'},`選択用語 → 参照先 (${right.length})`));
  function drawNode(id,x,y,chosen=false) {
    const heading = index.terms.get(id).heading;
    const group = svgNode('a',{href:termHref(id),class:'node'+(chosen?' selected':''),tabindex:0,'aria-label':heading});
    group.append(svgNode('title',{},heading), svgNode('rect',{x,y:y-20,width:205,height:40,rx:6}),svgNode('text',{x:x+12,y:y+4},heading.length>29?heading.slice(0,27)+'…':heading));
    svg.append(group);
  }
  function drawEdge(x1,y1,x2,y2,entries) {
    const kinds = [...new Set(entries.map(e=>e.reference.kind))];
    for (const [i,kind] of kinds.entries()) {
      const delta = kinds.length>1 ? (i===0?-4:4) : 0;
      const path = svgNode('path',{d:`M ${x1} ${y1+delta} C ${(x1+x2)/2} ${y1+delta} ${(x1+x2)/2} ${y2+delta} ${x2} ${y2+delta}`,class:'edge '+kind,'marker-end':'url(#arrow)'});
      path.append(svgNode('title',{},`${kind==='explicit'?'原典の明示参照':'独自の語句対応'}：${entries.filter(e=>e.reference.kind===kind).length} 出現`)); svg.append(path);
    }
  }
  for (let i=0;i<visibleLeft.length;i++) drawEdge(230,70+i*58,322,mid,visibleLeft[i][1]);
  for (let i=0;i<visibleRight.length;i++) drawEdge(527,mid,620,70+i*58,visibleRight[i][1]);
  const self = rel.outgoing.filter(e=>e.reference.target===selected.id);
  if (self.length) {
    svg.append(svgNode('path',{d:`M 355 ${mid-20} C 340 ${mid-90} 510 ${mid-90} 490 ${mid-20}`,class:'edge','marker-end':'url(#arrow)'}));
    svg.append(svgNode('text',{x:369,y:mid-65},`自己参照 ${self.length} 出現`));
  }
  drawNode(selected.id,322,mid,true);
  visibleLeft.forEach(([id],i)=>drawNode(id,25,70+i*58)); visibleRight.forEach(([id],i)=>drawNode(id,620,70+i*58));
  const box = el('div',{class:'graph-box',tabindex:'0','aria-label':'参照グラフ。横にスクロールできます。'},[svg]);
  container.append(box);
  const prev = el('button',{type:'button',text:'← 前の接続'}), next = el('button',{type:'button',text:'次の接続 →'});
  prev.disabled=graphPage===0; next.disabled=graphPage===pages-1;
  prev.addEventListener('click',()=>{graphPage--;renderGraph(rel,container);container.querySelector('.pager button').focus();});
  next.addEventListener('click',()=>{graphPage++;renderGraph(rel,container);container.querySelector('.pager button:last-child').focus();});
  container.append(el('div',{class:'pager'},[prev,el('span',{text:`接続 ${graphPage+1} / ${pages} ページ · 各方向最大10用語`}),next]));
}
function renderDetail() {
  const root = $('detail'); root.replaceChildren();
  if (!selected) {root.append(el('p',{class:'empty',text:'左の一覧から用語を選んでください。'}));return;}
  const definitions = selected.definitions.filter(d=>!$('source').value || d.source===$('source').value);
  const requestedDefinition = new URLSearchParams(location.hash.split('?')[1] || '').get('definition');
  root.append(el('p',{class:'eyebrow',text:'GLOSSARY / TERM'}),el('h2',{class:'term-heading',lang:'en',text:selected.heading}),el('p',{class:'meta',text:`${selected.definitions.length} 文書に掲載 · 現在 ${definitions.length} 定義を表示 · 同じ見出しの定義を出典別に確認できます。`}),el('h3',{class:'section-title',text:'定義',},[el('span',{text:'DEFINITIONS'})]));
  definitions.forEach((d,i)=>root.append(definitionCard(d,requestedDefinition?requestedDefinition===d.id:i===0)));
  root.append(el('h3',{class:'section-title',text:'言葉のつながり'},[el('span',{text:'REFERENCES'})]));
  const selector = el('select',{id:'kind'},[el('option',{value:'',text:'すべての参照'}),el('option',{value:'explicit',text:'原典の明示参照のみ'}),el('option',{value:'lexical',text:'独自の語句対応のみ'})]);selector.value=referenceKind;
  const toolbar = el('div',{class:'toolbar'},[el('label',{for:'kind',text:'参照の種類'}),selector]);
  const content = el('div');
  root.append(toolbar,el('p',{class:'note',text:'矢印は定義から用語への参照方向。実線＝原典の明示参照、破線＝独自の語句対応。出典条件は参照元の定義に適用されます。概念の依存関係・学習順序を示しません。'}),content);
  function updateRelations() {
    const rel = relationships(selected,index,$('source').value,referenceKind);
    const graph=el('div'); renderGraph(rel,graph);
    const grid=el('div',{class:'relations-grid'},[
      el('section',{},[el('h3',{text:`この定義が参照する用語 → (${rel.outgoing.length} 出現)`}),evidenceList(rel.outgoing,'outgoing')]),
      el('section',{},[el('h3',{text:`この用語を参照する定義 ← (${rel.incoming.length} 出現)`}),evidenceList(rel.incoming,'incoming')])]);
    content.replaceChildren(graph,grid);
  }
  selector.addEventListener('change',()=>{referenceKind=selector.value;graphPage=0;saveFilters();updateRelations();});
  updateRelations();
}
function selectFromHash(focus = false) {
  let id = location.hash.slice(1).split('?')[0];
  if (id==='about' || id==='detail') {
    if (selected) return;
    id = '';
  }
  const term = index.terms.get(id);
  if (id && !term) {
    $('detail').replaceChildren(el('p',{class:'error',role:'alert',text:'指定された用語は見つかりません。用語一覧から選び直してください。'}));return;
  }
  selected=term || data.terms.find(t=>t.heading==='authentication');
  if ($('source').value && !selected.definitions.some(d=>d.source===$('source').value)) {
    $('source').value='';saveFilters();
  }
  graphPage=0;renderCatalog();renderDetail();
  if (focus) $('detail').focus();
}
async function boot() {
  try {
    const response = await fetch('./data/glossary.json', {signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw Error(`データ取得失敗 (HTTP ${response.status})`);
    data = await response.json();index=indexData(data);
    const params = new URLSearchParams(location.search);
    $('search').value=params.get('q')||'';
    $('source').value=params.get('source')||'';
    referenceKind=['explicit','lexical'].includes(params.get('kind'))?params.get('kind'):'';
    $('search').disabled=false;$('source').disabled=false;
    $('stats').textContent=`${data.terms.length} 用語 / ${index.definitions.size} 定義 / 4 文書`;
    $('search').addEventListener('input',()=>{saveFilters();renderCatalog();});
    $('source').addEventListener('change',()=>{
      const filtered=filterTerms(data.terms,$('search').value,$('source').value);
      if (selected && $('source').value && !selected.definitions.some(d=>d.source===$('source').value)) selected=filtered[0]||null;
      if (selected) history.replaceState(null,'',termHref(selected.id));
      graphPage=0;saveFilters();renderCatalog();renderDetail();
    });
    window.addEventListener('hashchange',()=>{
      const params=new URLSearchParams(location.search);
      $('search').value=params.get('q')||'';
      $('source').value=params.get('source')||'';
      referenceKind=['explicit','lexical'].includes(params.get('kind'))?params.get('kind'):'';
      selectFromHash(true);
    });
    selectFromHash();
  } catch (error) {
    $('stats').textContent='読み込みに失敗しました';
    $('search').disabled=true;$('source').disabled=true;$('terms').replaceChildren();$('result-count').textContent='';
    const retry=el('button',{class:'retry',type:'button',text:'再読み込み'});retry.addEventListener('click',()=>location.reload());
    $('detail').replaceChildren(el('div',{class:'error',role:'alert'},[el('p',{text:'完全な用語データを読み込めませんでした。閲覧結果は表示していません。'}),el('p',{text:error.message}),retry]));
  }
}
boot();
