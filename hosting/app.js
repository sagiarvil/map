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
      const aliases = manifest.taxonomy && manifest.taxonomy[p];
      if (Array.isArray(aliases)) {
        for (const a of aliases) out.push(a);
      }
      // Turkish plural / suffix stem (e.g. bankalar -> banka, oteller -> otel)
      const stem = p.replace(/(?:lar[ıi]|ler[iı]|lar|ler|c[ıiuü]|c[ıiuü]ler|c[ıiuü]lar)$/, '').trim();
      if (stem && stem !== p) {
        out.push(stem);
        const stemAliases = manifest.taxonomy && manifest.taxonomy[stem];
        if (Array.isArray(stemAliases)) {
          for (const a of stemAliases) out.push(a);
        }
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

  const RE_EFATURA_NAME = /\b(a\.?\s*ş\.?|a\.?\s*s\.?|anonim|ltd\.?\s*şti\.?|ltd\.?|limited|şirketi|san\.?\s*ve\s*tic\.?|sanayi\s*ve\s*ticaret|holding|grup)\b/i;
  const RE_EFATURA_MAIL = /(@|\.)(kep\.tr|efatura@|e-fatura@|muhasebe@|finans@)/i;
  const FREE_MAIL_DOMAINS = new Set([
    'gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'yandex.com', 'yandex.com.tr',
    'mynet.com', 'mail.ru', 'icloud.com', 'live.com', 'msn.com', 'aol.com'
  ]);

  const NACE_RULES = [
    { re: /yatak|baza|ev tekstil/i, code: '47.59.01', title: 'Yatak, baza ve ev tekstili perakende satışı' },
    { re: /ofis|büro|buro/i, code: '31.01.01', title: 'Büro ve mağaza mobilyaları imalatı' },
    { re: /mutfak|banyo|dolap/i, code: '31.02.01', title: 'Mutfak ve banyo mobilyaları imalatı' },
    { re: /marangoz|ahşap|ahsap|doğrama|dograma/i, code: '16.23.01', title: 'Ahşap yapı ve doğrama malzemeleri imalatı' },
    { re: /döşeme|doseme|koltuk|kanepe/i, code: '31.09.02', title: 'Koltuk, kanepe ve döşemeli mobilya imalatı' },
    { re: /mobilya|furniture/i, code: '31.09.01', title: 'Diğer mobilyaların imalatı (NACE Rev. 2)' },
    { re: /müteahhit|muteahhit|inşaat.*taahhüt|taahhut/i, code: '41.20.02', title: 'İkamet amaçlı binaların inşaatı (Müteahhitlik)' },
    { re: /inşaat|insaat|yapı|yapi|şantiye|santiye/i, code: '41.20.01', title: 'İkamet amaçlı olmayan binaların inşaatı' },
    { re: /mimarlık|mimarlik|mimar|iç mimar|ic mimar/i, code: '71.11.01', title: 'Mimarlık ve iç mimarlık faaliyetleri' },
    { re: /torna|tesviye|makina|makine|mekanik/i, code: '28.99.01', title: 'Özel amaçlı diğer makinelerin imalatı' },
    { re: /çelik|celik|demir|metal|ferforje/i, code: '25.11.01', title: 'Metal yapı ve yapı parçaları imalatı' },
    { re: /plastik|ambalaj|polimer|enjeksiyon/i, code: '22.29.01', title: 'Diğer plastik ürünlerin imalatı' },
    { re: /tekstil|konfeksiyon|kumaş|kumas|giyim/i, code: '13.92.01', title: 'Ev tekstili ve mefruşat ürünleri imalatı' },
    { re: /lojistik|nakliyat|taşıma|tasima|kargo|antrepo/i, code: '49.41.01', title: 'Karayolu ile şehirler arası yük taşımacılığı (Lojistik)' },
    { re: /otomotiv|oto servis|yedek parça|oto tamir/i, code: '45.20.01', title: 'Motorlu kara taşıtlarının bakım ve onarımı' },
    { re: /gıda|gida|unlu mamul|fırın|firin|toptan gıda/i, code: '10.89.01', title: 'Diğer gıda maddelerinin imalatı ve toptan ticareti' },
    { re: /elektrik|enerji|pano|trafo|tesisat/i, code: '43.21.01', title: 'Bina ve diğer inşaat elektrik tesisatı' },
    { re: /medikal|tıbbi|tibbi|sağlık|saglik|ortopedi/i, code: '32.50.01', title: 'Tıbbi araç, gereç ve medikal malzeme imalatı' },
    { re: /hırdavat|hirdavat|yapı market|yapi market/i, code: '47.52.01', title: 'Hırdavat, boya ve cam perakende ticareti' }
  ];

  function resolveNaceClient(category, name) {
    const text = `${category || ''} ${name || ''}`;
    for (const rule of NACE_RULES) {
      if (rule.re.test(text)) return { code: rule.code, title: rule.title };
    }
    return { code: '46.90.01', title: 'Belirli bir mala tahsis edilmemiş toptan ticaret' };
  }

  function detectWhatsapp(phones) {
    if (!phones || !phones.length) return null;
    for (const ph of phones) {
      const clean = String(ph).replace(/\D+/g, '');
      let mobile = '';
      if (clean.length === 10 && clean.startsWith('5')) mobile = '90' + clean;
      else if (clean.length === 11 && clean.startsWith('05')) mobile = '9' + clean;
      else if (clean.length === 12 && clean.startsWith('905')) mobile = clean;
      if (mobile) {
        return {
          num: '+' + mobile,
          url: `https://wa.me/${mobile}`
        };
      }
    }
    return null;
  }

  function detectEfatura(name, emails) {
    if (RE_EFATURA_NAME.test(name || '')) return true;
    if (emails && emails.some(e => RE_EFATURA_MAIL.test(e))) return true;
    return false;
  }

  function detectEnterpriseMail(emails) {
    if (!emails || !emails.length) return false;
    for (const e of emails) {
      const dom = (e.split('@')[1] || '').toLowerCase().trim();
      if (dom && !FREE_MAIL_DOMAINS.has(dom) && dom.includes('.')) {
        return true;
      }
    }
    return false;
  }

  function matchesContact(hasEmail, hasPhone, mode, row) {
    switch (mode) {
      case 'has_whatsapp': return Boolean(row && (row.hasWhatsapp || row.whatsapp));
      case 'has_efatura': return Boolean(row && (row.isEfatura || row.efatura));
      case 'has_enterprise_mail': return Boolean(row && (row.isEnterpriseMail || row.tech));
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
    const cityRaw = $('citySelect').value;
    const city = (country === 'Türkiye'
      ? (cityRaw || 'İstanbul')
      : ($('cityCustomInput').value.trim() || 'Berlin')) || 'İstanbul';
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
    if (!sel) return;
    let prev = sel.value;
    if (!prev || !TR_PROVINCES.includes(prev)) {
      prev = 'İstanbul';
    }
    if (sel.options.length === 0) {
      for (const prov of TR_PROVINCES) {
        const opt = el('option', prov);
        opt.value = prov;
        if (prov === prev) opt.selected = true;
        sel.append(opt);
      }
    }
    sel.value = prev;
  }

  function populateDistricts(city, extraDistricts = []) {
    const sel = $('districtSelect');
    if (!sel) return;
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
    if (prev && merged.includes(prev)) {
      sel.value = prev;
    }
  }

  // Local Mac Turbo Bridge Check
  async function probeTurboBridge() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1800);
      const res = await fetch(`${LOCAL_API}/api/session`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error('status ' + res.status);
      const data = await res.json();
      if (data && data.token) {
        turboConnected = true;
        turboToken = data.token;
        const badge = $('engineBadge');
        if (badge) badge.className = 'engine-badge turbo';
        $('engineText').textContent = 'Hızlı Tarama Aktif';
        $('enrichBtn').textContent = 'Web Sitelerinden E-posta Tara';

        // Check Industrial Engine matrix
        try {
          const indRes = await turboApi('industrial/status');
          if (indRes && indRes.status === 'active') {
            const indBadge = $('industrialBadge');
            if (indBadge) indBadge.style.display = 'inline-flex';
          }
        } catch {}

        return true;
      }
    } catch {
      // Expected on remote PCs/phones where local Mac server is not running
    }
    turboConnected = false;
    turboToken = '';
    const badge = $('engineBadge');
    if (badge) badge.className = 'engine-badge cloud';
    $('engineText').textContent = 'Hazır';
    $('enrichBtn').textContent = 'E-posta Kayıtlarını Doğrula';
    const indBadge = $('industrialBadge');
    if (indBadge) indBadge.style.display = 'none';
    return false;
  }

  async function turboApi(path, body, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${LOCAL_API}/api/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'X-Local-Token': turboToken,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        signal: ctrl.signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Yerel motor hatası');
      return payload;
    } finally {
      clearTimeout(timer);
    }
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
    const name = r[0] || '';
    const category = dataset.cats[r[1]] || 'İşletme';
    const city = dataset.city;
    const district = dataset.dists[r[2]] || '';
    const website = r[3] || '';
    const emails = Array.isArray(r[4]) ? r[4] : [];
    const phones = Array.isArray(r[5]) ? r[5] : [];
    const address = r[6] || '';
    const lat = r[7];
    const lon = r[8];
    const conf = r[9] || 75;

    const wa = detectWhatsapp(phones);
    const isEfatura = detectEfatura(name, emails);
    const isEnterpriseMail = detectEnterpriseMail(emails);
    const nace = resolveNaceClient(category, name);

    return {
      name,
      category,
      city,
      district,
      website,
      emails,
      phones,
      address,
      lat,
      lon,
      conf,
      hasWhatsapp: Boolean(wa),
      whatsappUrl: wa ? wa.url : '',
      whatsappNum: wa ? wa.num : '',
      whatsapp: wa ? wa.url : '',
      isEfatura,
      efatura: isEfatura,
      isEnterpriseMail,
      tech: isEnterpriseMail ? 'Kurumsal Mail' : '',
      nace_code: nace.code,
      nace_title: nace.title,
      nace
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
      const cleanEmails = Array.from(new Set(emails));
      const wa = detectWhatsapp(phones);
      const isEfatura = detectEfatura(name, cleanEmails);
      const isEnterpriseMail = detectEnterpriseMail(cleanEmails);
      const nace = resolveNaceClient(category, name);

      records.push({
        name,
        category,
        city,
        district,
        website,
        emails: cleanEmails,
        phones,
        address,
        lat,
        lon,
        conf: 85,
        search,
        quickBlob,
        hasWhatsapp: Boolean(wa),
        whatsappUrl: wa ? wa.url : '',
        whatsappNum: wa ? wa.num : '',
        whatsapp: wa ? wa.url : '',
        isEfatura,
        efatura: isEfatura,
        isEnterpriseMail,
        tech: isEnterpriseMail ? 'Kurumsal Mail' : '',
        nace_code: nace.code,
        nace_title: nace.title,
        nace
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
    if ($('kpiWhatsapp')) $('kpiWhatsapp').textContent = fmt(stats.with_whatsapp || 0);
    if ($('kpiEfatura')) $('kpiEfatura').textContent = fmt(stats.with_efatura || 0);
    $('kpiWebsites').textContent = fmt(stats.websites);
    $('kpiEmails').textContent = fmt(stats.with_email);
    $('kpiPhones').textContent = fmt(stats.with_phone);
    if ($('kpiBoth')) $('kpiBoth').textContent = fmt(stats.with_both || 0);

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
      td.colSpan = 7;
      tr.append(td);
      tbody.append(tr);
      return;
    }

    for (const r of rows) {
      const tr = el('tr');

      // 1. Firma & Adres
      const tdName = el('td');
      const nameRow = el('div', null, 'firm-name-row');
      nameRow.append(el('span', r.name, 'firm-name'));
      if (r.isEfatura || r.efatura) {
        nameRow.append(el('span', '🏢 e-Fatura', 'badge efatura'));
      }
      tdName.append(nameRow);
      if (r.address) tdName.append(el('span', r.address, 'firm-addr'));

      // 2. Sektör & NACE
      const tdCat = el('td');
      tdCat.append(el('div', formatCategoryLabel(r.category, f.sector), 'cat-label'));
      const naceCode = r.nace_code || (r.nace && r.nace.code);
      const naceTitle = r.nace_title || (r.nace && r.nace.title);
      if (naceCode) {
        const naceBadge = el('span', `NACE: ${naceCode}`, 'badge nace');
        if (naceTitle) naceBadge.title = naceTitle;
        tdCat.append(naceBadge);
      }

      // 3. İl / İlçe
      const tdLoc = el('td');
      tdLoc.append(el('div', r.city || f.city, 'loc-city'));
      if (r.district) tdLoc.append(el('span', r.district, 'badge dist'));

      // 4. E-posta & Altyapı
      const tdEmail = el('td');
      const emails = r.emails || [];
      if (emails.length) {
        const list = el('div', null, 'contact-list');
        for (const em of emails.slice(0, 3)) {
          const item = el('span', em, 'contact-item');
          const dom = (em.split('@')[1] || '').toLowerCase();
          if (mxCache.get(dom) === 'mx') {
            item.append(' ', el('span', '✓ MX', 'badge mx-ok'));
          }
          list.append(item);
        }
        if (r.tech || r.isEnterpriseMail) {
          list.append(el('span', r.tech || 'Kurumsal Mail', 'badge m365'));
        }
        if (emails.length > 3) list.append(el('span', `+${emails.length - 3} e-posta daha`, 'contact-empty'));
        tdEmail.append(list);
      } else {
        tdEmail.append(el('span', '—', 'contact-empty'));
      }

      // 5. Telefon & WhatsApp
      const tdPhone = el('td');
      const phones = r.phones || [];
      const waUrl = r.whatsappUrl || r.whatsapp;
      if (phones.length || waUrl) {
        const list = el('div', null, 'contact-list');
        for (const ph of phones.slice(0, 3)) {
          list.append(el('span', ph, 'contact-item'));
        }
        if (waUrl) {
          const waLink = el('a', '💬 WhatsApp', 'wa-btn');
          waLink.href = waUrl;
          waLink.target = '_blank';
          waLink.rel = 'noopener noreferrer';
          waLink.title = 'WhatsApp ile tek tıkla canlı mesaj başlatın';
          list.append(waLink);
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

      // 7. ERP Hızlı Cari İşlemi (Madde 3)
      const tdErp = el('td');
      const erpBtn = el('button', '+ Cari Kart Oluştur', 'btn-quick-party');
      erpBtn.type = 'button';
      erpBtn.title = 'HTMLANDHTML ERP Cari Kartı Oluştur (Müşteri/Tedarikçi)';
      erpBtn.addEventListener('click', () => openQuickPartyModal(r, f));
      tdErp.append(erpBtn);

      tr.append(tdName, tdCat, tdLoc, tdEmail, tdPhone, tdLinks, tdErp);
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
    let with_whatsapp = 0, with_efatura = 0;

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
        const nameFolded = fold(r[0] || '');
        if (hasTerms && !catHit[r[1]] && !matchesTerms(` ${r[10] || ''} `, termList) && !matchesTerms(` ${nameFolded} `, termList)) {
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

        if (f.quick) {
          const blob = fold(`${r[0]} ${distName} ${r[3]} ${ems.join(' ')} ${phs.join(' ')} ${r[6]}`);
          if (!blob.includes(f.quick)) continue;
        }

        const obj = materializeTuple(dataset, r);
        if (!matchesContact(he, hp, f.contactMode, obj)) continue;

        finalRows.push(obj);
        if (obj.website) websites++;
        if (he) with_email++;
        if (hp) with_phone++;
        if (he && hp) with_both++;
        if (obj.hasWhatsapp) with_whatsapp++;
        if (obj.isEfatura) with_efatura++;
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
        if (!matchesContact(he, hp, f.contactMode, r)) continue;
        finalRows.push(r);
        if (r.website) websites++;
        if (he) with_email++;
        if (hp) with_phone++;
        if (he && hp) with_both++;
        if (r.hasWhatsapp) with_whatsapp++;
        if (r.isEfatura) with_efatura++;
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
      with_both,
      with_whatsapp,
      with_efatura
    });

    setStatus(
      `${f.city} kataloğunda "${f.sector || 'Tüm Sektörler'}" için ${fmt(finalRows.length)} temiz firma listelendi (${fmt(with_whatsapp)} WhatsApp, ${fmt(with_phone)} telefonlu, ${fmt(with_email)} e-postalı).`,
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
    if (!f.city) {
      f.city = 'İstanbul';
      $('citySelect').value = 'İstanbul';
    }
    const slug = slugify(f.city);

    try {
      if (allowRemoteFetch) {
        hasStartedSearch = true;
        $('districtStrip').replaceChildren();
      }

      // 1. If local Turbo SQLite engine is connected
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

        if (pData && pData.total > 0) {
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

        // If local database has 0, check if we have a CDN shard for this city
        if (f.country === 'Türkiye' && manifest.shards && manifest.shards[slug]) {
          const shard = await loadCdnShard(slug);
          if (shard) {
            filterShardRecords(shard);
            setStatus('', '', false, null);
            return;
          }
        }

        // If Türkiye, we already have full nationwide data; render empty cleanly without blocking Overpass loop
        if (f.country === 'Türkiye') {
          renderTableRows([], 0, { total: 0, websites: 0, with_email: 0, with_phone: 0, with_both: 0 });
          setStatus('Arama kriterine uygun kayıt bulunamadı. Sektör adını veya filtreleri kontrol edebilirsiniz.', 'Bilgi', false, null);
          return;
        }

        // Foreign city remote fetch
        if (allowRemoteFetch && f.country !== 'Türkiye') {
          try {
            resetResultsView();
            setStatus(`${f.city} bölgesi taranıyor, lütfen bekleyin…`, 'Taranıyor', false, 45);
            const [w, s, e, n] = await resolveCityBbox(f.city, f.country);
            await turboApi('places/download', {
              region: f.region,
              sector: f.sector,
              box: `${w},${s},${e},${n}`,
              source_mode: 'hybrid',
              authorized: true
            });
            const pAfter = await turboApi(`portfolio?${params}`);
            if (pAfter && pAfter.total > 0) {
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
          } catch (turboErr) {
            console.warn('Turbo discovery fallback:', turboErr);
          }
        }

        renderTableRows([], 0, { total: 0, websites: 0, with_email: 0, with_phone: 0, with_both: 0 });
        setStatus('', '', false, null);
        return;
      }

      // 2. Cloud CDN Shard Mode
      if (f.country === 'Türkiye' && manifest.shards && manifest.shards[slug]) {
        const shard = await loadCdnShard(slug);
        if (shard) {
          filterShardRecords(shard);
          setStatus('', '', false, null);
          return;
        }
      }

      // 3. Fallback for foreign city when Turbo not connected
      if (allowRemoteFetch && f.country !== 'Türkiye') {
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

    const headers = [
      'Firma adı',
      'Sektör',
      'NACE Kodu',
      'NACE Faaliyet Tanımı',
      'Kurumsal Düzey',
      'Mail / Altyapı',
      'WhatsApp Linki',
      'İl',
      'İlçe',
      'E-postalar',
      'Telefonlar',
      'Web sitesi',
      'Adres'
    ];
    const lines = [headers.map(safeCsv).join(',')];
    for (const r of rowsToExport) {
      lines.push([
        r.name,
        r.category,
        (r.nace && r.nace.code) || r.nace_code || '',
        (r.nace && r.nace.title) || r.nace_title || '',
        r.isEfatura || r.efatura ? 'e-Fatura Mükellefi' : 'Standart',
        r.tech || (r.isEnterpriseMail ? 'Kurumsal Mail' : 'Standart'),
        r.whatsappUrl || r.whatsapp || '',
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

  // =========================================================================
  // AppFlow V10.2 Navigation & Workspace Controller
  // =========================================================================
  const WORKSPACES = {
    launchpad: { id: 'viewLaunchpad', breadcrumb: 'Haritalar İstihbarat Fabrikası', title: 'Uygulamalarım' },
    search: { id: 'viewSearch', breadcrumb: 'Uygulamalarım / İstihbarat', title: '01. Firma & İstihbarat Arama' },
    export: { id: 'viewExport', breadcrumb: 'Uygulamalarım / Veri İhracatı', title: '02. Toplu Excel & Veri İhracatı' },
    enrich: { id: 'viewEnrich', breadcrumb: 'Uygulamalarım / İletişim', title: '03. Derin Web & İletişim Tarama' },
    ct_logs: { id: 'viewCtLogs', breadcrumb: 'Uygulamalarım / Güvenlik & Tescil', title: '04. Sertifika Günlükleri (CT Logs)' },
    database: { id: 'viewDatabase', breadcrumb: 'Uygulamalarım / Veri Havuzu', title: '05. Bölgesel Veri Havuzu' },
    desktop: { id: 'viewDesktop', breadcrumb: 'Uygulamalarım / Altyapı', title: '06. Masaüstü Hızlandırıcı & Çevrimdışı Paket' }
  };

  let activeWorkspace = 'launchpad';
  const workspaceHistory = [];

  function openWorkspace(key, pushHistory = true) {
    const ws = WORKSPACES[key];
    if (!ws) return;

    if (pushHistory && activeWorkspace !== key) {
      workspaceHistory.push(activeWorkspace);
    }
    activeWorkspace = key;

    for (const k of Object.keys(WORKSPACES)) {
      const elSection = $(WORKSPACES[k].id);
      if (elSection) elSection.hidden = (k !== key);
    }

    if (key === 'launchpad') {
      document.body.classList.add('flow-home');
      $('flowBackBtn').hidden = true;
    } else {
      document.body.classList.remove('flow-home');
      $('flowBackBtn').hidden = false;
    }

    $('amBreadcrumb').textContent = ws.breadcrumb;
    $('pageTitle').textContent = ws.title;

    if (key === 'database') {
      renderDatabaseStats();
    }

    if (key === 'export') {
      const f = currentFilters();
      const count = activeRecords.length || (turboPageData && turboPageData.total) || 0;
      const statusTitle = $('exportStatusTitle');
      const statusDesc = $('exportStatusDesc');
      if (statusTitle && statusDesc) {
        if (count > 0) {
          statusTitle.textContent = `✓ ${f.city} · ${f.sector || 'Tüm Sektörler'}: ${fmt(count)} Firma Hazır`;
          statusDesc.textContent = 'Aşağıdaki butonları kullanarak listeyi hemen tek sayfa Excel (.xlsx) veya CSV formatında indirebilirsiniz.';
        } else {
          statusTitle.textContent = `Portföy Beklemede (${f.city} · ${f.sector || 'Sektör Seçilmedi'})`;
          statusDesc.textContent = 'Önce "Firma & İstihbarat Arama" ekranından sektör ve il seçerek sonuçları listeleyin, ardından buradan tek tıkla toplu indirme yapın.';
        }
      }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goHome() {
    openWorkspace('launchpad');
  }

  function flowBack() {
    if (workspaceHistory.length > 0) {
      const prev = workspaceHistory.pop();
      openWorkspace(prev, false);
    } else {
      goHome();
    }
  }

  function renderDatabaseStats() {
    const grid = $('dbStatsGrid');
    if (!grid) return;
    grid.replaceChildren();

    const shards = (manifest && manifest.shards) || {};
    const cities = Object.keys(shards).length > 0 ? Object.keys(shards) : TR_PROVINCES;

    for (const city of cities) {
      const shardInfo = shards[city];
      const count = shardInfo ? (shardInfo.total || shardInfo.count || 0) : 0;
      const card = el('div', null, 'db-stat-card');
      const title = el('span', city, 'db-stat-city');
      const sub = el('span', count ? `${fmt(count)} firma` : 'Hazır Shard', 'db-stat-count');
      card.append(title, sub);

      card.addEventListener('click', () => {
        $('countrySelect').value = 'Türkiye';
        $('countrySelect').dispatchEvent(new Event('change'));
        $('citySelect').value = city;
        populateDistricts(city);
        $('districtSelect').value = '';
        currentOffset = 0;
        openWorkspace('search');
        executeSearch(true);
      });

      grid.append(card);
    }
  }

  // =========================================================================
  // RFC 6962 CT Logs Query Handler
  // =========================================================================
  let ctQueryInFlight = false;
  async function handleCtQuery() {
    if (ctQueryInFlight) return;
    const q = ($('ctQueryInput').value || '').trim();
    if (!q) {
      alert('Lütfen aranacak bir anahtar kelime veya alan adı kökü girin.');
      return;
    }
    const limit = parseInt($('ctLimitSelect').value || '50', 10);
    const wrap = $('ctResultsWrap');
    const tbody = $('ctResultsBody');
    const btn = $('ctQueryBtn');

    ctQueryInFlight = true;
    btn.disabled = true;
    btn.textContent = 'Sorgulanıyor…';
    tbody.replaceChildren();
    const loadingRow = el('tr');
    const loadingTd = el('td', 'Sertifika şeffaflık günlükleri taranıyor…', 'contact-empty');
    loadingTd.colSpan = 4;
    loadingRow.append(loadingTd);
    tbody.append(loadingRow);
    wrap.hidden = false;

    let records = [];
    try {
      let handled = false;
      if (turboConnected) {
        try {
          const res = await fetch(`${LOCAL_API}/api/ct_logs?query=${encodeURIComponent(q)}&limit=${limit}`, {
            headers: turboToken ? { 'X-Secret-Token': turboToken } : {}
          });
          if (res.ok) {
            const data = await res.json();
            records = data.records || [];
            handled = true;
          }
        } catch {}
      }

      if (!handled) {
        const safeQ = q.includes('.') ? q : `%.${q}.com.tr`;
        const res = await fetch(`https://crt.sh/?q=${encodeURIComponent(safeQ)}&output=json`);
        if (res.ok) {
          const raw = await res.json();
          const seen = new Set();
          for (const item of raw) {
            const domain = String(item.common_name || item.name_value || '').toLowerCase().trim();
            if (!domain || seen.has(domain)) continue;
            seen.add(domain);
            records.push({
              domain,
              issuer: item.issuer_name || 'Let\'s Encrypt',
              logged_at: item.entry_timestamp || item.not_before || ''
            });
            if (records.length >= limit) break;
          }
        }
      }
    } catch (err) {
      console.warn('CT logs error:', err);
    } finally {
      ctQueryInFlight = false;
      btn.disabled = false;
      btn.textContent = 'Yeni Sertifikaları Sorgula';
    }

    tbody.replaceChildren();
    if (!records.length) {
      const emptyRow = el('tr');
      const emptyTd = el('td', 'Bu sorgu için sertifika günlüğü kaydı bulunamadı.', 'empty-state');
      emptyTd.colSpan = 4;
      emptyRow.append(emptyTd);
      tbody.append(emptyRow);
      return;
    }

    for (const rec of records) {
      const tr = el('tr');
      const tdDom = el('td');
      tdDom.append(el('strong', rec.domain));

      const tdIssuer = el('td', rec.issuer ? rec.issuer.split(',')[0].replace(/^C=.*CN=/, '') : 'CA');
      const tdDate = el('td', rec.logged_at ? rec.logged_at.split('T')[0] : '—');

      const tdLink = el('td');
      const a = el('a', 'Siteyi Aç ↗', 'ext-link');
      a.href = `https://${rec.domain}`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      tdLink.append(a);

      tr.append(tdDom, tdIssuer, tdDate, tdLink);
      tbody.append(tr);
    }
  }

  // =========================================================================
  // Quick Party Modal (HTMLANDHTML ERP Standard - Madde 3)
  // =========================================================================
  function openQuickPartyModal(firm, f) {
    const dialog = $('quickPartyDialog');
    if (!dialog) return;

    $('partySuccessNotice').style.display = 'none';

    const cityCode = fold(firm.city || f.city || 'TR').slice(0, 3).toUpperCase();
    const randCode = String(Math.floor(1000 + Math.random() * 9000));
    const autoCode = `CARI-${cityCode}-${randCode}`;

    $('partyNameInput').value = firm.name || '';
    $('partyTypeSelect').value = 'Müşteri';
    $('partyCodeInput').value = autoCode;
    $('partyCityInput').value = firm.city || f.city || '';
    $('partyDistrictInput').value = firm.district || f.district || '';
    $('partyAddressInput').value = firm.address || '';
    $('partyPhoneInput').value = (firm.phones && firm.phones[0]) || '';
    $('partyEmailInput').value = (firm.emails && firm.emails[0]) || '';

    const naceCode = firm.nace_code || (firm.nace && firm.nace.code) || '';
    const naceTitle = firm.nace_title || (firm.nace && firm.nace.title) || '';
    $('partyNaceInput').value = naceCode ? `${naceCode} - ${naceTitle}` : 'Belirtilmedi';

    $('partyEfaturaInput').value = (firm.isEfatura || firm.efatura) ? 'Evet (e-Fatura Mükellefi)' : 'Belirtilmedi';

    dialog.showModal();
  }

  function getPartyFormData() {
    return {
      id: 'party_' + Date.now(),
      code: $('partyCodeInput').value.trim(),
      name: $('partyNameInput').value.trim(),
      type: $('partyTypeSelect').value,
      city: $('partyCityInput').value.trim(),
      district: $('partyDistrictInput').value.trim(),
      address: $('partyAddressInput').value.trim(),
      phone: $('partyPhoneInput').value.trim(),
      email: $('partyEmailInput').value.trim(),
      nace: $('partyNaceInput').value.trim(),
      efatura: $('partyEfaturaInput').value.trim(),
      source: 'haritalar_lead_intelligence',
      created_at: new Date().toISOString()
    };
  }

  function handleSaveParty() {
    const party = getPartyFormData();
    if (!party.name) {
      alert('Lütfen firma ünvanı girin.');
      return;
    }

    try {
      const stored = JSON.parse(localStorage.getItem('erp_parties') || '[]');
      stored.unshift(party);
      localStorage.setItem('erp_parties', JSON.stringify(stored));
      const notice = $('partySuccessNotice');
      notice.textContent = `✓ Cari kart (${party.code} - ${party.name}) yerel ERP veritabanına kaydedildi!`;
      notice.style.display = 'block';
    } catch (err) {
      alert('Kaydetme hatası: ' + err.message);
    }
  }

  function handleExportPartyJson() {
    const party = getPartyFormData();
    const blob = new Blob([JSON.stringify(party, null, 2)], { type: 'application/json' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = `${party.code || 'cari'}_erp_party.json`;
    a.click();
    URL.revokeObjectURL(u);
  }

  async function handleCopyParty() {
    const party = getPartyFormData();
    const text = [
      `Cari Kodu: ${party.code}`,
      `Firma: ${party.name}`,
      `Tür: ${party.type}`,
      `İl/İlçe: ${party.city} / ${party.district}`,
      `Adres: ${party.address}`,
      `Telefon: ${party.phone}`,
      `E-posta: ${party.email}`,
      `NACE: ${party.nace}`,
      `e-Fatura: ${party.efatura}`
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      alert('Cari kart panoya kopyalandı!');
    } catch {
      prompt('Kopyalamak için Ctrl+C / Cmd+C yapın:', text);
    }
  }

  // Wire Event Listeners
  function bindEvents() {
    // AppFlow V10.2 Navigation
    document.querySelectorAll('[data-open-workspace]').forEach(btn => {
      btn.addEventListener('click', () => {
        openWorkspace(btn.getAttribute('data-open-workspace'));
      });
    });

    $('flowHomeBtn').addEventListener('click', goHome);
    $('flowBackBtn').addEventListener('click', flowBack);
    $('headerSearchJumpBtn').addEventListener('click', () => openWorkspace('search'));
    $('headerExportJumpBtn').addEventListener('click', () => {
      openWorkspace('export');
    });

    // Export Workspace buttons
    const expWsXlsx = $('exportWorkspaceXlsxBtn');
    if (expWsXlsx) expWsXlsx.addEventListener('click', handleExportXlsx);
    const expWsCsv = $('exportWorkspaceCsvBtn');
    if (expWsCsv) expWsCsv.addEventListener('click', handleExportCsv);
    const jumpSearch = $('jumpSearchFromExportBtn');
    if (jumpSearch) jumpSearch.addEventListener('click', () => openWorkspace('search'));

    // CT Logs buttons
    const ctBtn = $('ctQueryBtn');
    if (ctBtn) ctBtn.addEventListener('click', handleCtQuery);
    const ctInput = $('ctQueryInput');
    if (ctInput) {
      ctInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleCtQuery();
      });
    }

    // Quick Party Dialog
    const quickClose = $('quickCloseBtn');
    if (quickClose) quickClose.addEventListener('click', () => $('quickPartyDialog').close());
    const partySave = $('partySaveBtn');
    if (partySave) partySave.addEventListener('click', handleSaveParty);
    const partyExportJson = $('partyExportJsonBtn');
    if (partyExportJson) partyExportJson.addEventListener('click', handleExportPartyJson);
    const partyCopy = $('partyCopyBtn');
    if (partyCopy) partyCopy.addEventListener('click', handleCopyParty);

    // Enrich Workspace
    const enrichStart = $('enrichStartBtn');
    if (enrichStart) enrichStart.addEventListener('click', handleEnrich);
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
    if ($('citySelect')) $('citySelect').value = 'İstanbul';
    populateDistricts('İstanbul');
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
