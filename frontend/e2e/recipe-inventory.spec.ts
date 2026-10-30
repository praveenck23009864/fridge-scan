import {test,expect} from '@playwright/test';
test('inventory recipes add missing ingredients without duplicates',async({page,request})=>{
 const base='http://127.0.0.1:8031';
 const scan=(await (await request.post(base+'/api/scans',{data:{}})).json()).id;
 await request.put(`${base}/api/scans/${scan}/review`,{data:{items:[{name:'Tomato',confirmed:true,stock_status:'available'}]}});
 const list=(await (await request.post(base+'/api/shopping-lists',{data:{name:'Recipe missing extras'}})).json()).id;
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/recipes/generate') {
   expect(route.request().postDataJSON()).toMatchObject({cuisine:'american',mode:'almost'});
   return route.fulfill({json:{model_used:'mock',is_mock:true,recipes:[{name:'American tomato salad',cuisine:'american',ingredient_match:50,servings:2,cooking_time_minutes:10,difficulty:'easy',available_ingredients:[{name:'Tomato',quantity:'2'}],missing_ingredients:[{name:'Salt',quantity:'pinch'}],instructions:['Slice and season.']}]}});
  }
  url.host='127.0.0.1:8031';
  return route.fulfill({response:await page.request.fetch(url.toString(),{method:route.request().method(),data:route.request().postData() ? JSON.parse(route.request().postData()!) : undefined})});
 });
 await page.goto('/recipes');
 await page.getByLabel('Cuisine',{exact:true}).selectOption('American (USA)');
 await page.getByLabel('Recommendation mode').selectOption('almost');
 await page.getByRole('button',{name:'Refresh Suggestions'}).click();
 await expect(page.getByText('American tomato salad')).toBeVisible();
 await expect(page.getByText(/Required extras needed/)).toBeVisible();
 await page.getByRole('button',{name:'Add missing ingredients',exact:true}).click();
 for(let attempt=0;attempt<2;attempt++) {
  await page.getByRole('checkbox',{name:/Salt/}).check();
  await page.getByLabel('Target shopping list').selectOption(String(list));
  await page.getByRole('button',{name:'Add selected ingredients'}).click();
  await expect(page.getByText('Ingredients saved to your shopping list. Existing items were skipped.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Add selected ingredients'})).toBeDisabled();
 }
 const saved=await (await request.get(`${base}/api/shopping-lists/${list}`)).json();
 expect(saved.items.filter((item:{name:string})=>item.name==='Salt')).toHaveLength(1);
});
