# Lead Intelligence Pro V3 — Industrial Geospatial & Cloud/Local Hybrid B2B Engine

Türkçe endüstriyel B2B işletme keşif ve kurumsal iletişim madenciliği platformu. Hem doğrudan bulut üzerinde (**https://haritalar.web.app/**) hem de yerel **128-Korutin Async HTTP/2 Turbo Köprüsü** (`http://127.0.0.1:8765`) ile çift motorlu (Dual-Engine) çalışır.

## Çift Motorlu (Dual-Engine) Mimari

1. **Bulut & CDN Web Uygulaması (`https://haritalar.web.app/`):**
   - Sunucu kurulumu gerektirmeden tüm bilgisayar, tablet ve telefonlarda doğrudan tarayıcıda çalışır.
   - Sıkıştırılmış CDN il veri paketleri (`/data/*.json`), 81 il + uluslararası canlı OpenStreetMap Nominatim/Overpass keşfi, 120+ Türkçe B2B sektör taksonomisi, ilçe ve iletişim filtreleri (`Tüm Firmalar`, `E-postası Olanlar`, `Telefonu Olanlar`, `E-posta + Telefon`, `Sadece E-posta`, `Sadece Telefon`).
   - Tarayıcı-içi Google DNS-over-HTTPS (`dns.google`) canlı MX doğrulaması ve sıfır bağımlılıklı saf JavaScript OOXML tek sayfa `Firmalar` **Excel (`.xlsx`)** üreteci (`hosting/xlsx-engine.js`).
2. **Yerel Mac Turbo Köprüsü (`127.0.0.1:8765` — Private Network Access):**
   - Mac üzerinde arka planda çalışan `LaunchAgent` servisi açık olduğunda `https://haritalar.web.app/` otomatik olarak yerel motora bağlanır.
   - **C++ PyArrow S3 GeoParquet** tam il kolonar veri akışı + **128 Eşzamanlı HTTP/2 Korutin** ile kurumsal web sitelerinin `/iletisim`, `/kvkk`, `Schema.org JSON-LD`, `data-cfemail` ve görünür telefon/e-posta kayıtlarını canlı tarar.

## Kurulum ve Arka Plan Servisi (macOS / Linux)

```sh
bash setup.command
bash install-mac-service.command   # macOS LaunchAgent (128 korutin, haritalar.web.app köprüsü)
```

Manuel başlatma:

```sh
bash start.command --workers 128
```

Firebase Hosting (`https://haritalar.web.app`) dağıtımı:

```sh
bash deploy-firebase.command
```

## Doğrulama ve 4 Kalite Kapısı

```sh
.venv/bin/python -m unittest discover -s tests -v
node --check static/app.js
node --check hosting/app.js
node --check hosting/xlsx-engine.js
```

## Güvenlik ve Veri Etiği

- Google Maps üzerinde otomatik kazıma yapılmaz; yalnızca resmi araştırma bağlantıları üretilir.
- Web sitesi taramalarında `robots.txt` kuralları, SSRF özel ağ koruması, HTTPS düşürme engeli ve CAPTCHA/403/429 erişim sınırları katı biçimde uygulanır.
- Veri atfı: [Overture Maps Attribution](https://docs.overturemaps.org/attribution/) & OpenStreetMap katkıcıları (ODbL).
