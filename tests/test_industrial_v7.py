import concurrent.futures
import tempfile
import unittest
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

import app
import catalog
import export_xlsx
import industrial_engine


def _make_fc(items):
    features = []
    for item in items:
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [item["lon"], item["lat"]]},
                "properties": {
                    "id": item["id"],
                    "names": {"primary": item["name"]},
                    "categories": {"primary": item["category"]},
                    "websites": [item["website"]] if item.get("website") else [],
                    "phones": [item["phone"]] if item.get("phone") else [],
                    "emails": [item["email"]] if item.get("email") else [],
                    "addresses": [
                        {
                            "freeform": item["address"],
                            "locality": item["city"],
                            "district": item.get("district", ""),
                            "country": item["country_iso"],
                        }
                    ],
                    "confidence": 0.92,
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


class IndustrialV71AuditTests(unittest.TestCase):
    def test_multilingual_multiword_and_manual_sector_resolution(self):
        fr_terms = catalog.terms("FABRICANTS DE MEUBLES")
        self.assertIn("mobilya", fr_terms)
        self.assertIn("furniture", fr_terms)
        self.assertIn("meuble", fr_terms)

        en_terms = catalog.terms("Furniture Manufacturers")
        self.assertIn("mobilya", en_terms)
        self.assertIn("furniture", en_terms)

        de_terms = catalog.terms("Möbelhersteller")
        self.assertIn("mobilya", de_terms)

        fr_osm = catalog._resolve_osm_filters("FABRICANTS DE MEUBLES")
        self.assertTrue(any("furniture" in clause for clause in fr_osm))

        manual_terms = catalog.terms("çelik kapı imalatçıları")
        self.assertIn("kapi", manual_terms)
        self.assertIn("celik kapi", manual_terms)

        solar_terms = catalog.terms("güneş paneli")
        self.assertIn("solar", solar_terms)

        niche_terms = catalog.terms("hidrolik pnömatik")
        self.assertIn("hidrolik", niche_terms)
        self.assertIn("hydraulics", niche_terms)

    def test_wildcard_all_cities_portfolio_and_xlsx_international_cities(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "test_leads.sqlite3"
            store = app.Store(db_path)
            catalog.ingest(
                store,
                _make_fc(
                    [
                        {
                            "id": "ov:fr:1",
                            "name": "Atelier Meubles Paris SAS",
                            "category": "furniture",
                            "website": "https://meubles-paris.fr",
                            "phone": "+33142685500",
                            "address": "12 Rue du Faubourg, Paris",
                            "city": "Paris",
                            "district": "11e Arrondissement",
                            "country_iso": "FR",
                            "lat": 48.8566,
                            "lon": 2.3522,
                        }
                    ]
                ),
                "Paris, Fransa",
            )
            catalog.ingest(
                store,
                _make_fc(
                    [
                        {
                            "id": "ov:fr:2",
                            "name": "Lyon Design Mobilier SARL",
                            "category": "cabinet_maker",
                            "website": "https://lyon-mobilier.fr",
                            "phone": "+33612345678",
                            "address": "45 Cours Lafayette, Lyon",
                            "city": "Lyon",
                            "district": "Part-Dieu",
                            "country_iso": "FR",
                            "lat": 45.7640,
                            "lon": 4.8357,
                        }
                    ]
                ),
                "Lyon, Fransa",
            )
            catalog.ingest(
                store,
                _make_fc(
                    [
                        {
                            "id": "ov:tr:1",
                            "name": "İnegöl Mobilya Sanayi A.Ş.",
                            "category": "Mobilya İmalatı",
                            "website": "https://inegolmobilya.com.tr",
                            "phone": "+905321112233",
                            "address": "OSB Cad. No:5, İnegöl, Bursa",
                            "city": "Bursa",
                            "district": "İnegöl",
                            "country_iso": "TR",
                            "lat": 40.0781,
                            "lon": 29.5133,
                        }
                    ]
                ),
                "Bursa, Türkiye",
            )

            fr_all = catalog.portfolio_listing(
                store,
                sector="FABRICANTS DE MEUBLES",
                region="__all__, Fransa",
                limit=50,
            )
            self.assertEqual(fr_all["total"], 2)
            fr_names = {r["name"] for r in fr_all["rows"]}
            self.assertIn("Atelier Meubles Paris SAS", fr_names)
            self.assertIn("Lyon Design Mobilier SARL", fr_names)
            self.assertNotIn("İnegöl Mobilya Sanayi A.Ş.", fr_names)

            tr_all = catalog.portfolio_listing(
                store,
                sector="Mobilya",
                region="__all__, Türkiye",
                limit=50,
            )
            self.assertEqual(tr_all["total"], 1)
            self.assertEqual(tr_all["rows"][0]["name"], "İnegöl Mobilya Sanayi A.Ş.")

            out_xlsx = Path(tmp) / "fransa_mobilya.xlsx"
            export_xlsx.generate(
                store,
                out_xlsx,
                sector="FABRICANTS DE MEUBLES",
                region="__all__, Fransa",
            )
            self.assertGreater(out_xlsx.stat().st_size, 1000)
            with zipfile.ZipFile(out_xlsx, "r") as zf:
                all_xml = "\n".join(
                    zf.read(name).decode("utf-8")
                    for name in zf.namelist()
                    if name.endswith(".xml")
                )
                self.assertIn("Atelier Meubles Paris SAS", all_xml)
                self.assertIn("Lyon Design Mobilier SARL", all_xml)
                self.assertIn("Paris", all_xml)
                self.assertIn("Lyon", all_xml)
                ET.fromstring(zf.read("xl/worksheets/sheet1.xml").decode("utf-8"))

    def test_concurrent_duckdb_analytics_and_splink_thread_safety(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "concurrent_leads.sqlite3"
            store = app.Store(db_path)
            catalog.ingest(
                store,
                _make_fc(
                    [
                        {
                            "id": f"ov:tr:{i}",
                            "name": f"Test Sanayi Firma {i}",
                            "category": "Makine İmalatı",
                            "website": f"https://firma{i}.com.tr",
                            "phone": f"+90532000{i:04d}",
                            "address": "OSB, Kocaeli",
                            "city": "Kocaeli",
                            "district": "Gebze",
                            "country_iso": "TR",
                            "lat": 40.80 + i * 0.001,
                            "lon": 29.43 + i * 0.001,
                        }
                        for i in range(25)
                    ]
                ),
                "Kocaeli, Türkiye",
            )

            with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
                futs = [
                    pool.submit(industrial_engine.get_database_analytics, db_path, True)
                    for _ in range(16)
                ]
                results = [f.result() for f in futs]

            self.assertEqual(len(results), 16)
            for res in results:
                self.assertEqual(res["total_places"], 25)
                self.assertEqual(res["with_website"], 25)

            sample_records = [
                {"id": "1", "name": "Kuzey Makina Sanayi Ltd", "city": "Kocaeli", "phones": ["+902626410000"]},
                {"id": "1", "name": "Kuzey Makina San.", "city": "Kocaeli", "phones": ["+902626410000"]},
                {"id": "2", "name": "Güney Plastik A.Ş.", "city": "Bursa", "phones": ["+902242110000"]},
            ]
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
                dedup_futs = [
                    pool.submit(industrial_engine.deduplicate_records_splink, sample_records)
                    for _ in range(8)
                ]
                dedup_results = [f.result() for f in dedup_futs]
            for dres in dedup_results:
                self.assertEqual(len(dres), 3)

    def test_industrial_http_server_backlog_and_selftest(self):
        self.assertGreaterEqual(app.IndustrialHTTPServer.request_queue_size, 128)
        st = industrial_engine.get_engine_status(force_selftest=True)
        self.assertEqual(st["active_engines"], 9)
        self.assertTrue(st["selftest_verified"])
        for name, info in st["engines"].items():
            self.assertTrue(info["verified"], f"Engine {name} failed self-test: {info}")


if __name__ == "__main__":
    unittest.main()
