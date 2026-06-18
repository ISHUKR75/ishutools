/**
 * IshuTools.fun — Merge PDF Tool v5.0
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 * Ultra-professional: SSE real-time progress, Web Audio API sounds,
 * Sortable.js drag-drop, GSAP animations, inline rename, undo/redo,
 * touch-swipe delete, PDF.js preview, canvas particles.
 */
'use strict';

/* ═══════════════ STATE ═══════════════ */
const FILES = [];
let _downloadUrl  = null;
let _downloadName = '';
let _deletedStack = [];
let _undoTimer    = null;
let _sortMode     = 'order';
let _jobId        = null;
let _sseSource    = null;
let _recentMerges = [];
let _sortable     = null;
let _mergeStart   = 0;
let _simTimer     = null;

/* ═══════════════ CONSTANTS ═══════════════ */
const MAX_FILES  = 50;
const MAX_BYTES  = 1024 * 1024 * 1024;
const IMAGE_EXTS = new Set(['.jpg','.jpeg','.png','.webp','.gif','.bmp','.tiff','.tif']);
const PDF_EXTS   = new Set(['.pdf']);
const PRESETS = {
  quick:   {tip:'Fastest merge. Bookmarks preserved. No extras.', bookmarks:true,  toc:false, sep:false, compress:false, dedup:false},
  report:  {tip:'TOC + separator pages for professional documents.', bookmarks:true, toc:true,  sep:true,  compress:false, dedup:false},
  compact: {tip:'Smallest output. Compression + duplicate removal.', bookmarks:false,toc:false, sep:false, compress:true,  dedup:true},
  archive: {tip:'All features enabled for maximum quality archive.', bookmarks:true, toc:true,  sep:true,  compress:true,  dedup:false},
};

/* ═══════════════ DOM HELPERS ═══════════════ */
const $  = id => document.getElementById(id);
const qq = sel => document.querySelector(sel);
const E  = {
  dz:       $('dropZone'),   fi:      $('fileInput'),
  addMore:  $('addMoreInput'), fl:    $('fileList'),
  sUpload:  qq('#secUpload'), sFiles: $('secFiles'),
  sProg:    $('secProgress'), sRes:   $('secResult'),
  mergeBtn: $('mergeBtn'),  mbCount: $('mergeBtnCount'),
  pTitle:   $('progTitle'), pSub:    $('progSub'),
  pBar:     $('progBar'),   ring:    $('ringFill'),
  ps1:$('ps1'),ps2:$('ps2'),ps3:$('ps3'),ps4:$('ps4'),
  sbFiles:$('sbFiles'),sbPages:$('sbPages'),sbSize:$('sbSize'),sbEst:$('sbEst'),
  rFiles:$('rFiles'),rPages:$('rPages'),rSize:$('rSize'),
  rTime:$('rTime'),rEngine:$('rEngine'),rSaved:$('rSaved'),
  resSub:$('resSub'),resFn:$('resFnRow'),resFnTx:$('resFnText'),
  dlBtn:$('downloadBtn'),copyNameBtn:$('copyNameBtn'),mergeAgainBtn:$('mergeAgainBtn'),
  recentM:$('recentMerges'),
  optToggle:$('optToggle'),optBody:$('optBody'),optChev:$('optChev'),
  optToc:$('optToc'),optSep:$('optSeparators'),optBm:$('optBookmarks'),
  optComp:$('optCompress'),optDedup:$('optSkipDupes'),optNorm:$('optNormalize'),
  optMethod:$('optMethod'),optFilename:$('optFilename'),
  optTitle:$('optTitle'),optAuthor:$('optAuthor'),
  optTargetSize:$('optTargetSize'),pgSzField:$('pageSizeField'),
  toast:$('toast'),undoBar:$('undoBar'),undoBtn:$('undoBtn'),
  scModal:$('scModal'),scClose:$('scClose'),
  pvModal:$('pvModal'),pvClose:$('pvClose'),pvBody:$('pvBody'),
  pvTitle:qq('.pv-title'),
  globalDrag:$('globalDragInd'),
  fileCountBadge:$('fileCountBadge'),
  largeBanner:$('largeBanner'),dupeBanner:$('dupeBanner'),
  presetTip:$('presetTip'),
  soundToggle:$('soundToggle'),soundIcon:$('soundIcon'),
  themeToggle:$('themeToggle'),themeIcon:$('themeIcon'),
  bgCanvas:$('bgCanvas'),
};

/* ═══════════════ UTILS ═══════════════ */
function fmtSize(b) {
  if (!b) return '—';
  if (b < 1024)    return b + ' B';
  if (b < 1<<20)   return (b/1024).toFixed(1) + ' KB';
  if (b < 1<<30)   return (b/(1<<20)).toFixed(2) + ' MB';
  return (b/(1<<30)).toFixed(2) + ' GB';
}
function ext(name)  { return (name.match(/\.[^.]+$/) || [''])[0].toLowerCase(); }
function genId()    { return Math.random().toString(36).slice(2,11); }
function isImg(n)   { return IMAGE_EXTS.has(ext(n)); }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function sleep(ms)  { return new Promise(r => setTimeout(r, ms)); }

/* ═══════════════ THEME ═══════════════ */
function initTheme() {
  const saved = localStorage.getItem('ishu-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  E.themeIcon.className = saved === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}
E.themeToggle.addEventListener('click', () => {
  const cur  = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ishu-theme', next);
  E.themeIcon.className = next === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
});

/* ═══════════════ SOUND TOGGLE ═══════════════ */
function initSoundToggle() {
  const s = window.SOUNDS; if (!s) return;
  const update = () => {
    const on = s.isEnabled();
    E.soundToggle.classList.toggle('muted', !on);
    E.soundIcon.className = on ? 'fas fa-volume-high' : 'fas fa-volume-xmark';
  };
  update();
  E.soundToggle.addEventListener('click', () => { s.toggle(); update(); });
}

/* ═══════════════ CANVAS PARTICLES ═══════════════ */
function initCanvas() {
  const cv = E.bgCanvas; if (!cv) return;
  const ctx = cv.getContext('2d');
  let W, H, pts = [];
  const resize = () => { W = cv.width = window.innerWidth; H = cv.height = window.innerHeight; };
  resize();
  window.addEventListener('resize', resize, {passive:true});
  const N = Math.min(50, Math.floor(window.innerWidth / 26));
  for (let i = 0; i < N; i++) pts.push({
    x:Math.random()*1920, y:Math.random()*1080,
    vx:(Math.random()-.5)*.22, vy:(Math.random()-.5)*.22,
    r:1+Math.random()*1.6, a:.07+Math.random()*.16,
  });
  const CONN = 125;
  const frame = () => {
    ctx.clearRect(0,0,W,H);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle = `rgba(99,102,241,${p.a})`;
      ctx.fill();
    }
    for (let i=0;i<pts.length;i++) for (let j=i+1;j<pts.length;j++) {
      const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y;
      const d=Math.sqrt(dx*dx+dy*dy);
      if (d<CONN){
        ctx.beginPath();
        ctx.moveTo(pts[i].x,pts[i].y);
        ctx.lineTo(pts[j].x,pts[j].y);
        ctx.strokeStyle=`rgba(99,102,241,${.045*(1-d/CONN)})`;
        ctx.lineWidth=.5; ctx.stroke();
      }
    }
    requestAnimationFrame(frame);
  };
  frame();
}

/* ═══════════════ NAVBAR ═══════════════ */
window.addEventListener('scroll', () => {
  $('navbar')?.classList.toggle('scrolled', window.scrollY > 40);
}, {passive:true});

/* ═══════════════ TOAST ═══════════════ */
let _toastT = null;
function toast(msg, type='info', dur=3400) {
  const ic = type==='success'?'fa-circle-check':type==='error'?'fa-circle-xmark':type==='warn'?'fa-triangle-exclamation':'fa-circle-info';
  E.toast.innerHTML = `<i class="fas ${ic}"></i> ${msg}`;
  E.toast.className = `toast show ${type}`;
  clearTimeout(_toastT);
  _toastT = setTimeout(() => { E.toast.className='toast'; }, dur);
}

/* ═══════════════ UNDO ═══════════════ */
function pushUndo(entry, idx) {
  _deletedStack.unshift({entry, idx});
  if (_deletedStack.length > 5) _deletedStack.pop();
  showUndo(entry.name);
}
function showUndo(name) {
  E.undoBar.querySelector('.undo-name').textContent = name;
  E.undoBar.classList.add('show');
  clearTimeout(_undoTimer);
  _undoTimer = setTimeout(hideUndo, 5000);
}
function hideUndo() { E.undoBar.classList.remove('show'); }
E.undoBtn.addEventListener('click', () => {
  const item = _deletedStack.shift(); if (!item) return;
  FILES.splice(item.idx, 0, item.entry);
  hideUndo(); rebuildList(); updateStats();
  window.SOUNDS?.playFileAddSound?.();
  toast(`Restored: ${item.entry.name}`, 'success', 2000);
});

/* ═══════════════ FILE HANDLING ═══════════════ */
function addFiles(fileList) {
  let added = 0;
  for (const f of Array.from(fileList)) {
    if (FILES.length >= MAX_FILES) { toast(`Max ${MAX_FILES} files`, 'warn'); break; }
    if (f.size > MAX_BYTES) { toast(`${f.name} exceeds 1 GB limit`, 'error'); continue; }
    const e2 = ext(f.name);
    if (!IMAGE_EXTS.has(e2) && !PDF_EXTS.has(e2)) { toast(`Unsupported: ${f.name}`, 'warn'); continue; }
    if (FILES.some(x => x.file.name === f.name && x.file.size === f.size)) continue;
    const entry = {
      id:genId(), file:f, name:f.name, pages:null, size:f.size,
      enc:false, pwd:'', range:'', displayName:'', imgConverted:isImg(f.name), thumb64:null,
      _title:'', _author:'',
    };
    FILES.push(entry);
    added++;
    window.SOUNDS?.playFileAddSound?.();
    if (entry.imgConverted) genImgThumb(entry); else readPdfInfo(entry);
  }
  if (added > 0) { showSection('files'); rebuildList(); updateStats(); }
  return added;
}

async function readPdfInfo(entry) {
  try {
    if (typeof pdfjsLib === 'undefined') return;
    const buf = await entry.file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data:new Uint8Array(buf), password:''}).promise;
    entry.pages = pdf.numPages;
    const meta  = await pdf.getMetadata().catch(()=>null);
    if (meta?.info) {
      entry._title  = meta.info.Title  || '';
      entry._author = meta.info.Author || '';
    }
    const pg1 = await pdf.getPage(1);
    const vp   = pg1.getViewport({scale:.7});
    const cv   = document.createElement('canvas');
    cv.width = vp.width; cv.height = vp.height;
    await pg1.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
    entry.thumb64 = cv.toDataURL('image/jpeg', .72);
    refreshCard(entry); updateStats();
  } catch(err) {
    if (err?.name==='PasswordException' || String(err).includes('password')) {
      entry.enc = true; refreshCard(entry);
    }
  }
}

async function genImgThumb(entry) {
  try {
    const url = URL.createObjectURL(entry.file);
    await new Promise((res,rej) => {
      const img = new Image();
      img.onload = () => {
        const s = 120 / Math.max(img.naturalWidth, img.naturalHeight, 120);
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth*s; cv.height = img.naturalHeight*s;
        cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
        entry.thumb64 = cv.toDataURL('image/jpeg',.72);
        URL.revokeObjectURL(url);
        refreshCard(entry); res();
      };
      img.onerror = rej; img.src = url;
    });
  } catch(_) {}
}

/* ═══════════════ SMART FILENAME ═══════════════ */
function smartOutputFilename() {
  const manual = (E.optFilename.value||'').trim();
  if (manual) return manual.replace(/\.pdf$/i,'').trim()+'.pdf';
  if (FILES.length > 0) {
    const stem = FILES[0].name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_\-\s]/gi,'_').trim();
    return (stem||'merged')+'_merged.pdf';
  }
  return 'merged.pdf';
}

/* ═══════════════ CARD RENDERING ═══════════════ */
function buildCard(entry, idx) {
  const div = document.createElement('div');
  div.className = 'fc entering';
  div.dataset.id = entry.id;
  div.setAttribute('role','listitem');
  div.setAttribute('tabindex','0');

  // Thumb HTML
  let th = '';
  if (entry.thumb64) {
    th = `<img src="${entry.thumb64}" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:4px" loading="lazy"/>`;
  } else if (entry.imgConverted) {
    th = `<div class="fc-thp img"><i class="fas fa-image"></i><span>${ext(entry.name).slice(1).toUpperCase()||'IMG'}</span></div>`;
  } else {
    th = `<div class="fc-thp pdf"><i class="fas fa-file-pdf"></i><span>PDF</span></div>`;
  }
  if (!entry.thumb64) th += `<div class="fc-tspinner" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)"></div>`;

  // Pills
  let pills = `<span class="fpill"><i class="fas fa-database"></i>${fmtSize(entry.size)}</span>`;
  if (entry.pages!==null) pills += `<span class="fpill"><i class="fas fa-book-open"></i>${entry.pages}pg</span>`;
  if (entry.enc) pills += `<span class="fpill enc"><i class="fas fa-lock"></i>Encrypted</span>`;
  if (entry.imgConverted) pills += `<span class="fpill" style="color:var(--wrn);border-color:rgba(245,158,11,.22)"><i class="fas fa-image"></i>→PDF</span>`;
  if (entry.pages!==null && !entry.enc) pills += `<span class="fpill ok"><i class="fas fa-circle-check"></i>OK</span>`;

  // Doc meta
  const docMeta = (entry._title||entry._author)
    ? `<div class="fc-doc-meta">${[entry._title,entry._author].filter(Boolean).join(' · ')}</div>` : '';

  // Expand area
  const pwdFld = entry.enc ? `
    <div class="fc-field"><label><i class="fas fa-lock"></i>Password</label>
    <input type="password" class="fc-pwd" placeholder="Enter PDF password" value="${entry.pwd||''}" autocomplete="new-password"/></div>` : '';

  const rangeContent = entry.imgConverted
    ? `<div class="fc-img-note"><i class="fas fa-info-circle" style="color:var(--wrn)"></i> Image auto-converted to PDF page at full quality. No page range needed.</div>`
    : `<div class="fc-field"><label><i class="fas fa-list-ol"></i>Page Range</label>
       <input type="text" class="fc-range" placeholder="all / 1-3,5 / odd / even / first 2" value="${entry.range||''}"/>
       <div class="prq">
         <button class="prq-b" data-rng="all">All</button>
         <button class="prq-b" data-rng="odd">Odd</button>
         <button class="prq-b" data-rng="even">Even</button>
         <button class="prq-b" data-rng="first">First</button>
         <button class="prq-b" data-rng="last">Last</button>
       </div></div>`;

  div.innerHTML = `
    <div class="fc-handle" title="Drag to reorder"><i class="fas fa-grip-vertical"></i></div>
    <div class="fc-thumb" title="Click to preview">
      <div class="fc-teye"><i class="fas fa-eye"></i></div>${th}
    </div>
    <div class="fc-info">
      <div class="fc-name" title="${entry.name.replace(/"/g,'&quot;')}" tabindex="0" role="button" aria-label="Rename: double-click">${entry.displayName||entry.name}</div>
      <div class="fc-meta">${pills}</div>${docMeta}
      <div class="fc-exp">
        <div class="fc-frow">
          ${rangeContent}${pwdFld}
          <div class="fc-field"><label><i class="fas fa-tag"></i>Display Name</label>
          <input type="text" class="fc-dname" placeholder="Name in TOC / separator" value="${entry.displayName||''}"/></div>
        </div>
      </div>
    </div>
    <div class="fc-acts">
      <span class="fc-num">${idx+1}</span>
      <div class="fc-btns">
        <button class="fc-btn exp" title="Expand / collapse options"><i class="fas fa-sliders"></i></button>
        <button class="fc-btn del" title="Remove file"><i class="fas fa-trash"></i></button>
      </div>
    </div>
    <div class="swipe-del"><i class="fas fa-trash-alt"></i> Remove</div>`;

  // Thumb → preview
  div.querySelector('.fc-thumb').addEventListener('click', () => openPreview(entry));

  // Expand toggle
  div.querySelector('.fc-btn.exp').addEventListener('click', e => {
    e.stopPropagation();
    const isExp = div.classList.toggle('expanded');
    div.querySelector('.fc-btn.exp i').className = isExp ? 'fas fa-chevron-up' : 'fas fa-sliders';
    window.SOUNDS?.[isExp?'playExpandSound':'playCollapseSound']?.();
  });

  // Delete
  div.querySelector('.fc-btn.del').addEventListener('click', e => { e.stopPropagation(); removeEntry(entry.id); });

  // Page-range quick buttons
  div.querySelectorAll('.prq-b').forEach(btn => {
    if (btn.dataset.rng===(entry.range||'all')) btn.classList.add('on');
    btn.addEventListener('click', () => {
      const ri = div.querySelector('.fc-range'); if (!ri) return;
      entry.range = ri.value = btn.dataset.rng;
      div.querySelectorAll('.prq-b').forEach(b => b.classList.toggle('on', b.dataset.rng===entry.range));
    });
  });
  const ri = div.querySelector('.fc-range');
  if (ri) ri.addEventListener('input', () => {
    entry.range = ri.value.trim();
    div.querySelectorAll('.prq-b').forEach(b => b.classList.toggle('on', b.dataset.rng===entry.range));
  });

  // Password
  const pi = div.querySelector('.fc-pwd');
  if (pi) pi.addEventListener('input', () => { entry.pwd = pi.value; });

  // Display name
  const di = div.querySelector('.fc-dname');
  if (di) di.addEventListener('input', () => {
    entry.displayName = di.value.trim();
    div.querySelector('.fc-name').textContent = entry.displayName || entry.name;
  });

  // Inline rename via dblclick on name
  const nameEl = div.querySelector('.fc-name');
  nameEl.addEventListener('dblclick', () => {
    const old = entry.displayName || entry.name;
    nameEl.contentEditable = 'true';
    nameEl.style.cssText = 'border-bottom:2px solid var(--p1);outline:none;padding:1px 2px';
    nameEl.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    const r = document.createRange(); r.selectNodeContents(nameEl); sel.addRange(r);
    const done = () => {
      nameEl.contentEditable = 'false'; nameEl.style.cssText='';
      const nv = nameEl.textContent.trim();
      if (nv && nv !== old) {
        entry.displayName = nv;
        if (di) di.value = nv;
      } else { nameEl.textContent = old; }
    };
    nameEl.onblur = done;
    nameEl.onkeydown = e => { if (e.key==='Enter'){e.preventDefault();nameEl.blur();} };
  });

  // Keyboard: Alt+↑↓ to move, Del to remove
  div.addEventListener('keydown', e => {
    const idx2 = FILES.findIndex(x => x.id===entry.id);
    if (e.altKey && e.key==='ArrowUp' && idx2>0) {
      e.preventDefault();
      [FILES[idx2],FILES[idx2-1]] = [FILES[idx2-1],FILES[idx2]];
      rebuildList(); updateStats(); window.SOUNDS?.playSortSound?.();
      setTimeout(() => E.fl.querySelectorAll('.fc')[idx2-1]?.focus(), 40);
    } else if (e.altKey && e.key==='ArrowDown' && idx2<FILES.length-1) {
      e.preventDefault();
      [FILES[idx2],FILES[idx2+1]] = [FILES[idx2+1],FILES[idx2]];
      rebuildList(); updateStats(); window.SOUNDS?.playSortSound?.();
      setTimeout(() => E.fl.querySelectorAll('.fc')[idx2+1]?.focus(), 40);
    } else if ((e.key==='Delete'||e.key==='Backspace') && document.activeElement===div) {
      e.preventDefault(); removeEntry(entry.id);
    }
  });

  // Touch swipe
  addTouchSwipe(div, entry.id);
  return div;
}

function refreshCard(entry) {
  const old = E.fl.querySelector(`[data-id="${entry.id}"]`);
  if (!old) return;
  const idx = FILES.findIndex(x => x.id===entry.id);
  const wasExp = old.classList.contains('expanded');
  const nu = buildCard(entry, idx);
  nu.classList.remove('entering');
  if (wasExp) nu.classList.add('expanded');
  old.replaceWith(nu);
}

function rebuildList() {
  const frag = document.createDocumentFragment();
  FILES.forEach((e,i) => frag.appendChild(buildCard(e,i)));
  E.fl.innerHTML = '';
  E.fl.appendChild(frag);
  E.fileCountBadge.textContent = `${FILES.length} file${FILES.length!==1?'s':''}`;
  initSortable();
  updateMergeBtnBadge();
}

/* ═══════════════ SORTABLE ═══════════════ */
function initSortable() {
  if (_sortable) { try { _sortable.destroy(); } catch(_){} }
  if (typeof Sortable === 'undefined') return;
  _sortable = Sortable.create(E.fl, {
    handle:'.fc-handle', animation:180,
    ghostClass:'sortable-ghost', chosenClass:'sortable-chosen',
    easing:'cubic-bezier(.34,1.56,.64,1)',
    onStart: () => window.SOUNDS?.playDragStartSound?.(),
    onEnd: ev => {
      if (ev.oldIndex===ev.newIndex) return;
      window.SOUNDS?.playDragDropSound?.();
      const newOrd = [];
      E.fl.querySelectorAll('.fc[data-id]').forEach(c => {
        const en = FILES.find(x=>x.id===c.dataset.id);
        if (en) newOrd.push(en);
      });
      FILES.length = 0; FILES.push(...newOrd);
      E.fl.querySelectorAll('.fc-num').forEach((el,i) => el.textContent = i+1);
      updateStats(); _sortMode='order';
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active',b.dataset.sort==='order'));
    },
  });
}

/* ═══════════════ SORT ═══════════════ */
function applySortMode(mode) {
  _sortMode = mode;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort===mode));
  if (mode==='name') FILES.sort((a,b)=>a.name.localeCompare(b.name));
  else if (mode==='size') FILES.sort((a,b)=>b.size-a.size);
  rebuildList(); window.SOUNDS?.playSortSound?.();
}
document.querySelectorAll('.sort-btn').forEach(btn => btn.addEventListener('click',()=>applySortMode(btn.dataset.sort)));

/* ═══════════════ REMOVE ═══════════════ */
function removeEntry(id) {
  const idx = FILES.findIndex(x=>x.id===id); if (idx===-1) return;
  const [entry] = FILES.splice(idx,1);
  pushUndo(entry, idx);
  window.SOUNDS?.playFileRemoveSound?.();
  const card = E.fl.querySelector(`[data-id="${id}"]`);
  if (card) {
    card.style.cssText = 'opacity:0;transform:translateX(14px) scale(.95);pointer-events:none;transition:.22s ease';
    setTimeout(()=>card.remove(), 240);
  }
  updateStats();
  E.fileCountBadge.textContent = `${FILES.length} file${FILES.length!==1?'s':''}`;
  if (FILES.length===0) showSection('upload');
  else if (FILES.length<2) { E.mergeBtn.disabled=true; updateMergeBtnBadge(); }
}

/* ═══════════════ STATS BAR ═══════════════ */
function updateStats() {
  E.sbFiles.textContent = FILES.length;
  E.sbFiles.classList.toggle('ct', FILES.length>0);
  const tp = FILES.reduce((a,f)=>a+(f.pages||0),0);
  E.sbPages.textContent = tp>0 ? tp : '—';
  const ts = FILES.reduce((a,f)=>a+f.size,0);
  E.sbSize.textContent = ts>0 ? fmtSize(ts) : '—';
  const est = (ts/1024/1024)*0.4 + FILES.length*0.3;
  E.sbEst.textContent = FILES.length>0 ? (est<60?`~${Math.max(1,Math.round(est))}s`:`~${Math.round(est/60)}m`) : '—';
  const lg = FILES.filter(f=>f.size>100*1024*1024);
  E.largeBanner.hidden = lg.length===0;
  if (lg.length>0) E.largeBanner.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${lg.length} large file${lg.length!==1?'s':''} — may take a moment`;
  E.mergeBtn.disabled = FILES.length<2;
  updateMergeBtnBadge();
}
function updateMergeBtnBadge() {
  E.mbCount.textContent  = FILES.length>=2 ? `${FILES.length} files` : '';
  E.mbCount.style.display= FILES.length>=2 ? '' : 'none';
}

/* ═══════════════ PRESETS ═══════════════ */
document.querySelectorAll('.pset-btn').forEach(btn => {
  btn.addEventListener('mouseenter', ()=>{ const p=PRESETS[btn.dataset.preset]; if(p) E.presetTip.textContent=p.tip; });
  btn.addEventListener('mouseleave', ()=>{ E.presetTip.textContent=''; });
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.pset-btn').forEach(b=>b.classList.remove('on'));
    btn.classList.add('on');
    const p = PRESETS[btn.dataset.preset]; if (!p) return;
    E.optBm.checked=p.bookmarks; E.optToc.checked=p.toc;
    E.optSep.checked=p.sep; E.optComp.checked=p.compress; E.optDedup.checked=p.dedup;
    window.SOUNDS?.playPresetSound?.();
    toast(`Preset applied: ${btn.dataset.preset.charAt(0).toUpperCase()+btn.dataset.preset.slice(1)}`, 'info', 2000);
  });
});

/* ═══════════════ OPTIONS ACCORDION ═══════════════ */
E.optToggle.addEventListener('click', ()=>{
  const open = E.optToggle.getAttribute('aria-expanded')==='true';
  E.optToggle.setAttribute('aria-expanded', String(!open));
  E.optBody.hidden = open;
  window.SOUNDS?.[open?'playCollapseSound':'playExpandSound']?.();
});
E.optNorm.addEventListener('change', ()=>{ E.pgSzField.style.display=E.optNorm.checked?'block':'none'; });
[E.optComp,E.optToc,E.optSep,E.optBm,E.optDedup].forEach(el=>{
  el.addEventListener('change',()=>window.SOUNDS?.[el.checked?'playToggleOnSound':'playToggleOffSound']?.());
});

/* ═══════════════ DROP ZONE ═══════════════ */
function setupDropZone() {
  const dz = E.dz;
  dz.addEventListener('click', e => {
    if (e.target.classList.contains('dz-link') || e.target===dz ||
        e.target.closest('.dz-icon') || e.target.closest('.dz-title') ||
        e.target.closest('.dz-sub')) E.fi.click();
  });
  dz.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();E.fi.click();} });
  E.fi.addEventListener('change', ()=>{ if(E.fi.files.length) addFiles(E.fi.files); E.fi.value=''; });

  // Dz drag
  dz.addEventListener('dragenter', e=>{ e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragover',  e=>{ e.preventDefault(); e.dataTransfer.dropEffect='copy'; });
  dz.addEventListener('dragleave', e=>{ if(!dz.contains(e.relatedTarget)) dz.classList.remove('over'); });
  dz.addEventListener('drop', e=>{ e.preventDefault(); dz.classList.remove('over'); if(e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });

  // Global drop
  document.addEventListener('dragenter', e=>{ if(e.dataTransfer?.types?.includes('Files')) E.globalDrag.classList.add('on'); });
  document.addEventListener('dragleave', e=>{ if(!e.relatedTarget||e.relatedTarget.nodeName==='HTML') E.globalDrag.classList.remove('on'); });
  document.addEventListener('dragover',  e=>e.preventDefault());
  document.addEventListener('drop', e=>{ e.preventDefault(); E.globalDrag.classList.remove('on'); if(e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
}

/* ═══════════════ ADD MORE / CLEAR ═══════════════ */
$('addMoreBtn').addEventListener('click', ()=>E.addMore.click());
E.addMore.addEventListener('change', ()=>{ if(E.addMore.files.length) addFiles(E.addMore.files); E.addMore.value=''; });
$('clearAllBtn').addEventListener('click', ()=>{
  if (!FILES.length) return;
  FILES.forEach((e,i)=>_deletedStack.unshift({entry:e,idx:i}));
  FILES.length = 0; rebuildList(); updateStats(); showSection('upload');
  window.SOUNDS?.playFileRemoveSound?.();
});

/* ═══════════════ SECTION VISIBILITY ═══════════════ */
function showSection(which) {
  E.sUpload.hidden  = which !== 'upload';
  E.sFiles.hidden   = which !== 'files';
  E.sProg.hidden    = which !== 'progress';
  E.sRes.hidden     = which !== 'result';
  if (which==='progress') resetProgressUI();
}

/* ═══════════════ PROGRESS ═══════════════ */
const CIRC = 2*Math.PI*44;
function resetProgressUI() {
  setProgress(0,'Preparing…','Initializing merge engine');
  [E.ps1,E.ps2,E.ps3,E.ps4].forEach(s=>s.classList.remove('active','done'));
  E.ps1.classList.add('active');
}
function setProgress(pct, title, sub) {
  pct = clamp(pct,0,100);
  E.ring.style.strokeDashoffset = CIRC - CIRC*pct/100;
  E.pBar.style.width = pct+'%';
  if (title) E.pTitle.textContent = title;
  if (sub)   E.pSub.textContent   = sub;
}
function advanceStep(n) {
  [E.ps1,E.ps2,E.ps3,E.ps4].forEach((s,i)=>{
    if (i<n) { s.classList.add('done'); s.classList.remove('active'); }
    else if (i===n) { s.classList.add('active'); s.classList.remove('done'); }
    else s.classList.remove('active','done');
  });
}

/* ═══════════════ MERGE ═══════════════ */
E.mergeBtn.addEventListener('click', startMerge);

async function startMerge() {
  if (FILES.length<2) { toast('Add at least 2 files','warn'); return; }
  E.mergeBtn.disabled = true;
  _mergeStart = Date.now();
  window.SOUNDS?.playMergeStartSound?.();
  showSection('progress');
  E.sProg.scrollIntoView({behavior:'smooth',block:'center'});

  // Build FormData
  const fd = new FormData();
  FILES.forEach(e => fd.append('files', e.file, e.name));
  fd.append('page_ranges',    JSON.stringify(FILES.map(e=>e.range||'all')));
  fd.append('passwords',      JSON.stringify(FILES.map(e=>e.pwd||'')));
  fd.append('display_names',  JSON.stringify(FILES.map(e=>e.displayName||'')));
  fd.append('file_types',     JSON.stringify(FILES.map(e=>e.imgConverted?'img':'pdf')));
  fd.append('add_toc',        String(E.optToc.checked));
  fd.append('add_separators', String(E.optSep.checked));
  fd.append('preserve_bookmarks',  String(E.optBm.checked));
  fd.append('compress_output',     String(E.optComp.checked));
  fd.append('skip_duplicates',     String(E.optDedup.checked));
  fd.append('normalize_page_size', String(E.optNorm.checked));
  fd.append('target_page_size',    E.optTargetSize.value);
  fd.append('merge_method',        E.optMethod.value);
  fd.append('output_title',        E.optTitle.value.trim());
  fd.append('output_author',       E.optAuthor.value.trim());
  fd.append('output_filename',     smartOutputFilename());

  // SSE job ID
  _jobId = genId();
  fd.append('job_id', _jobId);
  startSSE(_jobId);
  advanceStep(0);
  setProgress(5,'Uploading files…',`Sending ${FILES.length} file${FILES.length!==1?'s':''}`);

  try {
    const resp = await fetch('/api/merge-pdf', {method:'POST', body:fd});
    stopSSE();

    if (!resp.ok) {
      let errMsg = `Server error (${resp.status})`;
      try { const j=await resp.json(); errMsg=j.error||errMsg; } catch(_){}
      throw new Error(errMsg);
    }

    // Read server stats headers
    const totalPages  = parseInt(resp.headers.get('X-Total-Pages')||'0')  || 0;
    const srcCount    = parseInt(resp.headers.get('X-Source-Count')||'0') || FILES.length;
    const methodUsed  = resp.headers.get('X-Method-Used')  || 'pypdf';
    const outputSize  = parseInt(resp.headers.get('X-Output-Size')||'0')  || 0;
    const skippedDups = parseInt(resp.headers.get('X-Skipped-Dupes')||'0')|| 0;

    const blob = await resp.blob();
    if (_downloadUrl) URL.revokeObjectURL(_downloadUrl);
    _downloadUrl  = URL.createObjectURL(blob);
    _downloadName = smartOutputFilename();

    setProgress(100,'Done!','Merge complete');
    advanceStep(3);
    await sleep(340);
    showResult(totalPages, srcCount, methodUsed, outputSize, skippedDups, blob.size);

  } catch(err) {
    stopSSE();
    window.SOUNDS?.playErrorSound?.();
    const msg = err.message || 'Merge failed — please check your files and try again';
    toast(msg, 'error', 7000);
    showSection('files');
    E.mergeBtn.disabled = FILES.length<2;
  }
}

/* ═══════════════ SSE PROGRESS ═══════════════ */
function startSSE(jobId) {
  simulateProgress(); // always run simulated fallback
  try {
    _sseSource = new EventSource(`/api/merge-pdf/progress/${jobId}`);
    _sseSource.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        if (d.ping||d.done) return;
        const pct = typeof d.pct==='number' ? d.pct : 0;
        if (pct > parseFloat(E.pBar.style.width||'0')) {
          setProgress(pct, d.title||undefined, d.sub||undefined);
          if (pct<20)      advanceStep(0);
          else if (pct<60) advanceStep(1);
          else if (pct<88) advanceStep(2);
          else             advanceStep(3);
        }
      } catch(_){}
    };
    _sseSource.onerror = ()=>stopSSE();
  } catch(_) {}
}
function stopSSE() {
  if (_sseSource) { _sseSource.close(); _sseSource=null; }
  clearInterval(_simTimer);
}
function simulateProgress() {
  let pct = 8;
  clearInterval(_simTimer);
  _simTimer = setInterval(()=>{
    const cur = parseFloat(E.pBar.style.width||'0');
    if (cur < pct && pct < 84) {
      setProgress(pct);
      if (pct<20) advanceStep(0); else if(pct<55) advanceStep(1); else advanceStep(2);
    }
    pct = Math.min(pct+(Math.random()*3.8), 84);
    if (pct>=84) clearInterval(_simTimer);
  }, 380);
}

/* ═══════════════ RESULT ═══════════════ */
function showResult(totalPages, srcCount, methodUsed, outputSize, skippedDups, blobSize) {
  window.SOUNDS?.playSuccessChime?.();
  showSection('result');
  E.sRes.scrollIntoView({behavior:'smooth',block:'start'});

  const elapsed = ((Date.now()-_mergeStart)/1000).toFixed(1)+'s';
  const totalIn = FILES.reduce((a,f)=>a+f.size,0);
  const sz      = outputSize||blobSize;
  const chg     = totalIn>0 ? ((sz-totalIn)/totalIn*100) : 0;
  const saved   = chg<0 ? `−${Math.abs(chg).toFixed(1)}%` : chg>0 ? `+${chg.toFixed(1)}%` : '—';

  animateCounter(E.rFiles, srcCount);
  animateCounter(E.rPages, totalPages);
  E.rSize.textContent   = fmtSize(sz);
  E.rTime.textContent   = elapsed;
  E.rEngine.textContent = methodUsed.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  E.rSaved.textContent  = saved;
  E.rSaved.style.color  = chg<-1?'var(--ok)':chg>3?'var(--err)':'var(--tx)';

  const sub = skippedDups>0
    ? `${srcCount} files merged · ${totalPages} pages · ${skippedDups} duplicate pages removed`
    : `${srcCount} file${srcCount!==1?'s':''} merged into ${totalPages} page${totalPages!==1?'s':''}`;
  E.resSub.textContent    = sub;
  E.resFnTx.textContent   = _downloadName;
  E.resFn.style.display   = 'flex';

  E.dlBtn.onclick = () => {
    const a = document.createElement('a');
    a.href = _downloadUrl; a.download = _downloadName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    window.SOUNDS?.playDownloadWhoosh?.();
    toast('Downloading…', 'success', 2200);
  };

  E.copyNameBtn.onclick = () => {
    navigator.clipboard.writeText(_downloadName).then(()=>{
      const orig = E.copyNameBtn.innerHTML;
      E.copyNameBtn.classList.add('copied');
      E.copyNameBtn.innerHTML = '<i class="fas fa-check"></i>Copied!';
      window.SOUNDS?.playCopySound?.();
      setTimeout(()=>{ E.copyNameBtn.classList.remove('copied'); E.copyNameBtn.innerHTML=orig; }, 2200);
    });
  };

  E.mergeAgainBtn.onclick = ()=>{
    window.SOUNDS?.playMergeAgainSound?.();
    showSection('files');
    window.scrollTo({top:0,behavior:'smooth'});
    E.mergeBtn.disabled = FILES.length<2;
  };

  // Recent merges
  _recentMerges.unshift({id:genId(),name:_downloadName,files:srcCount,pages:totalPages,size:fmtSize(sz),time:new Date().toLocaleTimeString()});
  if (_recentMerges.length>4) _recentMerges.pop();
  renderRecent();

  launchConfetti(42);
}

function animateCounter(el, target) {
  if (!target||isNaN(target)){ el.textContent=target||'—'; return; }
  let v=0; const step=Math.max(1,Math.floor(target/30));
  const t = setInterval(()=>{ v=Math.min(v+step,target); el.textContent=v; if(v>=target) clearInterval(t); }, 25);
}

function renderRecent() {
  if (!_recentMerges.length){ E.recentM.innerHTML=''; return; }
  E.recentM.innerHTML = `
    <div class="rec-section">
      <div class="rec-title"><i class="fas fa-clock-rotate-left"></i>Recent Merges</div>
      <div class="rec-list">${_recentMerges.map(r=>`
        <div class="rec-item">
          <i class="fas fa-file-pdf"></i>
          <div class="rec-info"><div class="rec-fname">${r.name}</div><div class="rec-meta">${r.files} files · ${r.pages} pages · ${r.size}</div></div>
          <div class="rec-date">${r.time}</div>
        </div>`).join('')}
      </div>
    </div>`;
}

/* ═══════════════ CONFETTI ═══════════════ */
function launchConfetti(n) {
  const c = $('confetti'); if (!c) return;
  c.innerHTML = '';
  const COLS=['#6366f1','#8b5cf6','#f59e0b','#22c55e','#06b6d4','#ec4899','#f97316','#a78bfa','#34d399'];
  for (let i=0;i<n;i++) {
    const p  = document.createElement('div'); p.className='cp';
    const sz = 6+Math.random()*11;
    const dr = 2.2+Math.random()*2.5;
    p.style.cssText=`left:${Math.random()*100}%;width:${sz}px;height:${sz*1.5}px;background:${COLS[~~(Math.random()*COLS.length)]};border-radius:${Math.random()>.5?'50%':'2px'};animation-duration:${dr}s;animation-delay:${Math.random()*1.1}s;transform:rotate(${Math.random()*360}deg)`;
    c.appendChild(p);
  }
  setTimeout(()=>c.innerHTML='', 6500);
}

/* ═══════════════ PREVIEW MODAL ═══════════════ */
async function openPreview(entry) {
  E.pvTitle.textContent = entry.displayName||entry.name;
  E.pvBody.innerHTML = `<div class="pv-loading"><i class="fas fa-spinner fa-spin"></i> Loading preview…</div>`;
  E.pvModal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  window.SOUNDS?.playExpandSound?.();

  if (entry.imgConverted) {
    const url = URL.createObjectURL(entry.file);
    E.pvBody.innerHTML = `<div class="pv-img-wrap"><img src="${url}" alt="${entry.name}"/></div>`;
    return;
  }

  if (typeof pdfjsLib === 'undefined') {
    E.pvBody.innerHTML = `<div class="pv-err"><i class="fas fa-triangle-exclamation"></i>PDF preview requires PDF.js — loading…</div>`;
    return;
  }
  try {
    const buf  = await entry.file.arrayBuffer();
    const opts = {data:new Uint8Array(buf)};
    if (entry.pwd) opts.password = entry.pwd;
    const pdf = await pdfjsLib.getDocument(opts).promise;
    entry.pages = pdf.numPages; updateStats();

    const meta = await pdf.getMetadata().catch(()=>null);
    let head = '<div class="pv-doc-meta">';
    if (meta?.info?.Title)  head += `<span><i class="fas fa-tag"></i>${meta.info.Title}</span>`;
    if (meta?.info?.Author) head += `<span><i class="fas fa-user"></i>${meta.info.Author}</span>`;
    head += `<span><i class="fas fa-book-open"></i>${pdf.numPages} pages</span></div>`;

    const maxPg = Math.min(pdf.numPages,12);
    const moreNote = pdf.numPages>12 ? `<div class="pv-more">Showing first 12 of ${pdf.numPages} pages</div>` : '';
    E.pvBody.innerHTML = head + `<div class="pv-grid" id="pvGrid"></div>` + moreNote;

    const grid = $('pvGrid');
    for (let i=1;i<=maxPg;i++) {
      const pg = await pdf.getPage(i);
      const vp = pg.getViewport({scale:.62});
      const wrap = document.createElement('div'); wrap.className='pv-pg';
      const cv   = document.createElement('canvas');
      cv.width=vp.width; cv.height=vp.height;
      const pn = document.createElement('div'); pn.className='pv-pn'; pn.textContent=i;
      wrap.appendChild(cv); wrap.appendChild(pn); grid.appendChild(wrap);
      pg.render({canvasContext:cv.getContext('2d'),viewport:vp});
    }
  } catch(err) {
    const isPass = err?.name==='PasswordException' || String(err).toLowerCase().includes('password');
    if (isPass) {
      entry.enc = true; refreshCard(entry);
      E.pvBody.innerHTML = `<div class="pv-err"><i class="fas fa-lock"></i>${entry.pwd?'Wrong password — check the password field on the file card':'Expand the file card and enter the PDF password, then preview again'}</div>`;
    } else {
      E.pvBody.innerHTML = `<div class="pv-err"><i class="fas fa-triangle-exclamation"></i>${err.message||'Cannot preview this file'}</div>`;
    }
  }
}
function closePreview() { E.pvModal.hidden=true; document.body.style.overflow=''; window.SOUNDS?.playCollapseSound?.(); }
E.pvClose.addEventListener('click', closePreview);
E.pvModal.addEventListener('click', e=>{ if(e.target===E.pvModal) closePreview(); });

/* ═══════════════ SHORTCUTS MODAL ═══════════════ */
$('shortcutsHintBtn').addEventListener('click', ()=>{ E.scModal.removeAttribute('hidden'); window.SOUNDS?.playExpandSound?.(); });
E.scClose.addEventListener('click', ()=>{ E.scModal.hidden=true; });
E.scModal.addEventListener('click', e=>{ if(e.target===E.scModal) E.scModal.hidden=true; });

/* ═══════════════ KEYBOARD SHORTCUTS ═══════════════ */
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;
  const editing = tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||document.activeElement?.contentEditable==='true';
  if (e.key==='Escape') { E.scModal.hidden=true; closePreview(); return; }
  if (editing) return;
  if ((e.ctrlKey||e.metaKey)&&e.key==='z') { e.preventDefault(); E.undoBtn.click(); return; }
  if ((e.ctrlKey||e.metaKey)&&e.key==='o') { e.preventDefault(); E.fi.click(); return; }
  if ((e.ctrlKey||e.metaKey)&&e.key==='m') { e.preventDefault(); if(!E.mergeBtn.disabled) E.mergeBtn.click(); return; }
  if ((e.ctrlKey||e.metaKey)&&e.key==='s') { e.preventDefault(); if(_downloadUrl) E.dlBtn?.click(); return; }
  if (e.key==='?') { E.scModal.removeAttribute('hidden'); window.SOUNDS?.playExpandSound?.(); }
});

/* ═══════════════ TOUCH SWIPE DELETE ═══════════════ */
function addTouchSwipe(card, entryId) {
  const hint = card.querySelector('.swipe-del');
  let tx0=0, dx=0;
  card.addEventListener('touchstart', e=>{ tx0=e.touches[0].clientX; }, {passive:true});
  card.addEventListener('touchmove', e=>{
    dx = e.touches[0].clientX - tx0;
    if (dx<0) {
      card.style.transform = `translateX(${Math.max(dx,-118)}px)`;
      if (hint) hint.style.opacity = String(Math.min(1,-dx/58));
    }
  }, {passive:true});
  card.addEventListener('touchend', ()=>{
    if (dx < -96) { removeEntry(entryId); }
    else { card.style.transform=''; if(hint) hint.style.opacity='0'; }
    dx = 0;
  }, {passive:true});
}

/* ═══════════════ PDF.JS LAZY LOAD ═══════════════ */
function lazyLoadPdfJs() {
  if (typeof pdfjsLib!=='undefined') return;
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  s.onload = () => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    // Trigger info reads for PDF files already in queue
    FILES.filter(e=>!e.imgConverted&&e.pages===null).forEach(e=>readPdfInfo(e));
  };
  document.head.appendChild(s);
}

/* ═══════════════ FAQ ACCORDION ═══════════════ */
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', ()=>{
    const item = btn.parentElement;
    const open = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(i=>{ i.classList.remove('open'); i.querySelector('.faq-q').setAttribute('aria-expanded','false'); });
    if (!open) { item.classList.add('open'); btn.setAttribute('aria-expanded','true'); }
  });
});

/* ═══════════════ GSAP ANIMATIONS ═══════════════ */
function initAnimations() {
  if (typeof gsap==='undefined') return;
  gsap.from('.hero-badge',{y:20,duration:.7,delay:.08,ease:'power3.out'});
  gsap.from('.hero-h1',  {y:28,duration:.8,delay:.2, ease:'power3.out'});
  gsap.from('.hero-sub', {y:20,duration:.7,delay:.34,ease:'power3.out'});
  gsap.from('.hero-pills',{y:14,duration:.6,delay:.46,ease:'power3.out'});
  gsap.from('.dropzone', {y:26,duration:.8,delay:.54,ease:'power3.out'});
  if (typeof ScrollTrigger!=='undefined') {
    gsap.registerPlugin(ScrollTrigger);
    [{sel:'.how-card',trg:'.how-section'},{sel:'.feat-card',trg:'.feat-section'},
     {sel:'.faq-item', trg:'.faq-section'},{sel:'.rel-card', trg:'.rel-section'}
    ].forEach(({sel,trg})=>{
      gsap.from(sel,{y:32,duration:.65,stagger:.09,ease:'power3.out',
        scrollTrigger:{trigger:trg,start:'top 83%',once:true}});
    });
  }
}

/* ═══════════════ INIT ═══════════════ */
document.addEventListener('DOMContentLoaded', ()=>{
  initTheme();
  initSoundToggle();
  initCanvas();
  setupDropZone();
  lazyLoadPdfJs();
  showSection('upload');
  setTimeout(()=>{ if(typeof gsap!=='undefined') initAnimations(); }, 80);
});
