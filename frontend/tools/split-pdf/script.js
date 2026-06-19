/**
 * IshuTools.fun — Split PDF v9.0
 * Ultra-professional split tool script
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 */

'use strict';

/* ── Module-scope state (null until DOMContentLoaded) ──────────────── */
let D = null;
let FILE = null;
let FILE_INFO = null;
let CURRENT_MODE = 'all';
let PAGE_SEL = new Set();
let _shiftStart = -1;
let _splitBlob = null;
let _splitFileName = 'split.zip';
let _simInterval = null;
let _progressPct = 0;
let _pdfJsDoc = null;
let _thumbsLoading = false;
let _autoDetectPending = false;
let _recommendedMode = null;

/* ── Sounds shorthand ───────────────────────────────────────────────── */
const S = key => {
  try { if (window.SOUNDS && window.SOUNDS[key]) window.SOUNDS[key](); } catch (_) {}
};

/* ── Utility helpers ────────────────────────────────────────────────── */
function fmtBytes(b) {
  if (b == null || b < 0) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(2) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

function fmtKB(kb) {
  if (!kb) return '—';
  if (kb < 1024) return kb + ' KB';
  return (kb / 1024).toFixed(2) + ' MB';
}

function parseRangeStr(str, total) {
  if (!str || !total) return [];
  const pages = new Set();
  const parts = str.split(',').map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    const low = part.toLowerCase().trim();
    if (low === 'all' || low === '') {
      for (let i = 1; i <= total; i++) pages.add(i);
    } else if (low === 'odd') {
      for (let i = 1; i <= total; i += 2) pages.add(i);
    } else if (low === 'even') {
      for (let i = 2; i <= total; i += 2) pages.add(i);
    } else if (/^first\s+(\d+)$/.test(low)) {
      const n = parseInt(low.match(/\d+/)[0]);
      for (let i = 1; i <= Math.min(n, total); i++) pages.add(i);
    } else if (low === 'first') {
      pages.add(1);
    } else if (/^last\s+(\d+)$/.test(low)) {
      const n = parseInt(low.match(/\d+/)[0]);
      for (let i = Math.max(1, total - n + 1); i <= total; i++) pages.add(i);
    } else if (low === 'last') {
      pages.add(total);
    } else if (/^(\d+)-(\d+)$/.test(low)) {
      const [, a, b] = low.match(/^(\d+)-(\d+)$/);
      const start = parseInt(a), end = parseInt(b);
      for (let i = start; i <= Math.min(end, total); i++) pages.add(i);
    } else if (/^(\d+)-end$/.test(low)) {
      const start = parseInt(low.match(/\d+/)[0]);
      for (let i = start; i <= total; i++) pages.add(i);
    } else if (/^\d+$/.test(low)) {
      const n = parseInt(low);
      if (n >= 1 && n <= total) pages.add(n);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

function parseGroupsStr(str, total) {
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(Boolean).map(seg => {
    return parseRangeStr(seg, total);
  }).filter(g => g.length > 0);
}

function stemName(filename) {
  if (!filename) return 'split';
  return filename.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_\-\.]/g, '_').slice(0, 60) || 'split';
}

function showEl(el) { if (el) el.removeAttribute('hidden'); }
function hideEl(el) { if (el) el.setAttribute('hidden', ''); }
function setHidden(el, hidden) { hidden ? hideEl(el) : showEl(el); }

/* ── Animated Background Canvas ────────────────────────────────────── */
function initBgCanvas() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas) return;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;

  let W, H, particles = [];
  const PARTICLE_COUNT = 55;
  const isDark = () => document.documentElement.getAttribute('data-theme') !== 'light';

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function makeParticle() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 2.2 + 0.5,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      alpha: Math.random() * 0.35 + 0.05,
      hue: Math.random() > 0.5 ? 239 : 268,
    };
  }

  function init() {
    resize();
    particles = Array.from({ length: PARTICLE_COUNT }, makeParticle);
  }

  function draw() {
    ctx2d.clearRect(0, 0, W, H);
    const base = isDark() ? '255,255,255' : '99,102,241';
    for (const p of particles) {
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx2d.fillStyle = `rgba(${base},${p.alpha})`;
      ctx2d.fill();
      p.x += p.vx; p.y += p.vy;
      if (p.x < -10) p.x = W + 10;
      if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10;
      if (p.y > H + 10) p.y = -10;
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  init();
  draw();
}

/* ── Theme Toggle ───────────────────────────────────────────────────── */
function initTheme() {
  const root = document.documentElement;
  const saved = localStorage.getItem('sp-theme') || 'dark';
  root.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function updateThemeIcon(theme) {
  if (!D || !D.themeIcon) return;
  D.themeIcon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
}

function toggleTheme() {
  const root = document.documentElement;
  const current = root.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('sp-theme', next);
  updateThemeIcon(next);
  S('playToggleOnSound');
}

/* ── Toast notifications ────────────────────────────────────────────── */
function toast(msg, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `sp-toast ${type}`;
  const icons = { info: 'fa-circle-info', success: 'fa-check-circle', error: 'fa-circle-exclamation', warning: 'fa-triangle-exclamation' };
  el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('exiting');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/* ── Progress bar ───────────────────────────────────────────────────── */
function setProgress(pct, title, sub) {
  if (!D) return;
  _progressPct = Math.min(100, Math.max(0, pct));
  if (D.progressBar) {
    D.progressBar.style.width = _progressPct + '%';
    D.progressBar.setAttribute('aria-valuenow', _progressPct);
  }
  if (D.progressPct) D.progressPct.textContent = Math.round(_progressPct) + '%';
  if (title && D.progressTitle) D.progressTitle.textContent = title;
  if (sub && D.progressSub) D.progressSub.textContent = sub;
}

function addProgressStep(text) {
  if (!D || !D.progressSteps) return;
  const el = document.createElement('div');
  el.className = 'sp-progress-step';
  el.innerHTML = `<i class="fa-solid fa-check"></i> ${text}`;
  D.progressSteps.appendChild(el);
}

function startSimProgress(endAt = 88) {
  clearInterval(_simInterval);
  _progressPct = 5;
  setProgress(5, 'Processing…', 'Reading PDF structure');
  const steps = [
    [15, 'Reading PDF…', 'Analysing document structure'],
    [32, 'Splitting…', 'Applying split mode'],
    [55, 'Extracting pages…', 'Lossless page copy in progress'],
    [72, 'Packaging…', 'Creating output PDFs'],
    [endAt, 'Building ZIP…', 'Almost done'],
  ];
  let si = 0;
  _simInterval = setInterval(() => {
    if (si < steps.length) {
      const [p, t, s] = steps[si++];
      setProgress(p, t, s);
      S('playProgressTick');
    } else {
      clearInterval(_simInterval);
    }
  }, 600);
}

/* ── File upload & info ─────────────────────────────────────────────── */
function onFileSelected(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    toast('Please upload a PDF file.', 'error');
    S('playErrorSound');
    return;
  }
  FILE = file;
  S('playFileAddSound');
  if (D.uploadSubText) D.uploadSubText.textContent = file.name;
  showFileInfo(file);
  fetchFileInfo(file);
  fetchAutoDetect(file);
}

function showFileInfo(file) {
  if (!D) return;
  hideEl(D.dropZone);
  showEl(D.fileInfoWrap);
  if (D.fileName) D.fileName.textContent = file.name;
  if (D.chipSize) D.chipSize.innerHTML = `<i class="fa-solid fa-weight-hanging"></i> ${fmtBytes(file.size)}`;
  if (D.chipPages) D.chipPages.innerHTML = `<i class="fa-solid fa-file-lines"></i> Loading…`;
  showEl(D.modesCard);
  showEl(D.advCard);
  showEl(D.actionCard);
  hideEl(D.presetsRow);
  updateSplitBtn();
}

async function fetchFileInfo(file) {
  const fd = new FormData();
  fd.append('file', file);
  try {
    const r = await fetch('/api/split-pdf/info', { method: 'POST', body: fd });
    const data = await r.json();
    if (!data.success) throw new Error(data.error || 'Info failed');
    FILE_INFO = data;
    updateFileChips(data);
    buildPageGrid(data.total_pages);
    updateModeBadges(data);
    updateChunkCount();
    updateSizeSplitPreview();
    showEl(D.presetsRow);
    showEl(D.optionsCard);
    updateSplitBtn();
    loadBookmarks(data);
    if (data.blank_pages > 0 && D.blankCountInfo) {
      D.blankCountInfo.textContent = ` ${data.blank_pages} blank page${data.blank_pages > 1 ? 's' : ''} detected.`;
    }
    if (D.thumbsWrap) {
      showEl(D.thumbsWrap);
      loadThumbnails(file, data.total_pages);
    }
  } catch (e) {
    if (D.chipPages) D.chipPages.innerHTML = `<i class="fa-solid fa-file-lines"></i> ? pages`;
    showEl(D.optionsCard);
    updateSplitBtn();
    toast('Could not read PDF info: ' + e.message, 'warning');
  }
}

function updateFileChips(info) {
  if (!D) return;
  if (D.chipPages) D.chipPages.innerHTML = `<i class="fa-solid fa-file-lines"></i> ${info.total_pages} pages`;
  if (info.has_bookmarks && D.chipBookmarks) {
    const bkCount = info.bookmarks ? info.bookmarks.length : 0;
    D.chipBookmarks.innerHTML = `<i class="fa-solid fa-bookmark"></i> ${bkCount} chapter${bkCount !== 1 ? 's' : ''}`;
    D.chipBookmarks.classList.remove('sp-chip-hidden');
  }
  if (info.blank_pages > 0 && D.chipBlanks) {
    D.chipBlanks.innerHTML = `<i class="fa-regular fa-file"></i> ${info.blank_pages} blank${info.blank_pages > 1 ? 's' : ''}`;
    D.chipBlanks.classList.remove('sp-chip-hidden');
  }
  if (info.is_encrypted && D.chipEncrypted) {
    D.chipEncrypted.classList.remove('sp-chip-hidden');
  }
  if (info.is_scanned && D.chipScanned) {
    D.chipScanned.classList.remove('sp-chip-hidden');
  }
}

async function fetchAutoDetect(file) {
  if (_autoDetectPending) return;
  _autoDetectPending = true;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const r = await fetch('/api/split-pdf/auto-detect', { method: 'POST', body: fd });
    const data = await r.json();
    if (data.success && data.recommended_mode) {
      _recommendedMode = data.recommended_mode;
      if (D.recommendBanner && D.recommendText) {
        D.recommendText.textContent = `💡 Recommended: "${getModeLabel(data.recommended_mode)}" — ${data.reason || ''}`;
        showEl(D.recommendBanner);
      }
    }
  } catch (_) {}
  _autoDetectPending = false;
}

function getModeLabel(mode) {
  const labels = { all: 'All Pages', range: 'Page Range', range_groups: 'Range Groups', every_n: 'Every N Pages', bookmarks: 'By Bookmarks', blank_pages: 'Blank Separator', size_limit: 'By File Size', odd_even: 'Odd / Even' };
  return labels[mode] || mode;
}

/* ── Thumbnail loading (PDF.js) ─────────────────────────────────────── */
async function loadThumbnails(file, totalPages) {
  if (_thumbsLoading) return;
  _thumbsLoading = true;
  if (D.thumbsCount) D.thumbsCount.textContent = 'loading…';
  const strip = D.thumbsStrip;
  if (!strip) { _thumbsLoading = false; return; }
  strip.innerHTML = '';

  try {
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js not ready');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const ab = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: ab }).promise;
    _pdfJsDoc = pdfDoc;
    const showCount = Math.min(totalPages, 20);
    if (D.thumbsCount) D.thumbsCount.textContent = `${showCount} of ${totalPages}`;
    for (let i = 1; i <= showCount; i++) {
      const pg = await pdfDoc.getPage(i);
      const vp = pg.getViewport({ scale: 0.28 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      const c2d = canvas.getContext('2d');
      await pg.render({ canvasContext: c2d, viewport: vp }).promise;
      const wrap = document.createElement('div');
      wrap.className = 'sp-thumb';
      wrap.setAttribute('data-page', i);
      wrap.setAttribute('role', 'listitem');
      wrap.setAttribute('aria-label', `Page ${i}`);
      wrap.setAttribute('title', `Page ${i}`);
      wrap.appendChild(canvas);
      const selMark = document.createElement('div');
      selMark.className = 'sp-thumb-sel';
      selMark.innerHTML = '<i class="fa-solid fa-check"></i>';
      wrap.appendChild(selMark);
      const lbl = document.createElement('div');
      lbl.className = 'sp-thumb-num';
      lbl.textContent = i;
      wrap.appendChild(lbl);
      wrap.addEventListener('click', () => onThumbClick(i));
      strip.appendChild(wrap);
    }
    if (D.thumbsCount) D.thumbsCount.textContent = `${showCount} of ${totalPages} shown`;
  } catch (e) {
    if (D.thumbsCount) D.thumbsCount.textContent = 'Preview unavailable';
    strip.innerHTML = '<span style="color:var(--text3);font-size:.8rem;padding:8px;">Thumbnails unavailable — PDF.js not loaded</span>';
  }
  _thumbsLoading = false;
}

function onThumbClick(pageNum) {
  if (CURRENT_MODE !== 'range') {
    setMode('range');
  }
  if (PAGE_SEL.has(pageNum)) {
    PAGE_SEL.delete(pageNum);
  } else {
    PAGE_SEL.add(pageNum);
  }
  syncInputFromGrid();
  updateGridHighlights();
  updateThumbHighlights();
  S('playSort');
}

function updateThumbHighlights() {
  if (!D || !D.thumbsStrip) return;
  D.thumbsStrip.querySelectorAll('.sp-thumb').forEach(el => {
    const pg = parseInt(el.getAttribute('data-page'));
    el.classList.toggle('pg-selected', PAGE_SEL.has(pg));
  });
}

/* ── Mode cards ─────────────────────────────────────────────────────── */
const MODE_DESCS = {
  all: 'Extract every page as its own PDF file. Perfect for archiving or processing pages individually.',
  range: 'Extract a specific set of pages into one PDF. Use ranges like "1-5, 8, 10-end".',
  range_groups: 'Each comma-separated range produces a separate output PDF. Great for splitting chapters manually.',
  every_n: 'Split into equal-sized chunks — every N pages becomes one PDF file.',
  bookmarks: 'Split at bookmark/chapter boundaries. Each chapter becomes a separate PDF file.',
  blank_pages: 'Use blank white pages as dividers. PDFs are split at each blank page.',
  size_limit: 'Split to fit into a target file size. Useful for email attachments or upload limits.',
  odd_even: 'Produce exactly 2 PDFs: one with odd pages, one with even pages.',
};

function setMode(mode) {
  CURRENT_MODE = mode;
  if (!D) return;
  D.modesGrid.querySelectorAll('.sp-mode-card').forEach(card => {
    const m = card.getAttribute('data-mode');
    const active = m === mode;
    card.classList.toggle('active', active);
    card.setAttribute('aria-checked', String(active));
  });
  if (D.modeDesc) D.modeDesc.textContent = MODE_DESCS[mode] || '';
  if (D.modeSubText) D.modeSubText.textContent = getModeLabel(mode) + ' selected';

  const optIds = ['opts-range', 'opts-range_groups', 'opts-every_n', 'opts-bookmarks', 'opts-blank_pages', 'opts-size_limit', 'opts-odd_even'];
  optIds.forEach(id => hideEl(document.getElementById(id)));
  showEl(document.getElementById('opts-' + mode));
  S('playExpandSound');

  if (mode !== 'all' && mode !== 'odd_even' && mode !== 'blank_pages') {
    showEl(D.splitPreviewBox);
  } else {
    hideEl(D.splitPreviewBox);
  }
  updateSplitPreview();
  updateSplitBtn();
}

function updateModeBadges(info) {
  if (!info || !D) return;
  const total = info.total_pages || 0;
  const setBadge = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };
  setBadge('badge-all', total + ' files');
  setBadge('badge-range', 'Up to ' + total + ' pgs');
  setBadge('badge-range_groups', 'Multi-range');
  setBadge('badge-every_n', Math.ceil(total / 5) + ' chunks');
  const bk = info.bookmarks ? info.bookmarks.length : 0;
  setBadge('badge-bookmarks', bk > 0 ? bk + ' chapters' : 'No chapters');
  const bl = info.blank_pages || 0;
  setBadge('badge-blank_pages', bl > 0 ? bl + ' blanks' : 'Auto-detect');
  setBadge('badge-size_limit', 'Fit in MB');
  setBadge('badge-odd_even', '2 files');
}

/* ── Page grid (range mode) ─────────────────────────────────────────── */
function buildPageGrid(total) {
  if (!D || !D.pgrid) return;
  D.pgrid.innerHTML = '';
  if (!total) return;
  for (let i = 1; i <= Math.min(total, 300); i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sp-pg-cell';
    btn.textContent = i;
    btn.setAttribute('aria-label', 'Page ' + i);
    btn.setAttribute('data-pg', i);
    btn.addEventListener('click', e => onGridClick(i, e));
    D.pgrid.appendChild(btn);
  }
  if (total > 300) {
    const more = document.createElement('div');
    more.className = 'sp-pg-overflow';
    more.innerHTML = `<i class="fa-solid fa-ellipsis"></i> +${total - 300} more pages — use range input`;
    D.pgrid.appendChild(more);
  }
  updateGridHighlights();
}

function onGridClick(pageNum, e) {
  const total = FILE_INFO ? FILE_INFO.total_pages : 0;
  if (e.shiftKey && _shiftStart >= 0) {
    const lo = Math.min(_shiftStart, pageNum), hi = Math.max(_shiftStart, pageNum);
    for (let i = lo; i <= hi; i++) PAGE_SEL.add(i);
  } else {
    if (PAGE_SEL.has(pageNum)) {
      PAGE_SEL.delete(pageNum);
      _shiftStart = -1;
    } else {
      PAGE_SEL.add(pageNum);
      _shiftStart = pageNum;
    }
  }
  syncInputFromGrid();
  updateGridHighlights();
  updateThumbHighlights();
  S('playSort');
}

function updateGridHighlights() {
  if (!D || !D.pgrid) return;
  D.pgrid.querySelectorAll('.sp-pg-cell').forEach(btn => {
    const pg = parseInt(btn.getAttribute('data-pg'));
    btn.classList.toggle('selected', PAGE_SEL.has(pg));
  });
  const cnt = PAGE_SEL.size;
  if (D.pgridSelCount) D.pgridSelCount.textContent = cnt > 0 ? `${cnt} page${cnt !== 1 ? 's' : ''} selected` : 'Click pages to select (Shift+click for range)';
  updateRangePreview();
  updateSplitBtn();
}

function syncInputFromGrid() {
  if (!D || !D.rangeInput) return;
  if (PAGE_SEL.size === 0) { D.rangeInput.value = ''; return; }
  const sorted = [...PAGE_SEL].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0], end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) { end = sorted[i]; }
    else { ranges.push(start === end ? `${start}` : `${start}-${end}`); start = end = sorted[i]; }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  D.rangeInput.value = ranges.join(', ');
  updateRangePreview();
}

function syncGridFromInput() {
  if (!D || !D.rangeInput || !FILE_INFO) return;
  const pages = parseRangeStr(D.rangeInput.value, FILE_INFO.total_pages);
  PAGE_SEL = new Set(pages);
  _shiftStart = -1;
  updateGridHighlights();
  updateThumbHighlights();
}

/* ── Range previews ─────────────────────────────────────────────────── */
function updateRangePreview() {
  if (!D || !D.rangePreview || !FILE_INFO) return;
  const val = D.rangeInput ? D.rangeInput.value.trim() : '';
  if (!val) {
    D.rangePreview.innerHTML = '<span class="sp-rp-hint">Enter a range to preview pages</span>';
    updateSplitPreviewText(0, 'range');
    return;
  }
  const pages = parseRangeStr(val, FILE_INFO.total_pages);
  if (pages.length === 0) {
    D.rangePreview.innerHTML = '<span class="sp-rp-invalid">No valid pages found</span>';
    return;
  }
  const preview = pages.slice(0, 20).map(p => `<span class="sp-rp-chip">${p}</span>`).join('');
  const extra = pages.length > 20 ? `<span class="sp-rp-hint">… +${pages.length - 20} more</span>` : '';
  D.rangePreview.innerHTML = preview + extra;
  updateSplitPreviewText(1, 'range');
  D.rangeInput.classList.toggle('valid', pages.length > 0);
}

function updateGroupsPreview() {
  if (!D || !D.groupsPreview || !FILE_INFO) return;
  const val = D.rangeGroupsInput ? D.rangeGroupsInput.value.trim() : '';
  if (!val) {
    D.groupsPreview.innerHTML = '<span class="sp-rp-hint">Each comma-separated range → its own PDF</span>';
    hideEl(D.groupsSplitPreview);
    return;
  }
  const groups = parseGroupsStr(val, FILE_INFO.total_pages);
  const cnt = groups.length;
  const chips = groups.slice(0, 5).map((g, i) => `<span class="sp-rp-chip">${g.length} pgs</span>`).join(' → ');
  const extra = cnt > 5 ? `<span class="sp-rp-hint"> + ${cnt - 5} more</span>` : '';
  D.groupsPreview.innerHTML = chips + extra;
  if (D.groupsSplitPreview) {
    showEl(D.groupsSplitPreview);
    const txt = document.getElementById('groupsSplitPreviewText');
    if (txt) txt.innerHTML = `Will create <strong>${cnt}</strong> file${cnt !== 1 ? 's' : ''}`;
  }
  updateSplitBtn();
}

function updateChunkCount() {
  if (!D || !D.nInput || !FILE_INFO) return;
  const n = parseInt(D.nInput.value) || 1;
  const total = FILE_INFO.total_pages || 0;
  const chunks = total > 0 ? Math.ceil(total / n) : '?';
  if (D.chunkCount) D.chunkCount.textContent = chunks;
  updateSplitPreviewText(typeof chunks === 'number' ? chunks : 0, 'every_n');
}

function updateSizeSplitPreview() {
  if (!D || !D.sizeSlider || !FILE_INFO) return;
  const mb = parseInt(D.sizeSlider.value) || 5;
  if (D.sizeVal) D.sizeVal.textContent = mb + ' MB';
  const fileMb = FILE_INFO.file_size_mb || 0;
  const est = fileMb > 0 ? Math.ceil(fileMb / mb) : '?';
  const txt = document.getElementById('sizeSplitPreviewText');
  if (txt) txt.innerHTML = `Estimated output: <strong>~${est} files</strong>`;
}

function updateSplitPreview() {
  if (!FILE_INFO) return;
  const total = FILE_INFO.total_pages || 0;
  switch (CURRENT_MODE) {
    case 'all':       updateSplitPreviewText(total, 'all'); break;
    case 'range':     updateRangePreview(); break;
    case 'range_groups': updateGroupsPreview(); break;
    case 'every_n':   updateChunkCount(); break;
    case 'bookmarks': break;
    case 'blank_pages': break;
    case 'size_limit': updateSizeSplitPreview(); break;
    case 'odd_even':  updateSplitPreviewText(2, 'odd_even'); break;
  }
}

function updateSplitPreviewText(count, mode) {
  if (!D || !D.splitPreviewText) return;
  const msgs = {
    all:        `Will create ${count} individual page files`,
    range:      count > 0 ? `Will extract selected pages into 1 PDF` : 'Select pages to extract',
    every_n:    `Will create ${count} chunk file${count !== 1 ? 's' : ''}`,
    odd_even:   'Will create 2 files: Odd + Even pages',
    bookmarks:  `Will split by ${count} bookmark chapter${count !== 1 ? 's' : ''}`,
    blank_pages:'Will split at blank page separators',
    size_limit: `Will split to fit size limit`,
    range_groups:`Will create ${count} file${count !== 1 ? 's' : ''}`,
  };
  D.splitPreviewText.textContent = msgs[mode] || msgs.all;
  if (count > 0) { showEl(D.splitPreviewBox); } else { hideEl(D.splitPreviewBox); }
}

/* ── Bookmarks list ─────────────────────────────────────────────────── */
function loadBookmarks(info) {
  if (!D || !D.bookmarksList) return;
  const bks = info.bookmarks || [];
  if (bks.length === 0) {
    D.bookmarksList.innerHTML = '<div class="sp-bk-empty"><i class="fa-solid fa-circle-info"></i> No bookmarks found in this PDF</div>';
    return;
  }
  D.bookmarksList.innerHTML = bks.slice(0, 50).map((bk, i) =>
    `<div class="sp-bookmark-item"><i class="fa-solid fa-bookmark"></i><span style="flex:1">${escHtml(bk[0])}</span><span style="color:var(--text3);font-size:.7rem">p.${bk[1] + 1}</span></div>`
  ).join('');
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Presets ────────────────────────────────────────────────────────── */
const PRESETS = {
  first3: { mode: 'range', range: 'first 3', label: 'First 3 pages' },
  first5: { mode: 'range', range: 'first 5', label: 'First 5 pages' },
  odd:    { mode: 'odd_even', label: 'Odd/Even split' },
  even:   { mode: 'odd_even', label: 'Odd/Even split' },
  last3:  { mode: 'range', range: 'last 3', label: 'Last 3 pages' },
  allpg:  { mode: 'all', label: 'All pages burst' },
};

function applyPreset(key) {
  const p = PRESETS[key];
  if (!p) return;
  setMode(p.mode);
  if (p.range && D.rangeInput) {
    D.rangeInput.value = p.range;
    syncGridFromInput();
    updateRangePreview();
  }
  D.modesGrid.querySelectorAll('.sp-preset-btn').forEach(btn =>
    btn.classList.toggle('active', btn.getAttribute('data-p') === key)
  );
  S('playPresetSound');
  toast(`Preset applied: ${p.label}`, 'info', 2000);
}

/* ── Quick-select buttons (range mode) ─────────────────────────────── */
function applyQuickSelect(qs) {
  if (!FILE_INFO || !D.rangeInput) return;
  const total = FILE_INFO.total_pages;
  const map = {
    all:    `1-${total}`,
    odd:    'odd',
    even:   'even',
    first5: 'first 5',
    last3:  'last 3',
  };
  if (map[qs]) {
    D.rangeInput.value = map[qs];
    syncGridFromInput();
    updateRangePreview();
    S('playSort');
  }
}

/* ── Advanced options toggle ────────────────────────────────────────── */
function toggleAdv() {
  if (!D) return;
  const expanded = D.advToggle.getAttribute('aria-expanded') === 'true';
  D.advToggle.setAttribute('aria-expanded', String(!expanded));
  setHidden(D.advBody, expanded);
  if (D.advArrow) D.advArrow.style.transform = expanded ? '' : 'rotate(180deg)';
  S(expanded ? 'playCollapseSound' : 'playExpandSound');
}

/* ── Split button state ─────────────────────────────────────────────── */
function updateSplitBtn() {
  if (!D || !D.splitBtn) return;
  let ready = !!FILE;
  if (CURRENT_MODE === 'range') ready = ready && PAGE_SEL.size > 0;
  if (CURRENT_MODE === 'range_groups') ready = ready && !!(D.rangeGroupsInput && D.rangeGroupsInput.value.trim());
  D.splitBtn.disabled = !ready;
  if (D.splitBtnBadge) D.splitBtnBadge.textContent = ready ? 'Ready' : 'Select options';
  if (D.fabBtn) setHidden(D.fabBtn, !ready);
}

/* ── Do Split ───────────────────────────────────────────────────────── */
async function doSplit() {
  if (!FILE || !D) return;
  S('playMergeStartSound');

  hideEl(D.actionCard);
  showEl(D.progressCard);
  if (D.progressSteps) D.progressSteps.innerHTML = '';
  setProgress(0, 'Starting split…', 'Preparing your PDF');
  startSimProgress(88);

  const fd = new FormData();
  fd.append('file', FILE);
  fd.append('mode', CURRENT_MODE);

  if (CURRENT_MODE === 'range') fd.append('ranges', D.rangeInput ? D.rangeInput.value : '');
  if (CURRENT_MODE === 'range_groups') fd.append('ranges', D.rangeGroupsInput ? D.rangeGroupsInput.value : '');
  if (CURRENT_MODE === 'every_n') fd.append('every_n', D.nInput ? D.nInput.value : '5');
  if (CURRENT_MODE === 'size_limit') fd.append('max_size_mb', D.sizeSlider ? D.sizeSlider.value : '5');

  if (D.passwordInput && D.passwordInput.value) fd.append('password', D.passwordInput.value);
  if (D.namingInput && D.namingInput.value) fd.append('naming_pattern', D.namingInput.value);
  if (D.zipCompressionSel) fd.append('zip_compression', D.zipCompressionSel.value);
  if (D.removeBlanksToggle) fd.append('remove_blanks', String(D.removeBlanksToggle.checked));
  if (D.includeManifestToggle) fd.append('include_manifest', String(D.includeManifestToggle.checked));

  const jobId = 'sp-' + Date.now();
  fd.append('job_id', jobId);

  try {
    const resp = await fetch('/api/split-pdf', { method: 'POST', body: fd });
    clearInterval(_simInterval);

    if (!resp.ok) {
      let errMsg = 'Split failed.';
      try { const j = await resp.json(); errMsg = j.error || errMsg; } catch (_) {}
      throw new Error(errMsg);
    }

    setProgress(95, 'Finalising…', 'Packing ZIP');
    addProgressStep('Split complete');
    addProgressStep('ZIP created');

    const blob = await resp.blob();
    setProgress(100, 'Done! ✓', '');
    addProgressStep('Ready to download');

    const fileCount  = parseInt(resp.headers.get('X-File-Count')  || '0');
    const totalPages = parseInt(resp.headers.get('X-Total-Pages') || '0');
    const skipped    = parseInt(resp.headers.get('X-Skipped-Blanks') || '0');
    const zipSizeKB  = parseInt(resp.headers.get('X-Zip-Size-KB') || '0');
    const fileNames  = (resp.headers.get('X-File-Names') || '').split('|').filter(Boolean);
    const dlName     = resp.headers.get('X-Download-Name') || (stemName(FILE.name) + '_split.zip');
    const procMs     = parseInt(resp.headers.get('X-Processing-Ms') || '0');

    _splitBlob     = blob;
    _splitFileName = dlName;

    await new Promise(res => setTimeout(res, 400));
    showResults({ fileCount, totalPages, skipped, zipSizeKB, fileNames, dlName, procMs });

  } catch (e) {
    clearInterval(_simInterval);
    hideEl(D.progressCard);
    showEl(D.actionCard);
    S('playErrorSound');
    toast('Error: ' + e.message, 'error', 6000);
  }
}

/* ── Show Results ───────────────────────────────────────────────────── */
function showResults({ fileCount, totalPages, skipped, zipSizeKB, fileNames, dlName, procMs }) {
  if (!D) return;
  S('playSuccessChime');

  hideEl(D.progressCard);
  showEl(D.resultsCard);

  if (D.resTitle) D.resTitle.textContent = '✅ Split Complete!';
  if (D.resSummary) {
    const secs = procMs > 0 ? ` in ${(procMs / 1000).toFixed(2)}s` : '';
    D.resSummary.textContent = `${fileCount} file${fileCount !== 1 ? 's' : ''} created from ${totalPages} pages${secs}`;
  }
  if (D.resFiles)   D.resFiles.textContent   = fileCount || '0';
  if (D.resPages)   D.resPages.textContent   = totalPages || '0';
  if (D.resBlanks)  D.resBlanks.textContent  = skipped || '0';
  if (D.resBlanksWrap) setHidden(D.resBlanksWrap, skipped === 0);
  if (D.resZipSize) D.resZipSize.textContent = fmtKB(zipSizeKB);
  if (D.downloadBtnLabel) D.downloadBtnLabel.textContent = `Download ${dlName}`;

  buildResFilesList(fileNames);
  triggerConfetti();
  D.resultsCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function buildResFilesList(fileNames) {
  if (!D || !D.resFilesList) return;
  if (!fileNames || fileNames.length === 0) {
    hideEl(D.resFilesWrap);
    return;
  }
  showEl(D.resFilesWrap);
  if (D.resFilesToggleLabel) {
    D.resFilesToggleLabel.textContent = `Show ${fileNames.length} output file${fileNames.length !== 1 ? 's' : ''}`;
  }
  D.resFilesList.innerHTML = fileNames.map((name, i) =>
    `<div class="sp-res-file-item">
      <i class="fa-solid fa-file-pdf" style="color:var(--accent2)"></i>
      <span>${escHtml(name)}</span>
    </div>`
  ).join('');
}

/* ── Download ───────────────────────────────────────────────────────── */
function downloadResult() {
  if (!_splitBlob) return;
  S('playDownloadWhoosh');
  const url = URL.createObjectURL(_splitBlob);
  const a   = document.createElement('a');
  a.href = url; a.download = _splitFileName;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}

/* ── Confetti ───────────────────────────────────────────────────────── */
function triggerConfetti() {
  try {
    if (typeof confetti === 'function') {
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }, colors: ['#6366f1', '#8b5cf6', '#22d3ee', '#f0abfc', '#fbbf24'] });
    }
  } catch (_) {}
}

/* ── Reset / New file ───────────────────────────────────────────────── */
function resetTool() {
  FILE = null; FILE_INFO = null;
  CURRENT_MODE = 'all';
  PAGE_SEL = new Set();
  _shiftStart = -1;
  _splitBlob = null;
  _pdfJsDoc = null;
  _thumbsLoading = false;
  _autoDetectPending = false;
  _recommendedMode = null;

  if (!D) return;
  if (D.fileInput) D.fileInput.value = '';
  if (D.rangeInput) D.rangeInput.value = '';
  if (D.rangeGroupsInput) D.rangeGroupsInput.value = '';
  if (D.nInput) D.nInput.value = '5';
  if (D.passwordInput) D.passwordInput.value = '';
  if (D.pgrid) D.pgrid.innerHTML = '';
  if (D.pgridSelCount) D.pgridSelCount.textContent = 'Click pages to select';
  if (D.thumbsStrip) D.thumbsStrip.innerHTML = '';
  if (D.progressSteps) D.progressSteps.innerHTML = '';
  if (D.chipBookmarks) D.chipBookmarks.classList.add('sp-chip-hidden');
  if (D.chipBlanks)    D.chipBlanks.classList.add('sp-chip-hidden');
  if (D.chipEncrypted) D.chipEncrypted.classList.add('sp-chip-hidden');
  if (D.chipScanned)   D.chipScanned.classList.add('sp-chip-hidden');
  if (D.uploadSubText) D.uploadSubText.textContent = 'No file selected';

  hideEl(D.fileInfoWrap);
  showEl(D.dropZone);
  hideEl(D.modesCard);
  hideEl(D.optionsCard);
  hideEl(D.presetsRow);
  hideEl(D.advCard);
  hideEl(D.actionCard);
  hideEl(D.progressCard);
  hideEl(D.resultsCard);
  hideEl(D.recommendBanner);
  hideEl(D.splitPreviewBox);
  hideEl(D.fabBtn);

  setMode('all');
  setProgress(0, 'Processing…', '');
  S('playMergeAgainSound');
}

/* ── Copy buttons ───────────────────────────────────────────────────── */
function copyToClipboard(text, label) {
  if (!text) return;
  try {
    navigator.clipboard.writeText(text).then(() => {
      toast(`${label} copied!`, 'success', 1800);
      S('playCopySound');
    });
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    ta.remove();
    toast(`${label} copied!`, 'success', 1800);
    S('playCopySound');
  }
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN — DOMContentLoaded
══════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initBgCanvas();

  /* DOM refs */
  D = {
    dropZone:             document.getElementById('dropZone'),
    browseBtn:            document.getElementById('browseBtn'),
    fileInput:            document.getElementById('fileInput'),
    uploadSubText:        document.getElementById('uploadSubText'),
    fileInfoWrap:         document.getElementById('fileInfoWrap'),
    fileName:             document.getElementById('fileName'),
    chipSize:             document.getElementById('chipSize'),
    chipPages:            document.getElementById('chipPages'),
    chipBookmarks:        document.getElementById('chipBookmarks'),
    chipBlanks:           document.getElementById('chipBlanks'),
    chipEncrypted:        document.getElementById('chipEncrypted'),
    chipScanned:          document.getElementById('chipScanned'),
    fileRemoveBtn:        document.getElementById('fileRemoveBtn'),
    thumbsWrap:           document.getElementById('thumbsWrap'),
    thumbsStrip:          document.getElementById('thumbsStrip'),
    thumbsCount:          document.getElementById('thumbsCount'),
    recommendBanner:      document.getElementById('recommendBanner'),
    recommendText:        document.getElementById('recommendText'),
    recommendApplyBtn:    document.getElementById('recommendApplyBtn'),
    recommendCloseBtn:    document.getElementById('recommendCloseBtn'),
    modesCard:            document.getElementById('modesCard'),
    modeSubText:          document.getElementById('modeSubText'),
    modeDesc:             document.getElementById('modeDesc'),
    modesGrid:            document.getElementById('modesGrid'),
    presetsRow:           document.getElementById('presetsRow'),
    optionsCard:          document.getElementById('optionsCard'),
    rangeInput:           document.getElementById('rangeInput'),
    rangePreview:         document.getElementById('rangePreview'),
    pgrid:                document.getElementById('pgrid'),
    pgridSelCount:        document.getElementById('pgridSelCount'),
    rangeGroupsInput:     document.getElementById('rangeGroupsInput'),
    groupsPreview:        document.getElementById('groupsPreview'),
    groupsSplitPreview:   document.getElementById('groupsSplitPreview'),
    nInput:               document.getElementById('nInput'),
    nDecBtn:              document.getElementById('nDecBtn'),
    nIncBtn:              document.getElementById('nIncBtn'),
    chunkCount:           document.getElementById('chunkCount'),
    bookmarksList:        document.getElementById('bookmarksList'),
    blankCountInfo:       document.getElementById('blankCountInfo'),
    sizeSlider:           document.getElementById('sizeSlider'),
    sizeVal:              document.getElementById('sizeVal'),
    sizeSplitPreview:     document.getElementById('sizeSplitPreview'),
    splitPreviewBox:      document.getElementById('splitPreviewBox'),
    splitPreviewText:     document.getElementById('splitPreviewText'),
    advCard:              document.getElementById('advCard'),
    advToggle:            document.getElementById('advToggle'),
    advBody:              document.getElementById('advBody'),
    advArrow:             document.getElementById('advArrow'),
    passwordInput:        document.getElementById('passwordInput'),
    namingInput:          document.getElementById('namingInput'),
    zipCompressionSel:    document.getElementById('zipCompressionSel'),
    removeBlanksToggle:   document.getElementById('removeBlanksToggle'),
    includeManifestToggle:document.getElementById('includeManifestToggle'),
    actionCard:           document.getElementById('actionCard'),
    splitBtn:             document.getElementById('splitBtn'),
    splitBtnLabel:        document.getElementById('splitBtnLabel'),
    splitBtnBadge:        document.getElementById('splitBtnBadge'),
    progressCard:         document.getElementById('progressCard'),
    progressBar:          document.getElementById('progressBar'),
    progressPct:          document.getElementById('progressPct'),
    progressTitle:        document.getElementById('progressTitle'),
    progressSub:          document.getElementById('progressSub'),
    progressSteps:        document.getElementById('progressSteps'),
    resultsCard:          document.getElementById('resultsCard'),
    resTitle:             document.getElementById('resTitle'),
    resSummary:           document.getElementById('resSummary'),
    resFiles:             document.getElementById('resFiles'),
    resPages:             document.getElementById('resPages'),
    resBlanks:            document.getElementById('resBlanks'),
    resBlanksWrap:        document.getElementById('resBlanksWrap'),
    resZipSize:           document.getElementById('resZipSize'),
    downloadBtn:          document.getElementById('downloadBtn'),
    downloadBtnLabel:     document.getElementById('downloadBtnLabel'),
    splitAgainBtn:        document.getElementById('splitAgainBtn'),
    newFileBtn:           document.getElementById('newFileBtn'),
    resFilesWrap:         document.getElementById('resFilesWrap'),
    resFilesToggle:       document.getElementById('resFilesToggle'),
    resFilesToggleLabel:  document.getElementById('resFilesToggleLabel'),
    resFilesList:         document.getElementById('resFilesList'),
    themeBtn:             document.getElementById('themeBtn'),
    themeIcon:            document.getElementById('themeIcon'),
    fabBtn:               document.getElementById('fabBtn'),
    copyRangeBtn:         document.getElementById('copyRangeBtn'),
    copyGroupsBtn:        document.getElementById('copyGroupsBtn'),
  };

  /* ── Drop zone ──────────────────────────────────────────────────── */
  if (D.dropZone) {
    D.dropZone.addEventListener('click', e => {
      if (e.target === D.browseBtn || D.browseBtn.contains(e.target)) return;
      D.fileInput.click();
    });
    D.dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); D.fileInput.click(); } });
    D.dropZone.addEventListener('dragover', e => { e.preventDefault(); D.dropZone.classList.add('drag-over'); S('playDragStartSound'); });
    D.dropZone.addEventListener('dragleave', () => D.dropZone.classList.remove('drag-over'));
    D.dropZone.addEventListener('drop', e => {
      e.preventDefault();
      D.dropZone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f) { S('playDragDropSound'); onFileSelected(f); }
    });
  }

  if (D.browseBtn) {
    D.browseBtn.addEventListener('click', e => { e.stopPropagation(); D.fileInput.click(); });
  }

  if (D.fileInput) {
    D.fileInput.addEventListener('change', () => {
      if (D.fileInput.files[0]) onFileSelected(D.fileInput.files[0]);
    });
  }

  /* ── File remove ────────────────────────────────────────────────── */
  if (D.fileRemoveBtn) {
    D.fileRemoveBtn.addEventListener('click', () => { S('playFileRemoveSound'); resetTool(); });
  }

  /* ── Mode cards ─────────────────────────────────────────────────── */
  if (D.modesGrid) {
    D.modesGrid.querySelectorAll('.sp-mode-card').forEach(card => {
      card.addEventListener('click', () => setMode(card.getAttribute('data-mode')));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode(card.getAttribute('data-mode')); } });
    });
  }

  /* ── Preset buttons ─────────────────────────────────────────────── */
  document.querySelectorAll('.sp-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.getAttribute('data-p')));
  });

  /* ── Quick-select buttons ───────────────────────────────────────── */
  document.querySelectorAll('.sp-qs-btn').forEach(btn => {
    btn.addEventListener('click', () => applyQuickSelect(btn.getAttribute('data-qs')));
  });

  /* ── Range input ────────────────────────────────────────────────── */
  if (D.rangeInput) {
    D.rangeInput.addEventListener('input', () => { syncGridFromInput(); updateRangePreview(); updateSplitBtn(); });
    D.rangeInput.addEventListener('blur',  () => { syncGridFromInput(); });
  }

  /* ── Groups input ───────────────────────────────────────────────── */
  if (D.rangeGroupsInput) {
    D.rangeGroupsInput.addEventListener('input', () => { updateGroupsPreview(); updateSplitBtn(); });
  }

  /* ── Every N ────────────────────────────────────────────────────── */
  if (D.nDecBtn) D.nDecBtn.addEventListener('click', () => {
    if (D.nInput) { D.nInput.value = Math.max(1, parseInt(D.nInput.value || 1) - 1); updateChunkCount(); S('playSort'); }
  });
  if (D.nIncBtn) D.nIncBtn.addEventListener('click', () => {
    if (D.nInput) { D.nInput.value = Math.min(9999, parseInt(D.nInput.value || 1) + 1); updateChunkCount(); S('playSort'); }
  });
  if (D.nInput) D.nInput.addEventListener('input', updateChunkCount);

  /* ── Size slider ────────────────────────────────────────────────── */
  if (D.sizeSlider) D.sizeSlider.addEventListener('input', updateSizeSplitPreview);

  /* ── Advanced toggle ────────────────────────────────────────────── */
  if (D.advToggle) D.advToggle.addEventListener('click', toggleAdv);

  /* ── Toggles sounds ─────────────────────────────────────────────── */
  if (D.removeBlanksToggle) D.removeBlanksToggle.addEventListener('change', () => S(D.removeBlanksToggle.checked ? 'playToggleOnSound' : 'playToggleOffSound'));
  if (D.includeManifestToggle) D.includeManifestToggle.addEventListener('change', () => S(D.includeManifestToggle.checked ? 'playToggleOnSound' : 'playToggleOffSound'));

  /* ── Split button ───────────────────────────────────────────────── */
  if (D.splitBtn) D.splitBtn.addEventListener('click', doSplit);
  if (D.fabBtn) D.fabBtn.addEventListener('click', doSplit);

  /* ── Download ───────────────────────────────────────────────────── */
  if (D.downloadBtn) D.downloadBtn.addEventListener('click', downloadResult);

  /* ── Split again / New file ─────────────────────────────────────── */
  if (D.splitAgainBtn) D.splitAgainBtn.addEventListener('click', () => {
    if (!D) return;
    hideEl(D.resultsCard);
    showEl(D.actionCard);
    _splitBlob = null;
    updateSplitBtn();
    S('playMergeAgainSound');
  });
  if (D.newFileBtn) D.newFileBtn.addEventListener('click', resetTool);

  /* ── Recommendation banner ──────────────────────────────────────── */
  if (D.recommendApplyBtn) {
    D.recommendApplyBtn.addEventListener('click', () => {
      if (_recommendedMode) { setMode(_recommendedMode); S('playPresetSound'); }
      hideEl(D.recommendBanner);
    });
  }
  if (D.recommendCloseBtn) {
    D.recommendCloseBtn.addEventListener('click', () => hideEl(D.recommendBanner));
  }

  /* ── Output files list toggle ───────────────────────────────────── */
  if (D.resFilesToggle) {
    D.resFilesToggle.addEventListener('click', () => {
      const open = D.resFilesToggle.getAttribute('aria-expanded') === 'true';
      D.resFilesToggle.setAttribute('aria-expanded', String(!open));
      setHidden(D.resFilesList, open);
      const arrow = D.resFilesToggle.querySelector('.sp-rft-arrow');
      if (arrow) arrow.style.transform = open ? '' : 'rotate(180deg)';
      if (D.resFilesToggleLabel) {
        const n = D.resFilesList ? D.resFilesList.children.length : 0;
        D.resFilesToggleLabel.textContent = open ? `Show ${n} output file${n !== 1 ? 's' : ''}` : `Hide output files`;
      }
      S('playExpandSound');
    });
  }

  /* ── Copy buttons ───────────────────────────────────────────────── */
  if (D.copyRangeBtn) {
    D.copyRangeBtn.addEventListener('click', () => copyToClipboard(D.rangeInput ? D.rangeInput.value : '', 'Range'));
  }
  if (D.copyGroupsBtn) {
    D.copyGroupsBtn.addEventListener('click', () => copyToClipboard(D.rangeGroupsInput ? D.rangeGroupsInput.value : '', 'Groups'));
  }

  /* ── Theme button ───────────────────────────────────────────────── */
  if (D.themeBtn) D.themeBtn.addEventListener('click', toggleTheme);

  /* ── Keyboard shortcuts ─────────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (D.splitBtn && !D.splitBtn.disabled) doSplit();
    }
    if (e.key === 'Escape') {
      if (D.recommendBanner && !D.recommendBanner.hasAttribute('hidden')) hideEl(D.recommendBanner);
    }
  });

  /* ── Passive paste anywhere ─────────────────────────────────────── */
  document.addEventListener('paste', e => {
    if (!FILE && e.clipboardData) {
      const items = e.clipboardData.items;
      for (const item of items) {
        if (item.type === 'application/pdf') {
          const f = item.getAsFile();
          if (f) { toast('PDF pasted!', 'info', 2000); onFileSelected(f); }
          break;
        }
      }
    }
  });

  /* ── Initial state ──────────────────────────────────────────────── */
  hideEl(D.fileInfoWrap);
  hideEl(D.modesCard);
  hideEl(D.optionsCard);
  hideEl(D.presetsRow);
  hideEl(D.advCard);
  hideEl(D.actionCard);
  hideEl(D.progressCard);
  hideEl(D.resultsCard);
  hideEl(D.recommendBanner);
  hideEl(D.splitPreviewBox);
  hideEl(D.groupsSplitPreview);
  hideEl(D.fabBtn);
  hideEl(D.thumbsWrap);

  const allOptIds = ['opts-range', 'opts-range_groups', 'opts-every_n', 'opts-bookmarks', 'opts-blank_pages', 'opts-size_limit', 'opts-odd_even'];
  allOptIds.forEach(id => hideEl(document.getElementById(id)));

  /* Expose globals for inline onclick fallback */
  window.downloadResult = downloadResult;
  window.resetTool      = resetTool;
});
