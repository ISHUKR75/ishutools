/**
 * split-pdf/script.js  v8.0 — IshuTools.fun
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 *
 * Enterprise Split PDF Engine — Full UX Overhaul
 * - NO file size limit
 * - fahhhhh.mp3 on download
 * - Simplified UX, maximum features
 * - SSE progress + confetti + GSAP
 * - Canvas animated background
 * - Fully responsive + accessible
 * - Smart download naming from original file
 */
'use strict';

/* ═══════════════════════════════════════════════════════════
   MODULE STATE
═══════════════════════════════════════════════════════════ */
let FILE           = null;   // uploaded File object
let TOTAL_PAGES    = 0;
let BOOKMARKS      = [];
let BLANK_COUNT    = 0;
let RESULT_BLOB    = null;
let RESULT_NAME    = '';
let RESULT_FILES   = [];    // output filenames from last split
let PAGE_SEL       = new Set();
let SELECTED_MODE  = 'all';
let _shiftStart    = -1;
let _simTimer      = null;
let _sseSource     = null;
let _splitStartTime = 0;    // for elapsed timer
let D              = {};     // DOM refs

/* ═══════════════════════════════════════════════════════════
   QUICK PRESETS
═══════════════════════════════════════════════════════════ */
const PRESETS = [
  { key:'all',      label:'All Pages',    icon:'📄', mode:'all',       opts:{} },
  { key:'odd_even', label:'Odd & Even',   icon:'↕️', mode:'odd_even',  opts:{} },
  { key:'every10',  label:'Every 10 Pgs', icon:'📦', mode:'every_n',   opts:{n:10} },
  { key:'first5',   label:'First 5 Pgs',  icon:'✂️', mode:'range',     opts:{range:'first 5'} },
  { key:'half',     label:'First Half',   icon:'⬆️', mode:'range',     opts:{range_fn:'firsthalf'} },
  { key:'chapters', label:'By Chapters',  icon:'📚', mode:'bookmarks', opts:{} },
];

function applyPreset(p) {
  if (typeof p === 'string') p = PRESETS.find(x => x.key === p);
  if (!p) return;

  applyMode(p.mode);

  if (p.opts.n && D.everyNInput) {
    D.everyNInput.value = p.opts.n;
    updateChunksPreview();
  }
  if ('range' in p.opts || p.opts.range_fn) {
    if (D.rangeInput) {
      if (p.opts.range_fn === 'firsthalf' && TOTAL_PAGES) {
        D.rangeInput.value = `1-${Math.floor(TOTAL_PAGES / 2)}`;
      } else if (p.opts.range) {
        D.rangeInput.value = p.opts.range;
      }
      updateRangeFromInput();
    }
  }

  updateSplitPreview(); updateModeBadges(); updateSplitBtn(); updateFab();
  S('toggle');
  showToast(`Preset: ${p.label}`, 'info');

  document.querySelectorAll('.sp-preset-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.preset === p.key);
  });
}

function initPresets() {
  document.querySelectorAll('.sp-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });
}

/* ═══════════════════════════════════════════════════════════
   SOUND WRAPPER
═══════════════════════════════════════════════════════════ */
function S(key) {
  if (!soundEnabled()) return;
  try {
    const MAP = {
      add:      () => window.SOUNDS?.playFileAddSound?.(),
      remove:   () => window.SOUNDS?.playFileRemoveSound?.(),
      start:    () => window.SOUNDS?.playMergeStartSound?.(),
      success:  () => window.SOUNDS?.playSuccessChime?.(),
      download: () => window.SOUNDS?.playDownloadWhoosh?.(),  // fahhhhh.mp3
      error:    () => window.SOUNDS?.playErrorSound?.(),
      warn:     () => window.SOUNDS?.playWarningSound?.(),
      tick:     () => window.SOUNDS?.playProgressTick?.(),
      expand:   () => window.SOUNDS?.playExpandSound?.(),
      collapse: () => window.SOUNDS?.playCollapseSound?.(),
      toggle:   () => window.SOUNDS?.playToggleOnSound?.(),
    };
    MAP[key]?.();
  } catch(_) {}
}
function soundEnabled() {
  try { return document.getElementById('soundToggle')?.checked !== false; } catch(_) { return true; }
}

/* ═══════════════════════════════════════════════════════════
   DOM INIT
═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  D = {
    // Nav
    themeBtn:        document.getElementById('themeBtn'),
    // Upload
    fileInput:       document.getElementById('fileInput'),
    dropZone:        document.getElementById('dropZone'),
    uploadCard:      document.getElementById('uploadCard'),
    browseBtn:       document.getElementById('browseBtn'),
    // File info
    fileCard:        document.getElementById('fileCard'),
    fileName:        document.getElementById('fileName'),
    fileSize:        document.getElementById('fileSize'),
    filePages:       document.getElementById('filePages'),
    statBookmarks:   document.getElementById('statBookmarks'),
    statScanned:     document.getElementById('statScanned'),
    fileRemoveBtn:   document.getElementById('fileRemoveBtn'),
    thumbsStrip:     document.getElementById('thumbsStrip'),
    thumbsLoading:   document.getElementById('thumbsLoading'),
    thumbsCount:     document.getElementById('thumbsCount'),
    // Modes
    modesCard:       document.getElementById('modesCard'),
    modesGrid:       document.getElementById('modesGrid'),
    modeSubLine:     document.getElementById('modeSubLine'),
    recommendBanner: document.getElementById('recommendBanner'),
    recText:         document.getElementById('recText'),
    recApplyBtn:     document.getElementById('recApplyBtn'),
    recCloseBtn:     document.getElementById('recCloseBtn'),
    // Options
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
    blankInfoText:   document.getElementById('blankInfoText'),
    rangeGroupsInput:   document.getElementById('rangeGroupsInput'),
    rangeGroupsPreview: document.getElementById('rangeGroupsPreview'),
    // Advanced
    advCard:         document.getElementById('advCard'),
    advToggle:       document.getElementById('advToggle'),
    advBody:         document.getElementById('advBody'),
    advArrow:        document.getElementById('advArrow'),
    pdfPassword:     document.getElementById('pdfPassword'),
    removeBlanks:    document.getElementById('removeBlanks'),
    namingPattern:   document.getElementById('namingPattern'),
    soundToggle:     document.getElementById('soundToggle'),
    // Action
    actionSection:   document.getElementById('actionSection'),
    splitBtn:        document.getElementById('splitBtn'),
    splitBtnBadge:   document.getElementById('splitBtnBadge'),
    // Progress
    progressCard:    document.getElementById('progressCard'),
    progressFill:    document.getElementById('progressFill'),
    progressPct:     document.getElementById('progressPct'),
    progressTitle:   document.getElementById('progressTitle'),
    progressSub:     document.getElementById('progressSub'),
    progressSteps:   document.getElementById('progressSteps'),
    // Results
    resultsCard:     document.getElementById('resultsCard'),
    resFileCount:    document.getElementById('resFileCount'),
    resTotalPages:   document.getElementById('resTotalPages'),
    resSkipped:      document.getElementById('resSkipped'),
    resSkippedWrap:  document.getElementById('resSkippedWrap'),
    resZipSize:      document.getElementById('resZipSize'),
    resultSummary:   document.getElementById('resultSummary'),
    downloadBtn:     document.getElementById('downloadBtn'),
    // Mobile FAB
    fab:             document.getElementById('fabBtn'),
    // FAQ
    faqList:         document.getElementById('faqList'),
    // Timer & copy
    resTimerWrap:    document.getElementById('resTimerWrap'),
    resTimer:        document.getElementById('resTimer'),
    copyRangeBtn:    document.getElementById('copyRangeBtn'),
    // Presets & output files
    presetsRow:      document.getElementById('presetsRow'),
    resFilesWrap:    document.getElementById('resFilesWrap'),
    resFilesList:    document.getElementById('resFilesList'),
    resFilesToggle:  document.getElementById('resFilesToggle'),
    resFilesToggleLabel: document.getElementById('resFilesToggleLabel'),
  };

  initTheme();
  initDrop();
  initModes();
  initEveryN();
  initSizeSlider();
  initAdvanced();
  initFAQ();
  initBgCanvas();
  initGSAP();
  initStatsCounters();
  initFab();

  // Global keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (D.splitBtn && !D.splitBtn.disabled && !D.actionSection?.hidden) doSplit();
    }
    if (e.key === 'Escape') {
      if (D.recommendBanner && !D.recommendBanner.hidden) D.recommendBanner.hidden = true;
    }
  });

  if (D.themeBtn) D.themeBtn.addEventListener('click', toggleTheme);
  document.getElementById('splitBtn')?.addEventListener('click', doSplit);
  D.copyRangeBtn?.addEventListener('click', copyRangeToClipboard);

  // Output files toggle
  D.resFilesToggle?.addEventListener('click', () => {
    const open = D.resFilesToggle.classList.toggle('open');
    D.resFilesToggle.setAttribute('aria-expanded', open);
    if (D.resFilesList) D.resFilesList.hidden = !open;
    if (D.resFilesToggleLabel) {
      D.resFilesToggleLabel.textContent = open
        ? 'Hide output files'
        : `Show output files (${RESULT_FILES.length})`;
    }
    S(open ? 'expand' : 'collapse');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!D.splitBtn?.disabled && FILE) doSplit();
    }
  });

  initPresets();

  // Expose globals for HTML onclick attrs
  window.downloadResult       = downloadResult;
  window.resetTool            = resetTool;
  window.copyRangeToClipboard = copyRangeToClipboard;
  window.applyPreset          = applyPreset;
});

/* ═══════════════════════════════════════════════════════════
   ANIMATED BACKGROUND CANVAS
═══════════════════════════════════════════════════════════ */
function initBgCanvas() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  function mkP() {
    return {
      x: Math.random() * W, y: Math.random() * H,
      r: 0.8 + Math.random() * 2.2,
      vx: (Math.random() - .5) * .28,
      vy: (Math.random() - .5) * .28,
      a: .1 + Math.random() * .3,
    };
  }
  resize();
  window.addEventListener('resize', resize);
  particles = Array.from({length:65}, mkP);

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const c = isLight ? 'rgba(99,102,241,' : 'rgba(99,102,241,';

    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < -10) p.x = W + 5;
      if (p.x > W+10) p.x = -5;
      if (p.y < -10) p.y = H + 5;
      if (p.y > H+10) p.y = -5;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = c + p.a + ')';
      ctx.fill();
    });
    // Connecting lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d  = Math.sqrt(dx*dx + dy*dy);
        if (d < 110) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = c + (.07 * (1 - d/110)) + ')';
          ctx.lineWidth = .4;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

/* ═══════════════════════════════════════════════════════════
   THEME
═══════════════════════════════════════════════════════════ */
function initTheme() {
  const saved = localStorage.getItem('sp-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('sp-theme', next);
  updateThemeIcon(next);
  S('toggle');
}
function updateThemeIcon(theme) {
  const btn = D.themeBtn; if (!btn) return;
  btn.innerHTML = theme === 'dark'
    ? '<i class="fa fa-sun"></i>'
    : '<i class="fa fa-moon"></i>';
  btn.title = theme === 'dark' ? 'Switch to Light' : 'Switch to Dark';
}

/* ═══════════════════════════════════════════════════════════
   GSAP INIT
═══════════════════════════════════════════════════════════ */
function initGSAP() {
  if (typeof gsap === 'undefined') return;
  // Hero elements — only animate if they exist in DOM
  const safe = (sel, props) => {
    const el = document.querySelector(sel);
    if (el) gsap.from(el, props);
  };
  safe('.sp-hero-badge', { y:20, duration:.5, ease:'power2.out', delay:.15 });
  safe('.sp-hero-title', { y:28, duration:.55, ease:'power2.out', delay:.25 });
  safe('.sp-hero-sub',   { y:22, duration:.5, ease:'power2.out', delay:.35 });
  safe('.sp-hero-pills', { y:16, duration:.45, ease:'power2.out', delay:.45 });
  safe('#uploadCard',    { y:32, duration:.5, ease:'power2.out', delay:.5 });
}

/* ═══════════════════════════════════════════════════════════
   STATS COUNTERS
═══════════════════════════════════════════════════════════ */
function initStatsCounters() {
  const els = document.querySelectorAll('.sp-stat-num[data-count]');
  if (!els.length) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el  = entry.target;
      const target = parseInt(el.dataset.count, 10);
      if (isNaN(target)) return;
      let current = 0;
      const step  = Math.ceil(target / 40);
      const timer = setInterval(() => {
        current = Math.min(current + step, target);
        el.textContent = current;
        if (current >= target) clearInterval(timer);
      }, 30);
      io.unobserve(el);
    });
  }, { threshold:.5 });
  els.forEach(el => io.observe(el));
}

/* ═══════════════════════════════════════════════════════════
   MOBILE FAB
═══════════════════════════════════════════════════════════ */
function initFab() {
  if (!D.fab) return;
  D.fab.addEventListener('click', () => {
    if (FILE && D.splitBtn && !D.splitBtn.disabled) {
      doSplit();
    } else if (!FILE) {
      D.fileInput?.click();
    }
  });
}
function updateFab() {
  if (!D.fab) return;
  if (FILE && D.actionSection && !D.actionSection.hidden) {
    D.fab.removeAttribute('hidden');
    D.fab.innerHTML = D.splitBtn?.disabled
      ? '<i class="fa fa-upload"></i>'
      : '<i class="fa fa-cut"></i>';
  } else {
    D.fab.setAttribute('hidden', '');
  }
}

/* ═══════════════════════════════════════════════════════════
   DROP / FILE INIT
═══════════════════════════════════════════════════════════ */
function initDrop() {
  const { dropZone, fileInput, browseBtn } = D;
  if (!dropZone) return;

  dropZone.addEventListener('click', e => {
    if (e.target === browseBtn || browseBtn?.contains(e.target)) return;
    fileInput.click();
  });
  browseBtn?.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
  fileInput?.addEventListener('change', e => {
    if (e.target.files?.[0]) loadFile(e.target.files[0]);
  });

  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', e => {
    if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    const f = e.dataTransfer?.files?.[0];
    if (f) loadFile(f);
  });
  dropZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  D.fileRemoveBtn?.addEventListener('click', e => { e.stopPropagation(); resetTool(); });
}

/* ═══════════════════════════════════════════════════════════
   LOAD FILE
═══════════════════════════════════════════════════════════ */
async function loadFile(file) {
  if (!file.name.match(/\.pdf$/i) && file.type !== 'application/pdf') {
    showToast('Please upload a PDF file (.pdf only)', 'error');
    S('error'); return;
  }
  // NO file size limit — any size accepted

  FILE = file; TOTAL_PAGES = 0; BOOKMARKS = [];
  BLANK_COUNT = 0; PAGE_SEL = new Set();
  RESULT_BLOB = null; RESULT_NAME = '';

  S('add');

  D.fileName.textContent = file.name;
  D.fileSize.innerHTML   = `<i class="fa fa-hdd"></i> ${fmtBytes(file.size)}`;
  D.filePages.innerHTML  = `<i class="fa fa-file-alt"></i> —`;
  D.statBookmarks?.classList.add('sp-chip-hidden');
  D.statScanned?.classList.add('sp-chip-hidden');

  if (D.thumbsLoading) D.thumbsLoading.hidden = false;
  if (D.thumbsStrip)   { D.thumbsStrip.innerHTML = ''; D.thumbsStrip.appendChild(D.thumbsLoading); }
  if (D.thumbsCount)   D.thumbsCount.textContent = '';

  D.uploadCard.hidden      = true;
  D.fileCard.hidden        = false;
  D.modesCard.hidden       = false;
  D.advCard.hidden         = false;
  D.actionSection.hidden   = false;
  D.optsCard.hidden        = false;
  D.resultsCard.hidden     = true;
  D.progressCard.hidden    = true;
  if (D.recommendBanner)   D.recommendBanner.hidden = true;

  // Show presets row
  if (D.presetsRow) D.presetsRow.removeAttribute('hidden');
  // Clear active preset highlight
  document.querySelectorAll('.sp-preset-btn').forEach(b => b.classList.remove('active'));

  // Default mode = all
  SELECTED_MODE = 'all';
  applyModeUI('all');
  showModeOptions('all');
  updateSplitBtn();
  updateFab();

  // Animate cards in
  if (typeof gsap !== 'undefined') {
    gsap.from(D.fileCard,      { y:22, duration:.4, ease:'power2.out' });
    gsap.from(D.modesCard,     { y:22, duration:.4, delay:.06, ease:'power2.out' });
    gsap.from(D.advCard,       { y:22, duration:.4, delay:.1, ease:'power2.out' });
    gsap.from(D.actionSection, { y:18, duration:.38, delay:.13, ease:'power2.out' });
  }

  await fetchPdfInfo();
  loadThumbs();
}

/* ═══════════════════════════════════════════════════════════
   FETCH PDF INFO
═══════════════════════════════════════════════════════════ */
async function fetchPdfInfo() {
  if (!FILE) return;
  try {
    const fd = new FormData();
    fd.append('file', FILE);
    if (D.pdfPassword?.value) fd.append('password', D.pdfPassword.value);

    const resp = await fetch('/api/split-pdf/info', { method:'POST', body:fd });
    if (!resp.ok) return;
    const info = await resp.json();
    if (!info.success) return;

    TOTAL_PAGES = info.total_pages || 0;
    BLANK_COUNT = info.blank_pages || 0;
    BOOKMARKS   = (info.bookmarks || []).map(b => Array.isArray(b)
      ? {title:b[0], page:b[1]} : b);

    D.filePages.innerHTML = `<i class="fa fa-file-alt"></i> ${
      TOTAL_PAGES ? `${TOTAL_PAGES} page${TOTAL_PAGES!==1?'s':''}` : '—'
    }`;

    if (BOOKMARKS.length) {
      D.statBookmarks.innerHTML = `<i class="fa fa-bookmark"></i> ${BOOKMARKS.length} chapter${BOOKMARKS.length!==1?'s':''}`;
      D.statBookmarks?.classList.remove('sp-chip-hidden');
    }
    if (info.is_scanned) D.statScanned?.classList.remove('sp-chip-hidden');

    if (TOTAL_PAGES) {
      buildPageGrid();
      updateModeBadges();
      updateSplitPreview();
      updateChunksPreview();
      renderBookmarksList();
      updateBlankInfo();
    }
    updateSplitBtn();
    updateFab();

    // Smart recommendation (non-blocking)
    callAutoDetect();

  } catch(e) { console.warn('fetchPdfInfo:', e); }
}

/* ═══════════════════════════════════════════════════════════
   AUTO DETECT
═══════════════════════════════════════════════════════════ */
async function callAutoDetect() {
  if (!FILE || !D.recommendBanner) return;
  try {
    const fd = new FormData();
    fd.append('file', FILE);
    if (D.pdfPassword?.value) fd.append('password', D.pdfPassword.value);

    const resp = await fetch('/api/split-pdf/auto-detect', { method:'POST', body:fd });
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data.success) return;

    const mode = data.recommended_mode;
    const reason = data.reason || '';
    const conf   = Math.round((data.confidence || 0) * 100);

    if (D.recText) {
      D.recText.innerHTML = `<strong>${modeName(mode)}</strong> — ${reason} <em style="color:var(--cyan);font-size:.72rem">${conf}% confidence</em>`;
    }
    if (D.recApplyBtn) {
      D.recApplyBtn.dataset.mode = mode;
      D.recApplyBtn.onclick = () => {
        applyMode(mode);
        D.recommendBanner.hidden = true;
        S('toggle');
        showToast(`Switched to ${modeName(mode)} mode`, 'success');
      };
    }
    if (D.recCloseBtn) {
      D.recCloseBtn.onclick = () => { D.recommendBanner.hidden = true; };
    }
    if ((data.confidence || 0) >= 0.75 && mode !== SELECTED_MODE) {
      D.recommendBanner.hidden = false;
      if (typeof gsap !== 'undefined') {
        gsap.from(D.recommendBanner, { y:-12, duration:.3, ease:'power2.out' });
      }
    }
  } catch(_) {}
}

/* ═══════════════════════════════════════════════════════════
   MODES
═══════════════════════════════════════════════════════════ */
function initModes() {
  if (!D.modesGrid) return;
  D.modesGrid.querySelectorAll('.sp-mode-card').forEach(card => {
    card.addEventListener('click', () => {
      const mode = card.dataset.mode;
      if (!mode) return;
      SELECTED_MODE = mode;
      applyModeUI(mode);
      showModeOptions(mode);
      updateSplitPreview();
      updateSplitBtn();
      updateModeBadges();
      updateFab();
      S('toggle');
    });
    card.addEventListener('keydown', e => {
      if (e.key==='Enter'||e.key===' ') { e.preventDefault(); card.click(); }
    });
  });
}

function applyModeUI(mode) {
  D.modesGrid?.querySelectorAll('.sp-mode-card').forEach(c => {
    c.classList.toggle('active', c.dataset.mode === mode);
    c.setAttribute('aria-checked', c.dataset.mode===mode ? 'true' : 'false');
  });
}

function applyMode(mode) {
  SELECTED_MODE = mode;
  applyModeUI(mode);
  showModeOptions(mode);
  updateSplitPreview();
  updateSplitBtn();
  updateModeBadges();
}

function modeName(m) {
  const MAP = {
    all:'All Pages',range:'Page Range',every_n:'Every N Pages',
    bookmarks:'By Bookmarks',blank_pages:'Blank Separator',
    size_limit:'By File Size',odd_even:'Odd / Even',range_groups:'Range Groups',
  };
  return MAP[m] || m;
}

/* ═══════════════════════════════════════════════════════════
   MODE BADGES
═══════════════════════════════════════════════════════════ */
function updateModeBadges() {
  if (!TOTAL_PAGES) return;
  const n   = Math.max(1, parseInt(D.everyNInput?.value||5));
  const bk  = BOOKMARKS.length;
  const sel = PAGE_SEL.size;
  const grps = (D.rangeGroupsInput?.value||'').split(',').map(s=>s.trim()).filter(Boolean);

  const badges = {
    all:          `→ ${TOTAL_PAGES} files`,
    range:        sel ? `→ 1 file, ${sel}pg` : '',
    every_n:      `→ ${Math.ceil(TOTAL_PAGES/n)} files`,
    bookmarks:    bk ? `→ ${bk} files` : '',
    blank_pages:  BLANK_COUNT>=2 ? `→ ~${BLANK_COUNT+1} files` : '',
    size_limit:   '',
    odd_even:     '→ 2 files',
    range_groups: grps.length ? `→ ${grps.length} file${grps.length>1?'s':''}` : '',
  };

  Object.entries(badges).forEach(([mode, label]) => {
    const id = `mcount-${mode.replace(/_/g,'-')}`;
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  });
}

/* ═══════════════════════════════════════════════════════════
   THUMBNAILS (PDF.js)
═══════════════════════════════════════════════════════════ */
async function loadThumbs() {
  if (!FILE) return;
  if (!window.pdfjsLib) {
    if (D.thumbsLoading) D.thumbsLoading.hidden = true;
    return;
  }
  try {
    const buf = await FILE.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(buf),
      password: D.pdfPassword?.value || ''
    }).promise;

    if (D.thumbsLoading) D.thumbsLoading.hidden = true;
    const total = pdf.numPages;
    const MAX_THUMB = 24;
    const count = Math.min(total, MAX_THUMB);
    if (D.thumbsCount) D.thumbsCount.textContent = total > MAX_THUMB ? `${count} of ${total}` : `${total}`;

    if (!TOTAL_PAGES) {
      TOTAL_PAGES = total;
      D.filePages.innerHTML = `<i class="fa fa-file-alt"></i> ${total} page${total!==1?'s':''}`;
      buildPageGrid(); updateModeBadges(); updateSplitPreview(); updateChunksPreview();
    }

    for (let i = 1; i <= count; i++) await renderThumb(pdf, i);

    if (total > MAX_THUMB) {
      const more = document.createElement('div');
      more.className = 'sp-thumb-more';
      more.innerHTML = `<i class="fa fa-ellipsis-h"></i><span>+${total-MAX_THUMB}</span>`;
      D.thumbsStrip?.appendChild(more);
    }
  } catch(e) {
    if (D.thumbsLoading) D.thumbsLoading.hidden = true;
    console.warn('Thumb load:', e);
  }
}

async function renderThumb(pdf, pageNum) {
  try {
    const page   = await pdf.getPage(pageNum);
    const vp     = page.getViewport({ scale:.22 });
    const canvas = document.createElement('canvas');
    canvas.width  = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext:canvas.getContext('2d'), viewport:vp }).promise;

    const wrap = document.createElement('div');
    wrap.className  = 'sp-thumb';
    wrap.dataset.page = pageNum;
    wrap.setAttribute('role','listitem');
    wrap.setAttribute('aria-label',`Page ${pageNum}`);
    wrap.appendChild(canvas);
    wrap.insertAdjacentHTML('beforeend',
      `<span class="sp-thumb-sel"><i class="fa fa-check"></i></span>
       <span class="sp-thumb-num">${pageNum}</span>`);

    wrap.addEventListener('click', () => {
      if (SELECTED_MODE !== 'range') return;
      const idx = pageNum - 1;
      PAGE_SEL.has(idx) ? PAGE_SEL.delete(idx) : PAGE_SEL.add(idx);
      wrap.classList.toggle('pg-selected', PAGE_SEL.has(idx));
      syncGridFromSel(); syncInputFromGrid();
      updateSplitPreview(); updateModeBadges(); updateSplitBtn();
    });

    D.thumbsStrip?.appendChild(wrap);
  } catch(e) { console.warn(`Thumb p${pageNum}:`, e); }
}

/* ═══════════════════════════════════════════════════════════
   PAGE GRID
═══════════════════════════════════════════════════════════ */
function buildPageGrid() {
  if (!D.pgrid || !TOTAL_PAGES) return;
  D.pgrid.innerHTML = '';
  const CAP  = 300;
  const show = Math.min(TOTAL_PAGES, CAP);

  for (let i = 0; i < show; i++) {
    const cell = document.createElement('div');
    cell.className  = 'sp-pg-cell' + (PAGE_SEL.has(i) ? ' selected' : '');
    cell.textContent = i + 1;
    cell.dataset.idx = i;
    cell.addEventListener('click', e => onCellClick(e, i));
    D.pgrid.appendChild(cell);
  }

  if (TOTAL_PAGES > CAP) {
    const ov = document.createElement('div');
    ov.className = 'sp-pg-overflow';
    ov.innerHTML = `<i class="fa fa-info-circle"></i> ${TOTAL_PAGES-CAP} more pages — use the range field above`;
    D.pgrid.after?.(ov);
  }
}

function onCellClick(e, idx) {
  if (e.shiftKey && _shiftStart >= 0) {
    const lo = Math.min(_shiftStart, idx), hi = Math.max(_shiftStart, idx);
    for (let i = lo; i <= hi; i++) PAGE_SEL.add(i);
  } else {
    PAGE_SEL.has(idx) ? PAGE_SEL.delete(idx) : PAGE_SEL.add(idx);
    _shiftStart = idx;
  }
  syncGridFromSel(); syncInputFromGrid();
  updateSplitPreview(); updateModeBadges(); updateSplitBtn();
}

function syncGridFromSel() {
  D.pgrid?.querySelectorAll('.sp-pg-cell').forEach(c => {
    c.classList.toggle('selected', PAGE_SEL.has(parseInt(c.dataset.idx)));
  });
  D.thumbsStrip?.querySelectorAll('.sp-thumb[data-page]').forEach(t => {
    t.classList.toggle('pg-selected', PAGE_SEL.has(parseInt(t.dataset.page)-1));
  });
  if (D.pgridSel) {
    const n = PAGE_SEL.size;
    D.pgridSel.textContent = n ? `${n} page${n!==1?'s':''} selected` : 'None selected';
    D.pgridSel.className   = 'sp-pgrid-sel-count' + (n ? ' has-sel' : '');
  }
}

function syncInputFromGrid() {
  if (!D.rangeInput) return;
  if (!PAGE_SEL.size) { D.rangeInput.value = ''; updateRangePreview(); return; }
  const sorted = Array.from(PAGE_SEL).sort((a,b)=>a-b);
  const segs=[]; let s=sorted[0],e2=sorted[0];
  for (let i=1; i<=sorted.length; i++) {
    if (i<sorted.length && sorted[i]===e2+1) { e2=sorted[i]; continue; }
    segs.push(s===e2 ? String(s+1) : `${s+1}-${e2+1}`);
    if (i<sorted.length) { s=sorted[i]; e2=sorted[i]; }
  }
  D.rangeInput.value = segs.join(', ');
  updateRangePreview();
}

function updateRangeFromInput() {
  if (!D.rangeInput || !TOTAL_PAGES) return;
  PAGE_SEL = new Set(parseRangeStr(D.rangeInput.value, TOTAL_PAGES));
  syncGridFromSel(); updateRangePreview();
  updateRangeInputState();
  updateSplitPreview(); updateModeBadges(); updateSplitBtn();
}

function updateRangePreview() {
  const el = D.rangePreview; if (!el) return;
  const val = D.rangeInput?.value?.trim();
  if (!val) { el.innerHTML = '<span class="sp-rp-hint">No pages selected</span>'; return; }
  if (!TOTAL_PAGES) { el.innerHTML = '<span class="sp-rp-hint">Upload a PDF first</span>'; return; }

  const pages = parseRangeStr(val, TOTAL_PAGES);
  if (!pages.length) {
    el.innerHTML = '<span class="sp-rp-warn"><i class="fa fa-exclamation-triangle"></i> No valid pages in this range</span>';
    return;
  }
  const sorted = [...pages].sort((a,b)=>a-b);
  const groups=[]; let gs=sorted[0],ge=sorted[0];
  for (let i=1; i<=sorted.length; i++) {
    if (i<sorted.length && sorted[i]===ge+1) { ge=sorted[i]; continue; }
    groups.push(gs===ge ? `${gs+1}` : `${gs+1}–${ge+1}`);
    if (i<sorted.length) { gs=sorted[i]; ge=sorted[i]; }
  }
  const shown = groups.slice(0, 10);
  let html = shown.map(g => `<span class="sp-range-chip">${g}</span>`).join('');
  if (groups.length>10) html += `<span class="sp-range-chip" style="opacity:.7">+${groups.length-10}</span>`;
  html += `<span class="sp-range-count">${pages.length} page${pages.length!==1?'s':''}</span>`;
  el.innerHTML = html;
}

function updateRangeGroupsPreview() {
  const el = D.rangeGroupsPreview; if (!el) return;
  const val = (D.rangeGroupsInput?.value || '').trim();
  if (!val) {
    el.innerHTML = '<span class="sp-rp-hint">Each comma-separated range → its own PDF file</span>';
    return;
  }
  if (!TOTAL_PAGES) {
    el.innerHTML = '<span class="sp-rp-hint">Upload a PDF first to validate ranges</span>';
    return;
  }
  const tokens = val.split(',').map(s=>s.trim()).filter(Boolean);
  let html='', valid=0, invalid=0;
  tokens.forEach((tok, i) => {
    const pages = parseRangeStr(tok, TOTAL_PAGES);
    if (!pages.length) {
      html += `<span class="sp-range-chip" style="background:rgba(239,68,68,.18);color:#ef4444">File ${i+1}: ${tok} ✗</span>`;
      invalid++;
    } else {
      html += `<span class="sp-range-chip">File ${i+1}: <strong>${tok}</strong> (${pages.length}pp)</span>`;
      valid++;
    }
  });
  html += `<span class="sp-range-count">${valid} file${valid!==1?'s':''}${invalid?' · '+invalid+' invalid':''}</span>`;
  el.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════
   SHOW MODE OPTIONS
═══════════════════════════════════════════════════════════ */
function showModeOptions(mode) {
  if (!D.optsCard) return;
  D.optsCard.querySelectorAll('[data-mode-opt]').forEach(el => el.hidden = true);

  const MAP = {
    all:          [],
    range:        ['opt-range','opt-qs-bar','opt-pgrid','opt-split-preview'],
    every_n:      ['opt-every-n','opt-split-preview'],
    bookmarks:    ['opt-bookmarks'],
    blank_pages:  ['opt-blank-info'],
    size_limit:   ['opt-size','opt-split-preview'],
    odd_even:     ['opt-odd-even-info'],
    range_groups: ['opt-range-groups'],
  };

  const opts = MAP[mode] || [];
  D.optsCard.hidden = opts.length === 0;

  opts.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  });

  // Wire up range input events
  document.querySelectorAll('.sp-qs-btn').forEach(btn => {
    btn.onclick = () => handleQS(btn.dataset.qs);
  });
  if (D.rangeInput) D.rangeInput.oninput = updateRangeFromInput;
  if (D.rangeGroupsInput) {
    D.rangeGroupsInput.oninput = () => {
      updateRangeGroupsPreview(); updateModeBadges(); updateSplitBtn();
    };
  }

  if (mode === 'bookmarks') renderBookmarksList();
  if (mode === 'blank_pages') updateBlankInfo();
  updateSplitPreview();
  updateChunksPreview();
}

/* ═══════════════════════════════════════════════════════════
   QUICK SELECTS
═══════════════════════════════════════════════════════════ */
function handleQS(type) {
  if (!TOTAL_PAGES) return;
  const n = parseInt(document.getElementById('qsN')?.value || 5);
  PAGE_SEL = new Set();
  if (type==='all')   for(let i=0;i<TOTAL_PAGES;i++) PAGE_SEL.add(i);
  if (type==='none')  PAGE_SEL = new Set();
  if (type==='odd')   for(let i=0;i<TOTAL_PAGES;i+=2) PAGE_SEL.add(i);
  if (type==='even')  for(let i=1;i<TOTAL_PAGES;i+=2) PAGE_SEL.add(i);
  if (type==='first') PAGE_SEL.add(0);
  if (type==='last')  PAGE_SEL.add(TOTAL_PAGES-1);
  if (type==='firstN') for(let i=0;i<Math.min(n,TOTAL_PAGES);i++) PAGE_SEL.add(i);
  syncGridFromSel(); syncInputFromGrid();
  updateSplitPreview(); updateModeBadges(); updateSplitBtn();
}

/* ═══════════════════════════════════════════════════════════
   EVERY N
═══════════════════════════════════════════════════════════ */
function initEveryN() {
  const inp = D.everyNInput; if (!inp) return;
  inp.addEventListener('input', () => { updateChunksPreview(); updateSplitPreview(); updateModeBadges(); });
  document.getElementById('everyNDec')?.addEventListener('click', () => {
    inp.value = Math.max(1, parseInt(inp.value||5)-1);
    updateChunksPreview(); updateSplitPreview(); updateModeBadges();
  });
  document.getElementById('everyNInc')?.addEventListener('click', () => {
    inp.value = Math.min(9999, parseInt(inp.value||5)+1);
    updateChunksPreview(); updateSplitPreview(); updateModeBadges();
  });
}

function updateChunksPreview() {
  if (!D.chunksPreview || !TOTAL_PAGES) return;
  const n = Math.max(1, parseInt(D.everyNInput?.value||5));
  const chunks = Math.ceil(TOTAL_PAGES/n);
  D.chunksPreview.innerHTML = `<i class="fa fa-layer-group"></i> ${TOTAL_PAGES} pages → <strong>${chunks} file${chunks!==1?'s':''}</strong> of max ${n} pages each`;
}

/* ═══════════════════════════════════════════════════════════
   SIZE SLIDER
═══════════════════════════════════════════════════════════ */
function initSizeSlider() {
  const sl = D.sizeSlider; if (!sl) return;
  sl.addEventListener('input', () => {
    if (D.sizeVal) D.sizeVal.textContent = sl.value + ' MB';
    updateSplitPreview();
  });
}

/* ═══════════════════════════════════════════════════════════
   SPLIT PREVIEW
═══════════════════════════════════════════════════════════ */
function updateSplitPreview() {
  const el = D.splitPreview; if (!el || !TOTAL_PAGES) return;
  const n  = Math.max(1, parseInt(D.everyNInput?.value || 5));
  const mb = D.sizeSlider?.value || 5;

  const MSG = {
    all:         () => `<i class="fa fa-layer-group"></i> <strong>${TOTAL_PAGES} pages</strong> → <strong>${TOTAL_PAGES} PDF files</strong> (one per page)`,
    range:       () => {
                   const cnt = PAGE_SEL.size;
                   return cnt
                     ? `<i class="fa fa-scissors"></i> Extracting <strong>${cnt} page${cnt!==1?'s':''}</strong> → <strong>1 PDF file</strong>`
                     : `<i class="fa fa-info-circle"></i> Select pages to extract below`;
                 },
    every_n:     () => {
                   const chunks = Math.ceil(TOTAL_PAGES / n);
                   return `<i class="fa fa-layer-group"></i> <strong>${TOTAL_PAGES} pages</strong> → <strong>${chunks} file${chunks!==1?'s':''}</strong> of max ${n} pages each`;
                 },
    bookmarks:   () => BOOKMARKS.length
                   ? `<i class="fa fa-bookmark"></i> <strong>${BOOKMARKS.length} chapters</strong> → <strong>${BOOKMARKS.length} PDF files</strong>`
                   : `<i class="fa fa-info-circle"></i> No bookmarks found — will split every 5 pages`,
    blank_pages: () => BLANK_COUNT >= 2
                   ? `<i class="fa fa-align-justify"></i> <strong>${BLANK_COUNT} blank pages</strong> detected → <strong>~${BLANK_COUNT + 1} sections</strong>`
                   : `<i class="fa fa-info-circle"></i> No blank pages detected — will not create any splits`,
    size_limit:  () => `<i class="fa fa-balance-scale"></i> Each output part will be ≤ <strong>${mb} MB</strong> — zero quality loss`,
    odd_even:    () => `<i class="fa fa-exchange-alt"></i> <strong>${TOTAL_PAGES} pages</strong> → <strong>2 PDF files</strong> (odd pages + even pages)`,
    range_groups: () => {
                   const grps = (D.rangeGroupsInput?.value||'').split(',').map(s=>s.trim()).filter(Boolean);
                   return grps.length
                     ? `<i class="fa fa-th-list"></i> <strong>${grps.length} range${grps.length!==1?'s':''}</strong> → <strong>${grps.length} separate PDF file${grps.length!==1?'s':''}</strong>`
                     : `<i class="fa fa-info-circle"></i> Enter ranges above — e.g. 1-10, 11-20, 21-end`;
                 },
  };

  el.innerHTML = (MSG[SELECTED_MODE]?.() || '');
}

/* ═══════════════════════════════════════════════════════════
   BLANK INFO / BOOKMARKS
═══════════════════════════════════════════════════════════ */
function updateBlankInfo() {
  const el = D.blankInfoText; if (!el) return;
  if (BLANK_COUNT>=2) {
    el.textContent = `Found ${BLANK_COUNT} blank page${BLANK_COUNT!==1?'s':''} — they will be used as split points, creating ~${BLANK_COUNT+1} output files.`;
  } else if (BLANK_COUNT===1) {
    el.textContent = `Found 1 blank page — it will be used as a split point.`;
  } else {
    el.textContent = `No blank pages detected. This mode automatically splits at blank separator pages.`;
  }
}

function renderBookmarksList() {
  const el = D.bookmarksList; if (!el) return;
  if (!BOOKMARKS.length) {
    el.innerHTML = '<div class="sp-bk-empty"><i class="fa fa-info-circle"></i> No bookmarks found — will fall back to Every 5 Pages mode.</div>';
    return;
  }
  el.innerHTML = BOOKMARKS.slice(0,50).map((bk,i) =>
    `<div class="sp-bookmark-item">
       <i class="fa fa-bookmark"></i>
       <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${bk.title||`Chapter ${i+1}`}</span>
       <span style="font-size:.65rem;color:var(--text3);flex-shrink:0">pg ${bk.page}</span>
     </div>`
  ).join('') + (BOOKMARKS.length>50 ? `<div class="sp-bk-empty">+${BOOKMARKS.length-50} more chapters</div>` : '');
}

/* ═══════════════════════════════════════════════════════════
   ADVANCED
═══════════════════════════════════════════════════════════ */
function initAdvanced() {
  const { advToggle, advBody, advArrow } = D;
  if (!advToggle) return;
  advToggle.addEventListener('click', () => {
    const open = !advBody.hidden;
    advBody.hidden = open;
    advToggle.setAttribute('aria-expanded', !open);
    advArrow?.classList.toggle('open', !open);
    S(open ? 'collapse' : 'expand');
  });
}

/* ═══════════════════════════════════════════════════════════
   FAQ
═══════════════════════════════════════════════════════════ */
function initFAQ() {
  document.querySelectorAll('.sp-faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item   = btn.closest('.sp-faq-item');
      const answer = item.querySelector('.sp-faq-a');
      const isOpen = answer.classList.contains('open');

      // Close all
      document.querySelectorAll('.sp-faq-a.open').forEach(a => {
        a.classList.remove('open');
        a.closest('.sp-faq-item')?.querySelector('.sp-faq-q')?.setAttribute('aria-expanded','false');
      });

      // Toggle current
      if (!isOpen) {
        answer.classList.add('open');
        btn.setAttribute('aria-expanded','true');
        S('expand');
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   UPDATE SPLIT BUTTON
═══════════════════════════════════════════════════════════ */
function updateSplitBtn() {
  if (!D.splitBtn) return;
  let canSplit = !!FILE;

  if (SELECTED_MODE === 'range') {
    canSplit = canSplit && PAGE_SEL.size > 0;
  } else if (SELECTED_MODE === 'range_groups') {
    const groups = (D.rangeGroupsInput?.value||'').split(',').map(s=>s.trim()).filter(Boolean);
    canSplit = canSplit && groups.length > 0;
  }

  D.splitBtn.disabled = !canSplit;

  // Badge
  if (D.splitBtnBadge && TOTAL_PAGES) {
    const n = Math.max(1, parseInt(D.everyNInput?.value||5));
    const map = {
      all:          `${TOTAL_PAGES} files`,
      range:        PAGE_SEL.size ? `${PAGE_SEL.size} pages` : '',
      every_n:      `${Math.ceil(TOTAL_PAGES/n)} files`,
      bookmarks:    BOOKMARKS.length ? `${BOOKMARKS.length} files` : '',
      blank_pages:  BLANK_COUNT>=2 ? `~${BLANK_COUNT+1} files` : '',
      size_limit:   '',
      odd_even:     '2 files',
      range_groups: (() => {
        const g = (D.rangeGroupsInput?.value||'').split(',').map(s=>s.trim()).filter(Boolean);
        return g.length ? `${g.length} file${g.length>1?'s':''}` : '';
      })(),
    };
    D.splitBtnBadge.textContent = map[SELECTED_MODE] || '';
  }

  if (D.modeSubLine) {
    D.modeSubLine.textContent = TOTAL_PAGES
      ? `${TOTAL_PAGES} pages loaded — ${modeName(SELECTED_MODE)} mode`
      : 'Pick how you want to split your PDF';
  }
}

/* ═══════════════════════════════════════════════════════════
   SPLIT
═══════════════════════════════════════════════════════════ */
async function doSplit() {
  if (!FILE || D.splitBtn?.disabled) return;

  S('start');
  _splitStartTime = Date.now();

  D.actionSection.hidden  = true;
  D.optsCard.hidden       = true;
  D.modesCard.hidden      = true;
  D.advCard.hidden        = true;
  D.progressCard.hidden   = false;
  D.resultsCard.hidden    = true;
  updateFab();

  setProgress(0, 'Preparing…', 'Reading your PDF');
  if (D.progressSteps) D.progressSteps.innerHTML = '';
  addStep('active', 'fa-file-pdf', 'Reading PDF structure');

  const fd = new FormData();
  fd.append('file', FILE);
  fd.append('mode', SELECTED_MODE);

  if (SELECTED_MODE === 'range') {
    fd.append('ranges', D.rangeInput?.value || '');
  } else if (SELECTED_MODE === 'range_groups') {
    fd.append('ranges', D.rangeGroupsInput?.value || '');
  } else if (SELECTED_MODE === 'every_n') {
    fd.append('every_n', D.everyNInput?.value || 5);
  } else if (SELECTED_MODE === 'size_limit') {
    fd.append('max_size_mb', D.sizeSlider?.value || 5);
  }

  if (D.pdfPassword?.value) fd.append('password', D.pdfPassword.value);
  if (D.removeBlanks?.checked) fd.append('remove_blanks', 'true');
  if (D.namingPattern?.value) fd.append('naming_pattern', D.namingPattern.value);

  const jobId = 'sp_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
  fd.append('job_id', jobId);

  startSSE(jobId);
  setProgress(12, `Splitting PDF…`, `Mode: ${modeName(SELECTED_MODE)}`);
  addStep('done', 'fa-check', 'PDF structure read');
  addStep('active', 'fa-cut', `Splitting (${modeName(SELECTED_MODE)} mode)`);
  startSimProgress(15, 88, 6000);

  try {
    const resp = await fetch('/api/split-pdf', { method:'POST', body:fd });
    closeSSE(); clearSimProgress();

    if (!resp.ok) {
      let msg = `Server error (${resp.status})`;
      try { const j = await resp.json(); msg = j.error || msg; } catch(_) {}
      throw new Error(msg);
    }

    setProgress(95, 'Building ZIP…', 'Packaging split files');
    addStep('done', 'fa-check', 'Splitting complete');
    addStep('active', 'fa-file-archive', 'Building ZIP archive');

    const fileCount  = parseInt(resp.headers.get('X-File-Count') || '0');
    const totalPages = parseInt(resp.headers.get('X-Total-Pages') || TOTAL_PAGES);
    const skipped    = parseInt(resp.headers.get('X-Skipped-Blanks') || '0');
    const zipSizeKB  = parseFloat(resp.headers.get('X-Zip-Size-KB') || '0');
    const dlName     = resp.headers.get('X-Download-Name') || '';
    const fileNames  = resp.headers.get('X-File-Names') || '';
    RESULT_FILES = fileNames ? fileNames.split('|').filter(Boolean) : [];

    RESULT_BLOB = await resp.blob();

    // Smart download name from original file
    const stem = FILE.name.replace(/\.pdf$/i,'').replace(/[^a-zA-Z0-9_\-. ]/g,'_').trim() || 'document';
    RESULT_NAME = dlName || `${stem}_split.zip`;

    setProgress(100, 'Split Complete! ✓', '');
    addStep('done', 'fa-check', 'ZIP ready');

    setTimeout(() => showResults(fileCount, totalPages, skipped, zipSizeKB), 450);

  } catch(e) {
    closeSSE(); clearSimProgress();
    S('error');
    console.error('Split error:', e);
    let userMsg = e.message || 'An unexpected error occurred.';
    if (userMsg.includes('413') || userMsg.includes('too large')) userMsg = 'File too large for a single request. Try splitting in smaller batches.';
    if (userMsg.includes('password')) userMsg = 'Wrong password or PDF is locked. Enter the correct password in Advanced Options.';
    showToast(userMsg, 'error');
    resetToToolView();
  }
}

/* ═══════════════════════════════════════════════════════════
   SSE PROGRESS
═══════════════════════════════════════════════════════════ */
function startSSE(jobId) {
  try {
    _sseSource = new EventSource(`/api/progress/${jobId}`);
    _sseSource.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        if (d.pct !== undefined) setProgress(Math.max(12, Math.min(94,d.pct)), d.msg||'', d.detail||'');
      } catch(_) {}
    };
    _sseSource.onerror = () => closeSSE();
  } catch(_) {}
}
function closeSSE() {
  if (_sseSource) { try { _sseSource.close(); } catch(_) {} _sseSource = null; }
}

function startSimProgress(from, to, ms) {
  clearSimProgress();
  const steps = 70, interval = ms/steps; let step = 0;
  _simTimer = setInterval(() => {
    step++;
    const pct = Math.round(from + (to-from) * (step/steps));
    if (D.progressFill) D.progressFill.style.width = pct + '%';
    if (D.progressPct)  D.progressPct.textContent  = pct + '%';
    if (step >= steps) clearSimProgress();
  }, interval);
}
function clearSimProgress() {
  if (_simTimer) { clearInterval(_simTimer); _simTimer = null; }
}

/* ═══════════════════════════════════════════════════════════
   PROGRESS UI
═══════════════════════════════════════════════════════════ */
function setProgress(pct, title, sub) {
  if (D.progressFill) D.progressFill.style.width = pct + '%';
  if (D.progressPct)  D.progressPct.textContent  = pct + '%';
  if (title && D.progressTitle) D.progressTitle.textContent = title;
  if (sub !== undefined && D.progressSub) D.progressSub.textContent = sub;
}

function addStep(state, icon, text) {
  if (!D.progressSteps) return;
  D.progressSteps.querySelectorAll('.sp-prog-step.active').forEach(el => {
    el.classList.replace('active','done');
    el.querySelector('i').className = 'fa fa-check-circle';
  });
  const div = document.createElement('div');
  div.className = `sp-prog-step ${state}`;
  const iCls = state==='done' ? 'fa-check-circle' : state==='active' ? 'fa-circle-notch fa-spin' : icon;
  div.innerHTML = `<i class="fa ${iCls}"></i><span>${text}</span>`;
  D.progressSteps.appendChild(div);
  D.progressSteps.scrollTop = D.progressSteps.scrollHeight;
}

/* ═══════════════════════════════════════════════════════════
   SHOW RESULTS
═══════════════════════════════════════════════════════════ */
function showResults(fileCount, totalPages, skipped, zipSizeKB) {
  S('success');
  launchConfetti();

  D.progressSteps?.querySelectorAll('.sp-prog-step.active').forEach(el => {
    el.classList.replace('active','done');
    el.querySelector('i').className = 'fa fa-check-circle';
  });

  if (D.resFileCount)  D.resFileCount.textContent  = fileCount || '—';
  if (D.resTotalPages) D.resTotalPages.textContent = totalPages || TOTAL_PAGES || '—';
  if (D.resZipSize)    D.resZipSize.textContent    = zipSizeKB ? fmtKB(zipSizeKB) : '—';
  if (D.resultSummary) D.resultSummary.textContent = `${fileCount} PDF file${fileCount!==1?'s':''} created from "${FILE?.name || 'your PDF'}"`;

  if (skipped > 0) {
    if (D.resSkipped)    D.resSkipped.textContent = skipped;
    if (D.resSkippedWrap) D.resSkippedWrap.classList.remove('sp-res-stat-hidden');
  } else {
    if (D.resSkippedWrap) D.resSkippedWrap.classList.add('sp-res-stat-hidden');
  }

  // Elapsed timer
  if (_splitStartTime) {
    const elapsed = (Date.now() - _splitStartTime) / 1000;
    const label   = elapsed < 60
      ? `${elapsed.toFixed(elapsed < 10 ? 1 : 0)}s`
      : `${Math.floor(elapsed/60)}m ${Math.round(elapsed%60)}s`;
    if (D.resTimer) D.resTimer.textContent = label;
    if (D.resTimerWrap) D.resTimerWrap.classList.remove('sp-res-stat-hidden');
  }

  // Output files list
  if (D.resFilesWrap && D.resFilesList) {
    if (RESULT_FILES.length > 0) {
      D.resFilesWrap.classList.remove('sp-rfw-hidden');
      // Reset toggle state
      D.resFilesToggle?.classList.remove('open');
      D.resFilesToggle?.setAttribute('aria-expanded', 'false');
      if (D.resFilesList) D.resFilesList.hidden = true;
      if (D.resFilesToggleLabel) {
        D.resFilesToggleLabel.textContent = `Show output files (${RESULT_FILES.length})`;
      }
      // Build list HTML
      const MAX_SHOW = 50;
      D.resFilesList.innerHTML = RESULT_FILES.slice(0, MAX_SHOW).map(n =>
        `<div class="sp-res-file">
          <i class="fa fa-file-pdf" aria-hidden="true"></i>
          <span class="sp-res-file-name">${n}</span>
         </div>`
      ).join('') + (RESULT_FILES.length > MAX_SHOW
        ? `<div class="sp-res-file sp-res-file-more">+ ${RESULT_FILES.length - MAX_SHOW} more files…</div>`
        : '');
    } else {
      D.resFilesWrap.classList.add('sp-rfw-hidden');
    }
  }

  D.progressCard.hidden = true;
  D.resultsCard.hidden  = false;
  updateFab();

  if (typeof gsap !== 'undefined') {
    gsap.from(D.resultsCard, { y:28, duration:.45, ease:'back.out(1.2)' });
  }

  D.resultsCard?.scrollIntoView({ behavior:'smooth', block:'center' });
}

/* ═══════════════════════════════════════════════════════════
   COPY RANGE TO CLIPBOARD
═══════════════════════════════════════════════════════════ */
function copyRangeToClipboard() {
  const val = (SELECTED_MODE === 'range_groups'
    ? D.rangeGroupsInput?.value
    : D.rangeInput?.value
  )?.trim();

  if (!val) {
    showToast('No range to copy — select pages first', 'info');
    return;
  }

  const btn = D.copyRangeBtn;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(val).then(() => {
      showToast('Range copied to clipboard!', 'success');
      S('success');
      if (btn) {
        const prev = btn.innerHTML;
        btn.innerHTML = '<i class="fa fa-check"></i>';
        btn.style.color = 'var(--green)';
        setTimeout(() => { btn.innerHTML = prev; btn.style.color = ''; }, 1800);
      }
    }).catch(() => showToast('Copy unavailable — select text manually', 'info'));
  } else {
    showToast('Copy unavailable in this browser', 'info');
  }
}

/* ═══════════════════════════════════════════════════════════
   RANGE INPUT VISUAL STATE
═══════════════════════════════════════════════════════════ */
function updateRangeInputState() {
  const inp = D.rangeInput;
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) {
    inp.classList.remove('valid', 'invalid');
    return;
  }
  if (!TOTAL_PAGES) {
    inp.classList.remove('valid', 'invalid');
    return;
  }
  const pages = parseRangeStr(val, TOTAL_PAGES);
  inp.classList.toggle('valid',   pages.length > 0);
  inp.classList.toggle('invalid', pages.length === 0);
}

/* ═══════════════════════════════════════════════════════════
   DOWNLOAD — plays fahhhhh.mp3 via S('download')
═══════════════════════════════════════════════════════════ */
function downloadResult() {
  if (!RESULT_BLOB) { showToast('No result to download. Please split again.','error'); return; }

  S('download');  // → window.SOUNDS.playDownloadWhoosh() → fahhhhh.mp3

  const url = URL.createObjectURL(RESULT_BLOB);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = RESULT_NAME;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 2000);

  showToast(`Downloading: ${RESULT_NAME}`, 'success');
}

/* ═══════════════════════════════════════════════════════════
   RESET
═══════════════════════════════════════════════════════════ */
function resetTool() {
  S('remove');
  FILE=null; TOTAL_PAGES=0; BOOKMARKS=[]; BLANK_COUNT=0;
  PAGE_SEL=new Set(); RESULT_BLOB=null; RESULT_NAME='';
  SELECTED_MODE='all'; _shiftStart=-1;
  closeSSE(); clearSimProgress();

  D.uploadCard.hidden      = false;
  D.fileCard.hidden        = true;
  D.modesCard.hidden       = true;
  D.optsCard.hidden        = true;
  D.advCard.hidden         = true;
  D.actionSection.hidden   = true;
  D.progressCard.hidden    = true;
  D.resultsCard.hidden     = true;
  if (D.recommendBanner) D.recommendBanner.hidden = true;

  if (D.fileInput)         D.fileInput.value = '';
  if (D.rangeInput)        { D.rangeInput.value = ''; D.rangeInput.classList.remove('valid','invalid'); }
  if (D.rangeGroupsInput)  D.rangeGroupsInput.value = '';
  if (D.progressSteps)     D.progressSteps.innerHTML = '';
  if (D.rangeGroupsPreview) D.rangeGroupsPreview.innerHTML = '<span class="sp-rp-hint">Each comma-separated range → its own PDF file</span>';
  if (D.resTimerWrap)      D.resTimerWrap.classList.add('sp-res-stat-hidden');
  if (D.resFilesWrap)      D.resFilesWrap.classList.add('sp-rfw-hidden');
  if (D.presetsRow)        D.presetsRow.setAttribute('hidden', '');
  _splitStartTime = 0;
  RESULT_FILES = [];
  document.querySelectorAll('.sp-preset-btn').forEach(b => b.classList.remove('active'));

  updateFab();

  if (typeof gsap !== 'undefined') {
    gsap.from(D.uploadCard, { y:22, duration:.4, ease:'power2.out' });
  }
}

function resetToToolView() {
  D.progressCard.hidden  = true;
  D.modesCard.hidden     = false;
  D.optsCard.hidden      = (SELECTED_MODE==='all'||SELECTED_MODE==='odd_even');
  D.advCard.hidden       = false;
  D.actionSection.hidden = false;
  if (D.progressSteps) D.progressSteps.innerHTML = '';
  updateFab();
}

/* ═══════════════════════════════════════════════════════════
   CONFETTI
═══════════════════════════════════════════════════════════ */
function launchConfetti() {
  if (typeof confetti === 'function') {
    confetti({ particleCount:120, spread:80, origin:{y:.5}, colors:['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ec4899'] });
    setTimeout(() => confetti({ particleCount:70, spread:60, origin:{y:.5,x:.2}, colors:['#6366f1','#8b5cf6'] }), 350);
    setTimeout(() => confetti({ particleCount:70, spread:60, origin:{y:.5,x:.8}, colors:['#10b981','#06b6d4'] }), 600);
    return;
  }
  const colors = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899'];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'sp-conf-p';
    p.style.cssText = `left:${5+Math.random()*90}%;background:${colors[i%colors.length]};
      animation-delay:${Math.random()*.8}s;animation-duration:${1.3+Math.random()*1.2}s;
      width:${5+Math.random()*6}px;height:${5+Math.random()*6}px;border-radius:${Math.random()>0.5?'50%':'2px'}`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 3000);
  }
}

/* ═══════════════════════════════════════════════════════════
   TOAST SYSTEM
═══════════════════════════════════════════════════════════ */
function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }

  const icons = { success:'fa-check-circle', error:'fa-times-circle', info:'fa-info-circle', warn:'fa-exclamation-triangle' };
  const toast = document.createElement('div');
  toast.className = `sp-toast ${type}`;
  toast.innerHTML = `<i class="fa ${icons[type]||icons.info}"></i><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('exiting');
    setTimeout(() => toast.remove(), 300);
  }, type === 'error' ? 5000 : 3200);
}

/* ═══════════════════════════════════════════════════════════
   RANGE PARSER (JS-side for previews)
═══════════════════════════════════════════════════════════ */
function parseRangeStr(str, total) {
  if (!str || !total) return [];
  const s = str.trim().toLowerCase();
  if (!s || s === 'all') return Array.from({length:total}, (_,i)=>i);
  if (s === 'odd')  return Array.from({length:total}, (_,i)=>i).filter(i=>i%2===0);
  if (s === 'even') return Array.from({length:total}, (_,i)=>i).filter(i=>i%2!==0);

  let m = s.match(/^first\s+(\d+)$/);
  if (m) return Array.from({length:Math.min(parseInt(m[1]),total)}, (_,i)=>i);
  m = s.match(/^last\s+(\d+)$/);
  if (m) { const n=parseInt(m[1]); return Array.from({length:Math.min(n,total)}, (_,i)=>total-Math.min(n,total)+i); }

  const pages = new Set();
  for (const part of str.split(/[,;，；]/)) {
    const p = part.trim();
    const rng = p.match(/^(\d+)\s*[-–—~]\s*(\d+)$/);
    if (rng) {
      const lo = Math.max(0, parseInt(rng[1])-1);
      const hi = Math.min(total-1, parseInt(rng[2])-1);
      if (lo <= hi) for (let i=lo; i<=hi; i++) pages.add(i);
    } else if (/^\d+$/.test(p)) {
      const idx = parseInt(p)-1;
      if (idx>=0 && idx<total) pages.add(idx);
    }
  }
  return [...pages].sort((a,b)=>a-b);
}

/* ═══════════════════════════════════════════════════════════
   FORMATTERS
═══════════════════════════════════════════════════════════ */
function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
  if (b < 1024*1024*1024) return (b/(1024*1024)).toFixed(1) + ' MB';
  return (b/(1024*1024*1024)).toFixed(2) + ' GB';
}
function fmtKB(kb) {
  if (kb < 1024) return kb.toFixed(0) + ' KB';
  return (kb/1024).toFixed(1) + ' MB';
}
