# Lead Intelligence Pro V4 — Industrial Geospatial, C99 Lexbor & Cloud/Local Hybrid B2B Engine

Yüksek hacimli, tekilleştirilmiş ve doğrulanmış B2B işletme keşif & kurumsal iletişim madenciliği platformu. Hem bulut kenar ağında (**https://haritalar.web.app/**) hem de yerel **128-Korutin Async HTTP/2 + C99 Lexbor Turbo Köprüsü** (`http://127.0.0.1:8765`) ile çift motorlu (Dual-Engine) çalışır.

## V4 Mimari Yetenekler

1. **Bulut & Edge CDN Motoru (`https://haritalar.web.app/`):**
   - Türkiye'nin önde gelen sanayi ve ticaret merkezleri (İstanbul, Ankara, İzmir, Bursa, Kayseri, Konya, Kocaeli, Gaziantep, Antalya, Adana, Denizli, Manisa) için sözlük-kodlu (`v4` tuple) hazır CDN veri paketleri ve `O(1)` kategori bitmask tarayıcısı (<5ms filtreleme).
   - 81 il + uluslararası şehirler için canlı OpenStreetMap Nominatim/Overpass keşfi, 120+ Türkçe B2B sektör taksonomisi, ilçe ve 6'lı iletişim filtresi (`Tüm Firmalar`, `E-postası Olanlar`, `Telefonu Olanlar`, `E-posta + Telefon`, `Sadece E-posta`, `Sadece Telefon`).
   - Tarayıcı-içi Google DNS-over-HTTPS (`dns.google`) canlı MX doğrulaması ve sıfır bağımlılıklı saf JavaScript OOXML tek sayfa `Firmalar` **Excel (`.xlsx`)** üreteci (`hosting/xlsx-engine.js`).
2. **Yerel Mac Turbo Köprüsü (`127.0.0.1:8765` — Private Network Access):**
   - **C99 `selectolax` (`Lexbor`) HTML5 Ayrıştırıcı:** Standart Python ayrıştırıcısına göre 15–30x hızlı DOM analizi; `Schema.org JSON-LD`, Next.js/Nuxt (`__NEXT_DATA__`, `__NUXT_DATA__`, RSC `self.__next_f.push`), OpenGraph iletişim etiketleri ve Cloudflare `data-cfemail` çözümü.
   - **Veri Hijyeni ve Mekansal Tekilleştirme:** ~55m yarıçapta mükerrer harita pinlerini ve ortak telefon+marka kayıtlarını birleştirir (`deduplicate_region`), kapanmış (`closed` / `temporarily_closed`) işletmeleri, sahte tekrarlı telefonları (`0000000`, `5555555`), ölü MX (`nxdomain`, `null_mx`) ve webfont/tracker (`sentry.io`, `wixpress.com`, `latofonts.com`) e-postalarını eler.

## Kurulum ve Arka Plan Servisi (macOS / Linux)

```sh
bash setup.command
bash install-mac-service.command   # macOS LaunchAgent (128 korutin, haritalar.web.app köprüsü)
```

Çoklu sanayi merkezi senkronizasyonu ve Firebase CDN dağıtımı:

```sh
.venv/bin/python scripts/sync_industrial_hubs.py
bash deploy-firebase.command
```

## Doğrulama ve 4 Kalite Kapısı

```sh
.venv/bin/python -m unittest discover -s tests -v
node --check static/app.js && node --check hosting/app.js && node --check hosting/xlsx-engine.js
```

## Güvenlik ve Veri Etiği

- Google Maps üzerinde otomatik kazıma yapılmaz; yalnızca resmi araştırma bağlantıları üretilir.
- Web sitesi taramalarında `robots.txt` kuralları, SSRF özel ağ koruması, HTTPS düşürme engeli ve CAPTCHA/403/429 erişim sınırları katı biçimde uygulanır.
- Veri atfı: [Overture Maps Attribution](https://docs.overturemaps.org/attribution/) & OpenStreetMap katkıcıları (ODbL).
