'use strict';
const $ = id => document.getElementById(id);
const fmt = n => Number(n || 0).toLocaleString('tr-TR');
let token = '', offset = 0, listingTotal = 0, rowsCache = [], refreshing = false;
const states = {
  queued: 'Bekliyor',
  running: 'Çalışıyor',
  done: 'Tamamlandı',
  empty: 'E-posta yok',
  partial: 'Kısmi sonuç',
  failed: 'Başarısız'
};

function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

function info(text, error = false) {
  $('notice').textContent = text;
  $('notice').className = error ? 'error' : '';
}

async function api(path, data) {
  const res = await fetch('/api/' + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      'X-Local-Token': token,
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) })
  });
  const obj = await res.json();
  if (!res.ok) throw Error(obj.error || 'İşlem başarısız');
  return obj;
}

function bind(id, fn) {
  const node = $(id);
  if (!node) return;
  node.addEventListener('click', async () => {
    try { await fn(); } catch (e) { info(e.message, true); }
  });
}

function action(text, fn) {
  const b = el('button', text);
  b.addEventListener('click', async () => {
    try { await fn(); } catch (e) { info(e.message, true); }
  });
  return b;
}

function link(url, text) {
  const a = el('a', text);
  try {
    const u = new URL(url);
    if (['http:', 'https:'].includes(u.protocol)) {
      a.href = u.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
  } catch {}
  return a;
}

function mapsURL(query) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
}

function searchText() {
  const s = $('sector').value.trim(), r = $('region').value.trim();
  if (!s || !r) throw Error('Sektör ve bölge doldurulmalı');
  return [s, r];
}

// Apple Motion Architecture: Scroll-Triggered Staggered Fade-Up (80ms domino intervals)
(function initRevealMotion() {
  const items = Array.from(document.querySelectorAll('.reveal'));
  if (!('IntersectionObserver' in window)) {
    items.forEach(node => node.classList.add('is-visible'));
    return;
  }
  let batchQueue = [];
  let flushTimer = null;
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        batchQueue.push(entry.target);
        io.unobserve(entry.target);
      }
    }
    if (batchQueue.length && !flushTimer) {
      flushTimer = requestAnimationFrame(() => {
        batchQueue.forEach((node, idx) => {
          node.style.setProperty('--stagger', `${idx * 80}ms`);
          node.classList.add('is-visible');
        });
        batchQueue = [];
        flushTimer = null;
      });
    }
  }, { threshold: 0.08 });
  items.forEach(node => io.observe(node));
})();

bind('maps', () => {
  const [s, r] = searchText();
  window.open(mapsURL(s + ' ' + r), '_blank', 'noopener,noreferrer');
});

bind('variants', () => {
  const [s, r] = searchText(), box = $('queries');
  box.replaceChildren();
  for (const q of [s + ' ' + r, s + ' firmaları ' + r, s + ' üreticileri ' + r, s + ' sanayi ' + r, s + ' toptan ' + r]) {
    box.append(link(mapsURL(q), q + ' ↗'));
  }
});

bind('discover', async () => {
  if (!$('dirPermit').checked) throw Error('Kaynak iznini onaylayın');
  const url = $('directory').value.trim();
  if (!url) throw Error('Rehber URL girin');
  const btn = $('discover');
  btn.disabled = true;
  info('İzinli rehber araştırılıyor...');
  try {
    const arr = await api('discover', { url, authorized: true }), box = $('candidates');
    box.replaceChildren();
    if (!arr.length) {
      box.append(el('p', 'Harici bağlantı bulunamadı.'));
      info('Sıfır aday; başka izinli kaynak deneyin.');
      return;
    }
    const holders = [];
    for (const item of arr) {
      const c = el('div', undefined, 'candidate'), cb = el('input');
      cb.type = 'checkbox';
      const t = el('div');
      t.append(link(item.url, item.label || item.url), el('small', item.url));
      c.append(cb, t);
      box.append(c);
      holders.push([cb, item]);
    }
    box.prepend(action('Tüm adayları seç', () => holders.forEach(([cb]) => { cb.checked = true; })));
    box.append(action('Seçilenleri kuyruğa ekle', async () => {
      const [s, r] = searchText();
      const selected = holders.filter(([cb]) => cb.checked).map(([, i]) => ({ url: i.url, sector: s, region: r, origin: i.source }));
      if (!selected.length) throw Error('Aday seçin');
      if (!confirm('Seçilen sitelerin kendi tarama koşullarını kontrol ettiniz mi?')) return;
      await add(selected, true);
    }));
    info(arr.length + ' bağlantı adayı bulundu. İşletme oldukları doğrulanmış değildir.');
  } finally {
    btn.disabled = false;
  }
});

function csvParse(text) {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const sep = first.includes(';') ? ';' : ',';
  let records = [], row = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += c;
      continue;
    }
    if (c === '"' && field === '' && !closed) { quoted = true; continue; }
    if (c === sep || c === '\n' || c === '\r') {
      row.push(field); field = ''; closed = false;
      if (c !== sep) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        if (row.some(x => x.trim())) records.push(row);
        row = [];
      }
      continue;
    }
    if (closed) throw Error('CSV tırnak biçimi hatalı');
    field += c;
  }
  if (quoted) throw Error('CSV tırnağı kapatılmamış');
  row.push(field);
  if (row.some(x => x.trim())) records.push(row);
  if (!records.length) return [];
  const head = records.shift().map(x => x.trim().toLowerCase());
  if (!head.includes('url')) throw Error('CSV url sütunu zorunlu');
  return records.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] || ''])));
}

async function add(rows, authorized) {
  if (!rows.length) throw Error('Web sitesi ekleyin');
  if (rows.length > 50000) throw Error('50.000 satır sınırı');
  const res = await api('add', { rows, authorized });
  const out = $('importResult');
  out.hidden = false;
  out.textContent = `Eklenen: ${res.accepted} | Tekrar: ${res.duplicates} | Reddedilen: ${res.rejected.length}\n` +
    res.rejected.slice(0, 50).map(x => `Satır ${x.row}: ${x.reason}`).join('\n');
  info(`${res.accepted} görev eklendi, ${res.duplicates} tekrar, ${res.rejected.length} hatalı giriş.`);
  offset = 0;
  await refresh();
}

bind('add', async () => {
  if (!$('permit').checked) throw Error('Kaynak kullanım izni gerekli');
  const [s, r] = searchText(), origin = $('origin').value.trim(), file = $('csv').files[0];
  let records = $('urls').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean).map(url => ({ url, sector: s, region: r, origin }));
  if (file) {
    if (file.size > 7500000) throw Error('CSV çok büyük; bölerek yükleyin');
    records = records.concat(csvParse(await file.text()).map(x => ({
      url: x.url,
      sector: x.sector || s,
      region: x.region || r,
      origin: x.origin || origin
    })));
  }
  await add(records, true);
});

async function showDetails(j) {
  $('detailTitle').textContent = j.title || j.domain;
  $('detailMeta').textContent = `${j.sector} · ${j.region} · ${j.pages} sayfa · ${j.error || 'Tarama kaydı'}`;
  const box = $('detailRows');
  const pbox = $('detailPhones');
  box.replaceChildren();
  if (pbox) pbox.replaceChildren();
  const [arr, phRes] = await Promise.all([
    api('contacts?id=' + j.id),
    api('phones?id=' + j.id).catch(() => ({ phones: [] }))
  ]);
  if (!arr.length) box.append(el('p', 'Kayıtlı, ret listesi dışında e-posta adresi bulunamadı.'));
  for (const c of arr) {
    const card = el('div', undefined, 'contact');
    card.append(
      el('b', c.email),
      el('small', `MX: ${c.mx} · ${c.same_domain ? 'Aynı web alanı' : 'Farklı web alanı; inceleyin'} · ${c.seen}`),
      link(c.source, 'Kaynak sayfayı aç ↗'),
      el('br'),
      action('Ret listesine ekle', async () => {
        if (!confirm('Bu e-posta tüm dışa aktarımlardan çıkarılsın mı?')) return;
        await api('suppress', { email: c.email });
        await showDetails(j);
        await refresh();
      })
    );
    box.append(card);
  }
  if (pbox && phRes.phones && phRes.phones.length) {
    const pcard = el('div', undefined, 'contact');
    pcard.append(el('b', 'Bulunan Kurumsal Telefonlar (' + phRes.phones.length + ')'), el('small', phRes.phones.join(' · ')));
    pbox.append(pcard);
  }
  if (!$('detail').open) $('detail').showModal();
}

function render(list) {
  rowsCache = list.rows;
  listingTotal = list.total;
  const body = $('rows');
  body.replaceChildren();
  if (!list.rows.length) {
    const tr = el('tr'), td = el('td', 'Henüz bu filtreye uygun gerçek kayıt yok.', 'empty');
    td.colSpan = 5;
    tr.append(td);
    body.append(tr);
  }
  for (const j of list.rows) {
    const tr = el('tr'), company = el('td'), segment = el('td'), status = el('td'), contact = el('td'), ops = el('td');
    company.append(link(j.url, j.title || j.domain), el('small', j.domain));
    segment.append(el('b', j.sector), el('small', j.region));
    status.append(el('span', states[j.status] || j.status, 'tag ' + j.status));
    if (j.error) status.append(el('small', j.error));
    contact.append(el('b', fmt(j.emails) + ' e-posta'));
    if (j.phones) contact.append(el('small', fmt(j.phones) + ' tel'));
    ops.append(action('İncele', () => showDetails(j)));
    if (['done', 'partial', 'failed', 'empty'].includes(j.status)) {
      ops.append(action('Tekrar', async () => { await api('retry', { id: j.id }); await refresh(); }));
    }
    if (j.status !== 'running') {
      ops.append(action('Sil', async () => {
        if (confirm('Görev ve ilişkili iletişim kayıtları silinsin mi?')) {
          await api('delete', { id: j.id });
          await refresh();
        }
      }));
    }
    tr.append(company, segment, status, contact, ops);
    body.append(tr);
  }
  $('pageInfo').textContent = `${list.total ? offset + 1 : 0}–${Math.min(offset + 100, list.total)} / ${fmt(list.total)}`;
  $('prev').disabled = offset === 0;
  $('next').disabled = offset + 100 >= list.total;
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const q = new URLSearchParams({ q: $('filter').value, status: $('statusFilter').value, offset: String(offset) });
    const [s, list] = await Promise.all([api('status'), api('jobs?' + q)]);
    const c = s.counts;
    $('total').textContent = fmt(Object.values(c).reduce((a, b) => a + b, 0));
    $('done').textContent = fmt(c.done || 0);
    $('emails').textContent = fmt(s.contacts);
    $('strong').textContent = fmt(s.strong);
    if ($('phonesMetric')) {
      $('phonesMetric').textContent = s.phones ? `${fmt(s.phones)} doğrulanmış telefon` : 'Firma / sektör / bölge';
    }
    $('state').textContent = s.paused ? 'Kuyruk duraklatıldı' : 'Yerel motor açık';
    $('queueInfo').textContent = Object.entries(states).map(([k, v]) => v + ': ' + fmt(c[k] || 0)).join(' · ');
    render(list);
  } finally {
    refreshing = false;
  }
}

let timer;
$('filter').addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => { offset = 0; refresh().catch(e => info(e.message, true)); }, 180);
});
$('statusFilter').addEventListener('change', () => {
  offset = 0;
  refresh().catch(e => info(e.message, true));
});
bind('prev', async () => { offset = Math.max(0, offset - 100); await refresh(); });
bind('next', async () => { offset += 100; await refresh(); });
bind('closeDetail', () => $('detail').close());
bind('pause', async () => {
  await api('pause', { paused: true });
  info('Yeni görev başlatılmayacak; çalışanlar tamamlanır.');
  await refresh();
});
bind('resume', async () => { await api('pause', { paused: false }); await refresh(); });
bind('retryFailed', async () => {
  const r = await api('retry-failed', {});
  info(`${fmt(r.updated)} başarısız görev yeniden kuyruğa alındı.`);
  await refresh();
});
bind('backup', async () => { const r = await api('backup', {}); info('Yedek: ' + r.file); });
bind('suppress', async () => {
  const email = $('suppression').value;
  if (!email) throw Error('E-posta girin');
  await api('suppress', { email });
  $('suppression').value = '';
  info('Ret listesine eklendi.');
  await refresh();
});
bind('export', async () => {
  const r = await fetch('/api/export', { headers: { 'X-Local-Token': token } });
  if (!r.ok) throw Error('Dışa aktarım başarısız');
  const url = URL.createObjectURL(await r.blob());
  const a = el('a');
  a.href = url;
  a.download = 'lead-contacts.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

(async () => {
  try {
    const r = await api('session');
    token = r.token;
    await refresh();
    setInterval(() => refresh().catch(e => info(e.message, true)), 2000);
  } catch (e) {
    info('Yerel motor bağlantısı: ' + e.message, true);
  }
})();

// V3 Industrial Geospatial Catalog
let geoOffset = 0, geoTotal = 0, geoBusy = false, geoLast = null;

function geoInput() {
  const region = $('geoRegion').value.trim();
  const sector = $('geoSector').value.trim();
  const minimum = Number($('geoMinimum').value);
  const district = $('geoDistrict') ? $('geoDistrict').value.trim() : '';
  const contact_mode = $('geoContactMode') ? $('geoContactMode').value : 'all';
  if (!region || !sector) throw Error('Sektör ve bölge girin');
  return { region, sector, minimum, district, contact_mode };
}

function geoPermit() {
  if (!$('geoPermit').checked) throw Error('Kaynak ve site kullanım koşullarını onaylayın');
}

function geoNote(t) { $('geoInfo').textContent = t; }

async function geoLoad(reset = false) {
  if (reset) geoOffset = 0;
  const f = geoInput();
  geoLast = f;
  const data = await api('places?' + new URLSearchParams({ ...f, offset: geoOffset }));
  geoTotal = data.total;
  $('geoTotal').textContent = fmt(data.total);
  $('geoSites').textContent = fmt(data.websites);
  $('geoCoverage').textContent = data.total ? (100 * data.websites / data.total).toFixed(1) + '%' : '—';
  $('geoPage').textContent = data.total ? `${geoOffset + 1}–${Math.min(geoOffset + 100, data.total)} / ${fmt(data.total)}` : '0 kayıt';
  $('geoPrev').disabled = geoOffset === 0;
  $('geoNext').disabled = geoOffset + 100 >= data.total;
  const tbody = $('geoRows');
  tbody.replaceChildren();
  for (const p of data.rows) {
    const tr = el('tr'), name = el('td'), cat = el('td'), cf = el('td'), site = el('td'), status = el('td');
    const distPrefix = p.district ? `[${p.district}] ` : '';
    name.append(el('b', p.name), el('small', distPrefix + (p.address || p.region)));
    cat.append(el('b', (p.category || 'Bilinmiyor').replace(/_/g, ' ')), el('small', p.source || ''));
    cf.textContent = p.confidence == null ? '—' : (100 * p.confidence).toFixed(0) + '%';
    if (p.website) site.append(link(p.website, p.website));
    else site.textContent = 'Site yok';
    try {
      const phs = JSON.parse(p.meta_phones || '[]');
      if (phs.length) site.append(el('small', 'Tel: ' + phs.slice(0, 2).join(', ')));
    } catch {}
    status.append(
      el('small', p.tasks ? `${p.tasks} görev bağlantısı` : 'Kuyruğa eklenmedi'),
      link(mapsURL(p.name + ' ' + p.address + ' ' + p.lat + ',' + p.lon), 'Maps üzerinde incele')
    );
    tr.append(name, cat, cf, site, status);
    tbody.append(tr);
  }
  if (!data.rows.length) {
    const tr = el('tr'), td = el('td', 'Kayıt yok. Bölgedeki işletmeleri indirin veya farklı sektör seçin.', 'empty');
    td.colSpan = 5;
    tr.append(td);
    tbody.append(tr);
  }
  geoNote('FTS5 Eşleşme terimleri (' + data.terms.length + '): ' + data.terms.slice(0, 18).join(' · ') + (data.terms.length > 18 ? ' …' : ''));
}

async function geoWork(fn) {
  if (geoBusy) throw Error('Keşif işlemi zaten çalışıyor');
  geoBusy = true;
  for (const id of ['geoDownload', 'geoImport', 'geoQueue', 'geoSearch']) $(id).disabled = true;
  try { await fn(); }
  finally {
    geoBusy = false;
    for (const id of ['geoDownload', 'geoImport', 'geoQueue', 'geoSearch']) $(id).disabled = false;
  }
}

bind('geoSearch', () => geoWork(() => geoLoad(true)));
bind('geoPrev', () => geoWork(async () => { geoOffset = Math.max(0, geoOffset - 100); await geoLoad(); }));
bind('geoNext', () => geoWork(async () => { geoOffset += 100; await geoLoad(); }));

bind('geoDownload', () => geoWork(async () => {
  geoPermit();
  const f = geoInput();
  const sourceMode = $('geoSource') ? $('geoSource').value : 'hybrid';
  geoNote('PyArrow S3 GeoParquet + OpenStreetMap paralel keşif motoru çalışıyor (yaklaşık 12–25 sn)...');
  try {
    const r = await api('places/download', { ...f, box: $('geoBox').value, source_mode: sourceMode, authorized: true });
    await geoLoad(true);
    const osmExtra = r.osm_added ? ` | OSM Eklenen: ${fmt(r.osm_added)}, Birleştirilen: ${fmt(r.osm_merged || 0)}` : '';
    info(`Bölge Tarandı: ${fmt(r.read)} ham kayıt | Geçerli İşletme: ${fmt(r.unique)} | Web Siteli: ${fmt(r.websites)}${osmExtra}`);
  } catch (e) {
    geoNote('İndirme tamamlanmadı. ' + e.message);
    throw e;
  }
}));

bind('geoImport', () => geoWork(async () => {
  geoPermit();
  const f = geoInput(), file = $('geoFile').files[0];
  if (!file || file.size > 120 * 1024 * 1024) throw Error('En fazla 120 MB GeoJSON seçin');
  geoNote('GeoJSON doğrulanıyor ve FTS5 indeksine aktarılıyor...');
  const data = JSON.parse(await file.text());
  const r = await api('places/import', { ...f, data, authorized: true });
  await geoLoad(true);
  info(`${fmt(r.unique)} benzersiz kayıt aktarıldı; ${fmt(r.skipped)} atlandı.`);
}));

bind('geoQueue', () => geoWork(async () => {
  geoPermit();
  const f = geoInput();
  if (!geoLast || JSON.stringify(geoLast) !== JSON.stringify(f)) await geoLoad(true);
  const r = await api('places/queue', { ...f, limit: Number($('geoLimit').value), authorized: true });
  await geoLoad(true);
  await refresh();
  info(`${fmt(r.added)} yeni site görevi, ${fmt(r.linked)} işletme-görev eşleştirmesi yüksek hızlı HTTP/2 kuyruğuna alındı.`);
}));

async function downloadXlsx(id, query = '') {
  const b = $(id);
  b.disabled = true;
  try {
    const r = await fetch('/api/export.xlsx' + query, { headers: { 'X-Local-Token': token } });
    if (!r.ok) throw Error('Excel üretilemedi. setup.command ile bağımlılıkları kontrol edin.');
    const url = URL.createObjectURL(await r.blob());
    const a = el('a');
    a.href = url;
    a.download = 'lead-intelligence.xlsx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    b.disabled = false;
  }
}

bind('xlsx', () => downloadXlsx('xlsx'));
bind('xlsxScope', () => downloadXlsx('xlsxScope', '?' + new URLSearchParams(geoInput())));

// Full-Province & Industrial Cluster Bounding Boxes (West, South, East, North)
const geoPresets = {
  izmir: ['İzmir, Türkiye', '26.22,37.88,28.50,39.38'],
  izmir_mobilya: ['İzmir, Türkiye', '26.95,38.08,27.60,38.50'],
  istanbul: ['İstanbul, Türkiye', '28.00,40.80,29.95,41.55'],
  ankara: ['Ankara, Türkiye', '31.80,39.40,33.60,40.45'],
  bursa: ['Bursa, Türkiye', '28.15,39.75,29.95,40.60'],
  kayseri: ['Kayseri, Türkiye', '34.90,38.40,36.00,39.05'],
  konya: ['Konya, Türkiye', '32.10,37.45,33.15,38.30'],
  antalya: ['Antalya, Türkiye', '29.60,36.15,32.30,37.25'],
  gaziantep: ['Gaziantep, Türkiye', '36.95,36.80,38.05,37.45'],
  adana: ['Adana, Türkiye', '34.80,36.55,36.15,37.65'],
  mersin: ['Mersin, Türkiye', '33.20,36.10,35.10,37.15'],
  kocaeli: ['Kocaeli, Türkiye', '29.20,40.60,30.35,41.20'],
  denizli: ['Denizli, Türkiye', '28.65,37.35,29.95,38.25'],
  manisa: ['Manisa, Türkiye', '27.15,38.30,28.90,39.25'],
  sakarya: ['Sakarya, Türkiye', '30.10,40.45,31.05,41.15'],
  eskisehir: ['Eskişehir, Türkiye', '30.20,39.40,31.50,40.10'],
  aydin: ['Aydın, Türkiye', '27.15,37.30,28.85,38.10'],
  mugla: ['Muğla, Türkiye', '27.20,36.35,29.35,37.45'],
  samsun: ['Samsun, Türkiye', '35.40,41.00,37.15,41.75'],
  hatay: ['Hatay, Türkiye', '35.75,35.85,36.70,36.95'],
  tekirdag: ['Tekirdağ, Türkiye', '26.85,40.75,28.15,41.55']
};

$('geoPreset').addEventListener('change', () => {
  const v = geoPresets[$('geoPreset').value];
  if (v) {
    $('geoRegion').value = v[0];
    $('geoBox').value = v[1];
  }
});
$('geoBox').addEventListener('input', () => { $('geoPreset').value = ''; });
