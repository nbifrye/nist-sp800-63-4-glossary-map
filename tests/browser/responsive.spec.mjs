import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFileSync} from 'node:fs';
const corpus=JSON.parse(readFileSync(new URL('../../data/glossary.json',import.meta.url)));
const password=corpus.terms.find(t=>t.heading==='password').id;
async function ready(page){await page.goto('/');await expect(page.locator('.network')).toHaveAttribute('data-node-count','189');}
test('compact search, reading, navigation and resizing preserve the selected term',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});await ready(page);
  expect(await page.locator('#search').boundingBox()).toMatchObject({width:expect.any(Number)});
  expect((await page.locator('#search').boundingBox()).y).toBeLessThan(650);
  await page.screenshot({path:testInfo.outputPath('compact-search.png')});
  expect(await page.evaluate(()=>document.querySelector('.workspace').compareDocumentPosition(document.querySelector('#graph-explorer'))&Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  await page.locator('#search').fill('password');await page.locator('#terms a').filter({hasText:/^password/}).click();
  await expect(page.locator('.term-heading')).toHaveText('password');await expect(page.locator('#detail')).toBeFocused();
  await page.screenshot({path:testInfo.outputPath('compact-reading.png')});
  await page.locator('.section-nav a[href="#graph-explorer"]').click();
  await expect(page.locator('.term-heading')).toHaveText('password');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await page.locator('#graph-title').boundingBox()).y).toBeGreaterThan(50);
  expect((await page.locator('#graph-title').boundingBox()).y).toBeLessThan(200);
  await page.screenshot({path:testInfo.outputPath('compact-graph.png')});
  await page.locator('.section-nav a[href="#catalog"]').click();await expect(page.locator('#search')).toHaveValue('password');
  await page.setViewportSize({width:1280,height:900});
  await expect(page.locator('.section-nav')).not.toBeVisible();
  expect(await page.evaluate(()=>document.querySelector('#graph-explorer').compareDocumentPosition(document.querySelector('.workspace'))&Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  await expect(page.locator('.term-heading')).toHaveText('password');
  await page.locator('.network').scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath('desktop-graph.png')});
});
test('narrow, tablet and landscape layouts have readable controls without overflow',async({page})=>{
  for(const viewport of [{width:320,height:640},{width:768,height:1024},{width:844,height:390}]){
    await page.setViewportSize(viewport);await ready(page);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    for(const selector of ['#search','#source','#graph-find','#cluster-select']){
      expect(await page.locator(selector).evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
      expect((await page.locator(selector).boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.setViewportSize({width:390,height:844});
  expect(await page.locator('.japanese').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  await page.locator('.graph-settings summary').click();await expect(page.locator('#graph-relation')).toBeVisible();
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(results.violations).toEqual([]);
});
test('touch scroll mode, enlarged node targets and touch navigation',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  const page=await context.newPage();await ready(page);
  const toggle=page.locator('.touch-toggle'),svg=page.locator('.network');
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  expect(await svg.evaluate(e=>getComputedStyle(e).touchAction)).toContain('pan-y');
  await page.locator('#graph-find').selectOption(password);
  const circle=page.locator(`[data-node="${password}"] circle`);
  const target=await circle.boundingBox();expect(target.width).toBeGreaterThanOrEqual(43.9);
  await circle.tap();await expect(page.locator('.term-heading')).toHaveText('password');
  await toggle.tap();await expect(toggle).toHaveAttribute('aria-pressed','true');
  expect(await svg.evaluate(e=>getComputedStyle(e).touchAction)).toBe('none');
  await toggle.tap();await expect(toggle).toHaveAttribute('aria-pressed','false');
  expect(await svg.evaluate(e=>getComputedStyle(e).touchAction)).toContain('pan-y');
  await context.close();
});
test('native swipes scroll by default, then pan and pinch when activated',async({browser},testInfo)=>{
  test.skip(testInfo.project.name!=='chromium','Native swipe injection uses Chromium CDP.');
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});const page=await context.newPage();await ready(page);
  const svg=page.locator('.network'),client=await context.newCDPSession(page);
  await svg.scrollIntoViewIfNeeded();
  async function swipe(){const b=await svg.boundingBox(),x=b.x+b.width/2,y=b.y+b.height*.7;
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    for(let i=1;i<=6;i++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*20,id:1}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  const before=await page.evaluate(()=>scrollY),view=await page.locator('.network-world').getAttribute('transform');await swipe();
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(before+40);
  await expect(page.locator('.network-world')).toHaveAttribute('transform',view);
  await page.locator('.touch-toggle').tap();await svg.scrollIntoViewIfNeeded();
  const after=await page.locator('.network-world').getAttribute('transform');await swipe();await expect(page.locator('.network-world')).not.toHaveAttribute('transform',after);
  const b=await svg.boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2,scale=Number(await svg.getAttribute('data-scale'));
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y,id:1},{x:x+30,y,id:2}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-80,y,id:1},{x:x+80,y,id:2}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=>Number(await svg.getAttribute('data-scale'))).toBeGreaterThan(scale*2);
  await page.locator('#graph-find').selectOption(password);
  const node=page.locator(`[data-node="${password}"]`),original=await node.getAttribute('transform'),circle=await node.locator('circle').boundingBox();
  const nx=circle.x+circle.width/2,ny=circle.y+circle.height/2;
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:nx,y:ny,id:1}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:nx+50,y:ny+30,id:1}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(node).not.toHaveAttribute('transform',original);
  await expect(page.locator('.term-heading')).toHaveText('authentication');
  await context.close();
});
