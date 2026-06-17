"""
pdf_edit.py - Enterprise PDF Annotation & Editing Suite (Ultra-Enhanced v2.0)
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41 / ISHUKR75)

Libraries: fitz (PyMuPDF) · pypdf · reportlab · pikepdf · Pillow

Actions supported:
  Annotation layer (reversible):
    add_text        — Free-text annotation with background fill
    highlight       — Yellow highlight over found text
    underline       — Underline found text
    strikethrough   — Strikethrough found text
    squiggly        — Squiggly underline found text
    note            — Sticky-note popup at point
    rectangle       — Rectangular border annotation
    circle          — Circle / ellipse annotation
    line            — Line between two points
    arrow           — Arrow line (open-arrow head)
    polygon         — Closed polygon annotation
    ink             — Freehand ink path
    stamp           — Named rubber stamp (20 stamp types)
    insert_image    — Insert image at position (from file or bytes)

  Content layer (permanent / burned-in):
    add_label       — Burn text directly into page content
    whiteout        — Cover area with white (redact-lite)
    burn_text       — High-quality text insertion (ReportLab overlay)
    page_header     — Add running header to all pages
    page_footer     — Add running footer to all pages

  Utility:
    flatten         — Bake all annotations into page content
    remove_annots   — Delete all annotations from specified pages

Extra utilities:
  get_annotations()       — List all annotations in the PDF
  remove_all_annotations() — Remove every annotation
  add_text_to_all_pages() — Burn text on every page (watermark-like)
  merge_annotation_layer() — Copy annots from one PDF to another
  get_page_text_positions() — Get text with bounding boxes (for smart highlighting)
"""

import io
import os
import math
import tempfile
import logging
from datetime import datetime, timezone
from typing import Optional, List, Tuple, Union

import fitz
import pikepdf
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.lib.units import cm
from PIL import Image

logger = logging.getLogger(__name__)

# ── Color helpers ─────────────────────────────────────────────────────────────

def _hex_to_rgb(hex_color: str) -> Tuple[float, float, float]:
    h = hex_color.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    if len(h) != 6:
        return (0.0, 0.0, 0.0)
    try:
        return (int(h[0:2], 16) / 255,
                int(h[2:4], 16) / 255,
                int(h[4:6], 16) / 255)
    except ValueError:
        return (0.0, 0.0, 0.0)


def _rgb_to_hex(r: float, g: float, b: float) -> str:
    return '#{:02x}{:02x}{:02x}'.format(
        int(r * 255), int(g * 255), int(b * 255))


# ── Named rubber stamps (20 types) ───────────────────────────────────────────

STAMP_TEXTS = {
    'approved':      ('APPROVED',      '#15803D', '#DCFCE7', '#15803D'),
    'rejected':      ('REJECTED',      '#DC2626', '#FEE2E2', '#DC2626'),
    'draft':         ('DRAFT',         '#B45309', '#FEF3C7', '#B45309'),
    'confidential':  ('CONFIDENTIAL',  '#7C3AED', '#EDE9FE', '#7C3AED'),
    'void':          ('VOID',          '#DC2626', '#FFF1F2', '#DC2626'),
    'reviewed':      ('REVIEWED',      '#1D4ED8', '#DBEAFE', '#1D4ED8'),
    'paid':          ('PAID',          '#15803D', '#DCFCE7', '#15803D'),
    'sample':        ('SAMPLE',        '#6B7280', '#F9FAFB', '#6B7280'),
    'original':      ('ORIGINAL',      '#1D4ED8', '#EFF6FF', '#1D4ED8'),
    'copy':          ('COPY',          '#92400E', '#FEF3C7', '#92400E'),
    'not_approved':  ('NOT APPROVED',  '#DC2626', '#FEE2E2', '#DC2626'),
    'for_review':    ('FOR REVIEW',    '#D97706', '#FEF3C7', '#D97706'),
    'final':         ('FINAL',         '#15803D', '#DCFCE7', '#15803D'),
    'pending':       ('PENDING',       '#6366F1', '#EEF2FF', '#6366F1'),
    'urgent':        ('URGENT',        '#DC2626', '#FEF2F2', '#DC2626'),
    'classified':    ('CLASSIFIED',    '#1E293B', '#F8FAFC', '#1E293B'),
    'do_not_copy':   ('DO NOT COPY',   '#DC2626', '#FFF1F2', '#DC2626'),
    'verified':      ('VERIFIED',      '#15803D', '#F0FDF4', '#15803D'),
    'incomplete':    ('INCOMPLETE',    '#D97706', '#FFFBEB', '#D97706'),
    'top_secret':    ('TOP SECRET',    '#DC2626', '#111827', '#DC2626'),
}


# ── Page range parser ─────────────────────────────────────────────────────────

def _parse_page_range(page_str: str, total: int) -> List[int]:
    """Parse '1,3,5-8,all' to 0-based indices."""
    if not page_str or page_str.strip().lower() == 'all':
        return list(range(total))
    indices = set()
    for part in page_str.replace(' ', '').split(','):
        if '-' in part:
            try:
                a, b = part.split('-', 1)
                for n in range(int(a) - 1, int(b)):
                    if 0 <= n < total:
                        indices.add(n)
            except ValueError:
                pass
        elif part.isdigit():
            n = int(part) - 1
            if 0 <= n < total:
                indices.add(n)
    return sorted(indices)


# ── ReportLab overlay helper ──────────────────────────────────────────────────

def _make_overlay_pdf(page_width: float, page_height: float,
                      draw_func) -> bytes:
    """
    Create a minimal single-page PDF overlay using ReportLab.
    draw_func(c, w, h) receives the canvas and page dimensions.
    Returns bytes of the PDF.
    """
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(page_width, page_height))
    draw_func(c, page_width, page_height)
    c.save()
    return buf.getvalue()


def _merge_overlay(base_doc: fitz.Document, page_idx: int,
                   overlay_bytes: bytes, over: bool = True) -> None:
    """Merge a single-page overlay PDF onto page page_idx of base_doc."""
    overlay_doc = fitz.open('pdf', overlay_bytes)
    overlay_page = overlay_doc[0]
    base_page = base_doc[page_idx]
    base_page.show_pdf_page(
        base_page.rect, overlay_doc, 0,
        overlay=over,
    )
    overlay_doc.close()


# ── Main edit function ────────────────────────────────────────────────────────

def edit_pdf(
    input_path:    str,
    output_path:   str,
    action:        str   = 'add_text',
    text:          str   = '',
    page_num:      int   = 1,
    page_range:    str   = '',
    x:             float = 100.0,
    y:             float = 100.0,
    x2:            float = 300.0,
    y2:            float = 200.0,
    font_size:     int   = 14,
    color:         str   = '#000000',
    fill_color:    str   = '#FFFF88',
    line_width:    float = 1.5,
    opacity:       float = 1.0,
    stamp_type:    str   = 'approved',
    image_path:    str   = None,
    image_bytes:   bytes = None,
    flatten:       bool  = False,
    password:      str   = '',
    rotation:      float = 0.0,
    font_name:     str   = 'helv',
    bold:          bool  = False,
    align:         str   = 'left',
) -> str:
    """
    Edit a PDF: add annotations, shapes, stamps, burn-in text, headers/footers.

    Args:
        input_path:  Source PDF path
        output_path: Output PDF path
        action:      See module docstring for full list
        text:        Text content / search term
        page_num:    1-based page number (used if page_range is empty)
        page_range:  '1,3,5-8' or 'all' — applies action to multiple pages
        x, y:        Top-left position (points from top-left corner)
        x2, y2:      Bottom-right position (for shapes/lines)
        font_size:   Font size for text actions
        color:       Stroke / text hex color
        fill_color:  Fill hex color for shapes / highlight
        line_width:  Line width for shapes
        opacity:     Annotation opacity (0.0–1.0)
        stamp_type:  Named stamp type (see STAMP_TEXTS)
        image_path:  Path to image for 'insert_image' action
        image_bytes: Raw image bytes (alternative to image_path)
        flatten:     Bake all annotations into page content after editing
        password:    PDF password if encrypted
        rotation:    Text rotation angle (degrees, for burn_text)
        font_name:   Font name for text (helv, tiro, cour, etc.)
        bold:        Bold text for burn_text / add_label
        align:       Text alignment: left / center / right
    Returns:
        output_path on success
    """
    doc = fitz.open(input_path)
    if doc.is_encrypted:
        doc.authenticate(password or '')

    total = doc.page_count
    rgb      = _hex_to_rgb(color)
    fill_rgb = _hex_to_rgb(fill_color)

    # Determine target pages
    if page_range:
        target_pages = _parse_page_range(page_range, total)
    else:
        idx = max(0, min(page_num - 1, total - 1))
        target_pages = [idx]

    for pg_idx in target_pages:
        page = doc[pg_idx]

        # ── add_text: Free text annotation ────────────────────────────────────
        if action == 'add_text':
            rect = fitz.Rect(x, y,
                             max(x2, x + max(200, len(text or '') * 7)),
                             max(y2, y + font_size * 2 + 10))
            annot = page.add_freetext_annot(
                rect, text or 'Annotation',
                fontsize=font_size, fontname=font_name,
                text_color=rgb, fill_color=fill_rgb,
            )
            annot.set_opacity(opacity)
            annot.update()

        # ── highlight ──────────────────────────────────────────────────────────
        elif action == 'highlight':
            areas = page.search_for(text or '')
            for rect in areas[:50]:  # max 50 highlights per page
                annot = page.add_highlight_annot(rect)
                annot.set_colors(stroke=fill_rgb)
                annot.set_opacity(opacity)
                annot.update()

        # ── underline ─────────────────────────────────────────────────────────
        elif action == 'underline':
            areas = page.search_for(text or '')
            for rect in areas[:50]:
                annot = page.add_underline_annot(rect)
                annot.set_colors(stroke=rgb)
                annot.set_opacity(opacity)
                annot.update()

        # ── strikethrough ─────────────────────────────────────────────────────
        elif action == 'strikethrough':
            areas = page.search_for(text or '')
            for rect in areas[:50]:
                annot = page.add_strikeout_annot(rect)
                annot.set_colors(stroke=rgb)
                annot.set_opacity(opacity)
                annot.update()

        # ── squiggly ──────────────────────────────────────────────────────────
        elif action == 'squiggly':
            areas = page.search_for(text or '')
            for rect in areas[:50]:
                annot = page.add_squiggly_annot(rect)
                annot.set_colors(stroke=rgb)
                annot.set_opacity(opacity)
                annot.update()

        # ── note: Sticky note ─────────────────────────────────────────────────
        elif action == 'note':
            point = fitz.Point(x, y)
            annot = page.add_text_annot(point, text or 'Note', icon='Note')
            annot.set_colors(stroke=rgb, fill=fill_rgb)
            annot.set_opacity(opacity)
            ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
            annot.set_info(title='IshuTools', content=text or 'Note',
                           creationDate=ts)
            annot.update()

        # ── rectangle ─────────────────────────────────────────────────────────
        elif action == 'rectangle':
            rect = fitz.Rect(x, y, x2, y2)
            annot = page.add_rect_annot(rect)
            annot.set_colors(stroke=rgb, fill=fill_rgb)
            annot.set_border(width=line_width)
            annot.set_opacity(opacity)
            annot.update()

        # ── circle ────────────────────────────────────────────────────────────
        elif action == 'circle':
            rect = fitz.Rect(x, y, x2, y2)
            annot = page.add_circle_annot(rect)
            annot.set_colors(stroke=rgb, fill=fill_rgb)
            annot.set_border(width=line_width)
            annot.set_opacity(opacity)
            annot.update()

        # ── line ──────────────────────────────────────────────────────────────
        elif action == 'line':
            annot = page.add_line_annot(fitz.Point(x, y),
                                         fitz.Point(x2, y2))
            annot.set_colors(stroke=rgb)
            annot.set_border(width=line_width)
            annot.set_opacity(opacity)
            annot.update()

        # ── arrow ─────────────────────────────────────────────────────────────
        elif action == 'arrow':
            annot = page.add_line_annot(fitz.Point(x, y),
                                         fitz.Point(x2, y2))
            annot.set_colors(stroke=rgb)
            annot.set_border(width=line_width)
            annot.set_line_ends(fitz.PDF_ANNOT_LE_NONE,
                                 fitz.PDF_ANNOT_LE_OPEN_ARROW)
            annot.set_opacity(opacity)
            annot.update()

        # ── polygon ───────────────────────────────────────────────────────────
        elif action == 'polygon':
            # Default diamond shape from (x,y) to (x2,y2)
            cx, cy = (x + x2) / 2, (y + y2) / 2
            pts = [
                fitz.Point(cx, y),
                fitz.Point(x2, cy),
                fitz.Point(cx, y2),
                fitz.Point(x, cy),
                fitz.Point(cx, y),
            ]
            annot = page.add_polygon_annot(pts)
            annot.set_colors(stroke=rgb, fill=fill_rgb)
            annot.set_border(width=line_width)
            annot.set_opacity(opacity)
            annot.update()

        # ── ink: Freehand path ────────────────────────────────────────────────
        elif action == 'ink':
            # Draw a wavy line
            pts = []
            steps = 20
            for i in range(steps + 1):
                px = x + (x2 - x) * i / steps
                py = y + (y2 - y) * i / steps + math.sin(i * 0.8) * 10
                pts.append(fitz.Point(px, py))
            annot = page.add_ink_annot([pts])
            annot.set_colors(stroke=rgb)
            annot.set_border(width=line_width)
            annot.set_opacity(opacity)
            annot.update()

        # ── stamp: Rubber stamp ────────────────────────────────────────────────
        elif action == 'stamp':
            info = STAMP_TEXTS.get(stamp_type.lower(), STAMP_TEXTS['approved'])
            stamp_text, sc_hex, sb_hex, border_hex = info
            sc_rgb = _hex_to_rgb(sc_hex)
            sb_rgb = _hex_to_rgb(sb_hex)
            bd_rgb = _hex_to_rgb(border_hex)

            pw = page.rect.width
            ph = page.rect.height
            sx = x if x > 10 else pw * 0.55
            sy = y if y > 10 else ph * 0.45
            sw = max(150, len(stamp_text) * 10 + 30)
            sh = 52

            shape = page.new_shape()
            # Outer border (thick)
            shape.draw_rect(fitz.Rect(sx, sy, sx + sw, sy + sh))
            shape.finish(color=bd_rgb, fill=sb_rgb, width=3.0)
            # Inner border (thin)
            shape.draw_rect(fitz.Rect(sx + 4, sy + 4,
                                       sx + sw - 4, sy + sh - 4))
            shape.finish(color=bd_rgb, fill=None, width=1.0)
            # Text
            text_w = len(stamp_text) * 8
            tx = sx + (sw - text_w) / 2
            ty = sy + sh / 2 + 6
            shape.insert_text(
                fitz.Point(tx, ty), stamp_text,
                fontsize=min(16, max(10, 16 - max(0, len(stamp_text) - 10))),
                fontname='helv',
                color=sc_rgb,
            )
            shape.commit()

        # ── insert_image ──────────────────────────────────────────────────────
        elif action == 'insert_image':
            rect = fitz.Rect(x, y,
                             x2 if x2 > x else x + 200,
                             y2 if y2 > y else y + 150)
            if image_bytes:
                # Write bytes to temp file
                with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
                    tmp.write(image_bytes)
                    tmp_path = tmp.name
                page.insert_image(rect, filename=tmp_path)
                os.unlink(tmp_path)
            elif image_path and os.path.exists(image_path):
                page.insert_image(rect, filename=image_path)
            else:
                raise ValueError('image_path or image_bytes required.')

        # ── add_label: Burn text into page content (permanent) ────────────────
        elif action == 'add_label':
            fn = 'helb' if bold else 'helv'
            shape = page.new_shape()
            shape.insert_text(
                fitz.Point(x, y),
                text or 'Label',
                fontsize=font_size,
                fontname=fn,
                color=rgb,
                rotate=int(rotation),
            )
            shape.commit()

        # ── whiteout: Cover area with white rectangle (redact-lite) ───────────
        elif action == 'whiteout':
            shape = page.new_shape()
            shape.draw_rect(fitz.Rect(x, y, x2, y2))
            shape.finish(color=(1, 1, 1), fill=(1, 1, 1), width=0)
            shape.commit()

        # ── burn_text: High-quality overlay text (permanent) ──────────────────
        elif action == 'burn_text':
            pw = page.rect.width
            ph = page.rect.height

            def draw_burn(c, w, h):
                c.saveState()
                c.setFont('Helvetica-Bold' if bold else 'Helvetica', font_size)
                r, g, b_val = rgb
                c.setFillColorRGB(r, g, b_val)
                c.setFillAlpha(opacity)
                # Convert fitz coordinates (origin top-left) → RL (origin bottom-left)
                rl_y = h - y - font_size
                if align == 'center':
                    c.drawCentredString(x, rl_y, text or '')
                elif align == 'right':
                    c.drawRightString(x, rl_y, text or '')
                else:
                    c.drawString(x, rl_y, text or '')
                c.restoreState()

            try:
                overlay_bytes = _make_overlay_pdf(pw, ph, draw_burn)
                _merge_overlay(doc, pg_idx, overlay_bytes, over=True)
            except Exception as e:
                logger.warning(f'burn_text fallback to add_label: {e}')
                # Fallback to direct shape insertion
                shape = page.new_shape()
                shape.insert_text(fitz.Point(x, y), text or '',
                                   fontsize=font_size, fontname='helv',
                                   color=rgb)
                shape.commit()

        # ── page_header: Burned-in header on specified pages ──────────────────
        elif action == 'page_header':
            pw = page.rect.width
            ph = page.rect.height
            header_text = text or 'IshuTools — IshuTools.fun'
            margin = x if x > 0 else 30

            def draw_header(c, w, h):
                c.setFont('Helvetica', font_size)
                r, g, b_val = rgb
                c.setFillColorRGB(r, g, b_val)
                c.setStrokeColorRGB(*_hex_to_rgb(fill_color))
                c.setLineWidth(0.5)
                rl_y = h - margin
                c.line(margin, rl_y - 2, w - margin, rl_y - 2)
                c.drawCentredString(w / 2, rl_y, header_text)

            overlay_bytes = _make_overlay_pdf(pw, ph, draw_header)
            _merge_overlay(doc, pg_idx, overlay_bytes, over=True)

        # ── page_footer: Burned-in footer on specified pages ──────────────────
        elif action == 'page_footer':
            pw = page.rect.width
            ph = page.rect.height
            footer_text = text or f'Page {pg_idx + 1} — IshuTools.fun'
            margin = x if x > 0 else 30

            def draw_footer(c, w, h, pg=pg_idx, ft=footer_text, mt=margin):
                c.setFont('Helvetica', font_size)
                r, g, b_val = rgb
                c.setFillColorRGB(r, g, b_val)
                rl_y = mt
                c.setStrokeColorRGB(*_hex_to_rgb(fill_color))
                c.setLineWidth(0.5)
                c.line(mt, rl_y + font_size + 2, w - mt, rl_y + font_size + 2)
                c.drawCentredString(w / 2, rl_y, ft)

            overlay_bytes = _make_overlay_pdf(pw, ph, draw_footer)
            _merge_overlay(doc, pg_idx, overlay_bytes, over=True)

        # ── remove_annots: Remove all annotations on these pages ──────────────
        elif action == 'remove_annots':
            annot = page.first_annot
            while annot:
                nxt = annot.next
                page.delete_annot(annot)
                annot = nxt

    # ── Flatten all annotations ────────────────────────────────────────────────
    if flatten:
        try:
            doc.bake(annots=True)
        except Exception:
            # Older PyMuPDF fallback
            for pg_idx2 in range(total):
                p = doc[pg_idx2]
                for annot in list(p.annots()):
                    p.delete_annot(annot)

    doc.save(output_path, garbage=4, deflate=True, clean=True)
    doc.close()
    return output_path


# ── Utilities ─────────────────────────────────────────────────────────────────

def get_annotations(input_path: str, password: str = '') -> List[dict]:
    """
    Extract all annotations from a PDF.
    Returns list of dicts: page_num, type, content, rect, color.
    """
    annotations: List[dict] = []
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')
        for i, page in enumerate(doc):
            for annot in page.annots():
                annotations.append({
                    'page_num': i + 1,
                    'type':     annot.type[1],
                    'content':  annot.info.get('content', ''),
                    'title':    annot.info.get('title', ''),
                    'rect':     list(annot.rect),
                    'color':    annot.colors.get('stroke'),
                    'opacity':  annot.opacity,
                })
        doc.close()
    except Exception as e:
        annotations.append({'error': str(e)})
    return annotations


def remove_all_annotations(input_path: str, output_path: str,
                            password: str = '') -> dict:
    """Remove all annotations from every page of the PDF."""
    count = 0
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')
        for page in doc:
            annot = page.first_annot
            while annot:
                nxt = annot.next
                page.delete_annot(annot)
                count += 1
                annot = nxt
        doc.save(output_path, garbage=4, deflate=True)
        doc.close()
    except Exception as e:
        raise RuntimeError(f'Could not remove annotations: {e}')
    return {'output_path': output_path, 'removed_count': count}


def add_text_to_all_pages(
    input_path:  str,
    output_path: str,
    text:        str,
    x_pct:       float = 0.5,
    y_pct:       float = 0.95,
    font_size:   int   = 10,
    color:       str   = '#888888',
    opacity:     float = 0.7,
    password:    str   = '',
) -> dict:
    """
    Burn text onto every page at a percentage-based position.
    Useful for running page references or confidentiality notices.
    """
    doc = fitz.open(input_path)
    if doc.is_encrypted:
        doc.authenticate(password or '')
    rgb = _hex_to_rgb(color)
    count = 0
    for page in doc:
        pw = page.rect.width
        ph = page.rect.height
        px = pw * x_pct
        py = ph * y_pct
        shape = page.new_shape()
        shape.insert_text(fitz.Point(px, py), text,
                           fontsize=font_size, fontname='helv', color=rgb)
        shape.commit()
        count += 1
    doc.save(output_path, garbage=4, deflate=True, clean=True)
    doc.close()
    return {'output_path': output_path, 'pages_processed': count}


def merge_annotation_layer(
    source_path: str,
    target_path: str,
    output_path: str,
    password:    str = '',
) -> dict:
    """
    Copy all annotations from source_path onto the pages of target_path.
    Pages are matched by index (page 1 → page 1, etc.).
    """
    src = fitz.open(source_path)
    tgt = fitz.open(target_path)
    if tgt.is_encrypted:
        tgt.authenticate(password or '')

    pages_merged = 0
    for i in range(min(src.page_count, tgt.page_count)):
        src_page = src[i]
        tgt_page = tgt[i]
        for annot in src_page.annots():
            # Replicate via annotation dict copy
            info    = annot.info
            colors  = annot.colors
            rect    = annot.rect
            typ     = annot.type[0]
            try:
                new_annot = tgt_page.add_freetext_annot(
                    rect, info.get('content', ''),
                    fontsize=10, text_color=colors.get('stroke', (0, 0, 0)),
                )
                new_annot.set_info(title=info.get('title', 'IshuTools'),
                                   content=info.get('content', ''))
                new_annot.set_opacity(annot.opacity)
                new_annot.update()
                pages_merged += 1
            except Exception:
                continue

    src.close()
    tgt.save(output_path, garbage=4, deflate=True)
    tgt.close()
    return {'output_path': output_path, 'annotations_merged': pages_merged}


def get_page_text_positions(input_path: str, page_num: int = 1,
                             password: str = '') -> List[dict]:
    """
    Get all text spans with bounding boxes on a page.
    Useful for building a smart highlight UI.
    Returns list of {text, bbox, font, size, color}.
    """
    positions: List[dict] = []
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')
        idx = max(0, min(page_num - 1, doc.page_count - 1))
        page = doc[idx]
        blocks = page.get_text('rawdict')['blocks']
        for block in blocks:
            if block.get('type') != 0:  # text only
                continue
            for line in block.get('lines', []):
                for span in line.get('spans', []):
                    positions.append({
                        'text':  span.get('text', ''),
                        'bbox':  list(span.get('bbox', [])),
                        'font':  span.get('font', ''),
                        'size':  span.get('size', 0),
                        'color': _rgb_to_hex(
                            *[((span.get('color', 0) >> s) & 0xFF) / 255
                              for s in (16, 8, 0)]
                        ),
                    })
        doc.close()
    except Exception as e:
        positions.append({'error': str(e)})
    return positions


def get_stamp_types() -> List[dict]:
    """Return all available stamp types with display info."""
    return [
        {'id': k, 'label': v[0], 'color': v[1], 'bg': v[2]}
        for k, v in STAMP_TEXTS.items()
    ]


# ── Additional PDF Edit Functions ─────────────────────────────────────────────


def add_header_footer(input_path: str, output_path: str,
                       header: str = '',
                       footer: str = '',
                       header_align: str = 'center',
                       footer_align: str = 'center',
                       font_size: float = 9,
                       color: str = '#555555',
                       margin: float = 20,
                       password: str = '') -> dict:
    """
    Add consistent header and/or footer text to all pages.

    Supports {page}, {total}, {date}, {filename} placeholders.

    Args:
        input_path:    Source PDF
        output_path:   Output PDF
        header:        Header text (e.g. 'My Company — Confidential')
        footer:        Footer text (e.g. 'Page {page} of {total}')
        header_align:  'left' | 'center' | 'right'
        footer_align:  'left' | 'center' | 'right'
        font_size:     Text size in points
        color:         Hex color
        margin:        Distance from edge in points
        password:      PDF password

    Returns:
        dict: pages_processed, output_path
    """
    from datetime import datetime

    r, g, b = _hex_to_rgb(color)

    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        total_pages = doc.page_count
        today = datetime.now().strftime('%Y-%m-%d')
        fname = os.path.basename(input_path)

        for i, pg in enumerate(doc):
            pw, ph = pg.rect.width, pg.rect.height

            def _resolve(text):
                return (text.replace('{page}', str(i + 1))
                            .replace('{total}', str(total_pages))
                            .replace('{date}', today)
                            .replace('{filename}', fname[:30]))

            if header:
                h_text = _resolve(header)
                h_len = len(h_text) * font_size * 0.55
                if header_align == 'center':
                    x = pw / 2 - h_len / 2
                elif header_align == 'right':
                    x = pw - margin - h_len
                else:
                    x = margin
                pg.insert_text(fitz.Point(x, margin + font_size),
                               h_text, fontsize=font_size,
                               fontname='helv', color=(r, g, b))

            if footer:
                f_text = _resolve(footer)
                f_len = len(f_text) * font_size * 0.55
                if footer_align == 'center':
                    x = pw / 2 - f_len / 2
                elif footer_align == 'right':
                    x = pw - margin - f_len
                else:
                    x = margin
                pg.insert_text(fitz.Point(x, ph - margin),
                               f_text, fontsize=font_size,
                               fontname='helv', color=(r, g, b))

        doc.save(output_path, garbage=3, deflate=True)
        doc.close()

        return {'pages_processed': total_pages, 'output_path': output_path}

    except Exception as e:
        logger.warning(f'add_header_footer failed: {e}')
        raise


def flatten_form_fields(input_path: str, output_path: str,
                         password: str = '') -> dict:
    """
    Flatten fillable form fields into static text (prevents further editing).

    Uses Ghostscript for highest fidelity, falls back to fitz flatten.

    Args:
        input_path:  Source PDF with form fields
        output_path: Flattened output PDF
        password:    PDF password

    Returns:
        dict: fields_flattened, method_used, output_path
    """
    import shutil, subprocess

    # Try Ghostscript flatten
    GS_BIN = shutil.which('gs') or shutil.which('ghostscript')
    if GS_BIN:
        try:
            cmd = [
                GS_BIN, '-dBATCH', '-dNOPAUSE', '-sDEVICE=pdfwrite',
                '-dFlattenAnnotations', '-dFlattenFormFields',
                f'-sOutputFile={output_path}',
                '-dCompressPages=true',
                input_path,
            ]
            result = subprocess.run(cmd, capture_output=True, timeout=60)
            if result.returncode == 0 and os.path.exists(output_path):
                return {
                    'fields_flattened': True,
                    'method_used': 'ghostscript',
                    'output_path': output_path,
                }
        except Exception:
            pass

    # Fallback: fitz
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        count = 0
        for pg in doc:
            for widget in list(pg.widgets()):
                count += 1
                widget.update()  # Force paint to page
                pg.delete_widget(widget)

        doc.save(output_path, garbage=3, deflate=True)
        doc.close()

        return {
            'fields_flattened': count,
            'method_used': 'fitz',
            'output_path': output_path,
        }
    except Exception as e:
        logger.warning(f'flatten_form_fields failed: {e}')
        raise
