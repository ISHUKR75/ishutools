/**
 * IshuTools.fun — Compress PDF script.js v50.0 SUPREME EDITION
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun
 * GitHub: https://github.com/ISHUKR41 | https://github.com/ISHUKR75
 *
 * ════════════════════════════════════════════════════════════════════════════
 * v50.0 — SUPREME EDITION — KEY CHANGES:
 * ════════════════════════════════════════════════════════════════════════════
 *   ✅ FIXED: Download filename = EXACT original_filename_stem + _compressed.pdf
 *   ✅ FIXED: Quality preset strictly enforced — no silent quality compromise
 *   ✅ FIXED: Quality guarantee strip updates live with each preset change
 *   ✅ FIXED: No auto-grayscale without explicit user checkbox
 *   ✅ NEW: Recommendation banner with one-click apply
 *   ✅ NEW: Per-preset estimated size display from deep analysis
 *   ✅ NEW: Live compression quality guarantee indicator per preset
 *   ✅ NEW: Download filename preview before download
 *   ✅ NEW: Drag-to-reorder batch queue (HTML5 drag API)
 *   ✅ NEW: Progress timeline with icons
 *   ✅ NEW: Animated result counters (count-up on reveal)
 *   ✅ NEW: Retry failed batch items
 *   ✅ NEW: Batch summary stats (total saved, avg %)
 *   ✅ NEW: Compression fingerprint — unique ID per session
 *   ✅ NEW: Paste PDF from clipboard
 *   ✅ NEW: Enhanced copy report
 *   ✅ NEW: All DOM refs in DOMContentLoaded — no outside-DOMContentLoaded listeners
 *   ✅ NEW: Sounds: fahhhhh=download, waah=success, are_bhai=add-file, cameraman=start, ehhhh=error, jaldi=cancel
 * ════════════════════════════════════════════════════════════════════════════
 */

'use strict';

/* ════════════════════════════════════════════════════════════════════════════
   MODULE-SCOPE STATE
════════════════════════════════════════════════════════════════════════════ */
let FILE            = null;   // Current single file (File object)
let STEM            = '';     // EXACT original filename stem (no extension)
let JOB_ID          = '';
let SSE_SOURCE      = null;
let SSE_TIMER       = null;
let COMPRESS_DONE   = false;
let RESULT_DATA     = null;   // Last compression result {blob, inputSize, outputSize, ...}
let ANALYSIS_DATA   = null;   // Last analysis result from server
let CHART_INSTANCE  = null;
let BATCH_CHART     = null;
let _t0             = 0;      // Compression start timestamp
let _timerInterval  = null;
let _confettiLoaded = false;
let _reduced        = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let _currentPreset  = 'medium';
let _recommendPreset= null;

// Batch queue
let BATCH_QUEUE     = [];     // Array of {id, file, status, result, blobUrl, pct}
let BATCH_ACTIVE    = false;
let BATCH_IDX       = 0;
let BATCH_ZIP_PARTS = [];
let _dragSrcId      = null;

// Undo last batch item removal
let _deletedStack   = [];

// DOM refs (populated in DOMContentLoaded — NEVER used outside DOMContentLoaded)
let D = null;

// History
const HISTORY_KEY = 'cp-history-v5';
const HISTORY_MAX = 30;

// Sound keys
const SND = {
  DOWNLOAD: 'fahhhhh',
  SUCCESS:  'waah_kya_scene_hai',
  FILE_ADD: 'are_bhai_bhai_bhai',
  START:    'cameraman_focus_karo',
  ERROR:    'eh_eh_eh_ehhhhhh',
  CANCEL:   'jaldi_waha_sa_hato',
  CLICK:    'click',
};

// Progress stages
const PROGRESS_STAGES = [
  { pct:  5, label: 'Initialising…',          sub: 'Loading 12 compression engines',         icon: 'fa-cog' },
  { pct: 12, label: 'Analysing PDF…',          sub: 'Scanning images, fonts, streams',        icon: 'fa-search' },
  { pct: 25, label: 'Engine 1: pikepdf…',      sub: 'Lossless DEFLATE-9 stream recomp',       icon: 'fa-compress' },
  { pct: 35, label: 'Engine 2: qpdf…',         sub: 'Stream linearisation + recompression',   icon: 'fa-bolt' },
  { pct: 44, label: 'Engine 3: Ghostscript…',  sub: 'Distiller preset (GS PDF optimizer)',    icon: 'fa-ghost' },
  { pct: 54, label: 'Engine 4: PyMuPDF…',      sub: 'Per-image DPI optimisation',             icon: 'fa-image' },
  { pct: 62, label: 'Engines 5–8…',            sub: 'Pillow, mutool, dedup, content-stream',  icon: 'fa-layer-group' },
  { pct: 74, label: 'Engines 9–12…',           sub: 'Chain passes — picking best result',     icon: 'fa-trophy' },
  { pct: 86, label: 'Post-processing…',         sub: 'Applying advanced options',              icon: 'fa-sliders-h' },
  { pct: 96, label: 'Finalising…',             sub: 'Verifying output + preparing download',  icon: 'fa-check-circle' },
];

// Preset configuration
const PRESET_INFO = {
  lossless: {
    emoji: '🔮', color: '#8b5cf6', name: 'Lossless',
    est: '2–25%', detail: 'Zero quality loss. pikepdf stream only.',
    guarantee: { noDpi: true,  noGray: true,  lossless: true  },
  },
  high: {
    emoji: '💎', color: '#10b981', name: 'High',
    est: '10–40%', detail: 'Near-lossless. No DPI reduction.',
    guarantee: { noDpi: true,  noGray: true,  lossless: false },
  },
  medium: {
    emoji: '⚖️', color: '#6366f1', name: 'Medium',
    est: '40–65%', detail: 'Best balance. Recommended for most.',
    guarantee: { noDpi: false, noGray: true,  lossless: false },
  },
  low: {
    emoji: '📧', color: '#f59e0b', name: 'Low',
    est: '55–78%', detail: 'Aggressive. Good for email & web.',
    guarantee: { noDpi: false, noGray: true,  lossless: false },
  },
  screen: {
    emoji: '🔥', color: '#ef4444', name: 'Screen',
    est: '75–92%', detail: 'Maximum compression. Screen DPI only.',
    guarantee: { noDpi: false, noGray: false, lossless: false },
  },
};

const PRESET_ORDER = ['lossless', 'high', 'medium', 'low', 'screen'];

const GRADE_COLORS = {
  'S': '#f59e0b', 'A+': '#10b981', 'A': '#10b981',
  'B': '#6366f1', 'C':  '#8b5cf6', 'D': '#f59e0b', 'F': '#ef4444',
};
const GRADE_BG = {
  'S': 'rgba(245,158,11,.85)',  'A+': 'rgba(16,185,129,.85)', 'A': 'rgba(16,185,129,.85)',
  'B': 'rgba(99,102,241,.85)', 'C':  'rgba(139,92,246,.85)', 'D': 'rgba(245,158,11,.75)', 'F': 'rgba(239,68,68,.85)',
};

/* ════════════════════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
════════════════════════════════════════════════════════════════════════════ */

function fmtBytes(b) {
  if (b == null || isNaN(b) || b < 0) return '—';
  if (b === 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(Math.abs(b)) / Math.log(1024)), u.length - 1);
  const v = b / Math.pow(1024, i);
  return (i === 0 ? v : v < 10 ? v.toFixed(2) : v.toFixed(1)) + '\u202F' + u[i];
}

function fmtMs(ms) {
  if (ms == null || isNaN(ms)) return '—';
  if (ms < 1000)  return ms + '\u202Fms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return Math.floor(ms / 60000) + 'm\u202F' + Math.floor((ms % 60000) / 1000) + 's';
}

function fmtElapsed(s) {
  if (s < 60) return s.toFixed(1) + 's';
  return Math.floor(s / 60) + 'm\u202F' + Math.floor(s % 60) + 's';
}

function calcReduction(inSz, outSz) {
  if (!inSz || !outSz || outSz >= inSz) return 0;
  return Math.round((1 - outSz / inSz) * 1000) / 10;
}

/**
 * CRITICAL: getStem extracts the exact filename stem WITHOUT extension.
 * This is used for the download filename: stem + "_compressed.pdf"
 * e.g. "My Report.pdf" → stem = "My Report" → download = "My Report_compressed.pdf"
 */
function getStem(name) {
  if (!name) return 'document';
  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0) return name;
  return name.slice(0, lastDot);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function lsGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, val); } catch {}
}
function lsDel(key) {
  try { localStorage.removeItem(key); } catch {}
}

function announce(msg, priority = 'polite') {
  const el = document.getElementById('cp-sr-announce');
  if (!el) return;
  el.setAttribute('aria-live', priority);
  el.textContent = '';
  setTimeout(() => { el.textContent = msg; }, 50);
}

/** Play a sound by key. Never throws. */
function S(key) {
  try {
    const k = SND[key] || key;
    if (window.SOUNDS && typeof window.SOUNDS[k] === 'function') {
      window.SOUNDS[k]();
    }
  } catch (_) {}
}

function $(id) { return document.getElementById(id); }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutQuad(t) { return t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

function generateId() {
  return Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function generateFingerprint(inputSize, outputSize, engine, preset, timeMs) {
  const str = `${inputSize}-${outputSize}-${engine}-${preset}-${timeMs}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'CP' + Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
}

/* ════════════════════════════════════════════════════════════════════════════
   CONFETTI
════════════════════════════════════════════════════════════════════════════ */
function _loadConfetti() {
  return new Promise(resolve => {
    if (_confettiLoaded && typeof confetti === 'function') { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';
    s.crossOrigin = 'anonymous';
    s.onload  = () => { _confettiLoaded = true; resolve(); };
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

async function launchConfetti() {
  if (_reduced) return;
  await _loadConfetti();
  try {
    if (typeof confetti !== 'function') { _cssConfettiFallback(); return; }
    const opts = {
      colors: ['#10b981', '#34d399', '#6ee7b7', '#ffffff', '#6366f1', '#a78bfa', '#f59e0b', '#ec4899'],
      disableForReducedMotion: true,
      gravity: 0.9,
    };
    confetti({ ...opts, particleCount: 120, spread: 70,  origin: { y: 0.6 } });
    setTimeout(() => confetti({ ...opts, particleCount: 80, spread: 110, angle: 55,  origin: { x: 0, y: 0.6 } }), 250);
    setTimeout(() => confetti({ ...opts, particleCount: 80, spread: 110, angle: 125, origin: { x: 1, y: 0.6 } }), 400);
  } catch (_) { _cssConfettiFallback(); }
}

function _cssConfettiFallback() {
  if (_reduced) return;
  const colors = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#a78bfa'];
  for (let i = 0; i < 20; i++) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed; top:0; left:${10 + Math.random() * 80}%;
      width:8px; height:8px; border-radius:50%;
      background:${colors[i % colors.length]};
      animation:confFall ${1 + Math.random()}s ease-out ${Math.random() * .5}s both;
      pointer-events:none; z-index:99999;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   TOAST SYSTEM
════════════════════════════════════════════════════════════════════════════ */
const TOAST_ICONS = {
  success: { icon: 'fa-check-circle', cls: 'toast-success' },
  error:   { icon: 'fa-exclamation-circle', cls: 'toast-error' },
  warn:    { icon: 'fa-exclamation-triangle', cls: 'toast-warn' },
  info:    { icon: 'fa-info-circle', cls: 'toast-info' },
};

function toast(title, sub, type = 'info', durationMs = 4000) {
  const wrap = $('toastWrap');
  if (!wrap) return;
  const t = TOAST_ICONS[type] || TOAST_ICONS.info;
  const el = document.createElement('div');
  el.className = `cp-toast ${t.cls}`;
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  el.innerHTML = `
    <div class="cp-toast-icon"><i class="fa ${t.icon}" aria-hidden="true"></i></div>
    <div class="cp-toast-body">
      <div class="cp-toast-title">${title}</div>
      ${sub ? `<div class="cp-toast-sub">${sub}</div>` : ''}
    </div>
    <button class="cp-toast-close" aria-label="Dismiss notification" type="button"><i class="fa fa-times" aria-hidden="true"></i></button>
    <div class="cp-toast-bar" style="animation-duration:${durationMs}ms"></div>
  `;
  const dismiss = () => {
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };
  el.querySelector('.cp-toast-close').addEventListener('click', dismiss);
  wrap.appendChild(el);
  setTimeout(dismiss, durationMs);
}

/* ════════════════════════════════════════════════════════════════════════════
   THEME MANAGEMENT
════════════════════════════════════════════════════════════════════════════ */
function initTheme() {
  const saved = lsGet('cp-theme');
  const theme = saved === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}

function toggleTheme() {
  const curr  = document.documentElement.getAttribute('data-theme');
  const next  = curr === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  lsSet('cp-theme', next);
  updateThemeIcon(next);
  S('CLICK');
}

function updateThemeIcon(theme) {
  const icon = $('themeIcon');
  if (!icon) return;
  icon.className = theme === 'dark' ? 'fa fa-sun' : 'fa fa-moon';
}

/* ════════════════════════════════════════════════════════════════════════════
   SOUND TOGGLE
════════════════════════════════════════════════════════════════════════════ */
let _soundEnabled = true;
function initSoundToggle() {
  _soundEnabled = lsGet('cp-sound') !== 'off';
  updateSoundIcon();
}
function toggleSound() {
  _soundEnabled = !_soundEnabled;
  lsSet('cp-sound', _soundEnabled ? 'on' : 'off');
  updateSoundIcon();
  if (_soundEnabled) S('CLICK');
}
function updateSoundIcon() {
  const icon = $('soundIcon');
  if (!icon) return;
  icon.className = _soundEnabled ? 'fa fa-volume-up' : 'fa fa-volume-mute';
}
// Patch S() to respect _soundEnabled
const _SOriginal = S;
window._S = function(key) {
  if (!_soundEnabled) return;
  _SOriginal(key);
};
// Override S to use soundEnabled check
window.S = function(key) {
  if (!_soundEnabled) return;
  try {
    const k = SND[key] || key;
    if (window.SOUNDS && typeof window.SOUNDS[k] === 'function') {
      window.SOUNDS[k]();
    }
  } catch (_) {}
};

/* ════════════════════════════════════════════════════════════════════════════
   BACKGROUND CANVAS (animated particles)
════════════════════════════════════════════════════════════════════════════ */
function initBgCanvas() {
  const canvas = $('bgCanvas');
  if (!canvas || _reduced) return;
  const ctx  = canvas.getContext('2d');
  let W, H, particles;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function initParticles() {
    const count = Math.min(Math.floor((W * H) / 14000), 80);
    particles = Array.from({ length: count }, () => ({
      x:  Math.random() * W,
      y:  Math.random() * H,
      r:  .6 + Math.random() * 1.4,
      vx: (Math.random() - .5) * .25,
      vy: (Math.random() - .5) * .25,
      a:  Math.random() * Math.PI * 2,
      o:  .08 + Math.random() * .22,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const theme = document.documentElement.getAttribute('data-theme');
    const color = theme === 'light' ? '99,102,241' : '148,163,184';
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color},${p.o})`;
      ctx.fill();
    });
    // Draw connections
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100) {
          const alpha = (1 - dist / 100) * .06;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(${color},${alpha})`;
          ctx.lineWidth = .5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }

  resize();
  initParticles();
  draw();
  window.addEventListener('resize', debounce(() => { resize(); initParticles(); }, 300));
}

/* ════════════════════════════════════════════════════════════════════════════
   PRESET MANAGEMENT
════════════════════════════════════════════════════════════════════════════ */
function selectPreset(preset) {
  if (!PRESET_INFO[preset]) return;
  _currentPreset = preset;

  // Update card active states
  document.querySelectorAll('.cp-preset-card').forEach(card => {
    const isActive = card.dataset.preset === preset;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-checked', String(isActive));
  });

  // Update estimate highlight
  document.querySelectorAll('[data-preset]').forEach(el => {
    if (el.classList.contains('cp-estimate-item')) {
      el.classList.toggle('active', el.dataset.preset === preset);
    }
  });

  // Update quality guarantee strip
  updateQualityGuarantee(preset);

  // Update recommendation banner active indicator
  updateRecommendBanner();

  S('CLICK');
}

function updateQualityGuarantee(preset) {
  const cfg = PRESET_INFO[preset];
  if (!cfg) return;
  const g = cfg.guarantee;

  const noDpiEl   = $('guaranteeLossless');
  const noGrayEl  = $('guaranteeNoGray');
  const presetEl  = $('guaranteePreset');

  if (noDpiEl) {
    noDpiEl.innerHTML = g.noDpi
      ? `<i class="fa fa-check" style="color:var(--green)"></i> No DPI Downsample`
      : `<i class="fa fa-times" style="color:var(--red)"></i> DPI May Reduce`;
  }
  if (noGrayEl) {
    noGrayEl.innerHTML = g.noGray
      ? `<i class="fa fa-check" style="color:var(--green)"></i> Color Preserved`
      : `<i class="fa fa-exclamation" style="color:var(--am)"></i> May Change Colors`;
  }
  if (presetEl) {
    presetEl.innerHTML = `<i class="fa fa-lock" style="color:var(--em3)"></i> ${cfg.emoji} ${cfg.name} Preset`;
  }
}

function updateRecommendBanner() {
  if (!_recommendPreset) return;
  const recText = $('recommendText');
  if (!recText) return;
  const info = PRESET_INFO[_recommendPreset];
  const isActive = _recommendPreset === _currentPreset;
  if (isActive) {
    recText.innerHTML = `<i class="fa fa-check" style="color:var(--green)"></i> <strong>Recommended preset active: ${info.emoji} ${info.name}</strong>`;
    const applyBtn = $('recommendApplyBtn');
    if (applyBtn) applyBtn.hidden = true;
  }
}

function applyRecommendation() {
  if (_recommendPreset) {
    selectPreset(_recommendPreset);
    toast('Preset Applied', `${PRESET_INFO[_recommendPreset].emoji} ${PRESET_INFO[_recommendPreset].name} preset selected`, 'success', 2500);
    updateRecommendBanner();
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   FILE HANDLING
════════════════════════════════════════════════════════════════════════════ */
function initDropZone() {
  const dz = D?.dropZone;
  if (!dz) return;

  // Click on drop zone opens file input
  dz.addEventListener('click', e => {
    // Don't trigger if clicking on the fi-remove button or browse-btn
    if (e.target.closest('#fiRemove') || e.target.closest('.cp-browse-btn')) return;
    if (!FILE) D.fileInput?.click();
  });

  // Also wire the browse-btn specifically
  dz.querySelector('.cp-browse-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    D.fileInput?.click();
  });

  dz.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!FILE) D.fileInput?.click();
    }
  });

  // Drag events
  dz.addEventListener('dragenter', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', e => {
    if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag-over');
  });
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (files.length) handleFiles(files);
    else toast('Invalid file', 'Please drop a PDF file', 'warn', 3000);
  });

  // File input change
  D.fileInput?.addEventListener('change', e => {
    const files = [...(e.target.files || [])].filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (files.length) handleFiles(files);
    e.target.value = '';
  });
}

function handleFiles(files) {
  if (!files || files.length === 0) return;

  if (files.length > 1) {
    // Batch mode
    files.forEach(f => addToBatch(f));
    const bp = $('batchPanel');
    if (bp) bp.removeAttribute('hidden');
    S('FILE_ADD');
    toast('Batch Queue', `${files.length} files added to batch queue`, 'info', 3000);
    return;
  }

  // Single file mode
  const f = files[0];
  if (!f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf') {
    toast('Invalid File', 'Please select a PDF file', 'error', 4000);
    S('ERROR');
    return;
  }

  FILE = f;
  // CRITICAL: Store exact stem from original filename
  STEM = getStem(f.name);
  RESULT_DATA = null;

  S('FILE_ADD');
  renderFileInfo(f);
  updateActionState();
  updateDownloadFilenamePreview();

  // Add to batch queue as well (for batch context)
  if (BATCH_QUEUE.length === 0) {
    addToBatch(f, /* silent */ true);
  }

  // Trigger deep analysis
  setTimeout(() => analyzeFile(f), 400);
}

function renderFileInfo(f) {
  const dz = D?.dropZone;
  if (!dz) return;

  // Show file info, hide empty state
  const emptyState = $('dropEmptyState');
  if (emptyState) emptyState.hidden = true;
  dz.classList.add('has-file');

  const fi = D?.fileInfo;
  if (!fi) return;
  fi.removeAttribute('hidden');

  const nameEl  = $('fiName');
  const sizeEl  = $('fiSize');
  const pagesEl = $('fiPages');

  if (nameEl)  nameEl.textContent = f.name;
  if (sizeEl)  sizeEl.innerHTML   = `<i class="fa fa-database"></i> ${fmtBytes(f.size)}`;
  if (pagesEl) pagesEl.innerHTML  = `<i class="fa fa-file"></i> Counting pages…`;

  // Count pages via quick read (optional — don't block)
  _quickCountPages(f).then(n => {
    if (pagesEl) pagesEl.innerHTML = `<i class="fa fa-file"></i> ${n > 0 ? n + ' pages' : '? pages'}`;
  });

  announce(`File added: ${f.name}, ${fmtBytes(f.size)}`);
}

async function _quickCountPages(file) {
  try {
    const buf  = await file.slice(0, Math.min(file.size, 200000)).arrayBuffer();
    const text = new TextDecoder('latin1').decode(buf);
    const m    = text.match(/\/Type\s*\/Page[^s]/g);
    return m ? m.length : 0;
  } catch {
    return 0;
  }
}

function removeFile() {
  FILE = null;
  STEM = '';
  RESULT_DATA = null;
  ANALYSIS_DATA = null;

  const dz = D?.dropZone;
  if (dz) dz.classList.remove('has-file');
  if (D?.fileInfo) D.fileInfo.setAttribute('hidden', '');

  const emptyState = $('dropEmptyState');
  if (emptyState) emptyState.hidden = false;

  hideAnalysis();
  hideEstimates();
  hideRecommend();
  updateActionState();
  updateDownloadFilenamePreview();
  announce('File removed');
}

function updateDownloadFilenamePreview() {
  const el = $('downloadFilenamePreview');
  if (!el) return;
  el.textContent = STEM ? `${STEM}_compressed.pdf` : '—';
}

/* ════════════════════════════════════════════════════════════════════════════
   DEEP ANALYSIS
════════════════════════════════════════════════════════════════════════════ */
async function analyzeFile(file) {
  if (!file) return;
  try {
    const fd = new FormData();
    fd.append('file', file);

    const res = await fetch('/api/compress-pdf/analyze', { method: 'POST', body: fd });
    if (!res.ok) return;
    const data = await res.json();
    ANALYSIS_DATA = data;

    renderAnalysisChips(data);
    renderEstimates(data, file.size);
    renderRecommendation(data);
  } catch (e) {
    // Analysis failure is non-fatal — just don't show chips
    console.warn('Analysis failed:', e);
  }
}

function renderAnalysisChips(data) {
  const strip = $('analysisStrip');
  if (!strip) return;

  const chips = [];
  const score = data.compressibility_score ?? data.compressibility?.score ?? 0;
  const ct    = data.content_type || 'mixed';
  const pages = data.page_count || 0;
  const imgs  = data.image_count || 0;
  const dups  = data.duplicate_image_count || 0;

  if (pages > 0) {
    chips.push({ cls: 'chip-info', icon: 'fa-file', label: `${pages} page${pages !== 1 ? 's' : ''}` });
  }
  if (score > 0) {
    const cls = score >= 60 ? 'chip-good' : score >= 30 ? 'chip-warn' : 'chip-info';
    chips.push({ cls, icon: 'fa-compress-alt', label: `${score}% compressible` });
  }
  if (imgs > 0) {
    chips.push({ cls: 'chip-info', icon: 'fa-image', label: `${imgs} image${imgs !== 1 ? 's' : ''}` });
  }
  if (dups > 0) {
    chips.push({ cls: 'chip-warn', icon: 'fa-clone', label: `${dups} duplicate image${dups !== 1 ? 's' : ''}` });
  }
  if (ct) {
    const ctLabel = ct.replace('_', ' ');
    chips.push({ cls: 'chip-cyan', icon: 'fa-tag', label: ctLabel });
  }
  if (data.is_scanned) {
    chips.push({ cls: 'chip-warn', icon: 'fa-scanner', label: 'Scanned PDF' });
  }
  if (data.has_encryption || data.is_protected) {
    chips.push({ cls: 'chip-warn', icon: 'fa-lock', label: 'Encrypted' });
  }

  strip.innerHTML = chips.map(c =>
    `<span class="cp-analysis-chip ${c.cls}"><i class="fa ${c.icon}" aria-hidden="true"></i>${c.label}</span>`
  ).join('');
  strip.removeAttribute('hidden');
}

function renderEstimates(data, fileSize) {
  const wrap = $('estimatesWrap');
  if (!wrap || !fileSize) return;

  const ests = data.estimated_reductions_by_preset || {};
  PRESET_ORDER.forEach(preset => {
    const pct = ests[preset] ?? null;
    const valEl = $(`est${preset.charAt(0).toUpperCase() + preset.slice(1)}`);
    const pctEl = $(`est${preset.charAt(0).toUpperCase() + preset.slice(1)}Pct`);
    if (pct != null && pct > 0) {
      const estimatedSz = fileSize * (1 - pct / 100);
      if (valEl) valEl.textContent = fmtBytes(estimatedSz);
      if (pctEl) pctEl.textContent = `-${pct.toFixed(0)}%`;
    } else {
      if (valEl) valEl.textContent = '—';
      if (pctEl) pctEl.textContent = '—';
    }
  });

  // Mark active preset
  wrap.querySelectorAll('.cp-estimate-item').forEach(el => {
    el.classList.toggle('active', el.dataset.preset === _currentPreset);
  });

  wrap.removeAttribute('hidden');
}

function renderRecommendation(data) {
  const banner  = $('recommendBanner');
  const textEl  = $('recommendText');
  const applyBtn= $('recommendApplyBtn');
  if (!banner || !textEl) return;

  const rec = data.recommended_preset || data.recommendations?.[0];
  if (!rec || !PRESET_INFO[rec]) {
    banner.setAttribute('hidden', '');
    return;
  }

  _recommendPreset = rec;
  const info = PRESET_INFO[rec];

  if (_currentPreset === rec) {
    textEl.innerHTML = `<i class="fa fa-check" style="color:var(--green)"></i> <strong>Recommended preset already active: ${info.emoji} ${info.name}</strong>`;
    if (applyBtn) applyBtn.hidden = true;
  } else {
    textEl.innerHTML = `<i class="fa fa-lightbulb" style="color:var(--am)"></i> Best for this PDF: <strong>${info.emoji} ${info.name}</strong> — ${info.detail}`;
    if (applyBtn) applyBtn.hidden = false;
  }
  banner.removeAttribute('hidden');
}

function hideAnalysis() {
  const strip = $('analysisStrip');
  if (strip) strip.setAttribute('hidden', '');
}
function hideEstimates() {
  const wrap = $('estimatesWrap');
  if (wrap) wrap.setAttribute('hidden', '');
}
function hideRecommend() {
  const banner = $('recommendBanner');
  if (banner) banner.setAttribute('hidden', '');
  _recommendPreset = null;
}

/* ════════════════════════════════════════════════════════════════════════════
   ACTION STATE (enable/disable compress button)
════════════════════════════════════════════════════════════════════════════ */
function updateActionState() {
  if (!D) return;
  const hasFile = !!FILE;

  if (D.compressBtn) D.compressBtn.disabled = !hasFile;
  if (D.resetBtn) D.resetBtn.disabled = !hasFile;

  // FAB
  const fab = $('cpFab');
  if (fab) {
    fab.title = hasFile ? 'Compress PDF (Ctrl+Enter)' : 'Add PDF file';
    fab.querySelector('i').className = hasFile ? 'fa fa-compress-alt' : 'fa fa-plus';
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   ADVANCED OPTIONS
════════════════════════════════════════════════════════════════════════════ */
function initAdvOpts() {
  const toggle = D?.advToggle;
  const panel  = D?.advOpts;
  if (!toggle || !panel) return;

  toggle.addEventListener('click', () => {
    const isOpen = !panel.hasAttribute('hidden');
    if (isOpen) {
      panel.setAttribute('hidden', '');
      toggle.setAttribute('aria-expanded', 'false');
    } else {
      panel.removeAttribute('hidden');
      toggle.setAttribute('aria-expanded', 'true');
    }
    S('CLICK');
  });

  // Count active advanced options
  const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
  const defaults   = { optRemoveThumbs: true, optSubsetFonts: true, optDedup: true };
  const countActive = () => {
    let count = 0;
    checkboxes.forEach(cb => {
      const def = defaults[cb.id];
      if (def !== undefined ? cb.checked !== def : cb.checked) count++;
    });
    const badge = D?.advCount;
    if (badge) {
      badge.textContent = count;
      badge.hidden = count === 0;
    }
  };
  checkboxes.forEach(cb => cb.addEventListener('change', countActive));
  countActive();
}

function setTargetKb(kb) {
  const input = $('targetKbInput');
  if (!input) return;
  input.value = kb > 0 ? kb : '';
  if (kb > 0) {
    toast('Target size set', `Compressing to ~${kb} KB`, 'info', 2000);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   COLLECT COMPRESSION OPTIONS
════════════════════════════════════════════════════════════════════════════ */
function collectOptions() {
  const getCheck = (id, def = false) => {
    const el = $(id);
    return el ? el.checked : def;
  };
  const getVal = (id) => {
    const el = $(id);
    return el ? el.value : '';
  };

  return {
    preset:                  _currentPreset,
    grayscale:               getCheck('optGrayscale', false),
    strip_metadata:          getCheck('optStripMeta',  false),
    remove_annotations:      getCheck('optRemoveAnnots', false),
    linearize:               getCheck('optLinearize', false),
    remove_javascript:       getCheck('optRemoveJS', false),
    remove_thumbnails:       getCheck('optRemoveThumbs', true),
    remove_embedded_files:   getCheck('optRemoveEmbedded', false),
    subset_fonts:            getCheck('optSubsetFonts', true),
    remove_duplicate_images: getCheck('optDedup', true),
    flatten_transparency:    getCheck('optFlatTrans', false),
    remove_icc_profiles:     getCheck('optRemoveICC', false),
    remove_forms:            getCheck('optRemoveForms', false),
    remove_links:            getCheck('optRemoveLinks', false),
    password:                getVal('optPassword'),
    target_kb:               parseInt(getVal('targetKbInput') || '0', 10) || 0,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   PROGRESS
════════════════════════════════════════════════════════════════════════════ */
function showProgress() {
  if (D?.progressWrap) D.progressWrap.removeAttribute('hidden');
  if (D?.actionsRow) {
    if (D.compressBtn) D.compressBtn.hidden = true;
    if (D.resetBtn)    D.resetBtn.hidden    = true;
    if (D.cancelBtn)   D.cancelBtn.removeAttribute('hidden');
  }
  if (D?.resultWrap) D.resultWrap.setAttribute('hidden', '');
  renderProgressStages();
  startElapsedTimer();
}

function hideProgress() {
  if (D?.progressWrap) D.progressWrap.setAttribute('hidden', '');
  if (D?.actionsRow) {
    if (D.compressBtn) D.compressBtn.removeAttribute('hidden');
    if (D.resetBtn)    D.resetBtn.removeAttribute('hidden');
    if (D.cancelBtn)   D.cancelBtn.setAttribute('hidden', '');
  }
  stopElapsedTimer();
}

function renderProgressStages() {
  const stagesEl = $('progressStages');
  if (!stagesEl) return;
  stagesEl.innerHTML = PROGRESS_STAGES.slice(0, 5).map((st, i) =>
    `<div class="cp-progress-stage" id="pstage-${i}" data-pct="${st.pct}">
      <div class="cp-stage-icon"><i class="fa ${st.icon}" aria-hidden="true"></i></div>
      <span>${st.label}</span>
    </div>`
  ).join('');
}

function updateProgress(pct, title, sub) {
  const bar   = $('progressBar');
  const pctEl = $('progressPct');
  const titleEl = $('progressTitle');
  const subEl   = $('progressSub');
  const role    = $('progressBarRole');

  const p = clamp(pct, 0, 100);
  if (bar)   bar.style.width = p + '%';
  if (pctEl) pctEl.textContent = p + '%';
  if (role)  role.setAttribute('aria-valuenow', p);
  if (title && titleEl) titleEl.textContent = title;
  if (sub   && subEl)   subEl.textContent   = sub;

  // Update stage highlights
  PROGRESS_STAGES.slice(0, 5).forEach((st, i) => {
    const el = $(`pstage-${i}`);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (p >= st.pct) {
      const nextPct = PROGRESS_STAGES[i + 1]?.pct ?? 101;
      if (p < nextPct) el.classList.add('active');
      else el.classList.add('done');
    }
  });
}

let _simInterval = null;
function startSimProgress(startPct = 5, targetPct = 90, durationMs = 8000) {
  if (_simInterval) clearInterval(_simInterval);
  let cur = startPct;
  const step = (targetPct - startPct) / (durationMs / 300);
  _simInterval = setInterval(() => {
    cur = Math.min(cur + step * (0.5 + Math.random()), targetPct);
    const stageIdx = PROGRESS_STAGES.findIndex((st, i) =>
      cur >= st.pct && (PROGRESS_STAGES[i + 1]?.pct ?? 101) > cur
    );
    const stage = PROGRESS_STAGES[stageIdx] || PROGRESS_STAGES[0];
    updateProgress(Math.floor(cur), stage.label, stage.sub);
    if (cur >= targetPct) {
      clearInterval(_simInterval);
      _simInterval = null;
    }
  }, 300);
}

function stopSimProgress() {
  if (_simInterval) { clearInterval(_simInterval); _simInterval = null; }
}

function startElapsedTimer() {
  stopElapsedTimer();
  _t0 = performance.now();
  _timerInterval = setInterval(() => {
    const el = $('progressElapsed');
    if (el) el.textContent = fmtElapsed((performance.now() - _t0) / 1000) + ' elapsed';
  }, 100);
}

function stopElapsedTimer() {
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
}

/* ════════════════════════════════════════════════════════════════════════════
   SSE PROGRESS
════════════════════════════════════════════════════════════════════════════ */
function openSSE(jobId) {
  closeSSE();
  try {
    SSE_SOURCE = new EventSource(`/api/compress-pdf/progress/${jobId}`);
    SSE_SOURCE.addEventListener('progress', e => {
      try {
        const d = JSON.parse(e.data);
        updateProgress(d.pct || 0, d.title || '', d.sub || '');
      } catch (_) {}
    });
    SSE_SOURCE.onerror = () => closeSSE();
  } catch (_) {}
}

function closeSSE() {
  if (SSE_SOURCE) { try { SSE_SOURCE.close(); } catch (_) {} SSE_SOURCE = null; }
  if (SSE_TIMER)  { clearInterval(SSE_TIMER); SSE_TIMER = null; }
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN COMPRESSION
════════════════════════════════════════════════════════════════════════════ */
async function doCompress() {
  if (!FILE) {
    toast('No file', 'Please upload a PDF file first', 'warn', 3000);
    S('ERROR');
    return;
  }
  if (BATCH_ACTIVE) return;

  COMPRESS_DONE = false;
  JOB_ID = generateId();

  S('START');

  const opts = collectOptions();

  // Show quality guarantee info before starting
  const cfg = PRESET_INFO[opts.preset];
  if (cfg?.guarantee?.lossless) {
    toast('🔮 Lossless Mode', 'Zero quality loss — pikepdf streams only, no image resampling', 'success', 4000);
  } else if (cfg?.guarantee?.noDpi) {
    toast('💎 High Quality', 'No DPI downsampling — near-lossless compression', 'info', 3000);
  }

  showProgress();
  updateProgress(5, 'Initialising…', `Preset: ${cfg?.emoji} ${cfg?.name} · Loading 12 engines…`);

  openSSE(JOB_ID);
  startSimProgress(5, 92, 12000);

  // beforeunload guard
  const _beforeUnload = e => { e.preventDefault(); e.returnValue = 'Compression in progress…'; };
  window.addEventListener('beforeunload', _beforeUnload);

  const fd = new FormData();
  fd.append('file', FILE);
  fd.append('preset', opts.preset);
  fd.append('quality', opts.preset);   // legacy compat
  fd.append('grayscale',               String(opts.grayscale));
  fd.append('strip_metadata',          String(opts.strip_metadata));
  fd.append('remove_annotations',      String(opts.remove_annotations));
  fd.append('linearize',               String(opts.linearize));
  fd.append('remove_javascript',       String(opts.remove_javascript));
  fd.append('remove_thumbnails',       String(opts.remove_thumbnails));
  fd.append('remove_embedded_files',   String(opts.remove_embedded_files));
  fd.append('flatten_transparency',    String(opts.flatten_transparency));
  fd.append('subset_fonts',            String(opts.subset_fonts));
  fd.append('remove_icc_profiles',     String(opts.remove_icc_profiles));
  fd.append('remove_forms',            String(opts.remove_forms));
  fd.append('remove_links',            String(opts.remove_links));
  fd.append('remove_duplicate_images', String(opts.remove_duplicate_images));
  fd.append('target_kb',               String(opts.target_kb));
  fd.append('password',                opts.password);
  fd.append('job_id',                  JOB_ID);

  try {
    const resp = await fetch('/api/compress-pdf/compress', { method: 'POST', body: fd });
    window.removeEventListener('beforeunload', _beforeUnload);
    stopSimProgress();
    closeSSE();

    if (!resp.ok) {
      let errMsg = 'Server error';
      try {
        const j = await resp.json();
        errMsg = j.error || j.message || errMsg;
      } catch (_) {}
      throw new Error(errMsg);
    }

    // Read headers
    const inSize     = parseInt(resp.headers.get('X-Input-Size')    || '0', 10);
    const outSize    = parseInt(resp.headers.get('X-Output-Size')   || '0', 10);
    const redPct     = parseFloat(resp.headers.get('X-Reduction-Pct') || '0');
    const engine     = resp.headers.get('X-Engine-Used')    || 'multi-engine';
    const qScore     = parseInt(resp.headers.get('X-Quality-Score') || '50', 10);
    const qGrade     = resp.headers.get('X-Quality-Grade')  || 'B';
    const engTried   = resp.headers.get('X-Engines-Tried')  || '';
    const procMs     = parseInt(resp.headers.get('X-Processing-Ms') || '0', 10);
    const method     = resp.headers.get('X-Method-Used')    || opts.preset;

    // Get the compressed file as blob
    const blob = await resp.blob();

    if (!blob || blob.size === 0) throw new Error('Empty response — compression failed');

    updateProgress(100, 'Done! ✓', `Saved ${redPct.toFixed(1)}% · Grade ${qGrade}`);
    COMPRESS_DONE = true;

    // Store result
    const actualInSize  = inSize  || FILE.size;
    const actualOutSize = outSize || blob.size;
    const actualRedPct  = redPct  || calcReduction(actualInSize, actualOutSize);
    const procTime      = procMs  || Math.round(performance.now() - _t0);
    const fingerprint   = generateFingerprint(actualInSize, actualOutSize, engine, opts.preset, procTime);

    RESULT_DATA = {
      blob,
      inputSize:  actualInSize,
      outputSize: actualOutSize,
      reduction:  actualRedPct,
      engine,
      qScore,
      qGrade,
      engTried,
      procMs:     procTime,
      preset:     opts.preset,
      fingerprint,
      stem:       STEM,   // EXACT original filename stem — used for download
    };

    // Parse engines tried
    const engList = engTried.split(',').filter(Boolean).map(e => e.trim());

    // Reveal result after short delay for UX
    setTimeout(() => {
      hideProgress();
      showResult(RESULT_DATA, engList);
      S('DOWNLOAD');
      setTimeout(() => { S('SUCCESS'); launchConfetti(); }, 300);
    }, 600);

    // Save to history
    saveHistory({
      name:       FILE.name,
      stem:       STEM,
      inSize:     actualInSize,
      outSize:    actualOutSize,
      reduction:  actualRedPct,
      engine,
      grade:      qGrade,
      score:      qScore,
      preset:     opts.preset,
      procMs:     procTime,
      fingerprint,
      ts:         Date.now(),
    });

  } catch (e) {
    window.removeEventListener('beforeunload', _beforeUnload);
    stopSimProgress();
    closeSSE();
    COMPRESS_DONE = false;
    hideProgress();
    console.error('Compression error:', e);
    toast('Compression Failed', e.message || 'Unknown error', 'error', 6000);
    S('ERROR');
    announce('Compression failed: ' + e.message, 'assertive');
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   CANCEL COMPRESSION
════════════════════════════════════════════════════════════════════════════ */
function cancelCompress() {
  closeSSE();
  stopSimProgress();
  stopElapsedTimer();
  COMPRESS_DONE = false;
  hideProgress();
  S('CANCEL');
  toast('Cancelled', 'Compression cancelled', 'warn', 2000);
  announce('Compression cancelled');
}

/* ════════════════════════════════════════════════════════════════════════════
   SHOW RESULT
════════════════════════════════════════════════════════════════════════════ */
function showResult(data, engList) {
  const rw = D?.resultWrap;
  if (!rw) return;

  rw.removeAttribute('hidden');

  // Grade banner
  const banner     = $('resultGradeBanner');
  const bannerText = $('resultGradeBannerText');
  if (banner) {
    const gradeColor = GRADE_BG[data.qGrade] || GRADE_BG['B'];
    banner.style.background = gradeColor;
  }
  if (bannerText) {
    const preset = PRESET_INFO[data.preset];
    bannerText.innerHTML = `
      Grade <strong>${data.qGrade}</strong> ·
      ${data.reduction.toFixed(1)}% reduction ·
      ${preset?.emoji || ''} ${preset?.name || data.preset} preset ·
      ${fmtBytes(data.inputSize)} → ${fmtBytes(data.outputSize)}
    `;
  }

  // Animate numbers
  animateCounter($('resBefore'), 0, data.inputSize,  1000, v => fmtBytes(v));
  animateCounter($('resAfter'),  0, data.outputSize, 1000, v => fmtBytes(v));
  animateCounter($('resPct'),    0, data.reduction,  1200, v => v.toFixed(1) + '%');

  // Bar
  const bar  = $('resBar');
  const role = $('resBarRole');
  if (bar) {
    setTimeout(() => {
      const pct = clamp(data.reduction, 0, 100);
      bar.style.width = pct + '%';
      if (role) role.setAttribute('aria-valuenow', pct);
    }, 200);
  }

  // Chips
  const gradeEl  = $('resGrade');
  const scoreEl  = $('resScore');
  const engineEl = $('resEngine');
  const timeEl   = $('resTime');
  if (gradeEl)  gradeEl.textContent  = data.qGrade;
  if (scoreEl)  scoreEl.textContent  = data.qScore + '/100';
  if (engineEl) engineEl.textContent = data.engine;
  if (timeEl)   timeEl.textContent   = fmtMs(data.procMs);

  // Engines tried list
  if (engList.length > 0) {
    const wrap = $('enginesTriedWrap');
    const list = $('resEngineList');
    if (wrap && list) {
      list.innerHTML = engList.map(e => {
        const isWinner = data.engine && (data.engine.includes(e) || e.includes(data.engine));
        return `<div class="cp-engine-row">
          <span class="cp-engine-name">${e}</span>
          ${isWinner ? '<span class="cp-engine-winner">✦ WINNER</span>' : ''}
        </div>`;
      }).join('');
      wrap.removeAttribute('hidden');
    }
  }

  // Fingerprint
  const fpWrap = $('fingerprintWrap');
  const fpVal  = $('fingerprintVal');
  if (fpWrap && fpVal && data.fingerprint) {
    fpVal.textContent = data.fingerprint;
    fpWrap.removeAttribute('hidden');
  }

  // Download filename preview
  updateDownloadFilenamePreview();

  // Chart.js donut chart
  setTimeout(() => updateResultChart(data.inputSize, data.outputSize), 300);

  // Before/after bar
  renderBABar(data.inputSize, data.outputSize);

  // Grade class on result card
  const resultCard = rw.querySelector('.cp-result-card');
  if (resultCard) {
    resultCard.className = resultCard.className.replace(/\bgrade-\S+/g, '');
    resultCard.classList.add(`grade-${(data.qGrade || 'b').toLowerCase()}`);
  }

  // Grade class on banner
  if (banner) {
    banner.className = banner.className.replace(/\bgrade-\S+/g, '');
    banner.classList.add(`cp-result-grade-banner`, `grade-${(data.qGrade || 'b').toLowerCase()}`);
  }

  // Sticky download bar (mobile)
  const dlName = `${data.stem || STEM || 'document'}_compressed.pdf`;
  showStickyDlBar(data.reduction, dlName);

  // Scroll to result
  rw.scrollIntoView({ behavior: 'smooth', block: 'start' });
  announce(`Compression complete. ${data.reduction.toFixed(1)}% reduction. Grade ${data.qGrade}.`);
}

function animateCounter(el, from, to, durationMs, formatter) {
  if (!el || to == null || isNaN(to)) return;
  if (_reduced) { el.textContent = formatter(to); return; }
  const start = performance.now();
  const update = (now) => {
    const t = Math.min((now - start) / durationMs, 1);
    const v = from + (to - from) * easeOutCubic(t);
    el.textContent = formatter(v);
    if (t < 1) requestAnimationFrame(update);
    else {
      el.textContent = formatter(to);
      el.classList.add('pop');
      setTimeout(() => el.classList.remove('pop'), 400);
    }
  };
  requestAnimationFrame(update);
}

/* ════════════════════════════════════════════════════════════════════════════
   CHART.JS DOUGHNUT CHART (result visualization)
════════════════════════════════════════════════════════════════════════════ */
function initResultChart() {
  const canvas = document.getElementById('resultDonutChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (CHART_INSTANCE) { CHART_INSTANCE.destroy(); CHART_INSTANCE = null; }

  CHART_INSTANCE = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Compressed', 'Original'],
      datasets: [{
        data: [0, 100],
        backgroundColor: [
          'rgba(16,185,129,.85)',
          'rgba(99,102,241,.15)',
        ],
        borderColor: [
          'rgba(16,185,129,1)',
          'rgba(99,102,241,.3)',
        ],
        borderWidth: 2,
        hoverOffset: 6,
      }],
    },
    options: {
      cutout: '72%',
      responsive: true,
      maintainAspectRatio: true,
      animation: {
        animateRotate: true,
        duration: 1200,
        easing: 'easeOutQuart',
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const lbl = ctx.label;
              const rd = RESULT_DATA;
              if (!rd) return lbl;
              if (lbl === 'Compressed') return `After: ${fmtBytes(rd.outputSize)}`;
              return `Saved: ${fmtBytes(rd.inputSize - rd.outputSize)}`;
            },
          },
          backgroundColor: 'rgba(15,20,40,.92)',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(99,102,241,.3)',
          borderWidth: 1,
          cornerRadius: 10,
          padding: 10,
        },
      },
    },
  });
}

function updateResultChart(inputSize, outputSize) {
  if (!CHART_INSTANCE && typeof Chart !== 'undefined') initResultChart();
  if (!CHART_INSTANCE) return;
  const pct    = inputSize > 0 ? ((inputSize - outputSize) / inputSize) * 100 : 0;
  const saved  = inputSize - outputSize;
  CHART_INSTANCE.data.datasets[0].data = [
    Math.max(saved, 0),
    outputSize,
  ];
  CHART_INSTANCE.update('active');

  // Update center text
  const pctEl = document.getElementById('donutPctText');
  if (pctEl) {
    if (_reduced) {
      pctEl.textContent = pct.toFixed(1) + '%';
    } else {
      animateCounter(pctEl, 0, pct, 1200, v => v.toFixed(1) + '%');
    }
  }

  // Update size stats
  const statBefore = document.getElementById('chartStatBefore');
  const statAfter  = document.getElementById('chartStatAfter');
  const statSaved  = document.getElementById('chartStatSaved');
  if (statBefore) statBefore.textContent = fmtBytes(inputSize);
  if (statAfter)  statAfter.textContent  = fmtBytes(outputSize);
  if (statSaved)  statSaved.textContent  = fmtBytes(Math.max(saved, 0));

  // Show/animate the before/after bar
  const baAfter = document.getElementById('baBarAfter');
  if (baAfter && inputSize > 0) {
    setTimeout(() => {
      baAfter.style.width = ((outputSize / inputSize) * 100).toFixed(1) + '%';
    }, 300);
  }
}

function destroyResultChart() {
  if (CHART_INSTANCE) { CHART_INSTANCE.destroy(); CHART_INSTANCE = null; }
  const pctEl = document.getElementById('donutPctText');
  if (pctEl) pctEl.textContent = '0%';
  const baAfter = document.getElementById('baBarAfter');
  if (baAfter) baAfter.style.width = '0%';
}

/* ════════════════════════════════════════════════════════════════════════════
   STICKY DOWNLOAD BAR (mobile)
════════════════════════════════════════════════════════════════════════════ */
function showStickyDlBar(pct, filename) {
  const bar = document.getElementById('cpStickyDlBar');
  if (!bar) return;
  const nameEl = document.getElementById('stickyDlName');
  const pctEl  = document.getElementById('stickyDlPct');
  if (nameEl) nameEl.textContent = filename || 'compressed.pdf';
  if (pctEl)  pctEl.textContent  = `Saved ${pct.toFixed(1)}%`;
  bar.classList.add('visible');
}

function hideStickyDlBar() {
  const bar = document.getElementById('cpStickyDlBar');
  if (bar) bar.classList.remove('visible');
}

/* ════════════════════════════════════════════════════════════════════════════
   BEFORE/AFTER BAR
════════════════════════════════════════════════════════════════════════════ */
function renderBABar(inputSize, outputSize) {
  const baBefore = document.getElementById('baBarBefore');
  const baAfter  = document.getElementById('baBarAfter');
  const baLblL   = document.getElementById('baLabelLeft');
  const baLblR   = document.getElementById('baLabelRight');

  if (baBefore) baBefore.style.width = '100%';

  if (baLblL) baLblL.textContent = fmtBytes(outputSize);
  if (baLblR) baLblR.textContent = fmtBytes(inputSize);

  if (baAfter && inputSize > 0) {
    setTimeout(() => {
      baAfter.style.width = ((outputSize / inputSize) * 100).toFixed(2) + '%';
    }, 400);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   JSZIP BATCH DOWNLOAD (replaces simple loop)
════════════════════════════════════════════════════════════════════════════ */
async function downloadBatchZipJSZip() {
  if (!BATCH_ZIP_PARTS.length) {
    toast('No files ready', 'Run batch compression first', 'warn', 2500);
    return;
  }
  if (BATCH_ZIP_PARTS.length === 1) {
    _triggerBlobDownload(BATCH_ZIP_PARTS[0].blob, BATCH_ZIP_PARTS[0].filename);
    S('DOWNLOAD');
    toast('Downloading…', BATCH_ZIP_PARTS[0].filename, 'success', 2500);
    return;
  }

  const zipBtn = $('batchZipBtn');
  if (zipBtn) {
    const orig = zipBtn.innerHTML;
    zipBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Creating ZIP…';
    zipBtn.disabled = true;

    try {
      if (typeof JSZip !== 'undefined') {
        // Use JSZip for proper ZIP
        const zip = new JSZip();
        for (const part of BATCH_ZIP_PARTS) {
          zip.file(part.filename, part.blob);
        }
        const zipBlob = await zip.generateAsync({
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 1 },
        }, (meta) => {
          zipBtn.innerHTML = `<i class="fa fa-spinner fa-spin"></i> ${meta.percent.toFixed(0)}%…`;
        });
        const now = new Date();
        const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
        _triggerBlobDownload(zipBlob, `ishutools_compressed_${stamp}.zip`);
        toast('ZIP Downloaded!', `${BATCH_ZIP_PARTS.length} files in ZIP`, 'success', 4000);
        S('DOWNLOAD');
      } else {
        // Fallback: download individually with stagger
        toast('Downloading files…', `${BATCH_ZIP_PARTS.length} PDFs (install JSZip for ZIP)`, 'info', 3000);
        for (let i = 0; i < BATCH_ZIP_PARTS.length; i++) {
          setTimeout(() => {
            _triggerBlobDownload(BATCH_ZIP_PARTS[i].blob, BATCH_ZIP_PARTS[i].filename);
          }, i * 400);
        }
        S('DOWNLOAD');
      }
    } catch (err) {
      toast('ZIP Error', err.message, 'error', 4000);
      S('ERROR');
    } finally {
      zipBtn.innerHTML = orig;
      zipBtn.disabled  = false;
    }
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   DOWNLOAD
════════════════════════════════════════════════════════════════════════════ */
function triggerDownload() {
  if (!RESULT_DATA?.blob) {
    toast('Nothing to download', 'Compress a PDF first', 'warn', 3000);
    return;
  }
  // CRITICAL: download name = EXACT original stem + "_compressed.pdf"
  // STEM is set from FILE.name when file is added (getStem function)
  const downloadName = `${RESULT_DATA.stem || STEM || 'document'}_compressed.pdf`;
  _triggerBlobDownload(RESULT_DATA.blob, downloadName);
  S('DOWNLOAD');
  toast('Downloading…', downloadName, 'success', 3000);
  announce(`Downloading ${downloadName}`);
}

function _triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ════════════════════════════════════════════════════════════════════════════
   SHARE & COPY REPORT
════════════════════════════════════════════════════════════════════════════ */
async function shareResult() {
  if (!RESULT_DATA) return;
  const text = buildReport(RESULT_DATA);
  try {
    if (navigator.share) {
      await navigator.share({
        title: 'IshuTools PDF Compressor Result',
        text,
        url: 'https://ishutools.fun/tools/compress-pdf/',
      });
      S('CLICK');
    } else {
      await navigator.clipboard.writeText(text);
      toast('Copied!', 'Compression report copied to clipboard', 'success', 2500);
    }
  } catch (e) {
    if (e.name !== 'AbortError') toast('Share failed', 'Try the copy button instead', 'warn', 3000);
  }
}

async function copyReport() {
  if (!RESULT_DATA) return;
  const text = buildReport(RESULT_DATA);
  try {
    await navigator.clipboard.writeText(text);
    toast('Report copied!', 'Full compression report copied to clipboard', 'success', 2500);
    S('CLICK');
  } catch {
    toast('Copy failed', 'Clipboard not available', 'error', 3000);
  }
}

function buildReport(data) {
  const preset = PRESET_INFO[data.preset];
  const lines = [
    '═══════════════════════════════════════',
    ' IshuTools PDF Compressor — Result Report',
    '═══════════════════════════════════════',
    ` Tool:        IshuTools.fun by Ishu Kumar (ISHUKR41)`,
    ` Date:        ${new Date().toLocaleString()}`,
    ` File:        ${data.stem}_compressed.pdf`,
    '',
    ` Original:    ${fmtBytes(data.inputSize)}`,
    ` Compressed:  ${fmtBytes(data.outputSize)}`,
    ` Saved:       ${data.reduction.toFixed(2)}%`,
    ` Grade:       ${data.qGrade} (Score: ${data.qScore}/100)`,
    '',
    ` Preset:      ${preset?.emoji} ${preset?.name}`,
    ` Engine:      ${data.engine}`,
    ` Time:        ${fmtMs(data.procMs)}`,
    ` Fingerprint: ${data.fingerprint || '—'}`,
    '',
    '═══════════════════════════════════════',
    ' IshuTools.fun — 36+ Free PDF Tools',
    ' Built by Ishu Kumar (ISHUKR41 / ISHUKR75)',
    ' https://ishutools.fun',
    '═══════════════════════════════════════',
  ];
  return lines.join('\n');
}

async function copyFingerprint() {
  const fp = $('fingerprintVal')?.textContent;
  if (!fp || fp === '—') return;
  try {
    await navigator.clipboard.writeText(fp);
    toast('Copied!', `Fingerprint: ${fp}`, 'success', 2000);
  } catch {
    toast('Copy failed', 'Clipboard not available', 'error', 2000);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   RESET
════════════════════════════════════════════════════════════════════════════ */
function resetTool() {
  FILE        = null;
  STEM        = '';
  JOB_ID      = '';
  COMPRESS_DONE = false;
  RESULT_DATA = null;
  ANALYSIS_DATA = null;
  _recommendPreset = null;

  closeSSE();
  stopSimProgress();
  stopElapsedTimer();

  // UI reset
  const dz = D?.dropZone;
  if (dz) dz.classList.remove('has-file');
  if (D?.fileInfo) D.fileInfo.setAttribute('hidden', '');

  const emptyState = $('dropEmptyState');
  if (emptyState) emptyState.hidden = false;

  hideProgress();
  if (D?.resultWrap) D.resultWrap.setAttribute('hidden', '');

  const engWrap = $('enginesTriedWrap');
  if (engWrap) engWrap.setAttribute('hidden', '');
  const fpWrap = $('fingerprintWrap');
  if (fpWrap) fpWrap.setAttribute('hidden', '');

  hideAnalysis();
  hideEstimates();
  hideRecommend();
  updateActionState();
  updateDownloadFilenamePreview();
  destroyResultChart();
  hideStickyDlBar();

  window.scrollTo({ top: 0, behavior: 'smooth' });
  S('CLICK');
  announce('Tool reset');
}

/* ════════════════════════════════════════════════════════════════════════════
   BATCH COMPRESSION
════════════════════════════════════════════════════════════════════════════ */
function addToBatch(file, silent = false) {
  const id = generateId();
  BATCH_QUEUE.push({ id, file, status: 'pending', result: null, blobUrl: null, pct: 0 });
  renderBatchQueue();
  updateBatchControls();
  if (!silent) {
    S('FILE_ADD');
    toast('File added', file.name, 'info', 1500);
  }
}

function renderBatchQueue() {
  const qEl = $('batchQueue');
  const cnt = $('batchCount');
  if (cnt) cnt.textContent = BATCH_QUEUE.length;
  const runCnt = $('batchRunCount');
  if (runCnt) runCnt.textContent = BATCH_QUEUE.filter(i => i.status === 'pending' || i.status === 'error').length;

  if (!qEl) return;
  qEl.innerHTML = BATCH_QUEUE.map(item => {
    const statusCls = `batch-status-${item.status}`;
    const statusLabel = {
      pending: 'Pending', running: '⏳ Running',
      done: '✓ Done', error: '✗ Error',
    }[item.status] || item.status;
    const pct = item.result ? item.result.reduction.toFixed(0) + '%' : '';
    const size = fmtBytes(item.file.size);

    return `<div class="cp-batch-item" data-id="${item.id}" role="listitem"
                  draggable="true"
                  ondragstart="batchDragStart(event,'${item.id}')"
                  ondragover="batchDragOver(event)"
                  ondrop="batchDrop(event,'${item.id}')"
                  ondragend="batchDragEnd(event)">
      <span class="cp-batch-item-drag" aria-hidden="true"><i class="fa fa-grip-lines"></i></span>
      <div class="cp-batch-item-icon" aria-hidden="true"><i class="fa fa-file-pdf"></i></div>
      <div class="cp-batch-item-name" title="${item.file.name}">${item.file.name}</div>
      <div class="cp-batch-item-size">${size}</div>
      <span class="cp-batch-item-status ${statusCls}">${statusLabel}${pct ? ' · ' + pct : ''}</span>
      <div class="cp-batch-item-actions">
        ${item.status === 'done' && item.blobUrl
          ? `<button class="cp-batch-action-btn dl" onclick="downloadBatchItem('${item.id}')" title="Download" aria-label="Download compressed file"><i class="fa fa-download"></i></button>`
          : ''}
        ${item.status === 'error'
          ? `<button class="cp-batch-action-btn retry" onclick="retryBatchItem('${item.id}')" title="Retry" aria-label="Retry compression"><i class="fa fa-redo"></i></button>`
          : ''}
        <button class="cp-batch-action-btn rm" onclick="removeBatchItem('${item.id}')" title="Remove" aria-label="Remove from queue"><i class="fa fa-times"></i></button>
      </div>
      ${item.status === 'running' ? `<div class="cp-batch-item-prog" style="width:${item.pct}%"></div>` : ''}
    </div>`;
  }).join('');
}

function updateBatchControls() {
  const btn = $('batchRunBtn');
  const cnt = $('batchRunCount');
  const pending = BATCH_QUEUE.filter(i => i.status === 'pending' || i.status === 'error').length;
  if (btn) btn.disabled = pending === 0 || BATCH_ACTIVE;
  if (cnt) cnt.textContent = pending;

  const summary = $('batchSummary');
  if (summary) {
    const done = BATCH_QUEUE.filter(i => i.status === 'done').length;
    if (done > 0) {
      summary.removeAttribute('hidden');
      const totalFiles = $('batchTotalFiles');
      const doneEl     = $('batchDone');
      const savedEl    = $('batchSaved');
      const avgEl      = $('batchAvgPct');
      if (totalFiles) totalFiles.textContent = BATCH_QUEUE.length;
      if (doneEl)     doneEl.textContent     = done;
      const completedItems = BATCH_QUEUE.filter(i => i.result);
      const totalSaved = completedItems.reduce((s, i) => s + (i.result.inputSize - i.result.outputSize), 0);
      const avgPct     = completedItems.length > 0
        ? completedItems.reduce((s, i) => s + i.result.reduction, 0) / completedItems.length
        : 0;
      if (savedEl) savedEl.textContent = fmtBytes(totalSaved);
      if (avgEl)   avgEl.textContent   = avgPct.toFixed(0) + '%';
    } else {
      summary.setAttribute('hidden', '');
    }
  }

  // Show/hide ZIP button
  const zipBtn = $('batchZipBtn');
  if (zipBtn) {
    const hasDone = BATCH_QUEUE.some(i => i.status === 'done' && i.blobUrl);
    if (hasDone) zipBtn.removeAttribute('hidden');
    else zipBtn.setAttribute('hidden', '');
  }
}

async function runBatchCompression() {
  if (BATCH_ACTIVE) return;
  const pending = BATCH_QUEUE.filter(i => i.status === 'pending' || i.status === 'error');
  if (pending.length === 0) return;

  BATCH_ACTIVE = true;
  BATCH_ZIP_PARTS = [];
  updateBatchControls();

  for (const item of pending) {
    await compressBatchItem(item);
  }

  BATCH_ACTIVE = false;
  updateBatchControls();

  const done  = BATCH_QUEUE.filter(i => i.status === 'done').length;
  const total = BATCH_QUEUE.length;
  S('SUCCESS');
  toast('Batch Complete!', `${done}/${total} files compressed successfully`, 'success', 5000);
  await launchConfetti();
}

async function compressBatchItem(item) {
  item.status = 'running';
  item.pct    = 5;
  renderBatchQueue();

  const opts = collectOptions();
  const fd   = new FormData();
  fd.append('file',    item.file);
  fd.append('preset',  opts.preset);
  fd.append('quality', opts.preset);
  fd.append('grayscale',               String(opts.grayscale));
  fd.append('strip_metadata',          String(opts.strip_metadata));
  fd.append('remove_annotations',      String(opts.remove_annotations));
  fd.append('remove_thumbnails',       String(opts.remove_thumbnails));
  fd.append('remove_duplicate_images', String(opts.remove_duplicate_images));
  fd.append('subset_fonts',            String(opts.subset_fonts));
  fd.append('target_kb',               String(opts.target_kb));

  // Simulate progress
  const progInterval = setInterval(() => {
    item.pct = Math.min(item.pct + 5, 90);
    renderBatchQueue();
  }, 500);

  try {
    const resp = await fetch('/api/compress-pdf/compress', { method: 'POST', body: fd });
    clearInterval(progInterval);

    if (!resp.ok) {
      let err = 'Server error';
      try { const j = await resp.json(); err = j.error || err; } catch (_) {}
      throw new Error(err);
    }

    const inSize  = parseInt(resp.headers.get('X-Input-Size')  || '0', 10) || item.file.size;
    const outSize = parseInt(resp.headers.get('X-Output-Size') || '0', 10);
    const redPct  = parseFloat(resp.headers.get('X-Reduction-Pct') || '0');
    const engine  = resp.headers.get('X-Engine-Used') || 'multi-engine';
    const qGrade  = resp.headers.get('X-Quality-Grade') || 'B';

    const blob = await resp.blob();
    if (!blob || blob.size === 0) throw new Error('Empty response');

    const blobUrl    = URL.createObjectURL(blob);
    const stem       = getStem(item.file.name);
    const dlFilename = `${stem}_compressed.pdf`;

    item.status  = 'done';
    item.pct     = 100;
    item.blobUrl = blobUrl;
    item.dlName  = dlFilename;
    item.result  = {
      inputSize:  inSize,
      outputSize: outSize || blob.size,
      reduction:  redPct || calcReduction(inSize, outSize || blob.size),
      engine,
      grade:      qGrade,
    };

    BATCH_ZIP_PARTS.push({ filename: dlFilename, blob });

  } catch (e) {
    clearInterval(progInterval);
    item.status = 'error';
    item.error  = e.message;
    S('ERROR');
    toast('Batch item failed', `${item.file.name}: ${e.message}`, 'error', 4000);
  }

  renderBatchQueue();
  updateBatchControls();
}

// Batch item actions
function downloadBatchItem(id) {
  const item = BATCH_QUEUE.find(i => i.id === id);
  if (!item?.blobUrl) return;
  const a = document.createElement('a');
  a.href     = item.blobUrl;
  a.download = item.dlName || `compressed_${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  S('DOWNLOAD');
}

function removeBatchItem(id) {
  const idx  = BATCH_QUEUE.findIndex(i => i.id === id);
  if (idx === -1) return;
  const item = BATCH_QUEUE[idx];
  _deletedStack.push({ item, idx });
  if (_deletedStack.length > 5) _deletedStack.shift();
  BATCH_QUEUE.splice(idx, 1);
  renderBatchQueue();
  updateBatchControls();
  showUndoBar(item.file.name);

  if (BATCH_QUEUE.length === 0 && FILE) {
    FILE = null; STEM = ''; updateActionState();
  }
}

function retryBatchItem(id) {
  const item = BATCH_QUEUE.find(i => i.id === id);
  if (!item) return;
  item.status = 'pending';
  item.error  = null;
  renderBatchQueue();
  updateBatchControls();
}

async function downloadBatchZip() {
  // Use JSZip-powered version
  await downloadBatchZipJSZip();
}

// Drag-to-reorder batch
function batchDragStart(e, id) { _dragSrcId = id; e.currentTarget.classList.add('dragging'); }
function batchDragEnd(e)       { e.currentTarget.classList.remove('dragging'); document.querySelectorAll('.cp-batch-item.drag-target').forEach(el => el.classList.remove('drag-target')); }
function batchDragOver(e)      { e.preventDefault(); e.currentTarget.classList.add('drag-target'); }
function batchDrop(e, id) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-target');
  if (!_dragSrcId || _dragSrcId === id) return;
  const srcIdx = BATCH_QUEUE.findIndex(i => i.id === _dragSrcId);
  const dstIdx = BATCH_QUEUE.findIndex(i => i.id === id);
  if (srcIdx === -1 || dstIdx === -1) return;
  const [moved] = BATCH_QUEUE.splice(srcIdx, 1);
  BATCH_QUEUE.splice(dstIdx, 0, moved);
  renderBatchQueue();
  _dragSrcId = null;
}

/* ════════════════════════════════════════════════════════════════════════════
   UNDO BAR
════════════════════════════════════════════════════════════════════════════ */
let _undoTimer = null;
function showUndoBar(filename) {
  const bar  = $('cpUndoBar');
  const text = $('cpUndoText');
  if (!bar) return;
  if (text) text.textContent = `"${filename}" removed`;
  bar.removeAttribute('hidden');
  if (_undoTimer) clearTimeout(_undoTimer);
  _undoTimer = setTimeout(hideUndoBar, 4500);
}
function hideUndoBar() {
  const bar = $('cpUndoBar');
  if (bar) bar.setAttribute('hidden', '');
  if (_undoTimer) { clearTimeout(_undoTimer); _undoTimer = null; }
}
function undoLastDelete() {
  if (_deletedStack.length === 0) return;
  const { item, idx } = _deletedStack.pop();
  BATCH_QUEUE.splice(idx, 0, item);
  renderBatchQueue();
  updateBatchControls();
  hideUndoBar();
  toast('Restored', item.file.name, 'success', 2000);
}

/* ════════════════════════════════════════════════════════════════════════════
   HISTORY
════════════════════════════════════════════════════════════════════════════ */
function loadHistory() {
  try {
    const raw = lsGet(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function saveHistory(entry) {
  try {
    const hist = loadHistory();
    hist.unshift(entry);
    if (hist.length > HISTORY_MAX) hist.splice(HISTORY_MAX);
    lsSet(HISTORY_KEY, JSON.stringify(hist));
    renderHistory();
    const cnt = $('historyCount');
    if (cnt) cnt.textContent = hist.length;
  } catch {}
}

function renderHistory() {
  const list = $('histList');
  if (!list) return;
  const hist = loadHistory();

  if (hist.length === 0) {
    list.innerHTML = `<div class="cp-hist-empty"><i class="fa fa-inbox"></i>No compressions yet.</div>`;
    return;
  }

  list.innerHTML = hist.map((h, i) => {
    const gradeColor = GRADE_COLORS[h.grade] || '#6366f1';
    const gradeBg    = GRADE_BG[h.grade]     || 'rgba(99,102,241,.2)';
    const date       = new Date(h.ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const preset     = PRESET_INFO[h.preset];
    return `
    <div class="cp-hist-item" role="listitem">
      <div class="cp-hist-grade-badge" style="background:${gradeBg};color:${gradeColor}">${h.grade}</div>
      <div class="cp-hist-item-info">
        <div class="cp-hist-item-name" title="${h.name}">${h.name}</div>
        <div class="cp-hist-item-meta">
          <span>${fmtBytes(h.inSize)} → ${fmtBytes(h.outSize)}</span>
          <span>${preset?.emoji || ''} ${h.preset}</span>
          <span>${date}</span>
        </div>
      </div>
      <div class="cp-hist-item-pct">${h.reduction.toFixed(0)}%</div>
      <button class="cp-hist-item-del" onclick="deleteHistoryItem(${i})" title="Delete" aria-label="Delete history item">
        <i class="fa fa-times" aria-hidden="true"></i>
      </button>
    </div>`;
  }).join('');
}

function deleteHistoryItem(idx) {
  const hist = loadHistory();
  hist.splice(idx, 1);
  lsSet(HISTORY_KEY, JSON.stringify(hist));
  renderHistory();
  const cnt = $('historyCount');
  if (cnt) cnt.textContent = hist.length;
}

function clearHistory() {
  lsDel(HISTORY_KEY);
  renderHistory();
  const cnt = $('historyCount');
  if (cnt) cnt.textContent = '0';
  toast('History cleared', '', 'info', 2000);
}

function toggleHistory() {
  const panel = $('historyPanel');
  if (!panel) return;
  const isHidden = panel.hasAttribute('hidden');
  if (isHidden) {
    panel.removeAttribute('hidden');
    renderHistory();
  } else {
    panel.setAttribute('hidden', '');
  }
  S('CLICK');
}

function renderLeaderboard() {
  const tbody = $('lbBody');
  if (!tbody) return;
  const hist = loadHistory().slice().sort((a, b) => b.reduction - a.reduction).slice(0, 10);
  tbody.innerHTML = hist.map((h, i) =>
    `<tr>
      <td>${i + 1}</td>
      <td title="${h.name}">${h.name.slice(0, 20)}${h.name.length > 20 ? '…' : ''}</td>
      <td style="color:var(--green);font-weight:700">${h.reduction.toFixed(1)}%</td>
      <td style="color:var(--t4);font-size:.7rem">${h.engine}</td>
      <td style="color:${GRADE_COLORS[h.grade] || 'var(--em3)'}"><strong>${h.grade}</strong></td>
    </tr>`
  ).join('');
}

function exportHistoryCsv() {
  const hist = loadHistory();
  if (!hist.length) { toast('No history', 'Nothing to export', 'warn', 2000); return; }
  const header = 'Name,Stem,Original(bytes),Compressed(bytes),Reduction(%),Preset,Engine,Grade,Score,Time(ms),Fingerprint,Date\n';
  const rows   = hist.map(h =>
    `"${h.name}","${h.stem}",${h.inSize},${h.outSize},${h.reduction.toFixed(2)},"${h.preset}","${h.engine}","${h.grade}",${h.score},${h.procMs},"${h.fingerprint || ''}","${new Date(h.ts).toISOString()}"`
  ).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
  _triggerBlobDownload(blob, 'ishutools_compress_history.csv');
  toast('CSV exported', '', 'success', 2000);
}

function exportHistoryJson() {
  const hist = loadHistory();
  if (!hist.length) { toast('No history', 'Nothing to export', 'warn', 2000); return; }
  const blob = new Blob([JSON.stringify(hist, null, 2)], { type: 'application/json' });
  _triggerBlobDownload(blob, 'ishutools_compress_history.json');
  toast('JSON exported', '', 'success', 2000);
}

/* ════════════════════════════════════════════════════════════════════════════
   SCROLL TOP
════════════════════════════════════════════════════════════════════════════ */
function initScrollTop() {
  const btn = $('scrollTop');
  if (!btn) return;
  window.addEventListener('scroll', debounce(() => {
    btn.classList.toggle('visible', window.scrollY > 400);

    // Nav scrolled class
    const nav = $('cpNav');
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 10);
  }, 50));
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    S('CLICK');
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   FAQ ACCORDION
════════════════════════════════════════════════════════════════════════════ */
function initFaq() {
  document.querySelectorAll('.cp-faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const isOpen  = btn.getAttribute('aria-expanded') === 'true';
      const item    = btn.closest('.cp-faq-item');
      const answer  = btn.nextElementSibling;
      const chevron = btn.querySelector('.cp-faq-chevron');

      // Close all others (accordion behavior)
      if (!isOpen) {
        document.querySelectorAll('.cp-faq-item.open').forEach(otherItem => {
          if (otherItem !== item) {
            const otherBtn = otherItem.querySelector('.cp-faq-q');
            const otherAns = otherItem.querySelector('.cp-faq-a');
            if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
            if (otherAns) otherAns.setAttribute('hidden', '');
            otherItem.classList.remove('open');
          }
        });
      }

      btn.setAttribute('aria-expanded', String(!isOpen));
      if (item) item.classList.toggle('open', !isOpen);
      if (answer) {
        if (isOpen) answer.setAttribute('hidden', '');
        else        answer.removeAttribute('hidden');
      }
      if (chevron) {
        chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
      }

      // Smooth scroll to question if opening
      if (!isOpen && item) {
        setTimeout(() => item.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
      }
    });
  });

  // Open first FAQ item by default
  const firstQ   = document.querySelector('.cp-faq-q');
  const firstItem = firstQ?.closest('.cp-faq-item');
  const firstAns  = firstQ?.nextElementSibling;
  if (firstQ && firstItem && firstAns) {
    firstQ.setAttribute('aria-expanded', 'true');
    firstItem.classList.add('open');
    firstAns.removeAttribute('hidden');
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   SCROLL REVEAL (y-only — NEVER opacity:0)
════════════════════════════════════════════════════════════════════════════ */
function initScrollReveal() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.cp-reveal').forEach(el => el.classList.add('revealed'));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('revealed');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.cp-reveal').forEach(el => io.observe(el));
}

/* ════════════════════════════════════════════════════════════════════════════
   COUNTER ANIMATIONS
════════════════════════════════════════════════════════════════════════════ */
function initCounters() {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el     = e.target;
      const target = parseFloat(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      if (isNaN(target)) return;
      io.unobserve(el);
      if (_reduced) { el.textContent = target + suffix; return; }
      animateCounter(el, 0, target, 1500, v => Math.round(v) + suffix);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count]').forEach(el => io.observe(el));
}

/* ════════════════════════════════════════════════════════════════════════════
   GLOW CARDS
════════════════════════════════════════════════════════════════════════════ */
function initGlowCards() {
  document.querySelectorAll('.cp-glow-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width  * 100).toFixed(1);
      const y = ((e.clientY - r.top)  / r.height * 100).toFixed(1);
      card.style.setProperty('--mx', x + '%');
      card.style.setProperty('--my', y + '%');
    });
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   MARQUEE
════════════════════════════════════════════════════════════════════════════ */
function initMarquee() {
  document.querySelectorAll('.cp-marquee-row').forEach(row => {
    if (row.getAttribute('aria-hidden') === 'true') return;
    const clone = row.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.style.animationDelay = '-12.5s';
    row.parentElement?.appendChild(clone);
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
════════════════════════════════════════════════════════════════════════════ */
function initKeyboard() {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName?.toLowerCase() || '';
    if (['input', 'textarea', 'select'].includes(tag)) return;

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'Enter') { e.preventDefault(); if (FILE && !BATCH_ACTIVE) doCompress(); return; }
      if (e.key === 'o' || e.key === 'O') { e.preventDefault(); D?.fileInput?.click(); return; }
      if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undoLastDelete(); return; }
      return;
    }

    switch (e.key) {
      case 'Escape':
        if ($('cp-shortcuts-modal')?.style.display === 'flex') { closeShortcutsModal(); return; }
        if (!$('historyPanel')?.hasAttribute('hidden'))         { toggleHistory(); return; }
        if (!$('batchPanel')?.hasAttribute('hidden'))           { $('batchPanel').setAttribute('hidden', ''); return; }
        if (!COMPRESS_DONE && D?.progressWrap && !D.progressWrap.hasAttribute('hidden')) { cancelCompress(); return; }
        break;
      case 'h': case 'H': toggleHistory(); break;
      case 'r': case 'R': if (!BATCH_ACTIVE) resetTool(); break;
      case 't': case 'T': toggleTheme(); break;
      case 's': case 'S': toggleSound(); break;
      case '?': showShortcutsModal(); break;
      case 'b': case 'B': { const bp = $('batchPanel'); if (bp) bp.toggleAttribute('hidden'); break; }
      case 'p': case 'P': {
        const idx  = PRESET_ORDER.indexOf(_currentPreset);
        const next = PRESET_ORDER[(idx + 1) % PRESET_ORDER.length];
        selectPreset(next);
        break;
      }
      case 'i': case 'I': {
        if (ANALYSIS_DATA) {
          const ct   = ANALYSIS_DATA.content_type || 'mixed';
          const pg   = ANALYSIS_DATA.page_count   || '?';
          const sc   = ANALYSIS_DATA.compressibility_score ?? ANALYSIS_DATA.compressibility?.score ?? '?';
          toast('Analysis Info', `${pg} pages · ${ct} · ${sc}% compressible`, 'info', 5000);
        } else {
          toast('No analysis', 'Upload a file first', 'info', 2000);
        }
        break;
      }
      case 'ArrowUp': {
        const idx = PRESET_ORDER.indexOf(_currentPreset);
        if (idx > 0) selectPreset(PRESET_ORDER[idx - 1]);
        break;
      }
      case 'ArrowDown': {
        const idx = PRESET_ORDER.indexOf(_currentPreset);
        if (idx < PRESET_ORDER.length - 1) selectPreset(PRESET_ORDER[idx + 1]);
        break;
      }
    }
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   SHORTCUTS MODAL
════════════════════════════════════════════════════════════════════════════ */
function showShortcutsModal() {
  const modal = $('cp-shortcuts-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  modal.focus();
  S('CLICK');
}
function closeShortcutsModal() {
  const modal = $('cp-shortcuts-modal');
  if (!modal) return;
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
}

/* ════════════════════════════════════════════════════════════════════════════
   TARGET SIZE HELPER
════════════════════════════════════════════════════════════════════════════ */
function initTargetSize() {
  // Already wired via setTargetKb onclick in HTML
}

/* ════════════════════════════════════════════════════════════════════════════
   DOM INITIALIZATION — ALL LISTENERS HERE
════════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  // Populate DOM refs
  D = {
    dropZone:     $('dropZone'),
    fileInput:    $('fileInput'),
    fileInfo:     $('fileInfo'),
    toolZone:     $('toolZone'),
    compressBtn:  $('compressBtn'),
    resetBtn:     $('resetBtn'),
    cancelBtn:    $('cancelBtn'),
    progressWrap: $('progressWrap'),
    resultWrap:   $('resultWrap'),
    advToggle:    $('advToggle'),
    advOpts:      $('advOpts'),
    advCount:     $('advCount'),
    actionsRow:   $('actionsRow'),
  };

  // Initialize modules
  initTheme();
  initSoundToggle();
  initBgCanvas();
  initDropZone();
  initAdvOpts();
  initTargetSize();
  initScrollTop();
  initFaq();
  initScrollReveal();
  initCounters();
  initGlowCards();
  initKeyboard();
  initMarquee();

  // Select default preset + update guarantee strip
  selectPreset('medium');

  // Wire compress button
  if (D.compressBtn) D.compressBtn.addEventListener('click', doCompress);
  if (D.resetBtn)    D.resetBtn.addEventListener('click',    resetTool);
  if (D.cancelBtn)   D.cancelBtn.addEventListener('click',   cancelCompress);

  // Remove file button
  const fiRemove = $('fiRemove');
  if (fiRemove) fiRemove.addEventListener('click', removeFile);

  // History
  const histBtn = $('historyBtn');
  if (histBtn) histBtn.addEventListener('click', () => { toggleHistory(); });

  const clearHistBtn = $('clearHistBtn');
  if (clearHistBtn) clearHistBtn.addEventListener('click', clearHistory);

  const lbBtn = $('cpHistLbBtn');
  if (lbBtn) lbBtn.addEventListener('click', () => {
    const lb = $('cpHistLeaderboard');
    if (!lb) return;
    lb.toggleAttribute('hidden', !lb.hasAttribute('hidden'));
    if (!lb.hasAttribute('hidden')) renderLeaderboard();
    S('CLICK');
  });

  const csvBtn  = $('cpExportCsvBtn');
  const jsonBtn = $('cpExportJsonBtn');
  if (csvBtn)  csvBtn.addEventListener('click',  exportHistoryCsv);
  if (jsonBtn) jsonBtn.addEventListener('click', exportHistoryJson);

  // Result actions
  const dlBtn = $('downloadBtn');
  if (dlBtn) dlBtn.addEventListener('click', triggerDownload);

  const shareBtn = $('shareBtn');
  if (shareBtn) shareBtn.addEventListener('click', shareResult);

  const copyBtn = $('copyReportBtn');
  if (copyBtn) copyBtn.addEventListener('click', copyReport);

  const againBtn = $('compressAgainBtn');
  if (againBtn) againBtn.addEventListener('click', () => {
    if (D.resultWrap) D.resultWrap.setAttribute('hidden', '');
    updateActionState();
    S('CLICK');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Theme & sound
  const themeToggle = $('themeToggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  const soundToggle = $('soundToggle');
  if (soundToggle) soundToggle.addEventListener('click', toggleSound);

  // Shortcuts modal
  const shortcutsBtn = $('shortcutsBtn');
  if (shortcutsBtn) shortcutsBtn.addEventListener('click', showShortcutsModal);

  const closeShortcuts = $('closeShortcuts');
  if (closeShortcuts) closeShortcuts.addEventListener('click', closeShortcutsModal);

  const scModal = $('cp-shortcuts-modal');
  if (scModal) {
    scModal.addEventListener('click', e => { if (e.target === scModal) closeShortcutsModal(); });
    scModal.addEventListener('keydown', e => { if (e.key === 'Escape') closeShortcutsModal(); });
  }

  // FAB
  const fab = $('cpFab');
  if (fab) fab.addEventListener('click', () => {
    if (FILE) doCompress();
    else D?.fileInput?.click();
  });

  // Batch actions
  const batchRunBtn = $('batchRunBtn');
  if (batchRunBtn) batchRunBtn.addEventListener('click', runBatchCompression);

  const zipBtn = $('batchZipBtn');
  if (zipBtn) zipBtn.addEventListener('click', downloadBatchZip);

  const addMoreBtn = $('addMoreBtn');
  if (addMoreBtn) addMoreBtn.addEventListener('click', () => D?.fileInput?.click());

  // Undo bar
  const undoBtn = $('cpUndoBtn');
  if (undoBtn) undoBtn.addEventListener('click', undoLastDelete);

  const undoDismiss = $('cpUndoDismiss');
  if (undoDismiss) undoDismiss.addEventListener('click', hideUndoBar);

  // Paste PDF support
  document.addEventListener('paste', e => {
    if (['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) return;
    const items   = [...(e.clipboardData?.items || [])];
    const pdfItem = items.find(it => it.type === 'application/pdf');
    if (pdfItem) {
      const f = pdfItem.getAsFile();
      if (f) {
        handleFiles([f]);
        toast('PDF pasted!', f.name, 'info', 2500);
      }
    }
  });

  // Initial history badge
  const hist = loadHistory();
  const cnt  = $('historyCount');
  if (cnt) cnt.textContent = hist.length;

  // Initial action state
  updateActionState();
  updateDownloadFilenamePreview();

  // Welcome toast
  setTimeout(() => {
    toast(
      '🗜️ IshuTools PDF Compressor',
      '12-engine pipeline · No size limit · True Lossless mode · 100% free — by Ishu Kumar (ISHUKR41)',
      'info',
      5000
    );
  }, 1200);

}); // DOMContentLoaded

/* ════════════════════════════════════════════════════════════════════════════
   WINDOW GLOBAL EXPORTS (for onclick attributes in HTML)
════════════════════════════════════════════════════════════════════════════ */
window.doCompress           = doCompress;
window.resetTool            = resetTool;
window.downloadBatchZipJSZip = downloadBatchZipJSZip;
window.hideStickyDlBar      = hideStickyDlBar;
window.cancelCompress       = cancelCompress;
window.triggerDownload      = triggerDownload;
window.shareResult          = shareResult;
window.copyReport           = copyReport;
window.copyFingerprint      = copyFingerprint;
window.downloadBatchZip     = downloadBatchZip;
window.downloadBatchItem    = downloadBatchItem;
window.removeBatchItem      = removeBatchItem;
window.retryBatchItem       = retryBatchItem;
window.runBatchCompression  = runBatchCompression;
window.toggleHistory        = toggleHistory;
window.clearHistory         = clearHistory;
window.deleteHistoryItem    = deleteHistoryItem;
window.showShortcutsModal   = showShortcutsModal;
window.closeShortcutsModal  = closeShortcutsModal;
window.selectPreset         = selectPreset;
window.applyRecommendation  = applyRecommendation;
window.toggleTheme          = toggleTheme;
window.toggleSound          = toggleSound;
window.undoLastDelete       = undoLastDelete;
window.setTargetKb          = setTargetKb;
window.batchDragStart       = batchDragStart;
window.batchDragEnd         = batchDragEnd;
window.batchDragOver        = batchDragOver;
window.batchDrop            = batchDrop;
