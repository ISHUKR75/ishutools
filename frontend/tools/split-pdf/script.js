/**
 * split-pdf/script.js  v5.0 — IshuTools.fun
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 *
 * Full overhaul:
 * - NO file size limit
 * - Download ZIP named after uploaded file
 * - fahhhhh.mp3 on download, full sounds integration
 * - Simplified, professional UX — no complexity
 * - SSE progress, confetti, all 7 modes
 * - Canvas animated background
 * - Fully responsive
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

/* ── SOUNDS wrapper (uses window.SOUNDS from sounds.js) ─────── */
function S(key) {
  try {
    const map = {
      add:      () => window.SOUNDS?.playFileAddSound?.(),
      remove:   () => window.SOUNDS?.playFileRemoveSound?.(),
      start:    () => window.SOUNDS?.playMergeStartSound?.(),
      success:  () => window.SOUNDS?.playSuccessChime?.(),
      download: () => window.SOUNDS?.playDownloadWhoosh?.(),
      error:    () => window.SOUNDS?.playErrorSound?.(),
      warn:     () => window.SOUNDS?.playWarningSound?.(),
      tick:     () => window.SOUNDS?.playProgressTick?.(),
      expand:   () => window.SOUNDS?.playExpandSound?.(),
      collapse: () => window.SOUNDS?.playCollapseSound?.(),
      toggle:   () => window.SOUNDS?.playToggleOnSound?.(),
    };
    if (soundEnabled()) map[key]?.();
  } catch(_) {}
}
function soundEnabled() {
  try { return document.getElementById('soundToggle')?.checked !== false; } catch(_) { return true; }
}

/* ── DOM INIT ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
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
    statScanned:     document.getElementById('statScanned'),
    fileRemoveBtn:   document.getElementById('fileRemoveBtn'),
    thumbsStrip:     document.getElementById('thumbsStrip'),
    thumbsLoading:   document.getElementById('thumbsLoading'),
    thumbsCount:     document.getElementById('thumbsCount'),

    modesCard:       document.getElementById('modesCard'),
    modesGrid:       document.getElementById('modesGrid'),
    modeSubLine:     document.getElementById('modeSubLine'),
    recommendBanner: document.getElementById('recommendBanner'),
    recText:         document.getElementById('recText'),
    recApplyBtn:     document.getElementById('recApplyBtn'),
    recCloseBtn:     document.getElementById('recCloseBtn'),

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

    advCard:         document.getElementById('advCard'),
    advToggle:       document.getElementById('advToggle'),
    advBody:         document.getElementById('advBody'),
    advArrow:        document.getElementById('advArrow'),
    pdfPassword:     document.getElementById('pdfPassword'),
    removeBlanks:    document.getElementById('removeBlanks'),
    namingPattern:   document.getElementById('namingPattern'),
    soundToggle:     document.getElementById('soundToggle'),

    actionSection:   document.getElementById('actionSection'),
    splitBtn:        document.getElementById('splitBtn'),
    splitBtnBadge:   document.getElementById('splitBtnBadge'),

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
    resultSummary:   document.getElementById('resultSummary'),
    downloadBtn:     document.getElementById('downloadBtn'),

    faqList:            document.getElementById('faqList'),
    rangeGroupsInput:   document.getElementById('rangeGroupsInput'),
    rangeGroupsPreview: document.getElementById('rangeGroupsPreview'),
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

  // Keyboard shortcut
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (D.splitBtn && !D.splitBtn.disabled && !D.actionSection.hidden) doSplit();
    }
  });

  if (D.themeBtn) D.themeBtn.addEventListener('click', toggleTheme);

  // Expose to window for onclick handlers
  window.downloadResult = downloadResult;
  window.resetTool      = resetTool;
});

/* ── ANIMATED BACKGROUND CANVAS ─────────────────────────────────── */
function initBgCanvas() {
  const canvas = document.getElementById('bgCanvas');
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
      r: 1 + Math.random() * 2.5,
      vx: (Math.random() - .5) * .3,
      vy: (Math.random() - .5) * .3,
      a: .15 + Math.random() * .35,
    };
  }

  resize();
  window.addEventListener('resize', resize);
  particles = Array.from({length: 60}, mkParticle);

  const DARK_COLOR  = 'rgba(99,102,241,';
  const LIGHT_COLOR = 'rgba(99,102,241,';

  let raf;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const c = isLight ? 'rgba(99,102,241,' : 'rgba(99,102,241,';

    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < -20) p.x = W + 10;
      if (p.x > W + 20) p.x = -10;
      if (p.y < -20) p.y = H + 10;
      if (p.y > H + 20) p.y = -10;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = c + p.a + ')';
      ctx.fill();
    });

    // Draw faint connecting lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 100) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = c + (.08 * (1 - dist / 100)) + ')';
          ctx.lineWidth = .5;
          ctx.stroke();
        }
      }
    }
    raf = requestAnimationFrame(draw);
  }
  draw();
}

/* ── DROP / FILE ────────────────────────────────────────────────── */
function initDrop() {
  const { dropZone, fileInput, browseBtn } = D;
  if (!dropZone) return;

  // Click anywhere on drop zone
  dropZone.addEventListener('click', (e) => {
    if (e.target === browseBtn || browseBtn?.contains(e.target)) return;
    fileInput.click();
  });
  if (browseBtn) browseBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });

  fileInput.addEventListener('change', e => {
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

  if (D.fileRemoveBtn) D.fileRemoveBtn.addEventListener('click', e => { e.stopPropagation(); resetTool(); });
}

/* ── LOAD FILE ──────────────────────────────────────────────────── */
async function loadFile(file) {
  if (!file.name.match(/\.pdf$/i) && file.type !== 'application/pdf') {
    showToast('Please upload a PDF file (.pdf only)', 'error');
    S('error'); return;
  }
  // NO file size limit — accept any size

  FILE        = file;
  TOTAL_PAGES = 0;
  BOOKMARKS   = [];
  BLANK_COUNT = 0;
  PAGE_SEL    = new Set();
  RESULT_BLOB = null;
  RESULT_NAME = '';

  S('add');

  // Update file chips (innerHTML preserves icons)
  D.fileName.textContent  = file.name;
  D.fileSize.innerHTML    = `<i class="fa fa-hdd"></i> ${fmtBytes(file.size)}`;
  D.filePages.innerHTML   = `<i class="fa fa-file-alt"></i> —`;
  D.statBookmarks.classList.add('sp-chip-hidden');
  D.statScanned?.classList.add('sp-chip-hidden');

  // Reset thumbs
  D.thumbsLoading.hidden = false;
  D.thumbsStrip.innerHTML = '';
  D.thumbsStrip.appendChild(D.thumbsLoading);
  D.thumbsCount.textContent = '';

  // Show/hide sections
  D.uploadCard.hidden      = true;
  D.fileCard.hidden        = false;
  D.modesCard.hidden       = false;
  D.advCard.hidden         = false;
  D.actionSection.hidden   = false;
  D.optsCard.hidden        = false;
  D.resultsCard.hidden     = true;
  D.progressCard.hidden    = true;

  if (D.recommendBanner) D.recommendBanner.hidden = true;

  // Set default mode to "all" and show it
  SELECTED_MODE = 'all';
  D.modesGrid?.querySelectorAll('.sp-mode-card').forEach(c => {
    const isAll = c.dataset.mode === 'all';
    c.classList.toggle('active', isAll);
    c.setAttribute('aria-checked', isAll ? 'true' : 'false');
  });
  showModeOptions('all');
  updateSplitBtn();

  // Animate cards in
  if (typeof gsap !== 'undefined') {
    gsap.from(D.fileCard,      { y: 22, duration: .4, ease: 'power2.out' });
    gsap.from(D.modesCard,     { y: 22, duration: .4, delay: .06, ease: 'power2.out' });
    gsap.from(D.optsCard,      { y: 22, duration: .4, delay: .11, ease: 'power2.out' });
    gsap.from(D.actionSection, { y: 18, duration: .4, delay: .15, ease: 'power2.out' });
  }

  await fetchPdfInfo();
  loadThumbs();
}

/* ── FETCH PDF INFO ─────────────────────────────────────────────── */
async function fetchPdfInfo() {
  if (!FILE) return;
  try {
    const fd = new FormData();
    fd.append('file', FILE);
    if (D.pdfPassword?.value) fd.append('password', D.pdfPassword.value);

    const resp = await fetch('/api/split-pdf/info', { method: 'POST', body: fd });
    if (!resp.ok) return;
    const info = await resp.json();
    if (!info.success) return;

    TOTAL_PAGES = info.total_pages || 0;
    BLANK_COUNT = info.blank_pages || 0;
    BOOKMARKS   = (info.bookmarks || []).map(b => Array.isArray(b) ? {title:b[0], page:b[1]} : b);

    D.filePages.innerHTML = `<i class="fa fa-file-alt"></i> ${
      TOTAL_PAGES ? `${TOTAL_PAGES} page${TOTAL_PAGES !== 1 ? 's' : ''}` : '—'
    }`;

    if (BOOKMARKS.length) {
      D.statBookmarks.innerHTML = `<i class="fa fa-bookmark"></i> ${BOOKMARKS.length} chapter${BOOKMARKS.length !== 1 ? 's' : ''}`;
      D.statBookmarks.classList.remove('sp-chip-hidden');
    }
    if (info.is_scanned) {
      D.statScanned?.classList.remove('sp-chip-hidden');
    }

    if (TOTAL_PAGES) {
      buildPageGrid();
      updateModeBadges();
      updateSplitPreview();
      updateChunksPreview();
      renderBookmarksList();
      updateBlankInfo();
    }

    updateSplitBtn();

    // Auto-detect smart recommendation (non-blocking)
    callAutoDetect();

  } catch(e) {
    console.warn('fetchPdfInfo failed:', e);
  }
}

/* ── AUTO DETECT ────────────────────────────────────────────────── */
async function callAutoDetect() {
  if (!FILE || !D.recommendBanner) return;
  try {
    const fd = new FormData();
    fd.append('file', FILE);
    if (D.pdfPassword?.value) fd.append('password', D.pdfPassword.value);

    const resp = await fetch('/api/split-pdf/auto-detect', { method: 'POST', body: fd });
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data.success) return;

    const mode = data.recommended_mode;
    const reason = data.reason || '';
    const conf = Math.round((data.confidence || 0) * 100);

    if (D.recText) {
      D.recText.innerHTML = `<strong>${modeName(mode)}</strong> — ${reason} <em style="color:var(--accent);font-size:.72rem">${conf}% match</em>`;
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
      D.recCloseBtn.onclick = () => {
        D.recommendBanner.hidden = true;
      };
    }

    if ((data.confidence || 0) >= 0.75 && mode !== SELECTED_MODE) {
      D.recommendBanner.hidden = false;
      if (typeof gsap !== 'undefined') {
        gsap.from(D.recommendBanner, { y: -10, duration: .3, ease: 'power2.out' });
      }
    }
  } catch(_) {}
}

function applyMode(mode) {
  SELECTED_MODE = mode;
  D.modesGrid?.querySelectorAll('.sp-mode-card').forEach(c => {
    c.classList.toggle('active', c.dataset.mode === mode);
    c.setAttribute('aria-checked', c.dataset.mode === mode ? 'true' : 'false');
  });
  showModeOptions(mode);
  updateSplitPreview();
  updateSplitBtn();
}

function modeName(m) {
  const MAP = {
    all:'All Pages', range:'Page Range', every_n:'Every N Pages',
    bookmarks:'By Bookmarks', blank_pages:'Blank Separator',
    size_limit:'By File Size', odd_even:'Odd / Even', range_groups:'Range Groups',
  };
  return MAP[m] || m;
}

/* ── MODE BADGES ────────────────────────────────────────────────── */
function updateModeBadges() {
  if (!TOTAL_PAGES) return;
  const n  = Math.max(1, parseInt(D.everyNInput?.value || 5));
  const bk = BOOKMARKS.length;
  const sel = PAGE_SEL.size;

  const badges = {
    'all':         `→ ${TOTAL_PAGES} files`,
    'range':       sel ? `→ 1 file, ${sel}pg` : '',
    'every_n':     `→ ${Math.ceil(TOTAL_PAGES / n)} files`,
    'bookmarks':   bk ? `→ ${bk} files` : '',
    'blank_pages': BLANK_COUNT >= 2 ? `→ ~${BLANK_COUNT + 1} files` : '',
    'size_limit':  '',
    'odd_even':    '→ 2 files',
    'range_groups': (() => {
      if (!TOTAL_PAGES) return '';
      const groups = (D.rangeGroupsInput?.value || '').split(',').map(s=>s.trim()).filter(Boolean);
      return groups.length ? `→ ${groups.length} file${groups.length>1?'s':''}` : '';
    })(),
  };

  Object.entries(badges).forEach(([mode, label]) => {
    const id = `mcount-${mode.replace(/_/g,'-')}`;
    const el = document.getElementById(id);
    if (el) el.textContent = label;
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
      data: new Uint8Array(buf),
      password: D.pdfPassword?.value || ''
    }).promise;

    D.thumbsLoading.hidden = true;
    const total = pdf.numPages;
    const MAX_THUMB = 20;
    const count = Math.min(total, MAX_THUMB);
    D.thumbsCount.textContent = total > MAX_THUMB ? `${count} of ${total}` : `${total}`;

    if (!TOTAL_PAGES) {
      TOTAL_PAGES = total;
      D.filePages.innerHTML = `<i class="fa fa-file-alt"></i> ${total} page${total !== 1 ? 's' : ''}`;
      buildPageGrid(); updateModeBadges(); updateSplitPreview(); updateChunksPreview();
    }

    for (let i = 1; i <= count; i++) {
      await renderThumb(pdf, i);
    }

    if (total > MAX_THUMB) {
      const more = document.createElement('div');
      more.className = 'sp-thumb-more';
      more.innerHTML = `<i class="fa fa-ellipsis-h"></i><span>+${total - MAX_THUMB}</span>`;
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
    const vp     = page.getViewport({ scale: 0.25 });
    const canvas = document.createElement('canvas');
    canvas.width  = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

    const wrap = document.createElement('div');
    wrap.className = 'sp-thumb';
    wrap.dataset.page = pageNum;
    wrap.setAttribute('role', 'listitem');
    wrap.setAttribute('aria-label', `Page ${pageNum}`);
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

    D.thumbsStrip.appendChild(wrap);
  } catch(e) { console.warn(`Thumb p${pageNum}:`, e); }
}

/* ── PAGE GRID ──────────────────────────────────────────────────── */
function buildPageGrid() {
  if (!D.pgrid || !TOTAL_PAGES) return;
  D.pgrid.innerHTML = '';
  const CAP  = 250;
  const show = Math.min(TOTAL_PAGES, CAP);

  for (let i = 0; i < show; i++) {
    const cell = document.createElement('div');
    cell.className = 'sp-pg-cell' + (PAGE_SEL.has(i) ? ' selected' : '');
    cell.textContent = i + 1;
    cell.dataset.idx = i;
    cell.addEventListener('click', e => onCellClick(e, i));
    D.pgrid.appendChild(cell);
  }

  if (TOTAL_PAGES > CAP) {
    const ov = document.createElement('div');
    ov.className = 'sp-pg-overflow';
    ov.innerHTML = `<i class="fa fa-info-circle"></i> ${TOTAL_PAGES - CAP} more pages — use the range field above`;
    D.pgrid.after(ov);
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
    t.classList.toggle('pg-selected', PAGE_SEL.has(parseInt(t.dataset.page) - 1));
  });
  if (D.pgridSel) {
    const n = PAGE_SEL.size;
    D.pgridSel.textContent = n ? `${n} page${n !== 1 ? 's' : ''} selected` : 'None selected';
    D.pgridSel.className   = 'sp-pgrid-sel-count' + (n ? ' has-sel' : '');
  }
}

function syncInputFromGrid() {
  if (!D.rangeInput) return;
  if (!PAGE_SEL.size) { D.rangeInput.value = ''; updateRangePreview(); return; }
  const sorted = Array.from(PAGE_SEL).sort((a,b)=>a-b);
  const segs = []; let s = sorted[0], e2 = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === e2 + 1) { e2 = sorted[i]; continue; }
    segs.push(s === e2 ? String(s+1) : `${s+1}-${e2+1}`);
    if (i < sorted.length) { s = sorted[i]; e2 = sorted[i]; }
  }
  D.rangeInput.value = segs.join(', ');
  updateRangePreview();
}

function updateRangeFromInput() {
  if (!D.rangeInput || !TOTAL_PAGES) return;
  PAGE_SEL = new Set(parseRangeStr(D.rangeInput.value, TOTAL_PAGES));
  syncGridFromSel(); updateRangePreview();
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
  const groups = [];
  let gs = sorted[0], ge = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === ge+1) { ge = sorted[i]; continue; }
    groups.push(gs === ge ? `${gs+1}` : `${gs+1}–${ge+1}`);
    if (i < sorted.length) { gs = sorted[i]; ge = sorted[i]; }
  }
  const shown = groups.slice(0, 10);
  let html = shown.map(g => `<span class="sp-range-chip">${g}</span>`).join('');
  if (groups.length > 10) html += `<span class="sp-range-chip sp-range-chip-more">+${groups.length-10}</span>`;
  html += `<span class="sp-range-count">${pages.length} page${pages.length !== 1 ? 's' : ''}</span>`;
  el.innerHTML = html;
}

function updateRangeGroupsPreview() {
  const el = D.rangeGroupsPreview; if (!el) return;
  const val = (D.rangeGroupsInput?.value || '').trim();
  if (!val) {
    el.innerHTML = '<span class="sp-rp-hint">Enter ranges above — each comma-separated group becomes its own PDF file</span>';
    return;
  }
  if (!TOTAL_PAGES) {
    el.innerHTML = '<span class="sp-rp-hint">Upload a PDF first to validate ranges</span>';
    return;
  }
  const tokens = val.split(',').map(s => s.trim()).filter(Boolean);
  if (!tokens.length) {
    el.innerHTML = '<span class="sp-rp-hint">Enter ranges separated by commas</span>';
    return;
  }
  let html = '';
  let valid = 0, invalid = 0;
  tokens.forEach((tok, i) => {
    const pages = parseRangeStr(tok, TOTAL_PAGES);
    if (!pages.length) {
      html += `<span class="sp-range-chip" style="background:rgba(239,68,68,.18);color:#ef4444" title="Invalid range">File ${i+1}: <em>${tok}</em> ✗</span>`;
      invalid++;
    } else {
      html += `<span class="sp-range-chip" title="${pages.length} page${pages.length!==1?'s':''}">File ${i+1}: <strong>${tok}</strong> (${pages.length}pp)</span>`;
      valid++;
    }
  });
  html += `<span class="sp-range-count">${valid} file${valid!==1?'s':''}${invalid?' · '+invalid+' invalid':''}</span>`;
  el.innerHTML = html;
}

/* ── MODES ──────────────────────────────────────────────────────── */
function initModes() {
  if (!D.modesGrid) return;
  D.modesGrid.querySelectorAll('.sp-mode-card').forEach(card => {
    card.addEventListener('click', () => {
      const mode = card.dataset.mode; if (!mode) return;
      SELECTED_MODE = mode;
      D.modesGrid.querySelectorAll('.sp-mode-card').forEach(c => {
        c.classList.toggle('active', c.dataset.mode === mode);
        c.setAttribute('aria-checked', c.dataset.mode === mode ? 'true' : 'false');
      });
      showModeOptions(mode);
      updateSplitPreview();
      updateSplitBtn();
      updateModeBadges();
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
    });
  });
}

function showModeOptions(mode) {
  if (!D.optsCard) return;
  D.optsCard.querySelectorAll('[data-mode-opt]').forEach(el => el.hidden = true);

  const MAP = {
    all:         [],
    range:       ['opt-range','opt-qs-bar','opt-pgrid','opt-split-preview'],
    every_n:     ['opt-every-n','opt-split-preview'],
    bookmarks:   ['opt-bookmarks'],
    blank_pages: ['opt-blank-info'],
    size_limit:  ['opt-size','opt-split-preview'],
    odd_even:    ['opt-odd-even-info'],
    range_groups:['opt-range-groups'],
  };

  const opts = MAP[mode] || [];
  D.optsCard.hidden = opts.length === 0;

  opts.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  });

  // Quick-select for range
  document.querySelectorAll('.sp-qs-btn').forEach(btn => {
    btn.onclick = () => handleQS(btn.dataset.qs);
  });
  if (D.rangeInput) {
    D.rangeInput.oninput = () => { updateRangeFromInput(); };
  }

  if (D.rangeGroupsInput) {
    D.rangeGroupsInput.oninput = () => {
      updateRangeGroupsPreview();
      updateModeBadges();
      updateSplitBtn();
    };
  }

  if (mode === 'bookmarks') renderBookmarksList();
  if (mode === 'blank_pages') updateBlankInfo();
  updateSplitPreview();
  updateChunksPreview();
}

function handleQS(type) {
  if (!TOTAL_PAGES) return;
  const n = parseInt(document.getElementById('qsN')?.value || 5);
  PAGE_SEL = new Set();
  if (type === 'all')   for(let i=0;i<TOTAL_PAGES;i++) PAGE_SEL.add(i);
  if (type === 'none')  PAGE_SEL = new Set();
  if (type === 'odd')   for(let i=0;i<TOTAL_PAGES;i+=2) PAGE_SEL.add(i);
  if (type === 'even')  for(let i=1;i<TOTAL_PAGES;i+=2) PAGE_SEL.add(i);
  if (type === 'first') PAGE_SEL.add(0);
  if (type === 'last')  PAGE_SEL.add(TOTAL_PAGES - 1);
  if (type === 'firstN') for(let i=0;i<Math.min(n,TOTAL_PAGES);i++) PAGE_SEL.add(i);
  syncGridFromSel(); syncInputFromGrid();
  updateSplitPreview(); updateModeBadges(); updateSplitBtn();
}

/* ── EVERY N ────────────────────────────────────────────────────── */
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
  const chunks = Math.ceil(TOTAL_PAGES / n);
  D.chunksPreview.innerHTML = `<i class="fa fa-layer-group"></i> ${TOTAL_PAGES} pages → <strong>${chunks} file${chunks!==1?'s':''}</strong>`;
}

/* ── SIZE SLIDER ─────────────────────────────────────────────────── */
function initSizeSlider() {
  const sl = D.sizeSlider; if (!sl) return;
  sl.addEventListener('input', () => {
    if (D.sizeVal) D.sizeVal.textContent = sl.value;
    updateSplitPreview();
  });
}

/* ── SPLIT PREVIEW ──────────────────────────────────────────────── */
function updateSplitPreview() {
  const el = D.splitPreview; if (!el || !TOTAL_PAGES) return;
  const n = Math.max(1, parseInt(D.everyNInput?.value||5));

  if (SELECTED_MODE === 'range') {
    const cnt = PAGE_SEL.size;
    el.innerHTML = cnt
      ? `<i class="fa fa-cut"></i> Extracting <strong>${cnt} page${cnt!==1?'s':''}</strong> → 1 file`
      : `<i class="fa fa-info-circle"></i> Select pages to extract`;
  } else if (SELECTED_MODE === 'every_n') {
    const chunks = Math.ceil(TOTAL_PAGES / n);
    el.innerHTML = `<i class="fa fa-layer-group"></i> <strong>${TOTAL_PAGES} pages</strong> → <strong>${chunks} file${chunks!==1?'s':''}</strong> of ${n} pages each`;
  } else if (SELECTED_MODE === 'size_limit') {
    const mb = D.sizeSlider?.value || 5;
    el.innerHTML = `<i class="fa fa-compress-arrows-alt"></i> Each part will be ≤ <strong>${mb} MB</strong>`;
  } else {
    el.innerHTML = '';
  }
}

/* ── BLANK INFO ──────────────────────────────────────────────────── */
function updateBlankInfo() {
  const el = D.blankInfoText; if (!el) return;
  if (BLANK_COUNT >= 2) {
    el.textContent = `Found ${BLANK_COUNT} blank page${BLANK_COUNT!==1?'s':''} — they will be used as split points, creating ~${BLANK_COUNT+1} output files.`;
  } else if (BLANK_COUNT === 1) {
    el.textContent = `Found 1 blank page — it will be used as a split point.`;
  } else {
    el.textContent = `No blank pages detected yet. This mode splits at visually blank pages automatically.`;
  }
}

/* ── BOOKMARKS LIST ──────────────────────────────────────────────── */
function renderBookmarksList() {
  const el = D.bookmarksList; if (!el) return;
  if (!BOOKMARKS.length) {
    el.innerHTML = '<div class="sp-bk-empty"><i class="fa fa-info-circle"></i> No bookmarks found — will fall back to Every 5 Pages.</div>';
    return;
  }
  el.innerHTML = BOOKMARKS.slice(0, 40).map((bk, i) =>
    `<div class="sp-bookmark-item">
       <i class="fa fa-bookmark"></i>
       <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${bk.title || `Chapter ${i+1}`}</span>
       <span style="font-size:.66rem;color:var(--text3);flex-shrink:0">pg ${bk.page}</span>
     </div>`
  ).join('') + (BOOKMARKS.length > 40 ? `<div class="sp-bk-empty">+${BOOKMARKS.length-40} more chapters</div>` : '');
}

/* ── ADVANCED ────────────────────────────────────────────────────── */
function initAdvanced() {
  const { advToggle, advBody, advArrow } = D;
  if (!advToggle) return;
  advToggle.addEventListener('click', () => {
    const open = !advBody.hidden;
    advBody.hidden = open;
    advToggle.setAttribute('aria-expanded', !open);
    advArrow.classList.toggle('open', !open);
    S(open ? 'collapse' : 'expand');
  });
}

/* ── UPDATE SPLIT BUTTON ─────────────────────────────────────────── */
function updateSplitBtn() {
  if (!D.splitBtn) return;
  let canSplit = !!FILE;

  if (SELECTED_MODE === 'range') {
    canSplit = canSplit && PAGE_SEL.size > 0;
  } else if (SELECTED_MODE === 'range_groups') {
    const groups = (D.rangeGroupsInput?.value || '').split(',').map(s=>s.trim()).filter(Boolean);
    canSplit = canSplit && groups.length > 0;
  }

  D.splitBtn.disabled = !canSplit;

  // Update badge
  if (D.splitBtnBadge && TOTAL_PAGES) {
    const n = Math.max(1, parseInt(D.everyNInput?.value||5));
    const map = {
      all:         `${TOTAL_PAGES} files`,
      range:       PAGE_SEL.size ? `${PAGE_SEL.size} pages` : '',
      every_n:     `${Math.ceil(TOTAL_PAGES/n)} files`,
      bookmarks:   BOOKMARKS.length ? `${BOOKMARKS.length} files` : '',
      blank_pages: BLANK_COUNT >= 2 ? `~${BLANK_COUNT+1} files` : '',
      size_limit:  '',
      odd_even:    '2 files',
      range_groups: (() => {
        const groups = (D.rangeGroupsInput?.value || '').split(',').map(s=>s.trim()).filter(Boolean);
        return groups.length ? `${groups.length} file${groups.length>1?'s':''}` : '';
      })(),
    };
    D.splitBtnBadge.textContent = map[SELECTED_MODE] || '';
  }

  // Mode sub line
  if (D.modeSubLine) {
    D.modeSubLine.textContent = TOTAL_PAGES
      ? `${TOTAL_PAGES} pages loaded — ${modeName(SELECTED_MODE)} mode selected`
      : 'Pick how you want to split your PDF';
  }
}

/* ── SPLIT ──────────────────────────────────────────────────────── */
async function doSplit() {
  if (!FILE || D.splitBtn?.disabled) return;

  S('start');

  // Switch to progress view
  D.actionSection.hidden  = true;
  D.optsCard.hidden       = true;
  D.modesCard.hidden      = true;
  D.advCard.hidden        = true;
  D.progressCard.hidden   = false;
  D.resultsCard.hidden    = true;

  setProgress(0, 'Preparing…', 'Reading your PDF');
  addStep('active', 'fa-file-pdf', 'Reading PDF structure');

  // Build form data
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

  if (D.pdfPassword?.value)  fd.append('password', D.pdfPassword.value);
  if (D.removeBlanks?.checked) fd.append('remove_blanks', 'true');
  if (D.namingPattern?.value) fd.append('naming_pattern', D.namingPattern.value);

  // Create job_id for SSE
  const jobId = 'sp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  fd.append('job_id', jobId);

  // Start SSE progress listener
  startSSE(jobId);

  // Simulate local progress milestones
  setProgress(12, `Splitting PDF…`, `Mode: ${modeName(SELECTED_MODE)}`);
  addStep('done', 'fa-check', 'PDF structure read');
  addStep('active', 'fa-cut', `Splitting (${modeName(SELECTED_MODE)} mode)`);

  startSimProgress(15, 88, 5000);

  try {
    const resp = await fetch('/api/split-pdf', { method: 'POST', body: fd });

    closeSSE();
    clearSimProgress();

    if (!resp.ok) {
      let msg = `Server error (${resp.status})`;
      try { const j = await resp.json(); msg = j.error || msg; } catch(_) {}
      throw new Error(msg);
    }

    setProgress(95, 'Building ZIP…', 'Packaging split files');
    addStep('done', 'fa-check', 'Splitting complete');
    addStep('active', 'fa-file-archive', 'Building ZIP archive');

    // Read response headers
    const fileCount   = parseInt(resp.headers.get('X-File-Count') || '0');
    const totalPages  = parseInt(resp.headers.get('X-Total-Pages') || TOTAL_PAGES);
    const skipped     = parseInt(resp.headers.get('X-Skipped-Blanks') || '0');
    const zipSizeKB   = parseFloat(resp.headers.get('X-Zip-Size-KB') || '0');
    const dlName      = resp.headers.get('X-Download-Name') || '';

    RESULT_BLOB = await resp.blob();

    // Build download name from original file
    const stem = FILE.name.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_\-. ]/g, '_').trim() || 'document';
    RESULT_NAME = dlName || `${stem}_split.zip`;

    setProgress(100, 'Split Complete! ✓', '');
    addStep('done', 'fa-check', 'ZIP ready');

    setTimeout(() => showResults(fileCount, totalPages, skipped, zipSizeKB), 500);

  } catch(e) {
    closeSSE(); clearSimProgress();
    S('error');
    console.error('Split error:', e);
    showError(`Split failed: ${e.message}`);
    resetToToolView();
  }
}

/* ── SPLIT BUTTON CLICK ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('splitBtn')?.addEventListener('click', doSplit);
});

/* ── SSE PROGRESS ────────────────────────────────────────────────── */
function startSSE(jobId) {
  try {
    _sseSource = new EventSource(`/api/progress/${jobId}`);
    _sseSource.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        if (d.pct !== undefined) {
          setProgress(Math.max(12, Math.min(94, d.pct)), d.msg || '', d.detail || '');
        }
      } catch(_) {}
    };
    _sseSource.onerror = () => closeSSE();
  } catch(_) {}
}

function closeSSE() {
  if (_sseSource) { try { _sseSource.close(); } catch(_) {} _sseSource = null; }
}

/* ── SIMULATED PROGRESS ──────────────────────────────────────────── */
function startSimProgress(from, to, ms) {
  clearSimProgress();
  const steps = 60;
  const interval = ms / steps;
  let step = 0;
  _simTimer = setInterval(() => {
    step++;
    const pct = Math.round(from + (to - from) * (step / steps));
    if (D.progressFill) D.progressFill.style.width = pct + '%';
    if (D.progressPct)  D.progressPct.textContent  = pct + '%';
    if (step >= steps) clearSimProgress();
  }, interval);
}

function clearSimProgress() {
  if (_simTimer) { clearInterval(_simTimer); _simTimer = null; }
}

/* ── PROGRESS UI ─────────────────────────────────────────────────── */
function setProgress(pct, title, sub) {
  if (D.progressFill) D.progressFill.style.width = pct + '%';
  if (D.progressPct)  D.progressPct.textContent  = pct + '%';
  if (title && D.progressTitle) D.progressTitle.textContent = title;
  if (sub !== undefined && D.progressSub) D.progressSub.textContent = sub;
}

function addStep(state, icon, text) {
  if (!D.progressSteps) return;
  // Mark previous active steps as done
  D.progressSteps.querySelectorAll('.sp-prog-step.active').forEach(el => {
    el.classList.remove('active'); el.classList.add('done');
    el.querySelector('i').className = 'fa fa-check-circle';
  });
  const div = document.createElement('div');
  div.className = `sp-prog-step ${state}`;
  const iCls = state === 'done' ? 'fa-check-circle' : state === 'active' ? 'fa-circle-notch fa-spin' : icon;
  div.innerHTML = `<i class="fa ${iCls}"></i><span>${text}</span>`;
  D.progressSteps.appendChild(div);
  D.progressSteps.scrollTop = D.progressSteps.scrollHeight;
}

/* ── SHOW RESULTS ────────────────────────────────────────────────── */
function showResults(fileCount, totalPages, skipped, zipSizeKB) {
  S('success');
  launchConfetti();

  // Mark all steps done
  D.progressSteps?.querySelectorAll('.sp-prog-step.active').forEach(el => {
    el.classList.remove('active'); el.classList.add('done');
    el.querySelector('i').className = 'fa fa-check-circle';
  });

  // Fill result stats
  if (D.resFileCount)   D.resFileCount.textContent   = fileCount || '—';
  if (D.resTotalPages)  D.resTotalPages.textContent  = totalPages || TOTAL_PAGES || '—';
  if (D.resZipSize)     D.resZipSize.textContent      = zipSizeKB ? fmtKB(zipSizeKB) : '—';
  if (D.resultSummary)  D.resultSummary.textContent   = `${fileCount} PDF file${fileCount!==1?'s':''} created from ${FILE?.name || 'your PDF'}`;

  if (skipped > 0) {
    if (D.resSkipped)     D.resSkipped.textContent = skipped;
    if (D.resSkippedWrap) D.resSkippedWrap.classList.remove('sp-res-stat-hidden');
  } else {
    if (D.resSkippedWrap) D.resSkippedWrap.classList.add('sp-res-stat-hidden');
  }

  // Switch cards
  D.progressCard.hidden = true;
  D.resultsCard.hidden  = false;

  // Animate
  if (typeof gsap !== 'undefined') {
    gsap.from(D.resultsCard, { y: 24, duration: .45, ease: 'back.out(1.2)' });
  }

  // Scroll to results
  D.resultsCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ── DOWNLOAD ────────────────────────────────────────────────────── */
function downloadResult() {
  if (!RESULT_BLOB) return;
  S('download');   // plays fahhhhh.mp3
  const url = URL.createObjectURL(RESULT_BLOB);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = RESULT_NAME;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 2000);
  showToast(`Downloading ${RESULT_NAME}`, 'success');
}

/* ── RESET ───────────────────────────────────────────────────────── */
function resetTool() {
  S('remove');
  FILE = null; TOTAL_PAGES = 0; BOOKMARKS = []; BLANK_COUNT = 0;
  PAGE_SEL = new Set(); RESULT_BLOB = null; RESULT_NAME = '';
  SELECTED_MODE = 'all'; _shiftStart = -1;
  closeSSE(); clearSimProgress();

  // Reset UI
  D.uploadCard.hidden      = false;
  D.fileCard.hidden        = true;
  D.modesCard.hidden       = true;
  D.optsCard.hidden        = true;
  D.advCard.hidden         = true;
  D.actionSection.hidden   = true;
  D.progressCard.hidden    = true;
  D.resultsCard.hidden     = true;
  if (D.recommendBanner) D.recommendBanner.hidden = true;

  if (D.fileInput) D.fileInput.value = '';
  if (D.rangeInput) D.rangeInput.value = '';
  if (D.rangeGroupsInput) D.rangeGroupsInput.value = '';
  if (D.rangeGroupsPreview) D.rangeGroupsPreview.innerHTML = '<span class="sp-rp-hint">Enter ranges above — each comma-separated group becomes its own PDF file</span>';
  if (D.progressSteps) D.progressSteps.innerHTML = '';

  // Animate back
  if (typeof gsap !== 'undefined') {
    gsap.from(D.uploadCard, { y: 20, duration: .38, ease: 'power2.out' });
  }
}

function resetToToolView() {
  // Go back to split config view without full reset
  D.progressCard.hidden   = true;
  D.modesCard.hidden      = false;
  D.optsCard.hidden       = (SELECTED_MODE === 'all' || SELECTED_MODE === 'odd_even' || !SELECTED_MODE);
  D.advCard.hidden        = false;
  D.actionSection.hidden  = false;
  if (D.progressSteps) D.progressSteps.innerHTML = '';
}

/* ── CONFETTI ────────────────────────────────────────────────────── */
function launchConfetti() {
  if (typeof confetti === 'function') {
    confetti({ particleCount: 100, spread: 72, origin: { y: 0.5 },
      colors: ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ec4899'] });
    setTimeout(() => confetti({ particleCount: 60, spread: 55, origin: { y: 0.5, x: 0.2 },
      colors: ['#6366f1','#8b5cf6'] }), 300);
    return;
  }
  // CSS confetti fallback
  const colors = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444'];
  for (let i = 0; i < 32; i++) {
    const p = document.createElement('div');
    p.className = 'sp-conf-p';
    p.style.cssText = `left:${10+Math.random()*80}%;background:${colors[i%colors.length]};
      animation-delay:${Math.random()*.6}s;animation-duration:${1.2+Math.random()*1}s;
      width:${6+Math.random()*5}px;height:${6+Math.random()*5}px`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 2500);
  }
}

/* ── FAQ ─────────────────────────────────────────────────────────── */
function initFAQ() {
  const list = D.faqList; if (!list) return;
  list.querySelectorAll('.sp-faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item   = btn.closest('.sp-faq-item');
      const answer = item.querySelector('.sp-faq-a');
      const isOpen = item.classList.contains('open');
      list.querySelectorAll('.sp-faq-item.open').forEach(el => {
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

/* ── GSAP ─────────────────────────────────────────────────────────── */
function initGSAP() {
  if (typeof gsap === 'undefined') return;
  gsap.from('.sp-tool-header', { y: -16, duration: .55, ease: 'power3.out' });
  gsap.from('.sp-upload-card', { y: 28, duration: .55, delay: .1, ease: 'power3.out' });
  gsap.from('.sp-feature-pills', { y: 12, opacity: 0, duration: .5, delay: .18, ease: 'power2.out' });

  // Animate sections as they enter viewport (ScrollTrigger not loaded — use IO)
  const sectionIO = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        gsap.to(e.target, { y: 0, opacity: 1, duration: .55, ease: 'power2.out' });
        sectionIO.unobserve(e.target);
      }
    });
  }, { threshold: .12 });

  document.querySelectorAll('.sp-showcase-card, .sp-step, .sp-faq-item, .sp-stat-card').forEach(el => {
    gsap.set(el, { y: 18 });
    sectionIO.observe(el);
  });
}

/* ── THEME ───────────────────────────────────────────────────────── */
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
  if (!D?.themeBtn) return;
  D.themeBtn.innerHTML = theme === 'dark'
    ? '<i class="fa fa-moon"></i>'
    : '<i class="fa fa-sun"></i>';
}

/* ── SHOW ERROR ──────────────────────────────────────────────────── */
function showError(msg) {
  showToast(msg, 'error');
  // Show recovery hint
  const hints = {
    'password': 'Try entering your PDF password in Advanced Options.',
    'encrypted': 'Open Advanced Options and enter your PDF password.',
    'no valid pages': 'Check your page range — pages must be between 1 and ' + (TOTAL_PAGES || '?') + '.',
    'corrupted': 'Your PDF may be damaged. Try using the PDF Repair tool first.',
    'cannot open': 'The file may be corrupted. Try PDF Repair at ishutools.fun.',
    'no pages': 'The PDF appears to be empty — no pages found.',
    'server error (413)': 'The file is too large. Try compressing it first.',
    'server error (500)': 'Server issue. Please try again in a moment.',
    'server error (503)': 'Service temporarily unavailable. Please retry shortly.',
    'failed to fetch': 'Network error. Check your internet connection and retry.',
  };
  const lower = msg.toLowerCase();
  for (const [key, hint] of Object.entries(hints)) {
    if (lower.includes(key)) {
      setTimeout(() => showToast('Tip: ' + hint, 'warn'), 800);
      break;
    }
  }
}

/* ── STATS COUNTER ANIMATION ─────────────────────────────────────── */
function initStatsCounters() {
  const observed = new Set();
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting || observed.has(entry.target)) return;
      observed.add(entry.target);
      const el = entry.target;
      const target = parseInt(el.dataset.count || '0');
      if (!target) return;
      let current = 0;
      const steps = 40;
      const delay = 18;
      const tick = () => {
        current = Math.min(target, current + Math.ceil((target - current) / 8 + 1));
        el.textContent = current + (el.dataset.suffix || '');
        if (current < target) setTimeout(tick, delay);
      };
      setTimeout(tick, 100);
    });
  }, { threshold: .5 });

  document.querySelectorAll('.sp-stat-num[data-count]').forEach(el => io.observe(el));
}

/* ── TOAST ───────────────────────────────────────────────────────── */
function showToast(msg, type = 'info') {
  const icons = { info:'info-circle', success:'check-circle', error:'times-circle', warn:'exclamation-triangle' };
  const t = document.createElement('div');
  t.className = `sp-toast sp-toast-${type}`;
  t.innerHTML = `<i class="fa fa-${icons[type]||'info-circle'}"></i><span>${msg}</span>`;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('sp-toast-in'));
  setTimeout(() => {
    t.classList.remove('sp-toast-in'); t.classList.add('sp-toast-out');
    setTimeout(() => t.remove(), 350);
  }, 3800);
}

/* ── RANGE PARSER ────────────────────────────────────────────────── */
function parseRangeStr(str, total) {
  if (!str || !total) return [];
  const s = str.trim().toLowerCase();
  if (s === 'all') return Array.from({length:total}, (_,i)=>i);
  if (s === 'odd') return Array.from({length:total}, (_,i)=>i).filter(i=>i%2===0);
  if (s === 'even') return Array.from({length:total}, (_,i)=>i).filter(i=>i%2===1);

  const pages = new Set();
  s.split(/[,;，；]+/).forEach(part => {
    part = part.trim();
    if (!part) return;
    const range = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (range) {
      const lo = Math.max(0, parseInt(range[1])-1);
      const hi = Math.min(total-1, parseInt(range[2])-1);
      for (let i = lo; i <= hi; i++) pages.add(i);
    } else if (/^\d+$/.test(part)) {
      const idx = parseInt(part)-1;
      if (idx >= 0 && idx < total) pages.add(idx);
    }
  });
  return Array.from(pages).sort((a,b)=>a-b);
}

/* ── UTILITIES ───────────────────────────────────────────────────── */
function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes/1048576).toFixed(1) + ' MB';
  return (bytes/1073741824).toFixed(2) + ' GB';
}
function fmtKB(kb) {
  const n = parseFloat(kb) || 0;
  if (n < 1024) return n.toFixed(1) + ' KB';
  return (n/1024).toFixed(2) + ' MB';
}
