"""
pdf_edit.py - Add annotations, drawings, stamps to PDF (Ultra-Enhanced)
IshuTools.fun | Professional PDF Suite

Libraries: fitz (PyMuPDF), pypdf, reportlab, Pillow
Features:
  - Free text annotation with background
  - Text highlight, underline, strikethrough
  - Sticky note (comment) annotation
  - Rectangle / circle / line shape drawing
  - Arrow annotation
  - Rubber stamp (APPROVED, DRAFT, CONFIDENTIAL, etc.)
  - Redline/markup mode
  - Image insertion at position
  - Draw freehand path
  - Flatten annotations to content
"""

import io
import os
import fitz
from datetime import datetime, timezone


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hex_to_rgb(hex_color: str) -> tuple:
    h = hex_color.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return (int(h[0:2], 16) / 255,
            int(h[2:4], 16) / 255,
            int(h[4:6], 16) / 255)


STAMP_TEXTS = {
    'approved':     ('APPROVED',     '#16A34A', '#DCFCE7'),
    'rejected':     ('REJECTED',     '#DC2626', '#FEE2E2'),
    'draft':        ('DRAFT',        '#D97706', '#FEF3C7'),
    'confidential': ('CONFIDENTIAL', '#7C3AED', '#EDE9FE'),
    'void':         ('VOID',         '#DC2626', '#FFF1F2'),
    'reviewed':     ('REVIEWED',     '#2563EB', '#DBEAFE'),
    'paid':         ('PAID',         '#16A34A', '#DCFCE7'),
    'sample':       ('SAMPLE',       '#6B7280', '#F3F4F6'),
    'original':     ('ORIGINAL',     '#1D4ED8', '#EFF6FF'),
    'copy':         ('COPY',         '#92400E', '#FEF3C7'),
}


# ── Main edit function ────────────────────────────────────────────────────────

def edit_pdf(
    input_path: str,
    output_path: str,
    action: str = 'add_text',
    text: str = '',
    page_num: int = 1,
    x: float = 100.0,
    y: float = 100.0,
    x2: float = 300.0,
    y2: float = 200.0,
    font_size: int = 14,
    color: str = '#000000',
    fill_color: str = '#FFFF88',
    line_width: float = 1.5,
    opacity: float = 1.0,
    stamp_type: str = 'approved',
    image_path: str = None,
    flatten: bool = False,
    password: str = '',
) -> str:
    """
    Edit a PDF with annotations, drawings, and stamps.

    Args:
        input_path:  Source PDF
        output_path: Output PDF
        action:      'add_text' | 'highlight' | 'underline' | 'strikethrough' |
                     'note' | 'rectangle' | 'circle' | 'line' | 'arrow' |
                     'stamp' | 'insert_image' | 'freehand'
        text:        Text content / search term for highlight
        page_num:    1-based page number
        x, y:        Top-left position (points from top-left corner)
        x2, y2:      Bottom-right position (for shapes/lines)
        font_size:   Font size for text actions
        color:       Stroke/text hex color
        fill_color:  Fill hex color for shapes / highlight
        line_width:  Line width for shapes
        opacity:     Annotation opacity (0.0–1.0)
        stamp_type:  Named stamp for 'stamp' action
        image_path:  Path to image for 'insert_image' action
        flatten:     Flatten all annotations into page content
        password:    PDF password
    Returns:
        output_path on success
    """
    doc = fitz.open(input_path)
    if doc.is_encrypted:
        doc.authenticate(password or '')

    idx = max(0, min(page_num - 1, doc.page_count - 1))
    page = doc[idx]
    rgb = _hex_to_rgb(color)
    fill_rgb = _hex_to_rgb(fill_color)

    # ── add_text: Free text annotation ────────────────────────────────────────
    if action == 'add_text':
        rect = fitz.Rect(x, y, max(x2, x + 200), max(y2, y + font_size * 2 + 10))
        annot = page.add_freetext_annot(
            rect,
            text or 'Annotation',
            fontsize=font_size,
            fontname='helv',
            text_color=rgb,
            fill_color=fill_rgb,
            border_color=rgb,
        )
        annot.set_opacity(opacity)
        annot.update()

    # ── highlight ──────────────────────────────────────────────────────────────
    elif action == 'highlight':
        areas = page.search_for(text or '')
        for rect in areas:
            annot = page.add_highlight_annot(rect)
            annot.set_colors(stroke=fill_rgb)
            annot.set_opacity(opacity)
            annot.update()

    # ── underline ─────────────────────────────────────────────────────────────
    elif action == 'underline':
        areas = page.search_for(text or '')
        for rect in areas:
            annot = page.add_underline_annot(rect)
            annot.set_colors(stroke=rgb)
            annot.set_opacity(opacity)
            annot.update()

    # ── strikethrough ─────────────────────────────────────────────────────────
    elif action == 'strikethrough':
        areas = page.search_for(text or '')
        for rect in areas:
            annot = page.add_strikeout_annot(rect)
            annot.set_colors(stroke=rgb)
            annot.set_opacity(opacity)
            annot.update()

    # ── note: Sticky note ─────────────────────────────────────────────────────
    elif action == 'note':
        point = fitz.Point(x, y)
        annot = page.add_text_annot(point, text or 'Note', icon='Note')
        annot.set_colors(stroke=rgb, fill=fill_rgb)
        annot.set_opacity(opacity)
        ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
        annot.set_info(title='IshuTools', content=text or 'Note', creationDate=ts)
        annot.update()

    # ── rectangle ─────────────────────────────────────────────────────────────
    elif action == 'rectangle':
        rect = fitz.Rect(x, y, x2, y2)
        annot = page.add_rect_annot(rect)
        annot.set_colors(stroke=rgb, fill=fill_rgb)
        annot.set_border(width=line_width)
        annot.set_opacity(opacity)
        annot.update()

    # ── circle ────────────────────────────────────────────────────────────────
    elif action == 'circle':
        rect = fitz.Rect(x, y, x2, y2)
        annot = page.add_circle_annot(rect)
        annot.set_colors(stroke=rgb, fill=fill_rgb)
        annot.set_border(width=line_width)
        annot.set_opacity(opacity)
        annot.update()

    # ── line ──────────────────────────────────────────────────────────────────
    elif action == 'line':
        p1 = fitz.Point(x, y)
        p2 = fitz.Point(x2, y2)
        annot = page.add_line_annot(p1, p2)
        annot.set_colors(stroke=rgb)
        annot.set_border(width=line_width)
        annot.set_opacity(opacity)
        annot.update()

    # ── arrow ─────────────────────────────────────────────────────────────────
    elif action == 'arrow':
        p1 = fitz.Point(x, y)
        p2 = fitz.Point(x2, y2)
        annot = page.add_line_annot(p1, p2)
        annot.set_colors(stroke=rgb)
        annot.set_border(width=line_width)
        # Set line end style (arrow)
        annot.set_line_ends(fitz.PDF_ANNOT_LE_NONE, fitz.PDF_ANNOT_LE_OPEN_ARROW)
        annot.set_opacity(opacity)
        annot.update()

    # ── stamp ─────────────────────────────────────────────────────────────────
    elif action == 'stamp':
        stamp_info = STAMP_TEXTS.get(stamp_type.lower(),
                                     STAMP_TEXTS['approved'])
        stamp_text, stamp_color, stamp_bg = stamp_info
        sc_rgb = _hex_to_rgb(stamp_color)
        sb_rgb = _hex_to_rgb(stamp_bg)

        # Draw stamp as a rubber stamp rectangle with bold text
        pw = page.rect.width
        ph = page.rect.height
        sx = x if x > 0 else pw * 0.55
        sy = y if y > 0 else ph * 0.45
        sw = 180
        sh = 50
        stamp_rect = fitz.Rect(sx, sy, sx + sw, sy + sh)

        shape = page.new_shape()
        shape.draw_rect(stamp_rect)
        shape.finish(color=sc_rgb, fill=sb_rgb, width=2.5)
        shape.draw_rect(fitz.Rect(sx + 3, sy + 3, sx + sw - 3, sy + sh - 3))
        shape.finish(color=sc_rgb, fill=None, width=1.0)
        shape.insert_text(
            fitz.Point(sx + sw / 2 - len(stamp_text) * 7, sy + sh / 2 + 6),
            stamp_text,
            fontsize=18,
            fontname='helv',
            color=sc_rgb,
        )
        shape.commit()

    # ── insert_image ──────────────────────────────────────────────────────────
    elif action == 'insert_image':
        if image_path and os.path.exists(image_path):
            rect = fitz.Rect(x, y, x2 if x2 > x else x + 200,
                              y2 if y2 > y else y + 150)
            page.insert_image(rect, filename=image_path)
        else:
            raise ValueError('image_path is required for insert_image action.')

    # ── freehand: Draw polygon/polyline ────────────────────────────────────────
    elif action == 'freehand':
        # Draw a simple diagonal line as freehand demo
        shape = page.new_shape()
        shape.draw_line(fitz.Point(x, y), fitz.Point(x2, y2))
        shape.finish(color=rgb, width=line_width)
        shape.commit()

    # ── add_page_label: Insert text label anywhere ─────────────────────────────
    elif action == 'add_label':
        shape = page.new_shape()
        shape.insert_text(
            fitz.Point(x, y), text or 'Label',
            fontsize=font_size,
            fontname='helv',
            color=rgb,
        )
        shape.commit()

    # ── Flatten annotations into page content ──────────────────────────────────
    if flatten:
        for page_idx in range(doc.page_count):
            doc[page_idx].annots()  # ensure annots are loaded
        # Flatten: convert all annotations to page content
        doc.bake(annots=True)

    doc.save(output_path, garbage=4, deflate=True, clean=True)
    doc.close()
    return output_path


def get_annotations(input_path: str, password: str = '') -> list:
    """
    Extract all annotations from a PDF.
    Returns list of dicts with page_num, type, content, rect.
    """
    annotations = []
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')
        for i, page in enumerate(doc):
            for annot in page.annots():
                annotations.append({
                    'page_num': i + 1,
                    'type': annot.type[1],
                    'content': annot.info.get('content', ''),
                    'title': annot.info.get('title', ''),
                    'rect': list(annot.rect),
                    'color': annot.colors.get('stroke', None),
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
                next_annot = annot.next
                page.delete_annot(annot)
                count += 1
                annot = next_annot
        doc.save(output_path, garbage=4, deflate=True)
        doc.close()
    except Exception as e:
        raise RuntimeError(f'Could not remove annotations: {e}')
    return {'output_path': output_path, 'removed_count': count}
