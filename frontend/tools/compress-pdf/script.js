/**
 * IshuTools Compress PDF — script.js v20.0
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun
 * GitHub: https://github.com/ISHUKR41
 *
 * Features:
 *  - Drop zone: drag+drop, click, paste, document-level drop
 *  - 5 compression presets (keyboard + mouse, ARIA radiogroup)
 *  - Advanced options: 9 toggles, target size, password show/hide
 *  - Real-time SSE progress with per-chip status updates
 *  - Result: ring, bars, stats grid, Chart.js size comparison, grade badge
 *  - Download with fahhhhh.mp3 sound, download name = [stem]_compressed.pdf
 *  - Sounds: are_bhai_bhai_bhai=add, cameraman_focus_karo=start,
 *            waah_kya_scene_hai=success, fahhhhh=download,
 *            eh_eh_eh_ehhhhhh=error, jaldi_waha_sa_hato=warning
 *  - Theme toggle (dark/light) with localStorage
 *  - Sound toggle (on/off) with localStorage
 *  - Animated bg canvas — particle field with connections
 *  - Drop zone animated particles
 *  - IntersectionObserver counters (animated on scroll)
 *  - FAQ accordion (one open at a time)
 *  - Scroll reveal (y-only, NEVER opacity:0)
 *  - Keyboard shortcuts: Ctrl+Enter=compress, Escape=close panel
 *  - Mobile FAB (show when file loaded)
 *  - Scroll-to-top button
 *  - Mode hint text updates on selection
 *  - Analysis card with structured data
 *  - Chart.js bar chart for size comparison
 *  - Copy link button, share API
 *  - Cancel SSE / abort compression
 *  - Nav progress bar during compression
 *  - PWA-style viewport tap target compliance
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════════════════ */
const VERSION     = '20.0';
const AUTHOR      = 'Ishu Kumar (ISHUKR41 / ISHUKR75)';
const SITE        = 'ishutools.fun';
const SOUNDS_BASE = '/tools/merge-pdf/sounds/';

const SND = {
  add:     'are_bhai_bhai_bhai.mp3',
  start:   'cameraman_focus_karo.mp3',
  success: 'waah_kya_scene_hai.mp3',
  dl:      'fahhhhh.mp3',
  error:   'eh_eh_eh_ehhhhhh.mp3',
  warning: 'jaldi_waha_sa_hato.mp3',
};

const MODE_HINTS = {
  screen:   '<strong>Screen (72 DPI)</strong> — Maximum compression, up to 90% smaller. Best for WhatsApp, email, web uploads. Images look blurry when printed.',
  low:      '<strong>Low (96 DPI)</strong> — Email-friendly compression. 55–75% smaller with acceptable quality for screen reading.',
  medium:   '<strong>Medium (150 DPI)</strong> — Best for most PDFs. Reduces size by 40–65% while keeping good visual quality.',
  high:     '<strong>High (200 DPI)</strong> — Near-lossless with size savings. 20–45% smaller, suitable for printing.',
  lossless: '<strong>Lossless (300 DPI)</strong> — Zero image quality loss. 5–25% savings from structure/stream optimization only. Best for legal, archival, print.',
};

const GRADE_COLORS = {
  S: 'linear-gradient(135deg, #10b981, #059669)',
  A: 'linear-gradient(135deg, #10b981, #0ea472)',
  B: 'linear-gradient(135deg, #6366f1, #4f46e5)',
  C: 'linear-gradient(135deg, #f59e0b, #d97706)',
  D: 'linear-gradient(135deg, #ef4444, #dc2626)',
  F: 'linear-gradient(135deg, #6b7280, #4b5563)',
};

const CHIP_ORDER = ['upload', 'analyze', 'gs', 'fitz', 'pike', 'qpdf', 'pillow', 'done'];
const CHIP_THRESHOLDS = {
  upload: 5, analyze: 18, gs: 30, fitz: 44, pike: 58, qpdf: 68, pillow: 78, done: 95,
};

/* ═══════════════════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════════════════ */
let FILE      = null;      // Current File object
let JOB_ID    = null;      // Server SSE job id
let SEL_MODE  = 'medium';  // Selected compression preset
let RESULT    = null;      // Last compression result dict
let SSE_SRC   = null;      // EventSource instance
let _origStem = '';        // Original filename without .pdf extension
let SOUND_ON  = true;      // Sound enabled flag
let _sseTimer = null;      // Simulated progress timer
let _sseStartPct = 0;      // SSE progress backup start
let _progPct  = 0;         // Current progress percentage
let _sizeChart = null;     // Chart.js instance
let _analyzeCtrl = null;   // AbortController for analyze fetch

/* DOM references — populated in initDom() inside DOMContentLoaded */
let D = {};

/* ═══════════════════════════════════════════════════════════════════════════
   SOUND ENGINE
═══════════════════════════════════════════════════════════════════════════ */
function S(key) {
  if (!SOUND_ON) return;
  const filename = SND[key];
  if (!filename) return;
  const src = SOUNDS_BASE + filename;
  try {
    const audio    = new Audio(src);
    audio.volume   = 0.55;
    audio.preload  = 'auto';
    audio.play().catch(() => {/* autoplay blocked — ignore */});
  } catch (e) {/* ignore */}
}

function initSound() {
  const saved = localStorage.getItem('cp-sound');
  SOUND_ON    = (saved !== 'off');
  _syncSoundBtn();

  D.soundBtn?.addEventListener('click', () => {
    SOUND_ON = !SOUND_ON;
    localStorage.setItem('cp-sound', SOUND_ON ? 'on' : 'off');
    _syncSoundBtn();
    toast(SOUND_ON ? 'Sounds enabled' : 'Sounds muted', 'info', 2000);
  });
}

function _syncSoundBtn() {
  if (!D.soundIcon) return;
  D.soundIcon.className = SOUND_ON
    ? 'fa fa-volume-high'
    : 'fa fa-volume-xmark';
}

/* ═══════════════════════════════════════════════════════════════════════════
   THEME ENGINE
═══════════════════════════════════════════════════════════════════════════ */
function initTheme() {
  const saved = localStorage.getItem('cp-theme') ||
    (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  _applyTheme(saved);

  D.themeBtn?.addEventListener('click', () => {
    const cur  = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    _applyTheme(next);
    localStorage.setItem('cp-theme', next);
  });
}

function _applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (D.themeIcon) {
    D.themeIcon.className = theme === 'dark' ? 'fa fa-sun' : 'fa fa-moon';
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   DOM INIT
═══════════════════════════════════════════════════════════════════════════ */
function initDom() {
  D = {
    /* upload */
    dropzone:       _qs('#dropzone'),
    browseBtn:      _qs('#browseBtn'),
    fileInput:      _qs('#fileInput'),
    dzDragMsg:      _qs('#dzDragMsg'),
    dzParticles:    _qs('#dzParticles'),
    fileCard:       _qs('#fileCard'),
    fileCardInner:  _qs('#fileCardInner'),
    fcThumb:        _qs('#fcThumb'),
    fileName:       _qs('#fileName'),
    fileMeta:       _qs('#fileMeta'),
    fileChips:      _qs('#fileChips'),
    removeBtn:      _qs('#removeBtn'),
    analyzeBar:     _qs('#analyzeBar'),
    analysisCard:   _qs('#analysisCard'),
    acRow:          _qs('#acRow'),

    /* modes */
    modesSection:   _qs('#modesSection'),
    modeHintText:   _qs('#modeHintText'),
    estEls: {
      screen:   _qs('#est-screen'),
      low:      _qs('#est-low'),
      medium:   _qs('#est-medium'),
      high:     _qs('#est-high'),
      lossless: _qs('#est-lossless'),
    },

    /* advanced */
    advSection:     _qs('#advSection'),
    advToggle:      _qs('#advToggle'),
    advPanel:       _qs('#advPanel'),
    advArrow:       _qs('#advArrow'),
    advCount:       _qs('#advCount'),

    /* toggles */
    grayscaleToggle: _qs('#grayscaleToggle'),
    metaToggle:      _qs('#metaToggle'),
    annotToggle:     _qs('#annotToggle'),
    linearToggle:    _qs('#linearToggle'),
    jsToggle:        _qs('#jsToggle'),
    embedToggle:     _qs('#embedToggle'),
    formsToggle:     _qs('#formsToggle'),
    dedupToggle:     _qs('#dedupToggle'),
    iccToggle:       _qs('#iccToggle'),
    targetToggle:    _qs('#targetToggle'),
    pwToggle:        _qs('#pwToggle'),

    /* sub-rows */
    targetSizeRow:   _qs('#targetSizeRow'),
    targetSizeInput: _qs('#targetSizeInput'),
    passwordRow:     _qs('#passwordRow'),
    passwordInput:   _qs('#passwordInput'),
    pwShowBtn:       _qs('#pwShowBtn'),
    pwEyeIcon:       _qs('#pwEyeIcon'),

    /* action */
    actionArea:     _qs('#actionArea'),
    compressBtn:    _qs('#compressBtn'),
    compBtnIcon:    _qs('#compBtnIcon'),
    compBtnText:    _qs('#compBtnText'),
    actionHint:     _qs('#actionHint'),

    /* progress */
    progressSection: _qs('#progressSection'),
    progTitle:       _qs('#progTitle'),
    progSub:         _qs('#progSub'),
    progPct:         _qs('#progPct'),
    progBar:         _qs('#progBar'),
    progGlow:        _qs('#progGlow'),
    progBarWrap:     _qs('#progBarWrap'),
    engineBar:       _qs('#engineBar'),
    ebLabel:         _qs('#ebLabel'),
    cancelBtn:       _qs('#cancelBtn'),
    navProgress:     _qs('#navProgress'),
    navProgFill:     _qs('#navProgFill'),
    chips: {
      upload:  _qs('#ch-upload'),
      analyze: _qs('#ch-analyze'),
      gs:      _qs('#ch-gs'),
      fitz:    _qs('#ch-fitz'),
      pike:    _qs('#ch-pike'),
      qpdf:    _qs('#ch-qpdf'),
      pillow:  _qs('#ch-pillow'),
      done:    _qs('#ch-done'),
    },

    /* result */
    resultSection:  _qs('#resultSection'),
    resIcon:        _qs('#resIcon'),
    resTitle:       _qs('#resTitle'),
    resSub:         _qs('#resSub'),
    resGrade:       _qs('#resGrade'),
    ringFill:       _qs('#ringFill'),
    ringNum:        _qs('#ringNum'),
    ringSub:        _qs('#ringSub'),
    stOrig:         _qs('#stOrig'),
    stComp:         _qs('#stComp'),
    stSaved:        _qs('#stSaved'),
    stEngine:       _qs('#stEngine'),
    stTime:         _qs('#stTime'),
    stScore:        _qs('#stScore'),
    barOrig:        _qs('#barOrig'),
    barComp:        _qs('#barComp'),
    barOrigLbl:     _qs('#barOrigLbl'),
    barCompLbl:     _qs('#barCompLbl'),
    barCompPct:     _qs('#barCompPct'),
    chartWrap:      _qs('#chartWrap'),
    sizeChart:      _qs('#sizeChart'),
    qualNote:       _qs('#qualNote'),
    qualNoteText:   _qs('#qualNoteText'),
    dlBtn:          _qs('#dlBtn'),
    dlBtnText:      _qs('#dlBtnText'),
    resetBtn:       _qs('#resetBtn'),
    shareBtn:       _qs('#shareBtn'),
    copyLinkBtn:    _qs('#copyLinkBtn'),

    /* nav */
    soundBtn:   _qs('#soundBtn'),
    soundIcon:  _qs('#soundIcon'),
    themeBtn:   _qs('#themeBtn'),
    themeIcon:  _qs('#themeIcon'),

    /* misc */
    toastWrap:  _qs('#toastWrap'),
    faqList:    _qs('#faqList'),
    bgCanvas:   _qs('#bgCanvas'),
    fabBtn:     _qs('#fabBtn'),
    scrollTop:  _qs('#scrollTop'),
  };
}

function _qs(sel) {
  return document.querySelector(sel);
}

/* ═══════════════════════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════════════════════ */
function toast(msg, type = 'info', dur = 3400) {
  if (!D.toastWrap) return;
  const iconMap = {
    success: 'fa-circle-check',
    error:   'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info:    'fa-circle-info',
  };
  const el = document.createElement('div');
  el.className = `cp-toast ${type}`;
  el.innerHTML = `<i class="fa ${iconMap[type] || iconMap.info}" aria-hidden="true"></i><span>${msg}</span>`;
  el.setAttribute('role', 'alert');
  D.toastWrap.appendChild(el);

  const hide = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  };
  setTimeout(hide, dur);
  el.addEventListener('click', hide);
}

/* ═══════════════════════════════════════════════════════════════════════════
   FORMAT HELPERS
═══════════════════════════════════════════════════════════════════════════ */
function fmtBytes(b) {
  if (b === undefined || b === null || isNaN(b)) return '—';
  b = Number(b);
  if (b === 0)       return '0 B';
  if (b < 1024)      return b + ' B';
  if (b < 1048576)   return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824)return (b / 1048576).toFixed(2) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

function fmtMs(ms) {
  if (!ms || ms < 0) return '—';
  if (ms < 1000)     return ms + ' ms';
  if (ms < 60000)    return (ms / 1000).toFixed(1) + ' s';
  return Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's';
}

function fmtPct(n) {
  if (n === undefined || n === null || isNaN(n)) return '0%';
  return Math.round(Number(n)) + '%';
}

function fmtEngine(eng) {
  if (!eng || eng === 'none') return 'N/A';
  return eng
    .replace('ghostscript', 'GhostScript')
    .replace('pymupdf', 'PyMuPDF')
    .replace('pikepdf', 'pikepdf')
    .replace('target-size', 'Target-Size')
    .replace('gs+fitz', 'GS+fitz')
    .replace('gs+pikepdf', 'GS+pike');
}

function fmtScore(score, grade) {
  if (!score && score !== 0) return '—';
  return `${score}/100 (${grade})`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   DROP ZONE
═══════════════════════════════════════════════════════════════════════════ */
function initDragDrop() {
  const dz = D.dropzone;
  if (!dz) return;

  // Prevent browser default drop behavior globally
  document.addEventListener('dragover',  e => e.preventDefault(), { passive: false });
  document.addEventListener('drop',      e => e.preventDefault());

  // Drop zone specific
  dz.addEventListener('dragenter', e => {
    e.preventDefault();
    dz.classList.add('drag-over');
  });
  dz.addEventListener('dragleave', e => {
    if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag-over');
  });
  dz.addEventListener('dragover', e => {
    e.preventDefault();
    dz.classList.add('drag-over');
  });
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const f = e.dataTransfer?.files?.[0];
    if (f) setFile(f);
    else { toast('No file detected in drop', 'warning'); S('warning'); }
  });

  // Click on dropzone (not the browse button)
  dz.addEventListener('click', e => {
    if (e.target === D.browseBtn || D.browseBtn?.contains(e.target)) return;
    D.fileInput?.click();
  });

  // Keyboard accessibility
  dz.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      D.fileInput?.click();
    }
  });

  // Browse button
  D.browseBtn?.addEventListener('click', e => {
    e.stopPropagation();
    D.fileInput?.click();
  });

  // File input change
  D.fileInput?.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
    e.target.value = ''; // Reset so same file can be re-selected
  });

  // Paste support (Ctrl+V)
  document.addEventListener('paste', e => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f && (f.type === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf'))) {
          setFile(f);
          toast('PDF pasted from clipboard!', 'success', 2200);
          break;
        }
      }
    }
  });

  // Document-level drop (outside the drop zone)
  document.addEventListener('drop', e => {
    if (D.dropzone?.contains(e.target)) return; // already handled
    const f = e.dataTransfer?.files?.[0];
    if (f && (f.type === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf'))) {
      setFile(f);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   SET FILE
═══════════════════════════════════════════════════════════════════════════ */
function setFile(file) {
  // Validate
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    toast('Please upload a PDF file (.pdf extension required)', 'error');
    S('error');
    _shakeDropzone();
    return;
  }

  FILE      = file;
  _origStem = file.name.replace(/\.pdf$/i, '').trim() || 'compressed';

  S('add');

  // Update file card UI
  if (D.fileName) {
    D.fileName.textContent = file.name;
    D.fileName.title       = file.name;
  }
  if (D.fileMeta) {
    D.fileMeta.textContent = fmtBytes(file.size) + ' · PDF document';
  }
  if (D.fileChips)    D.fileChips.innerHTML = '';
  if (D.analysisCard) D.analysisCard.hidden = true;
  if (D.acRow)        D.acRow.innerHTML = '';

  // Show file card, hide drop zone
  if (D.dropzone) D.dropzone.hidden = true;
  if (D.fileCard) D.fileCard.hidden = false;

  // Show controls
  if (D.modesSection) D.modesSection.hidden = false;
  if (D.advSection)   D.advSection.hidden   = false;
  if (D.actionArea)   D.actionArea.hidden   = false;

  // Show FAB on mobile
  if (D.fabBtn) D.fabBtn.hidden = false;

  // Reset previous results
  hideResult();
  hideProgress();

  // Scroll to modes
  setTimeout(() => {
    D.modesSection?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 280);

  // Analyze file in background
  analyzeFile(file);

  toast(`"${_truncate(file.name, 30)}" loaded — ${fmtBytes(file.size)}`, 'success', 2500);
}

function _shakeDropzone() {
  if (!D.dropzone) return;
  D.dropzone.classList.add('shake');
  setTimeout(() => D.dropzone?.classList.remove('shake'), 600);
}

function _truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ANALYZE FILE
═══════════════════════════════════════════════════════════════════════════ */
async function analyzeFile(file) {
  if (!D.analyzeBar) return;
  D.analyzeBar.hidden = false;

  // Abort previous analysis
  if (_analyzeCtrl) { try { _analyzeCtrl.abort(); } catch(e) {} }
  _analyzeCtrl = new AbortController();

  try {
    const fd = new FormData();
    fd.append('file', file);

    const resp = await fetch('/api/compress-pdf/analyze', {
      method: 'POST',
      body:   fd,
      signal: _analyzeCtrl.signal,
    });

    if (!resp.ok) throw new Error('Analysis request failed: ' + resp.status);
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Analysis returned failure');

    // Update mode estimates
    const ests = data.estimated_reductions_by_preset || {};
    Object.entries(D.estEls).forEach(([preset, el]) => {
      if (!el) return;
      const pct = ests[preset];
      if (pct !== undefined && pct !== null) {
        el.textContent = `~${pct}% smaller`;
        el.style.color = pct >= 60 ? 'var(--em3)' : pct >= 30 ? 'var(--em)' : 'var(--t3)';
      }
    });

    // Build analysis chip row
    const chips = [];
    if (data.page_count)        chips.push({ icon: 'fa-file',        text: `${data.page_count} pages`,     cls: '' });
    if (data.image_count > 0)   chips.push({ icon: 'fa-image',       text: `${data.image_count} images`,   cls: '' });
    if (data.has_javascript)    chips.push({ icon: 'fa-code',         text: 'Has JavaScript',               cls: 'cp-fchip-warn' });
    if (data.has_forms)         chips.push({ icon: 'fa-table-list',   text: 'Has Forms',                    cls: 'cp-fchip-info' });
    if (data.has_encryption)    chips.push({ icon: 'fa-lock',         text: 'Encrypted',                    cls: 'cp-fchip-warn' });
    if (data.has_annotations)   chips.push({ icon: 'fa-comment',      text: 'Annotations',                  cls: 'cp-fchip-info' });
    if (data.has_embedded_files)chips.push({ icon: 'fa-paperclip',    text: 'Embedded Files',               cls: 'cp-fchip-warn' });
    if (data.has_thumbnails)    chips.push({ icon: 'fa-images',       text: 'Has Thumbnails',               cls: '' });
    if (data.is_linearized)     chips.push({ icon: 'fa-bolt',         text: 'Web-Optimized',                cls: '' });
    if (data.is_scanned)        chips.push({ icon: 'fa-scanner',      text: 'Scanned PDF',                  cls: '' });
    if (data.content_type)      chips.push({ icon: 'fa-layer-group',  text: data.content_type.replace(/_/g, '-'), cls: '' });

    if (D.fileChips && chips.length) {
      D.fileChips.innerHTML = chips.map((c, i) =>
        `<span class="cp-fchip ${c.cls}" style="animation-delay:${i * 0.06}s">` +
        `<i class="fa ${c.icon}" aria-hidden="true"></i>${c.text}</span>`
      ).join('');
    }

    // Build analysis card
    if (D.acRow && D.analysisCard) {
      const items = [];
      if (data.file_size)        items.push({ val: fmtBytes(data.file_size), lbl: 'File Size' });
      if (data.page_count)       items.push({ val: data.page_count,          lbl: 'Pages' });
      if (data.image_count >= 0) items.push({ val: data.image_count,         lbl: 'Images' });
      if (data.compressibility_score !== undefined)
        items.push({ val: data.compressibility_score + '/100', lbl: 'Compress Score' });
      if (data.pdf_version)      items.push({ val: 'v' + data.pdf_version,   lbl: 'PDF Version' });

      D.acRow.innerHTML = items.map(it =>
        `<div class="cp-ac-item">` +
        `<div class="cp-ac-val">${it.val}</div>` +
        `<div class="cp-ac-lbl">${it.lbl}</div>` +
        `</div>`
      ).join('');

      if (items.length) D.analysisCard.hidden = false;
    }

    // Show recommendations as toast if any
    if (data.recommendations?.length) {
      setTimeout(() => {
        toast(data.recommendations[0], 'info', 4000);
      }, 800);
    }

  } catch (e) {
    if (e.name === 'AbortError') return; // Cancelled, not an error
    // Non-fatal: analysis failure doesn't block compression
  } finally {
    if (D.analyzeBar) D.analyzeBar.hidden = true;
    _analyzeCtrl = null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   REMOVE FILE
═══════════════════════════════════════════════════════════════════════════ */
function removeFile() {
  // Abort any in-progress analysis or compression
  if (_analyzeCtrl) { try { _analyzeCtrl.abort(); } catch(e) {} _analyzeCtrl = null; }
  _closeSSE();
  _clearSimProgress();

  FILE      = null;
  JOB_ID    = null;
  RESULT    = null;
  _origStem = '';
  _progPct  = 0;

  if (D.dropzone) D.dropzone.hidden   = false;
  if (D.fileCard) D.fileCard.hidden   = true;
  if (D.modesSection) D.modesSection.hidden = true;
  if (D.advSection)   D.advSection.hidden   = true;
  if (D.actionArea)   D.actionArea.hidden   = true;
  if (D.fabBtn)       D.fabBtn.hidden       = true;

  hideProgress();
  hideResult();
  _resetCompressBtn();

  // Reset estimates
  Object.values(D.estEls || {}).forEach(el => { if (el) el.style.color = ''; });
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODE SELECTION
═══════════════════════════════════════════════════════════════════════════ */
function selectMode(mode) {
  if (!mode || !MODE_HINTS[mode]) return;
  SEL_MODE = mode;

  document.querySelectorAll('.cp-mode').forEach(card => {
    const isActive = card.dataset.mode === mode;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-checked', isActive ? 'true' : 'false');
  });

  // Update hint text
  if (D.modeHintText) {
    D.modeHintText.innerHTML = MODE_HINTS[mode];
  }
}

function initModeCards() {
  document.querySelectorAll('.cp-mode').forEach(card => {
    card.addEventListener('click', () => selectMode(card.dataset.mode));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectMode(card.dataset.mode);
      }
      // Arrow key navigation in radiogroup
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        _navigateMode(1, card);
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        _navigateMode(-1, card);
      }
    });
  });
}

function _navigateMode(dir, currentCard) {
  const cards = [...document.querySelectorAll('.cp-mode')];
  const idx   = cards.indexOf(currentCard);
  const next  = cards[(idx + dir + cards.length) % cards.length];
  if (next) {
    selectMode(next.dataset.mode);
    next.focus();
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADVANCED OPTIONS
═══════════════════════════════════════════════════════════════════════════ */
function initAdvanced() {
  // Accordion toggle
  D.advToggle?.addEventListener('click', () => {
    const open = D.advPanel?.classList.toggle('open');
    D.advToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  // All toggle switches
  const toggleDefs = [
    { id: 'grayscaleToggle', sub: null },
    { id: 'metaToggle',      sub: null },
    { id: 'annotToggle',     sub: null },
    { id: 'linearToggle',    sub: null },
    { id: 'jsToggle',        sub: null },
    { id: 'embedToggle',     sub: null },
    { id: 'formsToggle',     sub: null },
    { id: 'dedupToggle',     sub: null },
    { id: 'iccToggle',       sub: null },
    { id: 'targetToggle',    sub: 'targetSizeRow' },
    { id: 'pwToggle',        sub: 'passwordRow' },
  ];

  toggleDefs.forEach(({ id, sub }) => {
    const el = document.getElementById(id);
    if (!el) return;

    const toggle = () => {
      const checked = el.getAttribute('aria-checked') === 'true';
      el.setAttribute('aria-checked', !checked ? 'true' : 'false');
      if (sub && D[sub]) D[sub].hidden = checked; // Show when turning ON (checked was false)
      updateAdvCount();
    };

    el.addEventListener('click',   toggle);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });

  // Password show/hide
  D.pwShowBtn?.addEventListener('click', () => {
    const input = D.passwordInput;
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    if (D.pwEyeIcon) {
      D.pwEyeIcon.className = show ? 'fa fa-eye-slash' : 'fa fa-eye';
    }
  });
}

function isToggleOn(elId) {
  const el = document.getElementById(elId);
  return el?.getAttribute('aria-checked') === 'true';
}

function updateAdvCount() {
  const toggleIds = [
    'grayscaleToggle', 'metaToggle', 'annotToggle', 'linearToggle',
    'jsToggle', 'embedToggle', 'formsToggle', 'dedupToggle',
    'iccToggle', 'targetToggle', 'pwToggle',
  ];
  const count = toggleIds.filter(id => isToggleOn(id)).length;

  if (D.advCount) {
    D.advCount.textContent = `${count} on`;
    D.advCount.hidden      = count === 0;
  }
}

function getOptions() {
  return {
    quality:               SEL_MODE,
    grayscale:             isToggleOn('grayscaleToggle'),
    strip_metadata:        isToggleOn('metaToggle'),
    remove_annotations:    isToggleOn('annotToggle'),
    linearize:             isToggleOn('linearToggle'),
    remove_javascript:     isToggleOn('jsToggle'),
    remove_embedded_files: isToggleOn('embedToggle'),
    remove_forms:          isToggleOn('formsToggle'),
    remove_duplicate_images: isToggleOn('dedupToggle'),
    remove_icc_profiles:   isToggleOn('iccToggle'),
    target_size_kb: isToggleOn('targetToggle')
      ? parseInt(D.targetSizeInput?.value || '500', 10)
      : null,
    password: isToggleOn('pwToggle') ? (D.passwordInput?.value || '') : '',
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROGRESS CONTROL
═══════════════════════════════════════════════════════════════════════════ */
function showProgress() {
  if (D.progressSection) D.progressSection.hidden = false;
  if (D.navProgress)     D.navProgress.hidden     = false;
  _setProgress(0, 'Uploading…', 'Sending file to server');
  _resetChips();
}

function hideProgress() {
  if (D.progressSection) D.progressSection.hidden = true;
  if (D.navProgress)     D.navProgress.hidden     = true;
  if (D.engineBar)       D.engineBar.hidden       = true;
}

function _setProgress(pct, title = '', sub = '') {
  pct = Math.min(100, Math.max(0, Math.round(pct)));
  _progPct = pct;

  if (D.progBar)     D.progBar.style.width = pct + '%';
  if (D.progBarWrap) D.progBarWrap.setAttribute('aria-valuenow', pct);
  if (D.progPct)     D.progPct.textContent = pct + '%';
  if (D.navProgFill) D.navProgFill.style.width = pct + '%';
  if (title && D.progTitle) D.progTitle.textContent = title;
  if (sub && D.progSub)     D.progSub.textContent   = sub;

  // Update chips based on percentage
  CHIP_ORDER.forEach(chip => {
    const el        = D.chips?.[chip];
    const threshold = CHIP_THRESHOLDS[chip] || 0;
    if (!el) return;
    if (pct >= threshold) {
      if (!el.classList.contains('done')) {
        el.classList.remove('active');
        el.classList.add('done');
      }
    } else if (pct >= threshold - 15) {
      el.classList.add('active');
      el.classList.remove('done');
    }
  });

  // Show engine bar when running
  if (pct > 10 && pct < 95) {
    if (D.engineBar) D.engineBar.hidden = false;
    if (D.ebLabel && title) D.ebLabel.textContent = title;
  }
}

function _resetChips() {
  Object.values(D.chips || {}).forEach(chip => {
    chip?.classList.remove('active', 'done');
  });
}

/* Simulated progress fallback when SSE is not available */
function _startSimProgress(startPct = 5) {
  _clearSimProgress();
  _sseStartPct = startPct;
  let pct = startPct;

  const stages = [
    [10,  'Uploading PDF…',       'Sending to server'],
    [20,  'Analyzing structure…', 'Detecting images, fonts, streams'],
    [32,  'Ghostscript engine…',  'Running GS distiller pipeline'],
    [44,  'PyMuPDF engine…',      'Resampling images with fitz'],
    [55,  'pikepdf engine…',      'Stream recompression'],
    [65,  'qpdf engine…',         'Linearization + recompress'],
    [73,  'Pillow engine…',       'Advanced image recompression'],
    [80,  'mutool engine…',       'MuPDF clean + compress'],
    [87,  'Selecting best…',      'Comparing all engine results'],
    [92,  'Post-processing…',     'Applying advanced options'],
    [97,  'Finalizing…',          'Almost done!'],
  ];
  let si = 0;

  _sseTimer = setInterval(() => {
    if (pct >= 97) { _clearSimProgress(); return; }
    // Find next stage
    while (si < stages.length && pct >= stages[si][0]) si++;
    const [stagePct, stageTitle, stageSub] = stages[Math.min(si, stages.length - 1)];
    const step = (stagePct - pct) * 0.08;
    pct = Math.min(stagePct, pct + Math.max(0.5, step));
    _setProgress(pct, stageTitle, stageSub);
  }, 400);
}

function _clearSimProgress() {
  if (_sseTimer) {
    clearInterval(_sseTimer);
    _sseTimer = null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   SSE PROGRESS
═══════════════════════════════════════════════════════════════════════════ */
function _openSSE(jobId) {
  _closeSSE();
  if (!jobId) return;

  const url = `/api/progress/${jobId}`;
  SSE_SRC   = new EventSource(url);

  SSE_SRC.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.pct !== undefined) {
        _clearSimProgress(); // SSE working — stop simulated progress
        _setProgress(data.pct, data.stage || '', data.detail || '');
      }
      if (data.done) {
        _closeSSE();
      }
    } catch (err) {/* parse error */}
  };

  SSE_SRC.onerror = () => {
    // SSE failed — simulated progress already running as backup
    _closeSSE();
  };
}

function _closeSSE() {
  if (SSE_SRC) {
    try { SSE_SRC.close(); } catch(e) {}
    SSE_SRC = null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPRESS
═══════════════════════════════════════════════════════════════════════════ */
async function doCompress() {
  if (!FILE) { toast('Please upload a PDF first', 'warning'); S('warning'); return; }
  if (D.compressBtn?.disabled) return;

  const opts = getOptions();

  // Validate target size
  if (isToggleOn('targetToggle')) {
    const tkb = parseInt(D.targetSizeInput?.value || '0', 10);
    if (!tkb || tkb < 10) {
      toast('Please enter a valid target size (minimum 10 KB)', 'error');
      S('error');
      D.targetSizeInput?.focus();
      return;
    }
  }

  // Validate password field
  if (isToggleOn('pwToggle') && !D.passwordInput?.value?.trim()) {
    toast('Please enter the PDF password or disable the password option', 'warning');
    S('warning');
    D.passwordInput?.focus();
    return;
  }

  // UI: start state
  S('start');
  _setBtnLoading(true);
  hideResult();
  showProgress();
  _destroyChart();
  _startSimProgress(5);

  // Build form data
  const fd = new FormData();
  fd.append('file', FILE);
  fd.append('quality', opts.quality);
  fd.append('grayscale', opts.grayscale ? '1' : '0');
  fd.append('strip_metadata', opts.strip_metadata ? '1' : '0');
  fd.append('remove_annotations', opts.remove_annotations ? '1' : '0');
  fd.append('linearize', opts.linearize ? '1' : '0');
  fd.append('remove_javascript', opts.remove_javascript ? '1' : '0');
  fd.append('remove_embedded_files', opts.remove_embedded_files ? '1' : '0');
  fd.append('remove_forms', opts.remove_forms ? '1' : '0');
  fd.append('remove_duplicate_images', opts.remove_duplicate_images ? '1' : '0');
  fd.append('remove_icc_profiles', opts.remove_icc_profiles ? '1' : '0');
  if (opts.target_size_kb) fd.append('target_size_kb', opts.target_size_kb);
  if (opts.password)       fd.append('password', opts.password);

  // Generate job id for SSE
  JOB_ID = 'cp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  fd.append('job_id', JOB_ID);

  // Connect SSE
  setTimeout(() => _openSSE(JOB_ID), 200);

  try {
    const resp = await fetch('/api/compress-pdf', {
      method: 'POST',
      body:   fd,
    });

    _clearSimProgress();
    _closeSSE();
    _setProgress(99, 'Finishing…', 'Preparing download');

    if (!resp.ok) {
      let errMsg = `Server error (${resp.status})`;
      try {
        const errData = await resp.json();
        errMsg = errData.error || errMsg;
      } catch(e) {}
      throw new Error(errMsg);
    }

    // Parse result from headers
    const inputSize    = parseInt(resp.headers.get('X-Input-Size')    || '0', 10);
    const outputSize   = parseInt(resp.headers.get('X-Output-Size')   || '0', 10);
    const reductionPct = parseFloat(resp.headers.get('X-Reduction-Pct')|| '0');
    const engineUsed   = resp.headers.get('X-Engine-Used')   || '';
    const processingMs = parseInt(resp.headers.get('X-Processing-Ms') || '0', 10);
    const qualScore    = parseInt(resp.headers.get('X-Quality-Score') || '0', 10);
    const qualGrade    = resp.headers.get('X-Quality-Grade') || 'F';
    const warnings     = resp.headers.get('X-Warnings') || '';

    // Get blob for download
    const blob = await resp.blob();
    const dlUrl = URL.createObjectURL(blob);

    RESULT = {
      success:         true,
      input_size:      inputSize  || FILE.size,
      output_size:     outputSize || blob.size,
      reduction_pct:   reductionPct,
      engine_used:     engineUsed,
      processing_time_ms: processingMs,
      quality_score:   qualScore,
      quality_grade:   qualGrade,
      download_url:    dlUrl,
      download_name:   `${_origStem}_compressed.pdf`,
      warnings:        warnings ? warnings.split('|') : [],
    };

    // If headers are missing, estimate from blob
    if (!RESULT.output_size) {
      RESULT.output_size  = blob.size;
      RESULT.input_size   = FILE.size;
      RESULT.reduction_pct = Math.max(0, (1 - blob.size / FILE.size) * 100);
    }

    await new Promise(r => setTimeout(r, 400)); // brief pause for animation
    _setProgress(100, 'Done!', `Reduced by ${Math.round(RESULT.reduction_pct)}%`);
    await new Promise(r => setTimeout(r, 300));

    hideProgress();
    showResult(RESULT);

  } catch (e) {
    _clearSimProgress();
    _closeSSE();
    hideProgress();

    const msg = e.message || 'Compression failed — please try again';
    toast(msg, 'error', 5000);
    S('error');
    _setBtnLoading(false);
  }
}

function _setBtnLoading(loading) {
  if (!D.compressBtn) return;
  D.compressBtn.disabled = loading;
  if (D.compBtnIcon) {
    D.compBtnIcon.innerHTML = loading
      ? '<i class="fa fa-spinner fa-spin" aria-hidden="true"></i>'
      : '<i class="fa fa-compress-arrows-alt" aria-hidden="true"></i>';
  }
  if (D.compBtnText) {
    D.compBtnText.textContent = loading ? 'Compressing…' : 'Compress PDF Now';
  }
}

function _resetCompressBtn() {
  _setBtnLoading(false);
}

/* ═══════════════════════════════════════════════════════════════════════════
   RESULT DISPLAY
═══════════════════════════════════════════════════════════════════════════ */
function showResult(res) {
  if (!D.resultSection) return;

  const inSz  = res.input_size  || FILE?.size || 0;
  const outSz = res.output_size || 0;
  const pct   = res.reduction_pct || Math.max(0, (1 - outSz / inSz) * 100);
  const saved = Math.max(0, inSz - outSz);

  D.resultSection.hidden = false;

  // Header
  if (D.resTitle) {
    D.resTitle.textContent = pct >= 50
      ? '🎉 Excellent Compression!'
      : pct >= 25
      ? '✅ Compression Complete!'
      : 'Compression Complete';
  }
  if (D.resSub) {
    D.resSub.textContent = `${fmtBytes(saved)} saved in ${fmtMs(res.processing_time_ms)} using ${fmtEngine(res.engine_used)}`;
  }
  if (D.resIcon) {
    D.resIcon.innerHTML = `<i class="fa ${pct >= 50 ? 'fa-party-horn' : 'fa-circle-check'}" aria-hidden="true"></i>`;
  }

  // Grade
  if (D.resGrade) {
    D.resGrade.textContent   = res.quality_grade || 'B';
    D.resGrade.style.background = GRADE_COLORS[res.quality_grade] || GRADE_COLORS['B'];
  }

  // Ring animation
  _animateRing(Math.round(pct));

  // Bars
  _animateBars(inSz, outSz, Math.round(pct));

  // Stats grid
  if (D.stOrig)   D.stOrig.textContent   = fmtBytes(inSz);
  if (D.stComp)   D.stComp.textContent   = fmtBytes(outSz);
  if (D.stSaved)  D.stSaved.textContent  = fmtBytes(saved);
  if (D.stEngine) D.stEngine.textContent = fmtEngine(res.engine_used);
  if (D.stTime)   D.stTime.textContent   = fmtMs(res.processing_time_ms);
  if (D.stScore)  D.stScore.textContent  = fmtScore(res.quality_score, res.quality_grade);

  // Chart
  _buildChart(inSz, outSz);

  // Quality note
  if (D.qualNote && D.qualNoteText) {
    const note = _buildQualNote(pct, res);
    if (note) {
      D.qualNoteText.textContent = note;
      D.qualNote.hidden = false;
    }
  }

  // Warnings
  if (res.warnings?.length) {
    res.warnings.slice(0, 2).forEach(w => toast(w, 'warning', 5000));
  }

  // Download button label
  if (D.dlBtnText) {
    D.dlBtnText.textContent = `Download ${fmtBytes(outSz)} Compressed PDF`;
  }

  // Store download url on button
  if (D.dlBtn) {
    D.dlBtn.dataset.dlUrl  = res.download_url;
    D.dlBtn.dataset.dlName = res.download_name || `${_origStem}_compressed.pdf`;
  }

  // Sound + confetti
  S('success');
  if (pct >= 30) {
    _launchConfetti(pct);
  }

  // Scroll to result
  setTimeout(() => {
    D.resultSection?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 250);

  _setBtnLoading(false);
}

function hideResult() {
  if (D.resultSection) D.resultSection.hidden = true;
  if (D.qualNote)      D.qualNote.hidden      = true;
  if (D.chartWrap)     D.chartWrap.hidden     = true;
  _destroyChart();
}

function _animateRing(pct) {
  if (!D.ringFill || !D.ringNum || !D.ringSub) return;

  const circumference = 314; // 2π × 50
  const offset        = circumference - (pct / 100) * circumference;
  const color = pct >= 50 ? 'var(--em)' : pct >= 25 ? 'var(--amber)' : 'var(--red)';

  // Animate stroke-dashoffset
  requestAnimationFrame(() => {
    D.ringFill.style.strokeDashoffset = offset;
    D.ringFill.style.stroke           = color;
  });

  // Animate number
  _animateNumber(D.ringNum, 0, pct, 1200, v => Math.round(v) + '%');
  D.ringSub.textContent = 'smaller';
}

function _animateBars(inSz, outSz, pct) {
  const compRatio = outSz / Math.max(1, inSz);
  setTimeout(() => {
    if (D.barOrig)     D.barOrig.style.width     = '100%';
    if (D.barComp)     D.barComp.style.width      = Math.max(2, compRatio * 100) + '%';
    if (D.barOrigLbl)  D.barOrigLbl.textContent   = fmtBytes(inSz);
    if (D.barCompLbl)  D.barCompLbl.textContent   = fmtBytes(outSz);
    if (D.barCompPct)  D.barCompPct.textContent    = '-' + pct + '%';
  }, 100);
}

function _buildQualNote(pct, res) {
  if (pct >= 80)    return `Outstanding compression! ${pct}% reduced using ${fmtEngine(res.engine_used)}. This is among the best possible for this PDF.`;
  if (pct >= 60)    return `Excellent result! ${pct}% size reduction achieved. Perfect for most sharing and storage needs.`;
  if (pct >= 40)    return `Good compression — ${pct}% smaller. Try Screen preset for even more savings, or enable Advanced Options.`;
  if (pct >= 20)    return `Moderate savings (${pct}%). This PDF may already be well-optimized. Try removing annotations or embedded files.`;
  if (pct >= 5)     return `Small savings (${pct}%). This PDF is already well-compressed. Lossless mode with metadata stripping is recommended.`;
  return `Minimal savings — this PDF is already highly compressed or mostly text. Lossless preset is best for text-heavy documents.`;
}

function _animateNumber(el, from, to, dur, fmt) {
  const start = performance.now();
  const step  = (now) => {
    const t    = Math.min(1, (now - start) / dur);
    const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
    el.textContent = fmt(from + (to - from) * ease);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHART.JS SIZE COMPARISON
═══════════════════════════════════════════════════════════════════════════ */
function _buildChart(inSz, outSz) {
  if (!D.sizeChart || !D.chartWrap) return;
  if (typeof Chart === 'undefined') return; // Chart.js not loaded yet

  _destroyChart();
  D.chartWrap.hidden = false;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textClr = isDark ? '#94a3b8' : '#64748b';
  const gridClr = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';

  _sizeChart = new Chart(D.sizeChart, {
    type: 'bar',
    data: {
      labels: ['Original', 'Compressed'],
      datasets: [{
        label: 'File Size',
        data: [inSz, outSz],
        backgroundColor: [
          'rgba(100,116,139,.55)',
          'rgba(16,185,129,.70)',
        ],
        borderColor: [
          'rgba(100,116,139,.9)',
          'rgba(16,185,129,1)',
        ],
        borderWidth: 1.5,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 900, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + fmtBytes(ctx.raw),
          },
          backgroundColor: isDark ? '#1a2030' : '#fff',
          titleColor: isDark ? '#f0f6fc' : '#0f172a',
          bodyColor: isDark ? '#94a3b8' : '#475569',
          borderColor: isDark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)',
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          grid: { color: gridClr },
          ticks: { color: textClr, font: { size: 12, weight: '600' } },
        },
        y: {
          grid: { color: gridClr },
          ticks: {
            color: textClr,
            font: { size: 11 },
            callback: v => fmtBytes(v),
          },
          beginAtZero: true,
        },
      },
    },
  });
}

function _destroyChart() {
  if (_sizeChart) {
    try { _sizeChart.destroy(); } catch(e) {}
    _sizeChart = null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONFETTI
═══════════════════════════════════════════════════════════════════════════ */
function _launchConfetti(pct) {
  if (typeof confetti !== 'function') {
    _fallbackConfetti();
    return;
  }

  const intensity = pct >= 70 ? 3 : pct >= 50 ? 2 : 1;

  const fire = (ox, oy, count) => {
    confetti({
      particleCount: count,
      angle: 90,
      spread: 55,
      origin: { x: 0.5 + ox, y: 0.6 + oy },
      colors: ['#10b981', '#34d399', '#6366f1', '#a7f3d0', '#fff'],
      ticks: 220,
    });
  };

  fire(0, 0, 60 * intensity);
  if (intensity >= 2) {
    setTimeout(() => { fire(-0.2, 0, 40); fire(0.2, 0, 40); }, 280);
  }
  if (intensity >= 3) {
    setTimeout(() => { fire(0, 0, 50); }, 560);
  }
}

function _fallbackConfetti() {
  // CSS-based confetti particles
  const colors = ['#10b981', '#34d399', '#6366f1', '#f59e0b', '#fff'];
  for (let i = 0; i < 30; i++) {
    const el = document.createElement('div');
    const size = 4 + Math.random() * 8;
    el.style.cssText = [
      'position:fixed', 'pointer-events:none', 'z-index:9998',
      `width:${size}px`, `height:${size}px`,
      `background:${colors[Math.floor(Math.random() * colors.length)]}`,
      'border-radius:2px',
      `left:${30 + Math.random() * 40}%`,
      `top:${20 + Math.random() * 30}%`,
      `animation:cp-float ${1 + Math.random() * 2}s ease-out forwards`,
      `animation-delay:${Math.random() * 0.5}s`,
    ].join(';');
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   DOWNLOAD
═══════════════════════════════════════════════════════════════════════════ */
function doDownload() {
  if (!RESULT?.download_url) {
    toast('No compressed file available — compress first', 'warning');
    S('warning');
    return;
  }

  const a    = document.createElement('a');
  a.href     = RESULT.download_url;
  a.download = RESULT.download_name || `${_origStem}_compressed.pdf`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Cleanup object URL after delay
  setTimeout(() => {
    try { URL.revokeObjectURL(RESULT.download_url); } catch(e) {}
  }, 60000);

  S('dl'); // fahhhhh.mp3
  toast(`Downloading "${a.download}"`, 'success', 2200);
}

function doReset() {
  // Revoke any object URL
  if (RESULT?.download_url) {
    try { URL.revokeObjectURL(RESULT.download_url); } catch(e) {}
  }
  removeFile();

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function doShare() {
  const url  = 'https://ishutools.fun/tools/compress-pdf/';
  const text = 'I used IshuTools PDF Compressor by Ishu Kumar (ISHUKR41) to compress my PDF for free! 🔥 No signup, no watermark, up to 90% compression.';

  if (navigator.share) {
    navigator.share({ title: 'IshuTools PDF Compressor', text, url }).catch(() => {});
  } else {
    _copyToClipboard(url);
    toast('Link copied to clipboard!', 'success');
  }
}

function doCopyLink() {
  const url = 'https://ishutools.fun/tools/compress-pdf/';
  _copyToClipboard(url);
  toast('Link copied to clipboard!', 'success', 2200);
}

function _copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => _copyFallback(text));
  } else {
    _copyFallback(text);
  }
}

function _copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  ta.remove();
}

/* ═══════════════════════════════════════════════════════════════════════════
   CANCEL
═══════════════════════════════════════════════════════════════════════════ */
function doCancel() {
  _closeSSE();
  _clearSimProgress();
  hideProgress();
  _setBtnLoading(false);
  toast('Compression cancelled', 'info', 2000);
  S('warning');
}

/* ═══════════════════════════════════════════════════════════════════════════
   BACKGROUND CANVAS
═══════════════════════════════════════════════════════════════════════════ */
function initBgCanvas() {
  const canvas = D.bgCanvas;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let W, H, particles = [];
  let raf;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', _debounce(resize, 150), { passive: true });

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x    = Math.random() * W;
      this.y    = Math.random() * H;
      this.r    = 0.6 + Math.random() * 1.6;
      this.vx   = (Math.random() - 0.5) * 0.22;
      this.vy   = (Math.random() - 0.5) * 0.22;
      this.alpha = 0.08 + Math.random() * 0.28;
      this.color = Math.random() > 0.6 ? '#10b981' : Math.random() > 0.5 ? '#6366f1' : '#34d399';
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.x < -5 || this.x > W + 5 || this.y < -5 || this.y > H + 5) this.reset();
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle  = this.color;
      ctx.globalAlpha = this.alpha;
      ctx.fill();
    }
  }

  // Fewer particles for performance
  const COUNT = Math.min(60, Math.floor(window.innerWidth / 20));
  for (let i = 0; i < COUNT; i++) particles.push(new Particle());

  function frame() {
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    // Update + draw particles
    particles.forEach(p => { p.update(); p.draw(); });

    // Draw connecting lines (only nearby)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth   = 0.5;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx   = particles[i].x - particles[j].x;
        const dy   = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 90) {
          ctx.globalAlpha = (1 - dist / 90) * 0.06;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    raf = requestAnimationFrame(frame);
  }

  frame();

  // Pause when tab is hidden (performance)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else {
      frame();
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   DROP ZONE PARTICLES (micro-animation)
═══════════════════════════════════════════════════════════════════════════ */
function initDzParticles() {
  const container = D.dzParticles;
  if (!container) return;

  const colors = ['#10b981', '#6366f1', '#34d399', '#8b5cf6'];
  for (let i = 0; i < 10; i++) {
    const p    = document.createElement('div');
    const size = 2 + Math.random() * 5;
    p.style.cssText = [
      'position:absolute', 'border-radius:50%', 'pointer-events:none',
      `width:${size}px`, `height:${size}px`,
      `left:${5 + Math.random() * 90}%`,
      `top:${5 + Math.random() * 90}%`,
      `background:${colors[Math.floor(Math.random() * colors.length)]}`,
      `opacity:${0.05 + Math.random() * 0.18}`,
      `animation:cp-float ${3 + Math.random() * 4}s ease-in-out infinite`,
      `animation-delay:${Math.random() * 4}s`,
    ].join(';');
    container.appendChild(p);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   FAQ ACCORDION
═══════════════════════════════════════════════════════════════════════════ */
function initFaq() {
  if (!D.faqList) return;

  D.faqList.querySelectorAll('.cp-faq').forEach(faq => {
    const btn = faq.querySelector('.cp-fq');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const isOpen = faq.classList.contains('open');

      // Close all other FAQs
      D.faqList.querySelectorAll('.cp-faq.open').forEach(f => {
        f.classList.remove('open');
        f.querySelector('.cp-fq')?.setAttribute('aria-expanded', 'false');
      });

      // Toggle current
      if (!isOpen) {
        faq.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        // Scroll into view on mobile
        setTimeout(() => {
          if (window.innerWidth < 768) {
            faq.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 150);
      }
    });

    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   COUNTER ANIMATIONS (IntersectionObserver)
═══════════════════════════════════════════════════════════════════════════ */
function initCounters() {
  const els = document.querySelectorAll('.cp-cnt-num[data-count]');
  if (!els.length) return;

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el  = entry.target;
      const max = parseInt(el.dataset.count, 10);
      io.unobserve(el);

      _animateNumber(el, 0, max, 1800, v => {
        const n = Math.round(v);
        if (max >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M+';
        if (max >= 1_000)     return (n / 1_000).toFixed(0) + 'K+';
        return String(n);
      });
    });
  }, { threshold: 0.5 });

  els.forEach(el => io.observe(el));
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCROLL ANIMATIONS (y-transform only — NEVER opacity:0 to avoid flash)
═══════════════════════════════════════════════════════════════════════════ */
function initScrollAnim() {
  // We use CSS animation-based reveal with stagger delays
  // Sections are already visible; IO just adds a class for emphasis
  const targets = document.querySelectorAll('.cp-section');
  if (!targets.length) return;

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.animationPlayState = 'running';
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.04 });

  targets.forEach(el => io.observe(el));
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCROLL-TO-TOP + FAB
═══════════════════════════════════════════════════════════════════════════ */
function initScrollTop() {
  const scrollBtn = D.scrollTop;
  if (!scrollBtn) return;

  window.addEventListener('scroll', _throttle(() => {
    const show = window.scrollY > 400;
    scrollBtn.hidden = !show;
  }, 200), { passive: true });

  scrollBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function initFab() {
  const fab = D.fabBtn;
  if (!fab) return;

  fab.addEventListener('click', () => {
    if (FILE && D.compressBtn && !D.compressBtn.disabled) {
      doCompress();
    } else if (!FILE) {
      D.fileInput?.click();
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════════════════════════════════════════ */
function initKeyboard() {
  document.addEventListener('keydown', e => {
    // Ctrl/Cmd + Enter → compress
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (FILE && D.compressBtn && !D.compressBtn.disabled) doCompress();
    }

    // Escape → close advanced panel / cancel if compressing
    if (e.key === 'Escape') {
      if (D.advPanel?.classList.contains('open')) {
        D.advPanel.classList.remove('open');
        D.advToggle?.setAttribute('aria-expanded', 'false');
      }
      if (D.progressSection && !D.progressSection.hidden) {
        doCancel();
      }
    }

    // Alt + D → download
    if (e.altKey && e.key === 'd' && RESULT) {
      e.preventDefault();
      doDownload();
    }

    // Alt + R → reset
    if (e.altKey && e.key === 'r') {
      e.preventDefault();
      doReset();
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   UTILITY
═══════════════════════════════════════════════════════════════════════════ */
function _debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function _throttle(fn, limit) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= limit) { last = now; fn(...args); }
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODE HINT INITIAL
═══════════════════════════════════════════════════════════════════════════ */
function initModeHint() {
  if (D.modeHintText) {
    D.modeHintText.innerHTML = MODE_HINTS[SEL_MODE] || MODE_HINTS.medium;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ENTRY POINT
═══════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Initialize all DOM references first
  initDom();

  // Theme + Sound (order matters — use DOM refs)
  initTheme();
  initSound();

  // Animations
  initBgCanvas();
  initDzParticles();

  // Core functionality
  initDragDrop();
  initModeCards();
  initAdvanced();
  initFaq();
  initCounters();
  initScrollAnim();
  initKeyboard();
  initScrollTop();
  initFab();
  initModeHint();

  // Default mode selection
  selectMode(SEL_MODE);

  // Wire up buttons
  D.removeBtn?.addEventListener('click', e => { e.stopPropagation(); removeFile(); });
  D.compressBtn?.addEventListener('click', doCompress);
  D.dlBtn?.addEventListener('click', doDownload);
  D.resetBtn?.addEventListener('click', doReset);
  D.shareBtn?.addEventListener('click', doShare);
  D.copyLinkBtn?.addEventListener('click', doCopyLink);
  D.cancelBtn?.addEventListener('click', doCancel);

  // Console greeting
  console.log(
    '%cIshuTools PDF Compressor v' + VERSION + '\n' +
    '%cBy ' + AUTHOR + '\n' +
    '%c' + SITE + ' · 10 engines · No limits · No watermark · Free forever',
    'color:#10b981;font-weight:bold;font-size:16px;font-family:monospace',
    'color:#34d399;font-size:12px;font-family:monospace',
    'color:#64748b;font-size:10px;font-family:monospace'
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   MODULE EXPORTS (for testing / external use)
═══════════════════════════════════════════════════════════════════════════ */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fmtBytes, fmtMs, fmtPct, fmtEngine, fmtScore,
    VERSION, AUTHOR, SITE,
  };
}
