"""Purify province/district boundaries (via 5-digit TR postcodes, plate codes & official district tables) and clean raw Overture address artifacts."""
from __future__ import annotations

import re
import sqlite3
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import catalog  # noqa: E402

POSTCODE_RE = re.compile(r'\b(0[1-9]|[1-7][0-9]|8[01])\d{3}\b')
ISO_NUM_RE = re.compile(r',\s*(0[1-9]|[1-7][0-9]|8[01])\s*,')
CORRUPT_TAIL_RE = re.compile(r'\b(?:manmaraş|amonu|kale|hisar)\s*,', re.I)
COUNTRY_TAIL_RE = re.compile(r'(?:,\s*TR\b|\s+TR\s*$)', re.I)


def clean_address_str(addr: str) -> str:
    if not addr:
        return ''
    # Keep only the primary address variant if '; ' duplicated variants exist
    s = addr.split('; ')[0].strip()
    s = ISO_NUM_RE.sub(',', s)
    s = CORRUPT_TAIL_RE.sub(',', s)
    s = COUNTRY_TAIL_RE.sub('', s)
    s = re.sub(r'\s*,\s*,+', ', ', s)
    s = re.sub(r'\s{2,}', ' ', s).strip(' ,;-')
    return s


def resolve_true_province(current_prov: str, district: str, addr: str) -> str:
    # 1. Unambiguous official district lookup (e.g. Efeler -> Aydın, Yunusemre -> Manisa, Gebze -> Kocaeli)
    if district:
        fd = catalog.fold(district)
        if fd in catalog.UNIQUE_DISTRICT_PROVINCE:
            return catalog.UNIQUE_DISTRICT_PROVINCE[fd]

    # 2. 5-digit Turkish postal code in address (first 2 digits = 01..81 official province plate!)
    m_pc = POSTCODE_RE.search(addr)
    if m_pc:
        plate = int(m_pc.group(1))
        if 1 <= plate <= 81:
            return catalog.PROVINCES[plate - 1]

    # 3. Bare 2-digit ISO province code in raw address (e.g. ', 09,')
    m_iso = ISO_NUM_RE.search(addr)
    if m_iso:
        plate = int(m_iso.group(1))
        if 1 <= plate <= 81:
            return catalog.PROVINCES[plate - 1]

    return current_prov


def main() -> None:
    t0 = time.monotonic()
    db_path = ROOT / 'data' / 'leads.sqlite3'
    conn = sqlite3.connect(db_path, timeout=60.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA synchronous=NORMAL')

        cur = conn.execute(
            '''SELECT p.id, p.region, p.address, m.province, m.district
               FROM places p LEFT JOIN place_meta m ON m.place_id = p.id'''
        )
        place_updates: list[tuple[str, str, str]] = []
        meta_updates: list[tuple[str, str]] = []
        moved = 0
        cleaned_addrs = 0

        for r in cur:
            pid = r['id']
            old_reg = r['region'] or ''
            old_addr = r['address'] or ''
            old_prov = r['province'] or catalog.province_of(old_reg.split(',')[0])
            dist = r['district'] or ''

            true_prov = resolve_true_province(old_prov, dist, old_addr)
            new_reg = f'{true_prov}, Türkiye' if true_prov else old_reg
            new_addr = clean_address_str(old_addr)

            if new_reg != old_reg or new_addr != old_addr:
                place_updates.append((new_reg, new_addr, pid))
                if new_reg != old_reg:
                    moved += 1
                if new_addr != old_addr:
                    cleaned_addrs += 1

            if true_prov and true_prov != (r['province'] or ''):
                meta_updates.append((true_prov, pid))

        with conn:
            if place_updates:
                conn.executemany('UPDATE places SET region=?, address=? WHERE id=?', place_updates)
            if meta_updates:
                conn.executemany('UPDATE place_meta SET province=? WHERE place_id=?', meta_updates)

        print(
            f'Tamamlandı ({time.monotonic() - t0:.1f}s): '
            f'{moved:,} sınır komşusu firma gerçek iline taşındı, '
            f'{cleaned_addrs:,} adres metni temizlendi.',
            flush=True,
        )
        for reg, cnt in conn.execute('SELECT region, count(*) FROM places GROUP BY region ORDER BY count(*) DESC LIMIT 16'):
            print(f'  {reg:<20}: {cnt:>8,}')
    finally:
        conn.close()


if __name__ == '__main__':
    main()
