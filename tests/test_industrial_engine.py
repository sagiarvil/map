import json
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from app import Handler, Store
import catalog
import engine
import industrial_engine


class IndustrialEngineTests(unittest.TestCase):
    def test_get_engine_status_all_nine_active(self):
        st = industrial_engine.get_engine_status()
        self.assertEqual(st.get("status"), "active")
        self.assertEqual(st.get("version"), "7.0-pro")
        self.assertEqual(st.get("active_engines"), 9)
        self.assertEqual(st.get("total_engines"), 9)
        engines = st.get("engines", {})
        for key in (
            "duckdb",
            "overturemaps",
            "splink",
            "rapidfuzz",
            "h3",
            "trafilatura_lexbor",
            "curl_cffi",
            "phonenumbers",
            "orjson_dns",
        ):
            self.assertIn(key, engines)
            self.assertTrue(engines[key]["installed"], f"{key} must be physically installed")

    def test_libphonenumber_repair_and_whatsapp(self):
        repaired = industrial_engine.normalize_and_classify_phone("+15334787816", "TR")
        self.assertIsNotNone(repaired)
        assert repaired is not None
        self.assertEqual(repaired["e164"], "+905334787816")
        self.assertEqual(repaired["line_type"], "mobile")
        self.assertTrue(repaired["whatsapp_eligible"])
        self.assertEqual(repaired["whatsapp_url"], "https://wa.me/905334787816")

        landline = industrial_engine.normalize_and_classify_phone("0212 310 12 34", "TR")
        self.assertIsNotNone(landline)
        assert landline is not None
        self.assertEqual(landline["e164"], "+902123101234")
        self.assertEqual(landline["line_type"], "fixed_line")
        self.assertFalse(landline["whatsapp_eligible"])

    def test_email_validator_hygiene(self):
        self.assertEqual(
            industrial_engine.validate_and_normalize_email("INFO@FirmaOrnek.com.tr"),
            "info@firmaornek.com.tr",
        )
        self.assertIsNone(industrial_engine.validate_and_normalize_email("image@2x.png"))
        self.assertIsNone(industrial_engine.validate_and_normalize_email("test@example.com"))

    def test_splink_duckdb_calibrated_deduplication(self):
        records = [
            {"id": "1", "name": "Akdeniz Demir Celik Sanayi Ltd", "city": "Adana", "phones": ["0322 456 78 90"]},
            {"id": "2", "name": "Akdeniz Demir Celik San.", "city": "Adana", "phones": ["0322 456 78 90"]},
            {"id": "3", "name": "Marmara Nakliyat AS", "city": "Istanbul", "phones": ["0212 345 67 89"]},
        ]
        clustered = industrial_engine.deduplicate_records_splink(records)
        self.assertEqual(len(clustered), 3)
        c1 = next(r["cluster_id"] for r in clustered if r["id"] == "1")
        c2 = next(r["cluster_id"] for r in clustered if r["id"] == "2")
        c3 = next(r["cluster_id"] for r in clustered if r["id"] == "3")
        self.assertEqual(c1, c2)
        self.assertNotEqual(c1, c3)

    def test_rapidfuzz_simd_ranking(self):
        records = [
            {"id": "1", "name": "Yildiz Buro Mobilyalari Imalat", "category": "furniture", "district": "Inegol"},
            {"id": "2", "name": "Kuzey Oto Yedek Parca", "category": "automotive", "district": "Kartal"},
            {"id": "3", "name": "Anadolu Mutfak ve Mobilya Tasarim", "category": "cabinet maker", "district": "Modoko"},
        ]
        ranked = industrial_engine.fuzzy_rank_records(records, "mobilya", limit=10)
        self.assertGreaterEqual(len(ranked), 2)
        top_ids = {r["id"] for r in ranked[:2]}
        self.assertIn("1", top_ids)
        self.assertIn("3", top_ids)
        self.assertNotIn("2", top_ids)

    def test_uber_h3_spatial_clusters(self):
        records = [
            {
                "name": f"OSB Metal Fabrikasi {i}",
                "category": "metal fabricator",
                "district": "Tuzla",
                "lat": 40.8850 + (i * 0.0002),
                "lon": 29.3650 + (i * 0.0002),
                "website": f"https://metal{i}.com.tr",
                "emails": [f"info@metal{i}.com.tr"],
                "phones": ["+902165550000"],
            }
            for i in range(8)
        ]
        clusters = industrial_engine.compute_h3_industrial_clusters(records, resolution=7, top_n=5)
        self.assertEqual(len(clusters), 1)
        self.assertEqual(clusters[0]["firm_count"], 8)
        self.assertEqual(clusters[0]["district"], "Tuzla")
        self.assertEqual(clusters[0]["with_email"], 8)
        self.assertGreaterEqual(len(clusters[0].get("boundary", [])), 6)

    def test_v7_gib_vkn_mersis_execs_and_global_catalog(self):
        self.assertTrue(industrial_engine.validate_gib_vkn("1234567890"))
        self.assertFalse(industrial_engine.validate_gib_vkn("1234567891"))
        self.assertFalse(industrial_engine.validate_gib_vkn("0000000000"))

        self.assertTrue(industrial_engine.validate_mersis("0123456789000015"))
        self.assertFalse(industrial_engine.validate_mersis("9999999999999999"))

        sample_html = """
        <html><head>
        <script type="application/ld+json">
        {"@type": "Organization", "founder": {"@type": "Person", "name": "Ahmet Yilmaz", "jobTitle": "Kurucu Genel Müdür"}}
        </script>
        </head><body>
        <p>Vergi No: 1234567890 | MERSİS: 0123456789000015 | KEP: ornekas@hs01.kep.tr | USt-IdNr: DE123456789</p>
        </body></html>
        """
        ids = industrial_engine.extract_corporate_identifiers(sample_html)
        self.assertEqual("1234567890", ids["vkn"])
        self.assertIn("1234567890", ids["all_vkns"])
        self.assertEqual("0123456789000015", ids["mersis"])
        self.assertIn("ornekas@hs01.kep.tr", ids["kep_addresses"])
        self.assertIn("DE123456789", ids["international_reg_ids"])

        execs = industrial_engine.extract_decision_makers(sample_html)
        self.assertGreaterEqual(len(execs), 1)
        self.assertEqual(execs[0]["name"], "Ahmet Yilmaz")

        pat = industrial_engine.infer_email_pattern(["ahmet.yilmaz@ornek.com.tr"], "ornek.com.tr")
        self.assertEqual(pat["pattern"], "{ad}.{soyad}@ornek.com.tr")

        # International Phone & WhatsApp + Foreign Region Meta
        de_mob = engine.phone_normalize("0171 2345678", "DE")
        self.assertEqual(de_mob, "+491712345678")
        self.assertTrue(engine.is_whatsapp_phone(de_mob))
        de_land = engine.phone_normalize("030 1234567", "DE")
        self.assertEqual(de_land, "+49301234567")
        self.assertFalse(engine.is_whatsapp_phone(de_land))

        f_berlin = {
            "properties": {
                "addresses": [{"country": "DE", "locality": "Berlin", "sublocality": "Mitte"}],
                "emails": ["info@kuechen-berlin.de"],
                "phones": ["0171 2345678"],
            }
        }
        _, prov, dist, em_json, ph_json = catalog.meta(f_berlin, "p1", "Berlin, Almanya")
        self.assertEqual(prov, "Berlin")
        self.assertEqual(dist, "Mitte")
        self.assertIn("info@kuechen-berlin.de", json.loads(em_json))
        self.assertIn("+491712345678", json.loads(ph_json))

        # SSRF protection on ERP webhook
        with self.assertRaises(ValueError):
            industrial_engine.dispatch_erp_webhook("http://127.0.0.1:8765/api/status", {"test": 1})

    def test_duckdb_database_analytics(self):
        db_path = Path("data/leads.sqlite3")
        if not db_path.exists():
            self.skipTest("leads.sqlite3 not found")
        analytics = industrial_engine.get_database_analytics(db_path, force_refresh=True)
        self.assertGreater(analytics["total_places"], 500000)
        self.assertIn("top_categories", analytics)
        cached = industrial_engine.get_database_analytics(db_path, force_refresh=False)
        self.assertTrue(cached.get("cached"))

    def test_http_v6_industrial_endpoints(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / "test.sqlite3")
            server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
            server.store = store  # type: ignore[attr-defined]
            server.discovery = threading.BoundedSemaphore(1)  # type: ignore[attr-defined]
            t = threading.Thread(target=server.serve_forever, daemon=True)
            t.start()
            try:
                base = f"http://127.0.0.1:{server.server_port}/"
                with urllib.request.urlopen(base + "api/session", timeout=5) as r:
                    sess = json.loads(r.read())
                self.assertEqual(sess["engine"], "v7-pro")
                headers = {"X-Local-Token": sess["token"], "Content-Type": "application/json"}

                req_st = urllib.request.Request(base + "api/industrial/status", headers=headers)
                with urllib.request.urlopen(req_st, timeout=5) as r:
                    st = json.loads(r.read())
                self.assertEqual(st["active_engines"], 9)

                payload = json.dumps({
                    "query": "insaat",
                    "records": [
                        {"name": "Zirve Insaat Taahhut AS", "category": "construction", "district": "Kadikoy"},
                        {"name": "Deniz Pastanesi", "category": "bakery", "district": "Besiktas"},
                    ],
                }).encode()
                req_fz = urllib.request.Request(base + "api/industrial/fuzzy_match", data=payload, headers=headers)
                with urllib.request.urlopen(req_fz, timeout=5) as r:
                    fz = json.loads(r.read())
                self.assertGreaterEqual(fz["count"], 1)
                self.assertEqual(fz["records"][0]["name"], "Zirve Insaat Taahhut AS")
            finally:
                server.shutdown()
                server.server_close()
                t.join()
                store.close()

    def test_multilingual_sector_stemming_and_osm_regex_tags(self):
        import catalog
        import industrial_engine as ie

        expanded = catalog.terms("Mobilyacılar")
        self.assertIn("mobilya", expanded)
        self.assertIn("meuble", expanded)
        self.assertIn("mobilier", expanded)
        self.assertIn("furniture store", expanded)

        filters = catalog._resolve_osm_filters("mobilyacılar")
        kv_tags = catalog._extract_osm_kv_tags(filters)
        self.assertIn("shop:furniture", kv_tags)
        self.assertIn("craft:carpenter", kv_tags)

        # Must match French furniture store ('Meubles') and reject French mobility station ('MOBILITES')
        self.assertTrue(ie._matches_sector_terms(" galerie meubles paris ", expanded))
        self.assertFalse(ie._matches_sector_terms(" totalenergies mobilites paris ", expanded))


if __name__ == "__main__":
    unittest.main()
