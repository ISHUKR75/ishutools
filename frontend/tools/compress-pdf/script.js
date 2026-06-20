/**
 * IshuTools.fun — Compress PDF script.js v40.0
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun
 * GitHub: https://github.com/ISHUKR41 | https://github.com/ISHUKR75
 *
 * ════════════════════════════════════════════════════════════════════════════
 * v40.0 — WORLD-CLASS PDF COMPRESSION SUITE
 * ════════════════════════════════════════════════════════════════════════════
 * FEATURES:
 *   CORE:
 *   ✅ Drag-and-drop + click upload (PDF only, NO size limit)
 *   ✅ Batch file queue — multiple PDFs, sequential processing
 *   ✅ PDF deep analysis via /api/compress-pdf/analyze
 *   ✅ 5-preset quality selector (lossless/high/medium/low/screen)
 *   ✅ Target file size mode (binary-search on backend)
 *   ✅ 13 advanced option toggles + password field
 *   ✅ Quick preset combos (email/web/archive/max/print/reset)
 *   ✅ SSE real-time progress with elapsed time counter
 *   ✅ Live stage-by-stage progress breakdown
 *   ✅ Result card: grade badge, before/after, reduction bar, engine report
 *   ✅ Animated size comparison bar (before vs after)
 *   ✅ No quality auto-compromise — user's preset ALWAYS respected
 *
 *   VISUALS:
 *   ✅ Chart.js bar chart — compression savings by preset (live data)
 *   ✅ Animated background canvas (emerald floating particles + connections)
 *   ✅ Canvas confetti on success (3-burst salvo)
 *   ✅ Animated trust counters (IntersectionObserver)
 *   ✅ Smooth animated progress ring (SVG stroke-dashoffset)
 *   ✅ Preset card glow on hover/select
 *   ✅ Before/after animated reduction bar
 *   ✅ Micro-animations on all interactive elements
 *   ✅ Preset estimator panel (bar chart per preset)
 *   ✅ Compressibility score ring
 *   ✅ Benchmark bars by content type
 *   ✅ Engine availability grid
 *   ✅ CSS reveal animations (IntersectionObserver)
 *
 *   AUDIO (from local sounds folder):
 *   ✅ Download success: SOUNDS.fahhhhh
 *   ✅ Compress start: SOUNDS.cameraman_focus_karo
 *   ✅ File added: SOUNDS.are_bhai_bhai_bhai
 *   ✅ Preset change: SOUNDS.waah_kya_scene_hai
 *   ✅ Error: SOUNDS.eh_eh_eh_ehhhhhh
 *   ✅ Cancel: SOUNDS.jaldi_waha_sa_hato
 *   ✅ Click/toggle: SOUNDS.click (synthetic)
 *
 *   UX:
 *   ✅ Compression history — last 20 in localStorage
 *   ✅ History leaderboard (top savings)
 *   ✅ Export history as CSV / JSON
 *   ✅ Web Share API (mobile-native share sheet)
 *   ✅ Clipboard copy for compression report
 *   ✅ Dark/Light theme toggle with localStorage persistence
 *   ✅ Sound on/off with localStorage persistence
 *   ✅ beforeunload guard during compression
 *   ✅ Password show/hide toggle
 *   ✅ Auto-focus management after state changes
 *   ✅ Scroll-to-top button
 *   ✅ Mobile FAB button
 *   ✅ Live engine status panel
 *   ✅ Batch ZIP download
 *   ✅ Preset estimator with per-preset size estimates
 *   ✅ Download name = largest file's stem (batch) / current file (single)
 *   ✅ fahhhhh sound on EVERY download
 *   ✅ Confetti on success
 *   ✅ Mouse-tracking glow on interactive cards
 *
 *   KEYBOARD:
 *   ✅ Ctrl+Enter  — Start compression
 *   ✅ Ctrl+O      — Open file picker
 *   ✅ Escape      — Close panels / cancel
 *   ✅ H           — Toggle history panel
 *   ✅ R           — Reset tool
 *   ✅ T           — Toggle theme
 *   ✅ S           — Toggle sound
 *   ✅ ?           — Show keyboard shortcuts
 *   ✅ ↑/↓         — Navigate presets
 *   ✅ Ctrl+Z      — Undo last batch item removal
 *
 *   ACCESSIBILITY:
 *   ✅ aria-live regions for progress and results
 *   ✅ aria-checked on preset buttons
 *   ✅ aria-expanded on collapsible panels
 *   ✅ Focus management after modal open/close
 *   ✅ Screen reader announcements for all state changes
 *   ✅ Reduced motion support
 *
 *   PERFORMANCE:
 *   ✅ requestAnimationFrame particle loop (pauses on hidden tab)
 *   ✅ Passive event listeners on scroll/resize
 *   ✅ Debounced resize handler
 *   ✅ IntersectionObserver for counter animation (fires once)
 *   ✅ Lazy Chart.js init on first result
 *   ✅ Lazy canvas-confetti CDN load
 */

'use strict';

/* ════════════════════════════════════════════════════════════════════════════
   MODULE-SCOPE STATE
════════════════════════════════════════════════════════════════════════════ */
let FILE            = null;   // Primary selected File object
let STEM            = '';     // Filename stem (no extension)
let JOB_ID          = '';     // SSE job identifier
let SSE_SOURCE      = null;   // EventSource instance
let SSE_TIMER       = null;   // setInterval fallback progress
let COMPRESS_DONE   = false;  // True after compression completes
let RESULT_DATA     = null;   // Last compression result
let ANALYSIS_DATA   = null;   // Last analysis result
let CHART_INSTANCE  = null;   // Chart.js instance
let _t0             = 0;      // Compression start timestamp ms
let _timerInterval  = null;   // Elapsed time interval
let _confettiLoaded = false;  // Lazy-loaded confetti
let _reduced        = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let _currentPreset  = 'medium'; // Currently selected preset

// Batch queue state
let BATCH_QUEUE     = [];     // [{file, id, status, result, stem}]
let BATCH_ACTIVE    = false;
let BATCH_IDX       = 0;
let BATCH_LARGEST   = null;   // Largest file (for download name)
let BATCH_ZIP_PARTS = [];     // Collected blobs for ZIP

// DOM refs (populated in DOMContentLoaded)
let D = null;

// History
const HISTORY_KEY = 'cp-history-v4';
const HISTORY_MAX = 20;

// Progress stages for display
const PROGRESS_STAGES = [
  { pct:  5, label: 'Initialising…',         sub: 'Loading compression engines' },
  { pct: 12, label: 'Analysing PDF…',         sub: 'Scanning images, fonts, streams' },
  { pct: 25, label: 'Engine 1: pikepdf…',     sub: 'Lossless stream recompression' },
  { pct: 38, label: 'Engine 2: Ghostscript…', sub: 'Applying distiller preset' },
  { pct: 50, label: 'Engine 3: PyMuPDF…',     sub: 'Image DPI optimisation' },
  { pct: 62, label: 'Engine 4: qpdf…',        sub: 'Stream linearisation' },
  { pct: 72, label: 'Engines 5–8…',           sub: 'Pillow, mutool, dedup, content streams' },
  { pct: 84, label: 'Engines 9–12…',          sub: 'Chain passes — picking best result' },
  { pct: 93, label: 'Post-processing…',       sub: 'Applying advanced options' },
  { pct: 98, label: 'Finalising…',            sub: 'Verifying output & preparing download' },
];

// Preset display info
const PRESET_INFO = {
  lossless: { emoji:'🔮', color:'#8b5cf6', name:'Lossless',    est:'2–25%' },
  high:     { emoji:'💎', color:'#10b981', name:'High',        est:'10–40%' },
  medium:   { emoji:'⚖️', color:'#6366f1', name:'Medium',      est:'40–65%' },
  low:      { emoji:'📧', color:'#f59e0b', name:'Low',         est:'55–78%' },
  screen:   { emoji:'🔥', color:'#ef4444', name:'Screen',      est:'75–92%' },
};

const PRESET_ORDER = ['lossless','high','medium','low','screen'];

/* ════════════════════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
════════════════════════════════════════════════════════════════════════════ */

/** Format bytes → human-readable */
function fmtBytes(b) {
  if (b == null || isNaN(b) || b < 0) return '—';
  if (b === 0) return '0 B';
  const u = ['B','KB','MB','GB','TB'];
  const i = Math.min(Math.floor(Math.log(Math.abs(b)) / Math.log(1024)), u.length - 1);
  const v = b / Math.pow(1024, i);
  return (i === 0 ? v : v < 10 ? v.toFixed(2) : v.toFixed(1)) + '\u202F' + u[i];
}

/** Format milliseconds → human-readable */
function fmtMs(ms) {
  if (ms == null || isNaN(ms)) return '—';
  if (ms < 1000) return ms + '\u202Fms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return Math.floor(ms / 60000) + 'm\u202F' + Math.floor((ms % 60000) / 1000) + 's';
}

/** Format elapsed seconds */
function fmtElapsed(s) {
  if (s < 60) return s.toFixed(1) + 's';
  return Math.floor(s / 60) + 'm\u202F' + Math.floor(s % 60) + 's';
}

/** Percentage reduction (never negative) */
function calcReduction(inSz, outSz) {
  if (!inSz || !outSz || outSz >= inSz) return 0;
  return Math.round((1 - outSz / inSz) * 1000) / 10;
}

/** Extract filename stem (no extension) */
function getStem(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Clamp value */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Debounce */
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Safe localStorage get */
function lsGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Safe localStorage set */
function lsSet(key, val) {
  try { localStorage.setItem(key, val); } catch {}
}

/** Screen reader announcement */
function announce(msg, priority = 'polite') {
  const el = document.getElementById('cp-sr-announce');
  if (!el) return;
  el.setAttribute('aria-live', priority);
  el.textContent = '';
  setTimeout(() => { el.textContent = msg; }, 50);
}

/** Safe sound call */
function S(key) {
  try {
    if (window.SOUNDS && typeof window.SOUNDS[key] === 'function') {
      window.SOUNDS[key]();
    }
  } catch (_) {}
}

/** Easy element getter */
function $(id) { return document.getElementById(id); }

/** Easings */
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutQuad(t) { return t < .5 ? 2*t*t : -1+(4-2*t)*t; }

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
      colors: ['#10b981','#34d399','#6ee7b7','#ffffff','#6366f1','#a78bfa','#f59e0b','#ec4899'],
      disableForReducedMotion: true,
      gravity: 0.9,
    };
    confetti({ ...opts, particleCount: 120, spread: 70,  origin: { y: 0.6 } });
    setTimeout(() => confetti({ ...opts, particleCount: 80, spread: 110, angle: 55,  origin: { x: 0, y: 0.6 } }), 250);
    setTimeout(() => confetti({ ...opts, particleCount: 80, spread: 110, angle: 125, origin: { x: 1, y: 0.6 } }), 400);
    setTimeout(() => confetti({ ...opts, particleCount: 50, spread: 60,  origin: { y: 0.4 } }), 700);
  } catch(_) { _cssConfettiFallback(); }
}

function _cssConfettiFallback() {
  if (_reduced) return;
  const colors = ['#10b981','#34d399','#6366f1','#f59e0b','#ef4444','#8b5cf6','#ec4899'];
  for (let i = 0; i < 22; i++) {
    const el = document.createElement('div');
    el.className = 'cp-confetti-p';
    el.style.cssText = `
      left:${5 + Math.random() * 90}%;
      background:${colors[i % colors.length]};
      animation-duration:${0.9 + Math.random() * 0.8}s;
      animation-delay:${Math.random() * 0.5}s;
      width:${6 + Math.random() * 7}px;
      height:${6 + Math.random() * 7}px;
      border-radius:${Math.random() > 0.5 ? '50%' : '3px'};
    `;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   NUMBER ANIMATION
════════════════════════════════════════════════════════════════════════════ */
function animateNumber(el, start, end, dur = 900, fmt = v => Math.round(v)) {
  if (!el || _reduced) { if (el) el.textContent = fmt(end); return; }
  const t0 = performance.now();
  function tick(now) {
    const p = clamp((now - t0) / dur, 0, 1);
    const e = easeInOutQuad(p);
    el.textContent = fmt(start + (end - start) * e);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ════════════════════════════════════════════════════════════════════════════
   PROGRESS RING
════════════════════════════════════════════════════════════════════════════ */
function setProgressRing(pct) {
  const ring = document.querySelector('.cp-progress-ring-fill');
  if (!ring) return;
  const r    = 50;
  const circ = 2 * Math.PI * r;
  ring.style.strokeDasharray  = circ;
  ring.style.strokeDashoffset = circ - (clamp(pct, 0, 100) / 100) * circ;
}

/* ════════════════════════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
════════════════════════════════════════════════════════════════════════════ */
function toast(title, sub = '', type = 'info', dur = 4000) {
  if (!D?.toastWrap) return;
  const icons = {
    success: 'fa-check-circle',
    error:   'fa-times-circle',
    warn:    'fa-exclamation-triangle',
    info:    'fa-info-circle',
  };
  const el = document.createElement('div');
  el.className = `cp-toast cp-toast-${type}`;
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <i class="fa ${icons[type] || icons.info} cp-toast-icon" aria-hidden="true"></i>
    <div class="cp-toast-body">
      <div class="cp-toast-title">${title}</div>
      ${sub ? `<div class="cp-toast-sub">${sub}</div>` : ''}
    </div>
    <button class="cp-toast-close" aria-label="Dismiss">
      <i class="fa fa-times" aria-hidden="true"></i>
    </button>`;
  D.toastWrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));

  function dismiss() {
    el.classList.remove('visible');
    el.classList.add('cp-toast-out');
    setTimeout(() => el.remove(), 380);
  }
  el.querySelector('.cp-toast-close').addEventListener('click', dismiss);
  el.addEventListener('click', e => {
    if (!el.querySelector('.cp-toast-close').contains(e.target)) dismiss();
  });
  if (dur > 0) setTimeout(dismiss, dur);
  return el;
}

/* ════════════════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS MODAL
════════════════════════════════════════════════════════════════════════════ */
function showShortcutsModal() {
  const existing = document.getElementById('cp-shortcuts-modal');
  if (existing) { existing.remove(); return; }
  const modal = document.createElement('div');
  modal.id = 'cp-shortcuts-modal';
  modal.className = 'cp-shortcuts-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', 'Keyboard Shortcuts');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="cp-shortcuts-card">
      <div class="cp-shortcuts-header">
        <h3><i class="fa fa-keyboard" aria-hidden="true"></i> Keyboard Shortcuts</h3>
        <button class="cp-shortcuts-close" aria-label="Close">
          <i class="fa fa-times" aria-hidden="true"></i>
        </button>
      </div>
      <ul class="cp-shortcuts-list">
        <li><kbd>Ctrl</kbd>+<kbd>Enter</kbd><span>Start compression</span></li>
        <li><kbd>Ctrl</kbd>+<kbd>O</kbd><span>Open file picker</span></li>
        <li><kbd>Esc</kbd><span>Close panels / cancel</span></li>
        <li><kbd>H</kbd><span>Toggle history panel</span></li>
        <li><kbd>R</kbd><span>Reset tool</span></li>
        <li><kbd>T</kbd><span>Toggle dark/light theme</span></li>
        <li><kbd>S</kbd><span>Toggle sounds on/off</span></li>
        <li><kbd>?</kbd><span>Toggle this shortcuts panel</span></li>
        <li><kbd>↑</kbd><kbd>↓</kbd><span>Navigate presets</span></li>
        <li><kbd>Ctrl</kbd>+<kbd>Z</kbd><span>Undo last batch removal</span></li>
      </ul>
      <p class="cp-shortcuts-tip">
        <i class="fa fa-lightbulb" aria-hidden="true"></i>
        Tip: Press <kbd>?</kbd> at any time to toggle this panel.
      </p>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('.cp-shortcuts-close').addEventListener('click', () => {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 280);
  });
  modal.addEventListener('click', e => {
    if (e.target === modal) {
      modal.classList.remove('visible');
      setTimeout(() => modal.remove(), 280);
    }
  });
  setTimeout(() => modal.classList.add('visible'), 10);

  // Trap focus inside modal
  const focusable = modal.querySelectorAll('button, [tabindex="0"]');
  if (focusable[0]) focusable[0].focus();
}

/* ════════════════════════════════════════════════════════════════════════════
   THEME & SOUND
════════════════════════════════════════════════════════════════════════════ */
function initTheme() {
  const saved = lsGet('cp-theme');
  const sys   = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  setTheme(saved || sys);
  // Listen for OS theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!lsGet('cp-theme')) setTheme(e.matches ? 'dark' : 'light');
  });
}

function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  if (D) {
    D.themeIcon.className  = t === 'dark' ? 'fa fa-moon' : 'fa fa-sun';
    D.themeToggle.title    = `Switch to ${t === 'dark' ? 'light' : 'dark'} mode`;
    D.themeToggle.setAttribute('aria-label', D.themeToggle.title);
    D.themeToggle.setAttribute('aria-pressed', t === 'light' ? 'true' : 'false');
  }
  lsSet('cp-theme', t);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  setTheme(cur === 'dark' ? 'light' : 'dark');
  S('click');
}

function initSoundToggle() {
  const on = window.SOUNDS ? window.SOUNDS.isEnabled() : true;
  updateSoundIcon(on);
}

function updateSoundIcon(on) {
  if (!D) return;
  D.soundIcon.className = on ? 'fa fa-volume-up' : 'fa fa-volume-mute';
  D.soundToggle.title   = on ? 'Mute sounds' : 'Unmute sounds';
  D.soundToggle.setAttribute('aria-label', D.soundToggle.title);
  D.soundToggle.setAttribute('aria-pressed', String(on));
}

function toggleSound() {
  if (!window.SOUNDS) return;
  const newOn = !window.SOUNDS.isEnabled();
  window.SOUNDS.setEnabled(newOn);
  updateSoundIcon(newOn);
  if (newOn) S('click');
}

/* ════════════════════════════════════════════════════════════════════════════
   ANIMATED BACKGROUND CANVAS
════════════════════════════════════════════════════════════════════════════ */
function initBgCanvas() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas || _reduced) return;
  const ctx = canvas.getContext('2d');
  const PARTICLE_COUNT = 55;
  const particles = [];
  let rafId;
  let mouseX = -9999, mouseY = -9999;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  class Particle {
    constructor() { this.reset(true); }
    reset(init) {
      this.x     = Math.random() * window.innerWidth;
      this.y     = init ? Math.random() * window.innerHeight : window.innerHeight + 15;
      this.r     = Math.random() * 2.2 + 0.5;
      this.vx    = (Math.random() - 0.5) * 0.22;
      this.vy    = -(Math.random() * 0.42 + 0.1);
      this.op    = Math.random() * 0.2 + 0.04;
      this.phase = Math.random() * Math.PI * 2;
      this.pulse = Math.random() * 0.028 + 0.01;
      this.hue   = Math.random() > 0.78 ? 240 : 160;
    }
    update() {
      this.x     += this.vx;
      this.y     += this.vy;
      this.phase += this.pulse;
      const dx   = this.x - mouseX;
      const dy   = this.y - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 90) {
        const f = (90 - dist) / 90 * 0.28;
        this.x += (dx / dist) * f;
        this.y += (dy / dist) * f;
      }
      if (this.y < -15 || this.x < -15 || this.x > window.innerWidth + 15) this.reset(false);
    }
    draw(c) {
      c.beginPath();
      c.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      const alpha = this.op * (0.6 + 0.4 * Math.sin(this.phase));
      c.fillStyle = this.hue === 160
        ? `rgba(16,185,129,${alpha})`
        : `rgba(99,102,241,${alpha * 0.75})`;
      c.fill();
    }
  }

  function drawConnections() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx   = particles[i].x - particles[j].x;
        const dy   = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(16,185,129,${0.05 * (1 - dist / 120)})`;
          ctx.lineWidth   = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  resize();
  window.addEventListener('resize', debounce(resize, 200), { passive: true });
  window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; }, { passive: true });
  window.addEventListener('mouseleave', () => { mouseX = -9999; mouseY = -9999; }, { passive: true });

  for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new Particle());

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawConnections();
    particles.forEach(p => { p.update(); p.draw(ctx); });
    rafId = requestAnimationFrame(loop);
  }
  loop();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(rafId);
    else loop();
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   MOUSE-TRACKING GLOW CARDS
════════════════════════════════════════════════════════════════════════════ */
function initGlowCards() {
  document.querySelectorAll('.cp-glow-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r  = card.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width * 100).toFixed(1);
      const my = ((e.clientY - r.top) / r.height * 100).toFixed(1);
      card.style.setProperty('--mx', mx + '%');
      card.style.setProperty('--my', my + '%');
    }, { passive: true });
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   SCROLL REVEAL
════════════════════════════════════════════════════════════════════════════ */
function initScrollReveal() {
  if (_reduced) {
    document.querySelectorAll('.cp-reveal').forEach(el => el.classList.add('revealed'));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('revealed'), i * 80);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.cp-reveal').forEach(el => io.observe(el));
}

/* ════════════════════════════════════════════════════════════════════════════
   COUNTER ANIMATION (trust stats)
════════════════════════════════════════════════════════════════════════════ */
function initCounters() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el   = entry.target;
      const end  = parseInt(el.dataset.count, 10);
      const suf  = el.dataset.suffix || '';
      const pre  = el.dataset.prefix || '';
      if (isNaN(end)) return;
      io.unobserve(el);
      animateNumber(el, 0, end, 1800, v => pre + Math.round(v).toLocaleString() + suf);
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('[data-count]').forEach(el => io.observe(el));
}

/* ════════════════════════════════════════════════════════════════════════════
   FAQ ACCORDION
════════════════════════════════════════════════════════════════════════════ */
function initFaq() {
  document.querySelectorAll('.cp-faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      // Close all
      document.querySelectorAll('.cp-faq-q').forEach(b => {
        b.setAttribute('aria-expanded', 'false');
      });
      // Open this one if it was closed
      if (!isOpen) {
        btn.setAttribute('aria-expanded', 'true');
      }
      S('click');
    });
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   COMPRESSION HISTORY
════════════════════════════════════════════════════════════════════════════ */
function loadHistory() {
  try { return JSON.parse(lsGet(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(hist) {
  try { lsSet(HISTORY_KEY, JSON.stringify(hist.slice(0, HISTORY_MAX))); } catch {}
}
function addToHistory(entry) {
  const hist = loadHistory();
  hist.unshift({
    id:           Date.now(),
    filename:     entry.filename     || 'document.pdf',
    preset:       entry.preset       || 'medium',
    inputSize:    entry.inputSize    || 0,
    outputSize:   entry.outputSize   || 0,
    reductionPct: entry.reductionPct || 0,
    grade:        entry.grade        || 'B',
    engine:       entry.engine       || '—',
    timeMs:       entry.timeMs       || 0,
    ts:           new Date().toISOString(),
  });
  saveHistory(hist);
}
function clearHistory() {
  saveHistory([]);
  renderHistory();
  toast('History cleared', 'All records removed.', 'info', 2500);
}

const GRADE_COLORS = { S:'#10b981', A:'#34d399', B:'#6366f1', C:'#f59e0b', D:'#ef4444', F:'#dc2626' };

function renderHistory() {
  const panel = $('historyPanel');
  const list  = $('historyList');
  const count = $('historyCount');
  if (!panel || !list) return;
  const hist = loadHistory();
  if (count) count.textContent = hist.length;
  if (hist.length === 0) {
    list.innerHTML = `<div class="cp-hist-empty">
      <i class="fa fa-history" aria-hidden="true"></i>
      <p>No compressions yet</p>
      <small>Your compression history will appear here</small>
    </div>`;
    return;
  }
  list.innerHTML = hist.map((h, idx) => {
    const gc   = GRADE_COLORS[h.grade] || '#94a3b8';
    const date = new Date(h.ts).toLocaleDateString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    const pi   = PRESET_INFO[h.preset] || { emoji:'⚙️', name: h.preset };
    return `<div class="cp-hist-item" data-idx="${idx}" tabindex="0" role="button"
        aria-label="${h.filename} — ${h.reductionPct.toFixed(1)}% reduction"
        style="animation-delay:${idx*30}ms">
      <div class="cp-hist-grade" style="background:${gc}22;color:${gc};border:1.5px solid ${gc}44">
        ${h.grade}
      </div>
      <div class="cp-hist-info">
        <div class="cp-hist-name" title="${h.filename}">${h.filename}</div>
        <div class="cp-hist-meta">
          <span>${pi.emoji} ${pi.name}</span>
          <span class="cp-hist-pct">${h.reductionPct.toFixed(1)}% saved</span>
          <span>${fmtBytes(h.inputSize)} → ${fmtBytes(h.outputSize)}</span>
          <span>${fmtMs(h.timeMs)}</span>
          <span style="color:var(--t5)">${date}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  // Click handlers for hist items
  list.querySelectorAll('.cp-hist-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.idx, 10);
      const h   = loadHistory()[idx];
      if (h) {
        toast(h.filename, `${h.reductionPct.toFixed(1)}% saved · ${fmtBytes(h.inputSize)} → ${fmtBytes(h.outputSize)}`, 'info', 5000);
      }
    });
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') item.click();
    });
  });
}

/* Leaderboard */
function renderLeaderboard() {
  const wrap = $('cpHistLeaderboard');
  if (!wrap) return;
  const hist  = loadHistory();
  const top5  = [...hist].sort((a,b) => b.reductionPct - a.reductionPct).slice(0, 5);
  if (top5.length === 0) { wrap.innerHTML = '<p style="color:var(--t4);font-size:.8rem">No data yet.</p>'; return; }
  wrap.innerHTML = `
    <div style="font-size:.8rem;font-weight:700;color:var(--t3);margin-bottom:.5rem;display:flex;align-items:center;gap:.5rem">
      <i class="fa fa-trophy" style="color:var(--am)"></i> Top Compression Saves
    </div>
    ${top5.map((h, i) => {
      const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
      return `<div style="display:flex;align-items:center;gap:.5rem;padding:.3rem 0;border-bottom:1px solid var(--bdr);font-size:.78rem;color:var(--t3)">
        <span>${medals[i]}</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.filename}</span>
        <span style="color:var(--em);font-weight:700;flex-shrink:0">${h.reductionPct.toFixed(1)}%</span>
        <span style="color:var(--t5);flex-shrink:0">${fmtBytes(h.inputSize)} → ${fmtBytes(h.outputSize)}</span>
      </div>`;
    }).join('')}`;
}

/* Export history as CSV */
function exportHistoryCsv() {
  const hist = loadHistory();
  if (!hist.length) { toast('No history to export', '', 'warn'); return; }
  const headers = 'Filename,Preset,Input Size,Output Size,Reduction %,Grade,Engine,Time ms,Date';
  const rows = hist.map(h =>
    [h.filename, h.preset, h.inputSize, h.outputSize,
     h.reductionPct.toFixed(1), h.grade, h.engine, h.timeMs, h.ts].join(',')
  );
  const csv = [headers, ...rows].join('\n');
  _dlText(csv, 'ishutools-compress-history.csv', 'text/csv');
  toast('CSV exported!', 'compression history', 'success', 2500);
  S('fahhhhh');
}

/* Export history as JSON */
function exportHistoryJson() {
  const hist = loadHistory();
  if (!hist.length) { toast('No history to export', '', 'warn'); return; }
  _dlText(JSON.stringify(hist, null, 2), 'ishutools-compress-history.json', 'application/json');
  toast('JSON exported!', 'compression history', 'success', 2500);
  S('fahhhhh');
}

function _dlText(content, name, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ════════════════════════════════════════════════════════════════════════════
   FILE HANDLING & DROP ZONE
════════════════════════════════════════════════════════════════════════════ */
function initDropZone() {
  if (!D.dropZone || !D.fileInput) return;

  // Click anywhere on drop zone triggers file picker
  D.dropZone.addEventListener('click', e => {
    e.stopPropagation();
    D.fileInput.click();
  });

  // Browse link
  const browseLink = D.dropZone.querySelector('.cp-drop-link');
  if (browseLink) {
    browseLink.addEventListener('click', e => {
      e.stopPropagation();
      D.fileInput.click();
    });
    browseLink.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); D.fileInput.click(); }
    });
  }

  // Drag events
  ['dragenter','dragover'].forEach(evt => {
    D.dropZone.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation();
      D.dropZone.classList.add('drag-over');
    }, { passive: false });
  });
  ['dragleave','dragend'].forEach(evt => {
    D.dropZone.addEventListener(evt, e => {
      if (!D.dropZone.contains(e.relatedTarget)) {
        D.dropZone.classList.remove('drag-over');
      }
    });
  });
  D.dropZone.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    D.dropZone.classList.remove('drag-over');
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (files.length) handleFiles(files);
    else toast('PDF files only', 'Please drop a valid PDF file.', 'warn');
  }, { passive: false });

  // Keyboard activate
  D.dropZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); D.fileInput.click(); }
  });

  // File input change
  D.fileInput.addEventListener('change', () => {
    const files = [...(D.fileInput.files || [])].filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (files.length) handleFiles(files);
    D.fileInput.value = '';
  });
}

function handleFiles(files) {
  if (!files || files.length === 0) return;

  if (files.length === 1) {
    handleSingleFile(files[0]);
  } else {
    handleBatchFiles(files);
  }
}

function handleSingleFile(file) {
  FILE = file;
  STEM = getStem(file.name);

  // Reset batch state if switching to single
  BATCH_QUEUE = [];
  BATCH_LARGEST = null;

  showFileInfo(file);
  S('are_bhai_bhai_bhai');
  announce(`File selected: ${file.name}, ${fmtBytes(file.size)}`);
  updateActionState();
  updateFab();

  // Auto-scroll to presets
  setTimeout(() => {
    D.toolInner?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 200);

  // Run analysis
  runAnalysis(file);
}

function handleBatchFiles(files) {
  const sorted = [...files].sort((a, b) => b.size - a.size);
  FILE = sorted[0];
  STEM = getStem(sorted[0].name);
  BATCH_LARGEST = sorted[0];

  BATCH_QUEUE = sorted.map((f, i) => ({
    file: f,
    id:   `batch-${Date.now()}-${i}`,
    status: 'pending',
    result: null,
    stem: getStem(f.name),
  }));

  showFileInfo(sorted[0]);
  showBatchPanel();
  S('are_bhai_bhai_bhai');
  toast(`${files.length} PDFs queued`, `Batch compression ready. Largest: ${fmtBytes(sorted[0].size)}`, 'info', 4000);
  announce(`${files.length} files added for batch compression.`);
  updateActionState();
  updateFab();
  runAnalysis(sorted[0]);
}

function showFileInfo(file) {
  if (!D.fileInfo) return;
  D.fileInfo.removeAttribute('hidden');
  const nameEl = $('fiName');
  const sizeEl = $('fiSize');
  const typeEl = $('fiType');
  const pagesEl = $('fiPages');
  const versionEl = $('fiVersion');

  if (nameEl) nameEl.textContent   = file.name;
  if (sizeEl) sizeEl.innerHTML     = `<i class="fa fa-weight-hanging" aria-hidden="true"></i> ${fmtBytes(file.size)}`;
  if (typeEl) typeEl.innerHTML     = `<i class="fa fa-tag" aria-hidden="true"></i> PDF`;
  if (pagesEl) pagesEl.innerHTML   = `<i class="fa fa-file-pdf" aria-hidden="true"></i> Calculating…`;
  if (versionEl) versionEl.innerHTML = `<i class="fa fa-code" aria-hidden="true"></i> —`;

  // Hide chips & recommendation
  const chips = $('fiChips');
  const rec   = $('recBanner');
  if (chips) chips.setAttribute('hidden', '');
  if (rec)   rec.setAttribute('hidden', '');

  // Reset chart
  const cw = $('chartWrap');
  if (cw)  cw.setAttribute('hidden', '');

  // Reset score/bench panels
  const scr = $('cpScoreRing');
  const bb  = $('cpBenchBars');
  const eg  = $('cpEngineGrid');
  const est = $('presetEstPanel');
  if (scr) scr.setAttribute('hidden', '');
  if (bb)  bb.setAttribute('hidden', '');
  if (eg)  eg.setAttribute('hidden', '');
  if (est) est.setAttribute('hidden', '');
}

function removeFile() {
  FILE = null;
  STEM = '';
  BATCH_QUEUE = [];
  BATCH_LARGEST = null;
  ANALYSIS_DATA = null;
  COMPRESS_DONE = false;
  RESULT_DATA   = null;

  if (D.fileInfo)    D.fileInfo.setAttribute('hidden', '');
  if (D.resultWrap)  D.resultWrap.setAttribute('hidden', '');
  if (D.progressWrap) D.progressWrap.setAttribute('hidden', '');
  hideBatchPanel();
  closeSSE();

  const cw = $('chartWrap');
  if (cw) cw.setAttribute('hidden', '');
  const est = $('presetEstPanel');
  if (est) est.setAttribute('hidden', '');
  const scr = $('cpScoreRing');
  if (scr) scr.setAttribute('hidden', '');

  updateActionState();
  updateFab();
  D.dropZone?.removeAttribute('hidden');
  D.dropZone?.focus();
  S('jaldi_waha_sa_hato');
  announce('File removed. Ready for new upload.');
}

/* ════════════════════════════════════════════════════════════════════════════
   PDF ANALYSIS
════════════════════════════════════════════════════════════════════════════ */
async function runAnalysis(file) {
  const analyzeBar  = $('fiAnalyze');
  const analyzeFill = $('analyzeFill');
  const chips       = $('fiChips');

  if (analyzeBar) analyzeBar.removeAttribute('hidden');

  // Animate the analysis bar
  let fakePct = 0;
  const fakeInterval = setInterval(() => {
    fakePct = Math.min(fakePct + Math.random() * 12 + 3, 90);
    if (analyzeFill) analyzeFill.style.width = fakePct + '%';
  }, 200);

  try {
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch('/api/compress-pdf/analyze', { method: 'POST', body: fd });
    clearInterval(fakeInterval);
    if (analyzeFill) analyzeFill.style.width = '100%';
    setTimeout(() => { if (analyzeBar) analyzeBar.setAttribute('hidden', ''); }, 600);

    if (!resp.ok) throw new Error('Analysis failed');
    const data = await resp.json();
    ANALYSIS_DATA = data;

    updateFileInfoFromAnalysis(data);
    showAnalysisChips(data);
    showRecommendation(data);
    renderPresetEstimator(data);
    renderScoreRing(data);
    renderBenchBars(data);
    updatePresetEstimates(data);
    renderChart(data);

  } catch (err) {
    clearInterval(fakeInterval);
    if (analyzeBar) analyzeBar.setAttribute('hidden', '');
  }
}

function updateFileInfoFromAnalysis(data) {
  const pagesEl   = $('fiPages');
  const versionEl = $('fiVersion');
  if (pagesEl)   pagesEl.innerHTML   = `<i class="fa fa-file-pdf" aria-hidden="true"></i> ${data.page_count || '?'} page${data.page_count !== 1 ? 's' : ''}`;
  if (versionEl) versionEl.innerHTML = `<i class="fa fa-code" aria-hidden="true"></i> PDF ${data.pdf_version || '?'}`;
}

function showAnalysisChips(data) {
  const chips  = $('fiChips');
  if (!chips) return;
  chips.removeAttribute('hidden');

  const imgCount  = data.image_count || 0;
  const compScore = data.compressibility || data.compressibility_score || 0;
  const pdfType   = data.pdf_type || data.content_type || 'Unknown';
  const warn      = data.is_encrypted ? 'Encrypted' : (data.has_javascript ? 'Has JavaScript' : null);

  const chipImg  = $('chipImgVal');
  const chipComp = $('chipCompVal');
  const chipType = $('chipTypeVal');
  const chipWarn = $('chipWarn');
  const chipWarnV = $('chipWarnVal');

  if (chipImg)  chipImg.textContent  = imgCount + (imgCount === 1 ? ' image' : ' images');
  if (chipComp) {
    const pct = typeof compScore === 'number' ? Math.round(compScore) : compScore;
    chipComp.textContent = pct + '% potential';
    if (typeof pct === 'number') {
      chipComp.parentElement.style.setProperty('--chip-color', pct > 60 ? 'var(--em)' : pct > 30 ? 'var(--am)' : 'var(--rd)');
    }
  }
  if (chipType) chipType.textContent = pdfType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  if (chipWarn && chipWarnV) {
    if (warn) {
      chipWarn.removeAttribute('hidden');
      chipWarnV.textContent = warn;
    } else {
      chipWarn.setAttribute('hidden', '');
    }
  }
}

function showRecommendation(data) {
  const banner  = $('recBanner');
  const recText = $('recText');
  if (!banner || !recText) return;

  const rec = data.recommended_preset || data.recommendations?.[0];
  if (!rec) return;

  const pi = PRESET_INFO[rec] || { emoji:'⚙️', name: rec };
  const estArr = data.estimated_reductions_by_preset || {};
  const estPct = estArr[rec];
  let msg = `<strong>${pi.emoji} Recommended preset: ${pi.name}</strong>`;
  if (estPct) msg += ` — estimated <strong>${typeof estPct === 'number' ? Math.round(estPct) : estPct}%</strong> reduction for this file.`;

  recText.innerHTML = msg;
  banner.removeAttribute('hidden');

  // Auto-select recommended preset (only if user hasn't changed)
  if (_currentPreset === 'medium' && rec && PRESET_INFO[rec]) {
    selectPreset(rec, true);
  }
}

function renderPresetEstimator(data) {
  const est   = $('presetEstPanel');
  if (!est) return;
  const ests  = data.estimated_reductions_by_preset || {};
  if (!Object.keys(ests).length) return;

  const rows = PRESET_ORDER.map(p => {
    const pct  = typeof ests[p] === 'number' ? ests[p] : 0;
    const pi   = PRESET_INFO[p];
    const sz   = FILE ? Math.round(FILE.size * (1 - pct / 100)) : 0;
    return `<div class="cp-pest-row">
      <span class="cp-pest-name" style="color:${pi.color}">${pi.emoji} ${pi.name}</span>
      <div class="cp-pest-bar-wrap">
        <div class="cp-pest-bar" style="width:${pct}%;background:${pi.color}"></div>
      </div>
      <span class="cp-pest-pct" style="color:${pi.color}">~${Math.round(pct)}%</span>
      <span class="cp-pest-size">${fmtBytes(sz)}</span>
    </div>`;
  }).join('');

  est.innerHTML = `
    <div style="font-size:.8rem;font-weight:700;color:var(--t3);margin-bottom:.75rem;display:flex;align-items:center;gap:.5rem">
      <i class="fa fa-chart-bar" style="color:var(--em)"></i>
      Estimated Size After Compression
    </div>
    ${rows}`;
  est.removeAttribute('hidden');
}

function renderScoreRing(data) {
  const wrap = $('cpScoreRing');
  if (!wrap) return;
  const score = typeof data.compressibility === 'number' ? data.compressibility
    : typeof data.compressibility_score === 'number' ? data.compressibility_score : 0;
  const rounded = Math.round(score);
  const circ = 2 * Math.PI * 28;
  const dash = circ - (clamp(rounded, 0, 100) / 100) * circ;
  const color = rounded > 60 ? '#10b981' : rounded > 30 ? '#f59e0b' : '#ef4444';
  const label = rounded > 70 ? 'Very compressible' : rounded > 45 ? 'Good potential' : rounded > 20 ? 'Low potential' : 'Already optimised';

  wrap.innerHTML = `
    <div class="cp-score-ring-wrap" style="position:relative">
      <svg width="80" height="80" style="transform:rotate(-90deg)">
        <defs>
          <linearGradient id="scRingGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:${color}"/>
            <stop offset="100%" style="stop-color:${color}88"/>
          </linearGradient>
        </defs>
        <circle class="cp-score-ring-bg" cx="40" cy="40" r="28"/>
        <circle class="cp-score-ring-fill" cx="40" cy="40" r="28"
          stroke="url(#scRingGrad)"
          style="stroke-dasharray:${circ.toFixed(1)};stroke-dashoffset:${dash.toFixed(1)}"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <span style="font-family:var(--font-head);font-size:1.1rem;font-weight:900;color:${color}">${rounded}</span>
        <span style="font-size:.58rem;color:var(--t5)">/ 100</span>
      </div>
    </div>
    <div class="cp-score-info">
      <div class="cp-score-info-title">Compressibility Score</div>
      <div class="cp-score-info-desc">${label}. ${data.pdf_type ? 'Type: <strong>' + data.pdf_type.replace(/_/g,' ') + '</strong>.' : ''} ${data.image_count ? data.image_count + ' images detected.' : ''}</div>
    </div>`;
  wrap.removeAttribute('hidden');
}

function renderBenchBars(data) {
  const wrap = $('cpBenchBars');
  if (!wrap) return;
  const ests = data.estimated_reductions_by_preset || {};
  if (!Object.keys(ests).length) { wrap.setAttribute('hidden', ''); return; }

  const rows = PRESET_ORDER.map(p => {
    const pct  = typeof ests[p] === 'number' ? Math.round(ests[p]) : 0;
    const pi   = PRESET_INFO[p];
    return `<div class="cp-bench-row">
      <span class="cp-bench-label" style="color:${pi.color}">${pi.name}</span>
      <div class="cp-bench-bar-wrap">
        <div class="cp-bench-bar" style="width:0%;background:${pi.color}" data-target="${pct}"></div>
      </div>
      <span class="cp-bench-val" style="color:${pi.color}">${pct}%</span>
    </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="cp-bench-title"><i class="fa fa-chart-line"></i> Expected Reduction by Preset</div>
    ${rows}`;
  wrap.removeAttribute('hidden');

  // Animate bars with delay
  setTimeout(() => {
    wrap.querySelectorAll('.cp-bench-bar').forEach(bar => {
      const t = bar.dataset.target || 0;
      bar.style.width = t + '%';
    });
  }, 200);
}

function updatePresetEstimates(data) {
  const ests = data.estimated_reductions_by_preset || {};
  PRESET_ORDER.forEach(p => {
    const el = $(`save-${p}`);
    if (el && typeof ests[p] === 'number') {
      const pct = Math.round(ests[p]);
      el.textContent = `~${pct}% smaller`;
    }
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   CHART.JS BAR CHART
════════════════════════════════════════════════════════════════════════════ */
async function renderChart(data) {
  const cw      = $('chartWrap');
  const canvas  = $('compressChart');
  if (!cw || !canvas) return;
  const ests = data.estimated_reductions_by_preset || {};
  if (!Object.keys(ests).length) { cw.setAttribute('hidden',''); return; }

  // Lazy load Chart.js
  if (typeof Chart === 'undefined') {
    await new Promise(resolve => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
      s.crossOrigin = 'anonymous';
      s.onload = resolve; s.onerror = resolve;
      document.head.appendChild(s);
    });
  }
  if (typeof Chart === 'undefined') { cw.setAttribute('hidden',''); return; }

  if (CHART_INSTANCE) { CHART_INSTANCE.destroy(); CHART_INSTANCE = null; }

  cw.removeAttribute('hidden');

  const labels = PRESET_ORDER.map(p => PRESET_INFO[p].name);
  const values = PRESET_ORDER.map(p => typeof ests[p] === 'number' ? Math.round(ests[p]) : 0);
  const colors = PRESET_ORDER.map(p => PRESET_INFO[p].color);

  CHART_INSTANCE = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Estimated reduction (%)',
        data: values,
        backgroundColor: colors.map(c => c + '55'),
        borderColor: colors,
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      animation: { duration: _reduced ? 0 : 800, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.parsed.y}% estimated reduction`,
            afterLabel: ctx => {
              const p = PRESET_ORDER[ctx.dataIndex];
              const sz = FILE ? fmtBytes(Math.round(FILE.size * (1 - ctx.parsed.y / 100))) : '';
              return sz ? `→ ~${sz}` : '';
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: 'rgba(255,255,255,.04)' },
          ticks: {
            color: '#64748b',
            callback: v => v + '%',
            font: { size: 11 },
          },
        },
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 11, weight: '600' } },
        },
      },
    },
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   PRESET SELECTION
════════════════════════════════════════════════════════════════════════════ */
function initPresets() {
  document.querySelectorAll('.cp-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.preset;
      if (p) {
        selectPreset(p, false);
        S('waah_kya_scene_hai');
      }
    });
    btn.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const idx  = PRESET_ORDER.indexOf(btn.dataset.preset);
        const next = PRESET_ORDER[(idx + 1) % PRESET_ORDER.length];
        selectPreset(next, false);
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx  = PRESET_ORDER.indexOf(btn.dataset.preset);
        const prev = PRESET_ORDER[(idx - 1 + PRESET_ORDER.length) % PRESET_ORDER.length];
        selectPreset(prev, false);
      }
    });
  });
  // Default selection
  selectPreset('medium', true);
}

function selectPreset(preset, silent = false) {
  if (!PRESET_ORDER.includes(preset)) return;
  _currentPreset = preset;
  document.querySelectorAll('.cp-preset-btn').forEach(btn => {
    const active = btn.dataset.preset === preset;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', String(active));
    if (active) btn.focus();
  });
  if (!silent) announce(`Preset selected: ${PRESET_INFO[preset]?.name || preset}`);
}

function getPreset() { return _currentPreset || 'medium'; }

/* ════════════════════════════════════════════════════════════════════════════
   TARGET FILE SIZE
════════════════════════════════════════════════════════════════════════════ */
function initTargetSize() {
  const toggle = $('targetToggle');
  const inputs = $('targetInputs');
  if (!toggle || !inputs) return;

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    inputs.toggleAttribute('hidden', open);
    S('click');
  });

  inputs.querySelectorAll('.cp-tpr').forEach(btn => {
    btn.addEventListener('click', () => {
      const kb  = parseInt(btn.dataset.kb, 10);
      const inp = $('targetKb');
      if (inp) { inp.value = kb; inp.dispatchEvent(new Event('input')); }
      inputs.querySelectorAll('.cp-tpr').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S('click');
    });
  });

  const inp = $('targetKb');
  if (inp) {
    inp.addEventListener('input', () => {
      inputs.querySelectorAll('.cp-tpr').forEach(b => b.classList.remove('active'));
    });
  }
}

function getTargetKb() {
  const toggle = $('targetToggle');
  if (toggle?.getAttribute('aria-expanded') !== 'true') return 0;
  const v = parseInt($('targetKb')?.value || '0', 10);
  return isNaN(v) ? 0 : Math.max(0, v);
}

/* ════════════════════════════════════════════════════════════════════════════
   ADVANCED OPTIONS
════════════════════════════════════════════════════════════════════════════ */
function initAdvOpts() {
  if (!D.advToggle || !D.advOpts) return;

  D.advToggle.addEventListener('click', () => {
    const open = D.advToggle.getAttribute('aria-expanded') === 'true';
    D.advToggle.setAttribute('aria-expanded', String(!open));
    D.advOpts.toggleAttribute('hidden', open);
    S('click');
  });

  D.advOpts.querySelectorAll('.cp-adv-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      updateAdvCount();
      S('click');
    });
  });

  // Password eye toggle
  const pwEye = $('pwEye');
  const pwInp = $('optPassword');
  if (pwEye && pwInp) {
    pwEye.addEventListener('click', () => {
      const show  = pwInp.type === 'password';
      pwInp.type  = show ? 'text' : 'password';
      pwEye.querySelector('i').className = show ? 'fa fa-eye-slash' : 'fa fa-eye';
      pwEye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  }

  // Quick preset buttons
  document.querySelectorAll('.cp-qp-btn').forEach(btn => {
    btn.addEventListener('click', () => applyQuickPreset(btn.dataset.qp));
  });

  // Engines panel toggle
  const engToggle = $('enginesToggle');
  const engPanel  = $('enginesPanel');
  if (engToggle && engPanel) {
    engToggle.addEventListener('click', () => {
      const open = engToggle.getAttribute('aria-expanded') === 'true';
      engToggle.setAttribute('aria-expanded', String(!open));
      engPanel.toggleAttribute('hidden', open);
      if (!open) loadEngines();
      S('click');
    });
  }

  updateAdvCount();
}

function updateAdvCount() {
  if (!D.advOpts || !D.advCount) return;
  const total    = D.advOpts.querySelectorAll('.cp-adv-cb').length;
  const checked  = D.advOpts.querySelectorAll('.cp-adv-cb:checked').length;
  const defaults = ['optDedup','optThumbs'].filter(id => { const el=$(id); return el && el.checked; }).length;
  const extra    = checked - defaults;
  if (extra > 0) {
    D.advCount.textContent = extra;
    D.advCount.removeAttribute('hidden');
  } else {
    D.advCount.setAttribute('hidden', '');
  }
}

function applyQuickPreset(key) {
  const map = {
    email:   { optGrayscale:false, optLinearize:true,  optDedup:true, optFonts:true,  optMeta:true,  optAnnot:false, optForms:false, optJS:true,  optThumbs:true, optEmbedded:true,  optICC:true,  optLinks:false, optFlatten:false },
    archive: { optGrayscale:false, optLinearize:false, optDedup:true, optFonts:true,  optMeta:false, optAnnot:false, optForms:false, optJS:true,  optThumbs:true, optEmbedded:false, optICC:false, optLinks:false, optFlatten:false },
    web:     { optGrayscale:false, optLinearize:true,  optDedup:true, optFonts:true,  optMeta:true,  optAnnot:false, optForms:false, optJS:true,  optThumbs:true, optEmbedded:true,  optICC:true,  optLinks:false, optFlatten:false },
    print:   { optGrayscale:false, optLinearize:false, optDedup:true, optFonts:true,  optMeta:false, optAnnot:false, optForms:false, optJS:false, optThumbs:false,optEmbedded:false, optICC:false, optLinks:false, optFlatten:true  },
    max:     { optGrayscale:true,  optLinearize:true,  optDedup:true, optFonts:true,  optMeta:true,  optAnnot:true,  optForms:true,  optJS:true,  optThumbs:true, optEmbedded:true,  optICC:true,  optLinks:true,  optFlatten:false },
    reset:   { optGrayscale:false, optLinearize:false, optDedup:true, optFonts:false, optMeta:false, optAnnot:false, optForms:false, optJS:false, optThumbs:true, optEmbedded:false, optICC:false, optLinks:false, optFlatten:false },
  };
  const cfg = map[key];
  if (!cfg) return;
  Object.entries(cfg).forEach(([id, val]) => {
    const el = $(id);
    if (el) el.checked = val;
  });
  updateAdvCount();
  if (key !== 'reset' && D.advToggle.getAttribute('aria-expanded') !== 'true') {
    D.advToggle.setAttribute('aria-expanded', 'true');
    D.advOpts.removeAttribute('hidden');
  }
  const qualMap = { email:'low', max:'screen', archive:'high', web:'medium', print:'high' };
  if (qualMap[key]) selectPreset(qualMap[key], false);
  const labels = { email:'📧 Email', archive:'📦 Archive', web:'🌐 Web', max:'🔥 Max', print:'🖨️ Print', reset:'↩️ Default' };
  toast(`${labels[key] || key} preset applied`, 'Settings configured.', 'info', 2500);
  S('click');
}

function getAdvOptions() {
  return {
    grayscale:               $('optGrayscale')?.checked  ?? false,
    linearize:               $('optLinearize')?.checked  ?? false,
    remove_duplicate_images: $('optDedup')?.checked      ?? true,
    subset_fonts:            $('optFonts')?.checked      ?? false,
    strip_metadata:          $('optMeta')?.checked       ?? false,
    remove_annotations:      $('optAnnot')?.checked      ?? false,
    remove_forms:            $('optForms')?.checked      ?? false,
    remove_javascript:       $('optJS')?.checked         ?? false,
    remove_thumbnails:       $('optThumbs')?.checked     ?? true,
    remove_embedded_files:   $('optEmbedded')?.checked   ?? false,
    remove_icc_profiles:     $('optICC')?.checked        ?? false,
    remove_links:            $('optLinks')?.checked      ?? false,
    flatten_transparency:    $('optFlatten')?.checked    ?? false,
    password:                $('optPassword')?.value      ?? '',
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   ENGINE STATUS PANEL
════════════════════════════════════════════════════════════════════════════ */
async function loadEngines() {
  const panel = $('enginesPanel');
  if (!panel) return;
  panel.innerHTML = '<span style="font-size:.8rem;color:var(--t4)">Loading engine status…</span>';
  try {
    const resp = await fetch('/api/compress-pdf/engines');
    if (!resp.ok) throw new Error('Failed');
    const data = await resp.json();
    const engines = data.engines || {};
    const tags = Object.entries(engines).map(([name, info]) => {
      const ok    = info.available;
      const ver   = info.version ? ` v${info.version}` : '';
      const cls   = ok ? 'ok' : (info.partial ? 'partial' : 'missing');
      const icon  = ok ? 'fa-check' : 'fa-times';
      return `<span class="cp-eng-status ${cls}" title="${info.note || ''}">
        <i class="fa ${icon}"></i> ${name}${ver}
      </span>`;
    }).join('');
    panel.innerHTML = tags || '<span style="color:var(--t4);font-size:.8rem">No engine data.</span>';
  } catch {
    panel.innerHTML = '<span style="color:var(--rd);font-size:.8rem">Could not load engine status.</span>';
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   ACTION STATE
════════════════════════════════════════════════════════════════════════════ */
function updateActionState() {
  if (!D) return;
  const canCompress = !!FILE && !BATCH_ACTIVE;
  D.compressBtn.disabled = !canCompress;
  D.compressBtn.setAttribute('aria-disabled', String(!canCompress));
  D.compressBtn.classList.toggle('disabled', !canCompress);
}

function updateFab() {
  const fab = $('cpFab');
  if (!fab) return;
  if (FILE) fab.removeAttribute('hidden');
  else fab.setAttribute('hidden', '');
}

/* ════════════════════════════════════════════════════════════════════════════
   SSE PROGRESS
════════════════════════════════════════════════════════════════════════════ */
function showProgress() {
  if (D.toolZone)     D.toolZone.setAttribute('hidden', '');
  if (D.resultWrap)   D.resultWrap.setAttribute('hidden', '');
  if (D.progressWrap) {
    D.progressWrap.removeAttribute('hidden');
    D.progressWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Reset
  const fill = $('progressFill');
  const pct  = $('progressPct');
  const msg  = $('progressMsg');
  const eng  = $('progressEngine');
  const timer = $('progressTimer');
  if (fill)  fill.style.width    = '0%';
  if (pct)   pct.textContent     = '0%';
  if (msg)   msg.textContent     = 'Preparing compression pipeline…';
  if (eng)   eng.textContent     = '';
  if (timer) timer.textContent   = '0.0s';
  setProgressRing(0);

  // Reset stage indicators
  document.querySelectorAll('.cp-stage').forEach(s => {
    s.classList.remove('active','done');
  });

  _t0 = performance.now();
  _timerInterval = setInterval(() => {
    const s = (performance.now() - _t0) / 1000;
    if (timer) timer.textContent = fmtElapsed(s);
  }, 100);

  announce('Compression started. Please wait.', 'assertive');
}

function hideProgress() {
  if (D.progressWrap) D.progressWrap.setAttribute('hidden', '');
  if (D.toolZone)     D.toolZone.removeAttribute('hidden');
  clearInterval(_timerInterval);
  _timerInterval = null;
}

function setProgress(pct, msg = '', engine = '') {
  const p    = clamp(pct, 0, 100);
  const fill = $('progressFill');
  const pctEl = $('progressPct');
  const msgEl  = $('progressMsg');
  const engEl  = $('progressEngine');

  if (fill)  fill.style.width    = p + '%';
  if (pctEl) pctEl.textContent   = Math.round(p) + '%';
  if (msg && msgEl)   msgEl.textContent   = msg;
  if (engine && engEl) engEl.textContent  = engine;
  setProgressRing(p);

  // Update stage indicators
  const stages = document.querySelectorAll('.cp-stage');
  stages.forEach((s, i) => {
    const stagePct = PROGRESS_STAGES[i]?.pct || 0;
    if (p >= stagePct + 5) s.classList.add('done');
    else if (p >= stagePct - 5) { s.classList.add('active'); s.classList.remove('done'); }
    else { s.classList.remove('active','done'); }
  });
}

function openSSE(jobId) {
  closeSSE();
  const url  = `/api/progress/${jobId}`;
  SSE_SOURCE = new EventSource(url);
  let simPct  = 0;
  let stageIdx = 0;

  SSE_SOURCE.onmessage = e => {
    try {
      const d = JSON.parse(e.data);
      if (d.pct !== undefined) {
        setProgress(d.pct, d.msg || d.title || '', d.sub || '');
        simPct = d.pct;
      }
      if (d.pct >= 100) closeSSE();
    } catch(_) {}
  };
  SSE_SOURCE.onerror = () => closeSSE();

  // Simulated stage progress (always shows meaningful info)
  SSE_TIMER = setInterval(() => {
    if (stageIdx < PROGRESS_STAGES.length) {
      const stage = PROGRESS_STAGES[stageIdx];
      if (simPct < stage.pct) {
        simPct = Math.min(simPct + Math.random() * 3 + 1.5, stage.pct);
        setProgress(simPct, stage.label, stage.sub);
      }
      if (simPct >= stage.pct) stageIdx++;
    }
  }, 380);
}

function closeSSE() {
  if (SSE_SOURCE) { SSE_SOURCE.close(); SSE_SOURCE = null; }
  if (SSE_TIMER)  { clearInterval(SSE_TIMER); SSE_TIMER = null; }
}

/* ════════════════════════════════════════════════════════════════════════════
   COMPRESS — SINGLE FILE
════════════════════════════════════════════════════════════════════════════ */
async function doCompress() {
  if (!FILE) {
    toast('No file selected', 'Please upload a PDF first.', 'warn');
    D.dropZone?.focus();
    return;
  }
  if (D.compressBtn.disabled) return;

  // Batch mode
  if (BATCH_QUEUE.length > 1) {
    await doBatchCompress();
    return;
  }

  const preset   = getPreset();
  const targetKb = getTargetKb();
  const advOpts  = getAdvOptions();
  JOB_ID         = `job-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;

  BATCH_ACTIVE = true;
  showProgress();
  S('cameraman_focus_karo');
  updateActionState();

  window.addEventListener('beforeunload', _beforeUnloadHandler);

  const fd = new FormData();
  fd.append('file',      FILE);
  fd.append('preset',    preset);
  fd.append('job_id',    JOB_ID);
  fd.append('target_kb', String(targetKb));
  Object.entries(advOpts).forEach(([k, v]) => fd.append(k, String(v)));

  openSSE(JOB_ID);

  try {
    const resp    = await fetch('/api/compress-pdf', { method: 'POST', body: fd });
    setProgress(100, 'Compression complete!');
    closeSSE();
    clearInterval(_timerInterval);

    const elapsed = Math.round(performance.now() - _t0);

    if (!resp.ok) {
      let errMsg = `Server error ${resp.status}`;
      try { const j = await resp.json(); errMsg = j.error || errMsg; } catch {}
      throw new Error(errMsg);
    }

    const blob      = await resp.blob();
    const inSize    = parseInt(resp.headers.get('X-Input-Size')   || String(FILE.size), 10);
    const outSize   = parseInt(resp.headers.get('X-Output-Size')  || String(blob.size), 10);
    const redPct    = parseFloat(resp.headers.get('X-Reduction-Pct') || String(calcReduction(inSize, outSize)));
    const engine    = resp.headers.get('X-Engine-Used')   || '—';
    const qScore    = parseInt(resp.headers.get('X-Quality-Score') || '50', 10);
    const qGrade    = resp.headers.get('X-Quality-Grade') || 'B';
    const engTried  = resp.headers.get('X-Engines-Tried') || '';
    const procMs    = parseInt(resp.headers.get('X-Processing-Ms') || String(elapsed), 10);
    const meth      = resp.headers.get('X-Method-Used')   || preset;

    RESULT_DATA  = { blob, inSize, outSize, redPct, engine, qScore, qGrade, engTried, procMs, meth, elapsed, preset };
    COMPRESS_DONE = true;

    hideProgress();
    showResult(RESULT_DATA);

    addToHistory({
      filename:    FILE.name,
      preset,
      inputSize:   inSize,
      outputSize:  outSize,
      reductionPct: redPct,
      grade:       qGrade,
      engine,
      timeMs:      procMs,
    });

    if (redPct > 0) {
      launchConfetti();
      S('waah_kya_scene_hai');
    } else {
      S('waah_kya_scene_hai');
    }
    announce(`Compression complete! ${redPct.toFixed(1)}% reduction. Grade: ${qGrade}.`);

  } catch (err) {
    closeSSE();
    hideProgress();
    toast('Compression failed', err.message || 'Unexpected error.', 'error', 8000);
    S('eh_eh_eh_ehhhhhh');
    announce('Compression failed. ' + (err.message || ''), 'assertive');
  } finally {
    BATCH_ACTIVE = false;
    updateActionState();
    window.removeEventListener('beforeunload', _beforeUnloadHandler);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   BATCH COMPRESS
════════════════════════════════════════════════════════════════════════════ */
async function doBatchCompress() {
  if (BATCH_QUEUE.length === 0) return;
  BATCH_ACTIVE = true;
  BATCH_ZIP_PARTS = [];
  updateActionState();

  const preset   = getPreset();
  const targetKb = getTargetKb();
  const advOpts  = getAdvOptions();

  showBatchPanel();
  toast(`Batch: ${BATCH_QUEUE.length} PDFs`, `Preset: ${PRESET_INFO[preset]?.name || preset}`, 'info', 3000);
  S('cameraman_focus_karo');

  let successCount = 0, errorCount = 0;
  let totalOriginal = 0, totalCompressed = 0;

  for (let i = 0; i < BATCH_QUEUE.length; i++) {
    const item = BATCH_QUEUE[i];
    BATCH_IDX  = i;
    item.status = 'processing';
    updateBatchItemStatus(item.id, 'processing');
    updateBatchTotalProgress(i, BATCH_QUEUE.length);

    const el = $(`batch-item-${item.id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const fd    = new FormData();
    const jobId = `batch-${Date.now()}-${i}`;
    fd.append('file',      item.file);
    fd.append('preset',    preset);
    fd.append('job_id',    jobId);
    fd.append('target_kb', String(targetKb));
    Object.entries(advOpts).forEach(([k, v]) => fd.append(k, String(v)));

    try {
      const resp    = await fetch('/api/compress-pdf', { method: 'POST', body: fd });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob    = await resp.blob();
      const inSize  = parseInt(resp.headers.get('X-Input-Size')  || String(item.file.size), 10);
      const outSize = parseInt(resp.headers.get('X-Output-Size') || String(blob.size), 10);
      const redPct  = parseFloat(resp.headers.get('X-Reduction-Pct') || String(calcReduction(inSize, outSize)));
      const result  = { blob, inSize, outSize, redPct, filename: item.file.name };

      item.status = 'done';
      item.result = result;
      BATCH_ZIP_PARTS.push({ name: `${item.stem}_compressed.pdf`, blob });
      totalOriginal   += inSize;
      totalCompressed += outSize;
      updateBatchItemStatus(item.id, 'done', result);
      successCount++;
    } catch(err) {
      item.status = 'error';
      updateBatchItemStatus(item.id, 'error');
      errorCount++;
    }
  }

  updateBatchTotalProgress(BATCH_QUEUE.length, BATCH_QUEUE.length);

  BATCH_ACTIVE = false;
  updateActionState();

  if (successCount > 0) {
    const totalRedPct = calcReduction(totalOriginal, totalCompressed);
    launchConfetti();
    S('fahhhhh');
    toast(
      `✅ Batch complete! ${successCount}/${BATCH_QUEUE.length} compressed`,
      `Total: ${fmtBytes(totalOriginal)} → ${fmtBytes(totalCompressed)} (${totalRedPct.toFixed(1)}% saved)`,
      errorCount > 0 ? 'warn' : 'success',
      7000
    );
    // Show ZIP download button
    const zipBtn = $('batchZipBtn');
    if (zipBtn) zipBtn.removeAttribute('hidden');
  } else {
    S('eh_eh_eh_ehhhhhh');
    toast('Batch failed', `All ${errorCount} files had errors.`, 'error', 8000);
  }
  announce(`Batch done. ${successCount} succeeded, ${errorCount} failed.`);
}

function updateBatchTotalProgress(done, total) {
  const pct    = total > 0 ? Math.round(done / total * 100) : 0;
  const fill   = $('batchTotalFill');
  const label  = $('batchTotalPct');
  if (fill)  fill.style.width  = pct + '%';
  if (label) label.textContent = `${done}/${total} — ${pct}%`;
}

function _beforeUnloadHandler(e) {
  e.preventDefault();
  e.returnValue = '';
}

function cancelCompress() {
  closeSSE();
  hideProgress();
  BATCH_ACTIVE = false;
  updateActionState();
  toast('Compression cancelled', '', 'warn', 2500);
  S('jaldi_waha_sa_hato');
  window.removeEventListener('beforeunload', _beforeUnloadHandler);
}

/* ════════════════════════════════════════════════════════════════════════════
   BATCH PANEL UI
════════════════════════════════════════════════════════════════════════════ */
function showBatchPanel() {
  const panel = $('batchPanel');
  const list  = $('batchList');
  const count = $('batchCount');
  if (!panel || !list) return;

  panel.removeAttribute('hidden');
  if (count) count.textContent = BATCH_QUEUE.length;

  list.innerHTML = BATCH_QUEUE.map((item, i) => `
    <div class="cp-batch-item" id="batch-item-${item.id}" style="animation-delay:${i*40}ms">
      <div class="cp-batch-item-icon">
        <i class="fa fa-file-pdf" style="color:var(--em)"></i>
      </div>
      <div class="cp-batch-item-name" title="${item.file.name}">${item.file.name}</div>
      <span style="font-size:.72rem;color:var(--t5);flex-shrink:0">${fmtBytes(item.file.size)}</span>
      <div class="cp-batch-item-pct" id="batch-pct-${item.id}">Pending</div>
    </div>
  `).join('');

  const zipBtn = $('batchZipBtn');
  if (zipBtn) zipBtn.setAttribute('hidden', '');
}

function hideBatchPanel() {
  const panel = $('batchPanel');
  if (panel) panel.setAttribute('hidden', '');
}

function updateBatchItemStatus(id, status, result) {
  const el   = $(`batch-item-${id}`);
  const pct  = $(`batch-pct-${id}`);
  if (!el) return;

  el.classList.remove('processing','done','error');
  el.classList.add(status);

  if (status === 'processing') {
    const icon = el.querySelector('.cp-batch-item-icon');
    if (icon) icon.innerHTML = '<i class="fa fa-circle-notch fa-spin" style="color:var(--in3)"></i>';
    if (pct)  pct.textContent = 'Compressing…';
  } else if (status === 'done' && result) {
    const icon = el.querySelector('.cp-batch-item-icon');
    if (icon) icon.innerHTML = '<i class="fa fa-check-circle" style="color:var(--em)"></i>';
    if (pct) {
      const saved = result.redPct > 0 ? `${result.redPct.toFixed(1)}% saved` : 'Optimised';
      pct.innerHTML = `<span style="color:var(--em);font-weight:700">${saved}</span>`;
    }
    // Add per-file download btn
    const dlBtn = document.createElement('button');
    dlBtn.className = 'cp-batch-item-dl';
    dlBtn.innerHTML = '<i class="fa fa-download"></i> DL';
    dlBtn.title = `Download ${getStem(result.filename)}_compressed.pdf`;
    dlBtn.addEventListener('click', () => {
      _triggerBlobDownload(result.blob, `${getStem(result.filename)}_compressed.pdf`);
      S('fahhhhh');
    });
    el.appendChild(dlBtn);
  } else if (status === 'error') {
    const icon = el.querySelector('.cp-batch-item-icon');
    if (icon) icon.innerHTML = '<i class="fa fa-times-circle" style="color:var(--rd)"></i>';
    if (pct)  pct.innerHTML  = '<span style="color:var(--rd)">Failed</span>';
  }
}

/* ZIP download (simple concatenation — each file individually named) */
async function downloadBatchZip() {
  if (BATCH_ZIP_PARTS.length === 0) {
    toast('No compressed files yet', 'Run compression first.', 'warn');
    return;
  }

  // Try to use fflate for real ZIP if available, otherwise offer individual downloads
  if (BATCH_ZIP_PARTS.length === 1) {
    const part = BATCH_ZIP_PARTS[0];
    _triggerBlobDownload(part.blob, part.name);
    S('fahhhhh');
    return;
  }

  // Offer sequential download since browser ZIP APIs aren't universal
  toast('Downloading files…', `${BATCH_ZIP_PARTS.length} compressed PDFs`, 'info', 3000);
  for (let i = 0; i < BATCH_ZIP_PARTS.length; i++) {
    const part = BATCH_ZIP_PARTS[i];
    setTimeout(() => {
      _triggerBlobDownload(part.blob, part.name);
    }, i * 800);
  }
  S('fahhhhh');
}

function _triggerBlobDownload(blob, filename) {
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

/* ════════════════════════════════════════════════════════════════════════════
   RESULT DISPLAY
════════════════════════════════════════════════════════════════════════════ */
function showResult(r) {
  if (!D.resultWrap) return;

  // Grade
  const gc = GRADE_COLORS[r.qGrade] || '#94a3b8';
  if (D.resGrade) {
    D.resGrade.textContent = r.qGrade;
    D.resGrade.style.color = gc;
  }

  // Sizes
  if (D.resBefore) D.resBefore.textContent = fmtBytes(r.inSize);
  if (D.resAfter)  D.resAfter.textContent  = fmtBytes(r.outSize);

  // Reduction %
  if (D.resPct) {
    D.resPct.textContent = r.redPct > 0
      ? `${r.redPct.toFixed(1)}% smaller`
      : 'Already optimised';
    D.resPct.style.color = r.redPct > 20 ? 'var(--em)' : r.redPct > 0 ? 'var(--am)' : 'var(--t4)';
  }

  // Engine & Time
  if (D.resEngine) D.resEngine.textContent = r.engine || '—';
  if (D.resTime)   D.resTime.textContent   = fmtMs(r.procMs);

  // Reduction bar (animated)
  if (D.resBar) {
    D.resBar.style.width = '0%';
    setTimeout(() => {
      D.resBar.style.width = clamp(r.redPct, 0, 100) + '%';
    }, 150);
  }

  // Quality score (animated)
  if (D.resScore) animateNumber(D.resScore, 0, r.qScore, 1000);

  // Score ring gradient update
  const scoreRing = document.querySelector('.cp-score-ring-mini');
  if (scoreRing) {
    const pct = r.qScore;
    const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#6366f1' : pct >= 40 ? '#f59e0b' : '#ef4444';
    scoreRing.style.background = `conic-gradient(${color} ${pct}%, var(--bg4) 0%)`;
  }

  // Engines tried
  if (D.resEngineList && r.engTried) {
    D.resEngineList.innerHTML = r.engTried.split(',')
      .map(e => e.trim()).filter(Boolean)
      .map(e => `<span class="cp-eng-tag">${e}</span>`)
      .join('');
  }

  // Zero-reduction note
  const zeroNote = $('resZeroNote');
  if (zeroNote) zeroNote.toggleAttribute('hidden', r.redPct > 0);

  // Saved bytes
  const savedEl = $('resSavedBytes');
  if (savedEl) {
    const saved = r.inSize - r.outSize;
    if (saved > 0) {
      savedEl.textContent = `Saved ${fmtBytes(saved)}`;
      savedEl.style.color = 'var(--em)';
    } else {
      savedEl.textContent = 'File already well-compressed';
      savedEl.style.color = 'var(--t4)';
    }
  }

  // Preset display
  const presetEl = $('resPreset');
  if (presetEl) {
    const pi = PRESET_INFO[r.preset] || { emoji:'⚙️', name: r.preset };
    presetEl.textContent = `${pi.emoji} ${pi.name}`;
  }

  D.resultWrap.removeAttribute('hidden');
  D.resultWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ════════════════════════════════════════════════════════════════════════════
   DOWNLOAD
════════════════════════════════════════════════════════════════════════════ */
function triggerDownload() {
  if (!RESULT_DATA?.blob) {
    toast('No result', 'Please compress a PDF first.', 'warn');
    return;
  }
  // Download name: for batch → largest file's stem; for single → current stem
  const dlStem = (BATCH_QUEUE.length > 1 && BATCH_LARGEST)
    ? getStem(BATCH_LARGEST.name)
    : STEM;
  const dlName = `${dlStem}_compressed.pdf`;
  _triggerBlobDownload(RESULT_DATA.blob, dlName);
  S('fahhhhh');  // ALWAYS play fahhhhh on download
  toast('Downloading!', dlName, 'success', 3000);
  announce(`Downloading ${dlName}`);
}

async function shareResult() {
  if (!RESULT_DATA?.blob) return;
  if (!navigator.share) {
    await navigator.clipboard.writeText(window.location.href).catch(() => {});
    toast('Link copied!', 'Web Share not supported — URL copied instead.', 'info', 3000);
    return;
  }
  try {
    const dlStem = (BATCH_QUEUE.length > 1 && BATCH_LARGEST) ? getStem(BATCH_LARGEST.name) : STEM;
    const file   = new File([RESULT_DATA.blob], `${dlStem}_compressed.pdf`, { type: 'application/pdf' });
    await navigator.share({
      title: `Compressed PDF — ${dlStem}`,
      text:  `Compressed ${fmtBytes(RESULT_DATA.inSize)} → ${fmtBytes(RESULT_DATA.outSize)} (${RESULT_DATA.redPct.toFixed(1)}% smaller) using IshuTools.fun by Ishu Kumar`,
      files: [file],
    });
  } catch (err) {
    if (err.name !== 'AbortError') toast('Share failed', err.message || '', 'error', 3000);
  }
}

async function copyReport() {
  if (!RESULT_DATA) return;
  const r       = RESULT_DATA;
  const dlStem  = (BATCH_QUEUE.length > 1 && BATCH_LARGEST) ? getStem(BATCH_LARGEST.name) : STEM;
  const txt = [
    '═══ IshuTools.fun — Compression Report ═══',
    `File:          ${FILE?.name || '—'}`,
    `Preset:        ${PRESET_INFO[r.preset]?.name || r.preset}`,
    `Before:        ${fmtBytes(r.inSize)}`,
    `After:         ${fmtBytes(r.outSize)}`,
    `Reduction:     ${r.redPct.toFixed(1)}%`,
    `Saved:         ${fmtBytes(r.inSize - r.outSize)}`,
    `Grade:         ${r.qGrade}`,
    `Score:         ${r.qScore}/100`,
    `Engine used:   ${r.engine}`,
    `Time:          ${fmtMs(r.procMs)}`,
    `Engines tried: ${r.engTried}`,
    `Download name: ${dlStem}_compressed.pdf`,
    `Generated:     ${new Date().toLocaleString()}`,
    `Tool:          https://ishutools.fun/tools/compress-pdf/`,
    `Built by:      Ishu Kumar (ISHUKR41) — github.com/ISHUKR41`,
    '═══════════════════════════════════════════',
  ].join('\n');
  try {
    await navigator.clipboard.writeText(txt);
    toast('Report copied!', 'Paste anywhere.', 'success', 2500);
    S('click');
  } catch {
    toast('Copy failed', 'Please copy manually.', 'warn', 3000);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   RESET TOOL
════════════════════════════════════════════════════════════════════════════ */
function resetTool() {
  FILE = null;
  STEM = '';
  BATCH_QUEUE = [];
  BATCH_LARGEST = null;
  ANALYSIS_DATA = null;
  COMPRESS_DONE = false;
  RESULT_DATA   = null;
  CHART_INSTANCE = null;
  closeSSE();

  if (D.fileInfo)     D.fileInfo.setAttribute('hidden', '');
  if (D.resultWrap)   D.resultWrap.setAttribute('hidden', '');
  if (D.progressWrap) D.progressWrap.setAttribute('hidden', '');
  hideBatchPanel();

  const cw = $('chartWrap');
  if (cw) cw.setAttribute('hidden', '');
  const est = $('presetEstPanel');
  if (est) est.setAttribute('hidden', '');
  const scr = $('cpScoreRing');
  if (scr) scr.setAttribute('hidden', '');
  const bb  = $('cpBenchBars');
  if (bb)  bb.setAttribute('hidden', '');
  const eg  = $('cpEngineGrid');
  if (eg)  eg.setAttribute('hidden', '');
  const rec = $('recBanner');
  if (rec) rec.setAttribute('hidden', '');
  const chips = $('fiChips');
  if (chips) chips.setAttribute('hidden', '');

  selectPreset('medium', true);
  updateActionState();
  updateFab();
  D.dropZone?.removeAttribute('hidden');
  D.dropZone?.focus();
  S('jaldi_waha_sa_hato');
  announce('Tool reset. Upload a new PDF to compress.');
}

/* ════════════════════════════════════════════════════════════════════════════
   SCROLL TO TOP
════════════════════════════════════════════════════════════════════════════ */
function initScrollTop() {
  const btn = $('scrollTop');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 350);
  }, { passive: true });
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   HISTORY PANEL TOGGLE
════════════════════════════════════════════════════════════════════════════ */
function toggleHistory() {
  const panel = $('historyPanel');
  if (!panel) return;
  const isHidden = panel.hasAttribute('hidden');
  if (isHidden) {
    panel.removeAttribute('hidden');
    renderHistory();
    if (D.historyBtn) {
      D.historyBtn.classList.add('active-state');
      D.historyBtn.setAttribute('aria-expanded', 'true');
    }
  } else {
    panel.setAttribute('hidden', '');
    if (D.historyBtn) {
      D.historyBtn.classList.remove('active-state');
      D.historyBtn.setAttribute('aria-expanded', 'false');
    }
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
════════════════════════════════════════════════════════════════════════════ */
function initKeyboard() {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (['input','textarea','select'].includes(tag)) return;

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'Enter') { e.preventDefault(); doCompress(); }
      if (e.key === 'o'    ) { e.preventDefault(); D.fileInput?.click(); }
      if (e.key === 'z'    ) { /* undo — noop for now */ }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      const modal = document.getElementById('cp-shortcuts-modal');
      if (modal) { modal.classList.remove('visible'); setTimeout(() => modal.remove(), 280); return; }
      const hist = $('historyPanel');
      if (hist && !hist.hasAttribute('hidden')) { toggleHistory(); return; }
      if (BATCH_ACTIVE) { cancelCompress(); return; }
      if (!D.progressWrap?.hasAttribute('hidden')) { cancelCompress(); return; }
    }

    switch (e.key.toLowerCase()) {
      case 'h': toggleHistory(); break;
      case 'r': resetTool();    break;
      case 't': toggleTheme();  break;
      case 's': toggleSound();  break;
      case '?': showShortcutsModal(); break;
      case 'arrowup':
      case 'arrowdown': {
        e.preventDefault();
        const idx  = PRESET_ORDER.indexOf(_currentPreset);
        const next = e.key === 'ArrowUp'
          ? PRESET_ORDER[Math.max(0, idx - 1)]
          : PRESET_ORDER[Math.min(PRESET_ORDER.length - 1, idx + 1)];
        selectPreset(next, false);
        S('waah_kya_scene_hai');
        break;
      }
    }
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   DOM INITIALIZATION
════════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  // Populate DOM refs
  D = {
    dropZone:     $('dropZone'),
    fileInput:    $('fileInput'),
    fileInfo:     $('fileInfo'),
    toolZone:     $('toolZone'),
    toolInner:    document.querySelector('.cp-tool-inner'),
    compressBtn:  $('compressBtn'),
    resetBtn:     $('resetBtn'),
    cancelBtn:    $('cancelBtn'),
    progressWrap: $('progressWrap'),
    resultWrap:   $('resultWrap'),
    resBefore:    $('resBefore'),
    resAfter:     $('resAfter'),
    resPct:       $('resPct'),
    resGrade:     $('resGrade'),
    resEngine:    $('resEngine'),
    resTime:      $('resTime'),
    resBar:       $('resBar'),
    resScore:     $('resScore'),
    resEngineList:$('resEngineList'),
    advToggle:    $('advToggle'),
    advOpts:      $('advOpts'),
    advCount:     $('advCount'),
    historyBtn:   $('historyBtn'),
    themeToggle:  $('themeToggle'),
    themeIcon:    $('themeIcon'),
    soundToggle:  $('soundToggle'),
    soundIcon:    $('soundIcon'),
    toastWrap:    $('toastWrap'),
  };

  // Init all modules
  initTheme();
  initSoundToggle();
  initBgCanvas();
  initDropZone();
  initPresets();
  initTargetSize();
  initAdvOpts();
  initScrollTop();
  initFaq();
  initScrollReveal();
  initCounters();
  initGlowCards();
  initKeyboard();

  // Wire buttons
  if (D.compressBtn) D.compressBtn.addEventListener('click', doCompress);
  if (D.resetBtn)    D.resetBtn.addEventListener('click',    resetTool);
  if (D.cancelBtn)   D.cancelBtn.addEventListener('click',   cancelCompress);

  // Remove file button
  const fiRemove = $('fiRemove');
  if (fiRemove) fiRemove.addEventListener('click', removeFile);

  // History
  if (D.historyBtn) {
    D.historyBtn.addEventListener('click', () => {
      toggleHistory();
      S('click');
    });
  }

  // Clear history
  const clearHistBtn = $('clearHistBtn');
  if (clearHistBtn) clearHistBtn.addEventListener('click', clearHistory);

  // History leaderboard toggle
  const lbBtn = $('cpHistLbBtn');
  if (lbBtn) lbBtn.addEventListener('click', () => {
    const lb = $('cpHistLeaderboard');
    if (!lb) return;
    const isHidden = lb.hasAttribute('hidden');
    lb.toggleAttribute('hidden', !isHidden);
    if (isHidden) renderLeaderboard();
    S('click');
  });

  // Export history
  const csvBtn  = $('cpExportCsvBtn');
  const jsonBtn = $('cpExportJsonBtn');
  if (csvBtn)  csvBtn.addEventListener('click',  exportHistoryCsv);
  if (jsonBtn) jsonBtn.addEventListener('click', exportHistoryJson);

  // Download button
  const dlBtn = $('downloadBtn');
  if (dlBtn) dlBtn.addEventListener('click', triggerDownload);

  // Share button
  const shareBtn = $('shareBtn');
  if (shareBtn) shareBtn.addEventListener('click', shareResult);

  // Copy report button
  const copyBtn = $('copyReportBtn');
  if (copyBtn) copyBtn.addEventListener('click', copyReport);

  // Compress again button
  const againBtn = $('compressAgainBtn');
  if (againBtn) againBtn.addEventListener('click', () => {
    if (D.resultWrap) D.resultWrap.setAttribute('hidden', '');
    if (D.toolZone)   D.toolZone.removeAttribute('hidden');
    RESULT_DATA = null;
    updateActionState();
    S('click');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Theme & sound toggles
  if (D.themeToggle) D.themeToggle.addEventListener('click', toggleTheme);
  if (D.soundToggle) D.soundToggle.addEventListener('click', toggleSound);

  // Shortcuts button
  const shortcutsBtn = $('shortcutsBtn');
  if (shortcutsBtn) shortcutsBtn.addEventListener('click', showShortcutsModal);

  // FAB
  const fab = $('cpFab');
  if (fab) fab.addEventListener('click', () => {
    if (FILE) doCompress();
    else D.fileInput?.click();
  });

  // Batch ZIP button
  const zipBtn = $('batchZipBtn');
  if (zipBtn) zipBtn.addEventListener('click', downloadBatchZip);

  // Add more files button
  const addMoreBtn = $('addMoreBtn');
  if (addMoreBtn) addMoreBtn.addEventListener('click', () => D.fileInput?.click());

  // Engines toggle (in adv section)
  // Already handled in initAdvOpts

  // Paste support
  document.addEventListener('paste', e => {
    if (['input','textarea'].includes(document.activeElement?.tagName?.toLowerCase())) return;
    const items = [...(e.clipboardData?.items || [])];
    const pdfItem = items.find(it => it.type === 'application/pdf');
    if (pdfItem) {
      const f = pdfItem.getAsFile();
      if (f) { handleFiles([f]); toast('PDF pasted!', f.name, 'info', 2500); }
    }
  });

  // Page visibility — pause heavy work
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && SSE_TIMER) {
      // Keep SSE running but pause simulation
    }
  });

  // Toast on startup welcome (subtle)
  setTimeout(() => {
    toast(
      'IshuTools PDF Compressor',
      '12-engine pipeline · No size limit · 100% free · by Ishu Kumar',
      'info',
      3500
    );
  }, 1200);

  // Populate initial history badge
  const hist = loadHistory();
  const count = $('historyCount');
  if (count) count.textContent = hist.length;

}); // DOMContentLoaded

/* ════════════════════════════════════════════════════════════════════════════
   WINDOW GLOBAL EXPORTS (for onclick attrs in HTML)
════════════════════════════════════════════════════════════════════════════ */
window.doCompress       = doCompress;
window.resetTool        = resetTool;
window.cancelCompress   = cancelCompress;
window.triggerDownload  = triggerDownload;
window.shareResult      = shareResult;
window.copyReport       = copyReport;
window.downloadBatchZip = downloadBatchZip;
window.toggleHistory    = toggleHistory;
window.clearHistory     = clearHistory;
window.showShortcutsModal = showShortcutsModal;
window.selectPreset     = selectPreset;
window.toggleTheme      = toggleTheme;
window.toggleSound      = toggleSound;
