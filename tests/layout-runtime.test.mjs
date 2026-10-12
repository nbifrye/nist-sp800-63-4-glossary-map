import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatePlacement,parameterFields} from '../layout-runtime.mjs';
const nodes=[{id:'a',x:0,y:0,cluster:'one',rank:0},{id:'b',x:80,y:140,cluster:'one',rank:1},{id:'c',x:200,y:140,cluster:'two',rank:1},{id:'isolated',x:500,y:500,cluster:'three',rank:0}];
const edges=[{source:'a',target:'b'},{source:'b',target:'c'}];
for(const method of ['force','stress'])test(`${method} recalculates deterministically, preserves membership and packs isolated terms`,()=>{
 const p=Object.fromEntries(parameterFields(method).map(f=>[f.key,f.value]));p.iterations=30;
 const result=calculatePlacement(nodes,edges,method,p);
 assert.deepEqual(result,calculatePlacement(nodes,edges,method,p));
 assert.notDeepEqual(result,calculatePlacement(nodes,edges,method,{...p,seed:43}));
 assert.deepEqual(result.map(n=>[n.id,n.cluster,n.rank]),nodes.map(n=>[n.id,n.cluster,n.rank]));
 assert.ok(result.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
 assert.equal(new Set(result.map(n=>`${n.x},${n.y}`)).size,4);
});
test('hierarchy spacing changes independent axes while keeping ranks and source coordinates',()=>{
 const result=calculatePlacement(nodes,edges,'layered',{horizontal:2,vertical:.5});
 assert.equal(Math.abs(result[1].x-result[2].x),170);assert.equal(result[1].y,70);assert.equal(result[1].rank,1);assert.equal(nodes[1].y,140);
});
test('group spacing adjusts centers independently of internal spread',()=>{
 const result=calculatePlacement(nodes,edges,'grouped',{within:.5,between:2});
 assert.equal(result[1].x-result[0].x,40);assert.equal((result[1].x+result[0].x)/2,80);
});
test('invalid or unbounded calculation parameters are rejected',()=>{
 for(const value of [NaN,Infinity,0,501,1.5])assert.throws(()=>calculatePlacement(nodes,edges,'force',{iterations:value}));
});
