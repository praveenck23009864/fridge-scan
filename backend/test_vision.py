import asyncio, base64, io, json
from pathlib import Path
import httpx, pytest
from fastapi.testclient import TestClient
from groq import AsyncGroq
from PIL import Image, ImageFilter
import main
import vision_service as v
SAMPLE=Path(__file__).resolve().parent.parent/'frontend/public/sample-photos/fridge-1.jpg'
GOOD={'items':[{'name':'Milk','stock_status':'low','low_stock_evidence':'visible nearly empty bottle'},{'name':'Eggs','stock_status':'available'}]}
@pytest.fixture(autouse=True)
def config(monkeypatch):
    for k,x in {'MOCK_VISION':'false','GROQ_API_KEY':'secret-test-key','GROQ_MODEL':'qwen/qwen3.8-27b','VISION_TOTAL_TIMEOUT_SECONDS':'5','VISION_MODEL_TIMEOUT_SECONDS':'1'}.items(): monkeypatch.setenv(k,x)
def router(monkeypatch,replies):
    calls=[]
    async def handler(request):
        p=json.loads(request.content); calls.append(p); r=replies[min(len(calls)-1,len(replies)-1)]
        if isinstance(r,int): return httpx.Response(r,json={'error':{'code':r,'message':'private upstream'}})
        if isinstance(r,float): await asyncio.sleep(r)
        return httpx.Response(200,json={'id':'test','object':'chat.completion','created':0,'model':p['model'],'choices':[{'index':0,'finish_reason':'stop','message':{'role':'assistant','content':r if isinstance(r,str) else json.dumps(r)}}]})
    monkeypatch.setattr(v,'AsyncGroq',lambda **kw:AsyncGroq(**kw,http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler))))
    return calls
def recognize(): return asyncio.run(v.recognize_images([SAMPLE.read_bytes()]))
def post(files=None,data=None):
    with TestClient(main.app) as c: return c.post('/api/scans/analyze',data={'consent':'true'} if data is None else data,files=[('photos',('a.jpg',SAMPLE.read_bytes(),'image/jpeg'))] if files is None else files)
def test_success(monkeypatch):
    calls=router(monkeypatch,[GOOD]); result=recognize()
    assert result['model_used']=='qwen/qwen3.8-27b'
    assert result['items'][0]=={'name':'Milk','stock_status':'low'}
    url=calls[0]['messages'][0]['content'][1]['image_url']['url']
    assert base64.b64decode(url.split(',')[1]).startswith(b'\xff\xd8')
    assert 'models' not in calls[0]
    assert result['is_mock'] is False
    assert calls[0]['response_format']=={'type':'json_object'}
@pytest.mark.parametrize('reply,status', [(404,502),(429,429),(500,502),(503,503),('invalid json',502),({'items':[{'name':'Milk','stock_status':'bad'}]},502)])
def test_single_model_failure_no_fallback(monkeypatch,reply,status):
    calls=router(monkeypatch,[reply,GOOD])
    with pytest.raises(v.VisionError) as e: recognize()
    assert e.value.status_code==status and len(calls)==1
    assert calls[0]['model']=='qwen/qwen3.8-27b'

@pytest.mark.parametrize('status',[401,402])
def test_terminal(monkeypatch,status):
    calls=router(monkeypatch,[status,GOOD])
    with pytest.raises(v.VisionError) as e: recognize()
    assert e.value.status_code==status and len(calls)==1

def test_missing_key(monkeypatch):
    monkeypatch.delenv('GROQ_API_KEY')
    with pytest.raises(v.VisionError) as e: recognize()
    assert e.value.status_code==503

def test_no_food(monkeypatch):
    calls=router(monkeypatch,[{'items':[]}])
    assert post().status_code==422 and len(calls)==1

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
    router(monkeypatch,[GOOD])
    with caplog.at_level('INFO',logger='vision_service'): recognize()
    records=[json.loads(r.message) for r in caplog.records if r.name=='vision_service']
    assert records[0]['http_status']==200 and records[-1]['category']=='success'
    assert all(s not in caplog.text for s in ['secret-test-key','base64','private upstream'])

@pytest.mark.parametrize('value', ['nan','inf','0','-1','121','bad'])
def test_invalid_timeout(monkeypatch,value):
    monkeypatch.setenv('VISION_TOTAL_TIMEOUT_SECONDS',value)
    with pytest.raises(v.VisionError) as e: recognize()
    assert e.value.status_code==503

@pytest.mark.parametrize('count',[0,4])
def test_service_photo_count(count):
    with pytest.raises(v.VisionError) as e:
        asyncio.run(v.recognize_images([SAMPLE.read_bytes()]*count))
    assert e.value.category=='photo_count'

def test_resolution_and_resize():
    with Image.open(SAMPLE) as image:
        small=io.BytesIO(); image.resize((100,100)).save(small,format='PNG')
        with pytest.raises(v.VisionError) as e: v.prepare_image(small.getvalue())
        assert e.value.category=='resolution'
        large=io.BytesIO(); image.resize((2000,1800)).save(large,format='JPEG')
        encoded=v.prepare_image(large.getvalue()).split(',')[1]
        with Image.open(io.BytesIO(base64.b64decode(encoded))) as resized:
            assert max(resized.size)<=1280

@pytest.mark.parametrize('payload',[None,[],{'items':[None]},{'items':[{'name':'','stock_status':'available'}]}])
def test_invalid_structure(payload):
    with pytest.raises(v.VisionError) as e: v.parse_items(json.dumps(payload))
    assert e.value.status_code==502
