# Lead Intelligence Pro V6 — 9-Engine Pure C / C++ / Rust Industrial B2B Stack

Yüksek hacimli, tekilleştirilmiş ve doğrulanmış B2B işletme keşif & kurumsal iletişim istihbaratı platformu. Hem bulut kenar ağında (**https://haritalar.web.app/**) hem de yerel **128-Korutin Async HTTP/2 + 9 Endüstriyel C/C++/Rust Motoru** (`http://127.0.0.1:8765`) ile çift motorlu (Dual-Engine) çalışır.

## V6 Pro 9-Motorlu Endüstriyel Mimari

1. **DuckDB Spatial v2.0:** C++ vektörize bellek-içi OLAP analitik motoru (`1.02M+` kayıt üzerinde anlık istatistik + 60s TTL önbellek).
2. **Overture Maps v2.1 + PyArrow v26:** AWS S3 GeoParquet veri kümelerinden sıfır-kopya (zero-copy) sütunsal POI akışı.
3. **Splink v5.0:** DuckDB üzerinde kalibre edilmiş Fellegi-Sunter Bayesyen şube ve mükerrer işletme tekilleştirme.
4. **RapidFuzz v3.14:** C++ SIMD `WRatio` & `token_set_ratio` ile bulanık kurumsal ünvan ve sektör sıralama.
5. **Uber H3 v4.5:** Altıgen (Hexagonal Res-7) mekansal indeksleme ile OSB, sanayi sitesi ve ticaret yoğunluk radarı.
6. **Selectolax v1.0 (`Lexbor` C HTML5) + Trafilatura v2.3:** Işık hızında kurumsal DOM, JSON-LD ve temiz metin/metadata çıkarımı.
7. **`curl_cffi` v0.17 + `httpx[http2]`:** Yerel C `libcurl` HTTP/2 istemcisi (`robots.txt` ve SSRF korumalı).
8. **Google `phonenumbers` v9.0 (`libphonenumber`):** ITU-T E.164 onarım, mobil/sabit hat ayrımı ve WhatsApp uygunluk doğrulaması.
9. **`orjson` v3.13 + `email-validator` v2.4 + `dnspython` v2.9:** Rust SIMD JSON serileştirme, RFC 5322 IDNA e-posta hijyeni ve canlı MX/SPF/DMARC posta altyapı tespiti.

## Kurulum ve Arka Plan Servisi (macOS / Linux)

```sh
bash setup.command
bash install-mac-service.command   # macOS LaunchAgent (127.0.0.1:8765)
```

Firebase Hosting CDN dağıtımı (`https://haritalar.web.app`):

```sh
bash deploy-firebase.command
```

## Doğrulama ve 4 Kalite Kapısı

```sh
.venv/bin/python -m py_compile app.py catalog.py engine.py export_xlsx.py industrial_engine.py
node --check hosting/app.js && node --check hosting/xlsx-engine.js
.venv/bin/python -m unittest discover -s tests -v
```
