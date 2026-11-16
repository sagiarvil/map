'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');
const tls = require('node:tls');

const ALLOWED_ORIGINS = new Set([
  'https://haritalar.web.app',
  'https://haritalar.firebaseapp.com',
  'http://127.0.0.1:8765',
  'http://localhost:8765'
]);

const CHALLENGE_RE = /(?:cf-browser-verification|cf-chl-bypass|challenges\.cloudflare\.com\/turnstile|g-recaptcha|h-captcha|verify\s+you\s+are\s+human|attention\s+required!\s*\|\s*cloudflare)/i;
const VKN_CONTEXT_RE = /(?:vkn|vergi\s*(?:kimlik)?\s*(?:no|numaras[ıi])|tax\s*(?:id|no)|v\.?\s*d\.?[^0-9]{0,35})[\s:.\-#]*([0-9]{10})\b/gi;
const MERSIS_RE = /\b(0[0-9]{15})\b/g;
const KEP_RE = /\b([a-z0-9._+-]+@[a-z0-9.-]*\.kep\.tr)\b/gi;
const INTL_VAT_RE = /\b((?:DE[0-9]{9}|ATU[0-9]{8}|NL[0-9]{9}B[0-9]{2}|FR[A-Z0-9]{2}[0-9]{9}|IT[0-9]{11}|ES[A-Z0-9][0-9]{7}[A-Z0-9]|BE0[0-9]{9}|HRB\s*[0-9]{3,8}))\b/g;
const EMAIL_RE = /\b([a-z0-9._%+-]{1,64}@[a-z0-9.-]{2,190}\.[a-z]{2,18})\b/gi;
const PHONE_RE = /(?:\+|00)?[0-9][0-9\s().-]{7,20}[0-9]/g;
const EXEC_ROLE_RE = /\b(Genel\s+Müdür|Yönetim\s+Kurulu\s+Başkanı|Kurucu\s+Ortak|Kurucu|Şirket\s+Müdürü|Satınalma\s+Müdürü|İhracat\s+Müdürü|Satış\s+Müdürü|CEO|Founder|Co-Founder|Managing\s+Director|Geschäftsführer|Directeur\s+Général)\b/i;
const JUNK_EMAIL_DOMAINS = new Set(['example.com', 'example.org', 'domain.com', 'email.com', 'sentry.io', 'wixpress.com', 'yourdomain.com']);

function isPrivateOrReservedIp(ip) {
  if (!ip) return true;
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    if (p[0] >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    if (low === '::1' || low === '::' || low.startsWith('fe80:') || low.startsWith('fc') || low.startsWith('fd')) {
      return true;
    }
    if (low.startsWith('::ffff:')) {
      return isPrivateOrReservedIp(low.slice(7));
    }
  }
  return false;
}

async function assertPublicUrl(rawUrl, allowTestLoopback = false) {
  let u;
  try {
    const normalized = /^https?:\/\//i.test(String(rawUrl || '').trim())
      ? String(rawUrl).trim()
      : 'https://' + String(rawUrl || '').trim();
    u = new URL(normalized);
  } catch {
    throw new Error('Geçersiz URL formatı');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Yalnızca HTTP/HTTPS adresleri desteklenir');
  }
  const host = u.hostname;
  if (!host) throw new Error('Geçersiz alan adı');
  if (allowTestLoopback && (host === '127.0.0.1' || host === 'localhost')) {
    return u.toString();
  }
  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error('Özel/yerel IP adreslerine erişim güvenlik politikası gereği engellendi');
    }
    return u.toString();
  }
  const addrs = await dns.lookup(host, { all: true });
  if (!addrs.length) {
    throw new Error('Alan adı çözümlenemedi (NXDOMAIN)');
  }
  for (const a of addrs) {
    if (isPrivateOrReservedIp(a.address)) {
      throw new Error('Özel/yerel IP adreslerine erişim güvenlik politikası gereği engellendi');
    }
  }
  return u.toString();
}

function validateGibVkn(raw) {
  const s = String(raw || '').replace(/\D+/g, '');
  if (s.length !== 10 || new Set(s).size === 1) return false;
  let total = 0;
  for (let i = 0; i < 9; i++) {
    const tmp = (Number(s[i]) + (9 - i)) % 10;
    const v = tmp === 9 ? 9 : (tmp * Math.pow(2, 9 - i)) % 9;
    total += v;
  }
  const check = (10 - (total % 10)) % 10;
  return check === Number(s[9]);
}

function validateMersis(raw) {
  const s = String(raw || '').replace(/\D+/g, '');
  if (s.length !== 16 || !s.startsWith('0')) return false;
  const embedded = s.slice(1, 11);
  if (validateGibVkn(embedded) && ['000', '001', '002'].includes(s.slice(11, 14))) {
    return true;
  }
  return ['00015', '00016', '00017', '00018', '00019', '00024'].some(sfx => s.endsWith(sfx));
}

function stripTagsToText(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ');
}

function extractCorporateHtml(html, siteUrl) {
  const u = new URL(siteUrl);
  const domain = u.hostname.replace(/^www\./i, '').toLowerCase();
  const titleMatch = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTagsToText(titleMatch[1]).trim().slice(0, 200) : domain;
  const visible = stripTagsToText(html);

  const vkns = [];
  for (const m of String(html + '\n' + visible).matchAll(VKN_CONTEXT_RE)) {
    if (validateGibVkn(m[1]) && !vkns.includes(m[1])) vkns.push(m[1]);
  }
  const mersisList = [];
  for (const m of String(html + '\n' + visible).matchAll(MERSIS_RE)) {
    if (validateMersis(m[1]) && !mersisList.includes(m[1])) {
      mersisList.push(m[1]);
      const emb = m[1].slice(1, 11);
      if (validateGibVkn(emb) && !vkns.includes(emb)) vkns.push(emb);
    }
  }
  const keps = Array.from(new Set(Array.from(String(html).matchAll(KEP_RE), m => m[1].toLowerCase()))).slice(0, 5);
  const vats = Array.from(new Set(Array.from(String(html).matchAll(INTL_VAT_RE), m => m[1].replace(/\s+/g, ' ').trim()))).slice(0, 5);

  const emails = [];
  for (const m of String(html + '\n' + visible).matchAll(EMAIL_RE)) {
    const em = m[1].toLowerCase();
    const emDom = em.split('@')[1] || '';
    if (JUNK_EMAIL_DOMAINS.has(emDom)) continue;
    if (/\.(?:png|jpg|jpeg|gif|webp|svg|css|js|woff2?)$/i.test(em)) continue;
    if (!emails.includes(em)) emails.push(em);
    if (emails.length >= 12) break;
  }
  for (const k of keps) {
    if (!emails.includes(k)) emails.push(k);
  }

  const phones = [];
  for (const m of visible.matchAll(PHONE_RE)) {
    let digits = m[0].replace(/\D+/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0') && domain.endsWith('.tr')) {
      digits = '90' + digits.slice(1);
    } else if (digits.length === 10 && digits.startsWith('5') && domain.endsWith('.tr')) {
      digits = '90' + digits;
    }
    if (digits.length < 10 || digits.length > 15) continue;
    const e164 = '+' + digits;
    if (phones.some(p => p.e164 === e164)) continue;
    const wa = e164.startsWith('+90') ? /^\+905\d{9}$/.test(e164) : /^\+(?:491[567]|33[67]|447|9715|316)\d{7,9}$/.test(e164);
    phones.push({
      e164,
      line_type: wa ? 'mobile' : 'corporate',
      whatsapp_eligible: wa,
      whatsapp_url: wa ? `https://wa.me/${digits}` : ''
    });
    if (phones.length >= 10) break;
  }

  const executives = [];
  for (const rawLine of visible.split('\n')) {
    const line = rawLine.trim();
    if (line.length < 8 || line.length > 140) continue;
    const rm = line.match(EXEC_ROLE_RE);
    if (!rm) continue;
    const after = line.slice(rm.index + rm[0].length).replace(/^[\s:–—\-|,]+/, '').trim();
    const nm = after.match(/^([A-ZÇĞİÖŞÜÄÖÜ][a-zçğıöşüäöüß]{1,20}(?:\s+[A-ZÇĞİÖŞÜÄÖÜ][a-zçğıöşüäöüßA-ZÇĞİÖŞÜ]{1,24}){1,2})\b/);
    if (nm && !executives.some(e => e.name.toLowerCase() === nm[1].toLowerCase())) {
      executives.push({ name: nm[1], role: rm[1], source: 'Kurumsal Künye' });
      if (executives.length >= 6) break;
    }
  }

  return {
    title,
    emails: emails.slice(0, 12),
    phones,
    corporate_identifiers: {
      vkn: vkns[0] || '',
      vkn_verified_gib: vkns.length > 0,
      all_vkns: vkns.slice(0, 5),
      mersis: mersisList[0] || '',
      kep_addresses: keps,
      international_reg_ids: vats,
      efatura_confirmed: Boolean(vkns.length || mersisList.length || keps.length)
    },
    decision_makers: executives,
    markdown_snippet: visible.replace(/\s+/g, ' ').trim().slice(0, 420)
  };
}

async function inspectDnsInfrastructure(domain) {
  const clean = String(domain || '').replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '').toLowerCase();
  let dnsStatus = 'no_mx';
  let dnsError = '';
  let mxHosts = [];
  try {
    const mx = await dns.resolveMx(clean);
    mxHosts = mx.sort((a, b) => a.priority - b.priority).map(x => String(x.exchange || '').toLowerCase());
    if (mxHosts.length) dnsStatus = 'ok';
  } catch (err) {
    if (err && err.code === 'ENOTFOUND') {
      dnsStatus = 'nxdomain';
      dnsError = 'NXDOMAIN';
    } else if (err && err.code === 'ETIMEOUT') {
      dnsStatus = 'timeout';
      dnsError = 'DNS Timeout';
    } else if (err && err.code !== 'ENODATA') {
      dnsStatus = 'dns_error';
      dnsError = err.code || String(err);
    }
  }
  let spf = '';
  let hasDmarc = false;
  try {
    const txts = await dns.resolveTxt(clean);
    for (const parts of txts) {
      const joined = parts.join('');
      if (joined.toLowerCase().includes('v=spf1')) spf = joined;
    }
  } catch {}
  try {
    const dmarcs = await dns.resolveTxt('_dmarc.' + clean);
    hasDmarc = dmarcs.some(parts => parts.join('').toLowerCase().includes('v=dmarc1'));
  } catch {}

  let provider = mxHosts.length ? 'Özel Kurumsal Posta Sunucusu' : 'MX Kaydı Bulunamadı';
  if (dnsStatus === 'nxdomain') provider = 'Alan Adı Mevcut Değil (NXDOMAIN)';
  else if (dnsStatus === 'timeout') provider = 'DNS Zaman Aşımı';
  const joinedMx = mxHosts.join(' ');
  if (joinedMx.includes('outlook.com')) provider = 'Microsoft 365';
  else if (joinedMx.includes('google.com') || joinedMx.includes('googlemail.com')) provider = 'Google Workspace';
  else if (joinedMx.includes('yandex')) provider = 'Yandex 360 Kurumsal';

  return {
    domain: clean,
    dns_status: dnsStatus,
    dns_error: dnsError,
    has_mx: mxHosts.length > 0,
    mx_hosts: mxHosts.slice(0, 5),
    provider,
    spf,
    has_dmarc: hasDmarc
  };
}

function inspectLiveTlsCert(hostname, timeoutMs = 4000) {
  return new Promise(resolve => {
    const socket = tls.connect(
      { host: hostname, port: 443, servername: hostname, rejectUnauthorized: false, timeout: timeoutMs },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          socket.end();
          if (!cert || !Object.keys(cert).length) return resolve([]);
          const issuer = (cert.issuer && (cert.issuer.O || cert.issuer.CN)) || 'TLS X.509';
          const loggedAt = cert.valid_from ? new Date(cert.valid_from).toISOString() : '';
          const sans = String(cert.subjectaltname || '')
            .split(',')
            .map(s => s.trim().replace(/^DNS:/i, '').replace(/^\*\./, '').toLowerCase())
            .filter(s => s.includes('.') && !s.startsWith('www.'));
          if (!sans.length && cert.subject && cert.subject.CN) {
            sans.push(String(cert.subject.CN).replace(/^\*\./, '').toLowerCase());
          }
          resolve(Array.from(new Set(sans)).map(domain => ({ domain, issuer, logged_at: loggedAt, source: 'live-tls-x509' })));
        } catch {
          resolve([]);
        }
      }
    );
    socket.on('error', () => resolve([]));
    socket.on('timeout', () => {
      socket.destroy();
      resolve([]);
    });
  });
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
  }
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

async function readBodyJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) return JSON.parse(req.body);
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', chunk => {
      buf += chunk;
      if (buf.length > 512000) reject(new Error('İstek gövdesi çok büyük'));
    });
    req.on('end', () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch (e) {
        reject(new Error('Geçersiz JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function handleCloudApiRequest(req, res, opts = {}) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const parsedUrl = new URL(req.url || '/', 'https://haritalar.web.app');
  const route = parsedUrl.pathname.replace(/^\/api\/cloud/, '') || '/';
  const allowTestLoopback = Boolean(opts.allowTestLoopback);

  try {
    if (route === '/health' && req.method === 'GET') {
      return sendJson(res, 200, {
        status: 'active',
        engine: 'Haritalar Serverless Cloud API v7.4 (Node 22)',
        capabilities: ['crawl', 'ct_logs', 'erp_webhook', 'global_search']
      });
    }

    if (route === '/crawl' && req.method === 'POST') {
      const body = await readBodyJson(req);
      const targetUrl = await assertPublicUrl(body.url, allowTestLoopback);
      const u = new URL(targetUrl);
      const domIntel = await inspectDnsInfrastructure(u.hostname);

      // Respect robots.txt
      try {
        const robCtrl = new AbortController();
        const robTimer = setTimeout(() => robCtrl.abort(), 3500);
        const robRes = await fetch(`${u.origin}/robots.txt`, { signal: robCtrl.signal });
        clearTimeout(robTimer);
        if (robRes.ok) {
          const robTxt = (await robRes.text()).slice(0, 100000);
          if (/User-agent:\s*\*\s+Disallow:\s*\/\s*$/im.test(robTxt)) {
            return sendJson(res, 200, {
              url: targetUrl,
              engine_used: 'cloud-robots-policy',
              success: false,
              error: 'robots.txt taramaya izin vermiyor',
              domain_intel: domIntel,
              emails: [],
              phones: []
            });
          }
        }
      } catch {}

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      let resp;
      try {
        resp = await fetch(targetUrl, {
          signal: ctrl.signal,
          headers: {
            'User-Agent': 'HaritalarCloudCorporateBot/7.4 (+https://haritalar.web.app)',
            Accept: 'text/html,application/xhtml+xml'
          },
          redirect: 'follow'
        });
      } finally {
        clearTimeout(timer);
      }

      const finalUrl = await assertPublicUrl(resp.url || targetUrl, allowTestLoopback);
      if (!resp.ok) {
        return sendJson(res, 200, {
          url: finalUrl,
          engine_used: 'cloud-http-fetch',
          success: false,
          error: `HTTP ${resp.status}`,
          domain_intel: domIntel,
          emails: [],
          phones: []
        });
      }
      const html = (await resp.text()).slice(0, 600000);
      if (CHALLENGE_RE.test(html)) {
        return sendJson(res, 200, {
          url: finalUrl,
          engine_used: 'cloud-http-fetch',
          success: false,
          error: 'Erişim doğrulama ekranı tespit edildi; kurallar gereği durduruldu',
          domain_intel: domIntel,
          emails: [],
          phones: []
        });
      }

      const extracted = extractCorporateHtml(html, finalUrl);
      return sendJson(res, 200, {
        url: finalUrl,
        engine_used: 'cloud-serverless-http2+vkn-gib+dns',
        success: true,
        title: extracted.title,
        emails: extracted.emails,
        phones: extracted.phones,
        corporate_identifiers: extracted.corporate_identifiers,
        decision_makers: extracted.decision_makers,
        markdown_snippet: extracted.markdown_snippet,
        domain_intel: domIntel
      });
    }

    if (route === '/ct_logs' && req.method === 'GET') {
      const q = (parsedUrl.searchParams.get('query') || '').trim().toLowerCase();
      const limit = Math.max(1, Math.min(200, Number(parsedUrl.searchParams.get('limit') || 50)));
      if (!q || q.length < 2) {
        return sendJson(res, 400, { error: 'En az 2 karakterli sorgu gerekli' });
      }
      const cleanRoot = q.replace(/[^a-z0-9.-]/g, '');
      const seen = new Set();
      const records = [];
      const sources = [];
      const tierErrors = [];
      let anyHttpOk = false;

      // Tier 1: crt.sh
      try {
        const safeQ = cleanRoot.includes('.') ? cleanRoot : `%${cleanRoot}%.com.tr`;
        const c1 = new AbortController();
        const t1 = setTimeout(() => c1.abort(), 5000);
        const r1 = await fetch(`https://crt.sh/?q=${encodeURIComponent(safeQ)}&output=json`, { signal: c1.signal });
        clearTimeout(t1);
        if (r1.ok) {
          anyHttpOk = true;
          const arr = await r1.json();
          for (const item of (Array.isArray(arr) ? arr : [])) {
            for (let dom of String(item.name_value || item.common_name || '').split('\n')) {
              dom = dom.trim().toLowerCase().replace(/^\*\./, '');
              if (!dom || !dom.includes('.') || seen.has(dom)) continue;
              seen.add(dom);
              records.push({ domain: dom, issuer: item.issuer_name || 'CA', logged_at: item.entry_timestamp || '' });
              if (records.length >= limit) break;
            }
            if (records.length >= limit) break;
          }
          if (records.length) sources.push('crt.sh');
        } else {
          tierErrors.push(`crt.sh: HTTP ${r1.status}`);
        }
      } catch (e) {
        tierErrors.push(`crt.sh: ${e.name || 'Error'}`);
      }

      // Tier 2: CertSpotter
      if (records.length < limit) {
        const targets = cleanRoot.includes('.') ? [cleanRoot] : [`${cleanRoot}.com.tr`, `${cleanRoot}.com`];
        for (const tDom of targets) {
          try {
            const c2 = new AbortController();
            const t2 = setTimeout(() => c2.abort(), 5000);
            const r2 = await fetch(`https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(tDom)}&include_subdomains=true&expand=dns_names,issuer`, { signal: c2.signal });
            clearTimeout(t2);
            if (r2.ok) {
              anyHttpOk = true;
              const arr2 = await r2.json();
              const before = records.length;
              for (const item of (Array.isArray(arr2) ? arr2 : [])) {
                for (let dom of (item.dns_names || [])) {
                  dom = String(dom || '').trim().toLowerCase().replace(/^\*\./, '');
                  if (!dom || !dom.includes('.') || seen.has(dom)) continue;
                  seen.add(dom);
                  records.push({ domain: dom, issuer: (item.issuer && item.issuer.name) || 'CA', logged_at: item.not_before || '' });
                  if (records.length >= limit) break;
                }
                if (records.length >= limit) break;
              }
              if (records.length > before && !sources.includes('certspotter')) sources.push('certspotter');
            } else {
              tierErrors.push(`certspotter(${tDom}): HTTP ${r2.status}`);
            }
          } catch (e) {
            tierErrors.push(`certspotter(${tDom}): ${e.name || 'Error'}`);
          }
        }
      }

      // Tier 3: Live TLS 1.3 X.509 Handshake
      if (records.length < limit) {
        const tlsTargets = cleanRoot.includes('.') ? [cleanRoot] : [`${cleanRoot}.com.tr`, `${cleanRoot}.com`];
        const tlsBatches = await Promise.all(tlsTargets.map(h => inspectLiveTlsCert(h)));
        const beforeTls = records.length;
        for (const batch of tlsBatches) {
          for (const row of batch) {
            if (!seen.has(row.domain)) {
              seen.add(row.domain);
              records.push(row);
            }
          }
        }
        if (records.length > beforeTls) sources.push('live-tls-x509');
      }

      if (!records.length && !anyHttpOk && tierErrors.length) {
        return sendJson(res, 502, { error: 'Sertifika şeffaflık sunucularına ulaşılamadı', tier_errors: tierErrors });
      }
      return sendJson(res, 200, {
        query: q,
        count: records.length,
        records: records.slice(0, limit),
        domains: records.slice(0, limit),
        source_engine: sources.join('+') || 'none',
        tier_errors: tierErrors
      });
    }

    if (route === '/erp_webhook' && req.method === 'POST') {
      const body = await readBodyJson(req);
      const webhookUrl = await assertPublicUrl(body.webhook_url, allowTestLoopback);
      const payload = body.payload || {};
      if (payload.vkn && String(payload.vkn).replace(/\D+/g, '').length === 10 && !validateGibVkn(payload.vkn)) {
        return sendJson(res, 400, { ok: false, error: 'Geçersiz GİB VKN kontrol basamağı' });
      }
      const t0 = Date.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const r = await fetch(webhookUrl, {
          method: 'POST',
          signal: ctrl.signal,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'User-Agent': 'Haritalar-Cloud-ERP-Bridge/7.4',
            'X-Haritalar-Event': String(payload.event || 'erp.party.upsert')
          },
          body: JSON.stringify(payload)
        });
        const preview = (await r.text()).slice(0, 300);
        return sendJson(res, 200, {
          ok: r.status >= 200 && r.status < 300,
          status_code: r.status,
          latency_ms: Date.now() - t0,
          webhook_url: webhookUrl,
          response_preview: preview
        });
      } finally {
        clearTimeout(timer);
      }
    }

    return sendJson(res, 404, { error: 'Bulut uç noktası bulunamadı' });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    const isClientErr = /Geçersiz|desteklenir|engellendi|NXDOMAIN|gerekli/i.test(msg);
    return sendJson(res, isClientErr ? 400 : 502, { error: msg });
  }
}

let cloudApi;
try {
  const { onRequest } = require('firebase-functions/v2/https');
  cloudApi = onRequest(
    { region: 'europe-west1', concurrency: 80, timeoutSeconds: 30, memory: '256MiB' },
    (req, res) => handleCloudApiRequest(req, res)
  );
} catch {
  // Allows pure Node unit testing even before npm install finishes
}

module.exports = {
  cloudApi,
  handleCloudApiRequest,
  validateGibVkn,
  validateMersis,
  isPrivateOrReservedIp,
  extractCorporateHtml
};
