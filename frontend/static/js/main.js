/**
 * IshuTools.fun — Main JavaScript
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 * Domain: ishutools.fun
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════════
   TOOLS DATA
   ══════════════════════════════════════════════════════════════════════ */
const TOOLS = [
  /* ── ORGANIZE ─────────────────────────────────────────── */
  { id:'merge-pdf',       name:'Merge PDF',           category:'organize',    icon:'fas fa-object-group',         accent:'#6366F1', accent2:'#8B5CF6', badge:'hot',
    desc:'Combine multiple PDF files into one', endpoint:'/api/merge-pdf',    multiFile:true,  accept:'.pdf', fields:[] },

  { id:'split-pdf',       name:'Split PDF',           category:'organize',    icon:'fas fa-cut',                  accent:'#8B5CF6', accent2:'#A78BFA', badge:null,
    desc:'Split a PDF into pages or ranges',    endpoint:'/api/split-pdf',    multiFile:false, accept:'.pdf', resultIsZip:true,
    fields:[
      {type:'select',name:'mode',label:'Split Mode', options:[{value:'all',label:'Each Page Separately'},{value:'range',label:'By Page Range'}]},
      {type:'text',name:'ranges',label:'Page Ranges (e.g. 1-3,4-6)',placeholder:'1-3,4-6'},
    ]},

  { id:'compress-pdf',    name:'Compress PDF',        category:'organize',    icon:'fas fa-compress-arrows-alt',  accent:'#10B981', accent2:'#059669', badge:'hot',
    desc:'Reduce PDF file size without losing quality', endpoint:'/api/compress-pdf', multiFile:false, accept:'.pdf',
    fields:[{type:'select',name:'level',label:'Compression Level',options:[{value:'low',label:'Low — Best Quality'},{value:'medium',label:'Medium — Balanced'},{value:'high',label:'High — Smallest Size'}]}]},

  { id:'remove-pages',    name:'Remove Pages',        category:'organize',    icon:'fas fa-trash-alt',            accent:'#EF4444', accent2:'#DC2626', badge:null,
    desc:'Delete specific pages from your PDF',  endpoint:'/api/remove-pages', multiFile:false, accept:'.pdf',
    fields:[{type:'text',name:'pages',label:'Pages to Remove (e.g. 1,3,5-7)',placeholder:'1,3,5-7'}]},

  { id:'extract-pages',   name:'Extract Pages',       category:'organize',    icon:'fas fa-file-export',          accent:'#F59E0B', accent2:'#D97706', badge:null,
    desc:'Extract specific pages into a new PDF', endpoint:'/api/extract-pages', multiFile:false, accept:'.pdf',
    fields:[{type:'text',name:'pages',label:'Pages to Extract (e.g. 1-3,5)',placeholder:'1-3,5,7'}]},

  { id:'organize-pdf',    name:'Organize PDF',        category:'organize',    icon:'fas fa-sort',                 accent:'#6366F1', accent2:'#8B5CF6', badge:null,
    desc:'Reorder pages in your PDF document',   endpoint:'/api/organize-pdf', multiFile:false, accept:'.pdf',
    fields:[{type:'text',name:'order',label:'New Page Order (e.g. 3,1,2)',placeholder:'3,1,2,4'}]},

  { id:'ocr-pdf',         name:'OCR PDF',             category:'organize',    icon:'fas fa-eye',                  accent:'#7C3AED', accent2:'#6D28D9', badge:'new',
    desc:'Make scanned PDFs searchable with text', endpoint:'/api/ocr-pdf', multiFile:false, accept:'.pdf',
    fields:[{type:'select',name:'lang',label:'Language',options:[{value:'eng',label:'English'},{value:'hin',label:'Hindi'},{value:'fra',label:'French'},{value:'deu',label:'German'},{value:'spa',label:'Spanish'}]}]},

  { id:'optimize-pdf',    name:'Optimize PDF',        category:'organize',    icon:'fas fa-tachometer-alt',       accent:'#06B6D4', accent2:'#0891B2', badge:null,
    desc:'Optimize PDF for web, print or mobile', endpoint:'/api/optimize-pdf', multiFile:false, accept:'.pdf',
    fields:[{type:'select',name:'profile',label:'Optimize For',options:[{value:'web',label:'Web (Fast Loading)'},{value:'print',label:'Print (High Quality)'},{value:'mobile',label:'Mobile (Small Size)'}]}]},

  { id:'repair-pdf',      name:'Repair PDF',          category:'organize',    icon:'fas fa-tools',                accent:'#84CC16', accent2:'#65A30D', badge:null,
    desc:'Fix corrupted or damaged PDF files',   endpoint:'/api/repair-pdf', multiFile:false, accept:'.pdf', fields:[]},

  /* ── CONVERT TO PDF ───────────────────────────────────── */
  { id:'img-to-pdf',      path:'jpg-to-pdf',   name:'JPG to PDF',          category:'convert-to',  icon:'fas fa-image',                accent:'#10B981', accent2:'#059669', badge:'hot',
    desc:'Convert JPG, PNG, WebP images to PDF', endpoint:'/api/img-to-pdf', multiFile:true, accept:'image/*',
    fields:[
      {type:'select',name:'page_size',label:'Page Size',options:[{value:'A4',label:'A4'},{value:'Letter',label:'Letter'},{value:'fit',label:'Fit to Image'}]},
      {type:'select',name:'orientation',label:'Orientation',options:[{value:'auto',label:'Auto Detect'},{value:'portrait',label:'Portrait'},{value:'landscape',label:'Landscape'}]},
    ]},

  { id:'word-to-pdf',     name:'Word to PDF',         category:'convert-to',  icon:'fab fa-microsoft',            accent:'#3B82F6', accent2:'#2563EB', badge:'hot',
    desc:'Convert Word documents (.docx) to PDF', endpoint:'/api/word-to-pdf', multiFile:false, accept:'.docx,.doc', fields:[]},

  { id:'excel-to-pdf',    name:'Excel to PDF',        category:'convert-to',  icon:'fas fa-file-excel',           accent:'#10B981', accent2:'#059669', badge:null,
    desc:'Convert Excel spreadsheets to PDF',    endpoint:'/api/excel-to-pdf', multiFile:false, accept:'.xlsx,.xls', fields:[]},

  { id:'pptx-to-pdf',     name:'PowerPoint to PDF',   category:'convert-to',  icon:'fas fa-file-powerpoint',      accent:'#F97316', accent2:'#EA580C', badge:null,
    desc:'Convert PowerPoint presentations to PDF', endpoint:'/api/pptx-to-pdf', multiFile:false, accept:'.pptx,.ppt', fields:[]},

  { id:'html-to-pdf',     name:'HTML to PDF',         category:'convert-to',  icon:'fab fa-html5',                accent:'#EF4444', accent2:'#DC2626', badge:'new',
    desc:'Convert HTML file or website URL to PDF', endpoint:'/api/html-to-pdf', multiFile:false, accept:'.html,.htm', noFileRequired:true,
    fields:[{type:'text',name:'html_url',label:'Website URL (optional — or upload HTML file)',placeholder:'https://example.com'}]},

  { id:'scan-to-pdf',     name:'Scan to PDF',         category:'convert-to',  icon:'fas fa-camera',               accent:'#8B5CF6', accent2:'#7C3AED', badge:null,
    desc:'Convert scanned images to searchable PDF', endpoint:'/api/scan-to-pdf', multiFile:true, accept:'image/*',
    fields:[{type:'select',name:'lang',label:'OCR Language',options:[{value:'eng',label:'English'},{value:'hin',label:'Hindi'},{value:'fra',label:'French'}]}]},

  /* ── CONVERT FROM PDF ─────────────────────────────────── */
  { id:'pdf-to-img',      path:'pdf-to-jpg',   name:'PDF to JPG',          category:'convert-from', icon:'fas fa-file-image',           accent:'#F59E0B', accent2:'#D97706', badge:'hot',
    desc:'Convert PDF pages to high-quality images', endpoint:'/api/pdf-to-img', multiFile:false, accept:'.pdf', resultIsZip:true,
    fields:[
      {type:'select',name:'format',label:'Image Format',options:[{value:'jpg',label:'JPEG (Smaller)'},{value:'png',label:'PNG (Better Quality)'}]},
      {type:'select',name:'dpi',label:'DPI Quality',options:[{value:'96',label:'96 DPI (Screen)'},{value:'150',label:'150 DPI (Standard)'},{value:'300',label:'300 DPI (Print)'}]},
      {type:'text',name:'pages',label:'Pages (e.g. 1-3 or "all")',placeholder:'all'},
    ]},

  { id:'pdf-to-word',     name:'PDF to Word',         category:'convert-from', icon:'fas fa-file-word',            accent:'#3B82F6', accent2:'#2563EB', badge:null,
    desc:'Extract PDF content to editable Word file', endpoint:'/api/pdf-to-word', multiFile:false, accept:'.pdf', fields:[]},

  { id:'pdf-to-excel',    name:'PDF to Excel',        category:'convert-from', icon:'fas fa-file-excel',           accent:'#10B981', accent2:'#059669', badge:null,
    desc:'Extract tables from PDF to Excel spreadsheet', endpoint:'/api/pdf-to-excel', multiFile:false, accept:'.pdf', fields:[]},

  { id:'pdf-to-pptx',     name:'PDF to PowerPoint',   category:'convert-from', icon:'fas fa-file-powerpoint',      accent:'#F97316', accent2:'#EA580C', badge:null,
    desc:'Convert PDF slides to PowerPoint presentation', endpoint:'/api/pdf-to-pptx', multiFile:false, accept:'.pdf', fields:[]},

  { id:'pdf-to-pdfa',     name:'PDF to PDF/A',        category:'convert-from', icon:'fas fa-archive',              accent:'#6366F1', accent2:'#8B5CF6', badge:'new',
    desc:'Convert PDF to archival PDF/A format',  endpoint:'/api/pdf-to-pdfa', multiFile:false, accept:'.pdf', fields:[]},

  /* ── EDIT PDF ─────────────────────────────────────────── */
  { id:'rotate-pdf',      name:'Rotate PDF',          category:'edit',         icon:'fas fa-redo',                 accent:'#EC4899', accent2:'#BE185D', badge:null,
    desc:'Rotate all or specific pages in a PDF', endpoint:'/api/rotate-pdf', multiFile:false, accept:'.pdf',
    fields:[
      {type:'select',name:'angle',label:'Rotation',options:[{value:'90',label:'90° Clockwise'},{value:'180',label:'180°'},{value:'270',label:'90° Counter-clockwise'}]},
      {type:'text',name:'pages',label:'Pages (blank = all)',placeholder:'all'},
    ]},

  { id:'add-page-numbers', name:'Add Page Numbers',   category:'edit',         icon:'fas fa-list-ol',              accent:'#8B5CF6', accent2:'#7C3AED', badge:null,
    desc:'Add page numbers to your PDF documents', endpoint:'/api/add-page-numbers', multiFile:false, accept:'.pdf',
    fields:[
      {type:'select',name:'position',label:'Position',options:[{value:'bottom-center',label:'Bottom Center'},{value:'bottom-right',label:'Bottom Right'},{value:'bottom-left',label:'Bottom Left'},{value:'top-center',label:'Top Center'}]},
      {type:'text',name:'start',label:'Start Number',placeholder:'1'},
      {type:'text',name:'prefix',label:'Prefix (e.g. "Page ")',placeholder:''},
    ]},

  { id:'add-watermark',   name:'Add Watermark',       category:'edit',         icon:'fas fa-tint',                 accent:'#06B6D4', accent2:'#0891B2', badge:null,
    desc:'Add text watermark to PDF pages',        endpoint:'/api/add-watermark', multiFile:false, accept:'.pdf',
    fields:[
      {type:'text',name:'text',label:'Watermark Text',placeholder:'CONFIDENTIAL'},
      {type:'select',name:'position',label:'Position',options:[{value:'center',label:'Center (Diagonal)'},{value:'top-right',label:'Top Right'},{value:'bottom-right',label:'Bottom Right'}]},
      {type:'text',name:'opacity',label:'Opacity (0.1–1.0)',placeholder:'0.3'},
      {type:'text',name:'color',label:'Color (hex)',placeholder:'#808080'},
    ]},

  { id:'crop-pdf',        name:'Crop PDF',            category:'edit',         icon:'fas fa-crop',                 accent:'#84CC16', accent2:'#65A30D', badge:null,
    desc:'Crop margins and adjust PDF page size',  endpoint:'/api/crop-pdf', multiFile:false, accept:'.pdf',
    fields:[
      {type:'text',name:'left',label:'Left %',placeholder:'10'},
      {type:'text',name:'right',label:'Right %',placeholder:'90'},
      {type:'text',name:'top',label:'Top %',placeholder:'90'},
      {type:'text',name:'bottom',label:'Bottom %',placeholder:'10'},
    ]},

  /* ── SECURITY ─────────────────────────────────────────── */
  { id:'unlock-pdf',      name:'Unlock PDF',          category:'security',     icon:'fas fa-lock-open',            accent:'#EF4444', accent2:'#DC2626', badge:'hot',
    desc:'Remove password protection from PDF',   endpoint:'/api/unlock-pdf', multiFile:false, accept:'.pdf',
    fields:[{type:'text',name:'password',label:'Current Password (if known)',placeholder:'Leave empty if unknown'}]},

  { id:'protect-pdf',     name:'Protect PDF',         category:'security',     icon:'fas fa-shield-alt',           accent:'#6366F1', accent2:'#4F46E5', badge:null,
    desc:'Add password protection to PDF',         endpoint:'/api/protect-pdf', multiFile:false, accept:'.pdf',
    fields:[
      {type:'text',name:'user_password',label:'Open Password',placeholder:'Password to open'},
      {type:'text',name:'owner_password',label:'Owner Password',placeholder:'Password for permissions'},
      {type:'select',name:'permissions',label:'Permissions',options:[{value:'all',label:'All Allowed'},{value:'readonly',label:'Read Only'},{value:'noprint',label:'No Printing'}]},
    ]},

  { id:'sign-pdf',        name:'Sign PDF',            category:'security',     icon:'fas fa-signature',            accent:'#10B981', accent2:'#059669', badge:'new',
    desc:'Add visible text signature to PDF',      endpoint:'/api/sign-pdf', multiFile:false, accept:'.pdf',
    fields:[
      {type:'text',name:'name',label:'Your Name / Signature',placeholder:'Ishu Kumar'},
      {type:'select',name:'position',label:'Position',options:[{value:'bottom-right',label:'Bottom Right'},{value:'bottom-left',label:'Bottom Left'},{value:'bottom-center',label:'Bottom Center'},{value:'top-right',label:'Top Right'}]},
      {type:'text',name:'pages',label:'Pages (last, all, or number)',placeholder:'last'},
    ]},

  { id:'redact-pdf',      name:'Redact PDF',          category:'security',     icon:'fas fa-user-secret',          accent:'#64748B', accent2:'#475569', badge:null,
    desc:'Permanently redact sensitive text from PDF', endpoint:'/api/redact-pdf', multiFile:false, accept:'.pdf',
    fields:[{type:'textarea',name:'keywords',label:'Keywords to Redact (one per line)',placeholder:'phone number\nemail@email.com\nSSN'}]},

  { id:'compare-pdf',     name:'Compare PDF',         category:'security',     icon:'fas fa-balance-scale',        accent:'#8B5CF6', accent2:'#7C3AED', badge:null,
    desc:'Compare two PDF documents for differences', endpoint:'/api/compare-pdf', multiFile:true, accept:'.pdf', resultIsText:true, fields:[]},

  /* ── AI TOOLS ─────────────────────────────────────────── */
  { id:'summarize-pdf',   path:'summarize-pdf', name:'AI Summarizer',       category:'ai',           icon:'fas fa-robot',                accent:'#7C3AED', accent2:'#6D28D9', badge:'hot',
    desc:'Instantly summarize any PDF with AI',    endpoint:'/api/summarize-pdf', multiFile:false, accept:'.pdf', resultIsText:true,
    fields:[{type:'select',name:'length',label:'Summary Length',options:[{value:'short',label:'Short (3 sentences)'},{value:'medium',label:'Medium (5 sentences)'},{value:'long',label:'Long (10 sentences)'}]}]},

  { id:'translate-pdf',   name:'Translate PDF',       category:'ai',           icon:'fas fa-language',             accent:'#6366F1', accent2:'#8B5CF6', badge:'new',
    desc:'Translate PDF to any language using AI', endpoint:'/api/translate-pdf', multiFile:false, accept:'.pdf',
    fields:[
      {type:'select',name:'target_lang',label:'Translate To',options:[{value:'hi',label:'Hindi'},{value:'en',label:'English'},{value:'fr',label:'French'},{value:'de',label:'German'},{value:'es',label:'Spanish'},{value:'zh-CN',label:'Chinese'},{value:'ar',label:'Arabic'},{value:'ja',label:'Japanese'},{value:'ru',label:'Russian'}]},
      {type:'select',name:'source_lang',label:'Source Language',options:[{value:'auto',label:'Auto Detect'},{value:'en',label:'English'},{value:'hi',label:'Hindi'},{value:'fr',label:'French'}]},
    ]},

  { id:'edit-pdf',        name:'Edit PDF',             category:'edit',         icon:'fas fa-pencil-alt',           accent:'#0EA5E9', accent2:'#0284C7', badge:'new',
    desc:'Add text, highlights, annotations and sticky notes to PDF', endpoint:'/api/edit-pdf', multiFile:false, accept:'.pdf',
    fields:[
      {type:'text',name:'text',label:'Text to Add',placeholder:'Enter text to add...'},
      {type:'number',name:'page_num',label:'Page Number',placeholder:'1'},
      {type:'number',name:'x',label:'X Position',placeholder:'100'},
      {type:'number',name:'y',label:'Y Position',placeholder:'100'},
    ]},

  { id:'pdf-forms',       name:'Fill PDF Forms',       category:'edit',         icon:'fas fa-wpforms',              accent:'#14B8A6', accent2:'#0D9488', badge:null,
    desc:'Fill and flatten PDF form fields automatically', endpoint:'/api/pdf-forms', multiFile:false, accept:'.pdf',
    fields:[
      {type:'text',name:'field_values',label:'Field Values (JSON)',placeholder:'{"name":"John","email":"john@example.com"}'},
      {type:'checkbox',name:'flatten',label:'Flatten form after filling'},
    ]},

  { id:'jpg-to-pdf',      name:'JPG to PDF',           category:'convert-to',   icon:'fas fa-file-image',           accent:'#EC4899', accent2:'#DB2777', badge:null,
    desc:'Convert JPG, PNG, WebP images to PDF',  endpoint:'/api/img-to-pdf', multiFile:true, accept:'.jpg,.jpeg,.png,.webp,.gif,.bmp,.tiff',
    },

  { id:'pdf-to-jpg',      name:'PDF to JPG',           category:'convert-from', icon:'fas fa-images',               accent:'#F59E0B', accent2:'#D97706', badge:null,
    desc:'Convert PDF pages to high-quality JPG images', endpoint:'/api/pdf-to-img', multiFile:false, accept:'.pdf',
    fields:[
      {type:'select',name:'format',label:'Image Format',options:[{value:'jpg',label:'JPG'},{value:'png',label:'PNG'},{value:'webp',label:'WebP'}]},
      {type:'number',name:'dpi',label:'DPI (quality)',placeholder:'150'},
    ]},
];

/* ══════════════════════════════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════════════════════════════ */
let currentTool   = null;
let uploadedFiles = [];
let searchQuery   = '';

/* ══════════════════════════════════════════════════════════════════════
   PARTICLE CANVAS
   ══════════════════════════════════════════════════════════════════════ */
function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W = canvas.width  = window.innerWidth;
  let H = canvas.height = window.innerHeight;
  const COUNT = Math.min(Math.floor(W * H / 20000), 60);
  const RGB = '99,102,241';

  const pts = Array.from({ length: COUNT }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35,
    r: Math.random() * 1.8 + .8, a: Math.random() * .45 + .1,
  }));

  window.addEventListener('resize', () => {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }, { passive: true });

  (function draw() {
    ctx.clearRect(0, 0, W, H);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${RGB},${p.a})`;
      ctx.fill();
    });
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < 110) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(${RGB},${.07 * (1 - d / 110)})`;
          ctx.lineWidth = .7;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  })();
}

/* ══════════════════════════════════════════════════════════════════════
   CURSOR GLOW
   ══════════════════════════════════════════════════════════════════════ */
function initCursorGlow() {
  const glow = document.getElementById('cursorGlow');
  if (!glow || window.matchMedia('(hover:none)').matches) {
    if (glow) glow.style.display = 'none';
    return;
  }
  let mx = -999, my = -999;
  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });
  setInterval(() => {
    glow.style.left = mx + 'px';
    glow.style.top  = my + 'px';
  }, 50);
}

/* ══════════════════════════════════════════════════════════════════════
   THEME
   ══════════════════════════════════════════════════════════════════════ */
function initTheme() {
  const btn  = document.getElementById('themeToggle');
  const saved = localStorage.getItem('ishu-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  btn && btn.addEventListener('click', () => {
    const curr = document.documentElement.getAttribute('data-theme');
    const next = curr === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ishu-theme', next);
  });
}

/* ══════════════════════════════════════════════════════════════════════
   HEADER SCROLL
   ══════════════════════════════════════════════════════════════════════ */
function initHeaderScroll() {
  const hdr = document.getElementById('header');
  const fb  = document.getElementById('filterBar');
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    hdr && hdr.classList.toggle('scrolled', y > 20);
    fb  && fb.classList.toggle('shadow', y > 100);
  }, { passive: true });
}

/* ══════════════════════════════════════════════════════════════════════
   MOBILE MENU
   ══════════════════════════════════════════════════════════════════════ */
function initMobileMenu() {
  const btn  = document.getElementById('hamburger');
  const menu = document.getElementById('mobileMenu');
  if (!btn || !menu) return;
  btn.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    btn.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  });
}
window.closeMobileMenu = function () {
  const menu = document.getElementById('mobileMenu');
  const btn  = document.getElementById('hamburger');
  menu && menu.classList.remove('open');
  btn  && btn.classList.remove('open');
  document.body.style.overflow = '';
};

/* ══════════════════════════════════════════════════════════════════════
   COUNTER ANIMATION (IntersectionObserver — only fires when visible)
   ══════════════════════════════════════════════════════════════════════ */
function initCounters() {
  const els = document.querySelectorAll('[data-count]');
  if (!els.length) return;
  const easeOutQuart = t => 1 - Math.pow(1 - t, 4);
  const run = el => {
    if (el._counted) return;
    el._counted = true;
    const target = parseInt(el.dataset.count, 10);
    const dur = 1400;
    const start = performance.now();
    const tick = now => {
      const p = Math.min((now - start) / dur, 1);
      el.textContent = Math.round(easeOutQuart(p) * target);
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = target;
    };
    requestAnimationFrame(tick);
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } });
    }, { threshold: .5 });
    els.forEach(el => io.observe(el));
  } else { els.forEach(run); }
}

/* ══════════════════════════════════════════════════════════════════════
   TYPED.JS HERO ANIMATION
   ══════════════════════════════════════════════════════════════════════ */
function initTyped() {
  if (typeof Typed === 'undefined' || !document.getElementById('heroTyped')) return;
  new Typed('#heroTyped', {
    strings: [
      'Merge PDF files online',
      'Split PDF into pages',
      'Compress PDF — no quality loss',
      'Convert PDF to Word free',
      'JPG to PDF in seconds',
      'OCR — make scanned PDFs searchable',
      'AI Summarize any PDF instantly',
      'Translate PDF to 100+ languages',
      'Sign PDF online for free',
      'Protect PDF with password',
      'Unlock PDF password free',
      'Rotate &amp; crop PDF pages',
    ],
    typeSpeed: 52,
    backSpeed: 22,
    loop: true,
    backDelay: 1600,
    startDelay: 500,
    cursorChar: '|',
    smartBackspace: true,
  });
}

/* ══════════════════════════════════════════════════════════════════════
   RENDER TOOL CARDS
   ══════════════════════════════════════════════════════════════════════ */
const GRID_MAP = {
  'organize':     'organizeGrid',
  'convert-to':   'convertToGrid',
  'convert-from': 'convertFromGrid',
  'edit':         'editGrid',
  'security':     'securityGrid',
  'ai':           'aiGrid',
};

function renderTools(filter, query) {
  filter = filter || 'all';
  query  = (query || '').toLowerCase().trim();
  let visible = 0;

  Object.entries(GRID_MAP).forEach(([cat, gridId]) => {
    const grid    = document.getElementById(gridId);
    const section = grid && grid.closest('.tools-section');
    if (!grid) return;

    const tools = TOOLS.filter(t => {
      if (t.category !== cat) return false;
      if (filter !== 'all' && filter !== cat) return false;
      if (query) return t.name.toLowerCase().includes(query) || t.desc.toLowerCase().includes(query) || t.id.includes(query);
      return true;
    });

    if (tools.length === 0) {
      section && (section.style.display = 'none');
      return;
    }
    section && (section.style.display = '');
    grid.innerHTML = tools.map((t, i) => buildCardHTML(t, i)).join('');
    visible += tools.length;
  });

  const noRes = document.getElementById('noResults');
  noRes && (noRes.style.display = visible === 0 ? 'block' : 'none');
}

function buildCardHTML(t, idx) {
  const badge = t.badge
    ? `<div class="tool-badge ${t.badge}">${t.badge === 'hot' ? '🔥 HOT' : '✨ NEW'}</div>` : '';
  const url = '/tools/' + (t.path || t.id) + '/';
  const delay = typeof idx === 'number' ? Math.min(idx, 18) * 45 : 0;
  return `
<a class="tool-card" data-id="${t.id}" href="${url}" aria-label="${t.name}"
   style="--card-accent:${t.accent};--card-accent2:${t.accent2||t.accent};animation-delay:${delay}ms">
  ${badge}
  <div class="tool-icon-wrap" style="background:${t.accent}18">
    <i class="${t.icon}" style="color:${t.accent}; font-size:1.4rem"></i>
  </div>
  <div class="tool-info">
    <div class="tool-name">${t.name}</div>
    <div class="tool-desc">${t.desc}</div>
  </div>
  <div class="tool-arrow" style="color:${t.accent}">
    Use Tool <i class="fas fa-arrow-right"></i>
  </div>
</a>`;
}

/* ══════════════════════════════════════════════════════════════════════
   SEARCH
   ══════════════════════════════════════════════════════════════════════ */
function initSearch() {
  const heroInp  = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClear');
  const suggs    = document.getElementById('searchSuggestions');
  const hdrInp   = document.getElementById('headerSearchInput');
  const mobInp   = document.getElementById('mobileSearchInput');

  function doSearch(q) {
    searchQuery = q;
    renderTools(getCurrentFilter(), q);
    if (q.length > 0) {
      document.getElementById('toolsMain') &&
        document.getElementById('toolsMain').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function showSuggs(q) {
    if (!suggs) return;
    if (!q) { suggs.classList.remove('active'); return; }
    const matches = TOOLS.filter(t =>
      t.name.toLowerCase().includes(q.toLowerCase()) ||
      t.desc.toLowerCase().includes(q.toLowerCase())
    ).slice(0, 7);
    if (!matches.length) { suggs.classList.remove('active'); return; }
    suggs.innerHTML = matches.map(t => `
<div class="sugg-item" data-id="${t.id}" role="option">
  <div class="sugg-icon" style="background:${t.accent}1A"><i class="${t.icon}" style="color:${t.accent}"></i></div>
  <div><div class="sugg-name">${t.name}</div><div class="sugg-cat">${catLabel(t.category)}</div></div>
  <i class="fas fa-arrow-right sugg-arrow"></i>
</div>`).join('');
    suggs.classList.add('active');
    suggs.querySelectorAll('.sugg-item').forEach(item => {
      item.addEventListener('click', () => {
        const tool = TOOLS.find(t => t.id === item.dataset.id);
        if (tool) {
          suggs.classList.remove('active');
          window.location.href = '/tools/' + (tool.path || tool.id) + '/';
        }
      });
    });
  }

  if (heroInp) {
    heroInp.addEventListener('input', e => {
      const q = e.target.value;
      clearBtn && clearBtn.classList.toggle('visible', !!q);
      showSuggs(q);
      doSearch(q);
    });
    heroInp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { suggs && suggs.classList.remove('active'); doSearch(heroInp.value); }
      if (e.key === 'Escape') suggs && suggs.classList.remove('active');
    });
  }

  clearBtn && clearBtn.addEventListener('click', () => {
    if (heroInp) heroInp.value = '';
    clearBtn.classList.remove('visible');
    suggs && suggs.classList.remove('active');
    doSearch('');
  });

  if (hdrInp) {
    hdrInp.addEventListener('input', e => {
      const q = e.target.value;
      if (heroInp) heroInp.value = q;
      clearBtn && clearBtn.classList.toggle('visible', !!q);
      doSearch(q);
    });
    hdrInp.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(hdrInp.value); });
  }

  if (mobInp) {
    mobInp.addEventListener('input', e => { doSearch(e.target.value); closeMobileMenu(); });
  }

  document.addEventListener('click', e => {
    if (suggs && !suggs.contains(e.target) && heroInp && !heroInp.contains(e.target)) {
      suggs.classList.remove('active');
    }
  });
}

function catLabel(cat) {
  return { 'organize': 'Organize', 'convert-to': 'Convert to PDF', 'convert-from': 'Convert from PDF', 'edit': 'Edit PDF', 'security': 'Security', 'ai': 'AI Tools' }[cat] || cat;
}

function getCurrentFilter() {
  const a = document.querySelector('.filter-btn.active');
  return a ? a.dataset.filter : 'all';
}

window.scrollToTools = function () {
  document.getElementById('toolsMain')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/* ══════════════════════════════════════════════════════════════════════
   FILTER BAR
   ══════════════════════════════════════════════════════════════════════ */
function initFilterBar() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTools(btn.dataset.filter, searchQuery);
    });
  });
}

/* ══════════════════════════════════════════════════════════════════════
   MODAL — Open / Close
   ══════════════════════════════════════════════════════════════════════ */
function openModal(tool) {
  currentTool   = tool;
  uploadedFiles = [];

  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  if (!overlay || !content) return;

  content.innerHTML = buildModalHTML(tool);
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';

  setupDropZone(tool);

  setTimeout(() => {
    const first = content.querySelector('input, select, textarea, button:not(.modal-close)');
    first && first.focus();
  }, 120);
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  overlay && overlay.classList.remove('active');
  document.body.style.overflow = '';
  currentTool   = null;
  uploadedFiles = [];
}

function buildModalHTML(tool) {
  const acceptLabel = tool.accept.replace(/\./g, '').replace(/image\/\*/g, 'images').replace(/,/g, ', ').toUpperCase();
  return `
<div class="modal-head">
  <div class="modal-head-icon" style="background:${tool.accent}1A">
    <i class="${tool.icon}" style="color:${tool.accent}"></i>
  </div>
  <div>
    <div class="modal-tool-name">${tool.name}</div>
    <div class="modal-tool-desc">${tool.desc}</div>
  </div>
</div>

<div class="drop-zone" id="dropZone">
  <i class="fas fa-cloud-upload-alt drop-zone-icon" id="dzIcon"></i>
  <div class="drop-zone-title" id="dzTitle">
    ${tool.multiFile ? 'Drop files here or click to browse' : 'Drop file here or click to browse'}
  </div>
  <div class="drop-zone-sub">${acceptLabel} &bull; ${tool.multiFile ? 'Multiple files' : 'Single file'} &bull; Max 100MB</div>
  <input type="file" id="fileInput" accept="${tool.accept}" ${tool.multiFile ? 'multiple' : ''} />
</div>
<div id="filePrevList" class="file-preview-list"></div>

${buildFields(tool)}

<button class="btn-process" id="processBtn" type="button">
  <div class="btn-label">
    <i class="${tool.icon}"></i>
    <span>${tool.name}</span>
  </div>
</button>

<div class="progress-wrap" id="progressWrap">
  <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
  <div class="progress-lbl" id="progressLbl">Processing...</div>
</div>

<div class="result-box" id="resultBox"></div>`;
}

function buildFields(tool) {
  if (!tool.fields || tool.fields.length === 0) return '';
  return '<div style="margin-top:14px">' + tool.fields.map(f => {
    if (f.type === 'select') {
      return `<div class="form-group"><label class="form-label">${f.label}</label><select class="form-select" name="${f.name}">${f.options.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}</select></div>`;
    }
    if (f.type === 'textarea') {
      return `<div class="form-group"><label class="form-label">${f.label}</label><textarea class="form-textarea" name="${f.name}" placeholder="${f.placeholder || ''}"></textarea></div>`;
    }
    return `<div class="form-group"><label class="form-label">${f.label}</label><input type="text" class="form-input" name="${f.name}" placeholder="${f.placeholder || ''}" /></div>`;
  }).join('') + '</div>';
}

/* ══════════════════════════════════════════════════════════════════════
   DROP ZONE — THE CRITICAL FIX
   Explicit click handler guarantees file dialog opens in ALL browsers
   ══════════════════════════════════════════════════════════════════════ */
function setupDropZone(tool) {
  const dz    = document.getElementById('dropZone');
  const input = document.getElementById('fileInput');
  const prev  = document.getElementById('filePrevList');
  const btn   = document.getElementById('processBtn');
  if (!dz || !input) return;

  /* ★ CRITICAL FIX: Clicking drop zone area → programmatically open file dialog ★ */
  dz.addEventListener('click', function (e) {
    if (e.target === input) return;  // Already clicking the input itself
    e.preventDefault();
    e.stopPropagation();
    input.click();
  });

  /* Drag & Drop */
  dz.addEventListener('dragenter', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag-over'); });
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drag-over');
    handleFiles(Array.from(e.dataTransfer.files), dz, prev);
  });

  /* File input change → user selected files via dialog */
  input.addEventListener('change', function () {
    if (this.files.length > 0) handleFiles(Array.from(this.files), dz, prev);
  });

  /* Process button */
  btn && btn.addEventListener('click', () => processTool(tool));
}

/* ── File Handling ─────────────────────────────────────────────────── */
function handleFiles(files, dz, prevList) {
  if (!files || files.length === 0) return;
  const MAX = 100 * 1024 * 1024;
  const good = files.filter(f => f.size <= MAX);
  const bad  = files.filter(f => f.size > MAX);
  if (bad.length) toast(`${bad.length} file(s) exceed 100MB and were skipped.`, 'error');
  if (!good.length) return;

  if (currentTool && currentTool.multiFile) {
    uploadedFiles = uploadedFiles.concat(good);
  } else {
    uploadedFiles = [good[0]];
  }

  // Update drop zone visually
  const icon  = document.getElementById('dzIcon');
  const title = document.getElementById('dzTitle');
  dz.classList.add('has-file');
  if (icon)  { icon.className  = 'fas fa-check-circle drop-zone-icon'; icon.style.color = 'var(--ok)'; }
  if (title) title.textContent = `${uploadedFiles.length} file${uploadedFiles.length > 1 ? 's' : ''} selected`;

  renderFilePreviews(prevList);
}

function renderFilePreviews(prevList) {
  if (!prevList) return;
  prevList.innerHTML = uploadedFiles.map((f, i) => `
<div class="file-preview-item">
  <i class="fas fa-file-alt fp-icon"></i>
  <span class="fp-name" title="${f.name}">${f.name}</span>
  <span class="fp-size">${fmtSize(f.size)}</span>
  <button class="fp-remove" data-idx="${i}" type="button" title="Remove"><i class="fas fa-times"></i></button>
</div>`).join('');

  prevList.querySelectorAll('.fp-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      uploadedFiles.splice(parseInt(btn.dataset.idx), 1);
      renderFilePreviews(prevList);
      if (uploadedFiles.length === 0) resetDropZone();
    });
  });
}

function resetDropZone() {
  const dz    = document.getElementById('dropZone');
  const input = document.getElementById('fileInput');
  const icon  = document.getElementById('dzIcon');
  const title = document.getElementById('dzTitle');
  dz    && dz.classList.remove('has-file', 'drag-over');
  input && (input.value = '');
  if (icon)  { icon.className  = 'fas fa-cloud-upload-alt drop-zone-icon'; icon.style.color = ''; }
  if (title) title.textContent = currentTool && currentTool.multiFile ? 'Drop files here or click to browse' : 'Drop file here or click to browse';
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/* ══════════════════════════════════════════════════════════════════════
   PROCESS TOOL — API CALL
   ══════════════════════════════════════════════════════════════════════ */
async function processTool(tool) {
  // Validate files
  if (!uploadedFiles || uploadedFiles.length === 0) {
    if (tool.noFileRequired) {
      // html-to-pdf with URL only — check URL field
      const urlField = document.querySelector('[name="html_url"]');
      if (!urlField || !urlField.value.trim()) {
        toast('Please upload an HTML file or enter a website URL.', 'error');
        return;
      }
    } else {
      toast('Please select a file first. Click the upload area above.', 'error');
      return;
    }
  }

  const btn  = document.getElementById('processBtn');
  const prog = document.getElementById('progressWrap');
  const fill = document.getElementById('progressFill');
  const lbl  = document.getElementById('progressLbl');
  const res  = document.getElementById('resultBox');

  if (res) { res.classList.remove('show'); res.innerHTML = ''; }
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }
  if (prog) prog.classList.add('show');
  if (fill) fill.style.width = '5%';

  let pct = 5;
  const msgs = ['Uploading file...', 'Processing PDF...', 'Applying changes...', 'Almost done...'];
  const pTimer = setInterval(() => {
    pct = Math.min(pct + Math.random() * 7, 88);
    if (fill) fill.style.width = pct + '%';
    if (lbl)  lbl.textContent  = msgs[Math.min(Math.floor(pct / 25), msgs.length - 1)];
  }, 280);

  try {
    const fd = new FormData();

    // Append files — CRITICAL: single-file tools use 'file', multi-file tools use 'files'
    if (tool.multiFile) {
      uploadedFiles.forEach(f => fd.append('files', f));
    } else {
      if (uploadedFiles.length > 0) fd.append('file', uploadedFiles[0]);
    }

    // Collect all form field values
    document.querySelectorAll('#modalContent .form-input, #modalContent .form-select, #modalContent .form-textarea').forEach(el => {
      if (el.name && el.value && el.value.trim()) fd.append(el.name, el.value.trim());
    });

    const resp = await fetch(tool.endpoint, { method: 'POST', body: fd });

    clearInterval(pTimer);
    if (fill) fill.style.width = '100%';
    if (lbl)  lbl.textContent  = 'Done!';

    if (!resp.ok) {
      let errMsg = `Error ${resp.status}`;
      try {
        const j = await resp.json();
        errMsg = j.error || j.message || errMsg;
      } catch (_) {
        try { errMsg = await resp.text() || errMsg; } catch (_) {}
      }
      throw new Error(errMsg);
    }

    const ct = resp.headers.get('Content-Type') || '';

    if (tool.resultIsText || ct.includes('application/json')) {
      let data;
      try   { data = await resp.json(); }
      catch (_) { data = { result: await resp.text() }; }
      showTextResult(tool, data);
    } else {
      const blob     = await resp.blob();
      const filename = parseFilename(resp, tool);
      showFileResult(blob, filename);
    }

    toast(`✓ ${tool.name} completed successfully!`, 'success');

  } catch (err) {
    clearInterval(pTimer);
    if (prog) prog.classList.remove('show');
    toast('Error: ' + err.message, 'error');
    console.error('[IshuTools]', tool.id, err);
  } finally {
    setTimeout(() => {
      if (prog) prog.classList.remove('show');
      if (btn)  { btn.classList.remove('loading'); btn.disabled = false; }
    }, 900);
  }
}

function parseFilename(resp, tool) {
  const cd = resp.headers.get('Content-Disposition') || '';
  const m  = cd.match(/filename[^;=\n]*=["']?([^"'\n]+)/);
  if (m && m[1]) return m[1].trim();
  if (tool.resultIsZip) return `ishutools_${tool.id}.zip`;
  if (tool.id.includes('word'))  return `ishutools_output.docx`;
  if (tool.id.includes('excel')) return `ishutools_output.xlsx`;
  if (tool.id.includes('pptx'))  return `ishutools_output.pptx`;
  return `ishutools_${tool.id}.pdf`;
}

function showFileResult(blob, filename) {
  const url = URL.createObjectURL(blob);
  const res = document.getElementById('resultBox');
  if (!res) return;
  res.innerHTML = `
<div class="result-box-title"><i class="fas fa-check-circle"></i> File is ready to download!</div>
<div class="result-info">Size: ${fmtSize(blob.size)}</div>
<a class="btn-download" href="${url}" download="${filename}">
  <i class="fas fa-download"></i> Download ${filename}
</a>`;
  res.classList.add('show');
  res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showTextResult(tool, data) {
  const res = document.getElementById('resultBox');
  if (!res) return;
  let html = `<div class="result-box-title"><i class="fas fa-check-circle"></i> ${tool.name} Complete!</div>`;

  if (tool.id === 'summarize-pdf') {
    const { summary='', word_count=0, page_count=0, reading_time_min=0, key_topics=[] } = data;
    html += `<div class="result-info">📄 ${page_count} pages &bull; ${word_count.toLocaleString()} words &bull; ~${reading_time_min} min read</div>`;
    if (key_topics.length) html += `<div class="result-info">🏷️ <strong>Key topics:</strong> ${key_topics.join(', ')}</div>`;
    html += `<div class="result-text">${esc(summary)}</div>`;
  } else if (data.summary) {
    html += `<div class="result-text">${esc(data.summary)}</div>`;
  } else if (typeof data === 'object') {
    html += `<div class="result-text">${esc(JSON.stringify(data, null, 2))}</div>`;
  } else {
    html += `<div class="result-text">${esc(String(data))}</div>`;
  }

  res.innerHTML = html;
  res.classList.add('show');
  res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ══════════════════════════════════════════════════════════════════════
   MODAL EVENTS
   ══════════════════════════════════════════════════════════════════════ */
function initModalEvents() {
  const overlay  = document.getElementById('modalOverlay');
  const closeBtn = document.getElementById('modalClose');

  closeBtn && closeBtn.addEventListener('click', closeModal);
  overlay  && overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

/* ══════════════════════════════════════════════════════════════════════
   TOAST
   ══════════════════════════════════════════════════════════════════════ */
function toast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const icons = { success: 'fas fa-check-circle', error: 'fas fa-exclamation-circle', info: 'fas fa-info-circle' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<i class="${icons[type] || icons.info} toast-icon"></i><span>${esc(msg)}</span>`;
  c.appendChild(el);
  setTimeout(() => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 350);
  }, 4200);
}

/* ══════════════════════════════════════════════════════════════════════
   GSAP ANIMATIONS
   ══════════════════════════════════════════════════════════════════════ */
function initAnimations() {
  if (typeof gsap === 'undefined') return;
  // Note: do NOT use opacity:0 as starting state — elements must always be visible.
  // Only animate position (y) so content is readable even if GSAP is slow.
  gsap.from('.hero-badge',            { y: 20, duration:.6,  ease:'power3.out', delay:.05 });
  gsap.from('.hero-title',            { y: 32, duration:.7,  ease:'power3.out', delay:.12 });
  gsap.from('.hero-desc',             { y: 20, duration:.6,  ease:'power3.out', delay:.22 });
  gsap.from('.hero-search-container', { y: 18, duration:.55, ease:'power3.out', delay:.3  });
  gsap.from('.hero-stats',            { y: 14, duration:.5,  ease:'power3.out', delay:.38 });
  gsap.from('.vis-card',              { y: 20, scale:.9, stagger:.1, duration:.55, ease:'back.out(1.5)', delay:.2 });
}

/* ══════════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
   ══════════════════════════════════════════════════════════════════════ */
function initKeyboard() {
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const inp = document.getElementById('searchInput');
      if (inp) { scrollToTools(); setTimeout(() => inp.focus(), 300); }
    }
  });
}

/* ══════════════════════════════════════════════════════════════════════
   BACK TO TOP
   ══════════════════════════════════════════════════════════════════════ */
function initBackToTop() {
  const btn = document.getElementById('backToTop');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 500);
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ══════════════════════════════════════════════════════════════════════
   SCROLL REVEAL (reveal-up elements)
   ══════════════════════════════════════════════════════════════════════ */
function initRevealUp() {
  document.body.classList.add('js-ready');
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal-up').forEach(el => el.classList.add('in-view'));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); } });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal-up').forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) { el.classList.add('in-view'); }
    else { io.observe(el); }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initParticles();
  initCursorGlow();
  initHeaderScroll();
  initMobileMenu();
  initCounters();
  renderTools('all', '');
  initSearch();
  initFilterBar();
  initModalEvents();
  initKeyboard();
  initBackToTop();
  initRevealUp();
  setTimeout(initAnimations, 200);
  setTimeout(initTyped, 900);
});
