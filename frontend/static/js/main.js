/**
 * IshuTools.fun — Main JavaScript
 * Professional PDF Tools Suite
 * Author: Ishu Kumar (ISHUKR41)
 */

'use strict';

// ══════════════════════════════════════════════════════════
// TOOL DATA — All 35+ PDF tools
// ══════════════════════════════════════════════════════════
const TOOLS = [
  // ── Organize ──────────────────────────────────────────
  {
    id: 'merge-pdf', name: 'Merge PDF', category: 'organize',
    icon: 'fas fa-object-group', color: '#6366F1', badge: 'hot',
    desc: 'Combine multiple PDF files into one document',
    longDesc: 'Merge multiple PDF files into a single document. Drag to reorder before merging.',
    apiEndpoint: '/api/merge-pdf', multiFile: true,
    accept: '.pdf', outputName: 'merged.pdf',
    keywords: ['merge', 'combine', 'join', 'unite', 'concat'],
    options: []
  },
  {
    id: 'split-pdf', name: 'Split PDF', category: 'organize',
    icon: 'fas fa-scissors', color: '#8B5CF6',
    desc: 'Split PDF into individual pages or ranges',
    longDesc: 'Extract specific pages or split your PDF into multiple files.',
    apiEndpoint: '/api/split-pdf', multiFile: false,
    accept: '.pdf', outputName: 'split_pages.zip',
    keywords: ['split', 'separate', 'divide', 'break', 'extract'],
    options: [
      { name: 'mode', label: 'Split Mode', type: 'select',
        choices: [
          { val: 'all', label: 'Every page separately' },
          { val: 'range', label: 'Custom range' },
          { val: 'every_n', label: 'Every N pages' }
        ]
      },
      { name: 'ranges', label: 'Page Range (e.g. 1-3,5,7)', type: 'text', placeholder: '1-3,5,7', conditional: 'mode=range' },
      { name: 'every_n', label: 'Pages per chunk', type: 'number', default: 2, conditional: 'mode=every_n' },
    ]
  },
  {
    id: 'compress-pdf', name: 'Compress PDF', category: 'organize',
    icon: 'fas fa-compress-alt', color: '#EC4899', badge: 'hot',
    desc: 'Reduce PDF file size without losing quality',
    longDesc: 'Optimize your PDF size for email, web, or storage.',
    apiEndpoint: '/api/compress-pdf', multiFile: false,
    accept: '.pdf', outputName: 'compressed.pdf',
    keywords: ['compress', 'reduce', 'shrink', 'optimize', 'size', 'smaller'],
    options: [
      { name: 'quality', label: 'Compression Level', type: 'select',
        choices: [
          { val: 'high', label: 'High Quality (larger file)' },
          { val: 'medium', label: 'Balanced (recommended)' },
          { val: 'low', label: 'Max Compression (smaller file)' }
        ]
      }
    ]
  },
  {
    id: 'remove-pages', name: 'Remove Pages', category: 'organize',
    icon: 'fas fa-file-minus', color: '#F59E0B',
    desc: 'Delete specific pages from your PDF',
    longDesc: 'Remove unwanted pages from your PDF document.',
    apiEndpoint: '/api/remove-pages', multiFile: false,
    accept: '.pdf', outputName: 'pages_removed.pdf',
    keywords: ['remove', 'delete', 'pages', 'cut'],
    options: [
      { name: 'pages', label: 'Pages to Remove (e.g. 1,3,5-8)', type: 'text', required: true, placeholder: '1,3,5-8' }
    ]
  },
  {
    id: 'extract-pages', name: 'Extract Pages', category: 'organize',
    icon: 'fas fa-copy', color: '#10B981',
    desc: 'Extract specific pages to a new PDF',
    longDesc: 'Pull out specific pages from your PDF into a new file.',
    apiEndpoint: '/api/extract-pages', multiFile: false,
    accept: '.pdf', outputName: 'extracted.pdf',
    keywords: ['extract', 'copy', 'pages', 'get'],
    options: [
      { name: 'pages', label: 'Pages to Extract (e.g. 2,4,6-10)', type: 'text', required: true, placeholder: '2,4,6-10' }
    ]
  },
  {
    id: 'organize-pdf', name: 'Organize PDF', category: 'organize',
    icon: 'fas fa-sort', color: '#6366F1',
    desc: 'Reorder pages in your PDF document',
    longDesc: 'Drag and rearrange pages in any order you like.',
    apiEndpoint: '/api/organize-pdf', multiFile: false,
    accept: '.pdf', outputName: 'organized.pdf',
    keywords: ['organize', 'reorder', 'rearrange', 'sort', 'order'],
    options: [
      { name: 'order', label: 'New Page Order (e.g. 3,1,2,4)', type: 'text', required: true, placeholder: '3,1,2,4' }
    ]
  },
  {
    id: 'scan-to-pdf', name: 'Scan to PDF', category: 'organize',
    icon: 'fas fa-scanner', color: '#7C3AED',
    desc: 'Convert scanned images to searchable PDF',
    longDesc: 'Upload scanned images and convert them to a searchable PDF with OCR.',
    apiEndpoint: '/api/scan-to-pdf', multiFile: true,
    accept: '.jpg,.jpeg,.png,.bmp,.tiff,.webp', outputName: 'scanned.pdf',
    keywords: ['scan', 'scanner', 'searchable', 'image to pdf', 'photo'],
    options: [
      { name: 'language', label: 'OCR Language', type: 'select',
        choices: [
          { val: 'eng', label: 'English' },
          { val: 'hin', label: 'Hindi' },
          { val: 'fra', label: 'French' },
          { val: 'deu', label: 'German' },
          { val: 'spa', label: 'Spanish' },
          { val: 'por', label: 'Portuguese' },
        ]
      },
      { name: 'enhance', label: 'Enhance Image Quality', type: 'checkbox', default: true }
    ]
  },
  {
    id: 'optimize-pdf', name: 'Optimize PDF', category: 'organize',
    icon: 'fas fa-tachometer-alt', color: '#F59E0B',
    desc: 'Optimize PDF for web, print, or screen',
    longDesc: 'Optimize your PDF for different output targets.',
    apiEndpoint: '/api/optimize-pdf', multiFile: false,
    accept: '.pdf', outputName: 'optimized.pdf',
    keywords: ['optimize', 'web', 'fast', 'performance', 'linearize'],
    options: [
      { name: 'target', label: 'Optimization Target', type: 'select',
        choices: [
          { val: 'web', label: 'Web (Fast Loading)' },
          { val: 'print', label: 'Print (High Quality)' },
          { val: 'screen', label: 'Screen (Small Size)' },
        ]
      }
    ]
  },
  {
    id: 'repair-pdf', name: 'Repair PDF', category: 'organize',
    icon: 'fas fa-wrench', color: '#EF4444',
    desc: 'Fix corrupted or damaged PDF files',
    longDesc: 'Attempt to repair broken or corrupted PDF files.',
    apiEndpoint: '/api/repair-pdf', multiFile: false,
    accept: '.pdf', outputName: 'repaired.pdf',
    keywords: ['repair', 'fix', 'corrupted', 'broken', 'damaged'],
    options: []
  },
  {
    id: 'ocr-pdf', name: 'OCR PDF', category: 'organize',
    icon: 'fas fa-font', color: '#3B82F6',
    desc: 'Extract text from scanned PDFs using OCR',
    longDesc: 'Use optical character recognition to make scanned PDFs searchable and editable.',
    apiEndpoint: '/api/ocr-pdf', multiFile: false,
    accept: '.pdf,.jpg,.jpeg,.png', outputName: 'ocr_output.pdf',
    keywords: ['ocr', 'text', 'scan', 'recognize', 'extract text', 'searchable'],
    options: [
      { name: 'language', label: 'Language', type: 'select',
        choices: [
          { val: 'eng', label: 'English' },
          { val: 'hin', label: 'Hindi' },
          { val: 'fra', label: 'French' },
          { val: 'deu', label: 'German' },
          { val: 'spa', label: 'Spanish' },
        ]
      },
      { name: 'output_format', label: 'Output Format', type: 'select',
        choices: [
          { val: 'pdf', label: 'Searchable PDF' },
          { val: 'txt', label: 'Text File (.txt)' },
        ]
      }
    ]
  },

  // ── Convert TO PDF ─────────────────────────────────────
  {
    id: 'jpg-to-pdf', name: 'JPG to PDF', category: 'convert-to',
    icon: 'fas fa-image', color: '#10B981', badge: 'hot',
    desc: 'Convert JPG/PNG/WebP images to PDF',
    longDesc: 'Convert one or more images to a PDF document with custom page size.',
    apiEndpoint: '/api/img-to-pdf', multiFile: true,
    accept: '.jpg,.jpeg,.png,.webp,.bmp,.gif,.tiff', outputName: 'converted.pdf',
    keywords: ['jpg', 'jpeg', 'png', 'image', 'photo', 'picture', 'img to pdf'],
    options: [
      { name: 'page_size', label: 'Page Size', type: 'select',
        choices: [
          { val: 'A4', label: 'A4 (210×297mm)' },
          { val: 'Letter', label: 'Letter (8.5×11in)' },
          { val: 'A3', label: 'A3 (297×420mm)' },
          { val: 'Legal', label: 'Legal (8.5×14in)' },
          { val: 'fit', label: 'Fit to image' },
        ]
      },
      { name: 'orientation', label: 'Orientation', type: 'select',
        choices: [
          { val: 'auto', label: 'Auto detect' },
          { val: 'portrait', label: 'Portrait' },
          { val: 'landscape', label: 'Landscape' },
        ]
      }
    ]
  },
  {
    id: 'word-to-pdf', name: 'Word to PDF', category: 'convert-to',
    icon: 'fas fa-file-word', color: '#3B82F6', badge: 'hot',
    desc: 'Convert Word documents (.docx) to PDF',
    longDesc: 'Convert Microsoft Word .docx files to professional PDF documents.',
    apiEndpoint: '/api/word-to-pdf', multiFile: false,
    accept: '.docx,.doc', outputName: 'converted.pdf',
    keywords: ['word', 'docx', 'doc', 'microsoft word', 'office'],
    options: []
  },
  {
    id: 'excel-to-pdf', name: 'Excel to PDF', category: 'convert-to',
    icon: 'fas fa-file-excel', color: '#10B981',
    desc: 'Convert Excel spreadsheets to PDF',
    longDesc: 'Convert Excel .xlsx files to PDF with proper table formatting.',
    apiEndpoint: '/api/excel-to-pdf', multiFile: false,
    accept: '.xlsx,.xls,.csv', outputName: 'converted.pdf',
    keywords: ['excel', 'xlsx', 'spreadsheet', 'xls', 'table'],
    options: []
  },
  {
    id: 'powerpoint-to-pdf', name: 'PowerPoint to PDF', category: 'convert-to',
    icon: 'fas fa-file-powerpoint', color: '#F97316',
    desc: 'Convert PowerPoint presentations to PDF',
    longDesc: 'Convert .pptx presentations to PDF with each slide as a page.',
    apiEndpoint: '/api/pptx-to-pdf', multiFile: false,
    accept: '.pptx,.ppt', outputName: 'converted.pdf',
    keywords: ['powerpoint', 'pptx', 'presentation', 'slides', 'ppt'],
    options: []
  },
  {
    id: 'html-to-pdf', name: 'HTML to PDF', category: 'convert-to',
    icon: 'fas fa-code', color: '#6366F1',
    desc: 'Convert HTML files or web URLs to PDF',
    longDesc: 'Convert HTML content, files, or URLs to PDF documents.',
    apiEndpoint: '/api/html-to-pdf', multiFile: false,
    accept: '.html,.htm', outputName: 'converted.pdf',
    keywords: ['html', 'web', 'webpage', 'url', 'website to pdf'],
    options: [
      { name: 'html_url', label: 'Or enter a URL (optional)', type: 'text', placeholder: 'https://example.com' }
    ],
    customUI: 'html-to-pdf'
  },

  // ── Convert FROM PDF ───────────────────────────────────
  {
    id: 'pdf-to-jpg', name: 'PDF to JPG', category: 'convert-from',
    icon: 'fas fa-file-image', color: '#F59E0B', badge: 'hot',
    desc: 'Convert PDF pages to JPG/PNG images',
    longDesc: 'Extract each page of your PDF as a high-quality image.',
    apiEndpoint: '/api/pdf-to-img', multiFile: false,
    accept: '.pdf', outputName: 'pdf_images.zip',
    keywords: ['pdf to jpg', 'pdf to image', 'pdf to png', 'extract image'],
    options: [
      { name: 'format', label: 'Image Format', type: 'select',
        choices: [{ val: 'jpg', label: 'JPG' }, { val: 'png', label: 'PNG' }]
      },
      { name: 'dpi', label: 'Resolution (DPI)', type: 'select',
        choices: [
          { val: '72', label: '72 DPI (Screen)' },
          { val: '150', label: '150 DPI (Standard)' },
          { val: '200', label: '200 DPI (High)' },
          { val: '300', label: '300 DPI (Print)' },
        ]
      },
      { name: 'pages', label: 'Pages (e.g. all or 1,3,5)', type: 'text', default: 'all' }
    ]
  },
  {
    id: 'pdf-to-word', name: 'PDF to Word', category: 'convert-from',
    icon: 'fas fa-file-word', color: '#3B82F6', badge: 'hot',
    desc: 'Convert PDF to editable Word document',
    longDesc: 'Extract text and layout from PDF to a .docx Word file.',
    apiEndpoint: '/api/pdf-to-word', multiFile: false,
    accept: '.pdf', outputName: 'converted.docx',
    keywords: ['pdf to word', 'pdf to docx', 'editable', 'extract text'],
    options: []
  },
  {
    id: 'pdf-to-excel', name: 'PDF to Excel', category: 'convert-from',
    icon: 'fas fa-file-excel', color: '#10B981',
    desc: 'Extract tables from PDF to Excel',
    longDesc: 'Detect and extract table data from PDF to an Excel spreadsheet.',
    apiEndpoint: '/api/pdf-to-excel', multiFile: false,
    accept: '.pdf', outputName: 'converted.xlsx',
    keywords: ['pdf to excel', 'pdf to xlsx', 'table extraction', 'spreadsheet'],
    options: []
  },
  {
    id: 'pdf-to-powerpoint', name: 'PDF to PowerPoint', category: 'convert-from',
    icon: 'fas fa-file-powerpoint', color: '#F97316',
    desc: 'Convert PDF to PowerPoint slides',
    longDesc: 'Convert each PDF page to a PowerPoint slide.',
    apiEndpoint: '/api/pdf-to-pptx', multiFile: false,
    accept: '.pdf', outputName: 'converted.pptx',
    keywords: ['pdf to powerpoint', 'pdf to pptx', 'slides'],
    options: [
      { name: 'dpi', label: 'Quality (DPI)', type: 'select',
        choices: [
          { val: '100', label: 'Standard' }, { val: '150', label: 'High' }, { val: '200', label: 'Ultra' }
        ]
      }
    ]
  },
  {
    id: 'pdf-to-pdfa', name: 'PDF to PDF/A', category: 'convert-from',
    icon: 'fas fa-archive', color: '#7C3AED',
    desc: 'Convert PDF to archival PDF/A format',
    longDesc: 'Convert your PDF to the ISO-standard PDF/A format for long-term archiving.',
    apiEndpoint: '/api/pdf-to-pdfa', multiFile: false,
    accept: '.pdf', outputName: 'pdf_a.pdf',
    keywords: ['pdf/a', 'archive', 'iso', 'pdfa', 'archival'],
    options: [
      { name: 'level', label: 'PDF/A Level', type: 'select',
        choices: [
          { val: '1b', label: 'PDF/A-1b (Basic)' },
          { val: '2b', label: 'PDF/A-2b (Enhanced)' },
          { val: '3b', label: 'PDF/A-3b (Full)' },
        ]
      }
    ]
  },

  // ── Edit PDF ───────────────────────────────────────────
  {
    id: 'rotate-pdf', name: 'Rotate PDF', category: 'edit',
    icon: 'fas fa-redo', color: '#6366F1',
    desc: 'Rotate PDF pages by 90°, 180°, or 270°',
    longDesc: 'Rotate all or selected pages of your PDF document.',
    apiEndpoint: '/api/rotate-pdf', multiFile: false,
    accept: '.pdf', outputName: 'rotated.pdf',
    keywords: ['rotate', 'turn', 'flip', 'angle', 'orientation'],
    options: [
      { name: 'angle', label: 'Rotation Angle', type: 'select',
        choices: [
          { val: '90',  label: '90° Clockwise' },
          { val: '180', label: '180° (Upside down)' },
          { val: '270', label: '270° Counter-clockwise' },
          { val: '-90', label: '90° Counter-clockwise' },
        ]
      },
      { name: 'pages', label: 'Pages (all or 1,3,5)', type: 'text', default: 'all' }
    ]
  },
  {
    id: 'add-page-numbers', name: 'Add Page Numbers', category: 'edit',
    icon: 'fas fa-list-ol', color: '#10B981',
    desc: 'Add page numbers to your PDF',
    longDesc: 'Stamp professional page numbers on every page of your PDF.',
    apiEndpoint: '/api/add-page-numbers', multiFile: false,
    accept: '.pdf', outputName: 'numbered.pdf',
    keywords: ['page numbers', 'pagination', 'number', 'stamp'],
    options: [
      { name: 'position', label: 'Position', type: 'select',
        choices: [
          { val: 'bottom-center', label: 'Bottom Center' },
          { val: 'bottom-left',   label: 'Bottom Left' },
          { val: 'bottom-right',  label: 'Bottom Right' },
          { val: 'top-center',    label: 'Top Center' },
          { val: 'top-right',     label: 'Top Right' },
        ]
      },
      { name: 'start_num', label: 'Start from number', type: 'number', default: 1 },
      { name: 'prefix', label: 'Prefix (e.g. "Page ")', type: 'text', placeholder: 'Page ' },
    ]
  },
  {
    id: 'add-watermark', name: 'Add Watermark', category: 'edit',
    icon: 'fas fa-water', color: '#8B5CF6',
    desc: 'Add text watermark to PDF pages',
    longDesc: 'Overlay a customizable text watermark on every page.',
    apiEndpoint: '/api/add-watermark', multiFile: false,
    accept: '.pdf', outputName: 'watermarked.pdf',
    keywords: ['watermark', 'stamp', 'overlay', 'confidential', 'draft'],
    options: [
      { name: 'text', label: 'Watermark Text', type: 'text', default: 'CONFIDENTIAL', required: true },
      { name: 'opacity', label: 'Opacity (0.1 - 1.0)', type: 'number', default: 0.3, step: 0.1, min: 0.1, max: 1.0 },
      { name: 'color', label: 'Color', type: 'color', default: '#FF0000' },
      { name: 'font_size', label: 'Font Size', type: 'number', default: 48, min: 12, max: 120 },
      { name: 'rotation', label: 'Rotation (degrees)', type: 'number', default: 45, min: 0, max: 360 },
      { name: 'position', label: 'Position', type: 'select',
        choices: [
          { val: 'center', label: 'Center' },
          { val: 'top-left', label: 'Top Left' },
          { val: 'top-right', label: 'Top Right' },
          { val: 'bottom-left', label: 'Bottom Left' },
          { val: 'bottom-right', label: 'Bottom Right' },
        ]
      },
    ]
  },
  {
    id: 'crop-pdf', name: 'Crop PDF', category: 'edit',
    icon: 'fas fa-crop-alt', color: '#F59E0B',
    desc: 'Crop PDF pages to a specific area',
    longDesc: 'Trim margins or crop pages to a specific region.',
    apiEndpoint: '/api/crop-pdf', multiFile: false,
    accept: '.pdf', outputName: 'cropped.pdf',
    keywords: ['crop', 'trim', 'cut', 'margin', 'resize'],
    options: [
      { name: 'left',   label: 'Left margin (%)', type: 'number', default: 5,  min: 0, max: 50 },
      { name: 'bottom', label: 'Bottom margin (%)', type: 'number', default: 5, min: 0, max: 50 },
      { name: 'right',  label: 'Right margin (%)', type: 'number', default: 95, min: 50, max: 100 },
      { name: 'top',    label: 'Top margin (%)', type: 'number', default: 95,  min: 50, max: 100 },
    ]
  },

  // ── PDF Security ───────────────────────────────────────
  {
    id: 'unlock-pdf', name: 'Unlock PDF', category: 'security',
    icon: 'fas fa-lock-open', color: '#10B981', badge: 'hot',
    desc: 'Remove password protection from PDF',
    longDesc: 'Unlock password-protected PDFs. Enter the password to remove encryption.',
    apiEndpoint: '/api/unlock-pdf', multiFile: false,
    accept: '.pdf', outputName: 'unlocked.pdf',
    keywords: ['unlock', 'remove password', 'decrypt', 'unprotect', 'password'],
    options: [
      { name: 'password', label: 'PDF Password', type: 'password', placeholder: 'Enter PDF password (leave blank if none)' }
    ]
  },
  {
    id: 'protect-pdf', name: 'Protect PDF', category: 'security',
    icon: 'fas fa-shield-alt', color: '#EF4444',
    desc: 'Add password protection to PDF',
    longDesc: 'Encrypt your PDF with 256-bit AES password protection.',
    apiEndpoint: '/api/protect-pdf', multiFile: false,
    accept: '.pdf', outputName: 'protected.pdf',
    keywords: ['protect', 'encrypt', 'password', 'secure', 'lock'],
    options: [
      { name: 'user_password', label: 'User Password (to open)', type: 'password', required: true },
      { name: 'owner_password', label: 'Owner Password (optional)', type: 'password' },
      { name: 'permissions', label: 'Permissions', type: 'select',
        choices: [
          { val: 'all', label: 'Full access' },
          { val: 'print_only', label: 'Print only' },
          { val: 'read_only', label: 'Read only (no print)' },
        ]
      }
    ]
  },
  {
    id: 'sign-pdf', name: 'Sign PDF', category: 'security',
    icon: 'fas fa-pen-nib', color: '#7C3AED',
    desc: 'Add a digital signature to PDF',
    longDesc: 'Add your text signature to any page of your PDF document.',
    apiEndpoint: '/api/sign-pdf', multiFile: false,
    accept: '.pdf', outputName: 'signed.pdf',
    keywords: ['sign', 'signature', 'digital signature', 'esign'],
    options: [
      { name: 'signature_text', label: 'Signature Text', type: 'text', default: 'Signed', required: true },
      { name: 'page', label: 'Page number', type: 'number', default: 1, min: 1 },
      { name: 'x', label: 'X position (%)', type: 'number', default: 10, min: 0, max: 90 },
      { name: 'y', label: 'Y position (%)', type: 'number', default: 10, min: 0, max: 90 },
    ]
  },
  {
    id: 'redact-pdf', name: 'Redact PDF', category: 'security',
    icon: 'fas fa-eraser', color: '#1F2937',
    desc: 'Black out sensitive text in PDF',
    longDesc: 'Permanently redact (black out) sensitive information from your PDF.',
    apiEndpoint: '/api/redact-pdf', multiFile: false,
    accept: '.pdf', outputName: 'redacted.pdf',
    keywords: ['redact', 'censor', 'black out', 'hide', 'sensitive'],
    options: [
      { name: 'search_terms', label: 'Text to Redact (one per line)', type: 'textarea', required: true,
        placeholder: 'Enter text to redact...\nOne phrase per line' }
    ]
  },
  {
    id: 'compare-pdf', name: 'Compare PDF', category: 'security',
    icon: 'fas fa-code-compare', color: '#3B82F6',
    desc: 'Compare two PDFs and show differences',
    longDesc: 'Side-by-side comparison of two PDF documents with change highlighting.',
    apiEndpoint: '/api/compare-pdf', multiFile: true, maxFiles: 2,
    accept: '.pdf', outputName: null,
    keywords: ['compare', 'diff', 'difference', 'changes', 'contrast'],
    options: [],
    customUI: 'compare'
  },

  // ── AI Intelligence ────────────────────────────────────
  {
    id: 'summarize-pdf', name: 'AI Summarizer', category: 'ai',
    icon: 'fas fa-brain', color: '#7C3AED', badge: 'new',
    desc: 'AI-powered PDF text summarization',
    longDesc: 'Automatically summarize any PDF using intelligent text extraction and analysis.',
    apiEndpoint: '/api/summarize-pdf', multiFile: false,
    accept: '.pdf', outputName: null,
    keywords: ['summarize', 'summary', 'ai', 'abstract', 'tldr', 'brief'],
    options: [
      { name: 'length', label: 'Summary Length', type: 'select',
        choices: [
          { val: 'short', label: 'Short (3 sentences)' },
          { val: 'medium', label: 'Medium (5 sentences)' },
          { val: 'long', label: 'Long (10 sentences)' },
        ]
      }
    ],
    customUI: 'summarize'
  },
  {
    id: 'translate-pdf', name: 'Translate PDF', category: 'ai',
    icon: 'fas fa-language', color: '#EC4899', badge: 'new',
    desc: 'Translate PDF content to 50+ languages',
    longDesc: 'Automatically translate your PDF to any language using Google Translate.',
    apiEndpoint: '/api/translate-pdf', multiFile: false,
    accept: '.pdf', outputName: 'translated.pdf',
    keywords: ['translate', 'language', 'hindi', 'french', 'spanish', 'translation'],
    options: [
      { name: 'source_lang', label: 'Source Language', type: 'select',
        choices: [
          { val: 'auto', label: 'Auto Detect' },
          { val: 'en', label: 'English' },
          { val: 'hi', label: 'Hindi' },
          { val: 'fr', label: 'French' },
          { val: 'de', label: 'German' },
          { val: 'es', label: 'Spanish' },
          { val: 'zh-cn', label: 'Chinese (Simplified)' },
          { val: 'ar', label: 'Arabic' },
          { val: 'ru', label: 'Russian' },
          { val: 'ja', label: 'Japanese' },
          { val: 'ko', label: 'Korean' },
          { val: 'pt', label: 'Portuguese' },
          { val: 'it', label: 'Italian' },
        ]
      },
      { name: 'target_lang', label: 'Translate To', type: 'select',
        choices: [
          { val: 'hi', label: 'Hindi' },
          { val: 'en', label: 'English' },
          { val: 'fr', label: 'French' },
          { val: 'de', label: 'German' },
          { val: 'es', label: 'Spanish' },
          { val: 'zh-cn', label: 'Chinese (Simplified)' },
          { val: 'ar', label: 'Arabic' },
          { val: 'ru', label: 'Russian' },
          { val: 'ja', label: 'Japanese' },
          { val: 'ko', label: 'Korean' },
          { val: 'pt', label: 'Portuguese' },
          { val: 'it', label: 'Italian' },
          { val: 'nl', label: 'Dutch' },
          { val: 'pl', label: 'Polish' },
          { val: 'tr', label: 'Turkish' },
          { val: 'bn', label: 'Bengali' },
          { val: 'ur', label: 'Urdu' },
          { val: 'ta', label: 'Tamil' },
          { val: 'te', label: 'Telugu' },
          { val: 'gu', label: 'Gujarati' },
          { val: 'mr', label: 'Marathi' },
        ]
      }
    ]
  },
];

// Category → section mapping
const CATEGORY_SECTIONS = {
  'organize':     'organizeGrid',
  'convert-to':   'convertToGrid',
  'convert-from': 'convertFromGrid',
  'edit':         'editGrid',
  'security':     'securityGrid',
  'ai':           'aiGrid',
};

// Icon color backgrounds
const COLOR_ALPHA = '20';

// ══════════════════════════════════════════════════════════
// PARTICLE CANVAS
// ══════════════════════════════════════════════════════════
class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.init();
    this.animate();
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  init() {
    const count = Math.min(80, Math.floor(window.innerWidth / 18));
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        r: Math.random() * 2 + 0.5,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        alpha: Math.random() * 0.4 + 0.1,
      });
    }
  }

  animate() {
    const ctx = this.ctx;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > this.canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = isDark
        ? `rgba(99,102,241,${p.alpha})`
        : `rgba(99,102,241,${p.alpha * 0.5})`;
      ctx.fill();
    });

    // Connect nearby particles
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const a = this.particles[i], b = this.particles[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = isDark
            ? `rgba(99,102,241,${0.08 * (1 - dist / 120)})`
            : `rgba(99,102,241,${0.04 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(() => this.animate());
  }
}

// ══════════════════════════════════════════════════════════
// CURSOR GLOW
// ══════════════════════════════════════════════════════════
const cursorGlow = document.getElementById('cursorGlow');
let mouseX = 0, mouseY = 0;
document.addEventListener('mousemove', e => {
  mouseX = e.clientX; mouseY = e.clientY;
  cursorGlow.style.left = mouseX + 'px';
  cursorGlow.style.top  = mouseY + 'px';
});

// ══════════════════════════════════════════════════════════
// THEME
// ══════════════════════════════════════════════════════════
const themeToggle = document.getElementById('themeToggle');
let currentTheme = localStorage.getItem('ishutools-theme') || 'dark';
document.documentElement.setAttribute('data-theme', currentTheme);

themeToggle.addEventListener('click', () => {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem('ishutools-theme', currentTheme);
});

// ══════════════════════════════════════════════════════════
// MOBILE MENU
// ══════════════════════════════════════════════════════════
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

hamburger.addEventListener('click', () => {
  const isOpen = mobileMenu.classList.toggle('open');
  hamburger.classList.toggle('open', isOpen);
  hamburger.setAttribute('aria-expanded', isOpen);
  document.body.style.overflow = isOpen ? 'hidden' : '';
});

function closeMobileMenu() {
  mobileMenu.classList.remove('open');
  hamburger.classList.remove('open');
  hamburger.setAttribute('aria-expanded', false);
  document.body.style.overflow = '';
}

// Close on outside click
document.addEventListener('click', e => {
  if (!mobileMenu.contains(e.target) && !hamburger.contains(e.target)) {
    closeMobileMenu();
  }
});

// ══════════════════════════════════════════════════════════
// HEADER SCROLL
// ══════════════════════════════════════════════════════════
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 30);
});

// ══════════════════════════════════════════════════════════
// RENDER TOOL CARDS
// ══════════════════════════════════════════════════════════
function createToolCard(tool) {
  const div = document.createElement('a');
  div.className = 'tool-card fade-in';
  div.href = `/tools/${tool.id}`;
  div.dataset.toolId = tool.id;
  div.dataset.category = tool.category;
  div.dataset.keywords = (tool.keywords || []).join(' ').toLowerCase() + ' ' + tool.name.toLowerCase();
  div.setAttribute('role', 'article');

  // Convert hex color to rgba for background
  const bgColor = tool.color + '1A';

  const badgeHTML = tool.badge === 'hot'
    ? `<div class="tool-hot">HOT</div>`
    : tool.badge === 'new'
    ? `<div class="tool-new">NEW</div>`
    : '';

  div.innerHTML = `
    ${badgeHTML}
    <div class="tool-icon-wrap" style="background:${bgColor}; color:${tool.color}">
      <i class="${tool.icon}"></i>
    </div>
    <div class="tool-info">
      <div class="tool-name">${tool.name}</div>
      <div class="tool-desc">${tool.desc}</div>
    </div>
    <div class="tool-action">
      Use tool <i class="fas fa-arrow-right" style="font-size:0.7rem"></i>
    </div>
  `;

  // Prevent default navigation, open modal instead
  div.addEventListener('click', e => {
    e.preventDefault();
    openToolModal(tool);
  });

  return div;
}

function renderAllTools() {
  Object.entries(CATEGORY_SECTIONS).forEach(([cat, gridId]) => {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const catTools = TOOLS.filter(t => t.category === cat);
    catTools.forEach(tool => {
      grid.appendChild(createToolCard(tool));
    });
  });
}

// ══════════════════════════════════════════════════════════
// FILTER BAR
// ══════════════════════════════════════════════════════════
const filterBtns = document.querySelectorAll('.filter-btn');
const toolsSections = document.querySelectorAll('.tools-section');

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const filter = btn.dataset.filter;

    toolsSections.forEach(section => {
      if (filter === 'all' || section.dataset.category === filter) {
        section.style.display = '';
        section.style.animation = 'fadeIn 0.3s ease';
      } else {
        section.style.display = 'none';
      }
    });
  });
});

// ══════════════════════════════════════════════════════════
// SEARCH
// ══════════════════════════════════════════════════════════
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const searchSugg  = document.getElementById('searchSuggestions');
const noResults   = document.getElementById('noResults');

function getMatchScore(tool, query) {
  const q = query.toLowerCase();
  const name = tool.name.toLowerCase();
  const desc = tool.desc.toLowerCase();
  const kws = (tool.keywords || []).join(' ').toLowerCase();

  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  if (kws.includes(q)) return 40;
  if (desc.includes(q)) return 20;
  return 0;
}

function filterTools(query) {
  const allCards = document.querySelectorAll('.tool-card');
  const q = query.toLowerCase().trim();
  let visible = 0;

  if (!q) {
    allCards.forEach(card => card.style.display = '');
    toolsSections.forEach(s => s.style.display = '');
    noResults.style.display = 'none';
    return;
  }

  // Reset filter buttons
  filterBtns.forEach(b => b.classList.remove('active'));
  document.querySelector('[data-filter="all"]').classList.add('active');
  toolsSections.forEach(s => s.style.display = '');

  allCards.forEach(card => {
    const toolId = card.dataset.toolId;
    const tool = TOOLS.find(t => t.id === toolId);
    if (!tool) return;
    const score = getMatchScore(tool, q);
    if (score > 0) {
      card.style.display = '';
      visible++;
    } else {
      card.style.display = 'none';
    }
  });

  noResults.style.display = visible === 0 ? 'block' : 'none';
}

function showSuggestions(query) {
  if (!query.trim()) {
    searchSugg.classList.remove('active');
    return;
  }

  const matches = TOOLS
    .map(t => ({ tool: t, score: getMatchScore(t, query) }))
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  if (matches.length === 0) {
    searchSugg.classList.remove('active');
    return;
  }

  searchSugg.innerHTML = matches.map(({ tool }) => `
    <div class="suggestion-item" data-tool-id="${tool.id}">
      <div class="suggestion-icon" style="background:${tool.color}1A; color:${tool.color}">
        <i class="${tool.icon}"></i>
      </div>
      <div class="suggestion-text">
        <div class="suggestion-name">${tool.name}</div>
        <div class="suggestion-cat">${categoryLabel(tool.category)}</div>
      </div>
      <i class="fas fa-arrow-right suggestion-arrow"></i>
    </div>
  `).join('');

  searchSugg.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      const tool = TOOLS.find(t => t.id === item.dataset.toolId);
      if (tool) {
        searchSugg.classList.remove('active');
        searchInput.value = tool.name;
        searchClear.classList.add('visible');
        filterTools(tool.name);
        openToolModal(tool);
      }
    });
  });

  searchSugg.classList.add('active');
}

function categoryLabel(cat) {
  const map = {
    'organize': 'Organize PDF',
    'convert-to': 'Convert to PDF',
    'convert-from': 'Convert from PDF',
    'edit': 'Edit PDF',
    'security': 'PDF Security',
    'ai': 'AI Intelligence',
  };
  return map[cat] || cat;
}

searchInput.addEventListener('input', e => {
  const q = e.target.value;
  searchClear.classList.toggle('visible', q.length > 0);
  showSuggestions(q);
  filterTools(q);

  if (q.length > 0) {
    document.getElementById('toolsMain').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.remove('visible');
  searchSugg.classList.remove('active');
  filterTools('');
});

// Close suggestions on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.search-container')) {
    searchSugg.classList.remove('active');
  }
});

// URL search parameter support
const urlParams = new URLSearchParams(window.location.search);
const urlQuery = urlParams.get('q');
if (urlQuery) {
  searchInput.value = urlQuery;
  searchClear.classList.add('visible');
  filterTools(urlQuery);
}

// ══════════════════════════════════════════════════════════
// COUNTER ANIMATION
// ══════════════════════════════════════════════════════════
function animateCounter(el) {
  const target = parseInt(el.dataset.count);
  const duration = 1500;
  const start = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(ease * target);
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target;
  }
  requestAnimationFrame(step);
}

const counterObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCounter(entry.target);
      counterObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('[data-count]').forEach(el => counterObserver.observe(el));

// ══════════════════════════════════════════════════════════
// FADE IN ON SCROLL
// ══════════════════════════════════════════════════════════
const fadeObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.05, rootMargin: '0px 0px -40px 0px' });

function observeFadeIns() {
  document.querySelectorAll('.fade-in:not(.visible)').forEach(el => fadeObserver.observe(el));
}

// ══════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ══════════════════════════════════════════════════════════
const toastContainer = document.getElementById('toastContainer');

function showToast(message, type = 'info', duration = 4000) {
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fas ${icons[type]} toast-icon"></i>
    <span>${message}</span>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ══════════════════════════════════════════════════════════
// FILE SIZE FORMATTER
// ══════════════════════════════════════════════════════════
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ══════════════════════════════════════════════════════════
// TOOL MODAL
// ══════════════════════════════════════════════════════════
const modalOverlay = document.getElementById('modalOverlay');
const modalClose   = document.getElementById('modalClose');
const modalContent = document.getElementById('modalContent');

function openToolModal(tool) {
  document.body.style.overflow = 'hidden';
  modalContent.innerHTML = buildModalHTML(tool);
  modalOverlay.classList.add('active');

  // Init drop zone
  initDropZone(tool);

  // Init form fields
  initFormFields(tool);

  // Init process button
  initProcessBtn(tool);

  // Escape key
  const escFn = e => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', escFn, { once: true });
}

function closeModal() {
  modalOverlay.classList.remove('active');
  document.body.style.overflow = '';
  setTimeout(() => { modalContent.innerHTML = ''; }, 300);
}

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) closeModal();
});

// ── Build Modal HTML ───────────────────────────────────────
function buildModalHTML(tool) {
  const bgColor = tool.color + '1A';

  let optionsHTML = '';
  (tool.options || []).forEach(opt => {
    optionsHTML += buildOptionHTML(opt);
  });

  // Multi-file vs single file label
  const fileLabel = tool.multiFile
    ? `Drop files here or click to browse`
    : `Drop your file here or click to browse`;

  const maxFilesAttr = tool.multiFile ? '' : 'single';

  let dropZoneHTML = '';
  if (tool.customUI === 'compare') {
    dropZoneHTML = `
      <div class="form-group">
        <label class="form-label">First PDF</label>
        <div class="drop-zone" id="dropZone1">
          <i class="fas fa-file-pdf drop-zone-icon"></i>
          <div class="drop-zone-title">Upload first PDF</div>
          <div class="drop-zone-sub">PDF files up to 100 MB</div>
          <input type="file" accept=".pdf" id="fileInput1" />
        </div>
        <div id="filePreview1"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Second PDF</label>
        <div class="drop-zone" id="dropZone2">
          <i class="fas fa-file-pdf drop-zone-icon"></i>
          <div class="drop-zone-title">Upload second PDF</div>
          <div class="drop-zone-sub">PDF files up to 100 MB</div>
          <input type="file" accept=".pdf" id="fileInput2" />
        </div>
        <div id="filePreview2"></div>
      </div>
    `;
  } else {
    dropZoneHTML = `
      <div class="drop-zone" id="mainDropZone">
        <i class="fas fa-cloud-upload-alt drop-zone-icon"></i>
        <div class="drop-zone-title">${fileLabel}</div>
        <div class="drop-zone-sub">
          ${tool.accept.replace(/\./g, '').toUpperCase().split(',').join(', ')} • Max 100 MB
        </div>
        <input type="file" id="mainFileInput" accept="${tool.accept}"
               ${tool.multiFile ? 'multiple' : ''} />
      </div>
      <div id="mainFilePreview"></div>
    `;
  }

  let resultHTML = tool.customUI === 'summarize' || tool.customUI === 'compare'
    ? `<div class="result-section" id="resultSection">
         <h4><i class="fas fa-check-circle"></i> Analysis Complete</h4>
         <div id="resultText" style="font-size:0.875rem; color:var(--text-secondary); line-height:1.7; white-space:pre-wrap; margin-top:8px;"></div>
       </div>`
    : `<div class="result-section" id="resultSection">
         <h4><i class="fas fa-check-circle"></i> Processing Complete!</h4>
         <p id="resultInfo" style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px;"></p>
         <a href="#" id="downloadLink" class="btn-download" download>
           <i class="fas fa-download"></i> Download Result
         </a>
       </div>`;

  return `
    <div class="modal-tool-header">
      <div class="modal-tool-icon" style="background:${bgColor}; color:${tool.color}; width:56px; height:56px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.6rem">
        <i class="${tool.icon}"></i>
      </div>
      <div>
        <div class="modal-tool-name">${tool.name}</div>
        <div class="modal-tool-desc">${tool.longDesc || tool.desc}</div>
      </div>
    </div>

    ${dropZoneHTML}
    ${optionsHTML}

    <button class="btn-process" id="processBtn">
      <span><i class="fas fa-cog"></i> Process with IshuTools</span>
    </button>

    <div class="progress-wrap" id="progressWrap">
      <div class="progress-bar">
        <div class="progress-fill" id="progressFill" style="width:0%"></div>
      </div>
      <div class="progress-label" id="progressLabel">Processing your file...</div>
    </div>

    ${resultHTML}
  `;
}

function buildOptionHTML(opt) {
  if (opt.type === 'select') {
    return `
      <div class="form-group">
        <label class="form-label">${opt.label}</label>
        <select class="form-select" name="${opt.name}" id="opt_${opt.name}">
          ${opt.choices.map(c => `<option value="${c.val}">${c.label}</option>`).join('')}
        </select>
      </div>
    `;
  }
  if (opt.type === 'textarea') {
    return `
      <div class="form-group">
        <label class="form-label">${opt.label}${opt.required ? ' *' : ''}</label>
        <textarea class="form-textarea" name="${opt.name}" id="opt_${opt.name}"
                  placeholder="${opt.placeholder || ''}">${opt.default || ''}</textarea>
      </div>
    `;
  }
  if (opt.type === 'color') {
    return `
      <div class="form-group" style="display:flex; align-items:center; gap:12px">
        <label class="form-label" style="margin:0; white-space:nowrap">${opt.label}</label>
        <input type="color" name="${opt.name}" id="opt_${opt.name}"
               value="${opt.default || '#FF0000'}"
               style="width:44px; height:36px; border:none; border-radius:8px; cursor:pointer; background:none" />
      </div>
    `;
  }
  if (opt.type === 'checkbox') {
    return `
      <div class="form-group" style="display:flex; align-items:center; gap:10px">
        <input type="checkbox" name="${opt.name}" id="opt_${opt.name}"
               ${opt.default ? 'checked' : ''}
               style="width:16px; height:16px; accent-color:var(--accent)" />
        <label for="opt_${opt.name}" class="form-label" style="margin:0; cursor:pointer">${opt.label}</label>
      </div>
    `;
  }
  if (opt.type === 'password') {
    return `
      <div class="form-group">
        <label class="form-label">${opt.label}${opt.required ? ' *' : ''}</label>
        <input type="password" class="form-input" name="${opt.name}" id="opt_${opt.name}"
               placeholder="${opt.placeholder || ''}" />
      </div>
    `;
  }
  // Default: text / number
  return `
    <div class="form-group">
      <label class="form-label">${opt.label}${opt.required ? ' *' : ''}</label>
      <input type="${opt.type || 'text'}" class="form-input" name="${opt.name}" id="opt_${opt.name}"
             value="${opt.default !== undefined ? opt.default : ''}"
             placeholder="${opt.placeholder || ''}"
             ${opt.min !== undefined ? `min="${opt.min}"` : ''}
             ${opt.max !== undefined ? `max="${opt.max}"` : ''}
             ${opt.step !== undefined ? `step="${opt.step}"` : ''}
             />
    </div>
  `;
}

// ── Drop Zone Init ─────────────────────────────────────────
let uploadedFiles = {};

function initDropZone(tool) {
  uploadedFiles = {};

  if (tool.customUI === 'compare') {
    ['1', '2'].forEach(n => {
      const dz = document.getElementById(`dropZone${n}`);
      const input = document.getElementById(`fileInput${n}`);
      const preview = document.getElementById(`filePreview${n}`);
      if (!dz || !input) return;

      input.addEventListener('change', () => {
        if (input.files[0]) {
          uploadedFiles[`file${n}`] = input.files[0];
          showFilePreview(preview, [input.files[0]]);
          dz.classList.add('has-file');
        }
      });
      setupDragDrop(dz, input, preview, n);
    });
    return;
  }

  const dz    = document.getElementById('mainDropZone');
  const input = document.getElementById('mainFileInput');
  const prev  = document.getElementById('mainFilePreview');
  if (!dz || !input) return;

  input.addEventListener('change', () => {
    if (input.files.length > 0) {
      uploadedFiles['files'] = Array.from(input.files);
      showFilePreview(prev, Array.from(input.files));
      dz.classList.add('has-file');
    }
  });
  setupDragDrop(dz, input, prev, 'main');
}

function setupDragDrop(dz, input, preview, key) {
  dz.addEventListener('dragover', e => {
    e.preventDefault();
    dz.classList.add('dragging');
  });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragging'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('dragging');
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      uploadedFiles[key === 'main' ? 'files' : `file${key}`] = key === 'main' ? files : files[0];
      showFilePreview(preview, files);
      dz.classList.add('has-file');
    }
  });
}

function showFilePreview(container, files) {
  container.innerHTML = files.map(f => `
    <div class="file-preview">
      <i class="fas fa-file-pdf file-preview-icon"></i>
      <span class="file-preview-name">${f.name}</span>
      <span class="file-preview-size">${formatFileSize(f.size)}</span>
    </div>
  `).join('');
}

function initFormFields(tool) {
  // Any tool-specific JS setup after render
}

// ── Process Button ─────────────────────────────────────────
function initProcessBtn(tool) {
  const btn = document.getElementById('processBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    processTool(tool);
  });
}

async function processTool(tool) {
  const btn          = document.getElementById('processBtn');
  const progressWrap = document.getElementById('progressWrap');
  const progressFill = document.getElementById('progressFill');
  const progressLbl  = document.getElementById('progressLabel');
  const resultSec    = document.getElementById('resultSection');

  // Validate files
  const files = getUploadedFiles(tool);
  if (!files) {
    showToast('Please upload a file first.', 'error');
    return;
  }

  // Build FormData
  const fd = new FormData();

  if (tool.customUI === 'compare') {
    if (!uploadedFiles['file1'] || !uploadedFiles['file2']) {
      showToast('Please upload both PDF files.', 'error');
      return;
    }
    fd.append('file1', uploadedFiles['file1']);
    fd.append('file2', uploadedFiles['file2']);
  } else {
    const fileList = uploadedFiles['files'];
    if (!fileList || (Array.isArray(fileList) && fileList.length === 0)) {
      showToast('Please upload a file first.', 'error');
      return;
    }
    if (Array.isArray(fileList)) {
      if (tool.multiFile && fileList.length < 2 && tool.id === 'merge-pdf') {
        showToast('Please upload at least 2 files to merge.', 'error');
        return;
      }
      fileList.forEach(f => fd.append('files', f));
      if (!tool.multiFile) fd.append('file', fileList[0]);
    } else {
      fd.append('file', fileList);
      fd.append('files', fileList);
    }
  }

  // Append options
  (tool.options || []).forEach(opt => {
    const el = document.getElementById(`opt_${opt.name}`);
    if (!el) return;
    if (opt.type === 'checkbox') {
      fd.append(opt.name, el.checked ? 'true' : 'false');
    } else {
      fd.append(opt.name, el.value);
    }
  });

  // UI: loading state
  btn.classList.add('loading');
  btn.innerHTML = `<span><i class="fas fa-spinner fa-spin"></i> Processing...</span>`;
  progressWrap.classList.add('active');
  if (resultSec) resultSec.classList.remove('active');

  // Animate progress bar
  let prog = 0;
  const progInterval = setInterval(() => {
    prog = Math.min(prog + Math.random() * 8, 85);
    if (progressFill) progressFill.style.width = prog + '%';
  }, 200);

  try {
    const response = await fetch(tool.apiEndpoint, { method: 'POST', body: fd });

    clearInterval(progInterval);
    if (progressFill) progressFill.style.width = '100%';

    if (!response.ok) {
      let errMsg = `Server error: ${response.status}`;
      try {
        const errData = await response.json();
        errMsg = errData.error || errMsg;
      } catch (_) {}
      throw new Error(errMsg);
    }

    const contentType = response.headers.get('Content-Type') || '';

    if (contentType.includes('application/json')) {
      // JSON response (summary, compare)
      const data = await response.json();
      handleJSONResult(tool, data, resultSec);
    } else {
      // Binary file response
      const blob = await response.blob();
      handleBlobResult(tool, blob, response, resultSec);
    }

    showToast(`${tool.name} completed successfully!`, 'success');

  } catch (err) {
    clearInterval(progInterval);
    showToast(err.message || 'Processing failed. Please try again.', 'error');
    console.error(tool.name, 'error:', err);
  } finally {
    btn.classList.remove('loading');
    btn.innerHTML = `<span><i class="fas fa-cog"></i> Process with IshuTools</span>`;
    setTimeout(() => {
      progressWrap.classList.remove('active');
      if (progressFill) progressFill.style.width = '0%';
    }, 500);
  }
}

function getUploadedFiles(tool) {
  if (tool.customUI === 'compare') {
    return uploadedFiles['file1'] && uploadedFiles['file2'] ? true : null;
  }
  const f = uploadedFiles['files'];
  if (!f || (Array.isArray(f) && f.length === 0)) return null;
  return f;
}

function handleJSONResult(tool, data, resultSec) {
  if (!resultSec) return;
  resultSec.classList.add('active');

  const textEl = document.getElementById('resultText');
  if (!textEl) return;

  if (tool.customUI === 'summarize' && data.success) {
    textEl.innerHTML = `
      <div style="display:flex; gap:24px; flex-wrap:wrap; margin-bottom:16px">
        <div style="flex:1; min-width:120px; background:var(--bg-secondary); padding:12px; border-radius:10px; text-align:center">
          <div style="font-size:1.4rem; font-weight:700; color:var(--accent)">${data.page_count}</div>
          <div style="font-size:0.75rem; color:var(--text-muted)">Pages</div>
        </div>
        <div style="flex:1; min-width:120px; background:var(--bg-secondary); padding:12px; border-radius:10px; text-align:center">
          <div style="font-size:1.4rem; font-weight:700; color:var(--accent)">${data.word_count?.toLocaleString()}</div>
          <div style="font-size:0.75rem; color:var(--text-muted)">Words</div>
        </div>
        <div style="flex:1; min-width:120px; background:var(--bg-secondary); padding:12px; border-radius:10px; text-align:center">
          <div style="font-size:1.4rem; font-weight:700; color:var(--accent)">${data.reading_time_min} min</div>
          <div style="font-size:0.75rem; color:var(--text-muted)">Read time</div>
        </div>
      </div>
      <div style="margin-bottom:12px">
        <div style="font-size:0.8rem; font-weight:600; color:var(--accent); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.05em">Key Topics</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px">
          ${(data.key_topics || []).map(t => `<span style="padding:3px 10px; background:rgba(99,102,241,0.1); color:var(--accent); border-radius:20px; font-size:0.75rem; font-weight:500">${t}</span>`).join('')}
        </div>
      </div>
      <div style="margin-bottom:8px; font-size:0.8rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em">Summary</div>
      <div style="background:var(--bg-secondary); padding:16px; border-radius:10px; line-height:1.7; color:var(--text-primary)">${data.summary}</div>
    `;
  } else if (tool.customUI === 'compare' && data.success) {
    const d = data.differences;
    textEl.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px">
        <div style="background:var(--bg-secondary); padding:14px; border-radius:10px; text-align:center">
          <div style="font-size:1.3rem; font-weight:700; color:var(--accent)">${d.document1_pages}</div>
          <div style="font-size:0.75rem; color:var(--text-muted)">Doc 1 Pages</div>
        </div>
        <div style="background:var(--bg-secondary); padding:14px; border-radius:10px; text-align:center">
          <div style="font-size:1.3rem; font-weight:700; color:var(--accent)">${d.document2_pages}</div>
          <div style="font-size:0.75rem; color:var(--text-muted)">Doc 2 Pages</div>
        </div>
      </div>
      <div style="background:var(--bg-secondary); padding:14px; border-radius:10px; margin-bottom:12px">
        <div style="font-weight:600; color:var(--text-primary); margin-bottom:8px">Similarity</div>
        <div style="height:8px; background:var(--border); border-radius:4px; overflow:hidden">
          <div style="height:100%; width:${d.text_similarity}%; background:linear-gradient(90deg, var(--accent), var(--success)); border-radius:4px; transition:width 1s ease"></div>
        </div>
        <div style="font-size:0.875rem; color:var(--accent); font-weight:700; margin-top:6px">${d.text_similarity}% similar</div>
      </div>
      <div style="display:flex; gap:12px">
        <div style="flex:1; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.2); padding:12px; border-radius:10px; text-align:center">
          <div style="font-size:1.1rem; font-weight:700; color:#10B981">+${d.lines_added}</div>
          <div style="font-size:0.75rem; color:var(--text-muted)">Lines Added</div>
        </div>
        <div style="flex:1; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); padding:12px; border-radius:10px; text-align:center">
          <div style="font-size:1.1rem; font-weight:700; color:#EF4444">-${d.lines_removed}</div>
          <div style="font-size:0.75rem; color:var(--text-muted)">Lines Removed</div>
        </div>
      </div>
      ${d.are_identical ? `<div style="margin-top:12px; padding:10px; background:rgba(16,185,129,0.1); border-radius:8px; color:#10B981; font-weight:600; text-align:center"><i class="fas fa-check-circle"></i> Documents are identical!</div>` : ''}
    `;
  } else {
    textEl.textContent = JSON.stringify(data, null, 2);
  }
}

function handleBlobResult(tool, blob, response, resultSec) {
  if (!resultSec) return;
  const url = URL.createObjectURL(blob);

  const link = document.getElementById('downloadLink');
  const info = document.getElementById('resultInfo');

  if (link) {
    link.href = url;
    const cd = response.headers.get('Content-Disposition');
    const nameMatch = cd && cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    const filename = nameMatch ? nameMatch[1].replace(/['"]/g, '') : (tool.outputName || 'result.pdf');
    link.download = filename;
    link.style.display = 'inline-flex';
  }

  if (info) {
    const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
    info.textContent = `File ready: ${formatFileSize(blob.size)}`;
  }

  resultSec.classList.add('active');
}

// ══════════════════════════════════════════════════════════
// GSAP ANIMATIONS
// ══════════════════════════════════════════════════════════
function initGSAP() {
  if (typeof gsap === 'undefined') return;

  gsap.registerPlugin(ScrollTrigger);

  // Hero entrance
  gsap.from('.hero-badge', { y: 30, opacity: 0, duration: 0.7, delay: 0.2, ease: 'power3.out' });
  gsap.from('.hero-title', { y: 40, opacity: 0, duration: 0.8, delay: 0.35, ease: 'power3.out' });
  gsap.from('.hero-desc',  { y: 30, opacity: 0, duration: 0.7, delay: 0.5, ease: 'power3.out' });
  gsap.from('.search-container', { y: 30, opacity: 0, duration: 0.7, delay: 0.65, ease: 'power3.out' });
  gsap.from('.hero-stats', { y: 20, opacity: 0, duration: 0.6, delay: 0.8, ease: 'power3.out' });
  gsap.from('.hero-visual', { x: 60, opacity: 0, duration: 0.9, delay: 0.4, ease: 'power3.out' });

  // Section headers
  gsap.utils.toArray('.section-header').forEach(el => {
    gsap.from(el, {
      scrollTrigger: { trigger: el, start: 'top 85%' },
      x: -30, opacity: 0, duration: 0.6, ease: 'power3.out'
    });
  });

  // Why cards
  gsap.utils.toArray('.why-card').forEach((card, i) => {
    gsap.from(card, {
      scrollTrigger: { trigger: card, start: 'top 85%' },
      y: 30, opacity: 0, duration: 0.5, delay: i * 0.08, ease: 'power3.out'
    });
  });
}

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Particles
  const canvas = document.getElementById('particleCanvas');
  if (canvas) new ParticleSystem(canvas);

  // Render tool cards
  renderAllTools();

  // Observe fade-ins
  setTimeout(observeFadeIns, 100);

  // GSAP
  initGSAP();

  // Nav active state on scroll
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');

  const scrollObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === '#' + entry.target.id);
        });
      }
    });
  }, { threshold: 0.3 });

  sections.forEach(s => scrollObserver.observe(s));
});
