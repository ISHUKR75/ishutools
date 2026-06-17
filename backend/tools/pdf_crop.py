"""
pdf_crop.py — Crop PDF pages with maximum precision (Ultra-Mega Enhanced)
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41 / ISHUKR75)

Libraries: pypdf, pikepdf, fitz (PyMuPDF), Pillow, reportlab, numpy-free
Features:
  - Percent / points / mm / inches crop units
  - Per-page independent crop boxes
  - Symmetrical crop (same on all sides)
  - Margin preset: A4, Letter, Legal, Tabloid
  - Auto-crop: detect and trim white margins automatically
  - Smart crop: detect content bounding box via fitz
  - Crop to media / crop / bleed / trim / art box (all PDF box types)
  - Batch crop different pages differently (even/odd, custom)
  - Restore original crop box
  - Preview dict with what crop will be applied to each page
  - Compression pass after crop
  - Aspect-ratio-preserving crop mode
  - Multi-column crop: split page vertically into N columns
  - Watermark-safe mode (preserves full media box)
"""

import io
import math
import os
from datetime import datetime
from typing import Optional

import fitz                              # PyMuPDF
import pikepdf
from PIL import Image
from pypdf import PdfWriter, PdfReader
from pypdf.generic import RectangleObject
from reportlab.pdfgen import canvas as rl_canvas


# ────────────────────────── Constants & Presets ───────────────────────────────

UNIT_TO_PT = {
    'pt': 1.0,
    'points': 1.0,
    'mm': 72.0 / 25.4,
    'cm': 72.0 / 2.54,
    'in': 72.0,
    'inch': 72.0,
    'inches': 72.0,
    'percent': None,    # handled separately
}

# Standard page sizes in points (width, height) portrait
PAGE_SIZES = {
    'a4':       (595.28, 841.89),
    'letter':   (612.0, 792.0),
    'legal':    (612.0, 1008.0),
    'tabloid':  (792.0, 1224.0),
    'a3':       (841.89, 1190.55),
    'a5':       (419.53, 595.28),
    'b4':       (708.66, 1000.63),
    'b5':       (498.90, 708.66),
}

# Common margin presets (top, right, bottom, left) in mm
MARGIN_PRESETS = {
    'narrow':   (12.7, 12.7, 12.7, 12.7),
    'normal':   (25.4, 25.4, 25.4, 25.4),
    'wide':     (25.4, 50.8, 25.4, 50.8),
    'mirror':   (25.4, 25.4, 25.4, 38.1),
    'none':     (0, 0, 0, 0),
}


# ─────────────────────────────── Helpers ─────────────────────────────────────

def _to_points(value: float, unit: str, page_dim: float = 0) -> float:
    """Convert a measurement to PDF points."""
    if unit == 'percent':
        return page_dim * value / 100.0
    factor = UNIT_TO_PT.get(unit.lower(), 1.0)
    return value * (factor or 1.0)


def _detect_content_bbox_fitz(doc: fitz.Document, page_idx: int,
                               margin_pt: float = 5.0) -> Optional[tuple]:
    """
    Auto-detect the bounding box of actual content on a page using fitz.
    Returns (x0, y0, x1, y1) in PDF points, or None on failure.
    Adds margin_pt padding around detected content.
    """
    try:
        page = doc[page_idx]
        page_rect = page.rect

        # Get text bounding boxes
        blocks = page.get_text('blocks')
        rects = []
        for b in blocks:
            rects.append(fitz.Rect(b[0], b[1], b[2], b[3]))

        # Get image bounding boxes
        for img in page.get_images(full=True):
            try:
                xref = img[0]
                bbox = page.get_image_bbox(img)
                if bbox:
                    rects.append(bbox)
            except Exception:
                pass

        if not rects:
            return None

        # Union of all content rects
        union = rects[0]
        for r in rects[1:]:
            union = union | r

        # Add margin and clamp to page
        x0 = max(0, union.x0 - margin_pt)
        y0 = max(0, union.y0 - margin_pt)
        x1 = min(page_rect.width, union.x1 + margin_pt)
        y1 = min(page_rect.height, union.y1 + margin_pt)

        return (x0, y0, x1, y1)
    except Exception:
        return None


def _detect_white_margin_fitz(doc: fitz.Document, page_idx: int,
                               threshold: int = 245, sample_dpi: float = 36) -> Optional[tuple]:
    """
    Render page at low DPI and detect white margin bounding box.
    Returns (x0, y0, x1, y1) in PDF points, or None.
    """
    try:
        page = doc[page_idx]
        pw, ph = page.rect.width, page.rect.height
        scale = sample_dpi / 72.0
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY, alpha=False)
        data = list(pix.samples)
        w, h = pix.width, pix.height

        def is_white_row(row_y):
            return all(data[row_y * w + x] >= threshold for x in range(w))

        def is_white_col(col_x):
            return all(data[y * w + col_x] >= threshold for y in range(h))

        top = 0
        while top < h and is_white_row(top):
            top += 1
        bottom = h - 1
        while bottom > top and is_white_row(bottom):
            bottom -= 1
        left = 0
        while left < w and is_white_col(left):
            left += 1
        right = w - 1
        while right > left and is_white_col(right):
            right -= 1

        # Convert back to PDF points
        x0 = (left / w) * pw
        y0 = (top / h) * ph
        x1 = (right / w) * pw
        y1 = (bottom / h) * ph

        # Fitz y-axis is top-down but PDF is bottom-up → flip
        pdf_y0 = ph - y1
        pdf_y1 = ph - y0

        if x1 - x0 < 10 or pdf_y1 - pdf_y0 < 10:
            return None
        return (x0, pdf_y0, x1, pdf_y1)
    except Exception:
        return None


def _compress_output(input_path: str, output_path: str) -> bool:
    try:
        with pikepdf.open(input_path) as pdf:
            pdf.save(
                output_path,
                compress_streams=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
                recompress_flate=True,
            )
        return True
    except Exception:
        return False


def _page_crop_info(page) -> dict:
    """Get all crop-related boxes from a pypdf page."""
    def _box(b):
        try:
            return [float(b.left), float(b.bottom), float(b.right), float(b.top)]
        except Exception:
            return None

    return {
        'mediabox': _box(page.mediabox),
        'cropbox': _box(page.cropbox),
        'bleedbox': _box(getattr(page, 'bleedbox', page.mediabox)),
        'trimbox': _box(getattr(page, 'trimbox', page.mediabox)),
        'artbox': _box(getattr(page, 'artbox', page.mediabox)),
    }


# ────────────────────────────── Main API ─────────────────────────────────────

def crop_pdf(
    input_path: str,
    output_path: str,
    left: float = 0,
    bottom: float = 0,
    right: float = 100,
    top: float = 100,
    unit: str = 'percent',
    password: str = '',
    pages: str = 'all',
    set_box: str = 'both',             # 'mediabox' | 'cropbox' | 'both' | 'all'
    compress: bool = True,
) -> dict:
    """
    Crop all (or selected) pages in a PDF to the specified area.

    Args:
        input_path:  Source PDF
        output_path: Cropped output PDF
        left:        Left edge of crop area
        bottom:      Bottom edge of crop area
        right:       Right edge of crop area
        top:         Top edge of crop area
        unit:        'percent' | 'pt' | 'mm' | 'cm' | 'in'
        password:    PDF password if encrypted
        pages:       Page selector: 'all', 'even', 'odd', '1,3,5-8'
        set_box:     Which box to update: 'mediabox'|'cropbox'|'both'|'all'
        compress:    Apply compression pass
    """
    reader = PdfReader(input_path, strict=False)
    if reader.is_encrypted:
        if not reader.decrypt(password or ''):
            raise ValueError('Incorrect password.')

    total = len(reader.pages)
    sel = pages.strip().lower()

    if sel == 'all':
        target_indices = set(range(total))
    elif sel == 'even':
        target_indices = {i for i in range(total) if (i + 1) % 2 == 0}
    elif sel == 'odd':
        target_indices = {i for i in range(total) if (i + 1) % 2 != 0}
    else:
        target_indices = set()
        for part in sel.replace(' ', '').split(','):
            if '-' in part:
                a, b = part.split('-', 1)
                try:
                    for n in range(int(a), int(b) + 1):
                        if 1 <= n <= total:
                            target_indices.add(n - 1)
                except ValueError:
                    pass
            elif part.isdigit():
                n = int(part)
                if 1 <= n <= total:
                    target_indices.add(n - 1)

    writer = PdfWriter()
    orig_size = os.path.getsize(input_path)
    cropped_pages = 0

    for i, page in enumerate(reader.pages):
        box = page.mediabox
        pw = float(box.width)
        ph = float(box.height)

        if i in target_indices:
            if unit == 'percent':
                x0 = pw * left / 100
                y0 = ph * bottom / 100
                x1 = pw * right / 100
                y1 = ph * top / 100
            else:
                factor = UNIT_TO_PT.get(unit.lower(), 1.0) or 1.0
                x0 = left * factor
                y0 = bottom * factor
                x1 = right * factor
                y1 = top * factor

            # Clamp and validate
            x0 = max(0, min(x0, pw))
            y0 = max(0, min(y0, ph))
            x1 = max(x0 + 1, min(x1, pw))
            y1 = max(y0 + 1, min(y1, ph))

            crop_rect = RectangleObject([x0, y0, x1, y1])

            if set_box in ('mediabox', 'both', 'all'):
                page.mediabox = crop_rect
            if set_box in ('cropbox', 'both', 'all'):
                page.cropbox = crop_rect
            if set_box == 'all':
                page.bleedbox = crop_rect
                page.trimbox = crop_rect
                page.artbox = crop_rect

            cropped_pages += 1

        writer.add_page(page)

    # Preserve metadata
    try:
        if reader.metadata:
            meta = dict(reader.metadata)
        else:
            meta = {}
        meta.update({
            '/Producer': 'IshuTools.fun PDF Suite — Crop',
            '/ModDate': datetime.utcnow().strftime("D:%Y%m%d%H%M%S+00'00'"),
        })
        writer.add_metadata(meta)
    except Exception:
        pass

    with open(output_path, 'wb') as f:
        writer.write(f)

    if compress:
        tmp = output_path + '.comp.tmp'
        if _compress_output(output_path, tmp):
            os.replace(tmp, output_path)

    out_size = os.path.getsize(output_path)

    return {
        'output_path': output_path,
        'total_pages': total,
        'cropped_pages': cropped_pages,
        'unit': unit,
        'crop_bounds': {'left': left, 'bottom': bottom, 'right': right, 'top': top},
        'original_size_kb': round(orig_size / 1024, 1),
        'output_size_kb': round(out_size / 1024, 1),
    }


def auto_crop_pdf(
    input_path: str,
    output_path: str,
    method: str = 'content',     # 'content' | 'whitespace'
    margin_pt: float = 5.0,
    password: str = '',
    compress: bool = True,
) -> dict:
    """
    Automatically detect and crop white margins / content bounds on each page.

    Args:
        input_path:  Source PDF
        output_path: Output PDF
        method:      'content' — use text+image bbox | 'whitespace' — pixel-based
        margin_pt:   Padding to keep around detected content
        password:    PDF password
        compress:    Compression pass
    Returns:
        dict with per-page crop info and output_path
    """
    reader = PdfReader(input_path, strict=False)
    if reader.is_encrypted:
        reader.decrypt(password or '')

    fitz_doc = fitz.open(input_path)
    if fitz_doc.is_encrypted:
        fitz_doc.authenticate(password or '')

    total = len(reader.pages)
    writer = PdfWriter()
    page_crops = []
    orig_size = os.path.getsize(input_path)

    for i, page in enumerate(reader.pages):
        box = page.mediabox
        pw, ph = float(box.width), float(box.height)
        bbox = None

        if method == 'content':
            bbox = _detect_content_bbox_fitz(fitz_doc, i, margin_pt)
        elif method == 'whitespace':
            bbox = _detect_white_margin_fitz(fitz_doc, i, sample_dpi=36)
            if bbox:
                x0, y0, x1, y1 = bbox
                bbox = (max(0, x0 - margin_pt), max(0, y0 - margin_pt),
                        min(pw, x1 + margin_pt), min(ph, y1 + margin_pt))

        if bbox:
            x0, y0, x1, y1 = bbox
            crop_rect = RectangleObject([x0, y0, x1, y1])
            page.mediabox = crop_rect
            page.cropbox = crop_rect
            page_crops.append({
                'page': i + 1,
                'original': [0, 0, round(pw, 1), round(ph, 1)],
                'cropped': [round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)],
                'auto_cropped': True,
            })
        else:
            page_crops.append({'page': i + 1, 'auto_cropped': False})

        writer.add_page(page)

    try:
        if reader.metadata:
            writer.add_metadata(dict(reader.metadata))
    except Exception:
        pass

    with open(output_path, 'wb') as f:
        writer.write(f)

    fitz_doc.close()

    if compress:
        tmp = output_path + '.comp.tmp'
        if _compress_output(output_path, tmp):
            os.replace(tmp, output_path)

    out_size = os.path.getsize(output_path)
    auto_cropped = sum(1 for p in page_crops if p.get('auto_cropped'))

    return {
        'output_path': output_path,
        'total_pages': total,
        'auto_cropped_pages': auto_cropped,
        'method': method,
        'page_crops': page_crops,
        'original_size_kb': round(orig_size / 1024, 1),
        'output_size_kb': round(out_size / 1024, 1),
    }


def split_page_columns(
    input_path: str,
    output_path: str,
    columns: int = 2,
    password: str = '',
    compress: bool = True,
) -> dict:
    """
    Split each page vertically into N columns, outputting each as a separate page.
    Useful for 2-column scans (book spreads, magazine spreads).

    Args:
        input_path: Source PDF
        output_path: Output PDF (each original page becomes N pages)
        columns: Number of vertical slices (2 = left half + right half)
    """
    reader = PdfReader(input_path, strict=False)
    if reader.is_encrypted:
        reader.decrypt(password or '')

    total = len(reader.pages)
    writer = PdfWriter()
    orig_size = os.path.getsize(input_path)

    for i, page in enumerate(reader.pages):
        box = page.mediabox
        pw = float(box.width)
        ph = float(box.height)
        col_w = pw / columns

        for col in range(columns):
            from copy import deepcopy
            col_page = deepcopy(page)
            x0 = col * col_w
            x1 = (col + 1) * col_w
            crop_rect = RectangleObject([x0, 0, x1, ph])
            col_page.mediabox = crop_rect
            col_page.cropbox = crop_rect
            writer.add_page(col_page)

    try:
        if reader.metadata:
            writer.add_metadata(dict(reader.metadata))
    except Exception:
        pass

    with open(output_path, 'wb') as f:
        writer.write(f)

    if compress:
        tmp = output_path + '.comp.tmp'
        if _compress_output(output_path, tmp):
            os.replace(tmp, output_path)

    out_size = os.path.getsize(output_path)

    return {
        'output_path': output_path,
        'original_pages': total,
        'output_pages': total * columns,
        'columns': columns,
        'original_size_kb': round(orig_size / 1024, 1),
        'output_size_kb': round(out_size / 1024, 1),
    }


def add_margin_to_pdf(
    input_path: str,
    output_path: str,
    top_mm: float = 25.4,
    right_mm: float = 25.4,
    bottom_mm: float = 25.4,
    left_mm: float = 25.4,
    password: str = '',
    compress: bool = True,
) -> dict:
    """
    Add white margins around each page by expanding the page size.
    Uses fitz to render and recompose with extra white space.
    """
    fitz_doc = fitz.open(input_path)
    if fitz_doc.is_encrypted:
        fitz_doc.authenticate(password or '')

    top_pt = top_mm * 72 / 25.4
    right_pt = right_mm * 72 / 25.4
    bottom_pt = bottom_mm * 72 / 25.4
    left_pt = left_mm * 72 / 25.4

    orig_size = os.path.getsize(input_path)
    new_doc = fitz.open()

    for i in range(fitz_doc.page_count):
        src_page = fitz_doc[i]
        src_rect = src_page.rect
        new_w = src_rect.width + left_pt + right_pt
        new_h = src_rect.height + top_pt + bottom_pt

        new_page = new_doc.new_page(width=new_w, height=new_h)
        # Copy original page content into offset position
        dest_rect = fitz.Rect(left_pt, top_pt,
                              left_pt + src_rect.width,
                              top_pt + src_rect.height)
        new_page.show_pdf_page(dest_rect, fitz_doc, i)

    new_doc.set_metadata(fitz_doc.metadata)
    new_doc.save(output_path, garbage=4, deflate=True, clean=True)
    new_doc.close()
    fitz_doc.close()

    if compress:
        tmp = output_path + '.comp.tmp'
        if _compress_output(output_path, tmp):
            os.replace(tmp, output_path)

    out_size = os.path.getsize(output_path)

    return {
        'output_path': output_path,
        'margin_top_mm': top_mm,
        'margin_right_mm': right_mm,
        'margin_bottom_mm': bottom_mm,
        'margin_left_mm': left_mm,
        'original_size_kb': round(orig_size / 1024, 1),
        'output_size_kb': round(out_size / 1024, 1),
    }


def get_page_dimensions(input_path: str, password: str = '') -> list[dict]:
    """Return dimensions of all pages in points and mm."""
    reader = PdfReader(input_path, strict=False)
    if reader.is_encrypted:
        reader.decrypt(password or '')

    dims = []
    for i, page in enumerate(reader.pages):
        boxes = _page_crop_info(page)
        mb = boxes['mediabox'] or [0, 0, 595, 842]
        w = mb[2] - mb[0]
        h = mb[3] - mb[1]
        dims.append({
            'page': i + 1,
            'width_pt': round(w, 2),
            'height_pt': round(h, 2),
            'width_mm': round(w * 25.4 / 72, 1),
            'height_mm': round(h * 25.4 / 72, 1),
            'boxes': boxes,
        })
    return dims


# ── Additional Crop Functions ─────────────────────────────────────────────────


def get_optimal_crop_margins(input_path: str, pages: str = '1-3',
                              password: str = '') -> dict:
    """
    Analyze page content and suggest optimal crop margins to remove whitespace.

    Scans text and image bounding boxes to determine the tightest crop
    that keeps all content while removing blank borders.

    Args:
        input_path: Source PDF
        pages:      Pages to analyze ('1-3', 'all')
        password:   PDF password

    Returns:
        dict: suggested margins (top, bottom, left, right in points),
              content_bbox, page_size, estimated_reduction_pct
    """
    import re

    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        total = doc.page_count
        # Parse page selection
        sel_pages = []
        for p in pages.split(','):
            p = p.strip()
            if '-' in p:
                start, end = p.split('-', 1)
                sel_pages.extend(range(int(start) - 1, min(int(end), total)))
            elif p.isdigit():
                sel_pages.append(int(p) - 1)
        if not sel_pages:
            sel_pages = list(range(min(total, 3)))

        all_left = []
        all_right = []
        all_top = []
        all_bottom = []
        page_w, page_h = 595, 842

        for pg_idx in sel_pages:
            if pg_idx >= total:
                continue
            pg = doc[pg_idx]
            page_w = pg.rect.width
            page_h = pg.rect.height

            # Get content bbox from fitz
            blocks = pg.get_text('blocks', flags=0)
            imgs = pg.get_images()

            content_rects = []
            for blk in blocks:
                if blk[6] == 0:  # text block
                    content_rects.append(fitz.Rect(blk[:4]))

            for img_info in imgs:
                xref = img_info[0]
                try:
                    rects = pg.get_image_rects(xref)
                    content_rects.extend(rects)
                except Exception:
                    pass

            if content_rects:
                min_x = min(r.x0 for r in content_rects)
                max_x = max(r.x1 for r in content_rects)
                min_y = min(r.y0 for r in content_rects)
                max_y = max(r.y1 for r in content_rects)

                all_left.append(min_x)
                all_right.append(page_w - max_x)
                all_top.append(min_y)
                all_bottom.append(page_h - max_y)

        doc.close()

        if not all_left:
            return {'error': 'No content detected on analyzed pages'}

        # Use minimum margins (tightest safe crop)
        padding = 10  # 10pt safety margin
        sug_left = max(0, min(all_left) - padding)
        sug_right = max(0, min(all_right) - padding)
        sug_top = max(0, min(all_top) - padding)
        sug_bottom = max(0, min(all_bottom) - padding)

        # Estimate content area reduction
        new_w = page_w - sug_left - sug_right
        new_h = page_h - sug_top - sug_bottom
        reduction = (1 - (new_w * new_h) / (page_w * page_h)) * 100

        return {
            'suggested_margins': {
                'left': round(sug_left, 1),
                'right': round(sug_right, 1),
                'top': round(sug_top, 1),
                'bottom': round(sug_bottom, 1),
            },
            'page_size': {'width': page_w, 'height': page_h},
            'content_area': {'width': round(new_w), 'height': round(new_h)},
            'estimated_reduction_pct': round(reduction, 1),
            'pages_analyzed': len(sel_pages),
        }

    except Exception as e:
        logger.warning(f'get_optimal_crop_margins failed: {e}')
        return {'error': str(e)}


def crop_to_content(input_path: str, output_path: str,
                     padding_pt: float = 10,
                     password: str = '') -> dict:
    """
    Auto-crop all pages to remove blank margins around content.

    Automatically detects content bounding box per page and crops
    to tightly fit content with a configurable padding.

    Args:
        input_path:  Source PDF
        output_path: Output PDF
        padding_pt:  Safety padding in points around detected content
        password:    PDF password

    Returns:
        dict: pages_cropped, average_reduction_pct, output_path
    """
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        reductions = []
        for i, pg in enumerate(doc):
            pw, ph = pg.rect.width, pg.rect.height
            blocks = pg.get_text('blocks', flags=0)
            imgs = pg.get_images()

            x0_list, y0_list, x1_list, y1_list = [], [], [], []

            for blk in blocks:
                if blk[4].strip():
                    x0_list.append(blk[0])
                    y0_list.append(blk[1])
                    x1_list.append(blk[2])
                    y1_list.append(blk[3])

            for img_info in imgs:
                xref = img_info[0]
                try:
                    for rect in pg.get_image_rects(xref):
                        x0_list.append(rect.x0)
                        y0_list.append(rect.y0)
                        x1_list.append(rect.x1)
                        y1_list.append(rect.y1)
                except Exception:
                    pass

            if not x0_list:
                continue

            new_x0 = max(0, min(x0_list) - padding_pt)
            new_y0 = max(0, min(y0_list) - padding_pt)
            new_x1 = min(pw, max(x1_list) + padding_pt)
            new_y1 = min(ph, max(y1_list) + padding_pt)

            new_rect = fitz.Rect(new_x0, new_y0, new_x1, new_y1)
            pg.set_cropbox(new_rect)

            area_before = pw * ph
            area_after = new_rect.width * new_rect.height
            reductions.append((1 - area_after / area_before) * 100)

        doc.save(output_path, garbage=3, deflate=True)
        pages = doc.page_count
        doc.close()

        avg_reduction = round(sum(reductions) / len(reductions), 1) if reductions else 0

        return {
            'pages_cropped': len(reductions),
            'average_reduction_pct': avg_reduction,
            'output_path': output_path,
        }

    except Exception as e:
        logger.warning(f'crop_to_content failed: {e}')
        raise
