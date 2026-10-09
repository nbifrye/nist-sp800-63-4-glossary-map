import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {aggregateEdges,validateLayout,scopeGraph,edgePath,bounds} from '../graph-model.mjs';
const data=JSON.parse(readFileSync(new URL('../data/glossary.json',import.meta.url)));
const layout=JSON.parse(readFileSync(new URL('../data/layout.json',import.meta.url)));
const edges=aggregateEdges(data);
test('all corpus occurrences survive directional aggregation',()=>{
  assert.equal(edges.length,512);assert.equal(edges.reduce((n,e)=>n+e.entries.length,0),1706);
  for(const t of data.terms)for(const d of t.definitions)for(const r of d.references){const e=edges.find(e=>e.source===t.id&&e.target===r.target);assert.ok(e.entries.some(v=>v.definition===d&&v.reference===r));}
});
test('all nodes and all edges in overall; full neighborhood in local',()=>{
  validateLayout(layout,data);
  const selected=data.terms.find(t=>t.heading==='authentication').id;
  const all=scopeGraph(layout.nodes,edges,'overall',selected);assert.equal(all.nodes.length,189);assert.equal(all.edges.length,512);
  const local=scopeGraph(layout.nodes,edges,'local',selected);
  const expected=new Set([selected]);for(const e of edges)if(e.source===selected||e.target===selected){expected.add(e.source);expected.add(e.target);}
  assert.deepEqual(new Set(local.nodes.map(n=>n.id)),expected);assert.ok(local.edges.every(e=>expected.has(e.source)&&expected.has(e.target)));
});
test('source and kind filtering preserves per-definition evidence',()=>{
  const scoped=aggregateEdges(data,'sp800-63b','explicit');assert.ok(scoped.length);
  assert.ok(scoped.every(e=>e.entries.every(v=>v.definition.source==='sp800-63b'&&v.reference.kind==='explicit')));
});
test('missing and duplicate nodes or memberships fail validation',()=>{
  const missing=structuredClone(layout);missing.nodes.pop();assert.throws(()=>validateLayout(missing,data));
  const broken=structuredClone(layout);broken.clusters[0].members.push(broken.clusters[1].members[0]);assert.throws(()=>validateLayout(broken,data));
});
test('drag geometry supports self-loops and reciprocal directions',()=>{
  const p=new Map(layout.nodes.map(n=>[n.id,{...n}]));
  for(const e of edges)assert.ok(!edgePath(e,p).includes('NaN'));
  const e=edges.find(e=>e.source!==e.target),path=edgePath(e,p);p.get(e.source).x+=100;assert.notEqual(edgePath(e,p),path);
  assert.ok(bounds(layout.nodes).width>0);
});
