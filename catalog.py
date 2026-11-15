"""Industrial open-data geospatial catalog (V3 Pro): Overture GeoParquet + OpenStreetMap Fusion.

No automated access to Google Maps. Uses:
1. Direct C++ PyArrow columnar streaming from Overture Maps S3 GeoParquet (zero 64MB GeoJSON cap,
   automatic Quadtree bbox tiling for full provinces/regions).
2. Optional parallel OpenStreetMap Overpass API discovery with spatial + domain entity fusion.
3. SQLite FTS5 external-content full-text + Turkish morphological prefix indexing (<5ms search
   across 500k+ establishments) and 120+ Turkish B2B sector taxonomy mappings.
"""
from __future__ import annotations

import concurrent.futures
import heapq
import json
import math
import re
import shutil
import sqlite3
import struct
import subprocess
import sys
import tempfile
import threading
import time
import unicodedata
from pathlib import Path
from typing import Any

from engine import (
    BAD_EMAIL_DOMAINS,
    BAD_EMAIL_TLDS,
    EMAIL,
    ROLE,
    ScanError,
    detect_tech_stack,
    domain_key,
    is_whatsapp_phone,
    normalize,
    now,
    phone_normalize,
    whatsapp_url,
)

try:
    import orjson as _fast_json
    def _loads_list(raw: str | None) -> list[str]:
        return _fast_json.loads(raw) if (raw and raw != '[]') else []
except ImportError:  # pragma: no cover
    def _loads_list(raw: str | None) -> list[str]:
        return json.loads(raw) if (raw and raw != '[]') else []

try:
    import httpx
    HAS_HTTPX = True
except ImportError:  # pragma: no cover
    httpx = None  # type: ignore[assignment]
    HAS_HTTPX = False

try:
    from overturemaps import core as overture_core
    HAS_OVERTURE_CORE = True
except ImportError:  # pragma: no cover
    overture_core = None  # type: ignore[assignment]
    HAS_OVERTURE_CORE = False

MAX_BYTES = 128 * 1024 * 1024
MAX_FEATURES = 500_000
SOURCE = 'Overture Maps / Places'
OSM_SOURCE = 'OpenStreetMap (ODbL)'

OVERPASS_ENDPOINTS = (
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
)


def _check_fts5() -> bool:
    try:
        con = sqlite3.connect(':memory:')
        con.execute("CREATE VIRTUAL TABLE t USING fts5(x, tokenize='unicode61')")
        con.close()
        return True
    except sqlite3.OperationalError:
        return False


HAS_FTS5 = _check_fts5()

SCHEMA_BASE = '''
CREATE TABLE IF NOT EXISTS places(
 id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, search_text TEXT NOT NULL,
 region TEXT NOT NULL, address TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
 website TEXT NOT NULL, confidence REAL, operating TEXT NOT NULL, source TEXT NOT NULL,
 imported TEXT NOT NULL, provenance TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS places_region ON places(region);
CREATE INDEX IF NOT EXISTS places_region_conf ON places(region, confidence DESC);
CREATE INDEX IF NOT EXISTS places_domain ON places(website);
CREATE INDEX IF NOT EXISTS places_lon_lat ON places(lon, lat);
CREATE TABLE IF NOT EXISTS place_jobs(
 place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
 job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 PRIMARY KEY(place_id, job_id));
CREATE INDEX IF NOT EXISTS place_jobs_job ON place_jobs(job_id);
CREATE TABLE IF NOT EXISTS place_meta(
 place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
 province TEXT NOT NULL, district TEXT NOT NULL, emails TEXT NOT NULL, phones TEXT NOT NULL);
'''

SCHEMA_FTS = '''
CREATE VIRTUAL TABLE IF NOT EXISTS places_fts USING fts5(
 search_text, content='places', content_rowid='rowid', tokenize='unicode61');
CREATE TRIGGER IF NOT EXISTS places_ai AFTER INSERT ON places BEGIN
 INSERT INTO places_fts(rowid, search_text) VALUES (new.rowid, new.search_text);
END;
CREATE TRIGGER IF NOT EXISTS places_ad AFTER DELETE ON places BEGIN
 INSERT INTO places_fts(places_fts, rowid, search_text) VALUES('delete', old.rowid, old.search_text);
END;
CREATE TRIGGER IF NOT EXISTS places_au AFTER UPDATE OF search_text ON places BEGIN
 INSERT INTO places_fts(places_fts, rowid, search_text) VALUES('delete', old.rowid, old.search_text);
 INSERT INTO places_fts(rowid, search_text) VALUES (new.rowid, new.search_text);
END;
'''

SCHEMA = SCHEMA_BASE + (SCHEMA_FTS if HAS_FTS5 else '')

# Expanded 120+ Turkish B2B & industrial sector taxonomy mapped to Overture & OSM categories.
ALIASES: dict[str, str] = {
    'mobilya': (
        'furniture store|furniture manufacturer|furniture wholesaler|furniture maker|'
        'furniture assembly|furniture repair|furniture|office furniture store|'
        'children furniture store|bedroom furniture store|outdoor furniture store|'
        'mattress store|sofa store|bedding store|cabinet maker|cabinetry|carpenter|'
        'woodworking|millwork|joiner|upholstery service|upholsterer|'
        'interior decor|home decor|kitchen furniture|meuble|meubles|mobilier|'
        'ameublement|menuiserie|ebenisterie|literie|canape|moebel|mobel|einrichtung|'
        'tischlerei|schreinerei|polster|mobili|arredamento|arredamenti|falegnameria|'
        'muebles|mobiliario|carpinteria|ebanisteria|meubel|meubelen|interieur|'
        'mebel|mobila|koltuk|kanepe|yatak|baza|sandalye|'
        'gardrop|vestiyer|marangoz|doseme|döşeme|buro mobilya|ofis mobilya|ahsap mobilya|mutfak dolabi'
    ),
    'mutfak': (
        'kitchen furniture|kitchen remodeler|kitchen supply store|kitchen and bath|'
        'cabinet maker|cabinetry|countertop store|countertop installer|mutfak dolabi|'
        'cuisine|cuisiniste|kueche|kuche|keuken|cucine|cocinas|cocina|'
        'ankastre|mutfak tasarim|endustriyel mutfak|commercial kitchen equipment'
    ),
    'banyo': 'bathroom remodeler|bathroom supply store|plumbing supply store|ceramic|salle de bain|sanitair|badkamer|badezimmer|bagno|baño|seramik|vitrifiye|dusakabin',
    'ahşap': 'carpenter|woodworking|lumber store|sawmill|timber|millwork|cabinet maker|menuiserie|bois|charpente|holz|schreinerei|legno|falegnameria|madera|hout|marangoz|kereste|parke|kaplama',
    'dekorasyon': 'interior design|interior designer|interior decor|home decor|decoration|rideaux|tapis|luminaire|inneneinrichtung|raumausstattung|arredamento|decoracion|interieur|painter|wallpaper|curtain|perde|hali|carpet store|lighting store|aydinlatma',
    'müteahhit': 'general contractor|contractor|construction company|construction|building contractor|home builder|real estate developer|civil engineering|batiment|travaux|entreprise generale|bauunternehmen|hochbau|impresa edile|costruzioni|construccion|bouwbedrijf|yapi|insaat',
    'inşaat': 'construction|contractor|home builder|construction company|building supply store|building materials|batiment|travaux publics|materiaux|bau|baustoffe|edilizia|costruzioni|construccion|reformas|bouw|bouwmaterialen|yapi market|nalbur|beton|hafriyat|iskele',
    'tadilat': 'remodeling|renovation|contractor|interior design|renovation interieure|travaux|sanierung|innenausbau|ristrutturazione|reformas|renovatie|tadilat|dekorasyon|boya|alci',
    'mimar': 'architect|architecture firm|architectural design|architectural designer|interior designer|interior design|architecte|architekt|architetto|arquitecto|architektura|mimarlik|ic mimar',
    'mühendislik': 'engineering service|civil engineering|structural engineer|mechanical engineer|electrical engineer|ingenierie|bureau etudes|ingenieurbuero|ingegneria|ingenieria|muhendislik|proje ofisi',
    'tekstil': 'textile|textile manufacturer|fabric store|clothing manufacturer|apparel manufacturer|garment|tissu|confection|textil|stoffe|tessuti|confezioni|tejidos|textiel|konfeksiyon|dokuma|orme|iplik|kumas|nakis|boya apre',
    'giyim': 'clothing store|womens clothing|mens clothing|childrens clothing|apparel|fashion and apparel store|boutique|vetement|pret a porter|mode|bekleidung|abbigliamento|ropa|kleding|butik|hazir giyim|toptan giyim',
    'ayakkabı': 'shoe store|footwear manufacturer|shoe repair|leather goods|chaussure|maroquinerie|schuhe|scarpe|calzature|zapateria|calzado|schoenen|deri|saraciye|terlik|canta',
    'restoran': 'restaurant|turkish restaurant|fast food restaurant|bistro|brasserie|trattoria|ristorante|restaurante|kebab|kebap|lokanta|pide|lahmacun|balik restoran|steakhouse|food and drink',
    'kafe': 'cafe|coffee shop|bakery|patisserie|boulangerie|konditorei|baeckerei|pasticceria|panaderia|cafeteria|pastane|kahve|tatlici|dessert shop',
    'otel': 'hotel|lodging|resort|boutique hotel|motel|hostel|auberge|gasthof|albergo|hospedaje|pansiyon|apart otel|konaklama',
    'oto servis': 'auto repair|auto repair shop|car repair|auto service|auto body shop|mechanic|tire shop|garage automobile|carrosserie|autowerkstatt|kfz|autofficina|taller mecanico|autogarage|oto tamir|kaporta|oto elektrik|oto yedek parca|lastik',
    'otomotiv': 'car dealer|auto parts store|automotive|truck dealer|motorcycle dealer|automobile|concessionnaire|autohaus|autoteile|autoricambi|automocion|oto galeri|yedek parca|otomotiv yan sanayi',
    'lojistik': 'logistics|transportation service|freight forwarding|shipping company|trucking company|warehouse|cargo|logistique|transport|fret|entrepot|spedition|logistik|trasporti|logistica|transporte|logistiek|nakliyat|nakliye|kargo|antrepo|depolama|gumruk',
    'diş hekimi': 'dentist|dental clinic|dental care|orthodontist|oral surgeon|dentiste|cabinet dentaire|zahnarzt|dentista|tandarts|agiz ve dis|poliklinik',
    'sağlık': 'hospital|medical center|clinic|doctor|health care|physiotherapy|laboratory|clinique|hopital|medizin|klinik|ospedale|clinica|hospital|tip merkezi|hastane|medikal',
    'medikal': 'medical supply store|medical equipment|orthotics|hearing aid|materiel medical|medizintechnik|sanitaetshaus|forniture mediche|ortopedia|suministros medicos|medikal|tibbi cihaz',
    'eczane': 'pharmacy|drugstore|optician|pharmacie|apotheke|farmacia|apotheek|optik',
    'market': 'grocery store|supermarket|convenience store|hypermarket|wholesaler|supermarche|epicerie|supermarkt|supermercato|supermercado|toptan gida|bakkal|sarkuteri',
    'gıda': 'food manufacturer|food wholesaler|food distributor|bakery|butcher|olive oil|dairy|agroalimentaire|grossiste alimentaire|lebensmittel|alimentari|alimentacion|voeding|gida uretim|baharat|kuruyemis|sut urunleri|et entegre|unlu mamuller',
    'imalat': 'manufacturer|manufacturing|industrial manufacturing|factory|production|fabrication|usine|industriel|hersteller|fabrik|produzione|fabbrica|fabricante|fabriek|uretim|sanayi',
    'metal': 'metal fabrication|metal supplier|metalworking|steel manufacturer|iron works|welder|metallerie|sidérurgie|soudure|acier|metallbau|stahlbau|schlosserei|carpenteria metallica|metalurgia|cerrajeria|metaalbewerking|cnc|torna|dokum|celik|paslanmaz|aluminyum|demir dograma|lazer kesim',
    'alüminyum': 'aluminum supplier|metal fabrication|window installation|siding|menuiserie aluminium|fenetre|fensterbau|aluminium|serramenti|infissi|carpinteria aluminio|pvc|cam balkon|cephe sistemleri|aluminyum dograma',
    'plastik': 'plastics manufacturer|plastic fabrication|injection molding|packaging|plasturgie|plastique|kunststoff|materie plastiche|plasticos|kunststof|plastik enjeksiyon|kalip|kauçuk|pvc|polimer',
    'ambalaj': 'packaging supply store|packaging company|paper mill|corrugated box|emballage|carton|verpackung|imballaggi|embalaje|verpakking|etiket|matbaa|koli|karton|poşet|baski',
    'matbaa': 'print shop|commercial printer|graphic designer|advertising agency|imprimerie|signaletique|druckerei|werbetechnik|tipografia|stampa|imprenta|drukkerij|reklam|tabela|dijital baski|promosyon',
    'makina': 'machinery manufacturer|industrial equipment supplier|machine shop|automation|machine outil|mecanique industrielle|maschinenbau|industrietechnik|macchine industriali|meccanica|maquinaria industrial|machinefabriek|endustriyel makina|hidrolik|pnomatik|kalip|rulman|kompresor',
    'elektrik': 'electrician|electrical supply store|lighting store|electronics manufacturer|solar energy|electricite|electricien|elektrotechnik|elektriker|elettricista|impianti elettrici|electricidad|elektra|elektrik pano|otomasyon|kablo|aydinlatma|enerji|gunes enerjisi',
    'elektronik': 'electronics store|computer store|security system supplier|telecommunications|electronique|informatique|elektronik|elettronica|electronica|kamera|alarm|bilgisayar|yazilim|teknoloji',
    'yazılım': 'software company|information technology|web designer|marketing agency|it service|logiciel|informatique|agence digitale|softwarehaus|edv|informatica|desarrollo software|bilisim|yazilim|dijital ajans|veri merkezi',
    'emlak': 'real estate agency|real estate agent|real estate|property management|agence immobiliere|immobilier|immobilien|makler|agenzia immobiliare|inmobiliaria|makelaar|gayrimenkul|emlak ofisi|konut',
    'mermer': 'marble contractor|stone supplier|granite supplier|quarry|marbrerie|marbre|pierre naturelle|naturstein|marmor|marmi|graniti|marmoles|natuursteen|dogaltas|mermer|granit|traverten',
    'kimya': 'chemical plant|chemical manufacturer|paint manufacturer|cosmetics|cleaning products|chimie|produits chimiques|chemie|chimica|quimica|boya|deterjan|kozmetik|endustriyel kimya|gubre',
    'tarım': 'agricultural service|farm equipment supplier|seed supplier|greenhouse|nursery|agriculture|materiel agricole|landwirtschaft|landtechnik|agricoltura|agricola|landbouw|ziraat|tarim makinalari|fidancilik|sulama|hayvancilik|yem',
    'eğitim': 'school|private school|language school|tutoring|driving school|ecole|formation|schule|bildung|scuola|escuela|kolej|kurs|kres|anaokulu|akademi',
    'hukuk': 'attorney or law firm|lawyer|legal service|notary|avocat|cabinet juridique|notaire|rechtsanwalt|kanzlei|studio legale|avvocato|abogado|advocaat|avukat|hukuk burosu',
    'muhasebe': 'accountant|tax consultant|financial consultant|auditor|expert comptable|comptabilite|steuerberater|buchhaltung|commercialista|asesoria fiscal|contabilidad|boekhouder|mali musavir|denetim|danismanlik',
    'güvenlik': 'security guard service|security system|fire protection|securite|gardiennage|alarme|sicherheitsdienst|brandschutz|sicurezza|seguridad|beveiliging|is guvenligi|osgb|yangin sondurme',
    'temizlik': 'cleaning service|janitorial service|pest control|laundry|nettoyage|proprete|gebaeudereinigung|reinigung|pulizie|limpieza|schoonmaak|endustriyel temizlik|ilaclama',
    'banka': 'bank|bank or credit union|atm|banque|finance|sparkasse|volksbank|banca|banco|banka|sube|finans|kredi|katilim bankasi|kamu bankasi|finansal hizmetler|doviz',
    'bank': 'bank|bank or credit union|atm|banque|finance|sparkasse|volksbank|banca|banco|banka|sube|finans|kredi|katilim bankasi|kamu bankasi|finansal hizmetler|doviz',
    'tobacco': 'tobacco shop|tobacco company|tobacco|tobocco|tabac|civette|tabak|tabaccheria|estanco|tutun|tütün|tekel|tekel bayii|nargile|puro|sigara|tutuncu',
    'tobocco': 'tobacco shop|tobacco company|tobacco|tobocco|tabac|civette|tabak|tabaccheria|estanco|tutun|tütün|tekel|tekel bayii|nargile|puro|sigara|tutuncu',
    'tütün': 'tobacco shop|tobacco company|tobacco|tobocco|tabac|civette|tabak|tabaccheria|estanco|tutun|tütün|tekel|tekel bayii|nargile|puro|sigara|tutuncu',
    'tekel': 'tobacco shop|tobacco company|tobacco|tobocco|tabac|civette|tabak|tabaccheria|estanco|tutun|tütün|tekel|tekel bayii|nargile|puro|sigara|tutuncu',
    'avukat': 'attorney or law firm|lawyer|legal service|notary|avocat|notaire|rechtsanwalt|kanzlei|avvocato|abogado|advocaat|avukat|hukuk burosu|hukuk|baro|arabulucu',
    'sigorta': 'insurance agency|insurance broker|insurance company|assurance|courtier assurance|versicherung|assicurazioni|seguros|verzekering|sigorta|sigorta acentesi|kasko|trafik sigortasi',
    'veteriner': 'veterinary care|veterinarian|pet store|pet supply|veterinaire|tierarzt|veterinario|dierenarts|veteriner|hayvancilik|yem|pet shop',
    'kargo': 'courier service|delivery service|freight forwarding|messagerie|colis|kurierdienst|paketdienst|corriere|mensajeria|koerier|kargo|kurye|nakliyat|lojistik',
    'kuaför': 'hair salon|beauty salon|barber shop|coiffure|institut de beaute|friseur|kosmetikstudio|parrucchiere|peluqueria|kapper|kuafor|berber|guzellik merkezi',
    'kırtasiye': 'stationery store|book store|papeterie|librairie|schreibwaren|buchhandlung|cartoleria|papeleria|kantoorboekhandel|kirtasiye|kitapci|fotokopi|ofis malzemeleri',
    'enerji': 'energy supplier|solar energy|fuel supplier|energie|solaire|photovoltaique|solarenergie|energia solare|energia solar|petrol|akaryakit|istasyon|benzin|gunes enerjisi',
    'kozmetik': 'cosmetics store|beauty supply|perfume store|cosmetique|parfumerie|kosmetik|parfuemerie|cosmetici|profumeria|cosmetica|perfumeria|kozmetik|parfum|kisisel bakim',
    'kuyumcu': 'jewelry store|jeweler|goldsmith|watch store|bijouterie|joaillerie|horlogerie|juwelier|gioielleria|joyeria|juwelier|kuyumcu|mucevherat|altin|saat',
    'cam': 'glass and mirror shop|glazier|window installation|vitrerie|miroiterie|glaserei|glasbau|vetreria|cristaleria|glashandel|cam|ayna|cam balkon|isicam',
    'boya': 'paint store|paint manufacturer|hardware store|peinture|quincaillerie|farben|malerbedarf|colorificio|ferramenta|pinturas|ferreteria|verf|boya|nalbur|izolasyon|yalitim',
    'ısıtma': 'hvac contractor|heating|air conditioning|plumbing|chauffage|climatisation|plomberie|heizung|sanitaer|klimatechnik|termoidraulica|climatizacion|calefaccion|verwarming|loodgieter|kombi|klima|isitma|sogutma|havalandirma|tesisat',
    'klima': 'hvac contractor|air conditioning|refrigeration|climatisation|froid|klimatechnik|kaeltetechnik|climatizzazione|aire acondicionado|airconditioning|klima|sogutma|havalandirma|chiller',
    'asansör': 'elevator service|elevator manufacturer|industrial equipment|ascenseur|aufzug|ascensori|ascensores|liften|asansor|yuruyen merdiven',
    'madencilik': 'mining|quarry|stone supplier|coal|carriere|mines|bergbau|steinbruch|cava|mineria|maden|ocak|cevher|mermer',
    'denizcilik': 'marine supply|boat builder|shipyard|shipping company|chantier naval|nautisme|maritime|werft|schifffahrt|cantiere navale|nautica|astillero|scheepswerf|tersane|yat|tekne|denizcilik|liman',
    'turizm': 'travel agency|tour operator|hotel|resort|agence de voyage|tourisme|reisebuero|tourismus|agenzia viaggi|agencia de viajes|reisbureau|turizm|seyahat acentesi|acente|transfer',
    'forklift': 'forklift|material handling|industrial equipment supplier|chariot elevateur|manutention|gabelstapler|flurfoerderzeuge|carrelli elevatori|carretillas elevadoras|heftruck|istif makinalari|transpalet|vinc',
    'güneş enerjisi': 'solar|solar energy|solar panel|renewable energy|energy supplier|solaire|photovoltaique|panneau solaire|photovoltaik|solaranlagen|fotovoltaico|energia solar|zonnepanelen|gunes paneli|ges',
    'seramik': 'ceramic|tile store|tile contractor|bathroom supply store|carrelage|ceramique|fliesen|keramik|ceramiche|piastrelle|azulejos|ceramica|tegels|seramik|fayans|granit|vitrifiye',
    'kapı': 'door|door supplier|door shop|garage door supplier|security door|porte|menuiserie|portail|tueren|tore|porte blindate|serramenti|puertas|deuren|celik kapi|oda kapisi|otomatik kapi|kepenk|panjur',
    'pencere': 'window|window installation|window supplier|glazier|siding|fenetre|menuiserie pvc|volet|fenster|fensterbau|rollladen|finestre|infissi|ventanas|ramen|kozijnen|pvc dograma|cam balkon|panjur|kepenk',
    'halı': 'carpet|carpet store|rug store|flooring store|carpet cleaning|tapis|moquette|sol|teppich|bodenbelag|tappeti|pavimenti|alfombras|tapijt|vloeren|hali|kilim|parke|zemin kaplama',
    'otomasyon': 'automation|industrial automation|robotics|machine shop|automatisme|robotique|automatisierung|robotik|automazione|automatizacion|cnc|plc|pano|endustriyel otomasyon',
    'döküm': 'foundry|metal fabrication|iron works|steel manufacturer|fonderie|metallurgie|giesserei|metallguss|fonderia|fundicion|gieterij|dokum|pik dokum|aluminyum dokum|celik dokum',
    'kalıp': 'mold maker|tool and die|injection molding|machine shop|moule|outillage|usinage|werkzeugbau|formenbau|stampi|matriceria|moldes|matrijzen|kalip|plastik kalip|sac kalip',
    'hidrolik': 'hydraulics|hydraulic equipment|industrial equipment|pneumatics|hydraulique|pneumatique|hydraulik|pneumatik|oleodinamica|hidraulica|hidrolik|pnomatik|hortum|silindir|pompa',
    'rulman': 'bearing|bearing supplier|industrial equipment supplier|power transmission|roulement|transmission mecanique|kugellager|waelzlager|antriebstechnik|cuscinetti|rodamientos|lagers|rulman|kayis kasnak|reduktor',
    'yalıtım': 'insulation contractor|waterproofing|roofing|building materials|isolation|etancheite|daemmung|isolierung|abdichtung|isolamento|impermeabilizzazione|aislamiento|isolatie|yalitim|izolasyon|mantolama|epoksi',
}

# OSM tag filter builder for common sectors so Overpass fetches ultra-relevant POIs globally in <3s.
OSM_SECTOR_FILTERS: dict[str, list[str]] = {
    'mobilya': [
        '["shop"~"furniture|interior_decoration|kitchen|bed|bathroom_furnishing|curtain|carpet|doors|lighting"]',
        '["craft"~"carpenter|cabinet_maker|upholsterer|joiner|sawmill"]',
        '["industrial"="furniture"]',
        '["name"~"Mobilya|Furniture|Möbel|Moebel|Meubel|Mobilier|Muebles|Arredamenti|Koltuk|Kanepe|Yatak|Marangoz|Ahşap",i]',
    ],
    'mutfak': [
        '["shop"~"kitchen|furniture|appliance"]',
        '["craft"~"cabinet_maker|carpenter"]',
        '["name"~"Mutfak|Kitchen|Küche|Kueche|Keuken|Cuisine|Cocina|Cucine|Ankastre|Dolap",i]',
    ],
    'ahsap': [
        '["craft"~"carpenter|sawmill|joiner|cabinet_maker|parquet_layer"]',
        '["shop"~"timber|wood|doityourself"]',
    ],
    'dekorasyon': [
        '["shop"~"interior_decoration|curtain|carpet|lighting|paint|wallpaper|tiles"]',
        '["office"="interior_design"]',
    ],
    'müteahhit': [
        '["office"~"construction_company|architect|engineer|estate_agent"]',
        '["craft"~"builder|civil_engineering"]',
        '["name"~"İnşaat|Insaat|Construction|Bau|Bouw|Bâtiment|Edilizia|Yapı|Müteahhit",i]',
    ],
    'muteahhit': [
        '["office"~"construction_company|architect|engineer|estate_agent"]',
        '["craft"~"builder|civil_engineering"]',
    ],
    'inşaat': [
        '["office"~"construction_company|architect|engineer"]',
        '["shop"~"doityourself|trade|hardware|building_materials"]',
        '["craft"~"builder|roofer|mason|scaffolder|glazier|plumber"]',
    ],
    'insaat': [
        '["office"~"construction_company|architect|engineer"]',
        '["shop"~"doityourself|trade|hardware|building_materials"]',
        '["craft"~"builder|roofer|mason|scaffolder|glazier|plumber"]',
    ],
    'mimar': [
        '["office"~"architect|interior_design"]',
        '["name"~"Mimar|Architect|Architekt|Architecture|Tasarım|Design",i]',
    ],
    'metal': [
        '["craft"~"metal_construction|welder|locksmith|sheet_metal|toolmaker"]',
        '["industrial"~"metal|steel|foundry|machine_shop"]',
    ],
    'makina': [
        '["industrial"~"machine_shop|factory|engineering|manufacturing"]',
        '["craft"~"machinist|automation|toolmaker|agricultural_engines"]',
        '["name"~"Makina|Makine|Machine|Maschinen|Machinery|CNC|Automation",i]',
    ],
    'plastik': [
        '["industrial"~"plastic|packaging|chemical|factory"]',
        '["name"~"Plastik|Plastic|Kunststoff|Packaging|Ambalaj|Polymer",i]',
    ],
    'tekstil': [
        '["shop"~"fabric|clothes|fashion|boutique|tailor|sewing|leather"]',
        '["craft"~"tailor|dressmaker|embroiderer|shoemaker"]',
        '["industrial"~"textile|clothing|garment"]',
    ],
    'giyim': [
        '["shop"~"clothes|fashion|boutique|shoes|bag"]',
        '["craft"~"tailor|dressmaker"]',
    ],
    'lojistik': [
        '["office"~"logistics|transport|shipping|courier|moving_company|customs_broker"]',
        '["industrial"~"logistics|warehouse|port"]',
        '["name"~"Lojistik|Logistics|Transport|Spedition|Cargo|Freight|Nakliyat",i]',
    ],
    'otomotiv': [
        '["shop"~"car|car_repair|car_parts|tyres|motorcycle|truck"]',
        '["craft"="car_painter"]',
    ],
    'gida': [
        '["shop"~"wholesale|supermarket|convenience|bakery|butcher|deli|greengrocer|confectionery|spices"]',
        '["industrial"~"food|bakery|brewery|dairy"]',
    ],
    'gıda': [
        '["shop"~"wholesale|supermarket|convenience|bakery|butcher|deli|greengrocer|confectionery|spices"]',
        '["industrial"~"food|bakery|brewery|dairy"]',
    ],
    'restoran': [
        '["amenity"~"restaurant|fast_food|food_court"]',
    ],
    'kafe': [
        '["amenity"~"cafe|ice_cream"]',
        '["shop"~"coffee|pastry|bakery"]',
    ],
    'otel': [
        '["tourism"~"hotel|motel|guest_house|hostel|apartment|resort"]',
    ],
    'elektrik': [
        '["craft"~"electrician|electronics_repair|hvac"]',
        '["shop"~"electronics|lighting|electrical|appliance|radiotechnics"]',
        '["office"~"energy_supplier|solar"]',
    ],
    'medikal': [
        '["shop"~"medical_supply|optician|hearing_aids|chemist"]',
        '["amenity"~"clinic|doctors|dentist|hospital|pharmacy"]',
        '["healthcare"]',
    ],
    'eczane': [
        '["amenity"="pharmacy"]',
        '["shop"="chemist"]',
    ],
    'banka': [
        '["amenity"~"bank|bureau_de_change"]',
        '["office"~"financial|accountant|tax_advisor"]',
    ],
    'tobacco': [
        '["shop"~"tobacco|e-cigarette|kiosk|alcohol|newsagent"]',
    ],
    'tutun': [
        '["shop"~"tobacco|e-cigarette|kiosk|alcohol|newsagent"]',
    ],
    'avukat': [
        '["office"~"lawyer|notary|legal"]',
    ],
    'hukuk': [
        '["office"~"lawyer|notary|legal"]',
    ],
    'emlak': [
        '["office"~"estate_agent|property_management"]',
    ],
    'sigorta': [
        '["office"="insurance"]',
    ],
    'yazilim': [
        '["office"~"it|software|telecommunication|advertising_agency|consulting|web_design"]',
    ],
    'yazılım': [
        '["office"~"it|software|telecommunication|advertising_agency|consulting|web_design"]',
    ],
    'kozmetik': [
        '["shop"~"cosmetics|perfumery|beauty|chemist|hairdresser_supply"]',
    ],
    'kuyumcu': [
        '["shop"~"jewelry|watches|gold_buyer"]',
        '["craft"~"jeweller|watchmaker"]',
    ],
    'kimya': [
        '["industrial"~"chemical|paint|cosmetics|pharmaceutical"]',
        '["shop"~"paint|chemist|agrarian"]',
    ],
    'mermer': [
        '["craft"="stonemason"]',
        '["industrial"~"quarry|stone"]',
        '["name"~"Mermer|Marble|Granit|Granite|Stone|Naturstein",i]',
    ],
    'cam': [
        '["craft"~"glaziery|window_construction"]',
        '["shop"~"glaziery|window_blind|doors"]',
        '["name"~"Cam|Glass|Vitrerie|Glaserei|Vetreria|Cristaleria",i]',
    ],
    'boya': [
        '["shop"~"paint|hardware|doityourself"]',
        '["craft"="painter"]',
    ],
    'isitma': [
        '["craft"~"hvac|plumber|heating_engineer"]',
        '["shop"~"hvac|radiator|bathroom_furnishing"]',
    ],
    'klima': [
        '["craft"~"hvac|cooling"]',
        '["shop"~"hvac|appliance"]',
    ],
    'asansor': [
        '["craft"="elevator"]',
        '["industrial"~"elevator|engineering"]',
        '["name"~"Asansör|Asansor|Elevator|Ascenseur|Aufzug|Ascensori|Lift",i]',
    ],
    'kapi': [
        '["shop"~"doors|locksmith|window_blind|hardware"]',
        '["craft"~"carpenter|locksmith|window_construction|metal_construction"]',
        '["name"~"Kapı|Kapi|Door|Porte|Türen|Tueren|Puertas|Porte Blindate|Kepenk",i]',
    ],
    'pencere': [
        '["craft"~"window_construction|glaziery|carpenter"]',
        '["shop"~"window_blind|doors|glaziery"]',
    ],
    'seramik': [
        '["shop"~"tiles|bathroom_furnishing|building_materials"]',
        '["craft"="tiler"]',
    ],
    'hali': [
        '["shop"~"carpet|flooring|interior_decoration|curtain"]',
        '["craft"="floorer"]',
    ],
    'gunes enerjisi': [
        '["office"~"energy_supplier|solar"]',
        '["craft"~"photovoltaic|electrician"]',
        '["shop"~"energy|electrical"]',
    ],
    'forklift': [
        '["industrial"~"machine_shop|logistics|equipment"]',
        '["shop"~"trade|industrial"]',
        '["name"~"Forklift|Manutention|Stapler|Gabelstapler|Carrelli|Heftruck|İstif",i]',
    ],
    'ambalaj': [
        '["industrial"~"packaging|plastic|printing"]',
        '["shop"~"packaging|copyshop"]',
    ],
    'matbaa': [
        '["craft"~"printer|signmaker"]',
        '["shop"~"copyshop|stationery"]',
    ],
    'guvenlik': [
        '["office"="security"]',
        '["shop"~"security|locksmith"]',
    ],
    'temizlik': [
        '["office"~"cleaning|pest_control"]',
        '["shop"~"laundry|dry_cleaning|chemist"]',
    ],
}

# Global Country ISO-2 & English Name Mapping (55+ Trade Countries)
COUNTRY_ISO_MAP: dict[str, tuple[str, str]] = {
    'turkiye': ('TR', 'Turkey'),
    'turkey': ('TR', 'Turkey'),
    'tr': ('TR', 'Turkey'),
    'kktc': ('TR', 'Northern Cyprus'),
    'almanya': ('DE', 'Germany'),
    'germany': ('DE', 'Germany'),
    'deutschland': ('DE', 'Germany'),
    'de': ('DE', 'Germany'),
    'hollanda': ('NL', 'Netherlands'),
    'netherlands': ('NL', 'Netherlands'),
    'nl': ('NL', 'Netherlands'),
    'ingiltere': ('GB', 'United Kingdom'),
    'birlesik krallik': ('GB', 'United Kingdom'),
    'united kingdom': ('GB', 'United Kingdom'),
    'uk': ('GB', 'United Kingdom'),
    'gb': ('GB', 'United Kingdom'),
    'fransa': ('FR', 'France'),
    'france': ('FR', 'France'),
    'fr': ('FR', 'France'),
    'italya': ('IT', 'Italy'),
    'italy': ('IT', 'Italy'),
    'it': ('IT', 'Italy'),
    'ispanya': ('ES', 'Spain'),
    'spain': ('ES', 'Spain'),
    'es': ('ES', 'Spain'),
    'abd': ('US', 'United States'),
    'amerika': ('US', 'United States'),
    'united states': ('US', 'United States'),
    'usa': ('US', 'United States'),
    'us': ('US', 'United States'),
    'kanada': ('CA', 'Canada'),
    'canada': ('CA', 'Canada'),
    'bae': ('AE', 'United Arab Emirates'),
    'birlesik arap emirlikleri': ('AE', 'United Arab Emirates'),
    'uae': ('AE', 'United Arab Emirates'),
    'united arab emirates': ('AE', 'United Arab Emirates'),
    'ae': ('AE', 'United Arab Emirates'),
    'azerbaycan': ('AZ', 'Azerbaijan'),
    'azerbaijan': ('AZ', 'Azerbaijan'),
    'az': ('AZ', 'Azerbaijan'),
    'rusya': ('RU', 'Russia'),
    'russia': ('RU', 'Russia'),
    'polonya': ('PL', 'Poland'),
    'poland': ('PL', 'Poland'),
    'belcika': ('BE', 'Belgium'),
    'belgium': ('BE', 'Belgium'),
    'isvicre': ('CH', 'Switzerland'),
    'switzerland': ('CH', 'Switzerland'),
    'avusturya': ('AT', 'Austria'),
    'austria': ('AT', 'Austria'),
    'isvec': ('SE', 'Sweden'),
    'sweden': ('SE', 'Sweden'),
    'norvec': ('NO', 'Norway'),
    'norway': ('NO', 'Norway'),
    'danimarka': ('DK', 'Denmark'),
    'denmark': ('DK', 'Denmark'),
    'finlandiya': ('FI', 'Finland'),
    'finland': ('FI', 'Finland'),
    'irlanda': ('IE', 'Ireland'),
    'ireland': ('IE', 'Ireland'),
    'portekiz': ('PT', 'Portugal'),
    'portugal': ('PT', 'Portugal'),
    'yunanistan': ('GR', 'Greece'),
    'greece': ('GR', 'Greece'),
    'bulgaristan': ('BG', 'Bulgaria'),
    'bulgaria': ('BG', 'Bulgaria'),
    'romanya': ('RO', 'Romania'),
    'romania': ('RO', 'Romania'),
    'cekya': ('CZ', 'Czechia'),
    'czechia': ('CZ', 'Czechia'),
    'macaristan': ('HU', 'Hungary'),
    'hungary': ('HU', 'Hungary'),
    'hirvatistan': ('HR', 'Croatia'),
    'sirbistan': ('RS', 'Serbia'),
    'bosna hersek': ('BA', 'Bosnia and Herzegovina'),
    'arnavutluk': ('AL', 'Albania'),
    'kuzey makedonya': ('MK', 'North Macedonia'),
    'suudi arabistan': ('SA', 'Saudi Arabia'),
    'saudi arabia': ('SA', 'Saudi Arabia'),
    'katar': ('QA', 'Qatar'),
    'qatar': ('QA', 'Qatar'),
    'kuveyt': ('KW', 'Kuwait'),
    'kuwait': ('KW', 'Kuwait'),
    'umman': ('OM', 'Oman'),
    'bahreyn': ('BH', 'Bahrain'),
    'irak': ('IQ', 'Iraq'),
    'iraq': ('IQ', 'Iraq'),
    'urdun': ('JO', 'Jordan'),
    'lubnan': ('LB', 'Lebanon'),
    'misir': ('EG', 'Egypt'),
    'egypt': ('EG', 'Egypt'),
    'fas': ('MA', 'Morocco'),
    'morocco': ('MA', 'Morocco'),
    'cezayir': ('DZ', 'Algeria'),
    'tunus': ('TN', 'Tunisia'),
    'libya': ('LY', 'Libya'),
    'gurcistan': ('GE', 'Georgia'),
    'georgia': ('GE', 'Georgia'),
    'kazakistan': ('KZ', 'Kazakhstan'),
    'kazakhstan': ('KZ', 'Kazakhstan'),
    'ozbekistan': ('UZ', 'Uzbekistan'),
    'uzbekistan': ('UZ', 'Uzbekistan'),
    'turkmenistan': ('TM', 'Turkmenistan'),
    'kirgizistan': ('KG', 'Kyrgyzstan'),
    'cin': ('CN', 'China'),
    'china': ('CN', 'China'),
    'japonya': ('JP', 'Japan'),
    'japan': ('JP', 'Japan'),
    'guney kore': ('KR', 'South Korea'),
    'south korea': ('KR', 'South Korea'),
    'hindistan': ('IN', 'India'),
    'india': ('IN', 'India'),
    'singapur': ('SG', 'Singapore'),
    'malezya': ('MY', 'Malaysia'),
    'endonezya': ('ID', 'Indonesia'),
    'avustralya': ('AU', 'Australia'),
    'australia': ('AU', 'Australia'),
    'brezilya': ('BR', 'Brazil'),
    'brazil': ('BR', 'Brazil'),
    'meksika': ('MX', 'Mexico'),
    'mexico': ('MX', 'Mexico'),
    'guney afrika': ('ZA', 'South Africa'),
}

# Official Turkish province plate/ISO subdivision codes, ordered 01–81.
PROVINCES = (
    'Adana|Adıyaman|Afyonkarahisar|Ağrı|Amasya|Ankara|Antalya|Artvin|Aydın|Balıkesir|'
    'Bilecik|Bingöl|Bitlis|Bolu|Burdur|Bursa|Çanakkale|Çankırı|Çorum|Denizli|'
    'Diyarbakır|Edirne|Elazığ|Erzincan|Erzurum|Eskişehir|Gaziantep|Giresun|Gümüşhane|Hakkari|'
    'Hatay|Isparta|Mersin|İstanbul|İzmir|Kars|Kastamonu|Kayseri|Kırklareli|Kırşehir|'
    'Kocaeli|Konya|Kütahya|Malatya|Manisa|Kahramanmaraş|Mardin|Muğla|Muş|Nevşehir|'
    'Niğde|Ordu|Rize|Sakarya|Samsun|Siirt|Sinop|Sivas|Tekirdağ|Tokat|'
    'Trabzon|Tunceli|Şanlıurfa|Uşak|Van|Yozgat|Zonguldak|Aksaray|Bayburt|Karaman|'
    'Kırıkkale|Batman|Şırnak|Bartın|Ardahan|Iğdır|Yalova|Karabük|Kilis|Osmaniye|Düzce'
).split('|')

# Major province district dictionaries for freeform Turkish address recovery.
PROVINCE_DISTRICTS: dict[str, list[str]] = {
    'İzmir': [
        'Aliağa', 'Balçova', 'Bayındır', 'Bayraklı', 'Bergama', 'Beydağ', 'Bornova', 'Buca',
        'Çeşme', 'Çiğli', 'Dikili', 'Foça', 'Gaziemir', 'Güzelbahçe', 'Karabağlar', 'Karaburun',
        'Karşıyaka', 'Kemalpaşa', 'Kınık', 'Kiraz', 'Konak', 'Menderes', 'Menemen', 'Narlıdere',
        'Ödemiş', 'Seferihisar', 'Selçuk', 'Tire', 'Torbalı', 'Urla',
    ],
    'İstanbul': [
        'Adalar', 'Arnavutköy', 'Ataşehir', 'Avcılar', 'Bağcılar', 'Bahçelievler', 'Bakırköy',
        'Başakşehir', 'Bayrampaşa', 'Beşiktaş', 'Beykoz', 'Beylikdüzü', 'Beyoğlu', 'Büyükçekmece',
        'Çatalca', 'Çekmeköy', 'Esenler', 'Esenyurt', 'Eyüpsultan', 'Fatih', 'Gaziosmanpaşa',
        'Güngören', 'Kadıköy', 'Kağıthane', 'Kartal', 'Küçükçekmece', 'Maltepe', 'Pendik',
        'Sancaktepe', 'Sarıyer', 'Silivri', 'Sultanbeyli', 'Sultangazi', 'Şile', 'Şişli',
        'Tuzla', 'Ümraniye', 'Üsküdar', 'Zeytinburnu',
    ],
    'Ankara': [
        'Akyurt', 'Altındağ', 'Ayaş', 'Bala', 'Beypazarı', 'Çamlıdere', 'Çankaya', 'Çubuk',
        'Elmadağ', 'Etimesgut', 'Evren', 'Gölbaşı', 'Güdül', 'Haymana', 'Kahramankazan',
        'Kalecik', 'Keçiören', 'Kızılcahamam', 'Mamak', 'Nallıhan', 'Polatlı', 'Pursaklar',
        'Sincan', 'Şereflikoçhisar', 'Yenimahalle',
    ],
    'Bursa': [
        'Büyükorhan', 'Gemlik', 'Gürsu', 'Harmancık', 'İnegöl', 'İznik', 'Karacabey', 'Keles',
        'Kestel', 'Mudanya', 'Mustafakemalpaşa', 'Nilüfer', 'Orhaneli', 'Orhangazi', 'Osmangazi',
        'Yenişehir', 'Yıldırım',
    ],
    'Antalya': [
        'Akseki', 'Aksu', 'Alanya', 'Demre', 'Döşemealtı', 'Elmalı', 'Finike', 'Gazipaşa',
        'Gündoğmuş', 'İbradı', 'Kaş', 'Kemer', 'Kepez', 'Konyaaltı', 'Korkuteli', 'Kumluca',
        'Manavgat', 'Muratpaşa', 'Serik',
    ],
    'Konya': ['Karatay', 'Meram', 'Selçuklu', 'Akşehir', 'Beyşehir', 'Ereğli', 'Çumra', 'Seydişehir', 'Ilgın'],
    'Kayseri': ['Melikgazi', 'Kocasinan', 'Talas', 'İncesu', 'Develi', 'Yahyalı'],
    'Gaziantep': ['Şahinbey', 'Şehitkamil', 'Nizip', 'İslahiye', 'Oğuzeli'],
    'Adana': ['Seyhan', 'Yüreğir', 'Çukurova', 'Sarıçam', 'Ceyhan', 'Kozan'],
    'Kocaeli': ['İzmit', 'Gebze', 'Darıca', 'Çayırova', 'Dilovası', 'Körfez', 'Gölcük', 'Kartepe', 'Başiskele', 'Derince'],
    'Mersin': ['Akdeniz', 'Mezitli', 'Toroslar', 'Yenişehir', 'Tarsus', 'Erdemli', 'Silifke', 'Anamur', 'Mut'],
    'Denizli': ['Pamukkale', 'Merkezefendi', 'Çivril', 'Acıpayam', 'Tavas', 'Honaz', 'Sarayköy', 'Buldan', 'Çal'],
    'Manisa': [
        'Yunusemre', 'Şehzadeler', 'Akhisar', 'Turgutlu', 'Salihli', 'Soma', 'Alaşehir',
        'Saruhanlı', 'Kula', 'Kırkağaç', 'Demirci', 'Sarıgöl', 'Gördes', 'Selendi', 'Ahmetli', 'Gölmarmara', 'Köprübaşı',
    ],
    'Aydın': [
        'Efeler', 'Nazilli', 'Söke', 'Kuşadası', 'Didim', 'Çine', 'İncirliova', 'Germencik',
        'Bozdoğan', 'Köşk', 'Kuyucak', 'Sultanhisar', 'Karacasu', 'Yenipazar', 'Buharkent', 'Karpuzlu',
    ],
    'Balıkesir': [
        'Altıeylül', 'Karesi', 'Edremit', 'Bandırma', 'Gönen', 'Ayvalık', 'Burhaniye',
        'Bigadiç', 'Susurluk', 'Dursunbey', 'Sındırgı', 'İvrindi', 'Erdek', 'Havran',
    ],
    'Muğla': ['Bodrum', 'Fethiye', 'Milas', 'Menteşe', 'Marmaris', 'Seydikemer', 'Ortaca', 'Yatağan', 'Dalaman', 'Datça', 'Köyceğiz', 'Ula'],
    'Sakarya': ['Adapazarı', 'Serdivan', 'Akyazı', 'Erenler', 'Hendek', 'Karasu', 'Geyve', 'Arifiye', 'Sapanca', 'Pamukova'],
    'Tekirdağ': ['Çorlu', 'Süleymanpaşa', 'Çerkezköy', 'Kapaklı', 'Ergene', 'Malkara', 'Saray', 'Hayrabolu', 'Şarköy', 'Muratlı'],
    'Eskişehir': ['Odunpazarı', 'Tepebaşı', 'Sivrihisar', 'Çifteler', 'Seyitgazi', 'Alpu', 'İnönü'],
}


def fold(s: Any) -> str:
    s_norm = unicodedata.normalize('NFKD', str(s).casefold().replace('ı', 'i'))
    cleaned = ''.join(c for c in s_norm if not unicodedata.combining(c))
    return ' '.join(re.findall(r'[a-z0-9]+', cleaned))


PROVINCE_NAMES = {fold(x): x for x in PROVINCES}
DISTRICT_LOOKUP: dict[str, list[tuple[str, str]]] = {
    prov: [(fold(d), d) for d in dists] for prov, dists in PROVINCE_DISTRICTS.items()
}
_dist_owners: dict[str, list[str]] = {}
for _prov, _dists in PROVINCE_DISTRICTS.items():
    for _d in _dists:
        _fd = fold(_d)
        if _fd not in PROVINCE_NAMES:
            _dist_owners.setdefault(_fd, []).append(_prov)
UNIQUE_DISTRICT_PROVINCE: dict[str, str] = {
    fd: owners[0] for fd, owners in _dist_owners.items() if len(owners) == 1
}
FOLDED_ALIASES = {fold(k): v for k, v in ALIASES.items()}

# Prepositions / articles / conjunctions across TR, EN, FR, DE, IT, ES, NL
_MULTI_STOPWORDS = frozenset({
    've', 'ile', 'icin', 'de', 'da', 'den', 'dan',
    'of', 'and', 'for', 'the', 'in', 'to', 'by', 'on', 'at', 'with',
    'du', 'des', 'la', 'le', 'les', 'et', 'en', 'au', 'aux', 'd', 'l', 'sur', 'pour',
    'und', 'der', 'die', 'das', 'den', 'dem', 'fur', 'fuer', 'von', 'mit', 'im',
    'di', 'del', 'della', 'delle', 'dei', 'degli', 'ed', 'per', 'con',
    'el', 'los', 'las', 'del', 'por', 'para', 'y',
    'van', 'het', 'een', 'voor', 'met',
})

# Generic corporate/activity words that should not broaden a specific sector noun to unrelated factories/stores
_GENERIC_SECTOR_KEYS = frozenset({'imalat', 'market'})
_GENERIC_MODIFIER_WORDS = frozenset({
    'imalat', 'imalati', 'imalatci', 'imalatcisi', 'imalatcilari', 'uretim', 'uretici', 'ureticisi', 'ureticileri',
    'fabrika', 'fabrikasi', 'fabrikalari', 'sanayi', 'ticaret', 'toptan', 'perakende', 'satis', 'bayi', 'bayii',
    'magaza', 'magazasi', 'magazalari', 'dukkan', 'atolye', 'atolyesi', 'merkezi', 'hizmet', 'hizmetleri',
    'sistem', 'sistemleri', 'urun', 'urunleri', 'malzeme', 'malzemeleri', 'ekipman', 'ekipmanlari',
    'sirket', 'sirketi', 'firma', 'firmasi', 'firmalari', 'grup', 'kurumsal',
    'manufacturer', 'manufacturers', 'manufacturing', 'maker', 'makers', 'factory', 'factories',
    'wholesaler', 'wholesalers', 'wholesale', 'supplier', 'suppliers', 'supply', 'supplies',
    'store', 'stores', 'shop', 'shops', 'company', 'companies', 'service', 'services', 'equipment',
    'fabricant', 'fabricants', 'fabrication', 'usine', 'usines', 'grossiste', 'grossistes',
    'fournisseur', 'fournisseurs', 'magasin', 'magasins', 'entreprise', 'entreprises', 'societe',
    'hersteller', 'fabrik', 'grosshandel', 'haendler', 'handler', 'geschaeft', 'unternehmen', 'firma',
    'produttore', 'produttori', 'fabbrica', 'ingrosso', 'fornitore', 'negozio', 'impresa', 'azienda',
    'fabricante', 'fabricantes', 'mayorista', 'proveedor', 'tienda', 'empresa',
})


def text(v: Any, limit: int = 500) -> str:
    return v.strip()[:limit] if isinstance(v, str) else ''


def _stem_tr(word: str) -> str:
    """Strip Turkish occupational/plural suffixes (e.g. mobilyacilar -> mobilya, insaatcilar -> insaat)."""
    s = word.strip()
    s = re.sub(r'(?:cilar|ciler|cular|culer|çilar|çiler|lar[iı]|ler[iı]|lar|ler)$', '', s).strip()
    s = re.sub(r'(?:ci|cu|c|lik|luk|si|su)$', '', s).strip() if len(s) >= 6 and s not in FOLDED_ALIASES else s
    return s or word.strip()


def _stem_intl(word: str) -> str:
    """Strip common EN/FR/DE/IT/ES/NL plural and German compound corporate suffixes."""
    s = word.strip()
    if len(s) < 5:
        return s
    for de_suf in ('hersteller', 'grosshandel', 'großhandel', 'industrie', 'fabrik', 'handel', 'werke', 'werk'):
        if s.endswith(de_suf) and len(s) - len(de_suf) >= 4:
            s = s[:-len(de_suf)]
            break
    if len(s) < 5:
        return s
    if s.endswith('ies') and len(s) >= 6:
        return s[:-3] + 'y'
    if s.endswith('aux') and len(s) >= 6:
        return s[:-3] + 'al'
    if s.endswith(('eurs', 'euses')) and len(s) >= 7:
        return s[:-1]
    if s.endswith('en') and len(s) >= 7 and s[:-2] in ('moebel', 'mobel', 'kuech', 'tuer', 'farb', 'maschin'):
        return s[:-2] + ('e' if s[:-2] == 'maschin' else '')
    if s.endswith('es') and len(s) >= 6 and s[:-1] in ('meuble', 'cuisine', 'porte', 'fenetre', 'usine', 'entreprise'):
        return s[:-1]
    if s.endswith('s') and not s.endswith(('ss', 'is', 'us')):
        return s[:-1]
    return s


def _build_reverse_alias_index() -> dict[str, list[str]]:
    rev: dict[str, list[str]] = {}
    for raw_canon, alias_pipe in ALIASES.items():
        canon = fold(raw_canon)
        if not canon:
            continue
        rev.setdefault(canon, []).append(canon)
        for item in alias_pipe.split('|'):
            fi = fold(item)
            if not fi:
                continue
            if canon not in rev.setdefault(fi, []):
                rev[fi].append(canon)
            si = _stem_intl(_stem_tr(fi))
            if si and len(si) >= 4 and canon not in rev.setdefault(si, []):
                rev[si].append(canon)
            # Also index distinctive single-word nouns from 2-word aliases if not generic
            toks = [t for t in fi.split() if len(t) >= 4 and t not in _MULTI_STOPWORDS and t not in _GENERIC_MODIFIER_WORDS]
            if len(toks) == 1:
                w0 = toks[0]
                if canon not in rev.setdefault(w0, []):
                    rev[w0].append(canon)
                sw0 = _stem_intl(_stem_tr(w0))
                if sw0 and len(sw0) >= 4 and canon not in rev.setdefault(sw0, []):
                    rev[sw0].append(canon)
    return rev


REVERSE_TERM_TO_CANONICAL: dict[str, list[str]] = _build_reverse_alias_index()


def _meaningful_tokens(folded_phrase: str) -> list[str]:
    return [t for t in folded_phrase.split() if len(t) >= 3 and t not in _MULTI_STOPWORDS]


def _resolve_canonical_sectors(folded_phrase: str) -> list[str]:
    """Map any Turkish, French, English, German, Italian, Spanish or Dutch phrase to canonical sector keys."""
    if not folded_phrase:
        return []
    direct: list[str] = []
    for cand in (folded_phrase, _stem_tr(folded_phrase), _stem_intl(folded_phrase)):
        if cand in FOLDED_ALIASES and cand not in direct:
            direct.append(cand)
        for mapped in REVERSE_TERM_TO_CANONICAL.get(cand, ()):
            if mapped not in direct:
                direct.append(mapped)
    if direct:
        specific = [k for k in direct if k not in _GENERIC_SECTOR_KEYS]
        return specific or direct

    toks = _meaningful_tokens(folded_phrase)
    matched: list[str] = []
    for tok in toks:
        for variant in (tok, _stem_tr(tok), _stem_intl(tok), _stem_intl(_stem_tr(tok))):
            if not variant:
                continue
            if variant in FOLDED_ALIASES and variant not in matched:
                matched.append(variant)
            for mapped in REVERSE_TERM_TO_CANONICAL.get(variant, ()):
                if mapped not in matched:
                    matched.append(mapped)
    specific = [k for k in matched if k not in _GENERIC_SECTOR_KEYS]
    return specific or matched


def terms(query: str) -> list[str]:
    query = text(query, 500)
    out: list[str] = []
    for part in query.split('|'):
        fp = fold(part)
        if not fp:
            continue
        out.append(fp)
        stem = _stem_intl(_stem_tr(fp))
        if stem and stem != fp and len(stem) >= 3:
            out.append(stem)

        canon_keys = _resolve_canonical_sectors(fp)
        for ck in canon_keys:
            out.append(ck)
            if ck in FOLDED_ALIASES:
                out.extend(fold(x) for x in FOLDED_ALIASES[ck].split('|') if fold(x))

        # Decompose multi-word manual queries into domain-specific words so "FABRICANTS DE MEUBLES" or "bambu sandalye"
        # matches single-word company/category names without requiring exact 3-word adjacency.
        m_toks = _meaningful_tokens(fp)
        non_generic = [t for t in m_toks if t not in _GENERIC_MODIFIER_WORDS and _stem_intl(_stem_tr(t)) not in _GENERIC_MODIFIER_WORDS]
        token_pool = non_generic if non_generic else (m_toks if not canon_keys else [])
        for tok in token_pool:
            if len(tok) >= 3:
                out.append(tok)
            ts = _stem_intl(_stem_tr(tok))
            if ts and ts != tok and len(ts) >= 3:
                out.append(ts)
    return list(dict.fromkeys(x for x in out if x))[:140]


def bounds(value: Any, max_area: float = 4.0) -> tuple[float, float, float, float]:
    try:
        w, s, e, n = map(float, value.split(',') if isinstance(value, str) else value)
    except (ValueError, TypeError) as exc:
        raise ValueError('Sınırlar batı,güney,doğu,kuzey olmalı') from exc
    if not all(map(math.isfinite, (w, s, e, n))) or not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
        raise ValueError('Coğrafi sınırlar geçersiz')
    if (e - w) * (n - s) > max_area:
        raise ValueError(f'Tek indirme en fazla {max_area:g} derece kare; bölgeyi parçalayın')
    return w, s, e, n


def split_bbox(w: float, s: float, e: float, n: float, max_tile_area: float = 3.6) -> list[tuple[float, float, float, float]]:
    """Quadtree-slice large province/regional bounding boxes into safe streaming tiles."""
    if (e - w) * (n - s) <= max_tile_area:
        return [(round(w, 6), round(s, 6), round(e, 6), round(n, 6))]
    mx = (w + e) / 2.0
    my = (s + n) / 2.0
    tiles: list[tuple[float, float, float, float]] = []
    for sub in ((w, s, mx, my), (mx, s, e, my), (w, my, mx, n), (mx, my, e, n)):
        tiles.extend(split_bbox(*sub, max_tile_area=max_tile_area))
    return tiles


def province_of(raw: Any) -> str:
    raw_s = text(raw, 200)
    if not raw_s:
        return ''
    m = re.fullmatch(r'(?:TR[-_\s]?)?(\d{2})', raw_s.upper())
    if m and 1 <= int(m[1]) <= 81:
        return PROVINCES[int(m[1]) - 1]
    return PROVINCE_NAMES.get(fold(raw_s), '')


def _province_from_postcode(postcode: str) -> str:
    m = re.fullmatch(r'(\d{2})\d{3}', postcode.strip())
    if m and 1 <= int(m[1]) <= 81:
        return PROVINCES[int(m[1]) - 1]
    return ''


def _infer_province_from_freeform(freeform: str) -> str:
    if not freeform:
        return ''
    if '/' in freeform:
        parts = freeform.rsplit('/', 1)[-1].strip().split()
        if parts:
            tail = parts[0].strip('.,;()-')
            if p := province_of(tail):
                return p
    tokens = fold(freeform).split()
    for tok in reversed(tokens[-4:]):
        if p := PROVINCE_NAMES.get(tok):
            return p
    return ''


def _infer_district(province: str, locality: str, freeform: str) -> str:
    if locality and fold(locality) != fold(province) and not province_of(locality):
        if province in DISTRICT_LOOKUP:
            floc = fold(locality)
            for fd, official in DISTRICT_LOOKUP[province]:
                if fd == floc:
                    return official
        return locality[:120]
    if province and freeform:
        m = re.search(r'([\wÇĞİÖŞÜçğıöşü -]+)\s*/\s*' + re.escape(province) + r'\b', freeform, re.I)
        if m:
            cand = m[1].strip().split(',')[-1].strip()
            if cand and fold(cand) != fold(province):
                return cand[:120]
        if province in DISTRICT_LOOKUP:
            ff = ' ' + fold(freeform) + ' '
            for fd, official in DISTRICT_LOOKUP[province]:
                if f' {fd} ' in ff:
                    return official
    return ''


def feature(f: Any, region: str, source: str) -> tuple[Any, ...] | None:
    if not isinstance(f, dict):
        return None
    p = f.get('properties')
    g = f.get('geometry')
    if not isinstance(p, dict) or not isinstance(g, dict) or g.get('type') != 'Point':
        return None
    xy = g.get('coordinates')
    key = text(f.get('id') or p.get('id'), 200)
    if not key or not isinstance(xy, list) or len(xy) < 2:
        return None
    try:
        lon, lat = map(float, xy[:2])
    except (TypeError, ValueError):
        return None
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        return None
    names = p.get('names') or {}
    name = text(names.get('primary') if isinstance(names, dict) else '', 300)
    if not name:
        return None
    operating = text(p.get('operating_status'), 60)
    if operating.lower() in ('closed', 'permanently_closed', 'temporarily_closed', 'inactive', 'defunct'):
        return None
    tax = p.get('taxonomy') or p.get('categories') or {}
    tax = tax if isinstance(tax, dict) else {}
    primary = text(tax.get('primary') or p.get('basic_category'), 200)
    extras = [primary, text(p.get('basic_category'), 200)]
    for k in ('hierarchy', 'alternates', 'alternate'):
        val = tax.get(k)
        if isinstance(val, list):
            extras += [text(v, 150) for v in val[:30]]
    brand = p.get('brand')
    if isinstance(brand, dict):
        bnames = brand.get('names')
        if isinstance(bnames, dict) and bnames.get('primary'):
            extras.append(text(bnames.get('primary'), 150))
    addr: list[str] = []
    raw_addrs = p.get('addresses')
    for a in (raw_addrs[:3] if isinstance(raw_addrs, list) else []):
        if isinstance(a, dict):
            parts = dict.fromkeys(
                text(a.get(k), 200)
                for k in ('freeform', 'locality', 'region', 'postcode', 'country')
                if text(a.get(k), 200)
            )
            if parts:
                addr.append(', '.join(parts))
    site = ''
    raw_sites = p.get('websites')
    for u in (raw_sites[:20] if isinstance(raw_sites, list) else []):
        try:
            site = normalize(u)
            break
        except (ScanError, AttributeError, TypeError):
            pass
    cf = p.get('confidence')
    cf = cf if isinstance(cf, (int, float)) and not isinstance(cf, bool) and 0 <= cf <= 1 else None
    if cf == 0:
        return None
    provenance = json.dumps(p.get('sources') or [], ensure_ascii=False)[:6000]
    addr_str = '; '.join(addr)[:800]
    # Keep search_text strictly to establishment name, brand, and taxonomy (exclude street address to prevent street-name false positives).
    search_blob = ' ' + fold(' '.join(extras + [name])) + ' '
    return (key, name, primary, search_blob, region, addr_str, lat, lon, site, cf, operating, source, now(), provenance)


def _clean_poi_email(raw: Any) -> str:
    if not isinstance(raw, str):
        return ''
    e = raw.strip().removeprefix('mailto:').split('?')[0].strip().lower()
    if not e or len(e) > 254 or not EMAIL.fullmatch(e):
        return ''
    local, _, domain = e.partition('@')
    if local.startswith('.') or '..' in local:
        return ''
    tld = domain.rsplit('.', 1)[-1]
    if tld in BAD_EMAIL_TLDS or domain in BAD_EMAIL_DOMAINS or any(domain.endswith('.' + bd) for bd in BAD_EMAIL_DOMAINS):
        return ''
    return e


def country_iso_of_region(region: str) -> str:
    """Resolve ISO-2 country code from region string (e.g. 'Berlin, Almanya' -> 'DE', 'İzmir, Türkiye' -> 'TR')."""
    if not region:
        return 'TR'
    parts = [p.strip() for p in region.split(',') if p.strip()]
    if len(parts) >= 2:
        country_raw = fold(parts[-1])
        hit = COUNTRY_ISO_MAP.get(country_raw)
        if hit:
            return hit[0]
        if len(parts[-1].strip()) == 2 and parts[-1].strip().isalpha():
            return parts[-1].strip().upper()
    if province_of(parts[0]) if parts else '':
        return 'TR'
    return 'TR'


def country_english_name(country_or_region: str) -> str:
    """Translate Turkish/local country label into English for international Nominatim geocoding."""
    raw = country_or_region.split(',')[-1].strip() if ',' in country_or_region else country_or_region.strip()
    hit = COUNTRY_ISO_MAP.get(fold(raw))
    return hit[1] if hit else raw


def meta(f: dict[str, Any], key: str, fallback_region: str = '') -> tuple[str, str, str, str, str]:
    p = f['properties']
    province = district = ''
    iso_country = country_iso_of_region(fallback_region)
    fallback_city = fallback_region.split(',')[0].strip() if fallback_region else ''
    fallback_prov = province_of(fallback_city) if iso_country == 'TR' else fallback_city
    raw_addrs = p.get('addresses')
    for a in (raw_addrs if isinstance(raw_addrs, list) else []):
        if not isinstance(a, dict):
            continue
        country = text(a.get('country'), 10).upper()
        if iso_country == 'TR':
            if country and country != 'TR':
                continue
            locality = text(a.get('locality'), 200)
            freeform = text(a.get('freeform'), 400)
            postcode = text(a.get('postcode'), 20)
            province = (
                province_of(a.get('region'))
                or _province_from_postcode(postcode)
                or province_of(locality)
                or UNIQUE_DISTRICT_PROVINCE.get(fold(locality), '')
                or _infer_province_from_freeform(freeform)
                or fallback_prov
            )
            district = text(a.get('district') or a.get('county') or a.get('municipality'), 200)
            if not district:
                district = _infer_district(province, locality, freeform)
        else:
            if country and len(iso_country) == 2 and country != iso_country:
                continue
            locality = text(a.get('locality'), 200)
            subloc = text(a.get('sublocality') or a.get('district') or a.get('county') or a.get('municipality'), 200)
            province = fallback_city or locality or text(a.get('region'), 120)
            if subloc and fold(subloc) != fold(province):
                district = subloc[:120]
            elif locality and fold(locality) != fold(province):
                district = locality[:120]
        if province or district:
            break
    if not province and fallback_prov:
        province = fallback_prov
    raw_emails = p.get('emails')
    emails = sorted({ce for v in raw_emails if (ce := _clean_poi_email(v))}) if isinstance(raw_emails, list) else []
    raw_phones = p.get('phones')
    phones = sorted({n for v in raw_phones if (n := phone_normalize(v, iso_country))}) if isinstance(raw_phones, list) else []
    return key, province, district, json.dumps(emails), json.dumps(phones)


_CATALOG_EPOCH = 0
_CATALOG_CACHE_LOCK = threading.Lock()
_PORTFOLIO_CACHE: dict[tuple[Any, ...], dict[str, Any]] = {}


def _bump_catalog_epoch() -> None:
    global _CATALOG_EPOCH
    with _CATALOG_CACHE_LOCK:
        _CATALOG_EPOCH += 1
        _PORTFOLIO_CACHE.clear()


def _upsert_pairs(store: Any, pairs: list[tuple[tuple[Any, ...], tuple[str, str, str, str, str]]]) -> None:
    if not pairs:
        return
    rows = [r for r, _ in pairs]
    metas = [m for _, m in pairs]
    with store.db() as c:
        c.executemany(
            '''INSERT INTO places VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET
                 name=excluded.name, category=excluded.category, search_text=excluded.search_text,
                 region=excluded.region, address=excluded.address, lat=excluded.lat, lon=excluded.lon,
                 website=CASE WHEN excluded.website!='' THEN excluded.website ELSE places.website END,
                 confidence=COALESCE(excluded.confidence, places.confidence),
                 operating=excluded.operating, source=excluded.source,
                 imported=excluded.imported, provenance=excluded.provenance''',
            rows,
        )
        c.executemany(
            '''INSERT INTO place_meta VALUES(?,?,?,?,?)
               ON CONFLICT(place_id) DO UPDATE SET
                 province=CASE WHEN excluded.province!='' THEN excluded.province ELSE place_meta.province END,
                 district=CASE WHEN excluded.district!='' THEN excluded.district ELSE place_meta.district END,
                 emails=CASE WHEN excluded.emails!='[]' THEN excluded.emails ELSE place_meta.emails END,
                 phones=CASE WHEN excluded.phones!='[]' THEN excluded.phones ELSE place_meta.phones END''',
            metas,
        )
    _bump_catalog_epoch()


def ingest(store: Any, data: Any, region: str, source: str = SOURCE) -> dict[str, int]:
    region = text(region, 200)
    if not region:
        raise ValueError('Bölge etiketi gerekli')
    if not isinstance(data, dict) or data.get('type') != 'FeatureCollection' or not isinstance(data.get('features'), list):
        raise ValueError('GeoJSON FeatureCollection gerekli')
    features = data['features']
    if len(features) > MAX_FEATURES:
        raise ValueError(f'{MAX_FEATURES:,} kayıt sınırı; bölgeyi küçültün')
    pairs = [(r, meta(f, r[0], region)) for f in features if (r := feature(f, region, source)) is not None]
    _upsert_pairs(store, pairs)
    rows = [r for r, _ in pairs]
    return {
        'read': len(features),
        'valid': len(rows),
        'unique': len({r[0] for r in rows}),
        'skipped': len(features) - len(rows),
        'websites': len({r[0] for r in rows if r[8]}),
    }


def _wkb_point_xy(geom: Any, bbox_val: Any) -> tuple[float, float] | None:
    if isinstance(bbox_val, dict):
        xmin, ymin = bbox_val.get('xmin'), bbox_val.get('ymin')
        if isinstance(xmin, (int, float)) and isinstance(ymin, (int, float)):
            return float(xmin), float(ymin)
    if isinstance(geom, (bytes, bytearray, memoryview)) and len(geom) >= 21:
        b = bytes(geom[:21])
        endian = '<' if b[0] == 1 else '>'
        wkb_type, lon, lat = struct.unpack(endian + 'Idd', b[1:21])
        if (wkb_type & 0xFF) == 1:
            return lon, lat
    return None


def _arrow_row_to_feature(row: dict[str, Any]) -> dict[str, Any] | None:
    xy = _wkb_point_xy(row.get('geometry'), row.get('bbox'))
    if xy is None:
        return None
    return {
        'type': 'Feature',
        'id': row.get('id'),
        'geometry': {'type': 'Point', 'coordinates': [xy[0], xy[1]]},
        'properties': {
            'id': row.get('id'),
            'names': row.get('names'),
            'taxonomy': row.get('taxonomy') or row.get('categories'),
            'basic_category': row.get('basic_category'),
            'brand': row.get('brand'),
            'addresses': row.get('addresses'),
            'websites': row.get('websites'),
            'emails': row.get('emails'),
            'phones': row.get('phones'),
            'confidence': row.get('confidence'),
            'operating_status': row.get('operating_status'),
            'sources': row.get('sources'),
        },
    }


def _stream_overture_arrow(store: Any, region: str, w: float, s: float, e: float, n: float) -> dict[str, int]:
    """Stream Overture GeoParquet directly via C++ PyArrow with Quadtree tiling and province-boundary guard."""
    tiles = split_bbox(w, s, e, n, max_tile_area=3.6)
    read_total = valid_total = 0
    seen_ids: set[str] = set()
    web_ids: set[str] = set()
    src_label = f'{SOURCE} / PyArrow S3, bbox {w},{s},{e},{n}'
    expected_prov = province_of(region.split(',')[0])

    for tw, ts, te, tn in tiles:
        reader = overture_core.record_batch_reader(
            'place',
            bbox=(tw, ts, te, tn),
            connect_timeout=15,
            request_timeout=60,
        )
        if reader is None:
            continue
        batch_pairs: list[tuple[tuple[Any, ...], tuple[str, str, str, str, str]]] = []
        for batch in reader:
            rows = batch.to_pylist()
            read_total += len(rows)
            for raw in rows:
                f = _arrow_row_to_feature(raw)
                if f is None:
                    continue
                rec = feature(f, region, src_label)
                if rec is None:
                    continue
                m_rec = meta(f, rec[0], region)
                # Province boundary guard: rectangular bboxes overlap neighbor provinces (e.g. Manisa/Aydın next to İzmir).
                if expected_prov and m_rec[1] and m_rec[1] != expected_prov:
                    continue
                valid_total += 1
                seen_ids.add(rec[0])
                if rec[8]:
                    web_ids.add(rec[0])
                batch_pairs.append((rec, m_rec))
                if len(batch_pairs) >= 25000:
                    _upsert_pairs(store, batch_pairs)
                    batch_pairs.clear()
        if batch_pairs:
            _upsert_pairs(store, batch_pairs)
            batch_pairs.clear()

    return {
        'read': read_total,
        'valid': valid_total,
        'unique': len(seen_ids),
        'skipped': max(0, read_total - valid_total),
        'websites': len(web_ids),
    }


def _resolve_osm_filters(sector: str) -> list[str]:
    if not sector:
        return []
    fsec = fold(sector.split('|')[0])
    stem = _stem_tr(fsec)
    for cand in (fsec, stem, _stem_intl(fsec)):
        if cand in OSM_SECTOR_FILTERS:
            return list(OSM_SECTOR_FILTERS[cand])
    for ck in _resolve_canonical_sectors(fsec):
        if ck in OSM_SECTOR_FILTERS:
            return list(OSM_SECTOR_FILTERS[ck])
        ck_fold = fold(ck)
        if ck_fold in OSM_SECTOR_FILTERS:
            return list(OSM_SECTOR_FILTERS[ck_fold])
    for w in _meaningful_tokens(fsec):
        if w in _GENERIC_MODIFIER_WORDS:
            continue
        ws = _stem_intl(_stem_tr(w))
        if w in OSM_SECTOR_FILTERS:
            return list(OSM_SECTOR_FILTERS[w])
        if ws in OSM_SECTOR_FILTERS:
            return list(OSM_SECTOR_FILTERS[ws])
    return []


def _extract_osm_kv_tags(filters: list[str]) -> list[str]:
    """Expand both ['k'='v'] and ['k'~'v1|v2'] Overpass filter expressions into Photon k:v tags."""
    kv_tags: list[str] = []
    for flt in filters:
        m_eq = re.match(r'^\["([^"]+)"="([^"]+)"\]$', flt)
        if m_eq and m_eq.group(1) != 'name':
            kv_tags.append(f'{m_eq.group(1)}:{m_eq.group(2)}')
            continue
        m_rx = re.match(r'^\["([^"]+)"~"([^"]+)"(?:,i)?\]$', flt)
        if m_rx and m_rx.group(1) != 'name':
            k_name = m_rx.group(1)
            for v_part in m_rx.group(2).split('|')[:4]:
                v_clean = v_part.strip()
                if v_clean and re.fullmatch(r'[a-z_]+', v_clean):
                    kv_tags.append(f'{k_name}:{v_clean}')
    return list(dict.fromkeys(kv_tags))


def _build_overpass_query(w: float, s: float, e: float, n: float, sector: str = '') -> str:
    bb = f'({s},{w},{n},{e})'
    area = (e - w) * (n - s)
    filters = _resolve_osm_filters(sector)
    if filters and area > 1.2:
        # Full-scan regex on ["name"~...] times out on large province bboxes; keep indexed tag queries fast.
        filters = [flt for flt in filters if not flt.startswith('["name"~')]
    if not filters and sector:
        raw_toks: list[str] = []
        for p in sector.split('|'):
            clean_p = re.sub(r'[^A-Za-z0-9ÇĞİÖŞÜçğıöşüÀ-ÿ ]', '', p.strip())
            if len(clean_p) >= 3:
                raw_toks.append(clean_p)
            for wt in _meaningful_tokens(fold(p)):
                if wt not in _GENERIC_MODIFIER_WORDS and len(wt) >= 4 and wt not in raw_toks:
                    raw_toks.append(wt)
        toks = raw_toks[:5]
        if toks and area <= 1.2:
            pat = '|'.join(toks)
            filters = [f'["name"~"{pat}",i]', '["shop"]', '["craft"]', '["office"]']
    if not filters:
        filters = ['["shop"]', '["craft"]', '["office"]', '["industrial"]']
    clauses = ''.join(f'nw{flt}{bb};' for flt in filters[:4])
    return f'[out:json][timeout:10];({clauses});out center tags 500;'


def _fetch_photon_osm_fallback(
    w: float, s: float, e: float, n: float, sector: str = '', city: str = ''
) -> list[dict[str, Any]]:
    if not HAS_HTTPX:
        return []
    filters = _resolve_osm_filters(sector)
    kv_tags = _extract_osm_kv_tags(filters)
    bb_str = f'{w:.4f},{s:.4f},{e:.4f},{n:.4f}'
    cx, cy = (w + e) / 2.0, (s + n) / 2.0
    hdr = {'User-Agent': 'LeadIntelligencePro/7.0 (Geospatial Open Data)'}
    feat_map: dict[str, dict[str, Any]] = {}
    t_list = terms(sector)
    fsec = fold(sector.split('|')[0]) if sector else ''
    stem = _stem_tr(fsec)

    # Pick single-word multilingual native keywords (EN, FR, DE, IT, ES, NL, TR) so every country matches!
    single_words = [
        t for t in t_list
        if ' ' not in t and len(t) >= 4 and t not in (fsec, stem)
    ]
    native_kws = single_words[:6] if single_words else ([stem] if stem else ['shop'])

    params_list: list[dict[str, Any]] = []
    if city:
        for kv in kv_tags[:4]:
            params_list.append({'q': city, 'osm_tag': kv, 'bbox': bb_str, 'limit': 50})
    for kw in native_kws[:5]:
        params_list.append({'q': kw, 'lat': round(cy, 4), 'lon': round(cx, 4), 'bbox': bb_str, 'limit': 50})

    def _run_photon(prm: dict[str, Any]) -> list[dict[str, Any]]:
        try:
            r = httpx.get('https://photon.komoot.io/api/', params=prm, headers=hdr, timeout=5.0)
            if r.status_code == 200:
                return list(r.json().get('features') or [])
        except Exception:
            pass
        return []

    with concurrent.futures.ThreadPoolExecutor(max_workers=min(6, max(1, len(params_list)))) as pool:
        for feat_list in pool.map(_run_photon, params_list):
            for f in feat_list:
                p = f.get('properties') or {}
                coords = (f.get('geometry') or {}).get('coordinates') or []
                osm_type, osm_id = p.get('osm_type'), p.get('osm_id')
                if not p.get('name') or len(coords) < 2 or osm_type not in ('N', 'W') or not osm_id:
                    continue
                if p.get('osm_key') in ('highway', 'place', 'boundary', 'railway', 'natural', 'waterway'):
                    continue
                lon_f, lat_f = float(coords[0]), float(coords[1])
                if not (w - 0.05 <= lon_f <= e + 0.05 and s - 0.05 <= lat_f <= n + 0.05):
                    continue
                key = f'{osm_type}:{osm_id}'
                if key not in feat_map:
                    feat_map[key] = {'p': p, 'lon': lon_f, 'lat': lat_f}

    if not feat_map:
        return []

    n_ids = [k.split(':')[1] for k in feat_map if k.startswith('N:')][:160]
    w_ids = [k.split(':')[1] for k in feat_map if k.startswith('W:')][:160]
    rich_tags: dict[str, dict[str, Any]] = {}
    for kind, p_name, pfx, id_list in (('nodes', 'nodes', 'N', n_ids), ('ways', 'ways', 'W', w_ids)):
        for idx_chunk in range(0, len(id_list), 80):
            chunk = id_list[idx_chunk:idx_chunk + 80]
            if not chunk:
                continue
            try:
                ro = httpx.get(
                    f'https://api.openstreetmap.org/api/0.6/{kind}.json',
                    params={p_name: ','.join(chunk)},
                    headers=hdr,
                    timeout=5.5,
                )
                if ro.status_code == 200:
                    for el in ro.json().get('elements') or []:
                        if isinstance(el.get('tags'), dict):
                            rich_tags[f"{pfx}:{el.get('id')}"] = el['tags']
            except Exception:
                continue

    elements: list[dict[str, Any]] = []
    for k, info in feat_map.items():
        p = info['p']
        tags: dict[str, Any] = {'name': p.get('name')}
        if p.get('osm_key') and p.get('osm_value'):
            tags[str(p['osm_key'])] = str(p['osm_value'])
        if p.get('street'):
            tags['addr:street'] = str(p['street'])
        if p.get('housenumber'):
            tags['addr:housenumber'] = str(p['housenumber'])
        if p.get('district') or p.get('locality'):
            tags['addr:district'] = str(p.get('district') or p.get('locality'))
        tags.update(rich_tags.get(k) or {})
        elements.append({'type': 'node', 'lat': info['lat'], 'lon': info['lon'], 'tags': tags})
    return elements


def _fetch_osm_overpass(
    w: float, s: float, e: float, n: float, sector: str = '', city: str = ''
) -> list[dict[str, Any]]:
    if not HAS_HTTPX or (e - w) * (n - s) > 12.0:
        return []
    q = _build_overpass_query(w, s, e, n, sector)
    endpoints = ('https://overpass-api.de/api/interpreter', *OVERPASS_ENDPOINTS[:2])

    def _try_ep(ep: str) -> list[dict[str, Any]]:
        r = httpx.post(
            ep,
            headers={'User-Agent': 'LeadIntelligencePro/7.0 (Geospatial Open Data)'},
            data={'data': q},
            timeout=4.5,
        )
        if r.status_code == 200:
            els = r.json().get('elements')
            if isinstance(els, list) and els:
                return els
        raise RuntimeError('Overpass mirror unavailable')

    pool = concurrent.futures.ThreadPoolExecutor(max_workers=len(endpoints))
    futs = [pool.submit(_try_ep, ep) for ep in endpoints]
    try:
        for fut in concurrent.futures.as_completed(futs, timeout=5.0):
            try:
                res_els = fut.result()
                if res_els:
                    return res_els
            except Exception:
                continue
    except Exception:
        pass
    finally:
        pool.shutdown(wait=False, cancel_futures=True)

    return _fetch_photon_osm_fallback(w, s, e, n, sector, city=city)


def _ingest_osm_elements(
    store: Any,
    elements: list[dict[str, Any]],
    region: str,
    sector_hint: str = '',
) -> dict[str, int]:
    if not elements:
        return {'osm_read': 0, 'osm_added': 0, 'osm_merged': 0}

    # Build quick dedup index from existing regional records (domain + ~65m name grid).
    with store.db() as c:
        existing_rows = c.execute(
            '''SELECT p.id, p.name, p.lat, p.lon, p.website, p.address,
                      m.province, m.district, m.emails, m.phones
               FROM places p LEFT JOIN place_meta m ON m.place_id = p.id
               WHERE p.region = ?''',
            (region,),
        ).fetchall()

    by_domain: dict[str, sqlite3.Row] = {}
    by_grid: dict[tuple[str, int, int], sqlite3.Row] = {}
    for er in existing_rows:
        if er['website']:
            try:
                by_domain[domain_key(er['website'])] = er
            except Exception:
                pass
        fname = fold(er['name'])
        if fname:
            by_grid[(fname, round(er['lat'] * 1500), round(er['lon'] * 1500))] = er

    new_pairs: list[tuple[tuple[Any, ...], tuple[str, str, str, str, str]]] = []
    enrich_updates: list[tuple[str, str, str, str, str, str]] = []
    added = merged = 0
    iso_country = country_iso_of_region(region)
    fallback_city = region.split(',')[0].strip() if region else ''
    fallback_prov = province_of(fallback_city) if iso_country == 'TR' else fallback_city

    for el in elements[:50000]:
        tags = el.get('tags')
        if not isinstance(tags, dict):
            continue
        name = text(tags.get('name') or tags.get('brand'), 300)
        if not name:
            continue
        lat = el.get('lat') or (el.get('center') or {}).get('lat')
        lon = el.get('lon') or (el.get('center') or {}).get('lon')
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            continue
        raw_web = tags.get('website') or tags.get('contact:website') or tags.get('url') or ''
        site = ''
        if raw_web:
            try:
                site = normalize(str(raw_web))
            except ScanError:
                site = ''
        raw_phones = [
            tags.get('phone'), tags.get('contact:phone'),
            tags.get('mobile'), tags.get('contact:mobile'),
            tags.get('whatsapp'), tags.get('contact:whatsapp'),
        ]
        phones_set: set[str] = set()
        for rp in raw_phones:
            if isinstance(rp, str):
                for part in re.split(r'[;,|/]+', rp):
                    if np := phone_normalize(part, iso_country):
                        phones_set.add(np)
        raw_emails = [tags.get('email'), tags.get('contact:email')]
        emails_set: set[str] = set()
        for re_m in raw_emails:
            if isinstance(re_m, str):
                for part in re.split(r'[;,|\s]+', re_m):
                    if ce := _clean_poi_email(part):
                        emails_set.add(ce)

        street = ' '.join(x for x in (text(tags.get('addr:street'), 150), text(tags.get('addr:housenumber'), 40)) if x)
        suburb = text(tags.get('addr:suburb') or tags.get('addr:neighbourhood') or tags.get('addr:quarter'), 120)
        dist = text(tags.get('addr:district') or tags.get('addr:city_district') or tags.get('addr:borough') or tags.get('addr:town'), 120)
        city_tag = text(tags.get('addr:province') or tags.get('addr:city'), 120)
        if iso_country == 'TR':
            prov = province_of(city_tag) or fallback_prov
            if fallback_prov and prov and prov != fallback_prov:
                continue
            full_addr = ', '.join(x for x in (street, suburb, dist, prov or city_tag) if x)[:800]
            if not dist:
                dist = _infer_district(prov, city_tag, full_addr + ' ' + name)
        else:
            prov = fallback_prov or city_tag
            if not dist and suburb and fold(suburb) != fold(prov):
                dist = suburb
            full_addr = ', '.join(x for x in (street, suburb if suburb != dist else '', dist, prov) if x)[:800]

        # Check deduplication match against Overture/existing records.
        match = None
        if site:
            match = by_domain.get(domain_key(site))
        if match is None:
            fname = fold(name)
            for dlat in (-1, 0, 1):
                for dlon in (-1, 0, 1):
                    cand = by_grid.get((fname, round(float(lat) * 1500) + dlat, round(float(lon) * 1500) + dlon))
                    if cand is not None:
                        match = cand
                        break
                if match is not None:
                    break

        if match is not None:
            merged += 1
            cur_emails = set(json.loads(match['emails'] or '[]')) | emails_set
            cur_phones = set(json.loads(match['phones'] or '[]')) | phones_set
            enrich_updates.append((
                site if (site and not match['website']) else match['website'],
                full_addr if (full_addr and not match['address']) else match['address'],
                prov if (prov and not match['province']) else (match['province'] or ''),
                dist if (dist and not match['district']) else (match['district'] or ''),
                json.dumps(sorted(cur_emails)),
                json.dumps(sorted(cur_phones)),
                match['id'],
            ))
            continue

        cat = text(
            tags.get('shop') or tags.get('craft') or tags.get('industrial')
            or tags.get('office') or tags.get('tourism') or tags.get('healthcare')
            or tags.get('amenity') or sector_hint or 'business',
            200,
        )
        osm_id = f"osm:{el.get('type', 'n')}:{el.get('id')}"
        extra_terms = ' '.join(
            str(v) for k, v in tags.items()
            if k in ('shop', 'craft', 'industrial', 'office', 'tourism', 'healthcare', 'amenity', 'product', 'trade', 'brand')
        )
        s_text = ' ' + fold(f'{cat} {extra_terms} {sector_hint} {name} {full_addr}') + ' '
        prov_json = json.dumps([{'dataset': 'OpenStreetMap', 'id': osm_id}], ensure_ascii=False)
        rec = (
            osm_id, name, cat, s_text, region, full_addr,
            float(lat), float(lon), site, 0.85, 'open', OSM_SOURCE, now(), prov_json,
        )
        m_rec = (osm_id, prov, dist, json.dumps(sorted(emails_set)), json.dumps(sorted(phones_set)))
        new_pairs.append((rec, m_rec))
        added += 1

    if new_pairs:
        _upsert_pairs(store, new_pairs)
    if enrich_updates:
        with store.db() as c:
            for web_v, addr_v, prov_v, dist_v, em_v, ph_v, pid in enrich_updates:
                c.execute('UPDATE places SET website=?, address=? WHERE id=?', (web_v, addr_v, pid))
                c.execute(
                    '''INSERT INTO place_meta VALUES(?,?,?,?,?)
                       ON CONFLICT(place_id) DO UPDATE SET
                         province=excluded.province, district=excluded.district,
                         emails=excluded.emails, phones=excluded.phones''',
                    (pid, prov_v, dist_v, em_v, ph_v),
                )
        _bump_catalog_epoch()
    return {'osm_read': len(elements), 'osm_added': added, 'osm_merged': merged}


_NO_PREFIX_TOKENS = frozenset({'mobili', 'mobile', 'banque', 'studio', 'garage'})


def _fts_match_expression(term_list: list[str]) -> str:
    parts: list[str] = []
    for t in term_list:
        tokens = t.split()
        if not tokens:
            continue
        if len(tokens) > 1:
            parts.append('"' + ' '.join(tokens) + '"')
        else:
            tok = tokens[0]
            # Short or ambiguous tokens (<6 chars or 'mobili' vs 'mobilites') use exact token match; >=6 stems match Turkish suffixes ('mobilya*').
            parts.append(f'{tok}*' if (len(tok) >= 6 and tok not in _NO_PREFIX_TOKENS) else f'"{tok}"')
    return ' OR '.join(dict.fromkeys(parts))


# --- Official TOBB & Chamber of Commerce NACE Rev. 2 Classifications ---
NACE_MAP: dict[str, tuple[str, str]] = {
    # Mobilya & Ağaç Sanayi
    'furniture': ('31.09.01', 'Diğer mobilyaların imalatı'),
    'furniture store': ('47.59.01', 'Mobilya perakende ticareti'),
    'furniture manufacturer': ('31.09.01', 'Mobilya imalatı'),
    'furniture wholesaler': ('46.47.01', 'Mobilya toptan ticareti'),
    'office furniture store': ('31.01.01', 'Büro ve mağaza mobilyaları imalatı'),
    'mattress store': ('31.03.01', 'Yatak ve baza imalatı'),
    'kitchen': ('31.02.01', 'Mutfak mobilyalarının imalatı'),
    'kitchen remodeling': ('31.02.01', 'Mutfak mobilyaları imalatı ve montajı'),
    'cabinet maker': ('31.02.01', 'Mutfak ve banyo dolapları imalatı'),
    'carpenter': ('16.23.01', 'Ahşap doğrama ve marangozluk ürünleri imalatı'),
    'upholstery service': ('31.09.04', 'Koltuk, kanepe döşemesi ve imalatı'),
    'woodworking': ('16.10.01', 'Kereste ve ahşap plaka imalatı'),
    'home goods store': ('47.59.03', 'Züccaciye ve ev eşyaları perakende ticareti'),
    'carpet store': ('47.53.01', 'Halı ve zemin kaplamaları perakende ticareti'),
    'lighting store': ('47.59.02', 'Aydınlatma teçhizatı perakende ticareti'),
    'interior design': ('74.10.02', 'İç mimarların faaliyetleri'),

    # İnşaat, Yapı & Mimarlık
    'construction company': ('41.20.01', 'İkamet amaçlı binaların inşaatı (müteahhitlik)'),
    'general contractor': ('41.20.02', 'İkamet amaçlı olmayan binaların inşaatı'),
    'building supply store': ('46.73.01', 'Ağaç ve inşaat malzemesi toptan ticareti'),
    'hardware store': ('47.52.01', 'Hırdavat ve yapı market perakende ticareti'),
    'architectural designer': ('71.11.01', 'Mimarlık faaliyetleri'),
    'civil engineer': ('71.12.01', 'Mühendislik ve proje danışmanlığı'),

    # Metal, Makina & Sanayi
    'metal fabricator': ('25.11.01', 'Metal yapı ve çelik konstrüksiyon imalatı'),
    'machine shop': ('28.99.01', 'Özel amaçlı diğer makinaların imalatı ve talaşlı imalat'),
    'industrial equipment': ('46.69.01', 'Sanayi makinaları ve ekipmanları toptan ticareti'),
    'plastic': ('22.29.01', 'Plastikten diğer mamullerin imalatı ve kalıpçılık'),

    # Tekstil & Konfeksiyon
    'textile': ('13.92.01', 'Ev tekstili ve mefruşat imalatı'),
    'fabric store': ('46.41.01', 'Kumaş toptan ticareti'),
    'clothing store': ('47.71.01', 'Giyim eşyası perakende ticareti'),

    # Lojistik & Otomotiv
    'logistics': ('52.29.01', 'Lojistik ve taşımacılık destekleyici faaliyetleri'),
    'transport': ('49.41.01', 'Karayolu ile yük taşımacılığı'),
    'auto repair': ('45.20.01', 'Motorlu kara taşıtlarının bakım ve onarımı'),
    'auto parts': ('45.31.01', 'Motorlu taşıt yedek parça toptan ticareti'),

    # Gıda, Elektrik, Medikal
    'wholesale': ('46.39.01', 'Gıda toptan ticareti'),
    'electrician': ('43.21.01', 'Elektrik tesisatı ve kablolama işleri'),
    'medical supply': ('46.46.01', 'Tıbbi ürün ve gereç toptan ticareti'),
    'clinic': ('86.21.01', 'Genel hekimlik ve klinik faaliyetleri'),
}

EFATURA_CORP_RE = re.compile(
    r'\b(?:a\.?\s*ş\.?|anonim\s+şirketi|ltd\.?\s*şti\.?|limited\s+şirketi|san\.\s*ve\s*tic\.|sanayi\s+ve\s+ticaret|holding|a\.?\s*s\.?|ltd\.)\b',
    re.I,
)


def resolve_nace(category: str, name: str = '') -> tuple[str, str]:
    """Map international category tag or commercial company name into official Turkish NACE Rev. 2 code & description."""
    cat_clean = category.replace('_', ' ').strip().lower()
    if cat_clean in NACE_MAP:
        return NACE_MAP[cat_clean]
    for key, (code, desc) in NACE_MAP.items():
        if key in cat_clean:
            return code, desc
    # Keyword inference from Turkish name
    f_name = fold(name)
    if any(k in f_name for k in ('imalat', 'uretim', 'fabrika', 'sanayi', 'atolye')):
        return '31.09.01', 'Diğer mobilya ve ahşap imalatı'
    if any(k in f_name for k in ('insaat', 'yapi', 'muteahhit')):
        return '41.20.01', 'Bina inşaatı (müteahhitlik)'
    if any(k in f_name for k in ('mimarlik', 'tasarim', 'ic mimar')):
        return '71.11.01', 'Mimarlık ve tasarım faaliyetleri'
    if any(k in f_name for k in ('makina', 'makine', 'torna', 'otomasyon')):
        return '28.99.01', 'Özel amaçlı makina imalatı'
    return '47.59.01', 'Perakende ticaret / Hizmet faaliyeti'


def is_efatura_company(name: str, emails: Any = ()) -> bool:
    """Detect whether company meets official Turkish corporate entity (A.Ş. / Ltd. Şti.) or registered e-Fatura/KEP criteria."""
    if EFATURA_CORP_RE.search(name):
        return True
    if emails:
        for em in (emails if isinstance(emails, (list, set, tuple)) else []):
            em_low = str(em).lower()
            if '.kep.tr' in em_low or em_low.startswith('efatura@') or em_low.startswith('e-fatura@'):
                return True
    return False


CONTACT_MODES = (
    'all',
    'has_whatsapp',
    'has_efatura',
    'has_enterprise_mail',
    'has_email',
    'has_phone',
    'both',
    'email_only',
    'phone_only',
)


def contact_match(
    has_email: bool,
    has_phone: bool,
    mode: str = 'all',
    has_whatsapp: bool = False,
    has_efatura: bool = False,
    has_enterprise_mail: bool = False,
) -> bool:
    if mode == 'all' or not mode:
        return True
    if mode not in CONTACT_MODES:
        raise ValueError('Geçersiz iletişim filtresi')
    if mode == 'has_whatsapp':
        return has_whatsapp
    if mode == 'has_efatura':
        return has_efatura
    if mode == 'has_enterprise_mail':
        return has_enterprise_mail
    if mode == 'has_email':
        return has_email
    if mode == 'has_phone':
        return has_phone
    if mode == 'both':
        return has_email and has_phone
    if mode == 'email_only':
        return has_email and not has_phone
    if mode == 'phone_only':
        return has_phone and not has_email
    return True


def _tr_variants(s: str) -> list[str]:
    v = text(s, 120)
    if not v:
        return []
    tr_up = v.translate(str.maketrans('iıçğöşü', 'İIÇĞÖŞÜ')).upper()
    tr_lo = v.translate(str.maketrans('İIÇĞÖŞÜ', 'iıçğöşü')).lower()
    tr_ti = ' '.join((w[:1].translate(str.maketrans('iıçğöşü', 'İIÇĞÖŞÜ')).upper() + w[1:]) for w in tr_lo.split())
    return list(dict.fromkeys(x for x in (v, tr_ti, tr_lo, tr_up, fold(v)) if x))


def is_wildcard_region(region: str) -> tuple[bool, str]:
    """Detect '__all__, <Country>' or 'Tüm Şehirler, <Country>' nationwide/country-wide region specifiers."""
    reg = text(region, 200)
    if not reg:
        return False, ''
    city_part, sep, country_part = reg.partition(',')
    fc = fold(city_part)
    if fc in ('all', 'all country', 'tum sehirler', 'tum iller', 'tum ulke') or city_part.strip() in ('__all__', '__all_country__') or fc.startswith('tum '):
        return True, (country_part.strip() if sep else 'Türkiye') or 'Türkiye'
    return False, ''


def condition(
    sector: str,
    region: str,
    minimum: float | str = 0,
    box: Any = None,
    district: str = '',
) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    args: list[Any] = []
    t = terms(sector)
    if t:
        if HAS_FTS5:
            clauses.append('p.rowid IN (SELECT rowid FROM places_fts WHERE places_fts MATCH ?)')
            args.append(_fts_match_expression(t))
        else:
            like_parts: list[str] = []
            for v in t:
                if ' ' not in v and len(v) >= 6 and v not in _NO_PREFIX_TOKENS:
                    like_parts.append('p.search_text LIKE ?')
                    args.append(f'% {v}%')
                else:
                    like_parts.append('p.search_text LIKE ?')
                    args.append(f'% {v} %')
            clauses.append('(' + ' OR '.join(like_parts) + ')')
    is_wild, country_part = is_wildcard_region(region)
    if is_wild:
        clauses.append('p.region LIKE ?')
        args.append(f'%, {country_part}')
    elif region:
        clauses.append('p.region=?')
        args.append(text(region, 200))
    d_vars = _tr_variants(district)
    if d_vars:
        ph = ','.join('?' for _ in d_vars)
        addr_likes = ' OR '.join('p.address LIKE ?' for _ in d_vars[:4])
        if is_wild:
            clauses.append(
                f'(EXISTS(SELECT 1 FROM place_meta dm WHERE dm.place_id=p.id AND (dm.district IN ({ph}) OR dm.province IN ({ph}))) '
                f'OR p.region LIKE ? OR p.search_text LIKE ? OR {addr_likes})'
            )
            args.extend(d_vars)
            args.extend(d_vars)
            args.append(f'{district.strip()}, %')
            args.append(f'% {fold(district)} %')
            args.extend(f'%{dv}%' for dv in d_vars[:4])
        else:
            clauses.append(
                f'(EXISTS(SELECT 1 FROM place_meta dm WHERE dm.place_id=p.id AND dm.district IN ({ph})) '
                f'OR p.search_text LIKE ? OR {addr_likes})'
            )
            args.extend(d_vars)
            args.append(f'% {fold(district)} %')
            args.extend(f'%{dv}%' for dv in d_vars[:4])
    try:
        min_f = float(minimum)
    except (TypeError, ValueError) as exc:
        raise ValueError('Güven eşiği geçersiz') from exc
    if not 0 <= min_f <= 1:
        raise ValueError('Güven eşiği 0–1 olmalı')
    if min_f:
        clauses.append('p.confidence>=?')
        args.append(min_f)
    if box:
        w, s, e, n = bounds(box, max_area=64.0)
        clauses.append('p.lon BETWEEN ? AND ? AND p.lat BETWEEN ? AND ?')
        args += [w, e, s, n]
    return (' WHERE ' + ' AND '.join(clauses) if clauses else ''), args


_REGION_SUMMARY_CACHE: dict[tuple[Any, ...], dict[str, Any]] = {}


def portfolio_listing(
    store: Any,
    sector: str = '',
    region: str = '',
    district: str = '',
    contact_mode: str = 'all',
    minimum: float | str = 0,
    box: Any = None,
    offset: int = 0,
    limit: int = 100,
) -> dict[str, Any]:
    """Unified industrial portfolio query merging catalog places + crawled website contacts & phones."""
    if contact_mode and contact_mode not in CONTACT_MODES:
        raise ValueError('Geçersiz iletişim filtresi')
    offset_i = int(offset)
    limit_i = int(limit)
    if offset_i < 0:
        raise ValueError('Sayfa başlangıcı (offset) negatif olamaz')
    if not (1 <= limit_i <= 1000):
        raise ValueError('Sayfa sınırı (limit) 1..1000 arasında olmalı')
    where, args = condition(sector, region, minimum, box, district)
    limit = limit_i
    offset = offset_i

    target_k = offset + limit
    is_wild, wild_country = is_wildcard_region(region)
    is_unfiltered_region = (
        bool(region.strip())
        and not sector.strip()
        and (not contact_mode or contact_mode == 'all')
        and not district.strip()
        and not box
        and float(minimum or 0) == 0.0
    )

    with store.db() as c:
        if is_unfiltered_region:
            reg_clean = f'%, {wild_country}' if is_wild else text(region, 200)
            reg_op = 'LIKE' if is_wild else '='
            reg_cnt = c.execute(f'SELECT count(*) FROM places WHERE region {reg_op} ?', (reg_clean,)).fetchone()[0]
            if reg_cnt > 5000:
                db_path = getattr(store, 'path', None)
                wal_mtime = 0
                db_mtime = 0
                if isinstance(db_path, Path) and db_path.exists():
                    db_mtime = db_path.stat().st_mtime_ns
                    wal_file = db_path.with_name(db_path.name + '-wal')
                    if wal_file.exists():
                        wal_mtime = wal_file.stat().st_mtime_ns
                cache_key = (str(db_path), db_mtime, wal_mtime, reg_clean)
                summary = _REGION_SUMMARY_CACHE.get(cache_key)
                if summary is None:
                    agg = c.execute(
                        f'''SELECT count(*),
                                  coalesce(sum(p.website != ''), 0),
                                  coalesce(sum(m.emails != '' AND m.emails != '[]'), 0),
                                  coalesce(sum(m.phones != '' AND m.phones != '[]'), 0),
                                  coalesce(sum(m.emails != '' AND m.emails != '[]' AND m.phones != '' AND m.phones != '[]'), 0),
                                  coalesce(sum(m.phones LIKE '%+905%'), 0),
                                  coalesce(sum(
                                    p.name LIKE '%A.Ş.%' OR p.name LIKE '%A.S.%' OR p.name LIKE '%Anonim%'
                                    OR p.name LIKE '%Ltd.%' OR p.name LIKE '%Limited%' OR m.emails LIKE '%.kep.tr%'
                                  ), 0)
                           FROM places p LEFT JOIN place_meta m ON m.place_id = p.id
                           WHERE p.region {reg_op} ?''',
                        (reg_clean,),
                    ).fetchone()
                    group_col = 'm.province' if is_wild else 'm.district'
                    top_dists = [
                        (r[0], int(r[1]))
                        for r in c.execute(
                            f'''SELECT {group_col}, count(*) c
                               FROM places p JOIN place_meta m ON m.place_id = p.id
                               WHERE p.region {reg_op} ? AND {group_col} != ''
                               GROUP BY {group_col} ORDER BY c DESC LIMIT 16''',
                            (reg_clean,),
                        ).fetchall()
                    ]
                    summary = {
                        'total': int(agg[0]),
                        'websites': int(agg[1]),
                        'with_email': int(agg[2]),
                        'with_phone': int(agg[3]),
                        'with_both': int(agg[4]),
                        'with_whatsapp': int(agg[5]),
                        'with_efatura': int(agg[6]),
                        'with_tech': int(agg[2]),
                        'districts': top_dists,
                    }
                    if len(_REGION_SUMMARY_CACHE) > 128:
                        _REGION_SUMMARY_CACHE.clear()
                    _REGION_SUMMARY_CACHE[cache_key] = summary

                excluded = {r[0] for r in c.execute('SELECT email FROM suppression')}
                fast_rows = c.execute(
                    f'''SELECT p.id, p.name, p.category, p.region, p.address, p.lat, p.lon,
                              p.website, p.confidence, p.source,
                              m.province, m.district, m.emails, m.phones
                       FROM places p LEFT JOIN place_meta m ON m.place_id = p.id
                       WHERE p.region {reg_op} ?
                       ORDER BY p.confidence DESC
                       LIMIT ? OFFSET ?''',
                    (reg_clean, limit, offset),
                ).fetchall()
                fast_page: list[dict[str, Any]] = []
                for r in fast_rows:
                    pid = r['id']
                    ems = (set(_loads_list(r['emails'])) - excluded) if r['emails'] else set()
                    phs = set(_loads_list(r['phones'])) if r['phones'] else set()
                    wa_num = next((p for p in phs if is_whatsapp_phone(p)), '') if phs else ''
                    is_efat = is_efatura_company(r['name'], ems)
                    tech = ''
                    if ems:
                        first_em = next((e for e in ems if '@' in e), '')
                        if first_em:
                            tech = detect_tech_stack(email_domain=first_em.split('@', 1)[1].lower())
                    city = r['province'] or province_of(r['region'].split(',')[0]) or r['region'].split(',')[0].strip()
                    nace_code, nace_title = resolve_nace(r['category'], r['name'])
                    fast_page.append({
                        'id': pid,
                        'name': r['name'],
                        'category': r['category'].replace('_', ' '),
                        'city': city,
                        'district': r['district'] or '',
                        'website': r['website'],
                        'emails': sorted(ems),
                        'phones': sorted(phs),
                        'address': r['address'],
                        'lat': r['lat'],
                        'lon': r['lon'],
                        'confidence': r['confidence'],
                        'source': r['source'],
                        'nace_code': nace_code,
                        'nace_title': nace_title,
                        'efatura': is_efat,
                        'whatsapp': whatsapp_url(wa_num) if wa_num else '',
                        'whatsapp_num': wa_num,
                        'tech': tech,
                    })
                return {**summary, 'rows': fast_page, 'terms': []}

        sig_row = c.execute(
            """SELECT
                 (SELECT count(*) || ':' || coalesce(max(rowid), 0) FROM places),
                 (SELECT count(*) || ':' || coalesce(max(id), 0) FROM contacts),
                 (SELECT count(*) FROM job_phones),
                 (SELECT count(*) || ':' || coalesce(max(rowid), 0) FROM suppression)"""
        ).fetchone()
        p_cache_key = (
            str(getattr(store, 'path', id(store))),
            _CATALOG_EPOCH,
            sig_row[0],
            sig_row[1],
            sig_row[2],
            sig_row[3],
            sector.strip(),
            region.strip(),
            district.strip(),
            contact_mode or 'all',
            str(minimum),
            repr(box),
            offset,
            limit,
        )
        with _CATALOG_CACHE_LOCK:
            cached_port = _PORTFOLIO_CACHE.get(p_cache_key)
            if cached_port is not None:
                return dict(cached_port)

        prev_rf = c.row_factory
        c.row_factory = None
        try:
            excluded = {r[0] for r in c.execute('SELECT email FROM suppression')}
            place_emails: dict[str, set[str]] = {}
            for pid, em in c.execute(
                "SELECT l.place_id, t.email FROM place_jobs l JOIN contacts t ON t.job_id=l.job_id "
                "WHERE t.mx NOT IN ('nxdomain', 'null_mx')"
            ):
                if em not in excluded:
                    place_emails.setdefault(pid, set()).add(em)
            place_phones: dict[str, set[str]] = {}
            for pid, ph in c.execute(
                'SELECT l.place_id, t.phone FROM place_jobs l JOIN job_phones t ON t.job_id=l.job_id'
            ):
                place_phones.setdefault(pid, set()).add(ph)

            total = websites = with_email = with_phone = with_both = with_whatsapp = with_efatura = with_tech = 0
            top_heap: list[tuple[Any, ...]] = []
            dist_counts: dict[str, int] = {}
            cur = c.execute(
                '''SELECT p.id, p.name, p.category, p.region, p.address, p.lat, p.lon,
                          p.website, p.confidence, p.source,
                          m.province, m.district, m.emails, m.phones
                   FROM places p LEFT JOIN place_meta m ON m.place_id = p.id'''
                + where,
                args,
            )
            for idx, r in enumerate(cur):
                pid, name, cat, reg, addr, lat, lon, web, conf, src, prov, dist, raw_em, raw_ph = r

                extra_em = place_emails.get(pid)
                if raw_em and raw_em != '[]':
                    ems = (set(_loads_list(raw_em)) - excluded) if excluded else set(_loads_list(raw_em))
                    if extra_em:
                        ems |= extra_em
                else:
                    ems = set(extra_em) if extra_em else set()

                extra_ph = place_phones.get(pid)
                if raw_ph and raw_ph != '[]':
                    phs = set(_loads_list(raw_ph))
                    if extra_ph:
                        phs |= extra_ph
                else:
                    phs = set(extra_ph) if extra_ph else set()

                he, hp = bool(ems), bool(phs)
                wa_num = next((p for p in phs if is_whatsapp_phone(p)), '') if hp else ''
                has_wa = bool(wa_num)
                is_efat = is_efatura_company(name, ems)

                tech = ''
                has_ent_mail = False
                if he:
                    first_em = next((e for e in ems if '@' in e), '')
                    if first_em:
                        em_dom = first_em.split('@', 1)[1].lower()
                        tech = detect_tech_stack(email_domain=em_dom)
                        has_ent_mail = tech in ('Microsoft 365', 'Google Workspace', 'Özel Kurumsal Sunucu')

                if contact_mode != 'all' and contact_mode and not contact_match(
                    he, hp, contact_mode,
                    has_whatsapp=has_wa,
                    has_efatura=is_efat,
                    has_enterprise_mail=has_ent_mail,
                ):
                    continue

                hw = bool(web)
                total += 1
                if hw:
                    websites += 1
                if he:
                    with_email += 1
                if hp:
                    with_phone += 1
                if he and hp:
                    with_both += 1
                if has_wa:
                    with_whatsapp += 1
                if is_efat:
                    with_efatura += 1
                if tech:
                    with_tech += 1
                bucket_lbl = (prov or reg.split(',')[0].strip()) if is_wild else dist
                if bucket_lbl:
                    dist_counts[bucket_lbl] = dist_counts.get(bucket_lbl, 0) + 1

                q_score = (int(he and hp), int(he), int(hw and hp), int(hw), int(hp), float(conf or 0.0))
                entry = (q_score, -idx, r, ems, phs, wa_num, is_efat, tech)
                if len(top_heap) < target_k:
                    heapq.heappush(top_heap, entry)
                elif entry > top_heap[0]:
                    heapq.heapreplace(top_heap, entry)
        finally:
            c.row_factory = prev_rf

        top_heap.sort(reverse=True)
        page_rows: list[dict[str, Any]] = []
        for _, _, r, ems, phs, wa_num, is_efat, tech in top_heap[offset:target_k]:
            pid, name, cat, reg, addr, lat, lon, web, conf, src, prov, dist, _, _ = r
            city = prov or province_of(reg.split(',')[0]) or reg.split(',')[0].strip()
            nace_code, nace_title = resolve_nace(cat, name)
            page_rows.append({
                'id': pid,
                'name': name,
                'category': cat.replace('_', ' '),
                'city': city,
                'district': dist or '',
                'website': web,
                'emails': sorted(ems),
                'phones': sorted(phs),
                'address': addr,
                'lat': lat,
                'lon': lon,
                'confidence': conf,
                'source': src,
                'nace_code': nace_code,
                'nace_title': nace_title,
                'efatura': is_efat,
                'whatsapp': whatsapp_url(wa_num) if wa_num else '',
                'whatsapp_num': wa_num,
                'tech': tech,
            })

    out_port = {
        'total': total,
        'websites': websites,
        'with_email': with_email,
        'with_phone': with_phone,
        'with_both': with_both,
        'with_whatsapp': with_whatsapp,
        'with_efatura': with_efatura,
        'with_tech': with_tech,
        'districts': sorted(dist_counts.items(), key=lambda kv: kv[1], reverse=True)[:16],
        'rows': page_rows,
        'terms': terms(sector),
    }
    with _CATALOG_CACHE_LOCK:
        if len(_PORTFOLIO_CACHE) >= 96:
            _PORTFOLIO_CACHE.clear()
        _PORTFOLIO_CACHE[p_cache_key] = out_port
    return dict(out_port)


def listing(
    store: Any,
    sector: str = '',
    region: str = '',
    minimum: float | str = 0,
    box: Any = None,
    offset: int = 0,
    district: str = '',
) -> dict[str, Any]:
    where, args = condition(sector, region, minimum, box, district)
    with store.db() as c:
        stats = dict(
            c.execute(
                "SELECT count(*) total, coalesce(sum(p.website != ''), 0) websites FROM places p" + where,
                args,
            ).fetchone()
        )
        rows = [
            dict(r)
            for r in c.execute(
                '''SELECT p.*, m.district, m.phones AS meta_phones, m.emails AS meta_emails,
                          (SELECT count(*) FROM place_jobs j WHERE j.place_id=p.id) tasks
                   FROM places p LEFT JOIN place_meta m ON m.place_id=p.id'''
                + where
                + " ORDER BY (p.website!='') DESC, p.confidence DESC, p.id LIMIT 100 OFFSET ?",
                args + [max(0, offset)],
            )
        ]
    return {**stats, 'rows': rows, 'terms': terms(sector)}


def queue(
    store: Any,
    sector: str,
    region: str,
    minimum: float | str = 0,
    box: Any = None,
    limit: int = 1000,
    district: str = '',
) -> dict[str, int]:
    sec = text(sector, 200)
    reg = text(region, 200)
    if not sec or not reg:
        raise ValueError('Sektör ve bölge gerekli')
    if not 1 <= limit <= 100000:
        raise ValueError('Kuyruk sınırı 1–100.000')
    where, args = condition(sec, reg, minimum, box, district)
    stamp = now()
    with store.db() as c:
        c.execute('BEGIN IMMEDIATE')
        records = c.execute(
            'SELECT p.id, p.website, p.source FROM places p'
            + where
            + ''' AND p.website!='' AND NOT EXISTS(
                  SELECT 1 FROM place_jobs l JOIN jobs j ON j.id=l.job_id
                  WHERE l.place_id=p.id AND j.sector=? AND j.region=?)
                  ORDER BY p.confidence DESC, p.id LIMIT ?''',
            args + [sec, reg, limit],
        ).fetchall()
        if not records:
            return {'added': 0, 'linked': 0, 'selected': 0}

        added = 0
        job_rows: list[tuple[str, str, str, str, str, str, str]] = []
        domains_needed: set[str] = set()
        place_domains: list[tuple[str, str]] = []
        for r in records:
            u = r['website']
            dom = domain_key(u)
            domains_needed.add(dom)
            place_domains.append((r['id'], dom))
            job_rows.append((u, dom, sec, reg, r['source'] + ' / ' + r['id'], stamp, stamp))

        before_changes = c.total_changes
        c.executemany(
            'INSERT OR IGNORE INTO jobs(url,domain,sector,region,origin,added,updated) VALUES(?,?,?,?,?,?,?)',
            job_rows,
        )
        added = c.total_changes - before_changes

        dom_to_jid: dict[str, int] = {}
        dom_list = list(domains_needed)
        for idx in range(0, len(dom_list), 500):
            chunk = dom_list[idx:idx + 500]
            placeholders = ','.join('?' for _ in chunk)
            for jr in c.execute(
                f'SELECT id, domain FROM jobs WHERE sector=? AND region=? AND domain IN ({placeholders})',
                [sec, reg] + chunk,
            ):
                dom_to_jid[jr['domain']] = jr['id']

        link_rows = [(pid, dom_to_jid[dom]) for pid, dom in place_domains if dom in dom_to_jid]
        before_links = c.total_changes
        c.executemany('INSERT OR IGNORE INTO place_jobs VALUES(?,?)', link_rows)
        linked = c.total_changes - before_links

    return {'added': added, 'linked': linked, 'selected': len(records)}


def _download_legacy_cli(store: Any, region: str, w: float, s: float, e: float, n: float) -> dict[str, int]:
    executable = Path(sys.executable).parent / 'overturemaps'
    cli = str(executable) if executable.is_file() else shutil.which('overturemaps')
    if not cli:
        raise ValueError('Overture motoru kurulu değil. setup.command çalıştırın veya GeoJSON içe aktarın.')
    with tempfile.TemporaryDirectory(prefix='lead_overture_') as tmp:
        file = Path(tmp) / 'places.geojson'
        log = Path(tmp) / 'download.log'
        cmd = [cli, 'download', f'--bbox={w},{s},{e},{n}', '-f', 'geojson', '--type=place', '-o', str(file)]
        with log.open('wb') as err:
            proc = subprocess.Popen(cmd, stdout=err, stderr=err)
            try:
                start = time.monotonic()
                while proc.poll() is None:
                    if (
                        time.monotonic() - start > 300
                        or (file.exists() and file.stat().st_size > MAX_BYTES)
                        or log.stat().st_size > 4 * 1024 * 1024
                    ):
                        raise ValueError('İndirme zaman/boyut sınırı; daha küçük alan seçin')
                    time.sleep(0.25)
                if proc.returncode != 0:
                    raise ValueError('Overture indirme hatası: ' + log.read_bytes()[-800:].decode(errors='replace'))
            finally:
                if proc.poll() is None:
                    proc.kill()
                    proc.wait()
        if not file.exists() or file.stat().st_size > MAX_BYTES:
            raise ValueError('Geçersiz veya büyük veri dosyası')
        data = json.loads(file.read_bytes())
        return ingest(store, data, region, f'{SOURCE} / CLI, bbox {w},{s},{e},{n}')


def deduplicate_region(store: Any, region: str) -> int:
    """Fuse duplicate spatial pins within ~55m (exact folded name or shared phone + brand stem) into a single clean record."""
    with store.db() as c:
        rows = c.execute(
            '''SELECT p.id, p.name, p.lat, p.lon, p.website, p.address, p.confidence,
                      m.province, m.district, m.emails, m.phones
               FROM places p LEFT JOIN place_meta m ON m.place_id = p.id
               WHERE p.region = ?''',
            (region,),
        ).fetchall()

    if len(rows) < 2:
        return 0

    def richness(r: sqlite3.Row) -> tuple[int, int, int, float, int]:
        ems = json.loads(r['emails'] or '[]')
        phs = json.loads(r['phones'] or '[]')
        return (int(bool(r['website'])), len(ems), len(phs), float(r['confidence'] or 0.0), len(r['address'] or ''))

    sorted_rows = sorted(rows, key=richness, reverse=True)
    name_grid: dict[tuple[str, int, int], dict[str, Any]] = {}
    phone_grid: dict[tuple[str, str, int, int], dict[str, Any]] = {}
    merges: dict[str, dict[str, Any]] = {}
    drop_ids: list[str] = []
    relink_pairs: list[tuple[str, str]] = []

    for r in sorted_rows:
        pid = r['id']
        fname = fold(r['name'])
        if not fname:
            continue
        first_tok = fname.split()[0]
        gx, gy = round(float(r['lat']) * 1800), round(float(r['lon']) * 1800)
        px, py = round(float(r['lat']) * 900), round(float(r['lon']) * 900)
        ems = set(json.loads(r['emails'] or '[]'))
        phs = set(json.loads(r['phones'] or '[]'))

        survivor: dict[str, Any] | None = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                cand = name_grid.get((fname, gx + dx, gy + dy))
                if cand is not None:
                    survivor = cand
                    break
            if survivor is not None:
                break

        if survivor is None and len(first_tok) >= 4 and phs:
            for ph in phs:
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        cand = phone_grid.get((ph, first_tok, px + dx, py + dy))
                        if cand is not None:
                            survivor = cand
                            break
                    if survivor is not None:
                        break
                if survivor is not None:
                    break

        if survivor is not None:
            drop_ids.append(pid)
            relink_pairs.append((pid, survivor['id']))
            survivor['emails'] |= ems
            survivor['phones'] |= phs
            if not survivor['website'] and r['website']:
                survivor['website'] = r['website']
            if len(r['address'] or '') > len(survivor['address']):
                survivor['address'] = r['address']
            if not survivor['district'] and r['district']:
                survivor['district'] = r['district']
            if not survivor['province'] and r['province']:
                survivor['province'] = r['province']
            survivor['dirty'] = True
            merges[survivor['id']] = survivor
            continue

        entry = {
            'id': pid,
            'website': r['website'] or '',
            'address': r['address'] or '',
            'province': r['province'] or '',
            'district': r['district'] or '',
            'emails': ems,
            'phones': phs,
            'dirty': False,
        }
        name_grid[(fname, gx, gy)] = entry
        if len(first_tok) >= 4:
            for ph in phs:
                phone_grid[(ph, first_tok, px, py)] = entry

    if not drop_ids:
        return 0

    with store.db() as c:
        for old_pid, surv_id in relink_pairs:
            c.execute(
                'INSERT OR IGNORE INTO place_jobs(place_id, job_id) SELECT ?, job_id FROM place_jobs WHERE place_id=?',
                (surv_id, old_pid),
            )
        for surv in merges.values():
            if not surv['dirty']:
                continue
            c.execute(
                'UPDATE places SET website=?, address=? WHERE id=?',
                (surv['website'], surv['address'], surv['id']),
            )
            c.execute(
                '''INSERT INTO place_meta VALUES(?,?,?,?,?)
                   ON CONFLICT(place_id) DO UPDATE SET
                     province=excluded.province, district=excluded.district,
                     emails=excluded.emails, phones=excluded.phones''',
                (
                    surv['id'],
                    surv['province'],
                    surv['district'],
                    json.dumps(sorted(surv['emails'])),
                    json.dumps(sorted(surv['phones'])),
                ),
            )
        for idx in range(0, len(drop_ids), 500):
            chunk = drop_ids[idx:idx + 500]
            placeholders = ','.join('?' for _ in chunk)
            c.execute(f'DELETE FROM places WHERE id IN ({placeholders})', chunk)

    _bump_catalog_epoch()
    return len(drop_ids)


def download(
    store: Any,
    region: str,
    box: Any,
    sector: str = '',
    source_mode: str = 'hybrid',
) -> dict[str, int]:
    region = text(region, 200)
    if not region:
        raise ValueError('Bölge etiketi gerekli')
    w, s, e, n = bounds(box, max_area=64.0)
    mode = source_mode if source_mode in ('hybrid', 'overture', 'osm') else 'hybrid'

    if mode == 'osm':
        els = _fetch_osm_overpass(w, s, e, n, sector)
        osm_res = _ingest_osm_elements(store, els, region, sector)
        deduped = deduplicate_region(store, region)
        return {
            'read': osm_res['osm_read'],
            'valid': max(0, osm_res['osm_added'] + osm_res['osm_merged'] - deduped),
            'unique': max(0, osm_res['osm_added'] - deduped),
            'skipped': deduped,
            'websites': listing(store, sector, region)['websites'] if sector else 0,
            'deduped': deduped,
            **osm_res,
        }

    # Run Overture S3 PyArrow columnar stream and (in hybrid mode) OSM Overpass in parallel!
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        osm_future = (
            pool.submit(_fetch_osm_overpass, w, s, e, n, sector)
            if mode == 'hybrid'
            else None
        )
        if HAS_OVERTURE_CORE:
            base = _stream_overture_arrow(store, region, w, s, e, n)
        else:
            base = _download_legacy_cli(store, region, w, s, e, n)

        osm_stats = {'osm_read': 0, 'osm_added': 0, 'osm_merged': 0}
        if osm_future is not None:
            try:
                els = osm_future.result(timeout=40.0)
                if els:
                    osm_stats = _ingest_osm_elements(store, els, region, sector)
            except Exception:
                pass

    deduped = deduplicate_region(store, region)
    base['unique'] = max(0, base['unique'] + osm_stats['osm_added'] - deduped)
    base['valid'] = max(0, base['valid'] + osm_stats['osm_added'] - deduped)
    base['deduped'] = deduped
    base.update(osm_stats)
    return base
