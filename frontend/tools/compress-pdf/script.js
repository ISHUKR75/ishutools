/**
 * IshuTools.fun — Compress PDF script.js v41.0
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun
 * GitHub: https://github.com/ISHUKR41 | https://github.com/ISHUKR75
 *
 * ════════════════════════════════════════════════════════════════════════════
 * v41.0 — APEX EDITION — NEW FEATURES OVER v40:
 * ════════════════════════════════════════════════════════════════════════════
 *   ✅ Drag-to-reorder batch queue (HTML5 drag API)
 *   ✅ Live preset estimation panel (per-preset estimated sizes from analysis)
 *   ✅ Progress timeline (visual stage-by-stage breakdown with icons)
 *   ✅ Animated result counters (numbers count up on result reveal)
 *   ✅ Retry failed batch items (one-click retry per file)
 *   ✅ Preset hover tooltip (shows estimated size/reduction on hover)
 *   ✅ Batch summary chart (Chart.js — multi-bar before/after per file)
 *   ✅ Compression fingerprint (unique ID per compression)
 *   ✅ Enhanced copy report (includes batch stats, fingerprint, full engine list)
 *   ✅ New keyboard shortcuts: B=batch panel, P=cycle presets, I=analysis info
 *   ✅ Per-preset color theming on selection (ring color matches preset)
 *   ✅ Analysis chip deep-dive tooltip on click
 *   ✅ Improved mobile FAB with haptic feedback (vibration API)
 *   ✅ Paste PDF from clipboard (preserved from v40 + improved UX)
 *   ✅ beforeunload guard is per-compression (clears after result)
 *   ✅ Accessible focus trap in shortcuts modal
 *   ✅ Reduced motion: all animations skip if prefers-reduced-motion
 * ════════════════════════════════════════════════════════════════════════════
 */

'use strict';

/* ════════════════════════════════════════════════════════════════════════════
   MODULE-SCOPE STATE
════════════════════════════════════════════════════════════════════════════ */
let FILE            = null;
let STEM            = '';
let JOB_ID          = '';
let SSE_SOURCE      = null;
let SSE_TIMER       = null;
let COMPRESS_DONE   = false;
let RESULT_DATA     = null;
let ANALYSIS_DATA   = null;
let CHART_INSTANCE  = null;
let BATCH_CHART     = null;
let _t0             = 0;
let _timerInterval  = null;
let _confettiLoaded = false;
let _reduced        = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let _currentPreset  = 'medium';
let _dragSrcId      = null;

// Batch queue state
let BATCH_QUEUE     = [];
let BATCH_ACTIVE    = false;
let BATCH_IDX       = 0;
let BATCH_LARGEST   = null;
let BATCH_ZIP_PARTS = [];

// Undo last batch item removal
let _deletedStack   = [];

// DOM refs (populated in DOMContentLoaded)
let D = null;

// History
const HISTORY_KEY = 'cp-history-v4';
const HISTORY_MAX = 20;

// Progress stages
const PROGRESS_STAGES = [
  { pct:  5, label: 'Initialising…',          sub: 'Loading compression engines',         icon: 'fa-cog' },
  { pct: 12, label: 'Analysing PDF…',          sub: 'Scanning images, fonts, streams',     icon: 'fa-search' },
  { pct: 25, label: 'Engine 1: pikepdf…',      sub: 'Lossless stream recompression',       icon: 'fa-compress' },
  { pct: 38, label: 'Engine 2: Ghostscript…',  sub: 'Applying distiller preset',           icon: 'fa-ghost' },
  { pct: 50, label: 'Engine 3: PyMuPDF…',      sub: 'Image DPI optimisation',              icon: 'fa-image' },
  { pct: 62, label: 'Engine 4: qpdf…',         sub: 'Stream linearisation',                icon: 'fa-bolt' },
  { pct: 72, label: 'Engines 5–8…',            sub: 'Pillow, mutool, dedup, content streams', icon: 'fa-layer-group' },
  { pct: 84, label: 'Engines 9–12…',           sub: 'Chain passes — picking best result',  icon: 'fa-trophy' },
  { pct: 93, label: 'Post-processing…',         sub: 'Applying advanced options',           icon: 'fa-sliders-h' },
  { pct: 98, label: 'Finalising…',             sub: 'Verifying output & preparing download', icon: 'fa-check-circle' },
];

// Preset info
const PRESET_INFO = {
  lossless: { emoji:'🔮', color:'#8b5cf6', name:'Lossless',   est:'2–25%',  detail:'Zero quality loss. pikepdf stream recompression only.' },
  high:     { emoji:'💎', color:'#10b981', name:'High',       est:'10–40%', detail:'Near-lossless. No image DPI downsampling.' },
  medium:   { emoji:'⚖️', color:'#6366f1', name:'Medium',     est:'40–65%', detail:'Best balance. Recommended for most PDFs.' },
  low:      { emoji:'📧', color:'#f59e0b', name:'Low',        est:'55–78%', detail:'Aggressive. Good for email & web sharing.' },
  screen:   { emoji:'🔥', color:'#ef4444', name:'Screen',     est:'75–92%', detail:'Maximum compression. Screen resolution only.' },
};

const PRESET_ORDER = ['lossless','high','medium','low','screen'];

const GRADE_COLORS = {
  'S': '#f59e0b', 'A': '#10b981', 'A+': '#10b981',
  'B': '#6366f1', 'C': '#8b5cf6', 'D': '#f59e0b', 'F': '#ef4444',
};

/* ════════════════════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
════════════════════════════════════════════════════════════════════════════ */

function fmtBytes(b) {
  if (b == null || isNaN(b) || b < 0) return '—';
  if (b === 0) return '0 B';
  const u = ['B','KB','MB','GB','TB'];
  const i = Math.min(Math.floor(Math.log(Math.abs(b)) / Math.log(1024)), u.length - 1);
  const v = b / Math.pow(1024, i);
  return (i === 0 ? v : v < 10 ? v.toFixed(2) : v.toFixed(1)) + '\u202F' + u[i];
}

function fmtMs(ms) {
  if (ms == null || isNaN(ms)) return '—';
  if (ms < 1000) return ms + '\u202Fms';
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

function getStem(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
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

function announce(msg, priority = 'polite') {
  const el = document.getElementById('cp-sr-announce');
  if (!el) return;
  el.setAttribute('aria-live', priority);
  el.textContent = '';
  setTimeout(() => { el.textContent = msg; }, 50);
}

function S(key) {
  try {
    if (window.SOUNDS && typeof window.SOUNDS[key] === 'function') {
      window.SOUNDS[key]();
    }
  } catch (_) {}
}

function $(id) { return document.getElementById(id); }

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutQuad(t) { return t < .5 ? 2*t*t : -1+(4-2*t)*t; }

function generateId() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
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
  for (let i = 0; i < 28; i++) {
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
   TOAST SYSTEM
════════════════════════════════════════════════════════════════════════════ */
function toast(title, msg = '', type = 'info', duration = 4000) {
  const wrap = D?.toastWrap || $('toastWrap');
  if (!wrap) return;

  const icons = { success:'fa-check-circle', error:'fa-times-circle', warn:'fa-exclamation-triangle', info:'fa-info-circle' };
  const colors = { success:'var(--em)', error:'var(--rd)', warn:'var(--am)', info:'var(--in)' };

  const el = document.createElement('div');
  el.className = `cp-toast cp-toast-${type}`;
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <i class="fa ${icons[type] || icons.info}" style="color:${colors[type]};flex-shrink:0"></i>
    <div class="cp-toast-body">
      <div class="cp-toast-title">${title}</div>
      ${msg ? `<div class="cp-toast-msg">${msg}</div>` : ''}
    </div>
    <button class="cp-toast-close" aria-label="Dismiss notification"><i class="fa fa-times"></i></button>
  `;
  wrap.appendChild(el);

  const dismiss = () => {
    el.classList.add('cp-toast-out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  };
  el.querySelector('.cp-toast-close').addEventListener('click', dismiss);
  if (duration > 0) setTimeout(dismiss, duration);
  return el;
}

/* ════════════════════════════════════════════════════════════════════════════
   THEME & SOUND
════════════════════════════════════════════════════════════════════════════ */
function initTheme() {
  const saved = lsGet('cp-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  _applyThemeIcon(saved);
}

function toggleTheme() {
  const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  lsSet('cp-theme', next);
  _applyThemeIcon(next);
  S('click');
}

function _applyThemeIcon(theme) {
  if (!D?.themeIcon) return;
  D.themeIcon.className = theme === 'dark' ? 'fa fa-sun' : 'fa fa-moon';
  if (D.themeToggle) D.themeToggle.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}

function initSoundToggle() {
  const muted = lsGet('cp-sound') === 'off';
  if (D?.soundIcon) D.soundIcon.className = muted ? 'fa fa-volume-mute' : 'fa fa-volume-up';
  if (window.SOUNDS) window.SOUNDS._muted = muted;
}

function toggleSound() {
  const muted = lsGet('cp-sound') === 'off';
  const next  = muted ? 'on' : 'off';
  lsSet('cp-sound', next);
  if (D?.soundIcon) D.soundIcon.className = next === 'off' ? 'fa fa-volume-mute' : 'fa fa-volume-up';
  if (window.SOUNDS) window.SOUNDS._muted = (next === 'off');
  if (next === 'on') S('click');
}

/* ════════════════════════════════════════════════════════════════════════════
   ANIMATED BACKGROUND CANVAS
════════════════════════════════════════════════════════════════════════════ */
function initBgCanvas() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas || _reduced) return;

  const ctx    = canvas.getContext('2d');
  let W, H, particles;
  const PARTICLE_COUNT = 55;
  const MAX_DIST = 130;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function mkParticle() {
    return {
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - .5) * 0.35,
      vy: (Math.random() - .5) * 0.35,
      r:  1.5 + Math.random() * 2.5,
      alpha: 0.2 + Math.random() * 0.5,
    };
  }

  function init() {
    resize();
    particles = Array.from({ length: PARTICLE_COUNT }, mkParticle);
  }

  function loop() {
    if (document.hidden) { requestAnimationFrame(loop); return; }
    ctx.clearRect(0, 0, W, H);

    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(16,185,129,${p.alpha})`;
      ctx.fill();
    }

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < MAX_DIST) {
          const a = (1 - d / MAX_DIST) * 0.15;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(99,102,241,${a})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(loop);
  }

  init();
  loop();
  window.addEventListener('resize', debounce(resize, 200), { passive: true });
}

/* ════════════════════════════════════════════════════════════════════════════
   HISTORY
════════════════════════════════════════════════════════════════════════════ */
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

function saveHistory(h) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, HISTORY_MAX))); }
  catch {}
}

function addHistory(entry) {
  const hist = loadHistory();
  hist.unshift(entry);
  saveHistory(hist);
  const count = $('historyCount');
  if (count) count.textContent = Math.min(hist.length, HISTORY_MAX);
}

function clearHistory() {
  saveHistory([]);
  renderHistory();
  const count = $('historyCount');
  if (count) count.textContent = '0';
  toast('History cleared', '', 'info', 2000);
  S('click');
}

function renderHistory() {
  const list = $('historyList');
  if (!list) return;
  const hist = loadHistory();
  if (!hist.length) {
    list.innerHTML = `<div class="cp-hist-empty"><i class="fa fa-clock"></i><span>No compressions yet</span></div>`;
    return;
  }

  list.innerHTML = hist.map((h, idx) => {
    const pct  = h.reductionPct;
    const gc   = GRADE_COLORS[h.grade] || '#94a3b8';
    const pi   = PRESET_INFO[h.preset] || { emoji:'⚙️', color:'#94a3b8' };
    const bar  = clamp(pct, 0, 100);
    return `
    <div class="cp-hist-item" tabindex="0" role="button" data-idx="${idx}">
      <div class="cp-hist-top">
        <span class="cp-hist-grade" style="color:${gc}">${h.grade}</span>
        <span class="cp-hist-name" title="${h.filename}">${h.filename}</span>
        <span class="cp-hist-pct" style="color:var(--em)">${pct.toFixed(1)}%</span>
      </div>
      <div class="cp-hist-bar-wrap">
        <div class="cp-hist-bar" style="width:${bar}%;background:${pi.color}"></div>
      </div>
      <div class="cp-hist-meta">
        <span>${pi.emoji} ${h.preset}</span>
        <span>${fmtBytes(h.inputSize)} → ${fmtBytes(h.outputSize)}</span>
        <span>${fmtMs(h.timeMs)}</span>
        <span style="color:var(--t5)">${new Date(h.ts).toLocaleDateString()}</span>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.cp-hist-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.idx, 10);
      const h   = loadHistory()[idx];
      if (h) toast(h.filename, `${h.reductionPct.toFixed(1)}% saved · ${fmtBytes(h.inputSize)} → ${fmtBytes(h.outputSize)}`, 'info', 5000);
    });
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') item.click();
    });
  });
}

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

function exportHistoryCsv() {
  const hist = loadHistory();
  if (!hist.length) { toast('No history to export', '', 'warn'); return; }
  const headers = 'Filename,Preset,Input Size,Output Size,Reduction %,Grade,Engine,Time ms,Date,Fingerprint';
  const rows = hist.map(h =>
    [h.filename, h.preset, h.inputSize, h.outputSize,
     h.reductionPct.toFixed(1), h.grade, h.engine, h.timeMs, h.ts, h.fingerprint || ''].join(',')
  );
  const csv = [headers, ...rows].join('\n');
  _dlText(csv, 'ishutools-compress-history.csv', 'text/csv');
  toast('CSV exported!', 'compression history', 'success', 2500);
  S('fahhhhh');
}

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
   FILE HANDLING & DROP ZONE
════════════════════════════════════════════════════════════════════════════ */
function initDropZone() {
  if (!D.dropZone || !D.fileInput) return;

  D.dropZone.addEventListener('click', e => {
    e.stopPropagation();
    D.fileInput.click();
  });

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

  ['dragenter','dragover'].forEach(evt => {
    D.dropZone.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation();
      D.dropZone.classList.add('drag-over');
    }, { passive: false });
  });
  ['dragleave','dragend'].forEach(evt => {
    D.dropZone.addEventListener(evt, e => {
      if (!D.dropZone.contains(e.relatedTarget)) D.dropZone.classList.remove('drag-over');
    });
  });
  D.dropZone.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    D.dropZone.classList.remove('drag-over');
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (files.length) handleFiles(files);
    else toast('PDF files only', 'Please drop a valid PDF file.', 'warn');
  }, { passive: false });

  D.dropZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); D.fileInput.click(); }
  });

  D.fileInput.addEventListener('change', () => {
    const files = [...(D.fileInput.files || [])].filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (files.length) handleFiles(files);
    D.fileInput.value = '';
  });
}

function handleFiles(files) {
  if (!files || files.length === 0) return;
  if (files.length === 1) handleSingleFile(files[0]);
  else handleBatchFiles(files);
}

function handleSingleFile(file) {
  FILE = file;
  STEM = getStem(file.name);
  BATCH_QUEUE   = [];
  BATCH_LARGEST = null;
  showFileInfo(file);
  S('are_bhai_bhai_bhai');
  announce(`File selected: ${file.name}, ${fmtBytes(file.size)}`);
  updateActionState();
  updateFab();
  setTimeout(() => {
    D.toolInner?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 200);
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
  toast(`${files.length} PDFs queued`, `Batch ready — largest: ${fmtBytes(sorted[0].size)}`, 'info', 4000);
  announce(`${files.length} files added for batch compression.`);
  updateActionState();
  updateFab();
  runAnalysis(sorted[0]);
}

function showFileInfo(file) {
  if (!D.fileInfo) return;
  D.fileInfo.removeAttribute('hidden');
  const nameEl    = $('fiName');
  const sizeEl    = $('fiSize');
  const typeEl    = $('fiType');
  const pagesEl   = $('fiPages');
  const versionEl = $('fiVersion');
  if (nameEl)    nameEl.textContent    = file.name;
  if (sizeEl)    sizeEl.textContent    = fmtBytes(file.size);
  if (typeEl)    typeEl.textContent    = 'PDF';
  if (pagesEl)   pagesEl.textContent   = '…';
  if (versionEl) versionEl.textContent = '…';
  const chips = $('fiChips');
  if (chips) chips.setAttribute('hidden', '');
}

function removeFile() {
  FILE = null;
  STEM = '';
  BATCH_QUEUE   = [];
  BATCH_LARGEST = null;
  ANALYSIS_DATA = null;
  if (D.fileInfo) D.fileInfo.setAttribute('hidden', '');
  const est = $('presetEstPanel');
  if (est) est.setAttribute('hidden', '');
  const scr = $('cpScoreRing');
  if (scr) scr.setAttribute('hidden', '');
  const chips = $('fiChips');
  if (chips) chips.setAttribute('hidden', '');
  hideBatchPanel();
  updateActionState();
  updateFab();
  D.dropZone?.focus();
  announce('File removed. Upload a new PDF.');
}

/* ════════════════════════════════════════════════════════════════════════════
   PDF ANALYSIS
════════════════════════════════════════════════════════════════════════════ */
async function runAnalysis(file) {
  const chips = $('fiChips');
  if (chips) {
    chips.removeAttribute('hidden');
    chips.innerHTML = `<span class="cp-chip cp-chip-loading"><i class="fa fa-spinner fa-spin"></i> Analysing…</span>`;
  }

  try {
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch('/api/compress-pdf/analyze', { method:'POST', body: fd });
    if (!resp.ok) throw new Error('Analysis failed');
    const data = await resp.json();
    ANALYSIS_DATA = data;
    renderAnalysisChips(data);
    renderAnalysisExtras(data);
    renderLiveEstPanel(data, file.size);
  } catch {
    if (chips) chips.innerHTML = `<span class="cp-chip" style="color:var(--t5)"><i class="fa fa-info-circle"></i> Analysis unavailable</span>`;
  }
}

function renderAnalysisChips(data) {
  const chips = $('fiChips');
  if (!chips) return;

  const pages    = data.page_count || '?';
  const imgCount = data.image_count || 0;
  const cType    = data.content_type || 'mixed';
  const compScore = data.compressibility?.score ?? null;
  const pagesEl  = $('fiPages');
  if (pagesEl) pagesEl.textContent = pages;
  const verEl    = $('fiVersion');
  if (verEl && data.pdf_version) verEl.textContent = `v${data.pdf_version}`;

  const cLabel = { text:'Text-only', image:'Image-heavy', mixed:'Mixed', scanned:'Scanned' };
  const scoreColor = compScore != null
    ? (compScore >= 70 ? 'var(--em)' : compScore >= 40 ? 'var(--am)' : 'var(--rd)')
    : 'var(--t4)';

  chips.removeAttribute('hidden');
  chips.innerHTML = `
    <span class="cp-chip"><i class="fa fa-file-pdf"></i> ${pages} pages</span>
    <span class="cp-chip"><i class="fa fa-image"></i> ${imgCount} images</span>
    <span class="cp-chip"><i class="fa fa-tag"></i> ${cLabel[cType] || cType}</span>
    ${compScore != null ? `<span class="cp-chip" style="color:${scoreColor};cursor:pointer" title="Compressibility score: how much this file can be compressed"><i class="fa fa-compress-arrows-alt"></i> ${compScore}% compressible</span>` : ''}
    ${data.has_javascript ? `<span class="cp-chip" style="color:var(--am)"><i class="fa fa-code"></i> Has JS</span>` : ''}
    ${data.has_forms ? `<span class="cp-chip" style="color:var(--in3)"><i class="fa fa-wpforms"></i> Has forms</span>` : ''}
    ${data.is_scanned ? `<span class="cp-chip" style="color:var(--pu3)"><i class="fa fa-scan"></i> Scanned</span>` : ''}
    ${data.has_encryption ? `<span class="cp-chip" style="color:var(--am)"><i class="fa fa-lock"></i> Encrypted</span>` : ''}
  `;
}

function renderAnalysisExtras(data) {
  const recBanner = $('recBanner');
  if (recBanner && data.recommended_preset) {
    const pi = PRESET_INFO[data.recommended_preset] || {};
    recBanner.innerHTML = `
      <i class="fa fa-lightbulb" style="color:var(--am)"></i>
      <span>Recommended preset: <strong>${pi.emoji || ''} ${pi.name || data.recommended_preset}</strong>
      ${data.recommended_label ? ` — ${data.recommended_label}` : ''}</span>
    `;
    recBanner.removeAttribute('hidden');
    if (data.recommended_preset && data.recommended_preset !== _currentPreset) {
      selectPreset(data.recommended_preset, false);
    }
  }

  const scoreRing = $('cpScoreRing');
  if (scoreRing && data.compressibility?.score != null) {
    const score = clamp(data.compressibility.score, 0, 100);
    const ring  = scoreRing.querySelector('.cp-score-ring-fill');
    const label = scoreRing.querySelector('.cp-score-ring-val');
    const sub   = scoreRing.querySelector('.cp-score-ring-sub');
    if (ring) ring.style.background = `conic-gradient(var(--em) ${score}%, var(--bg4) 0%)`;
    if (label) animateNumber(label, 0, score, 1200);
    if (sub) sub.textContent = 'compressibility';
    scoreRing.removeAttribute('hidden');
  }

  const benchBars = $('cpBenchBars');
  if (benchBars && data.content_type) {
    const benchmarks = {
      text:    { low: 5, high: 30, label: 'Text PDF' },
      image:   { low: 40, high: 90, label: 'Image PDF' },
      mixed:   { low: 25, high: 65, label: 'Mixed PDF' },
      scanned: { low: 60, high: 92, label: 'Scanned PDF' },
    };
    const bm = benchmarks[data.content_type] || benchmarks.mixed;
    benchBars.innerHTML = `
      <div class="cp-bench-title"><i class="fa fa-chart-bar"></i> Expected compression range for ${bm.label}</div>
      <div class="cp-bench-row">
        <span class="cp-bench-label">Minimum</span>
        <div class="cp-bench-bar-wrap">
          <div class="cp-bench-bar" style="width:${bm.low}%;background:var(--t5)"></div>
        </div>
        <span class="cp-bench-val">${bm.low}%</span>
      </div>
      <div class="cp-bench-row">
        <span class="cp-bench-label">Maximum</span>
        <div class="cp-bench-bar-wrap">
          <div class="cp-bench-bar" style="width:${bm.high}%;background:var(--em)"></div>
        </div>
        <span class="cp-bench-val">${bm.high}%</span>
      </div>
    `;
    benchBars.removeAttribute('hidden');
  }

  const engGrid = $('cpEngineGrid');
  if (engGrid) {
    loadEngineGrid(engGrid);
    engGrid.removeAttribute('hidden');
  }
}

function renderLiveEstPanel(data, fileSizeBytes) {
  const panel = $('presetEstPanel');
  if (!panel) return;

  const compScore = data?.compressibility?.score ?? 50;
  const ranges = {
    lossless: { lo:2,  hi:25 },
    high:     { lo:10, hi:40 },
    medium:   { lo:40, hi:65 },
    low:      { lo:55, hi:78 },
    screen:   { lo:75, hi:92 },
  };

  const bars = PRESET_ORDER.map(key => {
    const r    = ranges[key];
    const pi   = PRESET_INFO[key];
    const midPct = (r.lo + r.hi) / 2;
    const adjPct = clamp(midPct * (compScore / 65), r.lo, r.hi);
    const estSz  = fileSizeBytes * (1 - adjPct / 100);
    const barPct = (adjPct / 100) * 100;
    const isActive = key === _currentPreset;
    return `
      <div class="cp-est-row ${isActive ? 'active' : ''}" data-preset="${key}">
        <span class="cp-est-label">${pi.emoji} ${pi.name}</span>
        <div class="cp-est-bar-wrap">
          <div class="cp-est-bar" style="width:${barPct}%;background:${pi.color}"></div>
        </div>
        <span class="cp-est-range" style="color:${pi.color}">${r.lo}–${r.hi}%</span>
        <span class="cp-est-size">~${fmtBytes(estSz)}</span>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="cp-est-title"><i class="fa fa-calculator"></i> Estimated output by preset</div>
    ${bars}
    <div class="cp-est-note">Based on file analysis. Actual results may vary.</div>
  `;
  panel.removeAttribute('hidden');

  panel.querySelectorAll('.cp-est-row').forEach(row => {
    row.addEventListener('click', () => {
      const p = row.dataset.preset;
      if (p) { selectPreset(p); S('click'); }
    });
  });
}

function updateLiveEstActive() {
  const panel = $('presetEstPanel');
  if (!panel) return;
  panel.querySelectorAll('.cp-est-row').forEach(row => {
    row.classList.toggle('active', row.dataset.preset === _currentPreset);
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   PRESET CARDS
════════════════════════════════════════════════════════════════════════════ */
function initPresets() {
  document.querySelectorAll('.cp-preset-btn').forEach(card => {
    const preset = card.dataset.preset;

    card.addEventListener('click', () => selectPreset(preset));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPreset(preset); }
    });

    card.addEventListener('mouseenter', () => showPresetTooltip(preset, card));
    card.addEventListener('mouseleave', hidePresetTooltip);
  });

  const saved = lsGet('cp-preset') || 'medium';
  selectPreset(saved, true);
}

function selectPreset(preset, silent = false) {
  if (!PRESET_ORDER.includes(preset)) return;
  _currentPreset = preset;
  lsSet('cp-preset', preset);

  document.querySelectorAll('.cp-preset-btn').forEach(card => {
    const isActive = card.dataset.preset === preset;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-checked', String(isActive));
    if (isActive) {
      const pi = PRESET_INFO[preset];
      card.style.setProperty('--preset-glow', pi.color);
    }
  });

  if (!silent) {
    S('waah_kya_scene_hai');
    const pi = PRESET_INFO[preset];
    toast(`${pi.emoji} ${pi.name} preset`, pi.detail, 'info', 2000);
    announce(`Preset changed to ${pi.name}`);
  }

  updateLiveEstActive();
  updateActionState();
}

function showPresetTooltip(preset, card) {
  hidePresetTooltip();
  const pi = PRESET_INFO[preset];
  if (!pi || !ANALYSIS_DATA) return;

  const fileSz = FILE?.size || 0;
  if (!fileSz) return;

  const ranges = {
    lossless: { lo:2,  hi:25 },
    high:     { lo:10, hi:40 },
    medium:   { lo:40, hi:65 },
    low:      { lo:55, hi:78 },
    screen:   { lo:75, hi:92 },
  };
  const r = ranges[preset];
  const compScore = ANALYSIS_DATA?.compressibility?.score ?? 50;
  const midPct = (r.lo + r.hi) / 2;
  const adjPct = clamp(midPct * (compScore / 65), r.lo, r.hi);
  const estSz  = fileSz * (1 - adjPct / 100);

  const tip = document.createElement('div');
  tip.id = 'cp-preset-tip';
  tip.className = 'cp-preset-tip';
  tip.innerHTML = `
    <div class="cp-preset-tip-title" style="color:${pi.color}">${pi.emoji} ${pi.name}</div>
    <div class="cp-preset-tip-desc">${pi.detail}</div>
    <div class="cp-preset-tip-est">
      <span>Range: <b style="color:${pi.color}">${r.lo}–${r.hi}%</b></span>
      <span>~<b style="color:${pi.color}">${fmtBytes(estSz)}</b></span>
    </div>
  `;
  tip.style.cssText = `border-color:${pi.color}`;
  document.body.appendChild(tip);

  const rect = card.getBoundingClientRect();
  const tipW = 220;
  let left = rect.left + rect.width / 2 - tipW / 2;
  left = clamp(left, 8, window.innerWidth - tipW - 8);
  tip.style.left = left + 'px';
  tip.style.top  = (rect.bottom + window.scrollY + 8) + 'px';
}

function hidePresetTooltip() {
  const tip = $('cp-preset-tip');
  if (tip) tip.remove();
}

/* ════════════════════════════════════════════════════════════════════════════
   BATCH PANEL
════════════════════════════════════════════════════════════════════════════ */
function showBatchPanel() {
  const panel = $('batchPanel');
  if (!panel) return;
  panel.removeAttribute('hidden');
  renderBatchList();
}

function hideBatchPanel() {
  const panel = $('batchPanel');
  if (panel) panel.setAttribute('hidden', '');
}

function renderBatchList() {
  const list = $('batchList');
  if (!list) return;
  list.innerHTML = BATCH_QUEUE.map(item => buildBatchCard(item)).join('');
  initBatchDragReorder();
}

function buildBatchCard(item) {
  const stMap = {
    pending:  { icon:'fa-clock',        color:'var(--t4)',  label:'Pending' },
    active:   { icon:'fa-spinner fa-spin',color:'var(--in3)',label:'Compressing…' },
    done:     { icon:'fa-check-circle',  color:'var(--em)',  label:'Done' },
    error:    { icon:'fa-times-circle',  color:'var(--rd)',  label:'Failed' },
  };
  const st = stMap[item.status] || stMap.pending;
  const r  = item.result;
  const pct = r?.redPct ?? null;
  return `
  <div class="cp-batch-card ${item.status}" draggable="${item.status === 'pending'}"
       data-id="${item.id}" id="bc-${item.id}">
    <span class="cp-batch-drag" title="Drag to reorder"><i class="fa fa-grip-vertical"></i></span>
    <span class="cp-batch-icon" style="color:${st.color}"><i class="fa ${st.icon}"></i></span>
    <span class="cp-batch-name" title="${item.file.name}">${item.file.name}</span>
    <span class="cp-batch-size">${fmtBytes(item.file.size)}</span>
    ${pct != null ? `<span class="cp-batch-pct" style="color:var(--em)">−${pct.toFixed(1)}%</span>` : ''}
    ${item.status === 'done' && r?.blob
      ? `<button class="cp-batch-dl" onclick="downloadBatchItem('${item.id}')" title="Download"><i class="fa fa-download"></i></button>`
      : ''}
    ${item.status === 'error'
      ? `<button class="cp-batch-retry" onclick="retryBatchItem('${item.id}')" title="Retry"><i class="fa fa-redo"></i></button>`
      : ''}
    ${item.status === 'pending'
      ? `<button class="cp-batch-remove" onclick="removeBatchItem('${item.id}')" title="Remove" aria-label="Remove ${item.file.name}"><i class="fa fa-times"></i></button>`
      : ''}
  </div>`;
}

function initBatchDragReorder() {
  const list = $('batchList');
  if (!list) return;

  list.querySelectorAll('.cp-batch-card[draggable="true"]').forEach(card => {
    card.addEventListener('dragstart', e => {
      _dragSrcId = card.dataset.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      _dragSrcId = null;
      card.classList.remove('dragging');
      list.querySelectorAll('.cp-batch-card').forEach(c => c.classList.remove('drag-over-card'));
    });
    card.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over-card');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over-card'));
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('drag-over-card');
      if (!_dragSrcId || _dragSrcId === card.dataset.id) return;
      const srcIdx = BATCH_QUEUE.findIndex(i => i.id === _dragSrcId);
      const dstIdx = BATCH_QUEUE.findIndex(i => i.id === card.dataset.id);
      if (srcIdx < 0 || dstIdx < 0) return;
      const [moved] = BATCH_QUEUE.splice(srcIdx, 1);
      BATCH_QUEUE.splice(dstIdx, 0, moved);
      renderBatchList();
      S('click');
    });
  });
}

function removeBatchItem(id) {
  const idx = BATCH_QUEUE.findIndex(i => i.id === id);
  if (idx < 0) return;
  const removed = BATCH_QUEUE.splice(idx, 1)[0];
  _deletedStack.push({ item: removed, idx });
  if (_deletedStack.length > 5) _deletedStack.shift();
  renderBatchList();
  updateBatchCount();
  showUndoBar(`Removed "${removed.file.name}"`);
  if (!BATCH_QUEUE.length) { hideBatchPanel(); FILE = null; STEM = ''; updateActionState(); updateFab(); }
}

function retryBatchItem(id) {
  const item = BATCH_QUEUE.find(i => i.id === id);
  if (!item) return;
  item.status = 'pending';
  item.result = null;
  renderBatchList();
  toast(`Queued "${item.file.name}" for retry`, '', 'info', 2000);
  S('click');
}

function downloadBatchItem(id) {
  const item = BATCH_QUEUE.find(i => i.id === id);
  if (!item?.result?.blob) { toast('No result for this file', '', 'warn'); return; }
  _triggerBlobDownload(item.result.blob, `${item.stem}_compressed.pdf`);
  S('fahhhhh');
}

function updateBatchCount() {
  const countEl = $('batchCount');
  if (countEl) countEl.textContent = BATCH_QUEUE.length;
}

function showUndoBar(msg) {
  const bar = $('cpUndoBar');
  if (!bar) return;
  const msgEl = bar.querySelector('.cp-undo-msg');
  if (msgEl) msgEl.textContent = msg;
  bar.removeAttribute('hidden');
  clearTimeout(bar._autoHide);
  bar._autoHide = setTimeout(() => bar.setAttribute('hidden', ''), 4500);
}

function hideUndoBar() {
  const bar = $('cpUndoBar');
  if (bar) bar.setAttribute('hidden', '');
}

function undoLastDelete() {
  if (!_deletedStack.length) { toast('Nothing to undo', '', 'warn'); return; }
  const { item, idx } = _deletedStack.pop();
  BATCH_QUEUE.splice(Math.min(idx, BATCH_QUEUE.length), 0, item);
  renderBatchList();
  updateBatchCount();
  hideUndoBar();
  toast(`Restored "${item.file.name}"`, '', 'info', 2000);
  S('click');
}

/* ════════════════════════════════════════════════════════════════════════════
   COMPRESSION — SSE PROGRESS
════════════════════════════════════════════════════════════════════════════ */
function startElapsedTimer() {
  _t0 = Date.now();
  clearInterval(_timerInterval);
  _timerInterval = setInterval(() => {
    const el = $('progressTimer');
    if (el) el.textContent = fmtElapsed((Date.now() - _t0) / 1000);
  }, 100);
}

function stopElapsedTimer() {
  clearInterval(_timerInterval);
  _timerInterval = null;
}

function openSSE(jobId) {
  closeSSE();
  JOB_ID = jobId;
  try {
    SSE_SOURCE = new EventSource(`/api/compress-pdf/progress/${jobId}`);
    SSE_SOURCE.addEventListener('progress', e => {
      try {
        const d = JSON.parse(e.data);
        updateProgress(d.pct || 0, d.title || '', d.sub || '');
      } catch {}
    });
    SSE_SOURCE.addEventListener('error', () => closeSSE());
  } catch {}
  simProgress();
}

function closeSSE() {
  if (SSE_SOURCE) { SSE_SOURCE.close(); SSE_SOURCE = null; }
  clearInterval(SSE_TIMER);
  SSE_TIMER = null;
}

function simProgress() {
  let stageIdx = 0;
  let cur = 0;
  SSE_TIMER = setInterval(() => {
    if (COMPRESS_DONE) { clearInterval(SSE_TIMER); return; }
    const next = stageIdx < PROGRESS_STAGES.length ? PROGRESS_STAGES[stageIdx].pct : 97;
    if (cur < next) { cur = Math.min(cur + 1, next); }
    else { stageIdx++; }
    if (cur < 98) {
      const stage = PROGRESS_STAGES.find((s, i) => PROGRESS_STAGES[i+1]
        ? cur >= s.pct && cur < PROGRESS_STAGES[i+1].pct
        : cur >= s.pct) || PROGRESS_STAGES[0];
      updateProgress(cur, stage.label, stage.sub);
    }
  }, 180);
}

function updateProgress(pct, label, sub) {
  setProgressRing(pct);
  const pctEl = $('progressPct');
  if (pctEl) pctEl.textContent = pct + '%';
  const lblEl = $('progressMsg');
  if (lblEl) lblEl.textContent = label || '';
  const subEl = $('progressEngine');
  if (subEl) subEl.textContent = sub || '';
  updateProgressTimeline(pct);
}

function updateProgressTimeline(pct) {
  const tl = $('cpProgressTimeline');
  if (!tl) return;
  tl.querySelectorAll('.cp-tl-step').forEach((step, i) => {
    const stagePct = PROGRESS_STAGES[i]?.pct ?? 0;
    const nextPct  = PROGRESS_STAGES[i+1]?.pct ?? 100;
    if (pct >= nextPct) step.className = 'cp-tl-step done';
    else if (pct >= stagePct) step.className = 'cp-tl-step active';
    else step.className = 'cp-tl-step';
  });
}

function buildProgressTimeline() {
  const tl = $('cpProgressTimeline');
  if (!tl) return;
  tl.innerHTML = PROGRESS_STAGES.map((s, i) => `
    <div class="cp-tl-step" id="cp-tl-${i}">
      <div class="cp-tl-dot"><i class="fa ${s.icon}"></i></div>
      <div class="cp-tl-info">
        <div class="cp-tl-label">${s.label}</div>
        <div class="cp-tl-sub">${s.sub}</div>
      </div>
    </div>
  `).join('');
}

/* ════════════════════════════════════════════════════════════════════════════
   COMPRESS — MAIN FLOW
════════════════════════════════════════════════════════════════════════════ */
async function doCompress() {
  if (!FILE || BATCH_ACTIVE) return;

  if (BATCH_QUEUE.length > 1) {
    startBatchCompress();
    return;
  }

  COMPRESS_DONE = false;
  RESULT_DATA   = null;
  JOB_ID = `cp-${Date.now()}-${generateId()}`;

  D.progressWrap?.removeAttribute('hidden');
  D.toolZone?.setAttribute('hidden', '');
  D.resultWrap?.setAttribute('hidden', '');

  buildProgressTimeline();
  updateProgress(0, 'Starting compression…', 'Preparing file');
  startElapsedTimer();
  S('cameraman_focus_karo');
  announce('Compression started. Please wait.', 'assertive');

  window.addEventListener('beforeunload', _beforeUnload);

  try {
    const opts = getAdvOptions();
    const fd   = new FormData();
    fd.append('file',  FILE);
    fd.append('preset', _currentPreset);
    fd.append('job_id', JOB_ID);
    fd.append('target_size_kb', String(getTargetKb()));
    Object.entries(opts).forEach(([k, v]) => fd.append(k, String(v)));

    openSSE(JOB_ID);

    const resp = await fetch('/api/compress-pdf/compress', { method:'POST', body: fd });

    closeSSE();
    stopElapsedTimer();
    window.removeEventListener('beforeunload', _beforeUnload);

    if (!resp.ok) {
      let msg = 'Compression failed';
      try { const e = await resp.json(); msg = e.error || msg; } catch {}
      S('eh_eh_eh_ehhhhhh');
      toast('Compression failed', msg, 'error', 6000);
      D.progressWrap?.setAttribute('hidden', '');
      D.toolZone?.removeAttribute('hidden');
      return;
    }

    const blob = await resp.blob();

    const inSz   = parseInt(resp.headers.get('X-Input-Size')  || FILE.size, 10);
    const outSz  = parseInt(resp.headers.get('X-Output-Size') || blob.size, 10);
    const redPct = parseFloat(resp.headers.get('X-Reduction-Pct') || '0');
    const engine = resp.headers.get('X-Engine-Used')    || 'auto';
    const procMs = parseInt(resp.headers.get('X-Processing-Ms') || '0', 10);
    const qScore = parseInt(resp.headers.get('X-Quality-Score') || '85', 10);
    const qGrade = resp.headers.get('X-Quality-Grade')  || 'B';
    const engTried = resp.headers.get('X-Engines-Tried')|| '';

    COMPRESS_DONE = true;
    RESULT_DATA = { blob, inSize: inSz, outSize: outSz, redPct, engine, procMs, qScore, qGrade, engTried, preset: _currentPreset };
    RESULT_DATA.fingerprint = generateId() + '-' + generateId();

    addHistory({
      filename: FILE.name,
      preset: _currentPreset,
      inputSize: inSz, outputSize: outSz,
      reductionPct: redPct,
      grade: qGrade, engine, timeMs: procMs,
      ts: Date.now(), fingerprint: RESULT_DATA.fingerprint,
    });

    updateProgress(100, 'Done!', `Reduced by ${redPct.toFixed(1)}%`);

    setTimeout(() => {
      D.progressWrap?.setAttribute('hidden', '');
      D.toolZone?.setAttribute('hidden', '');
      showResult(RESULT_DATA);
      launchConfetti();
    }, 600);

    S('waah_kya_scene_hai');
    announce(`Compression done! ${redPct.toFixed(1)}% smaller.`, 'assertive');

  } catch (err) {
    closeSSE();
    stopElapsedTimer();
    window.removeEventListener('beforeunload', _beforeUnload);
    S('eh_eh_eh_ehhhhhh');
    toast('Network error', err.message || 'Please try again.', 'error', 6000);
    D.progressWrap?.setAttribute('hidden', '');
    D.toolZone?.removeAttribute('hidden');
  }
}

function _beforeUnload(e) {
  e.preventDefault();
  e.returnValue = '';
}

function cancelCompress() {
  closeSSE();
  stopElapsedTimer();
  COMPRESS_DONE = false;
  window.removeEventListener('beforeunload', _beforeUnload);
  D.progressWrap?.setAttribute('hidden', '');
  D.toolZone?.removeAttribute('hidden');
  S('jaldi_waha_sa_hato');
  toast('Compression cancelled', '', 'warn', 2000);
  announce('Compression cancelled.');
}

/* ════════════════════════════════════════════════════════════════════════════
   BATCH COMPRESS
════════════════════════════════════════════════════════════════════════════ */
async function startBatchCompress() {
  if (BATCH_ACTIVE) return;
  BATCH_ACTIVE = true;
  BATCH_IDX    = 0;
  BATCH_ZIP_PARTS = [];

  D.progressWrap?.removeAttribute('hidden');
  D.toolZone?.setAttribute('hidden', '');
  D.resultWrap?.setAttribute('hidden', '');
  buildProgressTimeline();
  S('cameraman_focus_karo');
  announce(`Starting batch compression of ${BATCH_QUEUE.length} files.`, 'assertive');

  for (let i = 0; i < BATCH_QUEUE.length; i++) {
    const item = BATCH_QUEUE[i];
    if (item.status === 'done') continue;
    item.status = 'active';
    BATCH_IDX = i;
    const card = $(`bc-${item.id}`);
    if (card) card.outerHTML = buildBatchCard(item);
    else renderBatchList();

    updateProgress(Math.round((i / BATCH_QUEUE.length) * 90), `File ${i+1}/${BATCH_QUEUE.length}…`, item.file.name);
    COMPRESS_DONE = false;
    JOB_ID = `cp-batch-${Date.now()}-${i}-${generateId()}`;

    try {
      const opts = getAdvOptions();
      const fd   = new FormData();
      fd.append('file',   item.file);
      fd.append('preset', _currentPreset);
      fd.append('job_id', JOB_ID);
      fd.append('target_size_kb', String(getTargetKb()));
      Object.entries(opts).forEach(([k, v]) => fd.append(k, String(v)));

      openSSE(JOB_ID);
      const resp = await fetch('/api/compress-pdf/compress', { method:'POST', body: fd });
      closeSSE();

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();

      const inSz  = parseInt(resp.headers.get('X-Input-Size')  || item.file.size, 10);
      const outSz = parseInt(resp.headers.get('X-Output-Size') || blob.size, 10);
      const redPct= parseFloat(resp.headers.get('X-Reduction-Pct') || '0');
      const engine= resp.headers.get('X-Engine-Used') || 'auto';
      const procMs= parseInt(resp.headers.get('X-Processing-Ms') || '0', 10);
      const qScore= parseInt(resp.headers.get('X-Quality-Score') || '85', 10);
      const qGrade= resp.headers.get('X-Quality-Grade') || 'B';

      item.status = 'done';
      item.result = { blob, inSize: inSz, outSize: outSz, redPct, engine, procMs, qScore, qGrade, preset: _currentPreset };
      BATCH_ZIP_PARTS.push({ blob, name: `${item.stem}_compressed.pdf` });

      addHistory({
        filename: item.file.name, preset: _currentPreset,
        inputSize: inSz, outputSize: outSz, reductionPct: redPct,
        grade: qGrade, engine, timeMs: procMs, ts: Date.now(),
      });

    } catch (err) {
      closeSSE();
      item.status = 'error';
      item.result = { error: err.message };
    }

    renderBatchList();
  }

  BATCH_ACTIVE  = false;
  COMPRESS_DONE = true;
  stopElapsedTimer();
  updateProgress(100, 'Batch complete!', `${BATCH_QUEUE.filter(i => i.status === 'done').length}/${BATCH_QUEUE.length} files compressed`);

  setTimeout(() => {
    D.progressWrap?.setAttribute('hidden', '');
    showBatchSummary();
    launchConfetti();
    S('waah_kya_scene_hai');
  }, 600);

  announce(`Batch compression complete. ${BATCH_QUEUE.filter(i => i.status === 'done').length} files done.`, 'assertive');
}

function showBatchSummary() {
  const done  = BATCH_QUEUE.filter(i => i.status === 'done');
  const fail  = BATCH_QUEUE.filter(i => i.status === 'error');
  const totIn = done.reduce((s, i) => s + i.result.inSize, 0);
  const totOut= done.reduce((s, i) => s + i.result.outSize, 0);
  const avgPct= done.length ? done.reduce((s,i) => s + i.result.redPct, 0) / done.length : 0;
  const saved = totIn - totOut;

  const wrap = D.resultWrap;
  if (!wrap) { showBatchPanel(); return; }

  const gradeEl = $('resGrade');
  if (gradeEl) {
    const grade = avgPct >= 70 ? 'S' : avgPct >= 45 ? 'A' : avgPct >= 25 ? 'B' : avgPct >= 10 ? 'C' : 'D';
    gradeEl.textContent = grade;
    gradeEl.style.color = GRADE_COLORS[grade] || '#94a3b8';
  }

  if (D.resBefore) D.resBefore.textContent = fmtBytes(totIn);
  if (D.resAfter)  D.resAfter.textContent  = fmtBytes(totOut);
  if (D.resPct)  {
    D.resPct.textContent = `${avgPct.toFixed(1)}% avg savings`;
    D.resPct.style.color = avgPct > 20 ? 'var(--em)' : 'var(--am)';
  }
  if (D.resEngine) D.resEngine.textContent = `Batch: ${done.length} done, ${fail.length} failed`;
  if (D.resScore)  animateNumber(D.resScore, 0, Math.round(100 - avgPct * 0.3), 1000);

  const savedEl = $('resSavedBytes');
  if (savedEl) {
    savedEl.textContent = `Saved ${fmtBytes(saved)} total across ${done.length} files`;
    savedEl.style.color = 'var(--em)';
  }

  if (D.resBar) {
    D.resBar.style.width = '0%';
    setTimeout(() => { D.resBar.style.width = clamp(avgPct, 0, 100) + '%'; }, 150);
  }

  wrap.removeAttribute('hidden');
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showBatchPanel();
  renderBatchChart(done);
}

function renderBatchChart(doneItems) {
  const cw = $('chartWrap');
  const canvas = $('compressChart');
  if (!cw || !canvas || !doneItems.length) return;
  cw.removeAttribute('hidden');

  if (BATCH_CHART) { BATCH_CHART.destroy(); BATCH_CHART = null; }

  const labels = doneItems.map(i => i.stem.slice(0, 12) + (i.stem.length > 12 ? '…' : ''));
  const beforeData = doneItems.map(i => +(i.result.inSize / 1024).toFixed(1));
  const afterData  = doneItems.map(i => +(i.result.outSize / 1024).toFixed(1));

  BATCH_CHART = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Before (KB)', data: beforeData, backgroundColor: 'rgba(99,102,241,0.5)', borderColor: '#6366f1', borderWidth: 1.5 },
        { label: 'After (KB)',  data: afterData,  backgroundColor: 'rgba(16,185,129,0.5)', borderColor: '#10b981', borderWidth: 1.5 },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw} KB` } },
      },
      scales: {
        x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.05)' } },
        y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,.05)' }, title: { display: true, text: 'Size (KB)', color: '#64748b' } },
      },
    },
  });
}

function downloadBatchZip() {
  if (!BATCH_ZIP_PARTS.length) { toast('No batch results', 'Compress files first.', 'warn'); return; }
  for (let i = 0; i < BATCH_ZIP_PARTS.length; i++) {
    const part = BATCH_ZIP_PARTS[i];
    setTimeout(() => { _triggerBlobDownload(part.blob, part.name); }, i * 800);
  }
  S('fahhhhh');
  toast(`Downloading ${BATCH_ZIP_PARTS.length} files`, 'Files will download sequentially', 'success', 4000);
}

function _triggerBlobDownload(blob, filename) {
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
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

  const gc = GRADE_COLORS[r.qGrade] || '#94a3b8';
  if (D.resGrade) {
    D.resGrade.textContent = r.qGrade;
    D.resGrade.style.color = gc;
    if (!_reduced) {
      D.resGrade.style.animation = 'none';
      requestAnimationFrame(() => {
        D.resGrade.style.animation = 'gradeReveal 0.6s cubic-bezier(0.175,0.885,0.32,1.275) forwards';
      });
    }
  }

  if (D.resBefore) D.resBefore.textContent = fmtBytes(r.inSize);
  if (D.resAfter)  {
    D.resAfter.textContent = fmtBytes(r.outSize);
    if (!_reduced) D.resAfter.classList.add('res-after-glow');
  }

  if (D.resPct) {
    D.resPct.textContent = r.redPct > 0
      ? `${r.redPct.toFixed(1)}% smaller`
      : 'Already optimised';
    D.resPct.style.color = r.redPct > 20 ? 'var(--em)' : r.redPct > 0 ? 'var(--am)' : 'var(--t4)';
  }

  if (D.resEngine) D.resEngine.textContent = r.engine || '—';
  if (D.resTime)   D.resTime.textContent   = fmtMs(r.procMs);

  if (D.resBar) {
    D.resBar.style.width = '0%';
    D.resBar.style.background = PRESET_INFO[r.preset]?.color || 'var(--em)';
    setTimeout(() => { D.resBar.style.width = clamp(r.redPct, 0, 100) + '%'; }, 150);
  }

  if (D.resScore) animateNumber(D.resScore, 0, r.qScore, 1000);

  const scoreRing = document.querySelector('.cp-score-ring-mini');
  if (scoreRing) {
    const pct = r.qScore;
    const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#6366f1' : pct >= 40 ? '#f59e0b' : '#ef4444';
    scoreRing.style.background = `conic-gradient(${color} ${pct}%, var(--bg4) 0%)`;
  }

  if (D.resEngineList && r.engTried) {
    D.resEngineList.innerHTML = r.engTried.split(',')
      .map(e => e.trim()).filter(Boolean)
      .map(e => `<span class="cp-eng-tag">${e}</span>`)
      .join('');
  }

  const zeroNote = $('resZeroNote');
  if (zeroNote) zeroNote.toggleAttribute('hidden', r.redPct > 0);

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

  const presetEl = $('resPreset');
  if (presetEl) {
    const pi = PRESET_INFO[r.preset] || { emoji:'⚙️', name: r.preset };
    presetEl.textContent = `${pi.emoji} ${pi.name}`;
  }

  const fpEl = $('resFingerprint');
  if (fpEl && r.fingerprint) {
    fpEl.textContent = r.fingerprint;
    fpEl.title = 'Unique compression fingerprint';
  }

  D.resultWrap.removeAttribute('hidden');
  D.resultWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });

  renderSingleResultChart(r);
}

function renderSingleResultChart(r) {
  const cw     = $('chartWrap');
  const canvas = $('compressChart');
  if (!cw || !canvas) return;
  cw.removeAttribute('hidden');

  if (CHART_INSTANCE) { CHART_INSTANCE.destroy(); CHART_INSTANCE = null; }

  CHART_INSTANCE = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Before', 'After'],
      datasets: [{
        label: 'File size (KB)',
        data: [+(r.inSize / 1024).toFixed(1), +(r.outSize / 1024).toFixed(1)],
        backgroundColor: ['rgba(99,102,241,0.5)', 'rgba(16,185,129,0.5)'],
        borderColor: ['#6366f1', '#10b981'],
        borderWidth: 2,
        borderRadius: 8,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.raw} KB` } },
      },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { family: 'Inter', size: 12 } }, grid: { display: false } },
        y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,.05)' } },
      },
    },
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   DOWNLOAD & SHARE
════════════════════════════════════════════════════════════════════════════ */
function triggerDownload() {
  if (!RESULT_DATA?.blob) { toast('No result', 'Please compress a PDF first.', 'warn'); return; }
  const dlStem = (BATCH_QUEUE.length > 1 && BATCH_LARGEST) ? getStem(BATCH_LARGEST.name) : STEM;
  const dlName = `${dlStem}_compressed.pdf`;
  _triggerBlobDownload(RESULT_DATA.blob, dlName);
  S('fahhhhh');
  if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
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
  const saved   = r.inSize - r.outSize;
  const engList = r.engTried ? r.engTried.split(',').map(s => s.trim()).filter(Boolean).join(', ') : r.engine;

  const txt = [
    '╔═══ IshuTools.fun — Compression Report ═══╗',
    `║ File:          ${FILE?.name || '—'}`,
    `║ Preset:        ${PRESET_INFO[r.preset]?.name || r.preset}`,
    `║ Before:        ${fmtBytes(r.inSize)}`,
    `║ After:         ${fmtBytes(r.outSize)}`,
    `║ Reduction:     ${r.redPct.toFixed(1)}%`,
    `║ Saved:         ${fmtBytes(saved)}`,
    `║ Quality grade: ${r.qGrade}`,
    `║ Quality score: ${r.qScore}/100`,
    `║ Engine used:   ${r.engine}`,
    `║ All engines:   ${engList}`,
    `║ Processing:    ${fmtMs(r.procMs)}`,
    `║ Download name: ${dlStem}_compressed.pdf`,
    r.fingerprint ? `║ Fingerprint:   ${r.fingerprint}` : '',
    `║ Generated:     ${new Date().toLocaleString()}`,
    `║ Tool:          https://ishutools.fun/tools/compress-pdf/`,
    `║ Built by:      Ishu Kumar (ISHUKR41) — github.com/ISHUKR41`,
    '╚═══════════════════════════════════════════╝',
  ].filter(Boolean).join('\n');

  try {
    await navigator.clipboard.writeText(txt);
    toast('Report copied!', 'Paste anywhere.', 'success', 2500);
    S('click');
  } catch {
    toast('Copy failed', 'Please copy manually.', 'warn', 3000);
  }
}

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
    cb.addEventListener('change', () => { updateAdvCount(); S('click'); });
  });

  const pwEye = $('pwEye');
  const pwInp = $('optPassword');
  if (pwEye && pwInp) {
    pwEye.addEventListener('click', () => {
      const show = pwInp.type === 'password';
      pwInp.type = show ? 'text' : 'password';
      pwEye.querySelector('i').className = show ? 'fa fa-eye-slash' : 'fa fa-eye';
      pwEye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  }

  document.querySelectorAll('.cp-qp-btn').forEach(btn => {
    btn.addEventListener('click', () => applyQuickPreset(btn.dataset.qp));
  });

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
  Object.entries(cfg).forEach(([id, val]) => { const el=$(id); if(el) el.checked = val; });
  updateAdvCount();
  if (key !== 'reset' && D.advToggle.getAttribute('aria-expanded') !== 'true') {
    D.advToggle.setAttribute('aria-expanded', 'true');
    D.advOpts.removeAttribute('hidden');
  }
  const qualMap = { email:'low', max:'screen', archive:'high', web:'medium', print:'high' };
  if (qualMap[key]) selectPreset(qualMap[key], false);
  const labels = { email:'📧 Email', archive:'📦 Archive', web:'🌐 Web', max:'🔥 Max', print:'🖨️ Print', reset:'↩️ Default' };
  toast(`${labels[key] || key} combo applied`, 'Settings configured.', 'info', 2500);
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
    password:                $('optPassword')?.value     ?? '',
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   ENGINE STATUS
════════════════════════════════════════════════════════════════════════════ */
async function loadEngines() {
  const panel = $('enginesPanel');
  if (!panel) return;
  panel.innerHTML = '<span style="font-size:.8rem;color:var(--t4)"><i class="fa fa-spinner fa-spin"></i> Loading…</span>';
  try {
    const resp = await fetch('/api/compress-pdf/engines');
    if (!resp.ok) throw new Error('Failed');
    const data = await resp.json();
    const engines = data.engines || {};
    const tags = Object.entries(engines).map(([name, info]) => {
      const ok   = info.available;
      const ver  = info.version ? ` v${info.version}` : '';
      const cls  = ok ? 'ok' : (info.partial ? 'partial' : 'missing');
      const icon = ok ? 'fa-check' : 'fa-times';
      return `<span class="cp-eng-status ${cls}" title="${info.note || ''}">
        <i class="fa ${icon}"></i> ${name}${ver}
      </span>`;
    }).join('');
    panel.innerHTML = tags || '<span style="color:var(--t4);font-size:.8rem">No engine data.</span>';
  } catch {
    panel.innerHTML = '<span style="color:var(--rd);font-size:.8rem">Could not load engine status.</span>';
  }
}

async function loadEngineGrid(container) {
  if (!container) return;
  try {
    const resp = await fetch('/api/compress-pdf/engines');
    if (!resp.ok) return;
    const data = await resp.json();
    const engines = data.engines || {};
    container.innerHTML = Object.entries(engines).slice(0, 12).map(([name, info]) => {
      const ok  = info.available;
      const cls = ok ? 'ok' : 'missing';
      return `<div class="cp-egrid-item ${cls}">
        <i class="fa ${ok ? 'fa-check-circle' : 'fa-times-circle'}"></i>
        <span>${name}</span>
      </div>`;
    }).join('');
  } catch {
    container.innerHTML = '';
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   ACTION STATE & FAB
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
   RESET TOOL
════════════════════════════════════════════════════════════════════════════ */
function resetTool() {
  FILE          = null;
  STEM          = '';
  BATCH_QUEUE   = [];
  BATCH_LARGEST = null;
  ANALYSIS_DATA = null;
  COMPRESS_DONE = false;
  RESULT_DATA   = null;
  if (CHART_INSTANCE) { CHART_INSTANCE.destroy(); CHART_INSTANCE = null; }
  if (BATCH_CHART) { BATCH_CHART.destroy(); BATCH_CHART = null; }
  closeSSE();

  if (D.fileInfo)     D.fileInfo.setAttribute('hidden', '');
  if (D.resultWrap)   D.resultWrap.setAttribute('hidden', '');
  if (D.progressWrap) D.progressWrap.setAttribute('hidden', '');
  if (D.toolZone)     D.toolZone.removeAttribute('hidden');
  hideBatchPanel();

  ['chartWrap','presetEstPanel','cpScoreRing','cpBenchBars','cpEngineGrid','recBanner','fiChips'].forEach(id => {
    const el = $(id); if (el) el.setAttribute('hidden', '');
  });

  selectPreset('medium', true);
  updateActionState();
  updateFab();
  D.dropZone?.removeAttribute('hidden');
  D.dropZone?.focus();
  S('jaldi_waha_sa_hato');
  announce('Tool reset. Upload a new PDF to compress.');
}

/* ════════════════════════════════════════════════════════════════════════════
   SCROLL-TO-TOP
════════════════════════════════════════════════════════════════════════════ */
function initScrollTop() {
  const btn = $('scrollTop');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 350);
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ════════════════════════════════════════════════════════════════════════════
   FAQ ACCORDION
════════════════════════════════════════════════════════════════════════════ */
function initFaq() {
  document.querySelectorAll('.cp-faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.cp-faq-item');
      if (!item) return;
      const answer = item.querySelector('.cp-faq-a');
      if (!answer) return;
      const open = item.classList.contains('open');
      document.querySelectorAll('.cp-faq-item.open').forEach(other => {
        other.classList.remove('open');
        other.querySelector('.cp-faq-q')?.setAttribute('aria-expanded', 'false');
      });
      if (!open) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   SCROLL REVEAL (IntersectionObserver)
════════════════════════════════════════════════════════════════════════════ */
function initScrollReveal() {
  if (_reduced) return;
  const targets = document.querySelectorAll('.cp-reveal');
  if (!targets.length) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('revealed'); io.unobserve(e.target); }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  targets.forEach(t => io.observe(t));
}

/* ════════════════════════════════════════════════════════════════════════════
   ANIMATED COUNTERS
════════════════════════════════════════════════════════════════════════════ */
function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  if (!counters.length) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el  = e.target;
      const end = parseInt(el.dataset.count, 10);
      if (!isNaN(end)) animateNumber(el, 0, end, 1800, v => Math.round(v).toLocaleString());
      io.unobserve(el);
    });
  }, { threshold: 0.5 });
  counters.forEach(c => io.observe(c));
}

/* ════════════════════════════════════════════════════════════════════════════
   MOUSE TRACKING GLOW
════════════════════════════════════════════════════════════════════════════ */
function initGlowCards() {
  if (window.matchMedia('(hover: none)').matches) return;
  document.querySelectorAll('.cp-feat-card, .cp-preset-btn, .cp-eng-card, .cp-review-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width * 100).toFixed(1);
      const y = ((e.clientY - r.top) / r.height * 100).toFixed(1);
      card.style.setProperty('--mx', x + '%');
      card.style.setProperty('--my', y + '%');
    });
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
════════════════════════════════════════════════════════════════════════════ */
function initKeyboard() {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName?.toLowerCase() || '';
    if (['input','textarea','select'].includes(tag)) return;

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'Enter') { e.preventDefault(); if (FILE && !BATCH_ACTIVE) doCompress(); return; }
      if (e.key === 'o' || e.key === 'O') { e.preventDefault(); D.fileInput?.click(); return; }
      if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undoLastDelete(); return; }
      return;
    }

    switch (e.key) {
      case 'Escape':
        if ($('cp-shortcuts-modal')?.style.display !== 'none') { closeShortcutsModal(); return; }
        if ($('historyPanel') && !$('historyPanel').hasAttribute('hidden')) { toggleHistory(); return; }
        if ($('batchPanel') && !$('batchPanel').hasAttribute('hidden')) { hideBatchPanel(); return; }
        if (COMPRESS_DONE === false && D?.progressWrap && !D.progressWrap.hasAttribute('hidden')) { cancelCompress(); return; }
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
          const ct = ANALYSIS_DATA.content_type || 'mixed';
          const pg = ANALYSIS_DATA.page_count || '?';
          const sc = ANALYSIS_DATA.compressibility?.score ?? '?';
          toast('Analysis Info', `${pg} pages · ${ct} content · ${sc}% compressible`, 'info', 5000);
        } else toast('No analysis', 'Upload a file first.', 'info', 2000);
        break;
      }
      case 'ArrowUp': {
        const idx  = PRESET_ORDER.indexOf(_currentPreset);
        if (idx > 0) selectPreset(PRESET_ORDER[idx - 1]);
        break;
      }
      case 'ArrowDown': {
        const idx  = PRESET_ORDER.indexOf(_currentPreset);
        if (idx < PRESET_ORDER.length - 1) selectPreset(PRESET_ORDER[idx + 1]);
        break;
      }
    }
  });
}

function showShortcutsModal() {
  const modal = $('cp-shortcuts-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  modal.focus();
  S('click');
}

function closeShortcutsModal() {
  const modal = $('cp-shortcuts-modal');
  if (!modal) return;
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
}

/* ════════════════════════════════════════════════════════════════════════════
   MARQUEE STRIP
════════════════════════════════════════════════════════════════════════════ */
function initMarquee() {
  document.querySelectorAll('.cp-marquee-row').forEach(row => {
    const items = row.querySelectorAll('.cp-marquee-item');
    if (!items.length) return;
    const clone = row.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.style.animationDelay = '-15s';
    row.parentElement?.appendChild(clone);
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   DOM INITIALIZATION
════════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

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
  initMarquee();

  // Wire core buttons
  if (D.compressBtn) D.compressBtn.addEventListener('click', doCompress);
  if (D.resetBtn)    D.resetBtn.addEventListener('click',    resetTool);
  if (D.cancelBtn)   D.cancelBtn.addEventListener('click',   cancelCompress);

  // Remove file
  const fiRemove = $('fiRemove');
  if (fiRemove) fiRemove.addEventListener('click', removeFile);

  // History
  if (D.historyBtn) D.historyBtn.addEventListener('click', () => { toggleHistory(); S('click'); });
  const clearHistBtn = $('clearHistBtn');
  if (clearHistBtn) clearHistBtn.addEventListener('click', clearHistory);
  const lbBtn = $('cpHistLbBtn');
  if (lbBtn) lbBtn.addEventListener('click', () => {
    const lb = $('cpHistLeaderboard');
    if (!lb) return;
    lb.toggleAttribute('hidden', !lb.hasAttribute('hidden'));
    if (!lb.hasAttribute('hidden')) renderLeaderboard();
    S('click');
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

  // Compress again
  const againBtn = $('compressAgainBtn');
  if (againBtn) againBtn.addEventListener('click', () => {
    if (D.resultWrap) D.resultWrap.setAttribute('hidden', '');
    if (D.toolZone)   D.toolZone.removeAttribute('hidden');
    RESULT_DATA = null;
    updateActionState();
    S('click');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Theme & sound
  if (D.themeToggle) D.themeToggle.addEventListener('click', toggleTheme);
  if (D.soundToggle) D.soundToggle.addEventListener('click', toggleSound);

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
    else D.fileInput?.click();
  });

  // Batch actions
  const zipBtn = $('batchZipBtn');
  if (zipBtn) zipBtn.addEventListener('click', downloadBatchZip);
  const addMoreBtn = $('addMoreBtn');
  if (addMoreBtn) addMoreBtn.addEventListener('click', () => D.fileInput?.click());

  // Undo bar
  const undoBtn = $('cpUndoBtn');
  if (undoBtn) undoBtn.addEventListener('click', undoLastDelete);
  const undoDismiss = $('cpUndoDismiss');
  if (undoDismiss) undoDismiss.addEventListener('click', hideUndoBar);

  // Paste PDF support
  document.addEventListener('paste', e => {
    if (['input','textarea'].includes(document.activeElement?.tagName?.toLowerCase())) return;
    const items   = [...(e.clipboardData?.items || [])];
    const pdfItem = items.find(it => it.type === 'application/pdf');
    if (pdfItem) {
      const f = pdfItem.getAsFile();
      if (f) { handleFiles([f]); toast('PDF pasted!', f.name, 'info', 2500); }
    }
  });

  // Welcome toast
  setTimeout(() => {
    toast(
      '🗜️ IshuTools PDF Compressor',
      '12-engine pipeline · No size limit · Lossless mode · 100% free — by Ishu Kumar',
      'info',
      4000
    );
  }, 1000);

  // History badge
  const hist  = loadHistory();
  const count = $('historyCount');
  if (count) count.textContent = hist.length;

}); // DOMContentLoaded

/* ════════════════════════════════════════════════════════════════════════════
   WINDOW GLOBAL EXPORTS (for onclick attributes in HTML)
════════════════════════════════════════════════════════════════════════════ */
window.doCompress          = doCompress;
window.resetTool           = resetTool;
window.cancelCompress      = cancelCompress;
window.triggerDownload     = triggerDownload;
window.shareResult         = shareResult;
window.copyReport          = copyReport;
window.downloadBatchZip    = downloadBatchZip;
window.downloadBatchItem   = downloadBatchItem;
window.removeBatchItem     = removeBatchItem;
window.retryBatchItem      = retryBatchItem;
window.toggleHistory       = toggleHistory;
window.clearHistory        = clearHistory;
window.showShortcutsModal  = showShortcutsModal;
window.closeShortcutsModal = closeShortcutsModal;
window.selectPreset        = selectPreset;
window.toggleTheme         = toggleTheme;
window.toggleSound         = toggleSound;
window.undoLastDelete      = undoLastDelete;
