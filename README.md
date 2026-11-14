# Lead Intelligence Pro V3 — Industrial Geospatial & Async B2B Engine

Türkçe endüstriyel B2B işletme keşif ve kurumsal iletişim madenciliği platformu. C++ **PyArrow S3 GeoParquet** kolonar veri akışı, **OpenStreetMap (ODbL)** tekilleştirilmiş füzyonu, **SQLite FTS5** Türkçe morfolojik sektör indeksi ve **Asyncio HTTP/2** yüksek eşzamanlılıklı izinli web tarama motoru üzerinde çalışır.

## V3 Pro Endüstriyel Yetenekler

- **Sınırsız İl & Sanayi Kümesi Kapsamı:** Eski dar şehir merkezi kutuları yerine 81 il tam sınırı ve sanayi kümeleri (ör. İzmir'de Karabağlar, Kısıkköy Mobilya Şehri, Torbalı, Kemalpaşa OSB, Menderes İTOB dahil 30 ilçenin tamamı). Büyük bölgeler otomatik **Quadtree** dilimlerine bölünerek tek akışta indirilir.
- **C++ PyArrow S3 GeoParquet + OpenStreetMap Füzyonu:** 64 MB GeoJSON darboğazı kaldırıldı; Overture S3 verisi doğrudan kolonar olarak çekilir ve OpenStreetMap Overpass verisiyle mesafe + domain bazında tekilleştirilerek birleştirilir.
- **SQLite FTS5 + 120+ Türkçe B2B Sektör Taksonomisi:** Türkçe ek almış firma adlarını (`Mobilyacılık`, `Koltuk`, `Marangoz`, `Ahşap` vb.) ve İngilizce Overture/OSM kategorilerini milisaniyeler içinde eşleştirir; serbest metin adreslerden **İl / İlçe** bilgisini otomatik ayrıştırır.
- **Async HTTP/2 + Uyumayan Domain Zamanlayıcı (64–256 Korutin):** `httpx[http2]` bağlantı havuzu, `gzip/deflate` sıkıştırma, `dnspython` bellek-içi önbellekli asenkron MX doğrulaması (`dig` alt süreç maliyeti olmadan) ve toplu SQLite yazımı (`flush_outcomes`).
- **Yüksek Yakalama Oranlı (High-Recall) Çıkarıcı:** `Schema.org` (`application/ld+json`) yapısal veri madenciliği, görünür metin Türkiye telefon numaraları (faks filtreli), kurumsal WhatsApp (`wa.me`) hatları, Cloudflare `data-cfemail` çözümü, `/kvkk` & `/kunye` & `/subeler` öncelikli taraması ve 120+ departman/marka e-posta deseni.
- **Sıfır N+1 Sorgulu Sabit Bellekli Excel (.xlsx):** Tek `Firmalar` sayfası (`Firma adı, Sektör, İl, İlçe, E-posta 1..N, Telefon 1..N, Adres`), formül enjeksiyonu korumalı.

## Kurulum ve Çalıştırma (macOS / Linux)

Python 3.11+ gerekir:

```sh
bash setup.command
```

Sonraki başlatmalar (varsayılan 64 asenkron korutin; 256'ya kadar artırılabilir):

```sh
bash start.command --workers 128
```

Panel: `http://127.0.0.1:8765`

## Doğrulama ve Kalite Kapıları

```sh
.venv/bin/python -m unittest discover -s tests -v
node --check static/app.js
```

## Güvenlik ve Veri Etiği

- Google Maps üzerinde otomatik kazıma yapılmaz; yalnızca resmi araştırma bağlantıları üretilir.
- Web sitesi taramalarında `robots.txt` kuralları, SSRF özel ağ koruması, HTTPS düşürme engeli ve CAPTCHA/403/429 erişim sınırları katı biçimde uygulanır.
- Veri atfı: [Overture Maps Attribution](https://docs.overturemaps.org/attribution/) & OpenStreetMap katkıcıları (ODbL).
