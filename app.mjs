import {createExplorer} from './graph.mjs?v=20261009-workspace';
import {filterTerms, indexData, relationships} from './core.mjs';
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
let data, index, selected=null, explorer, referenceKind = '', view='reader', readerTab='definitions', detailShown=false, relationDirection='outgoing', relationPage=0;
const compactLayout=matchMedia('(max-width: 900px)');
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
function saveReaderState(){
  const [id,query='']=location.hash.slice(1).split('?');if(view!=='reader'||!id?.startsWith('term-'))return;
  const params=new URLSearchParams(query);
  for(const key of ['panel','direction','page'])params.delete(key);
  if(readerTab==='references'){params.set('panel','references');params.set('direction',relationDirection);if(relationPage)params.set('page',String(relationPage));}
  history.replaceState(null,'',`#${id}${params.size?'?'+params:''}`);
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
  details.append(el('summary',{text:label(d.source)}), el('div',{class:'definition-body'},[
    el('p',{class:'language-label',text:'日本語 / プロジェクト独自訳'}),el('p',{class:'japanese',text:d.japanese}),
    el('details',{class:'english-disclosure'},[el('summary',{text:'英語原文を読む（用語リンクで定義へ移動）'}),english(d)]),
    el('p',{class:'source-link'},[el('a',{href:d.sourceUrl,text:'NIST 原典の Glossary を開く ↗'}),document.createTextNode(' · '),el('a',{href:termHref(selected.id,d.id),text:'この定義へのリンク'})]),
    el('details',{class:'provenance'},[el('summary',{text:'翻訳の確認履歴・原文ハッシュ'}),el('p',{text:`翻訳・対照確認：${d.review.author} · ${d.review.date} / ${d.review.note} 定義 SHA-256: ${d.hash}`})])
  ]));
  return details;
}
function evidenceList(entries, direction, page=0) {
  const list = el('ul',{class:'evidence-list'});
  const grouped = new Map();
  for (const e of entries) {
    const key = [e.definition.id,e.reference.target,e.reference.kind].join('|');
    if (!grouped.has(key)) grouped.set(key,[]);
    grouped.get(key).push(e);
  }
  const groups=[...grouped.values()];list.dataset.totalGroups=String(groups.length);
  for (const group of groups.slice(page*8,page*8+8)) {
    const e = group[0], target = direction==='incoming' ? e.term : index.terms.get(e.reference.target);
    const phrases = [...new Set(group.map(x=>x.reference.phrase))];
    const item = el('li',{class:'evidence'},[
      el('a',{href:termHref(target.id,direction==='incoming'?e.definition.id:''),text:target.heading,lang:'en'}),
      el('p',{class:'note',text:`参照元の定義：${e.term.heading} / ${label(e.definition.source)}`}),
      badge(e.reference.kind)
    ]);
    item.dataset.evidenceKey=[e.definition.id,e.reference.target,e.reference.kind].join('|');
    const more = el('details',{},[el('summary',{text:`原文の根拠を開く · ${group.length} 出現`}),el('p',{class:'quote',text:phrases.map(p=>'“'+p+'”').join(' / '),lang:'en'}),el('p',{class:'note',text:`規則：${e.reference.rule}${e.reference.sourceEmphasis?' · 原典の斜体表現':''}`}),el('a',{href:e.definition.sourceUrl,text:'参照元の NIST 原典を開く ↗'})]);
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
function renderDetail() {
  const root=$('detail');root.replaceChildren();
  if(!selected){explorer?.update('',$('source').value,referenceKind);root.append(el('h2',{text:'用語を選んで読む'}),el('p',{class:'empty',text:'一覧から用語を選ぶと、定義を表示します。参照関係やグラフへもそこから移動できます。'}),el('a',{class:'back-to-catalog',href:'#catalog',text:'用語一覧を開く'}));return;}
  const definitions=selected.definitions.filter(d=>!$('source').value||d.source===$('source').value);
  const requestedDefinition=new URLSearchParams(location.hash.split('?')[1]||'').get('definition');
  root.append(el('a',{class:'back-to-catalog',href:'#catalog',text:'← 用語一覧へ戻る'}),el('h2',{class:'term-heading',lang:'en',text:selected.heading}),el('p',{class:'meta',text:`${definitions.length} 文書の定義 · 出典ごとの原文と日本語訳` }));
  const tabs=el('div',{class:'reader-tabs',role:'group','aria-label':'用語の表示内容'});
  const defButton=el('button',{type:'button',text:'定義','aria-pressed':String(readerTab==='definitions')});
  const refButton=el('button',{type:'button',text:'参照関係','aria-pressed':String(readerTab==='references')});
  const defs=el('section',{id:'definition-panel','aria-label':'定義'}),refs=el('section',{id:'reference-panel','aria-label':'参照関係'});
  function switchTab(tab){readerTab=tab;defs.hidden=tab!=='definitions';refs.hidden=tab!=='references';defButton.setAttribute('aria-pressed',String(tab==='definitions'));refButton.setAttribute('aria-pressed',String(tab==='references'));}
  defButton.addEventListener('click',()=>{switchTab('definitions');saveReaderState();});refButton.addEventListener('click',()=>{switchTab('references');saveReaderState();});tabs.append(defButton,refButton);
  definitions.forEach((d,i)=>defs.append(definitionCard(d,requestedDefinition?requestedDefinition===d.id:i===0)));
  const selector=el('select',{id:'kind'},[el('option',{value:'',text:'すべての参照'}),el('option',{value:'explicit',text:'原典の明示参照のみ'}),el('option',{value:'lexical',text:'独自の語句対応のみ'})]);selector.value=referenceKind;
  const content=el('div');refs.append(el('div',{class:'toolbar'},[el('label',{for:'kind',text:'参照の種類'}),selector]),content);
  function updateRelations(){
    const rel=relationships(selected,index,$('source').value,referenceKind);explorer?.update(selected.id,$('source').value,referenceKind);
    const directions=el('div',{class:'direction-tabs',role:'group','aria-label':'参照の方向'});
    for(const [key,title] of [['outgoing',`参照する用語 (${rel.outgoing.length} 出現)`],['incoming',`参照される定義 (${rel.incoming.length} 出現)`]]){
      const button=el('button',{type:'button',text:title,'aria-pressed':String(relationDirection===key)});button.addEventListener('click',()=>{relationDirection=key;relationPage=0;updateRelations();saveReaderState();content.querySelector(`[data-direction="${key}"]`).focus();});button.dataset.direction=key;directions.append(button);
    }
    let list=evidenceList(rel[relationDirection],relationDirection,relationPage);const total=Number(list.dataset.totalGroups),pages=Math.max(1,Math.ceil(total/8));
    if(relationPage>=pages){relationPage=pages-1;list=evidenceList(rel[relationDirection],relationDirection,relationPage);}
    const pager=el('div',{class:'reference-pager','aria-label':'参照一覧のページ'}),prev=el('button',{type:'button',text:'前の8件'}),next=el('button',{type:'button',text:'次の8件'});
    prev.disabled=relationPage===0;next.disabled=relationPage+1>=pages;
    for(const [button,delta] of [[prev,-1],[next,1]])button.addEventListener('click',()=>{relationPage+=delta;updateRelations();saveReaderState();refs.scrollIntoView({block:'start'});refs.focus({preventScroll:true});});
    pager.append(prev,el('span',{class:'reference-page-status',role:'status',text:`${relationPage+1} / ${pages} ページ · ${total} 件`}),next);
    content.replaceChildren(el('a',{class:'action-link',href:`#graph-explorer?term=${selected.id}&mode=local`,text:'この用語の周辺をグラフで見る →'}),directions,el('div',{class:'relations-grid'},[list]),pager);
  }
  refs.tabIndex=-1;
  selector.addEventListener('change',()=>{referenceKind=selector.value;relationPage=0;saveFilters();updateRelations();saveReaderState();});
  root.append(tabs,defs,refs);updateRelations();switchTab(readerTab);
}
function renderView(focus=false){
  document.body.dataset.view=view;document.body.dataset.reader=detailShown?'detail':'catalog';
  document.querySelector('.workspace').hidden=view!=='reader';$('graph-explorer').hidden=view!=='graph';$('about').hidden=view!=='about';document.querySelector('footer').hidden=view!=='about';document.querySelector('.app-filters').hidden=view==='about';
  $('catalog').hidden=compactLayout.matches&&detailShown;$('detail').hidden=compactLayout.matches&&!detailShown;
  document.querySelectorAll('.section-nav a').forEach(a=>{if(a.dataset.view===view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  if(view!=='graph')explorer?.closeInspector();else requestAnimationFrame(()=>explorer?.activate());
  if(focus){window.scrollTo({top:0,behavior:'instant'});const target=view==='graph'?$('graph-title'):view==='about'?$('about'):detailShown?$('detail'):$('search');if(!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}
}
function selectFromHash(focus=false){
  const [id='',query='']=location.hash.slice(1).split('?'),params=new URLSearchParams(query);
  if(id==='graph-explorer'){view='graph';const term=index.terms.get(params.get('term'));if(term)selected=term;}
  else if(id==='about')view='about';
  else if(id==='catalog'||!id){view='reader';detailShown=false;}
  else if(id==='detail'){view='reader';detailShown=true;readerTab='definitions';}
  else {
    const term=index.terms.get(id);view='reader';detailShown=true;readerTab=params.get('panel')==='references'?'references':'definitions';relationDirection=params.get('direction')==='incoming'?'incoming':'outgoing';relationPage=Math.max(0,Number.parseInt(params.get('page'),10)||0);
    if(!term){$('detail').replaceChildren(el('p',{class:'error',role:'alert',text:'指定された用語は見つかりません。用語一覧から選び直してください。'}));renderView(focus);return;}
    selected=term;
  }
  if($('source').value&&selected&&!selected.definitions.some(d=>d.source===$('source').value)){$('source').value='';saveFilters();}
  renderCatalog();renderDetail();if(view==='graph'&&params.get('mode')==='local')explorer?.setMode('local');renderView(focus);
}
compactLayout.addEventListener('change',()=>renderView());
async function boot() {
  try {
    const response = await fetch('./data/glossary.json', {signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw Error(`データ取得失敗 (HTTP ${response.status})`);
    const raw=await response.text();
    data = JSON.parse(raw);index=indexData(data);
    try {
      const layoutResponse=await fetch('./data/layout.json',{signal:AbortSignal.timeout(15000)});
      if(!layoutResponse.ok)throw Error(`配置データ取得失敗 (HTTP ${layoutResponse.status})`);
      const layout=await layoutResponse.json();
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),n=>n.toString(16).padStart(2,'0')).join('');
      if(hash!==layout.corpusSha256)throw Error('全体グラフの配置と用語データの版が一致しません。');
      explorer=createExplorer($('interactive-graph'),data,index,layout,id=>{selected=index.terms.get(id);renderCatalog();renderDetail();history.replaceState(null,'',`#graph-explorer?term=${id}`);},newKind=>{referenceKind=newKind;saveFilters();renderDetail();});
    } catch(error) {
      $('interactive-graph').replaceChildren(el('p',{class:'error',role:'alert',text:'関係グラフを表示できません。'+error.message}),el('p',{text:'「用語集」画面で定義と参照一覧を閲覧できます。ページを再読み込みして再試行してください。'}));
    }
    const params = new URLSearchParams(location.search);
    $('search').value=params.get('q')||'';
    $('source').value=params.get('source')||'';
    referenceKind=['explicit','lexical'].includes(params.get('kind'))?params.get('kind'):'';
    $('search').disabled=false;$('source').disabled=false;
    $('stats').textContent=`${data.terms.length} 用語 / ${index.definitions.size} 定義 / 4 文書`;
    $('search').addEventListener('input',()=>{saveFilters();renderCatalog();});
    $('source').addEventListener('change',()=>{
      relationPage=0;
      const filtered=filterTerms(data.terms,$('search').value,$('source').value);
      if (selected && $('source').value && !selected.definitions.some(d=>d.source===$('source').value)) selected=filtered[0]||null;
      if (selected && view==='reader'&&detailShown) history.replaceState(null,'',termHref(selected.id));
      saveFilters();renderCatalog();renderDetail();saveReaderState();renderView();
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
    $('interactive-graph').replaceChildren(el('p',{class:'error',text:'完全な用語データがないため、全体グラフを表示していません。'}));
    $('search').disabled=true;$('source').disabled=true;$('terms').replaceChildren();$('result-count').textContent='';
    const retry=el('button',{class:'retry',type:'button',text:'再読み込み'});retry.addEventListener('click',()=>location.reload());
    view='reader';detailShown=true;renderView();
    $('detail').replaceChildren(el('div',{class:'error',role:'alert'},[el('p',{text:'完全な用語データを読み込めませんでした。閲覧結果は表示していません。'}),el('p',{text:error.message}),retry]));
  }
}
boot();
