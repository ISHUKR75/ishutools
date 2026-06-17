/**
 * tool-base.js — Universal tool page engine for IshuTools.fun
 * Reads window.TOOL_CONFIG and renders the complete professional tool UI.
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun
 *
 * TOOL_CONFIG shape (set as window.TOOL_CONFIG before loading this script):
 * {
 *   id, name, emoji, category, categorySlug, description,
 *   apiEndpoint, multiFile, twoFiles, noFile,
 *   acceptedTypes, acceptedLabel, minFiles, maxFiles,
 *   options[], resultType ('file'|'json'|'text'),
 *   outputFilename, outputMime,
 *   steps[], features[], related[]
 * }
 */

(function () {
  'use strict';

  /* ─── THEME ─────────────────────────────────────────────────────────────── */
  const THEME_KEY = 'ishu-theme';
  function getTheme()   { return localStorage.getItem(THEME_KEY) || 'dark'; }
  function applyTheme(t){ document.documentElement.setAttribute('data-theme', t); localStorage.setItem(THEME_KEY, t); }
  applyTheme(getTheme());

  /* ─── CONFIG VALIDATION ─────────────────────────────────────────────────── */
  const C = window.TOOL_CONFIG;
  if (!C || !C.id) { console.error('IshuTools: window.TOOL_CONFIG missing'); return; }
  C.multiFile     = C.multiFile     || false;
  C.twoFiles      = C.twoFiles      || false;
  C.noFile        = C.noFile        || false;
  C.minFiles      = C.minFiles      || (C.multiFile ? 2 : 1);
  C.maxFiles      = C.maxFiles      || (C.multiFile ? 50 : 1);
  C.options       = C.options       || [];
  C.resultType    = C.resultType    || 'file';
  C.outputFilename = C.outputFilename || 'output.pdf';
  C.outputMime    = C.outputMime    || 'application/pdf';
  C.steps         = C.steps         || [];
  C.features      = C.features      || [];
  C.related       = C.related       || [];
  C.acceptedLabel = C.acceptedLabel || C.acceptedTypes || 'PDF';

  /* ─── UTILS ─────────────────────────────────────────────────────────────── */
  function fmtSize(bytes) {
    if (bytes < 1024)         return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }
  function esc(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function q(sel, ctx) { return (ctx||document).querySelector(sel); }
  function qa(sel, ctx){ return [...(ctx||document).querySelectorAll(sel)]; }

  /* ─── RENDER HEADER ─────────────────────────────────────────────────────── */
  function renderHeader() {
    const h = document.createElement('header');
    h.className = 'site-header';
    h.innerHTML = `
      <a href="/" class="header-logo" aria-label="IshuTools Home">
        <div class="logo-icon">
          <svg width="28" height="28" viewBox="0 0 34 34" fill="none">
            <rect width="34" height="34" rx="9" fill="url(#hLg)"/>
            <path d="M8 17L13 12L18 17L23 12" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M8 22L13 17L18 22L23 17" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
            <defs><linearGradient id="hLg" x1="0" y1="0" x2="34" y2="34"><stop offset="0%" stop-color="#6366F1"/><stop offset="100%" stop-color="#8B5CF6"/></linearGradient></defs>
          </svg>
        </div>
        <span>IshuTools<span class="fun">.fun</span></span>
      </a>
      <nav class="header-nav" aria-label="Main navigation">
        <a href="/#organize"><i class="fas fa-layer-group"></i> Organize</a>
        <a href="/#convert"><i class="fas fa-exchange-alt"></i> Convert</a>
        <a href="/#edit"><i class="fas fa-edit"></i> Edit</a>
        <a href="/#security"><i class="fas fa-shield-alt"></i> Security</a>
        <a href="/#ai"><i class="fas fa-brain"></i> <span class="ai-nav-pill">AI</span></a>
      </nav>
      <div class="header-actions">
        <a href="/" class="header-search-btn">
          <i class="fas fa-search"></i>
          <span>All PDF Tools</span>
        </a>
        <button class="theme-btn" id="themeBtn" title="Toggle theme" aria-label="Toggle dark/light theme">
          <i class="fas ${getTheme()==='dark' ? 'fa-sun' : 'fa-moon'}"></i>
        </button>
      </div>
    `;
    document.body.prepend(h);

    q('#themeBtn').addEventListener('click', () => {
      const next = getTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      q('#themeBtn').innerHTML = `<i class="fas ${next === 'dark' ? 'fa-sun' : 'fa-moon'}"></i>`;
    });
  }

  /* ─── RENDER FOOTER ─────────────────────────────────────────────────────── */
  function renderFooter() {
    const f = document.createElement('footer');
    f.className = 'site-footer';
    f.innerHTML = `
      <div class="footer-inner">
        <div class="footer-brand">
          <a href="/" class="footer-logo-link">
            <svg width="22" height="22" viewBox="0 0 34 34" fill="none">
              <rect width="34" height="34" rx="9" fill="url(#ftLg)"/>
              <path d="M8 17L13 12L18 17L23 12" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M8 22L13 17L18 22L23 17" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
              <defs><linearGradient id="ftLg" x1="0" y1="0" x2="34" y2="34"><stop offset="0%" stop-color="#6366F1"/><stop offset="100%" stop-color="#8B5CF6"/></linearGradient></defs>
            </svg>
            <strong>IshuTools<span style="color:#818cf8">.fun</span></strong>
          </a>
          <span style="color:var(--txt3);font-size:.78rem;margin-top:4px;display:block;">© 2026 by <a href="https://github.com/ISHUKR41" target="_blank" rel="noopener">Ishu Kumar</a></span>
        </div>
        <div class="footer-links">
          <a href="/">🏠 All Tools</a>
          <a href="/#organize">📁 Organize</a>
          <a href="/#convert">🔄 Convert</a>
          <a href="/#edit">✏️ Edit</a>
          <a href="/#security">🔒 Security</a>
          <a href="/#ai">🤖 AI Tools</a>
          <a href="https://github.com/ISHUKR41" target="_blank" rel="noopener">⭐ GitHub</a>
        </div>
        <div class="footer-copy">✅ 100% Free · No Signup · No Watermark · 1GB Upload Limit</div>
      </div>`;
    document.body.appendChild(f);
  }

  /* ─── RENDER OPTIONS ────────────────────────────────────────────────────── */
  function renderOption(opt) {
    switch (opt.type) {
      case 'select':
        return `<div class="form-group">
          <label class="form-label" for="opt-${esc(opt.id)}">${esc(opt.label)}</label>
          <select class="form-control" id="opt-${esc(opt.id)}" name="${esc(opt.id)}">
            ${opt.choices.map(c => `<option value="${esc(c.v||c)}"${((c.v||c)===opt.default)?'selected':''}>${esc(c.l||c)}</option>`).join('')}
          </select>
        </div>`;
      case 'radio':
        return `<div class="form-group">
          <label class="form-label">${esc(opt.label)}</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${opt.choices.map(c=>`
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;font-size:.84rem;transition:all .2s;">
                <input type="radio" name="${esc(opt.id)}" value="${esc(c.v||c)}" ${((c.v||c)===opt.default)?'checked':''} style="accent-color:var(--accent);">
                ${esc(c.l||c)}
              </label>`).join('')}
          </div>
        </div>`;
      case 'range':
        return `<div class="form-group">
          <label class="form-label" for="opt-${esc(opt.id)}">${esc(opt.label)} <span id="opt-${esc(opt.id)}-val">${Math.round((opt.default||opt.min||0)*(opt.scale||1))}${opt.unit||''}</span></label>
          <input type="range" class="form-control" id="opt-${esc(opt.id)}" name="${esc(opt.id)}"
            min="${opt.min}" max="${opt.max}" step="${opt.step}" value="${opt.default}"
            style="padding:6px 0;"
            oninput="document.getElementById('opt-${esc(opt.id)}-val').textContent=Math.round(this.value*(${opt.scale||1}))+'${opt.unit||''}'">
        </div>`;
      case 'number':
        return `<div class="form-group">
          <label class="form-label" for="opt-${esc(opt.id)}">${esc(opt.label)}</label>
          <input type="number" class="form-control" id="opt-${esc(opt.id)}" name="${esc(opt.id)}"
            min="${opt.min||1}" max="${opt.max||9999}" value="${opt.default||1}" placeholder="${esc(opt.placeholder||'')}">
        </div>`;
      case 'text':
      case 'pages':
        return `<div class="form-group">
          <label class="form-label" for="opt-${esc(opt.id)}">${esc(opt.label)}</label>
          <input type="text" class="form-control" id="opt-${esc(opt.id)}" name="${esc(opt.id)}"
            placeholder="${esc(opt.placeholder||'')}" value="${esc(opt.default||'')}">
        </div>`;
      case 'password':
        return `<div class="form-group">
          <label class="form-label" for="opt-${esc(opt.id)}">${esc(opt.label)}</label>
          <input type="password" class="form-control" id="opt-${esc(opt.id)}" name="${esc(opt.id)}"
            placeholder="${esc(opt.placeholder||'Enter password...')}" autocomplete="off">
        </div>`;
      case 'textarea':
        return `<div class="form-group">
          <label class="form-label" for="opt-${esc(opt.id)}">${esc(opt.label)}</label>
          <textarea class="form-control" id="opt-${esc(opt.id)}" name="${esc(opt.id)}"
            placeholder="${esc(opt.placeholder||'')}" rows="4">${esc(opt.default||'')}</textarea>
        </div>`;
      case 'color':
        return `<div class="form-group">
          <label class="form-label" for="opt-${esc(opt.id)}">${esc(opt.label)}</label>
          <div style="display:flex;gap:10px;align-items:center;">
            <input type="color" id="opt-${esc(opt.id)}" name="${esc(opt.id)}" value="${esc(opt.default||'#6366f1')}"
              style="width:44px;height:36px;border-radius:8px;border:1px solid var(--border);cursor:pointer;padding:2px;background:var(--bg2);">
            <input type="text" id="opt-${esc(opt.id)}-hex" placeholder="#6366f1"
              style="flex:1;" class="form-control" value="${esc(opt.default||'#6366f1')}"
              oninput="document.getElementById('opt-${esc(opt.id)}').value=this.value">
          </div>
        </div>`;
      case 'url':
        return `<div class="form-group">
          <label class="form-label" for="opt-${esc(opt.id)}">${esc(opt.label)}</label>
          <input type="url" class="form-control" id="opt-${esc(opt.id)}" name="${esc(opt.id)}"
            placeholder="${esc(opt.placeholder||'https://')}" value="${esc(opt.default||'')}">
        </div>`;
      default: return '';
    }
  }

  /* ─── RENDER PAGE ───────────────────────────────────────────────────────── */
  function renderPage() {
    // Build accept string for <input type="file">
    const acceptAttr = C.acceptedTypes || '.pdf';

    // Two-file upload (compare mode) markup
    const twoFilesHTML = C.twoFiles ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 24px 0;">
        ${['file1','file2'].map((fn, i) => `
          <div class="drop-zone" id="dz-${fn}" data-fname="${fn}" style="padding:28px 12px;">
            <input type="file" id="input-${fn}" name="${fn}" accept="${esc(acceptAttr)}" style="position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;">
            <div class="dz-icon" style="width:42px;height:42px;font-size:1.2rem;">📄</div>
            <div class="dz-title" style="font-size:.9rem;">File ${i+1}</div>
            <div class="dz-sub" style="font-size:.74rem;" id="dz-${fn}-name">Click to upload</div>
          </div>`).join('')}
      </div>` : '';

    // URL-only mode (html-to-pdf)
    const urlModeHTML = C.noFile ? `
      <div style="padding:0 24px;margin-bottom:16px;">
        <div class="form-group">
          <label class="form-label">Website URL <span>(or use the options panel to paste HTML)</span></label>
          <input type="url" class="form-control" id="url-input" placeholder="https://example.com" style="font-size:1rem;padding:13px 16px;">
        </div>
      </div>` : '';

    const stepsHTML = C.steps.length ? `
      <div class="steps-list">
        ${C.steps.map((s,i)=>`
          <div class="step-item">
            <div class="step-num">${i+1}</div>
            <div class="step-text">${esc(s)}</div>
          </div>`).join('')}
      </div>` : '';

    const featuresHTML = C.features.length ? `
      <div class="info-card" style="margin-top:0;">
        <h3>✨ Why IshuTools?</h3>
        <div class="features-list">
          ${C.features.map(f=>`
            <div class="feature-item">
              <span class="fi">✓</span>
              <span>${esc(f)}</span>
            </div>`).join('')}
        </div>
      </div>` : '';

    const relatedHTML = C.related.length ? `
      <div class="related-section">
        <h2 class="section-title">Related Tools</h2>
        <div class="related-grid">
          ${C.related.map(r=>`
            <a href="${esc(r.url)}" class="related-card" style="--rt-c1:${esc(r.c1||'#6366f1')};--rt-c2:${esc(r.c2||'#8b5cf6')};">
              <div class="related-icon">${esc(r.emoji||'📄')}</div>
              <div class="related-name">${esc(r.name)}</div>
              <div class="related-desc">${esc(r.desc||'')}</div>
            </a>`).join('')}
        </div>
      </div>` : '';

    const optionsHTML = C.options.length ? `
      <div class="options-card" id="optionsCard">
        <div class="options-title">⚙️ Options</div>
        ${C.options.map(renderOption).join('')}
      </div>` : `
      <div class="options-card">
        <div class="options-title">ℹ️ How it works</div>
        ${stepsHTML}
        ${featuresHTML}
      </div>`;

    const mainDropZone = (!C.twoFiles && !C.noFile) ? `
      <div class="drop-zone" id="mainDropZone">
        <input type="file" id="mainFileInput"
          accept="${esc(acceptAttr)}"
          ${C.multiFile ? 'multiple' : ''}
          style="position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;">
        <div class="dz-icon">📄</div>
        <div class="dz-title">Drop ${C.multiFile ? 'files' : 'file'} here or click to upload</div>
        <div class="dz-sub">Supports up to 1 GB per file</div>
        <div class="dz-types">
          ${(C.acceptedLabel||'PDF').split('/').map(t=>`<span class="dz-type-tag">${esc(t.trim())}</span>`).join('')}
        </div>
      </div>` : '';

    document.body.innerHTML = `
      <div class="tool-page-wrap">

        <!-- Breadcrumb -->
        <nav class="breadcrumb fade-up" aria-label="Breadcrumb">
          <a href="/">🏠 Home</a>
          <span class="sep">/</span>
          <a href="/${esc(C.categorySlug||'')}">${esc(C.category||'Tools')}</a>
          <span class="sep">/</span>
          <span class="current">${esc(C.name)}</span>
        </nav>

        <!-- Tool Hero -->
        <div class="tool-hero fade-up">
          <div class="tool-hero-icon">${esc(C.emoji||'📄')}</div>
          <div class="tool-hero-text">
            <h1>${esc(C.name)}</h1>
            <p>${esc(C.description||'')}</p>
            <div class="tool-badges">
              <span class="tool-badge free">100% Free</span>
              <span class="tool-badge fast">Lightning Fast</span>
              <span class="tool-badge secure">Secure</span>
              <span class="tool-badge no-signup">No Signup</span>
            </div>
          </div>
        </div>

        <!-- Main grid: upload + sidebar -->
        <div class="tool-main-grid">

          <!-- LEFT: Upload Card -->
          <div>
            <div class="upload-zone-card scale-in">
              <div class="upload-zone-header">📁 Upload Your ${esc(C.multiFile?'Files':'File')}</div>
              ${urlModeHTML}
              ${mainDropZone}
              ${twoFilesHTML}

              <!-- File list -->
              <div class="file-list" id="fileList"></div>

              <!-- Error toast -->
              <div class="error-toast" id="errorToast">
                <span class="err-icon">⚠️</span>
                <span id="errorMsg"></span>
              </div>

              <!-- Progress -->
              <div class="progress-wrap" id="progressWrap">
                <div class="progress-label">
                  <span id="progressLabel">Processing…</span>
                  <span id="progressPct">0%</span>
                </div>
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill" id="progressFill"></div>
                </div>
              </div>

              <!-- Result (file download) -->
              <div class="result-card" id="resultCard">
                <div class="result-header">
                  <div class="result-icon">✅</div>
                  <div class="result-info">
                    <strong id="resultFilename">${esc(C.outputFilename)}</strong>
                    <span id="resultMeta">Your file is ready!</span>
                  </div>
                </div>
                <a class="download-btn" id="downloadBtn" href="#" download>
                  ⬇️ Download Result
                </a>
              </div>

              <!-- Text result (AI tools) -->
              <div class="text-result-card" id="textResultCard">
                <div class="text-result-header">
                  📝 Result
                  <button class="copy-btn" id="copyBtn" onclick="copyResult()">Copy</button>
                </div>
                <div class="text-result-body" id="textResultBody"></div>
              </div>

              <!-- Process Button -->
              <div class="process-btn-wrap">
                <button class="process-btn" id="processBtn" onclick="processFile()">
                  <div class="spinner"></div>
                  <span class="btn-icon">⚡</span>
                  <span class="btn-text">Process ${esc(C.name)}</span>
                </button>
              </div>
            </div><!-- /upload-zone-card -->
          </div><!-- /left -->

          <!-- RIGHT: Options + Info -->
          <div class="sidebar-stack">
            ${optionsHTML}
            ${C.options.length ? `
              <div class="info-card">
                <h3>📖 How to Use</h3>
                ${stepsHTML}
              </div>
              ${featuresHTML}` : ''}
          </div><!-- /sidebar -->

        </div><!-- /tool-main-grid -->

        ${relatedHTML}

      </div><!-- /tool-page-wrap -->
    `;
  }

  /* ─── FILE STATE ────────────────────────────────────────────────────────── */
  let uploadedFiles   = [];  // for single / multi
  let twoFileMap      = {};  // for compare: { file1: File, file2: File }
  let resultBlobURL   = null;

  /* ─── SHOW/HIDE ERROR ───────────────────────────────────────────────────── */
  function showError(msg) {
    const et = q('#errorToast');
    if (!et) return;
    q('#errorMsg').textContent = msg;
    et.classList.add('visible');
    setTimeout(() => et.classList.remove('visible'), 6000);
  }
  function hideError() {
    const et = q('#errorToast');
    if (et) et.classList.remove('visible');
  }

  /* ─── PROGRESS ──────────────────────────────────────────────────────────── */
  let _pTimer = null;
  function startProgress(label) {
    const pw = q('#progressWrap'), pf = q('#progressFill'), pl = q('#progressLabel'), pp = q('#progressPct');
    if (!pw) return;
    pw.classList.add('visible');
    pl.textContent = label || 'Processing…';
    let pct = 0;
    _pTimer = setInterval(() => {
      pct = pct < 70 ? pct + Math.random() * 4 : pct + Math.random() * 0.5;
      if (pct > 90) pct = 90;
      pf.style.width = pct + '%';
      pp.textContent = Math.round(pct) + '%';
    }, 200);
  }
  function finishProgress(pct) {
    clearInterval(_pTimer);
    const pf = q('#progressFill'), pp = q('#progressPct');
    if (pf) { pf.style.width = (pct||100) + '%'; }
    if (pp)  pp.textContent = (pct||100) + '%';
  }
  function hideProgress() {
    const pw = q('#progressWrap');
    if (pw) pw.classList.remove('visible');
  }

  /* ─── RENDER FILE LIST ──────────────────────────────────────────────────── */
  function renderFileList() {
    const fl = q('#fileList');
    if (!fl) return;
    if (!uploadedFiles.length) { fl.innerHTML = ''; return; }

    fl.innerHTML = uploadedFiles.map((f, i) => `
      <div class="file-item" id="fi-${i}">
        <div class="file-item-icon">📄</div>
        <div class="file-item-info">
          <div class="file-item-name">${esc(f.name)}</div>
          <div class="file-item-size">${fmtSize(f.size)}</div>
        </div>
        <button class="file-item-remove" onclick="removeFile(${i})" title="Remove file" aria-label="Remove ${esc(f.name)}">✕</button>
      </div>`).join('');

    const dz = q('#mainDropZone');
    if (dz) dz.classList.add('has-files');
  }

  /* ─── SETUP DROP ZONE (single/multi) ────────────────────────────────────── */
  function setupDropZone() {
    const dz = q('#mainDropZone');
    const fi = q('#mainFileInput');
    if (!dz || !fi) return;

    // Critical fix: explicit click handler to open file picker
    dz.addEventListener('click', function (e) {
      if (e.target === fi) return;
      e.preventDefault();
      fi.click();
    });

    fi.addEventListener('change', () => {
      addFiles([...fi.files]);
      fi.value = '';
    });

    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag-over'); });
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('drag-over');
      addFiles([...e.dataTransfer.files]);
    });
  }

  /* ─── SETUP TWO-FILE DROP ZONES (compare) ──────────────────────────────── */
  function setupTwoFileDZs() {
    ['file1', 'file2'].forEach(fn => {
      const dz = q(`#dz-${fn}`);
      const fi = q(`#input-${fn}`);
      if (!dz || !fi) return;

      dz.addEventListener('click', function (e) {
        if (e.target === fi) return;
        e.preventDefault();
        fi.click();
      });

      fi.addEventListener('change', () => {
        if (fi.files[0]) {
          twoFileMap[fn] = fi.files[0];
          q(`#dz-${fn}-name`).textContent = fi.files[0].name;
          dz.classList.add('has-files');
        }
        fi.value = '';
      });

      dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
      dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag-over'); });
      dz.addEventListener('drop', e => {
        e.preventDefault(); dz.classList.remove('drag-over');
        const f = e.dataTransfer.files[0];
        if (f) { twoFileMap[fn] = f; q(`#dz-${fn}-name`).textContent = f.name; dz.classList.add('has-files'); }
      });
    });
  }

  /* ─── ADD FILES ─────────────────────────────────────────────────────────── */
  function addFiles(newFiles) {
    if (!newFiles.length) return;
    hideError();
    // Validate type
    const allowed = (C.acceptedTypes||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
    for (const f of newFiles) {
      if (allowed.length && !allowed.some(ext => {
        if (ext.startsWith('.')) return f.name.toLowerCase().endsWith(ext);
        return f.type.startsWith(ext);
      })) {
        showError(`"${f.name}" is not a supported file type. Accepted: ${C.acceptedLabel}`);
        return;
      }
    }
    if (C.multiFile) {
      if (uploadedFiles.length + newFiles.length > C.maxFiles) {
        showError(`Maximum ${C.maxFiles} files allowed.`);
        return;
      }
      uploadedFiles.push(...newFiles);
    } else {
      uploadedFiles = [newFiles[0]];
    }
    renderFileList();
  }

  /* ─── REMOVE FILE ───────────────────────────────────────────────────────── */
  window.removeFile = function (idx) {
    uploadedFiles.splice(idx, 1);
    renderFileList();
    if (!uploadedFiles.length) {
      const dz = q('#mainDropZone');
      if (dz) dz.classList.remove('has-files');
    }
  };

  /* ─── COLLECT FORM DATA ─────────────────────────────────────────────────── */
  function buildFormData() {
    const fd = new FormData();

    // Files
    if (C.twoFiles) {
      if (!twoFileMap.file1 || !twoFileMap.file2) throw new Error('Please upload both PDF files to compare.');
      fd.append('file1', twoFileMap.file1);
      fd.append('file2', twoFileMap.file2);
    } else if (!C.noFile) {
      if (!uploadedFiles.length) throw new Error(`Please upload a ${C.acceptedLabel} file first.`);
      if (C.multiFile) {
        if (uploadedFiles.length < (C.minFiles||1))
          throw new Error(`Please upload at least ${C.minFiles} files.`);
        uploadedFiles.forEach(f => fd.append('files', f));
      } else {
        fd.append('file', uploadedFiles[0]);
      }
    }

    // URL (html-to-pdf)
    const urlInput = q('#url-input');
    if (urlInput && urlInput.value.trim()) {
      fd.append('html_url', urlInput.value.trim());
    }

    // Options
    C.options.forEach(opt => {
      const el = q(`#opt-${opt.id}`);
      if (el) {
        const val = (opt.type === 'radio')
          ? (document.querySelector(`[name="${opt.id}"]:checked`) || {}).value || ''
          : el.value;
        if (val !== undefined && val !== '') fd.append(opt.id, val);
      }
    });

    return fd;
  }

  /* ─── PROCESS / SUBMIT ──────────────────────────────────────────────────── */
  window.processFile = async function () {
    hideError();
    const btn = q('#processBtn');
    let fd;
    try { fd = buildFormData(); }
    catch (err) { showError(err.message); return; }

    btn.classList.add('loading');
    btn.disabled = true;
    q('#resultCard')     && q('#resultCard').classList.remove('visible');
    q('#textResultCard') && q('#textResultCard').classList.remove('visible');
    startProgress('Processing your file…');

    try {
      const resp = await fetch(C.apiEndpoint, { method: 'POST', body: fd });
      finishProgress(100);

      if (C.resultType === 'json') {
        const data = await resp.json();
        if (!data.success) throw new Error(data.error || 'Processing failed.');
        showJSONResult(data);
      } else if (C.resultType === 'text') {
        if (!resp.ok) { const d = await resp.json(); throw new Error(d.error || `Server error ${resp.status}`); }
        const blob = await resp.blob();
        const text = await blob.text();
        showTextResult(text);
      } else {
        // File download
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({error: `Server error ${resp.status}`}));
          throw new Error(errData.error || `Server error ${resp.status}`);
        }
        const blob      = await resp.blob();
        if (resultBlobURL) URL.revokeObjectURL(resultBlobURL);
        resultBlobURL   = URL.createObjectURL(blob);
        const dlBtn     = q('#downloadBtn');
        dlBtn.href      = resultBlobURL;
        dlBtn.download  = C.outputFilename;
        q('#resultFilename').textContent = C.outputFilename;

        // Show size info
        const origSize = uploadedFiles[0] ? fmtSize(uploadedFiles[0].size) : '';
        const newSize  = fmtSize(blob.size);
        q('#resultMeta').textContent = origSize ? `${origSize} → ${newSize}` : `Size: ${newSize}`;

        q('#resultCard').classList.add('visible');
      }
    } catch (err) {
      finishProgress(0);
      showError(err.message || 'An error occurred. Please try again.');
    } finally {
      setTimeout(hideProgress, 1200);
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  };

  /* ─── SHOW TEXT RESULT ──────────────────────────────────────────────────── */
  function showTextResult(text) {
    const card = q('#textResultCard');
    const body = q('#textResultBody');
    if (!card || !body) return;
    body.textContent = text;
    card.classList.add('visible');
    window._resultText = text;
  }

  /* ─── SHOW JSON RESULT (smart formatter) ────────────────────────────────── */
  function showJSONResult(data) {
    const card = q('#textResultCard');
    const body = q('#textResultBody');
    if (!card || !body) return;
    let html = '';

    if (data.summary !== undefined) {
      const { summary='', word_count=0, page_count=0, reading_time_min=0, key_topics=[] } = data;
      html += `<div style="margin-bottom:14px;padding:12px 16px;background:var(--bg);border-radius:10px;font-size:.8rem;color:var(--txt3);display:flex;gap:20px;flex-wrap:wrap;border:1px solid var(--border);">
        <span>📄 <strong style="color:var(--txt1)">${page_count}</strong> pages</span>
        <span>📝 <strong style="color:var(--txt1)">${Number(word_count).toLocaleString()}</strong> words</span>
        <span>⏱️ ~<strong style="color:var(--txt1)">${reading_time_min}</strong> min read</span>
      </div>`;
      if (key_topics && key_topics.length) {
        html += `<div style="margin-bottom:14px;display:flex;gap:6px;flex-wrap:wrap;">
          ${key_topics.map(t => `<span style="padding:4px 12px;background:var(--accent-glow);color:var(--accent-light);border-radius:20px;font-size:.72rem;font-weight:600;border:1px solid rgba(99,102,241,.25);">${esc(t)}</span>`).join('')}
        </div>`;
      }
      html += `<div style="font-size:.9rem;line-height:1.85;color:var(--txt1);white-space:pre-wrap;">${esc(summary)}</div>`;
      window._resultText = summary;
    } else if (data.differences !== undefined) {
      const diff = data.differences;
      const text = typeof diff === 'string' ? diff : JSON.stringify(diff, null, 2);
      html += `<pre style="font-size:.8rem;line-height:1.7;color:var(--txt2);white-space:pre-wrap;word-break:break-word;">${esc(text)}</pre>`;
      window._resultText = text;
    } else {
      const text = JSON.stringify(data, null, 2);
      html += `<pre style="font-size:.8rem;line-height:1.7;color:var(--txt2);white-space:pre-wrap;">${esc(text)}</pre>`;
      window._resultText = text;
    }

    body.innerHTML = html;
    card.classList.add('visible');
  }

  /* ─── COPY RESULT ───────────────────────────────────────────────────────── */
  window.copyResult = function () {
    const t = window._resultText || q('#textResultBody')?.textContent || '';
    navigator.clipboard.writeText(t).then(() => {
      const btn = q('#copyBtn');
      if (btn) { const o = btn.textContent; btn.textContent = '✓ Copied!'; setTimeout(() => btn.textContent = o, 2000); }
    });
  };

  /* ─── KEYBOARD SHORTCUT ─────────────────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault(); window.location.href = '/';
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const btn = q('#processBtn');
      if (btn && !btn.disabled) btn.click();
    }
  });

  /* ─── HEADER SCROLL FX ──────────────────────────────────────────────────── */
  window.addEventListener('scroll', () => {
    const h = q('.site-header');
    if (h) h.style.boxShadow = window.scrollY > 10 ? '0 4px 30px rgba(0,0,0,.5)' : '';
  }, { passive: true });

  /* ─── INIT ──────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    renderHeader();
    renderPage();
    renderFooter();
    setupDropZone();
    if (C.twoFiles) setupTwoFileDZs();
  });

})();
