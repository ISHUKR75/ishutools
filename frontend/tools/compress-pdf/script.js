/**
 * ════════════════════════════════════════════════════════════════════════════════
 * IshuTools.fun — Compress PDF — script.js v60.0 MEGA EDITION
 * Author   : Ishu Kumar (ISHUKR41 / ISHUKR75)
 * Website  : https://ishutools.fun
 * GitHub   : https://github.com/ISHUKR41 | https://github.com/ISHUKR75
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURE OVERVIEW
 * ─────────────────────
 *  § 01  Constants & config
 *  § 02  Module-scope state
 *  § 03  Utility functions (format, math, ID, fingerprint)
 *  § 04  Sound system  (6 MP3 files from sounds/ folder)
 *  § 05  Theme (dark/light toggle + system preference)
 *  § 06  Accessibility (ARIA live region, sr-announce)
 *  § 07  Background animated canvas
 *  § 08  Toast notification system (4 types, queue, stacking)
 *  § 09  Drop zone (click, drag, keyboard, full-page overlay)
 *  § 10  File handling (single + batch mode)
 *  § 11  Preset management (5 presets, quality guarantee strip)
 *  § 12  Advanced options (13 toggles + password + target KB)
 *  § 13  SSE progress stream + simulated progress fallback
 *  § 14  Main compression (doCompress — bulletproof)
 *  § 15  Result display (animated counters, donut chart, grade)
 *  § 16  Download (fahhhhh sound, correct filename)
 *  § 17  Clipboard paste support
 *  § 18  Batch mode (queue, stats, zip download)
 *  § 19  History (localStorage, export CSV/JSON, leaderboard)
 *  § 20  Deep PDF analysis (page count, images, fonts, OCR flag)
 *  § 21  Benchmark panel (per-preset estimates after upload)
 *  § 22  Comparison slider (before/after visual)
 *  § 23  Analytics mini panel (page/image/font chips)
 *  § 24  Confetti launcher (canvas-confetti)
 *  § 25  FAQ accordion
 *  § 26  Scroll reveal (y-translate only — opacity always 1)
 *  § 27  Counters (animated on scroll into view)
 *  § 28  Marquee / ticker strip
 *  § 29  Keyboard shortcuts (1-5 presets, D=download, Ctrl+Enter)
 *  § 30  Scroll-to-top button
 *  § 31  Mobile FAB button
 *  § 32  History leaderboard
 *  § 33  Export history CSV + JSON
 *  § 34  Copy report to clipboard
 *  § 35  Share result (Web Share API)
 *  § 36  Quality guarantee tooltip
 *  § 37  Download filename preview
 *  § 38  Sound toggle (localStorage persist)
 *  § 39  DOMContentLoaded — all wiring here
 *
 * QUALITY GUARANTEE ENFORCEMENT
 * ─────────────────────────────
 *  lossless → backend: pikepdf + qpdf + content-stream only. NO image resample.
 *  high     → backend: pikepdf + qpdf + mutool. NO DPI reduction. NO GS.
 *  medium   → GS ebook + fitz image-only + pikepdf + qpdf (images may resample slightly)
 *  low      → aggressive GS + fitz full + pikepdf (96 DPI)
 *  screen   → maximum GS /screen + fitz full (72 DPI) — smallest file
 *
 * SOUND MAP (from sounds/sounds.js window.SOUNDS global)
 * ───────────────────────────────────────────────────────
 *  fahhhhh              → download (ALWAYS on download button click)
 *  waah_kya_scene_hai   → compression success + preset select
 *  are_bhai_bhai_bhai   → file added
 *  cameraman_focus_karo → compression started
 *  eh_eh_eh_ehhhhhh     → error
 *  jaldi_waha_sa_hato   → cancel / warning / reset
 *
 * DOWNLOAD FILENAME
 * ─────────────────
 *  Always: {original_filename_stem}_compressed.pdf
 *  e.g. "Annual Report 2025.pdf" → "Annual Report 2025_compressed.pdf"
 *
 * ════════════════════════════════════════════════════════════════════════════════
 */

'use strict';

/* ─── § 01  CONSTANTS & CONFIG ──────────────────────────────────────────────── */

const PRESET_INFO = {
  lossless: {
    name: 'Lossless', emoji: '🔮', label: '2–25% saved',
    color: '#a78bfa', glow: 'rgba(167,139,250,.35)',
    gradient: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
    guarantee: { lossless: true, noDpi: true, noGray: true },
    description: 'Zero quality loss. pikepdf DEFLATE-9 streams only. No image resampling. Legal & archival safe.',
    engines: ['pikepdf-lossless','qpdf','content-stream','mutool'],
    tipSave: '2–25%',
  },
  high: {
    name: 'High', emoji: '💎', label: '10–40% saved',
    color: '#60a5fa', glow: 'rgba(96,165,250,.35)',
    gradient: 'linear-gradient(135deg,#2563eb,#0891b2)',
    guarantee: { lossless: false, noDpi: true, noGray: true },
    description: 'Near-lossless. No DPI downsampling. No GS image pass. Great for professional documents.',
    engines: ['pikepdf-lossless','qpdf','mutool','content-stream'],
    tipSave: '10–40%',
  },
  medium: {
    name: 'Medium', emoji: '⚖️', label: '40–65% saved',
    color: '#6366f1', glow: 'rgba(99,102,241,.35)',
    gradient: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    guarantee: { lossless: false, noDpi: false, noGray: true },
    description: 'Best balance. Recommended for most files. GS ebook + pikepdf + fitz image pass.',
    engines: ['ghostscript','pikepdf-lossless','fitz-image','qpdf'],
    tipSave: '40–65%',
  },
  low: {
    name: 'Low', emoji: '📧', label: '55–78% saved',
    color: '#f59e0b', glow: 'rgba(245,158,11,.35)',
    gradient: 'linear-gradient(135deg,#d97706,#dc2626)',
    guarantee: { lossless: false, noDpi: false, noGray: true },
    description: 'Aggressive compression. 96 DPI images. Great for email, WhatsApp, messaging apps.',
    engines: ['ghostscript','fitz-full','pikepdf-lossless','qpdf'],
    tipSave: '55–78%',
  },
  screen: {
    name: 'Screen', emoji: '🔥', label: '75–92% saved',
    color: '#ef4444', glow: 'rgba(239,68,68,.35)',
    gradient: 'linear-gradient(135deg,#dc2626,#9a3412)',
    guarantee: { lossless: false, noDpi: false, noGray: true },
    description: 'Maximum compression. 72 DPI. Ghostscript /screen preset. Smallest possible file.',
    engines: ['ghostscript-screen','fitz-full','pikepdf-lossless'],
    tipSave: '75–92%',
  },
};

const PROGRESS_STAGES = [
  { pct: 0,  label: 'Initialising',     sub: 'Loading 12 engines',            icon: 'fa-cog' },
  { pct: 10, label: 'Lossless pass',    sub: 'pikepdf DEFLATE-9 recompression', icon: 'fa-layer-group' },
  { pct: 25, label: 'Stream compress',  sub: 'qpdf + content-stream optimizer', icon: 'fa-wave-square' },
  { pct: 45, label: 'Image pass',       sub: 'Ghostscript + fitz image engine', icon: 'fa-image' },
  { pct: 65, label: 'Post-processing',  sub: 'Dedup + linearize + font subset', icon: 'fa-magic' },
  { pct: 82, label: 'Quality check',    sub: 'Verifying output integrity',      icon: 'fa-shield-alt' },
  { pct: 95, label: 'Finalising',       sub: 'Computing quality score',         icon: 'fa-check-circle' },
  { pct: 100, label: 'Done!',           sub: 'Compression complete',            icon: 'fa-trophy' },
];

const GRADE_COLORS = {
  'A+': '#22c55e', 'A': '#4ade80', 'A-': '#86efac',
  'B+': '#6366f1', 'B': '#818cf8', 'B-': '#a5b4fc',
  'C+': '#f59e0b', 'C': '#fbbf24', 'C-': '#fde68a',
  'D':  '#ef4444', 'F': '#dc2626',
};

const GRADE_BG = {
  'A+': 'linear-gradient(135deg,#16a34a,#15803d)',
  'A':  'linear-gradient(135deg,#22c55e,#16a34a)',
  'A-': 'linear-gradient(135deg,#4ade80,#22c55e)',
  'B+': 'linear-gradient(135deg,#4f46e5,#6366f1)',
  'B':  'linear-gradient(135deg,#6366f1,#818cf8)',
  'B-': 'linear-gradient(135deg,#818cf8,#a5b4fc)',
  'C+': 'linear-gradient(135deg,#d97706,#f59e0b)',
  'C':  'linear-gradient(135deg,#f59e0b,#fbbf24)',
  'C-': 'linear-gradient(135deg,#fbbf24,#fde68a)',
  'D':  'linear-gradient(135deg,#dc2626,#ef4444)',
  'F':  'linear-gradient(135deg,#991b1b,#dc2626)',
};

const HISTORY_KEY = 'ishu-compress-history-v6';
const HISTORY_MAX = 50;
const THEME_KEY   = 'ishu-theme-v2';
const SOUND_KEY   = 'ishu-sounds-v3';

/* ─── § 02  MODULE-SCOPE STATE ──────────────────────────────────────────────── */

let FILE           = null;     // Current single file (File object)
let STEM           = '';        // Exact original filename stem (no extension)
let JOB_ID         = '';
let SSE_SOURCE     = null;
let SSE_TIMER      = null;
let COMPRESS_DONE  = false;
let RESULT_DATA    = null;
let ANALYSIS_DATA  = null;
let BATCH_ACTIVE   = false;
let BATCH_QUEUE    = [];        // [{id, file, status, result, blobUrl, pct}]
let BATCH_IDX      = 0;
let _currentPreset = 'medium';
let _recommendPreset = null;
let _t0            = 0;
let _timerInterval = null;
let _simInterval   = null;
let _bgCanvas      = null;
let _bgCtx         = null;
let _bgParticles   = [];
let _dragSrcId     = null;
let _deletedStack  = [];        // For undo-delete in batch
let _reduced       = false;
let _confettiLoaded = false;

// DOM refs — ALL populated inside DOMContentLoaded
let D = null;

/* ─── § 03  UTILITY FUNCTIONS ───────────────────────────────────────────────── */

/** Shorthand getElementById */
function $(id) { return document.getElementById(id); }

/** Clamp a number between min and max */
function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

/** Format bytes to human-readable */
function fmtBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const b = Math.abs(bytes);
  if (b < 1024)        return b + ' B';
  if (b < 1048576)     return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824)  return (b / 1048576).toFixed(2) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

/** Format milliseconds to readable string */
function fmtMs(ms) {
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

/** Format elapsed seconds */
function fmtElapsed(s) {
  if (s < 60) return s.toFixed(1) + 's';
  return Math.floor(s / 60) + 'm ' + Math.floor(s % 60) + 's';
}

/** Format a Date to readable string */
function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return new Date(ts).toLocaleString(); }
}

/** Compute reduction percentage */
function calcReduction(inSize, outSize) {
  if (!inSize || inSize <= 0) return 0;
  const r = ((inSize - outSize) / inSize) * 100;
  return Math.max(0, Math.min(100, r));
}

/** Get filename stem (no extension) — preserves spaces and special chars */
function getStem(filename) {
  if (!filename) return 'compressed';
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(0, dot) : filename;
}

/** Generate a random job/session ID */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Generate a compression fingerprint (deterministic from result) */
function generateFingerprint(inSize, outSize, engine, preset, ms) {
  const s = `${inSize}-${outSize}-${engine}-${preset}-${ms}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return 'CP-' + Math.abs(h).toString(16).toUpperCase().padStart(8, '0');
}

/** Suggest a preset based on file size */
function getSuggestedPreset(bytes) {
  if (bytes > 50 * 1024 * 1024)  return 'screen';   // >50MB
  if (bytes > 20 * 1024 * 1024)  return 'low';       // >20MB
  if (bytes > 5  * 1024 * 1024)  return 'medium';    // >5MB
  if (bytes > 1  * 1024 * 1024)  return 'medium';    // >1MB
  return 'high';                                       // ≤1MB — probably already small
}

/** Animate a counter from start to end value */
function animateCounter(el, start, end, durationMs, fmt) {
  if (!el) return;
  if (_reduced) { el.textContent = fmt ? fmt(end) : end; return; }
  const step = (end - start) / (durationMs / 16);
  let cur = start;
  const tick = () => {
    cur += step;
    if ((step > 0 && cur >= end) || (step < 0 && cur <= end)) {
      el.textContent = fmt ? fmt(end) : end;
      return;
    }
    el.textContent = fmt ? fmt(cur) : Math.round(cur);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Debounce a function */
function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

/** Read file as ArrayBuffer (async) */
function readAsBuffer(file, maxBytes) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('FileReader error'));
    if (maxBytes && file.size > maxBytes) {
      reader.readAsArrayBuffer(file.slice(0, maxBytes));
    } else {
      reader.readAsArrayBuffer(file);
    }
  });
}

/** Quick-count PDF pages from raw bytes */
async function quickCountPages(file) {
  try {
    const buf  = await readAsBuffer(file, 200000);
    const text = new TextDecoder('latin1').decode(buf);
    const m    = text.match(/\/Type\s*\/Page[^s]/g);
    if (m) return m.length;
    // Fallback: count /Page in last 4KB
    const tail  = new TextDecoder('latin1').decode(buf.slice(-4096));
    const pages = tail.match(/\/Count\s+(\d+)/);
    if (pages) return parseInt(pages[1], 10);
    return 0;
  } catch { return 0; }
}

/** Safe localStorage get */
function lsGet(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
  catch { return fallback; }
}

/** Safe localStorage set */
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

/** Simple deep clone */
function deepClone(obj) {
  try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; }
}

/* ─── § 04  SOUND SYSTEM ─────────────────────────────────────────────────────── */

/** Play a sound via window.SOUNDS (loaded by sounds/sounds.js) */
function S(key) {
  try {
    if (window.SOUNDS && typeof window.SOUNDS.play === 'function') {
      window.SOUNDS.play(key);
    }
  } catch (_) {}
}

/* Sound aliases matching SND keys */
const SND = {
  DOWNLOAD: 'fahhhhh',
  SUCCESS:  'waah_kya_scene_hai',
  FILE_ADD: 'are_bhai_bhai_bhai',
  START:    'cameraman_focus_karo',
  ERROR:    'eh_eh_eh_ehhhhhh',
  CANCEL:   'jaldi_waha_sa_hato',
  CLICK:    'click',
  WARNING:  'jaldi_waha_sa_hato',
};

/* ─── § 05  THEME ────────────────────────────────────────────────────────────── */

function initTheme() {
  const saved = lsGet(THEME_KEY, null);
  const html  = document.documentElement;
  const applyTheme = t => {
    html.setAttribute('data-theme', t);
    const btn = $('themeToggle');
    if (btn) {
      const icon = btn.querySelector('i');
      if (icon) icon.className = t === 'dark' ? 'fa fa-sun' : 'fa fa-moon';
      btn.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      btn.setAttribute('title', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
  };
  const currentTheme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(currentTheme);

  const btn = $('themeToggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      lsSet(THEME_KEY, next);
      S(SND.CLICK);
    });
  }
}

/* ─── § 06  ACCESSIBILITY ────────────────────────────────────────────────────── */

function announce(msg, politeness = 'polite') {
  try {
    let el = $('cp-sr-announce');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cp-sr-announce';
      el.setAttribute('aria-live', politeness);
      el.setAttribute('aria-atomic', 'true');
      el.className = 'sr-only';
      document.body.appendChild(el);
    }
    el.textContent = '';
    setTimeout(() => { el.textContent = msg; }, 50);
  } catch {}
}

/* ─── § 07  BACKGROUND CANVAS ────────────────────────────────────────────────── */

function initBgCanvas() {
  if (_reduced) return;
  const canvas = $('bgCanvas');
  if (!canvas) return;
  _bgCanvas = canvas;
  _bgCtx    = canvas.getContext('2d');

  const resize = () => {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener('resize', debounce(resize, 150));

  const N = 40;
  _bgParticles = Array.from({ length: N }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: 0.5 + Math.random() * 1.5,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    alpha: 0.15 + Math.random() * 0.2,
    hue: 240 + Math.random() * 60,
  }));

  function draw() {
    if (!_bgCtx) return;
    _bgCtx.clearRect(0, 0, canvas.width, canvas.height);
    _bgParticles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0)  p.x = canvas.width;
      if (p.x > canvas.width)  p.x = 0;
      if (p.y < 0)  p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
      _bgCtx.beginPath();
      _bgCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      _bgCtx.fillStyle = `hsla(${p.hue},80%,70%,${p.alpha})`;
      _bgCtx.fill();
    });
    // Draw connection lines
    for (let i = 0; i < _bgParticles.length; i++) {
      for (let j = i + 1; j < _bgParticles.length; j++) {
        const dx  = _bgParticles[i].x - _bgParticles[j].x;
        const dy  = _bgParticles[i].y - _bgParticles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          _bgCtx.beginPath();
          _bgCtx.moveTo(_bgParticles[i].x, _bgParticles[i].y);
          _bgCtx.lineTo(_bgParticles[j].x, _bgParticles[j].y);
          _bgCtx.strokeStyle = `rgba(99,102,241,${0.06 * (1 - dist / 120)})`;
          _bgCtx.lineWidth = 0.5;
          _bgCtx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

/* ─── § 08  TOAST NOTIFICATION SYSTEM ───────────────────────────────────────── */

let _toastQueue = [];
let _toastActive = 0;
const TOAST_MAX  = 3;

function toast(title, msg, type = 'info', dur = 3500) {
  const container = $('toastContainer') || createToastContainer();

  const el = document.createElement('div');
  el.className = `cp-toast cp-toast-${type}`;
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', 'assertive');

  const iconMap = { info: 'fa-info-circle', success: 'fa-check-circle', warn: 'fa-exclamation-triangle', error: 'fa-times-circle' };
  el.innerHTML = `
    <i class="fa ${iconMap[type] || 'fa-info-circle'} cp-toast-icon" aria-hidden="true"></i>
    <div class="cp-toast-body">
      <div class="cp-toast-title">${title}</div>
      ${msg ? `<div class="cp-toast-msg">${msg}</div>` : ''}
    </div>
    <button class="cp-toast-close" aria-label="Dismiss notification" type="button">
      <i class="fa fa-times" aria-hidden="true"></i>
    </button>
  `;

  const dismiss = () => {
    el.classList.add('cp-toast-out');
    setTimeout(() => { el.remove(); _toastActive--; }, 350);
  };

  el.querySelector('.cp-toast-close').addEventListener('click', dismiss);

  if (_toastActive >= TOAST_MAX) {
    const oldest = container.querySelector('.cp-toast');
    if (oldest) { oldest.classList.add('cp-toast-out'); setTimeout(() => { oldest.remove(); _toastActive--; }, 350); }
  }

  container.appendChild(el);
  _toastActive++;
  setTimeout(() => requestAnimationFrame(() => el.classList.add('cp-toast-in')), 10);
  setTimeout(dismiss, dur);
  return el;
}

function createToastContainer() {
  const c = document.createElement('div');
  c.id = 'toastContainer';
  c.className = 'cp-toast-container';
  c.setAttribute('aria-label', 'Notifications');
  c.setAttribute('role', 'region');
  document.body.appendChild(c);
  return c;
}

/* ─── § 09  DROP ZONE ───────────────────────────────────────────────────────── */

function initDropZone() {
  if (!D) return;
  const dz = D.dropZone;
  if (!dz) return;

  /* ── Click to open file dialog ── */
  dz.addEventListener('click', e => {
    // If clicking the remove button, don't open file dialog
    if (e.target.closest('#fiRemove')) return;
    // If clicking the browse button, the browse button handler handles it
    if (e.target.closest('.cp-browse-btn')) return;
    // If file is already loaded, don't re-open unless clicking specific area
    if (!FILE) {
      if (D.fileInput) D.fileInput.click();
    }
  });

  /* ── Browse button ── */
  const browseBtn = dz.querySelector('.cp-browse-btn');
  if (browseBtn) {
    browseBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (D.fileInput) D.fileInput.click();
    });
  }

  /* ── Keyboard accessibility ── */
  dz.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && !FILE) {
      e.preventDefault();
      if (D.fileInput) D.fileInput.click();
    }
  });

  /* ── Drag & drop ── */
  dz.addEventListener('dragenter', e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragover',  e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', e => {
    if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag-over');
  });
  dz.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    dz.classList.remove('drag-over');
    const files = [...(e.dataTransfer?.files || [])].filter(isPdf);
    if (files.length) {
      handleFiles(files);
    } else {
      toast('Wrong File Type', 'Please drop a PDF file (.pdf)', 'error', 3500);
      S(SND.ERROR);
    }
  });

  /* ── File input change ── */
  if (D.fileInput) {
    D.fileInput.addEventListener('change', e => {
      const files = [...(e.target.files || [])].filter(isPdf);
      if (files.length) {
        handleFiles(files);
      } else if (e.target.files && e.target.files.length > 0) {
        toast('Wrong File Type', 'Only PDF files are supported', 'error', 3500);
        S(SND.ERROR);
      }
      e.target.value = '';
    });
  }

  /* ── Full-page drop overlay ── */
  initFullPageDrop();
}

function isPdf(f) {
  return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
}

function initFullPageDrop() {
  let dragCnt = 0;
  const overlay = $('cpFullDropOverlay');

  document.addEventListener('dragenter', e => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    dragCnt++;
    if (overlay) overlay.removeAttribute('hidden');
  });
  document.addEventListener('dragleave', e => {
    dragCnt = Math.max(0, dragCnt - 1);
    if (dragCnt === 0 && overlay) overlay.setAttribute('hidden', '');
  });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    dragCnt = 0;
    if (overlay) overlay.setAttribute('hidden', '');
    const files = [...(e.dataTransfer?.files || [])].filter(isPdf);
    if (files.length) handleFiles(files);
  });
}

/* ─── § 10  FILE HANDLING ────────────────────────────────────────────────────── */

function handleFiles(files) {
  if (!files || files.length === 0) return;

  if (files.length > 1) {
    // Batch mode
    files.forEach(f => addToBatch(f));
    const bp = $('batchPanel');
    if (bp) bp.removeAttribute('hidden');
    S(SND.FILE_ADD);
    toast('Batch Queue', `${files.length} files added to queue`, 'info', 3000);
    return;
  }

  // Single file mode
  const f = files[0];

  FILE = f;
  STEM = getStem(f.name);   // EXACT original stem — used for download filename
  RESULT_DATA  = null;
  ANALYSIS_DATA = null;
  COMPRESS_DONE = false;

  S(SND.FILE_ADD);

  renderFileInfo(f);
  updateActionState();
  updateDownloadFilenamePreview();

  // Also add to batch queue (so batch mode works too)
  if (BATCH_QUEUE.length === 0) {
    addToBatch(f, true); // silent
  }

  // Trigger analysis + benchmark after a short delay
  setTimeout(() => analyzeFile(f), 300);
  setTimeout(() => fetchBenchmark(f), 600);
  setTimeout(() => quickValidate(f), 150);

  // Suggest a preset
  const suggested = getSuggestedPreset(f.size);
  if (suggested !== _currentPreset && !RESULT_DATA) {
    setTimeout(() => {
      const pi = PRESET_INFO[suggested];
      toast(
        `💡 ${pi?.emoji} ${pi?.name} Recommended`,
        `This file (${fmtBytes(f.size)}) will benefit most from ${pi?.name} preset`,
        'info', 5000
      );
    }, 1200);
  }

  announce(`File added: ${f.name}, ${fmtBytes(f.size)}`);
}

function renderFileInfo(f) {
  const dz = D?.dropZone;
  if (dz) dz.classList.add('has-file');

  const emptyState = $('dropEmptyState');
  if (emptyState) emptyState.hidden = true;

  const fi = D?.fileInfo;
  if (!fi) return;
  fi.removeAttribute('hidden');

  const nameEl  = $('fiName');
  const sizeEl  = $('fiSize');
  const pagesEl = $('fiPages');

  if (nameEl)  nameEl.textContent  = f.name;
  if (sizeEl)  sizeEl.innerHTML    = `<i class="fa fa-database" aria-hidden="true"></i> ${fmtBytes(f.size)}`;
  if (pagesEl) pagesEl.innerHTML   = `<i class="fa fa-file-pdf" aria-hidden="true"></i> Counting…`;

  // Async page count
  quickCountPages(f).then(n => {
    if (pagesEl) pagesEl.innerHTML = `<i class="fa fa-file-pdf" aria-hidden="true"></i> ${n > 0 ? n + ' pages' : '—'}`;
  });
}

function removeFile() {
  FILE          = null;
  STEM          = '';
  RESULT_DATA   = null;
  ANALYSIS_DATA = null;
  COMPRESS_DONE = false;

  const dz = D?.dropZone;
  if (dz) dz.classList.remove('has-file');

  const fi = D?.fileInfo;
  if (fi) fi.setAttribute('hidden', '');

  const emptyState = $('dropEmptyState');
  if (emptyState) emptyState.hidden = false;

  hideAnalysis();
  hideEstimates();
  hideRecommend();
  hideBenchmark();

  if (D?.resultWrap) D.resultWrap.setAttribute('hidden', '');

  updateActionState();
  updateDownloadFilenamePreview();
  announce('File removed');
}

function resetTool() {
  S(SND.CANCEL);
  removeFile();
  BATCH_QUEUE = [];
  updateBatchUI();

  // Reset advanced options to defaults
  const defaults = {
    optGrayscale:       false,
    optStripMeta:       false,
    optRemoveAnnots:    false,
    optLinearize:       false,
    optRemoveJS:        false,
    optRemoveThumbs:    true,
    optRemoveEmbedded:  false,
    optSubsetFonts:     true,
    optDedup:           true,
    optFlatTrans:       false,
    optRemoveICC:       false,
    optRemoveForms:     false,
    optRemoveLinks:     false,
  };
  Object.entries(defaults).forEach(([id, val]) => {
    const el = $(id);
    if (el) el.checked = val;
  });
  const pwEl = $('optPassword');
  if (pwEl) pwEl.value = '';
  const tkEl = $('targetKbInput');
  if (tkEl) tkEl.value = '';

  // Collapse advanced options
  if (D?.advOpts) D.advOpts.setAttribute('hidden', '');
  if (D?.advToggle) D.advToggle.setAttribute('aria-expanded', 'false');

  updateAdvCount();
  selectPreset('medium');
  toast('Reset', 'Tool cleared — ready for a new file', 'info', 2000);
  announce('Tool reset');
}

/* ─── § 11  PRESET MANAGEMENT ───────────────────────────────────────────────── */

function selectPreset(preset) {
  if (!PRESET_INFO[preset]) return;
  _currentPreset = preset;

  // Update card states
  document.querySelectorAll('.cp-preset-card').forEach(card => {
    const isActive = card.dataset.preset === preset;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-checked', isActive ? 'true' : 'false');
    card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  // Update quality guarantee strip
  updateGuaranteeStrip(preset);
  updateDownloadFilenamePreview();

  // Highlight active estimate in benchmark
  document.querySelectorAll('.cp-estimate-item').forEach(item => {
    item.classList.toggle('active', item.dataset.preset === preset);
  });

  S(SND.SUCCESS);
  announce(`Preset changed to ${PRESET_INFO[preset].name}`);
}

function updateGuaranteeStrip(preset) {
  const cfg = PRESET_INFO[preset];
  if (!cfg) return;

  const strip  = $('qualityGuarantee');
  const lEl    = $('guaranteeLossless');
  const gEl    = $('guaranteeNoGray');
  const pEl    = $('guaranteePreset');

  if (lEl) {
    if (cfg.guarantee.lossless) {
      lEl.innerHTML = `<i class="fa fa-check" style="color:var(--green)"></i> Zero Quality Loss`;
      lEl.style.color = 'var(--green)';
    } else if (cfg.guarantee.noDpi) {
      lEl.innerHTML = `<i class="fa fa-check" style="color:var(--green)"></i> No DPI Downsample`;
      lEl.style.color = 'var(--green)';
    } else {
      lEl.innerHTML = `<i class="fa fa-times" style="color:var(--amber)"></i> DPI May Reduce`;
      lEl.style.color = 'var(--amber)';
    }
  }
  if (gEl) {
    gEl.innerHTML = `<i class="fa fa-check" style="color:var(--green)"></i> Color Preserved`;
    gEl.style.color = 'var(--green)';
  }
  if (pEl) {
    pEl.innerHTML = `<i class="fa fa-lock" style="color:var(--em3)"></i> ${cfg.emoji} ${cfg.name} Preset`;
    pEl.style.color = 'var(--em3)';
  }
}

/* ─── § 12  ADVANCED OPTIONS ─────────────────────────────────────────────────── */

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
    S(SND.CLICK);
  });

  panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateAdvCount);
  });
  updateAdvCount();
}

function updateAdvCount() {
  const panel = D?.advOpts;
  if (!panel) return;
  const defaults = {
    optRemoveThumbs: true, optSubsetFonts: true, optDedup: true,
  };
  let count = 0;
  panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    const def = defaults[cb.id];
    if (def !== undefined ? cb.checked !== def : cb.checked) count++;
  });
  const badge = D?.advCount;
  if (badge) {
    badge.textContent = count;
    badge.hidden      = count === 0;
  }
}

function setTargetKb(kb) {
  const input = $('targetKbInput');
  if (!input) return;
  input.value = kb > 0 ? String(kb) : '';
  if (kb > 0) toast('Target Size Set', `Will compress to approximately ${kb} KB`, 'info', 2500);
  else toast('Target Cleared', 'Using preset-based compression', 'info', 2000);
}

function collectOptions() {
  const getCheck = (id, def = false) => {
    const el = $(id);
    return el ? el.checked : def;
  };
  const getVal = id => {
    const el = $(id);
    return el ? el.value : '';
  };
  return {
    preset:                  _currentPreset,
    grayscale:               getCheck('optGrayscale',      false),
    strip_metadata:          getCheck('optStripMeta',      false),
    remove_annotations:      getCheck('optRemoveAnnots',   false),
    linearize:               getCheck('optLinearize',      false),
    remove_javascript:       getCheck('optRemoveJS',       false),
    remove_thumbnails:       getCheck('optRemoveThumbs',   true),
    remove_embedded_files:   getCheck('optRemoveEmbedded', false),
    subset_fonts:            getCheck('optSubsetFonts',    true),
    remove_duplicate_images: getCheck('optDedup',          true),
    flatten_transparency:    getCheck('optFlatTrans',      false),
    remove_icc_profiles:     getCheck('optRemoveICC',      false),
    remove_forms:            getCheck('optRemoveForms',    false),
    remove_links:            getCheck('optRemoveLinks',    false),
    password:                getVal('optPassword'),
    target_kb:               parseInt(getVal('targetKbInput') || '0', 10) || 0,
  };
}

function updateDownloadFilenamePreview() {
  const el = $('downloadFilenamePreview');
  if (!el) return;
  const name = STEM ? `${STEM}_compressed.pdf` : 'your_file_compressed.pdf';
  el.textContent = name;
}

/* ─── § 13  SSE PROGRESS ─────────────────────────────────────────────────────── */

function openSSE(jobId) {
  closeSSE();
  try {
    SSE_SOURCE = new EventSource(`/api/compress-pdf/progress/${jobId}`);

    SSE_SOURCE.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        if (d.ping) return;
        updateProgress(d.pct || 0, d.title || d.message || '', d.sub || d.detail || '');
        if (d.done) closeSSE();
      } catch {}
    };

    SSE_SOURCE.addEventListener('progress', e => {
      try {
        const d = JSON.parse(e.data);
        if (d.ping) return;
        updateProgress(d.pct || 0, d.title || d.message || '', d.sub || d.detail || '');
        if (d.done) closeSSE();
      } catch {}
    });

    SSE_SOURCE.onerror = () => closeSSE();
  } catch {}
}

function closeSSE() {
  if (SSE_SOURCE) { try { SSE_SOURCE.close(); } catch {} SSE_SOURCE = null; }
  if (SSE_TIMER)  { clearInterval(SSE_TIMER); SSE_TIMER = null; }
}

function showProgress() {
  if (D?.progressWrap) D.progressWrap.removeAttribute('hidden');
  if (D?.compressBtn)  D.compressBtn.hidden = true;
  if (D?.resetBtn)     D.resetBtn.hidden    = true;
  if (D?.cancelBtn)    D.cancelBtn.removeAttribute('hidden');
  if (D?.resultWrap)   D.resultWrap.setAttribute('hidden', '');
  renderProgressStages();
  startElapsedTimer();
}

function hideProgress() {
  if (D?.progressWrap) D.progressWrap.setAttribute('hidden', '');
  if (D?.compressBtn)  D.compressBtn.removeAttribute('hidden');
  if (D?.resetBtn)     D.resetBtn.removeAttribute('hidden');
  if (D?.cancelBtn)    D.cancelBtn.setAttribute('hidden', '');
  stopElapsedTimer();
}

function renderProgressStages() {
  const el = $('progressStages');
  if (!el) return;
  el.innerHTML = PROGRESS_STAGES.slice(0, 6).map((st, i) =>
    `<div class="cp-progress-stage" id="pstage-${i}">
      <div class="cp-stage-icon"><i class="fa ${st.icon}" aria-hidden="true"></i></div>
      <span>${st.label}</span>
    </div>`
  ).join('');
}

function updateProgress(pct, title, sub) {
  const p     = clamp(pct, 0, 100);
  const bar   = $('progressBar');
  const pctEl = $('progressPct');
  const role  = $('progressBarRole');
  const titleEl = $('progressTitle');
  const subEl   = $('progressSub');

  if (bar)   bar.style.width = p + '%';
  if (pctEl) pctEl.textContent = Math.round(p) + '%';
  if (role)  role.setAttribute('aria-valuenow', p);
  if (title && titleEl) titleEl.textContent = title;
  if (sub   && subEl)   subEl.textContent   = sub;

  // Update stage highlights
  PROGRESS_STAGES.forEach((st, i) => {
    const el = $(`pstage-${i}`);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (p >= st.pct) {
      const nextPct = PROGRESS_STAGES[i + 1]?.pct ?? 101;
      el.classList.add(p < nextPct ? 'active' : 'done');
    }
  });
}

function startSimProgress(startPct = 5, targetPct = 90, durationMs = 12000) {
  stopSimProgress();
  let cur = startPct;
  const step = (targetPct - startPct) / (durationMs / 250);
  _simInterval = setInterval(() => {
    cur = Math.min(cur + step * (0.6 + Math.random() * 0.8), targetPct);
    const stageIdx = Math.max(0, PROGRESS_STAGES.findIndex((st, i) =>
      cur >= st.pct && (PROGRESS_STAGES[i + 1]?.pct ?? 101) > cur
    ));
    const stage = PROGRESS_STAGES[stageIdx] || PROGRESS_STAGES[0];
    updateProgress(Math.floor(cur), stage.label, stage.sub);
    if (cur >= targetPct) stopSimProgress();
  }, 250);
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

function updateActionState() {
  if (!D) return;
  const hasFile = !!FILE;
  if (D.compressBtn) D.compressBtn.disabled = !hasFile;
  if (D.resetBtn)    D.resetBtn.disabled    = !hasFile;

  const fab = $('cpFab');
  if (fab) {
    fab.title = hasFile ? 'Compress PDF (Ctrl+Enter)' : 'Add PDF file';
    const i = fab.querySelector('i');
    if (i) i.className = hasFile ? 'fa fa-compress-alt' : 'fa fa-plus';
  }
}

/* ─── § 14  MAIN COMPRESSION ─────────────────────────────────────────────────── */

async function doCompress() {
  if (!FILE) {
    toast('No File', 'Please upload a PDF file first', 'warn', 3500);
    S(SND.ERROR);
    return;
  }
  if (BATCH_ACTIVE) {
    toast('Busy', 'Batch compression is already in progress', 'warn', 2500);
    return;
  }

  // Quality guarantee reminder for lossless/high
  const cfg = PRESET_INFO[_currentPreset];
  if (cfg?.guarantee?.lossless) {
    toast('🔮 Lossless Mode Active', 'Zero quality loss guaranteed — pikepdf streams only', 'success', 3500);
  } else if (cfg?.guarantee?.noDpi) {
    toast('💎 High Quality Mode', 'No DPI downsampling — near-lossless compression', 'info', 3000);
  }

  COMPRESS_DONE = false;
  JOB_ID        = generateId();

  S(SND.START);

  showProgress();
  updateProgress(3, 'Initialising…', `${cfg?.emoji} ${cfg?.name} preset · Loading 12 compression engines`);
  openSSE(JOB_ID);
  startSimProgress(5, 90, 14000);

  // Block page unload during compression
  const beforeUnload = e => { e.preventDefault(); e.returnValue = ''; };
  window.addEventListener('beforeunload', beforeUnload);

  // Build FormData
  const opts = collectOptions();
  const fd   = new FormData();
  fd.append('file',                    FILE);
  fd.append('preset',                  opts.preset);
  fd.append('quality',                 opts.preset);
  fd.append('grayscale',               String(opts.grayscale));
  fd.append('strip_metadata',          String(opts.strip_metadata));
  fd.append('remove_annotations',      String(opts.remove_annotations));
  fd.append('linearize',               String(opts.linearize));
  fd.append('remove_javascript',       String(opts.remove_javascript));
  fd.append('remove_thumbnails',       String(opts.remove_thumbnails));
  fd.append('remove_embedded_files',   String(opts.remove_embedded_files));
  fd.append('flatten_transparency',    String(opts.flatten_transparency));
  fd.append('subset_fonts',            String(opts.subset_fonts));
  fd.append('remove_duplicate_images', String(opts.remove_duplicate_images));
  fd.append('remove_icc_profiles',     String(opts.remove_icc_profiles));
  fd.append('remove_forms',            String(opts.remove_forms));
  fd.append('remove_links',            String(opts.remove_links));
  fd.append('target_kb',               String(opts.target_kb));
  fd.append('password',                opts.password);
  fd.append('job_id',                  JOB_ID);

  try {
    const resp = await fetch('/api/compress-pdf/compress', {
      method:  'POST',
      body:    fd,
    });

    window.removeEventListener('beforeunload', beforeUnload);
    stopSimProgress();
    closeSSE();

    if (!resp.ok) {
      let errMsg = `Server error (${resp.status})`;
      try {
        const j = await resp.json();
        errMsg = j.error || j.message || errMsg;
      } catch {}
      throw new Error(errMsg);
    }

    // Read response headers
    const inSize   = parseInt(resp.headers.get('X-Input-Size')     || '0', 10);
    const outSize  = parseInt(resp.headers.get('X-Output-Size')    || '0', 10);
    const redPct   = parseFloat(resp.headers.get('X-Reduction-Pct')  || '0');
    const engine   = resp.headers.get('X-Engine-Used')   || 'multi-engine';
    const qScore   = parseInt(resp.headers.get('X-Quality-Score')  || '50', 10);
    const qGrade   = resp.headers.get('X-Quality-Grade') || 'B';
    const engTried = resp.headers.get('X-Engines-Tried') || '';
    const procMs   = parseInt(resp.headers.get('X-Processing-Ms')  || '0', 10);

    // Get the compressed blob
    const blob = await resp.blob();
    if (!blob || blob.size === 0) throw new Error('Empty response — please try again');

    // Final progress update
    updateProgress(100, 'Done! ✓', `Saved ${Math.max(0, redPct).toFixed(1)}% · Grade ${qGrade}`);
    COMPRESS_DONE = true;

    const actualIn   = inSize   || FILE.size;
    const actualOut  = outSize  || blob.size;
    const actualRed  = redPct   || calcReduction(actualIn, actualOut);
    const procTime   = procMs   || Math.round(performance.now() - _t0);

    RESULT_DATA = {
      blob,
      inputSize:  actualIn,
      outputSize: actualOut,
      reduction:  Math.max(0, actualRed),
      engine,
      qScore:     clamp(qScore, 0, 100),
      qGrade,
      engTried,
      procMs:     procTime,
      preset:     opts.preset,
      fingerprint: generateFingerprint(actualIn, actualOut, engine, opts.preset, procTime),
      stem:        STEM,   // EXACT original stem — used for download filename
      downloadName: `${STEM}_compressed.pdf`,
    };

    const engList = engTried.split(',').filter(Boolean).map(e => e.trim());

    // Show result after brief delay for smooth UX
    setTimeout(() => {
      hideProgress();
      showResult(RESULT_DATA, engList);
      S(SND.DOWNLOAD);  // fahhhhh on result (will also play on actual download)
      setTimeout(() => { S(SND.SUCCESS); launchConfetti(); }, 400);
    }, 700);

    // Persist to history
    saveHistory({
      name:       FILE.name,
      stem:       STEM,
      inSize:     actualIn,
      outSize:    actualOut,
      reduction:  actualRed,
      engine,
      grade:      qGrade,
      score:      qScore,
      preset:     opts.preset,
      procMs:     procTime,
      fingerprint: RESULT_DATA.fingerprint,
      ts:         Date.now(),
    });

  } catch (err) {
    window.removeEventListener('beforeunload', beforeUnload);
    stopSimProgress();
    closeSSE();
    COMPRESS_DONE = false;
    hideProgress();
    console.error('[IshuTools] Compression error:', err);
    toast('Compression Failed', err.message || 'Unknown error. Please try again.', 'error', 7000);
    S(SND.ERROR);
    announce('Compression failed: ' + (err.message || 'Unknown error'), 'assertive');
  }
}

function cancelCompress() {
  closeSSE();
  stopSimProgress();
  stopElapsedTimer();
  COMPRESS_DONE = false;
  hideProgress();
  S(SND.CANCEL);
  toast('Cancelled', 'Compression cancelled', 'warn', 2000);
  announce('Compression cancelled');
}

/* ─── § 15  RESULT DISPLAY ───────────────────────────────────────────────────── */

function showResult(data, engList) {
  const rw = D?.resultWrap;
  if (!rw) return;

  rw.removeAttribute('hidden');

  // Scroll to result
  setTimeout(() => rw.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);

  // Grade banner
  const banner     = $('resultGradeBanner');
  const bannerText = $('resultGradeBannerText');
  if (banner) banner.style.background = GRADE_BG[data.qGrade] || GRADE_BG['B'];
  if (bannerText) {
    const pi = PRESET_INFO[data.preset] || {};
    bannerText.innerHTML = `
      Grade <strong>${data.qGrade}</strong> &nbsp;·&nbsp;
      ${data.reduction.toFixed(1)}% saved &nbsp;·&nbsp;
      ${pi.emoji || ''} ${pi.name || data.preset} &nbsp;·&nbsp;
      ${fmtBytes(data.inputSize)} → ${fmtBytes(data.outputSize)}
    `;
  }

  // Animate numbers
  animateCounter($('resBefore'), 0, data.inputSize,  1200, v => fmtBytes(Math.round(v)));
  animateCounter($('resAfter'),  0, data.outputSize, 1200, v => fmtBytes(Math.round(v)));
  animateCounter($('resPct'),    0, data.reduction,  1500, v => v.toFixed(1) + '%');

  // Reduction bar
  const bar  = $('resBar');
  const role = $('resBarRole');
  if (bar) {
    setTimeout(() => {
      bar.style.width = Math.min(100, data.reduction) + '%';
      if (role) role.setAttribute('aria-valuenow', Math.round(data.reduction));
    }, 200);
  }

  // Engine info
  const engEl = $('resEngine');
  if (engEl) {
    engEl.innerHTML = `
      <i class="fa fa-cogs" aria-hidden="true"></i>
      ${data.engine}
      ${engList.length > 0 ? `<span class="res-eng-detail">(${engList.length} engines tried)</span>` : ''}
    `;
  }

  // Quality score
  const qsEl = $('resScore');
  if (qsEl) {
    const col = GRADE_COLORS[data.qGrade] || '#6366f1';
    qsEl.innerHTML = `
      <span style="color:${col};font-weight:800;font-size:1.3rem">${data.qGrade}</span>
      <span style="color:var(--t3);font-size:.8rem"> / ${data.qScore}/100</span>
    `;
  }

  // Processing time
  const ptEl = $('resTime');
  if (ptEl) ptEl.textContent = fmtMs(data.procMs);

  // Fingerprint
  const fpEl = $('fingerprintVal');
  if (fpEl) fpEl.textContent = data.fingerprint;

  // Download button — show correct filename
  const dlBtn = $('downloadBtn');
  if (dlBtn) {
    dlBtn.removeAttribute('disabled');
    dlBtn.innerHTML = `
      <i class="fa fa-download" aria-hidden="true"></i>
      Download (${fmtBytes(data.outputSize)})
    `;
  }

  // Download filename preview in result
  const dfEl = $('downloadFilenamePreview');
  if (dfEl) dfEl.textContent = data.downloadName || `${data.stem}_compressed.pdf`;

  // Draw donut chart
  drawDonutChart(data.reduction, data.qGrade);

  // Show analytics mini if we have analysis data
  if (ANALYSIS_DATA) renderAnalyticsMini(ANALYSIS_DATA);

  announce(`Compression complete. Grade ${data.qGrade}. ${data.reduction.toFixed(1)}% saved.`);
}

/* ─── § 16  DOWNLOAD ──────────────────────────────────────────────────────────── */

function triggerDownload() {
  if (!RESULT_DATA?.blob) {
    toast('No Result', 'Please compress a file first', 'warn', 3000);
    return;
  }

  S(SND.DOWNLOAD);  // fahhhhh — ALWAYS play on download

  const url  = URL.createObjectURL(RESULT_DATA.blob);
  const a    = document.createElement('a');
  a.href     = url;
  // Download name: exact original stem + _compressed.pdf
  a.download = RESULT_DATA.downloadName || `${RESULT_DATA.stem || 'file'}_compressed.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);

  toast('Downloading!', `Saving as: ${a.download}`, 'success', 3000);
  announce(`Downloading ${a.download}`);
}

/* ─── § 17  CLIPBOARD PASTE ──────────────────────────────────────────────────── */

function initClipboardPaste() {
  document.addEventListener('paste', async e => {
    const items = [...(e.clipboardData?.items || [])];
    const pdfItem = items.find(item => item.type === 'application/pdf');
    if (pdfItem) {
      const file = pdfItem.getAsFile();
      if (file) {
        handleFiles([file]);
        toast('PDF Pasted!', 'PDF detected from clipboard', 'success', 3000);
      }
    }
  });
}

/* ─── § 18  BATCH MODE ───────────────────────────────────────────────────────── */

function addToBatch(file, silent = false) {
  const id = generateId();
  BATCH_QUEUE.push({ id, file, status: 'pending', result: null, blobUrl: null, pct: 0 });
  if (!silent) {
    S(SND.FILE_ADD);
    toast('Added to Queue', file.name, 'info', 2000);
  }
  updateBatchUI();
}

function updateBatchUI() {
  const panel = $('batchPanel');
  const list  = $('batchList');
  const cnt   = $('batchCount');
  const runCnt = $('batchRunCount');

  if (cnt)    cnt.textContent    = BATCH_QUEUE.length;
  if (runCnt) runCnt.textContent = BATCH_QUEUE.filter(i => i.status === 'pending' || i.status === 'error').length;

  if (list) {
    list.innerHTML = BATCH_QUEUE.map((item, idx) => `
      <div class="cp-batch-item" id="bitem-${item.id}" draggable="true"
           data-id="${item.id}">
        <div class="cp-batch-thumb">
          <i class="fa fa-file-pdf" aria-hidden="true"></i>
        </div>
        <div class="cp-batch-info">
          <div class="cp-batch-name">${item.file.name}</div>
          <div class="cp-batch-size">${fmtBytes(item.file.size)}</div>
        </div>
        <div class="cp-batch-status cp-batch-status-${item.status}">
          ${batchStatusIcon(item)}
        </div>
        ${item.status === 'done' && item.blobUrl ? `
          <button class="cp-batch-dl" type="button" onclick="downloadBatchItem('${item.id}')"
                  title="Download compressed file">
            <i class="fa fa-download" aria-hidden="true"></i>
          </button>
        ` : ''}
        <button class="cp-batch-remove" type="button" onclick="removeBatchItem('${item.id}')"
                title="Remove from queue" aria-label="Remove ${item.file.name}">
          <i class="fa fa-times" aria-hidden="true"></i>
        </button>
      </div>
    `).join('');
  }

  // Wire drag-to-reorder
  wireBatchDrag();

  // Update run button
  const runBtn = $('batchRunBtn');
  const pending = BATCH_QUEUE.filter(i => i.status === 'pending' || i.status === 'error').length;
  if (runBtn) runBtn.disabled = pending === 0 || BATCH_ACTIVE;

  // Show/hide zip download
  const hasDone = BATCH_QUEUE.some(i => i.status === 'done' && i.blobUrl);
  const zipBtn  = $('batchDownloadAllBtn');
  if (zipBtn) zipBtn.disabled = !hasDone;

  // Batch stats
  updateBatchStats();
}

function batchStatusIcon(item) {
  switch (item.status) {
    case 'pending': return '<i class="fa fa-clock" aria-label="Pending"></i>';
    case 'running': return `<span class="cp-batch-pct">${Math.round(item.pct)}%</span>`;
    case 'done':    return `<i class="fa fa-check" style="color:var(--green)" aria-label="Done"></i>`;
    case 'error':   return '<i class="fa fa-exclamation-triangle" style="color:var(--red)" aria-label="Error"></i>';
    default:        return '';
  }
}

function wireBatchDrag() {
  const items = document.querySelectorAll('.cp-batch-item[draggable]');
  items.forEach(el => {
    el.addEventListener('dragstart', e => {
      _dragSrcId = el.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', e => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (!_dragSrcId || _dragSrcId === el.dataset.id) return;
      const srcIdx = BATCH_QUEUE.findIndex(i => i.id === _dragSrcId);
      const dstIdx = BATCH_QUEUE.findIndex(i => i.id === el.dataset.id);
      if (srcIdx < 0 || dstIdx < 0) return;
      const [moved] = BATCH_QUEUE.splice(srcIdx, 1);
      BATCH_QUEUE.splice(dstIdx, 0, moved);
      updateBatchUI();
    });
    el.addEventListener('dragend', () => el.classList.remove('drag-over'));
  });
}

function removeBatchItem(id) {
  const idx = BATCH_QUEUE.findIndex(i => i.id === id);
  if (idx < 0) return;
  const [item] = BATCH_QUEUE.splice(idx, 1);
  if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
  _deletedStack.push({ ...item, idx });
  if (_deletedStack.length > 5) _deletedStack.shift();
  updateBatchUI();
  showUndoBar();
}

function showUndoBar() {
  const bar = $('cpUndoBar');
  if (!bar) return;
  bar.removeAttribute('hidden');
  clearTimeout(bar._hideTimer);
  bar._hideTimer = setTimeout(() => bar.setAttribute('hidden', ''), 4500);
}

function undoLastDelete() {
  const item = _deletedStack.pop();
  if (!item) return;
  const { idx, ...entry } = item;
  BATCH_QUEUE.splice(Math.min(idx, BATCH_QUEUE.length), 0, entry);
  updateBatchUI();
  const bar = $('cpUndoBar');
  if (bar) bar.setAttribute('hidden', '');
}

async function runBatch() {
  const pending = BATCH_QUEUE.filter(i => i.status === 'pending' || i.status === 'error');
  if (pending.length === 0) return;
  if (BATCH_ACTIVE) return;

  BATCH_ACTIVE = true;
  S(SND.START);

  for (const item of pending) {
    item.status = 'running';
    item.pct    = 0;
    updateBatchUI();

    try {
      const opts = collectOptions();
      const fd   = new FormData();
      fd.append('file',    item.file);
      fd.append('preset',  opts.preset);
      fd.append('quality', opts.preset);
      fd.append('grayscale',               String(opts.grayscale));
      fd.append('strip_metadata',          String(opts.strip_metadata));
      fd.append('remove_annotations',      String(opts.remove_annotations));
      fd.append('linearize',               String(opts.linearize));
      fd.append('remove_javascript',       String(opts.remove_javascript));
      fd.append('remove_thumbnails',       String(opts.remove_thumbnails));
      fd.append('remove_embedded_files',   String(opts.remove_embedded_files));
      fd.append('flatten_transparency',    String(opts.flatten_transparency));
      fd.append('subset_fonts',            String(opts.subset_fonts));
      fd.append('remove_duplicate_images', String(opts.remove_duplicate_images));
      fd.append('remove_icc_profiles',     String(opts.remove_icc_profiles));
      fd.append('remove_forms',            String(opts.remove_forms));
      fd.append('remove_links',            String(opts.remove_links));
      fd.append('target_kb',               String(opts.target_kb));
      fd.append('password',                opts.password);
      fd.append('job_id',                  generateId());

      item.pct = 20; updateBatchUI();

      const resp = await fetch('/api/compress-pdf/compress', { method: 'POST', body: fd });
      item.pct = 70; updateBatchUI();

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const inSize  = parseInt(resp.headers.get('X-Input-Size')    || '0', 10) || item.file.size;
      const outSize = parseInt(resp.headers.get('X-Output-Size')   || '0', 10);
      const redPct  = parseFloat(resp.headers.get('X-Reduction-Pct') || '0');
      const engine  = resp.headers.get('X-Engine-Used') || 'multi';
      const grade   = resp.headers.get('X-Quality-Grade') || 'B';

      const blob = await resp.blob();
      if (!blob || blob.size === 0) throw new Error('Empty response');

      item.pct    = 100;
      item.status = 'done';
      item.blobUrl = URL.createObjectURL(blob);
      item.result  = { inSize, outSize, redPct, engine, grade };

    } catch (err) {
      item.status = 'error';
      item.result = { error: err.message };
      S(SND.ERROR);
      toast(`Error: ${item.file.name}`, err.message || 'Compression failed', 'error', 5000);
    }

    updateBatchUI();
  }

  BATCH_ACTIVE = false;
  S(SND.SUCCESS);
  updateBatchStats();
  updateBatchUI();

  const done  = BATCH_QUEUE.filter(i => i.status === 'done');
  const total = BATCH_QUEUE.length;
  toast('Batch Done!', `${done.length}/${total} files compressed successfully`, 'success', 5000);
  launchConfetti();
}

function downloadBatchItem(id) {
  const item = BATCH_QUEUE.find(i => i.id === id);
  if (!item?.blobUrl) return;
  S(SND.DOWNLOAD);  // fahhhhh
  const a    = document.createElement('a');
  a.href     = item.blobUrl;
  const stem = getStem(item.file.name);
  a.download = `${stem}_compressed.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function downloadAllBatch() {
  const done = BATCH_QUEUE.filter(i => i.status === 'done' && i.blobUrl);
  if (done.length === 0) return;
  S(SND.DOWNLOAD);  // fahhhhh
  done.forEach((item, i) => {
    setTimeout(() => downloadBatchItem(item.id), i * 200);
  });
  toast('Downloading All', `${done.length} compressed files`, 'success', 3000);
}

function updateBatchStats() {
  const done  = BATCH_QUEUE.filter(i => i.status === 'done' && i.result);
  const total = BATCH_QUEUE.length;
  const totalSaved = done.reduce((acc, i) => acc + Math.max(0, i.result.inSize - i.result.outSize), 0);
  const avgRed     = done.length ? done.reduce((acc, i) => acc + i.result.redPct, 0) / done.length : 0;

  const statsEl = $('batchStatsWrap');
  if (statsEl) {
    statsEl.innerHTML = `
      <span>${done.length}/${total} done</span>
      <span>${fmtBytes(totalSaved)} saved</span>
      <span>${avgRed.toFixed(1)}% avg</span>
    `;
  }
}

/* ─── § 19  HISTORY ──────────────────────────────────────────────────────────── */

function saveHistory(entry) {
  let hist = lsGet(HISTORY_KEY, []);
  if (!Array.isArray(hist)) hist = [];
  hist.unshift(entry);
  if (hist.length > HISTORY_MAX) hist = hist.slice(0, HISTORY_MAX);
  lsSet(HISTORY_KEY, hist);
  renderHistory();
}

function loadHistory() {
  return lsGet(HISTORY_KEY, []);
}

function clearHistory() {
  lsSet(HISTORY_KEY, []);
  renderHistory();
  toast('History Cleared', 'Compression history deleted', 'info', 2500);
}

function renderHistory() {
  const hist = loadHistory();
  const cntEl = $('historyCount');
  if (cntEl) cntEl.textContent = hist.length;

  const listEl = $('histList');
  if (!listEl) return;

  if (hist.length === 0) {
    listEl.innerHTML = `
      <div class="cp-hist-empty">
        <i class="fa fa-history" aria-hidden="true"></i>
        <p>No compression history yet.<br>Compress a PDF to see it here.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = hist.map((h, i) => `
    <div class="cp-hist-item" role="listitem">
      <div class="cp-hist-icon" aria-hidden="true">
        <i class="fa fa-file-pdf"></i>
      </div>
      <div class="cp-hist-info">
        <div class="cp-hist-name" title="${h.name}">${h.name}</div>
        <div class="cp-hist-meta">
          <span>${fmtBytes(h.inSize)} → ${fmtBytes(h.outSize)}</span>
          <span class="cp-hist-sep">·</span>
          <span style="color:var(--green)">${h.reduction?.toFixed(1)}% saved</span>
          <span class="cp-hist-sep">·</span>
          <span style="color:${GRADE_COLORS[h.grade] || 'var(--em3)'}">${h.grade}</span>
          <span class="cp-hist-sep">·</span>
          <span>${h.preset}</span>
        </div>
        <div class="cp-hist-ts">${fmtDate(h.ts)} · ${h.engine}</div>
      </div>
    </div>
  `).join('');
}

function toggleHistory() {
  const panel = $('historyPanel');
  if (!panel) return;
  const isHidden = panel.hasAttribute('hidden');
  if (isHidden) {
    panel.removeAttribute('hidden');
    renderHistory();
    S(SND.CLICK);
  } else {
    panel.setAttribute('hidden', '');
  }
}

function exportHistoryCsv() {
  const hist = loadHistory();
  if (!hist.length) { toast('No History', 'Compress some files first', 'warn', 2500); return; }
  const cols = ['Date','Name','Input Size','Output Size','Reduction %','Grade','Score','Preset','Engine','Processing Time','Fingerprint'];
  const rows = hist.map(h => [
    fmtDate(h.ts), `"${h.name}"`, h.inSize, h.outSize,
    h.reduction?.toFixed(2), h.grade, h.score,
    h.preset, `"${h.engine}"`, h.procMs, h.fingerprint || '',
  ].join(','));
  const csv  = [cols.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'ishutools-compress-history.csv';
  a.click();
  S(SND.DOWNLOAD);
}

function exportHistoryJson() {
  const hist = loadHistory();
  if (!hist.length) { toast('No History', 'Compress some files first', 'warn', 2500); return; }
  const blob = new Blob([JSON.stringify(hist, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'ishutools-compress-history.json';
  a.click();
  S(SND.DOWNLOAD);
}

function renderLeaderboard() {
  const hist = loadHistory();
  const lbEl = $('cpHistLeaderboard');
  if (!lbEl || !hist.length) return;

  // Sort by reduction %
  const top = [...hist].sort((a, b) => b.reduction - a.reduction).slice(0, 10);
  lbEl.innerHTML = `
    <div style="font-weight:700;color:var(--t2);margin-bottom:.75rem">
      <i class="fa fa-trophy" style="color:#fbbf24"></i> Top Compressions
    </div>
    ${top.map((h, i) => `
      <div class="cp-lb-row">
        <span class="cp-lb-rank">${i + 1}</span>
        <span class="cp-lb-name">${h.name}</span>
        <span class="cp-lb-pct" style="color:var(--green)">${h.reduction?.toFixed(1)}%</span>
        <span class="cp-lb-grade" style="color:${GRADE_COLORS[h.grade] || 'var(--em3)'}">${h.grade}</span>
      </div>
    `).join('')}
  `;
}

/* ─── § 20  DEEP PDF ANALYSIS ────────────────────────────────────────────────── */

async function analyzeFile(file) {
  if (!file) return;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch('/api/compress-pdf/analyze', { method: 'POST', body: fd });
    if (!resp.ok) return;
    const data = await resp.json();
    ANALYSIS_DATA = data;
    renderAnalysisStrip(data);
    renderEstimates(data);
    renderRecommendation(data);
  } catch {}
}

function renderAnalysisStrip(data) {
  if (!data) return;
  const strip = $('analysisStrip');
  if (!strip) return;

  const chips = [];
  if (data.pages)          chips.push(`<span class="cp-analysis-chip"><i class="fa fa-file-pdf"></i> ${data.pages} pages</span>`);
  if (data.has_images)     chips.push(`<span class="cp-analysis-chip warn"><i class="fa fa-image"></i> ${data.image_count || '?'} images</span>`);
  if (data.has_fonts)      chips.push(`<span class="cp-analysis-chip"><i class="fa fa-font"></i> ${data.font_count || '?'} fonts</span>`);
  if (data.has_ocr)        chips.push(`<span class="cp-analysis-chip"><i class="fa fa-eye"></i> OCR layer</span>`);
  if (data.is_encrypted)   chips.push(`<span class="cp-analysis-chip warn"><i class="fa fa-lock"></i> Encrypted</span>`);
  if (data.is_linearized)  chips.push(`<span class="cp-analysis-chip"><i class="fa fa-bolt"></i> Web-optimized</span>`);
  if (data.has_forms)      chips.push(`<span class="cp-analysis-chip"><i class="fa fa-wpforms"></i> Forms</span>`);
  if (data.has_javascript) chips.push(`<span class="cp-analysis-chip warn"><i class="fa fa-code"></i> JS actions</span>`);

  if (chips.length === 0) {
    strip.setAttribute('hidden', '');
    return;
  }
  strip.innerHTML = chips.join('');
  strip.removeAttribute('hidden');
}

function renderEstimates(data) {
  if (!data) return;
  const wrap = $('estimatesWrap');
  if (!wrap) return;

  // Estimate output sizes based on content type and input size
  const inputBytes = FILE?.size || 0;
  const hasImages  = data.has_images;

  const estMap = {
    lossless: { min: 0.75, max: 0.98 },
    high:     { min: 0.60, max: 0.90 },
    medium:   { min: 0.35, max: 0.60 },
    low:      { min: 0.22, max: 0.45 },
    screen:   { min: 0.08, max: 0.25 },
  };

  // If images, more aggressive estimates; if text-only, less
  const factor = hasImages ? 1.0 : 1.4;

  Object.entries(estMap).forEach(([preset, { min, max }]) => {
    const mid     = (min + max) / 2 * factor;
    const estSize = Math.round(inputBytes * Math.min(mid, 0.98));
    const estPct  = Math.max(0, (1 - estSize / inputBytes) * 100);

    const valEl = $(`est${preset.charAt(0).toUpperCase() + preset.slice(1)}`);
    const pctEl = $(`est${preset.charAt(0).toUpperCase() + preset.slice(1)}Pct`);

    if (valEl) valEl.textContent = fmtBytes(estSize);
    if (pctEl) {
      pctEl.textContent = `−${estPct.toFixed(0)}%`;
      pctEl.style.color  = estPct > 60 ? 'var(--green)' : estPct > 30 ? 'var(--amber)' : 'var(--t3)';
    }
  });

  wrap.removeAttribute('hidden');
}

function hideEstimates() {
  const wrap = $('estimatesWrap');
  if (wrap) wrap.setAttribute('hidden', '');
}

function hideAnalysis() {
  const strip = $('analysisStrip');
  if (strip) strip.setAttribute('hidden', '');
}

function renderRecommendation(data) {
  if (!data) return;
  const banner = $('recommendBanner');
  const text   = $('recommendText');
  const btn    = $('recommendApplyBtn');
  if (!banner) return;

  // Determine recommendation based on analysis
  let preset = 'medium';
  let reason = 'Best balance of size and quality';

  if (data.has_images && (FILE?.size || 0) > 10 * 1024 * 1024) {
    preset = 'low';
    reason = 'Large file with many images — Low preset recommended';
  } else if (!data.has_images && data.pages > 100) {
    preset = 'lossless';
    reason = 'Text-only document — Lossless is ideal';
  } else if (data.is_encrypted) {
    preset = 'medium';
    reason = 'Encrypted PDF — Medium preset recommended';
  }

  _recommendPreset = preset;
  const pi = PRESET_INFO[preset];

  if (text) text.textContent = `${pi.emoji} ${reason} (${pi.name} — ${pi.tipSave})`;
  if (btn)  btn.onclick = applyRecommendation;

  banner.removeAttribute('hidden');
}

function hideRecommend() {
  const banner = $('recommendBanner');
  if (banner) banner.setAttribute('hidden', '');
}

function applyRecommendation() {
  if (_recommendPreset) {
    selectPreset(_recommendPreset);
    toast('Preset Applied', `${PRESET_INFO[_recommendPreset]?.name} preset selected`, 'success', 2500);
    S(SND.SUCCESS);
  }
}

/* ─── § 21  BENCHMARK PANEL ──────────────────────────────────────────────────── */

async function fetchBenchmark(file) {
  if (!file) return;
  const wrap = $('presetBenchmarkWrap');
  if (!wrap) return;

  // Show loading state
  wrap.innerHTML = `<div class="cp-bm-loading"><i class="fa fa-spinner fa-spin"></i> Estimating sizes…</div>`;
  wrap.removeAttribute('hidden');

  try {
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch('/api/compress-pdf/benchmark', { method: 'POST', body: fd });
    if (!resp.ok) { wrap.setAttribute('hidden', ''); return; }
    const data = await resp.json();
    renderBenchmark(data, file.size);
  } catch {
    wrap.setAttribute('hidden', '');
  }
}

function renderBenchmark(data, inputSize) {
  const wrap = $('presetBenchmarkWrap');
  if (!wrap) return;

  const rows = Object.entries(PRESET_INFO).map(([key, pi]) => {
    const est = data[key] || {};
    const outSize = est.estimated_output_bytes || 0;
    const pct     = outSize ? ((inputSize - outSize) / inputSize * 100) : 0;
    return `
      <div class="cp-bm-row" onclick="selectPreset('${key}')" style="cursor:pointer">
        <span class="cp-bm-preset">${pi.emoji} ${pi.name}</span>
        <div class="cp-bm-bar-wrap">
          <div class="cp-bm-bar" style="width:${Math.max(5, pct)}%;background:${pi.color}"></div>
        </div>
        <span class="cp-bm-val">${outSize ? fmtBytes(outSize) : '—'}</span>
        <span class="cp-bm-pct" style="color:var(--green)">${pct > 0 ? '−' + pct.toFixed(0) + '%' : '—'}</span>
      </div>
    `;
  }).join('');

  wrap.innerHTML = `
    <div class="cp-bm-header">
      <i class="fa fa-chart-bar" aria-hidden="true"></i>
      Estimated output sizes (click a row to apply preset)
    </div>
    <div class="cp-bm-rows">${rows}</div>
  `;
  wrap.removeAttribute('hidden');
}

function hideBenchmark() {
  const wrap = $('presetBenchmarkWrap');
  if (wrap) { wrap.setAttribute('hidden', ''); wrap.innerHTML = ''; }
}

/* ─── § 22  COMPARISON SLIDER ────────────────────────────────────────────────── */

function showComparisonSlider(nameBefore, nameAfter, sizeBefore, sizeAfter) {
  const wrap = $('cpBaSection');
  if (!wrap) return;

  const savedBytes = Math.max(0, sizeBefore - sizeAfter);
  const savedPct   = calcReduction(sizeBefore, sizeAfter);

  wrap.innerHTML = `
    <div class="cp-cmp-header">
      <i class="fa fa-columns" aria-hidden="true"></i>
      Before &amp; After Comparison
    </div>
    <div class="cp-cmp-body">
      <div class="cp-cmp-col cp-cmp-before">
        <div class="cp-cmp-label">Before</div>
        <div class="cp-cmp-icon"><i class="fa fa-file-pdf"></i></div>
        <div class="cp-cmp-name">${nameBefore}</div>
        <div class="cp-cmp-size">${fmtBytes(sizeBefore)}</div>
      </div>
      <div class="cp-cmp-arrow"><i class="fa fa-arrow-right"></i></div>
      <div class="cp-cmp-col cp-cmp-after">
        <div class="cp-cmp-label">After</div>
        <div class="cp-cmp-icon compressed"><i class="fa fa-compress-alt"></i></div>
        <div class="cp-cmp-name">${nameAfter}</div>
        <div class="cp-cmp-size" style="color:var(--green)">${fmtBytes(sizeAfter)}</div>
      </div>
    </div>
    <div class="cp-cmp-saved">
      Saved <strong>${fmtBytes(savedBytes)}</strong>
      (<strong style="color:var(--green)">${savedPct.toFixed(1)}%</strong> reduction)
    </div>
  `;
  wrap.removeAttribute('hidden');
}

/* ─── § 23  ANALYTICS MINI PANEL ─────────────────────────────────────────────── */

function renderAnalyticsMini(data) {
  const wrap = $('cpAnalyticsMini');
  if (!wrap || !data) return;

  const chips = [];
  if (data.pages)           chips.push({ icon:'fa-file', label:`${data.pages} pages`, col:'var(--t2)' });
  if (data.image_count > 0) chips.push({ icon:'fa-image', label:`${data.image_count} images`, col:'var(--amber)' });
  if (data.font_count > 0)  chips.push({ icon:'fa-font', label:`${data.font_count} fonts`, col:'var(--em3)' });
  if (data.has_ocr)         chips.push({ icon:'fa-eye', label:'OCR text', col:'var(--blue)' });
  if (data.has_forms)       chips.push({ icon:'fa-wpforms', label:'Form fields', col:'var(--purple)' });
  if (data.has_javascript)  chips.push({ icon:'fa-code', label:'JS actions', col:'var(--red)' });

  if (chips.length === 0) return;

  wrap.innerHTML = `
    <div class="cp-am-header">
      <i class="fa fa-chart-pie" aria-hidden="true"></i> PDF Analysis
    </div>
    <div class="cp-am-chips">
      ${chips.map(c => `
        <span class="cp-am-chip">
          <i class="fa ${c.icon}" style="color:${c.col}"></i> ${c.label}
        </span>
      `).join('')}
    </div>
  `;
  wrap.removeAttribute('hidden');
}

/* ─── QUICK VALIDATE ──────────────────────────────────────────────────────────── */

async function quickValidate(file) {
  if (!file) return;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch('/api/compress-pdf/validate', { method: 'POST', body: fd });
    if (!resp.ok) return;
    const data = await resp.json();
    if (data.valid) {
      const pagesEl = $('fiPages');
      if (pagesEl && data.pages) {
        pagesEl.innerHTML = `<i class="fa fa-file-pdf" aria-hidden="true"></i> ${data.pages} pages`;
      }
    } else if (data.encrypted) {
      toast('Encrypted PDF', 'Enter the PDF password in Advanced Options', 'warn', 5000);
    }
  } catch {}
}

/* ─── § 24  CONFETTI ─────────────────────────────────────────────────────────── */

function launchConfetti() {
  if (_reduced) return;
  try {
    if (typeof confetti === 'function') {
      _fireConfetti();
      return;
    }
  } catch {}
  // CSS fallback
  cssConfetti();
}

function _fireConfetti() {
  confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: ['#6366f1','#8b5cf6','#22c55e','#f59e0b','#ec4899'] });
  setTimeout(() => confetti({ particleCount: 40, spread: 100, origin: { y: 0.5 }, angle: 60 }),  300);
  setTimeout(() => confetti({ particleCount: 40, spread: 100, origin: { y: 0.5 }, angle: 120 }), 600);
}

function cssConfetti() {
  const colors = ['#6366f1','#8b5cf6','#22c55e','#f59e0b','#ec4899','#06b6d4'];
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.style.cssText = `
      position:fixed;top:-10px;left:${Math.random()*100}%;
      width:8px;height:8px;border-radius:${Math.random()>0.5?'50%':'0'};
      background:${colors[Math.floor(Math.random()*colors.length)]};
      pointer-events:none;z-index:9999;
      animation:confettiDrop ${1+Math.random()*2}s linear forwards;
      animation-delay:${Math.random()*0.5}s;
    `;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 3500);
  }
}

/* ─── § 25  FAQ ACCORDION ────────────────────────────────────────────────────── */

function initFaq() {
  document.querySelectorAll('.cp-faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.cp-faq-item');
      if (!item) return;
      const isOpen = item.classList.contains('open');
      // Close all
      document.querySelectorAll('.cp-faq-item.open').forEach(el => el.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
      S(SND.CLICK);
    });
  });
}

/* ─── § 26  SCROLL REVEAL ────────────────────────────────────────────────────── */

function initScrollReveal() {
  if (_reduced) return;
  const els = document.querySelectorAll('.reveal-up');
  if (!els.length) return;

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  els.forEach(el => io.observe(el));
}

/* ─── § 27  COUNTERS ─────────────────────────────────────────────────────────── */

function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  if (!counters.length) return;

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el  = entry.target;
      const end = parseInt(el.dataset.count, 10) || 0;
      animateCounter(el, 0, end, 1500, v => Math.round(v).toLocaleString());
      io.unobserve(el);
    });
  }, { threshold: 0.5 });

  counters.forEach(el => io.observe(el));
}

/* ─── § 28  MARQUEE ──────────────────────────────────────────────────────────── */

function initMarquee() {
  // No JS needed — pure CSS marquee animation
}

/* ─── § 29  KEYBOARD SHORTCUTS ───────────────────────────────────────────────── */

function initKeyboard() {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // 1–5: Select presets
    if (e.key === '1') { selectPreset('lossless'); e.preventDefault(); }
    if (e.key === '2') { selectPreset('high');     e.preventDefault(); }
    if (e.key === '3') { selectPreset('medium');   e.preventDefault(); }
    if (e.key === '4') { selectPreset('low');      e.preventDefault(); }
    if (e.key === '5') { selectPreset('screen');   e.preventDefault(); }

    // D: Download
    if (e.key === 'd' || e.key === 'D') { triggerDownload(); }

    // R: Reset
    if (e.key === 'r' && e.ctrlKey) { e.preventDefault(); resetTool(); }

    // Ctrl+Enter: Compress
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); doCompress(); }

    // Escape: Cancel
    if (e.key === 'Escape') { cancelCompress(); }

    // Ctrl+Z: Undo batch delete
    if (e.key === 'z' && e.ctrlKey) { e.preventDefault(); undoLastDelete(); }
  });
}

/* ─── § 30  SCROLL-TO-TOP ────────────────────────────────────────────────────── */

function initScrollTop() {
  const btn = $('scrollTop') || $('cpScrollTopBtn') || $('scrollTopBtn');
  if (!btn) return;

  window.addEventListener('scroll', debounce(() => {
    if (window.scrollY > 400) btn.removeAttribute('hidden');
    else btn.setAttribute('hidden', '');
  }, 100));

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    S(SND.CLICK);
  });
}

/* ─── § 31  MOBILE FAB ───────────────────────────────────────────────────────── */

function initFab() {
  const fab = $('cpFab');
  if (!fab) return;
  fab.addEventListener('click', () => {
    if (FILE) {
      doCompress();
    } else {
      if (D?.fileInput) D.fileInput.click();
    }
  });
}

/* ─── § 32  SOUND TOGGLE ─────────────────────────────────────────────────────── */

function initSoundToggle() {
  const btn = $('soundToggle');
  if (!btn) return;

  const updateIcon = on => {
    const i = btn.querySelector('i');
    if (i) i.className = on ? 'fa fa-volume-up' : 'fa fa-volume-mute';
    btn.setAttribute('aria-label', on ? 'Mute sounds' : 'Unmute sounds');
    btn.setAttribute('title',      on ? 'Mute sounds' : 'Unmute sounds');
  };

  let on = lsGet(SOUND_KEY, true);
  updateIcon(on);

  btn.addEventListener('click', () => {
    on = !on;
    lsSet(SOUND_KEY, on);
    updateIcon(on);
    if (window.SOUNDS && typeof window.SOUNDS.setEnabled === 'function') {
      window.SOUNDS.setEnabled(on);
    }
  });
}

/* ─── § 33  DONUT CHART ──────────────────────────────────────────────────────── */

function drawDonutChart(reductionPct, grade) {
  const canvas = $('resultDonutChart');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const W   = canvas.width  = 160;
  const H   = canvas.height = 160;
  const cx  = W / 2, cy = H / 2, r = 65, lw = 18;

  ctx.clearRect(0, 0, W, H);

  // Background ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.lineWidth   = lw;
  ctx.stroke();

  // Filled arc
  const pct = clamp(reductionPct, 0, 100) / 100;
  const start = -Math.PI / 2;
  const end   = start + pct * Math.PI * 2;
  const col   = GRADE_COLORS[grade] || '#6366f1';

  ctx.beginPath();
  ctx.arc(cx, cy, r, start, end);
  ctx.strokeStyle = col;
  ctx.lineWidth   = lw;
  ctx.lineCap     = 'round';
  ctx.stroke();

  // Center text
  ctx.fillStyle  = col;
  ctx.font       = 'bold 26px Inter, sans-serif';
  ctx.textAlign  = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(reductionPct) + '%', cx, cy - 8);

  ctx.fillStyle  = 'rgba(255,255,255,.5)';
  ctx.font       = '11px Inter, sans-serif';
  ctx.fillText('Saved', cx, cy + 14);

  // Update text overlay
  const pctEl = $('donutPctText');
  if (pctEl) pctEl.textContent = Math.round(reductionPct) + '%';
}

/* ─── § 34  COPY REPORT ──────────────────────────────────────────────────────── */

async function copyReport() {
  if (!RESULT_DATA) { toast('No Result', 'Compress a file first', 'warn', 2500); return; }
  const d = RESULT_DATA;
  const text = [
    `IshuTools.fun — Compress PDF Report`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `File        : ${d.stem}.pdf`,
    `Original    : ${fmtBytes(d.inputSize)}`,
    `Compressed  : ${fmtBytes(d.outputSize)}`,
    `Saved       : ${d.reduction.toFixed(1)}%  (${fmtBytes(d.inputSize - d.outputSize)})`,
    `Quality     : ${d.qGrade} (${d.qScore}/100)`,
    `Engine      : ${d.engine}`,
    `Preset      : ${PRESET_INFO[d.preset]?.emoji} ${PRESET_INFO[d.preset]?.name || d.preset}`,
    `Time        : ${fmtMs(d.procMs)}`,
    `Fingerprint : ${d.fingerprint}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Tool        : https://ishutools.fun/tools/compress-pdf/`,
    `By          : Ishu Kumar (ISHUKR41/ISHUKR75)`,
  ].join('\n');

  try {
    await navigator.clipboard.writeText(text);
    toast('Report Copied!', 'Compression report copied to clipboard', 'success', 3000);
    S(SND.SUCCESS);
  } catch {
    toast('Copy Failed', 'Could not access clipboard', 'error', 3000);
  }
}

/* ─── § 35  SHARE RESULT ─────────────────────────────────────────────────────── */

async function shareResult() {
  if (!RESULT_DATA) { toast('No Result', 'Compress a file first', 'warn', 2500); return; }
  const d = RESULT_DATA;
  const text = `I compressed a PDF by ${d.reduction.toFixed(1)}% using IshuTools.fun! ` +
               `${fmtBytes(d.inputSize)} → ${fmtBytes(d.outputSize)} · Grade ${d.qGrade} · ` +
               `Free PDF compressor by Ishu Kumar`;
  const url  = 'https://ishutools.fun/tools/compress-pdf/';

  if (navigator.share) {
    try {
      await navigator.share({ title: 'IshuTools — Compress PDF', text, url });
      S(SND.SUCCESS);
      return;
    } catch {}
  }
  // Fallback: copy URL
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('Link Copied!', 'Share text copied to clipboard', 'success', 3000);
  } catch {
    toast('Share URL', url, 'info', 5000);
  }
}

function copyToolUrl() {
  const url = 'https://ishutools.fun/tools/compress-pdf/';
  navigator.clipboard?.writeText(url).then(() => {
    toast('URL Copied', url, 'success', 3000);
  }).catch(() => {
    toast('Tool URL', url, 'info', 5000);
  });
}

/* ─── § 36  QUALITY GUARANTEE TOOLTIP ───────────────────────────────────────── */

function showGuaranteeTooltip(el) {
  const cfg = PRESET_INFO[_currentPreset];
  if (!cfg) return;
  const tips = [
    cfg.description,
    `Engines: ${cfg.engines.join(', ')}`,
    `Expected savings: ${cfg.tipSave}`,
  ];
  toast(`${cfg.emoji} ${cfg.name} Guarantee`, tips.join(' · '), 'info', 6000);
}

/* ─── § 37  GLOW CARDS ───────────────────────────────────────────────────────── */

function initGlowCards() {
  document.querySelectorAll('.cp-glow-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x    = ((e.clientX - rect.left) / rect.width)  * 100;
      const y    = ((e.clientY - rect.top)  / rect.height) * 100;
      card.style.setProperty('--mx', x + '%');
      card.style.setProperty('--my', y + '%');
    });
  });
}

/* ─── § 38  COMPACT HISTORY PANEL ───────────────────────────────────────────── */

function initHistory() {
  renderHistory();
  const histBtn = $('historyBtn');
  if (histBtn) histBtn.addEventListener('click', toggleHistory);

  const clearBtn = $('clearHistBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    clearHistory();
    S(SND.CLICK);
  });

  const lbBtn = $('cpHistLbBtn');
  if (lbBtn) {
    lbBtn.addEventListener('click', () => {
      const lb = $('cpHistLeaderboard');
      if (!lb) return;
      const hidden = lb.hasAttribute('hidden');
      if (hidden) { lb.removeAttribute('hidden'); renderLeaderboard(); }
      else          lb.setAttribute('hidden', '');
      S(SND.CLICK);
    });
  }

  const csvBtn  = $('cpExportCsvBtn');
  const jsonBtn = $('cpExportJsonBtn');
  if (csvBtn)  csvBtn.addEventListener('click',  exportHistoryCsv);
  if (jsonBtn) jsonBtn.addEventListener('click', exportHistoryJson);
}

/* ─── § 39  DOMContentLoaded — ALL WIRING ────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {

  /* ── 1. Detect reduced motion preference ── */
  _reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 2. Populate DOM refs ── */
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

  /* ── 3. Initialize all modules ── */
  initTheme();
  initSoundToggle();
  initBgCanvas();
  initDropZone();
  initAdvOpts();
  initScrollTop();
  initFaq();
  initScrollReveal();
  initCounters();
  initGlowCards();
  initKeyboard();
  initMarquee();
  initClipboardPaste();
  initHistory();
  initFab();

  /* ── 4. Select default preset ── */
  selectPreset('medium');
  updateActionState();
  updateDownloadFilenamePreview();

  /* ── 5. Wire action buttons ── */
  if (D.compressBtn) D.compressBtn.addEventListener('click', doCompress);
  if (D.resetBtn)    D.resetBtn.addEventListener('click',    resetTool);
  if (D.cancelBtn)   D.cancelBtn.addEventListener('click',   cancelCompress);

  /* ── 6. Wire result buttons ── */
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
    S(SND.CLICK);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ── 7. Wire file remove button ── */
  const fiRemove = $('fiRemove');
  if (fiRemove) fiRemove.addEventListener('click', e => {
    e.stopPropagation();
    removeFile();
  });

  /* ── 8. Wire batch buttons ── */
  const batchRunBtn = $('batchRunBtn');
  if (batchRunBtn) batchRunBtn.addEventListener('click', runBatch);

  const batchDlAllBtn = $('batchDownloadAllBtn');
  if (batchDlAllBtn) batchDlAllBtn.addEventListener('click', downloadAllBatch);

  const batchClearBtn = $('batchClearBtn');
  if (batchClearBtn) batchClearBtn.addEventListener('click', () => {
    BATCH_QUEUE = [];
    updateBatchUI();
    S(SND.CLICK);
  });

  const undoBtn = $('cpUndoBtn');
  if (undoBtn) undoBtn.addEventListener('click', undoLastDelete);

  /* ── 9. Target KB quick-select buttons ── */
  document.querySelectorAll('[data-target-kb]').forEach(btn => {
    btn.addEventListener('click', () => {
      const kb = parseInt(btn.dataset.targetKb, 10);
      setTargetKb(kb);
      S(SND.CLICK);
    });
  });

  /* ── 10. Preset cards (onclick already set in HTML, but also add keyboard support) ── */
  document.querySelectorAll('.cp-preset-card').forEach(card => {
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectPreset(card.dataset.preset);
      }
    });
  });

  /* ── 11. Load canvas-confetti from CDN (lazy) ── */
  const loadConfetti = () => {
    if (_confettiLoaded) return;
    _confettiLoaded = true;
    const s  = document.createElement('script');
    s.src    = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';
    s.async  = true;
    document.head.appendChild(s);
  };
  // Load confetti when first file is uploaded or after 5s idle
  document.addEventListener('fileadded', loadConfetti, { once: true });
  setTimeout(loadConfetti, 5000);

  /* ── 12. Global expose for onclick attrs ── */
  window.selectPreset       = selectPreset;
  window.doCompress         = doCompress;
  window.resetTool          = resetTool;
  window.cancelCompress     = cancelCompress;
  window.triggerDownload    = triggerDownload;
  window.setTargetKb        = setTargetKb;
  window.applyRecommendation = applyRecommendation;
  window.downloadBatchItem  = downloadBatchItem;
  window.removeBatchItem    = removeBatchItem;
  window.undoLastDelete     = undoLastDelete;
  window.copyReport         = copyReport;
  window.shareResult        = shareResult;
  window.copyToolUrl        = copyToolUrl;
  window.showGuaranteeTooltip = showGuaranteeTooltip;
  window.handleFiles        = handleFiles;
  window.toggleHistory      = toggleHistory;
  window.clearHistory       = clearHistory;
  window.exportHistoryCsv   = exportHistoryCsv;
  window.exportHistoryJson  = exportHistoryJson;
  window.renderLeaderboard  = renderLeaderboard;
  window.fetchBenchmark     = fetchBenchmark;
  window.runBatch           = runBatch;
  window.downloadAllBatch   = downloadAllBatch;

  /* ── 13. Dev/debug helper ── */
  window._ishuDebug = {
    getState: () => ({ FILE, STEM, _currentPreset, RESULT_DATA, BATCH_QUEUE }),
    forceCompress: doCompress,
    clearHistory,
  };

});

/* ════════════════════════════════════════════════════════════════════════════════
 *   END OF script.js v60.0 MEGA EDITION
 *   IshuTools.fun — Compress PDF
 *   Author: Ishu Kumar (ISHUKR41/ISHUKR75) — ishutools.fun
 *   GitHub: https://github.com/ISHUKR41 | https://github.com/ISHUKR75
 * ════════════════════════════════════════════════════════════════════════════════
 *
 *   QUICK REFERENCE — KEYBOARD SHORTCUTS
 *   ─────────────────────────────────────
 *   1        → Lossless preset
 *   2        → High preset
 *   3        → Medium preset
 *   4        → Low preset
 *   5        → Screen preset
 *   D        → Download result
 *   Ctrl+Enter → Compress now
 *   Ctrl+Z   → Undo last batch item delete
 *   Ctrl+R   → Reset tool
 *   Escape   → Cancel compression
 *
 *   QUALITY GUARANTEE RULES
 *   ────────────────────────
 *   lossless: pikepdf DEFLATE-9 only — ZERO quality loss guaranteed
 *   high:     no image resampling, no GS — near-lossless
 *   medium:   GS ebook + fitz image-only — may reduce image DPI slightly
 *   low:      GS + fitz full — 96 DPI — for email/messaging
 *   screen:   GS /screen + fitz — 72 DPI — maximum compression
 *
 *   SOUND MAP (sounds/sounds.js)
 *   ─────────────────────────────
 *   fahhhhh              → download button click (ALWAYS)
 *   waah_kya_scene_hai   → compression success, preset change
 *   are_bhai_bhai_bhai   → file added
 *   cameraman_focus_karo → compression started
 *   eh_eh_eh_ehhhhhh     → error
 *   jaldi_waha_sa_hato   → cancel, reset, warning
 *
 *   API ENDPOINTS
 *   ─────────────
 *   POST /api/compress-pdf/compress   → main compression
 *   GET  /api/compress-pdf/progress/<job_id> → SSE progress
 *   POST /api/compress-pdf/analyze    → deep PDF analysis
 *   POST /api/compress-pdf/benchmark  → per-preset size estimates
 *   POST /api/compress-pdf/validate   → quick PDF validation
 *
 * ════════════════════════════════════════════════════════════════════════════════
 */
