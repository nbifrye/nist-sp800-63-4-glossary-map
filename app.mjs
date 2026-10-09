import {createExplorer} from './graph.mjs?v=20261009-safari-gestures';
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
let data, index, selected, explorer, referenceKind = '';
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
function renderDetail() {
  const root = $('detail'); root.replaceChildren();
  if (!selected) {explorer?.update('',$('source').value,referenceKind);root.append(el('p',{class:'empty',text:'用語一覧から用語を選んでください。'}));return;}
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
    explorer?.update(selected.id,$('source').value,referenceKind);
    const graph=el('p',{class:'note'},[el('a',{href:'#graph-explorer',text:'全体／局所グラフで参照を探索する ↑'})]);
    const grid=el('div',{class:'relations-grid'},[
      el('section',{},[el('h3',{text:`この定義が参照する用語 → (${rel.outgoing.length} 出現)`}),evidenceList(rel.outgoing,'outgoing')]),
      el('section',{},[el('h3',{text:`この用語を参照する定義 ← (${rel.incoming.length} 出現)`}),evidenceList(rel.incoming,'incoming')])]);
    content.replaceChildren(graph,grid);
  }
  selector.addEventListener('change',()=>{referenceKind=selector.value;saveFilters();updateRelations();});
  updateRelations();
}
function selectFromHash(focus = false) {
  let id = location.hash.slice(1).split('?')[0];
  if (id==='about' || id==='detail' || id==='graph-explorer' || id==='catalog') {
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
  renderCatalog();renderDetail();
  if (focus) $('detail').focus();
}
// Keep reading and keyboard order aligned when the compact layout puts search first.
const compactLayout=matchMedia('(max-width: 900px)');
function adaptLayout(){
  const workspace=document.querySelector('.workspace'),graph=$('graph-explorer');
  if(compactLayout.matches)graph.before(workspace);else graph.after(workspace);
}
compactLayout.addEventListener('change',adaptLayout);adaptLayout();
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
      explorer=createExplorer($('interactive-graph'),data,index,layout,id=>{if(location.hash==='#'+id){selectFromHash(true);}else location.hash=id;});
    } catch(error) {
      $('interactive-graph').replaceChildren(el('p',{class:'error',role:'alert',text:'全体グラフを表示できません。'+error.message}),el('p',{text:'用語の定義と参照一覧は下で閲覧できます。ページを再読み込みして再試行してください。'}));
    }
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
      saveFilters();renderCatalog();renderDetail();
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
    $('detail').replaceChildren(el('div',{class:'error',role:'alert'},[el('p',{text:'完全な用語データを読み込めませんでした。閲覧結果は表示していません。'}),el('p',{text:error.message}),retry]));
  }
}
boot();
