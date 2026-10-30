import {test, expect, type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';

const names = ['Red Bell Pepper','Yellow Bell Pepper','Oranges','Kale','Cabbage','Cucumbers','Bananas','Eggs','Tomatoes','Milk','Carrots','Mystery ingredient'];
async function mockKitchen(page: Page) {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const json = path === '/api/scans' ? [{id:9,status:'pending'}, {id:8,status:'reviewed',created_at:'2026-10-27T10:00:00Z'}, {id:7,status:'reviewed'}]
      : path === '/api/scans/8/items' ? names.map((name,index) => ({id:index+1,scan_id:8,name,confirmed:true,category:index===2||index===6?'Fruits':'Vegetables',stock_status:index<3?'low':index===11?'unknown':'available'}))
      : path === '/api/health' ? {mock_vision:true}
      : path === '/api/shopping-lists' ? [{id:1,name:'Weekly list',items:[{id:1,name:'Rice',completed:false},{id:2,name:'Milk',completed:true}]}]
      : path === '/api/fridge-suggestions' ? {scan_id:8,is_mock:false,items:[]} : [];
    return route.fulfill({json});
  });
  // Image requests are served from the checked-in catalog, never a paid provider.
  await page.route('**/foods/*.webp', route => route.fulfill({contentType:'image/webp',body:readFileSync(`public${new URL(route.request().url()).pathname}`)}));
}

for (const width of [375,768,1024,1440]) {
  test(`dashboard and complete inventory at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:1000});
    const errors:string[]=[]; page.on('pageerror', error => errors.push(error.message));
    await mockKitchen(page);
    await page.goto('/');
    const dashboard=page.getByRole('region',{name:'Dashboard',exact:true});
    const banner=dashboard.locator('.welcome-card');
    await expect(banner.getByRole('heading',{level:1})).toContainText('Something delicious');
    await expect(dashboard.getByRole('article',{name:'Inventory ingredients'}).locator('strong')).toHaveText('12');
    await expect(dashboard.getByRole('article',{name:'Available ingredients'}).locator('strong')).toHaveText('8');
    await expect(dashboard.getByRole('article',{name:'Running low'}).locator('strong')).toHaveText('3');
    await expect(dashboard.getByRole('article',{name:'Pending shopping items'}).locator('strong')).toHaveText('1');
    expect(await banner.evaluate(el=>el===el.parentElement?.firstElementChild)).toBe(true);
    const metrics=await dashboard.locator('.summary-grid').boundingBox();const hero=await banner.boundingBox();
    expect(hero!.y+hero!.height).toBeLessThan(metrics!.y);
    await expect(dashboard.locator('.preview-item')).toHaveCount(6);
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByLabel('Search food')).toHaveCount(0);
    for (const img of await dashboard.locator('.preview-item img').all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(()=>img.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);
    }
    await banner.scrollIntoViewIfNeeded();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`../test-results/dashboard-inventory/${width}-dashboard.png`,fullPage:true});
    await dashboard.getByRole('link',{name:'View all ingredients'}).click();
    await expect(page).toHaveURL(/\/inventory$/);
    const inventory=page.getByRole('region',{name:'My inventory',exact:true});
    await expect(inventory.locator('.inventory-item')).toHaveCount(12);
    await expect(inventory.getByText('Showing 12 of 12 current ingredients')).toBeVisible();
    for (const name of names.slice(0,6)) {
      const img=inventory.getByAltText(`Reference photograph of ${name} (not your fridge)`);
      await img.scrollIntoViewIfNeeded();
      await expect(img).toBeVisible();
      await expect.poll(()=>img.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);
    }
    await expect(inventory.getByRole('img',{name:'No reference photo for Mystery ingredient'})).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link',{name:'My Inventory',exact:true})).toHaveAttribute('aria-current','page');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`../test-results/dashboard-inventory/${width}-inventory-cards.png`,fullPage:true});
    await inventory.getByRole('button',{name:'Switch to table view'}).click();
    await expect(inventory.locator('tbody>tr')).toHaveCount(12);
    await inventory.getByRole('button',{name:'Edit Cucumbers'}).click();
    const editor=inventory.getByRole('form',{name:'Edit ingredient'});
    await editor.getByLabel('Ingredient name',{exact:true}).fill('Fresh cucumbers');
    await page.getByRole('navigation').getByRole('link',{name:'Dashboard',exact:true}).click();
    await expect(page.getByRole('table')).toHaveCount(0);
    await page.goBack();
    await expect(editor.getByLabel('Ingredient name',{exact:true})).toHaveValue('Fresh cucumbers');
    await editor.scrollIntoViewIfNeeded();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`../test-results/dashboard-inventory/${width}-inventory-editor.png`});
    await editor.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.reload();
    await expect(inventory.locator('.inventory-item')).toHaveCount(12);
    await page.getByRole('navigation').getByRole('link',{name:'Dashboard',exact:true}).click();
    await banner.getByRole('link').click();
    await expect(page).toHaveURL(/\/scan$/);
    await expect(page.getByRole('button',{name:'Open Camera',exact:true})).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('broken image backs off across views without hiding food, and legacy links still open inventory', async ({page}) => {
  await mockKitchen(page);
  let attempts=0;
  await page.route('**/foods/red-bell-pepper.webp',route=>{attempts++; return route.fulfill({status:503,body:'Temporarily unavailable'});});
  await page.goto('/#inventory');
  await expect(page).toHaveURL(/\/inventory$/);
  const inventory=page.getByRole('region',{name:'My inventory',exact:true});
  await expect(inventory.getByRole('img',{name:'No reference photo for Red Bell Pepper'})).toBeVisible();
  await expect(inventory.getByRole('button',{name:'Edit Red Bell Pepper'})).toBeVisible();
  await inventory.getByRole('button',{name:'Switch to table view'}).click();
  await expect(inventory.getByRole('img',{name:'No reference photo for Red Bell Pepper'})).toBeVisible();
  await inventory.getByRole('button',{name:'Switch to cards view'}).click();
  await inventory.getByLabel('Search food').fill('Red Bell');
  await expect(inventory.locator('.inventory-item')).toHaveCount(1);
  expect(attempts).toBe(1);
});
