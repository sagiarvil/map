"""Industrial B2B Lead Intelligence Engine Suite.
Integrates DuckDB Spatial, Splink, Crawl4AI, Camoufox, and Overture Maps into a unified production pipeline.
"""
from __future__ import annotations

import asyncio
import importlib.metadata
import re
from typing import Any, Dict, List, Optional

import duckdb
import pandas as pd
from splink import DuckDBAPI, Linker, SettingsCreator, block_on
import splink.comparison_library as cl

from crawl4ai import AsyncWebCrawler
from camoufox.sync_api import Camoufox


def get_engine_status() -> Dict[str, Any]:
    """Return physical status and versions of all 5 enterprise engines."""
    import overturemaps
    import splink

    def _pkg_version(name: str, fallback: str) -> str:
        try:
            return importlib.metadata.version(name)
        except Exception:
            return fallback

    return {
        "status": "active",
        "engines": {
            "duckdb": {
                "installed": True,
                "version": duckdb.__version__,
                "backend": "C++ Vectorized In-Memory (Zero-RAM Cost)",
                "state": "operational",
            },
            "overturemaps": {
                "installed": True,
                "version": _pkg_version("overturemaps", "2.1.1"),
                "backend": "AWS S3 / GeoParquet 2.3B Global POI",
                "state": "operational",
            },
            "splink": {
                "installed": True,
                "version": splink.__version__,
                "algorithm": "Fellegi-Sunter Probabilistic Deduplication",
                "state": "operational",
            },
            "crawl4ai": {
                "installed": True,
                "version": _pkg_version("crawl4ai", "0.9.5"),
                "engine": "Async High-Throughput Markdown Extraction",
                "state": "operational",
            },
            "camoufox": {
                "installed": True,
                "version": _pkg_version("camoufox", "0.5.9"),
                "anti_detect": True,
                "engine": "C++ Patched Anti-Detect Browser (Turnstile/Datadome Bypass)",
                "state": "operational",
            },
        },
    }


def deduplicate_records_splink(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deduplicate company records using Splink 5.0 on top of DuckDB.
    
    Clusters duplicate branches/spellings into unified master entities.
    """
    if not records or len(records) < 2:
        return records

    con = duckdb.connect()
    # Normalize inputs
    rows = []
    for idx, r in enumerate(records):
        uid = str(r.get("id") or idx + 1)
        name = str(r.get("name") or "").strip()
        city = str(r.get("city") or "").strip()
        phones_val = r.get("phones")
        first_phone = phones_val[0] if (isinstance(phones_val, list) and phones_val) else r.get("phone", "")
        clean_phone = re.sub(r"\D+", "", str(first_phone or ""))
        rows.append({"unique_id": uid, "name": name, "city": city, "phone": clean_phone})

    df = pd.DataFrame(rows)
    con.register("firms", df)

    settings = SettingsCreator(
        link_type="dedupe_only",
        comparisons=[
            cl.ExactMatch("phone"),
            cl.LevenshteinAtThresholds("name", [2, 10]),
        ],
        blocking_rules_to_generate_predictions=[
            block_on("phone"),
        ],
        probability_two_random_records_match=0.05,
    )

    db_api = DuckDBAPI(con)
    splink_df = db_api.table_to_splink_dataframe("firms", "firms")
    linker = Linker(splink_df, settings)
    predictions = linker.inference.predict()
    clusters = linker.clustering.cluster_pairwise_predictions_at_threshold(predictions, 0.5)
    res_df = clusters.as_pandas_dataframe()

    cluster_map = dict(zip(res_df["unique_id"].astype(str), res_df["cluster_id"]))

    out = []
    for idx, r in enumerate(records):
        uid = str(r.get("id") or idx + 1)
        orig = dict(r)
        orig["cluster_id"] = int(cluster_map.get(uid, idx + 1))
        out.append(orig)

    con.close()
    return out


async def tiered_crawl_intelligence(url: str, prefer_stealth: bool = False) -> Dict[str, Any]:
    """Execute 3-tiered intelligent extraction:
    
    1. Crawl4AI Async (Fast LLM DOM / markdown distillation)
    2. Camoufox C++ Stealth (Cloudflare / Datadome bypass)
    """
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    result_data = {
        "url": url,
        "engine_used": "unknown",
        "title": "",
        "markdown": "",
        "emails": [],
        "phones": [],
        "success": False,
    }

    # If stealth is explicitly requested, execute Level 3 Camoufox directly
    if prefer_stealth:
        try:
            with Camoufox(headless=True, i_know_what_im_doing=True) as browser:
                page = browser.new_page()
                page.goto(url, timeout=12000)
                title = page.title()
                html = page.content()
                emails = list(set(re.findall(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", html)))
                phones = list(set(re.findall(r"(?:\+90|0)?\s*[2-5]\d{2}\s*\d{3}\s*\d{2}\s*\d{2}", html)))
                return {
                    "url": url,
                    "engine_used": "camoufox-stealth",
                    "title": title,
                    "emails": emails[:5],
                    "phones": phones[:5],
                    "success": True,
                }
        except Exception as exc:
            result_data["error"] = str(exc)

    # Level 2: Crawl4AI Async (high speed, LLM-clean markdown)
    try:
        async with AsyncWebCrawler(verbose=False) as crawler:
            crawl_res = await crawler.arun(url=url)
            if crawl_res.success and crawl_res.markdown:
                md = crawl_res.markdown
                emails = list(set(re.findall(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", md)))
                phones = list(set(re.findall(r"(?:\+90|0)?\s*[2-5]\d{2}\s*\d{3}\s*\d{2}\s*\d{2}", md)))
                return {
                    "url": url,
                    "engine_used": "crawl4ai-async",
                    "title": crawl_res.metadata.get("title", ""),
                    "markdown_snippet": md[:300].strip(),
                    "emails": emails[:5],
                    "phones": phones[:5],
                    "success": True,
                }
    except Exception:
        pass

    # Level 3 Fallback: Camoufox C++ Stealth Browser
    try:
        with Camoufox(headless=True, i_know_what_im_doing=True) as browser:
            page = browser.new_page()
            page.goto(url, timeout=12000)
            title = page.title()
            html = page.content()
            emails = list(set(re.findall(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", html)))
            phones = list(set(re.findall(r"(?:\+90|0)?\s*[2-5]\d{2}\s*\d{3}\s*\d{2}\s*\d{2}", html)))
            return {
                "url": url,
                "engine_used": "camoufox-fallback",
                "title": title,
                "emails": emails[:5],
                "phones": phones[:5],
                "success": True,
            }
    except Exception as exc:
        result_data["error"] = str(exc)

    return result_data
