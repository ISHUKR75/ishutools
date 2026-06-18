/**
 * split-pdf/script.js  v4.0 — IshuTools.fun
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 *
 * Complete rewrite:
 * - Fixed icon-overwrite bug in file chips (innerHTML, not textContent)
 * - Fixed statBookmarks display
 * - Auto-detect mode with smart recommendation banner
 * - Mode count badges (estimated output count per mode)
 * - downloadResult / resetTool exposed to window for onclick reliability
 * - Better progress steps with detailed stage info
 * - fahhhhh.mp3 on download, sounds for every action
 * - Better confetti + success animation
 * - Simpler UX flow
 */

'use strict';

/* ── MODULE STATE ──────────────────────────────────────────────── */
let FILE          = null;
let TOTAL_PAGES   = 0;
let BOOKMARKS     = [];
let BLANK_COUNT   = 0;
let RESULT_BLOB   = null;
let RESULT_NAME   = '';
let PAGE_SEL      = new Set();
let SELECTED_MODE = 'all';
let _shiftStart   = -1;
let _simTimer     = null;
let _sseSource    = null;
let D             = null;
let SOUNDS        = {};

const MAX_SIZE_MB = 50;
const MAX_THUMB   = 18;

/* ── SOUNDS ─────────────────────────────────────────────────────── */
function initSounds() {
  const FILES = {
    add:      'sounds/are_bhai_bhai_bhai.mp3',
    start:    'sounds/cameraman_focus_karo.mp3',
    success:  'sounds/waah_kya_scene_hai.mp3',
    download: 'sounds/fahhhhh.mp3',
    error:    'sounds/eh_eh_eh_ehhhhhh.mp3',
    warn:     'sounds/jaldi_waha_sa_hato.mp3',
  };
  const cache = {};
  SOUNDS.play = function(key) {
    try {
      const src = FILES[key];
      if (!src) return;
      if (!cache[key]) {
        cache[key] = new Audio(src);
        cache[key].volume = 0.55;
      }
      const a = cache[key];
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch(_) {}
  };
}
function playSound(k) { SOUNDS.play && SOUNDS.play(k); }

/* ── DOM INIT ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initSounds();

  D = {
    themeBtn:        document.getElementById('themeBtn'),
    fileInput:       document.getElementById('fileInput'),
    dropZone:        document.getElementById('dropZone'),
    uploadCard:      document.getElementById('uploadCard'),
    browseBtn:       document.getElementById('browseBtn'),

    fileCard:        document.getElementById('fileCard'),
    fileName:        document.getElementById('fileName'),
    fileSize:        document.getElementById('fileSize'),
    filePages:       document.getElementById('filePages'),
    statBookmarks:   document.getElementById('statBookmarks'),
    fileRemoveBtn:   document.getElementById('fileRemoveBtn'),
    thumbsStrip:     document.getElementById('thumbsStrip'),
    thumbsLoading:   document.getElementById('thumbsLoading'),
    thumbsCount:     document.getElementById('thumbsCount'),

    modesCard:       document.getElementById('modesCard'),
    modesGrid:       document.getElementById('modesGrid'),
    detectBtn:       document.getElementById('detectBtn'),
    recommendBanner: document.getElementById('recommendBanner'),
    recText:         document.getElementById('recText'),
    recApplyBtn:     document.getElementById('recApplyBtn'),

    optsCard:        document.getElementById('optsCard'),
    rangeInput:      document.getElementById('rangeInput'),
    rangePreview:    document.getElementById('rangePreview'),
    pgrid:           document.getElementById('pgrid'),
    pgridSel:        document.getElementById('pgridSel'),
    everyNInput:     document.getElementById('everyNInput'),
    chunksPreview:   document.getElementById('chunksPreview'),
    sizeSlider:      document.getElementById('sizeSlider'),
    sizeVal:         document.getElementById('sizeVal'),
    splitPreview:    document.getElementById('splitPreview'),
    bookmarksList:   document.getElementById('bookmarksList'),

    advCard:         document.getElementById('advCard'),
    advToggle:       document.getElementById('advToggle'),
    advBody:         document.getElementById('advBody'),
    advArrow:        document.getElementById('advArrow'),
    pdfPassword:     document.getElementById('pdfPassword'),
    removeBlanks:    document.getElementById('removeBlanks'),
    namingPattern:   document.getElementById('namingPattern'),

    actionSection:   document.getElementById('actionSection'),
    splitBtn:        document.getElementById('splitBtn'),

    progressCard:    document.getElementById('progressCard'),
    progressFill:    document.getElementById('progressFill'),
    progressPct:     document.getElementById('progressPct'),
    progressTitle:   document.getElementById('progressTitle'),
    progressSub:     document.getElementById('progressSub'),
    progressSteps:   document.getElementById('progressSteps'),

    resultsCard:     document.getElementById('resultsCard'),
    resFileCount:    document.getElementById('resFileCount'),
    resTotalPages:   document.getElementById('resTotalPages'),
    resSkipped:      document.getElementById('resSkipped'),
    resSkippedWrap:  document.getElementById('resSkippedWrap'),
    resZipSize:      document.getElementById('resZipSize'),

    faqList:         document.getElementById('faqList'),
  };

  initTheme();
  initDrop();
  initModes();
  initEveryN();
  initSizeSlider();
  initAdvanced();
  initFAQ();
  initGSAP();
  initParticles();

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (D.splitBtn && !D.splitBtn.disabled && !D.actionSection.hidden) doSplit();
    }
  });

  if (D.themeBtn) D.themeBtn.addEventListener('click', toggleTheme);
});

/* ── DROP / FILE ────────────────────────────────────────────────── */
function initDrop() {
  const { dropZone, fileInput, browseBtn } = D;
  if (!dropZone) return;

  dropZone.addEventListener('click', () => fileInput.click());
  if (browseBtn) browseBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });

  fileInput.addEventListener('change', e => {
    if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]);
  });

  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('sp-drag-over'); });
  dropZone.addEventListener('dragleave', e => {
    if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('sp-drag-over');
  });
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('sp-drag-over');
    const f = e.dataTransfer?.files?.[0];
    if (f) loadFile(f);
  });

  if (D.fileRemoveBtn) D.fileRemoveBtn.addEventListener('click', e => { e.stopPropagation(); resetTool(); });
}

/* ── LOAD FILE ──────────────────────────────────────────────────── */
async function loadFile(file) {
  if (!file.name.match(/\.pdf$/i)) {
    showToast('Please upload a PDF file (.pdf only)', 'error');
    playSound('error');
    return;
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    showToast(`File too large. Maximum is ${MAX_SIZE_MB} MB.`, 'error');
    playSound('error');
    return;
  }

  FILE = file;
  TOTAL_PAGES = 0;
  BOOKMARKS   = [];
  BLANK_COUNT = 0;
  PAGE_SEL    = new Set();
  RESULT_BLOB = null;
  RESULT_NAME = '';
  playSound('add');

  // Update file info chips (innerHTML preserves icons)
  D.fileName.textContent = file.name;
  D.fileSize.innerHTML  = `<i class="fa fa-hdd" aria-hidden="true"></i> ${formatSize(file.size)}`;
  D.filePages.innerHTML = `<i class="fa fa-file-alt" aria-hidden="true"></i> —`;
  D.statBookmarks.classList.add('sp-hidden');

  // Setup thumbnails area
  D.thumbsLoading.hidden = false;
  D.thumbsStrip.innerHTML = '';
  D.thumbsStrip.appendChild(D.thumbsLoading);
  D.thumbsCount.textContent = '';

  // Show tool sections
  D.uploadCard.hidden      = true;
  D.fileCard.hidden        = false;
  D.modesCard.hidden       = false;
  D.advCard.hidden         = false;
  D.actionSection.hidden   = false;
  D.optsCard.hidden        = false;
  D.resultsCard.hidden     = true;
  D.progressCard.hidden    = true;

  // Hide recommendation banner
  if (D.recommendBanner) D.recommendBanner.hidden = true;

  showModeOptions(SELECTED_MODE);

  if (typeof gsap !== 'undefined') {
    gsap.from(D.fileCard,      { y: 20, duration: .38, ease: 'power2.out' });
    gsap.from(D.modesCard,     { y: 20, duration: .38, delay: .05, ease: 'power2.out' });
    gsap.from(D.optsCard,      { y: 20, duration: .38, delay: .10, ease: 'power2.out' });
    gsap.from(D.actionSection, { y: 16, duration: .38, delay: .14, ease: 'power2.out' });
  }

  await fetchPdfInfo();
  loadThumbs();
}

/* ── FETCH PDF INFO ─────────────────────────────────────────────── */
async function fetchPdfInfo() {
  try {
    const fd = new FormData();
    fd.append('file', FILE);
    if (D.pdfPassword && D.pdfPassword.value) fd.append('password', D.pdfPassword.value);

    const resp = await fetch('/api/split-pdf/info', { method: 'POST', body: fd });
    if (!resp.ok) return;
    const info = await resp.json();
    if (!info.success) return;

    TOTAL_PAGES = info.total_pages || 0;
    BLANK_COUNT = info.blank_pages || 0;
    BOOKMARKS   = (info.bookmarks || []).map(([t, p]) => ({ title: t, page: p }));

    // Fix: use innerHTML so the icon inside the chip is preserved
    D.filePages.innerHTML = `<i class="fa fa-file-alt" aria-hidden="true"></i> ${
      TOTAL_PAGES ? `${TOTAL_PAGES} page${TOTAL_PAGES !== 1 ? 's' : ''}` : '—'
    }`;

    if (BOOKMARKS.length) {
      D.statBookmarks.innerHTML =
        `<i class="fa fa-bookmark" aria-hidden="true"></i> ${BOOKMARKS.length} chapter${BOOKMARKS.length !== 1 ? 's' : ''}`;
      D.statBookmarks.classList.remove('sp-hidden');
    }

    if (TOTAL_PAGES) {
      buildPageGrid();
      updateModeBadges();
      updateSplitPreview();
      updateChunksPreview();
      renderBookmarksList();
    }

    // Auto-detect recommendation (async, non-blocking)
    callAutoDetect();

  } catch(e) {
    console.warn('fetchPdfInfo failed:', e);
  }
}

/* ── AUTO DETECT MODE ───────────────────────────────────────────── */
async function callAutoDetect() {
  if (!FILE || !D.recommendBanner) return;
  try {
    const fd = new FormData();
    fd.append('file', FILE);
    const resp = await fetch('/api/split-pdf/auto-detect', { method: 'POST', body: fd });
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data.success) return;

    const mode = data.recommended_mode;
    const reason = data.reason || '';
    const conf = Math.round((data.confidence || 0) * 100);

    D.recText && (D.recText.innerHTML =
      `<strong>Recommended: ${modeName(mode)}</strong> — ${reason} <em class="sp-rec-conf">${conf}% match</em>`);

    if (D.recApplyBtn) {
      D.recApplyBtn.dataset.mode = mode;
      D.recApplyBtn.onclick = () => {
        applyMode(mode);
        D.recommendBanner.hidden = true;
        playSound('warn');
        showToast(`Switched to ${modeName(mode)} mode`, 'success');
      };
    }

    D.recommendBanner.hidden = false;
    if (typeof gsap !== 'undefined')
      gsap.from(D.recommendBanner, { y: -10, duration: .3, ease: 'power2.out' });

  } catch(e) {
    // Non-critical — just skip
  }
}

function applyMode(mode) {
  SELECTED_MODE = mode;
  D.modesGrid && D.modesGrid.querySelectorAll('.sp-mode-card').forEach(c => {
    c.classList.toggle('active', c.dataset.mode === mode);
    c.setAttribute('aria-checked', c.dataset.mode === mode ? 'true' : 'false');
  });
  showModeOptions(mode);
  updateSplitPreview();
}

function modeName(mode) {
  const MAP = {
    all:         'All Pages',
    range:       'Page Range',
    every_n:     'Every N Pages',
    bookmarks:   'By Bookmarks',
    blank_pages: 'Blank Separator',
    size_limit:  'By File Size',
    odd_even:    'Odd / Even',
  };
  return MAP[mode] || mode;
}

/* ── MODE BADGES ────────────────────────────────────────────────── */
function updateModeBadges() {
  if (!TOTAL_PAGES) return;
  const n  = Math.max(1, parseInt(D.everyNInput?.value || 2));
  const bk = BOOKMARKS.length;

  const MAP = {
    'all':         `→ ${TOTAL_PAGES} files`,
    'range':       PAGE_SEL.size ? `→ 1 file, ${PAGE_SEL.size}pg` : '',
    'every_n':     `→ ${Math.ceil(TOTAL_PAGES / n)} files`,
    'bookmarks':   bk ? `→ ${bk} files` : '—',
    'blank_pages': BLANK_COUNT >= 2 ? `→ ~${BLANK_COUNT + 1} files` : '—',
    'size_limit':  '',
    'odd_even':    '→ 2 files',
  };

  Object.entries(MAP).forEach(([mode, label]) => {
    const el = document.getElementById(`mcount-${mode.replace(/_/g, '-')}`);
    if (el) {
      el.textContent = label;
      el.hidden = !label;
    }
  });
}

/* ── THUMBNAILS (PDF.js) ────────────────────────────────────────── */
async function loadThumbs() {
  if (!FILE || !window.pdfjsLib) {
    if (D.thumbsLoading) D.thumbsLoading.hidden = true;
    return;
  }
  try {
    const buf = await FILE.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({
      data: buf,
      password: D.pdfPassword?.value || ''
    }).promise;

    D.thumbsLoading.hidden = true;
    const total = pdf.numPages;
    const count = Math.min(total, MAX_THUMB);
    D.thumbsCount.textContent = total > MAX_THUMB ? `${count} of ${total}` : `${total}`;

    if (!TOTAL_PAGES) {
      TOTAL_PAGES = total;
      D.filePages.innerHTML = `<i class="fa fa-file-alt" aria-hidden="true"></i> ${total} page${total !== 1 ? 's' : ''}`;
      buildPageGrid();
      updateModeBadges();
      updateSplitPreview();
      updateChunksPreview();
    }

    for (let i = 1; i <= count; i++) {
      await renderThumb(pdf, i);
    }

    if (total > MAX_THUMB) {
      const more = document.createElement('div');
      more.className = 'sp-thumb-more';
      more.innerHTML = `<i class="fa fa-ellipsis-h"></i><span>+${total - MAX_THUMB} more</span>`;
      D.thumbsStrip.appendChild(more);
    }
  } catch(e) {
    if (D.thumbsLoading) D.thumbsLoading.hidden = true;
    console.warn('Thumb load failed:', e);
  }
}

async function renderThumb(pdf, pageNum) {
  try {
    const page   = await pdf.getPage(pageNum);
    const vp     = page.getViewport({ scale: 0.26 });
    const canvas = document.createElement('canvas');
    canvas.width  = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

    const wrap = document.createElement('div');
    wrap.className = 'sp-thumb';
    wrap.dataset.page = pageNum;
    wrap.innerHTML = `<span class="sp-thumb-sel"><i class="fa fa-check"></i></span>
      <span class="sp-thumb-num">${pageNum}</span>`;
    wrap.insertBefore(canvas, wrap.firstChild);

    wrap.addEventListener('click', () => {
      if (SELECTED_MODE !== 'range') return;
      const idx = pageNum - 1;
      if (PAGE_SEL.has(idx)) PAGE_SEL.delete(idx);
      else PAGE_SEL.add(idx);
      wrap.classList.toggle('pg-selected', PAGE_SEL.has(idx));
      syncGridFromSel();
      syncInputFromGrid();
      updateSplitPreview();
      updateModeBadges();
    });

    D.thumbsStrip.appendChild(wrap);
  } catch(e) {
    console.warn(`Thumb p${pageNum}:`, e);
  }
}

/* ── PAGE GRID ──────────────────────────────────────────────────── */
function buildPageGrid() {
  if (!D.pgrid || !TOTAL_PAGES) return;
  D.pgrid.innerHTML = '';
  const cap  = 200;
  const show = Math.min(TOTAL_PAGES, cap);

  for (let i = 0; i < show; i++) {
    const cell = document.createElement('div');
    cell.className = 'sp-pg-cell' + (PAGE_SEL.has(i) ? ' selected' : '');
    cell.textContent = i + 1;
    cell.dataset.idx = i;
    cell.addEventListener('click', e => onCellClick(e, i));
    D.pgrid.appendChild(cell);
  }

  if (TOTAL_PAGES > cap) {
    const ov = document.createElement('div');
    ov.className = 'sp-pg-overflow';
    ov.innerHTML = `<i class="fa fa-info-circle"></i> ${TOTAL_PAGES - cap} more pages — use the range field above`;
    D.pgrid.parentElement.appendChild(ov);
  }
}

function onCellClick(e, idx) {
  if (e.shiftKey && _shiftStart >= 0) {
    const lo = Math.min(_shiftStart, idx);
    const hi = Math.max(_shiftStart, idx);
    for (let i = lo; i <= hi; i++) PAGE_SEL.add(i);
  } else {
    if (PAGE_SEL.has(idx)) PAGE_SEL.delete(idx);
    else PAGE_SEL.add(idx);
    _shiftStart = idx;
  }
  syncGridFromSel();
  syncInputFromGrid();
  updateSplitPreview();
  updateModeBadges();
}

function syncGridFromSel() {
  D.pgrid && D.pgrid.querySelectorAll('.sp-pg-cell').forEach(c => {
    c.classList.toggle('selected', PAGE_SEL.has(parseInt(c.dataset.idx)));
  });
  D.thumbsStrip && D.thumbsStrip.querySelectorAll('.sp-thumb[data-page]').forEach(t => {
    t.classList.toggle('pg-selected', PAGE_SEL.has(parseInt(t.dataset.page) - 1));
  });
  if (D.pgridSel) {
    const n = PAGE_SEL.size;
    D.pgridSel.textContent = n ? `${n} page${n !== 1 ? 's' : ''} selected` : 'None selected';
    D.pgridSel.className   = 'sp-pgrid-sel' + (n ? ' has-sel' : '');
  }
}

function syncInputFromGrid() {
  if (!D.rangeInput) return;
  if (!PAGE_SEL.size) { D.rangeInput.value = ''; updateRangePreview(); return; }
  const sorted = Array.from(PAGE_SEL).sort((a, b) => a - b);
  const segs = []; let s = sorted[0], e2 = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === e2 + 1) { e2 = sorted[i]; continue; }
    segs.push(s === e2 ? String(s + 1) : `${s + 1}-${e2 + 1}`);
    if (i < sorted.length) { s = sorted[i]; e2 = sorted[i]; }
  }
  D.rangeInput.value = segs.join(', ');
  updateRangePreview();
}

function updateRangeFromInput() {
  if (!D.rangeInput || !TOTAL_PAGES) return;
  PAGE_SEL = new Set(parseRangeStr(D.rangeInput.value, TOTAL_PAGES));
  syncGridFromSel();
  updateRangePreview();
  updateSplitPreview();
  updateModeBadges();
}

function updateRangePreview() {
  const el = D.rangePreview;
  if (!el) return;
  const val = D.rangeInput?.value?.trim();
  if (!val) { el.innerHTML = '<span class="sp-rp-hint">No pages selected</span>'; return; }
  if (!TOTAL_PAGES) { el.innerHTML = '<span class="sp-rp-hint">Upload a PDF first</span>'; return; }

  const pages = parseRangeStr(val, TOTAL_PAGES);
  if (!pages.length) {
    el.innerHTML = '<span class="sp-rp-warn"><i class="fa fa-exclamation-triangle"></i> No valid pages</span>';
    return;
  }
  const sorted = [...pages].sort((a,b) => a - b);
  const groups = [];
  let gs = sorted[0], ge = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === ge + 1) { ge = sorted[i]; continue; }
    groups.push(gs === ge ? `${gs + 1}` : `${gs + 1}–${ge + 1}`);
    if (i < sorted.length) { gs = sorted[i]; ge = sorted[i]; }
  }
  const shown = groups.slice(0, 10);
  let html = shown.map(g => `<span class="sp-range-chip">${g}</span>`).join('');
  if (groups.length > 10) html += `<span class="sp-range-chip sp-range-chip-more">+${groups.length - 10}</span>`;
  html += `<span class="sp-range-count">${pages.length} page${pages.length !== 1 ? 's' : ''}</span>`;
  el.innerHTML = html;
}

/* ── MODES ──────────────────────────────────────────────────────── */
function initModes() {
  if (!D.modesGrid) return;
  D.modesGrid.querySelectorAll('.sp-mode-card').forEach(card => {
    card.addEventListener('click', () => {
      const mode = card.dataset.mode;
      if (!mode) return;
      SELECTED_MODE = mode;
      D.modesGrid.querySelectorAll('.sp-mode-card').forEach(c => {
        c.classList.toggle('active', c.dataset.mode === mode);
        c.setAttribute('aria-checked', c.dataset.mode === mode ? 'true' : 'false');
      });
      showModeOptions(mode);
      updateSplitPreview();
    });
  });

  // Auto-detect button
  if (D.detectBtn) {
    D.detectBtn.addEventListener('click', async () => {
      if (!FILE) { showToast('Upload a PDF first', 'warn'); return; }
      D.detectBtn.disabled = true;
      D.detectBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Detecting…';
      await callAutoDetect();
      D.detectBtn.disabled = false;
      D.detectBtn.innerHTML = '<i class="fa fa-magic"></i> Auto-Detect';
    });
  }
}

function showModeOptions(mode) {
  if (!D.optsCard) return;
  D.optsCard.hidden = false;
  D.optsCard.querySelectorAll('[data-mode-opt]').forEach(el => el.hidden = true);

  const MAP = {
    all:         ['opt-split-preview'],
    range:       ['opt-range', 'opt-qs-bar', 'opt-pgrid', 'opt-split-preview'],
    every_n:     ['opt-every-n', 'opt-split-preview'],
    bookmarks:   ['opt-bookmarks', 'opt-split-preview'],
    blank_pages: ['opt-blank-info', 'opt-split-preview'],
    size_limit:  ['opt-size', 'opt-split-preview'],
    odd_even:    ['opt-odd-even-info', 'opt-split-preview'],
  };

  (MAP[mode] || ['opt-split-preview']).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  });

  updateSplitPreview();
  updateChunksPreview();
  if (mode === 'bookmarks') renderBookmarksList();
}

/* ── EVERY N ────────────────────────────────────────────────────── */
function initEveryN() {
  const inp = D.everyNInput;
  if (!inp) return;
  inp.addEventListener('input', () => {
    updateChunksPreview();
    updateSplitPreview();
    updateModeBadges();
  });
  const dec = document.getElementById('everyNDec');
  const inc = document.getElementById('everyNInc');
  if (dec) dec.addEventListener('click', () => {
    inp.value = Math.max(1, parseInt(inp.value || 2) - 1);
    updateChunksPreview(); updateSplitPreview(); updateModeBadges();
  });
  if (inc) inc.addEventListener('click', () => {
    inp.value = Math.min(9999, parseInt(inp.value || 2) + 1);
    updateChunksPreview(); updateSplitPreview(); updateModeBadges();
  });
}

/* ── SIZE SLIDER ────────────────────────────────────────────────── */
function initSizeSlider() {
  const sl = D.sizeSlider;
  if (!sl) return;
  sl.addEventListener('input', () => {
    if (D.sizeVal) D.sizeVal.textContent = sl.value;
    updateSplitPreview();
  });
  if (D.sizeVal) D.sizeVal.textContent = sl.value;
}

/* ── ADVANCED ───────────────────────────────────────────────────── */
function initAdvanced() {
  if (D.advToggle) {
    D.advToggle.addEventListener('click', () => {
      const open = !D.advBody.hidden;
      D.advBody.hidden = open;
      D.advArrow.classList.toggle('open', !open);
      D.advToggle.setAttribute('aria-expanded', String(!open));
    });
  }
  if (D.rangeInput) {
    D.rangeInput.addEventListener('input', () => {
      updateRangePreview();
      updateRangeFromInput();
    });
  }
  if (D.splitBtn) D.splitBtn.addEventListener('click', doSplit);

  document.querySelectorAll('.sp-qs-btn[data-qs]').forEach(btn => {
    btn.addEventListener('click', () => handleQuickSelect(btn.dataset.qs));
  });
}

/* ── QUICK SELECT ───────────────────────────────────────────────── */
function handleQuickSelect(qs) {
  if (!TOTAL_PAGES) { showToast('Upload a PDF first', 'warn'); return; }
  PAGE_SEL.clear();
  if (qs === 'all')    { for (let i = 0; i < TOTAL_PAGES; i++) PAGE_SEL.add(i); }
  else if (qs === 'odd')    { for (let i = 0; i < TOTAL_PAGES; i += 2) PAGE_SEL.add(i); }
  else if (qs === 'even')   { for (let i = 1; i < TOTAL_PAGES; i += 2) PAGE_SEL.add(i); }
  else if (qs === 'first')  { PAGE_SEL.add(0); }
  else if (qs === 'last')   { PAGE_SEL.add(TOTAL_PAGES - 1); }
  else if (qs === 'firstN') {
    const n = parseInt(document.getElementById('qsN')?.value || 5);
    for (let i = 0; i < Math.min(n, TOTAL_PAGES); i++) PAGE_SEL.add(i);
  }
  syncGridFromSel();
  syncInputFromGrid();
  updateSplitPreview();
  updateModeBadges();
}

/* ── RANGE PARSER ───────────────────────────────────────────────── */
function parseRangeStr(str, total) {
  const pages = new Set();
  if (!str || !total) return [];
  str.replace(/[，；,;]/g, ',').split(',').forEach(part => {
    part = part.trim();
    if (!part) return;
    if (/^\d+\s*[-–—]\s*\d+$/.test(part)) {
      const [a, b] = part.split(/[-–—]/).map(Number);
      const lo = Math.max(0, a - 1), hi = Math.min(total - 1, b - 1);
      if (!isNaN(lo) && !isNaN(hi) && lo <= hi) for (let i = lo; i <= hi; i++) pages.add(i);
    } else if (/^\d+$/.test(part)) {
      const idx = parseInt(part) - 1;
      if (idx >= 0 && idx < total) pages.add(idx);
    }
  });
  return Array.from(pages).sort((a, b) => a - b);
}

/* ── CHUNKS PREVIEW ─────────────────────────────────────────────── */
function updateChunksPreview() {
  if (!D.chunksPreview) return;
  const n     = Math.max(1, parseInt(D.everyNInput?.value || 2));
  const total = TOTAL_PAGES;
  if (total) {
    const chunks = Math.ceil(total / n);
    const last   = total % n || n;
    D.chunksPreview.innerHTML = `<i class="fa fa-th-large"></i>
      <strong>${chunks}</strong> file${chunks !== 1 ? 's' : ''}
      &bull; ${n} page${n !== 1 ? 's' : ''} each
      ${last !== n ? `<em style="color:var(--sp-text3)">(last: ${last} page${last !== 1 ? 's' : ''})</em>` : ''}`;
  } else {
    D.chunksPreview.innerHTML = `<i class="fa fa-info-circle"></i> Upload a PDF to preview chunks`;
  }
}

/* ── LIVE SPLIT PREVIEW ─────────────────────────────────────────── */
function updateSplitPreview() {
  const el = D.splitPreview;
  if (!el) return;
  if (!FILE) { el.innerHTML = ''; return; }

  let html = '<i class="fa fa-cut"></i> ';
  switch(SELECTED_MODE) {
    case 'all':
      html += TOTAL_PAGES
        ? `Will create <strong>${TOTAL_PAGES}</strong> file${TOTAL_PAGES !== 1 ? 's' : ''} — 1 page each`
        : 'Will split every page into a separate file';
      break;
    case 'range': {
      const pages = parseRangeStr(D.rangeInput?.value || '', TOTAL_PAGES);
      html += pages.length
        ? `Will create <strong>1 file</strong> with <strong>${pages.length}</strong> page${pages.length !== 1 ? 's' : ''}`
        : '<em style="color:var(--sp-text3)">Select pages using the grid or type a range above</em>';
      break;
    }
    case 'every_n': {
      const n = Math.max(1, parseInt(D.everyNInput?.value || 2));
      const chunks = TOTAL_PAGES ? Math.ceil(TOTAL_PAGES / n) : '?';
      html += `Will create <strong>${chunks}</strong> file${chunks !== 1 ? 's' : ''} — <strong>${n}</strong> page${n !== 1 ? 's' : ''} each`;
      break;
    }
    case 'bookmarks': {
      const bk = BOOKMARKS.length;
      html += bk
        ? `Will create <strong>${bk}</strong> file${bk !== 1 ? 's' : ''} — 1 per chapter`
        : 'Splits at each bookmark/chapter boundary';
      break;
    }
    case 'odd_even':
      html += TOTAL_PAGES
        ? `Will create <strong>2 files</strong> — ${Math.ceil(TOTAL_PAGES/2)} odd pages &amp; ${Math.floor(TOTAL_PAGES/2)} even pages`
        : 'Will create 2 files — odd pages &amp; even pages';
      break;
    case 'size_limit':
      html += `Will split into parts ≤ <strong>${D.sizeSlider?.value || 5} MB</strong> each`;
      break;
    case 'blank_pages':
      html += BLANK_COUNT >= 2
        ? `Found <strong>${BLANK_COUNT}</strong> blank separator page${BLANK_COUNT !== 1 ? 's' : ''} — will create ~${BLANK_COUNT + 1} files`
        : 'Splits at each blank page separator';
      break;
    default:
      html += 'Configure options and click Split PDF';
  }
  el.innerHTML = html;
}

/* ── BOOKMARKS LIST ─────────────────────────────────────────────── */
function renderBookmarksList() {
  const el = D.bookmarksList;
  if (!el) return;
  if (!BOOKMARKS.length) {
    el.innerHTML = '<div class="sp-bookmark-item sp-bk-empty"><i class="fa fa-info-circle"></i> No bookmarks detected in this PDF</div>';
    return;
  }
  el.innerHTML = BOOKMARKS.slice(0, 30).map((bk, i) =>
    `<div class="sp-bookmark-item">
      <span class="sp-bk-num">${i + 1}</span>
      <span class="sp-bk-title">${escHtml(bk.title)}</span>
      <span class="sp-bk-page">p.${bk.page + 1}</span>
    </div>`
  ).join('') + (BOOKMARKS.length > 30
    ? `<div class="sp-bk-more">+ ${BOOKMARKS.length - 30} more chapters</div>` : '');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── MAIN SPLIT ─────────────────────────────────────────────────── */
async function doSplit() {
  if (!FILE) { showToast('Please upload a PDF first', 'error'); return; }

  if (SELECTED_MODE === 'range' && !D.rangeInput?.value?.trim()) {
    showToast('Select pages using the grid or type a range first', 'warn');
    playSound('warn');
    D.rangeInput && D.rangeInput.focus();
    return;
  }

  playSound('start');
  RESULT_BLOB = null; RESULT_NAME = '';

  // Hide everything, show progress
  D.actionSection.hidden = false;
  D.progressCard.hidden  = false;
  D.resultsCard.hidden   = true;
  D.splitBtn.disabled    = true;
  D.splitBtn.innerHTML   = '<i class="fa fa-spinner fa-spin"></i> Splitting…';

  setProgress(0, 'Reading PDF…', 'Analysing document structure');
  addProgressStep('📂', 'Opening file', 'Authenticating & reading PDF structure');

  if (typeof gsap !== 'undefined') {
    gsap.from(D.progressCard, { y: 16, duration: .35, ease: 'power2.out' });
  }

  const jobId = 'sp_' + Math.random().toString(36).slice(2, 9);

  // SSE progress
  try {
    _sseSource = new EventSource(`/api/progress/${jobId}`);
    _sseSource.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        if (d.pct !== undefined) setProgress(d.pct, d.title, d.sub);
        if (d.done) closeSSE();
      } catch(_) {}
    };
    _sseSource.onerror = () => closeSSE();
  } catch(_) {}

  // Simulated progress fallback
  const STEPS = [
    [12,  'Reading PDF…',       'Authenticating & validating'],
    [28,  'Splitting pages…',   `Mode: ${modeName(SELECTED_MODE)}`],
    [52,  'Writing files…',     'Lossless page copy in progress'],
    [75,  'Packaging…',         'Building ZIP archive'],
    [90,  'Finalising…',        'Adding manifest & metadata'],
  ];
  let si = 0;
  _simTimer = setInterval(() => {
    if (si < STEPS.length) {
      const [pct, title, sub] = STEPS[si++];
      setProgress(pct, title, sub);
      addProgressStep('⚡', title, sub);
    }
  }, 900);

  try {
    const fd = new FormData();
    fd.append('file',           FILE);
    fd.append('mode',           SELECTED_MODE);
    fd.append('ranges',         D.rangeInput?.value || '');
    fd.append('every_n',        D.everyNInput?.value || '2');
    fd.append('max_size_mb',    D.sizeSlider?.value || '5');
    fd.append('password',       D.pdfPassword?.value || '');
    fd.append('remove_blanks',  String(D.removeBlanks?.checked || false));
    fd.append('naming_pattern', D.namingPattern?.value || 'page_{n:04d}');
    fd.append('job_id',         jobId);

    const resp = await fetch('/api/split-pdf', { method: 'POST', body: fd });
    clearSim();

    if (!resp.ok) {
      let msg = `Server error (${resp.status})`;
      try { const j = await resp.json(); msg = j.error || msg; } catch(_) {}
      throw new Error(msg);
    }

    RESULT_BLOB = await resp.blob();
    const fileCount   = resp.headers.get('X-File-Count')     || '?';
    const totalPages  = resp.headers.get('X-Total-Pages')    || '?';
    const skipped     = resp.headers.get('X-Skipped-Blanks') || '0';
    const zipSizeKB   = resp.headers.get('X-Zip-Size-KB')    || '0';
    const downName    = resp.headers.get('X-Download-Name')  || '';

    // Smart ZIP name: from source filename or mode
    const stem = FILE.name.replace(/\.pdf$/i, '');
    RESULT_NAME = downName || `${stem}_split.zip`;

    // Fill result stats
    setProgress(100, 'Done! ✓', `${fileCount} files created`);
    addProgressStep('✅', 'Split complete!', `${fileCount} files, ${formatKB(zipSizeKB)}`);

    await new Promise(r => setTimeout(r, 400));

    D.resFileCount.textContent  = fileCount;
    D.resTotalPages.textContent = totalPages;
    D.resSkipped.textContent    = skipped;
    if (D.resSkippedWrap) D.resSkippedWrap.hidden = skipped === '0';
    D.resZipSize.textContent    = formatKB(zipSizeKB);

    D.progressCard.hidden = true;
    D.resultsCard.hidden  = false;

    if (typeof gsap !== 'undefined') {
      gsap.from(D.resultsCard, { y: 20, duration: .4, ease: 'back.out(1.3)' });
      gsap.from(D.resultsCard.querySelectorAll('.sp-res-stat'), {
        y: 12, stagger: .07, duration: .35, ease: 'power2.out', delay: .15
      });
    }

    playSound('success');
    launchConfetti();
    showToast(`Split complete — ${fileCount} files ready`, 'success');

  } catch(err) {
    clearSim(); closeSSE();
    D.progressCard.hidden = true;

    const msg = err.message || 'Split failed. Please try again.';
    playSound('error');
    showError(msg);
    showToast(msg, 'error');

    D.splitBtn.disabled  = false;
    D.splitBtn.innerHTML = '<div class="sp-btn-inner"><i class="fa fa-cut sp-btn-icon"></i><span>Split PDF</span><div class="sp-btn-shine"></div></div>';
  }

  D.splitBtn.disabled  = false;
  D.splitBtn.innerHTML = '<div class="sp-btn-inner"><i class="fa fa-cut sp-btn-icon"></i><span>Split PDF</span><div class="sp-btn-shine"></div></div>';
}

/* ── PROGRESS HELPERS ───────────────────────────────────────────── */
function setProgress(pct, title, sub) {
  pct = Math.max(0, Math.min(100, pct));
  if (D.progressFill) {
    D.progressFill.style.width = pct + '%';
    D.progressFill.setAttribute('aria-valuenow', pct);
  }
  if (D.progressPct)   D.progressPct.textContent  = pct + '%';
  if (D.progressTitle) D.progressTitle.textContent = title || '';
  if (D.progressSub)   D.progressSub.textContent   = sub   || '';
}

function addProgressStep(icon, title, sub) {
  if (!D.progressSteps) return;
  const item = document.createElement('div');
  item.className = 'sp-progress-step sp-step-enter';
  item.innerHTML = `<span class="sp-step-icon">${icon}</span>
    <span class="sp-step-text"><strong>${title}</strong>${sub ? ' — ' + sub : ''}</span>`;
  D.progressSteps.appendChild(item);
  // keep only last 4 steps visible
  const items = D.progressSteps.querySelectorAll('.sp-progress-step');
  if (items.length > 4) items[0].remove();
  setTimeout(() => item.classList.remove('sp-step-enter'), 20);
}

function clearSim() { if (_simTimer) { clearInterval(_simTimer); _simTimer = null; } }
function closeSSE()  { if (_sseSource) { try { _sseSource.close(); } catch(_) {} _sseSource = null; } }

/* ── DOWNLOAD ───────────────────────────────────────────────────── */
function downloadResult() {
  if (!RESULT_BLOB) { showToast('No result to download yet', 'warn'); return; }
  const url = URL.createObjectURL(RESULT_BLOB);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = RESULT_NAME || 'split.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  playSound('download');
  showToast('Download started!', 'success');
}

/* ── RESET ──────────────────────────────────────────────────────── */
function resetTool() {
  FILE = null; TOTAL_PAGES = 0; BOOKMARKS = []; BLANK_COUNT = 0;
  RESULT_BLOB = null; RESULT_NAME = ''; PAGE_SEL = new Set(); _shiftStart = -1;
  clearSim(); closeSSE();

  D.uploadCard.hidden    = false;
  D.fileCard.hidden      = true;
  D.modesCard.hidden     = true;
  D.optsCard.hidden      = true;
  D.advCard.hidden       = true;
  D.actionSection.hidden = true;
  D.progressCard.hidden  = true;
  D.resultsCard.hidden   = true;
  if (D.recommendBanner) D.recommendBanner.hidden = true;

  if (D.splitBtn) {
    D.splitBtn.disabled  = false;
    D.splitBtn.innerHTML = '<div class="sp-btn-inner"><i class="fa fa-cut sp-btn-icon"></i><span>Split PDF</span><div class="sp-btn-shine"></div></div>';
  }
  if (D.fileInput) D.fileInput.value = '';
  if (D.pgrid) D.pgrid.innerHTML = '';
  if (D.thumbsStrip) D.thumbsStrip.innerHTML = '';
  if (D.bookmarksList) D.bookmarksList.innerHTML = '';
  if (D.progressSteps) D.progressSteps.innerHTML = '';
  if (D.rangeInput) D.rangeInput.value = '';
  if (D.rangePreview) D.rangePreview.innerHTML = '';
  if (D.splitPreview) D.splitPreview.innerHTML = '';

  if (typeof gsap !== 'undefined') {
    gsap.from(D.uploadCard, { y: 16, duration: .4, ease: 'power2.out' });
  }
}

// Expose to window for onclick= in HTML
window.downloadResult = downloadResult;
window.resetTool      = resetTool;

/* ── TOAST ──────────────────────────────────────────────────────── */
function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `sp-toast sp-toast-${type}`;
  const icons = { info: 'info-circle', success: 'check-circle', error: 'times-circle', warn: 'exclamation-triangle' };
  toast.innerHTML = `<i class="fa fa-${icons[type] || 'info-circle'}"></i><span>${msg}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('sp-toast-in'));
  setTimeout(() => {
    toast.classList.remove('sp-toast-in');
    toast.classList.add('sp-toast-out');
    setTimeout(() => toast.remove(), 350);
  }, 3600);
}

function showError(msg) {
  const errEl = document.getElementById('errorBanner');
  if (!errEl) return;
  errEl.querySelector && (errEl.querySelector('.sp-err-text') || errEl).textContent = msg;
  errEl.hidden = false;
  setTimeout(() => { errEl.hidden = true; }, 7000);
}

/* ── CONFETTI ───────────────────────────────────────────────────── */
function launchConfetti() {
  if (typeof confetti === 'function') {
    confetti({ particleCount: 90, spread: 70, origin: { y: 0.5 }, colors: ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b'] });
    return;
  }
  // Lightweight CSS confetti fallback
  const colors = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444'];
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('div');
    p.className = 'sp-confetti-p';
    p.style.cssText = `left:${20 + Math.random()*60}%;background:${colors[i%colors.length]};
      animation-delay:${Math.random()*.5}s;animation-duration:${1.2+Math.random()}s;
      width:${6+Math.random()*5}px;height:${6+Math.random()*5}px`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 2500);
  }
}

/* ── FAQ ────────────────────────────────────────────────────────── */
function initFAQ() {
  if (!D.faqList) return;
  D.faqList.querySelectorAll('.sp-faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item    = btn.closest('.sp-faq-item');
      const answer  = item.querySelector('.sp-faq-a');
      const isOpen  = item.classList.contains('open');
      D.faqList.querySelectorAll('.sp-faq-item.open').forEach(el => {
        el.classList.remove('open');
        el.querySelector('.sp-faq-a').style.maxHeight = '0';
        el.querySelector('.sp-faq-q').setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        item.classList.add('open');
        answer.style.maxHeight = answer.scrollHeight + 'px';
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

/* ── GSAP ANIMATIONS ────────────────────────────────────────────── */
function initGSAP() {
  if (typeof gsap === 'undefined') return;
  gsap.from('.sp-hero-h1',    { y: 24, duration: .65, ease: 'power3.out' });
  gsap.from('.sp-hero-sub',   { y: 18, duration: .55, delay: .12, ease: 'power2.out' });
  gsap.from('.sp-hero-pills', { y: 14, duration: .45, delay: .22, ease: 'power2.out' });
  gsap.from('.sp-hero-badge', { y: -12, duration: .45, delay: .08, ease: 'power2.out' });
  gsap.from('.sp-proof-strip',{ y: 12, duration: .4,  delay: .35, ease: 'power2.out' });
  gsap.from('.sp-upload-card',{ y: 20, duration: .5,  delay: .45, ease: 'power2.out' });
}

/* ── PARTICLES ──────────────────────────────────────────────────── */
function initParticles() {
  const container = document.getElementById('heroParticles');
  if (!container) return;
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('div');
    const s = 40 + Math.random() * 100;
    p.className = 'sp-particle';
    p.style.cssText = `
      left:${Math.random()*100}%;
      bottom:-20px;
      width:${s}px; height:${s}px;
      animation-duration:${8+Math.random()*10}s;
      animation-delay:-${Math.random()*12}s;
    `;
    container.appendChild(p);
  }
}

/* ── THEME ──────────────────────────────────────────────────────── */
function initTheme() {
  const saved = localStorage.getItem('sp-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}
function toggleTheme() {
  const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('sp-theme', next);
  updateThemeIcon(next);
}
function updateThemeIcon(theme) {
  if (!D.themeBtn) return;
  D.themeBtn.innerHTML = theme === 'dark'
    ? '<i class="fa fa-moon" aria-hidden="true"></i>'
    : '<i class="fa fa-sun" aria-hidden="true"></i>';
}

/* ── UTILITIES ──────────────────────────────────────────────────── */
function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
function formatKB(kb) {
  const n = parseFloat(kb) || 0;
  if (n < 1024) return n.toFixed(1) + ' KB';
  return (n / 1024).toFixed(2) + ' MB';
}
