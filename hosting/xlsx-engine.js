'use strict';
/**
 * Pure-JS Industrial OOXML (.xlsx) Generator for haritalar.web.app
 * Single-sheet "Firmalar" workbook, formula-injection immune (inlineStr + '@' text format),
 * frozen header/name columns, AutoFilter, zero external dependencies.
 */
(function (global) {
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function colLetters(idx) {
    let s = '';
    let n = idx + 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function xmlEscape(val) {
    const raw = String(val == null ? '' : val).slice(0, 32767);
    return raw
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function deflateRaw(bytes) {
    if (typeof CompressionStream === 'undefined') {
      return { method: 0, data: bytes };
    }
    try {
      const cs = new CompressionStream('deflate-raw');
      const writer = cs.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const buf = await new Response(cs.readable).arrayBuffer();
      const compressed = new Uint8Array(buf);
      return compressed.length < bytes.length
        ? { method: 8, data: compressed }
        : { method: 0, data: bytes };
    } catch {
      return { method: 0, data: bytes };
    }
  }

  async function buildZip(entries) {
    const enc = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBytes = enc.encode(entry.name);
      const rawBytes = entry.bytes instanceof Uint8Array ? entry.bytes : enc.encode(entry.bytes);
      const crc = crc32(rawBytes);
      const { method, data } = await deflateRaw(rawBytes);

      const local = new Uint8Array(30 + nameBytes.length + data.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
      lv.setUint16(8, method, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0x5421, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, rawBytes.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      local.set(data, 30 + nameBytes.length);
      localParts.push(local);

      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, method, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x5421, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, rawBytes.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centralParts.push(central);

      offset += local.length;
    }

    let centralSize = 0;
    for (const c of centralParts) centralSize += c.length;

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, eocd], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  /**
   * @param {Array<{name:string, category:string, city:string, district:string, emails:string[], phones:string[], website?:string, address:string}>} records
   */
  async function generateFirmalarXlsx(records) {
    let ne = 1;
    let np = 1;
    for (const r of records) {
      if (r.emails && r.emails.length > ne) ne = r.emails.length;
      if (r.phones && r.phones.length > np) np = r.phones.length;
    }
    if (records.length > 1048575 || 6 + ne + np > 16384) {
      throw new Error('Excel tek sayfa kapasitesi aşıldı; lütfen filtreyi daraltın.');
    }

    const headers = [
      'Firma adı',
      'Sektör',
      'İl',
      'İlçe',
      ...Array.from({ length: ne }, (_, i) => `E-posta ${i + 1}`),
      ...Array.from({ length: np }, (_, i) => `Telefon ${i + 1}`),
      'Web sitesi',
      'Adres'
    ];
    const widths = [
      36, 26, 16, 20,
      ...Array.from({ length: ne }, () => 36),
      ...Array.from({ length: np }, () => 22),
      34,
      58
    ];

    const colsXml = widths
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
      .join('');

    const lastCol = colLetters(headers.length - 1);
    const totalRows = records.length + 1;
    const sheetParts = [];

    sheetParts.push(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView tabSelected="1" workbookViewId="0" showGridLines="1">' +
      '<pane xSplit="4" ySplit="1" topLeftCell="E2" activePane="bottomRight" state="frozen"/>' +
      '</sheetView></sheetViews>' +
      `<cols>${colsXml}</cols>` +
      '<sheetData>'
    );

    // Row 1: Header
    let headRow = '<row r="1" ht="28" customHeight="1">';
    for (let c = 0; c < headers.length; c++) {
      const ref = `${colLetters(c)}1`;
      headRow += `<c r="${ref}" s="1" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(headers[c])}</t></is></c>`;
    }
    headRow += '</row>';
    sheetParts.push(headRow);

    // Data rows
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const rNum = i + 2;
      const ems = rec.emails || [];
      const phs = rec.phones || [];
      const vals = [
        rec.name || '',
        rec.category || '',
        rec.city || '',
        rec.district || '',
        ...Array.from({ length: ne }, (_, k) => ems[k] || ''),
        ...Array.from({ length: np }, (_, k) => phs[k] || ''),
        rec.website || '',
        rec.address || ''
      ];
      let rowXml = `<row r="${rNum}">`;
      for (let c = 0; c < vals.length; c++) {
        const v = vals[c];
        if (!v) continue;
        const ref = `${colLetters(c)}${rNum}`;
        rowXml += `<c r="${ref}" s="2" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(v)}</t></is></c>`;
      }
      rowXml += '</row>';
      sheetParts.push(rowXml);
    }

    sheetParts.push(
      '</sheetData>' +
      `<autoFilter ref="A1:${lastCol}${totalRows}"/>` +
      '<headerFooter><oddFooter>&amp;LOverture Maps / Places &amp; OpenStreetMap (ODbL) — haritalar.web.app</oddFooter></headerFooter>' +
      '</worksheet>'
    );

    const contentTypes =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>';

    const rootRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';

    const workbookXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Firmalar" sheetId="1" r:id="rId1"/></sheets>' +
      '</workbook>';

    const workbookRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';

    const stylesXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2">' +
      '<font><sz val="10.5"/><color rgb="FF0F172A"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
      '</fonts>' +
      '<fills count="3">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF164E63"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="2">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><bottom style="thin"><color rgb="FFE2E8F0"/></bottom></border>' +
      '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="3">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
      '<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
      '</cellXfs>' +
      '</styleSheet>';

    return buildZip([
      { name: '[Content_Types].xml', bytes: contentTypes },
      { name: '_rels/.rels', bytes: rootRels },
      { name: 'xl/workbook.xml', bytes: workbookXml },
      { name: 'xl/_rels/workbook.xml.rels', bytes: workbookRels },
      { name: 'xl/styles.xml', bytes: stylesXml },
      { name: 'xl/worksheets/sheet1.xml', bytes: sheetParts.join('') }
    ]);
  }

  global.XlsxEngine = { generateFirmalarXlsx };
})(typeof window !== 'undefined' ? window : globalThis);
