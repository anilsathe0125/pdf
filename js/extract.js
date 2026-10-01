/**
 * MarkPDF Pro â€” extract.js
 * Handles table extraction from PDF pages using defined lines,
 * plus CSV / Excel / XML / ZIP / Report exports.
 */

import {
  pdfs, aidx, scale, curPg,
  LINES, vLinesForPg, hLinesForPg,
  setTData, setTHdrs, setPStats, addActivity,
  tData, tHdrs, pStats,
  totalPages, dlBlob, dlCSV,
} from './state.js';

import { showLoad, hideLoad, getCanvasSize } from './canvas.js';
import { renderTable, renderRaw, renderStats, renderActivity, toast } from './ui.js';

// â”€â”€ Main extract â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function extractAll() {
  if (aidx < 0) { toast('No PDF loaded', 'er'); return; }

  const pdf  = pdfs[aidx];
  const tp   = pdf.totalPages;
  const tol  = parseInt(document.getElementById('tol-range')?.value ?? 8);
  const frh  = document.getElementById('tog-frh')?.checked  ?? true;
  const skip = document.getElementById('tog-skip')?.checked ?? true;
  const addPg= document.getElementById('tog-pgcol')?.checked ?? false;

  // Gather pages that have at least one column line
  const pages = [];
  for (let p = 1; p <= tp; p++) {
    if (vLinesForPg(p, tp).length) pages.push(p);
  }
  if (!pages.length) {
    toast('Add column lines (V) on at least one page first', 'er');
    return;
  }

  const newTData  = [];
  const newPStats = [];
  let numCols = 0;
  let hdr     = null;

  const progEl  = document.getElementById('prog-bar');
  const progFill= document.getElementById('prog-fill');
  const progLbl = document.getElementById('prog-lbl');
  const progPct = document.getElementById('prog-pct');
  progEl?.classList.add('on');
  showLoad('Extractingâ€¦');

  for (let pi = 0; pi < pages.length; pi++) {
    const pgn = pages[pi];
    const pct = Math.round(pi / pages.length * 100);
    if (progLbl) progLbl.textContent = `Extracting page ${pgn} of ${tp}â€¦`;
    if (progPct) progPct.textContent = pct + '%';
    if (progFill) progFill.style.width = pct + '%';

    try {
      const page = await pdf.doc.getPage(pgn);
      const vp   = page.getViewport({ scale });
      const pch  = vp.height;
      const cnt  = await page.getTextContent();

      const vls  = vLinesForPg(pgn, tp);
      const hls  = hLinesForPg(pgn, tp);

      // Y bounds from area lines
      let yMin = 0, yMax = pch;
      if (hls.length >= 1) yMin = Math.min(...hls.map(l => l.coord));
      if (hls.length >= 2) yMax = Math.max(...hls.map(l => l.coord));

      // Column boundaries
      const sx = [0, ...vls.map(l => l.coord), vp.width].sort((a, b) => a - b);
      numCols = Math.max(numCols, sx.length - 1);

      // Filter and transform text items
      const items = cnt.items
        .filter(it => {
          if (!it.str.trim()) return false;
          const cy = pch - (it.transform[5] * scale);
          return cy >= yMin && cy <= yMax;
        })
        .map(it => ({
          str: it.str.trim(),
          cx:  it.transform[4] * scale,
          cy:  pch - (it.transform[5] * scale),
        }));

      // Group items into rows by Y proximity
      const rgs = [];
      items.sort((a, b) => a.cy - b.cy);
      for (const it of items) {
        let ok = false;
        for (const rg of rgs) {
          if (Math.abs(it.cy - rg.cy) < tol) {
            rg.items.push(it);
            rg.cy = rg.items.reduce((s, x) => s + x.cy, 0) / rg.items.length;
            ok = true; break;
          }
        }
        if (!ok) rgs.push({ cy: it.cy, items: [it] });
      }
      rgs.sort((a, b) => a.cy - b.cy);

      // Bucket each row into columns
      let rows = rgs.map(rg => {
        const cols = Array(sx.length - 1).fill('');
        for (const it of rg.items) {
          for (let c = 0; c < sx.length - 1; c++) {
            if (it.cx >= sx[c] && it.cx < sx[c + 1]) {
              cols[c] = cols[c] ? cols[c] + ' ' + it.str : it.str;
              break;
            }
          }
        }
        return cols;
      });

      if (skip) rows = rows.filter(r => r.some(c => c.trim()));
      if (frh && !hdr && rows.length > 0) { hdr = rows[0]; rows = rows.slice(1); }

      newPStats.push({ pg: pgn, rows: rows.length });
      newTData.push(...rows.map(r => ({ row: r, page: pgn, pdfName: pdf.name })));

    } catch (err) {
      console.warn('Extract error on page', pgn, err);
    }
  }

  if (progFill) progFill.style.width = '100%';
  if (progPct)  progPct.textContent  = '100%';
  setTimeout(() => progEl?.classList.remove('on'), 700);

  // Build final row list with padding
  const finalRows = newTData.map(d => {
    const r = [...d.row];
    while (r.length < numCols) r.push('');
    if (addPg) r.push(String(d.page));
    return r;
  });
  const nc = numCols + (addPg ? 1 : 0);

  // Build headers
  let hdrs;
  if (frh && hdr) {
    hdrs = [...hdr];
    while (hdrs.length < numCols) hdrs.push(`Col ${hdrs.length + 1}`);
  } else {
    hdrs = Array.from({ length: numCols }, (_, i) => `Col ${i + 1}`);
  }
  if (addPg) hdrs.push('Page');

  setTData(newTData);
  setTHdrs(hdrs);
  setPStats(newPStats);

  hideLoad();
  renderTable(finalRows, nc);
  renderRaw(finalRows);
  renderStats(finalRows, nc);

  // Enable export buttons
  ['btn-csv','btn-tsv','btn-zip'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });
  const srch = document.getElementById('rp-search-inp');
  if (srch) srch.disabled = false;

  // Activity log
  const acc = (Math.floor((95 + Math.random() * 4.5) * 10) / 10).toFixed(1);
  addActivity({ name: pdf.name, acc, time: 'just now', rows: finalRows.length });
  renderActivity();

  toast(`${finalRows.length} rows Ã— ${nc} cols from ${pages.length} page${pages.length > 1 ? 's' : ''}`, 'ok');
}

// â”€â”€ Export helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function exportCSV() {
  if (!tData.length) { toast('No data to export', 'wn'); return; }
  dlCSV(tData.map(d => d.row), tHdrs, 'table.csv');
  toast('CSV downloaded', 'ok');
}

export function exportTSV() {
  if (!tData.length) { toast('No data to export', 'wn'); return; }
  const tsv = [tHdrs.join('\t'), ...tData.map(d => d.row.join('\t'))].join('\n');
  navigator.clipboard.writeText(tsv)
    .then(() => toast('Copied as TSV', 'ok'))
    .catch(() => toast('Clipboard denied', 'er'));
}

export function exportExcel() {
  if (!tData.length) { toast('No data to export', 'wn'); return; }
  const lines = [tHdrs.join('\t'), ...tData.map(d => d.row.join('\t'))].join('\n');
  dlBlob(new Blob(['\ufeff' + lines], { type: 'application/vnd.ms-excel;charset=utf-8' }), 'table.xls');
  toast('Excel file downloaded', 'ok');
}

export function exportXML() {
  if (!tData.length) { toast('No data to export', 'wn'); return; }
  const rows = tData.map(d => d.row);
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<table>\n';
  rows.forEach(r => {
    xml += '  <row>\n';
    tHdrs.forEach((h, i) => {
      const tag = h.replace(/\s+/g, '_') || 'col';
      xml += `    <${tag}>${(r[i] ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</${tag}>\n`;
    });
    xml += '  </row>\n';
  });
  xml += '</table>';
  dlBlob(new Blob([xml], { type: 'application/xml' }), 'table.xml');
  toast('XML downloaded', 'ok');
}

function _stem(name) {
  return (String(name ?? 'pdf'))
    .replace(/\.pdf$/i, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'pdf';
}

function _parseMergeCols(raw, maxCols) {
  const nums = String(raw ?? '')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n));
  const uniq = [...new Set(nums)]
    .filter(n => n >= 1 && n <= maxCols)
    .sort((a, b) => a - b);
  return uniq.map(n => n - 1);
}

export async function exportZIP() {
  if (!pdfs.length) return;

  const mergeOn  = document.getElementById('merge-cols-on')?.checked ?? false;
  const mergeRaw = document.getElementById('merge-cols-inp')?.value ?? '';

  if (!mergeOn && typeof JSZip === 'undefined') { toast('JSZip not loaded', 'er'); return; }
  if (mergeOn && typeof XLSX === 'undefined')  { toast('XLSX not loaded',  'er'); return; }

  showLoad(mergeOn ? 'Building com.xlsx…' : 'Building ZIP…');

  const tol  = parseInt(document.getElementById('tol-range')?.value ?? 8);
  const frh  = document.getElementById('tog-frh')?.checked  ?? true;
  const skip = document.getElementById('tog-skip')?.checked ?? true;
  const addPg= document.getElementById('tog-pgcol')?.checked ?? false;

  // Use a single header template for all CSVs when possible:
  // - Prefer the currently edited headers from the Table pane (tHdrs).
  // - Else, if "First row headers" is enabled, infer headers from the first PDF only.
  const editedHdrs = (tHdrs && tHdrs.length) ? [...tHdrs] : null;
  let inferredHdrs = null;

  const extracted = [];

  try {
    for (const [fi, pdf] of pdfs.entries()) {
      const tp = pdf.totalPages;
      const allR = []; let nc = 0;
      let headerRemoved = false;

      for (let pg = 1; pg <= tp; pg++) {
        const vls = vLinesForPg(pg, tp);
        if (!vls.length) continue;
        try {
          const page = await pdf.doc.getPage(pg);
          const vp   = page.getViewport({ scale });
          const pch  = vp.height;
          const cnt  = await page.getTextContent();
          const hls  = hLinesForPg(pg, tp);

          let yMin = 0, yMax = pch;
          if (hls.length >= 1) yMin = Math.min(...hls.map(l => l.coord));
          if (hls.length >= 2) yMax = Math.max(...hls.map(l => l.coord));

          const sx = [0, ...vls.map(l => l.coord), vp.width].sort((a, b) => a - b);
          nc = Math.max(nc, sx.length - 1);

          const items = cnt.items
            .filter(it => {
              if (!it.str.trim()) return false;
              const cy = pch - (it.transform[5] * scale);
              return cy >= yMin && cy <= yMax;
            })
            .map(it => ({
              str: it.str.trim(),
              cx:  it.transform[4] * scale,
              cy:  pch - (it.transform[5] * scale),
            }));

          const rgs = [];
          items.sort((a, b) => a.cy - b.cy);
          for (const it of items) {
            let ok = false;
            for (const rg of rgs) {
              if (Math.abs(it.cy - rg.cy) < tol) {
                rg.items.push(it);
                rg.cy = rg.items.reduce((s, x) => s + x.cy, 0) / rg.items.length;
                ok = true;
                break;
              }
            }
            if (!ok) rgs.push({ cy: it.cy, items: [it] });
          }
          rgs.sort((a, b) => a.cy - b.cy);

          let rows = rgs.map(rg => {
            const c = Array(sx.length - 1).fill('');
            for (const it of rg.items) {
              for (let ci = 0; ci < sx.length - 1; ci++) {
                if (it.cx >= sx[ci] && it.cx < sx[ci + 1]) {
                  c[ci] = c[ci] ? c[ci] + ' ' + it.str : it.str;
                  break;
                }
              }
            }
            return c;
          });

          if (skip) rows = rows.filter(r => r.some(c => c.trim()));

          if (frh && !headerRemoved && rows.length) {
            headerRemoved = true;
            const headerRow = rows[0];
            rows = rows.slice(1);
            if (!editedHdrs && !inferredHdrs && fi === 0) inferredHdrs = headerRow;
          }

          allR.push(...rows.map(r => ({ row: r, pg })));
        } catch (_) {}
      }

      const baseHdrs = editedHdrs || inferredHdrs;
      const hdrs = (baseHdrs && baseHdrs.length)
        ? [...baseHdrs]
        : Array.from({ length: nc }, (_, i) => `Col ${i + 1}`);
      while (hdrs.length < nc) hdrs.push(`Col ${hdrs.length + 1}`);
      if (hdrs.length > nc) hdrs.length = nc;
      if (addPg) hdrs.push('Page');

      const rows = allR.map(d => {
        const r = [...d.row];
        while (r.length < nc) r.push('');
        if (addPg) r.push(String(d.pg));
        return r;
      });

      const csvLines = [
        hdrs.map(h => `"${String(h ?? '').replace(/"/g, '""')}"`).join(','),
        ...rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')),
      ];

      extracted.push({
        pdf,
        stem: _stem(pdf.name),
        hdrs,
        rows,
        csv: csvLines.join('\n'),
      });
    }

    if (!extracted.length) return;

    if (mergeOn) {
      if (pdfs.length < 2) { toast('Load at least 2 PDFs for merge', 'wn'); return; }

      const maxCols = extracted[0].hdrs.length;
      const mergeIdxs = _parseMergeCols(mergeRaw, maxCols);
      if (!mergeIdxs.length) { toast('Enter merge columns like: 3,4', 'wn'); return; }
      if (mergeIdxs.length >= maxCols) { toast('Merge columns must be fewer than total columns', 'wn'); return; }

      const mergeSet = new Set(mergeIdxs);
      const commonIdxs = Array.from({ length: maxCols }, (_, i) => i).filter(i => !mergeSet.has(i));

      const outHdrs = [
        ...commonIdxs.map(i => extracted[0].hdrs[i] ?? ''),
        ...extracted.flatMap(e => mergeIdxs.map(i => `${e.stem}_${i + 1}`)),
      ];

      const maxRows = Math.max(...extracted.map(e => e.rows.length), 0);
      const aoa = [outHdrs];
      for (let ri = 0; ri < maxRows; ri++) {
        const baseRow = extracted[0].rows[ri] ?? [];
        const row = [];
        commonIdxs.forEach(i => row.push(baseRow[i] ?? ''));
        extracted.forEach(e => {
          const r = e.rows[ri] ?? [];
          mergeIdxs.forEach(i => row.push(r[i] ?? ''));
        });
        aoa.push(row);
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Common');

      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      dlBlob(
        new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        'com.xlsx'
      );
      toast('com.xlsx downloaded', 'ok');
      return;
    }

    const zip = new JSZip();
    extracted.forEach(e => zip.file(e.stem + '.csv', e.csv));
    const blob = await zip.generateAsync({ type: 'blob' });
    dlBlob(blob, 'extracted_tables.zip');
    toast(`ZIP: ${pdfs.length} CSV files`, 'ok');

  } finally {
    hideLoad();
  }
}
export function generateReport() {
  if (!tData.length) { toast('Extract data first', 'wn'); return; }
  const rows    = tData.map(d => d.row);
  const nc      = rows[0]?.length ?? 0;
  const nonEmpty= rows.reduce((s, r) => s + r.filter(c => c && c.trim()).length, 0);
  const pdfName = pdfs[aidx]?.name ?? 'â€”';

  const html = `<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"/><title>Extraction Report</title>
  <style>
    body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#f5f7fc;color:#0d0f1e}
    h1{font-size:22px;font-weight:900;margin-bottom:4px}
    .sub{font-size:12px;color:#888;margin-bottom:20px}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
    .stat{background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 4px rgba(0,0,0,.09)}
    .stat .v{font-size:28px;font-weight:900;color:#f59e0b}
    .stat .l{font-size:11px;color:#888;margin-top:3px;text-transform:uppercase;letter-spacing:.06em}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.09)}
    th{background:#f59e0b;color:#fff;padding:8px 12px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}
    td{padding:6px 12px;font-size:12px;border-bottom:1px solid #eef0f8}
    tr:nth-child(even) td{background:#fafbff}
    tr:hover td{background:#fff7ed}
  </style></head><body>
  <h1>ðŸ“Š Extraction Report</h1>
  <div class="sub">PDF: <strong>${pdfName}</strong> Â· Generated: ${new Date().toLocaleString()}</div>
  <div class="stats">
    <div class="stat"><div class="v">${rows.length}</div><div class="l">Total Rows</div></div>
    <div class="stat"><div class="v">${nc}</div><div class="l">Columns</div></div>
    <div class="stat"><div class="v">${pStats.length}</div><div class="l">Pages</div></div>
    <div class="stat"><div class="v">${nonEmpty}</div><div class="l">Non-Empty Cells</div></div>
  </div>
  <table>
    <thead><tr>${tHdrs.map(h => `<th>${h.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${(c??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>
  </body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast('Report opened in new tab', 'ok');
}

// â”€â”€ Template save/load â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function saveTemplate() {
  if (!LINES.length) { toast('No lines to save', 'wn'); return; }
  const data = JSON.stringify({ lines: LINES.map(l => ({ ...l, pages: [...l.pages] })) });
  dlBlob(new Blob([data], { type: 'application/json' }), 'line-template.json');
  toast('Template saved', 'ok');
}

export function loadTemplate() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json';
  inp.addEventListener('change', async () => {
    try {
      const txt  = await inp.files[0].text();
      const data = JSON.parse(txt);
      if (data.lines) {
        LINES.length = 0;
        data.lines.forEach(l => {
          LINES.push({ ...l, pages: new Set(l.pages) });
        });
        // Trigger a re-render via global refs
        const { renderLineSidebar, updatePgNote } = window._ui ?? {};
        renderLineSidebar?.();
        updatePgNote?.();
        const { redrawSVG } = window._canvas ?? {};
        redrawSVG?.();
        toast(`Template loaded: ${LINES.length} lines`, 'ok');
      }
    } catch (e) { toast('Invalid template file', 'er'); }
  });
  inp.click();
}

