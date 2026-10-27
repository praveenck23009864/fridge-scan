import asyncio, base64, io, json
from pathlib import Path
import httpx, pytest
from fastapi.testclient import TestClient
from openai import AsyncOpenAI
from PIL import Image, ImageFilter
import main
import vision_service as v
SAMPLE=Path(__file__).resolve().parent.parent/'frontend/public/sample-photos/fridge-1.jpg'
GOOD={'items':[{'name':'Milk','stock_status':'low','low_stock_evidence':'visible nearly empty bottle'},{'name':'Eggs','stock_status':'available'}]}
@pytest.fixture(autouse=True)
def config(monkeypatch):
    for k,x in {'MOCK_VISION':'false','OPENROUTER_API_KEY':'secret-test-key','VISION_MODELS':','.join(v.DEFAULT_MODELS),'ALLOW_PAID_VISION_FALLBACK':'true','VISION_TOTAL_TIMEOUT_SECONDS':'5','VISION_MODEL_TIMEOUT_SECONDS':'1'}.items(): monkeypatch.setenv(k,x)
def router(monkeypatch,replies):
    calls=[]
    async def handler(request):
        p=json.loads(request.content); calls.append(p); r=replies[min(len(calls)-1,len(replies)-1)]
        if isinstance(r,int): return httpx.Response(r,json={'error':{'code':r,'message':'private upstream'}})
        if isinstance(r,float): await asyncio.sleep(r)
        return httpx.Response(200,json={'id':'test','object':'chat.completion','created':0,'model':p['model'],'choices':[{'index':0,'finish_reason':'stop','message':{'role':'assistant','content':r if isinstance(r,str) else json.dumps(r)}}]})
    monkeypatch.setattr(v,'AsyncOpenAI',lambda **kw:AsyncOpenAI(**kw,http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler))))
    return calls
def recognize(): return asyncio.run(v.recognize_images([SAMPLE.read_bytes()]))
def post(files=None,data=None):
    with TestClient(main.app) as c: return c.post('/api/scans/analyze',data={'consent':'true'} if data is None else data,files=[('photos',('a.jpg',SAMPLE.read_bytes(),'image/jpeg'))] if files is None else files)
def test_success(monkeypatch):
    calls=router(monkeypatch,[GOOD]); result=recognize()
    assert result['model_used']==v.DEFAULT_MODELS[0]
    assert result['items'][0]=={'name':'Milk','stock_status':'low'}
    url=calls[0]['messages'][0]['content'][1]['image_url']['url']
    assert base64.b64decode(url.split(',')[1]).startswith(b'\xff\xd8')
    assert 'models' not in calls[0]
@pytest.mark.parametrize('first',[404,429,500,'invalid json',{'items':[]},{'items':[{'name':'Milk','stock_status':'bad'}]}])
def test_fallback(monkeypatch,first):
    calls=router(monkeypatch,[first,GOOD]); assert recognize()['model_used']==v.DEFAULT_MODELS[1]
    assert [c['model'] for c in calls]==list(v.DEFAULT_MODELS[:2])
def test_all_five(monkeypatch):
    calls=router(monkeypatch,[503])
    with pytest.raises(v.VisionError) as e: recognize()
    assert e.value.status_code==503
    assert [c['model'] for c in calls]==list(v.DEFAULT_MODELS)
@pytest.mark.parametrize('status',[401,402])
def test_terminal(monkeypatch,status):
    calls=router(monkeypatch,[status,GOOD])
    with pytest.raises(v.VisionError) as e: recognize()
    assert e.value.status_code==status and len(calls)==1
def test_missing_key(monkeypatch):
    monkeypatch.delenv('OPENROUTER_API_KEY')
    with pytest.raises(v.VisionError) as e: recognize()
    assert e.value.status_code==401
def test_paid_disabled(monkeypatch):
    monkeypatch.setenv('ALLOW_PAID_VISION_FALLBACK','false'); calls=router(monkeypatch,[429,GOOD])
    with pytest.raises(v.VisionError) as e: recognize()
    assert e.value.status_code==429 and len(calls)==1
def test_duplicate_and_evidence():
    assert v.parse_items(json.dumps({'items':[{'name':' Milk ','stock_status':'low'},{'name':'milk','stock_status':'available'},{'name':'Eggs','stock_status':'low'}]}))==[{'name':'milk','stock_status':'available'},{'name':'Eggs','stock_status':'unknown'}]
def photo(color='black',blur=False,fmt='PNG'):
    im=Image.new('RGB',(640,480),color)
    if blur: im=Image.linear_gradient('L').resize((640,480)).convert('RGB').filter(ImageFilter.GaussianBlur(20))
    b=io.BytesIO(); im.save(b,format=fmt); return b.getvalue()
@pytest.mark.parametrize('raw,category',[(photo(),'dark_photo'),(photo(blur=True),'blurry_photo'),(b'bad','invalid_photo'),(photo(fmt='GIF'),'image_format')])
def test_quality(raw,category):
    with pytest.raises(v.VisionError) as e: v.prepare_image(raw)
    assert e.value.category==category
@pytest.mark.parametrize('fmt',['JPEG','PNG','WEBP'])
def test_formats(fmt):
    im=Image.open(SAMPLE); b=io.BytesIO(); im.save(b,format=fmt)
    assert v.prepare_image(b.getvalue()).startswith('data:image/jpeg;base64,')
@pytest.mark.parametrize('data',[{}, {'consent':'false'}])
def test_consent(data): assert post(data=data).status_code==400
@pytest.mark.parametrize('count',[1,2,3])
def test_multiple(monkeypatch,count):
    calls=router(monkeypatch,[GOOD]); r=post(files=[('photos',('a.jpg',SAMPLE.read_bytes(),'image/jpeg'))]*count)
    assert r.status_code==200 and len(calls[0]['messages'][0]['content'])==count+1
@pytest.mark.parametrize('files,status',[([('photos',('a.txt',b'abc','text/plain'))],415),([('photos',('a.jpg',b'x'*(v.MAX_IMAGE_BYTES+1),'image/jpeg'))],413),([('photos',('a.jpg',b'broken','image/jpeg'))],422),([('photos',('a.jpg',SAMPLE.read_bytes(),'image/jpeg'))]*4,422),([],422)])
def test_upload_errors(files,status): assert post(files=files).status_code==status
@pytest.mark.parametrize('status',[401,402,429,502,503,504])
def test_http_errors(monkeypatch,status):
    router(monkeypatch,[status]); assert post().status_code==status
def test_timeout(monkeypatch):
    monkeypatch.setenv('VISION_TOTAL_TIMEOUT_SECONDS','0.05'); monkeypatch.setenv('VISION_MODEL_TIMEOUT_SECONDS','0.02'); router(monkeypatch,[1.0])
    with pytest.raises(v.VisionError) as e: recognize()
    assert e.value.status_code==504
def test_logging(monkeypatch,caplog):
    router(monkeypatch,[404,GOOD])
    with caplog.at_level('INFO',logger='vision_service'): recognize()
    records=[json.loads(r.message) for r in caplog.records if r.name=='vision_service']
    assert records[0]['http_status']==404 and records[-1]['category']=='success'
    assert all(s not in caplog.text for s in ['secret-test-key','base64','private upstream'])
