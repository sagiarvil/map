import json
import os
import pathlib
import tempfile
import unittest
import urllib.request
import threading
from http.server import ThreadingHTTPServer

import app
import apex_v8_engine


class ApexV8EngineTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = str(pathlib.Path(self.tmp_dir.name) / "test_leads.sqlite3")
        self.store = app.Store(self.db_path)
        self.packager = apex_v8_engine.VeriBankasiFulfillmentPackager(db_path=self.db_path)
        self.packager.ensure_v8_schema()

    def tearDown(self):
        self.store.close()
        self.tmp_dir.cleanup()

    def test_vkn_checksum(self):
        def make_valid_vkn(prefix9: str) -> str:
            total = 0
            for i in range(9):
                d = int(prefix9[i])
                tmp = (d + (9 - i)) % 10
                val = 9 if tmp == 9 else ((tmp * (2 ** (9 - i))) % 9)
                total += val
            cd = (10 - (total % 10)) % 10
            return prefix9 + str(cd)

        valid_vkn = make_valid_vkn("123456789")
        self.assertTrue(apex_v8_engine.verify_turkish_vkn_checksum(valid_vkn))
        self.assertFalse(apex_v8_engine.verify_turkish_vkn_checksum("1234567891"))
        self.assertFalse(apex_v8_engine.verify_turkish_vkn_checksum("0000000000"))

    def test_cfemail_deobfuscation(self):
        raw = "contact@domain.com"
        key = 0x55
        hex_str = f"{key:02x}" + "".join(f"{ord(c) ^ key:02x}" for c in raw)
        decoded = apex_v8_engine.decode_cloudflare_cfemail(hex_str)
        self.assertEqual(decoded, raw)

    def test_nace_classification(self):
        clf = apex_v8_engine.SemanticNaceClassifier()
        res = clf.classify("Anadolu Mobilya Sanayi Ticaret", "Ofis ve mağaza mobilyaları üretimi ahşap dolap")
        self.assertTrue(res["nace_code"].startswith("31.") or res["nace_code"].startswith("16."))
        self.assertIn("similarity", res)

    def test_packager_export_bundle(self):
        import sqlite3
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO places (id, name, category, search_text, region, address, lat, lon, website, confidence, operating, source, imported, provenance) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                ("p1", "Ege Mobilya Ltd", "Mobilya", "ege mobilya izmir", "İzmir", "Sanayi Cad. No:5", 38.4, 27.1, "https://egemobilya.com.tr", 0.9, "yes", "manual", "2026-11-17", "test"),
            )
            conn.execute(
                "INSERT INTO place_emails (place_id, email, mx, smtp_status, confidence) VALUES (?, ?, ?, ?, ?)",
                ("p1", "info@egemobilya.com.tr", "mail.egemobilya.com.tr", "deliverable", 0.98),
            )
            conn.execute(
                "INSERT INTO place_phones (place_id, phone, line_type, whatsapp_url) VALUES (?, ?, ?, ?)",
                ("p1", "+902321234567", "FIXED_LINE", "https://wa.me/902321234567"),
            )

        export_dir = str(pathlib.Path(self.tmp_dir.name) / "bundle_out")
        res = self.packager.export_full_bundle(
            output_dir=export_dir,
            package_title="İzmir Mobilya Test Paketi",
            quota=10,
            city_filter="İzmir",
            sector_query="Mobilya",
        )
        self.assertEqual(res["delivered_count"], 1)
        self.assertTrue(pathlib.Path(res["files"]["csv"]).exists())
        self.assertTrue(pathlib.Path(res["files"]["crm_html"]).exists())
        self.assertTrue(pathlib.Path(res["files"]["merge_json"]).exists())

    def test_http_v8_endpoints(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        server.store = self.store  # type: ignore[attr-defined]
        server.discovery = threading.BoundedSemaphore(1)  # type: ignore[attr-defined]
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        try:
            base = f"http://127.0.0.1:{server.server_port}/"
            with urllib.request.urlopen(base + "api/session", timeout=5) as r:
                token = json.loads(r.read())["token"]
            headers = {"X-Local-Token": token}

            # Health endpoint
            req_health = urllib.request.Request(base + "api/v8/health", headers=headers)
            with urllib.request.urlopen(req_health, timeout=5) as r:
                data = json.loads(r.read())
            self.assertEqual(data["engine"], "Apex-V8-Enterprise")

            # Export CRM endpoint
            req_crm = urllib.request.Request(base + "api/v8/export-crm.html?quota=10", headers=headers)
            with urllib.request.urlopen(req_crm, timeout=5) as r:
                html_crm = r.read().decode("utf-8")
            self.assertIn("html&amp;html Veri Bankası Yerel Satış Takip CRM", html_crm)
        finally:
            server.shutdown()
            server.server_close()
            t.join()
