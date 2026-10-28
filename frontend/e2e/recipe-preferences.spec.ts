import {test,expect} from '@playwright/test';
for (const width of [1440,390]) {
 test(`recipe preferences at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  const payloads:Record<string,unknown>[]=[];
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/health')return route.fulfill({json:{mock_vision:true}});
   if(path==='/api/scans')return route.fulfill({json:[{id:88,status:'reviewed',is_mock:false,model_used:'test'}]});
   if(path==='/api/scans/88/items')return route.fulfill({json:[{id:1,name:'Tomato',confirmed:true,stock_status:'available'}]});
   if(path==='/api/recipes/generate'){
    payloads.push(route.request().postDataJSON());
    if(payloads.length===1)return route.fulfill({status:503,json:{detail:'Try again shortly'}});
    return route.fulfill({json:{model_used:'test',is_mock:false,recipes:[{name:'Mild tomato curry',servings:3,cooking_time_minutes:15,difficulty:'easy',available_ingredients:[{name:'Tomato',quantity:'3'}],missing_ingredients:[],instructions:['Cook tomatoes with mild seasoning.']}]}});
   }
   return route.fulfill({json:[]});
  });
  await page.goto('/');await page.getByRole('navigation').getByRole('link',{name:'Recipes',exact:true}).click();
  await page.getByRole('group',{name:'Dietary preference'}).getByText('Vegan',{exact:true}).click();
  await page.getByRole('group',{name:'Cuisine',exact:true}).getByText('South Indian',{exact:true}).click();
  await page.getByRole('group',{name:'Spice level'}).getByText('Mild',{exact:true}).click();
  await page.getByLabel('Servings',{exact:true}).fill('3');await page.getByLabel('Maximum cooking time',{exact:true}).selectOption('15');
  await page.getByPlaceholder('e.g. peanuts, shellfish, mushrooms').fill('peanuts');
  expect(payloads).toHaveLength(0);
  await page.getByRole('button',{name:'Generate Recipes'}).click();await expect(page.getByRole('alert')).toContainText('Try again shortly');
  expect(payloads[0]).toEqual({scan_id:88,servings:3,dietary_preferences:'Vegan',cuisine:'South Indian',spice_level:'Mild',excluded_ingredients:'peanuts',max_time:15});
  await page.getByRole('button',{name:'Generate Recipes'}).click();await expect(page.getByText('Mild tomato curry')).toBeVisible();
  await expect(page.getByRole('radio',{name:'Vegan',exact:true})).toBeChecked();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.locator('.recipe-preferences').screenshot({style:".sidebar, .skip-link { visibility: hidden !important; }",path:`../test-results/recipe-preferences-${width}.png`});
 });
}

