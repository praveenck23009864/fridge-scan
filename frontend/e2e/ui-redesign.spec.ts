import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
for (const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]] as const) {
 test(`responsive dashboard ${name}`,async({page})=>{
  await page.setViewportSize({width,height});
  await page.route('**/api/**',async route=>{
   const pathname=new URL(route.request().url()).pathname;
   if(pathname==='/api/health') return route.fulfill({json:{mock_vision:true}});
   if(pathname==='/api/scans/analyze') return route.fulfill({json:{is_mock:true,model_used:'ui-fixture',items:[{name:'Tomatoes',stock_status:'low'},{name:'Spinach',stock_status:'available'},{name:'Milk',stock_status:'unknown'}]}});
   return route.fulfill({json:[]});
  });
  await page.goto('/');
  await expect(page).toHaveTitle('Fridgely | Your Smart Fridge Companion');
  await expect(page.getByRole('link',{name:'Fridgely',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Your fridge, made smarter.'})).toBeVisible();
  expect((await page.request.get('/favicon.svg')).ok()).toBeTruthy();
  await page.screenshot({path:`../test-results/ui-redesign/${name}-dashboard.png`});
  await page.getByRole('navigation').getByRole('link',{name:'Scan Fridge'}).click();
  const bytes=Array.from(readFileSync('public/sample-photos/fridge-1.jpg'));
  const transfer=await page.evaluateHandle(data=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(data)],'fridge.jpg',{type:'image/jpeg'}));return dt;},bytes);
  await page.locator('.upload-zone').dispatchEvent('drop',{dataTransfer:transfer});
  await expect(page.getByText('Photos selected: 1/3')).toBeVisible();
  await page.getByRole('checkbox',{name:/I consent/}).check();
  await page.getByRole('button',{name:/Analyze with development/}).click();
  await page.getByLabel('Food name 1',{exact:true}).fill('Cherry tomatoes');
  await page.getByRole('navigation').getByRole('link',{name:'Recipes',exact:true}).click();
  await expect(page).toHaveURL(/#recipes$/);
  await page.getByRole('navigation').getByRole('link',{name:'Shopping Lists'}).click();
  await expect(page).toHaveURL(/#shopping$/);
  await page.getByRole('navigation').getByRole('link',{name:'Scan Fridge'}).click();
  await expect(page.getByLabel('Food name 1',{exact:true})).toHaveValue('Cherry tomatoes');
  await page.locator('.scan-review').scrollIntoViewIfNeeded();
  await page.screenshot({path:`../test-results/ui-redesign/${name}-review.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.screenshot({path:`../test-results/ui-redesign/${name}-full.png`,fullPage:true});
 });
}
