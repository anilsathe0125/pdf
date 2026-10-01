/**
 * MarkPDF Pro — contextmenu.js
 * Right-click popup for editing line page scope.
 * Simple, fast, no clutter.
 */

import { LINES, findLine, applyScope, parseSpec, totalPages, esc }
  from './state.js';
import { renderLineSidebar, updatePgNote, toast } from './ui.js';
import { redrawSVG } from './canvas.js';
import { curPg } from './state.js';

let ctxId = null;   // currently targeted line id

const menu    = () => document.getElementById('ctx-menu');
const inpEl   = () => document.getElementById('ctx-custom-inp');
const infoEl  = () => document.getElementById('ctx-line-info');
const titleEl = () => document.getElementById('ctx-line-title');

// ── Open ───────────────────────────────────────────────────────────────
export function showCtxMenu(e, lineId) {
  const line = findLine(lineId);
  if (!line) return;
  ctxId = lineId;

  // Populate header
  titleEl().textContent = `${line.type === 'v' ? 'Column' : 'Area'} Line — "${line.name}"`;
  _updateInfo(line);

  // Pre-fill custom input if already custom
  inpEl().value = (line.scope === 'list' || line.scope === 'range')
    ? line.pageSpec : '';

  // Mark active scope button
  _markScopeBtn(line.scope);

  // Position the menu near cursor, keeping it in viewport
  const m  = menu();
  m.style.display = 'block';  // ensure visible
  const vw = window.innerWidth, vh = window.innerHeight;
  const mw = m.offsetWidth,    mh = m.offsetHeight;
  let x = e.clientX + 5, y = e.clientY + 5;
  if (x + mw > vw - 8) x = e.clientX - mw - 4;
  if (y + mh > vh - 8) y = e.clientY - mh - 4;
  m.style.left = x + 'px';
  m.style.top  = y + 'px';
  m.classList.add('show');
}

function _updateInfo(line) {
  const coord = Math.round(line.coord);
  const pos   = line.type === 'v' ? `x=${coord}` : `y=${coord}`;
  const scope = line.scope === 'all'
    ? 'all pages'
    : `${line.pages.size} page(s)`;
  infoEl().textContent = `${pos}  ·  scope: ${scope}`;
}

function _markScopeBtn(scope) {
  document.querySelectorAll('.csg-btn').forEach(b => b.classList.remove('sel'));
  const map = { all: 'csg-all', current: 'csg-cur', odd: 'csg-odd', even: 'csg-even' };
  const cls = map[scope];
  if (cls) document.querySelector(`.${cls}`)?.classList.add('sel');
}

// ── Close ──────────────────────────────────────────────────────────────
export function closeCtxMenu() {
  const m = menu();
  if (m) { m.classList.remove('show'); m.style.display = 'none'; }
  ctxId = null;
}

// ── Quick scope buttons ────────────────────────────────────────────────
export function ctxSetScope(scope) {
  if (ctxId === null) return;
  const line = findLine(ctxId);
  if (!line) return;
  const tp   = totalPages();
  const spec = scope === 'current' ? String(curPg) : scope;
  applyScope(line, scope, spec, tp);
  _markScopeBtn(scope);
  _updateInfo(line);
  renderLineSidebar();
  updatePgNote();
  redrawSVG();
  const label = scope === 'all'
    ? 'all pages'
    : scope === 'current' ? `page ${curPg}`
    : `${scope} pages`;
  toast(`"${line.name}" → ${label}`, 'ok');
}

// ── Custom range apply ─────────────────────────────────────────────────
export function ctxApplyCustom() {
  if (ctxId === null) return;
  const line = findLine(ctxId);
  if (!line) return;
  const spec = inpEl()?.value.trim();
  if (!spec) { toast('Enter a page specification', 'wn'); return; }
  const tp    = totalPages();
  const pages = parseSpec(spec, tp);
  if (!pages.size) { toast('No valid pages match that spec', 'wn'); return; }
  line.scope    = 'list';
  line.pageSpec = spec;
  line.pages    = pages;
  _updateInfo(line);
  document.querySelectorAll('.csg-btn').forEach(b => b.classList.remove('sel'));
  renderLineSidebar();
  updatePgNote();
  redrawSVG();
  toast(`"${line.name}" → ${pages.size} page(s)`, 'ok');
  closeCtxMenu();
}

// ── Actions ────────────────────────────────────────────────────────────
export function ctxRename() {
  if (ctxId === null) return;
  const line = findLine(ctxId);
  if (!line) return;
  const n = prompt('Rename line:', line.name);
  if (n !== null && n.trim()) line.name = n.trim();
  titleEl().textContent = `${line.type === 'v' ? 'Column' : 'Area'} Line — "${line.name}"`;
  renderLineSidebar();
  redrawSVG();
}

export function ctxDuplicate() {
  if (ctxId === null) return;
  const src = findLine(ctxId);
  if (!src) return;
  const copy = {
    ...src,
    id:    Date.now(),
    name:  src.name + ' (copy)',
    coord: src.coord + 20,
    pages: new Set(src.pages),
  };
  LINES.push(copy);
  renderLineSidebar();
  updatePgNote();
  redrawSVG();
  toast(`Duplicated "${src.name}"`, 'ok');
  closeCtxMenu();
}

export async function ctxSnapToText(pdfDoc, pg, sc) {
  if (ctxId === null) return;
  const line = findLine(ctxId);
  if (!line || !pdfDoc) return;
  try {
    const page = await pdfDoc.getPage(pg);
    const vp   = page.getViewport({ scale: sc });
    const pch  = vp.height;
    const cnt  = await page.getTextContent();
    let best = line.coord, bestDist = 9999;
    cnt.items.forEach(it => {
      const coord = line.type === 'v'
        ? it.transform[4] * sc
        : pch - (it.transform[5] * sc);
      const dist = Math.abs(coord - line.coord);
      if (dist < bestDist) { bestDist = dist; best = coord; }
    });
    line.coord = best;
    renderLineSidebar();
    redrawSVG();
    toast(`Snapped to nearest text (Δ${Math.round(bestDist)}px)`, 'ok');
  } catch (err) {
    toast('Snap failed', 'er');
  }
  closeCtxMenu();
}

export function ctxDeleteLine() {
  if (ctxId === null) return;
  const { removeLine } = window._state ?? {};
  if (!removeLine) return;
  const removed = removeLine(ctxId);
  if (removed) {
    renderLineSidebar();
    updatePgNote();
    redrawSVG();
    toast(`Deleted "${removed.name}"`, 'wn');
  }
  closeCtxMenu();
}

// ── Auto-close on outside click ────────────────────────────────────────
export function initCtxMenu() {
  document.addEventListener('click', e => {
    if (!menu()?.contains(e.target)) closeCtxMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeCtxMenu();
  });

  // Wire up buttons declared in HTML
  document.getElementById('ctx-apply-custom')
    ?.addEventListener('click', ctxApplyCustom);
  document.getElementById('ctx-rename')
    ?.addEventListener('click', ctxRename);
  document.getElementById('ctx-duplicate')
    ?.addEventListener('click', () => ctxDuplicate());
  document.getElementById('ctx-delete')
    ?.addEventListener('click', ctxDeleteLine);

  // Quick scope buttons
  document.querySelectorAll('.csg-btn').forEach(btn => {
    btn.addEventListener('click', () => ctxSetScope(btn.dataset.scope));
  });
}
