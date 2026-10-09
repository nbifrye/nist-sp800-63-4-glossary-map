import {test,expect} from '@playwright/test';
test.use({trace:'off'});
async function ready(page){await page.goto('/#graph-explorer');await expect(page.locator('.network')).toHaveAttribute('data-node-count','189');}
test('full graph renders twelve consecutive zoom frames within the interaction budget',async({page})=>{
  await ready(page);await page.locator('#graph-find').selectOption({label:'authentication'});await page.locator('.network').scrollIntoViewIfNeeded();
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
  await expect(page.locator('.network-node')).toHaveCount(189);await expect(page.locator('.edge-canvas')).toHaveAttribute('data-rendered-edges','512');await expect(page.locator('.edge-canvas')).toHaveAttribute('data-rendered-nodes','189');
});

