import {test,expect} from '@playwright/test';
declare global { interface Window { auditStreams: MediaStream[]; auditRevoked: string[]; } }
test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']},permissions:['camera']});
test.beforeEach(async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({json:route.request().url().endsWith('/health')?{mock_vision:false}:[]}));
 await page.addInitScript(()=>{
  window.auditStreams=[];window.auditRevoked=[];
  const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async options=>{const stream=await get(options);window.auditStreams.push(stream);return stream;};
  const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=url=>{window.auditRevoked.push(url);revoke(url);};
 });
 await page.goto('/scan');
});
test('synthetic video preview capture retake delete and stream shutdown',async({page})=>{
 // A deterministic browser MediaStream avoids this Chromium build's fake device
 // disappearing after stop(). The capture/preview/canvas/blob pipeline stays real.
 await page.evaluate(()=>{
  navigator.mediaDevices.getUserMedia=async()=>{
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
   const ctx=canvas.getContext('2d')!;ctx.fillStyle='#80a060';ctx.fillRect(0,0,640,480);ctx.fillStyle='#fff';ctx.fillRect(100,100,200,200);
   const stream=canvas.captureStream(10);window.auditStreams.push(stream);return stream;
  };
 });
 const open=page.getByRole('button',{name:'Open Camera',exact:true});
 for(let index=1;index<=3;index++){
  await open.click();await expect(page.getByLabel('Live camera preview')).toBeVisible();
  await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.videoWidth)).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Capture Photo',exact:true}).click();
  await expect(page.getByText(`Photos selected: ${index}/3`)).toBeVisible();
 }
 await expect(open).toBeDisabled();
 const old=await page.getByAltText('Fridge photo 1').getAttribute('src');
 await page.getByRole('button',{name:'Retake',exact:true}).first().click();
 await page.getByRole('button',{name:'Capture Photo',exact:true}).click();
 await expect(page.getByAltText('Fridge photo 1')).not.toHaveAttribute('src',old!);
 await expect(page.getByText('Photos selected: 3/3')).toBeVisible();
 expect(await page.evaluate(()=>window.auditStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
 expect(await page.evaluate(url=>window.auditRevoked.includes(url!),old)).toBe(true);
 await page.locator('.photo-card').first().getByRole('button',{name:'Delete',exact:true}).click();
 await expect(page.getByText('Photos selected: 2/3')).toBeVisible();
 await page.getByRole('button',{name:'Delete all photos'}).click();await expect(page.locator('.photo-card')).toHaveCount(0);
 await open.click();await page.getByRole('button',{name:'Cancel Camera'}).click();
 expect(await page.evaluate(()=>window.auditStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
 await expect(open).toBeEnabled();
});
for(const [error,message] of [['NotAllowedError','Camera permission denied'],['NotFoundError','No camera found']]){
 test(`camera error ${error} and sample fallback`,async({page})=>{
  await page.evaluate(name=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Unavailable',name);};},error);
  await page.getByRole('button',{name:'Open Camera',exact:true}).click();await expect(page.getByRole('alert')).toContainText(message);
  await page.getByRole('button',{name:'No camera? Use Sample Photos'}).click();await expect(page.locator('.photo-card')).toHaveCount(3);
 });
}
test('failed sample fetch revokes partially created previews',async({page})=>{
 await page.route('**/sample-photos/fridge-2.jpg',route=>route.fulfill({status:404,body:''}));
 await page.getByRole('button',{name:'No camera? Use Sample Photos'}).click();
 await expect(page.getByRole('alert')).toContainText('Sample photos are missing');
 expect(await page.evaluate(()=>window.auditRevoked.length)).toBe(1);await expect(page.locator('.photo-card')).toHaveCount(0);
});
test('connectivity and empty-image errors recover; low stock is highlighted',async({page})=>{
 await page.getByRole('button',{name:'No camera? Use Sample Photos'}).click();await page.getByRole('checkbox',{name:/I consent/}).check();
 await page.route('**/api/scans/analyze',route=>route.abort('connectionrefused'),{times:1});
 const analyze=page.getByRole('button',{name:'Analyze with AI',exact:true});await analyze.click();
 await expect(page.getByRole('alert')).toContainText('Cannot reach the backend');await expect(analyze).toBeEnabled();
 await page.route('**/api/scans/analyze',route=>route.fulfill({status:422,json:{detail:'No food items detected. Try another photo.'}}),{times:1});await analyze.click();
 await expect(page.getByRole('alert')).toContainText('No food items detected');await expect(page.locator('.review-row')).toHaveCount(0);
 await page.route('**/api/scans/analyze',route=>route.fulfill({json:{model_used:'test',is_mock:false,items:[{name:'Milk',stock_status:'low'},{name:'Eggs',stock_status:'available'}]}}));await analyze.click();
 const low=page.locator('.review-row[data-stock="low"]');await expect(low.getByText('Low stock',{exact:true})).toBeVisible();
 expect(await low.evaluate(e=>getComputedStyle(e).borderLeftColor)).not.toBe(await page.locator('.review-row[data-stock="available"]').evaluate(e=>getComputedStyle(e).borderLeftColor));
 await page.locator('.scan-review').screenshot({path:'../test-results/assignment-audit/low-stock.png'});
});

test('Chromium fake camera opens and captures one real video frame',async({page})=>{
 await page.getByRole('button',{name:'Open Camera',exact:true}).click();
 await expect(page.getByLabel('Live camera preview')).toBeVisible();
 await page.getByRole('button',{name:'Capture Photo',exact:true}).click();
 await expect(page.getByText('Photos selected: 1/3')).toBeVisible();
 await expect(page.getByAltText('Fridge photo 1')).toBeVisible();
 expect(await page.evaluate(()=>window.auditStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
});

test('leaving the scan page stops the camera and preserves selected photos',async({page})=>{
 await page.getByRole('button',{name:'No camera? Use Sample Photos'}).click();
 await page.locator('.photo-card').first().getByRole('button',{name:'Delete',exact:true}).click();
 await page.getByRole('button',{name:'Open Camera',exact:true}).click();
 await expect(page.getByLabel('Live camera preview')).toBeVisible();
 await page.getByRole('navigation').getByRole('link',{name:'Dashboard',exact:true}).click();
 expect(await page.evaluate(()=>window.auditStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
 await page.getByRole('navigation').getByRole('link',{name:'Scan Fridge',exact:true}).click();
 await expect(page.getByText('Photos selected: 2/3')).toBeVisible();
 await expect(page.getByRole('button',{name:'Open Camera',exact:true})).toBeEnabled();
});
