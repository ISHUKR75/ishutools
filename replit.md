# IshuTools.fun — Professional PDF Tools Suite

## Project Overview
A complete, professional online PDF tools suite with 35+ working tools.
Built by **Ishu Kumar** (GitHub: ISHUKR41 / ISHUKR75).

**Domain:** ishutools.fun  
**Stack:** Python Flask (backend) + Vanilla HTML/CSS/JS (frontend)

## Architecture
```
workspace/
├── backend/          # Python Flask server (port 5000)
│   ├── app.py        # Main Flask app with all 35+ API routes
│   └── tools/        # Individual tool implementations (one file per tool)
├── frontend/         # Static frontend files (served by Flask)
│   ├── index.html    # Main homepage with tool grid, search, categories
│   ├── static/css/   # main.css — dark/light theme, all styles
│   ├── static/js/    # main.js — particles, search, modal, GSAP animations
│   └── static/icons/ # SVG favicon
└── seo/
    ├── sitemap.xml   # For ishutools.fun
    └── robots.txt
```

## Run Command
```bash
cd backend && python3 app.py
```

## Tools Implemented (35+)
- **Organize:** Merge, Split, Compress, Remove Pages, Extract Pages, Organize, Scan to PDF, Optimize, Repair, OCR
- **Convert to PDF:** JPG to PDF, Word to PDF, Excel to PDF, PowerPoint to PDF, HTML to PDF
- **Convert from PDF:** PDF to JPG, PDF to Word, PDF to Excel, PDF to PowerPoint, PDF to PDF/A
- **Edit PDF:** Rotate, Add Page Numbers, Add Watermark, Crop
- **Security:** Unlock, Protect, Sign, Redact, Compare
- **AI:** AI Summarizer, Translate PDF

## Key Libraries (Python)
- pypdf, pikepdf — PDF manipulation
- pdf2docx — PDF to Word
- reportlab, fpdf2 — PDF generation
- Pillow, img2pdf, pdf2image — Image operations
- pytesseract — OCR (Tesseract backend)
- deep-translator — Translation via Google
- python-docx, openpyxl, python-pptx — Office formats
- pdfminer.six — Text extraction
- weasyprint — HTML to PDF

## User Preferences
- Dark theme by default (light/dark toggle available)
- Fonts: Inter (primary) + Poppins (display/headings)
- Colors: Indigo/Purple accent (#6366F1, #8B5CF6)
- GSAP animations + Canvas particle system
- 100% free, no API keys required, no signup
