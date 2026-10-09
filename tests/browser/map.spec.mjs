import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFileSync} from 'node:fs';
const corpus=JSON.parse(readFileSync(new URL('../../data/glossary.json',import.meta.url)));
const term=name=>corpus.terms.find(t=>t.heading===name);
test('search, document definitions, and acronym exclusion',async({page})=>{
  await page.goto('/');
  await expect(page.locator('#stats')).toHaveText('189 用語 / 496 定義 / 4 文書');
  await page.locator('#search').fill('AAL');await expect(page.locator('#result-count')).toHaveText('0 / 189 用語');
  await page.locator('#search').fill('authentication');
  await page.locator('#terms a').filter({hasText:/^authentication4 文書$/}).click();
  await expect(page.locator('.definition')).toHaveCount(4);
  await page.locator('#source').selectOption('sp800-63b');
  await expect(page.locator('.definition')).toHaveCount(1);
  await expect(page.locator('.definition summary')).toContainText('SP 800-63B-4');
  await expect(page.locator('.japanese')).toContainText('加入者アカウント');
});
test('explicit references and circular navigation keep source evidence',async({page})=>{
  await page.goto('/#'+term('validation').id);
  await page.locator('#kind').selectOption('explicit');
  await page.locator('.english:visible a').filter({hasText:'attribute validation'}).click();
  await expect(page.locator('.term-heading')).toHaveText('attribute validation');
  await page.locator('.english:visible a').filter({hasText:/^validation$/}).click();
  await expect(page.locator('.term-heading')).toHaveText('validation');
  await expect(page.locator('.relations-grid')).toContainText('原典の明示参照');
  await expect(page.locator('.relations-grid')).toContainText('参照元の定義：');
});
test('original italic occurrences appear in the explicit reference filter',async({page})=>{
  await page.goto('/#'+term('account linking').id);
  await page.locator('#source').selectOption('sp800-63');
  await page.locator('#kind').selectOption('explicit');
  await expect(page.locator('.english:visible a.explicit').filter({hasText:/^federated identifiers$/})).toBeVisible();
  await expect(page.locator('.relations-grid')).toContainText('source-italic');
  await page.locator('#kind').selectOption('lexical');
  await expect(page.locator('.relations-grid')).not.toContainText('source-italic');
});
test('incoming definition deep link opens correct document',async({page})=>{
  const t=term('authenticator'),d=t.definitions.find(d=>d.source==='sp800-63b');
  await page.goto('/#'+t.id+'?definition='+encodeURIComponent(d.id));
  await expect(page.locator('details.definition[open] summary')).toContainText('SP 800-63B-4');
  await expect(page.locator('details.definition[open]')).toHaveCount(1);
});
test('failed or incomplete data is not shown as a successful result',async({page})=>{
  await page.route('**/data/glossary.json',route=>route.fulfill({status:500,body:'error'}));
  await page.goto('/');await expect(page.getByRole('alert')).toContainText('完全な用語データ');
  await expect(page.locator('#search')).toBeDisabled();await expect(page.locator('.term-heading')).toHaveCount(0);
});
test('malformed dataset fails closed',async({page})=>{
  const broken=structuredClone(corpus);broken.terms.pop();
  await page.route('**/data/glossary.json',route=>route.fulfill({json:broken}));
  await page.goto('/');await expect(page.getByRole('alert')).toContainText('完全な用語データ');
});
test('keyboard selection and accessible content',async({page})=>{
  await page.goto('/');await page.locator('#search').fill('password');
  await page.locator('#search').press('Tab');await expect(page.locator('#source')).toBeFocused();
  await page.locator('#source').press('Tab');await expect(page.locator('#terms a').first()).toBeFocused();
  await page.locator('#terms a').first().press('Enter');await expect(page.locator('#detail')).toBeFocused();
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});
test('narrow and enlarged layouts have no page overflow',async({page})=>{
  await page.setViewportSize({width:375,height:812});await page.goto('/');
  await expect(page.locator('#stats')).toContainText('496');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.locator('#detail').scrollIntoViewIfNeeded();
  await expect(page.locator('.term-heading')).toBeVisible();
  await page.setViewportSize({width:640,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
