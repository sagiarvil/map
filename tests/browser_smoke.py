"""Optional end-to-end browser test, uses local fixtures instead of external sites.
Run with Playwright and Chromium installed; not required by the application.
"""
import os, sys, tempfile, threading, time, shutil
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright, expect
from unittest.mock import patch
from app import Handler, Store, Workers
from engine import Response
class FakeFetcher:
    def get(self,url,scope=None):
        pages={'https://rehber.com/':'<a href="https://firma.com/">Firma Test</a>', 'https://firma.com/':'<title>Firma Test</title><a href="/iletisim">İletişim</a>', 'https://firma.com/iletisim':'<a href="mailto:info@firma.com">İletişim</a>'}
        return Response(url,200,'text/html',pages[url])
with tempfile.TemporaryDirectory() as tmp, patch('engine.mx_status',return_value='mx'):
    store=Store(Path(tmp)/'local.sqlite3');server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.store=store;server.fetch=FakeFetcher();server.discovery=threading.BoundedSemaphore(1)
    workers=Workers(store,server.fetch,2);workers.start();thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();url=f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as p:
            executable=shutil.which('chromium') or shutil.which('chromium-browser')
            browser=p.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}),args=['--no-sandbox']);page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(url);expect(page.locator('#state')).to_have_text('Yerel motor açık');expect(page.locator('#total')).to_have_text('0');
            page.locator('#variants').click();assert page.locator('#queries a').count()==5;assert 'google.com/maps/search/' in page.locator('#queries a').first.get_attribute('href')
            page.locator('#directory').fill('https://rehber.com');page.locator('#dirPermit').check();page.locator('#discover').click();expect(page.locator('#candidates')).to_contain_text('Firma Test');page.locator('#candidates input').check();page.on('dialog',lambda dialog:dialog.accept());page.get_by_text('Seçilenleri kuyruğa ekle').click();expect(page.locator('#emails')).to_have_text('1',timeout=12000);expect(page.locator('#strong')).to_have_text('1');page.get_by_role('button',name='İncele').click();expect(page.locator('#detailRows')).to_contain_text('info@firma.com');expect(page.locator('#detailRows a')).to_have_attribute('href','https://firma.com/iletisim');page.locator('#closeDetail').click()
            with page.expect_download() as dl:page.locator('#export').click()
            data=Path(dl.value.path()).read_text(encoding='utf-8-sig');assert 'info@firma.com' in data and 'https://firma.com/iletisim' in data
            page.locator('#pause').click();expect(page.locator('#state')).to_have_text('Kuyruk duraklatıldı');page.locator('#resume').click();expect(page.locator('#state')).to_have_text('Yerel motor açık');page.locator('#suppression').fill('info@firma.com');page.locator('#suppress').click();expect(page.locator('#emails')).to_have_text('0');assert not errors,errors
            # Screenshot clean empty state, not test-data metrics.
            if os.environ.get('LEAD_PREVIEW'):
                store.delete(store.listing()['rows'][0]['id']);page.reload();expect(page.locator('#total')).to_have_text('0');page.screenshot(path=os.environ['LEAD_PREVIEW'],full_page=True)
            browser.close();print('PASS: browser UI, Google Maps search links, permitted directory fixture, queue, email provenance, CSV download, pause/resume, suppression; no JS errors.')
    finally:server.shutdown();server.server_close();workers.close();thread.join()
