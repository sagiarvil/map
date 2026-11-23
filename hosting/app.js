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

  // 46 Global Trade Countries -> English Name, ISO-2 & Major Commercial Cities
  const GLOBAL_COUNTRIES = {
    'Türkiye': { en: 'Turkey', iso: 'TR', cities: TR_PROVINCES },
    'Almanya': { en: 'Germany', iso: 'DE', cities: ['Berlin', 'München', 'Hamburg', 'Köln', 'Frankfurt', 'Stuttgart', 'Düsseldorf', 'Dortmund', 'Essen', 'Nürnberg', 'Hannover', 'Bremen', 'Leipzig'] },
    'İngiltere': { en: 'United Kingdom', iso: 'GB', cities: ['London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow', 'Liverpool', 'Bristol', 'Sheffield', 'Edinburgh', 'Leicester'] },
    'Hollanda': { en: 'Netherlands', iso: 'NL', cities: ['Amsterdam', 'Rotterdam', 'Den Haag', 'Utrecht', 'Eindhoven', 'Tilburg', 'Groningen', 'Breda', 'Arnhem'] },
    'Fransa': { en: 'France', iso: 'FR', cities: ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice', 'Nantes', 'Strasbourg', 'Bordeaux', 'Lille', 'Montpellier'] },
    'İtalya': { en: 'Italy', iso: 'IT', cities: ['Milano', 'Roma', 'Torino', 'Napoli', 'Bologna', 'Firenze', 'Genova', 'Verona', 'Bari', 'Brescia'] },
    'İspanya': { en: 'Spain', iso: 'ES', cities: ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza', 'Málaga', 'Bilbao', 'Alicante', 'Murcia'] },
    'Belçika': { en: 'Belgium', iso: 'BE', cities: ['Brussels', 'Antwerp', 'Ghent', 'Charleroi', 'Liège', 'Bruges', 'Leuven'] },
    'Avusturya': { en: 'Austria', iso: 'AT', cities: ['Wien', 'Graz', 'Linz', 'Salzburg', 'Innsbruck', 'Klagenfurt'] },
    'İsviçre': { en: 'Switzerland', iso: 'CH', cities: ['Zürich', 'Genève', 'Basel', 'Bern', 'Lausanne', 'Winterthur', 'Luzern'] },
    'Polonya': { en: 'Poland', iso: 'PL', cities: ['Warszawa', 'Kraków', 'Wrocław', 'Poznań', 'Gdańsk', 'Łódź', 'Katowice'] },
    'Romanya': { en: 'Romania', iso: 'RO', cities: ['București', 'Cluj-Napoca', 'Timișoara', 'Iași', 'Constanța', 'Brașov'] },
    'Bulgaristan': { en: 'Bulgaria', iso: 'BG', cities: ['Sofia', 'Plovdiv', 'Varna', 'Burgas', 'Ruse', 'Stara Zagora'] },
    'Yunanistan': { en: 'Greece', iso: 'GR', cities: ['Athens', 'Thessaloniki', 'Patras', 'Heraklion', 'Larissa'] },
    'Çekya': { en: 'Czechia', iso: 'CZ', cities: ['Praha', 'Brno', 'Ostrava', 'Plzeň'] },
    'Macaristan': { en: 'Hungary', iso: 'HU', cities: ['Budapest', 'Debrecen', 'Szeged', 'Győr'] },
    'İsveç': { en: 'Sweden', iso: 'SE', cities: ['Stockholm', 'Göteborg', 'Malmö', 'Uppsala'] },
    'Danimarka': { en: 'Denmark', iso: 'DK', cities: ['Copenhagen', 'Aarhus', 'Odense', 'Aalborg'] },
    'Norveç': { en: 'Norway', iso: 'NO', cities: ['Oslo', 'Bergen', 'Stavanger', 'Trondheim'] },
    'Portekiz': { en: 'Portugal', iso: 'PT', cities: ['Lisboa', 'Porto', 'Braga', 'Coimbra'] },
    'İrlanda': { en: 'Ireland', iso: 'IE', cities: ['Dublin', 'Cork', 'Limerick', 'Galway'] },
    'Sırbistan': { en: 'Serbia', iso: 'RS', cities: ['Belgrade', 'Novi Sad', 'Niš'] },
    'Bosna Hersek': { en: 'Bosnia and Herzegovina', iso: 'BA', cities: ['Sarajevo', 'Banja Luka', 'Tuzla', 'Mostar'] },
    'Arnavutluk': { en: 'Albania', iso: 'AL', cities: ['Tirana', 'Durrës', 'Vlorë'] },
    'Hırvatistan': { en: 'Croatia', iso: 'HR', cities: ['Zagreb', 'Split', 'Rijeka', 'Osijek'] },
    'BAE': { en: 'United Arab Emirates', iso: 'AE', cities: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah'] },
    'Suudi Arabistan': { en: 'Saudi Arabia', iso: 'SA', cities: ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar'] },
    'Katar': { en: 'Qatar', iso: 'QA', cities: ['Doha', 'Al Rayyan', 'Al Wakrah'] },
    'Kuveyt': { en: 'Kuwait', iso: 'KW', cities: ['Kuwait City', 'Hawalli', 'Salmiya'] },
    'Umman': { en: 'Oman', iso: 'OM', cities: ['Muscat', 'Salalah', 'Sohar'] },
    'Bahreyn': { en: 'Bahrain', iso: 'BH', cities: ['Manama', 'Riffa', 'Muharraq'] },
    'Irak': { en: 'Iraq', iso: 'IQ', cities: ['Erbil', 'Baghdad', 'Basra', 'Sulaymaniyah', 'Duhok', 'Mosul'] },
    'Ürdün': { en: 'Jordan', iso: 'JO', cities: ['Amman', 'Zarqa', 'Irbid', 'Aqaba'] },
    'Azerbaycan': { en: 'Azerbaijan', iso: 'AZ', cities: ['Bakü', 'Ganja', 'Sumqayit', 'Lankaran'] },
    'KKTC': { en: 'Northern Cyprus', iso: 'CY', cities: ['Lefkoşa', 'Girne', 'Gazimağusa', 'Güzelyurt'] },
    'Kazakistan': { en: 'Kazakhstan', iso: 'KZ', cities: ['Almaty', 'Astana', 'Shymkent', 'Atyrau'] },
    'Özbekistan': { en: 'Uzbekistan', iso: 'UZ', cities: ['Tashkent', 'Samarkand', 'Bukhara', 'Namangan'] },
    'Gürcistan': { en: 'Georgia', iso: 'GE', cities: ['Tbilisi', 'Batumi', 'Kutaisi'] },
    'Rusya': { en: 'Russia', iso: 'RU', cities: ['Moscow', 'Saint Petersburg', 'Kazan', 'Novosibirsk', 'Yekaterinburg', 'Krasnodar'] },
    'ABD': { en: 'United States', iso: 'US', cities: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Miami', 'Dallas', 'Atlanta', 'Boston', 'San Francisco', 'Seattle'] },
    'Kanada': { en: 'Canada', iso: 'CA', cities: ['Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Ottawa'] },
    'Çin': { en: 'China', iso: 'CN', cities: ['Shanghai', 'Guangzhou', 'Shenzhen', 'Beijing', 'Yiwu', 'Hangzhou', 'Foshan'] },
    'Japonya': { en: 'Japan', iso: 'JP', cities: ['Tokyo', 'Osaka', 'Yokohama', 'Nagoya'] },
    'Güney Kore': { en: 'South Korea', iso: 'KR', cities: ['Seoul', 'Busan', 'Incheon'] },
    'Hindistan': { en: 'India', iso: 'IN', cities: ['Mumbai', 'New Delhi', 'Bengaluru', 'Chennai', 'Ahmedabad'] },
    'Mısır': { en: 'Egypt', iso: 'EG', cities: ['Cairo', 'Alexandria', 'Giza', 'New Cairo'] },
    'Fas': { en: 'Morocco', iso: 'MA', cities: ['Casablanca', 'Rabat', 'Tanger', 'Marrakech'] },
    'Cezayir': { en: 'Algeria', iso: 'DZ', cities: ['Algiers', 'Oran', 'Constantine'] }
  };

  // Zero-latency global city coordinates [lat, lon, halfSpan]
  const GLOBAL_CITY_COORDS = {
    'berlin': [52.5200, 13.4050, 0.16], 'munchen': [48.1351, 11.5820, 0.14], 'hamburg': [53.5511, 9.9937, 0.15],
    'koln': [50.9375, 6.9603, 0.13], 'frankfurt': [50.1109, 8.6821, 0.13], 'stuttgart': [48.7758, 9.1829, 0.12],
    'dusseldorf': [51.2277, 6.7735, 0.12], 'dortmund': [51.5136, 7.4653, 0.11], 'essen': [51.4556, 7.0116, 0.11],
    'nurnberg': [49.4521, 11.0767, 0.11], 'hannover': [52.3759, 9.7320, 0.12], 'bremen': [53.0793, 8.8017, 0.11],
    'leipzig': [51.3397, 12.3731, 0.11], 'london': [51.5074, -0.1278, 0.18], 'manchester': [53.4808, -2.2426, 0.13],
    'birmingham': [52.4862, -1.8904, 0.13], 'leeds': [53.8008, -1.5491, 0.12], 'glasgow': [55.8642, -4.2518, 0.12],
    'amsterdam': [52.3676, 4.9041, 0.13], 'rotterdam': [51.9244, 4.4777, 0.12], 'den haag': [52.0705, 4.3007, 0.10],
    'utrecht': [52.0907, 5.1214, 0.10], 'eindhoven': [51.4416, 5.4697, 0.10], 'paris': [48.8566, 2.3522, 0.15],
    'lyon': [45.7640, 4.8357, 0.12], 'marseille': [43.2965, 5.3698, 0.12], 'milano': [45.4642, 9.1900, 0.14],
    'roma': [41.9028, 12.4964, 0.16], 'torino': [45.0703, 7.6869, 0.12], 'bologna': [44.4949, 11.3426, 0.11],
    'madrid': [40.4168, -3.7038, 0.16], 'barcelona': [41.3874, 2.1686, 0.14], 'valencia': [39.4699, -0.3763, 0.11],
    'brussels': [50.8503, 4.3517, 0.12], 'antwerp': [51.2194, 4.4025, 0.11], 'wien': [48.2082, 16.3738, 0.14],
    'zurich': [47.3769, 8.5417, 0.11], 'geneve': [46.2044, 6.1432, 0.10], 'warszawa': [52.2297, 21.0122, 0.15],
    'bucuresti': [44.4268, 26.1025, 0.14], 'sofia': [42.6977, 23.3219, 0.13], 'plovdiv': [42.1354, 24.7453, 0.10],
    'athens': [37.9838, 23.7275, 0.14], 'thessaloniki': [40.6401, 22.9444, 0.11], 'praha': [50.0755, 14.4378, 0.14],
    'budapest': [47.4979, 19.0402, 0.14], 'stockholm': [59.3293, 18.0686, 0.14], 'copenhagen': [55.6761, 12.5683, 0.13],
    'oslo': [59.9139, 10.7522, 0.12], 'lisboa': [38.7223, -9.1393, 0.13], 'dublin': [53.3498, -6.2603, 0.13],
    'belgrade': [44.7866, 20.4489, 0.13], 'sarajevo': [43.8563, 18.4131, 0.10], 'tirana': [41.3275, 19.8187, 0.10],
    'zagreb': [45.8150, 15.9819, 0.12], 'dubai': [25.2048, 55.2708, 0.18], 'abu dhabi': [24.4539, 54.3773, 0.16],
    'sharjah': [25.3463, 55.4209, 0.12], 'riyadh': [24.7136, 46.6753, 0.18], 'jeddah': [21.4858, 39.1925, 0.16],
    'doha': [25.2854, 51.5310, 0.14], 'kuwait city': [29.3759, 47.9774, 0.14], 'muscat': [23.5880, 58.3829, 0.14],
    'manama': [26.2285, 50.5860, 0.10], 'erbil': [36.1901, 44.0091, 0.13], 'baghdad': [33.3152, 44.3661, 0.16],
    'amman': [31.9454, 35.9284, 0.14], 'baku': [40.4093, 49.8671, 0.15], 'lefkosa': [35.1856, 33.3823, 0.10],
    'girne': [35.3364, 33.3199, 0.09], 'almaty': [43.2220, 76.8512, 0.15], 'astana': [51.1694, 71.4491, 0.14],
    'tashkent': [41.2995, 69.2401, 0.15], 'tbilisi': [41.7151, 44.8271, 0.13], 'batumi': [41.6168, 41.6367, 0.09],
    'moscow': [55.7558, 37.6173, 0.20], 'saint petersburg': [59.9311, 30.3609, 0.18],
    'new york': [40.7128, -74.0060, 0.18], 'los angeles': [34.0522, -118.2437, 0.18], 'chicago': [41.8781, -87.6298, 0.16],
    'houston': [29.7604, -95.3698, 0.16], 'miami': [25.7617, -80.1918, 0.15], 'toronto': [43.6532, -79.3832, 0.16],
    'shanghai': [31.2304, 121.4737, 0.18], 'guangzhou': [23.1291, 113.2644, 0.16], 'shenzhen': [22.5431, 114.0579, 0.16],
    'tokyo': [35.6762, 139.6503, 0.18], 'seoul': [37.5665, 126.9780, 0.16], 'mumbai': [19.0760, 72.8777, 0.16],
    'cairo': [30.0444, 31.2357, 0.17], 'casablanca': [33.5731, -7.5898, 0.14], 'algiers': [36.7538, 3.0588, 0.13]
  };

  const OSM_SECTOR_TAGS = {
    mobilya: ['["shop"="furniture"]', '["craft"="carpenter"]', '["craft"="upholsterer"]', '["shop"="kitchen"]', '["shop"="bed"]', '["shop"="interior_decoration"]'],
    mutfak: ['["shop"="kitchen"]', '["craft"="cabinet_maker"]', '["shop"="appliance"]', '["shop"="furniture"]'],
    ahsap: ['["craft"="carpenter"]', '["craft"="sawmill"]', '["shop"="timber"]', '["shop"="doityourself"]'],
    dekorasyon: ['["shop"="interior_decoration"]', '["shop"="curtain"]', '["shop"="carpet"]', '["shop"="lighting"]', '["office"="interior_design"]'],
    insaat: ['["office"="construction_company"]', '["shop"="trade"]', '["shop"="building_materials"]', '["shop"="hardware"]'],
    muteahhit: ['["office"="construction_company"]', '["office"="architect"]', '["office"="engineer"]'],
    mimar: ['["office"="architect"]', '["office"="interior_design"]'],
    mimarlik: ['["office"="architect"]', '["office"="interior_design"]'],
    metal: ['["craft"="metal_construction"]', '["industrial"="metal"]', '["craft"="welder"]'],
    makina: ['["industrial"="machine_shop"]', '["craft"="machinist"]', '["industrial"="factory"]'],
    plastik: ['["industrial"="plastic"]', '["industrial"="packaging"]', '["industrial"="factory"]'],
    tekstil: ['["shop"="fabric"]', '["craft"="tailor"]', '["shop"="clothes"]', '["industrial"="textile"]'],
    giyim: ['["shop"="clothes"]', '["shop"="boutique"]', '["shop"="shoes"]'],
    lojistik: ['["office"="logistics"]', '["office"="transport"]', '["building"="warehouse"]', '["industrial"="logistics"]'],
    otomotiv: ['["shop"="car_repair"]', '["shop"="car_parts"]', '["shop"="car"]', '["shop"="tyres"]'],
    gida: ['["shop"="wholesale"]', '["shop"="supermarket"]', '["shop"="bakery"]', '["shop"="butcher"]', '["shop"="deli"]'],
    restoran: ['["amenity"="restaurant"]', '["amenity"="fast_food"]', '["amenity"="cafe"]'],
    otel: ['["tourism"="hotel"]', '["tourism"="guest_house"]', '["tourism"="apartment"]'],
    turizm: ['["shop"="travel_agency"]', '["tourism"="hotel"]'],
    elektrik: ['["craft"="electrician"]', '["shop"="electronics"]', '["shop"="lighting"]', '["office"="energy_supplier"]'],
    medikal: ['["shop"="medical_supply"]', '["amenity"="clinic"]', '["amenity"="doctors"]', '["amenity"="dentist"]', '["amenity"="hospital"]'],
    eczane: ['["amenity"="pharmacy"]', '["healthcare"="pharmacy"]'],
    kozmetik: ['["shop"="cosmetics"]', '["shop"="perfumery"]', '["shop"="beauty"]'],
    kuyumcu: ['["shop"="jewelry"]', '["craft"="jeweller"]'],
    kimya: ['["industrial"="chemical"]', '["shop"="chemist"]'],
    mermer: ['["craft"="stonemason"]', '["shop"="tiles"]'],
    cam: ['["craft"="glaziery"]', '["craft"="window_construction"]'],
    boya: ['["shop"="paint"]', '["craft"="painter"]'],
    isitma: ['["craft"="hvac"]', '["craft"="plumber"]'],
    asansor: ['["craft"="elevator"]', '["office"="company"]'],
    yazilim: ['["office"="it"]', '["office"="software"]', '["office"="telecommunication"]'],
    banka: ['["amenity"="bank"]', '["office"="financial"]'],
    tutun: ['["shop"="tobacco"]', '["shop"="e-cigarette"]'],
    avukat: ['["office"="lawyer"]', '["office"="notary"]'],
    emlak: ['["office"="estate_agent"]', '["office"="property_management"]'],
    sigorta: ['["office"="insurance"]'],
    kapi: ['["shop"="doors"]', '["craft"="carpenter"]', '["craft"="locksmith"]'],
    pencere: ['["craft"="window_construction"]', '["craft"="glaziery"]', '["shop"="window_blind"]'],
    seramik: ['["shop"="tiles"]', '["craft"="tiler"]', '["shop"="bathroom_furnishing"]'],
    hali: ['["shop"="carpet"]', '["shop"="flooring"]', '["shop"="interior_decoration"]'],
    forklift: ['["industrial"="machine_shop"]', '["shop"="trade"]', '["industrial"="logistics"]'],
    ambalaj: ['["industrial"="packaging"]', '["industrial"="plastic"]'],
    matbaa: ['["craft"="printer"]', '["shop"="copyshop"]']
  };

  const OVERPASS_MIRRORS = [
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
  ];

  // State
  let manifest = { shards: {}, districts: {}, taxonomy: {} };
  const shardCache = new Map(); // key -> { city, region, records }
  const mxCache = new Map();    // domain -> 'mx' | 'none'
  let turboConnected = false;
  let cloudApiConnected = false;
  let turboToken = '';
  let turboPollTimer = null;

  let activeRecords = [];       // All filtered records in Cloud/Memory mode
  let turboPageData = null;     // Server-side page response when using Turbo DB directly
  let currentOffset = 0;
  let activeMode = 'cloud';     // 'cloud' | 'turbo-db'
  let hasStartedSearch = false; // Never auto-populate results before user clicks "Firmaları Bul & Getir"
  let searchInFlight = false;
  let activeSearchSeq = 0;
  let activeSearchAbort = null;
  let turboIsPaused = false;
  let searchMapInstance = null;
  let searchMapMarkers = [];
  let h3MapInstance = null;

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
    if ($('searchMapWrap')) $('searchMapWrap').hidden = true;
    if ($('toggleSearchMapBtn')) $('toggleSearchMapBtn').textContent = '🗺️ Haritada Göster';
    $('emptyPrompt').hidden = false;
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

  const CLIENT_SECTOR_ALIASES = {
    mobilya: ['furniture', 'furniture store', 'cabinet maker', 'carpenter', 'meuble', 'meubles', 'mobilier', 'menuiserie', 'literie', 'moebel', 'schreinerei', 'tischlerei', 'mobili', 'arredamento', 'muebles', 'carpinteria', 'meubel', 'interieur', 'koltuk', 'yatak', 'marangoz'],
    mutfak: ['kitchen', 'kitchen furniture', 'cabinet maker', 'cuisine', 'cuisiniste', 'kueche', 'keuken', 'cucine', 'cocinas', 'ankastre'],
    ahsap: ['carpenter', 'woodworking', 'timber', 'menuiserie', 'bois', 'holz', 'schreinerei', 'legno', 'madera', 'hout', 'marangoz', 'kereste'],
    dekorasyon: ['interior design', 'home decor', 'decoration', 'luminaire', 'inneneinrichtung', 'arredamento', 'decoracion', 'interieur', 'perde', 'hali'],
    insaat: ['construction', 'contractor', 'building materials', 'batiment', 'travaux', 'bau', 'baustoffe', 'edilizia', 'costruzioni', 'construccion', 'bouw', 'yapi', 'muteahhit'],
    muteahhit: ['general contractor', 'construction company', 'batiment', 'travaux', 'bauunternehmen', 'costruzioni', 'construccion', 'bouwbedrijf', 'insaat'],
    tadilat: ['renovation', 'remodeling', 'travaux', 'sanierung', 'innenausbau', 'ristrutturazione', 'reformas', 'renovatie', 'dekorasyon'],
    mimar: ['architect', 'architecture', 'interior design', 'architecte', 'architekt', 'architetto', 'arquitecto', 'mimarlik'],
    mimarlik: ['architect', 'architecture', 'interior design', 'architecte', 'architekt', 'architetto', 'arquitecto'],
    metal: ['metal fabrication', 'steel', 'welder', 'metallerie', 'acier', 'metallbau', 'stahlbau', 'carpenteria metallica', 'metalurgia', 'celik', 'torna'],
    makina: ['machinery', 'machine shop', 'automation', 'mecanique', 'maschinenbau', 'meccanica', 'maquinaria', 'machinefabriek', 'endustriyel'],
    plastik: ['plastics', 'packaging', 'plasturgie', 'plastique', 'kunststoff', 'materie plastiche', 'plasticos', 'kunststof', 'ambalaj'],
    tekstil: ['textile', 'fabric', 'garment', 'tissu', 'confection', 'stoffe', 'tessuti', 'tejidos', 'textiel', 'konfeksiyon', 'kumas'],
    giyim: ['clothing', 'apparel', 'boutique', 'vetement', 'mode', 'bekleidung', 'abbigliamento', 'ropa', 'kleding', 'butik'],
    lojistik: ['logistics', 'transport', 'freight', 'warehouse', 'logistique', 'spedition', 'logistik', 'trasporti', 'transporte', 'logistiek', 'nakliyat', 'kargo'],
    otomotiv: ['automotive', 'auto repair', 'auto parts', 'car dealer', 'automobile', 'garage', 'autohaus', 'autowerkstatt', 'autofficina', 'taller', 'oto'],
    gida: ['food', 'bakery', 'wholesaler', 'supermarket', 'agroalimentaire', 'boulangerie', 'lebensmittel', 'alimentari', 'alimentacion', 'voeding'],
    restoran: ['restaurant', 'bistro', 'brasserie', 'ristorante', 'restaurante', 'cafe', 'lokanta'],
    otel: ['hotel', 'resort', 'hostel', 'lodging', 'auberge', 'albergo', 'konaklama'],
    elektrik: ['electrician', 'electronics', 'solar', 'electricite', 'elektrotechnik', 'elettricista', 'electricidad', 'enerji', 'aydinlatma'],
    medikal: ['medical', 'clinic', 'hospital', 'dentist', 'materiel medical', 'clinique', 'medizintechnik', 'klinik', 'ortopedia', 'saglik'],
    kozmetik: ['cosmetics', 'perfume', 'beauty', 'cosmetique', 'parfumerie', 'kosmetik', 'profumeria', 'perfumeria'],
    kuyumcu: ['jewelry', 'jeweler', 'watch', 'bijouterie', 'joaillerie', 'juwelier', 'gioielleria', 'joyeria'],
    kimya: ['chemical', 'paint', 'chimie', 'chemie', 'chimica', 'quimica', 'boya'],
    mermer: ['marble', 'granite', 'stone', 'marbrerie', 'marbre', 'naturstein', 'marmi', 'marmoles', 'dogaltas'],
    cam: ['glass', 'glazier', 'window', 'vitrerie', 'glaserei', 'vetreria', 'cristaleria'],
    boya: ['paint', 'hardware', 'peinture', 'quincaillerie', 'farben', 'ferramenta', 'pinturas', 'ferreteria'],
    isitma: ['hvac', 'heating', 'plumbing', 'air conditioning', 'chauffage', 'climatisation', 'heizung', 'klimatechnik', 'termoidraulica', 'klima'],
    yazilim: ['software', 'information technology', 'it service', 'logiciel', 'informatique', 'softwarehaus', 'informatica', 'bilisim'],
    banka: ['bank', 'finance', 'banque', 'sparkasse', 'banca', 'banco', 'finans'],
    tutun: ['tobacco', 'tabac', 'tabak', 'tabaccheria', 'estanco', 'tekel'],
    avukat: ['lawyer', 'law firm', 'notary', 'avocat', 'rechtsanwalt', 'kanzlei', 'avvocato', 'abogado', 'hukuk'],
    emlak: ['real estate', 'property', 'immobilier', 'immobilien', 'immobiliare', 'inmobiliaria', 'makelaar', 'gayrimenkul'],
    sigorta: ['insurance', 'assurance', 'versicherung', 'assicurazioni', 'seguros', 'verzekering'],
    kapi: ['door', 'doors', 'porte', 'portail', 'tueren', 'tore', 'puertas', 'deuren', 'celik kapi', 'kepenk', 'panjur'],
    pencere: ['window', 'windows', 'fenetre', 'volet', 'fenster', 'rollladen', 'finestre', 'infissi', 'ventanas', 'ramen', 'pvc'],
    seramik: ['ceramic', 'tile', 'tiles', 'carrelage', 'ceramique', 'fliesen', 'keramik', 'ceramiche', 'piastrelle', 'azulejos', 'fayans'],
    hali: ['carpet', 'rug', 'flooring', 'tapis', 'moquette', 'teppich', 'tappeti', 'alfombras', 'tapijt', 'kilim', 'parke'],
    forklift: ['forklift', 'material handling', 'chariot elevateur', 'manutention', 'gabelstapler', 'carrelli elevatori', 'heftruck', 'istif', 'transpalet'],
    gunes: ['solar', 'solar energy', 'solaire', 'photovoltaique', 'photovoltaik', 'solaranlagen', 'fotovoltaico', 'zonnepanelen', 'gunes paneli'],
    otomasyon: ['automation', 'robotics', 'automatisme', 'robotique', 'automatisierung', 'automazione', 'cnc', 'plc'],
    dokum: ['foundry', 'fonderie', 'giesserei', 'fonderia', 'fundicion', 'gieterij'],
    kalip: ['mold', 'tool and die', 'moule', 'outillage', 'werkzeugbau', 'formenbau', 'stampi', 'moldes'],
    hidrolik: ['hydraulic', 'pneumatics', 'hydraulique', 'hydraulik', 'oleodinamica', 'hidraulica', 'pnomatik'],
    rulman: ['bearing', 'roulement', 'kugellager', 'cuscinetti', 'rodamientos', 'lagers'],
    yalitim: ['insulation', 'waterproofing', 'isolation', 'etancheite', 'daemmung', 'isolamento', 'aislamiento', 'izolasyon', 'epoksi'],
    ambalaj: ['packaging', 'emballage', 'carton', 'verpackung', 'imballaggi', 'embalaje', 'verpakking', 'etiket', 'koli'],
    matbaa: ['print shop', 'imprimerie', 'druckerei', 'tipografia', 'imprenta', 'drukkerij', 'reklam', 'tabela']
  };

  const CLIENT_STOPWORDS = new Set([
    've', 'ile', 'icin', 'de', 'da', 'den', 'dan',
    'of', 'and', 'for', 'the', 'in', 'to', 'by', 'on', 'at', 'with',
    'du', 'des', 'la', 'le', 'les', 'et', 'en', 'au', 'aux', 'd', 'l', 'sur', 'pour',
    'und', 'der', 'die', 'das', 'dem', 'fur', 'fuer', 'von', 'mit', 'im',
    'di', 'del', 'della', 'delle', 'dei', 'degli', 'ed', 'per', 'con',
    'el', 'los', 'las', 'por', 'para', 'y', 'van', 'het', 'een', 'voor', 'met'
  ]);

  const CLIENT_GENERIC_MODIFIERS = new Set([
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
    'hersteller', 'fabrik', 'grosshandel', 'haendler', 'handler', 'geschaeft', 'unternehmen',
    'produttore', 'produttori', 'fabbrica', 'ingrosso', 'fornitore', 'negozio', 'impresa', 'azienda',
    'fabricante', 'fabricantes', 'mayorista', 'proveedor', 'tienda', 'empresa'
  ]);

  function stemTr(word) {
    let s = String(word || '').trim();
    s = s.replace(/(?:cilar|ciler|cular|culer|lar[i]?|ler[i]?)$/, '').trim();
    if (s.length >= 6 && !CLIENT_SECTOR_ALIASES[s]) {
      s = s.replace(/(?:ci|cu|lik|luk|si|su)$/, '').trim();
    }
    return s || String(word || '').trim();
  }

  function stemIntlClient(word) {
    let s = String(word || '').trim();
    if (s.length < 5) return s;
    for (const deSuf of ['hersteller', 'grosshandel', 'industrie', 'fabrik', 'handel', 'werke', 'werk']) {
      if (s.endsWith(deSuf) && s.length - deSuf.length >= 4) {
        s = s.slice(0, -deSuf.length);
        break;
      }
    }
    if (s.length < 5) return s;
    if (s.endsWith('ies') && s.length >= 6) return s.slice(0, -3) + 'y';
    if (s.endsWith('aux') && s.length >= 6) return s.slice(0, -3) + 'al';
    if ((s.endsWith('eurs') || s.endsWith('euses')) && s.length >= 7) return s.slice(0, -1);
    if (s.endsWith('es') && s.length >= 6 && ['meuble', 'cuisine', 'porte', 'fenetre', 'usine', 'entreprise'].includes(s.slice(0, -1))) {
      return s.slice(0, -1);
    }
    if (s.endsWith('s') && !s.endsWith('ss') && !s.endsWith('is') && !s.endsWith('us')) {
      return s.slice(0, -1);
    }
    return s;
  }

  const REVERSE_CLIENT_ALIASES = (() => {
    const map = new Map();
    const add = (term, canon) => {
      if (!term || term.length < 3) return;
      if (!map.has(term)) map.set(term, []);
      const arr = map.get(term);
      if (!arr.includes(canon)) arr.push(canon);
    };
    for (const [canon, list] of Object.entries(CLIENT_SECTOR_ALIASES)) {
      add(canon, canon);
      for (const item of list) {
        const fi = fold(item);
        add(fi, canon);
        add(stemIntlClient(stemTr(fi)), canon);
        const words = fi.split(' ').filter(w => w.length >= 4 && !CLIENT_STOPWORDS.has(w) && !CLIENT_GENERIC_MODIFIERS.has(w));
        if (words.length === 1) {
          add(words[0], canon);
          add(stemIntlClient(stemTr(words[0])), canon);
        }
      }
    }
    return map;
  })();

  function resolveClientCanonicalSectors(phraseFolded) {
    if (!phraseFolded) return [];
    const found = [];
    const addHits = cand => {
      if (!cand) return;
      if (CLIENT_SECTOR_ALIASES[cand] && !found.includes(cand)) found.push(cand);
      for (const c of (REVERSE_CLIENT_ALIASES.get(cand) || [])) {
        if (!found.includes(c)) found.push(c);
      }
    };
    addHits(phraseFolded);
    addHits(stemTr(phraseFolded));
    addHits(stemIntlClient(phraseFolded));
    if (found.length) return found;

    const toks = phraseFolded.split(' ').filter(t => t.length >= 3 && !CLIENT_STOPWORDS.has(t));
    for (const tok of toks) {
      addHits(tok);
      addHits(stemTr(tok));
      addHits(stemIntlClient(tok));
      addHits(stemIntlClient(stemTr(tok)));
    }
    return found;
  }

  function expandSectorTerms(sectorRaw) {
    const parts = String(sectorRaw || '').split(/[|,;]+/).map(fold).filter(Boolean);
    const out = [];
    for (const p of parts) {
      out.push(p);
      const stem = stemIntlClient(stemTr(p));
      if (stem && stem !== p && stem.length >= 3) out.push(stem);

      const canons = resolveClientCanonicalSectors(p);
      for (const ck of canons) {
        out.push(ck);
        const taxList = manifest.taxonomy && manifest.taxonomy[ck];
        if (Array.isArray(taxList)) {
          for (const a of taxList) out.push(fold(a));
        }
        if (CLIENT_SECTOR_ALIASES[ck]) {
          for (const a of CLIENT_SECTOR_ALIASES[ck]) out.push(fold(a));
        }
      }

      const directTax = manifest.taxonomy && manifest.taxonomy[p];
      if (Array.isArray(directTax)) {
        for (const a of directTax) out.push(fold(a));
      }

      const mToks = p.split(' ').filter(t => t.length >= 3 && !CLIENT_STOPWORDS.has(t));
      const nonGen = mToks.filter(t => !CLIENT_GENERIC_MODIFIERS.has(t) && !CLIENT_GENERIC_MODIFIERS.has(stemIntlClient(stemTr(t))));
      const tokPool = nonGen.length ? nonGen : (!canons.length ? mToks : []);
      for (const tok of tokPool) {
        out.push(tok);
        const ts = stemIntlClient(stemTr(tok));
        if (ts && ts !== tok && ts.length >= 3) out.push(ts);
      }
    }
    return Array.from(new Set(out.filter(Boolean)));
  }

  function matchesTerms(searchText, termList) {
    if (!termList.length) return true;
    for (const t of termList) {
      if (t.includes(' ')) {
        if (searchText.includes(` ${t} `)) return true;
      } else if (t.length >= 7) {
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

  const NACE_SECTOR_HINTS = {
    '47.59': 'Yatak',
    '31.01': 'Ofis Mobilyası',
    '31.02': 'Mutfak',
    '16.23': 'Ahşap',
    '31.09': 'Mobilya',
    '31': 'Mobilya',
    '41.20.02': 'Müteahhit',
    '41.20': 'İnşaat',
    '41': 'İnşaat',
    '71.11': 'Mimarlık',
    '28.99': 'Makina',
    '28': 'Makina',
    '25.11': 'Çelik',
    '25': 'Metal',
    '22.29': 'Plastik',
    '22': 'Plastik',
    '13.92': 'Tekstil',
    '13': 'Tekstil',
    '49.41': 'Lojistik',
    '49': 'Lojistik',
    '45.20': 'Otomotiv',
    '45': 'Otomotiv',
    '10.89': 'Gıda',
    '10': 'Gıda',
    '43.21': 'Elektrik',
    '43': 'Elektrik',
    '32.50': 'Medikal',
    '47.52': 'Hırdavat'
  };

  function normalizeNaceQuery(raw) {
    const val = String(raw || '').trim();
    if (!val) return '';
    const m = val.match(/^(\d{2}(?:\.\d{2})?(?:\.\d{2})?)/);
    return m ? m[1] : val;
  }

  function naceToSectorHint(naceQuery) {
    const q = normalizeNaceQuery(naceQuery);
    if (!q) return '';
    for (const prefix of Object.keys(NACE_SECTOR_HINTS).sort((a, b) => b.length - a.length)) {
      if (q.startsWith(prefix) || prefix.startsWith(q)) {
        return NACE_SECTOR_HINTS[prefix];
      }
    }
    return '';
  }

  function matchesNaceFilter(naceObj, naceQuery) {
    if (!naceQuery) return true;
    const q = normalizeNaceQuery(naceQuery);
    const code = String((naceObj && naceObj.code) || '').trim();
    const title = fold((naceObj && naceObj.title) || '');
    if (/^\d/.test(q)) {
      return code.startsWith(q);
    }
    const qFold = fold(q);
    return fold(code).includes(qFold) || title.includes(qFold);
  }

  function detectWhatsapp(phones) {
    if (!phones || !phones.length) return null;
    for (const ph of phones) {
      const clean = String(ph).replace(/\D+/g, '');
      let mobile = '';
      // Türkiye mobile (+90 5xx)
      if (clean.length === 10 && clean.startsWith('5')) mobile = '90' + clean;
      else if (clean.length === 11 && clean.startsWith('05')) mobile = '9' + clean;
      else if (clean.length === 12 && clean.startsWith('905')) mobile = clean;
      // International mobile prefixes (DE, GB, NL, FR, IT, ES, BE, AT, CH, PL, RO, BG, GR, AE, SA, QA, KW, IQ, AZ, RU, KZ, UZ, GE, EG, MA, DZ)
      else if (clean.length >= 10 && clean.length <= 15 && /^(491[567]|447\d|316\d|33[67]\d|393\d|34[67]\d|324\d|436\d|417\d|48[5678]\d|407\d|359[89]|3069|9715|9665|974[3567]|965[569]|9647|994[57]|79\d\d|77\d\d|9989|9955|201[0125]|212[67]|213[567])/.test(clean)) {
        mobile = clean;
      }
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
      case 'has_website': return Boolean(row && row.website);
      case 'both': return hasEmail && hasPhone;
      case 'email_only': return hasEmail && !hasPhone;
      case 'phone_only': return hasPhone && !hasEmail;
      default: return true;
    }
  }

  function resolveSelectedCity(countryVal, selectEl, customEl) {
    if (!selectEl) return '__all__';
    const raw = selectEl.value;
    if (raw === '__all__' || raw === '__all_country__') return '__all__';
    if (raw === '__custom__') {
      const typed = customEl ? customEl.value.trim() : '';
      return typed || '__empty_custom__';
    }
    return raw || '__all__';
  }

  function currentFilters() {
    const country = $('countrySelect').value || 'Türkiye';
    const cityRaw = resolveSelectedCity(country, $('citySelect'), $('cityCustomInput'));
    const isEmptyCustom = cityRaw === '__empty_custom__';
    const isAll = cityRaw === '__all__' || cityRaw === '__all_country__';
    const city = isEmptyCustom ? '__empty_custom__' : (isAll ? '__all__' : cityRaw);
    const cityDisplay = isEmptyCustom
      ? 'Özel Şehir Girilmedi'
      : (isAll ? (country === 'Türkiye' ? 'Tüm Şehirler (81 İl)' : `Tüm Şehirler (${country})`) : city);
    const district = $('districtSelect').value.trim();
    const sector = $('sectorInput').value.trim();
    const naceCode = ($('naceInput') ? $('naceInput').value.trim() : '');
    const contactMode = $('contactModeSelect').value;
    const quick = fold($('quickSearchInput').value);
    const region = `${isEmptyCustom ? '__all__' : city}, ${country}`;
    return { country, city, cityDisplay, district, sector, naceCode, contactMode, quick, region, isEmptyCustom };
  }

  // Apple Motion Architecture (Scroll-Driven Staggered 80ms Reveal across Launchpad & Workspaces)
  function initMotion() {
    document.querySelectorAll('.flow-tile').forEach(tile => tile.classList.add('reveal'));
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

  function revealWorkspaceCards(sectionEl) {
    if (!sectionEl) return;
    const cards = Array.from(sectionEl.querySelectorAll(':scope > .card, :scope > .flow-help'));
    cards.forEach((card, idx) => {
      card.classList.add('reveal');
      card.style.setProperty('--stagger', `${idx * 80}ms`);
      requestAnimationFrame(() => card.classList.add('is-visible'));
    });
  }

  // Populate UI Selects (Supports 'Tüm Şehirler' on BOTH Türkiye 81 Provinces & all 46 Global Export Countries)
  function populateCitiesForCountry(countryVal, sel, customInput, forceReset = false, includeAll = true) {
    if (!sel) return;
    const isTr = countryVal === 'Türkiye';
    const meta = GLOBAL_COUNTRIES[countryVal] || { cities: ['Berlin'] };
    const cityList = isTr ? TR_PROVINCES : (meta.cities || []);
    let prev = forceReset ? '' : sel.value;
    if (prev === '__all_country__') prev = '__all__';
    const validSpecials = includeAll ? ['__all__', '__custom__'] : ['__custom__'];
    if (!prev || (!cityList.includes(prev) && !validSpecials.includes(prev))) {
      prev = includeAll ? '__all__' : (isTr ? 'İstanbul' : (cityList[0] || 'Berlin'));
    }
    sel.replaceChildren();
    if (includeAll) {
      const allLabel = isTr
        ? '🌍 Tüm Şehirler (81 İl Türkiye Geneli)'
        : `🌍 Tüm Şehirler (${countryVal} Geneli)`;
      const allOpt = el('option', allLabel);
      allOpt.value = '__all__';
      if (prev === '__all__') allOpt.selected = true;
      sel.append(allOpt);
    }
    for (const cName of cityList) {
      const opt = el('option', cName);
      opt.value = cName;
      if (cName === prev) opt.selected = true;
      sel.append(opt);
    }
    if (!isTr && customInput) {
      const customOpt = el('option', '✏️ Başka Şehir Yaz…');
      customOpt.value = '__custom__';
      if (prev === '__custom__') customOpt.selected = true;
      sel.append(customOpt);
    }
    sel.value = prev;
    if (sel.selectedIndex < 0 && sel.options.length > 0) {
      sel.selectedIndex = 0;
    }
    sel.hidden = false;
    if (customInput) {
      if (forceReset) customInput.value = '';
      customInput.hidden = (sel.value !== '__custom__');
    }
  }

  function populateCities() {
    if ($('exportCountrySelect') && $('countrySelect') && $('exportCountrySelect').options.length <= 2) {
      $('exportCountrySelect').innerHTML = $('countrySelect').innerHTML;
      $('exportCountrySelect').value = 'Türkiye';
    }
    populateCitiesForCountry($('countrySelect') ? $('countrySelect').value : 'Türkiye', $('citySelect'), $('cityCustomInput'), false, true);
    populateCitiesForCountry($('exportCountrySelect') ? $('exportCountrySelect').value : 'Türkiye', $('exportCitySelect'), $('exportCityCustomInput'), false, true);
    const h3Sel = $('h3CitySelect');
    if (h3Sel) {
      populateCitiesForCountry('Türkiye', h3Sel, null, false, true);
      h3Sel.value = 'İstanbul';
    }
  }

  function isCleanDistrictName(raw) {
    const s = String(raw || '').trim();
    if (s.length < 2 || s.length > 28) return false;
    if (/[0-9/?\\@#&*+=<>[\]{}|]/.test(s)) return false;
    return true;
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
    const merged = Array.from(
      new Set([...fromDefault, ...fromManifest, ...extraDistricts].filter(isCleanDistrictName))
    ).sort((a, b) => a.localeCompare(b, 'tr'));

    for (const d of merged) {
      const opt = el('option', d);
      opt.value = d;
      if (d === prev) opt.selected = true;
      sel.append(opt);
    }
    if (prev && merged.includes(prev)) {
      sel.value = prev;
    } else {
      sel.value = '';
    }
  }

  // Local Desktop Turbo Bridge Check (skips auto-loopback probe on iOS/Android mobile unless manually triggered)
  async function probeTurboBridge(manualTrigger = false) {
    const isMobileUa = /(?:iPhone|iPad|iPod|Android)/i.test(navigator.userAgent || '');
    if (!isMobileUa || manualTrigger || window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
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

          // Check Industrial Engine matrix with physical self-test verification
          try {
            const indRes = await turboApi('industrial/status?selftest=1', undefined, 9000);
            if (indRes && (indRes.status === 'active' || indRes.status === 'degraded')) {
              const indBadge = $('industrialBadge');
              if (indBadge) indBadge.style.display = 'inline-flex';
              const indText = $('industrialBadgeText');
              const actN = Number(indRes.active_engines || 0);
              const totN = Number(indRes.total_engines || 9);
              if (indText) {
                indText.innerHTML = actN === totN
                  ? `<span class="badge-long">${actN}/${totN} Pro Motor (DuckDB · H3 · Splink · RapidFuzz)</span><span class="badge-short">${actN}/${totN} Pro Motor</span>`
                  : `<span class="badge-long">${actN}/${totN} Pro Motor (${totN - actN} Devre Dışı)</span><span class="badge-short">${actN}/${totN} Pro Motor</span>`;
              }
              if ($('engineMatrixTitle')) {
                $('engineMatrixTitle').textContent = actN === totN
                  ? `Endüstriyel Motor Matrisi — ${actN}/${totN} Yerel C/C++/Rust Motoru Öz-Testten Geçti`
                  : `Endüstriyel Motor Matrisi — Kısmi Çalışma (${actN}/${totN} Aktif, ${totN - actN} Devre Dışı)`;
              }
              if ($('engineMatrixSubtitle')) {
                $('engineMatrixSubtitle').textContent = 'Yerel masaüstü servisi bağlı; her motor gerçek girdi üzerinde fiziksel öz-test ile doğrulandı:';
              }
              if (indRes.engines && typeof indRes.engines === 'object') {
                for (const [key, eng] of Object.entries(indRes.engines)) {
                  const badgeEl = document.querySelector(`[data-engine-badge="${key}"]`);
                  if (badgeEl && eng) {
                    if (eng.verified) {
                      const ver = eng.version ? `v${eng.version}` : 'Aktif';
                      const lat = typeof eng.latency_ms === 'number' ? ` · ${eng.latency_ms.toFixed(1)} ms` : '';
                      badgeEl.textContent = `● Doğrulandı (${ver}${lat})`;
                      badgeEl.className = 'badge mx-ok';
                    } else {
                      badgeEl.textContent = `⚠ Devre Dışı (${eng.state || 'Hata'})`;
                      badgeEl.className = 'badge dist';
                    }
                  }
                }
              }
            }
          } catch {}

          try {
            const st = await turboApi('status', undefined, 4000);
            if (st) {
              turboIsPaused = Boolean(st.paused);
              if ($('enrichPauseBtn')) {
                $('enrichPauseBtn').textContent = turboIsPaused ? '▶ Devam Ettir' : '⏸ Duraklat';
              }
              if ($('enrichLiveStatus')) {
                $('enrichLiveStatus').textContent =
                  `Durum: 128-Korutin Turbo Motor ${turboIsPaused ? 'Duraklatıldı' : 'Hazır'} · Doğrulanmış E-posta: ${fmt(st.contacts || 0)} · Tel: ${fmt(st.phones || 0)}`;
              }
            }
          } catch {}

          return true;
        }
      } catch {
        // Expected on remote PCs/phones where local desktop server is not running
      }
    }
    turboConnected = false;
    turboToken = '';
    // Probe optional same-origin Serverless Cloud Intelligence API only when advertised by manifest or window flag
    cloudApiConnected = false;
    if ((manifest && manifest.cloud_api === true) || window.HARITALAR_CLOUD_API === true) {
      try {
        const cCtrl = new AbortController();
        const cTimer = setTimeout(() => cCtrl.abort(), 1600);
        const cRes = await fetch('/api/cloud/health', { signal: cCtrl.signal });
        clearTimeout(cTimer);
        if (cRes.ok) {
          const cJson = await cRes.json().catch(() => ({}));
          if (cJson && cJson.status === 'active') cloudApiConnected = true;
        }
      } catch {}
    }

    const badge = $('engineBadge');
    if (badge) badge.className = 'engine-badge cloud';
    $('engineText').textContent = cloudApiConnected ? 'Bulut Sunucu Aktif' : 'Bulut Modu Hazır';
    $('enrichBtn').textContent = 'E-posta Kayıtlarını Doğrula';
    const indBadge = $('industrialBadge');
    if (indBadge) indBadge.style.display = 'none';
    const shardTotalCount = (manifest && manifest.shards) ? Object.keys(manifest.shards).length : 86;
    if ($('engineMatrixTitle')) {
      $('engineMatrixTitle').textContent = 'Endüstriyel Motor Matrisi — Bulut Modu (Yerel Servis Bağlı Değil)';
    }
    if ($('engineMatrixSubtitle')) {
      $('engineMatrixSubtitle').textContent =
        `Şu anda tarayıcı Bulut Modunda (${shardTotalCount} Ön-İndeksli Küresel/Ulusal CDN Parçası + Çoklu Ayna OSM + İkili DNS-over-HTTPS) çalışıyor. Aşağıdaki 9 derlenmiş C/C++/Rust motoru için yerel masaüstü servisi gereklidir:`;
    }
    document.querySelectorAll('[data-engine-badge]').forEach(elBadge => {
      elBadge.textContent = '☁ Yerel Servis Kapalı (Bulut Yedeği)';
      elBadge.className = 'badge dist';
    });
    if ($('enrichLiveStatus')) {
      $('enrichLiveStatus').textContent = 'Durum: Bulut İkili DNS-over-HTTPS (Google + Cloudflare) MX/SPF/DMARC doğrulama motoru hazır.';
    }
    return false;
  }

  async function turboApi(path, body, timeoutMs = 8000, externalSignal = null) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onExternalAbort = () => ctrl.abort();
    if (externalSignal) {
      if (externalSignal.aborted) ctrl.abort();
      else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
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
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
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

  // Live OpenStreetMap Nominatim + Zero-Latency City Lookup for any city in the world
  async function resolveCityBbox(city, country) {
    if (country === 'Türkiye' && CITY_BOXES[city]) {
      const [w, s, e, n] = CITY_BOXES[city].split(',').map(Number);
      return [w, s, e, n];
    }
    const cFold = fold(city);
    if (GLOBAL_CITY_COORDS[cFold]) {
      const [lat, lon, span] = GLOBAL_CITY_COORDS[cFold];
      return [lon - span * 1.35, lat - span, lon + span * 1.35, lat + span];
    }
    const cMeta = GLOBAL_COUNTRIES[country];
    const qCountry = (cMeta && cMeta.en) || country;
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' +
      encodeURIComponent(`${city}, ${qCountry}`);
    const res = await fetch(url, { headers: { 'Accept-Language': 'en,tr' } });
    if (!res.ok) throw new Error('Bölge koordinatı çözümlenemedi');
    const arr = await res.json();
    if (!arr.length || !arr[0].boundingbox) {
      throw new Error(`"${city}, ${country}" için harita sınırı bulunamadı`);
    }
    const [south, north, west, east] = arr[0].boundingbox.map(Number);
    const cLat = Number(arr[0].lat || (south + north) / 2);
    const cLon = Number(arr[0].lon || (west + east) / 2);
    // Clamp metropolitan core to max ±0.18° so Overpass never times out on wide regions
    return [
      Math.max(west, cLon - 0.22),
      Math.max(south, cLat - 0.16),
      Math.min(east, cLon + 0.22),
      Math.min(north, cLat + 0.16)
    ];
  }

  const COUNTRY_DIAL_PREFIX = {
    'TR': '90', 'DE': '49', 'GB': '44', 'NL': '31', 'FR': '33', 'IT': '39', 'ES': '34',
    'BE': '32', 'AT': '43', 'CH': '41', 'PL': '48', 'RO': '40', 'BG': '359', 'GR': '30',
    'CZ': '420', 'HU': '36', 'SE': '46', 'DK': '45', 'NO': '47', 'PT': '351', 'IE': '353',
    'RS': '381', 'BA': '387', 'AL': '355', 'HR': '385', 'AE': '971', 'SA': '966', 'QA': '974',
    'KW': '965', 'OM': '968', 'BH': '973', 'IQ': '964', 'JO': '962', 'AZ': '994', 'CY': '90',
    'KZ': '7', 'UZ': '998', 'GE': '995', 'RU': '7', 'US': '1', 'CA': '1', 'CN': '86',
    'JP': '81', 'KR': '82', 'IN': '91', 'EG': '20', 'MA': '212', 'DZ': '213'
  };

  function normalizePhoneClient(raw, country = 'Türkiye') {
    if (!raw) return '';
    const str = String(raw).trim();
    const digits = str.replace(/\D+/g, '');
    if (!digits || digits.length < 7) return '';
    if (str.startsWith('+') && digits.length >= 9 && digits.length <= 15) return '+' + digits;
    if (str.startsWith('00') && digits.length >= 11 && digits.length <= 17) return '+' + digits.slice(2);
    const iso = (GLOBAL_COUNTRIES[country] && GLOBAL_COUNTRIES[country].iso) || 'TR';
    const dial = COUNTRY_DIAL_PREFIX[iso] || '90';
    if (iso === 'TR') {
      if (digits.length === 10 && /^[23458]/.test(digits)) return '+90' + digits;
      if (digits.length === 11 && digits.startsWith('0')) return '+90' + digits.slice(1);
      if (digits.length === 12 && digits.startsWith('90')) return '+' + digits;
    } else {
      if (digits.startsWith(dial) && digits.length >= dial.length + 7 && digits.length <= 15) return '+' + digits;
      if (digits.startsWith('0') && digits.length >= 8 && digits.length <= 13) return '+' + dial + digits.slice(1);
      if (digits.length >= 8 && digits.length <= 11) return '+' + dial + digits;
    }
    if (digits.length >= 10 && digits.length <= 15) return '+' + digits;
    return '';
  }

  const NON_B2B_AMENITIES = new Set([
    'bench', 'waste_basket', 'parking', 'parking_space', 'parking_entrance', 'bicycle_parking',
    'motorcycle_parking', 'toilets', 'fountain', 'post_box', 'atm', 'vending_machine', 'shelter',
    'drinking_water', 'recycling', 'hunting_stand', 'clock', 'telephone', 'grit_bin', ' bollard'
  ]);

  function isBusinessOsmTags(tags) {
    if (!tags || !(tags.name || tags.brand)) return false;
    if (tags.shop || tags.craft || tags.office || tags.industrial || tags.company || tags.healthcare || tags.wholesale) return true;
    if (tags.man_made === 'works' || tags.building === 'industrial' || tags.building === 'warehouse' || tags.building === 'commercial') return true;
    if (tags.tourism && tags.tourism !== 'information' && tags.tourism !== 'viewpoint' && tags.tourism !== 'artwork') return true;
    if (tags.amenity && !NON_B2B_AMENITIES.has(tags.amenity)) return true;
    return false;
  }

  function elementMatchesTagClauses(tags, tagClauses) {
    if (!tags || !tagClauses || !tagClauses.length) return false;
    for (const c of tagClauses) {
      const mEq = c.match(/^\["([^"]+)"="([^"]+)"\]$/);
      if (mEq) {
        if (tags[mEq[1]] === mEq[2]) return true;
        continue;
      }
      const mRx = c.match(/^\["([^"]+)"~"([^"]+)"(?:,i)?\]$/);
      if (mRx) {
        const val = tags[mRx[1]];
        if (val) {
          try {
            if (new RegExp(mRx[2], 'i').test(String(val))) return true;
          } catch {}
        }
        continue;
      }
      const mKey = c.match(/^\["([^"]+)"\]$/);
      if (mKey && tags[mKey[1]]) return true;
    }
    return false;
  }

  async function fetchSingleOsmV06Tile(w, s, e, n, attempt = 0) {
    const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${w.toFixed(4)},${s.toFixed(4)},${e.toFixed(4)},${n.toFixed(4)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (r.status === 400 && attempt < 2) {
        clearTimeout(timer);
        const cx = (w + e) / 2;
        const cy = (s + n) / 2;
        const hw = (e - w) * 0.32;
        const hh = (n - s) * 0.32;
        return fetchSingleOsmV06Tile(cx - hw, cy - hh, cx + hw, cy + hh, attempt + 1);
      }
      if (!r.ok) return { ok: false, pois: [] };
      const j = await r.json();
      const els = Array.isArray(j.elements) ? j.elements : [];
      const nodeCoords = new Map();
      for (let i = 0; i < els.length; i++) {
        const el0 = els[i];
        if (el0.type === 'node' && typeof el0.lat === 'number' && typeof el0.lon === 'number') {
          nodeCoords.set(el0.id, [el0.lat, el0.lon]);
        }
      }
      const pois = [];
      for (let i = 0; i < els.length; i++) {
        const el0 = els[i];
        if (!isBusinessOsmTags(el0.tags)) continue;
        let lat = el0.lat;
        let lon = el0.lon;
        if ((typeof lat !== 'number' || typeof lon !== 'number') && Array.isArray(el0.nodes)) {
          for (let ni = 0; ni < el0.nodes.length; ni++) {
            const pt = nodeCoords.get(el0.nodes[ni]);
            if (pt) {
              lat = pt[0];
              lon = pt[1];
              break;
            }
          }
        }
        if (typeof lat === 'number' && typeof lon === 'number') {
          pois.push({ lat, lon, tags: el0.tags });
        }
      }
      return { ok: true, pois };
    } catch {
      return { ok: false, pois: [] };
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchOsmApiV06CityTiles(cLat, cLon, exactTags, termList, tileCount = 3) {
    const offsets = [
      [0.0, 0.0],
      [0.011, 0.0],
      [-0.011, 0.0],
      [0.0, 0.009],
      [0.0, -0.009]
    ].slice(0, tileCount);
    const hw = 0.0050;
    const hh = 0.0040;
    const tileResults = await Promise.all(
      offsets.map(([dx, dy]) =>
        fetchSingleOsmV06Tile(cLon + dx - hw, cLat + dy - hh, cLon + dx + hw, cLat + dy + hh)
      )
    );
    const anyTileOk = tileResults.some(t => t && t.ok);
    const hasExact = Boolean(exactTags && exactTags.length);
    const hasTerms = Boolean(termList && termList.length);
    const matched = [];
    for (const tr of tileResults) {
      for (const item of (tr.pois || [])) {
        const t = item.tags || {};
        const tagHit = hasExact && elementMatchesTagClauses(t, exactTags);
        if (!hasExact && !hasTerms) {
          matched.push(item);
          continue;
        }
        if (tagHit) {
          item._tagMatched = true;
          matched.push(item);
          continue;
        }
        if (hasTerms) {
          const catStr = String(t.shop || t.craft || t.industrial || t.office || t.amenity || t.tourism || t.healthcare || '').replace(/_/g, ' ');
          const hay = ` ${fold(t.name || t.brand || '')} ${fold(catStr)} ${fold(t.product || '')} ${fold(t.description || '')} `;
          if (matchesTerms(hay, termList)) {
            item._tagMatched = true;
            matched.push(item);
          }
        }
      }
    }
    return { elements: matched, anyTileOk };
  }

  async function fetchPhotonOsmFallback(city, country, sector, bbox, tagClauses) {
    const [w, s, e, n] = bbox;
    const bbParam = `${w.toFixed(4)},${s.toFixed(4)},${e.toFixed(4)},${n.toFixed(4)}`;
    const kvTags = [];
    for (const c of tagClauses) {
      const mEq = c.match(/^\["([^"]+)"="([^"]+)"\]$/);
      if (mEq) {
        kvTags.push(`${mEq[1]}:${mEq[2]}`);
        continue;
      }
      const mRx = c.match(/^\["([^"]+)"~"([^"]+)"\]$/);
      if (mRx && mRx[1] !== 'name') {
        for (const v of mRx[2].split('|').slice(0, 2)) {
          const vc = v.trim();
          if (/^[a-z_]+$/.test(vc)) kvTags.push(`${mRx[1]}:${vc}`);
        }
      }
    }
    const uniqueKv = Array.from(new Set(kvTags));
    const expanded = expandSectorTerms(sector || '');
    const kwCandidates = [];
    for (const t of expanded) {
      if (!t.includes(' ') && /^[a-z]+$/.test(t) && t.length >= 4 && !kwCandidates.includes(t)) {
        kwCandidates.push(t);
        if (kwCandidates.length >= 2) break;
      }
    }
    if (!kwCandidates.length && sector) kwCandidates.push(fold(sector).split(' ')[0] || 'company');

    // Rate-limit safe: at most 2 Photon queries total so Komoot firewall never resets TCP
    const queries = uniqueKv.slice(0, 1).map(kv => {
      const u = new URL('https://photon.komoot.io/api/');
      u.searchParams.set('q', city);
      u.searchParams.set('bbox', bbParam);
      u.searchParams.set('osm_tag', kv);
      u.searchParams.set('limit', '50');
      return u.toString();
    });
    if (kwCandidates.length) {
      const kwUrl = new URL('https://photon.komoot.io/api/');
      kwUrl.searchParams.set('q', kwCandidates[0]);
      kwUrl.searchParams.set('bbox', bbParam);
      kwUrl.searchParams.set('limit', '50');
      queries.push(kwUrl.toString());
    }

    let anyPhotonHttpOk = false;
    const settled = await Promise.allSettled(queries.map(async u => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      try {
        const r = await fetch(u, { signal: ctrl.signal });
        if (!r.ok) return [];
        anyPhotonHttpOk = true;
        const j = await r.json();
        return Array.isArray(j.features) ? j.features : [];
      } finally {
        clearTimeout(timer);
      }
    }));

    const featMap = new Map();
    for (const item of settled) {
      if (item.status !== 'fulfilled') continue;
      for (const f of item.value) {
        const p = f && f.properties;
        const coords = f && f.geometry && f.geometry.coordinates;
        if (!p || !p.name || !Array.isArray(coords) || coords.length < 2) continue;
        const lon = Number(coords[0]);
        const lat = Number(coords[1]);
        if (!(lon >= w && lon <= e && lat >= s && lat <= n)) continue;
        const osmType = p.osm_type;
        const osmId = p.osm_id;
        if (!osmId || (osmType !== 'N' && osmType !== 'W')) continue;
        if (p.osm_key === 'highway' || p.osm_key === 'place' || p.osm_key === 'boundary' || p.osm_key === 'railway' || p.osm_key === 'public_transport') continue;
        const key = `${osmType}:${osmId}`;
        if (!featMap.has(key)) featMap.set(key, { p, lon, lat });
      }
    }
    if (!featMap.size) return { elements: [], anyOk: anyPhotonHttpOk };

    const nodeIds = [];
    const wayIds = [];
    for (const k of featMap.keys()) {
      const [t, id] = k.split(':');
      if (t === 'N') nodeIds.push(id);
      else if (t === 'W') wayIds.push(id);
    }

    const richTags = new Map();
    const fetchOsmBatch = async (kind, ids) => {
      for (let i = 0; i < ids.length; i += 80) {
        const chunk = ids.slice(i, i + 80).join(',');
        const paramName = kind === 'nodes' ? 'nodes' : 'ways';
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5500);
        try {
          const r = await fetch(`https://api.openstreetmap.org/api/0.6/${kind}.json?${paramName}=${chunk}`, { signal: ctrl.signal });
          if (r.ok) {
            const j = await r.json();
            for (const el of (j.elements || [])) {
              const prefix = kind === 'nodes' ? 'N' : 'W';
              if (el.tags) richTags.set(`${prefix}:${el.id}`, el.tags);
            }
          }
        } catch {
          // Best-effort contact enrichment
        } finally {
          clearTimeout(timer);
        }
      }
    };
    await Promise.all([
      nodeIds.length ? fetchOsmBatch('nodes', nodeIds) : Promise.resolve(),
      wayIds.length ? fetchOsmBatch('ways', wayIds) : Promise.resolve()
    ]);

    const out = [];
    for (const [k, info] of featMap.entries()) {
      const p = info.p;
      const osmTags = richTags.get(k) || {};
      const mergedTags = {
        name: p.name,
        ...(p.osm_key && p.osm_value ? { [p.osm_key]: p.osm_value } : {}),
        ...(p.street ? { 'addr:street': p.street } : {}),
        ...(p.housenumber ? { 'addr:housenumber': String(p.housenumber) } : {}),
        ...(p.district || p.locality ? { 'addr:district': p.district || p.locality } : {}),
        ...osmTags
      };
      out.push({
        lat: info.lat,
        lon: info.lon,
        tags: mergedTags,
        _tagMatched: Boolean(uniqueKv.length)
      });
    }
    return { elements: out, anyOk: true };
  }

  function resolveSectorExactTags(sector) {
    const fsec = fold((sector || '').split('|')[0]);
    const stemSec = stemTr(fsec);
    let exactTags = OSM_SECTOR_TAGS[fsec] || OSM_SECTOR_TAGS[stemSec];
    if (!exactTags) {
      const canonSectors = resolveClientCanonicalSectors(fsec);
      const mergedCanonTags = [];
      for (const cs of canonSectors) {
        if (OSM_SECTOR_TAGS[cs]) {
          for (const t of OSM_SECTOR_TAGS[cs]) {
            if (!mergedCanonTags.includes(t)) mergedCanonTags.push(t);
          }
        }
      }
      if (mergedCanonTags.length) exactTags = mergedCanonTags;
    }
    return exactTags || null;
  }

  function buildRecordsFromOsmElements(elements, defaultCity, country, sector, defaultTagMatched, hubCoords = null) {
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

      let recCity = elItem._hubCity || defaultCity;
      if (!elItem._hubCity && hubCoords && hubCoords.length) {
        let bestDist = Infinity;
        for (const hc of hubCoords) {
          const d2 = (lat - hc.lat) * (lat - hc.lat) + (lon - hc.lon) * (lon - hc.lon);
          if (d2 < bestDist) {
            bestDist = d2;
            recCity = hc.city;
          }
        }
      }

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
            const np = normalizePhoneClient(part, country);
            if (np && !phones.includes(np)) phones.push(np);
          }
        }
      }

      const rawDistrict = String(tags['addr:district'] || tags['addr:city_district'] || tags['addr:suburb'] || tags['addr:borough'] || tags['addr:town'] || '').trim();
      const district = hubCoords ? (recCity || rawDistrict) : rawDistrict;
      if (district) distSet.add(district);
      const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
      const address = [street, tags['addr:neighbourhood'], rawDistrict, recCity, country !== 'Türkiye' ? country : ''].filter(Boolean).join(', ');
      const category = String(tags.shop || tags.craft || tags.industrial || tags.office || tags.amenity || tags.tourism || tags.healthcare || sector || 'İşletme').replace(/_/g, ' ');

      const search = ` ${fold(name)} ${fold(category)} ${fold(tags.product || '')} ${fold(tags.description || '')} `;
      const quickBlob = fold(`${name} ${recCity} ${district} ${website} ${emails.join(' ')} ${phones.join(' ')} ${address}`);
      const cleanEmails = Array.from(new Set(emails));
      const wa = detectWhatsapp(phones);
      const isEfatura = detectEfatura(name, cleanEmails);
      const isEnterpriseMail = detectEnterpriseMail(cleanEmails);
      const nace = resolveNaceClient(category, name);

      records.push({
        name,
        category,
        city: recCity,
        district,
        website,
        emails: cleanEmails,
        phones,
        address,
        lat,
        lon,
        conf: 85,
        search,
        sectorTagMatched: Boolean(elItem._tagMatched || defaultTagMatched),
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
    return { records, distSet };
  }

  async function fetchLiveOverpassCity(city, country, sector) {
    const exactTags = resolveSectorExactTags(sector);
    const hasExactSectorTags = Boolean(exactTags && exactTags.length);
    const termList = expandSectorTerms(sector || '');

    // Multi-City Country-Wide Cloud Discovery ('__all__') — zero burst, unified Overpass + Fastly OSM API v0.6
    if ((city === '__all__' || city === '__all_country__') && country !== 'Türkiye' && GLOBAL_COUNTRIES[country]) {
      const multiKey = `osm:all:${slugify(country)}:${fold(sector || 'all')}`;
      if (shardCache.has(multiKey)) return shardCache.get(multiKey);

      const hubs = GLOBAL_COUNTRIES[country].cities.slice(0, 4);
      setStatus(`Tüm Şehirler (${country}) için ${hubs.join(', ')} ticaret merkezleri taranıyor…`, 'Küresel Keşif', false, 45);
      const hubCoords = [];
      for (const h of hubs) {
        const cf = fold(h);
        if (GLOBAL_CITY_COORDS[cf]) {
          hubCoords.push({ city: h, lat: GLOBAL_CITY_COORDS[cf][0], lon: GLOBAL_CITY_COORDS[cf][1] });
        } else {
          try {
            const [w0, s0, e0, n0] = await resolveCityBbox(h, country);
            hubCoords.push({ city: h, lat: (s0 + n0) / 2, lon: (w0 + e0) / 2 });
          } catch {}
        }
      }

      let tagClauses = hasExactSectorTags ? exactTags.slice(0, 3) : ['["shop"]', '["craft"]', '["office"]'];
      let elements = null;
      let fromOverpass = false;

      if (hubCoords.length) {
        const unionParts = [];
        for (const hc of hubCoords) {
          const bb = `(${(hc.lat - 0.08).toFixed(4)},${(hc.lon - 0.10).toFixed(4)},${(hc.lat + 0.08).toFixed(4)},${(hc.lon + 0.10).toFixed(4)})`;
          for (const tc of tagClauses) unionParts.push(`nw${tc}${bb};`);
        }
        const unionBody = `[out:json][timeout:9];(${unionParts.join('')});out center tags 300;`;
        const mirrors = OVERPASS_MIRRORS;
        const controllers = mirrors.map(() => new AbortController());
        try {
          const ovEls = await Promise.any(mirrors.map(async (endpoint, idx) => {
            const timer = setTimeout(() => controllers[idx].abort(), 3600);
            try {
              const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                body: 'data=' + encodeURIComponent(unionBody),
                signal: controllers[idx].signal
              });
              if (!res.ok) throw new Error('HTTP ' + res.status);
              const json = await res.json();
              if (!Array.isArray(json.elements) || !json.elements.length) throw new Error('Empty');
              return json.elements;
            } finally {
              clearTimeout(timer);
            }
          }));
          controllers.forEach(c => c.abort());
          elements = ovEls;
          fromOverpass = true;
        } catch {
          controllers.forEach(c => c.abort());
        }
      }

      let cloudSource = 'Overpass API';
      if (!elements || !elements.length) {
        setStatus(`Tüm Şehirler (${country}) için resmi OpenStreetMap Fastly CDN v0.6 motoru devreye alındı…`, 'Fastly OSM v0.6', false, 68);
        const perHubBatches = await Promise.all(
          hubCoords.map((hc, idx) =>
            fetchOsmApiV06CityTiles(hc.lat, hc.lon, exactTags, termList, idx === 0 ? 2 : 1).then(resObj => ({
              anyTileOk: Boolean(resObj && resObj.anyTileOk),
              items: ((resObj && resObj.elements) || []).map(x => Object.assign({}, x, { _hubCity: hc.city }))
            }))
          )
        );
        const anyHubOk = perHubBatches.some(b => b.anyTileOk);
        if (!fromOverpass && !anyHubOk) {
          throw new Error(`Küresel harita sunucularına ulaşılamadı (${country} için Overpass ve OpenStreetMap API v0.6 yanıt vermedi).`);
        }
        cloudSource = 'Fastly OSM API v0.6';
        elements = perHubBatches.flatMap(b => b.items);
      }

      const built = buildRecordsFromOsmElements(
        elements || [],
        hubs[0] || country,
        country,
        sector,
        fromOverpass && hasExactSectorTags,
        hubCoords
      );
      populateDistricts(`Tüm Şehirler (${country})`, Array.from(built.distSet));
      const packedAll = {
        city: `Tüm Şehirler (${country})`,
        region: `Tüm Şehirler, ${country}`,
        records: built.records,
        sourceEngine: cloudSource
      };
      if (built.records.length > 0) shardCache.set(multiKey, packedAll);
      return packedAll;
    }

    const cacheKey = `osm:${slugify(city)}:${slugify(country)}:${fold(sector || 'all')}`;
    if (shardCache.has(cacheKey)) return shardCache.get(cacheKey);

    setStatus(`${city}, ${country} coğrafi sınırları çözümleniyor…`, 'Canlı Keşif', false, 20);
    const [w, s, e, n] = await resolveCityBbox(city, country);
    const cLat = (s + n) / 2;
    const cLon = (w + e) / 2;
    const tightW = Math.max(w, cLon - 0.12);
    const tightE = Math.min(e, cLon + 0.12);
    const tightS = Math.max(s, cLat - 0.09);
    const tightN = Math.min(n, cLat + 0.09);
    const bb = `(${tightS.toFixed(4)},${tightW.toFixed(4)},${tightN.toFixed(4)},${tightE.toFixed(4)})`;
    const area = Math.abs((tightE - tightW) * (tightN - tightS));
    let tagClauses = hasExactSectorTags ? [...exactTags] : [];

    if (!tagClauses.length && sector) {
      const rawWords = fold(sector).split(/[^a-z0-9]+/).filter(
        tok => tok.length >= 3 && !CLIENT_STOPWORDS.has(tok) && !CLIENT_GENERIC_MODIFIERS.has(tok)
      );
      const rxParts = Array.from(new Set(rawWords.length ? rawWords : [sector.replace(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü ]/g, '').trim()]))
        .filter(s0 => s0 && s0.length >= 3)
        .slice(0, 4);
      if (rxParts.length && area <= 1.8) {
        tagClauses.push(`["name"~"${rxParts.join('|')}",i]`);
      }
      tagClauses.push('["shop"]', '["craft"]', '["office"]', '["industrial"]');
    }
    if (!tagClauses.length) {
      tagClauses = ['["shop"]', '["craft"]', '["office"]', '["industrial"]'];
    }

    const body = `[out:json][timeout:9];(${tagClauses.slice(0, 4).map(t => `nw${t}${bb};`).join('')});out center tags 350;`;
    setStatus(`${city} (${country}) için küresel harita kümeleri taranıyor…`, 'Küresel Keşif', false, 55);

    let elements = null;
    let fromOverpass = false;
    let cloudSource = 'Overpass API';
    const mirrors = OVERPASS_MIRRORS;
    const controllers = mirrors.map(() => new AbortController());
    try {
      elements = await Promise.any(mirrors.map(async (endpoint, idx) => {
        const timer = setTimeout(() => controllers[idx].abort(), 3600);
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: 'data=' + encodeURIComponent(body),
            signal: controllers[idx].signal
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const json = await res.json();
          if (!Array.isArray(json.elements) || !json.elements.length) throw new Error('Empty');
          return json.elements;
        } finally {
          clearTimeout(timer);
        }
      }));
      controllers.forEach(c => c.abort());
      fromOverpass = true;
    } catch {
      controllers.forEach(c => c.abort());
      setStatus(`${city} için resmi OpenStreetMap Fastly CDN v0.6 motoru devreye alındı…`, 'Fastly OSM v0.6', false, 70);
      const v06Res = await fetchOsmApiV06CityTiles(cLat, cLon, exactTags, termList, 3);
      elements = v06Res.elements;
      cloudSource = 'Fastly OSM API v0.6';
      let photonOk = false;
      if (!elements || !elements.length) {
        const phRes = await fetchPhotonOsmFallback(city, country, sector, [tightW, tightS, tightE, tightN], tagClauses);
        elements = phRes.elements;
        photonOk = Boolean(phRes.anyOk);
        if (elements && elements.length) cloudSource = 'Photon + OSM v0.6';
      }
      if (!v06Res.anyTileOk && !photonOk) {
        throw new Error(`Canlı harita sunucularına ulaşılamadı (${city} için Overpass ve OpenStreetMap API v0.6 yanıt vermedi).`);
      }
    }
    if (!elements) {
      elements = [];
    }

    const built = buildRecordsFromOsmElements(elements, city, country, sector, fromOverpass && hasExactSectorTags, null);
    populateDistricts(city, Array.from(built.distSet));
    const packed = { city, region: `${city}, ${country}`, records: built.records, sourceEngine: cloudSource };
    if (built.records.length > 0) shardCache.set(cacheKey, packed);
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
    $('enrichBtn').disabled = false;
    $('exportXlsxBtn').disabled = false;
    $('exportCsvBtn').disabled = false;
    if ($('toggleSearchMapBtn')) $('toggleSearchMapBtn').disabled = false;
    if ($('splinkDedupBtn')) $('splinkDedupBtn').disabled = false;
    if ($('rapidFuzzBtn')) $('rapidFuzzBtn').disabled = false;

    $('kpiTotal').textContent = fmt(stats.total);
    if ($('kpiWhatsapp')) $('kpiWhatsapp').textContent = fmt(stats.with_whatsapp || 0);
    if ($('kpiEfatura')) $('kpiEfatura').textContent = fmt(stats.with_efatura || 0);
    $('kpiWebsites').textContent = fmt(stats.websites);
    $('kpiEmails').textContent = fmt(stats.with_email);
    $('kpiPhones').textContent = fmt(stats.with_phone);
    if ($('kpiBoth')) $('kpiBoth').textContent = fmt(stats.with_both || 0);

    const f = currentFilters();
    document.querySelectorAll('.summary-metrics [data-contact-filter]').forEach(btn => {
      btn.classList.toggle('is-active', btn.getAttribute('data-contact-filter') === f.contactMode);
    });
    const cityLabel = f.cityDisplay || f.city;
    const locLabel = f.country === 'Türkiye' ? cityLabel : `${cityLabel} (${f.country})`;
    $('activeFilterSummary').textContent =
      `${locLabel}${f.district ? ' / ' + f.district : ''} · ${f.sector || 'Tüm Sektörler'}`;

    if ($('searchMapWrap') && !$('searchMapWrap').hidden) {
      renderSearchVectorMap(rows, f);
    }

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
      if (r.merged_count && r.merged_count > 1) {
        nameRow.append(el('span', `🔗 ${r.merged_count} Şube Birleşti`, 'badge splink'));
      } else if (r.cluster_id) {
        nameRow.append(el('span', `🔗 Tekil #${r.cluster_id}`, 'badge splink'));
      }
      if (typeof r.fuzzy_score === 'number') {
        nameRow.append(el('span', `⚡ %${Math.round(r.fuzzy_score)} Uyum`, 'badge nace'));
      }
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
      tdLoc.append(el('div', r.city || cityLabel, 'loc-city'));
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
      } else if (r.tech) {
        const list = el('div', null, 'contact-list');
        list.append(el('span', r.tech, 'badge m365'));
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

  // Cloud Nationwide 81-Province Multi-Shard Loader (parallel HTTP/2 gzipped tuple shards)
  async function loadNationwideTrCloudShards(sector) {
    const shardMap = (manifest && manifest.shards) || {};
    const prioritySlugs = [
      'istanbul', 'ankara', 'izmir', 'bursa', 'antalya',
      'kocaeli', 'konya', 'adana', 'gaziantep', 'mersin',
      'kayseri', 'eskisehir', 'denizli'
    ].filter(s => shardMap[s]);
    const slugs = prioritySlugs.length ? prioritySlugs : Object.keys(shardMap).slice(0, 10);
    const loaded = await Promise.all(slugs.map(s => loadCdnShard(s).catch(() => null)));

    const termList = expandSectorTerms(sector);
    const hasTerms = termList.length > 0;
    const maxTotal = hasTerms ? 60000 : 18000;
    const perCityCap = hasTerms ? 15000 : 3000;
    const merged = [];

    for (const shard of loaded) {
      if (!shard || !shard.isTupleShard) continue;
      const catHit = hasTerms ? shard.catsSearch.map(cs => matchesTerms(cs, termList)) : null;
      let cityAdded = 0;
      const rows = shard.rows;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (hasTerms) {
          const nameFolded = fold(r[0] || '');
          if (!catHit[r[1]] && !matchesTerms(` ${r[10] || ''} `, termList) && !matchesTerms(` ${nameFolded} `, termList)) {
            continue;
          }
        }
        const obj = materializeTuple(shard, r);
        obj.sectorTagMatched = true;
        obj.search = ` ${fold(obj.name)} ${fold(obj.category)} `;
        obj.quickBlob = fold(`${obj.name} ${obj.city} ${obj.district} ${obj.website} ${obj.emails.join(' ')} ${obj.phones.join(' ')} ${obj.address}`);
        merged.push(obj);
        cityAdded++;
        if (cityAdded >= perCityCap || merged.length >= maxTotal) break;
      }
      if (merged.length >= maxTotal) break;
    }

    return {
      isMultiTrShard: true,
      city: 'Tüm Şehirler (81 İl)',
      region: 'Tüm Şehirler, Türkiye',
      records: merged
    };
  }

  // International Pre-Indexed CDN Shard Loader (instant <50ms lookup for sharded foreign hubs + countries)
  async function loadCountryIntlCloudShards(country, city, sector) {
    const shardMap = (manifest && manifest.shards) || {};
    const iso = ((GLOBAL_COUNTRIES[country] && GLOBAL_COUNTRIES[country].iso) || '').toLowerCase();
    const isWild = city === '__all__' || city === '__all_country__';
    const targetSlugs = [];

    if (isWild) {
      for (const [sKey, meta] of Object.entries(shardMap)) {
        if (!sKey.startsWith('intl-')) continue;
        if (meta.country === country || (iso && sKey.startsWith(`intl-${iso}-`))) {
          targetSlugs.push(sKey);
        }
      }
    } else if (iso) {
      const candidate = `intl-${iso}-${slugify(city)}`;
      if (shardMap[candidate]) targetSlugs.push(candidate);
    }

    if (!targetSlugs.length) return null;
    const loaded = await Promise.all(targetSlugs.map(s => loadCdnShard(s).catch(() => null)));
    const termList = expandSectorTerms(sector);
    const hasTerms = termList.length > 0;
    const merged = [];

    for (const shard of loaded) {
      if (!shard || !shard.isTupleShard) continue;
      const catHit = hasTerms ? shard.catsSearch.map(cs => matchesTerms(cs, termList)) : null;
      const rows = shard.rows;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (hasTerms) {
          const nameFolded = fold(r[0] || '');
          if (!catHit[r[1]] && !matchesTerms(` ${r[10] || ''} `, termList) && !matchesTerms(` ${nameFolded} `, termList)) {
            continue;
          }
        }
        const obj = materializeTuple(shard, r);
        if (isWild) obj.district = obj.district || shard.city;
        obj.sectorTagMatched = true;
        obj.search = ` ${fold(obj.name)} ${fold(obj.category)} `;
        obj.quickBlob = fold(`${obj.name} ${obj.city} ${obj.district} ${obj.website} ${obj.emails.join(' ')} ${obj.phones.join(' ')} ${obj.address}`);
        merged.push(obj);
      }
    }

    return {
      isMultiTrShard: true,
      city: isWild ? `Tüm Şehirler (${country})` : city,
      region: isWild ? `Tüm Şehirler, ${country}` : `${city}, ${country}`,
      records: merged
    };
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
        if (f.naceCode) {
          const rowNace = resolveNaceClient(dataset.cats[r[1]] || '', r[0] || '');
          if (!matchesNaceFilter(rowNace, f.naceCode)) continue;
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
      // Live Overpass or Nationwide Multi-Shard object records
      const sectorMatched = [];
      for (const r of (dataset.records || [])) {
        if (!dataset.isMultiTrShard && !r.sectorTagMatched && !matchesTerms(r.search || ` ${fold(r.name)} ${fold(r.category)} `, termList)) continue;
        if (f.naceCode) {
          const rNace = r.nace || { code: r.nace_code || '', title: r.nace_title || '' };
          if (!matchesNaceFilter(rNace, f.naceCode)) continue;
        }
        sectorMatched.push(r);
      }
      if (dataset.isMultiTrShard || f.city === '__all__' || f.city === '__all_country__') {
        const cityCounts = new Map();
        for (const r of sectorMatched) {
          const key = r.city || r.district;
          if (key) cityCounts.set(key, (cityCounts.get(key) || 0) + 1);
        }
        const sortedCities = Array.from(cityCounts.entries()).sort((a, b) => b[1] - a[1]);
        populateDistricts(f.cityDisplay || f.city, sortedCities.map(x => x[0]));
        renderDistrictCounts(sortedCities, sectorMatched.length, f.district);
      } else {
        renderDistrictStrip(sectorMatched, f.district);
      }
      for (const r of sectorMatched) {
        if (dFold && fold(r.district) !== dFold && fold(r.city) !== dFold && !fold(r.address).includes(dFold)) continue;
        const qBlob = r.quickBlob || fold(`${r.name} ${r.city} ${r.district} ${r.website} ${(r.emails || []).join(' ')} ${(r.phones || []).join(' ')} ${r.address}`);
        if (f.quick && !qBlob.includes(f.quick)) continue;
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

    const srcPill = dataset.sourceEngine || (dataset.isTupleShard || dataset.isMultiTrShard ? 'Bulut CDN' : 'Hazır');
    setStatus(
      `${f.cityDisplay || f.city} kataloğunda "${f.sector || 'Tüm Sektörler'}" için ${fmt(finalRows.length)} temiz firma listelendi (${fmt(with_whatsapp)} WhatsApp, ${fmt(with_phone)} telefonlu, ${fmt(with_email)} e-postalı).`,
      srcPill,
      false,
      null
    );
  }

  // Execute Search (Dual Engine — abortable sequence-guarded, resilient cloud fallback)
  async function executeSearch(allowRemoteFetch = false) {
    if (!hasStartedSearch && !allowRemoteFetch) {
      resetResultsView();
      return;
    }
    if (!allowRemoteFetch && searchInFlight) return;
    if (allowRemoteFetch && activeSearchAbort) {
      try { activeSearchAbort.abort(); } catch {}
    }

    const mySeq = ++activeSearchSeq;
    const searchCtrl = new AbortController();
    activeSearchAbort = searchCtrl;
    searchInFlight = true;
    const searchBtn = $('searchBtn');
    if (searchBtn) {
      searchBtn.disabled = true;
      searchBtn.textContent = 'Aranıyor…';
    }

    if (
      $('countrySelect').value === 'Türkiye' &&
      (!($('citySelect') && $('citySelect').value) ||
        (!['__all__', '__all_country__'].includes($('citySelect').value) && !TR_PROVINCES.includes($('citySelect').value)))
    ) {
      $('citySelect').value = '__all__';
    }
    const f = currentFilters();
    if (f.isEmptyCustom) {
      searchInFlight = false;
      if (searchBtn) {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Firmaları Listele';
      }
      setStatus(
        'Özel şehir alanı boş bırakıldı. Lütfen şehir adını yazın (örn: Mannheim, Lyon) veya menüden "Tüm Şehirler" seçeneğini seçin.',
        'Şehir Gerekli',
        true,
        null
      );
      if ($('cityCustomInput')) $('cityCustomInput').focus();
      return;
    }
    const cityLabel = f.cityDisplay || f.city;
    if ($('exportSectorInput')) $('exportSectorInput').value = f.sector;
    if ($('exportCountrySelect') && $('exportCountrySelect').value !== f.country) {
      $('exportCountrySelect').value = f.country;
      populateCitiesForCountry(f.country, $('exportCitySelect'), $('exportCityCustomInput'), false, true);
    }
    if ($('exportCitySelect')) {
      const targetVal = (f.city === '__all__' || f.city === '__all_country__') ? '__all__' : f.city;
      if (Array.from($('exportCitySelect').options).some(o => o.value === targetVal)) {
        $('exportCitySelect').value = targetVal;
      }
    }
    const slug = slugify(f.city);

    const effectiveSector = f.sector || (f.naceCode ? naceToSectorHint(f.naceCode) : '');
    const searchLabel = f.naceCode
      ? `NACE ${normalizeNaceQuery(f.naceCode)}${f.sector ? ` · ${f.sector}` : ''}`
      : (f.sector || 'Tüm Sektörler');
    try {
      if (allowRemoteFetch) {
        hasStartedSearch = true;
        $('districtStrip').replaceChildren();
      }
      setStatus(
        `${cityLabel} kataloğunda "${searchLabel}" taranıyor…`,
        'Taranıyor',
        false,
        35
      );

      // 1. If local Turbo SQLite engine is connected
      if (turboConnected && !f.quick) {
        // International Global Engine (Overture S3 + Overpass + libphonenumber + SQLite)
        if (f.country !== 'Türkiye') {
          try {
            setStatus(
              `${cityLabel}, ${f.country} için küresel B2B veri kaynakları (Overture S3 + OSM) taranıyor…`,
              'Küresel Keşif',
              false,
              45
            );
            const gRes = await turboApi('industrial/global_search', {
              city: f.city,
              country: f.country,
              sector: effectiveSector,
              district: f.district,
              contact_mode: f.contactMode,
              offset: currentOffset,
              limit: PAGE_SIZE
            }, 45000, searchCtrl.signal);
            if (mySeq !== activeSearchSeq) return;
            if (gRes && Array.isArray(gRes.rows) && (gRes.total > 0 || !allowRemoteFetch)) {
              activeMode = 'turbo-db';
              turboPageData = gRes;
              renderTableRows(gRes.rows, gRes.total || 0, gRes);
              if (Array.isArray(gRes.districts) && gRes.districts.length) {
                populateDistricts(cityLabel, gRes.districts.map(d => d[0]));
                renderDistrictCounts(gRes.districts, gRes.total || 0, f.district);
              } else {
                $('districtStrip').replaceChildren();
              }
              setStatus(
                `${cityLabel} (${f.country}) kataloğunda "${f.sector || 'Tüm Sektörler'}" için ${fmt(gRes.total || 0)} uluslararası firma listelendi.`,
                'Küresel Pro Aktif',
                false,
                null
              );
              return;
            }
          } catch (globalErr) {
            if (searchCtrl.signal.aborted && mySeq !== activeSearchSeq) return;
            console.warn('Global turbo search fallback to live browser Overpass:', globalErr);
          }
        } else {
          const params = new URLSearchParams({
            sector: effectiveSector,
            region: f.region,
            district: f.district,
            contact_mode: f.contactMode,
            offset: String(currentOffset),
            limit: String(PAGE_SIZE)
          });
          let pData = null;
          let localOk = false;
          try {
            pData = await turboApi(`portfolio?${params}`, undefined, 15000, searchCtrl.signal);
            localOk = true;
          } catch (localErr) {
            if (searchCtrl.signal.aborted && mySeq !== activeSearchSeq) return;
            console.warn('Local engine unreachable or timed out, switching to Cloud CDN Shard:', localErr);
            turboConnected = false;
            turboToken = '';
            const badge = $('engineBadge');
            if (badge) badge.className = 'engine-badge cloud';
            $('engineText').textContent = 'Hazır';
            if ($('industrialBadge')) $('industrialBadge').style.display = 'none';
          }
          if (mySeq !== activeSearchSeq) return;

          if (localOk) {
            if (pData && pData.total > 0) {
              activeMode = 'turbo-db';
              turboPageData = pData;
              renderTableRows(pData.rows, pData.total, pData);
              setStatus(
                `${cityLabel} kataloğunda "${f.sector || 'Tüm Sektörler'}" için ${fmt(pData.total)} doğrulanmış firma listelendi.`,
                'Turbo Aktif',
                false,
                null
              );
              if (Array.isArray(pData.districts) && pData.districts.length) {
                populateDistricts(cityLabel, pData.districts.map(d => d[0]));
                renderDistrictCounts(pData.districts, pData.total, f.district);
              } else {
                $('districtStrip').replaceChildren();
              }
              return;
            }

            if (f.city === '__all__' || f.city === '__all_country__') {
              const multiTr = await loadNationwideTrCloudShards(effectiveSector);
              if (mySeq !== activeSearchSeq) return;
              filterShardRecords(multiTr);
              return;
            }

            if (manifest.shards && manifest.shards[slug]) {
              const shard = await loadCdnShard(slug);
              if (mySeq !== activeSearchSeq) return;
              if (shard) {
                filterShardRecords(shard);
                return;
              }
            }

            renderTableRows([], 0, { total: 0, websites: 0, with_email: 0, with_phone: 0, with_both: 0 });
            setStatus('Arama kriterine uygun kayıt bulunamadı. Sektör adını veya filtreleri değiştirebilirsiniz.', 'Bilgi', false, null);
            return;
          }
        }
      }

      // 2. Cloud CDN Shard Mode (Nationwide 81 Provinces, Single TR Province, OR Pre-Sharded Global Country/Hub)
      if (f.country === 'Türkiye') {
        if (f.city === '__all__' || f.city === '__all_country__') {
          const multiTr = await loadNationwideTrCloudShards(effectiveSector);
          if (mySeq !== activeSearchSeq) return;
          filterShardRecords(multiTr);
          return;
        }
        if (manifest.shards && manifest.shards[slug]) {
          const shard = await loadCdnShard(slug);
          if (mySeq !== activeSearchSeq) return;
          if (shard) {
            filterShardRecords(shard);
            return;
          }
        }
      } else {
        const intlShard = await loadCountryIntlCloudShards(f.country, f.city, effectiveSector);
        if (mySeq !== activeSearchSeq) return;
        if (intlShard && (intlShard.records.length >= 10 || (!effectiveSector && intlShard.records.length > 0))) {
          filterShardRecords(intlShard);
          return;
        }
        if (allowRemoteFetch || hasStartedSearch) {
          const liveDataset = await fetchLiveOverpassCity(f.city, f.country, effectiveSector);
          if (mySeq !== activeSearchSeq) return;
          if (intlShard && intlShard.records.length > 0) {
            const seenKeys = new Set(intlShard.records.map(r => `${fold(r.name)}:${fold(r.city)}`));
            const combined = [...intlShard.records];
            for (const lr of (liveDataset.records || [])) {
              const lk = `${fold(lr.name)}:${fold(lr.city)}`;
              if (!seenKeys.has(lk)) {
                seenKeys.add(lk);
                combined.push(lr);
              }
            }
            filterShardRecords({
              isMultiTrShard: true,
              city: liveDataset.city,
              region: liveDataset.region,
              records: combined
            });
          } else {
            filterShardRecords(liveDataset);
          }
          return;
        }
      }

      // 3. Live OpenStreetMap Overpass + Fastly OSM API v0.6 Discovery for ANY un-sharded city
      if (allowRemoteFetch || hasStartedSearch) {
        const liveDataset = await fetchLiveOverpassCity(f.city, f.country, effectiveSector);
        if (mySeq !== activeSearchSeq) return;
        filterShardRecords(liveDataset);
      } else {
        resetResultsView();
      }
    } catch (err) {
      if (mySeq !== activeSearchSeq) return;
      resetResultsView();
      setStatus(err.message || 'Arama sırasında bir hata oluştu.', 'Hata', true, null);
    } finally {
      if (mySeq === activeSearchSeq) {
        searchInFlight = false;
        activeSearchAbort = null;
        if (searchBtn) {
          searchBtn.disabled = false;
          searchBtn.textContent = 'Firmaları Listele';
        }
      }
    }
  }

  function computeRowsStats(rows) {
    let websites = 0, with_email = 0, with_phone = 0, with_both = 0, with_whatsapp = 0, with_efatura = 0;
    for (const r of rows) {
      const he = Array.isArray(r.emails) && r.emails.length > 0;
      const hp = Array.isArray(r.phones) && r.phones.length > 0;
      if (r.website) websites++;
      if (he) with_email++;
      if (hp) with_phone++;
      if (he && hp) with_both++;
      if (r.hasWhatsapp || r.whatsapp || r.whatsappUrl) with_whatsapp++;
      if (r.isEfatura || r.efatura) with_efatura++;
    }
    return { total: rows.length, websites, with_email, with_phone, with_both, with_whatsapp, with_efatura };
  }

  async function ensureResultsLoaded() {
    const curRows = activeMode === 'turbo-db'
      ? ((turboPageData && turboPageData.rows) || [])
      : activeRecords;
    if (!hasStartedSearch || !curRows.length) {
      await executeSearch(true);
    }
  }

  // Enrich Action (Auto-loads results if needed; live crawls visible websites in Turbo Mode; checks MX on emails + websites in Cloud Mode)
  async function handleEnrich() {
    await ensureResultsLoaded();
    const f = currentFilters();
    document.querySelectorAll('.summary-metrics [data-contact-filter]').forEach(btn => {
      btn.classList.toggle('is-active', btn.getAttribute('data-contact-filter') === f.contactMode);
    });
    const cityLabel = f.cityDisplay || f.city;

    if (turboConnected) {
      try {
        $('enrichBtn').disabled = true;
        setStatus(`${cityLabel} web siteleri canlı iletişim taramasına alındı…`, 'Hazırlanıyor', false, 20);
        const qRes = await turboApi('places/queue', {
          sector: f.sector || 'İşletme',
          region: f.region,
          district: f.district,
          limit: 5000,
          authorized: true
        }).catch(() => ({ added: 0 }));
        await turboApi('pause', { paused: false }).catch(() => {});

        // Immediately enrich visible rows that have a website so user sees live emails/MX right away
        const currentRows = activeMode === 'turbo-db'
          ? ((turboPageData && turboPageData.rows) || [])
          : activeRecords;
        const targets = currentRows.filter(r => r.website && (!r.emails || !r.emails.length)).slice(0, 10);
        let foundEmails = 0;
        if (targets.length) {
          let doneLive = 0;
          await Promise.allSettled(targets.map(async row => {
            try {
              const cr = await turboApi('industrial/crawl', { url: row.website }, 14000);
              if (cr && Array.isArray(cr.emails) && cr.emails.length) {
                row.emails = Array.from(new Set([...(row.emails || []), ...cr.emails]));
                foundEmails += cr.emails.length;
              }
              if (cr && Array.isArray(cr.phones) && cr.phones.length) {
                const e164s = cr.phones.map(p => (typeof p === 'string' ? p : p.e164)).filter(Boolean);
                row.phones = Array.from(new Set([...(row.phones || []), ...e164s]));
                if (!row.whatsapp && !row.whatsappUrl) {
                  const waHit = cr.phones.find(p => p && typeof p === 'object' && p.whatsapp_url);
                  if (waHit) row.whatsapp = waHit.whatsapp_url;
                }
              }
              if (cr && cr.domain_intel && cr.domain_intel.provider && cr.domain_intel.provider !== 'MX Yok') {
                row.tech = cr.domain_intel.provider;
              }
            } catch {}
            doneLive++;
            setStatus(
              `Canlı Web İletişim Taraması: ${doneLive}/${targets.length} site incelendi (${foundEmails} yeni kurumsal e-posta çıkarıldı)…`,
              'Canlı Tarama',
              false,
              Math.round((doneLive * 100) / targets.length)
            );
          }));
          if (activeMode === 'turbo-db' && turboPageData) {
            const st = computeRowsStats(turboPageData.rows);
            turboPageData.with_email = Math.max(turboPageData.with_email || 0, st.with_email);
            renderTableRows(turboPageData.rows, turboPageData.total || turboPageData.rows.length, turboPageData);
          } else {
            renderTableRows(activeRecords.slice(currentOffset, currentOffset + PAGE_SIZE), activeRecords.length, computeRowsStats(activeRecords));
          }
        }

        if (qRes && qRes.added > 0) {
          setStatus(
            `${fmt(qRes.added)} arka plan web sitesi kuyruğa alındı${foundEmails ? ` · Ekranda +${foundEmails} e-posta anında çıkarıldı` : ''}…`,
            'Taranıyor',
            false,
            45
          );
          startTurboLiveMonitor();
        } else {
          setStatus(
            targets.length
              ? `${targets.length} kurumsal web sitesi canlı tarandı: ${foundEmails} yeni e-posta ve posta altyapısı tabloya işlendi.`
              : `${cityLabel} listesindeki web sitelerinin iletişim taraması tamamlandı.`,
            'Tamamlandı',
            false,
            null
          );
        }
      } catch (err) {
        setStatus(err.message || 'Tarama hatası', 'Hata', true, null);
      } finally {
        $('enrichBtn').disabled = false;
      }
      return;
    }

    // Cloud Mode: Live DNS-over-HTTPS MX & Provider verification on BOTH email domains AND website domains
    const domainMap = new Map();
    for (const r of activeRecords) {
      for (const em of r.emails || []) {
        const d = (em.split('@')[1] || '').toLowerCase().trim();
        if (d) {
          if (!domainMap.has(d)) domainMap.set(d, []);
          domainMap.get(d).push(r);
        }
      }
      if (r.website) {
        try {
          const d = new URL(r.website).hostname.replace(/^www\./i, '').toLowerCase();
          if (d) {
            if (!domainMap.has(d)) domainMap.set(d, []);
            domainMap.get(d).push(r);
          }
        } catch {}
      }
    }
    const domList = Array.from(domainMap.keys()).slice(0, 120);
    if (!domList.length) {
      setStatus(
        'Mevcut listede doğrulanacak web sitesi veya kurumsal alan adı bulunamadı.',
        'Bilgi',
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
            const mxAns = (j.Status === 0 && Array.isArray(j.Answer)) ? j.Answer.filter(a => a.type === 15) : [];
            const hasMx = mxAns.length > 0;
            mxCache.set(dom, hasMx ? 'mx' : 'none');
            if (hasMx) {
              validMx++;
              const mxStr = mxAns.map(a => String(a.data || '').toLowerCase()).join(' ');
              let prov = 'Kurumsal MX Aktif';
              if (mxStr.includes('outlook') || mxStr.includes('protection.outlook')) prov = 'Microsoft 365';
              else if (mxStr.includes('google') || mxStr.includes('googlemail')) prov = 'Google Workspace';
              else if (mxStr.includes('ovh') || mxStr.includes('yandex') || mxStr.includes('proton')) prov = 'Kurumsal Mail (MX)';
              for (const rowObj of (domainMap.get(dom) || [])) {
                if (!rowObj.tech) rowObj.tech = prov;
              }
            }
          } catch {
            mxCache.set(dom, 'unknown');
          }
          done++;
          if (done % 10 === 0 || done === domList.length) {
            setStatus(
              `Kurumsal Web & DNS MX Taraması: ${fmt(done)} / ${fmt(domList.length)} domain (${fmt(validMx)} aktif posta sunucusu)…`,
              'DNS-over-HTTPS',
              false,
              Math.round((100 * done) / domList.length)
            );
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, domList.length) }, () => worker()));
      renderTableRows(activeRecords.slice(currentOffset, currentOffset + PAGE_SIZE), activeRecords.length, computeRowsStats(activeRecords));
      setStatus(
        `${fmt(domList.length)} şirket alan adı tarandı: ${fmt(validMx)} aktif kurumsal posta sunucusu (MX / M365 / Google Workspace) doğrulandı.`,
        'Tarama Tamamlandı',
        false,
        null
      );
    } finally {
      $('enrichBtn').disabled = false;
    }
  }

  async function handleTogglePause() {
    const pauseBtn = $('enrichPauseBtn');
    const liveEl = $('enrichLiveStatus');
    if (!turboConnected) {
      if (liveEl) {
        liveEl.textContent = 'Durum: Bulut modunda anlık DNS-over-HTTPS taraması tek seferde tamamlanır; yerel 128-korutin kuyruk duraklatma masaüstü motorunda aktiftir.';
      }
      setStatus('Bulut modunda tarama anlık çalışır; arka plan kuyruk kontrolü yerel Turbo motorda aktiftir.', 'Bilgi', false, null);
      return;
    }
    if (pauseBtn) pauseBtn.disabled = true;
    try {
      const nextPaused = !turboIsPaused;
      const res = await turboApi('pause', { paused: nextPaused }, 5000);
      turboIsPaused = Boolean(res && res.paused);
      if (pauseBtn) {
        pauseBtn.textContent = turboIsPaused ? '▶ Devam Ettir' : '⏸ Duraklat';
      }
      if (liveEl) {
        liveEl.textContent = turboIsPaused
          ? 'Durum: ⏸ 128-Korutin arka plan web tarama kuyruğu duraklatıldı.'
          : 'Durum: ▶ 128-Korutin arka plan web tarama kuyruğu aktif çalışıyor.';
      }
      setStatus(
        turboIsPaused ? 'Arka plan web tarama kuyruğu duraklatıldı.' : 'Arka plan web tarama kuyruğu devam ettiriliyor.',
        turboIsPaused ? 'Duraklatıldı' : 'Aktif',
        false,
        null
      );
      if (!turboIsPaused) startTurboLiveMonitor();
    } catch (err) {
      setStatus('Kuyruk durumu güncellenemedi: ' + (err.message || err), 'Hata', true, null);
    } finally {
      if (pauseBtn) pauseBtn.disabled = false;
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
        turboIsPaused = Boolean(st.paused);
        if ($('enrichPauseBtn')) {
          $('enrichPauseBtn').textContent = turboIsPaused ? '▶ Devam Ettir' : '⏸ Duraklat';
        }
        const c = st.counts || {};
        const queued = (c.queued || 0) + (c.running || 0);
        const finished = (c.done || 0) + (c.empty || 0) + (c.partial || 0) + (c.failed || 0);
        const total = queued + finished;
        if ($('enrichLiveStatus')) {
          $('enrichLiveStatus').textContent =
            `Durum: ${turboIsPaused ? '⏸ Duraklatıldı' : '⚡ Çalışıyor'} · Tamamlanan: ${fmt(finished)}/${fmt(total)} · E-posta: ${fmt(st.contacts || 0)} · Tel: ${fmt(st.phones || 0)}`;
        }
        await executeSearch(false);
        if (queued > 0 && total > 0 && !turboIsPaused) {
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
          if (!turboIsPaused) {
            setStatus(
              `Web taraması tamamlandı! Toplam ${fmt(st.contacts)} kurumsal e-posta ve ${fmt(st.phones)} telefon kaydı hazır.`,
              'Tamamlandı',
              false,
              null
            );
          }
        }
      } catch {
        clearInterval(turboPollTimer);
        turboPollTimer = null;
      }
    }, 2500);
  }

  function syncExportInputsToSearch() {
    if (activeWorkspace !== 'export') return false;
    const prevF = currentFilters();
    const expSec = $('exportSectorInput');
    const expCountry = $('exportCountrySelect');
    const expCity = $('exportCitySelect');
    const expCustom = $('exportCityCustomInput');
    if (expSec && $('sectorInput')) {
      $('sectorInput').value = expSec.value.trim();
    }
    if (expCountry && $('countrySelect')) {
      $('countrySelect').value = expCountry.value || 'Türkiye';
      populateCitiesForCountry($('countrySelect').value, $('citySelect'), $('cityCustomInput'), false, true);
    }
    if (expCity && $('citySelect')) {
      const targetCity = expCity.value === '__all_country__' ? '__all__' : (expCity.value || '__all__');
      $('citySelect').value = targetCity;
      if ($('cityCustomInput')) {
        $('cityCustomInput').hidden = (targetCity !== '__custom__');
        if (expCustom && targetCity === '__custom__') {
          $('cityCustomInput').value = expCustom.value.trim();
        }
      }
    }
    const nextF = currentFilters();
    return (prevF.country !== nextF.country || prevF.city !== nextF.city || prevF.sector !== nextF.sector);
  }

  // Excel (.xlsx) Export
  async function handleExportXlsx() {
    const filtersChanged = syncExportInputsToSearch();
    const btn = $('exportXlsxBtn');
    const wsBtn = $('exportWorkspaceXlsxBtn');
    if (btn) btn.disabled = true;
    if (wsBtn) wsBtn.disabled = true;

    try {
      const preF = currentFilters();
      // Auto-load portfolio if user clicked Export directly from View 02 or selected a foreign country not yet ingested into SQLite
      if (
        filtersChanged ||
        (!activeRecords.length && (!turboConnected || activeMode !== 'turbo-db')) ||
        (turboConnected && preF.country !== 'Türkiye' && (!turboPageData || !turboPageData.total))
      ) {
        await executeSearch(true);
      }

      const f = currentFilters();
      const locSlug = slugify(f.city === '__all__' ? `tum-${f.country}` : f.city);
      const fileSlug = `${locSlug}-${slugify(f.sector || 'firmalar')}.xlsx`;

      // If connected to Turbo SQLite and no client-only quick filter is active, use server streaming XLSX
      if (turboConnected && !f.quick) {
        setStatus('Tek sayfa "Firmalar" Excel (.xlsx) dosyası hazırlanıyor…', 'Excel Üretimi', false, 60);
        const params = new URLSearchParams({
          sector: f.sector,
          region: f.region,
          district: f.district,
          contact_mode: f.contactMode
        });
        try {
          const res = await fetch(`${LOCAL_API}/api/export.xlsx?${params}`, {
            headers: { 'X-Local-Token': turboToken }
          });
          if (res.ok) {
            const blob = await res.blob();
            triggerDownload(blob, fileSlug);
            setStatus(`Excel (.xlsx) indirildi: ${fileSlug}`, 'İndirildi', false, null);
            return;
          }
        } catch {
          // Fallback to browser OOXML engine below
          if (!activeRecords.length) {
            turboConnected = false;
            await executeSearch(true);
          }
        }
      }

      // Pure-JS Browser OOXML Generator (works anywhere on Cloud/Web!)
      if (!activeRecords.length) {
        throw new Error('Seçilen kriterlere uygun dışa aktarılacak firma bulunamadı.');
      }
      setStatus(`${fmt(activeRecords.length)} firma tek sayfa Excel (.xlsx) olarak paketleniyor…`, 'Tarayıcı XLSX', false, 65);
      const blob = await window.XlsxEngine.generateFirmalarXlsx(activeRecords);
      triggerDownload(blob, fileSlug);
      setStatus(`${fmt(activeRecords.length)} firmalık Excel (.xlsx) dosyası indirildi: ${fileSlug}`, 'İndirildi', false, null);
    } catch (err) {
      setStatus(err.message || 'Excel oluşturulamadı', 'Hata', true, null);
    } finally {
      if (btn) btn.disabled = false;
      if (wsBtn) wsBtn.disabled = false;
    }
  }

  // CSV Export (Full Dataset Server Streaming in Turbo Mode + Formula-Safe Client Export in Cloud Mode)
  async function handleExportCsv() {
    const filtersChanged = syncExportInputsToSearch();
    const preF = currentFilters();
    if (
      filtersChanged ||
      (!activeRecords.length && (!turboConnected || activeMode !== 'turbo-db')) ||
      (turboConnected && preF.country !== 'Türkiye' && (!turboPageData || !turboPageData.total))
    ) {
      await executeSearch(true);
    }
    const f = currentFilters();
    const locSlug = slugify(f.city === '__all__' ? `tum-${f.country}` : f.city);
    const fileSlug = `${locSlug}-${slugify(f.sector || 'firmalar')}.csv`;

    if (turboConnected && !f.quick) {
      const params = new URLSearchParams({
        sector: f.sector,
        region: f.region,
        district: f.district,
        contact_mode: f.contactMode
      });
      try {
        setStatus('Tüm eşleşen firmalar CSV olarak hazırlanıyor…', 'CSV Üretimi', false, 55);
        const res = await fetch(`${LOCAL_API}/api/portfolio.csv?${params}`, {
          headers: turboToken ? { 'X-Local-Token': turboToken } : {}
        });
        if (res.ok) {
          const blob = await res.blob();
          triggerDownload(blob, fileSlug);
          const totalHint = (turboPageData && turboPageData.total) ? `${fmt(turboPageData.total)} firmalık ` : '';
          setStatus(`${totalHint}CSV dosyası indirildi: ${fileSlug}`, 'İndirildi', false, null);
          return;
        }
      } catch {
        // Fall through to client CSV export if local service drops
      }
    }

    const rowsToExport = activeRecords.length
      ? activeRecords
      : (turboPageData && Array.isArray(turboPageData.rows) ? turboPageData.rows : []);

    if (!rowsToExport.length) {
      setStatus('Seçilen kriterlere uygun CSV kaydı bulunamadı.', 'Uyarı', true, null);
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

  function collapseClusteredRecords(records) {
    const groups = new Map();
    let seq = 1;
    for (const r of records) {
      let cid = r.cluster_id;
      if (cid == null || cid === '') {
        let dom = '';
        if (r.website) {
          try { dom = new URL(r.website).hostname.replace(/^www\./i, '').toLowerCase(); } catch {}
        }
        const brand = fold(r.name || '')
          .replace(/\b(?:sarl|sas|sa|sasu|eurl|gmbh|ag|kg|ltd|inc|llc|spa|srl|bv|nv|as|sti|san|tic|paris|france|turkiye)\b/g, '')
          .trim();
        const ph0 = (r.phones && r.phones[0]) || '';
        cid = dom ? `dom:${dom}` : (ph0 ? `ph:${ph0}` : (brand ? `br:${brand}` : `row:${seq++}`));
      }
      if (!groups.has(cid)) {
        groups.set(cid, Object.assign({}, r, {
          cluster_id: groups.size + 1,
          merged_count: 1,
          emails: [...(r.emails || [])],
          phones: [...(r.phones || [])]
        }));
      } else {
        const master = groups.get(cid);
        master.merged_count += 1;
        for (const em of (r.emails || [])) {
          if (!master.emails.includes(em)) master.emails.push(em);
        }
        for (const ph of (r.phones || [])) {
          if (!master.phones.includes(ph)) master.phones.push(ph);
        }
        if (!master.website && r.website) master.website = r.website;
        if (!master.whatsapp && (r.whatsapp || r.whatsappUrl)) {
          master.whatsapp = r.whatsapp || r.whatsappUrl;
          master.hasWhatsapp = true;
        }
        if (!master.tech && r.tech) master.tech = r.tech;
      }
    }
    return Array.from(groups.values());
  }

  async function loadCandidatePoolForEngine(maxRows = 1000) {
    if (activeMode !== 'turbo-db') {
      return activeRecords.slice(0, maxRows);
    }
    const pageRows = (turboPageData && Array.isArray(turboPageData.rows)) ? turboPageData.rows : [];
    const totalAvailable = (turboPageData && Number(turboPageData.total)) || pageRows.length;
    if (!turboConnected || totalAvailable <= pageRows.length) {
      return pageRows;
    }
    const f = currentFilters();
    try {
      const params = new URLSearchParams({
        sector: f.sector,
        region: f.region,
        district: f.district,
        contact_mode: f.contactMode,
        q: f.quick,
        offset: '0',
        limit: String(Math.min(1000, maxRows))
      });
      const data = await turboApi(`portfolio?${params}`, undefined, 15000);
      if (data && Array.isArray(data.rows) && data.rows.length) {
        return data.rows;
      }
    } catch {
      // Fall back to currently loaded page rows if full pool fetch fails
    }
    return pageRows;
  }

  // Splink 5.0 Probabilistic Entity Clustering on DuckDB (with explicit fallback disclosure)
  async function handleSplinkDedup() {
    await ensureResultsLoaded();
    const currentRows = await loadCandidatePoolForEngine(1000);
    if (!currentRows || !currentRows.length) {
      setStatus('Tekilleştirilecek firma kaydı bulunamadı.', 'Bilgi', false, null);
      return;
    }

    const btn = $('splinkDedupBtn');
    if (btn) btn.disabled = true;
    const beforeCount = currentRows.length;
    setStatus('Splink 5.0 ile çoklu şubeler ve mükerrer firma kayıtları birleştiriliyor…', 'AI Tekilleştirme', false, 55);
    try {
      let clustered = null;
      let engineUsed = '';
      if (turboConnected && currentRows.length >= 2) {
        try {
          const res = await turboApi('industrial/dedup', { records: currentRows }, 20000);
          if (res && Array.isArray(res.records) && res.records.length) {
            clustered = res.records;
            engineUsed = res.fallback_used
              ? 'Deterministik Yedek Birleştirici (Splink Yedeği)'
              : 'Splink 5.0 (DuckDB)';
          }
        } catch (e) {
          console.warn('Splink local fallback to client entity resolution:', e);
        }
      }
      if (!clustered) {
        engineUsed = 'İstemci Varlık Birleştirici (Bulut Yedeği)';
        clustered = currentRows.map(r => Object.assign({}, r));
      }

      const mergedList = collapseClusteredRecords(clustered);
      const collapsedBranches = Math.max(0, beforeCount - mergedList.length);

      activeMode = 'cloud';
      activeRecords = mergedList;
      currentOffset = 0;
      renderTableRows(mergedList.slice(0, PAGE_SIZE), mergedList.length, computeRowsStats(mergedList));
      setStatus(
        `${engineUsed}: ${fmt(beforeCount)} kayıt incelendi → ${fmt(mergedList.length)} tekil ana işletme kaldı (${fmt(collapsedBranches)} mükerrer şube birleştirildi).`,
        'Tekilleştirildi',
        false,
        null
      );
    } catch (err) {
      setStatus('Tekilleştirme sırasında hata: ' + (err.message || err), 'Hata', true, null);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // RapidFuzz C++ SIMD WRatio Ranking (with explicit fallback disclosure in Cloud Mode)
  async function handleRapidFuzzRank() {
    await ensureResultsLoaded();
    const f = currentFilters();
    const queryStr = ($('quickSearchInput').value || f.sector || f.cityDisplay || f.city || 'Firma').trim();
    const currentRows = await loadCandidatePoolForEngine(1000);
    if (!currentRows || !currentRows.length) {
      setStatus('Sıralanacak firma kaydı bulunamadı.', 'Bilgi', false, null);
      return;
    }

    const btn = $('rapidFuzzBtn');
    if (btn) btn.disabled = true;
    try {
      if (turboConnected && currentRows.length >= 2) {
        try {
          setStatus(`RapidFuzz C++ SIMD (WRatio) ile "${queryStr}" benzerlik sıralaması yapılıyor…`, 'RapidFuzz C++', false, 50);
          const res = await turboApi('industrial/fuzzy_match', {
            records: currentRows,
            query: queryStr,
            limit: Math.min(1000, currentRows.length),
            score_cutoff: 0
          }, 15000);
          if (res && Array.isArray(res.records) && res.records.length) {
            activeMode = 'cloud';
            activeRecords = res.records;
            currentOffset = 0;
            renderTableRows(activeRecords.slice(0, PAGE_SIZE), activeRecords.length, computeRowsStats(activeRecords));
            setStatus(`RapidFuzz C++ SIMD ile ${fmt(res.records.length)} firma "${queryStr}" ilgisine göre (% uyum puanıyla) sıralandı.`, 'RapidFuzz C++', false, null);
            return;
          }
        } catch (err) {
          console.warn('RapidFuzz fallback:', err);
        }
      }

      // Pure-JS token + alias similarity fallback for Cloud Mode (explicitly labeled as fallback)
      const expandedTerms = expandSectorTerms(queryStr);
      const qFold = fold(queryStr);
      const qTokens = qFold.split(' ').filter(Boolean);
      const scored = currentRows.map(r => {
        const nameF = fold(r.name || '');
        const hay = fold(`${r.name || ''} ${r.category || ''} ${r.district || ''}`);
        let score = hay.includes(qFold) ? 90 : (matchesTerms(` ${hay} `, expandedTerms) ? 82 : 52);
        for (const t of qTokens) {
          if (nameF.startsWith(t)) score += 8;
          else if (nameF.includes(t)) score += 5;
        }
        if (r.website) score += 2;
        if (r.emails && r.emails.length) score += 2;
        return Object.assign({}, r, { fuzzy_score: Math.min(100, score) });
      }).sort((a, b) => b.fuzzy_score - a.fuzzy_score);

      activeMode = 'cloud';
      activeRecords = scored;
      currentOffset = 0;
      renderTableRows(scored.slice(0, PAGE_SIZE), scored.length, computeRowsStats(scored));
      setStatus(`Tarayıcı Benzerlik Yedeği (RapidFuzz Kapalı): ${fmt(scored.length)} firma "${queryStr}" ilgisine göre sıralandı.`, 'Bulut Yedeği', false, null);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // Single URL Live Corporate Intelligence (curl_cffi + Lexbor + Trafilatura + MX/SPF/DMARC)
  async function handleSingleCrawl() {
    const input = $('singleCrawlUrlInput');
    const box = $('singleCrawlResultBox');
    const btn = $('singleCrawlBtn');
    if (!input || !box || !btn) return;
    const raw = input.value.trim();
    if (!raw) {
      alert('Lütfen bir şirket web sitesi veya alan adı girin (Örn: arcelik.com.tr).');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Analiz Ediliyor…';
    box.hidden = false;
    box.replaceChildren(el('div', 'Kurumsal web sayfası ve DNS MX/SPF/DMARC kayıtları inceleniyor…', 'text-muted'));

    try {
      if (turboConnected || cloudApiConnected) {
        const res = turboConnected
          ? await turboApi('industrial/crawl', { url: raw }, 22000)
          : await fetch('/api/cloud/crawl', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: raw })
            }).then(async r => {
              const j = await r.json().catch(() => ({}));
              if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
              return j;
            });
        box.replaceChildren();
        const domInfo = res.domain_intel || {};

        if (res.success === false) {
          const reason = res.error || res.blocked_reason || 'Sayfa yanıt vermedi veya erişim engellendi';
          const failHead = el('div', `⚠ ${res.url || raw} — Web Sayfası Taranamadı (${reason})`, 'firm-name');
          const dnsLine = el(
            'div',
            `DNS Durumu: ${domInfo.provider || 'Bilinmiyor'} · MX: ${domInfo.has_mx ? 'Aktif' : 'Yok'} · SPF: ${(domInfo.spf || domInfo.has_spf) ? 'Var' : 'Yok'} · DMARC: ${domInfo.has_dmarc ? 'Var' : 'Yok'}`,
            'text-muted'
          );
          dnsLine.style.marginTop = '6px';
          const noteLine = el(
            'div',
            'Sayfa içeriği çekilemediği için VKN/MERSİS, e-posta ve telefon alanları doğrulanmamış olarak bırakıldı (sahte "bulunamadı" üretilmedi).',
            'text-muted'
          );
          noteLine.style.marginTop = '4px';
          noteLine.style.fontSize = '12.5px';
          box.append(failHead, dnsLine, noteLine);
          return;
        }

        const head = el('div', `✓ ${res.title || res.url || raw} (${res.engine_used || res.tier_used || 'http2'})`, 'firm-name');
        const corpIds = res.corporate_identifiers || res.corporate_ids || {};
        const execs = Array.isArray(res.decision_makers) ? res.decision_makers : [];
        const pat = res.email_pattern || {};

        const grid = el('div', null, 'intel-grid');
        const b1 = el('div', null, 'intel-box');
        b1.append(
          el('small', 'DNS & Posta Altyapısı'),
          el('div', `${domInfo.provider || 'Bilinmiyor'} · MX: ${domInfo.has_mx ? 'Aktif' : 'Yok'} · SPF: ${(domInfo.spf || domInfo.has_spf) ? 'Var' : 'Yok'} · DMARC: ${domInfo.has_dmarc ? 'Var' : 'Yok'}`)
        );

        const b2 = el('div', null, 'intel-box');
        const vkns = Array.isArray(corpIds.all_vkns) && corpIds.all_vkns.length ? corpIds.all_vkns : (corpIds.vkn ? [corpIds.vkn] : []);
        const vknText = vkns.length ? `VKN: ${vkns.join(', ')} (GİB Doğrulamalı)` : 'VKN: Sayfa Metninde Yer Almıyor';
        const mersisText = corpIds.mersis ? ` · MERSİS: ${corpIds.mersis}` : '';
        const kepText = (corpIds.kep_addresses && corpIds.kep_addresses.length) ? ` · KEP: ${corpIds.kep_addresses.join(', ')}` : '';
        const vatList = corpIds.international_reg_ids || corpIds.vat_numbers || [];
        const vatText = vatList.length ? ` · VAT/HRB: ${vatList.join(', ')}` : '';
        b2.append(el('small', 'Resmi Sicil & Vergi İstihbaratı'), el('div', vknText + mersisText + kepText + vatText));

        const b3 = el('div', null, 'intel-box');
        const execText = execs.length
          ? execs.map(x => `${x.name} (${x.role})`).join(' · ')
          : 'Açık Künye/JSON-LD Yetkilisi Bulunamadı';
        const patText = pat.pattern ? ` · Format: ${pat.pattern}` : '';
        b3.append(el('small', 'Karar Vericiler & E-posta Kalıbı'), el('div', execText + patText));

        grid.append(b1, b2, b3);

        const emLine = el('div', `E-postalar: ${(res.emails && res.emails.length) ? res.emails.join(', ') : 'Sayfada Açık E-posta Yok'}`, 'contact-item');
        emLine.style.marginTop = '10px';
        const phList = (res.phones || []).map(p => (typeof p === 'string' ? p : `${p.e164} (${p.line_type}${p.whatsapp_eligible ? ' · WhatsApp' : ''})`));
        const phLine = el('div', `Telefonlar: ${phList.length ? phList.join(', ') : 'Sayfada Açık Telefon Yok'}`, 'contact-item');
        phLine.style.marginTop = '4px';
        box.append(head, grid, emLine, phLine);
        const snippet = res.markdown_snippet || res.markdown_preview;
        if (snippet) {
          const prev = el('p', snippet.slice(0, 360) + (snippet.length > 360 ? '…' : ''), 'text-muted');
          prev.style.marginTop = '8px';
          prev.style.fontSize = '12.5px';
          box.append(prev);
        }
        return;
      }

      // Cloud fallback: Dual-Provider DNS-over-HTTPS (Google DoH + Cloudflare 1.1.1.1 DoH failover)
      const dom = raw.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '').toLowerCase();
      let mxHttpOk = false;
      const fetchDns = async (name, type) => {
        const dohUrls = [
          `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`
        ];
        let lastStatus = 0;
        for (const u of dohUrls) {
          try {
            const r = await fetch(u, { headers: { Accept: 'application/dns-json' } });
            lastStatus = r.status;
            if (r.ok) {
              mxHttpOk = true;
              return await r.json();
            }
          } catch {}
        }
        throw new Error(`DNS HTTP ${lastStatus || 'Bağlantı Hatası'}`);
      };
      const [mxRes, txtRes, dmarcRes] = await Promise.all([
        fetchDns(dom, 'MX'),
        fetchDns(dom, 'TXT').catch(() => ({})),
        fetchDns('_dmarc.' + dom, 'TXT').catch(() => ({}))
      ]);
      if (!mxHttpOk) {
        throw new Error('DNS-over-HTTPS doğrulama sunucusuna ulaşılamadı.');
      }
      box.replaceChildren();
      if (mxRes.Status === 3) {
        box.append(
          el('div', `⚠ ${dom} — Alan Adı Mevcut Değil (NXDOMAIN)`, 'firm-name'),
          el('div', 'Girilen alan adı küresel DNS kayıtlarında kayıtlı görünmüyor.', 'text-muted')
        );
        return;
      }
      if (typeof mxRes.Status === 'number' && mxRes.Status !== 0) {
        box.append(
          el('div', `⚠ ${dom} — DNS Sorgu Hatası (RCODE ${mxRes.Status})`, 'firm-name'),
          el('div', 'Alan adı DNS sunucuları geçerli bir yanıt döndürmedi.', 'text-muted')
        );
        return;
      }
      const mxHosts = (mxRes.Answer || []).filter(a => a.type === 15).map(a => String(a.data || '').toLowerCase());
      const txtVals = (txtRes.Answer || []).map(a => String(a.data || ''));
      const hasSpf = txtVals.some(t => t.toLowerCase().includes('v=spf1'));
      const hasDmarc = (dmarcRes.Answer || []).some(a => String(a.data || '').toLowerCase().includes('v=dmarc1'));
      let provider = mxHosts.length ? 'Özel Kurumsal Posta Sunucusu' : 'MX Kaydı Yok';
      const joinedMx = mxHosts.join(' ');
      if (joinedMx.includes('outlook.com') || joinedMx.includes('protection.outlook')) provider = 'Microsoft 365';
      else if (joinedMx.includes('google.com') || joinedMx.includes('googlemail.com')) provider = 'Google Workspace';
      else if (joinedMx.includes('yandex')) provider = 'Yandex 360 Kurumsal';

      box.append(
        el('div', `✓ ${dom} — Canlı DNS-over-HTTPS Altyapı Raporu (Bulut Yedeği)`, 'firm-name'),
        el('div', `Posta Altyapısı: ${provider} · MX: ${mxHosts.length ? 'Aktif (' + mxHosts.length + ' sunucu)' : 'Yok'} · SPF: ${hasSpf ? 'Aktif' : 'Yok'} · DMARC: ${hasDmarc ? 'Aktif' : 'Yok'}`, 'text-muted'),
        el('div', 'Not: Bulut modunda tarayıcı CORS sınırı nedeniyle yalnızca canlı DNS kayıtları doğrulanır; tam HTML/VKN/e-posta kazıma için yerel masaüstü motoru gerekir.', 'text-muted')
      );
    } catch (err) {
      box.replaceChildren(el('div', '⚠ İnceleme hatası: ' + (err.message || err), 'text-muted'));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Canlı İstihbarat Çıkar';
    }
  }

  // Light-Mode Vector Basemap Style (Carto Positron Light — Strictly White/Light Corporate Theme)
  const LIGHT_VECTOR_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

  function buildRegularHexagonRing(lon, lat, radiusDeg = 0.014) {
    const cosLat = Math.max(0.25, Math.cos((lat * Math.PI) / 180));
    const ring = [];
    for (let i = 0; i <= 6; i++) {
      const ang = (Math.PI / 3) * (i % 6) + Math.PI / 6;
      ring.push([
        Number((lon + (radiusDeg * Math.cos(ang)) / cosLat).toFixed(6)),
        Number((lat + radiusDeg * Math.sin(ang)).toFixed(6))
      ]);
    }
    return ring;
  }

  async function toggleSearchMap() {
    const wrap = $('searchMapWrap');
    if (!wrap) return;
    if (wrap.hidden) {
      await ensureResultsLoaded();
      wrap.hidden = false;
      const btn = $('toggleSearchMapBtn');
      if (btn) btn.textContent = '🗺️ Haritayı Gizle';
      const rows = activeMode === 'turbo-db'
        ? ((turboPageData && turboPageData.rows) || [])
        : activeRecords.slice(currentOffset, currentOffset + PAGE_SIZE);
      renderSearchVectorMap(rows, currentFilters());
      requestAnimationFrame(() => {
        if (searchMapInstance) searchMapInstance.resize();
      });
      wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      wrap.hidden = true;
      const btn = $('toggleSearchMapBtn');
      if (btn) btn.textContent = '🗺️ Haritada Göster';
    }
  }

  function renderSearchVectorMap(rows, f) {
    const canvas = $('searchMapCanvas');
    if (!canvas || typeof window.maplibregl === 'undefined') return;
    const valid = (rows || []).filter(r => typeof r.lat === 'number' && typeof r.lon === 'number' && Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180);
    const cityLabel = f.cityDisplay || f.city;
    const titleEl = $('searchMapTitle');
    if (titleEl) {
      titleEl.textContent = `🗺️ ${cityLabel} (${f.country}) · ${f.sector || 'Tüm Sektörler'} — ${valid.length} Konum`;
    }
    if (!valid.length) return;

    if (!searchMapInstance) {
      searchMapInstance = new window.maplibregl.Map({
        container: canvas,
        style: LIGHT_VECTOR_STYLE,
        center: [valid[0].lon, valid[0].lat],
        zoom: 10.5,
        attributionControl: true
      });
      searchMapInstance.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    } else {
      searchMapInstance.resize();
    }

    for (const m of searchMapMarkers) m.remove();
    searchMapMarkers = [];

    const bounds = new window.maplibregl.LngLatBounds();
    for (const r of valid.slice(0, 150)) {
      bounds.extend([r.lon, r.lat]);
      const popRoot = el('div');
      popRoot.append(
        el('strong', r.name || 'Firma'),
        el('div', formatCategoryLabel(r.category, f.sector), 'text-muted')
      );
      if (r.phones && r.phones[0]) popRoot.append(el('div', `📞 ${r.phones[0]}`));
      if (r.emails && r.emails[0]) popRoot.append(el('div', `📧 ${r.emails[0]}`));
      const quickBtn = el('button', '+ ERP Cari Kartı Oluştur', 'btn-quick-party');
      quickBtn.type = 'button';
      quickBtn.style.marginTop = '6px';
      quickBtn.addEventListener('click', () => openQuickPartyModal(r, f));
      popRoot.append(quickBtn);

      const popup = new window.maplibregl.Popup({ offset: 18 }).setDOMContent(popRoot);
      const marker = new window.maplibregl.Marker({ color: (r.hasWhatsapp || r.whatsapp) ? '#059669' : '#7C3532' })
        .setLngLat([r.lon, r.lat])
        .setPopup(popup)
        .addTo(searchMapInstance);
      searchMapMarkers.push(marker);
    }

    if (valid.length === 1) {
      searchMapInstance.flyTo({ center: [valid[0].lon, valid[0].lat], zoom: 13 });
    } else {
      searchMapInstance.fitBounds(bounds, { padding: 48, maxZoom: 13.5, duration: 550 });
    }
  }

  function renderH3VectorMap(clusters, city) {
    const wrap = $('h3MapWrap');
    const canvas = $('h3MapCanvas');
    if (!wrap || !canvas || typeof window.maplibregl === 'undefined') return;
    if (!clusters || !clusters.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    const maxCnt = Math.max(1, ...clusters.map(c => c.firm_count || 1));

    const features = clusters.map(c => {
      const ring = (Array.isArray(c.boundary) && c.boundary.length >= 6)
        ? c.boundary
        : buildRegularHexagonRing(c.center_lon, c.center_lat, 0.014);
      const ratio = (c.firm_count || 1) / maxCnt;
      const fill = ratio > 0.66 ? '#7C3532' : (ratio > 0.33 ? '#B96D6B' : '#E8C9C8');
      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {
          h3_index: c.h3_index || '',
          district: c.district || city,
          firm_count: c.firm_count || 0,
          dominant_category: c.dominant_category || 'Sanayi',
          with_email: c.with_email || 0,
          with_phone: c.with_phone || 0,
          samples: (c.sample_firms || []).slice(0, 3).join(' · '),
          fill
        }
      };
    });

    const geojson = { type: 'FeatureCollection', features };

    const applySource = () => {
      const existing = h3MapInstance.getSource('h3-hexes');
      if (existing) {
        existing.setData(geojson);
      } else {
        h3MapInstance.addSource('h3-hexes', { type: 'geojson', data: geojson });
        h3MapInstance.addLayer({
          id: 'h3-hex-fill',
          type: 'fill',
          source: 'h3-hexes',
          paint: {
            'fill-color': ['get', 'fill'],
            'fill-opacity': 0.52
          }
        });
        h3MapInstance.addLayer({
          id: 'h3-hex-line',
          type: 'line',
          source: 'h3-hexes',
          paint: {
            'line-color': '#0369A1',
            'line-width': 2
          }
        });
        h3MapInstance.on('click', 'h3-hex-fill', ev => {
          if (!ev.features || !ev.features.length) return;
          const p = ev.features[0].properties || {};
          const popNode = el('div');
          popNode.append(
            el('strong', `⬡ ${p.district} (${fmt(p.firm_count)} Firma)`),
            el('div', `Baskın Sektör: ${p.dominant_category}`),
            el('div', `📧 ${fmt(p.with_email)} E-posta · 📞 ${fmt(p.with_phone)} Tel`),
            el('div', p.samples ? `Öncü: ${p.samples}` : `H3: ${p.h3_index}`, 'text-muted')
          );
          new window.maplibregl.Popup()
            .setLngLat(ev.lngLat)
            .setDOMContent(popNode)
            .addTo(h3MapInstance);
        });
        h3MapInstance.on('mouseenter', 'h3-hex-fill', () => { h3MapInstance.getCanvas().style.cursor = 'pointer'; });
        h3MapInstance.on('mouseleave', 'h3-hex-fill', () => { h3MapInstance.getCanvas().style.cursor = ''; });
      }
      const bounds = new window.maplibregl.LngLatBounds();
      for (const c of clusters) bounds.extend([c.center_lon, c.center_lat]);
      h3MapInstance.fitBounds(bounds, { padding: 55, maxZoom: 12, duration: 550 });
    };

    if (!h3MapInstance) {
      h3MapInstance = new window.maplibregl.Map({
        container: canvas,
        style: LIGHT_VECTOR_STYLE,
        center: [clusters[0].center_lon, clusters[0].center_lat],
        zoom: 10
      });
      h3MapInstance.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      h3MapInstance.on('load', applySource);
    } else {
      h3MapInstance.resize();
      if (h3MapInstance.isStyleLoaded()) applySource();
      else h3MapInstance.once('load', applySource);
    }
  }

  // Uber H3 Hexagonal OSB & Industrial Density Radar (Local H3 C engine + Cloud Shard Spatial Grid fallback)
  async function handleH3ClusterScan() {
    const rawCity = ($('h3CitySelect') && $('h3CitySelect').value) || 'İstanbul';
    const isAllCities = (rawCity === '__all__' || rawCity === '__all_country__');
    const cityLabel = isAllCities ? 'Türkiye Geneli (81 İl)' : rawCity;
    const sector = ($('h3SectorInput') && $('h3SectorInput').value.trim()) || '';
    const statusEl = $('h3StatusText');
    const wrap = $('h3ResultsWrap');
    const tbody = $('h3ResultsBody');
    const btn = $('h3ScanBtn');
    if (!tbody || !wrap || !btn) return;

    btn.disabled = true;
    btn.textContent = '⬡ Taranıyor…';
    if (statusEl) statusEl.textContent = `${cityLabel} sanayi ve ticaret yoğunluk kümeleri hesaplanıyor…`;

    try {
      let clusters = [];
      let engineName = 'Uber H3 v4.5 (Res-7)';

      if (turboConnected) {
        try {
          const params = new URLSearchParams({
            region: isAllCities ? '__all__, Türkiye' : `${rawCity}, Türkiye`,
            sector,
            resolution: isAllCities ? '6' : '7'
          });
          const res = await turboApi(`industrial/h3_clusters?${params}`, undefined, 16000);
          if (res && Array.isArray(res.clusters)) {
            clusters = res.clusters;
          }
        } catch (e) {
          console.warn('H3 local fallback to cloud shard:', e);
        }
      }

      if (!clusters.length) {
        engineName = 'Bulut Mekansal Küme Radarı (~5 km²)';
        let rows = [];
        if (isAllCities) {
          const multi = await loadNationwideTrCloudShards(sector);
          rows = (multi && multi.records) || [];
        } else {
          const slug = slugify(rawCity);
          if (manifest.shards && manifest.shards[slug]) {
            const shard = await loadCdnShard(slug);
            if (shard && shard.isTupleShard) {
              const terms = expandSectorTerms(sector);
              for (const r of shard.rows) {
                if (terms.length) {
                  const catStr = shard.catsSearch[r[1]] || '';
                  const nmStr = ` ${fold(r[0] || '')} `;
                  if (!matchesTerms(catStr, terms) && !matchesTerms(` ${r[10] || ''} `, terms) && !matchesTerms(nmStr, terms)) {
                    continue;
                  }
                }
                rows.push({
                  name: r[0],
                  category: shard.cats[r[1]] || 'İşletme',
                  district: shard.dists[r[2]] || '',
                  website: r[3] || '',
                  emails: r[4] || [],
                  phones: r[5] || [],
                  lat: r[7],
                  lon: r[8]
                });
              }
            }
          }
        }
        const buckets = new Map();
        for (const r of rows) {
          if (typeof r.lat !== 'number' || typeof r.lon !== 'number') continue;
          const gy = Math.round(r.lat / 0.022);
          const gx = Math.round(r.lon / 0.028);
          const key = `hex-${gy}-${gx}`;
          let b = buckets.get(key);
          if (!b) {
            b = {
              h3_index: key,
              firm_count: 0,
              latSum: 0,
              lonSum: 0,
              with_email: 0,
              with_phone: 0,
              with_website: 0,
              dists: new Map(),
              cats: new Map(),
              sample_firms: []
            };
            buckets.set(key, b);
          }
          b.firm_count++;
          b.latSum += r.lat;
          b.lonSum += r.lon;
          if (r.emails.length) b.with_email++;
          if (r.phones.length) b.with_phone++;
          if (r.website) b.with_website++;
          const locName = r.district || r.city || '';
          if (locName && isCleanDistrictName(locName)) {
            b.dists.set(locName, (b.dists.get(locName) || 0) + 1);
          }
          if (r.category) {
            b.cats.set(r.category, (b.cats.get(r.category) || 0) + 1);
          }
          if (b.sample_firms.length < 4 && r.name) b.sample_firms.push(r.name);
        }
        clusters = Array.from(buckets.values())
          .filter(b => b.firm_count >= 5)
          .sort((a, b) => b.firm_count - a.firm_count)
          .slice(0, 15)
          .map(b => {
            const topDist = Array.from(b.dists.entries()).sort((x, y) => y[1] - x[1])[0];
            const topCat = Array.from(b.cats.entries()).sort((x, y) => y[1] - x[1])[0];
            return {
              h3_index: b.h3_index,
              district: topDist ? topDist[0] : cityLabel,
              firm_count: b.firm_count,
              dominant_category: topCat ? formatCategoryLabel(topCat[0], sector) : 'Genel Sanayi',
              with_email: b.with_email,
              with_phone: b.with_phone,
              with_website: b.with_website,
              center_lat: Number((b.latSum / b.firm_count).toFixed(5)),
              center_lon: Number((b.lonSum / b.firm_count).toFixed(5)),
              sample_firms: b.sample_firms
            };
          });
      }

      tbody.replaceChildren();
      wrap.hidden = false;
      if (!clusters.length) {
        if (statusEl) statusEl.textContent = `${cityLabel} için yoğun küme bulunamadı.`;
        const tr = el('tr');
        const td = el('td', 'Bu il/sektör için küme verisi bulunamadı.', 'empty-state');
        td.colSpan = 6;
        tr.append(td);
        tbody.append(tr);
        return;
      }

      if (statusEl) {
        statusEl.textContent = `✓ ${engineName} ile ${cityLabel} genelinde en yoğun ${clusters.length} sanayi ve ticaret kümesi haritalandı.`;
      }

      renderH3VectorMap(clusters.slice(0, 20), cityLabel);

      for (const c of clusters.slice(0, 15)) {
        const tr = el('tr');
        const tdHex = el('td');
        tdHex.append(el('strong', c.district || cityLabel), el('div', `H3: ${c.h3_index}`, 'firm-addr'));

        const tdCnt = el('td');
        tdCnt.append(el('span', `${fmt(c.firm_count)} Firma`, 'badge efatura'));

        const tdCat = el('td', formatCategoryLabel(c.dominant_category, sector));

        const tdContact = el('td', `📧 ${fmt(c.with_email)} · 📞 ${fmt(c.with_phone)} · 🌐 ${fmt(c.with_website)}`);

        const tdSamples = el('td', (c.sample_firms || []).slice(0, 3).join(' · ') || '—');
        tdSamples.style.fontSize = '12.5px';

        const tdMap = el('td');
        const a = el('a', 'Küme Haritası ↗', 'ext-link');
        a.href = `https://www.google.com/maps/search/?api=1&query=${c.center_lat},${c.center_lon}`;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        tdMap.append(a);

        tr.append(tdHex, tdCnt, tdCat, tdContact, tdSamples, tdMap);
        tbody.append(tr);
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Küme tarama hatası: ' + (err.message || err);
    } finally {
      btn.disabled = false;
      btn.textContent = '⬡ H3 Sanayi Kümelerini Tara';
    }
  }

  // DuckDB Vectorized Columnar Analytics (with honest Cloud CDN Manifest fallback & zero invented numbers)
  async function loadDuckDbAnalytics(forceRefresh = false) {
    const btn = $('refreshDuckDbBtn');
    if (btn && forceRefresh) {
      btn.disabled = true;
      btn.textContent = '⚡ Yenileniyor…';
    }
    const pctStr = (part, whole, suffix) => {
      if (!whole || whole <= 0) return '—';
      const p = ((Number(part || 0) / Number(whole)) * 100).toFixed(1).replace('.', ',');
      return `%${p} ${suffix}`;
    };
    try {
      if (turboConnected) {
        const endpoint = forceRefresh ? 'industrial/analytics?refresh=1' : 'industrial/analytics';
        const data = await turboApi(endpoint, undefined, 15000);
        if (data && typeof data.total_places === 'number') {
          const tot = data.total_places;
          if ($('duckdbTotalPlaces')) $('duckdbTotalPlaces').textContent = fmt(tot);
          if ($('duckdbTotalWebsites')) $('duckdbTotalWebsites').textContent = fmt(data.with_website || 0);
          if ($('duckdbTotalPhones')) $('duckdbTotalPhones').textContent = fmt(data.with_phones || 0);
          if ($('duckdbTotalEmails')) $('duckdbTotalEmails').textContent = fmt(data.with_emails || 0);
          if ($('duckdbWebPct')) $('duckdbWebPct').textContent = pctStr(data.with_website, tot, 'Web Varlığı');
          if ($('duckdbPhonePct')) $('duckdbPhonePct').textContent = pctStr(data.with_phones, tot, 'Telefon Oranı');
          if ($('duckdbEmailPct')) $('duckdbEmailPct').textContent = pctStr(data.with_emails, tot, 'E-posta Oranı');
          if ($('duckdbTotalLabel')) {
            $('duckdbTotalLabel').textContent = data.fallback_used
              ? 'Toplam Firma (SQLite Yedeği)'
              : 'Toplam Firma (DuckDB)';
          }
          if ($('duckdbCoverageLabel')) {
            $('duckdbCoverageLabel').textContent = `● ${fmt(data.distinct_regions || 0)} Bölge/Şehir Kayıtlı`;
          }
          if ($('duckdbEngineSource')) {
            const fbNote = data.fallback_used ? ` · Yedek Motor (${data.fallback_reason || 'DuckDB devre dışı'})` : '';
            $('duckdbEngineSource').textContent = `Kaynak: ${data.engine || 'DuckDB'} · ${data.speed_ms || ''}${fbNote}`;
          }
          if ($('dbPoolTitle')) {
            $('dbPoolTitle').textContent = data.fallback_used
              ? 'SQLite Salt-Okunur Analitik Havuzu (DuckDB Yedeği)'
              : 'DuckDB Sütunsal Analitik Veri Havuzu (Canlı Yerel Motor)';
          }
          return;
        }
      }

      if (manifest && manifest.shards) {
        let total = 0;
        let websites = 0;
        let phones = 0;
        let emails = 0;
        const shardValues = Object.values(manifest.shards);
        for (const s of shardValues) {
          total += Number(s.count || s.total || 0);
          websites += Number(s.websites || 0);
          phones += Number(s.phones || 0);
          emails += Number(s.emails || 0);
        }
        if ($('duckdbTotalPlaces')) $('duckdbTotalPlaces').textContent = fmt(total);
        if ($('duckdbTotalWebsites')) $('duckdbTotalWebsites').textContent = fmt(websites);
        if ($('duckdbTotalPhones')) $('duckdbTotalPhones').textContent = fmt(phones);
        if ($('duckdbTotalEmails')) $('duckdbTotalEmails').textContent = fmt(emails);
        if ($('duckdbWebPct')) $('duckdbWebPct').textContent = pctStr(websites, total, 'Web Varlığı');
        if ($('duckdbPhonePct')) $('duckdbPhonePct').textContent = pctStr(phones, total, 'Telefon Oranı');
        if ($('duckdbEmailPct')) $('duckdbEmailPct').textContent = pctStr(emails, total, 'E-posta Oranı');
        if ($('duckdbTotalLabel')) $('duckdbTotalLabel').textContent = 'Toplam Firma (CDN Havuzu)';
        if ($('duckdbCoverageLabel')) $('duckdbCoverageLabel').textContent = `● ${fmt(shardValues.length)} Ön-İndeksli Bölge Parçası`;
        if ($('duckdbEngineSource')) {
          $('duckdbEngineSource').textContent = 'Kaynak: Bulut CDN Manifest Özeti (Yerel DuckDB Servisi Bağlı Değil)';
        }
        if ($('dbPoolTitle')) {
          $('dbPoolTitle').textContent = 'Bulut CDN Bölgesel Veri Havuzu (81 İl + Uluslararası Ön-İndeks)';
        }
      } else {
        if ($('duckdbEngineSource')) {
          $('duckdbEngineSource').textContent = '⚠ Veri havuzu manifestosuna ve yerel DuckDB motoruna ulaşılamadı.';
        }
      }
    } catch (e) {
      console.warn('DuckDB analytics error:', e);
      if ($('duckdbEngineSource')) {
        $('duckdbEngineSource').textContent = '⚠ Analitik sorgusu başarısız: ' + (e.message || e);
      }
    } finally {
      if (btn && forceRefresh) {
        btn.disabled = false;
        btn.textContent = '⚡ Analizi Yenile';
      }
    }
  }

  // Overture Maps AWS S3 Live Stream Test
  async function handleOvertureTestSync() {
    const txt = $('overtureStatusText');
    if (!turboConnected) {
      if (txt) {
        txt.textContent = 'Bilgi: Doğrudan AWS S3 GeoParquet (PyArrow C++) akışı yerel masaüstü motorunda aktiftir; bulut modunda OSM + Photon küresel keşif motoru devrededir.';
      }
      return;
    }
    if (txt) txt.textContent = 'AWS S3 GeoParquet akışı başlatılıyor (Kadıköy BBox)…';
    try {
      const res = await turboApi('industrial/overture/sync', {
        bbox: [29.02, 40.98, 29.04, 41.00],
        limit: 10
      }, 25000);
      if (res && res.count) {
        if (txt) txt.textContent = `✓ AWS S3 üzerinden ${res.count} POI kaydı PyArrow ile anında çekildi (Sıfır Maliyet)!`;
      } else {
        if (txt) txt.textContent = 'Kayıt bulunamadı.';
      }
    } catch (err) {
      if (txt) txt.textContent = 'Bağlantı hatası: ' + (err.message || err);
    }
  }

  // =========================================================================
  // AppFlow V10.2 Navigation & Workspace Controller
  // =========================================================================
  const WORKSPACES = {
    launchpad: { id: 'viewLaunchpad', breadcrumb: 'B2B Haritalar', title: 'Kısayollarım', taskbarTitle: 'Masaüstü' },
    search: { id: 'viewSearch', breadcrumb: 'B2B Haritalar / İstihbarat', title: '01. Firma & İstihbarat Arama', taskbarTitle: 'B2B Haritalar \\ Firma Arama' },
    export: { id: 'viewExport', breadcrumb: 'B2B Haritalar / Veri İhracatı', title: '02. Toplu Excel & Veri İhracatı', taskbarTitle: 'B2B Haritalar \\ Toplu Excel' },
    enrich: { id: 'viewEnrich', breadcrumb: 'B2B Haritalar / İletişim', title: '03. E-Posta & İletişim Tarama', taskbarTitle: 'B2B Haritalar \\ E-Posta Tarama' },
    ct_logs: { id: 'viewCtLogs', breadcrumb: 'B2B Haritalar / CT Günlükleri', title: '04. Sertifika Günlükleri (CT Logs)', taskbarTitle: 'B2B Haritalar \\ CT Günlükleri' },
    database: { id: 'viewDatabase', breadcrumb: 'B2B Haritalar / Veri Havuzu', title: '05. Bölgesel Veri Havuzu & H3', taskbarTitle: 'B2B Haritalar \\ Veri Havuzu' },
    desktop: { id: 'viewDesktop', breadcrumb: 'B2B Haritalar / Masaüstü', title: '06. Masaüstü Hızlandırıcı & Çevrimdışı Paket', taskbarTitle: 'B2B Haritalar \\ Masaüstü Turbo' }
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
    if ($('taskbarTabTitle')) {
      $('taskbarTabTitle').textContent = ws.taskbarTitle || ws.title;
    }
    revealWorkspaceCards($(ws.id));

    if (key === 'database') {
      renderDatabaseStats();
      loadDuckDbAnalytics();
    }

    if (key === 'export') {
      const f = currentFilters();
      const cityLabel = f.cityDisplay || f.city;
      if ($('exportSectorInput')) $('exportSectorInput').value = f.sector;
      if ($('exportCountrySelect')) {
        $('exportCountrySelect').value = f.country;
        populateCitiesForCountry(f.country, $('exportCitySelect'), $('exportCityCustomInput'), false, true);
      }
      if ($('exportCitySelect')) {
        const targetVal = (f.city === '__all__' || f.city === '__all_country__') ? '__all__' : f.city;
        if (Array.from($('exportCitySelect').options).some(o => o.value === targetVal)) {
          $('exportCitySelect').value = targetVal;
          if ($('exportCityCustomInput')) $('exportCityCustomInput').hidden = true;
        } else if (f.country !== 'Türkiye' && $('exportCityCustomInput')) {
          $('exportCitySelect').value = '__custom__';
          $('exportCityCustomInput').hidden = false;
          $('exportCityCustomInput').value = f.city;
        }
      }
      const count = activeRecords.length || (turboPageData && turboPageData.total) || 0;
      const statusTitle = $('exportStatusTitle');
      const statusDesc = $('exportStatusDesc');
      if (statusTitle && statusDesc) {
        if (count > 0) {
          statusTitle.textContent = `✓ ${cityLabel} (${f.country}) · ${f.sector || 'Tüm Sektörler'}: ${fmt(count)} Firma İhracata Hazır`;
          statusDesc.textContent = 'Aşağıdaki butonları kullanarak listeyi hemen tek sayfa Excel (.xlsx) veya CSV formatında indirebilirsiniz.';
        } else {
          statusTitle.textContent = `Doğrudan İhracat Hazır (${cityLabel} · ${f.sector || 'Tüm Sektörler'})`;
          statusDesc.textContent = 'Yukarıdan ülke, şehir (veya Tüm Şehirler) ve sektör seçip "Seçili Listeyi Excel (.xlsx) İndir" butonuna bastığınızda veriler otomatik taranıp indirilir.';
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
    // Sort provinces so high-volume CDN shard provinces appear at top, followed alphabetically by all 81 provinces
    const orderedProvinces = [...TR_PROVINCES].sort((a, b) => {
      const sa = shards[slugify(a)];
      const sb = shards[slugify(b)];
      const ca = sa ? (sa.count || sa.total || 0) : 0;
      const cb = sb ? (sb.count || sb.total || 0) : 0;
      if (cb !== ca) return cb - ca;
      return a.localeCompare(b, 'tr');
    });

    for (const prov of orderedProvinces) {
      const shardInfo = shards[slugify(prov)];
      const count = shardInfo ? (shardInfo.total || shardInfo.count || 0) : 0;
      const card = el('div', null, 'db-stat-card');
      const title = el('span', prov, 'db-stat-city');
      const sub = el('span', count ? `${fmt(count)} firma` : 'Canlı Keşif Hazır', 'db-stat-count');
      card.append(title, sub);

      card.addEventListener('click', () => {
        $('countrySelect').value = 'Türkiye';
        $('citySelect').hidden = false;
        $('cityCustomInput').hidden = true;
        $('citySelect').value = prov;
        populateDistricts(prov);
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
    let anyProviderOk = false;
    let sourceLabel = '';
    let lastErrMsg = '';
    try {
      let handled = false;
      if (turboConnected || cloudApiConnected) {
        try {
          const ctUrl = turboConnected
            ? `${LOCAL_API}/api/ct_logs?query=${encodeURIComponent(q)}&limit=${limit}`
            : `/api/cloud/ct_logs?query=${encodeURIComponent(q)}&limit=${limit}`;
          const res = await fetch(ctUrl, {
            headers: (turboConnected && turboToken) ? { 'X-Local-Token': turboToken } : {}
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            anyProviderOk = true;
            records = data.records || data.domains || [];
            sourceLabel = data.source_engine || 'ct-api';
            handled = true;
          } else {
            lastErrMsg = data.error || `CT HTTP ${res.status}`;
          }
        } catch (e) {
          lastErrMsg = e.message || 'CT bağlantı hatası';
        }
      }

      if (!handled) {
        const cleanRoot = fold(q).replace(/[^a-z0-9.-]/g, '');
        const safeQ = q.includes('.') ? cleanRoot : `%${cleanRoot}%.com.tr`;
        const seen = new Set();
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        try {
          const res = await fetch(`https://crt.sh/?q=${encodeURIComponent(safeQ)}&output=json`, { signal: ctrl.signal });
          if (res.ok) {
            anyProviderOk = true;
            sourceLabel = 'crt.sh';
            const raw = await res.json();
            for (const item of (Array.isArray(raw) ? raw : [])) {
              const cands = String(item.name_value || item.common_name || '').split('\n');
              for (let domain of cands) {
                domain = domain.toLowerCase().trim().replace(/^\*\./, '');
                if (!domain || !domain.includes('.') || domain.includes(' ') || seen.has(domain)) continue;
                seen.add(domain);
                records.push({
                  domain,
                  issuer: item.issuer_name || 'Let\'s Encrypt',
                  logged_at: item.entry_timestamp || item.not_before || ''
                });
                if (records.length >= limit) break;
              }
              if (records.length >= limit) break;
            }
          } else {
            lastErrMsg = `crt.sh HTTP ${res.status}`;
          }
        } catch (e) {
          lastErrMsg = e && e.name === 'AbortError' ? 'crt.sh zaman aşımı' : 'crt.sh erişim hatası';
        } finally {
          clearTimeout(t);
        }

        if (!records.length && cleanRoot) {
          const csTargets = q.includes('.') ? [cleanRoot] : [`${cleanRoot}.com.tr`, `${cleanRoot}.com`];
          for (const domTarget of csTargets) {
            try {
              const r = await fetch(`https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domTarget)}&include_subdomains=true&expand=dns_names,issuer`);
              if (!r.ok) {
                lastErrMsg = `CertSpotter HTTP ${r.status}`;
                continue;
              }
              anyProviderOk = true;
              sourceLabel = 'CertSpotter';
              const arr = await r.json();
              if (!Array.isArray(arr)) continue;
              for (const item of arr) {
                const issuerName = (item.issuer && item.issuer.name) || 'CA';
                const nb = item.not_before || '';
                for (let dom of (item.dns_names || [])) {
                  dom = String(dom || '').toLowerCase().trim().replace(/^\*\./, '');
                  if (!dom || !dom.includes('.') || dom.startsWith('www.') || seen.has(dom)) continue;
                  seen.add(dom);
                  records.push({ domain: dom, issuer: issuerName, logged_at: nb });
                  if (records.length >= limit) break;
                }
                if (records.length >= limit) break;
              }
            } catch (e) {
              lastErrMsg = e.message || 'CertSpotter bağlantı hatası';
            }
            if (records.length >= limit) break;
          }
        }
      }
    } catch (err) {
      lastErrMsg = err.message || String(err);
      console.warn('CT logs error:', err);
    } finally {
      ctQueryInFlight = false;
      btn.disabled = false;
      btn.textContent = 'Yeni Sertifikaları Sorgula';
    }

    tbody.replaceChildren();
    if (!records.length) {
      const emptyRow = el('tr');
      const msg = anyProviderOk
        ? `Bu sorgu için sertifika günlüğü kaydı bulunamadı (Kaynak: ${sourceLabel || 'CT Günlüğü'}).`
        : `⚠ Sertifika şeffaflık sunucularına ulaşılamadı (${lastErrMsg || 'crt.sh / CertSpotter yanıt vermedi'}). Bağlantı hatası "0 kayıt" olarak sayılmadı.`;
      const emptyTd = el('td', msg, 'empty-state');
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

    firm = firm || {};
    f = f || {};

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
    if ($('partyVknInput')) $('partyVknInput').value = firm.vkn || '';
    if ($('partyWebhookUrlInput')) {
      try {
        $('partyWebhookUrlInput').value = localStorage.getItem('erp_webhook_url') || '';
      } catch {}
    }

    dialog.showModal();
  }

  // Official Turkish Revenue Administration (GİB) 10-Digit VKN Modulo-10 Checksum
  function validateGibVknClient(raw) {
    const d = String(raw || '').replace(/\D+/g, '');
    if (d.length !== 10 || new Set(d).size === 1) return false;
    let total = 0;
    for (let i = 0; i < 9; i++) {
      const digit = Number(d[i]);
      const v = (digit + (9 - i)) % 10;
      if (v === 0) continue;
      let p = (v * Math.pow(2, 9 - i)) % 9;
      if (p === 0) p = 9;
      total += p;
    }
    const check = (10 - (total % 10)) % 10;
    return check === Number(d[9]);
  }

  function getPartyFormData() {
    const vknRaw = $('partyVknInput') ? $('partyVknInput').value.trim() : '';
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
      vkn: vknRaw,
      vkn_verified: vknRaw.length === 10 ? validateGibVknClient(vknRaw) : null,
      source: 'haritalar_lead_intelligence_v7',
      created_at: new Date().toISOString()
    };
  }

  function handleExportPartyVcard() {
    const p = getPartyFormData();
    const safeVcf = s => String(s || '').replace(/[\r\n;]+/g, ' ').trim();
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${safeVcf(p.name)}`,
      `ORG:${safeVcf(p.name)}`,
      p.phone ? `TEL;TYPE=WORK,VOICE:${safeVcf(p.phone)}` : '',
      p.email ? `EMAIL;TYPE=PREF,INTERNET:${safeVcf(p.email)}` : '',
      `ADR;TYPE=WORK:;;${safeVcf(p.address)};${safeVcf(p.district)};${safeVcf(p.city)};;`,
      `NOTE:${safeVcf('Cari: ' + p.code + ' | NACE: ' + p.nace + (p.vkn ? ' | VKN: ' + p.vkn : ''))}`,
      'END:VCARD'
    ].filter(Boolean);
    const blob = new Blob([lines.join('\r\n')], { type: 'text/vcard;charset=utf-8' });
    triggerDownload(blob, `${slugify(p.name || p.code || 'firma')}.vcf`);
  }

  async function handleSendPartyWebhook() {
    const party = getPartyFormData();
    const urlInput = $('partyWebhookUrlInput');
    const webhookUrl = urlInput ? urlInput.value.trim() : '';
    if (!webhookUrl || !/^https?:\/\//i.test(webhookUrl)) {
      alert('Lütfen geçerli bir ERP / CRM Webhook URL adresi girin (https://…).');
      return;
    }
    if (party.vkn && party.vkn.replace(/\D+/g, '').length === 10 && !party.vkn_verified) {
      alert('Girilen 10 haneli VKN, GİB Modulo-10 doğrulamasından geçemedi. Lütfen kontrol edin.');
      return;
    }
    try {
      localStorage.setItem('erp_webhook_url', webhookUrl);
    } catch {}

    const btn = $('partyWebhookBtn');
    const notice = $('partySuccessNotice');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Gönderiliyor…';
    }
    try {
      if (turboConnected) {
        const res = await turboApi('erp/webhook', { webhook_url: webhookUrl, payload: party }, 12000);
        if (!res.ok) throw new Error(res.error || `HTTP ${res.status_code || 'Hata'}`);
      } else if (cloudApiConnected) {
        const cr = await fetch('/api/cloud/erp_webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ webhook_url: webhookUrl, payload: party })
        });
        const cj = await cr.json().catch(() => ({}));
        if (!cr.ok || !cj.ok) throw new Error(cj.error || `HTTP ${cj.status_code || cr.status}`);
      } else {
        const r = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(party)
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      }
      if (notice) {
        notice.textContent = `✓ Cari kart (${party.code}) canlı ERP Webhook adresine başarıyla iletildi!`;
        notice.style.display = 'block';
      }
    } catch (err) {
      alert('ERP Webhook gönderim hatası: ' + (err.message || err));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🔗 ERP Webhook Gönder';
      }
    }
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
    const partyWebhook = $('partyWebhookBtn');
    if (partyWebhook) partyWebhook.addEventListener('click', handleSendPartyWebhook);
    const partyVcard = $('partyVcardBtn');
    if (partyVcard) partyVcard.addEventListener('click', handleExportPartyVcard);

    const toggleMapBtn = $('toggleSearchMapBtn');
    if (toggleMapBtn) toggleMapBtn.addEventListener('click', toggleSearchMap);

    // Enterprise Suite Navigation & Controls
    const taskbarHome = $('taskbarHomeBtn');
    if (taskbarHome) taskbarHome.addEventListener('click', goHome);

    const netsisSearch = $('netsisGlobalSearchInput');
    if (netsisSearch) {
      netsisSearch.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const q = netsisSearch.value.trim();
          if (q && $('sectorInput')) {
            $('sectorInput').value = q;
          }
          openWorkspace('search');
          handleSearch();
        }
      });
    }

    const quickLauncher = $('tileQuickPartyLauncher');
    if (quickLauncher) {
      quickLauncher.addEventListener('click', () => {
        openQuickPartyModal(null, currentFilters());
      });
    }

    const ribbonQP = $('ribbonQuickParty');
    if (ribbonQP) {
      ribbonQP.addEventListener('click', () => {
        openQuickPartyModal(null, currentFilters());
      });
    }

    const tileMap = $('tileMapLauncher');
    if (tileMap) {
      tileMap.addEventListener('click', () => {
        openWorkspace('search');
        if (typeof toggleSearchMap === 'function') {
          toggleSearchMap();
        }
      });
    }

    const tileNace = $('tileNaceLauncher');
    if (tileNace) {
      tileNace.addEventListener('click', () => {
        openWorkspace('search');
        if ($('sectorInput')) $('sectorInput').value = '';
        if ($('naceInput')) {
          $('naceInput').focus();
          $('naceInput').select();
        }
      });
    }

    const naceInputEl = $('naceInput');
    if (naceInputEl) {
      naceInputEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          currentOffset = 0;
          executeSearch(true);
        }
      });
    }

    const addShortcut = $('btnAddShortcut');
    if (addShortcut) {
      addShortcut.addEventListener('click', () => {
        openWorkspace('search');
      });
    }

    function updateTaskbarClock() {
      const el = $('taskbarClock');
      if (!el) return;
      const now = new Date();
      el.textContent = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
    updateTaskbarClock();
    setInterval(updateTaskbarClock, 15000);

    // Export Country/City Sync
    if ($('exportCountrySelect')) {
      $('exportCountrySelect').addEventListener('change', () => {
        populateCitiesForCountry($('exportCountrySelect').value, $('exportCitySelect'), $('exportCityCustomInput'), true);
      });
    }
    if ($('exportCitySelect')) {
      $('exportCitySelect').addEventListener('change', () => {
        if ($('exportCityCustomInput')) {
          $('exportCityCustomInput').hidden = ($('exportCitySelect').value !== '__custom__');
        }
      });
    }

    // Enrich Workspace
    const enrichStart = $('enrichStartBtn');
    if (enrichStart) enrichStart.addEventListener('click', handleEnrich);
    const enrichPause = $('enrichPauseBtn');
    if (enrichPause) enrichPause.addEventListener('click', handleTogglePause);
    $('countrySelect').addEventListener('change', () => {
      const countryVal = $('countrySelect').value || 'Türkiye';
      populateCitiesForCountry(countryVal, $('citySelect'), $('cityCustomInput'), true, true);
      const activeCity = resolveSelectedCity(countryVal, $('citySelect'), $('cityCustomInput'));
      populateDistricts(countryVal === 'Türkiye' && activeCity !== '__all__' ? activeCity : '');
      currentOffset = 0;
      hasStartedSearch = false;
      resetResultsView();
    });

    $('citySelect').addEventListener('change', () => {
      const countryVal = $('countrySelect').value || 'Türkiye';
      const isCustom = $('citySelect').value === '__custom__';
      if ($('cityCustomInput')) {
        $('cityCustomInput').hidden = !isCustom;
        if (isCustom) $('cityCustomInput').focus();
      }
      const activeCity = resolveSelectedCity(countryVal, $('citySelect'), $('cityCustomInput'));
      populateDistricts(countryVal === 'Türkiye' && activeCity !== '__all__' ? activeCity : '');
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

    document.querySelectorAll('.summary-metrics [data-contact-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetMode = btn.getAttribute('data-contact-filter') || 'all';
        const sel = $('contactModeSelect');
        if (!sel) return;
        sel.value = (sel.value === targetMode && targetMode !== 'all') ? 'all' : targetMode;
        currentOffset = 0;
        if (hasStartedSearch) executeSearch(false);
      });
    });

    let sectorDebounce = null;
    $('sectorInput').addEventListener('input', () => {
      if (!hasStartedSearch) return;
      const f = currentFilters();
      const isCachedLocalShard = f.country === 'Türkiye' && !turboConnected && f.city !== '__all__' && shardCache.has(slugify(f.city));
      if (!isCachedLocalShard) return;
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

    const splinkBtn = $('splinkDedupBtn');
    if (splinkBtn) splinkBtn.addEventListener('click', handleSplinkDedup);
    const rfBtn = $('rapidFuzzBtn');
    if (rfBtn) rfBtn.addEventListener('click', handleRapidFuzzRank);
    const singleCrawlBtn = $('singleCrawlBtn');
    if (singleCrawlBtn) singleCrawlBtn.addEventListener('click', handleSingleCrawl);
    const singleCrawlInput = $('singleCrawlUrlInput');
    if (singleCrawlInput) {
      singleCrawlInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleSingleCrawl();
      });
    }
    const h3Btn = $('h3ScanBtn');
    if (h3Btn) h3Btn.addEventListener('click', handleH3ClusterScan);
    const refDuckDb = $('refreshDuckDbBtn');
    if (refDuckDb) refDuckDb.addEventListener('click', () => loadDuckDbAnalytics(true));
    const testOverture = $('testOvertureBtn');
    if (testOverture) testOverture.addEventListener('click', handleOvertureTestSync);
    const retryBridge = $('retryLocalBridgeBtn');
    if (retryBridge) {
      retryBridge.addEventListener('click', async () => {
        retryBridge.disabled = true;
        retryBridge.textContent = '🔌 Bağlanıyor…';
        try {
          const ok = await probeTurboBridge(true);
          if (ok) {
            setStatus('Yerel 9/9 Pro Motor (127.0.0.1:8765) köprüsü başarıyla bağlandı!', 'Turbo Aktif', false, null);
          } else {
            setStatus('127.0.0.1:8765 yerel servisine ulaşılamadı. Servisi başlattığınızdan ve tarayıcı adres çubuğunda Yerel Ağ Erişimi izni verdiğinizden emin olun veya "127.0.0.1:8765 Doğrudan Aç" butonunu kullanın.', 'Bağlantı Yok', true, null);
          }
        } finally {
          retryBridge.disabled = false;
          retryBridge.textContent = '🔌 Yerel Motoru Tekrar Bağla';
        }
      });
    }

    $('prevPageBtn').addEventListener('click', () => {
      currentOffset = Math.max(0, currentOffset - PAGE_SIZE);
      executeSearch(false);
    });

    $('nextPageBtn').addEventListener('click', () => {
      currentOffset += PAGE_SIZE;
      executeSearch(false);
    });
  }

  // Bootstrap Application (Synchronous UI init first so controls are never blank or unresponsive)
  async function boot() {
    initMotion();
    populateCities();
    if ($('citySelect') && !$('citySelect').value) {
      $('citySelect').value = '__all__';
    }
    if ($('exportCitySelect') && !$('exportCitySelect').value) {
      $('exportCitySelect').value = '__all__';
    }
    const initialCity = $('citySelect') ? $('citySelect').value : '__all__';
    populateDistricts(initialCity !== '__all__' ? initialCity : '');
    bindEvents();
    resetResultsView();

    try {
      const res = await fetch('/data/manifest.json?v=7.4.0', { cache: 'no-cache' });
      if (res.ok) {
        manifest = await res.json();
        const curCity = $('citySelect') ? $('citySelect').value : '__all__';
        populateDistricts(curCity !== '__all__' ? curCity : '');
      }
    } catch {
      // Fallback defaults remain active
    }

    await probeTurboBridge();
  }

  // Global Bridge
  window.openWorkspace = openWorkspace;
  window.openQuickPartyModal = openQuickPartyModal;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
