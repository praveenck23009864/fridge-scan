import {readFileSync} from 'node:fs';
import {test,expect,type Page} from '@playwright/test';
const go = async (page: Page, name: string) => page.getByRole('navigation').getByRole('link', {name, exact:true}).click();

test('complete workflow and recipe state',async({page},info)=>{
 const errors:string[]=[]; const requests:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.url().includes('/api/')) requests.push(`${r.status()} ${r.url()}`)});
 page.on('dialog',d=>d.accept());
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()); url.host='127.0.0.1:8031';
  const response=await page.request.fetch(url.toString(),{method:route.request().method(),...(url.pathname==='/api/scans/analyze' ? {multipart:{consent:'true',photos:{name:'fridge-1.jpg',mimeType:'image/jpeg',buffer:readFileSync('public/sample-photos/fridge-1.jpg')}}} : {data:route.request().postData() ? JSON.parse(route.request().postData()!) : undefined})}); await route.fulfill({response});
 });
 try {
 expect((await page.request.get('http://127.0.0.1:8031/api/health')).ok()).toBeTruthy();
 await page.goto('/scan');
 const analyze=page.getByRole('button',{name:/Analyze with/});
 await expect(analyze).toBeDisabled();
 await page.getByLabel('Upload Photos').setInputFiles(['public/sample-photos/fridge-1.jpg','public/sample-photos/fridge-2.jpg','public/sample-photos/fridge-3.jpg']);
 const consent=page.getByRole('checkbox',{name:/I consent/});
 await consent.check(); await expect(analyze).toBeEnabled(); await consent.uncheck(); await expect(analyze).toBeDisabled(); await consent.check();
 await analyze.click(); await expect(page.locator('.review-source')).toContainText('New review'); await expect(page.getByLabel('Food name 1',{exact:true})).toBeVisible();
 await page.getByLabel('Food name 1',{exact:true}).fill('Milk');
 await page.getByRole('combobox',{name:/^Stock status 1/}).selectOption('low');
 
 
 await page.getByLabel('Missing food name',{exact:true}).fill('Rice'); await page.getByRole('button',{name:'Add missing item',exact:true}).click(); await page.getByRole('button',{name:'Delete item 6',exact:true}).click();
 await page.getByRole('button',{name:'Save Confirmed Items',exact:true}).click();
 await go(page, 'Recipes');
 const generate=page.getByRole('button',{name:'Refresh Suggestions',exact:true});
 await expect(generate).toBeEnabled(); await go(page, 'Recipes');
 await generate.click(); await expect(page.locator('.recipe-card').first()).toBeVisible();
 await go(page, 'Scan Fridge');
 await page.getByLabel('Missing food name',{exact:true}).fill('Rice');
 await page.getByLabel('Missing food name',{exact:true}).fill('');
 await go(page, 'Recipes');
 await expect(generate).toBeEnabled();
 await go(page, 'Scan Fridge');
 await page.getByRole('button',{name:/Create Shopping List from/}).click();
 await go(page, 'Shopping Lists');
 await expect(page.locator('.list-card').first()).toBeVisible();
 const listTitle=await page.locator('.list-card').first().locator('h3').innerText();
 const list=page.locator('.list-card').filter({has:page.getByRole('heading',{name:listTitle,exact:true})});
 await list.getByPlaceholder('Add an item').fill('Bread'); await list.getByRole('button',{name:'Add Item',exact:true}).click();
 const row=list.locator('.shopping-item').filter({hasText:'Bread'}); await row.getByRole('checkbox').click(); await expect(row.getByRole('checkbox')).toBeChecked(); await row.getByRole('button',{name:'Remove'}).click(); await expect(row).toHaveCount(0);
 await list.getByRole('button',{name:'Delete List'}).click();
 await go(page, 'Recipes');
 await generate.click(); await expect(page.locator('.recipe-card').first()).toBeVisible();
 await go(page, 'Scan Fridge');
 await analyze.click();
 await expect(page.locator('.review-source')).toContainText('New review');
 await go(page, 'Recipes');
 await expect(generate).toBeEnabled();
 await go(page, 'Scan Fridge');
 await page.locator('.scan-history summary').click(); await page.getByRole('button',{name:/Scan #.*reviewed/}).first().click();
 await expect(page.getByLabel('Food name 1',{exact:true})).toHaveValue('Milk');
 await go(page, 'Recipes');
 await expect(generate).toBeEnabled();
 await go(page, 'Scan Fridge');
 await expect(page.getByLabel('Food name 1',{exact:true})).toHaveValue('Milk');
 await go(page, 'Shopping Lists');
 await page.getByPlaceholder('Example: Weekly Groceries').fill('Browser test list'); await page.getByRole('button',{name:'Create List',exact:true}).click();
 const manual=page.locator('.list-card').filter({hasText:'Browser test list'}); await expect(manual).toBeVisible(); await manual.getByRole('button',{name:'Delete List'}).click(); await expect(manual).toHaveCount(0);
 await go(page, 'Scan Fridge');
 await page.getByRole('button',{name:'Delete item 2',exact:true}).click(); await page.getByRole('button',{name:'Save Confirmed Items',exact:true}).click(); await go(page, 'Recipes'); await expect(generate).toBeEnabled();
 expect(errors).toEqual([]); await page.screenshot({path:'../test-results/screenshots/success.png',fullPage:true});
 } finally {
 await info.attach('requests-and-errors',{body:JSON.stringify({requests,errors}),contentType:'application/json'});
 await info.attach('button-state',{body:JSON.stringify(await page.locator('button').evaluateAll(buttons=>buttons.map(b=>({text:b.textContent,disabled:b.disabled,selector:b.className,blocked:(()=>{const r=b.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!hit&&!b.contains(hit)})()})))),contentType:'application/json'});
 }
});

test('analysis and recipe errors recover',async({page})=>{
 page.on('dialog',d=>d.accept());
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url());url.host='127.0.0.1:8031';await route.fulfill({response:await page.request.fetch(url.toString(),{method:route.request().method(),...(url.pathname==='/api/scans/analyze' ? {multipart:{consent:'true',photos:{name:'fridge-1.jpg',mimeType:'image/jpeg',buffer:readFileSync('public/sample-photos/fridge-1.jpg')}}} : {data:route.request().postData() ? JSON.parse(route.request().postData()!) : undefined})})});});
 expect((await page.request.get('http://127.0.0.1:8031/api/health')).ok()).toBeTruthy();
 await page.goto('/scan');
 await page.getByLabel('Upload Photos').setInputFiles('public/sample-photos/fridge-1.jpg');
 await page.getByRole('checkbox',{name:/I consent/}).check();
 await page.route('**/api/scans/analyze',route=>route.fulfill({status:429,json:{detail:'Test rate limit'}}),{times:1});
 await page.getByRole('button',{name:/Analyze with/}).click();
 await expect(page.getByText('Test rate limit')).toBeVisible();
 await page.getByRole('button',{name:/Analyze with/}).click();
 await expect(page.locator('.review-source')).toContainText('New review');
 
 
 await page.getByRole('button',{name:'Save Confirmed Items',exact:true}).click();
 await go(page, 'Recipes');
 await page.route('**/api/recipes/generate',route=>route.fulfill({status:503,json:{detail:'Test provider unavailable'}}),{times:1});
 await page.getByRole('button',{name:'Refresh Suggestions',exact:true}).click();
 await expect(page.getByText('Test provider unavailable')).toBeVisible();
 await page.getByRole('button',{name:'Refresh Suggestions',exact:true}).click();
 await expect(page.locator('.recipe-card').first()).toBeVisible();
});
