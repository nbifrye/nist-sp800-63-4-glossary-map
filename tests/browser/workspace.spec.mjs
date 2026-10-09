import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../../data/glossary.json',import.meta.url)));
const term=name=>data.terms.find(t=>t.heading===name);
test('all reference groups remain reachable through bounded pages and browser history',async({page})=>{
  const selected=term('authentication'),expected=new Set();
  for(const t of data.terms)for(const d of t.definitions)for(const r of d.references)if(r.target===selected.id)expected.add([d.id,r.target,r.kind].join('|'));
  await page.goto('/#'+selected.id);await page.getByRole('button',{name:'参照関係',exact:true}).click();await page.getByRole('button',{name:/^参照される定義/}).click();
  await expect(page.locator('#definition-panel')).not.toBeVisible();
  const found=[];let pages=0;
  while(true){
    const keys=await page.locator('.evidence-list .evidence').evaluateAll(items=>items.map(e=>e.dataset.evidenceKey));
    expect(keys.length).toBeLessThanOrEqual(8);found.push(...keys);pages++;
    if(await page.getByRole('button',{name:'次の8件'}).isDisabled())break;
    await page.getByRole('button',{name:'次の8件'}).click();
  }
  expect(pages).toBe(Math.ceil(expected.size/8));expect(found.length).toBe(expected.size);expect(new Set(found)).toEqual(expected);
  const status=await page.locator('.reference-page-status').textContent(),url=page.url();
  await page.locator('.evidence>a').first().click();await expect(page.locator('#definition-panel')).toBeVisible();
  await page.goBack();await expect(page).toHaveURL(url);await expect(page.locator('#reference-panel')).toBeVisible();await expect(page.locator('.reference-page-status')).toHaveText(status);
  await page.locator('#source').selectOption('sp800-63b');await expect(page.getByRole('button',{name:/^参照される定義/})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.reference-page-status')).toContainText('1 /');
});
test('graph selection, explicit reading and modal evidence have distinct outcomes',async({page})=>{
  await page.goto('/#graph-explorer');await expect(page.locator('.network')).toBeVisible();
  await page.locator('#graph-find').selectOption(term('password').id);
  await page.locator(`[data-node="${term('password').id}"] circle`).click();
  await expect(page.locator('body')).toHaveAttribute('data-view','graph');await expect(page.locator('.graph-selection')).toContainText('password');await expect(page.locator('.workspace')).not.toBeVisible();
  const placement=await page.locator(`[data-node="${term('password').id}"]`).getAttribute('transform');
  await page.locator('.graph-selection a').click();await expect(page.locator('body')).toHaveAttribute('data-view','reader');await expect(page.locator('.term-heading')).toHaveText('password');
  await page.goBack();await expect(page.locator('.network')).toBeVisible();await expect(page.locator(`[data-node="${term('password').id}"]`)).toHaveAttribute('transform',placement);
  await page.locator('.graph-settings summary').click();await page.locator('#graph-relation').selectOption({index:1});
  await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('button',{name:'閉じる',exact:true})).toBeFocused();await expect(page.locator('.network-evidence')).toContainText('原文位置');
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(result.violations).toEqual([]);
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.locator('#graph-relation')).toBeFocused();
  await page.locator('#graph-kind').selectOption('explicit');await expect(page.locator('.graph-info')).toContainText('原典の明示参照のみ');
});
test('navigation isolates site information and native disclosures explain click actions',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.locator('#search')).toBeEnabled();
  await page.locator('.section-nav a[data-view=about]').click();await expect(page.locator('.workspace')).not.toBeVisible();await expect(page.locator('#graph-explorer')).not.toBeVisible();
  await expect(page.locator('.section-nav a[data-view=about]')).toHaveAttribute('aria-current','page');
  await page.getByText('参照と用語群の判定方法',{exact:true}).click();await expect(page.locator('.about-topic[open]')).toHaveCount(2);
  await page.screenshot({path:testInfo.outputPath('compact-about.png')});
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(result.violations).toEqual([]);
  await page.locator('.section-nav a[data-view=reader]').click();await page.locator('#search').fill('password');await page.locator('#terms a').first().click();
  await expect(page.locator('.english:visible')).toHaveCount(0);await page.locator('.definition[open] .english-disclosure summary').click();await expect(page.locator('.english:visible')).toHaveCount(1);
  await page.locator('.definition[open] .provenance summary').click();await expect(page.locator('.provenance[open]')).toContainText('SHA-256');
});
