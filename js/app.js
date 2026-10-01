/**
 * MarkPDF Pro — app.js
 * Entry point. Wires all modules together.
 * Handles: PDF load, navigation, zoom, keyboard shortcuts, theme.
 */

import * as State from './state.js';
import * as Canvas from './canvas.js';
import * as UI from './ui.js';
import * as Extract from './extract.js';
import { showCtxMenu, closeCtxMenu, initCtxMenu, ctxSetScope, ctxApplyCustom, ctxRename, ctxDeleteLine } from './contextmenu.js';

// ── Expose globals needed by onclick attrs & cross-module calls ────────
window._state  = State;
window._ctx    = { showCtxMenu };
window._ui     = UI;
window._canvas = Canvas;

// Re-export ctxMenu actions to window so HTML onclick can reach them
window.ctxSetScope     = ctxSetScope;
window.ctxApplyCustom  = ctxApplyCustom;
window.ctxRename       = ctxRename;
window.ctxDeleteLine   = ctxDeleteLine;
window.closeCtxMenu    = closeCtxMenu;
window.ctxDuplicate    = () => import('./contextmenu.js').then(m => m.ctxDuplicate());
window.ctxSnap         = () => {
  const pdf = State.activePDF();
  import('./contextmenu.js').then(m => m.ctxSnapToText(pdf?.doc, State.curPg, State.scale));
};

// ── DOM ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ════════════════════════════════════════════════════════════════════
// PDF MANAGEMENT
// ════════════════════════════════════════════════════════════════════
async function loadFiles(files) {
  const ok = [...files].filter(f => f.type === 'application/pdf');
  if (!ok.length) { UI.toast('Only PDF files accepted', 'er'); return; }
  for (const f of ok) await loadOnePDF(f);
  UI.renderPdfList();
  if (State.aidx === -1) await switchPDF(0);
  updateZipBtn();
}

async function loadOnePDF(file) {
  Canvas.showLoad(`Loading ${file.name}…`);
  try {
    const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    State.pdfs.push({ name: file.name, doc, totalPages: doc.numPages });
    $('btn-linemap').disabled = false;
    $('btn-strip').disabled   = false;
    UI.toast(`Loaded: ${file.name} (${doc.numPages}p)`, 'ok');
  } catch (e) {
    UI.toast(`Failed: ${file.name}`, 'er');
  }
  Canvas.hideLoad();
}

async function switchPDF(idx) {
  if (idx === State.aidx) return;
  State.setAidx(idx);
  State.setCurPg(1);
  Canvas.cancelMode();
  UI.renderPdfList();
  setCtrlEnabled(true);
  setStatus(true, `${State.pdfs[idx].name} · ${State.pdfs[idx].totalPages}p`);
  $('goto-inp').max = State.pdfs[idx].totalPages;
  $('goto-inp').placeholder = `1–${State.pdfs[idx].totalPages}`;
  await Canvas.renderPage(State.curPg);
  UI.updateStrip();
}

async function gotoPage(n) {
  const pdf = State.activePDF();
  if (!pdf || isNaN(n) || n < 1 || n > pdf.totalPages) {
    UI.toast(`Page must be 1–${pdf?.totalPages ?? '?'}`, 'wn');
    return;
  }
  State.setCurPg(n);
  await Canvas.renderPage(n);
  UI.updateStrip();
}

function removePDF(idx) {
  State.pdfs.splice(idx, 1);
  if (State.aidx === idx) {
    State.setAidx(-1);
    if (State.pdfs.length) switchPDF(Math.min(idx, State.pdfs.length - 1));
    else resetView();
  } else if (State.aidx > idx) {
    State.setAidx(State.aidx - 1);
  }
  UI.renderPdfList();
  updateZipBtn();
  UI.updateStrip();
}

function resetView() {
  $('empty-state').style.display = 'flex';
  $('cc').style.display          = 'none';
  setCtrlEnabled(false);
  setStatus(false);
  $('btn-linemap').disabled = true;
  $('btn-strip').disabled   = true;
}

// ── Expose PDF actions to onclick attrs ───────────────────────────────
window.appPDF = { switchPDF, removePDF, gotoPage };

// ════════════════════════════════════════════════════════════════════
// CONTROLS
// ════════════════════════════════════════════════════════════════════
function setCtrlEnabled(on) {
  ['prev-pg','next-pg','btn-add-v','btn-add-h','btn-extract'].forEach(id => {
    const el = $(id); if (el) el.disabled = !on;
  });
}
function setStatus(on, label = '') {
  $('status-dot')?.classList.toggle('on', on);
  if ($('status-txt')) $('status-txt').textContent = on ? label : 'System Idle';
}
function updateZipBtn() {
  const el = $('btn-zip');
  if (!el) return;
  const multi = State.pdfs.length > 1;
  el.style.display = multi ? 'flex' : 'none';
  el.disabled = !multi;

  const mergeOn = $('merge-cols-on')?.checked ?? false;
  el.innerHTML = mergeOn
    ? '<i class="fa fa-file-excel"></i> Download com.xlsx (merged)'
    : '<i class="fa fa-file-zipper"></i> Download ZIP (all PDFs)';

  const inp = $('merge-cols-inp');
  const tog = $('merge-cols-on');
  if (inp) inp.disabled = !multi;
  if (tog) tog.disabled = !multi;
}

// ════════════════════════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════════════════════════
function bindNav() {
  $('prev-pg')?.addEventListener('click', async () => {
    if (State.curPg > 1) {
      State.setCurPg(State.curPg - 1);
      await Canvas.renderPage(State.curPg);
      UI.updateStrip();
    }
  });
  $('next-pg')?.addEventListener('click', async () => {
    const pdf = State.activePDF();
    if (pdf && State.curPg < pdf.totalPages) {
      State.setCurPg(State.curPg + 1);
      await Canvas.renderPage(State.curPg);
      UI.updateStrip();
    }
  });
  $('goto-btn')?.addEventListener('click', () => {
    gotoPage(parseInt($('goto-inp').value));
    $('goto-inp').value = '';
  });
  $('goto-inp')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('goto-btn').click();
  });
  // Update nav display on page render
  document.addEventListener('pageRendered', () => {
    const pdf = State.activePDF();
    if (!pdf) return;
    $('page-display').textContent = `page ${State.curPg} / ${pdf.totalPages}`;
    $('nav-pg-badge').textContent  = `${State.curPg}/${pdf.totalPages}`;
    $('prev-pg').disabled = State.curPg <= 1;
    $('next-pg').disabled = State.curPg >= pdf.totalPages;
  });
}

// ════════════════════════════════════════════════════════════════════
// ZOOM
// ════════════════════════════════════════════════════════════════════
function bindZoom() {
  $('btn-zoom-in')?.addEventListener('click',  () => Canvas.setZoom(State.scale + .25));
  $('btn-zoom-out')?.addEventListener('click', () => Canvas.setZoom(Math.max(.3, State.scale - .25)));
  $('btn-zoom-fit')?.addEventListener('click', () => {
    if (State.aidx < 0) return;
    const wrap = $('canvas-wrap');
    const cv   = $('cv');
    const w    = wrap.clientWidth - 44;
    Canvas.setZoom(Math.round((w / (cv.width / State.scale)) * 4) / 4 || 1);
  });
  $('btn-zoom-reset')?.addEventListener('click', () => Canvas.setZoom(1.5));
}

// ════════════════════════════════════════════════════════════════════
// MODE (V / H)
// ════════════════════════════════════════════════════════════════════
function bindModeButtons() {
  $('btn-add-v')?.addEventListener('click', () => toggleMode('v'));
  $('btn-add-h')?.addEventListener('click', () => toggleMode('h'));
  $('mode-cancel-btn')?.addEventListener('click', () => Canvas.cancelMode());
}

function toggleMode(m) {
  if (Canvas.mode === m) { Canvas.cancelMode(); return; }
  Canvas.setMode(m);
  $('btn-add-v')?.classList.toggle('active', m === 'v');
  $('btn-add-h')?.classList.toggle('active', m === 'h');
  $('mode-cancel-btn')?.classList.add('show');
  $('mc-line')?.classList.toggle('on', true);
  $('mc-col')?.classList.toggle('on',  m === 'v');
  $('mc-area')?.classList.toggle('on', m === 'h');
  const lbl = m === 'v'
    ? 'Click to place column line — right-click any line to edit page scope'
    : 'Click to place area line — right-click any line to edit page scope';
  $('ctb-label').textContent = lbl;
}

// ════════════════════════════════════════════════════════════════════
// CLEAR
// ════════════════════════════════════════════════════════════════════
function bindClearButtons() {
  $('btn-clear-all')?.addEventListener('click', () => {
    if (!confirm('Clear all PDFs, lines and extracted data?')) return;
    State.pdfs.length  = 0;
    State.LINES.length = 0;
    State.setAidx(-1);
    State.setCurPg(1);
    State.setTData([]); State.setTHdrs([]); State.setPStats([]);
    Canvas.cancelMode();
    resetView();
    UI.renderPdfList();
    UI.renderLineSidebar();
    UI.updatePgNote();
    updateZipBtn();
    UI.toast('All data cleared', 'in');
  });

  $('btn-clear-lines')?.addEventListener('click', () => {
    if (!State.LINES.length) return;
    if (!confirm('Remove all lines?')) return;
    State.LINES.length = 0;
    Canvas.redrawSVG();
    UI.renderLineSidebar();
    UI.updatePgNote();
    UI.updateStrip();
    UI.toast('All lines removed', 'in');
  });
}

// ════════════════════════════════════════════════════════════════════
// SETTINGS — live watchers
// ════════════════════════════════════════════════════════════════════
function bindSettings() {
  $('tol-range')?.addEventListener('input', () => {
    $('tol-val').textContent = $('tol-range').value + 'px';
  });
  $('tog-ghost')?.addEventListener('change', Canvas.redrawSVG);
  $('tog-ruler')?.addEventListener('change', Canvas.redrawSVG);
}

// ════════════════════════════════════════════════════════════════════
// PAGE STRIP
// ════════════════════════════════════════════════════════════════════
function bindStrip() {
  $('btn-strip')?.addEventListener('click', () => {
    const strip = $('strip');
    strip.classList.toggle('on');
    if (strip.classList.contains('on')) UI.updateStrip();
  });
}

// ════════════════════════════════════════════════════════════════════
// LINE MAP MODAL
// ════════════════════════════════════════════════════════════════════
function bindLineMap() {
  $('btn-linemap')?.addEventListener('click', () => {
    if (State.aidx < 0) return;
    const tp = State.pdfs[State.aidx].totalPages;
    let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;padding:12px">';
    for (let p = 1; p <= tp; p++) {
      const vls = State.vLinesForPg(p, tp);
      const hls = State.hLinesForPg(p, tp);
      const cur = p === State.curPg;
      html += `<div style="background:var(--sur);border:1px solid ${cur?'var(--amber)':'var(--bdr)'};
        border-radius:8px;padding:8px;font-size:11px">
        <div style="font-weight:700;color:${cur?'var(--amber)':'var(--t1)'};margin-bottom:4px;
          display:flex;align-items:center;justify-content:space-between">
          <span>Page ${p}${cur?' ●':''}</span>
          <button onclick="window.appPDF.gotoPage(${p});window.appUI.closeModal()"
            style="background:none;border:none;color:var(--cyan);font-size:10px;cursor:pointer;font-family:inherit">
            jump →</button></div>`;
      if (!vls.length && !hls.length) {
        html += '<span style="color:var(--t2);font-size:10px">no lines</span>';
      } else {
        html += vls.map(l => `<span style="display:inline-block;background:var(--aA);border:1px solid rgba(245,158,11,.3);
          color:var(--amber);border-radius:10px;padding:1px 5px;font-size:9px;margin:1px">
          ${State.esc(l.name)} x=${Math.round(l.coord)}</span>`).join('');
        html += hls.map(l => `<span style="display:inline-block;background:var(--pA);border:1px solid rgba(139,92,246,.3);
          color:var(--purpleL);border-radius:10px;padding:1px 5px;font-size:9px;margin:1px">
          ${State.esc(l.name)} y=${Math.round(l.coord)}</span>`).join('');
      }
      html += '</div>';
    }
    html += '</div>';
    UI.showModal('Line Map — All Pages', html);
  });
}

// ════════════════════════════════════════════════════════════════════
// EXPORT buttons (sidebar + export pane)
// ════════════════════════════════════════════════════════════════════
function bindExport() {
  $('btn-extract')?.addEventListener('click', Extract.extractAll);
  $('btn-csv')?.addEventListener('click',     Extract.exportCSV);
  $('btn-tsv')?.addEventListener('click',     Extract.exportTSV);
  $('btn-zip')?.addEventListener('click',     Extract.exportZIP);
  $('btn-save-tpl')?.addEventListener('click',      Extract.saveTemplate);
  $('btn-load-tpl')?.addEventListener('click',      Extract.loadTemplate);
  $('btn-load-tpl-export')?.addEventListener('click', Extract.loadTemplate);

  // Export pane cards
  $('exp-csv')?.addEventListener('click',  Extract.exportCSV);
  $('exp-xls')?.addEventListener('click',  Extract.exportExcel);
  $('exp-xml')?.addEventListener('click',  Extract.exportXML);
  $('btn-gen-report')?.addEventListener('click', Extract.generateReport);
}

function bindMergeColumns() {
  $('merge-cols-on')?.addEventListener('change', updateZipBtn);
}

// ════════════════════════════════════════════════════════════════════
// SEARCH
// ════════════════════════════════════════════════════════════════════
function bindSearch() {
  let lastQ = '';
  const handleSearch = q => {
    lastQ = q;
    if (!State.tData.length) return;
    const rows = State.tData.map(d => d.row);
    const filt = q
      ? rows.filter(r => r.some(c => c.toLowerCase().includes(q.toLowerCase())))
      : rows;
    UI.renderTable(filt, State.tHdrs.length, q);
    const cnt = $('rp-search-cnt');
    if (cnt) cnt.textContent = q ? `${filt.length}r` : '';
    UI.switchPane('tbl');
  };

  $('rp-search-inp')?.addEventListener('input', e => handleSearch(e.target.value.trim()));
  $('global-search')?.addEventListener('input', e => {
    const v = e.target.value.trim();
    if ($('rp-search-inp')) $('rp-search-inp').value = v;
    handleSearch(v);
  });
}

// ════════════════════════════════════════════════════════════════════
// THEME
// ════════════════════════════════════════════════════════════════════
function bindTheme() {
  $('btn-theme')?.addEventListener('click', () => {
    document.body.classList.toggle('light');
  });
}

// ════════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ════════════════════════════════════════════════════════════════════
function bindKeyboard() {
  document.addEventListener('keydown', e => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key === 'ArrowRight' && !$('next-pg')?.disabled) $('next-pg').click();
    if (e.key === 'ArrowLeft'  && !$('prev-pg')?.disabled) $('prev-pg').click();
    if (e.key === 'v' || e.key === 'V') $('btn-add-v')?.click();
    if (e.key === 'h' || e.key === 'H') $('btn-add-h')?.click();
    if (e.key === 'Escape') { Canvas.cancelMode(); closeCtxMenu(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') { e.preventDefault(); $('btn-extract')?.click(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); Extract.saveTemplate(); }
    if (e.key === '+' || e.key === '=') Canvas.setZoom(State.scale + .25);
    if (e.key === '-') Canvas.setZoom(Math.max(.3, State.scale - .25));
  });
}

// ════════════════════════════════════════════════════════════════════
// DROP ZONE
// ════════════════════════════════════════════════════════════════════
function bindDropZone() {
  const dz  = $('dropzone');
  const fin = $('file-input');
  dz?.addEventListener('click',     () => fin.click());
  dz?.addEventListener('dragover',  e  => { e.preventDefault(); dz.classList.add('dragover'); });
  dz?.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz?.addEventListener('drop',      e  => { e.preventDefault(); dz.classList.remove('dragover'); loadFiles(e.dataTransfer.files); });
  fin?.addEventListener('change', () => { loadFiles(fin.files); fin.value = ''; });

  // Also allow drop on the entire canvas area
  $('canvas-wrap')?.addEventListener('dragover',  e => e.preventDefault());
  $('canvas-wrap')?.addEventListener('drop', e => {
    e.preventDefault();
    loadFiles(e.dataTransfer.files);
  });
}

// ════════════════════════════════════════════════════════════════════
// MODAL dismiss
// ════════════════════════════════════════════════════════════════════
function bindModal() {
  $('modal-overlay')?.addEventListener('click', e => {
    if (e.target === $('modal-overlay')) UI.closeModal();
  });
}

// ════════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
function init() {
  // PDF.js worker
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  // Init canvas event handlers
  Canvas.initDragHandlers();
  Canvas.initCanvasClick();

  // Init context menu
  initCtxMenu();

  // Init tabs
  UI.initTabs();

  // Bind all controls
  bindDropZone();
  bindNav();
  bindZoom();
  bindModeButtons();
  bindSettings();
  bindStrip();
  bindLineMap();
  bindExport();
  bindMergeColumns();
  bindSearch();
  bindTheme();
  bindClearButtons();
  bindKeyboard();
  bindModal();

  // Accordion toggles exposed to onclick
  window.toggleAcc = UI.toggleAcc;
  console.log('MarkPDF Pro initialized ✓');
}

document.addEventListener('DOMContentLoaded', init);
