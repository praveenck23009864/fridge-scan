import {test, expect} from '@playwright/test';

test('saved fridge suggestions bulk add to an existing list and survive reload', async ({page, request}) => {
  const base = 'http://127.0.0.1:8001/api';
  const scan = await (await request.post(`${base}/scans`, {data:{}})).json();
  const review = await request.put(`${base}/scans/${scan.id}/review`, {data:{items:[
    {name:'Whole Milk',stock_status:'low',confirmed:true},
    {name:'Tomatoes',stock_status:'low',confirmed:true},
    {name:'Eggs',stock_status:'low',confirmed:true},
    {name:'Rice',stock_status:'available',confirmed:true},
  ]}});
  expect(review.ok()).toBeTruthy();
  const name = `Suggestion test ${Date.now()}`;
  const list = await (await request.post(`${base}/shopping-lists`,{data:{name}})).json();
  await request.post(`${base}/shopping-lists/${list.id}/items`,{data:{name:'whole   MILK'}});
  await page.route('**/api/**',async route => {
    const url = new URL(route.request().url()); url.host = '127.0.0.1:8001';
    await route.fulfill({response:await request.fetch(url.toString(),{
      method:route.request().method(),
      data:route.request().postData() ? JSON.parse(route.request().postData()!) : undefined,
    })});
  });
  await page.goto('/');
  const card = page.locator('.list-card').filter({has:page.getByRole('heading',{name,exact:true})});
  const suggestions = card.getByRole('region',{name:`Fridge suggestions for ${name}`});
  await expect(suggestions.getByRole('checkbox',{name:/Whole Milk/})).toBeDisabled();
  await expect(suggestions.getByRole('checkbox',{name:/Rice/})).toHaveCount(0);
  await expect(card.locator('.shopping-item')).toHaveCount(1);
  await suggestions.getByRole('checkbox',{name:/Tomatoes/}).check();
  await suggestions.getByRole('checkbox',{name:/Eggs/}).check();
  // A failed request preserves selection and allows a deliberate retry.
  await page.route(`**/shopping-lists/${list.id}/fridge-suggestions`,route=>route.fulfill({status:503,json:{detail:'Please retry adding suggestions'}}),{times:1});
  await suggestions.getByRole('button',{name:'Add selected suggestions (2)'}).click();
  await expect(suggestions.getByRole('alert')).toContainText('Please retry');
  await expect(card.locator('.shopping-item')).toHaveCount(1);
  await suggestions.getByRole('button',{name:'Add selected suggestions (2)'}).click();
  await expect(card.locator('.shopping-item')).toHaveCount(3);
  await page.reload();
  await expect(card.locator('.shopping-item')).toHaveCount(3);
  await expect(suggestions.getByRole('checkbox',{name:/Tomatoes/})).toBeDisabled();
  const persisted = await (await request.get(`${base}/shopping-lists/${list.id}`)).json();
  expect(persisted.items.map((item:{name:string})=>item.name).sort()).toEqual(['Eggs','Tomatoes','whole   MILK'].sort());
  // Unsaved edits never affect suggestions; saving refreshes every list.
  await page.getByRole('combobox',{name:/^Stock status 4/}).selectOption('low');
  await expect(suggestions.getByRole('checkbox',{name:/Rice/})).toHaveCount(0);
  await page.getByLabel('Confirm item 4',{exact:true}).check();
  await page.getByRole('button',{name:'Save confirmed items',exact:true}).click();
  await expect(suggestions.getByRole('checkbox',{name:/Rice/})).toBeEnabled();
  await page.screenshot({path:'../test-results/fridge-suggestions.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await suggestions.scrollIntoViewIfNeeded();
  await page.screenshot({path:'../test-results/fridge-suggestions-mobile.png'});
});
