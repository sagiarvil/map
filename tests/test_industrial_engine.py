import json
import unittest
from pathlib import Path

import app
import industrial_engine


class IndustrialEngineTests(unittest.TestCase):
    def test_get_engine_status(self):
        st = industrial_engine.get_engine_status()
        self.assertEqual(st.get("status"), "active")
        engines = st.get("engines", {})
        self.assertIn("duckdb", engines)
        self.assertIn("splink", engines)
        self.assertIn("camoufox", engines)
        self.assertIn("crawl4ai", engines)
        self.assertIn("overturemaps", engines)
        self.assertTrue(engines["duckdb"]["installed"])
        self.assertTrue(engines["splink"]["installed"])
        self.assertTrue(engines["camoufox"]["installed"])
        self.assertTrue(engines["crawl4ai"]["installed"])
        self.assertTrue(engines["overturemaps"]["installed"])

    def test_splink_duckdb_deduplication(self):
        records = [
            {"id": "1", "name": "Akdeniz Demir Celik Sanayi Ltd", "city": "Adana", "phones": ["0322 123 45 67"]},
            {"id": "2", "name": "Akdeniz Demir Celik San.", "city": "Adana", "phones": ["0322 123 45 67"]},
            {"id": "3", "name": "Marmara Nakliyat AS", "city": "Istanbul", "phones": ["0212 999 88 77"]},
        ]
        clustered = industrial_engine.deduplicate_records_splink(records)
        self.assertEqual(len(clustered), 3)
        # Record 1 and Record 2 should share the same cluster_id
        c1 = next(r["cluster_id"] for r in clustered if r["id"] == "1")
        c2 = next(r["cluster_id"] for r in clustered if r["id"] == "2")
        c3 = next(r["cluster_id"] for r in clustered if r["id"] == "3")
        self.assertEqual(c1, c2, "Firms with identical phone and similar name must cluster together")
        self.assertNotEqual(c1, c3, "Distinct firms must not share cluster_id")


if __name__ == "__main__":
    unittest.main()
