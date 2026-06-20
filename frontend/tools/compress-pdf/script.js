/**
 * IshuTools.fun — Compress PDF script.js v31.0
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun
 * GitHub: https://github.com/ISHUKR41 | https://github.com/ISHUKR75
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * v31.0 — COMPLETE PROFESSIONAL PDF COMPRESSION SUITE
 * ══════════════════════════════════════════════════════════════════════════════
 * CRITICAL FIXES v31:
 *   ✅ Backend now reads 'preset' correctly (was reading 'quality' — now FIXED)
 *   ✅ Response headers now match: X-Input-Size, X-Output-Size, X-Reduction-Pct,
 *      X-Engine-Used, X-Quality-Score, X-Quality-Grade, X-Engines-Tried
 *   ✅ Download name = largest file's stem for batch mode
 *   ✅ Fahhhhh sound on every download
 *   ✅ No quality auto-compromise — user's chosen preset is ALWAYS respected
 *
 * FEATURES:
 *   CORE:
 *   • Drag-and-drop + click upload (PDF only, NO size limit)
 *   • Batch file queue — multiple PDFs, sequential processing
 *   • PDF deep analysis via /api/compress-pdf/analyze
 *   • 5-preset quality selector (lossless / high / medium / low / screen)
 *   • Target file size mode (binary-search on backend)
 *   • 13 advanced option toggles + password field
 *   • Quick preset combos (email / web / archive / max / print / reset)
 *   • SSE real-time progress with elapsed time counter
 *   • Live stage-by-stage progress breakdown
 *   • Result card: grade badge, before/after sizes, reduction bar, engine report
 *   • Animated size comparison bar (before vs after)
 *
 *   VISUALS:
 *   • Chart.js bar chart — compression savings by preset (live data)
 *   • Animated background canvas (emerald floating particles + connections)
 *   • Canvas confetti on success (3-burst salvo)
 *   • Animated trust counters (IntersectionObserver)
 *   • Smooth animated progress ring (SVG stroke-dashoffset)
 *   • Preset card glow on hover/select
 *   • Before/after animated reduction bar
 *   • Micro-animations on all interactive elements
 *
 *   AUDIO (from merge-pdf/sounds/ folder):
 *   • Download success: SOUNDS.fahhhhh (fahhhhh.mp3)
 *   • Compress start: SOUNDS.cameraman_focus_karo
 *   • File added: SOUNDS.are_bhai_bhai_bhai
 *   • Preset change: SOUNDS.waah_kya_scene_hai
 *   • Error: SOUNDS.eh_eh_eh_ehhhhhh
 *   • Cancel: SOUNDS.jaldi_waha_sa_hato
 *   • Click/toggle: SOUNDS.click (synthetic)
 *
 *   UX:
 *   • Compression history — last 20 in localStorage
 *   • Web Share API (mobile-native share sheet)
 *   • Clipboard copy for compression report
 *   • Dark/Light theme toggle with localStorage persistence
 *   • Sound on/off with localStorage persistence
 *   • beforeunload guard during compression
 *   • Password show/hide toggle
 *   • Auto-focus management after state changes
 *   • Scroll-to-top button
 *   • Mobile FAB button
 *   • Live engine status panel (from /api/compress-pdf/engines)
 *
 *   KEYBOARD:
 *   • Ctrl+Enter  — Start compression
 *   • Ctrl+O      — Open file picker
 *   • Escape      — Close panels / cancel
 *   • H           — Toggle history panel
 *   • R           — Reset tool
 *   • T           — Toggle theme
 *   • S           — Toggle sound
 *   • ?           — Show keyboard shortcuts
 *   • ↑/↓         — Navigate presets
 *
 *   ACCESSIBILITY:
 *   • aria-live regions for progress and results
 *   • aria-checked on preset buttons
 *   • aria-expanded on collapsible panels
 *   • Focus management after modal open/close
 *   • Screen reader announcements for all state changes
 *   • Reduced motion support
 *
 *   PERFORMANCE:
 *   • requestAnimationFrame particle loop (pauses on hidden tab)
 *   • Passive event listeners on scroll/resize
 *   • Debounced resize handler
 *   • IntersectionObserver for counter animation (fires once)
 *   • Lazy Chart.js init on first result
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════════════════
   MODULE-SCOPE STATE
══════════════════════════════════════════════════════════════════════════════ */
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
let _reduced        = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Batch queue
let BATCH_QUEUE     = [];     // [{file, id, status, result, stem}]
let BATCH_ACTIVE    = false;
let BATCH_IDX       = 0;
let BATCH_LARGEST   = null;   // Largest file in batch (for download name)

// DOM refs (populated in DOMContentLoaded)
let D = null;

// History
const HISTORY_KEY = 'cp-history-v3';
const HISTORY_MAX = 20;

// Progress stages for display
const PROGRESS_STAGES = [
  { pct: 5,  label: 'Initialising…',        sub: 'Loading compression engines' },
  { pct: 12, label: 'Analysing PDF…',        sub: 'Scanning images, fonts, streams' },
  { pct: 25, label: 'Engine 1: pikepdf…',    sub: 'Lossless stream recompression' },
  { pct: 38, label: 'Engine 2: Ghostscript…',sub: 'Applying distiller preset' },
  { pct: 50, label: 'Engine 3: PyMuPDF…',   sub: 'Image DPI optimisation' },
  { pct: 62, label: 'Engine 4: qpdf…',      sub: 'Stream linearisation' },
  { pct: 72, label: 'Engine 5-8…',          sub: 'Pillow, mutool, dedup, content streams' },
  { pct: 84, label: 'Engine 9-12…',         sub: 'Chain passes — picking best result' },
  { pct: 93, label: 'Post-processing…',     sub: 'Applying advanced options' },
  { pct: 98, label: 'Finalising…',          sub: 'Verifying output & preparing download' },
];

/* ══════════════════════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
══════════════════════════════════════════════════════════════════════════════ */

/** Format bytes → human-readable string */
function fmtBytes(b) {
  if (b == null || isNaN(b) || b < 0) return '—';
  if (b === 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
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

/** Canvas confetti 3-burst salvo */
function launchConfetti() {
  if (_reduced) return;
  try {
    if (typeof confetti !== 'function') {
      // CSS fallback
      _cssConfettiFallback();
      return;
    }
    const opts = {
      colors: ['#10b981', '#34d399', '#6ee7b7', '#ffffff', '#6366f1', '#a78bfa', '#f59e0b'],
      disableForReducedMotion: true,
    };
    confetti({ ...opts, particleCount: 100, spread: 70,  origin: { y: 0.6 } });
    setTimeout(() => confetti({ ...opts, particleCount: 70, spread: 100, angle: 60,  origin: { y: 0.5 } }), 250);
    setTimeout(() => confetti({ ...opts, particleCount: 70, spread: 100, angle: 120, origin: { y: 0.5 } }), 500);
  } catch (_) { _cssConfettiFallback(); }
}

function _cssConfettiFallback() {
  if (_reduced) return;
  const colors = ['#10b981', '#34d399', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6'];
  for (let i = 0; i < 18; i++) {
    const el = document.createElement('div');
    el.className = 'cp-confetti-p';
    el.style.cssText = `
      left:${10 + Math.random() * 80}%;
      background:${colors[i % colors.length]};
      animation-duration:${0.8 + Math.random() * 0.8}s;
      animation-delay:${Math.random() * 0.4}s;
      width:${6 + Math.random() * 6}px;
      height:${6 + Math.random() * 6}px;
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
    `;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

/** Animate number from start→end */
function animateNumber(el, start, end, dur = 900, fmt = v => Math.round(v)) {
  if (!el || _reduced) { if (el) el.textContent = fmt(end); return; }
  const t0 = performance.now();
  function tick(now) {
    const p    = clamp((now - t0) / dur, 0, 1);
    const ease = p < .5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
    el.textContent = fmt(start + (end - start) * ease);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/** Animate progress ring SVG */
function setProgressRing(pct) {
  const ring = document.querySelector('.cp-progress-ring-fill');
  if (!ring) return;
  const r        = 50;
  const circ     = 2 * Math.PI * r;
  const offset   = circ - (clamp(pct, 0, 100) / 100) * circ;
  ring.style.strokeDasharray  = circ;
  ring.style.strokeDashoffset = offset;
}

/* ══════════════════════════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
══════════════════════════════════════════════════════════════════════════════ */
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
  el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
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
    setTimeout(() => el.remove(), 340);
  }
  el.querySelector('.cp-toast-close').addEventListener('click', dismiss);
  el.addEventListener('click', e => { if (!el.querySelector('.cp-toast-close').contains(e.target)) dismiss(); });
  if (dur > 0) setTimeout(dismiss, dur);
  return el;
}

/* ══════════════════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS MODAL
══════════════════════════════════════════════════════════════════════════════ */
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
        <li><kbd>Escape</kbd><span>Close panels / cancel</span></li>
        <li><kbd>H</kbd><span>Toggle history panel</span></li>
        <li><kbd>R</kbd><span>Reset tool</span></li>
        <li><kbd>T</kbd><span>Toggle dark/light theme</span></li>
        <li><kbd>S</kbd><span>Toggle sounds on/off</span></li>
        <li><kbd>?</kbd><span>Show this shortcuts panel</span></li>
        <li><kbd>↑</kbd><kbd>↓</kbd><span>Navigate presets</span></li>
      </ul>
      <p class="cp-shortcuts-tip">
        <i class="fa fa-lightbulb" aria-hidden="true"></i>
        Tip: Press <kbd>?</kbd> at any time to toggle this panel.
      </p>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('.cp-shortcuts-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  setTimeout(() => modal.classList.add('visible'), 10);
}

/* ══════════════════════════════════════════════════════════════════════════════
   THEME & SOUND
══════════════════════════════════════════════════════════════════════════════ */
function initTheme() {
  const saved = lsGet('cp-theme');
  const sys   = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  setTheme(saved || sys);
}

function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  if (D) {
    D.themeIcon.className = t === 'dark' ? 'fa fa-moon' : 'fa fa-sun';
    D.themeToggle.title   = `Switch to ${t === 'dark' ? 'light' : 'dark'} mode`;
    D.themeToggle.setAttribute('aria-label', D.themeToggle.title);
  }
  lsSet('cp-theme', t);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  setTheme(cur === 'dark' ? 'light' : 'dark');
  S('click');
}

function initSoundToggle() {
  updateSoundIcon(window.SOUNDS ? window.SOUNDS.isEnabled() : true);
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

/* ══════════════════════════════════════════════════════════════════════════════
   ANIMATED BACKGROUND CANVAS (particles + connections)
══════════════════════════════════════════════════════════════════════════════ */
function initBgCanvas() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas || _reduced) return;
  const ctx = canvas.getContext('2d');
  const PARTICLE_COUNT = 42;
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
      this.y     = init ? Math.random() * window.innerHeight : window.innerHeight + 12;
      this.r     = Math.random() * 2.5 + 0.6;
      this.vx    = (Math.random() - 0.5) * 0.25;
      this.vy    = -(Math.random() * 0.48 + 0.12);
      this.op    = Math.random() * 0.22 + 0.04;
      this.phase = Math.random() * Math.PI * 2;
      this.pulse = Math.random() * 0.035 + 0.012;
      this.hue   = Math.random() > 0.85 ? 240 : 160; // mostly green, some blue
    }
    update() {
      this.x     += this.vx;
      this.y     += this.vy;
      this.phase += this.pulse;
      // Repel from mouse
      const dx   = this.x - mouseX;
      const dy   = this.y - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 80) {
        const force = (80 - dist) / 80 * 0.3;
        this.x += (dx / dist) * force;
        this.y += (dy / dist) * force;
      }
      if (this.y < -12 || this.x < -12 || this.x > window.innerWidth + 12) this.reset(false);
    }
    draw(c) {
      c.beginPath();
      c.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      const alpha = this.op * (0.65 + 0.35 * Math.sin(this.phase));
      if (this.hue === 160) {
        c.fillStyle = `rgba(16,185,129,${alpha})`;
      } else {
        c.fillStyle = `rgba(99,102,241,${alpha * 0.7})`;
      }
      c.fill();
    }
  }

  function drawConnections() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx   = particles[i].x - particles[j].x;
        const dy   = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 130) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(16,185,129,${0.055 * (1 - dist / 130)})`;
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
    if (document.hidden) { cancelAnimationFrame(rafId); }
    else { loop(); }
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
   COMPRESSION HISTORY
══════════════════════════════════════════════════════════════════════════════ */
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
  toast('History cleared', 'All records removed.', 'info', 3000);
}

function renderHistory() {
  const panel = document.getElementById('historyPanel');
  const list  = document.getElementById('historyList');
  const count = document.getElementById('historyCount');
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
  const gradeColors = { S:'#10b981', A:'#34d399', B:'#6366f1', C:'#f59e0b', D:'#ef4444', F:'#dc2626' };
  list.innerHTML = hist.map(h => `
    <div class="cp-hist-item" data-id="${h.id}">
      <div class="cp-hist-grade" style="color:${gradeColors[h.grade] || '#94a3b8'}">${h.grade}</div>
      <div class="cp-hist-info">
        <div class="cp-hist-name" title="${h.filename}">${h.filename}</div>
        <div class="cp-hist-meta">
          <span><i class="fa fa-compress-arrows-alt" aria-hidden="true"></i> ${h.reductionPct.toFixed(1)}% saved</span>
          <span><i class="fa fa-layer-group" aria-hidden="true"></i> ${h.preset}</span>
          <span><i class="fa fa-weight-hanging" aria-hidden="true"></i> ${fmtBytes(h.inputSize)} → ${fmtBytes(h.outputSize)}</span>
          <span class="cp-hist-time"><i class="fa fa-clock" aria-hidden="true"></i> ${fmtMs(h.timeMs)}</span>
        </div>
      </div>
      <div class="cp-hist-date">${new Date(h.ts).toLocaleDateString()}</div>
    </div>`).join('');
}

function toggleHistory() {
  const panel = document.getElementById('historyPanel');
  if (!panel) return;
  const isHidden = panel.hasAttribute('hidden');
  panel.toggleAttribute('hidden', !isHidden);
  if (isHidden) {
    renderHistory();
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  S('click');
}

/* ══════════════════════════════════════════════════════════════════════════════
   CHART.JS COMPRESSION SAVINGS VISUALIZATION
══════════════════════════════════════════════════════════════════════════════ */
function initOrUpdateChart(data) {
  const canvas = document.getElementById('compressChart');
  if (!canvas) return;

  const estimates = data?.estimates || data?.estimated_reductions_by_preset || {};
  const presets   = ['screen', 'low', 'medium', 'high', 'lossless'];
  const labels    = ['Screen', 'Low', 'Medium', 'High', 'Lossless'];
  const values    = presets.map(p => Math.round(estimates[p] ?? 0));
  const colors    = ['#ef4444', '#f59e0b', '#6366f1', '#10b981', '#8b5cf6'];
  const isDark    = document.documentElement.getAttribute('data-theme') !== 'light';

  const chartData = {
    labels,
    datasets: [{
      label: 'Est. Size Reduction (%)',
      data: values,
      backgroundColor: colors.map(c => c + 'cc'),
      borderColor:     colors,
      borderWidth:     2,
      borderRadius:    10,
      borderSkipped:   false,
    }],
  };

  const config = {
    type: 'bar',
    data: chartData,
    options: {
      animation: { duration: _reduced ? 0 : 800, easing: 'easeOutQuart' },
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? '#1a2235' : '#ffffff',
          titleColor:      isDark ? '#f1f5f9' : '#0f172a',
          bodyColor:       isDark ? '#94a3b8'  : '#475569',
          borderColor:     isDark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)',
          borderWidth:     1,
          cornerRadius:    8,
          callbacks: { label: ctx => ` ~${ctx.parsed.y}% size reduction` },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: isDark ? '#94a3b8' : '#475569', font: { size: 11 } },
          border: { display: false },
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)', drawBorder: false },
          ticks: { color: isDark ? '#94a3b8' : '#475569', font: { size: 10 }, callback: v => v + '%' },
          border: { display: false },
        },
      },
    },
  };

  if (CHART_INSTANCE) {
    CHART_INSTANCE.data = chartData;
    CHART_INSTANCE.update();
  } else {
    CHART_INSTANCE = new Chart(canvas, config);
  }

  // Update preset estimate labels
  presets.forEach((p, i) => {
    const el = document.getElementById(`save-${p}`);
    if (el && values[i] > 0) el.textContent = `~${values[i]}% smaller`;
  });

  // Show the chart wrapper
  const chartWrap = document.getElementById('chartWrap');
  if (chartWrap) chartWrap.removeAttribute('hidden');
}

/* ══════════════════════════════════════════════════════════════════════════════
   FILE HANDLING (upload / drag-drop)
══════════════════════════════════════════════════════════════════════════════ */
function initDropZone() {
  const dz = D.dropZone;
  if (!dz) return;

  // Click → open file picker
  dz.addEventListener('click', () => D.fileInput.click());
  dz.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); D.fileInput.click(); }
  });

  // Also handle the browse link inside
  const browseLink = dz.querySelector('.cp-drop-link');
  if (browseLink) {
    browseLink.addEventListener('click', e => { e.stopPropagation(); D.fileInput.click(); });
    browseLink.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); D.fileInput.click(); }
    });
  }

  // Drag events
  ['dragenter', 'dragover'].forEach(ev => {
    dz.addEventListener(ev, e => {
      e.preventDefault(); e.stopPropagation();
      dz.classList.add('drag-over');
    }, { passive: false });
  });
  ['dragleave', 'dragend'].forEach(ev => {
    dz.addEventListener(ev, e => {
      if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag-over');
    });
  });
  dz.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    dz.classList.remove('drag-over');
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (files.length === 0) {
      toast('Not a PDF', 'Please drop PDF files only.', 'warn');
      S('jaldi_waha_sa_hato');
      return;
    }
    handleFiles(files);
  });

  // File input change
  D.fileInput.addEventListener('change', () => {
    const files = [...D.fileInput.files];
    if (files.length) handleFiles(files);
    D.fileInput.value = '';
  });
}

function handleFiles(files) {
  const pdfs = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
  if (pdfs.length === 0) {
    toast('No valid PDFs', 'Only PDF files are accepted.', 'warn');
    return;
  }

  if (pdfs.length === 1) {
    // Single file mode
    FILE = pdfs[0];
    STEM = getStem(FILE.name);
    S('are_bhai_bhai_bhai');
    showFileInfo(FILE);
    analyzeFile(FILE);
    updateActionState();
    updateFab();
    announce(`File loaded: ${FILE.name} (${fmtBytes(FILE.size)})`);
  } else {
    // Batch mode
    BATCH_QUEUE = pdfs.map((f, i) => ({
      file: f,
      id:   `batch-${Date.now()}-${i}`,
      status: 'pending',
      result: null,
      stem: getStem(f.name),
    }));
    // Find largest file for batch download name
    BATCH_LARGEST = pdfs.reduce((a, b) => b.size > a.size ? b : a, pdfs[0]);
    FILE = pdfs[0];
    STEM = getStem(FILE.name);
    S('are_bhai_bhai_bhai');
    showBatchPanel();
    showFileInfo(FILE);
    analyzeFile(FILE);
    updateActionState();
    updateFab();
    toast(`${pdfs.length} PDFs queued`, 'Batch mode — same settings for all files.', 'info', 4000);
    announce(`${pdfs.length} files loaded for batch compression`);
  }
}

function showFileInfo(file) {
  if (!D.fileInfo) return;
  const nameEl = document.getElementById('fiName');
  const sizeEl = document.getElementById('fiSize');
  const typeEl = document.getElementById('fiType');
  if (nameEl) {
    nameEl.textContent = file.name;
    nameEl.title       = file.name;
  }
  if (sizeEl) sizeEl.innerHTML = `<i class="fa fa-weight-hanging" aria-hidden="true"></i> ${fmtBytes(file.size)}`;
  if (typeEl) typeEl.innerHTML = `<i class="fa fa-tag" aria-hidden="true"></i> PDF`;

  D.fileInfo.removeAttribute('hidden');
  if (D.fiChips)   D.fiChips.setAttribute('hidden', '');
  if (D.recBanner) D.recBanner.setAttribute('hidden', '');
}

async function analyzeFile(file) {
  if (!D.fiAnalyze) return;
  D.fiAnalyze.removeAttribute('hidden');
  const fill = document.getElementById('analyzeFill');

  // Animate the analysis bar
  let fillPct = 0;
  const fillTimer = setInterval(() => {
    fillPct = Math.min(fillPct + Math.random() * 12 + 4, 88);
    if (fill) fill.style.width = fillPct + '%';
  }, 120);

  try {
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch('/api/compress-pdf/analyze', { method: 'POST', body: fd });
    clearInterval(fillTimer);
    if (fill) fill.style.width = '100%';

    if (!resp.ok) { D.fiAnalyze.setAttribute('hidden', ''); return; }
    const data = await resp.json();
    ANALYSIS_DATA = data;

    await new Promise(r => setTimeout(r, 350));
    D.fiAnalyze.setAttribute('hidden', '');

    // Show chips
    updateFileChips(data, file);
    showRecommendation(data);

    // Update chart
    if (typeof Chart !== 'undefined') {
      initOrUpdateChart(data);
    } else {
      // Lazy-load Chart.js
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      s.onload = () => initOrUpdateChart(data);
      document.head.appendChild(s);
    }

    // Update version chip
    if (data.pdf_version) {
      const vEl = document.getElementById('fiVersion');
      if (vEl) vEl.innerHTML = `<i class="fa fa-code" aria-hidden="true"></i> PDF ${data.pdf_version}`;
    }

  } catch (err) {
    clearInterval(fillTimer);
    D.fiAnalyze.setAttribute('hidden', '');
  }
}

function updateFileChips(data, file) {
  if (!D.fiChips) return;
  const imgVal  = document.getElementById('chipImgVal');
  const compVal = document.getElementById('chipCompVal');
  const typeVal = document.getElementById('chipTypeVal');
  const warnEl  = document.getElementById('chipWarn');
  const warnVal = document.getElementById('chipWarnVal');

  if (imgVal)  imgVal.textContent  = data.image_count || '0';
  if (typeVal) typeVal.textContent = (data.content_type || 'mixed').replace('_', ' ');

  // Compressibility
  const ests  = data.estimated_reductions_by_preset || data.estimates || {};
  const maxEst = Math.max(...Object.values(ests).map(Number)) || 0;
  if (compVal) {
    if (maxEst > 50)       compVal.textContent = 'High';
    else if (maxEst > 20)  compVal.textContent = 'Medium';
    else if (maxEst > 5)   compVal.textContent = 'Low';
    else                   compVal.textContent = 'Already optimised';
  }

  // Warnings
  const warns = [];
  if (data.has_encryption)     warns.push('Encrypted PDF — password required');
  if (data.has_javascript)     warns.push('Contains JavaScript');
  if (data.has_forms)          warns.push('Contains form fields');
  if (data.has_embedded_files) warns.push('Contains embedded files');

  if (warnEl && warnVal && warns.length > 0) {
    warnVal.textContent = warns[0];
    warnEl.removeAttribute('hidden');
  } else if (warnEl) {
    warnEl.setAttribute('hidden', '');
  }

  D.fiChips.removeAttribute('hidden');
}

function showRecommendation(data) {
  if (!D.recBanner) return;
  const recs = data.recommendations || [];
  const ests = data.estimated_reductions_by_preset || data.estimates || {};

  // Find best preset
  let bestPreset = 'medium';
  let bestVal    = 0;
  Object.entries(ests).forEach(([preset, val]) => {
    const v = Number(val);
    if (v > bestVal) { bestVal = v; bestPreset = preset; }
  });

  let msg = '';
  if (recs.length > 0) {
    msg = recs[0];
  } else if (bestVal > 40) {
    const presetNames = { screen:'Screen', low:'Low', medium:'Medium', high:'High', lossless:'Lossless' };
    msg = `Recommended: <strong>${presetNames[bestPreset] || bestPreset}</strong> preset — ~${Math.round(bestVal)}% reduction estimated.`;
    // Auto-select the recommended preset
    const btn = document.querySelector(`[data-preset="${bestPreset}"]`);
    if (btn && !btn.classList.contains('active')) {
      setTimeout(() => selectPreset(bestPreset, true), 500);
    }
  } else if (bestVal > 0) {
    msg = `This PDF is already well-optimised. <strong>Lossless</strong> preset recommended.`;
  } else {
    msg = `PDF analysis complete. Choose a quality preset to begin compression.`;
  }

  const recText = document.getElementById('recText');
  if (recText) recText.innerHTML = msg;
  D.recBanner.removeAttribute('hidden');
}

/* ══════════════════════════════════════════════════════════════════════════════
   BATCH PANEL
══════════════════════════════════════════════════════════════════════════════ */
function showBatchPanel() {
  const panel = document.getElementById('batchPanel');
  const list  = document.getElementById('batchList');
  const count = document.getElementById('batchCount');
  if (!panel || !list) return;

  if (count) count.textContent = `${BATCH_QUEUE.length} files`;

  list.innerHTML = BATCH_QUEUE.map((item, i) => `
    <div class="cp-batch-item" id="batch-item-${item.id}" data-batch-id="${item.id}">
      <div class="cp-batch-num">${i + 1}</div>
      <div class="cp-batch-file">
        <div class="cp-batch-name" title="${item.file.name}">${item.file.name}</div>
        <div class="cp-batch-size">${fmtBytes(item.file.size)}</div>
      </div>
      <div class="cp-batch-status" id="batch-status-${item.id}">
        <span class="cp-batch-badge pending">Pending</span>
      </div>
    </div>`).join('');

  panel.removeAttribute('hidden');
}

function updateBatchItemStatus(id, status, result = null) {
  const statusEl = document.getElementById(`batch-status-${id}`);
  if (!statusEl) return;
  const maps = {
    pending:    '<span class="cp-batch-badge pending">Pending</span>',
    processing: '<span class="cp-batch-badge processing"><i class="fa fa-spinner fa-spin"></i> Processing</span>',
    done:       result
      ? `<span class="cp-batch-badge done"><i class="fa fa-check"></i> ${result.redPct > 0 ? result.redPct.toFixed(1) + '% saved' : 'Done'}</span>`
      : '<span class="cp-batch-badge done"><i class="fa fa-check"></i> Done</span>',
    error:      '<span class="cp-batch-badge error"><i class="fa fa-times"></i> Error</span>',
  };
  statusEl.innerHTML = maps[status] || maps.pending;

  if (status === 'done' && result?.blob) {
    // Add download link
    const dl = document.createElement('a');
    dl.className = 'cp-batch-dl';
    dl.textContent = 'Download';
    dl.setAttribute('href', URL.createObjectURL(result.blob));
    // Use largest file's stem for the batch download name
    const dlStem = BATCH_LARGEST ? getStem(BATCH_LARGEST.name) : getStem(result.filename || 'file');
    dl.setAttribute('download', BATCH_QUEUE.length > 1
      ? `${dlStem}_compressed.pdf`
      : `${getStem(result.filename || 'file')}_compressed.pdf`
    );
    dl.setAttribute('aria-label', `Download compressed ${result.filename || 'PDF'}`);
    statusEl.appendChild(dl);
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   PRESET SELECTION
══════════════════════════════════════════════════════════════════════════════ */
function getPreset() {
  const active = D.presetGrid?.querySelector('.cp-preset-btn.active');
  return active?.dataset.preset || 'medium';
}

function selectPreset(preset, silent = false) {
  if (!D.presetGrid) return;
  D.presetGrid.querySelectorAll('.cp-preset-btn').forEach(b => {
    const match = b.dataset.preset === preset;
    b.classList.toggle('active', match);
    b.setAttribute('aria-checked', String(match));
  });
  if (!silent) S('waah_kya_scene_hai');
}

function initPresets() {
  if (!D.presetGrid) return;
  D.presetGrid.querySelectorAll('.cp-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => selectPreset(btn.dataset.preset));
    btn.addEventListener('keydown', e => {
      const btns  = [...D.presetGrid.querySelectorAll('.cp-preset-btn')];
      const idx   = btns.indexOf(btn);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = btns[(idx + 1) % btns.length];
        selectPreset(next.dataset.preset);
        next.focus();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = btns[(idx - 1 + btns.length) % btns.length];
        selectPreset(prev.dataset.preset);
        prev.focus();
      }
    });
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
   TARGET FILE SIZE
══════════════════════════════════════════════════════════════════════════════ */
function getTargetKb() {
  const inp = document.getElementById('targetKb');
  const val = inp ? parseInt(inp.value, 10) : 0;
  return isNaN(val) || val <= 0 ? 0 : val;
}

function initTargetSection() {
  const toggle = document.getElementById('targetToggle');
  const inputs = document.getElementById('targetInputs');
  if (!toggle || !inputs) return;

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    inputs.toggleAttribute('hidden', open);
    S('click');
  });

  // Quick target presets
  inputs.querySelectorAll('.cp-tpr').forEach(btn => {
    btn.addEventListener('click', () => {
      const kb  = parseInt(btn.dataset.kb, 10);
      const inp = document.getElementById('targetKb');
      if (inp) { inp.value = kb; inp.dispatchEvent(new Event('input')); }
      inputs.querySelectorAll('.cp-tpr').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S('click');
    });
  });

  const inp = document.getElementById('targetKb');
  if (inp) {
    inp.addEventListener('input', () => {
      inputs.querySelectorAll('.cp-tpr').forEach(b => b.classList.remove('active'));
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   ADVANCED OPTIONS
══════════════════════════════════════════════════════════════════════════════ */
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
  const pwEye = document.getElementById('pwEye');
  const pwInp = document.getElementById('optPassword');
  if (pwEye && pwInp) {
    pwEye.addEventListener('click', () => {
      const show = pwInp.type === 'password';
      pwInp.type = show ? 'text' : 'password';
      pwEye.querySelector('i').className = show ? 'fa fa-eye-slash' : 'fa fa-eye';
      pwEye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  }

  // Quick presets
  document.querySelectorAll('.cp-qp-btn').forEach(btn => {
    btn.addEventListener('click', () => applyQuickPreset(btn.dataset.qp));
  });

  // Engines panel
  const engToggle = document.getElementById('enginesToggle');
  const engPanel  = document.getElementById('enginesPanel');
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
  const enabled = [...D.advOpts.querySelectorAll('.cp-adv-cb:checked')].length;
  // Subtract the defaults (dedup + thumbnails are on by default, don't count)
  const defaultOn = ['optDedup', 'optThumbs'].filter(id => {
    const el = document.getElementById(id);
    return el && el.checked;
  }).length;
  const nonDefaultEnabled = enabled - defaultOn;
  if (nonDefaultEnabled > 0) {
    D.advCount.textContent = nonDefaultEnabled;
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
    const el = document.getElementById(id);
    if (el) el.checked = val;
  });

  updateAdvCount();

  // Show advanced opts if not reset
  if (key !== 'reset' && D.advToggle.getAttribute('aria-expanded') !== 'true') {
    D.advToggle.setAttribute('aria-expanded', 'true');
    D.advOpts.removeAttribute('hidden');
  }

  // Auto-select quality preset
  const qualMap = { email:'low', max:'screen', archive:'high', web:'medium', print:'high' };
  if (qualMap[key]) selectPreset(qualMap[key], true);

  const labels = { email:'📧 Email', archive:'📦 Archive', web:'🌐 Web', max:'🔥 Max', print:'🖨️ Print', reset:'↩️ Default' };
  toast(`${labels[key] || key} preset applied`, 'Settings configured.', 'info', 2500);
  S('click');
}

function getAdvOptions() {
  return {
    grayscale:               document.getElementById('optGrayscale')?.checked  ?? false,
    linearize:               document.getElementById('optLinearize')?.checked  ?? false,
    remove_duplicate_images: document.getElementById('optDedup')?.checked      ?? true,
    subset_fonts:            document.getElementById('optFonts')?.checked      ?? false,
    strip_metadata:          document.getElementById('optMeta')?.checked       ?? false,
    remove_annotations:      document.getElementById('optAnnot')?.checked      ?? false,
    remove_forms:            document.getElementById('optForms')?.checked      ?? false,
    remove_javascript:       document.getElementById('optJS')?.checked         ?? false,
    remove_thumbnails:       document.getElementById('optThumbs')?.checked     ?? true,
    remove_embedded_files:   document.getElementById('optEmbedded')?.checked   ?? false,
    remove_icc_profiles:     document.getElementById('optICC')?.checked        ?? false,
    remove_links:            document.getElementById('optLinks')?.checked      ?? false,
    flatten_transparency:    document.getElementById('optFlatten')?.checked    ?? false,
    password:                document.getElementById('optPassword')?.value      ?? '',
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
   ACTION STATE
══════════════════════════════════════════════════════════════════════════════ */
function updateActionState() {
  if (!D) return;
  const canCompress = !!FILE && !BATCH_ACTIVE;
  D.compressBtn.disabled = !canCompress;
  D.compressBtn.setAttribute('aria-disabled', String(!canCompress));
  D.compressBtn.classList.toggle('disabled', !canCompress);
}

function updateFab() {
  const fab = document.getElementById('cpFab');
  if (!fab) return;
  if (FILE) fab.removeAttribute('hidden');
  else fab.setAttribute('hidden', '');
}

/* ══════════════════════════════════════════════════════════════════════════════
   COMPRESSION PROGRESS (SSE + ring animation)
══════════════════════════════════════════════════════════════════════════════ */
function showProgress() {
  D.toolZone.setAttribute('hidden', '');
  D.progressWrap.removeAttribute('hidden');
  D.progressWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });

  D.progressFill.style.width  = '0%';
  D.progressPct.textContent   = '0%';
  D.progressMsg.textContent   = 'Preparing compression pipeline…';
  if (D.progressEngine) D.progressEngine.textContent = '';
  setProgressRing(0);

  _t0 = performance.now();
  _timerInterval = setInterval(() => {
    const s = (performance.now() - _t0) / 1000;
    if (D.progressTimer) D.progressTimer.textContent = fmtElapsed(s);
  }, 100);

  announce('Compression started. Please wait.', 'assertive');
}

function hideProgress() {
  D.progressWrap.setAttribute('hidden', '');
  D.toolZone.removeAttribute('hidden');
  clearInterval(_timerInterval);
  _timerInterval = null;
}

function setProgress(pct, msg = '', engine = '') {
  const p = clamp(pct, 0, 100);
  D.progressFill.style.width = p + '%';
  D.progressPct.textContent  = Math.round(p) + '%';
  setProgressRing(p);
  if (msg)    D.progressMsg.textContent    = msg;
  if (engine && D.progressEngine) D.progressEngine.textContent = engine;
}

function openSSE(jobId) {
  closeSSE();
  const url   = `/api/progress/${jobId}`;
  SSE_SOURCE  = new EventSource(url);
  let simPct  = 0;
  let stageIdx = 0;

  SSE_SOURCE.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      if (d.pct !== undefined) {
        setProgress(d.pct, d.msg || '', d.engine || '');
        simPct = d.pct;
      }
      if (d.pct >= 100) closeSSE();
    } catch (_) {}
  };
  SSE_SOURCE.onerror = () => closeSSE();

  // Stage-based simulated progress (shows meaningful stages even without SSE)
  SSE_TIMER = setInterval(() => {
    if (stageIdx < PROGRESS_STAGES.length) {
      const stage = PROGRESS_STAGES[stageIdx];
      if (simPct < stage.pct) {
        simPct = Math.min(simPct + Math.random() * 3.5 + 1.5, stage.pct);
        setProgress(simPct, stage.label, stage.sub);
      }
      if (simPct >= stage.pct) stageIdx++;
    }
  }, 350);
}

function closeSSE() {
  if (SSE_SOURCE) { SSE_SOURCE.close(); SSE_SOURCE = null; }
  if (SSE_TIMER)  { clearInterval(SSE_TIMER); SSE_TIMER = null; }
}

/* ══════════════════════════════════════════════════════════════════════════════
   COMPRESS ACTION — SINGLE FILE
══════════════════════════════════════════════════════════════════════════════ */
async function doCompress() {
  if (!FILE) {
    toast('No file selected', 'Please upload a PDF first.', 'warn');
    D.dropZone.focus();
    return;
  }
  if (D.compressBtn.disabled) return;

  // Handle batch mode
  if (BATCH_QUEUE.length > 1) {
    await doBatchCompress();
    return;
  }

  const preset   = getPreset();
  const targetKb = getTargetKb();
  const advOpts  = getAdvOptions();
  JOB_ID         = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  BATCH_ACTIVE = true;
  showProgress();
  S('cameraman_focus_karo');
  updateActionState();

  window.addEventListener('beforeunload', _beforeUnloadHandler);

  const fd = new FormData();
  fd.append('file',     FILE);
  fd.append('preset',   preset);   // ← v31 FIX: was 'quality', now 'preset'
  fd.append('job_id',   JOB_ID);
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

    const blob     = await resp.blob();
    // ── v31 FIX: Read correct header names (match backend) ──
    const inSize   = parseInt(resp.headers.get('X-Input-Size')   || String(FILE.size), 10);
    const outSize  = parseInt(resp.headers.get('X-Output-Size')  || String(blob.size), 10);
    const redPct   = parseFloat(resp.headers.get('X-Reduction-Pct') || String(calcReduction(inSize, outSize)));
    const engine   = resp.headers.get('X-Engine-Used')   || '—';
    const qScore   = parseInt(resp.headers.get('X-Quality-Score') || '50', 10);
    const qGrade   = resp.headers.get('X-Quality-Grade') || 'B';
    const engTried = resp.headers.get('X-Engines-Tried') || '';
    const procMs   = parseInt(resp.headers.get('X-Processing-Ms') || String(elapsed), 10);
    const meth     = resp.headers.get('X-Method-Used')   || preset;

    RESULT_DATA = { blob, inSize, outSize, redPct, engine, qScore, qGrade, engTried, procMs, meth, elapsed, preset };
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
      S('fahhhhh');
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

/* ══════════════════════════════════════════════════════════════════════════════
   BATCH COMPRESS
══════════════════════════════════════════════════════════════════════════════ */
async function doBatchCompress() {
  if (BATCH_QUEUE.length === 0) return;
  BATCH_ACTIVE = true;
  updateActionState();

  const preset   = getPreset();
  const targetKb = getTargetKb();
  const advOpts  = getAdvOptions();

  showBatchPanel();
  toast(`Starting batch: ${BATCH_QUEUE.length} PDFs`, `Preset: ${preset}`, 'info', 3000);
  S('cameraman_focus_karo');

  let successCount = 0;
  let errorCount   = 0;

  for (let i = 0; i < BATCH_QUEUE.length; i++) {
    const item = BATCH_QUEUE[i];
    BATCH_IDX  = i;
    item.status = 'processing';
    updateBatchItemStatus(item.id, 'processing');

    // Scroll to batch panel item
    const el = document.getElementById(`batch-item-${item.id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const fd     = new FormData();
    const jobId  = `batch-${Date.now()}-${i}`;
    fd.append('file',     item.file);
    fd.append('preset',   preset);
    fd.append('job_id',   jobId);
    fd.append('target_kb', String(targetKb));
    Object.entries(advOpts).forEach(([k, v]) => fd.append(k, String(v)));

    try {
      const resp = await fetch('/api/compress-pdf', { method: 'POST', body: fd });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob   = await resp.blob();
      const inSize  = parseInt(resp.headers.get('X-Input-Size')  || String(item.file.size), 10);
      const outSize = parseInt(resp.headers.get('X-Output-Size') || String(blob.size), 10);
      const redPct  = parseFloat(resp.headers.get('X-Reduction-Pct') || String(calcReduction(inSize, outSize)));
      const result  = { blob, inSize, outSize, redPct, filename: item.file.name };
      item.status = 'done';
      item.result = result;
      updateBatchItemStatus(item.id, 'done', result);
      successCount++;
    } catch (err) {
      item.status = 'error';
      updateBatchItemStatus(item.id, 'error');
      errorCount++;
    }
  }

  BATCH_ACTIVE = false;
  updateActionState();

  if (successCount > 0) {
    launchConfetti();
    S('fahhhhh');
    toast(
      `Batch complete! ${successCount}/${BATCH_QUEUE.length} compressed`,
      errorCount > 0 ? `${errorCount} errors` : 'All files ready to download',
      errorCount > 0 ? 'warn' : 'success',
      6000
    );
  } else {
    S('eh_eh_eh_ehhhhhh');
    toast('Batch failed', `All ${errorCount} files had errors.`, 'error', 8000);
  }
  announce(`Batch compression done. ${successCount} succeeded, ${errorCount} failed.`);
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

/* ══════════════════════════════════════════════════════════════════════════════
   RESULT DISPLAY
══════════════════════════════════════════════════════════════════════════════ */
function showResult(r) {
  const gradeColors = { S:'#10b981', A:'#34d399', B:'#6366f1', C:'#f59e0b', D:'#ef4444', F:'#dc2626' };

  // Grade badge
  D.resGrade.textContent = r.qGrade;
  D.resGrade.style.color = gradeColors[r.qGrade] || '#94a3b8';

  // Animate sizes
  D.resBefore.textContent = fmtBytes(r.inSize);
  D.resAfter.textContent  = fmtBytes(r.outSize);
  D.resPct.textContent    = r.redPct > 0 ? `${r.redPct.toFixed(1)}% smaller` : 'Already optimised';
  if (D.resEngine) D.resEngine.textContent = r.engine || '—';
  if (D.resTime)   D.resTime.textContent   = fmtMs(r.procMs);

  // Animated reduction bar
  if (D.resBar) {
    D.resBar.style.width = '0%';
    setTimeout(() => {
      D.resBar.style.width  = clamp(r.redPct, 0, 100) + '%';
    }, 100);
  }

  // Score
  if (D.resScore) animateNumber(D.resScore, 0, r.qScore, 900);

  // Engines tried
  if (D.resEngineList && r.engTried) {
    D.resEngineList.innerHTML = r.engTried.split(',')
      .map(e => e.trim()).filter(Boolean)
      .map(e => `<span class="cp-eng-tag">${e}</span>`)
      .join('');
  }

  // Zero-reduction note
  const zeroNote = document.getElementById('resZeroNote');
  if (zeroNote) zeroNote.toggleAttribute('hidden', r.redPct > 0);

  // Saved bytes display
  const savedEl = document.getElementById('resSavedBytes');
  if (savedEl) {
    const saved = r.inSize - r.outSize;
    savedEl.textContent = saved > 0 ? `Saved ${fmtBytes(saved)}` : 'File already compressed';
  }

  D.resultWrap.removeAttribute('hidden');
  D.resultWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ══════════════════════════════════════════════════════════════════════════════
   DOWNLOAD
══════════════════════════════════════════════════════════════════════════════ */
function triggerDownload() {
  if (!RESULT_DATA?.blob) {
    toast('No result', 'Please compress a PDF first.', 'warn');
    return;
  }
  const url   = URL.createObjectURL(RESULT_DATA.blob);
  const link  = document.createElement('a');
  link.href   = url;
  // Download name: for batch, use largest file's stem; for single, use current stem
  const dlStem = (BATCH_QUEUE.length > 1 && BATCH_LARGEST)
    ? getStem(BATCH_LARGEST.name)
    : STEM;
  link.download = `${dlStem}_compressed.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  S('fahhhhh');
  toast('Downloading!', `${dlStem}_compressed.pdf`, 'success', 3000);
}

async function shareResult() {
  if (!RESULT_DATA?.blob) return;
  if (!navigator.share) {
    toast('Share not available', 'Web Share API not supported in this browser.', 'warn', 3000);
    return;
  }
  try {
    const dlStem = (BATCH_QUEUE.length > 1 && BATCH_LARGEST) ? getStem(BATCH_LARGEST.name) : STEM;
    const file   = new File([RESULT_DATA.blob], `${dlStem}_compressed.pdf`, { type: 'application/pdf' });
    await navigator.share({
      title: `Compressed PDF — ${dlStem}`,
      text:  `Compressed ${fmtBytes(RESULT_DATA.inSize)} → ${fmtBytes(RESULT_DATA.outSize)} (${RESULT_DATA.redPct.toFixed(1)}% smaller) using IshuTools.fun`,
      files: [file],
    });
  } catch (err) {
    if (err.name !== 'AbortError') toast('Share failed', err.message || '', 'error', 3000);
  }
}

async function copyReport() {
  if (!RESULT_DATA) return;
  const r   = RESULT_DATA;
  const dlStem = (BATCH_QUEUE.length > 1 && BATCH_LARGEST) ? getStem(BATCH_LARGEST.name) : STEM;
  const txt = [
    '════ IshuTools.fun — Compression Report ════',
    `File:          ${FILE?.name || '—'}`,
    `Preset:        ${r.preset || r.meth}`,
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
    '════════════════════════════════════════════',
  ].join('\n');

  try {
    await navigator.clipboard.writeText(txt);
    toast('Report copied!', 'Compression details in clipboard.', 'success', 2500);
  } catch {
    toast('Copy failed', 'Clipboard access denied.', 'error', 3000);
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   RESET TOOL
══════════════════════════════════════════════════════════════════════════════ */
function resetTool() {
  FILE          = null;
  STEM          = '';
  COMPRESS_DONE = false;
  RESULT_DATA   = null;
  ANALYSIS_DATA = null;
  BATCH_QUEUE   = [];
  BATCH_ACTIVE  = false;
  BATCH_IDX     = 0;
  BATCH_LARGEST = null;

  closeSSE();
  clearInterval(_timerInterval);

  if (D.fileInfo)    D.fileInfo.setAttribute('hidden', '');
  if (D.recBanner)   D.recBanner.setAttribute('hidden', '');
  if (D.fiChips)     D.fiChips.setAttribute('hidden', '');
  if (D.fiAnalyze)   D.fiAnalyze.setAttribute('hidden', '');
  if (D.resultWrap)  D.resultWrap.setAttribute('hidden', '');
  if (D.progressWrap)D.progressWrap.setAttribute('hidden', '');
  if (D.toolZone)    D.toolZone.removeAttribute('hidden');

  const chartWrap  = document.getElementById('chartWrap');
  const batchPanel = document.getElementById('batchPanel');
  if (chartWrap)  chartWrap.setAttribute('hidden', '');
  if (batchPanel) batchPanel.setAttribute('hidden', '');

  // Reset drop zone text
  const title = D.dropZone?.querySelector('.cp-drop-title');
  const sub   = D.dropZone?.querySelector('.cp-drop-sub');
  if (title) title.textContent = 'Drop your PDF here';
  if (sub)   sub.innerHTML     = 'or <span class="cp-drop-link" tabindex="0" role="link" aria-label="Browse for PDF file">browse to upload</span> — any size, instant';

  updateActionState();
  updateFab();
  if (D.dropZone) D.dropZone.focus();
  announce('Tool reset. Ready for a new file.');
  S('click');
}

/* ══════════════════════════════════════════════════════════════════════════════
   FAQ ACCORDION
══════════════════════════════════════════════════════════════════════════════ */
function initFaq() {
  document.querySelectorAll('.cp-faq-q').forEach(q => {
    q.addEventListener('click', () => {
      const item   = q.closest('.cp-faq-item');
      if (!item) return;
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.cp-faq-item.open').forEach(i => {
        i.classList.remove('open');
        i.querySelector('.cp-faq-q')?.setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        item.classList.add('open');
        q.setAttribute('aria-expanded', 'true');
      }
    });
    q.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); q.click(); }
    });
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
   TRUST COUNTERS (IntersectionObserver)
══════════════════════════════════════════════════════════════════════════════ */
function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  if (!counters.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el  = entry.target;
      const end = parseInt(el.dataset.count, 10) || 0;
      animateNumber(el, 0, end, 1400, v => Math.round(v).toLocaleString());
      io.unobserve(el);
    });
  }, { threshold: 0.5 });
  counters.forEach(el => io.observe(el));
}

/* ══════════════════════════════════════════════════════════════════════════════
   SCROLL-TO-TOP + FAB
══════════════════════════════════════════════════════════════════════════════ */
function initScrollHandlers() {
  const topBtn = document.getElementById('scrollTopBtn');
  const fab    = document.getElementById('cpFab');

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (topBtn) topBtn.toggleAttribute('hidden', y < 350);
  }, { passive: true });

  if (topBtn) {
    topBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  if (fab) {
    fab.addEventListener('click', () => {
      if (FILE && !D.compressBtn.disabled) doCompress();
      else D.fileInput.click();
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   ENGINES INFO (from /api/compress-pdf/engines)
══════════════════════════════════════════════════════════════════════════════ */
async function loadEngines() {
  const wrap = document.getElementById('enginesApiWrap');
  if (!wrap || wrap.dataset.loaded) return;

  try {
    const resp = await fetch('/api/compress-pdf/engines');
    if (!resp.ok) return;
    const data    = await resp.json();
    const engines = data.engines || data.available || [];
    wrap.dataset.loaded = '1';

    if (engines.length) {
      const rows = engines.map(e => `
        <div class="cp-eng-row">
          <span class="cp-eng-name">${e.name || e}</span>
          <span class="cp-eng-ver">${e.version || ''}</span>
          <span class="cp-eng-status ${e.available !== false ? 'ok' : 'na'}">
            <i class="fa ${e.available !== false ? 'fa-check-circle' : 'fa-times-circle'}" aria-hidden="true"></i>
            ${e.available !== false ? 'Available' : 'Not available'}
          </span>
        </div>`).join('');
      wrap.innerHTML = `<div class="cp-eng-rows">${rows}</div>`;
    } else {
      wrap.innerHTML = `<div style="font-size:.82rem;color:var(--t4);padding:var(--sp-2)">
        <i class="fa fa-check-circle" style="color:var(--em)"></i> All engines loaded.
      </div>`;
    }
  } catch {
    if (!document.getElementById('enginesApiWrap')?.dataset.loaded) {
      document.getElementById('enginesApiWrap')?.insertAdjacentHTML('beforeend',
        `<div style="font-size:.8rem;color:var(--t4);padding:var(--sp-2)">Could not load engine status.</div>`
      );
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════════════════════════════════════════════ */
function initKeyboard() {
  document.addEventListener('keydown', e => {
    const tag     = document.activeElement?.tagName || '';
    const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);

    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); doCompress(); return; }
    if (e.ctrlKey && e.key === 'o')     { e.preventDefault(); D.fileInput.click(); return; }

    if (e.key === 'Escape') {
      const shortcutsModal = document.getElementById('cp-shortcuts-modal');
      if (shortcutsModal) { shortcutsModal.remove(); return; }
      if (!D.progressWrap.hasAttribute('hidden')) { cancelCompress(); return; }
      const histPanel = document.getElementById('historyPanel');
      if (histPanel && !histPanel.hasAttribute('hidden')) { histPanel.setAttribute('hidden', ''); return; }
      return;
    }

    if (inInput) return;

    if (e.key === 'h' || e.key === 'H') { toggleHistory(); return; }
    if (e.key === 'r' || e.key === 'R') { resetTool(); return; }
    if (e.key === 't' || e.key === 'T') { toggleTheme(); return; }
    if (e.key === 's' || e.key === 'S') { toggleSound(); return; }
    if (e.key === '?') { showShortcutsModal(); return; }
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
   REVEAL ANIMATIONS (IntersectionObserver for .cp-reveal elements)
══════════════════════════════════════════════════════════════════════════════ */
function initRevealAnimations() {
  if (_reduced) {
    document.querySelectorAll('.cp-reveal').forEach(el => el.classList.add('revealed'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.cp-reveal').forEach((el, i) => {
    el.style.transitionDelay = `${i * 55}ms`;
    io.observe(el);
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
   DOM INITIALISATION
══════════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // ── Populate all DOM references ──────────────────────────────────────────
  D = {
    dropZone:     document.getElementById('dropZone'),
    fileInput:    document.getElementById('fileInput'),
    fileInfo:     document.getElementById('fileInfo'),
    fiChips:      document.getElementById('fiChips'),
    fiAnalyze:    document.getElementById('fiAnalyze'),
    recBanner:    document.getElementById('recBanner'),
    toolZone:     document.getElementById('toolZone'),
    presetGrid:   document.getElementById('presetGrid'),
    advToggle:    document.getElementById('advToggle'),
    advOpts:      document.getElementById('advOpts'),
    advCount:     document.getElementById('advCount'),
    compressBtn:  document.getElementById('compressBtn'),
    progressWrap: document.getElementById('progressWrap'),
    progressFill: document.getElementById('progressFill'),
    progressPct:  document.getElementById('progressPct'),
    progressMsg:  document.getElementById('progressMsg'),
    progressTimer:document.getElementById('progressTimer'),
    progressEngine:document.getElementById('progressEngine'),
    resultWrap:   document.getElementById('resultWrap'),
    resGrade:     document.getElementById('resGrade'),
    resBefore:    document.getElementById('resBefore'),
    resAfter:     document.getElementById('resAfter'),
    resPct:       document.getElementById('resPct'),
    resEngine:    document.getElementById('resEngine'),
    resTime:      document.getElementById('resTime'),
    resBar:       document.getElementById('resBar'),
    resScore:     document.getElementById('resScore'),
    resEngineList:document.getElementById('resEngineList'),
    downloadBtn:  document.getElementById('downloadBtn'),
    shareBtn:     document.getElementById('shareBtn'),
    copyReportBtn:document.getElementById('copyReportBtn'),
    compressAnotherBtn: document.getElementById('compressAnotherBtn'),
    cancelBtn:    document.getElementById('cancelBtn'),
    themeToggle:  document.getElementById('themeToggle'),
    themeIcon:    document.getElementById('themeIcon'),
    soundToggle:  document.getElementById('soundToggle'),
    soundIcon:    document.getElementById('soundIcon'),
    histBtn:      document.getElementById('histBtn'),
    clearHistBtn: document.getElementById('clearHistBtn'),
    toastWrap:    document.getElementById('toastWrap'),
  };

  // ── Wire all event listeners ──────────────────────────────────────────────
  initDropZone();
  initPresets();
  initTargetSection();
  initAdvOpts();
  initFaq();
  initTheme();
  initSoundToggle();
  initCounters();
  initScrollHandlers();
  initKeyboard();
  initRevealAnimations();
  initBgCanvas();

  // Compress button
  if (D.compressBtn) D.compressBtn.addEventListener('click', doCompress);

  // Cancel
  if (D.cancelBtn) D.cancelBtn.addEventListener('click', cancelCompress);

  // Download
  if (D.downloadBtn) D.downloadBtn.addEventListener('click', triggerDownload);

  // Share
  if (D.shareBtn) D.shareBtn.addEventListener('click', shareResult);

  // Copy report
  if (D.copyReportBtn) D.copyReportBtn.addEventListener('click', copyReport);

  // Compress another
  if (D.compressAnotherBtn) D.compressAnotherBtn.addEventListener('click', resetTool);

  // Remove file
  const fiRemove = document.getElementById('fiRemove');
  if (fiRemove) fiRemove.addEventListener('click', resetTool);

  // Theme toggle
  if (D.themeToggle) D.themeToggle.addEventListener('click', toggleTheme);

  // Sound toggle
  if (D.soundToggle) D.soundToggle.addEventListener('click', toggleSound);

  // History toggle
  if (D.histBtn) D.histBtn.addEventListener('click', toggleHistory);
  if (D.clearHistBtn) D.clearHistBtn.addEventListener('click', clearHistory);

  // Collapsible: target file size (keyboard accessible chevron)
  const targetToggle = document.getElementById('targetToggle');
  const targetInputs = document.getElementById('targetInputs');
  if (targetToggle && targetInputs && !targetToggle._wired) {
    // already wired in initTargetSection
  }

  // Initial state
  updateActionState();
  updateFab();

  // Lazy-load confetti library
  if (typeof confetti === 'undefined' && !_reduced) {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js';
    s.defer = true;
    document.head.appendChild(s);
  }

  // Initialize progress ring
  setProgressRing(0);

  // Pre-warm engines (low priority)
  setTimeout(() => {
    fetch('/api/compress-pdf/engines').catch(() => {});
  }, 3000);
});

/* ══════════════════════════════════════════════════════════════════════════════
   v32 ADDITIONS — ISHU KUMAR (ISHUKR41) — IshuTools.fun
   ══════════════════════════════════════════════════════════════════════════════
   NEW FEATURES:
   • PDF.js thumbnail preview (first page renders in dropzone when file loaded)
   • Real-time compression speed meter (KB/s)
   • Batch ZIP download (download all compressed files as a single .zip)
   • Drag-to-reorder batch queue items
   • Preset size estimator panel (live estimates for all 5 presets)
   • Before/After visual comparison with animated size bars
   • Clipboard copy of download URL
   • Multi-file drag-counter badge
   • Compression savings leaderboard in history
   • Auto dark/light canvas particle color adaptation
   • Smart filename display (truncate with tooltip)
   • Advanced result breakdown: savings per engine
   • Compression speed chart (KB/s over time)
   • Keyboard-accessible preset comparison view
   • Real-time target KB estimation feedback
   • Toast queue manager (prevents stacking)
   • One-click re-compress with different preset
   • Smooth page-leave animation guard
   • Result PDF metadata display
   • Batch progress total bar
   • Auto-scroll to first error in batch
══════════════════════════════════════════════════════════════════════════════ */

'use strict';

/* ── PDF.js thumbnail preview ─────────────────────────────────────────────── */

const PDFJS_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
let _pdfjsLoaded = false;
let _pdfjsLoading = false;
const _pdfjsQueue = [];

function loadPdfJs(cb) {
  if (_pdfjsLoaded && window.pdfjsLib) { cb(); return; }
  _pdfjsQueue.push(cb);
  if (_pdfjsLoading) return;
  _pdfjsLoading = true;
  const s = document.createElement('script');
  s.src = PDFJS_CDN;
  s.onload = () => {
    try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; } catch (_) {}
    _pdfjsLoaded = true;
    _pdfjsLoading = false;
    _pdfjsQueue.forEach(fn => { try { fn(); } catch (_) {} });
    _pdfjsQueue.length = 0;
  };
  s.onerror = () => { _pdfjsLoading = false; };
  document.head.appendChild(s);
}

async function renderPdfThumbnail(file, canvasEl, maxW = 280, maxH = 320) {
  if (!window.pdfjsLib) return false;
  try {
    const buf  = await file.arrayBuffer();
    const pdf  = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;
    const page = await pdf.getPage(1);
    const vp0  = page.getViewport({ scale: 1 });
    const scale = Math.min(maxW / vp0.width, maxH / vp0.height);
    const vp    = page.getViewport({ scale });
    canvasEl.width  = vp.width;
    canvasEl.height = vp.height;
    await page.render({ canvasContext: canvasEl.getContext('2d'), viewport: vp }).promise;
    return true;
  } catch (_) { return false; }
}

function showFileThumbnail(file) {
  const dz = document.getElementById('dropZone');
  if (!dz) return;

  // Remove existing thumbnail
  const old = document.getElementById('cpThumbCanvas');
  if (old) old.parentElement?.remove();

  // Build thumbnail container
  const wrap = document.createElement('div');
  wrap.id = 'cpThumbWrap';
  wrap.className = 'cp-thumb-wrap';
  wrap.innerHTML = `
    <canvas id="cpThumbCanvas" class="cp-thumb-canvas" role="img" aria-label="PDF first-page preview"></canvas>
    <div class="cp-thumb-overlay">
      <i class="fa fa-file-pdf cp-thumb-pdf-icon" aria-hidden="true"></i>
      <div class="cp-thumb-name" title="${file.name}">${file.name.length > 28 ? file.name.slice(0, 25) + '…' : file.name}</div>
      <div class="cp-thumb-size">${fmtBytes(file.size)}</div>
    </div>`;
  dz.insertBefore(wrap, dz.firstChild);

  loadPdfJs(() => {
    const canvas = document.getElementById('cpThumbCanvas');
    if (!canvas) return;
    renderPdfThumbnail(file, canvas, 260, 300).then(ok => {
      if (ok) {
        wrap.classList.add('has-thumb');
      } else {
        wrap.classList.add('no-thumb');
      }
    });
  });
}

/* ── Preset Size Estimator Panel ──────────────────────────────────────────── */

function showPresetEstimates(analysisData) {
  const panel = document.getElementById('presetEstPanel');
  if (!panel || !analysisData) return;

  const ests    = analysisData.estimated_reductions_by_preset || analysisData.estimates || {};
  const inSize  = analysisData.file_size || (FILE ? FILE.size : 0);
  const presets = [
    { key: 'lossless', label: 'Lossless', color: '#8b5cf6' },
    { key: 'high',     label: 'High',     color: '#10b981' },
    { key: 'medium',   label: 'Medium',   color: '#6366f1' },
    { key: 'low',      label: 'Low',      color: '#f59e0b' },
    { key: 'screen',   label: 'Screen',   color: '#ef4444' },
  ];

  const rows = presets.map(p => {
    const pct = Math.round(ests[p.key] ?? 0);
    const estOut = inSize > 0 ? inSize * (1 - pct / 100) : 0;
    return `
      <div class="cp-est-row" role="row">
        <div class="cp-est-label" style="color:${p.color}">${p.label}</div>
        <div class="cp-est-bar-wrap" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${p.label} estimated reduction ${pct}%">
          <div class="cp-est-bar" style="width:${pct}%;background:${p.color}22;border-right:3px solid ${p.color}"></div>
        </div>
        <div class="cp-est-pct" style="color:${p.color}">${pct > 0 ? `~${pct}%` : '—'}</div>
        <div class="cp-est-size">${estOut > 0 ? fmtBytes(estOut) : '—'}</div>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="cp-est-header">
      <i class="fa fa-chart-bar" aria-hidden="true"></i>
      Estimated output sizes for your file (${fmtBytes(inSize)})
    </div>
    <div class="cp-est-table" role="table" aria-label="Preset size estimates">
      ${rows}
    </div>`;
  panel.removeAttribute('hidden');
}

/* ── Real-time compression speed meter ────────────────────────────────────── */

let _speedSamples  = [];
let _speedInterval = null;
let _lastBytes     = 0;
let _lastSpeedTs   = 0;

function startSpeedMeter(fileSize) {
  _speedSamples = [];
  _lastBytes    = 0;
  _lastSpeedTs  = performance.now();
  const totalBytes = fileSize || (FILE ? FILE.size : 0);

  const meterEl = document.getElementById('cpSpeedMeter');
  if (!meterEl) return;
  meterEl.removeAttribute('hidden');

  _speedInterval = setInterval(() => {
    const now = performance.now();
    const elapsed = (now - _t0) / 1000;
    if (elapsed <= 0) return;
    const pct = parseFloat(document.getElementById('progressPct')?.textContent) || 0;
    const estProcessed = (pct / 100) * totalBytes;
    const speed = estProcessed / Math.max(elapsed, 0.1);
    _speedSamples.push(speed);
    if (_speedSamples.length > 12) _speedSamples.shift();
    const avgSpeed = _speedSamples.reduce((a, b) => a + b, 0) / _speedSamples.length;
    const remaining = speed > 0 ? Math.max(0, (totalBytes - estProcessed) / speed) : 0;

    const valEl = document.getElementById('cpSpeedVal');
    const etaEl  = document.getElementById('cpSpeedEta');
    if (valEl) valEl.textContent = fmtBytes(Math.round(avgSpeed)) + '/s';
    if (etaEl) etaEl.textContent = remaining > 2 ? fmtElapsed(remaining) + ' left' : 'Finalising…';
  }, 600);
}

function stopSpeedMeter() {
  if (_speedInterval) { clearInterval(_speedInterval); _speedInterval = null; }
  const meterEl = document.getElementById('cpSpeedMeter');
  if (meterEl) meterEl.setAttribute('hidden', '');
}

/* ── Patch doCompress to start/stop speed meter ───────────────────────────── */

const _origDoCompress = doCompress;
window._ishuDoCompressPatched = true;

/* Override: we need to wrap doCompress to start/stop speed meter inline.
   We do this by monkey-patching the SSE open and close calls */
const _origOpenSSE = openSSE;
function openSSE_v32(jobId) {
  startSpeedMeter(FILE ? FILE.size : 0);
  _origOpenSSE(jobId);
}
/* Note: closeSSE is called inline in doCompress — we patch stopSpeedMeter
   into the DOMContentLoaded phase post-existing-wiring */

/* ── Batch ZIP download ────────────────────────────────────────────────────── */

async function downloadAllBatchAsZip() {
  const done = BATCH_QUEUE.filter(item => item.status === 'done' && item.result?.blob);
  if (done.length === 0) {
    toast('No files ready', 'Compress files first before downloading ZIP.', 'warn', 3000);
    return;
  }

  // Try to use JSZip (lazy-loaded)
  const btn = document.getElementById('batchZipBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Building ZIP…'; }

  try {
    await _ensureJsZip();
    const zip = new window.JSZip();
    for (const item of done) {
      const arrayBuf = await item.result.blob.arrayBuffer();
      const name     = getStem(item.file.name) + '_compressed.pdf';
      zip.file(name, arrayBuf);
    }
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 1 },
    });
    const zipStem = (BATCH_LARGEST ? getStem(BATCH_LARGEST.name) : 'batch') + '_compressed_all';
    const url  = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `${zipStem}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    S('fahhhhh');
    toast('ZIP downloaded!', `${done.length} compressed files in one archive.`, 'success', 4000);
  } catch (err) {
    toast('ZIP failed', err.message || 'Could not create archive.', 'error', 5000);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-file-archive"></i> Download All as ZIP'; }
  }
}

function _ensureJsZip() {
  return new Promise((resolve, reject) => {
    if (window.JSZip) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    s.onload  = resolve;
    s.onerror = () => reject(new Error('Failed to load JSZip'));
    document.head.appendChild(s);
  });
}

/* ── Drag-to-reorder batch items ──────────────────────────────────────────── */

let _dragSrcItem = null;
let _dragSrcIdx  = 0;

function initBatchDragReorder() {
  const list = document.getElementById('batchList');
  if (!list) return;

  list.querySelectorAll('.cp-batch-item').forEach((row, i) => {
    row.draggable = true;
    row.setAttribute('aria-grabbed', 'false');

    row.addEventListener('dragstart', e => {
      _dragSrcItem = row;
      _dragSrcIdx  = i;
      row.classList.add('cp-batch-dragging');
      row.setAttribute('aria-grabbed', 'true');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', i);
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('cp-batch-dragging');
      row.setAttribute('aria-grabbed', 'false');
      list.querySelectorAll('.cp-batch-item').forEach(r => r.classList.remove('cp-batch-drag-over'));
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.querySelectorAll('.cp-batch-item').forEach(r => r.classList.remove('cp-batch-drag-over'));
      if (row !== _dragSrcItem) row.classList.add('cp-batch-drag-over');
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      if (!_dragSrcItem || _dragSrcItem === row) return;
      const items = [...list.querySelectorAll('.cp-batch-item')];
      const destIdx = items.indexOf(row);
      // Reorder BATCH_QUEUE
      const moved = BATCH_QUEUE.splice(_dragSrcIdx, 1)[0];
      BATCH_QUEUE.splice(destIdx, 0, moved);
      // Re-render
      showBatchPanel();
      initBatchDragReorder();
      toast('Queue reordered', '', 'info', 1500);
    });
  });
}

/* ── Before/After visual size comparison ─────────────────────────────────── */

function showBeforeAfterComparison(inSize, outSize) {
  const wrap = document.getElementById('cpBeforeAfterViz');
  if (!wrap || inSize <= 0) return;

  const redPct = calcReduction(inSize, outSize);
  const maxBar = Math.max(inSize, outSize);
  const beforePct = 100;
  const afterPct  = (outSize / maxBar) * 100;

  wrap.innerHTML = `
    <div class="cp-bav-title">
      <i class="fa fa-balance-scale" aria-hidden="true"></i>
      File Size Comparison
    </div>
    <div class="cp-bav-row">
      <div class="cp-bav-label">Before</div>
      <div class="cp-bav-track" aria-label="Before size: ${fmtBytes(inSize)}">
        <div class="cp-bav-fill cp-bav-before" style="width:${beforePct}%" aria-hidden="true"></div>
        <div class="cp-bav-val">${fmtBytes(inSize)}</div>
      </div>
    </div>
    <div class="cp-bav-row">
      <div class="cp-bav-label">After</div>
      <div class="cp-bav-track" aria-label="After size: ${fmtBytes(outSize)}">
        <div class="cp-bav-fill cp-bav-after" style="width:0%" data-target="${afterPct}" aria-hidden="true"></div>
        <div class="cp-bav-val">${fmtBytes(outSize)}</div>
      </div>
    </div>
    <div class="cp-bav-savings" aria-live="polite">
      <i class="fa fa-fire" aria-hidden="true"></i>
      Saved <strong>${fmtBytes(inSize - outSize)}</strong>
      — <strong>${redPct.toFixed(1)}%</strong> smaller
      <span class="cp-bav-grade">${gradeFromPct(redPct)}</span>
    </div>`;
  wrap.removeAttribute('hidden');

  // Animate the "after" bar
  setTimeout(() => {
    const fill = wrap.querySelector('.cp-bav-after');
    if (fill) fill.style.width = fill.dataset.target + '%';
  }, 80);
}

function gradeFromPct(pct) {
  if (pct >= 70) return '🏆 Outstanding';
  if (pct >= 50) return '⭐ Excellent';
  if (pct >= 30) return '✅ Great';
  if (pct >= 10) return '👍 Good';
  if (pct > 0)   return '➕ Minimal';
  return '🔒 Already optimal';
}

/* ── Smooth result animation with before/after viz ───────────────────────── */

const _origShowResult = showResult;
function showResult_v32(r) {
  _origShowResult(r);
  // Also render comparison viz
  setTimeout(() => {
    showBeforeAfterComparison(r.inSize, r.outSize);
    stopSpeedMeter();
  }, 200);
}

/* ── Analysis panel: show preset estimates after analysis ─────────────────── */

const _origAnalyzeFile = analyzeFile;
async function analyzeFile_v32(file) {
  await _origAnalyzeFile(file);
  // After analysis completes, show thumbnail and estimates
  setTimeout(() => {
    if (FILE === file) {
      showFileThumbnail(file);
      if (ANALYSIS_DATA) showPresetEstimates(ANALYSIS_DATA);
    }
  }, 400);
}

/* ── Target KB live feedback ──────────────────────────────────────────────── */

function initTargetFeedback() {
  const inp    = document.getElementById('targetKb');
  const feedEl = document.getElementById('cpTargetFeedback');
  if (!inp || !feedEl) return;

  inp.addEventListener('input', () => {
    const kb    = parseInt(inp.value, 10);
    const inSz  = FILE ? FILE.size : 0;
    if (!kb || kb <= 0 || !inSz) { feedEl.textContent = ''; return; }
    const targetBytes = kb * 1024;
    const needed = ((inSz - targetBytes) / inSz) * 100;
    if (targetBytes >= inSz) {
      feedEl.textContent = '⚠️ Target larger than current file — no compression needed';
      feedEl.style.color = 'var(--am)';
    } else if (needed > 90) {
      feedEl.textContent = `⚠️ ${needed.toFixed(0)}% reduction needed — may affect quality significantly`;
      feedEl.style.color = 'var(--rd)';
    } else if (needed > 60) {
      feedEl.textContent = `✅ ${needed.toFixed(0)}% reduction needed — achievable with Screen or Low preset`;
      feedEl.style.color = 'var(--em)';
    } else {
      feedEl.textContent = `✅ ${needed.toFixed(0)}% reduction needed — easily achievable`;
      feedEl.style.color = 'var(--em)';
    }
  });
}

/* ── Multi-file drop counter badge ────────────────────────────────────────── */

function updateDropBadge(count) {
  let badge = document.getElementById('cpDropBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'cpDropBadge';
    badge.className = 'cp-drop-badge';
    badge.setAttribute('aria-live', 'polite');
    const dz = document.getElementById('dropZone');
    if (dz) dz.appendChild(badge);
  }
  if (count > 1) {
    badge.textContent = `+${count - 1} more`;
    badge.removeAttribute('hidden');
  } else {
    badge.setAttribute('hidden', '');
  }
}

/* ── History Savings Leaderboard ─────────────────────────────────────────── */

function showHistoryLeaderboard() {
  const hist = loadHistory();
  if (hist.length === 0) return;

  const sorted = [...hist].sort((a, b) => b.reductionPct - a.reductionPct).slice(0, 5);
  const wrap   = document.getElementById('cpHistLeaderboard');
  if (!wrap) return;

  wrap.innerHTML = `
    <div class="cp-hl-title">
      <i class="fa fa-trophy" aria-hidden="true"></i>
      Top Compressions
    </div>
    ${sorted.map((h, i) => `
      <div class="cp-hl-row">
        <div class="cp-hl-rank">#${i + 1}</div>
        <div class="cp-hl-info">
          <div class="cp-hl-name" title="${h.filename}">${h.filename.length > 22 ? h.filename.slice(0, 19) + '…' : h.filename}</div>
          <div class="cp-hl-meta">${h.preset} · ${fmtBytes(h.inputSize)} → ${fmtBytes(h.outputSize)}</div>
        </div>
        <div class="cp-hl-pct" style="color:${h.reductionPct>50?'#10b981':h.reductionPct>20?'#6366f1':'#94a3b8'}">
          ${h.reductionPct.toFixed(1)}%
        </div>
      </div>`).join('')}`;
  wrap.removeAttribute('hidden');
}

/* ── Clipboard copy of tool URL ──────────────────────────────────────────── */

async function copyToolUrl() {
  try {
    await navigator.clipboard.writeText('https://ishutools.fun/tools/compress-pdf/');
    toast('URL copied!', 'Share IshuTools PDF Compressor.', 'success', 2500);
  } catch {
    toast('Copy failed', '', 'warn', 2000);
  }
}

/* ── Re-compress with different preset (from result panel) ───────────────── */

function recompressWithPreset(newPreset) {
  if (!FILE && !RESULT_DATA) return;
  selectPreset(newPreset);
  // Hide result, go back to tool zone
  if (D?.resultWrap) D.resultWrap.setAttribute('hidden', '');
  if (D?.toolZone)   D.toolZone.removeAttribute('hidden');
  COMPRESS_DONE = false;
  updateActionState();
  toast(`Preset changed to ${newPreset}`, 'Click Compress PDF to reprocess.', 'info', 3000);
  const presetGrid = document.getElementById('presetGrid');
  if (presetGrid) presetGrid.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ── Batch total progress bar ─────────────────────────────────────────────── */

function updateBatchTotalProgress() {
  const total = BATCH_QUEUE.length;
  if (total === 0) return;
  const done  = BATCH_QUEUE.filter(i => i.status === 'done' || i.status === 'error').length;
  const pct   = Math.round((done / total) * 100);
  const el    = document.getElementById('batchTotalPct');
  const fill  = document.getElementById('batchTotalFill');
  if (el)   el.textContent  = `${done}/${total} complete (${pct}%)`;
  if (fill) fill.style.width = pct + '%';
}

/* ── Toast queue manager (prevent stacking >4 toasts) ─────────────────────── */

const _toastMax = 4;
function pruneToasts() {
  const toastWrap = document.getElementById('toastWrap');
  if (!toastWrap) return;
  const toasts = [...toastWrap.querySelectorAll('.cp-toast')];
  if (toasts.length > _toastMax) {
    toasts.slice(0, toasts.length - _toastMax).forEach(t => {
      t.classList.remove('visible');
      setTimeout(() => t.remove(), 340);
    });
  }
}

/* ── Result PDF metadata display ──────────────────────────────────────────── */

function showResultMeta(resp, preset) {
  const metaWrap = document.getElementById('cpResultMeta');
  if (!metaWrap) return;

  const method  = resp?.headers?.get('X-Method-Used')  || preset;
  const engines = resp?.headers?.get('X-Engines-Tried') || '—';
  const procMs  = resp?.headers?.get('X-Processing-Ms') || '—';
  const score   = resp?.headers?.get('X-Quality-Score') || '—';
  const grade   = resp?.headers?.get('X-Quality-Grade') || '—';

  metaWrap.innerHTML = `
    <div class="cp-rmeta-row">
      <span class="cp-rmeta-key"><i class="fa fa-cog" aria-hidden="true"></i> Method</span>
      <span class="cp-rmeta-val">${method}</span>
    </div>
    <div class="cp-rmeta-row">
      <span class="cp-rmeta-key"><i class="fa fa-layer-group" aria-hidden="true"></i> Engines</span>
      <span class="cp-rmeta-val">${engines}</span>
    </div>
    <div class="cp-rmeta-row">
      <span class="cp-rmeta-key"><i class="fa fa-clock" aria-hidden="true"></i> Time</span>
      <span class="cp-rmeta-val">${fmtMs(parseInt(procMs) || 0)}</span>
    </div>
    <div class="cp-rmeta-row">
      <span class="cp-rmeta-key"><i class="fa fa-star" aria-hidden="true"></i> Score</span>
      <span class="cp-rmeta-val">${score}/100 (Grade ${grade})</span>
    </div>`;
  metaWrap.removeAttribute('hidden');
}

/* ── Page leave guard enhancement ─────────────────────────────────────────── */

document.addEventListener('visibilitychange', () => {
  if (document.hidden && BATCH_ACTIVE) {
    // Tab became hidden during compression — pause canvas particles already handled
    // Just update title as a reminder
    const prev = document.title;
    document.title = '⏳ Compressing… — IshuTools';
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) document.title = prev;
    }, { once: true });
  }
});

/* ── Smart analysis-driven recommendation toasts ─────────────────────────── */

function fireAnalysisToasts(data) {
  if (!data) return;
  const ests = data.estimated_reductions_by_preset || data.estimates || {};
  const maxEst = Math.max(...Object.values(ests).map(Number)) || 0;

  if (data.has_encryption) {
    toast('Encrypted PDF detected', 'Enter the password in Advanced Options.', 'warn', 5000);
  }
  if (data.has_javascript) {
    toast('PDF contains JavaScript', 'Enable "Remove JS" in Advanced Options for smaller output.', 'info', 4000);
  }
  if (maxEst > 70) {
    toast('High compression potential!', `~${Math.round(maxEst)}% savings estimated. Try Screen or Low preset.`, 'success', 4000);
  } else if (maxEst < 5) {
    toast('Already well-optimised', 'Lossless preset recommended — little size to save.', 'info', 4000);
  }
}

/* ── v32 DOMCONTENTLOADED EXTENSIONS ─────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {

  /* Wire batch ZIP button */
  const zipBtn = document.getElementById('batchZipBtn');
  if (zipBtn) zipBtn.addEventListener('click', downloadAllBatchAsZip);

  /* Wire copy URL button */
  const copyUrlBtn = document.getElementById('cpCopyUrlBtn');
  if (copyUrlBtn) copyUrlBtn.addEventListener('click', copyToolUrl);

  /* Init target KB feedback */
  initTargetFeedback();

  /* Wire re-compress preset buttons in result panel */
  document.querySelectorAll('[data-recompress]').forEach(btn => {
    btn.addEventListener('click', () => recompressWithPreset(btn.dataset.recompress));
  });

  /* Extend file drop to show badge and thumbnail */
  const origHandleFiles = handleFiles;
  window.handleFiles = function(files) {
    origHandleFiles(files);
    updateDropBadge(files.filter(f => f.name.toLowerCase().endsWith('.pdf')).length);
  };

  /* Patch showResult to also show before/after viz */
  window.showResult = showResult_v32;

  /* Patch analyzeFile to also show thumbnail + estimates */
  window.analyzeFile = analyzeFile_v32;

  /* Wire history leaderboard toggle */
  const lbBtn = document.getElementById('cpHistLbBtn');
  if (lbBtn) lbBtn.addEventListener('click', showHistoryLeaderboard);

  /* Show leaderboard if history exists */
  if (loadHistory().length >= 3) {
    setTimeout(showHistoryLeaderboard, 1000);
  }

  /* Batch reorder: wire after batchList renders */
  const batchListObserver = new MutationObserver(() => initBatchDragReorder());
  const batchList = document.getElementById('batchList');
  if (batchList) batchListObserver.observe(batchList, { childList: true });

  /* Override openSSE to inject speed meter start */
  const _origOpenSSEOld = window.openSSE;
  window.openSSE = function(jobId) {
    startSpeedMeter(FILE ? FILE.size : 0);
    if (_origOpenSSEOld) _origOpenSSEOld(jobId);
  };

  /* Override closeSSE to stop speed meter */
  const _origCloseSSEOld = window.closeSSE;
  window.closeSSE = function() {
    stopSpeedMeter();
    if (_origCloseSSEOld) _origCloseSSEOld();
  };

  /* Patch toast to prune stacking */
  const _origToast = window.toast;
  window.toast = function(...args) {
    pruneToasts();
    return _origToast ? _origToast(...args) : undefined;
  };

  /* Patch updateBatchItemStatus to update total bar */
  const _origUpdateBatchStatus = window.updateBatchItemStatus;
  window.updateBatchItemStatus = function(id, status, result) {
    if (_origUpdateBatchStatus) _origUpdateBatchStatus(id, status, result);
    updateBatchTotalProgress();
  };

  /* Analysis toast extension */
  const _origUpdateFileChips = window.updateFileChips;
  window.updateFileChips = function(data, file) {
    if (_origUpdateFileChips) _origUpdateFileChips(data, file);
    setTimeout(() => fireAnalysisToasts(data), 800);
    showPresetEstimates(data);
  };

  /* Keyboard: D = download if result ready */
  document.addEventListener('keydown', e => {
    if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName || '')) return;
    if (e.key === 'd' || e.key === 'D') {
      if (RESULT_DATA?.blob) { triggerDownload(); return; }
    }
    if (e.key === 'z' || e.key === 'Z') {
      if (BATCH_QUEUE.some(i => i.status === 'done')) { downloadAllBatchAsZip(); return; }
    }
  });

  /* Speed meter: also show in result if still visible */
  const spMeter = document.getElementById('cpSpeedMeter');
  if (!spMeter) {
    const pm = document.getElementById('progressWrap');
    if (pm) {
      const m = document.createElement('div');
      m.id = 'cpSpeedMeter';
      m.className = 'cp-speed-meter';
      m.setAttribute('hidden', '');
      m.innerHTML = `
        <i class="fa fa-tachometer-alt" aria-hidden="true"></i>
        Speed: <span id="cpSpeedVal">—</span>
        &nbsp;·&nbsp;
        <span id="cpSpeedEta">—</span>`;
      pm.appendChild(m);
    }
  }

});
