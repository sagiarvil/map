'use strict';

(function () {
  const $ = id => document.getElementById(id);
  const fmt = n => Number(n || 0).toLocaleString('tr-TR');
  const PAGE_SIZE = 100;
  const LOCAL_API = 'http://127.0.0.1:8765';

  const TR_PROVINCES = [
    'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya',
    'Ardahan', 'Artvin', 'Aydın', 'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik',
    'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum',
    'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir',
    'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Iğdır', 'Isparta', 'İstanbul',
    'İzmir', 'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kırıkkale',
    'Kırklareli', 'Kırşehir', 'Kilis', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa',
    'Mardin', 'Mersin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye',
    'Rize', 'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas', 'Şanlıurfa', 'Şırnak',
    'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat', 'Zonguldak'
  ];

  // West, South, East, North full-province boxes for fast discovery
  const CITY_BOXES = {
    'İzmir': '26.22,37.88,28.50,39.38',
    'İstanbul': '28.00,40.80,29.95,41.55',
    'Ankara': '31.80,39.40,33.60,40.45',
    'Bursa': '28.15,39.75,29.95,40.60',
    'Kayseri': '34.90,38.40,36.00,39.05',
    'Konya': '32.10,37.45,33.15,38.30',
    'Antalya': '29.60,36.15,32.30,37.25',
    'Gaziantep': '36.95,36.80,38.05,37.45',
    'Adana': '34.80,36.55,36.15,37.65',
    'Mersin': '33.20,36.10,35.10,37.15',
    'Kocaeli': '29.20,40.60,30.35,41.20',
    'Denizli': '28.65,37.35,29.95,38.25',
    'Manisa': '27.15,38.30,28.90,39.25',
    'Sakarya': '30.10,40.45,31.05,41.15',
    'Eskişehir': '30.20,39.40,31.50,40.10',
    'Aydın': '27.15,37.30,28.85,38.10',
    'Muğla': '27.20,36.35,29.35,37.45',
    'Samsun': '35.40,41.00,37.15,41.75',
    'Hatay': '35.75,35.85,36.70,36.95',
    'Tekirdağ': '26.85,40.75,28.15,41.55',
    'Balıkesir': '26.60,39.15,28.65,40.45',
    'Kahramanmaraş': '36.15,37.20,37.75,38.35',
    'Şanlıurfa': '37.85,36.65,40.15,37.95',
    'Diyarbakır': '39.50,37.45,41.25,38.65',
    'Trabzon': '39.15,40.55,40.45,41.15'
  };

  const DEFAULT_DISTRICTS = {
    'İzmir': [
      'Aliağa', 'Balçova', 'Bayındır', 'Bayraklı', 'Bergama', 'Beydağ', 'Bornova', 'Buca',
      'Çeşme', 'Çiğli', 'Dikili', 'Foça', 'Gaziemir', 'Güzelbahçe', 'Karabağlar', 'Karaburun',
      'Karşıyaka', 'Kemalpaşa', 'Kınık', 'Kiraz', 'Konak', 'Menderes', 'Menemen', 'Narlıdere',
      'Ödemiş', 'Seferihisar', 'Selçuk', 'Tire', 'Torbalı', 'Urla'
    ],
    'İstanbul': [
      'Arnavutköy', 'Ataşehir', 'Avcılar', 'Bağcılar', 'Bahçelievler', 'Bakırköy', 'Başakşehir',
      'Bayrampaşa', 'Beşiktaş', 'Beykoz', 'Beylikdüzü', 'Beyoğlu', 'Büyükçekmece', 'Çekmeköy',
      'Esenler', 'Esenyurt', 'Eyüpsultan', 'Fatih', 'Gaziosmanpaşa', 'Güngören', 'Kadıköy',
      'Kağıthane', 'Kartal', 'Küçükçekmece', 'Maltepe', 'Pendik', 'Sancaktepe', 'Sarıyer',
      'Silivri', 'Sultanbeyli', 'Sultangazi', 'Şişli', 'Tuzla', 'Ümraniye', 'Üsküdar', 'Zeytinburnu'
    ],
    'Ankara': [
      'Altındağ', 'Çankaya', 'Etimesgut', 'Gölbaşı', 'Kahramankazan', 'Keçiören', 'Mamak',
      'Polatlı', 'Pursaklar', 'Sincan', 'Yenimahalle', 'Akyurt', 'Çubuk', 'Elmadağ'
    ],
    'Bursa': [
      'İnegöl', 'Nilüfer', 'Osmangazi', 'Yıldırım', 'Gemlik', 'Gürsu', 'Kestel',
      'Mudanya', 'Mustafakemalpaşa', 'Karacabey', 'Orhangazi'
    ],
    'Kayseri': ['Melikgazi', 'Kocasinan', 'Talas', 'İncesu', 'Develi']
  };

  const OSM_SECTOR_TAGS = {
    mobilya: ['["shop"="furniture"]', '["craft"="carpenter"]', '["craft"="upholsterer"]', '["shop"="kitchen"]', '["shop"="bed"]', '["shop"="interior_decoration"]'],
    mutfak: ['["shop"="kitchen"]', '["craft"="cabinet_maker"]', '["shop"="appliance"]'],
    ahsap: ['["craft"="carpenter"]', '["craft"="sawmill"]', '["shop"="Timber"]', '["shop"="doityourself"]'],
    dekorasyon: ['["shop"="interior_decoration"]', '["shop"="curtain"]', '["shop"="carpet"]', '["shop"="lighting"]', '["office"="interior_design"]'],
    insaat: ['["office"="construction_company"]', '["shop"="trade"]', '["shop"="building_materials"]', '["shop"="hardware"]'],
    muteahhit: ['["office"="construction_company"]', '["office"="architect"]', '["office"="engineer"]'],
    mimar: ['["office"="architect"]', '["office"="interior_design"]'],
    metal: ['["craft"="metal_construction"]', '["industrial"="metal"]', '["craft"="welder"]'],
    makina: ['["industrial"="machine_shop"]', '["craft"="machinist"]', '["industrial"="factory"]'],
    plastik: ['["industrial"="plastic"]', '["industrial"="packaging"]', '["industrial"="factory"]'],
    tekstil: ['["shop"="fabric"]', '["craft"="tailor"]', '["shop"="clothes"]', '["industrial"="textile"]'],
    lojistik: ['["office"="logistics"]', '["office"="transport"]', '["building"="warehouse"]'],
    otomotiv: ['["shop"="car_repair"]', '["shop"="car_parts"]', '["shop"="car"]', '["shop"="tyres"]'],
    gida: ['["shop"="wholesale"]', '["shop"="supermarket"]', '["shop"="bakery"]', '["shop"="butcher"]'],
    elektrik: ['["craft"="electrician"]', '["shop"="electronics"]', '["shop"="lighting"]', '["office"="energy_supplier"]'],
    medikal: ['["shop"="medical_supply"]', '["amenity"="clinic"]', '["amenity"="doctors"]', '["amenity"="dentist"]']
  };

  const OVERPASS_MIRRORS = [
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];

  // State
  let manifest = { shards: {}, districts: {}, taxonomy: {} };
  const shardCache = new Map(); // key -> { city, region, records }
  const mxCache = new Map();    // domain -> 'mx' | 'none'
  let turboConnected = false;
  let turboToken = '';
  let turboPollTimer = null;

  let activeRecords = [];       // All filtered records in Cloud/Memory mode
  let turboPageData = null;     // Server-side page response when using Turbo DB directly
  let currentOffset = 0;
  let activeMode = 'cloud';     // 'cloud' | 'turbo-db'
  let hasStartedSearch = false; // Never auto-populate results before user clicks "Firmaları Bul & Getir"
  let searchInFlight = false;

  const CATEGORY_TR = {
    'furniture store': 'Mobilya Mağazası',
    'furniture manufacturer': 'Mobilya Üreticisi',
    'furniture wholesaler': 'Toptan Mobilya',
    'furniture assembly': 'Mobilya Montaj & Uygulama',
    'office furniture store': 'Ofis Mobilyaları',
    'mattress store': 'Yatak & Baza Mağazası',
    'home goods store': 'Ev & Dekorasyon',
    'carpet store': 'Halı & Zemin Mağazası',
    'rug store': 'Halı & Kilim Mağazası',
    'lighting store': 'Aydınlatma & Avize',
    'interior design': 'İç Mimarlık & Tasarım',
    'kitchen remodeling': 'Mutfak & Dolap Tasarım',
    'cabinet maker': 'Mutfak & Mobilya İmalatı',
    'carpenter': 'Marangoz & Ahşap Atölyesi',
    'upholstery service': 'Koltuk Döşeme & İmalat',
    'woodworking': 'Ahşap İşleme & Doğrama',
    'hardware store': 'Yapı Market & Hırdavat',
    'building supply store': 'İnşaat & Yapı Malzemeleri',
    'general contractor': 'Müteahhitlik & İnşaat',
    'construction company': 'İnşaat Firması',
    'architectural designer': 'Mimarlık Ofisi',
    'metal fabricator': 'Metal & Çelik İmalat',
    'machine shop': 'Makina & Torna Sanayi',
    'industrial equipment': 'Endüstriyel Ekipman'
  };

  function formatCategoryLabel(cat, fallbackSector) {
    const raw = String(cat || '').trim();
    if (!raw) return fallbackSector || 'İşletme';
    const key = raw.toLowerCase();
    return CATEGORY_TR[key] || raw;
  }

  function resetResultsView(bannerMsg = '') {
    activeRecords = [];
    turboPageData = null;
    $('resultsSection').hidden = true;
    $('emptyPrompt').hidden = false;
    $('enrichBtn').disabled = true;
    $('exportXlsxBtn').disabled = true;
    $('exportCsvBtn').disabled = true;
    $('districtStrip').replaceChildren();
    $('resultsBody').replaceChildren();

    if (bannerMsg) {
      setStatus(bannerMsg, 'Hazır', false, null);
    } else {
      $('statusBanner').hidden = true;
    }
  }

  // Helpers
  function fold(s) {
    if (!s) return '';
    return String(s)
      .replace(/İ/g, 'i')
      .replace(/I/g, 'i')
      .replace(/ı/g, 'i')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function slugify(s) {
    return fold(s).replace(/\s+/g, '-');
  }

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined && text !== null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  function setStatus(msg, badgeText = '', isError = false, progress = null) {
    const banner = $('statusBanner');
    if (!msg) {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    banner.classList.toggle('error', Boolean(isError));
    $('statusText').textContent = msg;
    $('statusSub').textContent = badgeText || '';
    $('statusSub').hidden = !badgeText;
    const track = $('progressTrack');
    const bar = $('progressBar');
    if (progress === null) {
      track.hidden = true;
    } else {
      track.hidden = false;
      bar.style.width = `${Math.max(4, Math.min(100, progress))}%`;
    }
  }

  function expandSectorTerms(sectorRaw) {
    const parts = String(sectorRaw || '').split(/[|,;]+/).map(fold).filter(Boolean);
    const out = [];
    for (const p of parts) {
      out.push(p);
      const aliases = manifest.taxonomy[p];
      if (Array.isArray(aliases)) {
        for (const a of aliases) out.push(a);
      }
    }
    return Array.from(new Set(out));
  }

  function matchesTerms(searchText, termList) {
    if (!termList.length) return true;
    for (const t of termList) {
      if (t.includes(' ')) {
        if (searchText.includes(` ${t} `)) return true;
      } else if (t.length >= 5) {
        if (searchText.includes(` ${t}`)) return true;
      } else {
        if (searchText.includes(` ${t} `)) return true;
      }
    }
    return false;
  }

  function matchesContact(hasEmail, hasPhone, mode) {
    switch (mode) {
      case 'has_email': return hasEmail;
      case 'has_phone': return hasPhone;
      case 'both': return hasEmail && hasPhone;
      case 'email_only': return hasEmail && !hasPhone;
      case 'phone_only': return hasPhone && !hasEmail;
      default: return true;
    }
  }

  function currentFilters() {
    const country = $('countrySelect').value;
    const city = country === 'Türkiye'
      ? $('citySelect').value
      : ($('cityCustomInput').value.trim() || 'Berlin');
    const district = $('districtSelect').value.trim();
    const sector = $('sectorInput').value.trim();
    const contactMode = $('contactModeSelect').value;
    const quick = fold($('quickSearchInput').value);
    const region = `${city}, ${country}`;
    return { country, city, district, sector, contactMode, quick, region };
  }

  // Apple Motion Architecture
  function initMotion() {
    const nodes = Array.from(document.querySelectorAll('.reveal'));
    if (!('IntersectionObserver' in window)) {
      nodes.forEach(n => n.classList.add('is-visible'));
      return;
    }
    let batch = [];
    let raf = null;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          batch.push(e.target);
          io.unobserve(e.target);
        }
      }
      if (batch.length && !raf) {
        raf = requestAnimationFrame(() => {
          batch.forEach((node, idx) => {
            node.style.setProperty('--stagger', `${idx * 80}ms`);
            node.classList.add('is-visible');
          });
          batch = [];
          raf = null;
        });
      }
    }, { threshold: 0.06 });
    nodes.forEach(n => io.observe(n));
  }

  // Populate UI Selects
  function populateCities() {
    const sel = $('citySelect');
    const prev = sel.value || 'İzmir';
    sel.replaceChildren();
    for (const prov of TR_PROVINCES) {
      const opt = el('option', prov);
      opt.value = prov;
      if (prov === prev) opt.selected = true;
      sel.append(opt);
    }
  }

  function populateDistricts(city, extraDistricts = []) {
    const sel = $('districtSelect');
    const prev = sel.value;
    sel.replaceChildren();
    const allOpt = el('option', 'Tüm İlçeler');
    allOpt.value = '';
    sel.append(allOpt);

    const fromManifest = (manifest.districts && manifest.districts[city]) || [];
    const fromDefault = DEFAULT_DISTRICTS[city] || [];
    const merged = Array.from(new Set([...fromManifest, ...fromDefault, ...extraDistricts].filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'tr'));

    for (const d of merged) {
      const opt = el('option', d);
      opt.value = d;
      if (d === prev) opt.selected = true;
      sel.append(opt);
    }
  }

  // Local Mac Turbo Bridge Check
  async function probeTurboBridge() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1600);
      const res = await fetch(`${LOCAL_API}/api/session`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error('status ' + res.status);
      const data = await res.json();
      if (data && data.token) {
        turboConnected = true;
        turboToken = data.token;
        const badge = $('engineBadge');
        badge.className = 'engine-badge turbo';
        $('engineText').textContent = 'Hızlı Tarama Aktif';
        $('enrichBtn').textContent = 'Web Sitelerinden E-posta Tara';
        return true;
      }
    } catch {
      // Expected on remote PCs/phones where local Mac server is not running
    }
    turboConnected = false;
    turboToken = '';
    const badge = $('engineBadge');
    badge.className = 'engine-badge cloud';
    $('engineText').textContent = 'Hazır';
    $('enrichBtn').textContent = 'E-posta Kayıtlarını Doğrula';
    return false;
  }

  async function turboApi(path, body) {
    const res = await fetch(`${LOCAL_API}/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'X-Local-Token': turboToken,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || 'Yerel motor hatası');
    return payload;
  }

  // Zero-allocation lazy tuple wrapper for instant (<5ms) scanning across 500k+ megacity shards
  function unpackShard(data) {
    const cats = data.cats || [];
    const catsSearch = cats.map(c => ` ${fold(c)} `);
    const dists = data.dists || [''];
    const distsFolded = dists.map(d => fold(d));
    const city = data.city || '';
    const rows = data.rows || [];
    return {
      isTupleShard: true,
      city,
      region: data.region || city,
      cats,
      catsSearch,
      dists,
      distsFolded,
      rows
    };
  }

  function materializeTuple(dataset, r) {
    return {
      name: r[0] || '',
      category: dataset.cats[r[1]] || 'İşletme',
      city: dataset.city,
      district: dataset.dists[r[2]] || '',
      website: r[3] || '',
      emails: Array.isArray(r[4]) ? r[4] : [],
      phones: Array.isArray(r[5]) ? r[5] : [],
      address: r[6] || '',
      lat: r[7],
      lon: r[8],
      conf: r[9] || 75
    };
  }

  async function loadCdnShard(slug) {
    if (shardCache.has(slug)) return shardCache.get(slug);
    const meta = manifest.shards && manifest.shards[slug];
    if (!meta) return null;
    setStatus(`${meta.city} firma rehberi yükleniyor…`, 'Yükleniyor', false, 45);
    const res = await fetch(meta.file);
    if (!res.ok) throw new Error('Veri paketi okunamadı');
    const buf = await res.arrayBuffer();
    const u8 = new Uint8Array(buf);
    let raw;
    if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b && typeof DecompressionStream === 'function') {
      const ds = new DecompressionStream('gzip');
      const decompressed = new Response(new Blob([u8]).stream().pipeThrough(ds));
      raw = await decompressed.json();
    } else {
      raw = JSON.parse(new TextDecoder('utf-8').decode(u8));
    }
    const unpacked = unpackShard(raw);
    shardCache.set(slug, unpacked);
    return unpacked;
  }

  // Live OpenStreetMap Nominatim + Overpass Discovery for any un-sharded city in the world
  async function resolveCityBbox(city, country) {
    if (country === 'Türkiye' && CITY_BOXES[city]) {
      const [w, s, e, n] = CITY_BOXES[city].split(',').map(Number);
      return [w, s, e, n];
    }
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' +
      encodeURIComponent(`${city}, ${country}`);
    const res = await fetch(url, { headers: { 'Accept-Language': 'tr,en' } });
    if (!res.ok) throw new Error('Bölge koordinatı çözümlenemedi');
    const arr = await res.json();
    if (!arr.length || !arr[0].boundingbox) {
      throw new Error(`"${city}, ${country}" için harita sınırı bulunamadı`);
    }
    // Nominatim boundingbox is [south, north, west, east]
    const [south, north, west, east] = arr[0].boundingbox.map(Number);
    return [west, south, east, north];
  }

  function normalizePhoneClient(raw) {
    if (!raw) return '';
    const digits = String(raw).replace(/\D+/g, '');
    if (digits.length === 10 && digits.startsWith('5')) return '+90' + digits;
    if (digits.length === 10 && /^[2348]/.test(digits)) return '+90' + digits;
    if (digits.length === 11 && digits.startsWith('0')) return '+90' + digits.slice(1);
    if (digits.length === 12 && digits.startsWith('90')) return '+' + digits;
    if (digits.length >= 10 && digits.length <= 15) return '+' + digits;
    return '';
  }

  async function fetchLiveOverpassCity(city, country, sector) {
    const cacheKey = `osm:${slugify(city)}:${slugify(country)}:${fold(sector || 'all')}`;
    if (shardCache.has(cacheKey)) return shardCache.get(cacheKey);

    setStatus(`${city}, ${country} coğrafi sınırları çözümleniyor…`, 'Canlı Keşif', false, 20);
    const [w, s, e, n] = await resolveCityBbox(city, country);
    const bb = `(${s},${w},${n},${e})`;
    const area = Math.abs((e - w) * (n - s));
    const fsec = fold((sector || '').split('|')[0]);
    let tagClauses = OSM_SECTOR_TAGS[fsec] ? [...OSM_SECTOR_TAGS[fsec]] : [];

    if (!tagClauses.length && sector) {
      const safeTok = sector.replace(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü ]/g, '').trim();
      if (safeTok.length >= 3 && area <= 1.6) {
        tagClauses.push(`["name"~"${safeTok}",i]`);
      }
      tagClauses.push('["shop"]', '["craft"]', '["office"]');
    }
    if (!tagClauses.length) {
      tagClauses = ['["shop"]', '["craft"]', '["office"]', '["industrial"]'];
    }

    const body = `[out:json][timeout:28];(${tagClauses.slice(0, 6).map(t => `nwr${t}${bb};`).join('')});out center tags;`;
    setStatus(`${city} için canlı OpenStreetMap veri kümeleri taranıyor…`, 'Overpass API', false, 55);

    let elements = null;
    for (const endpoint of OVERPASS_MIRRORS) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: 'data=' + encodeURIComponent(body)
        });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.elements)) {
            elements = json.elements;
            break;
          }
        }
      } catch {
        // Try next mirror
      }
    }
    if (!elements) {
      throw new Error('Canlı harita sunucuları şu an yoğun; lütfen birkaç saniye sonra tekrar deneyin.');
    }

    const seen = new Set();
    const records = [];
    const distSet = new Set();

    for (const elItem of elements) {
      const tags = elItem.tags || {};
      const name = String(tags.name || tags.brand || '').trim();
      if (!name) continue;
      const lat = elItem.lat ?? (elItem.center && elItem.center.lat);
      const lon = elItem.lon ?? (elItem.center && elItem.center.lon);
      if (typeof lat !== 'number' || typeof lon !== 'number') continue;

      const dedupKey = `${fold(name)}:${Math.round(lat * 1000)}:${Math.round(lon * 1000)}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      let website = String(tags.website || tags['contact:website'] || tags.url || '').trim();
      if (website && !/^https?:\/\//i.test(website)) website = 'https://' + website;

      const emails = [];
      for (const emRaw of [tags.email, tags['contact:email']]) {
        if (emRaw) {
          for (const part of String(emRaw).split(/[;,|\s]+/)) {
            if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(part)) emails.push(part.toLowerCase());
          }
        }
      }

      const phones = [];
      for (const phRaw of [tags.phone, tags['contact:phone'], tags.mobile, tags['contact:mobile'], tags['contact:whatsapp']]) {
        if (phRaw) {
          for (const part of String(phRaw).split(/[;,|/]+/)) {
            const np = normalizePhoneClient(part);
            if (np && !phones.includes(np)) phones.push(np);
          }
        }
      }

      const district = String(tags['addr:district'] || tags['addr:city_district'] || tags['addr:town'] || tags['addr:suburb'] || '').trim();
      if (district) distSet.add(district);
      const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
      const address = [street, tags['addr:neighbourhood'], district, city].filter(Boolean).join(', ');
      const category = String(tags.shop || tags.craft || tags.industrial || tags.office || tags.amenity || sector || 'İşletme').replace(/_/g, ' ');

      const search = ` ${fold(name)} ${fold(category)} ${fold(sector)} `;
      const quickBlob = fold(`${name} ${district} ${website} ${emails.join(' ')} ${phones.join(' ')} ${address}`);
      records.push({
        name,
        category,
        city,
        district,
        website,
        emails: Array.from(new Set(emails)),
        phones,
        address,
        lat,
        lon,
        conf: 85,
        search,
        quickBlob
      });
    }

    records.sort((a, b) => (Boolean(b.website) - Boolean(a.website)) || ((b.emails.length + b.phones.length) - (a.emails.length + a.phones.length)));
    populateDistricts(city, Array.from(distSet));
    const packed = { city, region: `${city}, ${country}`, records };
    shardCache.set(cacheKey, packed);
    return packed;
  }

  // Render District Quick Strip from [district, count] pairs
  function renderDistrictCounts(entries, totalCount, selectedDistrict) {
    const strip = $('districtStrip');
    strip.replaceChildren();
    if (!entries || !entries.length) return;

    const top = entries.slice(0, 14);
    const allBtn = el('button', `Tüm İlçeler (${fmt(totalCount)})`, 'chip' + (!selectedDistrict ? ' active' : ''));
    allBtn.type = 'button';
    allBtn.addEventListener('click', () => {
      $('districtSelect').value = '';
      currentOffset = 0;
      executeSearch(false);
    });
    strip.append(allBtn);

    for (const [dist, cnt] of top) {
      const b = el('button', `${dist} (${fmt(cnt)})`, 'chip' + (selectedDistrict === dist ? ' active' : ''));
      b.type = 'button';
      b.addEventListener('click', () => {
        const sel = $('districtSelect');
        if (!Array.from(sel.options).some(o => o.value === dist)) {
          const o = el('option', dist);
          o.value = dist;
          sel.append(o);
        }
        sel.value = selectedDistrict === dist ? '' : dist;
        currentOffset = 0;
        executeSearch(false);
      });
      strip.append(b);
    }
  }

  function renderDistrictStrip(records, selectedDistrict) {
    if (!records || !records.length) {
      $('districtStrip').replaceChildren();
      return;
    }
    const counts = new Map();
    for (const r of records) {
      if (r.district) counts.set(r.district, (counts.get(r.district) || 0) + 1);
    }
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    renderDistrictCounts(top, records.length, selectedDistrict);
  }

  // Render Table & Summary Strip
  function renderTableRows(rows, totalCount, stats) {
    $('emptyPrompt').hidden = true;
    $('resultsSection').hidden = false;
    $('enrichBtn').disabled = totalCount <= 0;
    $('exportXlsxBtn').disabled = totalCount <= 0;
    $('exportCsvBtn').disabled = totalCount <= 0;

    $('kpiTotal').textContent = fmt(stats.total);
    $('kpiWebsites').textContent = fmt(stats.websites);
    $('kpiEmails').textContent = fmt(stats.with_email);
    $('kpiPhones').textContent = fmt(stats.with_phone);
    $('kpiBoth').textContent = fmt(stats.with_both);

    const f = currentFilters();
    $('activeFilterSummary').textContent =
      `${f.city}${f.district ? ' / ' + f.district : ''} · ${f.sector || 'Tüm Sektörler'}`;

    const start = totalCount ? currentOffset + 1 : 0;
    const end = Math.min(currentOffset + PAGE_SIZE, totalCount);
    $('pageInfoText').textContent = `${fmt(start)}–${fmt(end)} / ${fmt(totalCount)}`;
    $('prevPageBtn').disabled = currentOffset <= 0;
    $('nextPageBtn').disabled = currentOffset + PAGE_SIZE >= totalCount;

    const tbody = $('resultsBody');
    tbody.replaceChildren();

    if (!rows.length) {
      const tr = el('tr');
      const td = el('td', 'Bu filtreye uygun firma kaydı bulunamadı. İletişim filtresini "Tüm Firmalar" yapabilir veya farklı ilçe/sektör seçebilirsiniz.', 'empty-state');
      td.colSpan = 6;
      tr.append(td);
      tbody.append(tr);
      return;
    }

    for (const r of rows) {
      const tr = el('tr');

      // 1. Firma & Adres
      const tdName = el('td');
      tdName.append(el('span', r.name, 'firm-name'));
      if (r.address) tdName.append(el('span', r.address, 'firm-addr'));

      // 2. Sektör
      const tdCat = el('td');
      tdCat.append(el('span', formatCategoryLabel(r.category, f.sector), 'badge'));

      // 3. İl / İlçe
      const tdLoc = el('td');
      tdLoc.append(el('div', r.city || f.city));
      if (r.district) tdLoc.append(el('span', r.district, 'badge dist'));

      // 4. E-posta
      const tdEmail = el('td');
      const emails = r.emails || [];
      if (emails.length) {
        const list = el('div', null, 'contact-list');
        for (const em of emails.slice(0, 3)) {
          const item = el('span', em, 'contact-item');
          const dom = em.split('@')[1] || '';
          if (mxCache.get(dom) === 'mx') {
            item.append(' ', el('span', '✓ MX', 'badge mx-ok'));
          }
          list.append(item);
        }
        if (emails.length > 3) list.append(el('span', `+${emails.length - 3} e-posta daha`, 'contact-empty'));
        tdEmail.append(list);
      } else {
        tdEmail.append(el('span', '—', 'contact-empty'));
      }

      // 5. Telefon
      const tdPhone = el('td');
      const phones = r.phones || [];
      if (phones.length) {
        const list = el('div', null, 'contact-list');
        for (const ph of phones.slice(0, 3)) {
          list.append(el('span', ph, 'contact-item'));
        }
        if (phones.length > 3) list.append(el('span', `+${phones.length - 3} hat daha`, 'contact-empty'));
        tdPhone.append(list);
      } else {
        tdPhone.append(el('span', '—', 'contact-empty'));
      }

      // 6. Web & Harita
      const tdLinks = el('td');
      const linkStack = el('div', null, 'contact-list');
      if (r.website) {
        try {
          const u = new URL(r.website);
          if (u.protocol === 'http:' || u.protocol === 'https:') {
            const a = el('a', u.hostname.replace(/^www\./, '') + ' ↗', 'ext-link');
            a.href = u.href;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            linkStack.append(a);
          }
        } catch {
          // ignore malformed url
        }
      }
      const mapsA = el('a', 'Haritada Gör ↗', 'ext-link');
      const qStr = `${r.name} ${r.district || ''} ${r.city || f.city}`;
      mapsA.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(qStr);
      mapsA.target = '_blank';
      mapsA.rel = 'noopener noreferrer';
      linkStack.append(mapsA);
      tdLinks.append(linkStack);

      tr.append(tdName, tdCat, tdLoc, tdEmail, tdPhone, tdLinks);
      tbody.append(tr);
    }
  }

  // Filter in-memory shard records (O(1) category bitmask + lazy materialization)
  function filterShardRecords(dataset) {
    const f = currentFilters();
    const termList = expandSectorTerms(f.sector);
    const dFold = fold(f.district);
    const finalRows = [];
    let websites = 0, with_email = 0, with_phone = 0, with_both = 0;

    if (dataset.isTupleShard) {
      const hasTerms = termList.length > 0;
      const catHit = hasTerms
        ? dataset.catsSearch.map(cs => matchesTerms(cs, termList))
        : null;
      const distCounts = new Map();
      let sectorTotal = 0;
      const rows = dataset.rows;

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (hasTerms && !catHit[r[1]] && !matchesTerms(` ${r[10] || ''} `, termList)) {
          continue;
        }
        sectorTotal++;
        const distName = dataset.dists[r[2]] || '';
        if (distName) distCounts.set(distName, (distCounts.get(distName) || 0) + 1);

        if (dFold && dataset.distsFolded[r[2]] !== dFold && !fold(r[6] || '').includes(dFold)) {
          continue;
        }
        const ems = r[4] || [];
        const phs = r[5] || [];
        const he = ems.length > 0;
        const hp = phs.length > 0;
        if (!matchesContact(he, hp, f.contactMode)) continue;

        if (f.quick) {
          const blob = fold(`${r[0]} ${distName} ${r[3]} ${ems.join(' ')} ${phs.join(' ')} ${r[6]}`);
          if (!blob.includes(f.quick)) continue;
        }

        const obj = materializeTuple(dataset, r);
        finalRows.push(obj);
        if (obj.website) websites++;
        if (he) with_email++;
        if (hp) with_phone++;
        if (he && hp) with_both++;
      }

      populateDistricts(f.city, dataset.dists);
      const top = Array.from(distCounts.entries()).sort((a, b) => b[1] - a[1]);
      renderDistrictCounts(top, sectorTotal, f.district);
    } else {
      // Live Overpass object records
      const sectorMatched = [];
      for (const r of dataset.records) {
        if (!matchesTerms(r.search, termList)) continue;
        sectorMatched.push(r);
      }
      renderDistrictStrip(sectorMatched, f.district);
      for (const r of sectorMatched) {
        if (dFold && fold(r.district) !== dFold && !fold(r.address).includes(dFold)) continue;
        if (f.quick && !r.quickBlob.includes(f.quick)) continue;
        const he = r.emails.length > 0;
        const hp = r.phones.length > 0;
        if (!matchesContact(he, hp, f.contactMode)) continue;
        finalRows.push(r);
        if (r.website) websites++;
        if (he) with_email++;
        if (hp) with_phone++;
        if (he && hp) with_both++;
      }
    }

    activeMode = 'cloud';
    activeRecords = finalRows;
    const slice = finalRows.slice(currentOffset, currentOffset + PAGE_SIZE);
    renderTableRows(slice, finalRows.length, {
      total: finalRows.length,
      websites,
      with_email,
      with_phone,
      with_both
    });

    setStatus(
      `${f.city} kataloğunda "${f.sector || 'Tüm Sektörler'}" için ${fmt(finalRows.length)} temiz firma listelendi (${fmt(with_phone)} telefonlu, ${fmt(with_email)} e-postalı).`,
      'Hazır',
      false,
      null
    );
  }

  // Execute Search (Dual Engine — strictly user-initiated)
  async function executeSearch(allowRemoteFetch = false) {
    if (!hasStartedSearch && !allowRemoteFetch) {
      resetResultsView();
      return;
    }
    if (searchInFlight) return;
    searchInFlight = true;
    $('searchBtn').disabled = true;

    const f = currentFilters();
    const slug = slugify(f.city);

    try {
      if (allowRemoteFetch) {
        hasStartedSearch = true;
        $('districtStrip').replaceChildren();
      }

      if (turboConnected && !f.quick) {
        const params = new URLSearchParams({
          sector: f.sector,
          region: f.region,
          district: f.district,
          contact_mode: f.contactMode,
          offset: String(currentOffset),
          limit: String(PAGE_SIZE)
        });
        const pData = await turboApi(`portfolio?${params}`);

        if (pData.total > 0) {
          activeMode = 'turbo-db';
          turboPageData = pData;
          renderTableRows(pData.rows, pData.total, pData);
          setStatus('', '', false, null);
          if (Array.isArray(pData.districts) && pData.districts.length) {
            populateDistricts(f.city, pData.districts.map(d => d[0]));
            renderDistrictCounts(pData.districts, pData.total, f.district);
          } else {
            $('districtStrip').replaceChildren();
          }
          return;
        }

        if (allowRemoteFetch) {
          resetResultsView();
          setStatus(`${f.city} bölgesi taranıyor, lütfen bekleyin (yaklaşık 15–20 sn)…`, 'Taranıyor', false, 45);
          const [w, s, e, n] = await resolveCityBbox(f.city, f.country);
          await turboApi('places/download', {
            region: f.region,
            sector: f.sector,
            box: `${w},${s},${e},${n}`,
            source_mode: 'hybrid',
            authorized: true
          });
          const pAfter = await turboApi(`portfolio?${params}`);
          activeMode = 'turbo-db';
          turboPageData = pAfter;
          renderTableRows(pAfter.rows, pAfter.total, pAfter);
          if (Array.isArray(pAfter.districts) && pAfter.districts.length) {
            populateDistricts(f.city, pAfter.districts.map(d => d[0]));
            renderDistrictCounts(pAfter.districts, pAfter.total, f.district);
          }
          setStatus('', '', false, null);
          return;
        }

        if (!allowRemoteFetch) {
          renderTableRows([], 0, { total: 0, websites: 0, with_email: 0, with_phone: 0, with_both: 0 });
          setStatus('', '', false, null);
          return;
        }
      }

      if (f.country === 'Türkiye' && manifest.shards && manifest.shards[slug]) {
        const shard = await loadCdnShard(slug);
        if (shard) {
          filterShardRecords(shard);
          setStatus('', '', false, null);
          return;
        }
      }

      if (allowRemoteFetch) {
        resetResultsView();
        const liveDataset = await fetchLiveOverpassCity(f.city, f.country, f.sector);
        filterShardRecords(liveDataset);
        setStatus('', '', false, null);
      } else {
        resetResultsView();
      }
    } catch (err) {
      resetResultsView();
      setStatus(err.message || 'Arama sırasında bir hata oluştu.', 'Hata', true, null);
    } finally {
      searchInFlight = false;
      $('searchBtn').disabled = false;
    }
  }

  // Enrich Action
  async function handleEnrich() {
    const f = currentFilters();

    if (turboConnected) {
      try {
        $('enrichBtn').disabled = true;
        setStatus(`${f.city} web siteleri taranmaya hazırlanıyor…`, 'Hazırlanıyor', false, 20);
        const qRes = await turboApi('places/queue', {
          sector: f.sector || 'İşletme',
          region: f.region,
          district: f.district,
          limit: 5000,
          authorized: true
        });
        await turboApi('pause', { paused: false });
        setStatus(
          `${fmt(qRes.added)} yeni web sitesi taranıyor…`,
          'Taranıyor',
          false,
          35
        );
        startTurboLiveMonitor();
      } catch (err) {
        setStatus(err.message, 'Hata', true, null);
      } finally {
        $('enrichBtn').disabled = false;
      }
      return;
    }

    // Cloud Mode: Live DNS-over-HTTPS MX verification via dns.google
    const domains = new Set();
    for (const r of activeRecords) {
      for (const em of r.emails || []) {
        const d = em.split('@')[1];
        if (d && !mxCache.has(d)) domains.add(d);
      }
    }
    const domList = Array.from(domains);
    if (!domList.length) {
      setStatus(
        'Mevcut listedeki tüm e-posta alan adlarının DNS MX kayıtları doğrulandı. Web sitelerinin iç sayfalarını taramak için Mac Turbo Servisi kullanılabilir.',
        'MX Doğrulandı',
        false,
        null
      );
      return;
    }

    $('enrichBtn').disabled = true;
    let done = 0;
    let validMx = 0;
    try {
      const concurrency = 16;
      let cursor = 0;
      async function worker() {
        while (cursor < domList.length) {
          const dom = domList[cursor++];
          try {
            const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(dom)}&type=MX`);
            const j = await r.json();
            const hasMx = j.Status === 0 && Array.isArray(j.Answer) && j.Answer.some(a => a.type === 15);
            mxCache.set(dom, hasMx ? 'mx' : 'none');
            if (hasMx) validMx++;
          } catch {
            mxCache.set(dom, 'unknown');
          }
          done++;
          if (done % 12 === 0 || done === domList.length) {
            setStatus(
              `Kurumsal DNS MX kayıtları doğrulanıyor: ${fmt(done)} / ${fmt(domList.length)} domain (${fmt(validMx)} aktif MX)…`,
              'DNS-over-HTTPS',
              false,
              Math.round((100 * done) / domList.length)
            );
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, domList.length) }, () => worker()));
      await executeSearch(false);
      setStatus(
        `${fmt(domList.length)} kurumsal alan adı Google DoH ile kontrol edildi: ${fmt(validMx)} aktif MX doğrulandı.`,
        'MX Tamamlandı',
        false,
        null
      );
    } finally {
      $('enrichBtn').disabled = false;
    }
  }

  function startTurboLiveMonitor() {
    if (turboPollTimer) clearInterval(turboPollTimer);
    turboPollTimer = setInterval(async () => {
      if (!turboConnected) {
        clearInterval(turboPollTimer);
        turboPollTimer = null;
        return;
      }
      try {
        const st = await turboApi('status');
        const c = st.counts || {};
        const queued = (c.queued || 0) + (c.running || 0);
        const finished = (c.done || 0) + (c.empty || 0) + (c.partial || 0) + (c.failed || 0);
        const total = queued + finished;
        await executeSearch(false);
        if (queued > 0 && total > 0) {
          const pct = Math.round((100 * finished) / total);
          setStatus(
            `Canlı 128-Korutin Tarama: ${fmt(finished)} / ${fmt(total)} site tamamlandı · Bulunan E-posta: ${fmt(st.contacts)} · Tel: ${fmt(st.phones)}`,
            `%${pct} Taranıyor`,
            false,
            pct
          );
        } else {
          clearInterval(turboPollTimer);
          turboPollTimer = null;
          setStatus(
            `Web taraması tamamlandı! Toplam ${fmt(st.contacts)} kurumsal e-posta ve ${fmt(st.phones)} telefon kaydı hazır.`,
            'Tamamlandı',
            false,
            null
          );
        }
      } catch {
        clearInterval(turboPollTimer);
        turboPollTimer = null;
      }
    }, 2500);
  }

  // Excel (.xlsx) Export
  async function handleExportXlsx() {
    const f = currentFilters();
    const fileSlug = `${slugify(f.city)}-${slugify(f.sector || 'firmalar')}.xlsx`;
    const btn = $('exportXlsxBtn');
    btn.disabled = true;

    try {
      // If connected to Turbo SQLite and no client-only quick filter is active, use server streaming XLSX
      if (turboConnected && activeMode === 'turbo-db' && !f.quick) {
        setStatus('Tek sayfa "Firmalar" Excel (.xlsx) dosyası hazırlanıyor…', 'Excel Üretimi', false, 60);
        const params = new URLSearchParams({
          sector: f.sector,
          region: f.region,
          district: f.district,
          contact_mode: f.contactMode
        });
        const res = await fetch(`${LOCAL_API}/api/export.xlsx?${params}`, {
          headers: { 'X-Local-Token': turboToken }
        });
        if (res.ok) {
          const blob = await res.blob();
          triggerDownload(blob, fileSlug);
          setStatus(`Excel (.xlsx) indirildi: ${fileSlug}`, 'İndirildi', false, null);
          return;
        }
      }

      // Pure-JS Browser OOXML Generator (works anywhere on Cloud/Web!)
      if (!activeRecords.length) {
        throw new Error('Dışa aktarılacak kayıt yok. Önce arama yapın.');
      }
      setStatus(`${fmt(activeRecords.length)} firma tek sayfa Excel (.xlsx) olarak paketleniyor…`, 'Tarayıcı XLSX', false, 65);
      const blob = await window.XlsxEngine.generateFirmalarXlsx(activeRecords);
      triggerDownload(blob, fileSlug);
      setStatus(`${fmt(activeRecords.length)} firmalık Excel (.xlsx) dosyası indirildi: ${fileSlug}`, 'İndirildi', false, null);
    } catch (err) {
      setStatus(err.message || 'Excel oluşturulamadı', 'Hata', true, null);
    } finally {
      btn.disabled = false;
    }
  }

  // CSV Export
  async function handleExportCsv() {
    const f = currentFilters();
    const fileSlug = `${slugify(f.city)}-${slugify(f.sector || 'firmalar')}.csv`;
    let rowsToExport = activeRecords;

    if (turboConnected && activeMode === 'turbo-db' && !rowsToExport.length) {
      // Fetch up to 500 or fallback to /api/export
      const res = await fetch(`${LOCAL_API}/api/export`, { headers: { 'X-Local-Token': turboToken } });
      if (res.ok) {
        triggerDownload(await res.blob(), fileSlug);
        return;
      }
    }

    if (!rowsToExport.length) {
      setStatus('CSV için önce sonuçları listeleyin.', 'Uyarı', true, null);
      return;
    }

    const safeCsv = val => {
      let s = String(val == null ? '' : val);
      if (/^[=+\-@]/.test(s.trimStart())) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };

    const lines = [
      ['Firma adı', 'Sektör', 'İl', 'İlçe', 'E-postalar', 'Telefonlar', 'Web sitesi', 'Adres'].map(safeCsv).join(',')
    ];
    for (const r of rowsToExport) {
      lines.push([
        r.name,
        r.category,
        r.city,
        r.district,
        (r.emails || []).join('; '),
        (r.phones || []).join('; '),
        r.website,
        r.address
      ].map(safeCsv).join(','));
    }
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    triggerDownload(blob, fileSlug);
    setStatus(`${fmt(rowsToExport.length)} kayıt CSV olarak indirildi.`, 'İndirildi', false, null);
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // Wire Event Listeners
  function bindEvents() {
    $('countrySelect').addEventListener('change', () => {
      const isTr = $('countrySelect').value === 'Türkiye';
      $('citySelect').hidden = !isTr;
      $('cityCustomInput').hidden = isTr;
      populateDistricts(isTr ? $('citySelect').value : '');
      currentOffset = 0;
      hasStartedSearch = false;
      resetResultsView();
    });

    $('citySelect').addEventListener('change', () => {
      populateDistricts($('citySelect').value);
      $('districtSelect').value = '';
      currentOffset = 0;
      hasStartedSearch = false;
      resetResultsView();
    });

    $('cityCustomInput').addEventListener('input', () => {
      currentOffset = 0;
      hasStartedSearch = false;
      resetResultsView();
    });

    $('cityCustomInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        currentOffset = 0;
        executeSearch(true);
      }
    });

    $('districtSelect').addEventListener('change', () => {
      currentOffset = 0;
      if (hasStartedSearch) executeSearch(false);
    });

    $('contactModeSelect').addEventListener('change', () => {
      currentOffset = 0;
      if (hasStartedSearch) executeSearch(false);
    });

    let sectorDebounce = null;
    $('sectorInput').addEventListener('input', () => {
      if (!hasStartedSearch) return;
      clearTimeout(sectorDebounce);
      sectorDebounce = setTimeout(() => {
        currentOffset = 0;
        executeSearch(false);
      }, 250);
    });

    $('sectorInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        currentOffset = 0;
        executeSearch(true);
      }
    });

    let quickDebounce = null;
    $('quickSearchInput').addEventListener('input', () => {
      if (!hasStartedSearch) return;
      clearTimeout(quickDebounce);
      quickDebounce = setTimeout(() => {
        currentOffset = 0;
        executeSearch(false);
      }, 160);
    });

    $('searchBtn').addEventListener('click', () => {
      currentOffset = 0;
      executeSearch(true);
    });

    $('enrichBtn').addEventListener('click', handleEnrich);
    $('exportXlsxBtn').addEventListener('click', handleExportXlsx);
    $('exportCsvBtn').addEventListener('click', handleExportCsv);

    $('prevPageBtn').addEventListener('click', () => {
      currentOffset = Math.max(0, currentOffset - PAGE_SIZE);
      executeSearch(false);
    });

    $('nextPageBtn').addEventListener('click', () => {
      currentOffset += PAGE_SIZE;
      executeSearch(false);
    });
  }

  // Bootstrap Application
  async function boot() {
    initMotion();
    try {
      const res = await fetch('/data/manifest.json');
      if (res.ok) {
        manifest = await res.json();
      }
    } catch {
      // Fallback defaults remain active
    }

    populateCities();
    populateDistricts($('citySelect').value);
    bindEvents();
    resetResultsView();
    await probeTurboBridge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
