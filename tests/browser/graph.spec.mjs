import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
const data=JSON.parse(readFileSync(new URL('../../data/glossary.json',import.meta.url)));
const layout=JSON.parse(readFileSync(new URL('../../data/layout.json',import.meta.url)));
const term=name=>data.terms.find(t=>t.heading===name);
async function ready(page){await page.goto('/');await expect(page.locator('.network')).toHaveAttribute('data-node-count','189');}
test('overall graph includes every node and occurrence; local toggle restores all',async({page})=>{
  await ready(page);await expect(page.locator('.network')).toHaveAttribute('data-occurrences','1706');await expect(page.locator('.network-node')).toHaveCount(189);await expect(page.locator('.network-edge')).toHaveCount(512);
  await page.getByRole('button',{name:'選択用語の局所グラフ',exact:true}).click();
  await expect(page.locator('.network')).toHaveAttribute('data-mode','local');
  await expect(page.locator(`[data-node="${term('authentication').id}"]`)).toHaveAttribute('transform','translate(0 0)');
  expect(await page.locator('.network-node').count()).toBeLessThan(189);
  await page.getByRole('button',{name:'全体グラフ',exact:true}).click();await expect(page.locator('.network-node')).toHaveCount(189);
});
test('zoom, wheel, pan and node dragging update geometry without accidental navigation',async({page},testInfo)=>{
  await ready(page);const svg=page.locator('.network'),world=page.locator('.network-world');
  const scale=Number(await svg.getAttribute('data-scale'));
  await page.getByRole('button',{name:'グラフを拡大',exact:true}).click();await expect.poll(async()=>Number(await svg.getAttribute('data-scale'))).toBeGreaterThan(scale);
  await svg.hover();if(testInfo.project.name==='mobile')await page.getByRole('button',{name:'グラフを拡大',exact:true}).click();else await page.mouse.wheel(0,-200);await expect.poll(async()=>Number(await svg.getAttribute('data-scale'))).toBeGreaterThan(scale*1.4);
  await page.locator('#graph-find').selectOption(term('password').id);
  await page.locator(`[data-node="${term('password').id}"] circle`).scrollIntoViewIfNeeded();
  const node=page.locator(`[data-node="${term('password').id}"]`),initial=await node.getAttribute('transform'),box=await node.locator('circle').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+65,box.y+box.height/2+35,{steps:8});await page.mouse.up();
  await expect(node).not.toHaveAttribute('transform',initial);await expect(page.locator('.term-heading')).toHaveText('authentication');
  const moved=await node.getAttribute('transform');
  await page.getByRole('button',{name:'選択用語の局所グラフ',exact:true}).click();
  await page.getByRole('button',{name:'全体グラフ',exact:true}).click();
  await expect(page.locator(`[data-node="${term('password').id}"]`)).toHaveAttribute('transform',moved);
  await svg.scrollIntoViewIfNeeded();
  const before=await world.getAttribute('transform'),rect=await svg.boundingBox();
  await page.mouse.move(rect.x+12,rect.y+12);await page.mouse.down();await page.mouse.move(rect.x+60,rect.y+45,{steps:6});await page.mouse.up();await expect(world).not.toHaveAttribute('transform',before);
  await page.getByRole('button',{name:'配置を戻す',exact:true}).click();
  const original=layout.nodes.find(n=>n.id===term('password').id);await expect(page.locator(`[data-node="${original.id}"]`)).toHaveAttribute('data-x',String(original.x));
});
test('node keyboard move and selection navigates to term detail',async({page})=>{
  await ready(page);await page.locator('#graph-find').selectOption(term('password').id);
  const node=page.locator(`[data-node="${term('password').id}"]`),before=await node.getAttribute('data-x');
  await node.press('ArrowRight');await expect(node).not.toHaveAttribute('data-x',before);
  await node.press('Enter');await expect(page.locator('.term-heading')).toHaveText('password');await expect(page.locator('#detail')).toBeFocused();
  await page.locator('#graph-find').selectOption(term('authenticator').id);
  await page.locator(`[data-node="${term('authenticator').id}"] circle`).click();
  await expect(page.locator('.term-heading')).toHaveText('authenticator');
});
test('clusters expose members, internal relations and original evidence',async({page})=>{
  await ready(page);await expect(page.locator('.cluster-disclaimer')).toContainText('NIST の公式な分類ではありません');
  const cluster=layout.clusters[0];await page.locator('#cluster-select').selectOption(cluster.id);await expect(page.locator('.cluster-members a')).toHaveCount(cluster.members.length);
  await page.getByText('群内の参照関係を探索する',{exact:true}).click();await page.locator('.cluster-relations button').first().click();
  await expect(page.locator('.network-evidence li')).not.toHaveCount(0);await expect(page.locator('.network-evidence')).toContainText('原文位置');await expect(page.locator('.network-evidence')).toContainText('の定義を読む');
  await page.locator('.network-evidence a').first().click();await expect(page.locator('details.definition[open]')).toHaveCount(1);
});
test('graph remains keyboard accessible and has no WCAG AA violations',async({page})=>{
  await ready(page);await page.locator('.network').focus();const before=await page.locator('.network-world').getAttribute('transform');await page.locator('.network').press('ArrowRight');await expect(page.locator('.network-world')).not.toHaveAttribute('transform',before);
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(results.violations).toEqual([]);
});
test('invalid layout is clearly reported while complete definition data remains usable',async({page})=>{
  await page.route('**/data/layout.json',route=>route.fulfill({json:{...layout,corpusSha256:'wrong'}}));await page.goto('/');await expect(page.locator('#interactive-graph [role=alert]')).toContainText('版が一致しません');await expect(page.locator('.term-heading')).toHaveText('authentication');await expect(page.locator('.network')).toHaveCount(0);
});
test('full graph renders twelve consecutive zoom frames within the interaction budget',async({page})=>{
  await ready(page);await page.locator('.network').scrollIntoViewIfNeeded();
  await page.getByRole('button',{name:'表示中の全用語に合わせる',exact:true}).click();
  const metrics=await page.evaluate(async()=>{
    const plus=document.querySelector('[aria-label="グラフを拡大"]'),minus=document.querySelector('[aria-label="グラフを縮小"]'),world=document.querySelector('.network-world'),samples=[];
    let changed=0;const totalStart=performance.now();
    for(let i=0;i<12;i++){
      const old=world.getAttribute('transform'),start=performance.now();(i%2?minus:plus).click();
      await new Promise(resolve=>requestAnimationFrame(()=>{samples.push(performance.now()-start);if(old!==world.getAttribute('transform'))changed++;resolve();}));
    }
    return {samples,total:performance.now()-totalStart,changed};
  });
  console.info('Full graph frame measurements',JSON.stringify(metrics));
  const sorted=[...metrics.samples].sort((a,b)=>a-b);
  expect(metrics.changed).toBe(12);expect(metrics.total).toBeLessThan(1500);
  const p95=sorted[10]+.45*(sorted[11]-sorted[10]);
  expect(p95).toBeLessThan(100);expect(sorted[11]).toBeLessThan(250);
  await expect(page.locator('.network-node')).toHaveCount(189);
});

test('native two-finger pinch zoom and touch drag',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='chromium','Native multi-touch injection is available through Chromium CDP.');
  await ready(page);const svg=page.locator('.network');await svg.scrollIntoViewIfNeeded();const box=await svg.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
  const client=await page.context().newCDPSession(page),before=Number(await svg.getAttribute('data-scale'));
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-45,y:cy,id:1},{x:cx+45,y:cy,id:2}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-100,y:cy,id:1},{x:cx+100,y:cy,id:2}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=>Number(await svg.getAttribute('data-scale'))).toBeGreaterThan(before*1.8);
  await page.locator('#graph-find').selectOption(term('password').id);
  const node=page.locator(`[data-node="${term('password').id}"]`),initial=await node.getAttribute('transform'),circle=await node.locator('circle').boundingBox();
  const x=circle.x+circle.width/2,y=circle.y+circle.height/2;
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+60,y:y+40,id:1}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(node).not.toHaveAttribute('transform',initial);
});

test('source filter applies to the whole graph even when no term can be selected',async({page})=>{
  await page.goto('/#'+term('technical profile').id);await expect(page.locator('.network')).toHaveAttribute('data-node-count','189');
  await page.locator('#search').fill('no such heading');await page.locator('#source').selectOption('sp800-63a');
  const expected=data.terms.flatMap(t=>t.definitions.filter(d=>d.source==='sp800-63a')).reduce((n,d)=>n+d.references.length,0);
  await expect(page.locator('.network')).toHaveAttribute('data-occurrences',String(expected));await expect(page.locator('.network')).toHaveAttribute('data-node-count','189');
  await expect(page.getByRole('button',{name:'選択用語の局所グラフ',exact:true})).toBeDisabled();
});
