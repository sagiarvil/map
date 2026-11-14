"""Unit and integration tests for Lead Intelligence Pro V3 Industrial upgrades."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import catalog
from app import Store
from engine import Page, Response, crawl, decode_cfemail, now
from export_xlsx import generate


def _encode_cfemail(email: str, key: int = 0x4A) -> str:
    return f'{key:02x}' + ''.join(f'{ord(c) ^ key:02x}' for c in email)


class V3ExtractorTests(unittest.TestCase):
    def test_cfemail_and_obfuscated_at(self) -> None:
        hx = _encode_cfemail('proje@egemobilya.com.tr')
        html = (
            f'<span data-cfemail="{hx}">[email protected]</span> '
            f'<a href="/cdn-cgi/l/email-protection#{_encode_cfemail("ihracat@egemobilya.com.tr", 0x2B)}">Mail</a> '
            'Bize yazın: satinalma [at] egemobilya.com.tr ve ahmet.yilmaz@egemobilya.com.tr'
        )
        p = Page(html)
        self.assertEqual(
            p.emails('egemobilya.com.tr'),
            ['ihracat@egemobilya.com.tr', 'proje@egemobilya.com.tr', 'satinalma@egemobilya.com.tr'],
        )

    def test_brand_stem_corporate_mailbox(self) -> None:
        p = Page('İletişim: yesilaymutfak@gmail.com | ayse.demir@gmail.com')
        self.assertEqual(p.emails('yesilaymutfak.com.tr'), ['yesilaymutfak@gmail.com'])
        self.assertEqual(p.emails('baskafirma.com'), [])

    def test_jsonld_extraction_while_ignoring_inline_js(self) -> None:
        ld = json.dumps({
            '@context': 'https://schema.org',
            '@type': 'FurnitureStore',
            'name': 'Kısıkköy Tasarım Mobilya',
            'email': 'mailto:showroom@kisikkoytasarim.com.tr',
            'telephone': '+90 232 257 60 70',
            'address': {
                '@type': 'PostalAddress',
                'streetAddress': 'Kısıkköy Mobilya Şehri 2. Cad. No:14',
                'addressLocality': 'Menderes',
                'addressRegion': 'İzmir',
            },
        })
        html = (
            f'<script type="application/ld+json">{ld}</script>'
            '<script>const leak = "info@yanlisscript.com";</script>'
            '<p>Mağaza</p>'
        )
        p = Page(html)
        self.assertEqual(p.emails('kisikkoytasarim.com.tr'), ['showroom@kisikkoytasarim.com.tr'])
        self.assertEqual(p.phones(), ['+902322576070'])
        self.assertEqual(p.addr_info['district'], 'Menderes')
        self.assertEqual(p.addr_info['province'], 'İzmir')

    def test_visible_text_phones_whatsapp_and_fax_exclusion(self) -> None:
        html = (
            '<p>Merkez Tel: 0 (232) 458 12 34 · Fabrika: 0232 854 77 88 · '
            'Faks: 0232 458 12 35 · Çağrı Merkezi: 444 4 123</p>'
            '<a href="https://wa.me/905326543210?text=Merhaba">WhatsApp</a>'
        )
        p = Page(html)
        self.assertEqual(
            p.phones(),
            ['+902324581234', '+902328547788', '+905326543210', '4444123'],
        )

    def test_priority_kvkk_and_contact_links(self) -> None:
        class FakeFetch:
            def get(self, u: str, scope: str | None = None) -> Response:
                pages = {
                    'https://egemobilya.com.tr/': (
                        '<title>Ege Mobilya</title>'
                        '<a href="/hakkimizda">Hakkımızda</a>'
                        '<a href="/kvkk-aydinlatma">KVKK</a>'
                        '<a href="/bize-ulasin">Bize Ulaşın</a>'
                    ),
                    'https://egemobilya.com.tr/bize-ulasin': 'Tel: 0232 333 44 55 info@egemobilya.com.tr',
                    'https://egemobilya.com.tr/kvkk-aydinlatma': 'kvkk@egemobilya.com.tr',
                    'https://egemobilya.com.tr/hakkimizda': 'Kurumsal',
                }
                return Response(u, 200, 'text/html', pages[u])

        with patch('engine.fast_mx_status', return_value='mx'):
            res = crawl(FakeFetch(), 'egemobilya.com.tr', pages=3)
        emails = sorted(c['email'] for c in res['contacts'])
        self.assertEqual(emails, ['info@egemobilya.com.tr', 'kvkk@egemobilya.com.tr'])
        self.assertEqual(res['phones'], ['+902323334455'])


class V3GeospatialAndBatchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'v3.sqlite3')

    def tearDown(self) -> None:
        self.store.close()
        self.tmp.cleanup()

    def test_fts5_turkish_morphology_and_furniture_recall(self) -> None:
        features = {
            'type': 'FeatureCollection',
            'features': [
                {
                    'type': 'Feature',
                    'id': 'p1',
                    'geometry': {'type': 'Point', 'coordinates': [27.13, 38.37]},
                    'properties': {
                        'names': {'primary': 'Ege Modern Mobilyacılık San. Tic.'},
                        'taxonomy': {'primary': 'home_goods_store'},
                        'websites': ['https://egemodern.com.tr'],
                        'addresses': [{'freeform': 'Yeşillik Cad. No:210 Karabağlar İzmir', 'country': 'TR'}],
                        'confidence': 0.91,
                    },
                },
                {
                    'type': 'Feature',
                    'id': 'p2',
                    'geometry': {'type': 'Point', 'coordinates': [27.19, 38.24]},
                    'properties': {
                        'names': {'primary': 'Kısıkköy Koltuk & Kanepe Atölyesi'},
                        'taxonomy': {'primary': 'upholstery_service'},
                        'websites': [],
                        'addresses': [{'freeform': 'Kısıkköy Mobilya Şehri Menderes, İzmir', 'country': 'TR'}],
                        'confidence': 0.88,
                    },
                },
                {
                    'type': 'Feature',
                    'id': 'p3',
                    'geometry': {'type': 'Point', 'coordinates': [27.36, 38.16]},
                    'properties': {
                        'names': {'primary': 'Torbalı Ahşap Marangoz Sistemleri'},
                        'taxonomy': {'primary': 'carpenter'},
                        'websites': ['https://torbaliahsap.com'],
                        'addresses': [{'freeform': 'Ayrancılar Mah. Torbalı İzmir', 'country': 'TR'}],
                        'confidence': 0.84,
                    },
                },
                {
                    'type': 'Feature',
                    'id': 'p4',
                    'geometry': {'type': 'Point', 'coordinates': [27.14, 38.42]},
                    'properties': {
                        'names': {'primary': 'Kordon Balık Restoran'},
                        'taxonomy': {'primary': 'seafood_restaurant'},
                        'websites': [],
                        'addresses': [{'freeform': 'Alsancak Konak İzmir', 'country': 'TR'}],
                        'confidence': 0.95,
                    },
                },
            ],
        }
        catalog.ingest(self.store, features, 'İzmir, Türkiye')
        res = catalog.listing(self.store, 'Mobilya', 'İzmir, Türkiye')
        self.assertEqual(res['total'], 3)
        self.assertEqual(res['websites'], 2)
        districts = {r['id']: r['district'] for r in res['rows']}
        self.assertEqual(districts['p1'], 'Karabağlar')
        self.assertEqual(districts['p2'], 'Menderes')
        self.assertEqual(districts['p3'], 'Torbalı')

        # OSM fusion deduplicates p1 by domain/proximity and adds net-new workshop p_osm.
        osm_elements = [
            {
                'type': 'node',
                'id': 101,
                'lat': 38.37005,
                'lon': 27.13005,
                'tags': {
                    'name': 'Ege Modern Mobilyacılık San. Tic.',
                    'website': 'https://egemodern.com.tr',
                    'phone': '+90 232 264 10 20',
                    'shop': 'furniture',
                },
            },
            {
                'type': 'node',
                'id': 202,
                'lat': 38.43,
                'lon': 27.42,
                'tags': {
                    'name': 'Kemalpaşa Büro Koltuk Üretim',
                    'craft': 'cabinet_maker',
                    'contact:phone': '0232 878 11 22',
                    'addr:district': 'Kemalpaşa',
                    'addr:province': 'İzmir',
                },
            },
        ]
        fusion = catalog._ingest_osm_elements(self.store, osm_elements, 'İzmir, Türkiye', 'Mobilya')
        self.assertEqual(fusion['osm_merged'], 1)
        self.assertEqual(fusion['osm_added'], 1)
        after = catalog.listing(self.store, 'Mobilya', 'İzmir, Türkiye')
        self.assertEqual(after['total'], 4)

    def test_quadtree_bbox_slicer(self) -> None:
        tiles = catalog.split_bbox(26.0, 36.0, 32.0, 41.0, max_tile_area=3.6)
        self.assertGreaterEqual(len(tiles), 16)
        for tw, ts, te, tn in tiles:
            self.assertLessEqual((te - tw) * (tn - ts), 3.6001)

    def test_batch_claim_flush_and_web_meta_xlsx_enrichment(self) -> None:
        rows = [
            {'url': f'firma{i}.com.tr', 'sector': 'Mobilya', 'region': 'İzmir', 'origin': 'Rehber'}
            for i in range(10)
        ]
        self.assertEqual(self.store.add(rows)['accepted'], 10)
        claimed = self.store.claim_batch(6)
        self.assertEqual(len(claimed), 6)
        outcomes = [
            (
                'ok',
                j,
                {
                    'title': f'Firma {j["id"]}',
                    'contacts': [
                        {
                            'email': f'info@{j["domain"]}',
                            'source': j['url'],
                            'mx': 'mx',
                            'same_domain': True,
                            'seen': now(),
                        }
                    ],
                    'phones': ['+902324001020'],
                    'pages': 2,
                    'warnings': [],
                    'meta': {'province': 'İzmir', 'district': 'Bornova', 'address': '3. Sanayi Sitesi Bornova'},
                },
                False,
                False,
            )
            for j in claimed
        ]
        self.store.flush_outcomes(outcomes)
        st = self.store.status()
        self.assertEqual(st['counts']['done'], 6)
        self.assertEqual(st['strong'], 6)
        self.assertEqual(st['phones'], 1)

        out_xlsx = Path(self.tmp.name) / 'enriched.xlsx'
        generate(self.store, out_xlsx, 'Mobilya', 'İzmir')
        with zipfile.ZipFile(out_xlsx) as zf:
            xml = zf.read('xl/worksheets/sheet1.xml')
            self.assertIn('Bornova'.encode('utf-8'), xml)
            self.assertIn('3. Sanayi Sitesi Bornova'.encode('utf-8'), xml)
            ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            self.assertFalse(ET.fromstring(xml).findall('.//m:f', ns))

    def test_portfolio_district_contact_modes_and_haritalar_cors(self) -> None:
        import http.client
        import json
        import subprocess
        import threading
        from http.server import ThreadingHTTPServer
        from app import Handler

        features = {
            'type': 'FeatureCollection',
            'features': [
                {
                    'type': 'Feature',
                    'id': 'f_both',
                    'geometry': {'type': 'Point', 'coordinates': [27.13, 38.37]},
                    'properties': {
                        'names': {'primary': 'Karabağlar Koltuk Tasarım'},
                        'taxonomy': {'primary': 'furniture_store'},
                        'emails': ['info@karabaglarkoltuk.com.tr'],
                        'phones': ['+90 232 250 11 22'],
                        'addresses': [{'freeform': 'Yeşillik Cad. Karabağlar İzmir', 'locality': 'Karabağlar', 'region': 'İzmir', 'country': 'TR'}],
                        'confidence': 0.92,
                    },
                },
                {
                    'type': 'Feature',
                    'id': 'f_phone',
                    'geometry': {'type': 'Point', 'coordinates': [27.22, 38.46]},
                    'properties': {
                        'names': {'primary': 'Bornova Ahşap Mobilya'},
                        'taxonomy': {'primary': 'furniture_store'},
                        'phones': ['+90 232 341 22 33'],
                        'addresses': [{'freeform': 'Bornova İzmir', 'locality': 'Bornova', 'region': 'İzmir', 'country': 'TR'}],
                        'confidence': 0.88,
                    },
                },
                {
                    'type': 'Feature',
                    'id': 'f_email',
                    'geometry': {'type': 'Point', 'coordinates': [27.36, 38.16]},
                    'properties': {
                        'names': {'primary': 'Torbalı Modüler Mutfak'},
                        'taxonomy': {'primary': 'kitchen_furniture'},
                        'emails': ['satis@torbalimutfak.com.tr'],
                        'addresses': [{'freeform': 'Torbalı OSB İzmir', 'locality': 'Torbalı', 'region': 'İzmir', 'country': 'TR'}],
                        'confidence': 0.90,
                    },
                },
            ],
        }
        catalog.ingest(self.store, features, 'İzmir, Türkiye')

        all_res = catalog.portfolio_listing(self.store, 'Mobilya', 'İzmir, Türkiye', contact_mode='all')
        self.assertEqual(all_res['total'], 3)
        self.assertEqual(catalog.portfolio_listing(self.store, 'Mobilya', 'İzmir, Türkiye', contact_mode='has_email')['total'], 2)
        self.assertEqual(catalog.portfolio_listing(self.store, 'Mobilya', 'İzmir, Türkiye', contact_mode='has_phone')['total'], 2)
        self.assertEqual(catalog.portfolio_listing(self.store, 'Mobilya', 'İzmir, Türkiye', contact_mode='both')['total'], 1)
        self.assertEqual(catalog.portfolio_listing(self.store, 'Mobilya', 'İzmir, Türkiye', contact_mode='email_only')['total'], 1)
        self.assertEqual(catalog.portfolio_listing(self.store, 'Mobilya', 'İzmir, Türkiye', contact_mode='phone_only')['total'], 1)
        self.assertEqual(catalog.portfolio_listing(self.store, 'Mobilya', 'İzmir, Türkiye', district='Karabağlar')['total'], 1)

        # Verify haritalar.web.app Private Network Access CORS preflight + portfolio API
        srv = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        srv.store = self.store  # type: ignore[attr-defined]
        srv.discovery = threading.BoundedSemaphore(1)  # type: ignore[attr-defined]
        th = threading.Thread(target=srv.serve_forever, daemon=True)
        th.start()
        try:
            conn = http.client.HTTPConnection('127.0.0.1', srv.server_port, timeout=5)
            conn.request(
                'OPTIONS',
                '/api/session',
                headers={
                    'Origin': 'https://haritalar.web.app',
                    'Access-Control-Request-Method': 'GET',
                    'Access-Control-Request-Private-Network': 'true',
                },
            )
            opt_res = conn.getresponse()
            opt_res.read()
            self.assertEqual(opt_res.status, 204)
            self.assertEqual(opt_res.getheader('Access-Control-Allow-Origin'), 'https://haritalar.web.app')
            self.assertEqual(opt_res.getheader('Access-Control-Allow-Private-Network'), 'true')

            conn.request('GET', '/api/session', headers={'Origin': 'https://haritalar.web.app'})
            s_res = conn.getresponse()
            tok = json.loads(s_res.read())['token']
            self.assertEqual(s_res.status, 200)

            conn.request(
                'GET',
                '/api/portfolio?sector=Mobilya&region=%C4%B0zmir%2C%20T%C3%BCrkiye&contact_mode=has_email',
                headers={'Origin': 'https://haritalar.web.app', 'X-Local-Token': tok},
            )
            p_res = conn.getresponse()
            p_data = json.loads(p_res.read())
            self.assertEqual(p_res.status, 200)
            self.assertEqual(p_data['total'], 2)
            conn.close()
        finally:
            srv.shutdown()
            srv.server_close()
            th.join()

        # Verify browser pure-JS xlsx-engine.js produces a valid, formula-safe OOXML .xlsx
        xlsx_js = Path(__file__).resolve().parents[1] / 'hosting' / 'xlsx-engine.js'
        out_browser_xlsx = Path(self.tmp.name) / 'browser_firmalar.xlsx'
        node_script = f"""
        const fs = require('fs');
        require({json.dumps(str(xlsx_js))});
        (async () => {{
          const blob = await globalThis.XlsxEngine.generateFirmalarXlsx([
            {{
              name: '=1+1 Tehlikeli Formül A.Ş.',
              category: 'Mobilya',
              city: 'İzmir',
              district: 'Karabağlar',
              emails: ['info@test.com.tr'],
              phones: ['+902322001010'],
              website: 'https://test.com.tr',
              address: 'Kısıkköy Mobilya Şehri'
            }}
          ]);
          const buf = Buffer.from(await blob.arrayBuffer());
          fs.writeFileSync({json.dumps(str(out_browser_xlsx))}, buf);
        }})();
        """
        subprocess.run(['node', '-e', node_script], check=True, timeout=10)
        with zipfile.ZipFile(out_browser_xlsx) as zf:
            wb_xml = zf.read('xl/workbook.xml').decode('utf-8')
            sh_xml = zf.read('xl/worksheets/sheet1.xml').decode('utf-8')
            self.assertIn('name="Firmalar"', wb_xml)
            self.assertIn('Kısıkköy Mobilya Şehri', sh_xml)
            ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            self.assertFalse(ET.fromstring(sh_xml.encode('utf-8')).findall('.//m:f', ns))


class V4CleanlinessAndLexborTests(unittest.TestCase):
    def test_nextjs_hydration_rsc_opengraph_and_junk_hygiene(self) -> None:
        from engine import HAS_LEXBOR, phone_normalize

        self.assertTrue(HAS_LEXBOR)
        next_payload = json.dumps({
            'props': {
                'pageProps': {
                    'company': {
                        'contactEmail': 'satis@inegolmobilya.com.tr',
                        'phone': '+90 224 715 20 30',
                    }
                }
            }
        })
        html = (
            '<meta property="og:email" content="ihracat@inegolmobilya.com.tr">'
            f'<script id="__NEXT_DATA__" type="application/json">{next_payload}</script>'
            '<script>self.__next_f.push([1,"{\\"email\\":\\"proje@inegolmobilya.com.tr\\",\\"telephone\\":\\"+905324445566\\"}"])</script>'
            '<p>Font: info@latofonts.com | Tracker: info@sentry.io | Sahte Tel: 0212 000 00 00 ve 0555 555 55 55</p>'
        )
        p = Page(html)
        self.assertEqual(
            p.emails('inegolmobilya.com.tr'),
            ['ihracat@inegolmobilya.com.tr', 'proje@inegolmobilya.com.tr', 'satis@inegolmobilya.com.tr'],
        )
        self.assertEqual(p.phones(), ['+902247152030', '+905324445566'])
        self.assertEqual(phone_normalize('0212 000 00 00'), '')
        self.assertEqual(phone_normalize('+90 555 555 55 55'), '')

    def test_poi_sme_email_unlock_freeform_province_and_spatial_dedup(self) -> None:
        from scripts.build_shards import build_shards

        with tempfile.TemporaryDirectory() as tmp:
            db_file = Path(tmp) / 'v4.sqlite3'
            st = Store(db_file)
            try:
                features = {
                    'type': 'FeatureCollection',
                    'features': [
                        {
                            'type': 'Feature',
                            'id': 'bursa_1',
                            'geometry': {'type': 'Point', 'coordinates': [29.51000, 40.07800]},
                            'properties': {
                                'names': {'primary': 'İnegöl Prestij Koltuk'},
                                'taxonomy': {'primary': 'furniture_store'},
                                'websites': ['https://inegolprestij.com.tr'],
                                'emails': ['inegol.prestij@hotmail.com'],
                                'phones': ['+90 224 711 22 33'],
                                'addresses': [{'freeform': 'Ertuğrulgazi Mah. İnegöl/BURSA', 'locality': 'İnegöl', 'country': 'TR'}],
                                'confidence': 0.94,
                            },
                        },
                        {
                            'type': 'Feature',
                            'id': 'bursa_1_shadow',
                            'geometry': {'type': 'Point', 'coordinates': [29.51010, 40.07808]},
                            'properties': {
                                'names': {'primary': 'İnegöl Prestij Koltuk'},
                                'taxonomy': {'primary': 'furniture_store'},
                                'emails': ['satis@inegolprestij.com.tr'],
                                'phones': ['+90 532 711 22 34'],
                                'addresses': [{'freeform': 'Ertuğrulgazi Mah. Mobilya Cad. No:8 İnegöl/BURSA', 'locality': 'İnegöl', 'country': 'TR'}],
                                'confidence': 0.72,
                            },
                        },
                        {
                            'type': 'Feature',
                            'id': 'closed_shop',
                            'geometry': {'type': 'Point', 'coordinates': [29.52, 40.08]},
                            'properties': {
                                'names': {'primary': 'Kapanmış Mobilya'},
                                'taxonomy': {'primary': 'furniture_store'},
                                'operating_status': 'temporarily_closed',
                                'confidence': 0.85,
                            },
                        },
                    ],
                }
                catalog.ingest(st, features, 'Bursa, Türkiye')
                self.assertEqual(catalog._infer_province_from_freeform('Organize Sanayi Cad. No: 12 / '), '')
                self.assertEqual(catalog._infer_province_from_freeform('Yeşilköy Mah. / İSTANBUL'), 'İstanbul')
                merged_cnt = catalog.deduplicate_region(st, 'Bursa, Türkiye')
                self.assertEqual(merged_cnt, 1)

                port = catalog.portfolio_listing(st, 'Mobilya', 'Bursa, Türkiye')
                self.assertEqual(port['total'], 1)
                row = port['rows'][0]
                self.assertEqual(row['city'], 'Bursa')
                self.assertEqual(row['district'], 'İnegöl')
                self.assertEqual(row['emails'], ['inegol.prestij@hotmail.com', 'satis@inegolprestij.com.tr'])
                self.assertEqual(row['phones'], ['+902247112233', '+905327112234'])

                import gzip as gz_mod
                out_shards = Path(tmp) / 'shards'
                manifest = build_shards(db_file, out_shards)
                self.assertEqual(manifest['version'], 4)
                bursa_shard = json.loads(gz_mod.decompress((out_shards / 'bursa.json.gz').read_bytes()).decode('utf-8'))
                self.assertEqual(bursa_shard['v'], 4)
                self.assertEqual(len(bursa_shard['rows']), 1)
                self.assertIn('İnegöl', bursa_shard['dists'])
            finally:
                st.close()


if __name__ == '__main__':
    unittest.main()
