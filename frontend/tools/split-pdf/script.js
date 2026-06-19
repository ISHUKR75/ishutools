/**
 * split-pdf/script.js  v12.0 — IshuTools.fun
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
 *
 * v12.0 improvements:
 *  - Auto-scroll to results after split
 *  - Animated counters in results stats
 *  - Rich progress steps with icons
 *  - Large-file warning sound (jaldi_waha_sa_hato)
 *  - Content-type chips (scanned/forms/layers)
 *  - Multiple confetti bursts on success
 *  - Better error messages with actionable hints
 *  - Keyboard shortcut (Ctrl+Enter to split)
 *  - File size > 50MB warning toast
 *  - Better toast exit animation
 *  - pg-selected CSS class fix (was .selected)
 *  - sp-bookmark-item (was .sp-bk-item)
 *  - sp-res-stat for results chips (was .sp-stat-chip)
 *  - Ripple effect on split button
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
var _animFrames   = [];   /* v12: store counter animation IDs */

/* ── DOM refs (populated in DOMContentLoaded) ───────────────────────── */
var D = null;

/* ══════════════════════════════════════════════════════════════════
   BACKGROUND CANVAS — animated particle network
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

  var N = Math.min(60, Math.floor(W / 20));
  for (var i = 0; i < N; i++) {
    pts.push({
      x:   Math.random() * W,
      y:   Math.random() * H,
      vx:  (Math.random() - .5) * .3,
      vy:  (Math.random() - .5) * .3,
      r:   1.0 + Math.random() * 2.0,
      hue: Math.floor(Math.random() * 5)
    });
  }
  var COLS = [
    'rgba(99,102,241,.5)', 'rgba(139,92,246,.5)',
    'rgba(6,182,212,.38)', 'rgba(16,185,129,.32)',
    'rgba(236,72,153,.28)'
  ];

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var len = pts.length;
    for (var i = 0; i < len; i++) {
      var p = pts[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = COLS[p.hue];
      ctx.fill();
    }
    for (var i = 0; i < len; i++) {
      for (var j = i + 1; j < len; j++) {
        var dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        var d  = Math.sqrt(dx*dx + dy*dy);
        if (d < 130) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = 'rgba(99,102,241,' + (0.06 * (1 - d/130)).toFixed(3) + ')';
          ctx.lineWidth = .65;
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
  S('playToggleOnSound');
}

function initSoundToggle() { updateSoundBtn(); }
function updateSoundBtn() {
  if (!D || !D.soundIcon) return;
  var on = !window.SOUNDS || window.SOUNDS.isEnabled();
  D.soundIcon.className = on ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
  if (D.soundBtn) D.soundBtn.classList.toggle('muted', !on);
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

/* v12: Ripple effect on button click */
function addRipple(btn, e) {
  try {
    var rect   = btn.getBoundingClientRect();
    var rip    = document.createElement('span');
    var size   = Math.max(rect.width, rect.height) * 2;
    var x      = e.clientX - rect.left - size / 2;
    var y      = e.clientY - rect.top  - size / 2;
    rip.style.cssText = 'position:absolute;width:' + size + 'px;height:' + size + 'px;top:' + y + 'px;left:' + x + 'px;border-radius:50%;background:rgba(255,255,255,.18);pointer-events:none;animation:ripple .6s linear forwards;';
    btn.appendChild(rip);
    setTimeout(function() { rip.remove(); }, 650);
  } catch (_) {}
}

/* v12: animated counter (count from 0 to target) */
function animateCount(el, target, suffix, duration) {
  suffix   = suffix   || '';
  duration = duration || 700;
  var start     = Date.now();
  var startVal  = 0;
  function tick() {
    var progress = Math.min(1, (Date.now() - start) / duration);
    var ease     = 1 - Math.pow(1 - progress, 3);
    var current  = Math.round(startVal + (target - startVal) * ease);
    el.textContent = current + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* v12: smooth scroll to element */
function scrollToEl(el, offset) {
  if (!el) return;
  offset = offset || 80;
  var top = el.getBoundingClientRect().top + window.pageYOffset - offset;
  window.scrollTo({ top: top, behavior: 'smooth' });
}

/* Toast notifications */
function toast(msg, type, dur) {
  type = type || 'info'; dur = dur || 3500;
  var c = document.getElementById('toastContainer');
  if (!c) return;
  var icons = {
    success: 'fa-circle-check',
    error:   'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info:    'fa-circle-info'
  };
  var el = document.createElement('div');
  el.className = 'sp-toast sp-toast-' + type;
  el.innerHTML = '<i class="fa-solid ' + (icons[type] || icons.info) + '"></i><span>' + msg + '</span>';
  c.appendChild(el);
  setTimeout(function() {
    el.classList.add('sp-toast-out');
    setTimeout(function() { if (el.parentNode) el.remove(); }, 360);
  }, dur);
}

/* ══════════════════════════════════════════════════════════════════
   PROGRESS
══════════════════════════════════════════════════════════════════ */
var PROGRESS_TITLES = [
  [0,  'Starting up…'],
  [15, 'Reading PDF…'],
  [30, 'Splitting pages…'],
  [55, 'Applying lossless engine…'],
  [75, 'Processing output…'],
  [90, 'Packing ZIP archive…'],
  [98, 'Almost done!'],
];

function updateProgress(pct, msg) {
  var p = Math.max(0, Math.min(100, Math.round(pct)));
  _simPct = p;
  if (!D || !D.progressBar) return;
  D.progressBar.style.width = p + '%';
  D.progressBar.setAttribute('aria-valuenow', p);
  if (D.progressPct) D.progressPct.textContent = p + '%';

  /* SVG arc fill */
  var circle = document.getElementById('progressCircle');
  if (circle) circle.style.strokeDashoffset = String((106.8 * (1 - p / 100)).toFixed(2));

  /* Subtitle */
  if (msg && D.progressSub) D.progressSub.textContent = msg;

  /* Title from threshold table */
  if (D.progressTitle) {
    var title = PROGRESS_TITLES[0][1];
    for (var i = 0; i < PROGRESS_TITLES.length; i++) {
      if (p >= PROGRESS_TITLES[i][0]) title = PROGRESS_TITLES[i][1];
    }
    D.progressTitle.textContent = title;
  }
}

function addProgressStep(icon, text, status) {
  if (!D.progressSteps) return;
  var div = document.createElement('div');
  var delay = D.progressSteps.children.length * 0.07;
  div.className = 'sp-progress-step' + (status ? ' ' + status : '');
  div.style.animationDelay = delay + 's';
  div.innerHTML = '<i class="fa-solid ' + icon + '"></i><span>' + text + '</span>';
  D.progressSteps.appendChild(div);
  /* v12.1: Scroll step into view */
  div.scrollIntoView && div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function simProgress(target, msPerPct) {
  target   = target   || 88;
  msPerPct = msPerPct || 110;
  _simTimer = setInterval(function() {
    var cur = _simPct;
    if (cur >= target) { clearInterval(_simTimer); _simTimer = null; return; }
    updateProgress(cur + 1 + Math.random() * 1.5, '');
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
  /* Drop zone click — delegate all clicks */
  D.dropZone.addEventListener('click', function(e) {
    if (!e.target.closest('#browseBtn')) D.fileInput.click();
  });
  D.dropZone.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); D.fileInput.click(); }
  });
  D.browseBtn.addEventListener('click', function(e) {
    e.stopPropagation(); D.fileInput.click();
  });
  D.fileInput.addEventListener('change', function(e) {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  });

  /* Drag & drop */
  D.dropZone.addEventListener('dragover', function(e) {
    e.preventDefault(); D.dropZone.classList.add('drag-over');
  });
  D.dropZone.addEventListener('dragleave', function(e) {
    if (!D.dropZone.contains(e.relatedTarget)) D.dropZone.classList.remove('drag-over');
  });
  D.dropZone.addEventListener('drop', function(e) {
    e.preventDefault(); D.dropZone.classList.remove('drag-over');
    S('playDragDropSound');
    var f = e.dataTransfer && e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') handleFile(f);
    else if (f) { S('playErrorSound'); toast('Please drop a PDF file (.pdf).', 'warning'); }
  });

  D.removeBtn.addEventListener('click', resetAll);
}

function handleFile(file) {
  FILE = file; PDF_INFO = null; PAGE_SEL.clear(); _shiftStart = null;
  _ZIP_FILENAME = stemName(file.name) + '_split.zip';

  S('playFileAddSound');

  /* v12: Warn for very large files */
  if (file.size > 100 * 1024 * 1024) {
    S('playWarningSound');
    toast('Large file (' + fmtBytes(file.size) + ') — processing may take 30–90 seconds.', 'warning', 5000);
  } else if (file.size > 50 * 1024 * 1024) {
    toast('Large file (' + fmtBytes(file.size) + ') — processing may take 15–30 seconds.', 'info', 4000);
  }

  hideEl(D.dropZone);
  showEl(D.fileInfoWrap);
  D.fileName.textContent = file.name;
  D.chipSize.innerHTML   = '<i class="fa-solid fa-weight-hanging"></i> ' + fmtBytes(file.size);
  D.chipPages.innerHTML  = '<i class="fa-solid fa-spinner fa-spin"></i> Loading…';
  ['chipBookmarks','chipBlanks','chipEncrypted','chipScanned'].forEach(function(k) {
    if (D[k]) D[k].classList.add('sp-chip-hidden');
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

  fetch('/api/split-pdf/info', { method: 'POST', body: fd })
    .then(function(r) { return r.json(); })
    .then(function(info) {
      PDF_INFO = info;
      if (!info.success && info.error) {
        D.chipPages.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Error';
        toast('PDF info error: ' + info.error, 'warning');
        return;
      }

      var total = info.total_pages || 0;
      D.chipPages.innerHTML = '<i class="fa-solid fa-file-lines"></i> ' + total + ' pages';

      if (info.has_bookmarks && info.bookmarks && info.bookmarks.length) {
        D.chipBookmarks.classList.remove('sp-chip-hidden');
        D.chipBookmarks.innerHTML = '<i class="fa-solid fa-bookmark"></i> ' + info.bookmarks.length + ' chapters';
        updateBookmarkList(info.bookmarks);
      }
      if (info.blank_pages > 0) {
        D.chipBlanks.classList.remove('sp-chip-hidden');
        D.chipBlanks.innerHTML = '<i class="fa-regular fa-file"></i> ' + info.blank_pages + ' blank';
        if (D.blankCountInfo) D.blankCountInfo.textContent = 'Detected ' + info.blank_pages + ' blank separator page(s).';
      }
      if (info.is_encrypted)  { if(D.chipEncrypted) D.chipEncrypted.classList.remove('sp-chip-hidden'); }
      if (info.is_scanned)    { if(D.chipScanned)   D.chipScanned.classList.remove('sp-chip-hidden'); }

      /* v12: Show PDF version if available */
      if (info.pdf_version) {
        D.chipSize.title = info.pdf_version + ' · ' + fmtBytes(file.size);
      }

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
    sk.className = 'sp-thumb-item sp-thumb-skeleton';
    sk.style.cssText = 'width:56px;aspect-ratio:.707;background:rgba(255,255,255,.05);border-radius:7px;border:1px solid rgba(99,102,241,.1);flex-shrink:0;';
    D.thumbsStrip.appendChild(sk);
  }
  showEl(D.thumbsWrap);
  if (D.thumbsCount) D.thumbsCount.textContent = 'Loading previews…';

  fetch('/api/split-pdf/thumbnails', { method: 'POST', body: fd })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.thumbnails || !data.thumbnails.length) { hideEl(D.thumbsWrap); return; }
      D.thumbsStrip.innerHTML = '';
      data.thumbnails.forEach(function(item, i) {
        var imgSrc = (typeof item === 'string') ? item : (item.data || '');
        if (!imgSrc) return;
        var div = document.createElement('div');
        div.className = 'sp-thumb-item';
        div.setAttribute('role', 'listitem');
        div.dataset.page = String(i);
        div.style.animationDelay = (i * 0.04) + 's';
        div.innerHTML = '<img src="' + imgSrc + '" alt="Page ' + (i+1) + '" loading="lazy" decoding="async">'
          + '<div class="sp-thumb-num">' + (i+1) + '</div>';
        div.addEventListener('click', function() { thumbClick(i); });
        D.thumbsStrip.appendChild(div);
      });
      var total = PDF_INFO ? PDF_INFO.total_pages : data.thumbnails.length;
      if (D.thumbsCount) D.thumbsCount.textContent = data.thumbnails.length + ' of ' + total + ' shown';
      showEl(D.thumbsWrap);
    })
    .catch(function() { hideEl(D.thumbsWrap); });
}

function autoDetectMode(file) {
  var fd = new FormData();
  fd.append('file', file);

  fetch('/api/split-pdf/auto-detect', { method: 'POST', body: fd })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.recommended_mode) return;
      _recMode = data.recommended_mode;
      var confPct = data.confidence ? Math.round(data.confidence * 100) : '';
      var recText = data.reason || ('Recommended: ' + data.recommended_mode);
      if (confPct) recText += ' (' + confPct + '% confidence)';
      if (D.recommendText) D.recommendText.textContent = recText;
      if (D.recommendBanner) showEl(D.recommendBanner);
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
  D.thumbsStrip.querySelectorAll('.sp-thumb-item').forEach(function(th) {
    th.classList.toggle('pg-selected', PAGE_SEL.has(parseInt(th.dataset.page)));
  });
}

/* ══════════════════════════════════════════════════════════════════
   MODE SELECTION
══════════════════════════════════════════════════════════════════ */
var MODE_DESC = {
  all:
    'Burst every page into its own PDF — zero quality loss, pikepdf lossless engine. All files packed in a ZIP named after your document.',
  range:
    'Extract specific pages into a single PDF. Use ranges like 1-5, 8, 12-end, odd, even, or first 10.',
  range_groups:
    'Each range becomes its own separate PDF in one operation. Exclusive to IshuTools — no other free tool offers this.',
  every_n:
    'Split into equal-size chunks of N pages each. Smart heading detection names each file automatically.',
  bookmarks:
    'One PDF per bookmark/chapter — perfect for textbooks, reports, and eBooks. Reads PDF table of contents.',
  blank_pages:
    'Auto-detect blank separator pages using pixel-level luminance analysis (v12) and split between them.',
  size_limit:
    'Keep each output PDF under a target file size. Uses binary-search grouping for accurate results.',
  odd_even:
    'Two files: odd pages (1,3,5…) and even pages (2,4,6…). Perfect for duplex scanning and booklet printing.',
};

function selectMode(mode) {
  MODE = mode; _shiftStart = null;
  D.modesGrid.querySelectorAll('.sp-mode-card').forEach(function(c) {
    var active = c.dataset.mode === mode;
    c.classList.toggle('active', active);
    c.setAttribute('aria-checked', String(active));
  });
  /* v12.1: Animate mode description text change */
  if (D.modeDesc) {
    D.modeDesc.classList.add('sp-mode-desc-updating');
    setTimeout(function() {
      if (D.modeDesc) {
        D.modeDesc.textContent = MODE_DESC[mode] || '';
        D.modeDesc.classList.remove('sp-mode-desc-updating');
      }
    }, 180);
  }

  var modes = ['all','range','range_groups','every_n','bookmarks','blank_pages','size_limit','odd_even'];
  modes.forEach(function(m) {
    var el = document.getElementById('opts-' + m);
    if (el) togEl(el, m === mode);
  });

  if (mode === 'range')     buildPageGrid();
  if (mode === 'every_n')   updateChunkInfo();
  if (mode === 'bookmarks') updateBookmarkList(PDF_INFO && PDF_INFO.bookmarks || []);
  updateSplitPreview();
  updateActionHint();
}

function initModeCards() {
  D.modesGrid.querySelectorAll('.sp-mode-card').forEach(function(card) {
    card.addEventListener('click', function(e) {
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
    if (D.nInput)  D.nInput.value  = n;
    if (D.nSlider) D.nSlider.value = Math.min(50, n);
    updateChunkInfo();
  }
  if (p.mode === 'range_groups' && p.ranges) {
    var total2 = PDF_INFO ? PDF_INFO.total_pages : 1;
    if (D.rangeGroupsInput) {
      D.rangeGroupsInput.value = p.ranges.replace('LAST', String(total2));
      updateGroupsPreview();
    }
  }

  S('playPresetSound');
  updateSplitPreview();
  toast('Preset applied: ' + key, 'success', 1800);
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
    D.pgrid.innerHTML = '<div style="font-size:.78rem;color:var(--text3);padding:8px">Page grid not shown for documents with &gt; 600 pages. Use the range input above.</div>';
    return;
  }

  var frag = document.createDocumentFragment();
  for (var i = 0; i < total; i++) {
    (function(idx) {
      var cell = document.createElement('div');
      cell.className = 'sp-pg-cell' + (PAGE_SEL.has(idx) ? ' pg-selected' : '');
      cell.textContent = idx + 1;
      cell.dataset.idx = String(idx);
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('aria-selected', String(PAGE_SEL.has(idx)));
      cell.style.animationDelay = Math.min(idx * 0.008, 0.4) + 's';
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
  syncInputFromPageGrid();
  updatePgridDisplay();
  S('playSortSound');
}

function updatePgridDisplay() {
  if (!D.pgrid) return;
  D.pgrid.querySelectorAll('.sp-pg-cell').forEach(function(cell) {
    var idx = parseInt(cell.dataset.idx), sel = PAGE_SEL.has(idx);
    cell.classList.toggle('pg-selected', sel);
    cell.setAttribute('aria-selected', String(sel));
  });
  updatePgridSelCount();
  updateThumbSelections();
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
    D.rangeInput.value = '';
    D.rangeInput.classList.remove('valid','invalid');
  } else {
    var sorted = Array.from(PAGE_SEL).sort(function(a,b){ return a-b; });
    var parts = [], start = sorted[0], end = sorted[0];
    for (var i = 1; i <= sorted.length; i++) {
      if (i < sorted.length && sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        parts.push(start === end ? String(start+1) : (start+1)+'-'+(end+1));
        if (i < sorted.length) { start = end = sorted[i]; }
      }
    }
    D.rangeInput.value = parts.join(',');
    D.rangeInput.classList.add('valid');
    D.rangeInput.classList.remove('invalid');
  }
  updateRangePreview();
  updateSplitPreview();
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
      if (mF) {
        for (var i=0; i<Math.min(+mF[1],total); i++) PAGE_SEL.add(i);
      } else if (mL) {
        var n=+mL[1];
        for (var i=Math.max(0,total-n); i<total; i++) PAGE_SEL.add(i);
      } else {
        cl.split(/[,;，；]+/).forEach(function(part) {
          part = part.trim().replace(/\bend\b/, ''+total);
          var rm = part.match(/^(\d+)\s*[-–—~]\s*(\d+)$/);
          if (rm) {
            for (var i=+rm[1]-1; i<=+rm[2]-1; i++) { if (i>=0&&i<total) PAGE_SEL.add(i); }
          } else if (/^\d+$/.test(part)) {
            var idx=+part-1; if (idx>=0&&idx<total) PAGE_SEL.add(idx);
          }
        });
      }
    }
    D.rangeInput.classList.toggle('valid',   PAGE_SEL.size > 0);
    D.rangeInput.classList.toggle('invalid', PAGE_SEL.size === 0);
  }
  updatePgridDisplay();
  updateRangePreview();
  updateSplitPreview();
}

function updateRangePreview() {
  if (!D.rangePreview) return;
  var total = PDF_INFO ? PDF_INFO.total_pages : 0;
  var val   = (D.rangeInput.value || '').trim();
  if (!val) {
    D.rangePreview.innerHTML = '<span style="color:var(--text3);font-size:.75rem">Type a range to preview selected pages</span>';
    return;
  }
  if (PAGE_SEL.size === 0) {
    D.rangePreview.innerHTML = '<span style="color:var(--red);font-size:.75rem"><i class="fa-solid fa-triangle-exclamation"></i> No valid pages in this PDF (' + total + ' pages)</span>';
    return;
  }
  if (PAGE_SEL.size > 80) {
    D.rangePreview.innerHTML = '<span style="color:var(--cyan);font-size:.75rem"><i class="fa-solid fa-circle-info"></i> ' + PAGE_SEL.size + ' pages selected</span>';
    return;
  }
  D.rangePreview.innerHTML = Array.from(PAGE_SEL).sort(function(a,b){return a-b;}).map(function(i) {
    return '<span class="sp-chip sp-chip-blue" style="padding:2px 7px;font-size:.65rem">' + (i+1) + '</span>';
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
  D.chunkCount.style.color = cnt > 100 ? 'var(--yellow)' : 'var(--accent3)';
}

function updateGroupsPreview() {
  if (!D.groupsPreview) return;
  var lines = (D.rangeGroupsInput.value || '')
    .split(/[\n,，;；]+/)
    .map(function(l){ return l.trim(); })
    .filter(Boolean);
  D.groupsPreview.innerHTML = lines.map(function(l, i) {
    var hue = (i * 47) % 360;
    return '<span class="sp-chip" style="border-color:hsla(' + hue + ',60%,60%,.3);color:hsl(' + hue + ',60%,65%);margin:2px">' + (i+1) + ': ' + l + '</span>';
  }).join('');
}

function updateBookmarkList(bookmarks) {
  if (!D.bookmarkList || !D.bookmarksInfoText) return;
  if (!bookmarks || !bookmarks.length) {
    D.bookmarksInfoText.textContent = 'No bookmarks found — will fallback to 5-page chunks.';
    D.bookmarkList.innerHTML = '';
    return;
  }
  D.bookmarksInfoText.textContent = bookmarks.length + ' chapter(s) found — each becomes its own PDF.';
  D.bookmarkList.innerHTML = bookmarks.slice(0, 40).map(function(bk, i) {
    var title = (bk[0] || ('Chapter ' + (i+1))).slice(0, 60);
    var page  = (bk[1] || 0) + 1;
    return '<div class="sp-bookmark-item"><i class="fa-solid fa-bookmark"></i>'
      + '<span>' + (i+1) + '. ' + title + '</span>'
      + '<span class="sp-bookmark-pg">pg ' + page + '</span></div>';
  }).join('');
}

/* ══════════════════════════════════════════════════════════════════
   SPLIT PREVIEW ESTIMATE
══════════════════════════════════════════════════════════════════ */
function updateSplitPreview() {
  if (!PDF_INFO || !D.splitPreviewBox) return;
  var total = PDF_INFO.total_pages || 1, est = '—';

  if (MODE === 'all')
    est = total + ' file' + (total !== 1 ? 's' : '');
  else if (MODE === 'range')
    est = PAGE_SEL.size > 0 ? '1 file (' + PAGE_SEL.size + ' page' + (PAGE_SEL.size !== 1 ? 's' : '') + ')' : 'Select pages';
  else if (MODE === 'range_groups') {
    var lines = (D.rangeGroupsInput.value || '').split(/[\n,，;；]+/).filter(function(l){ return l.trim(); });
    est = lines.length + ' file' + (lines.length !== 1 ? 's' : '');
  }
  else if (MODE === 'every_n') {
    var n = Math.max(1, parseInt(D.nInput.value)||1);
    est = Math.ceil(total/n) + ' file' + (Math.ceil(total/n) !== 1 ? 's' : '');
  }
  else if (MODE === 'bookmarks')
    est = PDF_INFO.has_bookmarks ? (PDF_INFO.bookmarks||[]).length + ' file' + ((PDF_INFO.bookmarks||[]).length !== 1 ? 's' : '') : 'No bookmarks';
  else if (MODE === 'blank_pages')
    est = PDF_INFO.blank_pages > 0 ? '~' + (PDF_INFO.blank_pages+1) + ' files' : '1+ files';
  else if (MODE === 'size_limit')
    est = '~' + Math.max(2, Math.ceil(total / Math.max(1, parseInt(D.sizeSlider ? D.sizeSlider.value : 5)||5))) + ' files (estimate)';
  else if (MODE === 'odd_even')
    est = '2 files (odd + even)';

  if (D.splitPreviewText) D.splitPreviewText.textContent = 'Will create: ' + est;
  showEl(D.splitPreviewBox);
}

function updateActionHint() {
  if (!D.actionHint) return;
  if (!FILE) { D.actionHint.textContent = 'Upload a PDF to get started'; return; }
  var hints = {
    all:          'Every page → own PDF → ZIP archive',
    range:        'Selected pages → single PDF → ZIP',
    range_groups: 'Each group → own PDF → ZIP',
    every_n:      'Equal N-page chunks → multiple PDFs → ZIP',
    bookmarks:    'Each chapter → own PDF → ZIP',
    blank_pages:  'Splits at blank separators → ZIP',
    size_limit:   'Grouped by file size → ZIP',
    odd_even:     'Odd pages + Even pages → 2 PDFs → ZIP',
  };
  D.actionHint.textContent = (hints[MODE] || 'Press Ctrl+Enter to split') + ' · Ctrl+Enter to start';
}

/* ══════════════════════════════════════════════════════════════════
   QUICK SELECT
══════════════════════════════════════════════════════════════════ */
function initQsButtons() {
  document.querySelectorAll('.sp-qs-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var qs = btn.dataset.qs, total = PDF_INFO ? PDF_INFO.total_pages : 1;
      PAGE_SEL.clear();
      if (qs === 'all')    for (var i=0; i<total; i++) PAGE_SEL.add(i);
      if (qs === 'odd')    for (var i=0; i<total; i+=2) PAGE_SEL.add(i);
      if (qs === 'even')   for (var i=1; i<total; i+=2) PAGE_SEL.add(i);
      if (qs === 'first5') for (var i=0; i<Math.min(5,total); i++) PAGE_SEL.add(i);
      if (qs === 'last5')  for (var i=Math.max(0,total-5); i<total; i++) PAGE_SEL.add(i);
      syncInputFromPageGrid();
      updatePgridDisplay();
      S('playSortSound');
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
      hideEl(D.advBody);
      D.advChevron.classList.remove('open');
      D.advToggle.setAttribute('aria-expanded','false');
      S('playCollapseSound');
    } else {
      showEl(D.advBody);
      D.advChevron.classList.add('open');
      D.advToggle.setAttribute('aria-expanded','true');
      S('playExpandSound');
    }
  });
}

/* ══════════════════════════════════════════════════════════════════
   FAQ
══════════════════════════════════════════════════════════════════ */
function initFaq() {
  document.querySelectorAll('.sp-faq-q').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var item = btn.closest('.sp-faq-item');
      if (!item) return;
      var isOpen = item.classList.contains('open');
      /* Close all others */
      document.querySelectorAll('.sp-faq-item.open').forEach(function(other) {
        other.classList.remove('open');
        var q = other.querySelector('.sp-faq-q');
        if (q) q.setAttribute('aria-expanded','false');
      });
      if (!isOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded','true');
      }
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
      if (D.sizeSlider) D.sizeSlider.value = Math.min(50, mb);
      if (D.sizeVal)    D.sizeVal.textContent = mb + ' MB';
      document.querySelectorAll('.sp-size-preset-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      updateSplitPreview();
    });
  });
  if (D.sizeSlider) {
    D.sizeSlider.addEventListener('input', function() {
      if (D.sizeVal) D.sizeVal.textContent = D.sizeSlider.value + ' MB';
      document.querySelectorAll('.sp-size-preset-btn').forEach(function(b){ b.classList.remove('active'); });
      updateSplitPreview();
    });
  }
}

function initNSlider() {
  if (D.nSlider) {
    D.nSlider.addEventListener('input', function() {
      if (D.nInput) D.nInput.value = D.nSlider.value;
      updateChunkInfo(); updateSplitPreview();
    });
  }
  if (D.nInput) {
    D.nInput.addEventListener('input', function() {
      var v = Math.max(1, parseInt(D.nInput.value)||1);
      if (D.nSlider) D.nSlider.value = Math.min(50, v);
      updateChunkInfo(); updateSplitPreview();
    });
  }
}

function initBlankThresh() {
  if (D.blankThreshSlider) {
    D.blankThreshSlider.addEventListener('input', function() {
      if (D.blankThreshVal) D.blankThreshVal.textContent = D.blankThreshSlider.value + '%';
    });
  }
}

/* ══════════════════════════════════════════════════════════════════
   RANGE INPUTS
══════════════════════════════════════════════════════════════════ */
function initRangeInput() {
  var debounce = null;
  if (D.rangeInput) {
    D.rangeInput.addEventListener('input', function() {
      clearTimeout(debounce);
      debounce = setTimeout(syncPageGridFromInput, 320);
    });
  }
  if (D.copyRangeBtn) {
    D.copyRangeBtn.addEventListener('click', function() {
      var val = D.rangeInput ? D.rangeInput.value : '';
      if (val) {
        navigator.clipboard.writeText(val)
          .then(function(){ toast('Range copied!', 'success', 1500); S('playCopySound'); })
          .catch(function(){});
      }
    });
  }
}

function initRangeGroupsInput() {
  var debounce = null;
  if (D.rangeGroupsInput) {
    D.rangeGroupsInput.addEventListener('input', function() {
      clearTimeout(debounce);
      debounce = setTimeout(function(){ updateGroupsPreview(); updateSplitPreview(); }, 300);
    });
  }
}

/* ══════════════════════════════════════════════════════════════════
   AI RECOMMENDATION
══════════════════════════════════════════════════════════════════ */
function initRecommendation() {
  if (D.recApplyBtn) {
    D.recApplyBtn.addEventListener('click', function() {
      if (_recMode) {
        selectMode(_recMode);
        hideEl(D.recommendBanner);
        toast('Applied: ' + _recMode.replace(/_/g,' '), 'success', 2000);
        S('playPresetSound');
      }
    });
  }
  if (D.recDismissBtn) {
    D.recDismissBtn.addEventListener('click', function() {
      hideEl(D.recommendBanner);
    });
  }
}

/* ══════════════════════════════════════════════════════════════════
   MOBILE FAB
══════════════════════════════════════════════════════════════════ */
function initFab() {
  if (!D.fabBtn) return;
  D.fabBtn.addEventListener('click', function() {
    if (FILE) {
      if (window.SOUNDS) window.SOUNDS.resume();
      doSplit();
    } else {
      D.fileInput.click();
    }
  });
}

/* ══════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════════════════════════════════ */
function initKeyboard() {
  document.addEventListener('keydown', function(e) {
    /* Ctrl+Enter → split */
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (FILE && !D.splitBtn.disabled) {
        if (window.SOUNDS) window.SOUNDS.resume();
        doSplit();
      }
    }
    /* Escape → close FAQ items */
    if (e.key === 'Escape') {
      document.querySelectorAll('.sp-faq-item.open').forEach(function(item) {
        item.classList.remove('open');
      });
    }
    /* T → toggle theme (not in input) */
    if (e.key === 't' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') { toggleTheme(); }
    }
    /* D → download if available */
    if (e.key === 'd' && (e.ctrlKey || e.metaKey) && _BLOB_URL) {
      e.preventDefault();
      downloadZip();
    }
    /* R → reset / split again */
    if (e.key === 'r' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault();
      if (FILE) resetAll();
    }
  });
}

/* ══════════════════════════════════════════════════════════════════
   SPLIT ACTION
══════════════════════════════════════════════════════════════════ */
function doSplit() {
  if (!FILE)                  { toast('Please upload a PDF file first.', 'warning'); return; }
  if (D.splitBtn.disabled)    return;

  if (MODE === 'range' && PAGE_SEL.size === 0 && !(D.rangeInput && D.rangeInput.value.trim())) {
    S('playWarningSound');
    toast('Please select at least one page in the grid or enter a range.', 'warning', 3500);
    if (D.rangeInput) D.rangeInput.focus();
    return;
  }
  if (MODE === 'range_groups' && !(D.rangeGroupsInput && D.rangeGroupsInput.value.trim())) {
    S('playWarningSound');
    toast('Please enter at least one range group (e.g. 1-5).', 'warning', 3500);
    if (D.rangeGroupsInput) D.rangeGroupsInput.focus();
    return;
  }

  if (window.SOUNDS) window.SOUNDS.resume();
  S('playMergeStartSound');

  _splitStart = Date.now();
  _simPct     = 0;

  /* Scroll to progress card */
  scrollToEl(D.progressCard, 70);

  showEl(D.progressCard);
  hideEl(D.resultsCard);
  hideEl(D.actionCard);
  D.progressSteps.innerHTML = '';
  updateProgress(0, 'Preparing split…');

  var total = PDF_INFO ? PDF_INFO.total_pages : '?';
  addProgressStep('fa-check',        'Mode: ' + MODE.replace(/_/g,' '), 'done');
  addProgressStep('fa-file-pdf',     (total) + ' pages · ' + fmtBytes(FILE.size), 'done');
  addProgressStep('fa-microchip',    'v12 lossless engine active (pikepdf + PyMuPDF)', 'active');

  simProgress(86, 108);

  var fd = new FormData();
  fd.append('file',             FILE);
  fd.append('mode',             MODE);
  fd.append('password',         D.passwordInput ? (D.passwordInput.value || '') : '');
  fd.append('naming_pattern',   D.namingPattern ? (D.namingPattern.value || 'page_{n:04d}') : 'page_{n:04d}');
  fd.append('remove_blanks',    D.removeBlanksToggle && D.removeBlanksToggle.checked ? '1' : '0');
  fd.append('source_filename',  FILE.name);

  if (MODE === 'range')        fd.append('ranges',      D.rangeInput ? D.rangeInput.value : '');
  if (MODE === 'range_groups') {
    var groups = (D.rangeGroupsInput ? D.rangeGroupsInput.value : '')
      .split(/[\n,，;；]+/).map(function(l){ return l.trim(); }).filter(Boolean);
    fd.append('ranges', groups.join(','));
  }
  if (MODE === 'every_n')    fd.append('every_n',        D.nInput     ? (D.nInput.value || '5')       : '5');
  if (MODE === 'size_limit') fd.append('max_size_mb',    D.sizeSlider ? (D.sizeSlider.value || '5')   : '5');
  if (MODE === 'blank_pages') fd.append('blank_threshold', D.blankThreshSlider
    ? (parseInt(D.blankThreshSlider.value)/100).toFixed(2) : '0.94');

  fetch('/api/split-pdf', { method: 'POST', body: fd })
    .then(function(res) {
      closeSSE();
      if (!res.ok) {
        return res.json()
          .then(function(j) {
            var msg = j.error || j.message || 'Server error ' + res.status;
            throw new Error(msg);
          })
          .catch(function(jsonErr) {
            if (jsonErr.message) throw jsonErr;
            throw new Error('Server error ' + res.status);
          });
      }
      updateProgress(95, 'Finalising and packing ZIP…');
      addProgressStep('fa-file-zipper', 'Packing output ZIP…', 'active');

      var savedRes = res;
      return res.blob().then(function(blob) { return { blob: blob, res: savedRes }; });
    })
    .then(function(obj) {
      var blob = obj.blob, res = obj.res;
      updateProgress(100, 'Split complete!');
      addProgressStep('fa-circle-check', 'Done — ZIP ready!', 'done');

      var filesCreated = parseInt(res.headers.get('X-File-Count') || res.headers.get('X-Files-Created') || '1');
      var totalPages   = parseInt(res.headers.get('X-Total-Pages') || (PDF_INFO ? PDF_INFO.total_pages : '?'));
      var procMs       = parseInt(res.headers.get('X-Processing-Ms') || '0');
      var qualityGrade = res.headers.get('X-Quality-Grade') || 'A+';
      var qualityScore = res.headers.get('X-Quality-Score') || '100';
      var zipName      = res.headers.get('X-Download-Name') || res.headers.get('X-Zip-Name') || _ZIP_FILENAME;
      var zipSizeKb    = parseInt(res.headers.get('X-Zip-Size-Kb') || '0');

      if (_BLOB_URL) URL.revokeObjectURL(_BLOB_URL);
      _BLOB_URL     = URL.createObjectURL(blob);
      _ZIP_FILENAME = zipName;

      setTimeout(function() {
        hideEl(D.progressCard);
        showEl(D.resultsCard);
        showEl(D.actionCard);
        showResults(filesCreated, totalPages, qualityGrade, qualityScore, procMs, zipSizeKb);
        S('playSuccessChime');

        /* v12: Auto-scroll to results */
        setTimeout(function() { scrollToEl(D.resultsCard, 70); }, 120);

        /* v12: Multiple confetti bursts */
        launchConfetti();
      }, 580);
    })
    .catch(function(e) {
      closeSSE();
      updateProgress(0, '');
      hideEl(D.progressCard);
      showEl(D.actionCard);
      S('playErrorSound');
      var msg = e.message || 'Unknown error. Please try again.';
      /* Provide actionable hints */
      if (msg.indexOf('password') !== -1 || msg.indexOf('encrypted') !== -1)
        msg += ' — Enter password in Advanced Options.';
      if (msg.indexOf('corrupt') !== -1)
        msg += ' — Try using PDF Repair tool first.';
      toast('Split failed: ' + msg, 'error', 6000);
    });
}

/* ══════════════════════════════════════════════════════════════════
   SHOW RESULTS (v12: animated counters)
══════════════════════════════════════════════════════════════════ */
function showResults(filesCreated, totalPages, qualityGrade, qualityScore, procMs, zipSizeKb) {
  var elapsed = procMs > 0
    ? (procMs >= 1000 ? (procMs / 1000).toFixed(1) + 's' : procMs + 'ms')
    : (Math.round((Date.now() - _splitStart) / 100) / 10).toFixed(1) + 's';

  if (D.resultsSub)
    D.resultsSub.textContent = filesCreated + ' file' + (filesCreated !== 1 ? 's' : '') + ' ready to download';
  if (D.dlName)
    D.dlName.textContent = _ZIP_FILENAME;
  if (D.qualityText)
    D.qualityText.textContent = 'Grade ' + qualityGrade + ' · Score ' + qualityScore + '/100 · Zero re-encoding · Lossless';

  var statDefs = [
    { icon:'fa-file-pdf',     label:' file' + (filesCreated!==1?'s':'') + ' created', value:filesCreated, suffix:'' },
    { icon:'fa-file-lines',   label:' pages input', value:totalPages, suffix:'' },
    { icon:'fa-clock',        label:' processing', value:null, raw:elapsed },
    { icon:'fa-shield-check', label:' quality', value:null, raw:'Grade ' + qualityGrade },
  ];
  if (zipSizeKb > 0) {
    statDefs.push({ icon:'fa-file-zipper', label:' ZIP size', value:null, raw: zipSizeKb >= 1024 ? (zipSizeKb/1024).toFixed(1)+' MB' : zipSizeKb + ' KB' });
  }

  D.resultsStats.innerHTML = statDefs.map(function(s, i) {
    return '<span class="sp-res-stat" role="listitem" style="animation-delay:' + (i*0.07) + 's">'
      + '<i class="fa-solid ' + s.icon + '"></i>'
      + '<strong id="resStat' + i + '">' + (s.raw || (s.value + s.suffix)) + '</strong>'
      + s.label
      + '</span>';
  }).join('');

  /* v12: Animate numeric counters */
  statDefs.forEach(function(s, i) {
    if (s.value !== null && typeof s.value === 'number') {
      var el = document.getElementById('resStat' + i);
      if (el) animateCount(el, s.value, s.suffix, 600 + i * 120);
    }
  });
}

/* ══════════════════════════════════════════════════════════════════
   DOWNLOAD — fahhhhh.mp3 plays on every download
══════════════════════════════════════════════════════════════════ */
function downloadZip() {
  if (!_BLOB_URL) { toast('Nothing to download — split first.', 'warning'); return; }
  S('playDownloadWhoosh');   /* fahhhhh.mp3 */
  var a = document.createElement('a');
  a.href     = _BLOB_URL;
  a.download = _ZIP_FILENAME;
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { a.remove(); }, 120);
  toast('Downloading ' + _ZIP_FILENAME + ' — enjoy!', 'success', 2800);
}

/* ══════════════════════════════════════════════════════════════════
   CONFETTI (v12: multiple bursts)
══════════════════════════════════════════════════════════════════ */
function launchConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 140,
      spread: 78,
      origin: { y: .54 },
      colors: ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ec4899']
    });
    setTimeout(function() {
      confetti({
        particleCount: 65,
        spread: 48,
        origin: { y: .58 },
        colors: ['#ec4899','#f97316','#6366f1','#a78bfa']
      });
    }, 380);
    setTimeout(function() {
      confetti({
        particleCount: 35,
        spread: 110,
        origin: { y: .5, x: .2 },
        colors: ['#10b981','#06b6d4']
      });
      confetti({
        particleCount: 35,
        spread: 110,
        origin: { y: .5, x: .8 },
        colors: ['#6366f1','#8b5cf6']
      });
    }, 700);
  } else {
    /* CSS fallback */
    var cols = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#ec4899'];
    for (var i = 0; i < 24; i++) {
      (function(i) {
        var d = document.createElement('div');
        var dur = 0.8 + Math.random() * 1.3;
        d.style.cssText = [
          'position:fixed',
          'width:7px', 'height:7px', 'border-radius:2px',
          'left:' + (Math.random() * 100) + 'vw',
          'top:-10px',
          'background:' + cols[i % cols.length],
          'animation:confettiFall ' + dur + 's ease-in forwards',
          'z-index:9999', 'pointer-events:none'
        ].join(';');
        document.body.appendChild(d);
        setTimeout(function() { if (d.parentNode) d.remove(); }, dur * 1000 + 200);
      })(i);
    }
  }
}

/* ══════════════════════════════════════════════════════════════════
   RESET
══════════════════════════════════════════════════════════════════ */
function resetAll() {
  if (_BLOB_URL) { URL.revokeObjectURL(_BLOB_URL); _BLOB_URL = null; }
  closeSSE();
  FILE = null; PDF_INFO = null; PAGE_SEL.clear();
  _shiftStart = null; _recMode = null; _simPct = 0;
  _ZIP_FILENAME = 'document_split.zip';

  hideEl(D.fileInfoWrap);
  showEl(D.dropZone);
  D.fileInput.value = '';

  hideEl(D.modesCard);
  hideEl(D.optionsCard);
  hideEl(D.advCard);
  hideEl(D.actionCard);
  hideEl(D.progressCard);
  hideEl(D.resultsCard);
  hideEl(D.recommendBanner);
  hideEl(D.presetsRow);
  hideEl(D.splitPreviewBox);
  hideEl(D.fabBtn);
  hideEl(D.thumbsWrap);

  D.splitBtn.disabled = true;
  if (D.progressSteps)   D.progressSteps.innerHTML = '';
  if (D.resultsStats)    D.resultsStats.innerHTML  = '';
  if (D.thumbsStrip)     D.thumbsStrip.innerHTML   = '';
  if (D.bookmarkList)    D.bookmarkList.innerHTML   = '';
  if (D.pgrid)           D.pgrid.innerHTML          = '';
  if (D.rangeInput)      D.rangeInput.value         = '';
  if (D.rangePreview)    D.rangePreview.innerHTML   = '';
  if (D.rangeGroupsInput) D.rangeGroupsInput.value  = '';
  if (D.groupsPreview)   D.groupsPreview.innerHTML  = '';
  if (D.advBody)         hideEl(D.advBody);
  if (D.advChevron)      D.advChevron.classList.remove('open');

  selectMode('all');
  updateProgress(0, '');

  /* Scroll to top */
  window.scrollTo({ top: 0, behavior: 'smooth' });
  S('playResetSound');
}

/* alias for backward-compat onclick= */
window.resetTool    = resetAll;
window.downloadResult = downloadZip;

/* ══════════════════════════════════════════════════════════════════
   GSAP ANIMATIONS
══════════════════════════════════════════════════════════════════ */
function initGsapAnimations() {
  if (typeof gsap === 'undefined') return;
  gsap.from('.sp-upload-card',     { y:24, duration:.55,  ease:'power2.out', delay:.06 });
  gsap.from('.sp-hero-badge',      { y:10, duration:.42,  ease:'power2.out', delay:.18 });
  gsap.from('.sp-hero-h1',         { y:14, duration:.48,  ease:'power2.out', delay:.26 });
  gsap.from('.sp-hero-sub',        { y:8,  duration:.42,  ease:'power2.out', delay:.34 });
  gsap.from('.sp-hero-pills span', { y:7,  stagger:.05,   duration:.36, ease:'power2.out', delay:.42 });

  /* v12.1: Scroll-reveal for below-fold sections */
  var secs = document.querySelectorAll('.sp-section');
  if (secs.length && window.IntersectionObserver) {
    var revealIO = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          gsap.from(el.querySelectorAll('.sp-feat-card, .sp-step, .sp-stat-card, .sp-review-card'), {
            y: 22, stagger: .08, duration: .45, ease: 'power2.out'
          });
          revealIO.unobserve(el);
        }
      });
    }, { threshold: 0.1 });
    secs.forEach(function(s) { revealIO.observe(s); });
  }
}

/* v12.1: Section counter animation using IntersectionObserver */
function initStatCounters() {
  var statNums = document.querySelectorAll('.sp-stat-num');
  if (!statNums.length || !window.IntersectionObserver) return;
  var io = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      var txt = el.textContent.trim();
      var num = parseFloat(txt.replace(/[^0-9.]/g, ''));
      if (!isNaN(num) && num > 0 && num < 10000) {
        var suffix = txt.replace(/[0-9.]/g, '');
        var start = 0, dur = 900, startTime = null;
        function step(ts) {
          if (!startTime) startTime = ts;
          var progress = Math.min((ts - startTime) / dur, 1);
          var ease = 1 - Math.pow(1 - progress, 3);
          var cur = start + (num - start) * ease;
          el.textContent = (num % 1 === 0 ? Math.round(cur) : cur.toFixed(1)) + suffix;
          if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }
      io.unobserve(el);
    });
  }, { threshold: 0.5 });
  statNums.forEach(function(n) { io.observe(n); });
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

  /* Initialise all subsystems */
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
  if (D.themeBtn) D.themeBtn.addEventListener('click', toggleTheme);
  if (D.soundBtn) D.soundBtn.addEventListener('click', toggleSound);

  /* Wire split button + ripple */
  if (D.splitBtn) {
    D.splitBtn.addEventListener('click', function(e) {
      if (window.SOUNDS) window.SOUNDS.resume();
      addRipple(D.splitBtn, e);
      doSplit();
    });
  }

  /* Wire download button */
  if (D.downloadBtn) {
    D.downloadBtn.addEventListener('click', function(e) {
      addRipple(D.downloadBtn, e);
      downloadZip();
    });
  }

  /* Wire split-again */
  if (D.splitAgainBtn) D.splitAgainBtn.addEventListener('click', resetAll);

  /* Wire presets */
  if (D.presetsRow) {
    D.presetsRow.querySelectorAll('.sp-preset-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { applyPreset(btn.dataset.preset); });
    });
  }

  /* Add confetti CSS fallback keyframe */
  var sEl = document.createElement('style');
  sEl.textContent = '@keyframes confettiFall{from{transform:translateY(-10px) rotate(0deg);opacity:1}to{transform:translateY(100vh) rotate(720deg);opacity:0}}@keyframes ripple{to{transform:scale(3);opacity:0}}';
  document.head.appendChild(sEl);

  /* Initial state */
  selectMode('all');
  hideEl(D.modesCard);
  hideEl(D.optionsCard);
  hideEl(D.advCard);
  hideEl(D.actionCard);
  hideEl(D.splitPreviewBox);

  /* GSAP (deferred) */
  setTimeout(initGsapAnimations, 200);

  /* v12.1: Init stat counters for below-fold sections */
  setTimeout(initStatCounters, 400);

  /* Preload sounds */
  if (window.SOUNDS && window.SOUNDS.preload) {
    setTimeout(function() { window.SOUNDS.preload(); }, 500);
  }
});
