import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFileSync} from 'node:fs';
const corpus=JSON.parse(readFileSync(new URL('../../data/glossary.json',import.meta.url)));
const password=corpus.terms.find(t=>t.heading==='password').id;
async function ready(page){await page.goto('/#graph-explorer');await expect(page.locator('.network')).toHaveAttribute('data-node-count','189');}
test('separate screens keep catalog short and preserve selection through resizing',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.locator('#stats')).toContainText('189');
  await expect(page.locator('#catalog')).toBeVisible();await expect(page.locator('#detail')).not.toBeVisible();await expect(page.locator('#graph-explorer')).not.toBeVisible();await expect(page.locator('#about')).not.toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThan(844*1.4);
  await page.screenshot({path:testInfo.outputPath('compact-search.png')});
  await page.locator('#search').fill('password');await page.locator('#terms a').filter({hasText:/^password/}).click();
  await expect(page.locator('.term-heading')).toHaveText('password');await expect(page.locator('#detail')).toBeFocused();await expect(page.locator('#catalog')).not.toBeVisible();
  await expect(page.locator('#reference-panel')).not.toBeVisible();await expect(page.locator('.english:visible')).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath('compact-reading.png')});
  await page.locator('.section-nav a[data-view=graph]').click();await expect(page.locator('.graph-selection')).toContainText('password');
  await expect(page.locator('#detail')).not.toBeVisible();await expect(page.locator('#about')).not.toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThan(844*1.8);
  await page.screenshot({path:testInfo.outputPath('compact-graph.png')});
  await page.locator('.section-nav a[data-view=reader]').click();await expect(page.locator('#search')).toHaveValue('password');
  await page.setViewportSize({width:1280,height:900});await expect(page.locator('.section-nav')).toBeVisible();await expect(page.locator('#catalog')).toBeVisible();await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator('.term-heading')).toHaveText('password');await page.locator('.section-nav a[data-view=graph]').click();
  await page.screenshot({path:testInfo.outputPath('desktop-graph.png')});
});
test('narrow, tablet and landscape controls remain readable in each screen',async({page})=>{
  for(const viewport of [{width:320,height:640},{width:768,height:1024},{width:844,height:390}]){
    await page.setViewportSize(viewport);await page.goto('/');await expect(page.locator('#stats')).toContainText('189');
    for(const selector of ['#search','#source']){
      expect(await page.locator(selector).evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
      expect((await page.locator(selector).boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('.section-nav a[data-view=graph]').click();await expect(page.locator('.network')).toBeVisible();
    for(const selector of ['#graph-find','#cluster-select']){
      expect(await page.locator(selector).evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
      expect((await page.locator(selector).boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.setViewportSize({width:390,height:844});await page.locator('.graph-settings summary').click();await expect(page.locator('#graph-relation')).toBeVisible();
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(results.violations).toEqual([]);
});
test('touch scroll mode, enlarged node targets and touch navigation',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  const page=await context.newPage();await ready(page);
  const toggle=page.locator('.touch-toggle'),svg=page.locator('.network');
  await expect(toggle).toHaveAttribute('aria-pressed','true');
  expect(await svg.evaluate(e=>getComputedStyle(e).touchAction)).toBe('none');
  expect(await page.locator('.network-canvas').evaluate(e=>getComputedStyle(e).touchAction)).toBe('none');
  await page.locator('#graph-find').selectOption(password);
  const circle=page.locator(`[data-node="${password}"] circle`);
  const target=await circle.boundingBox();expect(target.width).toBeGreaterThanOrEqual(43.9);
  await circle.tap();await expect(page.locator('.graph-selection')).toContainText('password');await expect(page.locator('#detail')).not.toBeVisible();
  await toggle.tap();await expect(toggle).toHaveAttribute('aria-pressed','false');
  expect(await svg.evaluate(e=>getComputedStyle(e).touchAction)).toContain('pan-y');
  await toggle.tap();await expect(toggle).toHaveAttribute('aria-pressed','true');
  expect(await svg.evaluate(e=>getComputedStyle(e).touchAction)).toBe('none');
  await context.close();
});
test('native graph gestures leave page scroll and scale unchanged; page mode remains available',async({browser},testInfo)=>{
  test.skip(testInfo.project.name!=='chromium','Native swipe injection uses Chromium CDP.');
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();await ready(page);
  const svg=page.locator('.network'),client=await context.newCDPSession(page);
  await svg.scrollIntoViewIfNeeded();
  async function swipe(){const b=await svg.boundingBox(),x=b.x+b.width/2,y=b.y+b.height*.7;
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    for(let i=1;i<=6;i++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*20,id:1}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  await expect(page.locator('.touch-toggle')).toHaveAttribute('aria-pressed','true');
  const initialPage=await page.evaluate(()=>({y:scrollY,scale:visualViewport.scale})),initialView=await page.locator('.network-world').getAttribute('transform');
  await swipe();await expect(page.locator('.network-world')).not.toHaveAttribute('transform',initialView);
  await expect.poll(()=>page.evaluate(()=>({y:scrollY,scale:visualViewport.scale}))).toEqual(initialPage);
  await page.locator('.touch-toggle').tap();await svg.scrollIntoViewIfNeeded();
  const before=await page.evaluate(()=>scrollY),view=await page.locator('.network-world').getAttribute('transform');await swipe();
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(before+40);
  await expect(page.locator('.network-world')).toHaveAttribute('transform',view);
  await page.locator('.touch-toggle').tap();await svg.scrollIntoViewIfNeeded();
  const lockedPage=await page.evaluate(()=>({y:scrollY,scale:visualViewport.scale}));
  const after=await page.locator('.network-world').getAttribute('transform');await swipe();await expect(page.locator('.network-world')).not.toHaveAttribute('transform',after);
  await expect.poll(()=>page.evaluate(()=>({y:scrollY,scale:visualViewport.scale}))).toEqual(lockedPage);
  const b=await svg.boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2,scale=Number(await svg.getAttribute('data-scale'));
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y,id:1},{x:x+30,y,id:2}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-80,y,id:1},{x:x+80,y,id:2}]});
  await expect.poll(async()=>Number(await svg.getAttribute('data-scale'))).toBeGreaterThan(scale*2);
  await expect.poll(()=>page.evaluate(()=>({y:scrollY,scale:visualViewport.scale}))).toEqual(lockedPage);
  // Continue with one finger after lifting the other, without restarting.
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+80,y,id:2}]});
  const pinched=await page.locator('.network-world').getAttribute('transform');
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+100,y:y+25,id:2}]});
  await expect(page.locator('.network-world')).not.toHaveAttribute('transform',pinched);
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>page.evaluate(()=>({y:scrollY,scale:visualViewport.scale}))).toEqual(lockedPage);
  await page.locator('#graph-find').selectOption(password);
  const node=page.locator(`[data-node="${password}"]`),original=await node.getAttribute('transform'),circle=await node.locator('circle').boundingBox();
  const dragPage=await page.evaluate(()=>({y:scrollY,scale:visualViewport.scale}));
  const nx=circle.x+circle.width/2,ny=circle.y+circle.height/2;
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:nx,y:ny,id:1}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:nx+50,y:ny+30,id:1}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(node).not.toHaveAttribute('transform',original);
  await expect(page.locator('.graph-selection')).toContainText('password');await expect(page.locator('#detail')).not.toBeVisible();
  await expect.poll(()=>page.evaluate(()=>({y:scrollY,scale:visualViewport.scale}))).toEqual(dragPage);
  // The browser still owns a pinch that starts outside the graph.
  await page.locator('.masthead').scrollIntoViewIfNeeded();
  const outside=await page.locator('.masthead').boundingBox(),ox=outside.x+outside.width/2,oy=outside.y+outside.height/2;
  const pageScale=await page.evaluate(()=>visualViewport.scale);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:ox-30,y:oy,id:1},{x:ox+30,y:oy,id:2}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:ox-90,y:oy,id:1},{x:ox+90,y:oy,id:2}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>page.evaluate(()=>visualViewport.scale)).toBeGreaterThan(pageScale*1.2);
  await context.close();
});

test('Safari touch and gesture events are canceled only for owned graph interactions',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});const page=await context.newPage();await ready(page);
  async function cancellation(){return page.evaluate(()=>{
    const surface=document.querySelector('.network-canvas'),node=document.querySelector('.network-node circle');
    const emit=(target,type)=>{const event=new Event(type,{bubbles:true,cancelable:true});if(type.startsWith('touch'))Object.defineProperty(event,'changedTouches',{value:[{identifier:17}]});target.dispatchEvent(event);return event.defaultPrevented;};
    const outside=emit(document.body,'gesturestart');
    const start=emit(node,'touchstart'),move=emit(surface,'touchmove');
    const gestureStart=emit(document.body,'gesturestart'),gestureChange=emit(document.body,'gesturechange');
    emit(node,'touchend');
    const gestureEnd=emit(document.body,'gestureend'),outsideAfter=emit(document.body,'gesturestart');
    return {outside,start,move,gestureStart,gestureChange,gestureEnd,outsideAfter};
  });}
  expect(await cancellation()).toEqual({outside:false,start:true,move:true,gestureStart:true,gestureChange:true,gestureEnd:true,outsideAfter:false});
  await page.locator('.touch-toggle').tap();
  expect(await cancellation()).toEqual({outside:false,start:false,move:false,gestureStart:false,gestureChange:false,gestureEnd:false,outsideAfter:false});
  await context.close();
});
