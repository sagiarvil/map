import sys,tempfile,unittest,zipfile,json,threading,urllib.request,urllib.error,xml.etree.ElementTree as ET
from pathlib import Path
from http.server import ThreadingHTTPServer
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import Store,Handler
from catalog import ingest,listing,queue,bounds,terms
from export_xlsx import generate
from engine import now

def ft(i,name='Örnek İnşaat',category='general_contractor',website='https://firma.com/',confidence=.9,**extra):
    return {'type':'Feature','geometry':{'type':'Point','coordinates':[27.1,38.4]},'properties':{'id':str(i),'names':{'primary':name},'taxonomy':{'primary':category},'websites':[website] if website else [],'confidence':confidence,'addresses':[{'freeform':'İzmir'}],**extra}}
def fc(*features):return {'type':'FeatureCollection','features':list(features)}
class CatalogTests(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.store=Store(Path(self.tmp.name)/'store.db')
    def tearDown(self):self.tmp.cleanup()
    def test_bounding_validation(self):
        self.assertEqual(bounds('27,38,28,39'),(27,38,28,39))
        for v in ['nan,38,28,39','28,38,27,39','0,0,100,50','1,2,3','1,2,3,91']:
            with self.assertRaises(ValueError):bounds(v)
    def test_turkish_alias(self):self.assertIn('general contractor',terms('MÜTEAHHİT'))
    def test_filter_no_website_and_threshold(self):
        ingest(self.store,fc(ft(1),ft(2,website=''),ft(3,category='dentist',name='Diş kliniği'),ft(4,confidence=None),ft(5,confidence=0),ft(6,operating_status='permanently_closed')),'İzmir')
        r=listing(self.store,'müteahhit','İzmir');self.assertEqual((r['total'],r['websites']),(3,2));self.assertEqual(listing(self.store,'müteahhit','İzmir',.95)['total'],0);self.assertEqual(listing(self.store,'müteahhit','İzmir',.8)['total'],2)
    def test_exact_tokens(self):
        ingest(self.store,fc(ft(1,name='A',category='car'),ft(2,name='B',category='cartoon')),'İzmir');self.assertEqual(listing(self.store,'car','İzmir')['total'],1)
    def test_invalid_and_platform_url(self):
        r=ingest(self.store,fc(ft(1,website='https://maps.google.com/'),{'type':'Feature'},ft(2,website='http://127.0.0.1')),'İzmir');self.assertEqual((r['valid'],r['skipped'],r['websites']),(2,1,0))
    def test_upsert_and_shared_domain(self):
        ingest(self.store,fc(ft(1),ft(2,name='Şube')),'İzmir');ingest(self.store,fc(ft(1,name='Yeni unvan')),'İzmir');self.assertEqual(listing(self.store,'müteahhit','İzmir')['total'],2)
        r=queue(self.store,'müteahhit','İzmir');self.assertEqual((r['added'],r['linked']),(1,2));self.assertEqual(queue(self.store,'müteahhit','İzmir')['linked'],0)
    def test_queue_limit_and_followup(self):
        ingest(self.store,fc(*[ft(i,website=f'https://firma{i}.com') for i in range(3)]),'İzmir');self.assertEqual(queue(self.store,'müteahhit','İzmir',limit=2)['added'],2);self.assertEqual(queue(self.store,'müteahhit','İzmir',limit=2)['added'],1)
    def test_concurrent_queue(self):
        ingest(self.store,fc(ft(1),ft(2)),'İzmir');out=[];ts=[threading.Thread(target=lambda:out.append(queue(self.store,'müteahhit','İzmir'))) for _ in range(4)]
        for t in ts:t.start()
        for t in ts:t.join()
        self.assertEqual(sum(x['added'] for x in out),1);self.assertEqual(sum(x['linked'] for x in out),2)
    def test_xlsx_structure_evidence_and_suppression(self):
        ingest(self.store,fc(ft(1,name='=HYPERLINK("bad")',phones=['0232 123 45 67','+902321234567','0850 123 45 67'],emails=['ofis@firma.com'],addresses=[{'region':'TR-35','district':'Buca','country':'TR','freeform':'Örnek adres'}]),ft(2,website='')),'İzmir');queue(self.store,'müteahhit','İzmir');j=self.store.claim();self.store.finish(j,{'title':'=FORMULA()','contacts':[{'email':e,'source':'https://firma.com/contact','mx':'mx','same_domain':True,'seen':now()} for e in ('info@firma.com','sales@firma.com')],'phones':['+902321234567'],'pages':1,'warnings':[]});self.store.suppress('sales@firma.com');dest=Path(self.tmp.name)/'test.xlsx';generate(self.store,dest)
        with zipfile.ZipFile(dest) as z:
            self.assertIsNone(z.testzip()); ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'};book=ET.fromstring(z.read('xl/workbook.xml'));self.assertEqual(len(book.findall('m:sheets/m:sheet',ns)),1)
            xml=z.read('xl/worksheets/sheet1.xml');self.assertNotIn(b'sales@firma.com',xml);self.assertIn(b'=HYPERLINK',xml);self.assertFalse(ET.fromstring(xml).findall('.//m:f',ns));root=ET.fromstring(xml)
            rows=[{c.attrib['r']:''.join(c.itertext()) for c in r} for r in root.findall('.//m:row',ns)]
            expected_headers = ['Firma adı', 'Sektör', 'NACE Kodu', 'NACE Faaliyet Tanımı', 'Kurumsal Düzey', 'Mail / Altyapı', 'WhatsApp Linki', 'İl', 'İlçe', 'E-posta 1', 'E-posta 2', 'Telefon 1', 'Telefon 2', 'Web sitesi', 'Adres']
            self.assertEqual(list(rows[0].values()), expected_headers)
            self.assertEqual(rows[1]['H2'], 'İzmir')
            self.assertEqual(rows[1]['I2'], 'Buca')
            self.assertEqual(rows[1]['J2'], 'info@firma.com')
            self.assertEqual(rows[1]['K2'], 'ofis@firma.com')
            self.assertEqual(rows[1]['L2'], '+902321234567')
            self.assertEqual(rows[1]['M2'], '+908501234567')
            self.assertEqual(len(rows), 3)
    def test_phone_crawl(self):
        from engine import Page
        self.assertEqual(Page('<a href="tel:02321234567">Ara</a><a href="tel:+902321234567">Ara</a>').phones(),['+902321234567'])
    def test_dynamic_export_scope(self):
        ingest(self.store,fc(ft(1,emails=['info@firma.com','sales@firma.com','office@firma.com'],phones=['+902321234567']),ft(2,category='dentist',website='')),'İzmir');dest=Path(self.tmp.name)/'scope.xlsx';generate(self.store,dest,'müteahhit','İzmir')
        with zipfile.ZipFile(dest) as z:
            xml=z.read('xl/worksheets/sheet1.xml');self.assertIn(b'E-posta 3',xml);self.assertNotIn(b'Telefon 2',xml)
    def test_zero_data_xlsx(self):
        dest=Path(self.tmp.name)/'empty.xlsx';generate(self.store,dest);self.assertGreater(dest.stat().st_size,1000)
    def test_http_geo_and_xlsx(self):
        srv=ThreadingHTTPServer(('127.0.0.1',0),Handler);srv.store=self.store;srv.discovery=threading.BoundedSemaphore(1);t=threading.Thread(target=srv.serve_forever,daemon=True);t.start();base=f'http://127.0.0.1:{srv.server_port}/api/'
        try:
            token=json.load(urllib.request.urlopen(base+'session'))['token']
            def req(path,d=None):
                return urllib.request.urlopen(urllib.request.Request(base+path,data=json.dumps(d).encode() if d is not None else None,headers={'X-Local-Token':token,'Content-Type':'application/json'}),timeout=10)
            with self.assertRaises(urllib.error.HTTPError) as e:req('places/import',{'data':fc(ft(1)),'region':'Izmir','authorized':False})
            self.assertEqual(e.exception.code,400);self.assertEqual(json.load(req('places/import',{'data':fc(ft(1)),'region':'Izmir','authorized':True}))['unique'],1);self.assertEqual(json.load(req('places?sector=contractor&region=Izmir'))['total'],1);self.assertEqual(json.load(req('places/queue',{'sector':'contractor','region':'Izmir','authorized':True}))['added'],1)
            with req('export.xlsx') as r:self.assertTrue(r.read().startswith(b'PK'))
        finally:srv.shutdown();srv.server_close();t.join()
if __name__=='__main__':unittest.main()
