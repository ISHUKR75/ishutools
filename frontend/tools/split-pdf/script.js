/**
 * split-pdf/script.js — IshuTools.fun
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 * Ultra-professional Split PDF — visual page grid, live preview, quick-selects, SSE progress
 */
'use strict';

// ── SOUNDS ───────────────────────────────────────────────────────────────────
const SOUNDS = {
  fileAdd:  new Audio('are_bhai_bhai_bhai.mp3'),
  start:    new Audio('cameraman_focus_karo.mp3'),
  success:  new Audio('waah_kya_scene_hai.mp3'),
  download: new Audio('fahhhhh.mp3'),
  error:    new Audio('eh_eh_eh_ehhhhhh.mp3'),
  warn:     new Audio('jaldi_waha_sa_hato.mp3'),
};
Object.values(SOUNDS).forEach(a => { a.volume = 0.6; a.preload = 'none'; });
function playSound(key) {
  try { const s = SOUNDS[key]; if (s) { s.currentTime = 0; s.play().catch(() => {}); } } catch(e) {}
}

// ── MODES CONFIG ─────────────────────────────────────────────────────────────
const MODES = [
  { id: 'all',         icon: '📄', title: 'Every Page',     desc: 'One PDF per page',              c1: '#3b82f6', c2: '#06b6d4', ex: '24 pages → 24 files' },
  { id: 'range',       icon: '🎯', title: 'Page Ranges',    desc: 'Custom pages: 1–3, 5, 7–9',    c1: '#8b5cf6', c2: '#ec4899', ex: 'Click pages to select' },
  { id: 'every_n',     icon: '📦', title: 'Every N Pages',  desc: 'Split into equal chunks',       c1: '#10b981', c2: '#06b6d4', ex: '24 pages ÷ 3 = 8 files' },
  { id: 'bookmarks',   icon: '🔖', title: 'By Chapters',    desc: 'Split at bookmark boundaries', c1: '#f59e0b', c2: '#ef4444', ex: 'Intro, Ch.1, Ch.2…' },
  { id: 'odd_even',    icon: '↕️', title: 'Odd / Even',     desc: 'Separate odd & even pages',    c1: '#06b6d4', c2: '#6366f1', ex: 'Pages 1,3,5 + 2,4,6' },
  { id: 'size_limit',  icon: '⚖️', title: 'By File Size',   desc: 'Split when size limit hit',    c1: '#ef4444', c2: '#f97316', ex: 'Max 5 MB per file' },
  { id: 'blank_pages', icon: '🔲', title: 'At Blank Pages', desc: 'Split at blank separators',    c1: '#ec4899', c2: '#8b5cf6', ex: 'Auto-detects blanks' },
];

// ── STATE ────────────────────────────────────────────────────────────────────
let FILE          = null;
let TOTAL_PAGES   = 0;
let BOOKMARKS     = [];
let SELECTED_MODE = 'all';
let RESULT_BLOB   = null;
let RESULT_NAME   = '';
let _sseSource    = null;
let _simTimer     = null;
let _currentPct   = 0;
let PAGE_SEL      = new Set();   // 0-indexed selected pages (range mode)
let _shiftStart   = -1;          // shift+click anchor

// ── DOM REFS ─────────────────────────────────────────────────────────────────
let D = {};
document.addEventListener('DOMContentLoaded', init);

function init() {
  D = {
    // Upload
    dropZone:      document.getElementById('dropZone'),
    fileInput:     document.getElementById('fileInput'),
    browseBtn:     document.getElementById('browseBtn'),
    uploadCard:    document.getElementById('uploadCard'),
    // File info
    fileCard:      document.getElementById('fileCard'),
    fileName:      document.getElementById('fileName'),
    statPages:     document.getElementById('statPages'),
    statSize:      document.getElementById('statSize'),
    statBookmarks: document.getElementById('statBookmarks'),
    removeFileBtn: document.getElementById('removeFileBtn'),
    thumbsStrip:   document.getElementById('thumbsStrip'),
    thumbsLoading: document.getElementById('thumbsLoading'),
    thumbsCount:   document.getElementById('thumbsCount'),
    thumbsWrap:    document.getElementById('thumbsWrap'),
    // Modes
    modesCard:     document.getElementById('modesCard'),
    modesGrid:     document.getElementById('modesGrid'),
    // Options
    optsCard:      document.getElementById('optsCard'),
    optRange:      document.getElementById('optRange'),
    rangeInput:    document.getElementById('rangeInput'),
    rangePreview:  document.getElementById('rangePreview'),
    // Page grid
    pgrid:         document.getElementById('pgrid'),
    pgridSel:      document.getElementById('pgridSel'),
    pgridWrap:     document.getElementById('pgridWrap'),
    qsAll:         document.getElementById('qsAll'),
    qsNone:        document.getElementById('qsNone'),
    qsOdd:         document.getElementById('qsOdd'),
    qsEven:        document.getElementById('qsEven'),
    qsFirst:       document.getElementById('qsFirst'),
    qsLast:        document.getElementById('qsLast'),
    qsN:           document.getElementById('qsN'),
    // Every N
    optEveryN:     document.getElementById('optEveryN'),
    everyNInput:   document.getElementById('everyNInput'),
    nMinus:        document.getElementById('nMinus'),
    nPlus:         document.getElementById('nPlus'),
    chunksPreview: document.getElementById('chunksPreview'),
    // Size
    optSize:       document.getElementById('optSize'),
    sizeSlider:    document.getElementById('sizeSlider'),
    sizeDisplay:   document.getElementById('sizeDisplay'),
    // Bookmarks / Odd / Blank
    optBookmarks:  document.getElementById('optBookmarks'),
    bookmarksList: document.getElementById('bookmarksList'),
    optOddEven:    document.getElementById('optOddEven'),
    optBlank:      document.getElementById('optBlank'),
    // Advanced
    advCard:       document.getElementById('advCard'),
    advToggle:     document.getElementById('advToggle'),
    advBody:       document.getElementById('advBody'),
    advArrow:      document.getElementById('advArrow'),
    pdfPassword:   document.getElementById('pdfPassword'),
    namingPattern: document.getElementById('namingPattern'),
    removeBlanks:  document.getElementById('removeBlanks'),
    // Action
    splitPreview:  document.getElementById('splitPreview'),
    actionSection: document.getElementById('actionSection'),
    splitBtn:      document.getElementById('splitBtn'),
    // Progress
    progressCard:  document.getElementById('progressCard'),
    progressFill:  document.getElementById('progressFill'),
    progressPct:   document.getElementById('progressPct'),
    progressTitle: document.getElementById('progressTitle'),
    progressSub:   document.getElementById('progressSub'),
    progressSteps: document.getElementById('progressSteps'),
    // Results
    resultsCard:   document.getElementById('resultsCard'),
    resFileCount:  document.getElementById('resFileCount'),
    resTotalPages: document.getElementById('resTotalPages'),
    resSkipped:    document.getElementById('resSkipped'),
    resSkippedWrap:document.getElementById('resSkippedWrap'),
    downloadBtn:   document.getElementById('downloadBtn'),
    splitAgainBtn: document.getElementById('splitAgainBtn'),
    // Nav
    themeBtn:      document.getElementById('themeBtn'),
    faqList:       document.getElementById('faqList'),
  };

  buildModeCards();
  bindEvents();
  initTheme();
  initFAQ();
  initParticles();
  initGSAP();
}

// ── MODE CARDS ───────────────────────────────────────────────────────────────
function buildModeCards() {
  D.modesGrid.innerHTML = '';
  MODES.forEach(m => {
    const card = document.createElement('div');
    card.className = 'sp-mode-card' + (m.id === SELECTED_MODE ? ' active' : '');
    card.dataset.mode = m.id;
    card.style.setProperty('--mc1', m.c1);
    card.style.setProperty('--mc2', m.c2);
    card.style.setProperty('--mglow', hexToRgba(m.c1, .22));
    card.innerHTML = `
      <div class="sp-mode-icon">${m.icon}</div>
      <div class="sp-mode-title">${m.title}</div>
      <div class="sp-mode-desc">${m.desc}</div>
      <div class="sp-mode-ex"><i class="fa fa-arrow-right"></i> ${m.ex}</div>
      <div class="sp-mode-check"><i class="fa fa-check"></i></div>`;
    card.addEventListener('click', () => selectMode(m.id));
    D.modesGrid.appendChild(card);
  });
}

function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── SELECT MODE ──────────────────────────────────────────────────────────────
function selectMode(id) {
  SELECTED_MODE = id;
  D.modesGrid.querySelectorAll('.sp-mode-card').forEach(c => c.classList.toggle('active', c.dataset.mode === id));
  showModeOptions(id);
  if (id !== 'range') { PAGE_SEL.clear(); }
  updateSplitPreview();
  if (typeof gsap !== 'undefined') {
    const active = D.modesGrid.querySelector('.sp-mode-card.active');
    if (active) gsap.from(active, { scale: .93, duration: .25, ease: 'back.out(2)' });
  }
}

function showModeOptions(id) {
  const groups = { range: D.optRange, every_n: D.optEveryN, size_limit: D.optSize, bookmarks: D.optBookmarks, odd_even: D.optOddEven, blank_pages: D.optBlank };
  let hasOpts = false;
  Object.entries(groups).forEach(([mode, el]) => {
    const show = mode === id;
    el.hidden = !show;
    if (show) hasOpts = true;
  });
  D.optsCard.hidden = !hasOpts;
  if (id === 'bookmarks') renderBookmarksList();
  if (id === 'every_n') updateChunksPreview();
}

// ── BIND EVENTS ──────────────────────────────────────────────────────────────
function bindEvents() {
  // Upload zone
  D.dropZone.addEventListener('click', e => { if (!D.browseBtn.contains(e.target)) D.fileInput.click(); });
  D.browseBtn.addEventListener('click', e => { e.stopPropagation(); D.fileInput.click(); });
  D.fileInput.addEventListener('change', () => { if (D.fileInput.files[0]) handleFile(D.fileInput.files[0]); });
  D.dropZone.addEventListener('dragover', e => { e.preventDefault(); D.dropZone.classList.add('sp-drag-over'); });
  D.dropZone.addEventListener('dragleave', e => { if (!D.dropZone.contains(e.relatedTarget)) D.dropZone.classList.remove('sp-drag-over'); });
  D.dropZone.addEventListener('drop', e => {
    e.preventDefault(); D.dropZone.classList.remove('sp-drag-over');
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) { showToast('Please upload a PDF file', 'error'); playSound('error'); return; }
    handleFile(f);
  });

  // Remove file
  D.removeFileBtn.addEventListener('click', resetTool);

  // Range input ↔ page grid sync
  D.rangeInput.addEventListener('input', () => {
    syncGridFromInput();
    updateRangePreview();
    updateSplitPreview();
  });

  // Quick-select buttons
  if (D.qsAll)   D.qsAll.addEventListener('click',   () => applyQuickSel('all'));
  if (D.qsNone)  D.qsNone.addEventListener('click',  () => applyQuickSel('none'));
  if (D.qsOdd)   D.qsOdd.addEventListener('click',   () => applyQuickSel('odd'));
  if (D.qsEven)  D.qsEven.addEventListener('click',  () => applyQuickSel('even'));
  if (D.qsFirst) D.qsFirst.addEventListener('click', () => applyQuickSel('first'));
  if (D.qsLast)  D.qsLast.addEventListener('click',  () => applyQuickSel('last'));

  // Every N
  D.everyNInput.addEventListener('input', () => { updateChunksPreview(); updateSplitPreview(); });
  D.nMinus.addEventListener('click', () => { D.everyNInput.value = Math.max(1, (parseInt(D.everyNInput.value)||1) - 1); updateChunksPreview(); updateSplitPreview(); });
  D.nPlus.addEventListener('click',  () => { D.everyNInput.value = Math.min(500, (parseInt(D.everyNInput.value)||1) + 1); updateChunksPreview(); updateSplitPreview(); });

  // Size slider
  D.sizeSlider.addEventListener('input', () => { D.sizeDisplay.textContent = D.sizeSlider.value; updateSplitPreview(); });

  // Advanced
  D.advToggle.addEventListener('click', () => {
    const open = !D.advBody.hidden;
    D.advBody.hidden = open;
    D.advArrow.classList.toggle('open', !open);
  });

  // Split & download
  D.splitBtn.addEventListener('click', doSplit);
  D.downloadBtn.addEventListener('click', downloadResult);
  D.splitAgainBtn.addEventListener('click', resetTool);

  // Theme
  D.themeBtn.addEventListener('click', toggleTheme);

  // ⌨ Keyboard: Enter = split, Escape = cancel/reset
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && FILE && D.actionSection && !D.actionSection.hidden && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault(); doSplit();
    }
  });
}

// ── FILE HANDLING ────────────────────────────────────────────────────────────
async function handleFile(file) {
  if (file.size > 1024 * 1024 * 1024) { showToast('File exceeds 1 GB limit', 'error'); playSound('error'); return; }
  FILE = file;
  playSound('fileAdd');

  D.fileName.textContent = file.name;
  D.statSize.innerHTML = `<i class="fa fa-hdd"></i> ${formatSize(file.size)}`;
  D.uploadCard.hidden = true;
  D.fileCard.hidden   = false;
  D.modesCard.hidden  = false;
  D.advCard.hidden    = false;
  D.actionSection.hidden = false;

  if (typeof gsap !== 'undefined') {
    gsap.from([D.fileCard, D.modesCard, D.advCard, D.actionSection], { y: 22, duration: .45, stagger: .08, ease: 'power2.out' });
  }

  showModeOptions(SELECTED_MODE);
  updateSplitPreview();
  await loadPDFInfo(file);
}

async function loadPDFInfo(file) {
  D.thumbsLoading.hidden = false;
  D.statPages.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Reading…';
  try {
    const buf = await file.arrayBuffer();
    const pdfjs = await loadPDFJS();
    if (!pdfjs) {
      D.statPages.innerHTML = `<i class="fa fa-file-alt"></i> PDF uploaded`;
      D.thumbsLoading.hidden = true; D.thumbsWrap.hidden = true; return;
    }
    const pdf = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
    TOTAL_PAGES = pdf.numPages;
    D.statPages.innerHTML = `<i class="fa fa-file-alt"></i> ${TOTAL_PAGES} page${TOTAL_PAGES !== 1 ? 's' : ''}`;

    try {
      const outline = await pdf.getOutline();
      BOOKMARKS = outline ? flattenOutline(outline).slice(0, 30) : [];
      if (BOOKMARKS.length) {
        D.statBookmarks.innerHTML = `<i class="fa fa-bookmark"></i> ${BOOKMARKS.length} chapter${BOOKMARKS.length !== 1 ? 's' : ''}`;
        D.statBookmarks.classList.remove('sp-hidden');
      }
    } catch(_) { BOOKMARKS = []; }

    updateChunksPreview();
    renderBookmarksList();
    updateSplitPreview();
    buildPageGrid();

    await renderThumbnails(pdf, Math.min(TOTAL_PAGES, 24));
  } catch(e) {
    console.warn('PDF.js error:', e);
    D.statPages.innerHTML = `<i class="fa fa-file-alt"></i> PDF uploaded`;
    D.thumbsLoading.hidden = true; D.thumbsWrap.hidden = true;
  }
}

async function loadPDFJS() {
  if (window.pdfjsLib) return window.pdfjsLib;
  return new Promise(resolve => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      } else resolve(null);
    };
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

async function renderThumbnails(pdf, count) {
  D.thumbsLoading.hidden = false;
  D.thumbsStrip.innerHTML = '';
  D.thumbsStrip.appendChild(D.thumbsLoading);
  const frag = document.createDocumentFragment();
  for (let i = 1; i <= count; i++) {
    try {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 0.38 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      const thumb = document.createElement('div');
      thumb.className = 'sp-thumb';
      thumb.title = `Page ${i} — click to select`;
      thumb.dataset.page = i - 1;
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/jpeg', 0.75);
      img.alt = `Page ${i}`;
      const num = document.createElement('div');
      num.className = 'sp-thumb-num'; num.textContent = i;
      const sel = document.createElement('div');
      sel.className = 'sp-thumb-sel'; sel.innerHTML = '<i class="fa fa-check"></i>';
      thumb.appendChild(img); thumb.appendChild(num); thumb.appendChild(sel);
      thumb.addEventListener('click', () => onThumbClick(i - 1));
      frag.appendChild(thumb);
    } catch(_) {}
  }
  if (TOTAL_PAGES > count) {
    const more = document.createElement('div');
    more.className = 'sp-thumb-more';
    more.innerHTML = `<i class="fa fa-ellipsis-h"></i><span>+${TOTAL_PAGES - count} more</span>`;
    frag.appendChild(more);
  }
  D.thumbsLoading.hidden = true;
  D.thumbsStrip.appendChild(frag);
  D.thumbsCount.textContent = `${count} of ${TOTAL_PAGES}`;
  if (typeof gsap !== 'undefined') {
    gsap.from(D.thumbsStrip.querySelectorAll('.sp-thumb'), { y: 10, duration: .28, stagger: .028, ease: 'power1.out' });
  }
}

// Clicking a thumbnail toggles it in range mode
function onThumbClick(idx) {
  if (SELECTED_MODE !== 'range') {
    selectMode('range');
    return;
  }
  if (PAGE_SEL.has(idx)) PAGE_SEL.delete(idx);
  else { PAGE_SEL.add(idx); _shiftStart = idx; }
  syncInputFromGrid(); refreshPgrid(); updateRangePreview(); updateSplitPreview(); refreshThumbSel();
}

function refreshThumbSel() {
  D.thumbsStrip.querySelectorAll('.sp-thumb').forEach(th => {
    const idx = parseInt(th.dataset.page);
    th.classList.toggle('pg-selected', PAGE_SEL.has(idx));
  });
}

function flattenOutline(items, depth = 0) {
  const r = [];
  for (const item of items) {
    r.push({ title: item.title || 'Section', depth });
    if (item.items && item.items.length && depth < 2) r.push(...flattenOutline(item.items, depth + 1));
  }
  return r;
}

// ── VISUAL PAGE GRID ────────────────────────────────────────────────────────
function buildPageGrid() {
  if (!D.pgrid) return;
  const MAX = Math.min(TOTAL_PAGES, 120);
  D.pgrid.innerHTML = '';
  const overflow = D.pgrid.parentElement.querySelector('.sp-pg-overflow');
  if (overflow) overflow.remove();

  for (let i = 0; i < MAX; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sp-pg-cell';
    btn.textContent = i + 1;
    btn.dataset.idx = i;
    btn.setAttribute('aria-label', `Page ${i + 1}`);
    btn.addEventListener('click', e => onPgridClick(e, i));
    D.pgrid.appendChild(btn);
  }

  if (TOTAL_PAGES > MAX) {
    const note = document.createElement('p');
    note.className = 'sp-pg-overflow';
    note.innerHTML = `<i class="fa fa-info-circle"></i> Showing first ${MAX} of ${TOTAL_PAGES} pages. Type ranges beyond ${MAX} directly in the input above.`;
    D.pgrid.after(note);
  }
  refreshPgrid();
}

function onPgridClick(e, idx) {
  if (e.shiftKey && _shiftStart >= 0) {
    const a = Math.min(_shiftStart, idx), b = Math.max(_shiftStart, idx);
    const select = !PAGE_SEL.has(_shiftStart);
    for (let i = a; i <= Math.min(b, TOTAL_PAGES - 1); i++) {
      if (select) PAGE_SEL.add(i); else PAGE_SEL.delete(i);
    }
  } else {
    if (PAGE_SEL.has(idx)) PAGE_SEL.delete(idx); else PAGE_SEL.add(idx);
    _shiftStart = idx;
  }
  syncInputFromGrid(); refreshPgrid(); updateRangePreview(); updateSplitPreview(); refreshThumbSel();
}

function refreshPgrid() {
  if (!D.pgrid) return;
  D.pgrid.querySelectorAll('.sp-pg-cell').forEach(cell => {
    const idx = parseInt(cell.dataset.idx);
    const sel = PAGE_SEL.has(idx);
    cell.classList.toggle('selected', sel);
    cell.setAttribute('aria-pressed', sel ? 'true' : 'false');
  });
  if (D.pgridSel) {
    const n = PAGE_SEL.size;
    D.pgridSel.textContent = n === 0 ? 'None selected' : `${n} page${n !== 1 ? 's' : ''} selected`;
    D.pgridSel.className = 'sp-pgrid-sel' + (n > 0 ? ' has-sel' : '');
  }
}

// Sync rangeInput → PAGE_SEL
function syncGridFromInput() {
  PAGE_SEL.clear();
  const val = D.rangeInput.value.trim();
  if (val && TOTAL_PAGES) parseRangeStr(val, TOTAL_PAGES).forEach(p => PAGE_SEL.add(p));
  refreshPgrid(); refreshThumbSel();
}

// Sync PAGE_SEL → rangeInput (compact range notation)
function syncInputFromGrid() {
  const sorted = Array.from(PAGE_SEL).sort((a, b) => a - b);
  if (!sorted.length) { D.rangeInput.value = ''; return; }
  const ranges = [];
  let s = sorted[0], e = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === e + 1) { e = sorted[i]; }
    else { ranges.push(e > s ? `${s + 1}-${e + 1}` : `${s + 1}`); if (i < sorted.length) { s = sorted[i]; e = sorted[i]; } }
  }
  D.rangeInput.value = ranges.join(', ');
}

// ── QUICK-SELECT ─────────────────────────────────────────────────────────────
function applyQuickSel(type) {
  if (!TOTAL_PAGES) { showToast('Upload a PDF first', 'warn'); return; }
  const n = Math.max(1, parseInt(D.qsN ? D.qsN.value : 5) || 5);
  PAGE_SEL.clear();
  switch(type) {
    case 'all':   for (let i = 0; i < TOTAL_PAGES; i++) PAGE_SEL.add(i); break;
    case 'none':  break;
    case 'odd':   for (let i = 0; i < TOTAL_PAGES; i += 2) PAGE_SEL.add(i); break;
    case 'even':  for (let i = 1; i < TOTAL_PAGES; i += 2) PAGE_SEL.add(i); break;
    case 'first': for (let i = 0; i < Math.min(n, TOTAL_PAGES); i++) PAGE_SEL.add(i); break;
    case 'last':  for (let i = Math.max(0, TOTAL_PAGES - n); i < TOTAL_PAGES; i++) PAGE_SEL.add(i); break;
  }
  syncInputFromGrid(); refreshPgrid(); updateRangePreview(); updateSplitPreview(); refreshThumbSel();
}

// ── RANGE PREVIEW CHIPS ──────────────────────────────────────────────────────
function updateRangePreview() {
  const val = D.rangeInput.value.trim();
  if (!val || !TOTAL_PAGES) {
    D.rangePreview.innerHTML = '<span class="sp-rp-hint">Selected pages will appear here</span>';
    return;
  }
  const pages = parseRangeStr(val, TOTAL_PAGES);
  if (!pages.length) { D.rangePreview.innerHTML = '<span class="sp-rp-warn"><i class="fa fa-exclamation-triangle"></i> No valid pages</span>'; return; }
  const chips = pages.slice(0, 40).map(p => `<span class="sp-range-chip">${p + 1}</span>`).join('');
  const extra = pages.length > 40 ? `<span class="sp-range-chip sp-range-chip-more">+${pages.length - 40}</span>` : '';
  D.rangePreview.innerHTML = chips + extra + `<span class="sp-range-count">${pages.length} page${pages.length !== 1 ? 's' : ''}</span>`;
}

function parseRangeStr(str, total) {
  const pages = new Set();
  str.replace(/\s/g, '').split(',').forEach(part => {
    if (part.includes('-')) {
      const [a, b] = part.split('-');
      const s = Math.max(0, parseInt(a) - 1), e = Math.min(total - 1, parseInt(b) - 1);
      if (!isNaN(s) && !isNaN(e) && s <= e) for (let i = s; i <= e; i++) pages.add(i);
    } else if (/^\d+$/.test(part)) {
      const idx = parseInt(part) - 1;
      if (idx >= 0 && idx < total) pages.add(idx);
    }
  });
  return Array.from(pages).sort((a, b) => a - b);
}

// ── CHUNKS PREVIEW ───────────────────────────────────────────────────────────
function updateChunksPreview() {
  if (!TOTAL_PAGES || !D.chunksPreview) return;
  if (SELECTED_MODE === 'every_n' || true) {
    const n = Math.max(1, parseInt(D.everyNInput.value) || 1);
    const chunks = Math.ceil(TOTAL_PAGES / n);
    const last = TOTAL_PAGES % n || n;
    D.chunksPreview.innerHTML = `<i class="fa fa-info-circle"></i> ${chunks} file${chunks !== 1 ? 's' : ''} — ${n} page${n !== 1 ? 's' : ''} each${last !== n ? `, last file has ${last}` : ''}`;
  }
}

// ── LIVE SPLIT PREVIEW ───────────────────────────────────────────────────────
function updateSplitPreview() {
  if (!D.splitPreview) return;
  if (!FILE) { D.splitPreview.innerHTML = ''; return; }

  let html = '<i class="fa fa-cut"></i> ';
  switch(SELECTED_MODE) {
    case 'all':
      html += TOTAL_PAGES
        ? `Will create <strong>${TOTAL_PAGES}</strong> file${TOTAL_PAGES !== 1 ? 's' : ''} — 1 page each`
        : 'Will split every page into a separate file';
      break;
    case 'range': {
      const pages = parseRangeStr(D.rangeInput.value.trim(), TOTAL_PAGES);
      html += pages.length
        ? `Will create <strong>1 file</strong> with <strong>${pages.length}</strong> selected page${pages.length !== 1 ? 's' : ''}`
        : 'Select pages using the grid or type ranges';
      break;
    }
    case 'every_n': {
      const n = Math.max(1, parseInt(D.everyNInput.value) || 1);
      const chunks = TOTAL_PAGES ? Math.ceil(TOTAL_PAGES / n) : '?';
      html += `Will create <strong>${chunks}</strong> file${chunks !== 1 ? 's' : ''} — <strong>${n}</strong> page${n !== 1 ? 's' : ''} each`;
      break;
    }
    case 'bookmarks': {
      const bk = BOOKMARKS.length;
      html += bk
        ? `Will create <strong>${bk}</strong> file${bk !== 1 ? 's' : ''} — 1 per chapter`
        : 'Will split by detected chapters / bookmarks';
      break;
    }
    case 'odd_even':
      html += 'Will create <strong>2 files</strong> — odd pages &amp; even pages';
      break;
    case 'size_limit':
      html += `Will split into parts of max <strong>${D.sizeSlider.value} MB</strong> each`;
      break;
    case 'blank_pages':
      html += 'Will split at blank separator pages — count detected during processing';
      break;
  }
  D.splitPreview.innerHTML = html;
}

// ── BOOKMARKS LIST ───────────────────────────────────────────────────────────
function renderBookmarksList() {
  if (!D.bookmarksList) return;
  if (!BOOKMARKS.length) {
    D.bookmarksList.innerHTML = '<div class="sp-bookmark-item sp-bk-empty"><i class="fa fa-info-circle"></i> No bookmarks found — will fallback to every-5-pages split</div>';
    return;
  }
  D.bookmarksList.innerHTML = BOOKMARKS.slice(0, 15).map(b =>
    `<div class="sp-bookmark-item" style="padding-left:${10 + b.depth * 14}px">
      <i class="fa fa-bookmark"></i> ${escHtml(b.title)}
    </div>`
  ).join('') + (BOOKMARKS.length > 15 ? `<div class="sp-bookmark-item sp-bk-more"><i class="fa fa-ellipsis-h"></i> +${BOOKMARKS.length - 15} more chapters</div>` : '');
}

// ── MAIN SPLIT ───────────────────────────────────────────────────────────────
async function doSplit() {
  if (!FILE) return;
  if (SELECTED_MODE === 'range') {
    const val = D.rangeInput.value.trim();
    if (!val) { showToast('Select pages using the grid, or type a range like: 1-3, 5, 7-9', 'warn'); playSound('warn'); return; }
    if (!parseRangeStr(val, TOTAL_PAGES).length) { showToast('No valid pages in this range', 'error'); playSound('error'); return; }
  }

  playSound('start');
  const jobId = 'split_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

  const fd = new FormData();
  fd.append('file', FILE);
  fd.append('mode', SELECTED_MODE);
  fd.append('ranges', D.rangeInput.value.trim());
  fd.append('every_n', D.everyNInput.value);
  fd.append('max_size_mb', D.sizeSlider.value);
  fd.append('password', D.pdfPassword.value);
  fd.append('naming_pattern', D.namingPattern.value.trim() || 'page_{n:04d}');
  fd.append('remove_blanks', D.removeBlanks.checked ? 'true' : 'false');
  fd.append('job_id', jobId);

  // Switch to progress view
  D.actionSection.hidden = true;
  D.modesCard.hidden = true;
  D.optsCard.hidden = true;
  D.advCard.hidden = true;
  D.progressCard.hidden = false;
  D.resultsCard.hidden = true;

  if (typeof gsap !== 'undefined') gsap.from(D.progressCard, { y: 20, duration: .4, ease: 'power2.out' });

  setProgress(0, 'Uploading…', 'Sending file to server');
  addStep('active', 'Uploading PDF…');
  startSSE(jobId);

  _currentPct = 0;
  _simTimer = setInterval(() => {
    if (_currentPct < 70) { _currentPct += 1.5 + Math.random() * 2.5; setProgress(Math.min(70, _currentPct), 'Splitting PDF…', 'Processing pages'); }
  }, 150);

  try {
    const resp = await fetch('/api/split-pdf', { method: 'POST', body: fd });
    clearInterval(_simTimer); stopSSE();

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Server error' }));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    setProgress(92, 'Creating ZIP…', 'Packaging split files');
    addStep('done', '✔ PDF processed successfully');
    addStep('active', 'Building ZIP archive…');

    const blob = await resp.blob();
    const fileCount  = parseInt(resp.headers.get('X-File-Count') || '0');
    const totalPages = parseInt(resp.headers.get('X-Total-Pages') || TOTAL_PAGES || '0');
    const skipped    = parseInt(resp.headers.get('X-Skipped-Blanks') || '0');

    const stem = FILE.name.replace(/\.pdf$/i, '');
    RESULT_NAME = `${stem}_split.zip`;
    RESULT_BLOB = blob;

    setProgress(100, 'Done! 🎉', '');
    addStep('done', '✔ ZIP ready — click Download');
    setTimeout(() => showResults(fileCount, totalPages, skipped), 450);
    playSound('success');

  } catch(err) {
    clearInterval(_simTimer); stopSSE();
    console.error('Split error:', err);
    D.progressCard.hidden = true;
    D.modesCard.hidden = false;
    showModeOptions(SELECTED_MODE);
    D.advCard.hidden = false;
    D.actionSection.hidden = false;
    playSound('error');
    showToast('Error: ' + (err.message || 'Split failed. Try again.'), 'error');
  }
}

// ── SSE ──────────────────────────────────────────────────────────────────────
function startSSE(jobId) {
  try {
    _sseSource = new EventSource(`/api/progress/${jobId}`);
    _sseSource.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.ping) return;
        if (msg.pct !== undefined && msg.pct > _currentPct) {
          _currentPct = msg.pct;
          setProgress(msg.pct, msg.title || 'Processing…', msg.sub || '');
        }
        if (msg.step) addStep('done', msg.step);
        if (msg.done) stopSSE();
      } catch(_) {}
    };
    _sseSource.onerror = () => stopSSE();
  } catch(_) {}
}
function stopSSE() { if (_sseSource) { _sseSource.close(); _sseSource = null; } }

// ── PROGRESS UI ──────────────────────────────────────────────────────────────
function setProgress(pct, title, sub) {
  pct = Math.max(0, Math.min(100, Math.round(pct)));
  D.progressFill.style.width = pct + '%';
  D.progressPct.textContent  = pct + '%';
  if (title)            D.progressTitle.textContent = title;
  if (sub !== undefined) D.progressSub.textContent   = sub;
}
function addStep(state, text) {
  const el = document.createElement('div');
  el.className = 'sp-progress-step ' + state;
  el.innerHTML = state === 'done'
    ? `<i class="fa fa-check-circle"></i> ${escHtml(text)}`
    : `<i class="fa fa-circle-notch fa-spin"></i> ${escHtml(text)}`;
  D.progressSteps.appendChild(el);
  if (D.progressSteps.children.length > 8) D.progressSteps.removeChild(D.progressSteps.firstChild);
  D.progressSteps.scrollTop = D.progressSteps.scrollHeight;
}

// ── RESULTS ──────────────────────────────────────────────────────────────────
function showResults(fileCount, totalPages, skipped) {
  D.progressCard.hidden = true;
  D.resultsCard.hidden  = false;
  D.resFileCount.textContent  = fileCount  || '—';
  D.resTotalPages.textContent = totalPages || TOTAL_PAGES || '—';
  if (skipped > 0) D.resSkipped.textContent = skipped;
  else D.resSkippedWrap.hidden = true;

  if (typeof gsap !== 'undefined') {
    gsap.from(D.resultsCard, { y: 30, duration: .5, ease: 'power3.out' });
    gsap.from('.sp-check-circle', { scale: 0, duration: .5, delay: .1, ease: 'back.out(1.5)' });
    gsap.from('.sp-res-stat', { y: 20, duration: .4, stagger: .1, delay: .2, ease: 'power2.out' });
    launchConfetti();
  }
}

function launchConfetti() {
  const colors = ['#3b82f6','#06b6d4','#10b981','#8b5cf6','#f59e0b','#ec4899','#ef4444'];
  for (let i = 0; i < 26; i++) {
    const dot = document.createElement('div');
    const sz = 5 + Math.random() * 9;
    const shape = Math.random() > .45 ? '50%' : '2px';
    dot.style.cssText = `position:fixed;width:${sz}px;height:${sz}px;border-radius:${shape};
      background:${colors[i % colors.length]};pointer-events:none;z-index:9999;
      left:${Math.random() * 100}vw;top:100vh`;
    document.body.appendChild(dot);
    gsap.to(dot, {
      y: -(window.innerHeight * .88 + Math.random() * window.innerHeight * .5),
      x: (Math.random() - .5) * 260,
      rotation: Math.random() * 720,
      duration: 1.3 + Math.random() * .9,
      delay: Math.random() * .5,
      ease: 'power2.out',
      onComplete: () => dot.remove(),
    });
  }
}

// ── DOWNLOAD ─────────────────────────────────────────────────────────────────
function downloadResult() {
  if (!RESULT_BLOB) return;
  playSound('download');
  const url = URL.createObjectURL(RESULT_BLOB);
  const a = document.createElement('a');
  a.href = url; a.download = RESULT_NAME;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ── RESET ────────────────────────────────────────────────────────────────────
function resetTool() {
  FILE = null; TOTAL_PAGES = 0; BOOKMARKS = []; RESULT_BLOB = null; RESULT_NAME = '';
  PAGE_SEL.clear(); _shiftStart = -1; _currentPct = 0;
  clearInterval(_simTimer); stopSSE();

  D.fileInput.value = '';
  D.fileCard.hidden      = true;
  D.uploadCard.hidden    = false;
  D.modesCard.hidden     = true;
  D.optsCard.hidden      = true;
  D.advCard.hidden       = true;
  D.actionSection.hidden = true;
  D.progressCard.hidden  = true;
  D.resultsCard.hidden   = true;

  D.thumbsStrip.innerHTML = '';
  D.thumbsStrip.appendChild(D.thumbsLoading);
  D.thumbsLoading.hidden = false;
  D.thumbsCount.textContent = '';
  D.statBookmarks.classList.add('sp-hidden');
  D.progressSteps.innerHTML = '';
  D.resSkippedWrap.hidden = false;
  D.rangeInput.value = ''; D.rangePreview.innerHTML = '';
  if (D.pgrid) D.pgrid.innerHTML = '';
  if (D.pgridSel) { D.pgridSel.textContent = 'None selected'; D.pgridSel.className = 'sp-pgrid-sel'; }
  if (D.splitPreview) D.splitPreview.innerHTML = '';
  D.everyNInput.value = 2;
  D.advBody.hidden = true; D.advArrow.classList.remove('open');
  D.pdfPassword.value = ''; D.removeBlanks.checked = false;
  D.namingPattern.value = 'page_{n:04d}';
  BOOKMARKS = []; SELECTED_MODE = 'all';
  D.modesGrid.querySelectorAll('.sp-mode-card').forEach(c => c.classList.toggle('active', c.dataset.mode === 'all'));

  if (typeof gsap !== 'undefined') gsap.from(D.uploadCard, { scale: .97, duration: .35, ease: 'power2.out' });
}

// ── THEME ────────────────────────────────────────────────────────────────────
function initTheme() { setTheme(localStorage.getItem('sp-theme') || 'dark'); }
function toggleTheme() { setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('sp-theme', t);
  D.themeBtn.innerHTML = t === 'dark' ? '<i class="fa fa-moon"></i>' : '<i class="fa fa-sun"></i>';
}

// ── TOAST ────────────────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, type = 'info') {
  let t = document.querySelector('.sp-toast');
  if (!t) { t = document.createElement('div'); t.className = 'sp-toast'; document.body.appendChild(t); }
  const icons = { error: 'fa-exclamation-circle', success: 'fa-check-circle', warn: 'fa-exclamation-triangle', info: 'fa-info-circle' };
  t.className = 'sp-toast ' + type;
  t.innerHTML = `<i class="fa ${icons[type] || icons.info}"></i> ${escHtml(msg)}`;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}

// ── FAQ ──────────────────────────────────────────────────────────────────────
function initFAQ() {
  if (!D.faqList) return;
  D.faqList.querySelectorAll('.sp-faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.sp-faq-item');
      const isOpen = item.classList.contains('open');
      D.faqList.querySelectorAll('.sp-faq-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
}

// ── PARTICLES ────────────────────────────────────────────────────────────────
function initParticles() {
  const c = document.getElementById('heroParticles');
  if (!c) return;
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('div');
    p.className = 'sp-particle';
    const s = 4 + Math.random() * 14;
    p.style.cssText = `width:${s}px;height:${s}px;left:${Math.random() * 100}%;animation-duration:${5 + Math.random() * 9}s;animation-delay:${Math.random() * 7}s;`;
    c.appendChild(p);
  }
}

// ── GSAP INTRO ───────────────────────────────────────────────────────────────
function initGSAP() {
  if (typeof gsap === 'undefined') return;
  // NEVER use opacity:0 for above-fold elements
  gsap.from('.sp-hero-badge',      { y: 18, duration: .6, delay: .1, ease: 'power2.out' });
  gsap.from('.sp-hero-h1',         { y: 28, duration: .7, delay: .2, ease: 'power2.out' });
  gsap.from('.sp-hero-sub',        { y: 18, duration: .6, delay: .32, ease: 'power2.out' });
  gsap.from('.sp-hero-pills span', { y: 12, duration: .5, stagger: .06, delay: .44, ease: 'power2.out' });
  gsap.from('.sp-upload-card',     { y: 28, duration: .7, delay: .54, ease: 'power2.out' });

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        gsap.from(e.target.querySelectorAll('.sp-step-card, .sp-feat-card, .sp-rel-card, .sp-faq-item'), { y: 20, duration: .5, stagger: .06, ease: 'power2.out' });
        io.unobserve(e.target);
      }
    });
  }, { threshold: .1 });
  document.querySelectorAll('.sp-howto, .sp-features, .sp-related, .sp-faq').forEach(s => io.observe(s));
}

// ── HELPERS ──────────────────────────────────────────────────────────────────
function formatSize(bytes) {
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1048576)     return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824)  return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
