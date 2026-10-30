import {test,expect} from '@playwright/test';
test('save every review row, refresh inventory and preserve IDs on edits',async({page,request})=>{
 const base='http://127.0.0.1:8031';
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());url.host='127.0.0.1:8031';
  if(url.pathname==='/api/scans/analyze')return route.fulfill({json:{model_used:'mock',is_mock:true,items:Array.from({length:20},(_,i)=>({name:`Regression food ${i+1}`,stock_status:'available'}))}});
  await route.fulfill({response:await page.request.fetch(url.toString(),{method:route.request().method(),data:route.request().postData()?JSON.parse(route.request().postData()!):undefined})});
 });
 await page.goto('/inventory'); // Mount inventory before saving, to test invalidation.
 await page.getByRole('navigation').getByRole('link',{name:'Scan Fridge',exact:true}).click();
 await page.getByLabel('Upload Photos').setInputFiles('public/sample-photos/fridge-1.jpg');
 await page.getByRole('checkbox',{name:/I consent/}).check();
 await page.getByRole('button',{name:/Analyze with/}).click();
 await expect(page.locator('.review-row')).toHaveCount(20);
 await expect(page.locator('.scan-review input[type=checkbox]')).toHaveCount(0);
 const responsePromise=page.waitForResponse(r=>r.url().endsWith('/review')&&r.request().method()==='PUT');
 await page.getByRole('button',{name:'Save Confirmed Items',exact:true}).click();
 const response=await responsePromise;expect(response.status()).toBe(200);
 const saved=await response.json();expect(saved).toHaveLength(20);expect(saved.every((i:{confirmed:boolean})=>i.confirmed)).toBe(true);
 await page.getByRole('navigation').getByRole('link',{name:'My Inventory',exact:true}).click();
 await expect(page.locator('.inventory-item')).toHaveCount(20);
 await page.reload();await expect(page.locator('.inventory-item')).toHaveCount(20);
 await expect(page.getByRole('heading',{name:'Regression food 20',exact:true})).toBeVisible();
 await page.getByRole('navigation').getByRole('link',{name:'Scan Fridge',exact:true}).click();
 await expect(page.getByLabel('Food name 1',{exact:true})).toHaveValue('Regression food 1');
 await page.getByLabel('Food name 1',{exact:true}).fill('Edited regression food');
 await page.getByRole('button',{name:'Delete item 20',exact:true}).click();
 await page.getByRole('button',{name:'Save Confirmed Items',exact:true}).click();
 await expect(page.getByText('19 ingredient(s) saved successfully to My Inventory.')).toBeVisible();
 const persisted=await (await request.get(`${base}/api/scans/${saved[0].scan_id}/items`)).json();
 expect(persisted).toHaveLength(19);expect(persisted[0].id).toBe(saved[0].id);expect(persisted[0].name).toBe('Edited regression food');
 expect(new Set(persisted.map((i:{id:number})=>i.id)).size).toBe(19);
 await page.getByRole('navigation').getByRole('link',{name:'My Inventory',exact:true}).click();
 await expect(page.locator('.inventory-item')).toHaveCount(19);
 await page.reload();await expect(page.locator('.inventory-item')).toHaveCount(19);
 await expect(page.getByRole('heading',{name:'Edited regression food',exact:true})).toBeVisible();
});
