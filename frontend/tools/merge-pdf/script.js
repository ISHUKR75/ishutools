/**
 * IshuTools.fun — Merge PDF v9.0
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 * Libraries: Sortable.js, GSAP+ScrollTrigger, anime.js, canvas-confetti, Chart.js, Typed.js
 * Sounds: SOUNDS global from sounds/sounds.js (loaded as regular script, not defer)
 */
'use strict';

/* ════ CONSTANTS ════ */
const MAX_FILES = 50;
const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB
const LARGE_FILE_WARN = 80 * 1024 * 1024; // 80 MB
const IMG_EXTS = new Set(['jpg','jpeg','png','webp','gif','bmp','tiff','tif']);
const CNT_KEY  = 'ishu-merge-count';
const SET_KEY  = 'ishu-merge-settings-v9';
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WRK = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ════ STATE ════ */
let FILES = [];           // Array of entry objects
let _sortMode  = 'order';
let _sortable  = null;    // Sortable.js instance
let _dlBlob    = null;
let _dlUrl     = null;
let _dlName    = '';
let _jobId     = '';
let _sse       = null;
let _simTimer  = null;
let _sizeChart = null;
let _mergeSt   = 0;
let _deletedStack = [];   // Undo stack
let _undoTimer = null;
let _typedInst = null;
let _activePreset = null;
let D = null;             // DOM refs — populated in DOMContentLoaded

/* ════ HELPERS ════ */
const $ = id => document.getElementById(id);
const genId = () => `job_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

function fmtSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

function extOf(name) {
  return (name.split('.').pop() || '').toLowerCase();
}

function isImage(name) {
  return IMG_EXTS.has(extOf(name));
}

function stemOf(name) {
  const parts = name.split('.');
  if (parts.length > 1) parts.pop();
  return parts.join('.');
}

/* ════ OUTPUT FILENAME ════ */
function smartName() {
  const override = D?.optFilename?.value?.trim();
  if (override) {
    const clean = override.replace(/\.pdf$/i, '').replace(/[^\w\s\-_.()[\]]/g, '').trim();
    return (clean || 'merged') + '.pdf';
  }
  const first = FILES[0];
  if (!first) return 'merged.pdf';
  const stem = stemOf(first.name).replace(/[^\w\s\-_.()[\]]/g, '').trim().slice(0, 60);
  return (stem || 'merged') + '_merged.pdf';
}

/* ════ TOAST ════ */
let _toastTimer = null;
function toast(msg, type = 'info', dur = 4200) {
  if (!D?.toast) return;
  clearTimeout(_toastTimer);
  D.toast.textContent = msg;
  D.toast.className = `toast show ${type}`;
  _toastTimer = setTimeout(() => D.toast.classList.remove('show'), dur);
}

/* ════ SECTION VISIBILITY ════ */
function showSection(name) {
  const map = { upload: 'sUp', files: 'sFi', progress: 'sPr', result: 'sRe' };
  Object.entries(map).forEach(([k, ref]) => {
    const el = D?.[ref];
    if (!el) return;
    el.hidden = (k !== name);
    el.setAttribute('aria-hidden', String(k !== name));
  });
}

/* ════ FILE ENTRY ════ */
function makeEntry(file) {
  return {
    id:           genId(),
    file,
    name:         file.name,
    size:         file.size,
    ext:          extOf(file.name),
    imgConverted: isImage(file.name),
    thumb:        null,
    pages:        null,
    enc:          false,
    hasForms:     false,
    hasAnnots:    false,
    pdfVersion:   '',
    pdfTitle:     '',
    range:        '',
    pwd:          '',
    displayName:  '',
    _validated:   false,
  };
}

/* ════ ADD FILES ════ */
function addFiles(fileList) {
  window.SOUNDS?.resume?.();
  const raw = Array.from(fileList);
  const accepted = [];
  const skipped  = [];

  for (const f of raw) {
    const ext = extOf(f.name);
    if (ext !== 'pdf' && !IMG_EXTS.has(ext)) { skipped.push(f.name); continue; }
    if (f.size > MAX_BYTES)       { toast(`${f.name} is too large (max 1 GB)`, 'warn'); continue; }
    if (FILES.length + accepted.length >= MAX_FILES) {
      toast(`Maximum ${MAX_FILES} files allowed`, 'warn');
      window.SOUNDS?.playWarningSound?.();
      break;
    }
    accepted.push(f);
  }

  if (skipped.length) {
    toast(`Skipped ${skipped.length} unsupported file${skipped.length > 1 ? 's' : ''} (use PDF or images)`, 'warn');
  }

  if (!accepted.length) return;

  accepted.forEach(f => {
    const entry = makeEntry(f);
    FILES.push(entry);
  });

  window.SOUNDS?.playFileAddSound?.();
  loadPdfJs(); // ensure PDF.js loaded for metadata
  if (FILES.length >= 2) showSection('files');
  else if (FILES.length === 1) {
    showSection('files');
    toast('Add at least one more file to merge', 'info', 3500);
  }

  rebuildList();
  updateStats();
  updatePreviewStrip();
  checkLargeBanner();
  syncMergeBtn();
  updateHeroCnt();

  // Read PDF metadata for newly added non-image files
  accepted.forEach(f => {
    const entry = FILES.find(e => e.file === f);
    if (entry && !entry.imgConverted) {
      readPdfMeta(entry);
    }
  });
}

/* ════ PDF META ════ */
function readPdfMeta(entry) {
  if (typeof pdfjsLib === 'undefined') return;
  if (entry._metaRead) return;
  entry._metaRead = true;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const buf = e.target.result;
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      entry.pages = pdf.numPages;
      // Try metadata
      try {
        const meta = await pdf.getMetadata();
        if (meta?.info) {
          entry.pdfTitle   = meta.info.Title  || '';
          entry.pdfVersion = meta.info.PDFFormatVersion || '';
        }
      } catch(_) {}
      updateStats();
      refreshCard(entry.id);
    } catch(err) {
      const msg = String(err).toLowerCase();
      if (msg.includes('password')) {
        entry.enc = true;
        refreshCard(entry.id);
      }
    }
  };
  reader.readAsArrayBuffer(entry.file.slice(0, Math.min(entry.file.size, 1024 * 1024)));
}

/* ════ VALIDATE FILE (server) ════ */
async function validateFile(entry) {
  if (entry._validated) return;
  entry._validated = true;
  try {
    const fd = new FormData();
    fd.append('file', entry.file, entry.name);
    fd.append('password', entry.pwd || '');
    const r = await fetch('/api/merge-pdf/validate', { method: 'POST', body: fd });
    if (!r.ok) return;
    const j = await r.json();
    if (j.success) {
      if (j.has_forms)       entry.hasForms  = true;
      if (j.has_annotations) entry.hasAnnots = true;
      if (j.title)           entry.pdfTitle  = j.title;
      if (j.version)         entry.pdfVersion = j.version;
      if (!entry.pages && j.page_count) entry.pages = j.page_count;
      refreshCard(entry.id);
    }
  } catch(_) {}
}

/* ════ REBUILD FILE LIST ════ */
function rebuildList() {
  if (!D?.fList) return;
  D.fList.innerHTML = '';

  FILES.forEach((entry, idx) => {
    const card = buildCard(entry, idx);
    D.fList.appendChild(card);
    // Stagger animation
    card.style.animationDelay = `${idx * 0.04}s`;
  });

  // Sortable.js
  if (_sortable) { _sortable.destroy(); _sortable = null; }
  if (D.fList.children.length > 1) {
    _sortable = Sortable.create(D.fList, {
      animation: 180,
      handle: '.drag-handle',
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      onStart: () => window.SOUNDS?.playDragStartSound?.(),
      onEnd: ev => {
        const [moved] = FILES.splice(ev.oldIndex, 1);
        FILES.splice(ev.newIndex, 0, moved);
        window.SOUNDS?.playDragDropSound?.();
        rebuildList();
        updateStats();
        updatePreviewStrip();
        syncMergeBtn();
      },
    });
  }

  // File badge
  if (D.fileBadge) D.fileBadge.textContent = `${FILES.length} file${FILES.length !== 1 ? 's' : ''}`;

  // Mobile FAB
  if (D.mobileFab) {
    if (FILES.length >= 2) {
      D.mobileFab.hidden = false;
    } else {
      D.mobileFab.hidden = true;
    }
  }
}

/* ════ BUILD CARD ════ */
function buildCard(entry, idx) {
  const div = document.createElement('div');
  div.className = 'file-card';
  div.dataset.id = entry.id;
  div.setAttribute('role', 'listitem');
  div.setAttribute('aria-label', entry.name);

  const isImg = entry.imgConverted;
  const iconClass = isImg ? 'img' : 'pdf';
  const iconFa    = isImg ? 'fa-image' : 'fa-file-pdf';
  const badgesHtml = [
    entry.enc      ? `<span class="card-badge badge-enc"><i class="fas fa-lock"></i>Encrypted</span>` : '',
    entry.imgConverted ? `<span class="card-badge badge-img"><i class="fas fa-image"></i>Image→PDF</span>` : '',
    entry.hasForms ? `<span class="card-badge badge-form"><i class="fas fa-pen"></i>Forms</span>` : '',
  ].filter(Boolean).join('');

  const pagesStr = entry.pages != null ? `${entry.pages}p` : '';
  const infoStr  = [fmtSize(entry.size), pagesStr, entry.pdfVersion].filter(Boolean).join(' · ');

  div.innerHTML = `
    <div class="card-top">
      <span class="drag-handle" aria-hidden="true" title="Drag to reorder"><i class="fas fa-grip-vertical"></i></span>
      <span class="card-num">${idx + 1}</span>
      <div class="card-icon ${iconClass}" aria-hidden="true"><i class="fas ${iconFa}"></i></div>
      <div class="card-meta">
        <div class="card-name" title="${escHtml(entry.name)}">${escHtml(entry.name)}</div>
        <div class="card-info">
          <span>${escHtml(infoStr)}</span>
          ${badgesHtml}
        </div>
      </div>
      <div class="card-actions">
        ${!isImg ? `<button class="ca-btn preview-btn" title="Preview" aria-label="Preview ${escHtml(entry.name)}"><i class="fas fa-eye"></i></button>` : ''}
        <button class="ca-btn expand-btn" title="Options" aria-label="Options for ${escHtml(entry.name)}" aria-expanded="false"><i class="fas fa-sliders"></i></button>
        <button class="ca-btn del-btn" title="Remove" aria-label="Remove ${escHtml(entry.name)}"><i class="fas fa-xmark"></i></button>
      </div>
    </div>
    <div class="card-expand" id="exp-${entry.id}">
      ${buildExpandHtml(entry)}
    </div>`;

  // Wire actions
  const top = div.querySelector('.card-top');
  const previewBtn = top.querySelector('.preview-btn');
  const expandBtn  = top.querySelector('.expand-btn');
  const delBtn     = top.querySelector('.del-btn');

  if (previewBtn) {
    previewBtn.addEventListener('click', e => { e.stopPropagation(); openPreview(entry); });
  }
  expandBtn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = div.classList.toggle('expanded');
    expandBtn.setAttribute('aria-expanded', String(isOpen));
    expandBtn.classList.toggle('active', isOpen);
    if (isOpen) {
      window.SOUNDS?.playExpandSound?.();
      wireExpandFields(div, entry);
      if (!entry._validated && !entry.imgConverted) validateFile(entry);
    } else {
      window.SOUNDS?.playCollapseSound?.();
    }
  });
  delBtn.addEventListener('click', e => { e.stopPropagation(); removeFile(entry.id, idx); });

  // Touch swipe to delete (mobile)
  addTouchSwipe(div, entry.id);

  return div;
}

function buildExpandHtml(entry) {
  if (entry.imgConverted) {
    return `<div class="expand-grid">
      <div class="img-converted-msg"><i class="fas fa-check-circle"></i>Image auto-converted to PDF at full quality (lossless)</div>
      <div class="exp-field">
        <label><i class="fas fa-tag"></i>Display Name <small>(for TOC)</small></label>
        <input type="text" class="exp-display-name" value="${escHtml(entry.displayName)}" placeholder="${escHtml(stemOf(entry.name))}"/>
      </div>
    </div>`;
  }
  return `<div class="expand-grid">
    <div class="exp-field">
      <label><i class="fas fa-book-open"></i>Page Range</label>
      <input type="text" class="exp-range" value="${escHtml(entry.range)}" placeholder="all" maxlength="120"
        aria-label="Page range for ${escHtml(entry.name)}"/>
      <div class="range-hint">e.g. 1-3,5 · odd · even · first 3 · last 2</div>
      <div class="range-btns">
        <button class="rbtn" data-r="all">All</button>
        <button class="rbtn" data-r="odd">Odd</button>
        <button class="rbtn" data-r="even">Even</button>
        <button class="rbtn" data-r="first 2">First 2</button>
        <button class="rbtn" data-r="last 2">Last 2</button>
      </div>
    </div>
    <div class="exp-field">
      <label><i class="fas fa-lock"></i>Password <small>(if encrypted)</small></label>
      <input type="password" class="exp-pwd" value="${escHtml(entry.pwd)}" placeholder="Leave blank if none"
        autocomplete="current-password" aria-label="Password for ${escHtml(entry.name)}"/>
    </div>
    <div class="exp-field">
      <label><i class="fas fa-tag"></i>Display Name <small>(for TOC)</small></label>
      <input type="text" class="exp-display-name" value="${escHtml(entry.displayName)}" placeholder="${escHtml(stemOf(entry.name))}"/>
    </div>
  </div>`;
}

function wireExpandFields(div, entry) {
  const rangeIn  = div.querySelector('.exp-range');
  const pwdIn    = div.querySelector('.exp-pwd');
  const nameIn   = div.querySelector('.exp-display-name');
  const rBtns    = div.querySelectorAll('.rbtn');

  if (rangeIn) {
    rangeIn.value = entry.range;
    rangeIn.oninput = () => { entry.range = rangeIn.value.trim(); };
  }
  if (pwdIn) {
    pwdIn.value = entry.pwd;
    pwdIn.oninput = () => { entry.pwd = pwdIn.value; };
  }
  if (nameIn) {
    nameIn.value = entry.displayName;
    nameIn.oninput = () => { entry.displayName = nameIn.value.trim(); };
  }
  rBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (rangeIn) { rangeIn.value = btn.dataset.r; entry.range = btn.dataset.r; }
    });
  });
}

function refreshCard(entryId) {
  const existing = D?.fList?.querySelector(`[data-id="${entryId}"]`);
  if (!existing) return;
  const idx = FILES.findIndex(e => e.id === entryId);
  if (idx < 0) return;
  const entry = FILES[idx];
  const wasExpanded = existing.classList.contains('expanded');
  const newCard = buildCard(entry, idx);
  if (wasExpanded) {
    newCard.classList.add('expanded');
    const eb = newCard.querySelector('.expand-btn');
    if (eb) { eb.classList.add('active'); eb.setAttribute('aria-expanded', 'true'); }
    const expand = newCard.querySelector('.card-expand');
    if (expand) {
      expand.style.display = 'block';
      wireExpandFields(newCard, entry);
    }
  }
  D.fList.replaceChild(newCard, existing);
  updateStats();
}

function escHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ════ TOUCH SWIPE DELETE ════ */
function addTouchSwipe(card, entryId) {
  let startX = 0, moved = false, dx = 0;
  card.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX; moved = false; dx = 0;
    card.style.transition = 'none';
  }, { passive: true });
  card.addEventListener('touchmove', e => {
    dx = e.touches[0].clientX - startX;
    if (dx < -20) {
      moved = true;
      card.style.transform = `translateX(${Math.max(dx, -160)}px)`;
      card.style.opacity = String(1 + dx / 240);
    }
  }, { passive: true });
  card.addEventListener('touchend', () => {
    card.style.transition = '';
    if (moved && dx < -120) {
      const idx = FILES.findIndex(e => e.id === entryId);
      if (idx >= 0) removeFile(entryId, idx);
    } else {
      card.style.transform = '';
      card.style.opacity = '';
    }
    moved = false;
  });
}

/* ════ REMOVE FILE ════ */
function removeFile(entryId, idx) {
  const entry = FILES[idx];
  if (!entry) return;
  const card = D?.fList?.querySelector(`[data-id="${entryId}"]`);
  if (card) card.classList.add('removing');

  // Undo stack
  _deletedStack.push({ entry, idx: idx < FILES.length ? idx : FILES.length - 1 });
  if (_deletedStack.length > 5) _deletedStack.shift();
  showUndoBar(entry.name);

  setTimeout(() => {
    FILES.splice(FILES.findIndex(e => e.id === entryId), 1);
    rebuildList();
    updateStats();
    updatePreviewStrip();
    checkLargeBanner();
    syncMergeBtn();
    if (FILES.length < 2) {
      showSection('upload');
    }
  }, 260);

  window.SOUNDS?.playFileRemoveSound?.();
}

/* ════ UNDO ════ */
function showUndoBar(name) {
  if (!D?.undoBar) return;
  if (D.undoName) D.undoName.textContent = name.slice(0, 40);
  D.undoBar.classList.add('show');
  clearTimeout(_undoTimer);
  _undoTimer = setTimeout(() => D.undoBar.classList.remove('show'), 4500);
}

function hideUndoBar() {
  if (!D?.undoBar) return;
  clearTimeout(_undoTimer);
  D.undoBar.classList.remove('show');
}

function undoLastDelete() {
  if (!_deletedStack.length) return;
  const { entry, idx } = _deletedStack.pop();
  const safeIdx = Math.min(idx, FILES.length);
  FILES.splice(safeIdx, 0, entry);
  rebuildList();
  updateStats();
  updatePreviewStrip();
  checkLargeBanner();
  syncMergeBtn();
  if (FILES.length >= 2) showSection('files');
  hideUndoBar();
  window.SOUNDS?.playToggleOnSound?.();
  toast(`Restored: ${entry.name}`, 'success', 2500);
}

/* ════ STATS ════ */
function updateStats() {
  const totalSize  = FILES.reduce((a, f) => a + f.size, 0);
  const totalPages = FILES.reduce((a, f) => a + (f.pages || 0), 0);
  const estSec     = Math.max(1, Math.ceil(totalSize / (1024 * 1024 * 2.4)));
  const estStr     = estSec < 10  ? `~${estSec}s`
                   : estSec < 60  ? `~${estSec}s`
                   : `~${Math.ceil(estSec/60)}m`;

  if (D?.stSize)  D.stSize.textContent  = fmtSize(totalSize);
  if (D?.stPages) D.stPages.textContent = totalPages > 0 ? totalPages.toString() : '—';
  if (D?.stEst)   D.stEst.textContent   = totalSize > 0 ? estStr : '—';
}

/* ════ LARGE FILE BANNER ════ */
function checkLargeBanner() {
  if (!D?.largeBanner) return;
  const large = FILES.filter(f => f.size >= LARGE_FILE_WARN);
  if (large.length) {
    D.largeBanner.hidden = false;
    D.largeBanner.innerHTML = `<strong>${large.length} large file${large.length > 1 ? 's' : ''}</strong>: merge may take longer. ${large.map(f => f.name.slice(0,30)).join(', ')}`;
    window.SOUNDS?.playWarningSound?.();
  } else {
    D.largeBanner.hidden = true;
  }
}

/* ════ MERGE ORDER PREVIEW ════ */
function updatePreviewStrip() {
  if (!D?.mergePreview || !D?.mpStrip) return;
  if (FILES.length < 2) { D.mergePreview.hidden = true; return; }
  D.mergePreview.hidden = false;
  D.mpStrip.innerHTML = FILES.map((f, i) => `
    <span class="op-chip" title="${escHtml(f.name)}">${escHtml(stemOf(f.name).slice(0,14))}</span>
    ${i < FILES.length - 1 ? '<span class="op-chip arrow" aria-hidden="true"><i class="fas fa-chevron-right"></i></span>' : ''}
  `).join('');
}

/* ════ MERGE BUTTON SYNC ════ */
function syncMergeBtn() {
  if (!D?.mergeBtn) return;
  const ready = FILES.length >= 2;
  D.mergeBtn.disabled = !ready;
  D.mergeBtn.classList.toggle('ready', ready);
  if (D.mCount) {
    if (FILES.length >= 2) {
      D.mCount.textContent = `${FILES.length} files`;
      D.mCount.hidden = false;
    } else {
      D.mCount.hidden = true;
    }
  }
}

/* ════ PRESETS ════ */
const PRESETS = {
  quick:   { toc: false, sep: false, bookmarks: true,  compress: false, dedup: false, norm: false, method: 'auto',  tip: '⚡ Fastest merge — all pages, all bookmarks, no extras.' },
  report:  { toc: true,  sep: true,  bookmarks: true,  compress: true,  dedup: true,  norm: true,  method: 'auto',  tip: '📊 Professional report — TOC, separators, normalized pages.' },
  compact: { toc: false, sep: false, bookmarks: false, compress: true,  dedup: true,  norm: false, method: 'auto',  tip: '📦 Smallest file — lossless compression + duplicate removal.' },
  archive: { toc: true,  sep: false, bookmarks: true,  compress: true,  dedup: false, norm: false, method: 'fitz',  tip: '🗄️ Archive quality — bookmarks + TOC + lossless compression.' },
};

function applyPreset(key) {
  const p = PRESETS[key];
  if (!p || !D) return;
  window.SOUNDS?.playPresetSound?.();
  _activePreset = key;

  // Toggle active class
  document.querySelectorAll('.pre-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.p === key);
    b.setAttribute('aria-pressed', String(b.dataset.p === key));
  });

  if (D.optToc)       { D.optToc.checked       = p.toc;       D.optToc.dispatchEvent(new Event('change')); }
  if (D.optSep)       { D.optSep.checked       = p.sep;       }
  if (D.optBookmarks) { D.optBookmarks.checked = p.bookmarks; }
  if (D.optCompress)  { D.optCompress.checked  = p.compress;  }
  if (D.optDedup)     { D.optDedup.checked     = p.dedup;     }
  if (D.optNorm)      {
    D.optNorm.checked = p.norm;
    if (D.normSzField) D.normSzField.hidden = !p.norm;
  }
  if (D.optMethod)    { D.optMethod.value = p.method;  }
  if (D.preTip)       { D.preTip.textContent = p.tip;   }
  // Expand advanced options to show what changed
  if (D.optsBody && D.optsToggle) {
    D.optsBody.hidden = false;
    D.optsToggle.setAttribute('aria-expanded', 'true');
  }
  saveSettings();
}

/* ════ SETTINGS PERSISTENCE ════ */
function saveSettings() {
  if (!D) return;
  try {
    const s = {
      toc:      D.optToc?.checked,
      sep:      D.optSep?.checked,
      bookmarks:D.optBookmarks?.checked,
      compress: D.optCompress?.checked,
      dedup:    D.optDedup?.checked,
      norm:     D.optNorm?.checked,
      method:   D.optMethod?.value,
      tgtSz:    D.optTargetSize?.value,
    };
    localStorage.setItem(SET_KEY, JSON.stringify(s));
  } catch(_) {}
}

function loadSettings() {
  if (!D) return;
  try {
    const raw = localStorage.getItem(SET_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (D.optToc       && s.toc       != null) D.optToc.checked       = s.toc;
    if (D.optSep       && s.sep       != null) D.optSep.checked       = s.sep;
    if (D.optBookmarks && s.bookmarks != null) D.optBookmarks.checked = s.bookmarks;
    if (D.optCompress  && s.compress  != null) D.optCompress.checked  = s.compress;
    if (D.optDedup     && s.dedup     != null) D.optDedup.checked     = s.dedup;
    if (D.optNorm      && s.norm      != null) {
      D.optNorm.checked = s.norm;
      if (D.normSzField) D.normSzField.hidden = !s.norm;
    }
    if (D.optMethod     && s.method)  D.optMethod.value     = s.method;
    if (D.optTargetSize && s.tgtSz)   D.optTargetSize.value = s.tgtSz;
  } catch(_) {}
}

/* ════ MERGE COUNT ════ */
function getMergeCount() {
  try { return parseInt(localStorage.getItem(CNT_KEY) || '0', 10); } catch(_) { return 0; }
}
function incMergeCount() {
  try {
    const n = getMergeCount() + 1;
    localStorage.setItem(CNT_KEY, String(n));
    return n;
  } catch(_) { return 1; }
}
function updateHeroCnt() {
  const n = getMergeCount();
  const el = $('heroCnt'), num = $('heroCntN');
  if (el && num && n > 0) { num.textContent = n.toLocaleString(); el.hidden = false; }
}

/* ════ MERGE ════ */
async function startMerge() {
  if (FILES.length < 2) { toast('Add at least 2 files to merge', 'warn'); return; }
  window.SOUNDS?.resume?.();
  D.mergeBtn.disabled = true;
  D.mergeBtn.classList.remove('ready');
  _mergeSt = Date.now();
  window.SOUNDS?.playMergeStartSound?.();
  showSection('progress');
  $('secProgress')?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const fd = new FormData();
  FILES.forEach(e => fd.append('files', e.file, e.name));
  fd.append('page_ranges',         JSON.stringify(FILES.map(e => e.range || 'all')));
  fd.append('passwords',           JSON.stringify(FILES.map(e => e.pwd || '')));
  fd.append('display_names',       JSON.stringify(FILES.map(e => e.displayName || '')));
  fd.append('file_types',          JSON.stringify(FILES.map(e => e.imgConverted ? 'img' : 'pdf')));
  fd.append('add_toc',             String(D.optToc?.checked ?? false));
  fd.append('add_separators',      String(D.optSep?.checked ?? false));
  fd.append('preserve_bookmarks',  String(D.optBookmarks?.checked ?? true));
  fd.append('compress_output',     String(D.optCompress?.checked ?? false));
  fd.append('skip_duplicates',     String(D.optDedup?.checked ?? false));
  fd.append('normalize_page_size', String(D.optNorm?.checked ?? false));
  fd.append('target_page_size',    D.optTargetSize?.value || 'A4');
  fd.append('merge_method',        D.optMethod?.value || 'auto');
  fd.append('output_title',        (D.optTitle?.value || '').trim());
  fd.append('output_author',       (D.optAuthor?.value || '').trim());
  fd.append('output_filename',     smartName());
  _jobId = genId();
  fd.append('job_id', _jobId);

  openSSE(_jobId);
  stepProg(0);
  setProg(5, 'Uploading…', `Sending ${FILES.length} file${FILES.length > 1 ? 's' : ''}`);

  try {
    const resp = await fetch('/api/merge-pdf', { method: 'POST', body: fd });
    closeSSE();
    if (!resp.ok) {
      let msg = `Server error (${resp.status})`;
      try { const j = await resp.json(); msg = j.error || msg; } catch(_) {}
      throw new Error(msg);
    }

    const totalPages   = parseInt(resp.headers.get('X-Total-Pages')   || '0', 10) || 0;
    const srcCount     = parseInt(resp.headers.get('X-Source-Count')  || '0', 10) || FILES.length;
    const methodUsed   = resp.headers.get('X-Method-Used')            || 'pypdf';
    const outputSize   = parseInt(resp.headers.get('X-Output-Size')   || '0', 10) || 0;
    const skippedDups  = parseInt(resp.headers.get('X-Skipped-Dupes') || '0', 10) || 0;
    const qualityScore = parseInt(resp.headers.get('X-Quality-Score') || '100', 10);
    const qualityGrade = resp.headers.get('X-Quality-Grade')          || 'A+';

    _dlBlob = await resp.blob();
    if (_dlUrl) URL.revokeObjectURL(_dlUrl);
    _dlUrl  = URL.createObjectURL(_dlBlob);
    _dlName = smartName();

    incMergeCount();
    saveSettings();
    setProg(100, 'Done!', 'Merge complete — ready to download');
    stepProg(3);
    await new Promise(r => setTimeout(r, 380));
    showResult(totalPages, srcCount, methodUsed, outputSize, skippedDups, _dlBlob.size, qualityScore, qualityGrade);
    updateHeroCnt();

  } catch(err) {
    closeSSE();
    window.SOUNDS?.playErrorSound?.();
    const raw = err.message || '';
    let msg = raw || 'Merge failed — check your files and try again';
    let hint = '';
    if (/password|decrypt/i.test(raw))    hint = 'Expand the locked file card and enter its password.';
    else if (/corrupt|invalid/i.test(raw)) hint = 'Try a different merge engine in Advanced Options.';
    else if (/memory|ram/i.test(raw))      hint = 'Merge smaller batches to reduce memory usage.';
    else if (/timeout/i.test(raw))         hint = 'Large files may time out. Try splitting into batches.';
    else if (/format|unsupported/i.test(raw)) hint = 'Re-save the PDF with your PDF reader, then re-upload.';
    if (hint) msg += ` — ${hint}`;
    toast(msg, 'error', 12000);
    showSection('files');
    syncMergeBtn();
  }
}

/* ════ SSE ════ */
function openSSE(jobId) {
  simProgress();
  try {
    _sse = new EventSource(`/api/merge-pdf/progress/${jobId}`);
    _sse.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        if (d.ping || d.done) return;
        const pct = typeof d.pct === 'number' ? d.pct : 0;
        const cur = parseFloat(D?.pbar?.style.width || '0');
        if (pct > cur) {
          setProg(pct, d.title || undefined, d.sub || undefined);
          stepProg(pct < 20 ? 0 : pct < 55 ? 1 : pct < 85 ? 2 : 3);
          window.SOUNDS?.playProgressTick?.();
          if (d.sub && D?.progFileInfo) D.progFileInfo.textContent = d.sub;
        }
      } catch(_) {}
    };
    _sse.onerror = () => closeSSE();
  } catch(_) {}
}

function closeSSE() {
  if (_sse) { _sse.close(); _sse = null; }
  clearInterval(_simTimer);
}

function simProgress() {
  let pct = 8; clearInterval(_simTimer);
  const steps = [
    { at: 15, t: 'Reading files…',   s: 'Parsing PDF structure' },
    { at: 30, t: 'Processing…',      s: 'Merging pages' },
    { at: 55, t: 'Optimizing…',      s: 'Rebuilding structure' },
    { at: 78, t: 'Finalizing…',      s: 'Writing output PDF' },
  ];
  let si = 0;
  _simTimer = setInterval(() => {
    const cur = parseFloat(D?.pbar?.style.width || '0');
    if (cur < pct && pct < 85) {
      const st = si < steps.length && pct >= steps[si].at ? steps[si++] : null;
      setProg(pct, st?.t, st?.s);
      stepProg(pct < 22 ? 0 : pct < 55 ? 1 : 2);
    }
    pct = Math.min(pct + (Math.random() * 3 + 0.5), 85);
    if (pct >= 85) clearInterval(_simTimer);
  }, 440);
}

function setProg(pct, title, sub) {
  if (!D) return;
  pct = Math.min(100, Math.max(0, pct));
  // Progress bar
  if (D.pbar) {
    D.pbar.style.width = pct + '%';
    D.pbar.parentElement?.setAttribute('aria-valuenow', String(Math.round(pct)));
  }
  // Ring
  if (D.ring) {
    const circ = 326.7;
    D.ring.style.strokeDashoffset = String(circ - (pct / 100) * circ);
  }
  if (D.ringPct) D.ringPct.textContent = Math.round(pct) + '%';
  if (title && D.progTitle) D.progTitle.textContent = title;
  if (sub   && D.progSub)   D.progSub.textContent   = sub;
}

function stepProg(step) {
  // 0=upload, 1=process, 2=optimize, 3=done
  [D?.ps1, D?.ps2, D?.ps3, D?.ps4].forEach((el, i) => {
    if (!el) return;
    el.classList.remove('active', 'done');
    if (i < step)  el.classList.add('done');
    if (i === step) el.classList.add('active');
  });
}

/* ════ RESULT ════ */
function showResult(totalPages, srcCount, methodUsed, outputSize, skippedDups, blobSize, qualityScore = 100, qualityGrade = 'A+') {
  window.SOUNDS?.playSuccessChime?.();
  showSection('result');
  $('secResult')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const elapsed = ((Date.now() - _mergeSt) / 1000).toFixed(1) + 's';
  const totalIn = FILES.reduce((a, f) => a + f.size, 0);
  const sz      = outputSize || blobSize;
  const chg     = totalIn > 0 ? ((sz - totalIn) / totalIn * 100) : 0;

  // Confetti 🎉
  setTimeout(() => {
    if (typeof confetti !== 'undefined') {
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.55 },
        colors: ['#6366f1','#8b5cf6','#a78bfa','#22c55e','#ffffff','#f59e0b'] });
      setTimeout(() => confetti({ particleCount: 55, spread: 46, origin: { x: 0.1, y: 0.6 },
        colors: ['#6366f1','#8b5cf6','#22c55e'] }), 280);
      setTimeout(() => confetti({ particleCount: 55, spread: 46, origin: { x: 0.9, y: 0.6 },
        colors: ['#6366f1','#a78bfa','#ffffff'] }), 460);
    }
  }, 700);

  // Animate stats
  const animVal = (el, target, suffix = '') => {
    if (!el) return;
    if (typeof anime !== 'undefined' && typeof target === 'number') {
      const obj = { val: 0 };
      anime({ targets: obj, val: target, duration: 1000, easing: 'easeOutExpo',
        update: () => { el.textContent = Math.round(obj.val) + suffix; } });
    } else {
      el.textContent = target + suffix;
    }
  };

  animVal($('rFiles'), srcCount);
  animVal($('rPages'), totalPages);
  if ($('rSize')) $('rSize').textContent = fmtSize(sz);

  // Meta
  if ($('rTime'))   $('rTime').innerHTML   = `<i class="fas fa-stopwatch"></i>${elapsed}`;
  if ($('rEngine')) $('rEngine').innerHTML = `<i class="fas fa-cogs"></i>${methodUsed}`;
  const chgStr = chg > 0.5  ? `+${chg.toFixed(1)}% larger`
               : chg < -0.5 ? `${Math.abs(chg).toFixed(1)}% smaller`
               : 'Same size';
  if ($('rSaved')) $('rSaved').innerHTML = `<i class="fas fa-scale-balanced"></i>${chgStr}`;
  if ($('rDupes') && skippedDups > 0) {
    $('rDupes').innerHTML = `<i class="fas fa-clone"></i>${skippedDups} dup${skippedDups>1?'s':''} skipped`;
    $('rDupes').hidden = false;
  }

  // Quality badge
  const qEl = $('qScore'), qGr = $('qGrade'), qNm = $('qNum');
  if (qEl && qGr && qNm) {
    const GRADE_COL = { 'A+':'#22c55e','A':'#22c55e','B+':'#84cc16','B':'#eab308','C+':'#f97316','C':'#f97316','D':'#ef4444','F':'#ef4444' };
    const col = GRADE_COL[qualityGrade] || '#22c55e';
    qGr.textContent = qualityGrade;
    qNm.textContent = `${qualityScore}/100`;
    qEl.style.setProperty('--qc', col);
    qEl.style.borderColor = col;
    qEl.hidden = false;
    if (typeof anime !== 'undefined') {
      anime({ targets: qEl, opacity: [0, 1], scale: [0.8, 1], duration: 550, easing: 'easeOutBack', delay: 500 });
    }
  }

  // Filename
  const fn = $('resFn'), fnTx = $('resFnTx');
  if (fn && fnTx) { fnTx.textContent = _dlName; fn.hidden = false; }

  // Sub text
  const sub = $('resSub');
  if (sub) sub.textContent = `${srcCount} files merged into ${_dlName}`;

  // Chart
  const inputSzCh = FILES.reduce((a, f) => a + f.size, 0);
  const outSzCh   = outputSize || blobSize;
  const ctxEl = $('sizeChart'), cw = $('chartWrap');
  if (ctxEl && cw && typeof Chart !== 'undefined') {
    if (_sizeChart) { _sizeChart.destroy(); _sizeChart = null; }
    const isDark = document.documentElement.dataset.theme !== 'light';
    const tickCol  = isDark ? '#64748b' : '#94a3b8';
    const gridCol  = isDark ? 'rgba(99,102,241,.07)' : 'rgba(99,102,241,.05)';
    const smaller  = outSzCh <= inputSzCh;
    _sizeChart = new Chart(ctxEl, {
      type: 'bar',
      data: {
        labels: [`Input (${FILES.length} file${FILES.length>1?'s':''})`, 'Merged Output'],
        datasets: [{
          data: [inputSzCh, outSzCh],
          backgroundColor: ['rgba(99,102,241,.28)', smaller ? 'rgba(34,197,94,.28)' : 'rgba(245,158,11,.28)'],
          borderColor:     ['rgb(99,102,241)', smaller ? 'rgb(34,197,94)' : 'rgb(245,158,11)'],
          borderWidth: 1.5, borderRadius: 6,
        }],
      },
      options: {
        responsive: true, indexAxis: 'y',
        animation: { duration: 800, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => '  ' + fmtSize(c.raw) } },
        },
        scales: {
          x: { ticks: { callback: v => fmtSize(v), color: tickCol, font: { size: 9 } }, grid: { color: gridCol } },
          y: { ticks: { color: tickCol, font: { size: 9 } }, grid: { display: false } },
        },
      },
    });
    cw.hidden = false;
    if (typeof anime !== 'undefined') {
      anime({ targets: cw, opacity: [0, 1], translateY: [10, 0], duration: 580, easing: 'easeOutCubic', delay: 320 });
    }
  }

  // Tip
  const tipEl = $('resTip');
  if (tipEl) {
    const tips = [
      'Tip: Press <kbd>Ctrl+S</kbd> to download anytime after merging.',
      'Tip: Click "Merge Again" to start a new merge.',
      'Tip: Use page ranges like <kbd>odd</kbd> or <kbd>1-3,5</kbd> in Advanced Options.',
      'Tip: Enable "Table of Contents" for professional report merges.',
      'Tip: Share this tool on WhatsApp — your friends will love it!',
      'Tip: Password-protected PDFs? Expand the file card to enter the password.',
    ];
    if ($('resTipTx')) $('resTipTx').innerHTML = tips[Math.floor(Math.random() * tips.length)];
    tipEl.hidden = false;
  }

  // GSAP entrance
  if (typeof gsap !== 'undefined') {
    gsap.from('.result-card', { y: 28, duration: 0.55, ease: 'back.out(1.4)' });
  }
}

/* ════ DOWNLOAD ════ */
function doDownload() {
  if (!_dlUrl) return;
  window.SOUNDS?.playDownloadWhoosh?.(); // fahhhhh.mp3
  const a = document.createElement('a');
  a.href = _dlUrl; a.download = _dlName;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  toast(`Downloading: ${_dlName}`, 'success', 3500);
}

/* ════ PREVIEW MODAL ════ */
function openPreview(entry) {
  if (!D?.pvModal) return;
  D.pvModal.removeAttribute('hidden');
  if ($('pvTitle')) $('pvTitle').textContent = entry.name;
  if (D.pvBody) D.pvBody.innerHTML = `<div class="pv-loading"><i class="fas fa-spinner fa-spin fa-2x"></i><span>Loading preview…</span></div>`;
  renderPreviewContent(entry);
}

async function renderPreviewContent(entry) {
  if (!D?.pvBody) return;
  if (entry.imgConverted) {
    const url = URL.createObjectURL(entry.file);
    D.pvBody.innerHTML = `<div class="pv-img-wrap"><img src="${url}" alt="Preview" onload="URL.revokeObjectURL(this.src)"/></div>`;
    return;
  }
  if (typeof pdfjsLib === 'undefined') {
    D.pvBody.innerHTML = `<div class="pv-err"><i class="fas fa-triangle-exclamation"></i><span>PDF.js not loaded — preview unavailable</span></div>`;
    return;
  }
  try {
    const buf = await entry.file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf), password: entry.pwd || '' }).promise;
    const metaHtml = `<div class="pv-doc-meta">
      <span><i class="fas fa-book-open"></i>${pdf.numPages} page${pdf.numPages>1?'s':''}</span>
      <span><i class="fas fa-database"></i>${fmtSize(entry.size)}</span>
    </div>`;
    const grid = document.createElement('div');
    grid.className = 'pv-grid';
    const limit = Math.min(pdf.numPages, 12);
    for (let p = 1; p <= limit; p++) {
      const page = await pdf.getPage(p);
      const vp   = page.getViewport({ scale: 0.65 });
      const cv   = document.createElement('canvas');
      cv.width = vp.width; cv.height = vp.height;
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      const wrap = document.createElement('div'); wrap.className = 'pv-pg';
      const num  = document.createElement('div'); num.className = 'pv-pn'; num.textContent = p;
      wrap.appendChild(cv); wrap.appendChild(num); grid.appendChild(wrap);
    }
    D.pvBody.innerHTML = metaHtml;
    D.pvBody.appendChild(grid);
    if (pdf.numPages > 12) {
      D.pvBody.insertAdjacentHTML('beforeend', `<div class="pv-more">Showing 12 of ${pdf.numPages} pages</div>`);
    }
  } catch(err) {
    const isPass = String(err).toLowerCase().includes('password');
    D.pvBody.innerHTML = isPass
      ? `<div class="pv-err"><i class="fas fa-lock"></i><span>Password-protected PDF — expand the file card and enter the password first</span></div>`
      : `<div class="pv-err"><i class="fas fa-triangle-exclamation"></i><span>Could not render preview</span></div>`;
  }
}

function closePreview() {
  if (D?.pvModal) D.pvModal.hidden = true;
  if (D?.pvBody)  D.pvBody.innerHTML = '';
}

/* ════ PDF.JS LAZY LOADER ════ */
function loadPdfJs() {
  if (typeof pdfjsLib !== 'undefined') return;
  const s = document.createElement('script');
  s.src = PDFJS_CDN;
  s.onload = () => {
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WRK;
      FILES.filter(e => !e.imgConverted && !e._metaRead).forEach(e => readPdfMeta(e));
    }
  };
  document.head.appendChild(s);
}

/* ════ CANVAS PARTICLES ════ */
function initCanvas() {
  const cv = $('bgCanvas'); if (!cv) return;
  const ctx = cv.getContext('2d');
  let W, H, pts = [];
  const resize = () => { W = cv.width = window.innerWidth; H = cv.height = window.innerHeight; };
  resize();
  window.addEventListener('resize', resize, { passive: true });
  const N = Math.min(Math.floor(window.innerWidth / 16), 70);
  for (let i = 0; i < N; i++) {
    pts.push({ x: Math.random()*1100, y: Math.random()*900, vx:(Math.random()-.5)*.26, vy:(Math.random()-.5)*.26, r:Math.random()*1.3+.4, a:Math.random() });
  }
  const isDark = () => document.documentElement.dataset.theme !== 'light';
  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    const col = isDark() ? '139,92,246' : '99,102,241';
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(${col},${p.a*.45})`; ctx.fill();
    });
    for (let i = 0; i < pts.length; i++) {
      for (let j = i+1; j < pts.length; j++) {
        const dx = pts[i].x-pts[j].x, dy = pts[i].y-pts[j].y;
        const d = Math.sqrt(dx*dx+dy*dy);
        if (d < 105) {
          ctx.strokeStyle = `rgba(${col},${.1-d/105*.1})`;
          ctx.lineWidth = .45;
          ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y); ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  };
  draw();
}

/* ════ TYPED.JS ════ */
function initTyped() {
  const el = $('heroTyped'); if (!el) return;
  if (typeof Typed !== 'undefined') {
    if (_typedInst) { _typedInst.destroy(); _typedInst = null; }
    _typedInst = new Typed(el, {
      strings: [
        'Drag &amp; drop to reorder',
        'Select specific page ranges',
        'Merge password-protected PDFs',
        'Add Table of Contents automatically',
        'Mix PDFs with images — all formats',
        'Lossless compression, zero quality loss',
        'Up to 50 files at once',
        '100% free, no signup needed',
      ],
      typeSpeed: 36, backSpeed: 18, backDelay: 1800,
      loop: true, smartBackspace: true, cursorChar: '|',
    });
  }
}

/* ════ FAQ ACCORDION ════ */
function initFaq() {
  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(it => {
        it.classList.remove('open');
        it.querySelector('.faq-q')?.setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

/* ════ ANIMATIONS ════ */
function initAnimations() {
  // Navbar scroll effect
  window.addEventListener('scroll', () => {
    $('navbar')?.classList.toggle('scrolled', window.scrollY > 16);
  }, { passive: true });

  // GSAP ScrollTrigger for info sections
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
    gsap.utils.toArray('.feat-card, .step-card, .rel-card').forEach((el, i) => {
      gsap.from(el, {
        scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' },
        y: 18, duration: 0.5, ease: 'power2.out', delay: (i % 4) * 0.06,
      });
    });
  }
}

/* ════ DRAG AND DROP SETUP ════ */
function setupDrop() {
  const dz = D.dz;
  const browse = dz.querySelector('.dz-browse');

  // Browse button
  if (browse) browse.addEventListener('click', e => { e.stopPropagation(); D.fi.click(); });

  // Click on zone opens picker
  dz.addEventListener('click', () => D.fi.click());
  dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); D.fi.click(); } });

  // Drag over zone
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('over'); });
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('over');
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  // Global drag overlay
  let dragCnt = 0;
  document.addEventListener('dragenter', e => { e.preventDefault(); dragCnt++; D.globalDrag?.classList.add('on'); });
  document.addEventListener('dragleave', () => { dragCnt--; if (dragCnt <= 0) { dragCnt = 0; D.globalDrag?.classList.remove('on'); } });
  document.addEventListener('dragover',  e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault(); dragCnt = 0; D.globalDrag?.classList.remove('on');
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  // File input
  D.fi.addEventListener('change', () => { if (D.fi.files.length) addFiles(D.fi.files); D.fi.value = ''; });
}

/* ════ DOMContentLoaded ════ */
document.addEventListener('DOMContentLoaded', () => {

  /* ── DOM refs ── */
  D = {
    sUp: $('secUpload'),   sFi: $('secFiles'),
    sPr: $('secProgress'), sRe: $('secResult'),
    mobileFab: $('mobileFab'),
    dz: $('dropZone'), fi: $('fileInput'),
    globalDrag: $('globalDrag'),
    fList: $('fileList'), fileBadge: $('fileBadge'),
    stPages: $('stPages'), stSize: $('stSize'), stEst: $('stEst'),
    largeBanner: $('largeBanner'),
    mergePreview: $('mergePreview'), mpStrip: $('mpStrip'),
    preTip: $('preTip'),
    optsToggle: $('optsToggle'), optsBody: $('optsBody'), optsArr: $('optsArr'),
    optMethod: $('optMethod'), optFilename: $('optFilename'),
    optTitle: $('optTitle'), optAuthor: $('optAuthor'),
    optToc: $('optToc'), optSep: $('optSep'),
    optBookmarks: $('optBookmarks'), optCompress: $('optCompress'),
    optDedup: $('optDedup'), optNorm: $('optNorm'),
    optTargetSize: $('optTargetSize'), normSzField: $('normSzField'),
    mergeBtn: $('mergeBtn'), mCount: $('mCount'),
    ring: $('ringFg'), pbar: $('pbar'), pbarWrap: $('pbarWrap'),
    ringPct: $('ringPct'), progTitle: $('progTitle'),
    progSub: $('progSub'), progFileInfo: $('progFileInfo'),
    ps1: $('ps1'), ps2: $('ps2'), ps3: $('ps3'), ps4: $('ps4'),
    dlBtn: $('dlBtn'), copyNameBtn: $('copyNameBtn'),
    printBtn: $('printBtn'), shareBtn: $('shareBtn'),
    waShareBtn: $('waShareBtn'), mergeAgainBtn: $('mergeAgainBtn'),
    toast: $('toast'),
    undoBar: $('undoBar'), undoName: $('undoName'), undoBtn: $('undoBtn'),
    addMoreBtn: $('addMoreBtn'), addMore: $('addMoreInput'), clearBtn: $('clearBtn'),
    kbdBtn: $('kbdBtn'), kbdModal: $('kbdModal'), kbdClose: $('kbdClose'),
    pvModal: $('pvModal'), pvClose: $('pvClose'), pvBody: $('pvBody'),
    soundToggle: $('soundToggle'), soundIcon: $('soundIcon'),
    themeToggle: $('themeToggle'), themeIcon: $('themeIcon'),
  };

  /* ── Initial section ── */
  showSection('upload');

  /* ── Setup ── */
  setupDrop();
  loadSettings();
  initFaq();
  initAnimations();
  initCanvas();
  setTimeout(initTyped, 900);
  updateHeroCnt();

  /* ── Sort buttons ── */
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.sort;
      if (s === _sortMode) return;
      _sortMode = s;
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === s));
      if (s === 'name') FILES.sort((a, b) => a.name.localeCompare(b.name));
      if (s === 'size') FILES.sort((a, b) => b.size - a.size);
      if (s !== 'order') { rebuildList(); updatePreviewStrip(); window.SOUNDS?.playSortSound?.(); }
    });
  });

  /* ── Preset buttons ── */
  document.querySelectorAll('.pre-btn').forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.p));
  });

  /* ── Advanced options toggle ── */
  if (D.optsToggle && D.optsBody) {
    D.optsToggle.addEventListener('click', () => {
      const open = D.optsBody.hidden;
      D.optsBody.hidden = !open;
      D.optsToggle.setAttribute('aria-expanded', String(open));
    });
  }

  /* ── Normalize page size toggle ── */
  if (D.optNorm && D.normSzField) {
    D.optNorm.addEventListener('change', () => {
      D.normSzField.hidden = !D.optNorm.checked;
    });
  }

  /* ── Options save on change ── */
  ['optToc','optSep','optBookmarks','optCompress','optDedup','optNorm','optMethod','optTargetSize'].forEach(id => {
    $(id)?.addEventListener('change', saveSettings);
  });

  /* ── Merge button ── */
  if (D.mergeBtn) D.mergeBtn.addEventListener('click', startMerge);

  /* ── Download ── */
  if (D.dlBtn) D.dlBtn.addEventListener('click', doDownload);

  /* ── Copy filename ── */
  if (D.copyNameBtn) {
    D.copyNameBtn.addEventListener('click', () => {
      if (!_dlName) return;
      navigator.clipboard?.writeText(_dlName).then(() => {
        toast(`Copied: ${_dlName}`, 'success', 2500);
        window.SOUNDS?.playCopySound?.();
      }).catch(() => toast('Copy failed', 'warn'));
    });
  }

  /* ── Print ── */
  if (D.printBtn) {
    D.printBtn.addEventListener('click', () => {
      if (!_dlUrl) return;
      const w = window.open(_dlUrl, '_blank');
      if (w) { w.onload = () => { w.focus(); w.print(); }; }
    });
  }

  /* ── Share ── */
  if (D.shareBtn) {
    D.shareBtn.addEventListener('click', async () => {
      const url = 'https://ishutools.fun/tools/merge-pdf/';
      if (navigator.share) {
        try { await navigator.share({ title: 'Merge PDF Free — IshuTools', url }); } catch(_) {}
      } else {
        await navigator.clipboard?.writeText(url);
        toast('Link copied!', 'success', 2200);
      }
    });
  }

  /* ── WhatsApp share ── */
  if (D.waShareBtn) {
    D.waShareBtn.addEventListener('click', () => {
      const url = encodeURIComponent('https://ishutools.fun/tools/merge-pdf/');
      const text = encodeURIComponent('✅ Free PDF Merger — No signup, no watermark! Combine PDFs + images instantly: ');
      window.open(`https://wa.me/?text=${text}${url}`, '_blank');
    });
  }

  /* ── Merge Again ── */
  if (D.mergeAgainBtn) {
    D.mergeAgainBtn.addEventListener('click', () => {
      FILES = []; _dlBlob = null; _dlUrl = null; _dlName = '';
      _deletedStack = []; _activePreset = null;
      if (_sizeChart) { _sizeChart.destroy(); _sizeChart = null; }
      window.SOUNDS?.playMergeAgainSound?.();
      showSection('upload');
    });
  }

  /* ── Add more files ── */
  if (D.addMoreBtn && D.addMore) {
    D.addMoreBtn.addEventListener('click', () => D.addMore.click());
    D.addMore.addEventListener('change', () => { if (D.addMore.files.length) addFiles(D.addMore.files); D.addMore.value = ''; });
  }

  /* ── Clear all ── */
  if (D.clearBtn) {
    D.clearBtn.addEventListener('click', () => {
      if (!FILES.length) return;
      FILES = []; _deletedStack = [];
      rebuildList(); updateStats(); updatePreviewStrip(); checkLargeBanner(); syncMergeBtn();
      showSection('upload');
      window.SOUNDS?.playFileRemoveSound?.();
    });
  }

  /* ── Sound toggle ── */
  const syncSound = () => {
    const on = window.SOUNDS?.isEnabled?.() ?? true;
    if (D.soundIcon) {
      D.soundIcon.className = on ? 'fas fa-volume-high' : 'fas fa-volume-xmark';
    }
    if (D.soundToggle) D.soundToggle.setAttribute('aria-label', on ? 'Mute sounds' : 'Unmute sounds');
  };
  syncSound();
  if (D.soundToggle) {
    D.soundToggle.addEventListener('click', () => {
      window.SOUNDS?.toggle?.();
      syncSound();
      const on = window.SOUNDS?.isEnabled?.() ?? true;
      if (on) window.SOUNDS?.playToggleOnSound?.();
    });
  }

  /* ── Theme toggle ── */
  const syncTheme = () => {
    const isDark = document.documentElement.dataset.theme !== 'light';
    if (D.themeIcon) D.themeIcon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
    if (D.themeToggle) D.themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    try { localStorage.setItem('ishu-theme', isDark ? 'dark' : 'light'); } catch(_) {}
  };
  // Load saved theme
  try {
    const saved = localStorage.getItem('ishu-theme');
    if (saved === 'light') document.documentElement.dataset.theme = 'light';
  } catch(_) {}
  syncTheme();
  if (D.themeToggle) {
    D.themeToggle.addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme;
      document.documentElement.dataset.theme = cur === 'light' ? 'dark' : 'light';
      syncTheme();
    });
  }

  /* ── Keyboard shortcuts modal ── */
  if (D.kbdBtn)   D.kbdBtn.addEventListener('click',   () => { D.kbdModal.hidden = false; });
  if (D.kbdClose) D.kbdClose.addEventListener('click', () => { D.kbdModal.hidden = true;  });

  /* ── Preview modal close ── */
  if (D.pvClose) D.pvClose.addEventListener('click', closePreview);
  if (D.pvModal) {
    D.pvModal.addEventListener('click', e => { if (e.target === D.pvModal) closePreview(); });
  }

  /* ── Undo ── */
  if (D.undoBtn) D.undoBtn.addEventListener('click', undoLastDelete);

  /* ── Mobile FAB ── */
  if (D.mobileFab) {
    D.mobileFab.addEventListener('click', () => {
      if (FILES.length >= 2) startMerge();
      else D.fi.click();
    });
  }

  /* ── Keyboard shortcuts ── */
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    const inInput = ['input','textarea','select'].includes(tag);

    if (e.key === 'Escape') {
      if (D.kbdModal && !D.kbdModal.hidden) { D.kbdModal.hidden = true; return; }
      if (D.pvModal && !D.pvModal.hidden)   { closePreview(); return; }
    }
    if (inInput) return;

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'o' || e.key === 'O') { e.preventDefault(); D.fi.click(); return; }
      if (e.key === 'm' || e.key === 'M') { e.preventDefault(); if (FILES.length >= 2) startMerge(); return; }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); doDownload(); return; }
      if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undoLastDelete(); return; }
    }
    if (e.key === '?') { D.kbdModal.hidden = false; return; }

    // Alt + Arrow to move focused file
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const focused = document.activeElement?.closest('.file-card');
      if (!focused) return;
      e.preventDefault();
      const id  = focused.dataset.id;
      const idx = FILES.findIndex(f => f.id === id);
      if (idx < 0) return;
      const newIdx = e.key === 'ArrowUp' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= FILES.length) return;
      [FILES[idx], FILES[newIdx]] = [FILES[newIdx], FILES[idx]];
      rebuildList(); updatePreviewStrip();
      const cards = D.fList.querySelectorAll('.file-card');
      if (cards[newIdx]) cards[newIdx].focus();
      window.SOUNDS?.playSortSound?.();
      return;
    }

    // Delete key on focused card
    if (e.key === 'Delete') {
      const focused = document.activeElement?.closest('.file-card');
      if (!focused) return;
      const id  = focused.dataset.id;
      const idx = FILES.findIndex(f => f.id === id);
      if (idx >= 0) removeFile(id, idx);
    }
  });

  /* ── Click outside modals ── */
  if (D.kbdModal) {
    D.kbdModal.addEventListener('click', e => { if (e.target === D.kbdModal) D.kbdModal.hidden = true; });
  }

});
