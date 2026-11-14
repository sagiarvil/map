# Lead Intelligence Pro V2 — Geospatial Intelligence

**Depo durumu:** İlk kaynak aktarımı kısmi; tam uygulama paketi yerel ZIP teslimindedir. Bu depo tek başına henüz çalıştırılabilir değildir.

## Tasarım
- Google Maps: resmi araştırma bağlantıları, otomatik Maps veri kazıma yok.
- Overture Places: açık lisanslı coğrafi işletme keşfi, bölge/sector filtresi.
- Bağımsız izinli web siteleri: rol temelli yayımlanmış iş e-postaları ve telefonlar.
- Yerel SQLite kuyruğu, DNS/MX kontrolü, yeniden başlatma ve ret listesi.
- Tek XLSX, tek Firmalar sayfası: Firma adı, Sektör, İl, İlçe, E-posta 1..N, Telefon 1..N, Adres.
- Kaynakta eksik bilgiler boş kalır. MX adres kutusunun çalıştığını kanıtlamaz.

## Gerçek upstream kaynakları
- https://github.com/OvertureMaps/overturemaps-py — MIT; resmi veri indirme CLI.
- https://github.com/jmcnamara/XlsxWriter — BSD-2-Clause; XLSX üretimi.
- https://github.com/scrapy/scrapy — BSD-3-Clause; değerlendirilen alternatif, V2 bağımlılığı değil.
- Veri atfı: https://docs.overturemaps.org/attribution/

## Tam paket aktarıldıktan sonra
Python 3.11+ ile `bash setup.command`; daha sonra `bash start.command`.
Test: `python -m unittest discover -s tests -v`.
Yerel teslimde 47 fixture ve HTTP entegrasyon testi geçti; canlı veri/milyon kayıt kapasitesi ve macOS saha testi henüz doğrulanmadı.
Yerel veritabanı, müşteri çıktıları, sırlar ve sanal ortam Git'e eklenmemelidir.
