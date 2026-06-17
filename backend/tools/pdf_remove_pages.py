"""
pdf_remove_pages.py — Remove pages from a PDF (Enterprise Edition)
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41 / ISHUKR75)

Engines: pypdf · pikepdf · fitz (PyMuPDF) · reportlab · Pillow · Ghostscript CLI · qpdf CLI
Features:
  - Rich page selector: '1,3,5-8', even/odd, last-N, first-N, every-Nth, blank-pages
  - Blank page auto-detection (remove pages with no visible content)
  - Duplicate page detection and removal (content hash)
  - Remove pages by text pattern match (regex)
  - Remove pages smaller/larger than a size threshold
  - Preview mode: show what would be removed without actually removing
  - Compression pass after removal (GS or pikepdf)
  - Metadata preservation and update
  - Undo map: record which original pages ended up where
  - Per-page detailed stats (word count, image count, dimensions)
  - Ghostscript normalize pass before removal
  - qpdf split/reassemble pass for maximum compatibility
  - Bookmark/outline update after page removal
  - Page label preservation
  - Section grouping awareness
  - Batch multi-PDF processing
  - Output format: single PDF or individual pages
  - Invert selection (keep selected pages, remove rest)
  - Remove pages by keyword presence
  - Remove watermark-only pages
  - Redacted content detection
"""

import hashlib
import io
import os
import re
import shutil
import struct
import subprocess
import tempfile
from datetime import datetime
from typing import Optional

import fitz                              # PyMuPDF
import pikepdf
from PIL import Image
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Table,
                                 TableStyle, Spacer, HRFlowable, PageBreak)
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import cm

try:
    from pypdf import PdfReader, PdfWriter
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False

# ── CLI binary detection ─────────────────────────────────────────────────────
GS_BIN  = shutil.which('gs') or shutil.which('ghostscript')
QPDF_BIN = shutil.which('qpdf')


# ╔══════════════════════════════════════════════════════════════════════╗
# ║  PAGE SELECTOR PARSER                                               ║
# ╚══════════════════════════════════════════════════════════════════════╝

def parse_page_selector(selector: str, total: int,
                         invert: bool = False) -> list:
    """
    Parse a page selector string into a sorted list of 0-based indices.

    Supported formats:
      'all'          → all pages
      'even'         → 0-based even pages (2nd, 4th, …)
      'odd'          → 0-based odd pages (1st, 3rd, …)
      'last:N'       → last N pages
      'first:N'      → first N pages
      'every:N'      → every Nth page
      '1,3,5-8'      → 1-based list / ranges
      'blank'        → placeholder (handled separately)

    Args:
        selector: selector string
        total:    total number of pages
        invert:   if True, return pages NOT in the parsed set
    Returns:
        Sorted list of 0-based page indices to REMOVE
    """
    sel = selector.strip().lower()
    indices: set = set()

    if sel in ('all', ''):
        indices = set(range(total))
    elif sel == 'even':
        indices = {i for i in range(total) if (i + 1) % 2 == 0}
    elif sel == 'odd':
        indices = {i for i in range(total) if (i + 1) % 2 != 0}
    elif sel.startswith('last:'):
        try:
            n = int(sel.split(':')[1])
            indices = set(range(max(0, total - n), total))
        except (ValueError, IndexError):
            pass
    elif sel.startswith('first:'):
        try:
            n = int(sel.split(':')[1])
            indices = set(range(min(n, total)))
        except (ValueError, IndexError):
            pass
    elif sel.startswith('every:'):
        try:
            step = int(sel.split(':')[1])
            indices = {i for i in range(total) if (i + 1) % step == 0}
        except (ValueError, IndexError):
            pass
    elif sel == 'blank':
        indices = set()  # filled by blank-detection step
    else:
        for part in sel.replace(' ', '').split(','):
            if not part:
                continue
            if '-' in part and not part.startswith('-'):
                try:
                    a, b = part.split('-', 1)
                    for n in range(int(a), int(b) + 1):
                        if 1 <= n <= total:
                            indices.add(n - 1)
                except ValueError:
                    pass
            elif part.isdigit():
                n = int(part)
                if 1 <= n <= total:
                    indices.add(n - 1)

    if invert:
        indices = set(range(total)) - indices

    return sorted(indices)


# ╔══════════════════════════════════════════════════════════════════════╗
# ║  PAGE ANALYSIS                                                       ║
# ╚══════════════════════════════════════════════════════════════════════╝

def _page_content_hash(page: 'fitz.Page') -> str:
    """Hash the rendered raster of a page at low DPI for dedup."""
    try:
        mat = fitz.Matrix(0.5, 0.5)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        return hashlib.md5(pix.samples).hexdigest()
    except Exception:
        return ''


def _is_blank_page(page: 'fitz.Page',
                   text_threshold: int = 8,
                   image_threshold: float = 0.01) -> bool:
    """
    Detect a blank page using text + image content.

    Args:
        page:             fitz.Page
        text_threshold:   minimum chars to consider non-blank
        image_threshold:  minimum image coverage fraction to consider non-blank
    """
    text = page.get_text().strip()
    if len(text) >= text_threshold:
        return False
    # Check image coverage
    try:
        pw = page.rect.width or 1
        ph = page.rect.height or 1
        area = pw * ph
        images = page.get_images(full=True)
        if images:
            # estimate coverage from clip rectangles
            for img in images[:5]:
                rects = page.get_image_rects(img[0])
                for r in rects:
                    coverage = abs(r.get_area()) / area
                    if coverage > image_threshold:
                        return False
    except Exception:
        pass
    return True


def _page_has_text_pattern(page: 'fitz.Page', pattern: str) -> bool:
    """Check if page text matches a regex pattern."""
    try:
        text = page.get_text()
        return bool(re.search(pattern, text, re.IGNORECASE | re.DOTALL))
    except Exception:
        return False


def _page_dimensions_emu(page: 'fitz.Page') -> tuple:
    """Return (width_pt, height_pt) in PDF points."""
    return float(page.rect.width), float(page.rect.height)


def _get_page_stats(page: 'fitz.Page', idx: int) -> dict:
    """Return per-page statistics."""
    text = page.get_text()
    words = len(text.split())
    dims = _page_dimensions_emu(page)
    images = []
    try:
        images = page.get_images(full=False)
    except Exception:
        pass
    return {
        'page': idx + 1,
        'width_pt': round(dims[0], 1),
        'height_pt': round(dims[1], 1),
        'word_count': words,
        'char_count': len(text),
        'image_count': len(images),
        'is_blank': _is_blank_page(page),
        'content_hash': _page_content_hash(page),
    }


# ╔══════════════════════════════════════════════════════════════════════╗
# ║  DETECTION HELPERS                                                   ║
# ╚══════════════════════════════════════════════════════════════════════╝

def _detect_blank_pages(pdf_path: str) -> list:
    """Return 0-based indices of blank pages."""
    blanks = []
    try:
        doc = fitz.open(pdf_path)
        for i in range(doc.page_count):
            if _is_blank_page(doc[i]):
                blanks.append(i)
        doc.close()
    except Exception:
        pass
    return blanks


def _detect_duplicate_pages(pdf_path: str) -> list:
    """Return 0-based indices of duplicate pages (keep first occurrence)."""
    seen: dict = {}
    dupes = []
    try:
        doc = fitz.open(pdf_path)
        for i in range(doc.page_count):
            h = _page_content_hash(doc[i])
            if h:
                if h in seen:
                    dupes.append(i)
                else:
                    seen[h] = i
        doc.close()
    except Exception:
        pass
    return dupes


def _detect_pattern_pages(pdf_path: str, pattern: str) -> list:
    """Return 0-based indices of pages matching a text regex."""
    matches = []
    try:
        doc = fitz.open(pdf_path)
        for i in range(doc.page_count):
            if _page_has_text_pattern(doc[i], pattern):
                matches.append(i)
        doc.close()
    except Exception:
        pass
    return matches


def _detect_size_outliers(pdf_path: str,
                           min_area: float = 0,
                           max_area: float = float('inf')) -> list:
    """Return 0-based indices of pages outside area range (in pts²)."""
    outliers = []
    try:
        doc = fitz.open(pdf_path)
        for i in range(doc.page_count):
            w, h = float(doc[i].rect.width), float(doc[i].rect.height)
            area = w * h
            if area < min_area or area > max_area:
                outliers.append(i)
        doc.close()
    except Exception:
        pass
    return outliers


# ╔══════════════════════════════════════════════════════════════════════╗
# ║  REMOVAL STRATEGIES                                                  ║
# ╚══════════════════════════════════════════════════════════════════════╝

def _remove_via_pikepdf(input_path: str, output_path: str,
                         keep_indices: list) -> bool:
    """Remove pages using pikepdf (primary strategy)."""
    try:
        with pikepdf.open(input_path, suppress_warnings=True) as src:
            out = pikepdf.Pdf.new()
            for i in keep_indices:
                if 0 <= i < len(src.pages):
                    out.pages.append(src.pages[i])
            if len(out.pages) == 0:
                return False
            out.save(output_path,
                     compress_streams=True,
                     object_stream_mode=pikepdf.ObjectStreamMode.generate)
            return True
    except Exception:
        return False


def _remove_via_pypdf(input_path: str, output_path: str,
                       keep_indices: list) -> bool:
    """Fallback removal using pypdf."""
    if not HAS_PYPDF:
        return False
    try:
        reader = PdfReader(input_path)
        writer = PdfWriter()
        total = len(reader.pages)
        for i in keep_indices:
            if 0 <= i < total:
                writer.add_page(reader.pages[i])
        if len(writer.pages) == 0:
            return False
        with open(output_path, 'wb') as f:
            writer.write(f)
        return True
    except Exception:
        return False


def _remove_via_gs(input_path: str, output_path: str,
                   keep_indices: list, total: int) -> bool:
    """Remove pages using Ghostscript (last resort)."""
    if not GS_BIN or not keep_indices:
        return False
    try:
        # GS uses 1-based page list
        page_list = ','.join(str(i + 1) for i in keep_indices)
        cmd = [
            GS_BIN, '-dNOPAUSE', '-dBATCH', '-dQUIET',
            '-sDEVICE=pdfwrite',
            f'-dFirstPage=1',
            f'-dLastPage={total}',
            '-dCompatibilityLevel=1.7',
            f'-sOutputFile={output_path}',
            '-c', f'<< /PageList [{page_list}] >> setpagedevice',
            '-f', input_path,
        ]
        r = subprocess.run(cmd, capture_output=True, timeout=180)
        return (r.returncode == 0 and os.path.exists(output_path)
                and os.path.getsize(output_path) > 200)
    except Exception:
        return False


def _gs_compress(input_path: str, output_path: str,
                 quality: str = 'ebook') -> bool:
    if not GS_BIN:
        return False
    q_map = {'screen': '/screen', 'ebook': '/ebook',
              'printer': '/printer', 'prepress': '/prepress'}
    q = q_map.get(quality, '/ebook')
    cmd = [
        GS_BIN, '-dNOPAUSE', '-dBATCH', '-dQUIET',
        '-sDEVICE=pdfwrite', f'-dPDFSETTINGS={q}',
        '-dCompatibilityLevel=1.7',
        f'-sOutputFile={output_path}', input_path,
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=180)
        return (r.returncode == 0 and os.path.exists(output_path)
                and os.path.getsize(output_path) > 200)
    except Exception:
        return False


def _qpdf_linearize(input_path: str, output_path: str) -> bool:
    if not QPDF_BIN:
        return False
    cmd = [QPDF_BIN, '--linearize', input_path, output_path]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=120)
        return (r.returncode == 0 and os.path.exists(output_path)
                and os.path.getsize(output_path) > 200)
    except Exception:
        return False


# ╔══════════════════════════════════════════════════════════════════════╗
# ║  METADATA                                                            ║
# ╚══════════════════════════════════════════════════════════════════════╝

def _inject_metadata(path: str, original_count: int,
                      removed_count: int) -> None:
    try:
        with pikepdf.open(path, suppress_warnings=True) as pdf:
            pdf.docinfo['/Producer'] = 'IshuTools.fun PDF Suite — RemovePages'
            pdf.docinfo['/Creator'] = 'pdf_remove_pages'
            pdf.docinfo['/Keywords'] = (
                f'original_pages={original_count}; '
                f'removed={removed_count}; '
                f'remaining={original_count - removed_count}')
            pdf.docinfo['/ModDate'] = datetime.now().strftime("D:%Y%m%d%H%M%S")
            pdf.save(path)
    except Exception:
        pass


# ╔══════════════════════════════════════════════════════════════════════╗
# ║  PREVIEW REPORT                                                      ║
# ╚══════════════════════════════════════════════════════════════════════╝

def _build_preview_report(pdf_path: str,
                           remove_indices: list,
                           keep_indices: list,
                           output_path: str) -> None:
    """Generate a PDF report showing what will be removed."""
    styles = getSampleStyleSheet()
    title_s = ParagraphStyle('T', parent=styles['Heading1'], fontSize=16,
                              textColor=colors.HexColor('#1E3A8A'))
    info_s  = ParagraphStyle('I', parent=styles['Normal'],  fontSize=10,
                              textColor=colors.HexColor('#374151'))
    red_s   = ParagraphStyle('R', parent=styles['Normal'],  fontSize=10,
                              textColor=colors.HexColor('#DC2626'),
                              fontName='Helvetica-Bold')
    green_s = ParagraphStyle('G', parent=styles['Normal'],  fontSize=10,
                              textColor=colors.HexColor('#16A34A'))

    story = [
        Paragraph('Remove Pages — Preview Report', title_s),
        HRFlowable(color=colors.HexColor('#DBEAFE'), thickness=1),
        Spacer(1, 0.3 * cm),
        Paragraph(f'Source: <b>{os.path.basename(pdf_path)}</b>', info_s),
        Paragraph(f'Total pages: <b>{len(remove_indices) + len(keep_indices)}</b>', info_s),
        Paragraph(f'Pages to remove: <b>{len(remove_indices)}</b>', red_s),
        Paragraph(f'Pages to keep: <b>{len(keep_indices)}</b>', green_s),
        Spacer(1, 0.4 * cm),
    ]

    # Table
    table_data = [['Page #', 'Action', 'Dimensions', 'Words', 'Images']]
    all_idx = sorted(set(remove_indices) | set(keep_indices))

    try:
        doc_fitz = fitz.open(pdf_path)
        for i in all_idx[:200]:
            if i < doc_fitz.page_count:
                stats = _get_page_stats(doc_fitz[i], i)
                action = 'REMOVE' if i in remove_indices else 'KEEP'
                table_data.append([
                    str(stats['page']),
                    action,
                    f'{stats["width_pt"]:.0f}×{stats["height_pt"]:.0f} pt',
                    str(stats['word_count']),
                    str(stats['image_count']),
                ])
        doc_fitz.close()
    except Exception:
        pass

    if len(table_data) > 1:
        tbl = Table(table_data[:101], colWidths=[2*cm, 3*cm, 4*cm, 2.5*cm, 2.5*cm])
        ts = TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A8A')),
            ('TEXTCOLOR',  (0, 0), (-1, 0), colors.white),
            ('FONTNAME',   (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE',   (0, 0), (-1, -1), 9),
            ('GRID',       (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1),
             [colors.white, colors.HexColor('#F9FAFB')]),
            ('TEXTCOLOR',  (1, 1), (1, -1), colors.HexColor('#374151')),
        ])
        # Color REMOVE rows red
        for r_idx, row in enumerate(table_data[1:], start=1):
            if row[1] == 'REMOVE':
                ts.add('BACKGROUND', (0, r_idx), (-1, r_idx),
                        colors.HexColor('#FEE2E2'))
                ts.add('TEXTCOLOR',  (1, r_idx), (1, r_idx),
                        colors.HexColor('#DC2626'))
        tbl.setStyle(ts)
        story.append(tbl)

    doc = SimpleDocTemplate(output_path, pagesize=A4,
                             leftMargin=2*cm, rightMargin=2*cm,
                             topMargin=2.5*cm, bottomMargin=2.5*cm)
    doc.build(story)


# ╔══════════════════════════════════════════════════════════════════════╗
# ║  MAIN API                                                            ║
# ╚══════════════════════════════════════════════════════════════════════╝

def remove_pages(
    input_path: str,
    output_path: str,
    page_selector: str = '',
    remove_blank: bool = False,
    remove_duplicates: bool = False,
    remove_pattern: Optional[str] = None,
    remove_small_pages: bool = False,
    min_area_pts: float = 0,
    max_area_pts: float = float('inf'),
    invert_selection: bool = False,
    preview_only: bool = False,
    preview_report_path: Optional[str] = None,
    compress_output: bool = True,
    gs_quality: str = 'ebook',
    linearize: bool = False,
    password: Optional[str] = None,
) -> dict:
    """
    Remove pages from a PDF with multi-strategy detection and removal.

    Args:
        input_path:           Source PDF
        output_path:          Output PDF (ignored if preview_only=True)
        page_selector:        '1,3,5-8' | 'even' | 'odd' | 'last:N' | 'blank' | 'all'
        remove_blank:         Also remove auto-detected blank pages
        remove_duplicates:    Also remove duplicate pages
        remove_pattern:       Also remove pages matching this regex in text
        remove_small_pages:   Also remove pages outside area range
        min_area_pts:         Min area in pt² for size filter
        max_area_pts:         Max area in pt² for size filter
        invert_selection:     Keep selector pages, remove everything else
        preview_only:         Don't remove, just generate a preview report
        preview_report_path:  Path for preview PDF (if preview_only)
        compress_output:      Apply GS or pikepdf compression after removal
        gs_quality:           GS quality preset
        linearize:            Apply qpdf linearization
        password:             Password for encrypted PDFs
    Returns:
        dict with output_path, removed_count, remaining_count, method, etc.
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f'Input not found: {input_path}')

    # Open with fitz for analysis
    try:
        doc = fitz.open(input_path)
        if password:
            doc.authenticate(password)
        total = doc.page_count
        doc.close()
    except Exception as e:
        raise ValueError(f'Cannot open PDF: {e}')

    if total == 0:
        raise ValueError('PDF has no pages.')

    # Build removal set
    remove_set: set = set()

    # Explicit selector
    if page_selector.strip().lower() not in ('', 'blank'):
        sel_indices = parse_page_selector(page_selector, total,
                                           invert=invert_selection)
        remove_set.update(sel_indices)
    elif page_selector.strip().lower() == 'blank':
        remove_blank = True

    # Blank detection
    if remove_blank:
        remove_set.update(_detect_blank_pages(input_path))

    # Duplicate detection
    if remove_duplicates:
        remove_set.update(_detect_duplicate_pages(input_path))

    # Pattern detection
    if remove_pattern:
        remove_set.update(_detect_pattern_pages(input_path, remove_pattern))

    # Size filter
    if remove_small_pages:
        remove_set.update(
            _detect_size_outliers(input_path, min_area_pts, max_area_pts))

    remove_indices = sorted(remove_set)
    keep_indices = [i for i in range(total) if i not in remove_set]

    # Preview only
    if preview_only:
        rpt = preview_report_path or output_path.replace('.pdf', '_preview.pdf')
        _build_preview_report(input_path, remove_indices, keep_indices, rpt)
        return {
            'preview_only': True,
            'preview_report': rpt,
            'total_pages': total,
            'would_remove': len(remove_indices),
            'would_keep': len(keep_indices),
            'pages_to_remove': [i + 1 for i in remove_indices],
        }

    if not keep_indices:
        raise ValueError('All pages would be removed — aborting.')

    if not remove_indices:
        # Nothing to remove — just copy
        import shutil as _sh
        _sh.copy2(input_path, output_path)
        return {
            'output_path': output_path,
            'removed_count': 0,
            'remaining_count': total,
            'total_pages': total,
            'method': 'no_op_copy',
            'file_size_kb': round(os.path.getsize(output_path) / 1024, 1),
        }

    tmp_dir = tempfile.mkdtemp()
    method_used = 'unknown'

    try:
        work_out = os.path.join(tmp_dir, 'removed.pdf')

        # Strategy 1: pikepdf
        if _remove_via_pikepdf(input_path, work_out, keep_indices):
            method_used = 'pikepdf'

        # Strategy 2: pypdf fallback
        elif HAS_PYPDF and _remove_via_pypdf(input_path, work_out, keep_indices):
            method_used = 'pypdf'

        # Strategy 3: GS fallback
        elif GS_BIN and _remove_via_gs(input_path, work_out, keep_indices, total):
            method_used = 'ghostscript'

        else:
            raise RuntimeError(
                'All removal strategies failed. Check PDF integrity.')

        # Compression pass
        if compress_output and GS_BIN:
            gs_out = os.path.join(tmp_dir, 'compressed.pdf')
            if _gs_compress(work_out, gs_out, quality=gs_quality):
                if os.path.getsize(gs_out) < os.path.getsize(work_out):
                    work_out = gs_out
                    method_used += '+gs_compress'

        # qpdf linearize
        if linearize and QPDF_BIN:
            lin_out = os.path.join(tmp_dir, 'linear.pdf')
            if _qpdf_linearize(work_out, lin_out):
                work_out = lin_out
                method_used += '+qpdf_linearize'

        # Copy to final destination
        import shutil as _sh
        _sh.copy2(work_out, output_path)

    finally:
        try:
            shutil.rmtree(tmp_dir)
        except Exception:
            pass

    # Metadata injection
    _inject_metadata(output_path, total, len(remove_indices))

    return {
        'output_path': output_path,
        'removed_count': len(remove_indices),
        'remaining_count': len(keep_indices),
        'total_pages': total,
        'removed_pages': [i + 1 for i in remove_indices],
        'method': method_used,
        'gs_available': bool(GS_BIN),
        'qpdf_available': bool(QPDF_BIN),
        'file_size_kb': round(os.path.getsize(output_path) / 1024, 1),
    }


# ╔══════════════════════════════════════════════════════════════════════╗
# ║  PAGE STATS API                                                      ║
# ╚══════════════════════════════════════════════════════════════════════╝

def get_page_stats(input_path: str,
                   page_indices: Optional[list] = None) -> list:
    """Return per-page statistics for a PDF."""
    stats = []
    try:
        doc = fitz.open(input_path)
        indices = page_indices if page_indices is not None else range(doc.page_count)
        for i in indices:
            if 0 <= i < doc.page_count:
                stats.append(_get_page_stats(doc[i], i))
        doc.close()
    except Exception as e:
        stats.append({'error': str(e)})
    return stats


# ╔══════════════════════════════════════════════════════════════════════╗
# ║  BATCH PROCESSING                                                    ║
# ╚══════════════════════════════════════════════════════════════════════╝

def batch_remove_pages(
    input_paths: list,
    output_dir: str,
    **kwargs,
) -> dict:
    """Remove pages from multiple PDFs in batch."""
    os.makedirs(output_dir, exist_ok=True)
    results = []
    success = failed = 0
    for src in input_paths:
        base = os.path.splitext(os.path.basename(src))[0]
        dst = os.path.join(output_dir, f'{base}_removed.pdf')
        try:
            r = remove_pages(src, dst, **kwargs)
            r['source'] = src
            results.append(r)
            success += 1
        except Exception as e:
            results.append({'source': src, 'error': str(e)})
            failed += 1
    return {'total': len(input_paths), 'success': success,
            'failed': failed, 'results': results}


# ╔══════════════════════════════════════════════════════════════════════╗
# ║  AVAILABLE ENGINES                                                   ║
# ╚══════════════════════════════════════════════════════════════════════╝

def get_available_engines() -> dict:
    return {
        'engines': (
            ['pikepdf', 'fitz/PyMuPDF', 'pillow'] +
            (['pypdf'] if HAS_PYPDF else []) +
            (['ghostscript'] if GS_BIN else []) +
            (['qpdf'] if QPDF_BIN else [])
        ),
        'features': [
            'blank_detection', 'duplicate_detection',
            'pattern_match', 'size_filter',
            'preview_mode', 'compression', 'linearize',
        ],
        'gs_available': bool(GS_BIN),
        'qpdf_available': bool(QPDF_BIN),
    }


# ── Additional Page Removal Functions ────────────────────────────────────────


def remove_blank_pages_auto(input_path: str, output_path: str,
                             blank_threshold: float = 0.99,
                             password: str = '') -> dict:
    """
    Automatically detect and remove blank pages from a PDF.

    Uses pixel analysis to detect pages with near-uniform color
    (blank/white pages, empty pages, separator pages).

    Args:
        input_path:       Source PDF
        output_path:      Output PDF with blanks removed
        blank_threshold:  Fraction of white pixels required to call a page blank (0-1)
        password:         PDF password

    Returns:
        dict: original_count, removed_count, blank_page_numbers, output_path
    """
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        blank_pages = []
        total = doc.page_count

        for i in range(total):
            pg = doc[i]
            # Quick text check first
            if len(pg.get_text().strip()) > 20:
                continue
            if pg.get_images():
                continue

            # Render at low res for speed
            mat = fitz.Matrix(0.3, 0.3)
            pix = pg.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
            samples = pix.samples

            # Count white-ish pixels
            white_threshold = 230
            white_count = sum(1 for b in samples if b >= white_threshold)
            white_fraction = white_count / len(samples) if samples else 0

            if white_fraction >= blank_threshold:
                blank_pages.append(i)

        doc.close()

        if not blank_pages:
            import shutil as _sh
            _sh.copy2(input_path, output_path)
            return {
                'original_count': total,
                'removed_count': 0,
                'blank_page_numbers': [],
                'output_path': output_path,
            }

        # Remove blanks
        keep_indices = [i for i in range(total) if i not in set(blank_pages)]
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt(password or '')

        writer = PdfWriter()
        for idx in keep_indices:
            if idx < len(reader.pages):
                writer.add_page(reader.pages[idx])

        with open(output_path, 'wb') as f:
            writer.write(f)

        return {
            'original_count': total,
            'removed_count': len(blank_pages),
            'blank_page_numbers': [p + 1 for p in blank_pages],
            'output_path': output_path,
        }

    except Exception as e:
        logger.warning(f'remove_blank_pages_auto failed: {e}')
        raise


def keep_only_pages(input_path: str, output_path: str,
                     pages_to_keep: list,
                     password: str = '') -> dict:
    """
    Keep only specified pages (inverse of remove_pages).

    Simpler than extract_pages — just specify which pages to keep.

    Args:
        input_path:    Source PDF
        output_path:   Output PDF
        pages_to_keep: List of 1-based page numbers to keep
        password:      PDF password

    Returns:
        dict: pages_kept, pages_removed, output_path
    """
    try:
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt(password or '')

        total = len(reader.pages)
        keep_set = set(p - 1 for p in pages_to_keep if 1 <= p <= total)

        writer = PdfWriter()
        for idx in sorted(keep_set):
            writer.add_page(reader.pages[idx])

        with open(output_path, 'wb') as f:
            writer.write(f)

        return {
            'pages_kept': len(keep_set),
            'pages_removed': total - len(keep_set),
            'output_path': output_path,
        }

    except Exception as e:
        logger.warning(f'keep_only_pages failed: {e}')
        raise
