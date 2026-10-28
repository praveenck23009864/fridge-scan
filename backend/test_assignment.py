import asyncio
import os
from pathlib import Path
import subprocess
import sys

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers
from tempfile import SpooledTemporaryFile
from main import analyze_fridge

@pytest.mark.parametrize('consent',[False,True])
def test_uploads_closed_on_validation_failure(consent):
    uploads=[UploadFile(SpooledTemporaryFile(),filename='bad.txt',headers=Headers({'content-type':'text/plain'})) for _ in range(2)]
    with pytest.raises(HTTPException):
        asyncio.run(analyze_fridge(uploads,consent))
    assert all(upload.file.closed for upload in uploads)


def test_save_to_list_survives_application_process_restart(tmp_path):
    env={**os.environ,'DATABASE_URL':'sqlite:///'+(tmp_path/'restart.db').as_posix(),'MOCK_VISION':'true','MOCK_RECIPES':'true'}
    create='''
from fastapi.testclient import TestClient
from main import app
with TestClient(app) as c:
    scan=c.post('/api/scans',json={}).json()['id']
    assert c.put(f'/api/scans/{scan}/review',json={'items':[{'name':'Milk','stock_status':'low','confirmed':True}]}).status_code==200
    listing=c.post(f'/api/scans/{scan}/save-to-list').json()
    assert listing['items'][0]['name']=='Milk'
'''
    reopen='''
from fastapi.testclient import TestClient
from main import app
with TestClient(app) as c:
    scan=c.get('/api/scans').json()[0]['id']
    lists=c.get('/api/shopping-lists').json()
    assert len(lists)==1 and lists[0]['items'][0]['name']=='Milk'
    assert c.post(f'/api/scans/{scan}/save-to-list').json()['id']==lists[0]['id']
    assert len(c.get('/api/shopping-lists').json())==1
'''
    for code in (create,reopen):
        result=subprocess.run([sys.executable,'-c',code],cwd=Path(__file__).parent,env=env,capture_output=True,text=True,timeout=30)
        assert result.returncode==0,result.stderr
