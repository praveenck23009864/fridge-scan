import {test,expect} from '@playwright/test';
for(const width of [375,768,1024,1440])test(`inventory photos and inline editing at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({json:path==='/api/scans'?[{id:1,status:'reviewed',is_mock:false,model_used:null}]:path==='/api/scans/1/items'?[{id:1,scan_id:1,name:'Milk',category:'Dairy',confirmed:true,stock_status:'low'}]:path==='/api/health'?{mock_vision:true}:path==='/api/fridge-suggestions'?{scan_id:1,items:[],is_mock:false}:[]})});
 await page.addInitScript(()=>localStorage.setItem('fridgely-theme','Terracotta & Sage'));
 await page.goto('/inventory');const inventory=page.getByRole('region',{name:'My inventory'});
 await expect(inventory.getByAltText('Reference photograph of Milk (not your fridge)')).toBeVisible();
 await expect(inventory.getByAltText('Reference photograph of Milk (not your fridge)')).toHaveJSProperty('naturalWidth',426);
 await expect(page.getByRole('combobox',{name:'Theme',exact:true})).toHaveCount(0);
  const contrast=await inventory.getByLabel('Search food').evaluate(input=>{
   const style=getComputedStyle(input);
   const luminance=(color:string)=>{const rgb=color.match(/[\d.]+/g)!.slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
   const a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await inventory.scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:`../test-results/inline-ui/${width}-light.png`});
 await inventory.getByRole('button',{name:'Switch to table view'}).click();
 await expect(inventory.getByRole('table')).toBeVisible();
 await expect(inventory.getByAltText('Reference photograph of Milk (not your fridge)')).toBeVisible();
 await inventory.getByRole('button',{name:'Edit Milk'}).click();
 await expect(inventory.getByLabel('Ingredient name',{exact:true})).toHaveValue('Milk');
 const editor=inventory.getByRole('form',{name:'Edit ingredient'});
 expect(await editor.evaluate(form=>form.closest('tr')?.previousElementSibling?.textContent?.includes('Milk'))).toBeTruthy();
 await editor.scrollIntoViewIfNeeded();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:`../test-results/inline-ui/${width}-table-editor.png`});
 await editor.getByLabel('Ingredient name').fill('Bananas');
 await editor.getByLabel('Ingredient name').press('Escape');
 await expect(editor).toHaveCount(0);
 await inventory.getByRole('button',{name:'Switch to cards view'}).click();
 await inventory.getByRole('button',{name:'Edit Milk'}).click();
 await expect(inventory.locator('.inventory-item').filter({has:page.getByRole('heading',{name:'Milk',exact:true})}).getByRole('form',{name:'Edit ingredient'})).toBeVisible();
 await inventory.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(editor).toHaveCount(0);
 if(width>=768){
   await page.getByRole('button',{name:'Collapse sidebar'}).click();
   await page.getByRole('navigation').getByRole('link',{name:'My Inventory',exact:true}).click();
   await expect(page.getByRole('navigation').getByRole('link',{name:'My Inventory',exact:true})).toHaveAttribute('aria-current','page');
   await page.getByRole('button',{name:'Expand sidebar'}).click();
 }

});

