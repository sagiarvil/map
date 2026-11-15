import sys, tempfile, threading, unittest, json, urllib.request, urllib.error, http.client, time
from pathlib import Path
from unittest.mock import patch
from http.server import ThreadingHTTPServer
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import Handler, Store, Workers
from engine import Response
class Fixture:
    def get(self,url,scope=None):
        pages={'https://rehber.com/':'<a href="https://firma.com/">Firma Test</a>', 'https://firma.com/':'<title>Firma Test</title><a href="/iletisim">İletişim</a>', 'https://firma.com/iletisim':'<a href="mailto:info@firma.com">İletişim</a>'}
        return Response(url,200,'text/html',pages[url])
class HttpTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.store=Store(Path(self.tmp.name)/'test.sqlite3');self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);self.server.store=self.store;self.server.fetch=Fixture();self.server.discovery=threading.BoundedSemaphore(1);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.base=f'http://127.0.0.1:{self.server.server_port}/';self.token='';self.token=self.call('api/session')['token'];self.rows=[{'url':'firma.com','sector':'Mobilya','region':'İzmir','origin':'İzinli kaynak'}]
    def tearDown(self):self.server.shutdown();self.server.server_close();self.thread.join();self.tmp.cleanup()
    def call(self,path,data=None,token=True,raw=False,headers=None):
        h={'X-Local-Token':self.token} if token else {};h.update(headers or {})
        if data is not None:h['Content-Type']='application/json'
        req=urllib.request.Request(self.base+path,data=None if data is None else json.dumps(data).encode(),headers=h)
        with urllib.request.urlopen(req,timeout=5) as r:
            body=r.read();return body if raw else json.loads(body)
    def test_assets(self):
        for p in ['', 'app.js','style.css']:
            self.assertGreater(len(self.call(p,raw=True)),100)
    def test_api_auth(self):
        with self.assertRaises(urllib.error.HTTPError) as e:self.call('api/status',token=False)
        self.assertEqual(e.exception.code,403)
    def test_cross_origin_and_host(self):
        for headers in [{'Origin':'https://bad.com'},{'Host':'bad.com'}]:
            with self.assertRaises(urllib.error.HTTPError) as e:self.call('api/session',headers=headers)
            self.assertEqual(e.exception.code,403)
    def test_permission_required(self):
        with self.assertRaises(urllib.error.HTTPError) as e:self.call('api/add',{'rows':self.rows,'authorized':False})
        self.assertEqual(e.exception.code,400)
    def test_full_http_workflow(self):
        with patch('engine.mx_status',return_value='mx'):
            w=Workers(self.store,self.server.fetch,2);w.start()
            try:
                candidates=self.call('api/discover',{'url':'rehber.com','authorized':True});self.assertEqual(candidates[0]['url'],'https://firma.com/')
                self.assertEqual(self.call('api/add',{'rows':self.rows,'authorized':True})['accepted'],1)
                for _ in range(40):
                    if self.call('api/status')['contacts']==1:break
                    time.sleep(.15)
                self.assertEqual(self.call('api/status')['strong'],1);j=self.call('api/jobs')['rows'][0];self.assertEqual(j['status'],'done');self.assertEqual(self.call('api/contacts?id='+str(j['id']))[0]['source'],'https://firma.com/iletisim');self.assertIn(b'info@firma.com',self.call('api/export',raw=True))
                self.assertTrue(self.call('api/pause',{'paused':True})['paused']);self.assertFalse(self.call('api/pause',{'paused':False})['paused']);self.call('api/suppress',{'email':'info@firma.com'});self.assertNotIn(b'info@firma.com',self.call('api/export',raw=True))
            finally:w.close()
    def test_ct_logs_endpoint(self):
        with patch('engine.fetch_ct_logs', return_value=[{'domain': 'ornek-mobilya.com.tr', 'issuer': "Let's Encrypt"}]):
            res = self.call('api/ct_logs?query=mobilya&limit=10')
            self.assertEqual(res['count'], 1)
            self.assertEqual(res['domains'][0]['domain'], 'ornek-mobilya.com.tr')
if __name__=='__main__':unittest.main()
