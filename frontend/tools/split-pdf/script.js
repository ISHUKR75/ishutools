/**
 * split-pdf/script.js  v11.0 — IshuTools.fun
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 *
 * Memory constraints:
 *  - [hidden]{display:none!important} in CSS
 *  - All DOM refs in DOMContentLoaded
 *  - sounds.js as regular <script> (not defer)
 *  - <base href="/tools/split-pdf/"> in HTML
 *  - Never opacity:0 in IO/scroll reveal
 *  - Never background-clip:text on FA icons
 *  - Never color-mix() CSS
 */
'use strict';

/* ── Sound helper ─────────────────────────────────────────────────── */
function S(key) {
  try {
    if (window.SOUNDS && typeof window.SOUNDS[key] === 'function') window.SOUNDS[key]();
  } catch (_) {}
}

/* ── State ──────────────────────────────────────────────────────────── */
var FILE          = null;
var PDF_INFO      = null;
var MODE          = 'all';
var PAGE_SEL      = new Set();
var _BLOB_URL     = null;
var _ZIP_FILENAME = 'document_split.zip';
var _shiftStart   = null;
var _splitStart   = 0;
var _sseSource    = null;
var _simTimer     = null;
var _recMode      = null;
var _simPct       = 0;

/* ── DOM refs (populated in DOMContentLoaded) ───────────────────────── */
var D = null;

/* ══════════════════════════════════════════════════════════════════
   BACKGROUND CANVAS
══════════════════════════════════════════════════════════════════ */
function initBgCanvas() {
  var c = document.getElementById('bgCanvas');
  if (!c) return;
  var ctx = c.getContext('2d');
  var W, H, pts = [];

  function resize() {
    W = c.width  = window.innerWidth;
    H = c.height = window.innerHeight;
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  var N = Math.min(55, Math.floor(W / 22));
  for (var i = 0; i < N; i++) {
    pts.push({
      x:  Math.random() * W,
      y:  Math.random() * H,
      vx: (Math.random() - .5) * .28,
      vy: (Math.random() - .5) * .28,
      r:  1.1 + Math.random() * 1.8,
      hue: Math.floor(Math.random() * 4)
    });
  }
  var COLS = ['rgba(99,102,241,.45)','rgba(139,92,246,.45)','rgba(6,182,212,.35)','rgba(16,185,129,.3)'];

  function draw() {
    ctx.clearRect(0, 0, W, H);
    pts.forEach(function(p) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = COLS[p.hue];
      ctx.fill();
    });
    for (var i = 0; i < pts.length; i++) {
      for (var j = i + 1; j < pts.length; j++) {
        var dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        var d  = Math.sqrt(dx*dx + dy*dy);
        if (d < 120) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = 'rgba(99,102,241,' + (0.055 * (1 - d/120)).toFixed(3) + ')';
          ctx.lineWidth = .7;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

/* ══════════════════════════════════════════════════════════════════
   THEME & SOUND
══════════════════════════════════════════════════════════════════ */
function initTheme() {
  var stored = localStorage.getItem('ishu-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', stored);
  updateThemeIcon(stored);
}
function updateThemeIcon(theme) {
  if (!D || !D.themeIcon) return;
  D.themeIcon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
}
function toggleTheme() {
  var cur  = document.documentElement.getAttribute('data-theme') || 'dark';
  var next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ishu-theme', next);
  updateThemeIcon(next);
}

function initSoundToggle() { updateSoundBtn(); }
function updateSoundBtn() {
  if (!D || !D.soundIcon) return;
  var on = !window.SOUNDS || window.SOUNDS.isEnabled();
  D.soundIcon.className = on ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
  D.soundBtn.classList.toggle('muted', !on);
}
function toggleSound() {
  if (window.SOUNDS) window.SOUNDS.toggle();
  updateSoundBtn();
  toast(window.SOUNDS && window.SOUNDS.isEnabled() ? 'Sound on' : 'Sound off', 'info', 1600);
}

/* ══════════════════════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════════════════════ */
function showEl(el) { if (el) el.removeAttribute('hidden'); }
function hideEl(el) { if (el) el.setAttribute('hidden', ''); }
function togEl(el, show) { show ? showEl(el) : hideEl(el); }

function fmtBytes(b) {
  if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
  if (b >= 1048576)    return (b / 1048576).toFixed(1) + ' MB';
  if (b >= 1024)       return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}

function stemName(fn) {
  if (!fn) return 'document';
  return fn.replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 55) || 'document';
}

function toast(msg, type, dur) {
  type = type || 'info'; dur = dur || 3500;
  var c = document.getElementById('toastContainer');
  if (!c) return;
  var icons = { success:'fa-circle-check', error:'fa-circle-xmark', warning:'fa-triangle-exclamation', info:'fa-circle-info' };
  var el = document.createElement('div');
  el.className = 'sp-toast ' + type;
  el.innerHTML = '<i class="fa-solid ' + (icons[type] || icons.info) + '"></i><span>' + msg + '</span>';
  c.appendChild(el);
  setTimeout(function() {
    el.classList.add('exiting');
    setTimeout(function() { el.remove(); }, 360);
  }, dur);
}

/* ══════════════════════════════════════════════════════════════════
   PROGRESS
══════════════════════════════════════════════════════════════════ */
function updateProgress(pct, msg) {
  var p = Math.max(0, Math.min(100, Math.round(pct)));
  _simPct = p;
  if (!D || !D.progressBar) return;
  D.progressBar.style.width = p + '%';
  D.progressBar.setAttribute('aria-valuenow', p);
  if (D.progressPct) D.progressPct.textContent = p + '%';
  var circle = document.getElementById('progressCircle');
  if (circle) circle.style.strokeDashoffset = String((106.8 * (1 - p / 100)).toFixed(2));
  if (msg && D.progressSub) D.progressSub.textContent = msg;
  if (D.progressTitle) {
    if (p < 20)      D.progressTitle.textContent = 'Starting…';
    else if (p < 50) D.progressTitle.textContent = 'Splitting pages…';
    else if (p < 85) D.progressTitle.textContent = 'Processing pages…';
    else if (p < 98) D.progressTitle.textContent = 'Packing ZIP…';
    else             D.progressTitle.textContent = 'Almost done!';
  }
}

function addProgressStep(icon, text) {
  if (!D.progressSteps) return;
  var div = document.createElement('div');
  div.className = 'sp-progress-step';
  div.innerHTML = '<i class="fa-solid ' + icon + '"></i><span>' + text + '</span>';
  D.progressSteps.appendChild(div);
}

function simProgress(target, msPerPct) {
  target    = target    || 88;
  msPerPct  = msPerPct  || 115;
  _simTimer = setInterval(function() {
    var cur = _simPct;
    if (cur >= target) { clearInterval(_simTimer); _simTimer = null; return; }
    updateProgress(cur + 1 + Math.random() * 1.3, '');
  }, msPerPct);
}

function closeSSE() {
  if (_sseSource) { try { _sseSource.close(); } catch (_) {} _sseSource = null; }
  if (_simTimer)  { clearInterval(_simTimer); _simTimer = null; }
}

/* ══════════════════════════════════════════════════════════════════
   UPLOAD & FILE HANDLING
══════════════════════════════════════════════════════════════════ */
function initUpload() {
  D.dropZone.addEventListener('click', function(e) {
    if (!e.target.closest('#browseBtn')) D.fileInput.click();
  });
  D.dropZone.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); D.fileInput.click(); }
  });
  D.browseBtn.addEventListener('click', function(e) { e.stopPropagation(); D.fileInput.click(); });
  D.fileInput.addEventListener('change', function(e) {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  });
  D.dropZone.addEventListener('dragover',  function(e) { e.preventDefault(); D.dropZone.classList.add('drag-over'); S('playDragStartSound'); });
  D.dropZone.addEventListener('dragleave', function(e) { if (!D.dropZone.contains(e.relatedTarget)) D.dropZone.classList.remove('drag-over'); });
  D.dropZone.addEventListener('drop',      function(e) {
    e.preventDefault(); D.dropZone.classList.remove('drag-over');
    S('playDragDropSound');
    var f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') handleFile(f);
    else if (f) { S('playErrorSound'); toast('Please drop a PDF file.', 'warning'); }
  });
  D.removeBtn.addEventListener('click', resetAll);
}

function handleFile(file) {
  FILE = file; PDF_INFO = null; PAGE_SEL.clear(); _shiftStart = null;
  _ZIP_FILENAME = stemName(file.name) + '_split.zip';

  S('playFileAddSound');

  hideEl(D.dropZone);
  showEl(D.fileInfoWrap);
  D.fileName.textContent = file.name;
  D.chipSize.innerHTML   = '<i class="fa-solid fa-weight-hanging"></i> ' + fmtBytes(file.size);
  D.chipPages.innerHTML  = '<i class="fa-solid fa-spinner fa-spin"></i> Loading…';
  ['chipBookmarks','chipBlanks','chipEncrypted','chipScanned'].forEach(function(k) {
    D[k].classList.add('sp-chip-hidden');
  });

  showEl(D.modesCard);
  showEl(D.optionsCard);
  showEl(D.advCard);
  showEl(D.actionCard);
  showEl(D.fabBtn);
  D.splitBtn.disabled = false;

  selectMode(MODE);
  updateActionHint();

  loadPdfInfo(file);
  loadThumbnails(file);
  autoDetectMode(file);
  setTimeout(updateSplitPreview, 300);
}

function loadPdfInfo(file) {
  var fd = new FormData();
  fd.append('file', file);
  var pw = D.passwordInput ? D.passwordInput.value : '';
  if (pw) fd.append('password', pw);

  fetch('/api/split-pdf/info', { method:'POST', body:fd })
    .then(function(r) { return r.json(); })
    .then(function(info) {
      PDF_INFO = info;
      if (!info.success && info.error) {
        D.chipPages.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Error';
        toast('PDF info: ' + info.error, 'warning');
        return;
      }
      D.chipPages.innerHTML = '<i class="fa-solid fa-file-lines"></i> ' + (info.total_pages || '?') + ' pages';

      if (info.has_bookmarks && info.bookmarks && info.bookmarks.length) {
        D.chipBookmarks.classList.remove('sp-chip-hidden');
        D.chipBookmarks.innerHTML = '<i class="fa-solid fa-bookmark"></i> ' + info.bookmarks.length + ' bookmarks';
        updateBookmarkList(info.bookmarks);
      }
      if (info.blank_pages > 0) {
        D.chipBlanks.classList.remove('sp-chip-hidden');
        D.chipBlanks.innerHTML = '<i class="fa-regular fa-file"></i> ' + info.blank_pages + ' blank';
        if (D.blankCountInfo) D.blankCountInfo.textContent = 'Detected ' + info.blank_pages + ' blank page(s).';
      }
      if (info.is_encrypted) D.chipEncrypted.classList.remove('sp-chip-hidden');
      if (info.is_scanned)   D.chipScanned.classList.remove('sp-chip-hidden');

      updateModeBadges();
      updatePresetVisibility();
      showEl(D.presetsRow);
      if (MODE === 'range')   buildPageGrid();
      if (MODE === 'every_n') updateChunkInfo();
      updateSplitPreview();
    })
    .catch(function() {
      D.chipPages.innerHTML = '<i class="fa-solid fa-file-lines"></i> ? pages';
      toast('Could not read PDF info — you can still split.', 'warning');
    });
}

function loadThumbnails(file) {
  var fd = new FormData();
  fd.append('file', file);
  fd.append('count', '16');
  var pw = D.passwordInput ? D.passwordInput.value : '';
  if (pw) fd.append('password', pw);

  /* Show loading skeleton */
  D.thumbsStrip.innerHTML = '';
  for (var s = 0; s < 6; s++) {
    var sk = document.createElement('div');
    sk.className = 'sp-thumb sp-thumb-skeleton';
    D.thumbsStrip.appendChild(sk);
  }
  showEl(D.thumbsWrap);
  if (D.thumbsCount) D.thumbsCount.textContent = 'Loading previews…';

  fetch('/api/split-pdf/thumbnails', { method:'POST', body:fd })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.thumbnails || !data.thumbnails.length) {
        hideEl(D.thumbsWrap);
        return;
      }
      D.thumbsStrip.innerHTML = '';
      data.thumbnails.forEach(function(item, i) {
        /* item is {page:'thumb_NNNN.jpg', data:'data:image/jpeg;base64,...'} */
        var imgSrc = (typeof item === 'string') ? item : (item.data || '');
        if (!imgSrc) return;
        var div = document.createElement('div');
        div.className = 'sp-thumb';
        div.setAttribute('role', 'listitem');
        div.dataset.page = String(i);
        div.innerHTML = '<img src="' + imgSrc + '" alt="Page ' + (i+1) + '" loading="lazy" decoding="async">'
          + '<div class="sp-thumb-sel"><i class="fa-solid fa-check"></i></div>'
          + '<div class="sp-thumb-num">' + (i+1) + '</div>';
        div.addEventListener('click', function() { thumbClick(i); });
        D.thumbsStrip.appendChild(div);
      });
      var total = PDF_INFO ? PDF_INFO.total_pages : data.thumbnails.length;
      if (D.thumbsCount) D.thumbsCount.textContent = data.thumbnails.length + ' of ' + total + ' shown · click to select';
      showEl(D.thumbsWrap);
    })
    .catch(function() { hideEl(D.thumbsWrap); });
}

function autoDetectMode(file) {
  var fd = new FormData();
  fd.append('file', file);

  fetch('/api/split-pdf/auto-detect', { method:'POST', body:fd })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.recommended_mode) return;
      _recMode = data.recommended_mode;
      D.recommendText.textContent = data.reason || ('Recommended: ' + data.recommended_mode);
      showEl(D.recommendBanner);
    })
    .catch(function() {});
}

function thumbClick(idx) {
  if (MODE !== 'range') {
    selectMode('range');
    PAGE_SEL.clear(); PAGE_SEL.add(idx);
    syncInputFromPageGrid(); updatePgridDisplay();
    return;
  }
  if (PAGE_SEL.has(idx)) PAGE_SEL.delete(idx); else PAGE_SEL.add(idx);
  syncInputFromPageGrid(); updateThumbSelections();
}

function updateThumbSelections() {
  if (!D.thumbsStrip) return;
  D.thumbsStrip.querySelectorAll('.sp-thumb').forEach(function(th) {
    th.classList.toggle('pg-selected', PAGE_SEL.has(parseInt(th.dataset.page)));
  });
}

/* ══════════════════════════════════════════════════════════════════
   MODE SELECTION
══════════════════════════════════════════════════════════════════ */
var MODE_DESC = {
  all:          'Burst every page into its own PDF file — perfect for archiving individual pages.',
  range:        'Extract specific pages into a single PDF. Use ranges like 1-5, 8, 12-end.',
  range_groups: 'Each range becomes a separate PDF file in one operation. Exclusive to IshuTools.',
  every_n:      'Split into equal chunks of N pages each. Ideal for batches or chapters.',
  bookmarks:    'One PDF per bookmark/chapter — perfect for textbooks, reports, and eBooks.',
  blank_pages:  'Auto-detect blank separator pages and split between them. Zero quality loss.',
  size_limit:   'Split to fit within a maximum file size. Each output PDF stays under your limit.',
  odd_even:     'Two files: odd pages (1,3,5…) and even pages (2,4,6…). Perfect for duplex scanning.',
};

function selectMode(mode) {
  MODE = mode; _shiftStart = null;
  D.modesGrid.querySelectorAll('.sp-mode-card').forEach(function(c) {
    var active = c.dataset.mode === mode;
    c.classList.toggle('active', active);
    c.setAttribute('aria-checked', String(active));
  });
  if (D.modeDesc) D.modeDesc.textContent = MODE_DESC[mode] || '';

  ['all','range','range_groups','every_n','bookmarks','blank_pages','size_limit','odd_even'].forEach(function(m) {
    var el = document.getElementById('opts-' + m);
    if (el) togEl(el, m === mode);
  });

  if (mode === 'range')     buildPageGrid();
  if (mode === 'every_n')   updateChunkInfo();
  if (mode === 'bookmarks') updateBookmarkList(PDF_INFO && PDF_INFO.bookmarks || []);
  updateSplitPreview(); updateActionHint();
}

function initModeCards() {
  D.modesGrid.querySelectorAll('.sp-mode-card').forEach(function(card) {
    card.addEventListener('click', function() {
      if (window.SOUNDS) window.SOUNDS.resume();
      selectMode(card.dataset.mode);
      S('playToggleOnSound');
    });
    card.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMode(card.dataset.mode); }
    });
  });
}

function updateModeBadges() {
  if (!PDF_INFO) return;
  var total = PDF_INFO.total_pages || 1;
  var badges = {
    all:          total + ' files',
    range:        'extract',
    range_groups: 'multi-output',
    every_n:      Math.ceil(total / 5) + ' files',
    bookmarks:    PDF_INFO.has_bookmarks ? (PDF_INFO.bookmarks||[]).length + ' chapters' : 'no bookmarks',
    blank_pages:  PDF_INFO.blank_pages > 0 ? PDF_INFO.blank_pages + ' blanks' : 'auto-detect',
    size_limit:   'fit in MB',
    odd_even:     '2 files',
  };
  Object.keys(badges).forEach(function(m) {
    var el = document.getElementById('badge-' + m);
    if (el && !el.querySelector('.sp-exclusive')) el.textContent = badges[m];
  });
}

/* ══════════════════════════════════════════════════════════════════
   PRESETS
══════════════════════════════════════════════════════════════════ */
var PRESETS = {
  chapters:  { mode:'bookmarks' },
  halves:    { mode:'every_n', n:'half' },
  thirds:    { mode:'every_n', n:'third' },
  firstlast: { mode:'range_groups', ranges:'1\nLAST' },
  every5:    { mode:'every_n', n:5 },
  burst:     { mode:'all' },
};

function applyPreset(key) {
  var p = PRESETS[key]; if (!p) return;
  D.presetsRow.querySelectorAll('.sp-preset-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.preset === key);
  });
  selectMode(p.mode);

  if (p.mode === 'every_n' && p.n !== undefined) {
    var total = PDF_INFO ? PDF_INFO.total_pages : 10;
    var n = p.n;
    if (n === 'half')  n = Math.max(1, Math.ceil(total / 2));
    if (n === 'third') n = Math.max(1, Math.ceil(total / 3));
    D.nInput.value  = n;
    D.nSlider.value = Math.min(50, n);
    updateChunkInfo();
  }
  if (p.mode === 'range_groups' && p.ranges) {
    var total2 = PDF_INFO ? PDF_INFO.total_pages : 1;
    D.rangeGroupsInput.value = p.ranges.replace('LAST', String(total2));
    updateGroupsPreview();
  }

  S('playPresetSound');
  updateSplitPreview();
  toast('Preset applied', 'success', 1800);
}

function updatePresetVisibility() {
  if (!PDF_INFO) return;
  var hasBm = PDF_INFO.has_bookmarks && (PDF_INFO.bookmarks||[]).length >= 2;
  D.presetsRow.querySelectorAll('[data-preset="chapters"]').forEach(function(b) {
    b.style.display = hasBm ? '' : 'none';
  });
}

/* ══════════════════════════════════════════════════════════════════
   PAGE GRID (range mode)
══════════════════════════════════════════════════════════════════ */
function buildPageGrid() {
  if (!D.pgrid) return;
  D.pgrid.innerHTML = '';
  var total = PDF_INFO ? PDF_INFO.total_pages : 1;

  if (total > 600) {
    D.pgrid.innerHTML = '<div class="sp-pg-overflow">Page grid not shown for documents &gt; 600 pages. Use the range input above.</div>';
    return;
  }
  var frag = document.createDocumentFragment();
  for (var i = 0; i < total; i++) {
    (function(idx) {
      var cell = document.createElement('div');
      cell.className = 'sp-pg-cell' + (PAGE_SEL.has(idx) ? ' selected' : '');
      cell.textContent = idx + 1;
      cell.dataset.idx = String(idx);
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('aria-selected', String(PAGE_SEL.has(idx)));
      cell.addEventListener('click', function(e) { pgCellClick(idx, e.shiftKey); });
      cell.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pgCellClick(idx, e.shiftKey); }
      });
      frag.appendChild(cell);
    })(i);
  }
  D.pgrid.appendChild(frag);
  updatePgridSelCount();
}

function pgCellClick(idx, shift) {
  if (shift && _shiftStart !== null) {
    var lo = Math.min(_shiftStart, idx), hi = Math.max(_shiftStart, idx);
    for (var i = lo; i <= hi; i++) PAGE_SEL.add(i);
  } else {
    if (PAGE_SEL.has(idx)) PAGE_SEL.delete(idx); else PAGE_SEL.add(idx);
    _shiftStart = idx;
  }
  syncInputFromPageGrid(); updatePgridDisplay(); S('playSortSound');
}

function updatePgridDisplay() {
  if (!D.pgrid) return;
  D.pgrid.querySelectorAll('.sp-pg-cell').forEach(function(cell) {
    var idx = parseInt(cell.dataset.idx), sel = PAGE_SEL.has(idx);
    cell.classList.toggle('selected', sel);
    cell.setAttribute('aria-selected', String(sel));
  });
  updatePgridSelCount(); updateThumbSelections();
}

function updatePgridSelCount() {
  if (!D.pgridSelCount) return;
  var total = PDF_INFO ? PDF_INFO.total_pages : 0;
  D.pgridSelCount.textContent = PAGE_SEL.size > 0
    ? PAGE_SEL.size + ' of ' + total + ' pages selected'
    : 'Click pages to select (Shift+click for range)';
}

function syncInputFromPageGrid() {
  if (!D.rangeInput) return;
  if (PAGE_SEL.size === 0) {
    D.rangeInput.value = ''; D.rangeInput.classList.remove('valid','invalid');
  } else {
    var sorted = Array.from(PAGE_SEL).sort(function(a,b){return a-b;});
    var parts = [], start = sorted[0], end = sorted[0];
    for (var i = 1; i <= sorted.length; i++) {
      if (i < sorted.length && sorted[i] === end + 1) { end = sorted[i]; }
      else {
        parts.push(start === end ? String(start+1) : (start+1)+'-'+(end+1));
        if (i < sorted.length) { start = end = sorted[i]; }
      }
    }
    D.rangeInput.value = parts.join(',');
    D.rangeInput.classList.add('valid'); D.rangeInput.classList.remove('invalid');
  }
  updateRangePreview(); updateSplitPreview();
}

function syncPageGridFromInput() {
  if (!D.rangeInput) return;
  var val = D.rangeInput.value, total = PDF_INFO ? PDF_INFO.total_pages : 0;
  PAGE_SEL.clear();
  if (!val.trim()) {
    D.rangeInput.classList.remove('valid','invalid');
  } else {
    var cl = val.toLowerCase().trim();
    if (cl === 'all')  { for (var i=0;i<total;i++) PAGE_SEL.add(i); }
    else if (cl === 'odd')  { for (var i=0;i<total;i+=2) PAGE_SEL.add(i); }
    else if (cl === 'even') { for (var i=1;i<total;i+=2) PAGE_SEL.add(i); }
    else {
      var mF = cl.match(/^first\s+(\d+)/), mL = cl.match(/^last\s+(\d+)/);
      if (mF) { for (var i=0;i<Math.min(+mF[1],total);i++) PAGE_SEL.add(i); }
      else if (mL) { var n=+mL[1]; for (var i=Math.max(0,total-n);i<total;i++) PAGE_SEL.add(i); }
      else {
        cl.split(/[,;，；]+/).forEach(function(part) {
          part = part.trim().replace(/\bend\b/,''+total);
          var rm = part.match(/^(\d+)\s*[-–—~]\s*(\d+)$/);
          if (rm) { for (var i=+rm[1]-1;i<=+rm[2]-1;i++) { if(i>=0&&i<total) PAGE_SEL.add(i); } }
          else if (/^\d+$/.test(part)) { var idx=+part-1; if(idx>=0&&idx<total) PAGE_SEL.add(idx); }
        });
      }
    }
    D.rangeInput.classList.toggle('valid',   PAGE_SEL.size > 0);
    D.rangeInput.classList.toggle('invalid', PAGE_SEL.size === 0);
  }
  updatePgridDisplay(); updateRangePreview(); updateSplitPreview();
}

function updateRangePreview() {
  if (!D.rangePreview) return;
  var total = PDF_INFO ? PDF_INFO.total_pages : 0;
  var val   = (D.rangeInput.value || '').trim();
  if (!val) {
    D.rangePreview.innerHTML = '<span class="sp-rp-hint">Type a range to preview</span>';
    return;
  }
  if (PAGE_SEL.size === 0) {
    D.rangePreview.innerHTML = '<span class="sp-rp-invalid"><i class="fa-solid fa-triangle-exclamation"></i> No valid pages (PDF has ' + total + ' pages)</span>';
    return;
  }
  if (PAGE_SEL.size > 80) {
    D.rangePreview.innerHTML = '<span class="sp-rp-warn"><i class="fa-solid fa-circle-info"></i> ' + PAGE_SEL.size + ' pages selected</span>';
    return;
  }
  D.rangePreview.innerHTML = Array.from(PAGE_SEL).sort(function(a,b){return a-b;}).map(function(i) {
    return '<span class="sp-rp-chip">' + (i+1) + '</span>';
  }).join('');
}

/* ══════════════════════════════════════════════════════════════════
   HELPERS — chunk / groups / bookmarks
══════════════════════════════════════════════════════════════════ */
function updateChunkInfo() {
  if (!D.chunkCount) return;
  var total = PDF_INFO ? PDF_INFO.total_pages : 1;
  var n = Math.max(1, parseInt(D.nInput.value) || 1);
  var cnt = Math.ceil(total / n);
  D.chunkCount.textContent = String(cnt);
  D.chunkCount.style.color = cnt > 100 ? 'var(--yellow)' : 'var(--accent)';
}

function updateGroupsPreview() {
  if (!D.groupsPreview) return;
  var lines = (D.rangeGroupsInput.value || '').split(/[\n,，;；]+/).map(function(l){return l.trim();}).filter(Boolean);
  D.groupsPreview.innerHTML = lines.map(function(l, i) {
    var hue = (i * 47) % 360;
    return '<span class="sp-rp-chip" style="border-color:hsla(' + hue + ',60%,60%,.3);color:hsl(' + hue + ',60%,65%)">' + (i+1) + ': ' + l + '</span>';
  }).join('');
}

function updateBookmarkList(bookmarks) {
  if (!D.bookmarkList || !D.bookmarksInfoText) return;
  if (!bookmarks || !bookmarks.length) {
    D.bookmarksInfoText.textContent = 'No bookmarks found — will fallback to 5-page chunks.';
    D.bookmarkList.innerHTML = ''; return;
  }
  D.bookmarksInfoText.textContent = bookmarks.length + ' chapters found — each becomes its own PDF.';
  D.bookmarkList.innerHTML = bookmarks.slice(0, 40).map(function(bk, i) {
    var title = bk[0] || ('Chapter ' + (i+1)), page = (bk[1] || 0) + 1;
    return '<div class="sp-bk-item"><i class="fa-solid fa-bookmark"></i><span>' + (i+1) + '. ' + title + '</span><span style="margin-left:auto;font-size:.68rem;color:var(--text3)">pg ' + page + '</span></div>';
  }).join('');
}

/* ══════════════════════════════════════════════════════════════════
   SPLIT PREVIEW ESTIMATE
══════════════════════════════════════════════════════════════════ */
function updateSplitPreview() {
  if (!PDF_INFO || !D.splitPreviewBox) return;
  var total = PDF_INFO.total_pages || 1, est = '—';
  if (MODE === 'all')          est = total + ' files';
  else if (MODE === 'range')   est = PAGE_SEL.size > 0 ? '1 file (' + PAGE_SEL.size + ' pages)' : 'Select pages';
  else if (MODE === 'range_groups') {
    var lines = (D.rangeGroupsInput.value || '').split(/[\n,，;；]+/).filter(function(l){return l.trim();});
    est = lines.length + ' file' + (lines.length !== 1 ? 's' : '');
  }
  else if (MODE === 'every_n') { var n = Math.max(1, parseInt(D.nInput.value)||1); est = Math.ceil(total/n) + ' files'; }
  else if (MODE === 'bookmarks') est = PDF_INFO.has_bookmarks ? (PDF_INFO.bookmarks||[]).length + ' files' : 'No bookmarks';
  else if (MODE === 'blank_pages') est = PDF_INFO.blank_pages > 0 ? '~' + (PDF_INFO.blank_pages+1) + ' files' : '1+ files';
  else if (MODE === 'size_limit')  est = '~' + Math.max(2, Math.ceil(total / Math.max(1, parseInt(D.sizeSlider.value)||5))) + ' files (estimate)';
  else if (MODE === 'odd_even')    est = '2 files (odd + even)';
  D.splitPreviewText.textContent = 'Will create: ' + est;
  showEl(D.splitPreviewBox);
}

function updateActionHint() {
  if (!D.actionHint) return;
  if (!FILE) { D.actionHint.textContent = 'Upload a PDF to get started'; return; }
  var hints = {
    all:'Every page → own PDF → ZIP', range:'Selected pages → 1 PDF → ZIP',
    range_groups:'Each group → own PDF → ZIP', every_n:'Equal chunks → multiple PDFs → ZIP',
    bookmarks:'Each chapter → own PDF → ZIP', blank_pages:'Splits at blank pages → ZIP',
    size_limit:'Grouped by size → ZIP', odd_even:'Odd pages + Even pages → 2 PDFs → ZIP',
  };
  D.actionHint.textContent = hints[MODE] || 'Press Ctrl+Enter to split';
}

/* ══════════════════════════════════════════════════════════════════
   QUICK SELECT
══════════════════════════════════════════════════════════════════ */
function initQsButtons() {
  document.querySelectorAll('.sp-qs-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var qs = btn.dataset.qs, total = PDF_INFO ? PDF_INFO.total_pages : 1;
      PAGE_SEL.clear();
      if (qs === 'all')    for (var i=0;i<total;i++) PAGE_SEL.add(i);
      if (qs === 'odd')    for (var i=0;i<total;i+=2) PAGE_SEL.add(i);
      if (qs === 'even')   for (var i=1;i<total;i+=2) PAGE_SEL.add(i);
      if (qs === 'first5') for (var i=0;i<Math.min(5,total);i++) PAGE_SEL.add(i);
      if (qs === 'last5')  for (var i=Math.max(0,total-5);i<total;i++) PAGE_SEL.add(i);
      syncInputFromPageGrid(); updatePgridDisplay(); S('playSortSound');
    });
  });
}

/* ══════════════════════════════════════════════════════════════════
   ADVANCED OPTIONS
══════════════════════════════════════════════════════════════════ */
function initAdvOptions() {
  D.advToggle.addEventListener('click', function() {
    var open = !D.advBody.hasAttribute('hidden');
    if (open) {
      hideEl(D.advBody); D.advChevron.classList.remove('open');
      D.advToggle.setAttribute('aria-expanded','false'); S('playCollapseSound');
    } else {
      showEl(D.advBody); D.advChevron.classList.add('open');
      D.advToggle.setAttribute('aria-expanded','true'); S('playExpandSound');
    }
  });
}

/* ══════════════════════════════════════════════════════════════════
   FAQ
══════════════════════════════════════════════════════════════════ */
function initFaq() {
  document.querySelectorAll('.sp-faq-q').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var exp = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!exp));
      var ans = btn.nextElementSibling;
      if (exp) hideEl(ans); else showEl(ans);
    });
  });
}

/* ══════════════════════════════════════════════════════════════════
   SLIDERS & SIZE PRESETS
══════════════════════════════════════════════════════════════════ */
function initSizePresets() {
  document.querySelectorAll('.sp-size-preset-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var mb = parseInt(btn.dataset.mb);
      D.sizeSlider.value = Math.min(50, mb);
      D.sizeVal.textContent = mb + ' MB';
      document.querySelectorAll('.sp-size-preset-btn').forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active');
      updateSplitPreview();
    });
  });
  D.sizeSlider.addEventListener('input', function() {
    D.sizeVal.textContent = D.sizeSlider.value + ' MB';
    document.querySelectorAll('.sp-size-preset-btn').forEach(function(b){b.classList.remove('active');});
    updateSplitPreview();
  });
}

function initNSlider() {
  D.nSlider.addEventListener('input', function() {
    D.nInput.value = D.nSlider.value; updateChunkInfo(); updateSplitPreview();
  });
  D.nInput.addEventListener('input', function() {
    var v = Math.max(1, parseInt(D.nInput.value)||1);
    D.nSlider.value = Math.min(50, v); updateChunkInfo(); updateSplitPreview();
  });
}

function initBlankThresh() {
  D.blankThreshSlider.addEventListener('input', function() {
    D.blankThreshVal.textContent = D.blankThreshSlider.value + '%';
  });
}

/* ══════════════════════════════════════════════════════════════════
   RANGE INPUTS
══════════════════════════════════════════════════════════════════ */
function initRangeInput() {
  var debounce = null;
  D.rangeInput.addEventListener('input', function() {
    clearTimeout(debounce);
    debounce = setTimeout(syncPageGridFromInput, 320);
  });
  D.copyRangeBtn.addEventListener('click', function() {
    var val = D.rangeInput.value;
    if (val) {
      navigator.clipboard.writeText(val)
        .then(function(){ toast('Range copied!', 'success', 1500); S('playCopySound'); })
        .catch(function(){});
    }
  });
}

function initRangeGroupsInput() {
  var debounce = null;
  D.rangeGroupsInput.addEventListener('input', function() {
    clearTimeout(debounce);
    debounce = setTimeout(function(){ updateGroupsPreview(); updateSplitPreview(); }, 300);
  });
}

/* ══════════════════════════════════════════════════════════════════
   AI RECOMMENDATION
══════════════════════════════════════════════════════════════════ */
function initRecommendation() {
  D.recApplyBtn.addEventListener('click', function() {
    if (_recMode) {
      selectMode(_recMode); hideEl(D.recommendBanner);
      toast('Applied recommended mode', 'success', 2000); S('playPresetSound');
    }
  });
  D.recDismissBtn.addEventListener('click', function() { hideEl(D.recommendBanner); });
}

/* ══════════════════════════════════════════════════════════════════
   SPLIT ACTION
══════════════════════════════════════════════════════════════════ */
function doSplit() {
  if (!FILE) { toast('Please upload a PDF first.', 'warning'); return; }
  if (D.splitBtn.disabled) return;

  if (MODE === 'range' && PAGE_SEL.size === 0 && !D.rangeInput.value.trim()) {
    S('playWarningSound'); toast('Please select at least one page.', 'warning');
    D.rangeInput.focus(); return;
  }
  if (MODE === 'range_groups' && !D.rangeGroupsInput.value.trim()) {
    S('playWarningSound'); toast('Please enter at least one range group.', 'warning');
    D.rangeGroupsInput.focus(); return;
  }

  if (window.SOUNDS) window.SOUNDS.resume();
  S('playMergeStartSound');
  _splitStart = Date.now();
  _simPct = 0;

  showEl(D.progressCard);
  hideEl(D.resultsCard);
  hideEl(D.actionCard);
  D.progressSteps.innerHTML = '';
  updateProgress(0, 'Preparing…');

  addProgressStep('fa-check', 'Mode: ' + MODE.replace(/_/g,' '));
  if (PDF_INFO) addProgressStep('fa-file', (PDF_INFO.total_pages||'?') + ' pages · ' + fmtBytes(FILE.size));

  simProgress(86, 108);

  var fd = new FormData();
  fd.append('file',            FILE);
  fd.append('mode',            MODE);
  fd.append('password',        D.passwordInput.value || '');
  fd.append('naming_pattern',  D.namingPattern.value || 'page_{n:04d}');
  fd.append('remove_blanks',   D.removeBlanksToggle.checked ? '1' : '0');
  fd.append('source_filename', FILE.name);

  if (MODE === 'range')        fd.append('ranges', D.rangeInput.value || '');
  if (MODE === 'range_groups') {
    var groups = D.rangeGroupsInput.value.split(/[\n,，;；]+/).map(function(l){return l.trim();}).filter(Boolean);
    fd.append('ranges', groups.join(','));
  }
  if (MODE === 'every_n')    fd.append('every_n', D.nInput.value || '5');
  if (MODE === 'size_limit') fd.append('max_size_mb', D.sizeSlider.value || '5');
  if (MODE === 'blank_pages') fd.append('blank_threshold', (parseInt(D.blankThreshSlider.value)/100).toFixed(2));

  fetch('/api/split-pdf', { method:'POST', body:fd })
    .then(function(res) {
      closeSSE();
      if (!res.ok) {
        return res.json().then(function(j){ throw new Error(j.error || j.message || 'Server error'); })
          .catch(function(){ throw new Error('Server error ' + res.status); });
      }
      updateProgress(95, 'Finalising…');
      addProgressStep('fa-file-zipper', 'Packing ZIP…');
      var headers = res;
      return res.blob().then(function(blob) { return { blob:blob, res:headers }; });
    })
    .then(function(obj) {
      var blob = obj.blob, res = obj.res;
      updateProgress(100, 'Done!');
      addProgressStep('fa-circle-check', 'Split complete!');

      var filesCreated = parseInt(res.headers.get('X-File-Count') || res.headers.get('X-Files-Created') || '1');
      var totalPages   = parseInt(res.headers.get('X-Total-Pages') || (PDF_INFO ? PDF_INFO.total_pages : '?'));
      var procMs       = parseInt(res.headers.get('X-Processing-Ms') || '0');
      var qualityGrade = res.headers.get('X-Quality-Grade') || 'A+';
      var qualityScore = res.headers.get('X-Quality-Score') || '100';
      var zipName      = res.headers.get('X-Download-Name') || res.headers.get('X-Zip-Name') || _ZIP_FILENAME;

      if (_BLOB_URL) URL.revokeObjectURL(_BLOB_URL);
      _BLOB_URL = URL.createObjectURL(blob);
      _ZIP_FILENAME = zipName;

      setTimeout(function() {
        hideEl(D.progressCard);
        showEl(D.resultsCard);
        showEl(D.actionCard);
        showResults(filesCreated, totalPages, qualityGrade, qualityScore);
        S('playSuccessChime');
        launchConfetti();
      }, 600);
    })
    .catch(function(e) {
      closeSSE();
      updateProgress(0, '');
      hideEl(D.progressCard);
      showEl(D.actionCard);
      S('playErrorSound');
      toast('Split failed: ' + (e.message || 'Please try again.'), 'error', 5500);
    });
}

function showResults(filesCreated, totalPages, qualityGrade, qualityScore) {
  D.resultsSub.textContent = filesCreated + ' file' + (filesCreated !== 1 ? 's' : '') + ' ready to download';
  D.dlName.textContent = _ZIP_FILENAME;
  D.qualityText.textContent = 'Grade ' + qualityGrade + ' (' + qualityScore + '/100) · Lossless · streams never re-encoded';

  var elapsed = (Math.round((Date.now() - _splitStart) / 100) / 10).toFixed(1);
  D.resultsStats.innerHTML = [
    { icon:'fa-file-pdf',     text: filesCreated + ' file' + (filesCreated!==1?'s':'') + ' created' },
    { icon:'fa-file-lines',   text: totalPages + ' pages' },
    { icon:'fa-clock',        text: elapsed + 's elapsed' },
    { icon:'fa-shield-check', text: 'Grade ' + qualityGrade },
  ].map(function(s) {
    return '<span class="sp-stat-chip" role="listitem"><i class="fa-solid ' + s.icon + '"></i>' + s.text + '</span>';
  }).join('');
}

/* ══════════════════════════════════════════════════════════════════
   DOWNLOAD — fahhhhh.mp3 plays on every download
══════════════════════════════════════════════════════════════════ */
function downloadZip() {
  if (!_BLOB_URL) { toast('Nothing to download.', 'warning'); return; }
  S('playDownloadWhoosh');   /* fahhhhh.mp3 */
  var a = document.createElement('a');
  a.href = _BLOB_URL; a.download = _ZIP_FILENAME;
  document.body.appendChild(a); a.click();
  setTimeout(function(){ a.remove(); }, 120);
  toast('Downloading ' + _ZIP_FILENAME, 'success', 2500);
}

/* ══════════════════════════════════════════════════════════════════
   CONFETTI
══════════════════════════════════════════════════════════════════ */
function launchConfetti() {
  if (typeof confetti === 'function') {
    confetti({ particleCount:130, spread:76, origin:{y:.55}, colors:['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b'] });
    setTimeout(function() {
      confetti({ particleCount:55, spread:50, origin:{y:.60}, colors:['#ec4899','#f97316','#6366f1'] });
    }, 400);
  } else {
    var cols = ['#6366f1','#8b5cf6','#06b6d4','#10b981'];
    for (var i = 0; i < 20; i++) {
      (function(i) {
        var d = document.createElement('div');
        d.style.cssText = 'position:fixed;width:7px;height:7px;border-radius:2px;left:'+(Math.random()*100)+'vw;top:-10px;background:'+cols[i%4]+';animation:confettiFall '+(0.8+Math.random()*1.2)+'s ease-in forwards;z-index:9999;pointer-events:none;';
        document.body.appendChild(d);
        setTimeout(function(){ d.remove(); }, 2200);
      })(i);
    }
  }
}

/* ══════════════════════════════════════════════════════════════════
   RESET
══════════════════════════════════════════════════════════════════ */
function resetAll() {
  FILE = null; PDF_INFO = null; PAGE_SEL.clear(); _shiftStart = null; _recMode = null;
  if (_BLOB_URL) { URL.revokeObjectURL(_BLOB_URL); _BLOB_URL = null; }
  _ZIP_FILENAME = 'document_split.zip';
  closeSSE();

  showEl(D.dropZone); hideEl(D.fileInfoWrap);
  D.fileInput.value = '';
  if (D.thumbsStrip) D.thumbsStrip.innerHTML = '';
  hideEl(D.thumbsWrap); hideEl(D.recommendBanner);
  ['chipBookmarks','chipBlanks','chipEncrypted','chipScanned'].forEach(function(k){
    D[k].classList.add('sp-chip-hidden');
  });

  hideEl(D.modesCard); hideEl(D.optionsCard); hideEl(D.advCard);
  hideEl(D.actionCard); hideEl(D.progressCard); hideEl(D.resultsCard);
  hideEl(D.presetsRow); hideEl(D.fabBtn);
  D.splitBtn.disabled = true;
  D.actionHint.textContent = 'Upload a PDF to get started';

  D.presetsRow.querySelectorAll('.sp-preset-btn').forEach(function(b){b.classList.remove('active');});
  hideEl(D.advBody); D.advChevron.classList.remove('open');
  D.advToggle.setAttribute('aria-expanded','false');
  D.rangeInput.value = ''; D.rangeInput.classList.remove('valid','invalid');
  if (D.rangePreview) D.rangePreview.innerHTML = '';
  D.rangeGroupsInput.value = '';
  if (D.groupsPreview) D.groupsPreview.innerHTML = '';
  hideEl(D.splitPreviewBox);
  MODE = 'all';

  S('playMergeAgainSound');
  toast('Reset complete — upload a new PDF.', 'info', 2000);
}

/* ══════════════════════════════════════════════════════════════════
   MOBILE FAB
══════════════════════════════════════════════════════════════════ */
function initFab() {
  D.fabBtn.addEventListener('click', function() {
    if (window.SOUNDS) window.SOUNDS.resume();
    if (!FILE) { D.fileInput.click(); return; }
    doSplit();
  });
}

/* ══════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════════════════════════════════ */
function initKeyboard() {
  document.addEventListener('keydown', function(e) {
    var tag = document.activeElement ? document.activeElement.tagName : '';
    var inInput = (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT');
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      if (FILE && !D.splitBtn.disabled) { if(window.SOUNDS) window.SOUNDS.resume(); doSplit(); }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'a' && MODE === 'range' && !inInput) {
      e.preventDefault();
      var total = PDF_INFO ? PDF_INFO.total_pages : 0;
      PAGE_SEL.clear(); for (var i=0;i<total;i++) PAGE_SEL.add(i);
      syncInputFromPageGrid(); updatePgridDisplay();
    }
    if (e.key === 'Escape' && D.progressCard && !D.progressCard.hasAttribute('hidden')) {
      /* Allow escape to show action bar if not already showing */
    }
  });
}

/* ══════════════════════════════════════════════════════════════════
   GSAP ENTRANCE ANIMATIONS (if loaded)
══════════════════════════════════════════════════════════════════ */
function initGsapAnimations() {
  if (typeof gsap === 'undefined') return;
  var heroArea = document.querySelector('.sp-hero-area');
  if (heroArea) {
    gsap.from('.sp-hero-badge', { y:12, duration:.5, ease:'power2.out', delay:.1 });
    gsap.from('.sp-hero-h1',    { y:16, duration:.55, ease:'power2.out', delay:.18 });
    gsap.from('.sp-hero-sub',   { y:10, duration:.5, ease:'power2.out', delay:.25 });
    gsap.from('.sp-hero-pills span', { y:8, stagger:.06, duration:.4, ease:'power2.out', delay:.32 });
  }
  gsap.from('.sp-upload-card', { y:18, duration:.55, ease:'power2.out', delay:.4 });
}

/* ══════════════════════════════════════════════════════════════════
   DOMContentLoaded — ALL DOM REFS + WIRING
══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {

  D = {
    dropZone:          document.getElementById('dropZone'),
    browseBtn:         document.getElementById('browseBtn'),
    fileInput:         document.getElementById('fileInput'),
    fileInfoWrap:      document.getElementById('fileInfoWrap'),
    fileName:          document.getElementById('fileName'),
    chipSize:          document.getElementById('chipSize'),
    chipPages:         document.getElementById('chipPages'),
    chipBookmarks:     document.getElementById('chipBookmarks'),
    chipBlanks:        document.getElementById('chipBlanks'),
    chipEncrypted:     document.getElementById('chipEncrypted'),
    chipScanned:       document.getElementById('chipScanned'),
    removeBtn:         document.getElementById('removeBtn'),
    thumbsWrap:        document.getElementById('thumbsWrap'),
    thumbsStrip:       document.getElementById('thumbsStrip'),
    thumbsCount:       document.getElementById('thumbsCount'),
    recommendBanner:   document.getElementById('recommendBanner'),
    recommendText:     document.getElementById('recommendText'),
    recApplyBtn:       document.getElementById('recApplyBtn'),
    recDismissBtn:     document.getElementById('recDismissBtn'),

    modesCard:         document.getElementById('modesCard'),
    modesGrid:         document.getElementById('modesGrid'),
    modeDesc:          document.getElementById('modeDesc'),
    presetsRow:        document.getElementById('presetsRow'),

    optionsCard:       document.getElementById('optionsCard'),
    rangeInput:        document.getElementById('rangeInput'),
    rangePreview:      document.getElementById('rangePreview'),
    copyRangeBtn:      document.getElementById('copyRangeBtn'),
    pgrid:             document.getElementById('pgrid'),
    pgridSelCount:     document.getElementById('pgridSelCount'),
    rangeGroupsInput:  document.getElementById('rangeGroupsInput'),
    groupsPreview:     document.getElementById('groupsPreview'),
    nSlider:           document.getElementById('nSlider'),
    nInput:            document.getElementById('nInput'),
    chunkCount:        document.getElementById('chunkCount'),
    bookmarkList:      document.getElementById('bookmarkList'),
    bookmarksInfoText: document.getElementById('bookmarksInfoText'),
    blankCountInfo:    document.getElementById('blankCountInfo'),
    blankThreshSlider: document.getElementById('blankThreshSlider'),
    blankThreshVal:    document.getElementById('blankThreshVal'),
    sizeSlider:        document.getElementById('sizeSlider'),
    sizeVal:           document.getElementById('sizeVal'),
    splitPreviewBox:   document.getElementById('splitPreviewBox'),
    splitPreviewText:  document.getElementById('splitPreviewText'),

    advCard:           document.getElementById('advCard'),
    advToggle:         document.getElementById('advToggle'),
    advBody:           document.getElementById('advBody'),
    advChevron:        document.getElementById('advChevron'),
    passwordInput:     document.getElementById('passwordInput'),
    namingPattern:     document.getElementById('namingPattern'),
    removeBlanksToggle:document.getElementById('removeBlanksToggle'),

    actionCard:        document.getElementById('actionCard'),
    splitBtn:          document.getElementById('splitBtn'),
    actionHint:        document.getElementById('actionHint'),

    progressCard:      document.getElementById('progressCard'),
    progressBar:       document.getElementById('progressBar'),
    progressPct:       document.getElementById('progressPct'),
    progressTitle:     document.getElementById('progressTitle'),
    progressSub:       document.getElementById('progressSub'),
    progressSteps:     document.getElementById('progressSteps'),

    resultsCard:       document.getElementById('resultsCard'),
    resultsSub:        document.getElementById('resultsSub'),
    resultsStats:      document.getElementById('resultsStats'),
    downloadBtn:       document.getElementById('downloadBtn'),
    dlName:            document.getElementById('dlName'),
    qualityText:       document.getElementById('qualityText'),

    soundBtn:          document.getElementById('soundBtn'),
    soundIcon:         document.getElementById('soundIcon'),
    themeBtn:          document.getElementById('themeBtn'),
    themeIcon:         document.getElementById('themeIcon'),
    fabBtn:            document.getElementById('fabBtn'),
    splitAgainBtn:     document.getElementById('splitAgainBtn'),
  };

  /* Initialise subsystems */
  initTheme();
  initSoundToggle();
  initBgCanvas();
  initUpload();
  initModeCards();
  initFaq();
  initQsButtons();
  initAdvOptions();
  initRangeInput();
  initRangeGroupsInput();
  initNSlider();
  initBlankThresh();
  initSizePresets();
  initRecommendation();
  initFab();
  initKeyboard();

  /* Wire nav buttons */
  D.themeBtn.addEventListener('click', toggleTheme);
  D.soundBtn.addEventListener('click', toggleSound);

  /* Wire split button */
  D.splitBtn.addEventListener('click', function() { if(window.SOUNDS) window.SOUNDS.resume(); doSplit(); });

  /* Wire download button — fahhhhh.mp3 via playDownloadWhoosh */
  D.downloadBtn.addEventListener('click', downloadZip);

  /* Wire split-again button */
  D.splitAgainBtn.addEventListener('click', resetAll);

  /* Wire presets */
  D.presetsRow.querySelectorAll('.sp-preset-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { applyPreset(btn.dataset.preset); });
  });

  /* Add confetti CSS fallback keyframe */
  var sEl = document.createElement('style');
  sEl.textContent = '@keyframes confettiFall{from{transform:translateY(-10px) rotate(0deg);opacity:1}to{transform:translateY(100vh) rotate(720deg);opacity:0}}';
  document.head.appendChild(sEl);

  /* Initial state: tool sections hidden until file loaded */
  selectMode('all');
  hideEl(D.modesCard); hideEl(D.optionsCard); hideEl(D.advCard);
  hideEl(D.actionCard); hideEl(D.splitPreviewBox);

  /* GSAP animations (deferred — may not be loaded yet at DOMContentLoaded) */
  setTimeout(initGsapAnimations, 200);

  /* Preload sounds */
  if (window.SOUNDS && window.SOUNDS.preload) {
    setTimeout(function() { window.SOUNDS.preload(); }, 500);
  }
});
