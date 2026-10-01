/**
 * MarkPDF Pro — state.js
 * Central state store + utility functions
 */

// ── PDF State ──────────────────────────────────────────────────────────
export const pdfs   = [];   // [{name, doc, totalPages}]
export let   aidx   = -1;   // active pdf index
export let   curPg  = 1;
export let   scale  = 1.5;

export function setAidx(v)  { aidx  = v; }
export function setCurPg(v) { curPg = v; }
export function setScale(v) { scale = v; }

export function activePDF() { return aidx >= 0 ? pdfs[aidx] : null; }
export function totalPages(){ return activePDF()?.totalPages ?? 999; }

// ── Lines ──────────────────────────────────────────────────────────────
export const LINES = [];
let _lid = 0;
export function nextId() { return ++_lid; }

function _normSpec(line) {
  return String(line?.pageSpec ?? line?.scope ?? '').trim().toLowerCase();
}

// Returns:
// - Set<number> for explicit page lists/ranges
// - null for dynamic scopes: all/odd/even (handled as fast paths)
export function pagesForLine(line, tp) {
  const spec = _normSpec(line);
  if (!spec) return new Set();
  if (spec === 'all' || spec === 'odd' || spec === 'even') return null;

  const cache = line._pageCache;
  if (cache && cache.tp === tp && cache.spec === spec && cache.pages) return cache.pages;

  const pages = parseSpec(spec, tp);
  line._pageCache = { tp, spec, pages };
  return pages;
}

/**
 * Parse a page-spec string into a Set<number>.
 * Supports: "all", "odd", "even", "1,3,5", "2-8", "1-3,7,10-12"
 */
export function parseSpec(spec, tp) {
  const pages = new Set();
  if (!spec) return pages;
  const s = spec.trim().toLowerCase();
  if (s === 'all')  { for (let i = 1; i <= tp; i++) pages.add(i); return pages; }
  if (s === 'odd')  { for (let i = 1; i <= tp; i += 2) pages.add(i); return pages; }
  if (s === 'even') { for (let i = 2; i <= tp; i += 2) pages.add(i); return pages; }
  s.split(',').forEach(p => {
    p = p.trim();
    if (p.includes('-')) {
      const [a, b] = p.split('-').map(x => parseInt(x.trim()));
      if (!isNaN(a) && !isNaN(b))
        for (let i = Math.max(1, a); i <= Math.min(tp, b); i++) pages.add(i);
    } else {
      const n = parseInt(p);
      if (!isNaN(n) && n >= 1 && n <= tp) pages.add(n);
    }
  });
  return pages;
}

export function applyScope(line, scope, spec, tp) {
  line.scope    = scope;
  line.pageSpec = spec || scope;
  line.pages    = parseSpec(spec || scope, tp);
  line._pageCache = null;
}

export function lineOnPage(line, pg, tp) {
  const spec = _normSpec(line);
  if (!spec) return false;
  if (spec === 'all') return true;
  if (spec === 'odd') return (pg % 2) === 1;
  if (spec === 'even') return (pg % 2) === 0;

  const pages = pagesForLine(line, tp);
  return pages ? pages.has(pg) : false;
}

export function vLinesForPg(pg, tp) {
  return LINES.filter(l => l.type === 'v' && lineOnPage(l, pg, tp));
}
export function hLinesForPg(pg, tp) {
  return LINES.filter(l => l.type === 'h' && lineOnPage(l, pg, tp));
}

export function addLine(type, coord, pg) {
  const isV   = type === 'v';
  const vCnt  = LINES.filter(l => l.type === 'v').length;
  const hCnt  = LINES.filter(l => l.type === 'h').length;
  const name  = isV ? `Col ${vCnt + 1}` : (hCnt === 0 ? 'Top' : 'Bottom');
  const tp    = totalPages();
  const line  = {
    id:       nextId(),
    type,
    coord,
    name,
    scope:    'current',
    pageSpec: String(pg),
    pages:    new Set([pg]),
  };
  LINES.push(line);
  return line;
}

export function removeLine(id) {
  const idx = LINES.findIndex(l => l.id === id);
  if (idx < 0) return null;
  const [removed] = LINES.splice(idx, 1);
  return removed;
}

export function findLine(id) {
  return LINES.find(l => l.id === id) ?? null;
}

// ── Extraction results ─────────────────────────────────────────────────
export let tData   = [];   // [{row[], page, pdfName}]
export let tHdrs   = [];
export let pStats  = [];   // [{pg, rows}]
export let activity = [];

export function setTData(v)    { tData    = v; }
export function setTHdrs(v)    { tHdrs    = v; }
export function setPStats(v)   { pStats   = v; }
export function addActivity(a) { activity.unshift(a); if (activity.length > 8) activity.pop(); }

// ── Utilities ──────────────────────────────────────────────────────────
export function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function dlBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export function dlCSV(rows, hdrs, name) {
  const lines = [
    hdrs.map(h => `"${h.replace(/"/g,'""')}"`).join(','),
    ...rows.map(r => r.map(c => `"${(c ?? '').replace(/"/g,'""')}"`).join(',')),
  ];
  dlBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), name);
}
