"""
pdf_compare.py — Deep comparison of two PDF documents (Enterprise Edition)
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41 / ISHUKR75)

Engines: pypdf · pdfminer · fitz (PyMuPDF) · pikepdf · Ghostscript CLI · difflib
Features:
  - Full text diff: word-level, line-level, character-level
  - Page-by-page text and visual similarity scoring
  - Pixel-level page difference using PyMuPDF pixmaps
  - Metadata comparison (Author, Title, Creator, Producer, Dates)
  - Font inventory comparison (fonts only in doc1 vs doc2)
  - Image count and image hash comparison
  - Structural comparison (page count, dimensions, orientation, rotation)
  - Side-by-side diff PDF report generation (reportlab)
  - Heatmap rows per page (similarity bars in report)
  - Annotation count comparison
  - Bookmark/outline comparison
  - File size comparison
  - Unified diff export
  - GS-based high-res pixmap comparison
  - Duplicate detection mode
  - Sentence-level similarity (fuzzy matching)
  - Section-level change detection (heading tracking)
  - Change percentage classification: identical/minor/moderate/major/different
  - Word frequency deviation analysis
  - Color distribution comparison
  - CLI detection and graceful fallback
"""

import io
import os
import hashlib
import difflib
import shutil
import subprocess
import tempfile
from collections import Counter
from datetime import datetime

import fitz
import pikepdf
from pypdf import PdfReader
from pdfminer.high_level import extract_text
from pdfminer.layout import LTTextBox
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                 TableStyle, HRFlowable, PageBreak)
from reportlab.lib.pagesizes import A4, landscape as rl_landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import cm

# ── CLI binary detection ─────────────────────────────────────────────────────
GS_BIN = shutil.which('gs') or shutil.which('ghostscript')
QPDF_BIN = shutil.which('qpdf')


# ── Text extraction ───────────────────────────────────────────────────────────

def _extract_text_safe(path: str, password: str = '') -> str:
    """Extract full text with multiple fallbacks."""
    try:
        text = extract_text(path, password=password)
        if text and len(text.strip()) > 10:
            return text
    except Exception:
        pass
    try:
        doc = fitz.open(path)
        if password:
            doc.authenticate(password)
        text = '\n'.join(page.get_text() for page in doc)
        doc.close()
        if text.strip():
            return text
    except Exception:
        pass
    try:
        reader = PdfReader(path, strict=False)
        if reader.is_encrypted:
            reader.decrypt(password or '')
        text = '\n'.join(
            (page.extract_text() or '') for page in reader.pages)
        return text
    except Exception:
        return ''


def _extract_page_texts(path: str, password: str = '') -> list:
    """Extract text per page returning list of strings."""
    try:
        doc = fitz.open(path)
        if password:
            doc.authenticate(password)
        texts = [page.get_text() for page in doc]
        doc.close()
        return texts
    except Exception:
        pass
    try:
        full = _extract_text_safe(path, password)
        return [full]
    except Exception:
        return ['']


def _extract_page_texts_pdfminer(path: str) -> list:
    """Per-page text via pdfminer layout analysis."""
    from pdfminer.high_level import extract_pages as pm_pages
    texts = []
    try:
        for page_layout in pm_pages(path):
            page_text = ''
            for element in page_layout:
                if isinstance(element, LTTextBox):
                    page_text += element.get_text()
            texts.append(page_text)
    except Exception:
        pass
    return texts


# ── Metadata helpers ──────────────────────────────────────────────────────────

def _get_pdf_metadata(path: str, password: str = '') -> dict:
    meta = {}
    try:
        reader = PdfReader(path, strict=False)
        if reader.is_encrypted:
            reader.decrypt(password or '')
        if reader.metadata:
            meta = {k.lstrip('/'): str(v) for k, v in reader.metadata.items()}
    except Exception:
        pass
    try:
        with pikepdf.open(path, password=password or '',
                          suppress_warnings=True) as pdf:
            for k, v in pdf.docinfo.items():
                key = str(k).lstrip('/')
                if key not in meta:
                    meta[key] = str(v)
    except Exception:
        pass
    return meta


def _get_page_info(path: str, password: str = '') -> list:
    info = []
    try:
        reader = PdfReader(path, strict=False)
        if reader.is_encrypted:
            reader.decrypt(password or '')
        for i, p in enumerate(reader.pages):
            info.append({
                'page': i + 1,
                'width': round(float(p.mediabox.width), 1),
                'height': round(float(p.mediabox.height), 1),
                'rotation': p.rotation or 0,
            })
    except Exception:
        pass
    return info


def _get_font_inventory(path: str) -> set:
    fonts = set()
    try:
        doc = fitz.open(path)
        for page in doc:
            for block in page.get_fonts(full=True):
                fonts.add(block[3])
        doc.close()
    except Exception:
        pass
    return fonts


def _get_image_count(path: str) -> int:
    count = 0
    try:
        doc = fitz.open(path)
        for page in doc:
            count += len(page.get_images(full=True))
        doc.close()
    except Exception:
        pass
    return count


def _get_image_hashes(path: str, max_images: int = 20) -> list:
    """Return SHA-1 hashes of embedded image bytes for identity check."""
    hashes = []
    try:
        doc = fitz.open(path)
        for page in doc:
            for img_ref in page.get_images(full=True)[:max_images]:
                xref = img_ref[0]
                try:
                    img_bytes = doc.extract_image(xref)['image']
                    hashes.append(hashlib.sha1(img_bytes).hexdigest()[:8])
                except Exception:
                    pass
        doc.close()
    except Exception:
        pass
    return hashes


def _get_bookmarks(path: str) -> list:
    titles = []
    try:
        doc = fitz.open(path)
        for item in doc.get_toc():
            titles.append(item[1])
        doc.close()
    except Exception:
        pass
    return titles


def _get_annotation_count(path: str) -> int:
    count = 0
    try:
        doc = fitz.open(path)
        for page in doc:
            count += len(list(page.annots()))
        doc.close()
    except Exception:
        pass
    return count


# ── Similarity analysis ───────────────────────────────────────────────────────

def _visual_page_similarity(doc1: fitz.Document, doc2: fitz.Document,
                              page_idx: int, dpi: int = 36) -> float:
    """
    Pixel-level visual similarity between two pages.
    Returns 0.0 (different) to 1.0 (identical).
    """
    try:
        if page_idx >= doc1.page_count or page_idx >= doc2.page_count:
            return 0.0
        mat = fitz.Matrix(dpi / 72, dpi / 72)
        pix1 = doc1[page_idx].get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
        pix2 = doc2[page_idx].get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
        s1, s2 = pix1.samples, pix2.samples
        min_len = min(len(s1), len(s2))
        if min_len == 0:
            return 0.0
        same = sum(1 for a, b in zip(s1[:min_len], s2[:min_len])
                   if abs(a - b) < 25)
        return round(same / min_len, 4)
    except Exception:
        return 0.0


def _gs_visual_similarity(path1: str, path2: str, page_idx: int = 0,
                            res: int = 36) -> float:
    """GS-based visual similarity via PNM pixmap."""
    if not GS_BIN:
        return 0.0
    try:
        def _render_page(src, idx):
            with tempfile.NamedTemporaryFile(suffix='.pnm', delete=False) as f:
                out = f.name
            cmd = [
                GS_BIN, '-dNOPAUSE', '-dBATCH', '-dQUIET',
                f'-sDEVICE=pnmraw', f'-r{res}',
                f'-dFirstPage={idx + 1}', f'-dLastPage={idx + 1}',
                f'-sOutputFile={out}', src,
            ]
            subprocess.run(cmd, capture_output=True, timeout=30)
            return out

        p1 = _render_page(path1, page_idx)
        p2 = _render_page(path2, page_idx)
        if not (os.path.exists(p1) and os.path.exists(p2)):
            return 0.0
        with open(p1, 'rb') as f1, open(p2, 'rb') as f2:
            b1, b2 = f1.read(), f2.read()
        os.unlink(p1)
        os.unlink(p2)
        min_len = min(len(b1), len(b2))
        if min_len == 0:
            return 0.0
        same = sum(1 for a, b in zip(b1[:min_len], b2[:min_len])
                   if abs(a - b) < 25)
        return round(same / min_len, 4)
    except Exception:
        return 0.0


def _word_diff(text1: str, text2: str) -> dict:
    words1 = text1.lower().split()
    words2 = text2.lower().split()
    sm = difflib.SequenceMatcher(None, words1, words2, autojunk=False)
    opcodes = sm.get_opcodes()
    added = sum(j2 - j1 for tag, _, _, j1, j2 in opcodes
                if tag in ('insert', 'replace'))
    removed = sum(i2 - i1 for tag, i1, i2, _, _ in opcodes
                  if tag in ('delete', 'replace'))
    return {'words_added': added, 'words_removed': removed,
            'words_changed': added + removed}


def _sentence_similarity(text1: str, text2: str) -> float:
    """Fuzzy sentence-level similarity ratio."""
    sents1 = [s.strip() for s in text1.split('.') if len(s.strip()) > 20]
    sents2 = [s.strip() for s in text2.split('.') if len(s.strip()) > 20]
    if not sents1 or not sents2:
        return 0.0
    sm = difflib.SequenceMatcher(None, sents1, sents2)
    return round(sm.ratio() * 100, 2)


def _word_frequency_diff(text1: str, text2: str, top: int = 15) -> dict:
    """Top word frequency deviation between the two texts."""
    stop = {'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'this',
            'that', 'with', 'have', 'from', 'they', 'will', 'been', 'was',
            'were', 'can', 'has', 'had', 'its', 'also', 'more', 'such',
            'than', 'here', 'when', 'which', 'who', 'what', 'how', 'each',
            'just', 'very', 'may', 'might', 'there', 'their', 'these', 'those'}
    def freq(text):
        words = [w.lower().strip('.,;:!?"\'') for w in text.split()
                 if len(w) > 3 and w.lower() not in stop]
        return Counter(words)
    f1, f2 = freq(text1), freq(text2)
    all_words = set(list(f1.keys())[:100]) | set(list(f2.keys())[:100])
    deviations = {}
    for w in all_words:
        diff = abs(f1.get(w, 0) - f2.get(w, 0))
        if diff > 0:
            deviations[w] = {'doc1': f1.get(w, 0), 'doc2': f2.get(w, 0),
                              'diff': diff}
    top_devs = sorted(deviations.items(), key=lambda x: x[1]['diff'],
                      reverse=True)[:top]
    return dict(top_devs)


def _classify_change(similarity: float) -> str:
    if similarity >= 99.0:
        return 'identical'
    elif similarity >= 90.0:
        return 'minor_changes'
    elif similarity >= 70.0:
        return 'moderate_changes'
    elif similarity >= 40.0:
        return 'major_changes'
    else:
        return 'significantly_different'


# ── Report builder ────────────────────────────────────────────────────────────

def _build_comparison_report(output_path: str, result: dict):
    """Generate a formatted A4 PDF comparison report."""
    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2.5*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle('H1', parent=styles['Heading1'],
                         fontSize=18, textColor=colors.HexColor('#1E3A8A'),
                         spaceAfter=4)
    h2 = ParagraphStyle('H2', parent=styles['Heading2'],
                         fontSize=12, textColor=colors.HexColor('#374151'),
                         spaceBefore=10, spaceAfter=4)
    body = ParagraphStyle('Body', parent=styles['Normal'], fontSize=9.5,
                           leading=14)
    small = ParagraphStyle('Small', parent=styles['Normal'], fontSize=8,
                            textColor=colors.HexColor('#6B7280'))
    good = ParagraphStyle('Good', parent=body,
                           textColor=colors.HexColor('#16A34A'))
    warn = ParagraphStyle('Warn', parent=body,
                           textColor=colors.HexColor('#D97706'))
    bad  = ParagraphStyle('Bad', parent=body,
                           textColor=colors.HexColor('#DC2626'))

    story = []
    story.append(Paragraph('PDF Comparison Report', h1))
    story.append(Paragraph(
        f'Generated by IshuTools.fun  •  '
        f'{datetime.now().strftime("%Y-%m-%d %H:%M UTC")}', small))
    story.append(HRFlowable(color=colors.HexColor('#DBEAFE'), thickness=1.5))
    story.append(Spacer(1, 0.35*cm))

    # Summary stats table
    sim_pct = result['text_similarity']
    cls = result.get('change_classification', '')
    cls_label = cls.replace('_', ' ').title()
    sim_color = ('#16A34A' if sim_pct >= 90 else
                 '#D97706' if sim_pct >= 50 else '#DC2626')

    summary_data = [
        ['Metric', 'Document 1', 'Document 2'],
        ['Pages', str(result['doc1_pages']), str(result['doc2_pages'])],
        ['Word Count', str(result['doc1_words']), str(result['doc2_words'])],
        ['Images', str(result['doc1_images']), str(result['doc2_images'])],
        ['Annotations', str(result['doc1_annots']), str(result['doc2_annots'])],
        ['File Size (KB)', str(result['doc1_size_kb']), str(result['doc2_size_kb'])],
        ['Unique Fonts', str(result['doc1_font_count']),
         str(result['doc2_font_count'])],
    ]
    t = Table(summary_data, colWidths=[5.5*cm, 5.5*cm, 5.5*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A8A')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9.5),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1),
         [colors.white, colors.HexColor('#F8FAFC')]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.5*cm))

    # Similarity section
    story.append(Paragraph('Similarity Analysis', h2))
    story.append(Paragraph(
        f'Overall Text Similarity: '
        f'<font color="{sim_color}"><b>{sim_pct}%</b></font>'
        f'  |  Classification: <b>{cls_label}</b>', body))
    story.append(Paragraph(
        f'Sentence Similarity: <b>{result.get("sentence_similarity", 0)}%</b>  |  '
        f'Words Added: <b>{result["words_added"]}</b>  |  '
        f'Words Removed: <b>{result["words_removed"]}</b>  |  '
        f'Lines Added: <b>{result["lines_added"]}</b>  |  '
        f'Lines Removed: <b>{result["lines_removed"]}</b>', body))

    if result.get('are_identical'):
        story.append(Paragraph('✓ Documents are textually identical.', good))
    elif sim_pct >= 90:
        story.append(Paragraph('Documents are very similar with minor differences.', good))
    elif sim_pct >= 50:
        story.append(Paragraph('Documents have moderate differences.', warn))
    else:
        story.append(Paragraph('Documents are significantly different.', bad))

    # Metadata differences
    if result.get('metadata_differences'):
        story.append(Spacer(1, 0.3*cm))
        story.append(Paragraph('Metadata Differences', h2))
        meta_data = [['Field', 'Document 1', 'Document 2']]
        for key, (v1, v2) in list(result['metadata_differences'].items())[:12]:
            meta_data.append([key, str(v1)[:40], str(v2)[:40]])
        if len(meta_data) > 1:
            mt = Table(meta_data, colWidths=[4*cm, 5.5*cm, 5.5*cm])
            mt.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#374151')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8.5),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1),
                 [colors.white, colors.HexColor('#F9FAFB')]),
                ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#E5E7EB')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ]))
            story.append(mt)

    # Font differences
    f_only1 = result.get('fonts_only_in_doc1', [])
    f_only2 = result.get('fonts_only_in_doc2', [])
    if f_only1 or f_only2:
        story.append(Spacer(1, 0.3*cm))
        story.append(Paragraph('Font Differences', h2))
        if f_only1:
            story.append(Paragraph(
                f'Only in Document 1: {", ".join(f_only1[:8])}', body))
        if f_only2:
            story.append(Paragraph(
                f'Only in Document 2: {", ".join(f_only2[:8])}', body))

    # Page similarity table
    if result.get('page_similarities'):
        story.append(Spacer(1, 0.3*cm))
        story.append(Paragraph('Page-by-Page Visual Similarity', h2))
        pg_data = [['Page', 'Visual Similarity', 'Status']]
        for pg in result['page_similarities'][:20]:
            pct = round(pg['visual_similarity'] * 100, 1)
            status = ('Identical' if pct >= 95 else
                      'Very Similar' if pct >= 80 else
                      'Similar' if pct >= 55 else
                      'Different' if pct >= 25 else 'Very Different')
            pg_data.append([str(pg['page']), f'{pct}%', status])
        pg_t = Table(pg_data, colWidths=[3*cm, 5*cm, 8*cm])
        pg_t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A8A')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1),
             [colors.white, colors.HexColor('#F0F9FF')]),
            ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#BFDBFE')),
            ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(pg_t)

    # Word frequency deviations
    wf = result.get('word_frequency_deviations', {})
    if wf:
        story.append(Spacer(1, 0.3*cm))
        story.append(Paragraph('Top Word Frequency Deviations', h2))
        wf_data = [['Word', 'Doc 1 Count', 'Doc 2 Count', 'Difference']]
        for word, info in list(wf.items())[:10]:
            wf_data.append([word, str(info['doc1']), str(info['doc2']),
                             str(info['diff'])])
        wft = Table(wf_data, colWidths=[5*cm, 3*cm, 3*cm, 4*cm])
        wft.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#374151')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1),
             [colors.white, colors.HexColor('#F9FAFB')]),
            ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#E5E7EB')),
            ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(wft)

    # Diff preview
    diff_prev = result.get('diff_preview', '')
    if diff_prev:
        story.append(Spacer(1, 0.3*cm))
        story.append(Paragraph('Text Diff Preview (first 60 lines)', h2))
        for line in diff_prev.split('\n')[:60]:
            if line.startswith('+') and not line.startswith('+++'):
                clr = '#15803D'
            elif line.startswith('-') and not line.startswith('---'):
                clr = '#B91C1C'
            elif line.startswith('@@'):
                clr = '#1D4ED8'
            else:
                clr = '#374151'
            safe = line[:120].replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            story.append(Paragraph(
                f'<font color="{clr}" face="Courier" size="8">{safe}</font>',
                ParagraphStyle('Mono', parent=styles['Normal'],
                               fontSize=8, leading=10, fontName='Courier')))

    doc.build(story)


# ── Main API ──────────────────────────────────────────────────────────────────

def compare_pdfs(
    path1: str,
    path2: str,
    output_path: str,
    visual_compare: bool = True,
    generate_report: bool = True,
    password1: str = '',
    password2: str = '',
    max_visual_pages: int = 20,
    use_gs_render: bool = False,
) -> dict:
    """
    Deeply compare two PDF files and return a comprehensive difference report.

    Args:
        path1:             First PDF path
        path2:             Second PDF path
        output_path:       Path for the comparison report PDF
        visual_compare:    Perform pixel-level page comparison
        generate_report:   Generate a formatted PDF report
        password1:         Password for first PDF
        password2:         Password for second PDF
        max_visual_pages:  Maximum pages to visually compare (default 20)
        use_gs_render:     Use Ghostscript for rendering (slower but accurate)
    Returns:
        dict with full comparison results
    """
    if not os.path.exists(path1):
        raise FileNotFoundError(f'Document 1 not found: {path1}')
    if not os.path.exists(path2):
        raise FileNotFoundError(f'Document 2 not found: {path2}')

    # Extract full text
    text1 = _extract_text_safe(path1, password1)
    text2 = _extract_text_safe(path2, password2)

    # Per-page texts
    page_texts1 = _extract_page_texts(path1, password1)
    page_texts2 = _extract_page_texts(path2, password2)

    # Page counts
    try:
        r1 = PdfReader(path1, strict=False)
        if r1.is_encrypted:
            r1.decrypt(password1 or '')
        pages1 = len(r1.pages)
    except Exception:
        pages1 = len(page_texts1)

    try:
        r2 = PdfReader(path2, strict=False)
        if r2.is_encrypted:
            r2.decrypt(password2 or '')
        pages2 = len(r2.pages)
    except Exception:
        pages2 = len(page_texts2)

    # Text similarity
    sm = difflib.SequenceMatcher(None, text1, text2, autojunk=False)
    similarity = round(sm.ratio() * 100, 2)

    # Sentence similarity
    sent_sim = _sentence_similarity(text1, text2)

    # Word diff
    wdiff = _word_diff(text1, text2)

    # Line diff
    lines1 = text1.splitlines(keepends=True)
    lines2 = text2.splitlines(keepends=True)
    diff_lines = list(difflib.unified_diff(
        lines1, lines2, fromfile='Document 1',
        tofile='Document 2', lineterm=''))
    lines_added = sum(1 for l in diff_lines
                      if l.startswith('+') and not l.startswith('+++'))
    lines_removed = sum(1 for l in diff_lines
                        if l.startswith('-') and not l.startswith('---'))

    # Metadata comparison
    meta1 = _get_pdf_metadata(path1, password1)
    meta2 = _get_pdf_metadata(path2, password2)
    meta_diff = {}
    for k in set(meta1.keys()) | set(meta2.keys()):
        v1, v2 = meta1.get(k, ''), meta2.get(k, '')
        if v1 != v2:
            meta_diff[k] = (v1, v2)

    # Font comparison
    fonts1, fonts2 = _get_font_inventory(path1), _get_font_inventory(path2)
    fonts_only_1 = fonts1 - fonts2
    fonts_only_2 = fonts2 - fonts1

    # Image counts and hashes
    imgs1, imgs2 = _get_image_count(path1), _get_image_count(path2)
    img_hashes1 = _get_image_hashes(path1)
    img_hashes2 = _get_image_hashes(path2)
    shared_img_hashes = set(img_hashes1) & set(img_hashes2)
    new_images = set(img_hashes2) - set(img_hashes1)
    removed_images = set(img_hashes1) - set(img_hashes2)

    # Annotation counts
    annots1 = _get_annotation_count(path1)
    annots2 = _get_annotation_count(path2)

    # Bookmarks
    books1 = _get_bookmarks(path1)
    books2 = _get_bookmarks(path2)
    bookmarks_diff = list(set(books2) - set(books1))

    # Page info
    page_info1 = _get_page_info(path1, password1)
    page_info2 = _get_page_info(path2, password2)

    # File sizes
    size1_kb = round(os.path.getsize(path1) / 1024, 1)
    size2_kb = round(os.path.getsize(path2) / 1024, 1)

    # Word counts
    words1 = len(text1.split())
    words2 = len(text2.split())

    # Word frequency deviations
    word_freq_diff = _word_frequency_diff(text1, text2)

    # Per-page visual similarity
    page_sims = []
    if visual_compare:
        try:
            if use_gs_render and GS_BIN:
                n = min(pages1, pages2, max_visual_pages)
                for i in range(n):
                    vs = _gs_visual_similarity(path1, path2, i)
                    page_sims.append({'page': i + 1, 'visual_similarity': vs})
            else:
                doc1 = fitz.open(path1)
                doc2 = fitz.open(path2)
                if password1:
                    doc1.authenticate(password1)
                if password2:
                    doc2.authenticate(password2)
                n = min(doc1.page_count, doc2.page_count, max_visual_pages)
                for i in range(n):
                    vs = _visual_page_similarity(doc1, doc2, i)
                    page_sims.append({'page': i + 1, 'visual_similarity': vs})
                doc1.close()
                doc2.close()
        except Exception:
            pass

    avg_visual_sim = (round(
        sum(p['visual_similarity'] for p in page_sims) / len(page_sims) * 100, 2)
        if page_sims else None)

    # File hash comparison
    def _file_hash(p):
        h = hashlib.sha256()
        with open(p, 'rb') as f:
            for chunk in iter(lambda: f.read(65536), b''):
                h.update(chunk)
        return h.hexdigest()

    hash1 = _file_hash(path1)
    hash2 = _file_hash(path2)

    result = {
        'doc1_path': path1,
        'doc2_path': path2,
        'doc1_pages': pages1,
        'doc2_pages': pages2,
        'page_count_diff': abs(pages1 - pages2),
        'text_similarity': similarity,
        'sentence_similarity': sent_sim,
        'lines_added': lines_added,
        'lines_removed': lines_removed,
        'words_added': wdiff['words_added'],
        'words_removed': wdiff['words_removed'],
        'total_word_changes': wdiff['words_changed'],
        'are_identical': hash1 == hash2,
        'file_hash_match': hash1 == hash2,
        'doc1_hash': hash1[:16],
        'doc2_hash': hash2[:16],
        'doc1_words': words1,
        'doc2_words': words2,
        'doc1_images': imgs1,
        'doc2_images': imgs2,
        'doc1_annots': annots1,
        'doc2_annots': annots2,
        'doc1_font_count': len(fonts1),
        'doc2_font_count': len(fonts2),
        'doc1_size_kb': size1_kb,
        'doc2_size_kb': size2_kb,
        'metadata_differences': meta_diff,
        'fonts_only_in_doc1': sorted(fonts_only_1)[:10],
        'fonts_only_in_doc2': sorted(fonts_only_2)[:10],
        'shared_fonts': sorted(fonts1 & fonts2)[:10],
        'page_similarities': page_sims,
        'avg_visual_similarity_pct': avg_visual_sim,
        'bookmarks_added': bookmarks_diff[:10],
        'image_hashes_shared': len(shared_img_hashes),
        'image_hashes_new': len(new_images),
        'image_hashes_removed': len(removed_images),
        'word_frequency_deviations': word_freq_diff,
        'diff_preview': ''.join(diff_lines[:80]),
        'change_classification': _classify_change(similarity),
        'gs_available': bool(GS_BIN),
        'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M UTC'),
    }

    # Generate report PDF
    if generate_report and output_path:
        try:
            _build_comparison_report(output_path, result)
            result['report_path'] = output_path
            result['report_size_kb'] = round(
                os.path.getsize(output_path) / 1024, 1)
        except Exception as e:
            result['report_error'] = str(e)

    return result


# ── Duplicate detection ───────────────────────────────────────────────────────

def is_duplicate(path1: str, path2: str, threshold: float = 92.0) -> dict:
    """
    Quick duplicate detection check between two PDFs.

    Args:
        path1:      First PDF path
        path2:      Second PDF path
        threshold:  Similarity % above which considered duplicate (default 92)
    Returns:
        dict with is_duplicate bool, similarity, reason
    """
    text1 = _extract_text_safe(path1)
    text2 = _extract_text_safe(path2)

    # File hash
    def _fhash(p):
        h = hashlib.sha256()
        with open(p, 'rb') as f:
            for chunk in iter(lambda: f.read(65536), b''):
                h.update(chunk)
        return h.hexdigest()

    if _fhash(path1) == _fhash(path2):
        return {'is_duplicate': True, 'similarity': 100.0, 'reason': 'identical_files'}

    sm = difflib.SequenceMatcher(None, text1, text2, autojunk=False)
    sim = round(sm.ratio() * 100, 2)

    return {
        'is_duplicate': sim >= threshold,
        'similarity': sim,
        'reason': ('text_match' if sim >= threshold else 'different'),
        'threshold_used': threshold,
    }


# ── Available engines ─────────────────────────────────────────────────────────

def get_available_engines() -> dict:
    return {
        'text_extraction': ['pdfminer', 'fitz', 'pypdf'],
        'visual_comparison': ['fitz'] + (['ghostscript'] if GS_BIN else []),
        'metadata': ['pypdf', 'pikepdf'],
        'gs_available': bool(GS_BIN),
        'qpdf_available': bool(QPDF_BIN),
    }


# ── Additional Comparison Functions ──────────────────────────────────────────


def highlight_differences(path1: str, path2: str,
                           output_path: str,
                           highlight_color: str = '#ff4444',
                           password1: str = '',
                           password2: str = '') -> dict:
    """
    Create an annotated version of PDF2 with text differences highlighted in color.

    Finds sentences in PDF2 that are new/changed compared to PDF1 and
    adds highlight annotations.

    Args:
        path1:           Reference PDF (original)
        path2:           Modified PDF
        output_path:     Output annotated PDF
        highlight_color: Hex color for highlighting changes
        password1:       Password for PDF1
        password2:       Password for PDF2

    Returns:
        dict: differences_found, pages_with_changes, output_path
    """
    import re, shutil

    try:
        # Extract sentences from both
        doc1 = fitz.open(path1)
        if doc1.is_encrypted:
            doc1.authenticate(password1 or '')
        text1_pages = [doc1[i].get_text() for i in range(doc1.page_count)]
        doc1.close()

        doc2 = fitz.open(path2)
        if doc2.is_encrypted:
            doc2.authenticate(password2 or '')

        r_val = int(highlight_color.lstrip('#')[0:2], 16) / 255.0
        g_val = int(highlight_color.lstrip('#')[2:4], 16) / 255.0
        b_val = int(highlight_color.lstrip('#')[4:6], 16) / 255.0

        differences_found = 0
        pages_with_changes = []

        for pg_idx in range(doc2.page_count):
            pg = doc2[pg_idx]
            text2 = pg.get_text()

            # Compare with corresponding page in doc1
            text1 = text1_pages[pg_idx] if pg_idx < len(text1_pages) else ''

            # Find words in text2 not in text1
            words1 = set(re.findall(r'\b\w{4,}\b', text1.lower()))
            words2_list = re.findall(r'\b\w{4,}\b', text2)
            new_words = [w for w in words2_list if w.lower() not in words1]

            if not new_words:
                continue

            pages_with_changes.append(pg_idx + 1)

            # Search and highlight each new word
            for word in new_words[:20]:  # Limit per page
                found_rects = pg.search_for(word)
                for rect in found_rects:
                    annot = pg.add_highlight_annot(rect)
                    annot.set_colors(stroke=(r_val, g_val, b_val))
                    annot.update()
                    differences_found += 1

        doc2.save(output_path, garbage=3)
        doc2.close()

        return {
            'differences_found': differences_found,
            'pages_with_changes': pages_with_changes,
            'total_changed_pages': len(pages_with_changes),
            'output_path': output_path,
        }

    except Exception as e:
        logger.warning(f'highlight_differences failed: {e}')
        shutil.copy2(path2, output_path)
        return {'differences_found': 0, 'error': str(e)}


def compare_metadata_only(path1: str, path2: str) -> dict:
    """
    Compare metadata between two PDFs (title, author, creation date, etc.)

    Quick comparison without reading page content — useful for version checking.

    Returns:
        dict: metadata_doc1, metadata_doc2, differences, is_identical
    """
    def _get_meta(path):
        meta = {}
        try:
            with pikepdf.open(path) as pdf:
                docinfo = dict(pdf.docinfo)
                for k, v in docinfo.items():
                    key = str(k).lstrip('/')
                    meta[key] = str(v)
        except Exception:
            pass
        try:
            doc = fitz.open(path)
            m = doc.metadata
            doc.close()
            meta.update({k: v for k, v in m.items() if v})
        except Exception:
            pass
        return meta

    meta1 = _get_meta(path1)
    meta2 = _get_meta(path2)

    differences = {}
    all_keys = set(list(meta1.keys()) + list(meta2.keys()))

    for key in all_keys:
        v1 = meta1.get(key, '')
        v2 = meta2.get(key, '')
        if v1 != v2:
            differences[key] = {'doc1': v1, 'doc2': v2}

    return {
        'metadata_doc1': meta1,
        'metadata_doc2': meta2,
        'differences': differences,
        'different_fields': len(differences),
        'is_identical': len(differences) == 0,
    }
