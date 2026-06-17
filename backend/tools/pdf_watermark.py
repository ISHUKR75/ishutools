"""
pdf_watermark.py - Add text or image watermarks to PDF (Ultra-Enhanced)
IshuTools.fun | Professional PDF Suite

Libraries: pypdf, reportlab, fitz (PyMuPDF), Pillow
Features:
  - Text watermark with full typography control
  - Image watermark (PNG/JPG with transparency)
  - Tiled watermark (grid across entire page)
  - Page-range watermarking (specific pages only)
  - Under-content or over-content placement
  - Diagonal, horizontal, vertical orientations
  - Multi-line watermark text
  - Custom font size scaling per page size
"""

import io
import os
import math

import fitz
from pypdf import PdfWriter, PdfReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from PIL import Image


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hex_to_rgb01(hex_color: str):
    """Convert hex color to (r, g, b) floats in [0, 1]."""
    h = hex_color.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return r / 255, g / 255, b / 255


def _position_to_xy(position: str, w: float, h: float):
    pos_map = {
        'center':        (w / 2, h / 2),
        'top-left':      (w * 0.15, h * 0.85),
        'top-right':     (w * 0.85, h * 0.85),
        'top-center':    (w / 2, h * 0.90),
        'bottom-left':   (w * 0.15, h * 0.12),
        'bottom-right':  (w * 0.85, h * 0.12),
        'bottom-center': (w / 2, h * 0.08),
    }
    return pos_map.get(position, (w / 2, h / 2))


# ── Text watermark overlay ────────────────────────────────────────────────────

def _create_text_watermark(
    width: float, height: float, text: str,
    opacity: float, color: str, font_size: int,
    rotation: int, position: str,
    tiled: bool = False, tile_spacing: int = 150,
    font_name: str = 'Helvetica-Bold',
) -> bytes:
    """Create a text watermark as PDF bytes."""
    packet = io.BytesIO()
    c = rl_canvas.Canvas(packet, pagesize=(width, height))

    r, g, b = _hex_to_rgb01(color)
    c.setFillColorRGB(r, g, b, alpha=max(0.01, min(1.0, opacity)))
    c.setFont(font_name, font_size)

    if tiled:
        # Draw watermark in a grid pattern
        angle_rad = math.radians(rotation)
        step_x = max(tile_spacing, font_size * max(len(line) for line in text.split('\n')) * 0.5)
        step_y = max(tile_spacing, font_size * 2)
        for xi in range(-2, int(width / step_x) + 3):
            for yi in range(-2, int(height / step_y) + 3):
                cx = xi * step_x
                cy = yi * step_y
                c.saveState()
                c.translate(cx, cy)
                c.rotate(rotation)
                for line_idx, line in enumerate(text.split('\n')):
                    c.drawCentredString(0, -line_idx * font_size * 1.2, line)
                c.restoreState()
    else:
        x, y = _position_to_xy(position, width, height)
        c.saveState()
        c.translate(x, y)
        c.rotate(rotation)
        lines = text.split('\n')
        total_h = len(lines) * font_size * 1.2
        for line_idx, line in enumerate(lines):
            yy = total_h / 2 - line_idx * font_size * 1.2
            c.drawCentredString(0, yy, line)
        c.restoreState()

    c.save()
    packet.seek(0)
    return packet.read()


# ── Image watermark overlay ───────────────────────────────────────────────────

def _create_image_watermark(
    page_width: float, page_height: float,
    image_path: str, opacity: float,
    position: str, scale: float = 0.3,
    rotation: int = 0,
) -> bytes:
    """Create an image watermark as PDF bytes."""
    try:
        img = Image.open(image_path).convert('RGBA')
        # Apply opacity to alpha channel
        if opacity < 1.0:
            r, g, b, a = img.split()
            a = a.point(lambda p: int(p * opacity))
            img = Image.merge('RGBA', (r, g, b, a))

        # Scale image relative to page
        target_w = int(page_width * scale)
        aspect = img.height / img.width
        target_h = int(target_w * aspect)
        img = img.resize((target_w, target_h), Image.LANCZOS)

        # Rotate if needed
        if rotation:
            img = img.rotate(-rotation, expand=True)

        # Save as PNG temp
        tmp = io.BytesIO()
        img.save(tmp, format='PNG')
        tmp.seek(0)

        # Draw on ReportLab canvas
        packet = io.BytesIO()
        c = rl_canvas.Canvas(packet, pagesize=(page_width, page_height))
        x, y = _position_to_xy(position, page_width, page_height)
        draw_x = x - target_w / 2
        draw_y = y - target_h / 2
        c.drawImage(io.BytesIO(tmp.read()), draw_x, draw_y,
                    width=target_w, height=target_h, mask='auto')
        c.save()
        packet.seek(0)
        return packet.read()
    except Exception as e:
        raise RuntimeError(f'Image watermark failed: {e}')


# ── Main API ──────────────────────────────────────────────────────────────────

def add_watermark(
    input_path: str,
    output_path: str,
    text: str = 'CONFIDENTIAL',
    opacity: float = 0.3,
    color: str = '#FF0000',
    font_size: int = 48,
    rotation: int = 45,
    position: str = 'center',
    pages: str = 'all',
    tiled: bool = False,
    tile_spacing: int = 150,
    watermark_image_path: str = None,
    image_scale: float = 0.3,
    font_name: str = 'Helvetica-Bold',
    password: str = '',
    layer: str = 'over',
) -> dict:
    """
    Overlay a text or image watermark on PDF pages.

    Args:
        input_path:           Source PDF
        output_path:          Output PDF
        text:                 Watermark text (supports \\n for multiline)
        opacity:              Transparency 0.01 – 1.0
        color:                Hex color e.g. '#FF0000'
        font_size:            Font size in points
        rotation:             Rotation angle in degrees
        position:             'center'|'top-left'|'top-right'|'bottom-left'|'bottom-right'
        pages:                'all' or range like '1-3,5'
        tiled:                Tile the watermark across the entire page
        tile_spacing:         Spacing between tiles in points
        watermark_image_path: Path to PNG/JPG for image watermark (overrides text)
        image_scale:          Image size as fraction of page width (0.1–1.0)
        font_name:            ReportLab font name
        password:             PDF password if encrypted
        layer:                'over' (foreground) or 'under' (background)
    Returns:
        dict with output_path, pages_watermarked, watermark_type
    """
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt(password or '')
    writer = PdfWriter()

    total = len(reader.pages)
    # Parse page selection
    if pages.strip().lower() == 'all':
        mark_indices = set(range(total))
    else:
        mark_indices = set()
        for part in pages.replace(' ', '').split(','):
            if '-' in part:
                a, b = part.split('-', 1)
                mark_indices.update(range(int(a) - 1, int(b)))
            elif part.isdigit():
                mark_indices.add(int(part) - 1)

    watermarked = 0
    watermark_type = 'image' if watermark_image_path else 'text'

    for i, page in enumerate(reader.pages):
        if i in mark_indices:
            box = page.mediabox
            w = float(box.width)
            h = float(box.height)

            try:
                if watermark_image_path and os.path.exists(watermark_image_path):
                    wm_bytes = _create_image_watermark(
                        w, h, watermark_image_path, opacity,
                        position, image_scale, rotation)
                else:
                    wm_bytes = _create_text_watermark(
                        w, h, text, opacity, color, font_size,
                        rotation, position, tiled, tile_spacing, font_name)

                wm_reader = PdfReader(io.BytesIO(wm_bytes))
                wm_page = wm_reader.pages[0]

                if layer == 'under':
                    wm_page.merge_page(page)
                    writer.add_page(wm_page)
                else:
                    page.merge_page(wm_page)
                    writer.add_page(page)
                watermarked += 1
            except Exception:
                writer.add_page(page)
        else:
            writer.add_page(page)

    # Preserve metadata
    try:
        if reader.metadata:
            writer.add_metadata(dict(reader.metadata))
    except Exception:
        pass

    with open(output_path, 'wb') as f:
        writer.write(f)

    return {
        'output_path': output_path,
        'pages_watermarked': watermarked,
        'watermark_type': watermark_type,
        'total_pages': total,
    }


def remove_watermark_layer(input_path: str, output_path: str,
                            password: str = '') -> dict:
    """
    Attempt to flatten/remove existing watermark annotations from a PDF.
    Removes FreeText and Stamp annotations commonly used for watermarks.
    """
    try:
        import pikepdf
        count = 0
        with pikepdf.open(input_path, password=password or '') as pdf:
            for page in pdf.pages:
                if '/Annots' in page:
                    annots = list(page['/Annots'])
                    keep = []
                    for annot in annots:
                        try:
                            a = annot.get_object() if hasattr(annot, 'get_object') else annot
                            subtype = str(a.get('/Subtype', ''))
                            if subtype not in ('/FreeText', '/Stamp', '/Watermark'):
                                keep.append(annot)
                            else:
                                count += 1
                        except Exception:
                            keep.append(annot)
                    page['/Annots'] = pikepdf.Array(keep)
            pdf.save(output_path)
        return {'output_path': output_path, 'removed_annotations': count}
    except Exception as e:
        raise RuntimeError(f'Could not remove watermark layer: {e}')
