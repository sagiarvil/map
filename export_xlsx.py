"""Zero-N+1, single-sheet streaming XLSX exporter; formula-injection safe (V3 Pro)."""
from __future__ import annotations

import json
import tempfile
from collections import defaultdict
from pathlib import Path
from typing import Any

import catalog
import engine


def generate(
    store: Any,
    path: str | Path,
    sector: str = '',
    region: str = '',
    minimum: float = 0,
    box: Any = None,
    district: str = '',
    contact_mode: str = 'all',
) -> None:
    import xlsxwriter

    if contact_mode and contact_mode not in catalog.CONTACT_MODES:
        raise ValueError('Geçersiz iletişim filtresi')
    path = Path(path)
    where, args = catalog.condition(sector, region, minimum, box, district)

    with tempfile.TemporaryDirectory(prefix='lead_snapshot_', dir=path.parent) as tmp:
        spool = Path(tmp) / 'rows.jsonl'
        result = Path(tmp) / 'result.xlsx'
        ne = np = 1
        total = 0

        with store.db() as c, spool.open('w', encoding='utf-8') as out:
            c.execute('BEGIN')
            excluded = {r[0] for r in c.execute('SELECT email FROM suppression')}

            # Preload linked website contacts, phones, and extracted JSON-LD address metadata in bulk (0 N+1 queries).
            place_emails: dict[str, set[str]] = defaultdict(set)
            for pid, em in c.execute(
                "SELECT l.place_id, t.email FROM place_jobs l JOIN contacts t ON t.job_id = l.job_id "
                "WHERE t.mx NOT IN ('nxdomain', 'null_mx')"
            ):
                place_emails[pid].add(em)

            place_phones: dict[str, set[str]] = defaultdict(set)
            for pid, ph in c.execute(
                'SELECT l.place_id, t.phone FROM place_jobs l JOIN job_phones t ON t.job_id = l.job_id'
            ):
                place_phones[pid].add(ph)

            place_web_meta: dict[str, tuple[str, str, str]] = {}
            for pid, prov, dist, addr in c.execute(
                '''SELECT l.place_id, jm.province, jm.district, jm.address
                   FROM place_jobs l JOIN job_meta jm ON jm.job_id = l.job_id'''
            ):
                if pid not in place_web_meta and (prov or dist or addr):
                    place_web_meta[pid] = (prov, dist, addr)

            def write(
                name: str,
                cat: str,
                city: str,
                district: str,
                emails: set[str] | list[str],
                phones: set[str] | list[str],
                address: str,
                website: str = '',
            ) -> None:
                nonlocal ne, np, total
                clean_emails = sorted(set(emails) - excluded)
                clean_phones = sorted(set(phones))

                wa_num = next((p for p in clean_phones if engine.is_whatsapp_phone(p)), '')
                wa_url = engine.whatsapp_url(wa_num) if wa_num else ''
                has_wa = bool(wa_num)
                is_efat = catalog.is_efatura_company(name, clean_emails)

                first_em = next((e for e in clean_emails if '@' in e), '')
                em_dom = first_em.split('@')[1].lower() if first_em else ''
                tech = engine.detect_tech_stack(email_domain=em_dom)
                has_ent = bool(tech and tech in ('Microsoft 365', 'Google Workspace', 'Özel Kurumsal Sunucu'))
                nace_code, nace_title = catalog.resolve_nace(cat, name)

                if not catalog.contact_match(
                    bool(clean_emails),
                    bool(clean_phones),
                    contact_mode,
                    has_whatsapp=has_wa,
                    has_efatura=is_efat,
                    has_enterprise_mail=has_ent,
                ):
                    return

                ne = max(ne, len(clean_emails))
                np = max(np, len(clean_phones))
                total += 1
                if total > 1_048_575 or 8 + ne + np > 16_384:
                    raise ValueError(
                        'Tek Excel sayfası kapasitesi aşıldı. Filtreyi daraltın; hiçbir kayıt sessizce kesilmedi.'
                    )
                out.write(
                    json.dumps(
                        [
                            name,
                            cat,
                            nace_code,
                            nace_title,
                            'e-Fatura Mükellefi' if is_efat else 'Standart',
                            tech or 'Standart',
                            wa_url,
                            city,
                            district,
                            clean_emails,
                            clean_phones,
                            website,
                            address,
                        ],
                        ensure_ascii=False,
                    )
                    + '\n'
                )

            cursor = c.execute(
                '''SELECT p.*, m.province, m.district, m.emails, m.phones
                   FROM places p LEFT JOIN place_meta m ON m.place_id = p.id'''
                + where
                + ' ORDER BY p.name, p.id',
                args,
            )
            for p in cursor:
                pid = p['id']
                email = set(json.loads(p['emails'] or '[]')) | place_emails.get(pid, set())
                phone = set(json.loads(p['phones'] or '[]')) | place_phones.get(pid, set())
                w_prov, w_dist, w_addr = place_web_meta.get(pid, ('', '', ''))
                city = (
                    p['province']
                    or catalog.province_of(w_prov)
                    or catalog.province_of(p['region'].split(',')[0])
                    or p['region'].split(',')[0].strip()
                )
                district = p['district'] or w_dist or ''
                address = p['address'] or w_addr or ''
                write(
                    p['name'],
                    p['category'].replace('_', ' '),
                    city,
                    district,
                    email,
                    phone,
                    address,
                    website=p['website'] or '',
                )

            if not minimum and not box:
                sql = 'SELECT j.*, jm.province AS w_prov, jm.district AS w_dist, jm.address AS w_addr FROM jobs j LEFT JOIN job_meta jm ON jm.job_id = j.id WHERE NOT EXISTS(SELECT 1 FROM place_jobs l WHERE l.job_id = j.id)'
                params: list[Any] = []
                if sector:
                    sql += ' AND j.sector=?'
                    params.append(sector)
                is_wild_reg, wild_country = catalog.is_wildcard_region(region)
                if is_wild_reg:
                    sql += ' AND j.region LIKE ?'
                    params.append(f'%, {wild_country}')
                elif region:
                    sql += ' AND j.region=?'
                    params.append(region)

                standalone = c.execute(sql + ' ORDER BY j.id', params).fetchall()
                if standalone:
                    job_emails: dict[int, list[str]] = defaultdict(list)
                    for jid, em in c.execute(
                        'SELECT job_id, email FROM contacts WHERE NOT EXISTS(SELECT 1 FROM place_jobs l WHERE l.job_id = contacts.job_id)'
                    ):
                        job_emails[jid].append(em)
                    job_phones: dict[int, list[str]] = defaultdict(list)
                    for jid, ph in c.execute(
                        'SELECT job_id, phone FROM job_phones WHERE NOT EXISTS(SELECT 1 FROM place_jobs l WHERE l.job_id = job_phones.job_id)'
                    ):
                        job_phones[jid].append(ph)
                    d_fold = catalog.fold(district) if district else ''
                    for j in standalone:
                        jid = j['id']
                        w_dist = j['w_dist'] or ''
                        if d_fold and d_fold not in catalog.fold(w_dist + ' ' + (j['w_addr'] or '')):
                            continue
                        city = (
                            catalog.province_of(j['w_prov'] or '')
                            or catalog.province_of(j['region'].split(',')[0])
                            or j['region'].split(',')[0].strip()
                        )
                        write(
                            j['title'] or j['domain'],
                            j['sector'],
                            city,
                            w_dist,
                            job_emails.get(jid, []),
                            job_phones.get(jid, []),
                            j['w_addr'] or '',
                            website=j['url'],
                        )

        with xlsxwriter.Workbook(
            str(result),
            {
                'constant_memory': True,
                'strings_to_formulas': False,
                'strings_to_urls': False,
                'strings_to_numbers': False,
            },
        ) as wb:
            ws = wb.add_worksheet('Firmalar')
            head = wb.add_format({'bold': True, 'bg_color': '#183D62', 'font_color': '#FFFFFF', 'valign': 'vcenter'})
            body = wb.add_format({'valign': 'top', 'num_format': '@'})
            headers = (
                [
                    'Firma adı',
                    'Sektör',
                    'NACE Kodu',
                    'NACE Faaliyet Tanımı',
                    'Kurumsal Düzey',
                    'Mail / Altyapı',
                    'WhatsApp Linki',
                    'İl',
                    'İlçe',
                ]
                + [f'E-posta {i}' for i in range(1, ne + 1)]
                + [f'Telefon {i}' for i in range(1, np + 1)]
                + ['Web sitesi', 'Adres']
            )
            ws.write_row(0, 0, headers, head)
            ws.set_row(0, 28)
            ws.freeze_panes(1, 4)
            ws.hide_gridlines(2)
            ws.autofilter(0, 0, total, len(headers) - 1)
            widths = [36, 24, 14, 38, 22, 22, 34, 16, 18] + [34] * ne + [22] * np + [34, 60]
            for i, w_col in enumerate(widths):
                ws.set_column(i, i, w_col, body)
            wb.set_properties({
                'title': 'İşletme portföyü',
                'comments': (
                    'Overture Maps / Places & OpenStreetMap (ODbL); '
                    'https://docs.overturemaps.org/attribution/ ; '
                    'bağımsız izinli web siteleri. Site iletişimleri merkez düzeyinde olabilir.'
                ),
            })
            ws.set_footer('&LOverture Maps / Places & OpenStreetMap — docs.overturemaps.org/attribution/')
            with spool.open(encoding='utf-8') as inp:
                for i, line in enumerate(inp, 1):
                    (
                        name,
                        cat,
                        nace_code,
                        nace_title,
                        efat,
                        tech,
                        wa_url,
                        city,
                        district,
                        emails_l,
                        phones_l,
                        site,
                        address,
                    ) = json.loads(line)
                    row = (
                        [name, cat, nace_code, nace_title, efat, tech, wa_url, city, district]
                        + emails_l
                        + [''] * (ne - len(emails_l))
                        + phones_l
                        + [''] * (np - len(phones_l))
                        + [site, address]
                    )
                    for j, value in enumerate(row):
                        if value:
                            ws.write_string(i, j, value[:32767], body)
        result.replace(path)
