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


if __name__ == '__main__':
    unittest.main()
