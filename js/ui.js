/**
 * MarkPDF Pro — ui.js
 * Renders sidebar line lists, stats, tabs, toasts, page strip, modal.
 */

import {
  pdfs, aidx, curPg, LINES,
  vLinesForPg, hLinesForPg,
  totalPages, lineOnPage, pagesForLine,
  tData, tHdrs, pStats, activity,
  setTHdrs, esc,
} from './state.js';

import { redrawSVG } from './canvas.js';

// ── Toast ──────────────────────────────────────────────────────────────
const TOAST_ICONS = {
  ok: 'fa-circle-check',
  er: 'fa-circle-exclamation',
  wn: 'fa-triangle-exclamation',
  in: 'fa-circle-info',
};

export function toast(msg, type = 'in') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa ${TOAST_ICONS[type] || TOAST_ICONS.in}"></i><span>${msg}</span>`;
  document.getElementById('toast-container')?.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .24s';
    el.style.opacity    = '0';
    setTimeout(() => el.remove(), 240);
  }, 3200);
}

// ── Accordion toggle ───────────────────────────────────────────────────
export function toggleAcc(id) {
  document.getElementById(id)?.classList.toggle('open');
}

// ── Sidebar line lists ─────────────────────────────────────────────────
export function renderLineSidebar() {
  const tp   = totalPages();
  const vls  = LINES.filter(l => l.type === 'v');
  const hls  = LINES.filter(l => l.type === 'h');

  document.getElementById('v-line-count').textContent = vls.length;
  document.getElementById('h-line-count').textContent = hls.length;
  document.getElementById('line-total-badge').textContent = LINES.length;

  const vEl = document.getElementById('v-line-list');
  const hEl = document.getElementById('h-line-list');

  vEl.innerHTML = vls.length
    ? vls.map(l => _lineRow(l, tp)).join('')
    : '<div class="empty-hint">No column lines — right-click after placing</div>';

  hEl.innerHTML = hls.length
    ? hls.map(l => _lineRow(l, tp)).join('')
    : '<div class="empty-hint">No area lines — right-click after placing</div>';
}

function _lineRow(l, tp) {
  const coord   = Math.round(l.coord);
  const coordLbl= l.type === 'v' ? `x=${coord}` : `y=${coord}`;
  const onCur   = lineOnPage(l, curPg, tp);
  const tags    = _scopeTags(l, tp);
  return `
  <div class="lrow ${l.type === 'v' ? 'vt' : 'ht'}${onCur ? '' : ' dim'}" id="lrow-${l.id}">
    <div class="lrow-top">
      <i class="fa ${l.type === 'v' ? 'fa-grip-lines-vertical' : 'fa-grip-lines'} lrow-ic"></i>
      <span class="lrow-name" onclick="window.appUI.promptRename(${l.id})"
            title="Click to rename">${esc(l.name)}</span>
      <span class="lrow-coord" id="lrc-${l.id}">${coordLbl}</span>
      <div class="lrow-actions">
        <button class="lrow-btn" title="Edit scope"
          onclick="window.appUI.openCtxFromList(${l.id})">
          <i class="fa fa-pen-to-square"></i>
        </button>
        <button class="lrow-btn del" title="Delete"
          onclick="window.appUI.deleteLine(${l.id})">
          <i class="fa fa-xmark"></i>
        </button>
      </div>
    </div>
    <div class="lrow-scope">${tags}</div>
  </div>`;
}

function _scopeTags(l, tp) {
  const spec = String(l?.pageSpec ?? l?.scope ?? '').trim().toLowerCase();
  if (spec === 'all')
    return `<span class="stag st-all"><i class="fa fa-globe" style="font-size:8px"></i> all ${tp}</span>`;
  const pages = pagesForLine(l, tp);
  if (spec === 'odd')
    return `<span class="stag st-cst"><i class="fa fa-1" style="font-size:8px"></i> odd</span>`;
  if (spec === 'even')
    return `<span class="stag st-cst"><i class="fa fa-2" style="font-size:8px"></i> even</span>`;
  if (!pages || !pages.size)
    return `<span class="stag st-none">none</span>`;
  if (pages.size <= 4)
    return [...pages].sort((a, b) => a - b)
      .map(p => `<span class="stag ${p === curPg ? 'st-cur' : 'st-cst'}">p${p}</span>`)
      .join('');
  return `<span class="stag st-cst">${pages.size} pages</span>`;
}

export function updatePgNote() {
  const tp = totalPages();
  const vn = vLinesForPg(curPg, tp).length;
  const hn = hLinesForPg(curPg, tp).length;
  const el = document.getElementById('pg-note');
  if (!el) return;
  el.textContent = (vn || hn)
    ? `pg ${curPg}: ${vn} col · ${hn} area · ${LINES.length} total defined`
    : 'No lines on this page — ghost lines from other pages may appear';
}

// ── PDF list ──────────────────────────────────────────────────────────
export function renderPdfList() {
  document.getElementById('pdf-count').textContent = pdfs.length;
  const el = document.getElementById('pdf-list');
  if (!pdfs.length) {
    el.innerHTML = '<div class="empty-hint">No files loaded</div>';
    return;
  }
  el.innerHTML = pdfs.map((f, i) => `
    <div class="pdf-item${i === aidx ? ' active' : ''}"
         onclick="window.appPDF.switchPDF(${i})" title="${esc(f.name)}">
      <i class="fa fa-file-pdf pdf-item-icon"></i>
      <span class="pdf-item-name">${esc(f.name)}</span>
      <span class="pdf-item-pages">${f.totalPages}p</span>
      <button class="pdf-item-del"
        onclick="event.stopPropagation();window.appPDF.removePDF(${i})">
        <i class="fa fa-xmark"></i>
      </button>
    </div>`).join('');
}

// ── Tabs ──────────────────────────────────────────────────────────────
export function initTabs() {
  document.querySelectorAll('.rp-tab').forEach(tab => {
    tab.addEventListener('click', () => switchPane(tab.dataset.pane));
  });
}
export function switchPane(pane) {
  document.querySelectorAll('.rp-tab').forEach(t => t.classList.toggle('on', t.dataset.pane === pane));
  document.querySelectorAll('.rp-pane').forEach(p => p.classList.toggle('on', p.id === `pane-${pane}`));
}

// ── Table render ──────────────────────────────────────────────────────
export function renderTable(rows, nc, q = '') {
  const tc = document.getElementById('table-container');
  if (!rows.length) {
    tc.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;
      justify-content:center;height:160px;gap:8px;color:var(--t2)">
      <i class="fa fa-table" style="font-size:28px;opacity:.3"></i>
      <p style="font-size:11px;text-align:center;max-width:180px;line-height:1.5">No data found</p>
      </div>`;
    return;
  }
  const hl = s => {
    if (!q) return esc(s);
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return esc(s).replace(re, m => `<mark>${m}</mark>`);
  };
  const th = `<thead><tr>${tHdrs.map((h, i) =>
    `<th onclick="window.appUI.editHeader(${i})">${esc(h)}</th>`
  ).join('')}</tr></thead>`;
  const tb = `<tbody>${rows.map(r =>
    `<tr>${r.map((c, ci) =>
      `<td class="${c ? (ci === r.length - 1 && document.getElementById('tog-pgcol')?.checked ? 'pgc' : '') : 'ec'}">${hl(c)}</td>`
    ).join('')}</tr>`
  ).join('')}</tbody>`;
  tc.innerHTML = `<table id="data-table">${th}${tb}</table>`;

  // Update stats bar
  document.getElementById('ins-pages').textContent = pStats.length;
  document.getElementById('ins-rows').innerHTML    = `${rows.length} <span style="font-size:11px;font-weight:500">Rows</span>`;
  document.getElementById('ins-cols').textContent  = nc;
  document.getElementById('ins-cells').textContent = rows.reduce((s, r) => s + r.filter(c => c && c.trim()).length, 0);
}

export function editHeader(i) {
  const th = document.querySelectorAll('#data-table thead th')[i];
  if (!th) return;
  const cur = tHdrs[i];
  const inp = document.createElement('input');
  inp.value = cur;
  inp.style.width = '100%';
  th.innerHTML = '';
  th.appendChild(inp);
  inp.focus(); inp.select();
  const done = () => { tHdrs[i] = inp.value || cur; /* re-render */ };
  inp.addEventListener('blur', done);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') done();
    if (e.key === 'Escape') { tHdrs[i] = cur; }
  });
}

// ── Stats render ──────────────────────────────────────────────────────
export function renderStats(rows, nc) {
  document.getElementById('sv1').textContent = rows.length;
  document.getElementById('sv2').textContent = nc;
  document.getElementById('sv3').textContent = pStats.length;
  document.getElementById('sv4').textContent = rows.reduce((s, r) => s + r.filter(c => c && c.trim()).length, 0);

  // Bar chart
  const mx   = Math.max(...pStats.map(p => p.rows), 1);
  const bars = document.getElementById('chart-bars');
  if (!bars) return;
  document.getElementById('chart-range').textContent = pStats.length ? `P1–P${pStats.length}` : '';
  bars.innerHTML = pStats.map(p => `
    <div class="cbar-wrap">
      <span class="cbar-val">${p.rows}</span>
      <div class="cbar" style="height:${Math.max(3, Math.round(p.rows / mx * 70))}px"></div>
      <span class="cbar-lbl">P${p.pg}</span>
    </div>`).join('');
}

// ── Activity feed ─────────────────────────────────────────────────────
export function renderActivity() {
  const el = document.getElementById('activity-list');
  if (!el) return;
  el.innerHTML = activity.length
    ? activity.map(a => `
        <div class="a-item">
          <div class="a-dot"></div>
          <span class="a-name">${esc(a.name)} processed - accuracy check ${a.acc}%</span>
          <span class="a-time">${a.time}</span>
        </div>`).join('')
    : '<div class="empty-hint">No activity yet</div>';
}

// ── Raw CSV pane ──────────────────────────────────────────────────────
export function renderRaw(rows) {
  const lines = [
    tHdrs.map(h => `"${h}"`).join(','),
    ...rows.map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(',')),
  ];
  const el = document.getElementById('raw-output');
  if (el) el.textContent = lines.slice(0, 60).join('\n')
    + (lines.length > 60 ? `\n…(${lines.length - 60} more rows)` : '');
}

// ── Page strip ────────────────────────────────────────────────────────
export function updateStrip() {
  const strip = document.getElementById('strip');
  if (!strip.classList.contains('on') || aidx < 0) return;
  const tp = pdfs[aidx].totalPages;
  strip.innerHTML = '';
  for (let p = 1; p <= tp; p++) {
    const hv = vLinesForPg(p, tp).length > 0;
    const hh = hLinesForPg(p, tp).length > 0;
    const el = document.createElement('div');
    el.className = `pg-thumb${p === curPg ? ' active' : ''}`;
    el.innerHTML = `<div class="pg-thumb-box${hv ? ' has-v' : ''}${hh ? ' has-h' : ''}">
      <span>${p}</span></div><span class="pg-thumb-n">${p}</span>`;
    el.addEventListener('click', () => window.appPDF.gotoPage(p));
    strip.appendChild(el);
  }
}
export function updateStripActive(n) {
  document.querySelectorAll('.pg-thumb')
    .forEach((t, i) => t.classList.toggle('active', i + 1 === n));
}

// ── Modal ─────────────────────────────────────────────────────────────
export function showModal(title, bodyHTML) {
  document.getElementById('modal-title-text').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-overlay').classList.add('show');
}
export function closeModal() {
  document.getElementById('modal-overlay')?.classList.remove('show');
}

// ── Global UI callbacks exposed to onclick HTML attrs ─────────────────
window.appUI = {
  promptRename(id) {
    const { findLine, LINES } = window._state;
    const l = findLine(id); if (!l) return;
    const n = prompt('Rename:', l.name);
    if (n !== null && n.trim()) l.name = n.trim();
    renderLineSidebar(); redrawSVG();
  },
  openCtxFromList(id) {
    const el = document.getElementById(`lrow-${id}`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const fakeE = { clientX: r.right - 30, clientY: r.top,
      preventDefault: () => {}, stopPropagation: () => {} };
    window._ctx.showCtxMenu(fakeE, id);
  },
  deleteLine(id) {
    const { LINES, removeLine } = window._state;
    const removed = removeLine(id);
    if (removed) {
      renderLineSidebar(); updatePgNote(); redrawSVG();
      toast(`Deleted "${removed.name}"`, 'wn');
    }
  },
  editHeader,
  switchPane,
  toggleAcc,
  closeModal,
};
