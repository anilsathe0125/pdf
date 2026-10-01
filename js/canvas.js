/**
 * MarkPDF Pro — canvas.js
 * Handles PDF page rendering, SVG overlay, drag logic.
 * 
 * KEY DRAG FIX:
 *  - mousedown on a line HIT element sets dragging state
 *  - global mousemove/mouseup handle movement
 *  - SVG click listener only fires if NO drag occurred (didDrag flag)
 *  - Placing a line only happens when mode is active AND click target
 *    is not a line hit element (mouseDownOnLine flag prevents it)
 */

import {
  pdfs, aidx, curPg, scale, setScale,
  totalPages, LINES,
  vLinesForPg, hLinesForPg,
  addLine, findLine, esc,
} from './state.js';

import { renderLineSidebar, updatePgNote, updateStripActive } from './ui.js';
import { showCtxMenu } from './contextmenu.js';
import { toast }       from './ui.js';

// ── DOM refs ───────────────────────────────────────────────────────────
const cvEl    = () => document.getElementById('cv');
const svgEl   = () => document.getElementById('svg-overlay');
const ccEl    = () => document.getElementById('cc');
const emptyEl = () => document.getElementById('empty-state');
const loadEl  = () => document.getElementById('loading');
const loTxt   = () => document.getElementById('lo-txt');
const ctbZoom = () => document.getElementById('ctb-zoom');
const ctbLabel= () => document.getElementById('ctb-label');
const ctbCoord= () => document.getElementById('ctb-coord');

// ── State ──────────────────────────────────────────────────────────────
export let mode = null;       // 'v' | 'h' | null
let dragging = null;          // {lineId, type, rect}
let mouseDownOnLine = false;  // true when mousedown lands on a line element
let didDrag = false;          // true when mouse moved while dragging

let cW = 0, cH = 0;
let renderTask = null;

// ── Loader ─────────────────────────────────────────────────────────────
export function showLoad(txt = 'Loading…') {
  if (loTxt()) loTxt().textContent = txt;
  loadEl()?.classList.add('on');
}
export function hideLoad() {
  loadEl()?.classList.remove('on');
}

// ── Render a PDF page ──────────────────────────────────────────────────
export async function renderPage(n) {
  const pdf = aidx >= 0 ? pdfs[aidx] : null;
  if (!pdf) return;

  if (renderTask) { try { renderTask.cancel(); } catch (_) {} }

  showLoad(`Page ${n} / ${pdf.totalPages}…`);
  emptyEl().style.display = 'none';
  ccEl().style.display    = 'inline-block';

  const page = await pdf.doc.getPage(n);
  const vp   = page.getViewport({ scale });

  const cv = cvEl();
  cv.width  = vp.width;
  cv.height = vp.height;
  cW = vp.width;
  cH = vp.height;

  const svg = svgEl();
  svg.setAttribute('width',   cW);
  svg.setAttribute('height',  cH);
  svg.setAttribute('viewBox', `0 0 ${cW} ${cH}`);

  cv.getContext('2d').clearRect(0, 0, cW, cH);
  renderTask = page.render({ canvasContext: cv.getContext('2d'), viewport: vp });
  await renderTask.promise;

  updateZoomDisplay();
  redrawSVG();
  renderLineSidebar();
  updatePgNote();
  updateStripActive(n);
  hideLoad();
}

// ── Zoom ───────────────────────────────────────────────────────────────
export function setZoom(ns) {
  if (aidx < 0) return;
  setScale(ns);
  updateZoomDisplay();
  renderPage(curPg);
}

function updateZoomDisplay() {
  if (ctbZoom()) ctbZoom().textContent = Math.round(scale / 1.5 * 100) + '%';
}

// ── Mode ───────────────────────────────────────────────────────────────
export function setMode(m) {
  mode = m;
  const svg = svgEl();
  if (m) {
    svg.classList.add('pm');
  } else {
    if (!dragging) svg.classList.remove('pm');
  }
}

export function cancelMode() {
  mode = null;
  if (!dragging) svgEl()?.classList.remove('pm');
  document.getElementById('btn-add-v')?.classList.remove('active');
  document.getElementById('btn-add-h')?.classList.remove('active');
  document.getElementById('mode-cancel-btn')?.classList.remove('show');
  ['mc-line','mc-col','mc-area'].forEach(id => document.getElementById(id)?.classList.remove('on'));
  if (ctbLabel()) ctbLabel().textContent = aidx >= 0
    ? 'Select a mode or right-click lines to edit scope'
    : 'Load a PDF to begin marking';
}

// ── SVG utility ────────────────────────────────────────────────────────
function mkSVG(tag) {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

function getSVGPos(e) {
  const r = svgEl().getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (cW / r.width),
    y: (e.clientY - r.top)  * (cH / r.height),
  };
}

// ── Attach drag to a hit element ───────────────────────────────────────
function attachDrag(el, lineId, type) {
  el.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    mouseDownOnLine = true;
    didDrag         = false;
    dragging = { lineId, type, rect: svgEl().getBoundingClientRect() };
    document.getElementById('mc-drag')?.classList.add('on');
    document.body.style.cursor = type === 'v' ? 'col-resize' : 'row-resize';
  });
  el.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    showCtxMenu(e, lineId);
  });
}

// ── Global mouse handlers (drag move / up) ─────────────────────────────
export function initDragHandlers() {
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    didDrag = true;
    const r = dragging.rect;
    const x = (e.clientX - r.left) * (cW / r.width);
    const y = (e.clientY - r.top)  * (cH / r.height);
    const line = findLine(dragging.lineId);
    if (!line) return;
    if (dragging.type === 'v') line.coord = Math.max(0, Math.min(cW, x));
    else                       line.coord = Math.max(0, Math.min(cH, y));
    redrawSVG();
    renderLineSidebar();   // keep coord display live
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = null;
    document.body.style.cursor = '';
    document.getElementById('mc-drag')?.classList.remove('on');
    if (!mode) svgEl()?.classList.remove('pm');
    // Reset flags after a short tick so the click handler can read them
    requestAnimationFrame(() => { mouseDownOnLine = false; });
  });
}

// ── SVG canvas click — place new line ─────────────────────────────────
export function initCanvasClick() {
  const svg = svgEl();

  // Prevent context menu on the SVG background
  svg.addEventListener('contextmenu', e => e.preventDefault());

  svg.addEventListener('click', e => {
    // Suppress if drag just ended or click was on a line element
    if (didDrag)           { didDrag = false; return; }
    if (mouseDownOnLine)   { mouseDownOnLine = false; return; }
    if (!mode)             return;

    const pos  = getSVGPos(e);
    const line = addLine(mode, mode === 'v' ? pos.x : pos.y, curPg);
    redrawSVG();
    renderLineSidebar();
    updatePgNote();
    toast(`${mode === 'v' ? 'Column' : 'Area'} line added — right-click to set page scope`, 'in');
  });

  svg.addEventListener('mousemove', e => {
    const p = getSVGPos(e);
    if (ctbCoord()) ctbCoord().textContent = `x:${Math.round(p.x)} y:${Math.round(p.y)}`;
  });
}

// ── REDRAW SVG ─────────────────────────────────────────────────────────
export function redrawSVG() {
  const svg = svgEl();
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  if (!cW || !cH) return;

  const tp   = totalPages();
  const vls  = vLinesForPg(curPg, tp);
  const hls  = hLinesForPg(curPg, tp);
  const showGhost  = document.getElementById('tog-ghost')?.checked  ?? true;
  const showRuler  = document.getElementById('tog-ruler')?.checked  ?? false;

  // ── Area fill ──────────────────────────────────────────────────────
  if (hls.length >= 2) {
    const y1 = Math.min(hls[0].coord, hls[1].coord);
    const y2 = Math.max(hls[0].coord, hls[1].coord);
    const r  = mkSVG('rect');
    r.setAttribute('x', 0); r.setAttribute('y', y1);
    r.setAttribute('width', cW); r.setAttribute('height', y2 - y1);
    r.setAttribute('fill', 'rgba(139,92,246,.055)');
    r.setAttribute('pointer-events', 'none');
    svg.appendChild(r);
  }

  // ── Ghost lines (lines not on this page) ──────────────────────────
  if (showGhost) {
    LINES.filter(l => !l.pages.has(curPg)).forEach(l => {
      const ln = mkSVG('line');
      if (l.type === 'v') {
        ln.setAttribute('x1', l.coord); ln.setAttribute('y1', 0);
        ln.setAttribute('x2', l.coord); ln.setAttribute('y2', cH);
        ln.setAttribute('stroke', 'rgba(245,158,11,.18)');
      } else {
        ln.setAttribute('x1', 0); ln.setAttribute('y1', l.coord);
        ln.setAttribute('x2', cW); ln.setAttribute('y2', l.coord);
        ln.setAttribute('stroke', 'rgba(139,92,246,.18)');
      }
      ln.setAttribute('stroke-width', '1');
      ln.setAttribute('stroke-dasharray', '4 3');
      ln.setAttribute('pointer-events', 'none');
      ln.classList.add('ghost-l');
      svg.appendChild(ln);
    });
  }

  // ── Rulers ────────────────────────────────────────────────────────
  if (showRuler) drawRulers(svg);

  // ── V-lines ───────────────────────────────────────────────────────
  vls.forEach(l => {
    // Visible line
    const vis = mkSVG('line');
    vis.setAttribute('x1', l.coord); vis.setAttribute('y1', 0);
    vis.setAttribute('x2', l.coord); vis.setAttribute('y2', cH);
    vis.classList.add('svg-v-vis');
    svg.appendChild(vis);

    // Label
    const lbl = mkSVG('text');
    lbl.setAttribute('x', l.coord + 3); lbl.setAttribute('y', 13);
    lbl.setAttribute('fill', '#f59e0b'); lbl.setAttribute('font-size', '9');
    lbl.setAttribute('font-family', 'system-ui,sans-serif');
    lbl.setAttribute('pointer-events', 'none');
    lbl.textContent = l.name;
    svg.appendChild(lbl);

    // Drag handle (visible circle)
    const handle = mkSVG('circle');
    handle.setAttribute('cx', l.coord); handle.setAttribute('cy', 22);
    handle.setAttribute('r', 6); handle.setAttribute('fill', '#f59e0b');
    handle.setAttribute('opacity', '.88');
    handle.style.cursor = 'col-resize';
    attachDrag(handle, l.id, 'v');
    svg.appendChild(handle);

    // Wide invisible hit strip for easier dragging
    const hit = mkSVG('rect');
    hit.setAttribute('x', l.coord - 7); hit.setAttribute('y', 0);
    hit.setAttribute('width', 14); hit.setAttribute('height', cH);
    hit.classList.add('svg-hit');
    attachDrag(hit, l.id, 'v');
    svg.appendChild(hit);
  });

  // ── H-lines ───────────────────────────────────────────────────────
  hls.forEach((l, i) => {
    const vis = mkSVG('line');
    vis.setAttribute('x1', 0); vis.setAttribute('y1', l.coord);
    vis.setAttribute('x2', cW); vis.setAttribute('y2', l.coord);
    vis.classList.add('svg-h-vis');
    svg.appendChild(vis);

    // Label
    const lbl = mkSVG('text');
    lbl.setAttribute('x', 6); lbl.setAttribute('y', l.coord - 4);
    lbl.setAttribute('fill', '#a78bfa'); lbl.setAttribute('font-size', '9');
    lbl.setAttribute('font-family', 'system-ui,sans-serif');
    lbl.setAttribute('pointer-events', 'none');
    lbl.textContent = (i === 0 ? '▲ ' : '▼ ') + l.name;
    svg.appendChild(lbl);

    // Handle
    const handle = mkSVG('circle');
    handle.setAttribute('cx', cW - 20); handle.setAttribute('cy', l.coord);
    handle.setAttribute('r', 6); handle.setAttribute('fill', '#a78bfa');
    handle.setAttribute('opacity', '.88');
    handle.style.cursor = 'row-resize';
    attachDrag(handle, l.id, 'h');
    svg.appendChild(handle);

    // Hit strip
    const hit = mkSVG('rect');
    hit.setAttribute('x', 0); hit.setAttribute('y', l.coord - 7);
    hit.setAttribute('width', cW); hit.setAttribute('height', 14);
    hit.classList.add('svg-hit', 'svg-hit-h');
    attachDrag(hit, l.id, 'h');
    svg.appendChild(hit);
  });
}

// ── Ruler ticks ───────────────────────────────────────────────────────
function drawRulers(svg) {
  for (let x = 0; x < cW; x += 50) {
    const t = mkSVG('line');
    t.setAttribute('x1', x); t.setAttribute('y1', 0);
    t.setAttribute('x2', x); t.setAttribute('y2', x % 100 === 0 ? 11 : 6);
    t.setAttribute('stroke', 'rgba(6,182,212,.28)'); t.setAttribute('stroke-width', '1');
    t.setAttribute('pointer-events', 'none');
    svg.appendChild(t);
    if (x > 0 && x % 100 === 0) {
      const l = mkSVG('text');
      l.setAttribute('x', x + 2); l.setAttribute('y', 10);
      l.setAttribute('fill', 'rgba(6,182,212,.45)'); l.setAttribute('font-size', '6');
      l.setAttribute('pointer-events', 'none');
      l.textContent = x;
      svg.appendChild(l);
    }
  }
  for (let y = 0; y < cH; y += 50) {
    const t = mkSVG('line');
    t.setAttribute('x1', 0); t.setAttribute('y1', y);
    t.setAttribute('x2', y % 100 === 0 ? 11 : 6); t.setAttribute('y2', y);
    t.setAttribute('stroke', 'rgba(6,182,212,.28)'); t.setAttribute('stroke-width', '1');
    t.setAttribute('pointer-events', 'none');
    svg.appendChild(t);
    if (y > 0 && y % 100 === 0) {
      const l = mkSVG('text');
      l.setAttribute('x', 2); l.setAttribute('y', y - 2);
      l.setAttribute('fill', 'rgba(6,182,212,.45)'); l.setAttribute('font-size', '6');
      l.setAttribute('pointer-events', 'none');
      l.textContent = y;
      svg.appendChild(l);
    }
  }
}

// ── Expose cW / cH for extract ────────────────────────────────────────
export function getCanvasSize() { return { cW, cH }; }
