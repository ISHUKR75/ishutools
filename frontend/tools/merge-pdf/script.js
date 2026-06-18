/**
 * Merge PDF — IshuTools.fun
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 * Professional enterprise-grade PDF merge UI
 * Libraries: SortableJS, GSAP + ScrollTrigger, PDF.js (ESM), Web Audio API
 */
'use strict';

/* ══════════════════════════════════════════════════════════
   CONFIG
══════════════════════════════════════════════════════════ */
const MAX_FILES = 50;
const MAX_FILE_SIZE_MB = 1024;
const PDFJS_CDN    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
const FILE_COLORS  = ['#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];
const RECENT_KEY   = 'ishutools_recent_merges_v2';
const MAX_RECENT   = 5;

/* ══════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════ */
let files         = [];       // [{id, file, pageRange, password, displayName, info}]
let sortable      = null;
let pdfjsLib      = null;
let mergeResult   = null;
let mergeStartTime= null;
let downloadBlob  = null;
let downloadUrl   = null;
let currentSort   = 'order';
let originalOrder = [];

/* ══════════════════════════════════════════════════════════
   DOM REFS
══════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

const dropZone        = $('dropZone');
const fileInput       = $('fileInput');
const addMoreInput    = $('addMoreInput');
const uploadSection   = $('uploadSection');
const filesSection    = $('filesSection');
const progressSection = $('progressSection');
const resultSection   = $('resultSection');
const fileList        = $('fileList');
const fileCountBadge  = $('fileCountBadge');
const mergeBtnCount   = $('mergeBtnCount');
const mergeBtn        = $('mergeBtn');
const addMoreBtn      = $('addMoreBtn');
const clearAllBtn     = $('clearAllBtn');
const optionsToggle   = $('optionsToggle');
const optionsBody     = $('optionsBody');
const progressBar     = $('progressBar');
const progressPercent = $('progressPercent');
const progressTitle   = $('progressTitle');
const progressSub     = $('progressSub');
const downloadBtn     = $('downloadBtn');
const mergeAgainBtn   = $('mergeAgainBtn');
const themeToggle     = $('themeToggle');
const themeIcon       = $('themeIcon');
const toast           = $('toast');
const dragHintCount   = $('dragHintCount');
const globalDragInd   = $('globalDragIndicator');

// Options
const optToc        = $('optToc');
const optSeparators = $('optSeparators');
const optBookmarks  = $('optBookmarks');
const optSkipDupes  = $('optSkipDupes');
const optCompress   = $('optCompress');
const optNormalize  = $('optNormalize');
const optTargetSize = $('optTargetSize');
const optMethod     = $('optMethod');
const optTitle      = $('optTitle');
const optAuthor     = $('optAuthor');
const optFilename   = $('optFilename');

// Quick opts
const qOptToc    = $('qOptToc');
const qOptSep    = $('qOptSep');
const qOptCompress=$('qOptCompress');
const qOptBmarks = $('qOptBmarks');
const qOptDedupe = $('qOptDedupe');

// Stats
const sbFiles = $('sbFiles');
const sbPages = $('sbPages');
const sbSize  = $('sbSize');
const sbEst   = $('sbEst');

/* ══════════════════════════════════════════════════════════
   CANVAS PARTICLE BACKGROUND
══════════════════════════════════════════════════════════ */
(function initCanvas() {
  const canvas = $('bgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  function mkParticle() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.6 + 0.3,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      alpha: Math.random() * 0.4 + 0.05,
      hue: 225 + Math.random() * 45,
    };
  }
  function initParticles() {
    const count = Math.min(Math.floor((W * H) / 8500), 130);
    particles = Array.from({ length: count }, mkParticle);
  }
  function drawFrame() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue},75%,65%,${p.alpha})`;
      ctx.fill();
    });
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 105) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(99,102,241,${(1 - dist/105) * 0.1})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(drawFrame);
  }
  resize(); initParticles(); drawFrame();
  window.addEventListener('resize', () => { resize(); initParticles(); }, { passive: true });
})();

/* ══════════════════════════════════════════════════════════
   THEME
══════════════════════════════════════════════════════════ */
(function initTheme() {
  const saved = localStorage.getItem('ishu-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
})();

function updateThemeIcon(theme) {
  if (themeIcon) themeIcon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}

themeToggle && themeToggle.addEventListener('click', () => {
  const cur  = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ishu-theme', next);
  updateThemeIcon(next);
});

/* ══════════════════════════════════════════════════════════
   NAVBAR SCROLL
══════════════════════════════════════════════════════════ */
const navbar = $('navbar');
window.addEventListener('scroll', () => {
  navbar && navbar.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

/* ══════════════════════════════════════════════════════════
   LAZY PDF.JS LOAD
══════════════════════════════════════════════════════════ */
async function loadPDFJS() {
  if (pdfjsLib) return pdfjsLib;
  try {
    const mod = await import(PDFJS_CDN);
    pdfjsLib = mod;
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return pdfjsLib;
  } catch (e) {
    console.warn('PDF.js failed to load:', e);
    return null;
  }
}

/* ══════════════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════════════ */
function generateId() {
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function truncateName(name, max = 38) {
  if (!name || name.length <= max) return name;
  const ext = name.lastIndexOf('.') > -1 ? name.slice(name.lastIndexOf('.')) : '';
  return name.slice(0, max - ext.length - 3) + '…' + ext;
}

function stemName(filename) {
  if (!filename) return 'merged';
  return filename.replace(/\.[^/.]+$/, '').replace(/[_\-]+$/,'').trim() || 'merged';
}

function smartOutputFilename() {
  if (optFilename && optFilename.value.trim()) {
    const name = optFilename.value.trim().replace(/\.pdf$/i, '');
    return name + '.pdf';
  }
  if (files.length > 0) {
    const first = files[0].displayName || files[0].file.name;
    return stemName(first) + '_merged.pdf';
  }
  return 'merged.pdf';
}

/* ══════════════════════════════════════════════════════════
   WEB AUDIO EFFECTS
══════════════════════════════════════════════════════════ */
let _audioCtx = null;
function _getAudioCtx() {
  try {
    if (!_audioCtx || _audioCtx.state === 'closed') {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return _audioCtx;
  } catch (_) { return null; }
}

function playSuccessChime() {
  const ctx = _getAudioCtx();
  if (!ctx) return;
  // C5-E5-G5-C6 arpeggio
  const notes = [
    [523.25, 0,    0.55, 0.18],
    [659.25, 0.11, 0.50, 0.16],
    [783.99, 0.22, 0.45, 0.14],
    [1046.5, 0.32, 0.62, 0.20],
  ];
  const now = ctx.currentTime;
  notes.forEach(([freq, delay, dur, gain]) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, now + delay);
    env.gain.linearRampToValueAtTime(gain, now + delay + 0.04);
    env.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
    osc.connect(env); env.connect(ctx.destination);
    osc.start(now + delay); osc.stop(now + delay + dur + 0.05);
  });
}

function playDownloadSound() {
  const ctx = _getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Satisfying download whoosh: sawtooth sweep + resonant filter
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(420, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(1800, now);
  filt.frequency.exponentialRampToValueAtTime(300, now + 0.3);
  filt.Q.value = 3;
  gain.gain.setValueAtTime(0.28, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  osc.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.38);
}

/* ══════════════════════════════════════════════════════════
   CONFETTI
══════════════════════════════════════════════════════════ */
function launchConfetti() {
  const container = $('confettiContainer');
  if (!container) return;
  container.innerHTML = '';
  const colors  = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#a78bfa','#22c55e'];
  const shapes  = ['0%','4px','50%'];
  for (let i = 0; i < 100; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    const color    = colors[Math.floor(Math.random() * colors.length)];
    const shape    = shapes[Math.floor(Math.random() * shapes.length)];
    const size     = Math.random() * 9 + 5;
    const left     = Math.random() * 100;
    const delay    = Math.random() * 0.9;
    const duration = Math.random() * 1.8 + 2;
    const drift    = (Math.random() - 0.5) * 180;
    el.style.cssText = `left:${left}%;width:${size}px;height:${size}px;background:${color};border-radius:${shape};animation-duration:${duration}s;animation-delay:${delay}s;transform:translateX(${drift}px) rotate(${Math.random()*360}deg);`;
    container.appendChild(el);
  }
  setTimeout(() => { if (container) container.innerHTML = ''; }, 5000);
}

/* ══════════════════════════════════════════════════════════
   COUNTER ANIMATION
══════════════════════════════════════════════════════════ */
const _counterPrev = {};
function animateCounter(el, toVal) {
  if (!el) return;
  const key  = el.id || el.className;
  const from = _counterPrev[key] ?? 0;
  if (from === toVal) return;
  _counterPrev[key] = toVal;
  const duration = 500;
  const start    = performance.now();
  function update(now) {
    const p = Math.min((now - start) / duration, 1);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (toVal - from) * e);
    el.classList.add('counting');
    if (p < 1) requestAnimationFrame(update);
    else el.classList.remove('counting');
  }
  requestAnimationFrame(update);
}

/* ══════════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════════ */
let toastTimer = null;
function showToast(msg, type = 'info') {
  if (!toast) return;
  const icons = { success:'✓', error:'✕', warn:'⚠', info:'ℹ' };
  toast.className = `toast ${type} show`;
  toast.innerHTML = `<span>${icons[type]||'•'}</span> ${msg}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4000);
}

/* ══════════════════════════════════════════════════════════
   SECTION VISIBILITY
══════════════════════════════════════════════════════════ */
function showSection(section) {
  [uploadSection, filesSection, progressSection, resultSection].forEach(s => {
    if (s) s.hidden = (s !== section);
  });
}
function showUploadSection() {
  files = []; mergeResult = null;
  if (downloadUrl) { URL.revokeObjectURL(downloadUrl); downloadUrl = null; }
  downloadBlob = null;
  showSection(uploadSection);
  updateCounts();
}
function showFilesSection() { showSection(filesSection); }
function showProgressSection() { showSection(progressSection); }
function showResultSection()  { showSection(resultSection); }

/* ══════════════════════════════════════════════════════════
   FILE HANDLING
══════════════════════════════════════════════════════════ */
async function addFiles(newFiles) {
  const pdfFiles = Array.from(newFiles).filter(f => {
    if (!f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf') {
      showToast(`"${f.name}" is not a PDF file`, 'warn');
      return false;
    }
    if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      showToast(`"${f.name}" exceeds 1 GB limit`, 'warn');
      return false;
    }
    return true;
  });

  if (files.length + pdfFiles.length > MAX_FILES) {
    showToast(`Maximum ${MAX_FILES} files allowed`, 'warn');
    pdfFiles.splice(MAX_FILES - files.length);
  }
  if (!pdfFiles.length) return;

  const newEntries = pdfFiles.map(f => ({
    id: generateId(), file: f,
    pageRange: '', password: '',
    displayName: f.name, info: null,
  }));

  files.push(...newEntries);
  originalOrder = files.map(f => f.id);
  showFilesSection();
  renderFileList();
  updateCounts();
  checkDuplicates();

  // Load thumbnails & validate in background
  const lib = await loadPDFJS();
  for (const entry of newEntries) {
    loadFileInfo(entry, lib);
    validateFileAsync(entry);
  }
}

async function loadFileInfo(entry, lib) {
  const thumbEl = document.querySelector(`[data-id="${entry.id}"] .file-thumb`);
  if (!thumbEl) return;
  thumbEl.innerHTML = '<div class="thumb-loading"></div>';

  try {
    const arrayBuf = await entry.file.arrayBuffer();
    if (lib) {
      try {
        const pdf = await lib.getDocument({ data: arrayBuf.slice(0), password: entry.password || '' }).promise;
        entry.info = entry.info || {};
        entry.info.pageCount = pdf.numPages;
        entry.info.encrypted = false;

        const page     = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.42 });
        const canvas   = document.createElement('canvas');
        canvas.width   = viewport.width;
        canvas.height  = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

        const el = document.querySelector(`[data-id="${entry.id}"] .file-thumb`);
        if (el) { el.innerHTML = ''; el.appendChild(canvas); }
        updateFileCard(entry);
        return;
      } catch (e) {
        entry.info = entry.info || {};
        if (e.name === 'PasswordException') {
          entry.info.pageCount = '?'; entry.info.encrypted = true;
        } else {
          entry.info.pageCount = '?'; entry.info.encrypted = false;
        }
      }
    }
  } catch (_) {
    entry.info = entry.info || { pageCount: '?', encrypted: false };
  }

  const el = document.querySelector(`[data-id="${entry.id}"] .file-thumb`);
  if (el) el.innerHTML = `<div class="thumb-placeholder"><i class="fas fa-file-pdf"></i><span>PDF</span></div>`;
  updateFileCard(entry);
}

function updateFileCard(entry) {
  const card   = document.querySelector(`[data-id="${entry.id}"]`);
  if (!card || !entry.info) return;
  const metaEl = card.querySelector('.file-meta');
  if (!metaEl) return;
  const { pageCount, encrypted } = entry.info;
  metaEl.innerHTML = `
    <span class="file-meta-pill pages-pill"><i class="fas fa-book-open"></i> ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}</span>
    <span class="file-meta-pill"><i class="fas fa-database"></i> ${formatBytes(entry.file.size)}</span>
    ${encrypted ? '<span class="file-meta-pill encrypted"><i class="fas fa-lock"></i> Encrypted</span>' : ''}
  `;
  if (encrypted) {
    const pw = card.querySelector('.pw-field');
    if (pw) pw.style.display = '';
    card.classList.add('expanded');
  }
  updateLiveStats();
}

/* ══════════════════════════════════════════════════════════
   RENDER FILE LIST
══════════════════════════════════════════════════════════ */
function renderFileList() {
  fileList.innerHTML = '';
  files.forEach((entry, idx) => fileList.appendChild(createFileCard(entry, idx)));

  if (sortable) sortable.destroy();
  sortable = Sortable.create(fileList, {
    animation: 200,
    handle: '.file-drag-handle',
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    onEnd(evt) {
      const moved = files.splice(evt.oldIndex, 1)[0];
      files.splice(evt.newIndex, 0, moved);
      updateCounts();
      updateFileNumbers();
    },
  });
}

function createFileCard(entry, idx) {
  const card = document.createElement('div');
  card.className = 'file-card entering';
  card.setAttribute('data-id', entry.id);
  card.setAttribute('role', 'listitem');
  card.setAttribute('tabindex', '0');
  setTimeout(() => card.classList.remove('entering'), 350);

  const displayName = entry.displayName || entry.file.name;

  card.innerHTML = `
    <div class="file-drag-handle" title="Drag to reorder" aria-label="Drag handle">
      <i class="fas fa-grip-dots-vertical"></i>
    </div>
    <div class="file-thumb"><div class="thumb-loading"></div></div>
    <div class="file-info">
      <div class="file-name" title="${displayName} (double-click to rename)">${truncateName(displayName)}</div>
      <div class="file-meta">
        <span class="file-meta-pill"><i class="fas fa-database"></i> ${formatBytes(entry.file.size)}</span>
      </div>
      <div class="file-expanded">
        <div class="file-field-row">
          <div class="file-field">
            <label><i class="fas fa-list-ol"></i> Page Range</label>
            <input type="text" class="page-range-input" value="${entry.pageRange}"
              placeholder="e.g. 1-3, 5, 8-10 · odd · even · last 2"
              aria-label="Page range for ${displayName}" />
            <div class="pr-quick-btns">
              <button type="button" class="pr-btn${!entry.pageRange ? ' active':''}" data-range="">All</button>
              <button type="button" class="pr-btn" data-range="odd">Odd</button>
              <button type="button" class="pr-btn" data-range="even">Even</button>
              <button type="button" class="pr-btn" data-range="1">First</button>
              <button type="button" class="pr-btn" data-range="last 1">Last</button>
            </div>
          </div>
          <div class="file-field pw-field" style="display:none">
            <label><i class="fas fa-lock"></i> Password</label>
            <input type="password" class="pw-input" value="${entry.password}"
              placeholder="Enter PDF password" autocomplete="off"
              aria-label="Password for ${displayName}" />
          </div>
        </div>
        <div class="file-field-row">
          <div class="file-field">
            <label><i class="fas fa-tag"></i> Display Name (for TOC)</label>
            <input type="text" class="display-name-input" value="${entry.displayName || ''}"
              placeholder="${entry.file.name}" maxlength="80"
              aria-label="Display name for ${displayName}" />
          </div>
        </div>
      </div>
    </div>
    <div class="file-actions">
      <div class="file-num">#${idx + 1}</div>
      <div style="display:flex;gap:4px;margin-top:4px">
        <span class="file-status" id="vstatus_${entry.id}" title="Validating…"></span>
        <button type="button" class="btn-icon primary expand-btn" title="Show options">
          <i class="fas fa-sliders"></i>
        </button>
        <button type="button" class="btn-icon danger remove-btn" title="Remove this file">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `;

  // Wire events
  card.querySelector('.page-range-input').addEventListener('change', e => {
    entry.pageRange = e.target.value.trim();
    card.querySelectorAll('.pr-btn').forEach(b => b.classList.toggle('active', b.dataset.range === entry.pageRange));
  });

  card.querySelectorAll('.pr-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      entry.pageRange = btn.dataset.range;
      card.querySelector('.page-range-input').value = entry.pageRange;
      card.querySelectorAll('.pr-btn').forEach(b => b.classList.toggle('active', b.dataset.range === entry.pageRange));
    });
  });

  const pwInput = card.querySelector('.pw-input');
  pwInput && pwInput.addEventListener('change', e => {
    entry.password = e.target.value;
    if (entry.password) validateFileAsync(entry);
  });

  const dnInput = card.querySelector('.display-name-input');
  dnInput && dnInput.addEventListener('change', e => {
    entry.displayName = e.target.value.trim() || entry.file.name;
    card.querySelector('.file-name').textContent = truncateName(entry.displayName);
    card.querySelector('.file-name').title = entry.displayName;
  });

  card.querySelector('.expand-btn').addEventListener('click', () => {
    card.classList.toggle('expanded');
  });

  card.querySelector('.remove-btn').addEventListener('click', () => removeFile(entry.id));

  // Double-click filename to rename inline
  card.querySelector('.file-name').addEventListener('dblclick', () => {
    card.classList.add('expanded');
    const dnEl = card.querySelector('.display-name-input');
    if (dnEl) { dnEl.focus(); dnEl.select(); }
  });

  return card;
}

function removeFile(id) {
  const idx = files.findIndex(f => f.id === id);
  if (idx === -1) return;
  const card = document.querySelector(`[data-id="${id}"]`);
  if (card && typeof gsap !== 'undefined') {
    gsap.to(card, { duration: 0.22, x: 30, opacity: 0, ease: 'power2.in', onComplete: () => {
      files.splice(idx, 1);
      originalOrder = originalOrder.filter(i => i !== id);
      renderFileList(); updateCounts(); checkDuplicates();
      if (files.length === 0) showUploadSection();
    }});
  } else {
    files.splice(idx, 1);
    originalOrder = originalOrder.filter(i => i !== id);
    renderFileList(); updateCounts(); checkDuplicates();
    if (files.length === 0) showUploadSection();
  }
}

function updateFileNumbers() {
  document.querySelectorAll('.file-card').forEach((card, idx) => {
    const num = card.querySelector('.file-num');
    if (num) num.textContent = `#${idx + 1}`;
  });
}

/* ══════════════════════════════════════════════════════════
   LIVE STATS
══════════════════════════════════════════════════════════ */
function updateLiveStats() {
  const n = files.length;
  if (sbFiles) animateCounter(sbFiles, n);

  const totalBytes = files.reduce((s, f) => s + f.file.size, 0);
  if (sbSize) sbSize.textContent = totalBytes > 0 ? formatBytes(totalBytes) : '—';

  const known = files.filter(f => f.info && typeof f.info.pageCount === 'number');
  if (known.length > 0) {
    const total      = known.reduce((s, f) => s + (f.info.pageCount || 0), 0);
    const hasUnknown = known.length < files.length;
    if (sbPages) {
      if (hasUnknown) { sbPages.textContent = total + '+'; }
      else animateCounter(sbPages, total);
    }
  } else {
    if (sbPages) sbPages.textContent = '—';
  }

  const estSec = Math.max(1, Math.round(totalBytes / (1024*1024) * 0.5 + n * 0.3));
  if (sbEst) sbEst.textContent = estSec < 60 ? `~${estSec}s` : `~${Math.ceil(estSec/60)}m`;
  checkLargePageWarning();
  if (dragHintCount) dragHintCount.textContent = n > 0 ? `${n} ${n===1?'file':'files'} — drag to reorder` : 'add files to begin';
}

function checkLargePageWarning() {
  const banner = $('largePageBanner');
  if (!banner) return;
  const known = files.filter(f => f.info && typeof f.info.pageCount === 'number');
  const total  = known.reduce((s, f) => s + (f.info.pageCount || 0), 0);
  if (total > 500) {
    banner.style.display = '';
    banner.innerHTML = `<i class="fas fa-triangle-exclamation"></i> Large merge: ${total}+ pages detected. Processing may take longer. Consider enabling Compress Output.`;
  } else {
    banner.style.display = 'none';
  }
}

function updateCounts() {
  const n = files.length;
  if (fileCountBadge) fileCountBadge.textContent = `${n} ${n===1?'file':'files'}`;
  if (mergeBtnCount) mergeBtnCount.textContent = n > 0 ? `${n}` : '';
  if (mergeBtn) mergeBtn.disabled = n < 2;
  updateLiveStats();
}

/* ══════════════════════════════════════════════════════════
   SORT
══════════════════════════════════════════════════════════ */
function sortFiles(by) {
  currentSort = by;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === by));
  if (by === 'order') {
    files.sort((a, b) => originalOrder.indexOf(a.id) - originalOrder.indexOf(b.id));
  } else if (by === 'name') {
    files.sort((a, b) => a.file.name.localeCompare(b.file.name));
  } else if (by === 'size') {
    files.sort((a, b) => b.file.size - a.file.size);
  } else if (by === 'pages') {
    files.sort((a, b) => (b.info?.pageCount||0) - (a.info?.pageCount||0));
  }
  renderFileList();
  updateCounts();
  if (typeof gsap !== 'undefined') {
    gsap.from('#fileList .file-card', { duration: 0.28, y: 8, stagger: 0.04, ease: 'power2.out' });
  }
}

/* ══════════════════════════════════════════════════════════
   DUPLICATE DETECTION
══════════════════════════════════════════════════════════ */
function checkDuplicates() {
  document.querySelector('.dupe-warning')?.remove();
  const seen = new Map(), dupes = [];
  files.forEach(f => {
    const key = `${f.file.name}__${f.file.size}`;
    if (seen.has(key)) { dupes.push(f.id); dupes.push(seen.get(key)); }
    else seen.set(key, f.id);
  });
  document.querySelectorAll('.file-card').forEach(card => {
    card.classList.toggle('is-duplicate', dupes.includes(card.dataset.id));
  });
  if (dupes.length > 0) {
    const warn = document.createElement('div');
    warn.className = 'dupe-warning';
    warn.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${Math.floor(dupes.length/2)} possible duplicate file(s). Enable "Dedupe" to skip them.`;
    fileList.before(warn);
  }
}

/* ══════════════════════════════════════════════════════════
   QUICK OPTS SYNC
══════════════════════════════════════════════════════════ */
function setupQuickOptSync() {
  function syncChip(chipInput, chipEl, mainInput) {
    if (!chipInput || !mainInput) return;
    chipInput.addEventListener('change', () => {
      mainInput.checked = chipInput.checked;
      chipEl && chipEl.classList.toggle('active', chipInput.checked);
    });
    mainInput.addEventListener('change', () => { chipInput.checked = mainInput.checked; });
  }
  syncChip(qOptToc,    qOptToc?.closest('.qopt-chip'),    optToc);
  syncChip(qOptSep,    qOptSep?.closest('.qopt-chip'),    optSeparators);
  syncChip(qOptCompress,qOptCompress?.closest('.qopt-chip'),optCompress);
  syncChip(qOptBmarks, qOptBmarks?.closest('.qopt-chip'), optBookmarks);
  syncChip(qOptDedupe, qOptDedupe?.closest('.qopt-chip'), optSkipDupes);

  // Set initial active states
  [qOptToc, qOptSep, qOptCompress, qOptBmarks, qOptDedupe].forEach(el => {
    el && el.closest('.qopt-chip')?.classList.toggle('active', el.checked);
  });
}

/* ══════════════════════════════════════════════════════════
   MERGE PRESETS
══════════════════════════════════════════════════════════ */
const MERGE_PRESETS = {
  quick:   { toc:false, sep:false, compress:false, bmarks:true,  dupes:false },
  report:  { toc:true,  sep:true,  compress:false, bmarks:true,  dupes:false },
  compact: { toc:false, sep:false, compress:true,  bmarks:false, dupes:true  },
  archive: { toc:true,  sep:true,  compress:true,  bmarks:true,  dupes:true  },
};

function applyPreset(key) {
  const p = MERGE_PRESETS[key];
  if (!p) return;
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.toggle('active', b.dataset.preset === key));

  function setOpt(main, quick, val) {
    if (main) { main.checked = val; main.dispatchEvent(new Event('change')); }
    if (quick) { quick.checked = val; quick.closest('.qopt-chip')?.classList.toggle('active', val); }
  }
  setOpt(optToc,        qOptToc,     p.toc);
  setOpt(optSeparators, qOptSep,     p.sep);
  setOpt(optCompress,   qOptCompress,p.compress);
  setOpt(optBookmarks,  qOptBmarks,  p.bmarks);
  setOpt(optSkipDupes,  qOptDedupe,  p.dupes);
}

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
});

/* ══════════════════════════════════════════════════════════
   PROGRESS HELPERS
══════════════════════════════════════════════════════════ */
let progressInterval = null;
function startProgress() {
  let val = 0;
  if (progressBar) progressBar.style.width = '0%';
  if (progressPercent) progressPercent.textContent = '0%';
  clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    val = Math.min(val + Math.random() * 3.5, 85);
    if (progressBar) progressBar.style.width = val + '%';
    if (progressPercent) progressPercent.textContent = Math.round(val) + '%';
  }, 120);
}

function completeProgress(success = false) {
  clearInterval(progressInterval);
  if (progressBar) progressBar.style.width = '100%';
  if (progressPercent) progressPercent.textContent = '100%';
}

function setProgressStep(n) {
  [1,2,3,4].forEach(i => {
    const el = $(`pstep${i}`);
    if (!el) return;
    if (i < n)  { el.className = 'pstep done'; }
    else if (i === n) { el.className = 'pstep active'; }
    else { el.className = 'pstep'; }
  });
}

function updateProgressMsg(title, sub) {
  if (progressTitle) progressTitle.textContent = title;
  if (progressSub)   progressSub.textContent   = sub;
}

/* ══════════════════════════════════════════════════════════
   PER-FILE ASYNC VALIDATION
══════════════════════════════════════════════════════════ */
async function validateFileAsync(entry) {
  const statusEl = $(`vstatus_${entry.id}`);
  if (!statusEl) return;
  statusEl.className = 'file-status loading';
  statusEl.title = 'Validating…';

  try {
    const fd = new FormData();
    fd.append('file', entry.file, entry.file.name);
    if (entry.password) fd.append('password', entry.password);

    const resp = await fetch('/api/merge-pdf/validate', { method:'POST', body:fd });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Validation failed');

    if (data.encrypted && !entry.password) {
      statusEl.className = 'file-status encrypted';
      statusEl.title = 'Password protected';
      const card = document.querySelector(`[data-id="${entry.id}"]`);
      if (card) {
        card.classList.add('expanded');
        const pw = card.querySelector('.pw-field');
        if (pw) pw.style.display = '';
      }
      return;
    }

    entry.info = entry.info || {};
    if (data.pages > 0) {
      entry.info.pageCount = data.pages;
      const pagesEl = document.querySelector(`[data-id="${entry.id}"] .pages-pill`);
      if (pagesEl) pagesEl.innerHTML = `<i class="fas fa-book-open"></i> ${data.pages} pages`;
    }
    if (data.title || data.author) {
      entry.info.title  = data.title  || '';
      entry.info.author = data.author || '';
      const card   = document.querySelector(`[data-id="${entry.id}"]`);
      if (card) {
        let meta = card.querySelector('.file-doc-meta');
        if (!meta) {
          meta = document.createElement('div');
          meta.className = 'file-doc-meta';
          card.querySelector('.file-info')?.appendChild(meta);
        }
        meta.textContent = [data.title, data.author].filter(Boolean).join(' · ').slice(0, 55);
      }
      // Auto-fill output title/author from first file
      if (files[0]?.id === entry.id) {
        if (optTitle && !optTitle.value && data.title)   optTitle.value  = data.title;
        if (optAuthor && !optAuthor.value && data.author) optAuthor.value = data.author;
      }
    }

    if (data.warnings?.length) {
      statusEl.className = 'file-status warning';
      statusEl.title = data.warnings[0];
    } else if (!data.valid) {
      statusEl.className = 'file-status error';
      statusEl.title = data.error || 'Cannot read PDF';
    } else {
      statusEl.className = 'file-status valid';
      statusEl.title = `Valid · ${data.pages} pages · PDF ${data.version || ''}`;
    }
    updateLiveStats();
  } catch (err) {
    const statusEl2 = $(`vstatus_${entry.id}`);
    if (statusEl2) { statusEl2.className = 'file-status error'; statusEl2.title = err.message; }
  }
}

/* ══════════════════════════════════════════════════════════
   MAIN MERGE FUNCTION
══════════════════════════════════════════════════════════ */
async function doMerge() {
  if (files.length < 2) {
    showToast('Add at least 2 PDF files to merge', 'warn');
    return;
  }

  mergeStartTime = Date.now();
  showProgressSection();
  startProgress();
  setProgressStep(1);
  updateProgressMsg('Uploading files…', `Sending ${files.length} files to server`);

  try {
    const fd = new FormData();
    files.forEach(entry => fd.append('files', entry.file, entry.displayName || entry.file.name));

    fd.append('add_toc',           String(optToc?.checked || false));
    fd.append('add_separators',    String(optSeparators?.checked || false));
    fd.append('preserve_bookmarks',String(optBookmarks?.checked !== false));
    fd.append('skip_duplicates',   String(optSkipDupes?.checked || false));
    fd.append('compress_output',   String(optCompress?.checked || false));
    fd.append('normalize_page_size',String(optNormalize?.checked || false));
    fd.append('target_page_size',  optTargetSize?.value || 'A4');
    fd.append('merge_method',      optMethod?.value || 'auto');
    fd.append('output_title',      optTitle?.value  || '');
    fd.append('output_author',     optAuthor?.value || '');
    fd.append('output_filename',   smartOutputFilename());

    fd.append('page_ranges',    JSON.stringify(files.map(f => f.pageRange || 'all')));
    fd.append('passwords',      JSON.stringify(files.map(f => f.password  || null)));
    fd.append('display_names',  JSON.stringify(files.map(f => f.displayName || f.file.name)));

    setProgressStep(2);
    updateProgressMsg('Merging PDFs…', 'Combining your documents with enterprise-grade processing');

    const resp = await fetch('/api/merge-pdf', { method: 'POST', body: fd });

    setProgressStep(3);
    updateProgressMsg('Optimizing…', 'Finalizing your merged PDF');

    if (!resp.ok) {
      let msg = `Server error (${resp.status})`;
      try { const j = await resp.json(); msg = j.error || msg; } catch(_) {}
      throw new Error(msg);
    }

    // Calculate size from response
    const blob     = await resp.blob();
    downloadBlob   = blob;
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl    = URL.createObjectURL(blob);

    const elapsed     = ((Date.now() - mergeStartTime) / 1000).toFixed(1);
    const outputSize  = blob.size;
    const inputSize   = files.reduce((s, f) => s + f.file.size, 0);
    const sizeDelta   = outputSize - inputSize;
    const sizePct     = inputSize > 0 ? ((sizeDelta / inputSize) * 100).toFixed(1) : '0';
    const filename    = smartOutputFilename();
    const totalInputPages = files.reduce((s, f) => s + (f.info?.pageCount || 0), 0);

    mergeResult = {
      filename,
      outputSize,
      inputSize,
      totalPages: totalInputPages,
      sourceCount: files.length,
      elapsed,
      method: optMethod?.value || 'auto',
    };

    completeProgress(true);
    setProgressStep(4);
    saveRecentMerge(mergeResult);

    setTimeout(() => {
      showResultSection();
      populateResultCard(mergeResult, sizeDelta, sizePct, elapsed);
      playSuccessChime();
      launchConfetti();
      renderRecentMerges();

      if (typeof gsap !== 'undefined') {
        gsap.from('.result-card', { duration: 0.5, y: 24, ease: 'power3.out' });
        gsap.from('.rstat', { duration: 0.4, y: 12, stagger: 0.06, delay: 0.2, ease: 'power2.out' });
      }
    }, 380);

  } catch (err) {
    completeProgress(false);
    showFilesSection();
    showToast(err.message || 'Merge failed. Please try again.', 'error');
    console.error('Merge error:', err);
  }
}

function populateResultCard(result, sizeDelta, sizePct, elapsed) {
  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  set('rstatFiles',  result.sourceCount);
  set('rstatPages',  result.totalPages || '—');
  set('rstatSize',   formatBytes(result.outputSize));
  set('rstatMethod', (result.method === 'auto' ? 'Auto/pypdf' : result.method).replace('fitz','PyMuPDF').replace('gs','Ghostscript'));
  set('rstatTime',   `${elapsed}s`);

  const savedEl = $('rstatSaved');
  if (savedEl) {
    const sign = sizeDelta > 0 ? '+' : '';
    savedEl.textContent = `${sign}${sizePct}%`;
    savedEl.style.color = sizeDelta < 0 ? 'var(--success)' : sizeDelta > 0 ? 'var(--warn)' : 'var(--text2)';
  }

  // Filename display
  const fnRow = $('resultFilenameRow');
  const fnDisp= $('resultFilenameDisplay');
  if (fnRow && fnDisp) {
    fnDisp.textContent = result.filename;
    fnRow.style.display = '';
  }

  // Subtitle
  const sub = $('resultSubtitle');
  if (sub) sub.textContent = `${result.sourceCount} files · ${result.totalPages||'?'} pages merged into ${result.filename}`;
}

/* ══════════════════════════════════════════════════════════
   DOWNLOAD
══════════════════════════════════════════════════════════ */
function triggerDownload() {
  if (!downloadUrl || !mergeResult) return;
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = mergeResult.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  playDownloadSound();
  showToast(`Downloading ${mergeResult.filename}`, 'success');
}

/* ══════════════════════════════════════════════════════════
   RECENT MERGES
══════════════════════════════════════════════════════════ */
function saveRecentMerge(result) {
  try {
    const list = loadRecentMerges();
    list.unshift({ filename:result.filename, pages:result.totalPages||0, size:result.outputSize||0, sourceCount:result.sourceCount||0, date:new Date().toISOString() });
    if (list.length > MAX_RECENT) list.length = MAX_RECENT;
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch (_) {}
}
function loadRecentMerges() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (_) { return []; }
}
function timeAgo(dateStr) {
  const m = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}
function renderRecentMerges() {
  const container = $('recentMerges');
  if (!container) return;
  const list = loadRecentMerges();
  if (list.length === 0) { container.style.display = 'none'; return; }
  container.style.display = '';
  container.innerHTML = `
    <h4 class="recent-title"><i class="fas fa-history"></i> Recent Merges</h4>
    <div class="recent-list">
      ${list.map(m => `
        <div class="recent-item">
          <i class="fas fa-file-pdf"></i>
          <div class="recent-info">
            <div class="recent-filename" title="${m.filename}">${truncateName(m.filename, 40)}</div>
            <div class="recent-meta">${m.sourceCount} files · ${m.pages} pages · ${formatBytes(m.size)}</div>
          </div>
          <div class="recent-date">${timeAgo(m.date)}</div>
        </div>`).join('')}
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS MODAL
══════════════════════════════════════════════════════════ */
function showShortcutsModal() {
  const m = $('shortcutsModal');
  if (!m) return;
  m.removeAttribute('hidden');
  if (typeof gsap !== 'undefined') gsap.from(m.querySelector('.shortcuts-card'), { duration:0.3, y:-18, ease:'power2.out' });
  $('shortcutsClose')?.focus();
}
function hideShortcutsModal() { $('shortcutsModal')?.setAttribute('hidden',''); }

$('shortcutsClose') && $('shortcutsClose').addEventListener('click', hideShortcutsModal);
$('shortcutsModal') && $('shortcutsModal').addEventListener('click', e => { if (e.target === $('shortcutsModal')) hideShortcutsModal(); });
$('shortcutsHintBtn') && $('shortcutsHintBtn').addEventListener('click', showShortcutsModal);

/* ══════════════════════════════════════════════════════════
   COPY FILENAME
══════════════════════════════════════════════════════════ */
function copyResultFilename() {
  if (!mergeResult) return;
  navigator.clipboard.writeText(mergeResult.filename).then(() => {
    showToast(`"${mergeResult.filename}" copied!`, 'success');
    const btn = $('copyNameBtn');
    if (btn) {
      btn.classList.add('copied');
      btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = '<i class="fas fa-copy"></i> Copy Name';
      }, 2200);
    }
  }).catch(() => showToast(mergeResult.filename, 'info'));
}
$('copyNameBtn') && $('copyNameBtn').addEventListener('click', copyResultFilename);

/* ══════════════════════════════════════════════════════════
   DROP ZONE EVENTS
══════════════════════════════════════════════════════════ */
dropZone.addEventListener('click', e => {
  if (e.target.closest('.drop-browse') || e.target === dropZone || e.target.closest('.drop-content')) {
    fileInput.click();
  }
});
dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener('change', e => {
  if (e.target.files.length) addFiles(e.target.files);
  fileInput.value = '';
});
addMoreBtn && addMoreBtn.addEventListener('click', () => addMoreInput.click());
addMoreInput.addEventListener('change', e => {
  if (e.target.files.length) addFiles(e.target.files);
  addMoreInput.value = '';
});
clearAllBtn && clearAllBtn.addEventListener('click', () => {
  if (!files.length) return;
  if (typeof gsap !== 'undefined') {
    gsap.to('#fileList .file-card', { duration:0.2, x:20, opacity:0, stagger:0.04, onComplete: () => showUploadSection() });
  } else { showUploadSection(); }
});

// Drop zone drag events
['dragenter','dragover'].forEach(ev => {
  dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
});
['dragleave','drop'].forEach(ev => {
  dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('drag-over'); });
});
dropZone.addEventListener('drop', e => {
  if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
});

// Global drag indicator
let dragCounter = 0;
document.addEventListener('dragenter', e => {
  if (!e.dataTransfer.types.includes('Files')) return;
  dragCounter++;
  globalDragInd && globalDragInd.classList.add('active');
});
document.addEventListener('dragleave', e => {
  dragCounter = Math.max(0, dragCounter - 1);
  if (dragCounter === 0) globalDragInd && globalDragInd.classList.remove('active');
});
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  dragCounter = 0;
  globalDragInd && globalDragInd.classList.remove('active');
  if (e.target.closest('#dropZone')) return;
  e.preventDefault();
  if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
});

/* ══════════════════════════════════════════════════════════
   BUTTON WIRING
══════════════════════════════════════════════════════════ */
mergeBtn    && mergeBtn.addEventListener('click', doMerge);
downloadBtn && downloadBtn.addEventListener('click', triggerDownload);
mergeAgainBtn && mergeAgainBtn.addEventListener('click', () => showUploadSection());

// Options panel toggle
optionsToggle && optionsToggle.addEventListener('click', () => {
  const open = optionsToggle.getAttribute('aria-expanded') === 'true';
  optionsToggle.setAttribute('aria-expanded', String(!open));
  if (open) {
    optionsBody.setAttribute('hidden','');
  } else {
    optionsBody.removeAttribute('hidden');
    if (typeof gsap !== 'undefined') gsap.from(optionsBody, { duration:0.3, y:-10, ease:'power2.out' });
  }
});

// Normalize size toggle
optNormalize && optNormalize.addEventListener('change', () => {
  if (optTargetSize) optTargetSize.disabled = !optNormalize.checked;
});

// Sort buttons
document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => sortFiles(btn.dataset.sort));
});

/* ══════════════════════════════════════════════════════════
   FAQ ACCORDION
══════════════════════════════════════════════════════════ */
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item   = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(i => {
      i.classList.remove('open');
      i.querySelector('.faq-q').setAttribute('aria-expanded','false');
    });
    if (!isOpen) { item.classList.add('open'); btn.setAttribute('aria-expanded','true'); }
  });
});

/* ══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  const inInput = e.target.matches('input,textarea,[contenteditable="true"]');
  if (e.key === '?' && !inInput)            { showShortcutsModal(); return; }
  if (e.key === 'Escape')                   { hideShortcutsModal(); return; }
  if ((e.ctrlKey||e.metaKey) && e.key==='o') {
    e.preventDefault();
    filesSection && !filesSection.hidden ? addMoreInput.click() : fileInput.click();
    return;
  }
  if ((e.ctrlKey||e.metaKey) && e.key==='m') {
    e.preventDefault();
    if (files.length >= 2) doMerge();
    else showToast('Add at least 2 PDF files to merge','warn');
    return;
  }
  if (e.key === 'Delete' && !inInput && document.activeElement.closest('.file-card')) {
    const id = document.activeElement.closest('.file-card')?.getAttribute('data-id');
    if (id) removeFile(id);
  }
  if (e.altKey && (e.key==='ArrowUp'||e.key==='ArrowDown') && !inInput) {
    const card = document.activeElement.closest('.file-card');
    if (!card) return;
    e.preventDefault();
    const id  = card.getAttribute('data-id');
    const idx = files.findIndex(f => f.id === id);
    if (idx === -1) return;
    const newIdx = e.key === 'ArrowUp' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= files.length) return;
    [files[idx], files[newIdx]] = [files[newIdx], files[idx]];
    originalOrder = files.map(f => f.id);
    renderFileList(); updateCounts();
    setTimeout(() => {
      const moved = document.querySelector(`[data-id="${id}"]`);
      moved?.focus();
      moved?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    }, 50);
    showToast(e.key==='ArrowUp'?'↑ Moved up':'↓ Moved down','info');
  }
});

/* ══════════════════════════════════════════════════════════
   GSAP ENTRY ANIMATIONS (defer-safe)
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const tryGSAP = () => {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      setTimeout(tryGSAP, 100); return;
    }
    gsap.registerPlugin(ScrollTrigger);

    // Hero — y-only (never opacity:0 on above-fold)
    gsap.from('.hero-badge',              { duration:0.55, y:-18, delay:0.05, ease:'power2.out' });
    gsap.from('.hero-title .title-line1', { duration:0.65, y:28,  delay:0.15, ease:'power3.out' });
    gsap.from('.hero-title .title-line2', { duration:0.65, y:28,  delay:0.28, ease:'power3.out' });
    gsap.from('.hero-subtitle',           { duration:0.55, y:18,  delay:0.38, ease:'power2.out' });
    gsap.from('.stat-pill',               { duration:0.45, y:14,  delay:0.46, stagger:0.07, ease:'power2.out' });
    gsap.from('.upload-zone',             { duration:0.6,  y:24,  delay:0.55, ease:'power3.out' });

    // Scroll-triggered — y-only
    const scrollEls = document.querySelectorAll('.step-card, .feature-card, .faq-item, .related-card');
    scrollEls.forEach(el => {
      gsap.from(el, {
        scrollTrigger: { trigger: el, start:'top 88%', once:true },
        duration: 0.5, y: 24, ease:'power2.out',
      });
    });

    // Section titles
    document.querySelectorAll('.section-title').forEach(el => {
      gsap.from(el, {
        scrollTrigger: { trigger: el, start:'top 90%', once:true },
        duration: 0.55, y: 18, ease:'power2.out',
      });
    });
  };
  setTimeout(tryGSAP, 200);
});

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
loadPDFJS();          // preload in background
setupQuickOptSync();
updateCounts();
renderRecentMerges(); // show recent merges if available (on result card)
