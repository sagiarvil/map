import sys, unittest, tempfile, csv, io, socket, threading
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine import *
from app import Store

class FakeFetcher:
    def __init__(self, pages):self.pages=pages;self.calls=[]
    def get(self,u,scope=None):
        self.calls.append(u);r=self.pages[u]
        if isinstance(r,Exception):raise r
        return Response(u,200,'text/html',r)

class EngineTests(unittest.TestCase):
    def test_normalization(self):self.assertEqual(normalize('WWW.Firma.com.tr/iletişim#x'),'https://www.firma.com.tr/ileti%C5%9Fim')
    def test_unsafe(self):
        for u in ['http://127.0.0.1','https://user:pass@firma.com','http://firma.com:8080','file:///etc/passwd','https://maps.google.com','https://google.co.jp','https://www.google.com.tr/maps','https://maps.app.goo.gl/aa','https://instagram.com/firma','https://foo.com\\@bar.com','https://localhost']:
            with self.subTest(u=u),self.assertRaises(ScanError):normalize(u)
    def test_private_dns(self):
        with patch('engine.socket.getaddrinfo',return_value=[(2,1,6,'',('127.0.0.1',443))]):
            with self.assertRaises(ScanError):resolve_public('firma.com',443)
    def test_mixed_dns(self):
        with patch('engine.socket.getaddrinfo',return_value=[(2,1,6,'',('8.8.8.8',443)),(2,1,6,'',('192.168.1.10',443))]):
            with self.assertRaises(ScanError):resolve_public('firma.com',443)
    def test_public_dns(self):
        with patch('engine.socket.getaddrinfo',return_value=[(2,1,6,'',('8.8.8.8',443))]):self.assertEqual(resolve_public('firma.com',443),['8.8.8.8'])
    def test_robots(self):
        r=Robots('User-agent: *\nDisallow: /secret*\nAllow: /secret/public$\nCrawl-delay: 2')
        self.assertFalse(r.allowed('https://firma.com/secret/a'));self.assertTrue(r.allowed('https://firma.com/secret/public'));self.assertFalse(r.allowed('https://firma.com/secret/public?x=1'));self.assertEqual(r.delay,2)
    def test_robots_specific(self):
        r=Robots('User-agent: *\nDisallow: /\nUser-agent: LeadResearchLocal\nAllow: /')
        self.assertTrue(r.allowed('https://firma.com/'))
    def test_robots_tie(self):self.assertTrue(Robots('User-agent: *\nDisallow: /x\nAllow: /x').allowed('https://firma.com/x'))
    def test_robots_encoded(self):self.assertFalse(Robots('User-agent: *\nDisallow: /secret').allowed('https://firma.com/%73ecret'))
    def test_role_only(self):
        p=Page('<a href="mailto:info@firma.com?subject=hi">İletişim</a> sales@firma.com ayse.yilmaz@firma.com info@example.com <script>contact@bad.com</script><style>office@bad.com</style> info@fake.png')
        self.assertEqual(p.emails(),['info@firma.com','sales@firma.com'])
    def test_crawl_evidence_and_dedup(self):
        f=FakeFetcher({'https://firma.com/':'<title>Firma</title><a href="/contact">Contact</a>info@firma.com','https://firma.com/contact':'info@firma.com sales@firma.com <a href="https://farkli.com/contact">Contact</a>'})
        with patch('engine.mx_status',return_value='mx') as mx:
            r=crawl(f,'firma.com');self.assertEqual(r['pages'],2);self.assertEqual(len(r['contacts']),2);self.assertEqual(mx.call_count,1);self.assertEqual(r['contacts'][1]['source'],'https://firma.com/contact');self.assertTrue(r['contacts'][1]['same_domain'])
    def test_partial(self):
        f=FakeFetcher({'https://firma.com/':'<a href="/contact">Contact</a>info@firma.com','https://firma.com/contact':ScanError('403')})
        with patch('engine.mx_status',return_value='unknown'):r=crawl(f,'firma.com');self.assertEqual(r['warnings'],['403']);self.assertEqual(len(r['contacts']),1)
    def test_initial_failure(self):
        with self.assertRaises(ScanError):crawl(FakeFetcher({'https://firma.com/':ScanError('429')}),'firma.com')
    def test_stop(self):
        with self.assertRaises(ScanError):crawl(FakeFetcher({}),'firma.com',stop=lambda:True)
    def test_discovery(self):
        f=FakeFetcher({'https://rehber.com/':'<a href="https://firma.com/contact">Firma</a><a href="https://www.firma.com/">Tekrar</a><a href="https://maps.google.com/">Maps</a><a href="/about">About</a>'})
        self.assertEqual(discover(f,'rehber.com'),[{'url':'https://firma.com/','label':'Firma','source':'https://rehber.com/'}])
    def test_crossdomain_redirect(self):
        f=Fetcher()
        with patch.object(f,'_robots_for',return_value=Robots('')),patch.object(f,'_request',return_value=Response('https://firma.com/',302,'','', 'https://outside.com/')) as req:
            with self.assertRaises(ScanError):f.get('https://firma.com/')
            self.assertEqual(req.call_count,1)
    def test_robots_denial_no_page(self):
        f=Fetcher()
        with patch.object(f,'_robots_for',return_value=Robots('User-agent: *\nDisallow: /')),patch.object(f,'_request') as req:
            with self.assertRaises(ScanError):f.get('https://firma.com/')
            req.assert_not_called()
    def test_mx_states(self):
        class P: returncode=0;stdout=';; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 1\nfirma.com. 300 IN MX 0 .\n'
        with patch('engine.shutil.which',return_value='/usr/bin/dig'),patch('engine.subprocess.run',return_value=P()):self.assertEqual(mx_status('info@firma.com'),'null_mx')
        with patch('engine.shutil.which',return_value=None):self.assertEqual(mx_status('info@firma.com'),'unknown')

class StoreTests(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.store=Store(Path(self.tmp.name)/'test.sqlite3');self.row={'url':'firma.com','sector':'Mobilya','region':'İzmir','origin':'İzinli kaynak'}
    def tearDown(self):self.tmp.cleanup()
    def add(self):return self.store.add([self.row])
    def result(self,email='info@firma.com'):
        return {'title':'=FORMULA()','contacts':[{'email':email,'source':'https://firma.com/contact','mx':'mx','same_domain':True,'seen':now()}],'pages':1,'warnings':[]}
    def test_ingestion(self):
        r=self.store.add([self.row,self.row,{**self.row,'url':'https://google.com/maps'},{**self.row,'origin':''}]);self.assertEqual((r['accepted'],r['duplicates'],len(r['rejected'])),(1,1,2))
    def test_claim_once_concurrent(self):
        self.add();results=[];threads=[threading.Thread(target=lambda:results.append(self.store.claim())) for _ in range(8)]
        for x in threads:x.start()
        for x in threads:x.join()
        self.assertEqual(sum(x is not None for x in results),1)
    def test_recovery(self):
        self.add();j=self.store.claim();self.store.recover();r=self.store.claim();self.assertEqual(j['id'],r['id']);self.assertEqual(r['attempts'],1)
    def test_pause_persistent(self):
        self.add();self.store.pause(True);self.assertIsNone(Store(self.store.path).claim());self.store.pause(False);self.assertIsNotNone(self.store.claim())
    def test_finish_export_suppress(self):
        self.add();j=self.store.claim();self.store.finish(j,self.result());self.assertEqual(self.store.status()['strong'],1)
        rows=list(csv.reader(io.StringIO(self.store.export().decode('utf-8-sig'))));self.assertEqual(len(rows),2);self.assertEqual(rows[1][0],"'=FORMULA()")
        self.store.suppress('info@firma.com');self.assertEqual(self.store.status()['contacts'],0);self.assertEqual(self.store.details(j['id']),[]);self.assertEqual(len(list(csv.reader(io.StringIO(self.store.export().decode('utf-8-sig'))))),1)
    def test_global_email_dedup(self):
        self.store.add([self.row,{**self.row,'sector':'İmalat'}]);self.store.finish(self.store.claim(),self.result());self.store.finish(self.store.claim(),self.result());self.assertEqual(self.store.status()['contacts'],1);self.assertEqual(len(list(csv.reader(io.StringIO(self.store.export().decode('utf-8-sig'))))),2)
    def test_retry_bound(self):
        self.add();j=self.store.claim();self.store.fail(j,'timeout',True);self.assertEqual(self.store.status()['counts'],{'queued':1});self.assertIsNone(self.store.claim());j['attempts']=3;self.store.fail(j,'timeout',True);self.assertEqual(self.store.status()['counts'],{'failed':1});self.assertEqual(self.store.retry(j['id']),1)
    def test_snapshot_backup(self):
        self.add();p=Path(self.tmp.name)/'backup.sqlite3';self.store.backup(p);self.assertEqual(Store(p).status()['counts'],{'queued':1})
    def test_running_delete_prevented(self):
        self.add();j=self.store.claim();self.assertEqual(self.store.delete(j['id']),0);self.store.finish(j,self.result());self.assertEqual(self.store.delete(j['id']),1);self.assertEqual(self.store.status()['contacts'],0)
    def test_atomic_result(self):
        self.add();j=self.store.claim();r=self.result();r['contacts'].append(r['contacts'][0]);
        with self.assertRaises(Exception):self.store.finish(j,r)
        self.assertEqual(self.store.status()['contacts'],0);self.assertEqual(self.store.status()['counts'],{'running':1})
    def test_filter_pagination(self):
        self.add();self.assertEqual(self.store.listing('Mobilya')['total'],1);self.assertEqual(self.store.listing('yok')['total'],0);self.assertEqual(self.store.listing(offset=100)['rows'],[])

if __name__=='__main__':unittest.main()
