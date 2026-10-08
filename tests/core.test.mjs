import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterTerms,indexData,relationships,neighbors} from '../core.mjs';
const data=JSON.parse(readFileSync(new URL('../data/glossary.json',import.meta.url)));
const index=indexData(data);
test('heading search excludes acronym aliases and applies document membership',()=>{
  assert.equal(filterTerms(data.terms,'AAL','').length,0);
  assert.equal(filterTerms(data.terms,'AUTHENTICATION ASSURANCE','').length,1);
  assert.equal(filterTerms(data.terms,'','sp800-63a').length,89);
  assert.equal(filterTerms(data.terms,'','sp800-63c').length,94);
});
test('incoming edges retain source definition and evidence',()=>{
  const term=data.terms.find(t=>t.heading==='authentication');
  const rel=relationships(term,index,'sp800-63b','lexical');
  assert.ok(rel.incoming.length>0);
  for(const e of rel.incoming){assert.equal(e.definition.source,'sp800-63b');assert.equal(e.reference.kind,'lexical');assert.equal(e.reference.target,term.id);}
  assert.ok(neighbors(rel.incoming,'incoming').length>0);
});
test('mutual references terminate and reverse correctly',()=>{
  const term=data.terms.find(t=>t.heading==='validation');
  const other=data.terms.find(t=>t.heading==='attribute validation');
  assert.ok(relationships(term,index).outgoing.some(e=>e.reference.target===other.id));
  assert.ok(relationships(term,index).incoming.some(e=>e.term.id===other.id));
});
test('missing definition and broken evidence fail closed',()=>{
  const broken=structuredClone(data);broken.terms[0].definitions.pop();assert.throws(()=>indexData(broken));
  const malformed=structuredClone(data);malformed.terms[0].definitions[0].references[0].phrase='fake';assert.throws(()=>indexData(malformed));
});
