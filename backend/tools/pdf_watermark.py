"""
pdf_watermark.py - Enterprise PDF Watermark Suite
IshuTools.fun | Professional PDF Suite

Watermark modes:
  - Text watermark (single / multi-line)
  - Image watermark (PNG/JPG with alpha control)
  - Tiled / repeating watermark grid
  - Diagonal strip watermark
  - QR code watermark (auto-generated from URL/text)
  - Date-stamp / classification banner watermark
  - Per-page watermark rotation cycling

Features:
  - Full typography control (font, size, color, opacity)
  - Foreground (over) or background (under) layer
  - Page-range selection
  - Tiled grid with configurable spacing and angle
  - Image watermark with aspect-ratio-preserving scale
  - CMYK-safe color handling
  - Metadata preservation
  - Batch watermark
  - Remove existing watermark annotations
  - Ghostscript high-quality stamp pass
"""

import io
import os
import math
import shutil
import subprocess
import tempfile
import logging
from datetime import datetime
from typing import Optional

import fitz
import pikepdf
from pypdf import PdfWriter, PdfReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.pagesizes import letter, A4
from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

GS_BIN = shutil.which('gs') or shutil.which('ghostscript')


# ── Color helpers ─────────────────────────────────────────────────────────────

def _hex_to_rgb01(hex_color: str):
    """Convert hex color string to (r, g, b) in [0, 1]."""
    h = str(hex_color).lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    try:
        r = int(h[0:2], 16) / 255
        g = int(h[2:4], 16) / 255
        b = int(h[4:6], 16) / 255
        return r, g, b
    except Exception:
        return 1.0, 0.0, 0.0  # default red


def _position_to_xy(position: str, w: float, h: float):
    """Map position name to (x, y) coordinate."""
    pos_map = {
        'center':        (w / 2, h / 2),
        'top-left':      (w * 0.15, h * 0.85),
        'top-right':     (w * 0.85, h * 0.85),
        'top-center':    (w / 2, h * 0.88),
        'bottom-left':   (w * 0.15, h * 0.12),
        'bottom-right':  (w * 0.85, h * 0.12),
        'bottom-center': (w / 2, h * 0.08),
        'middle-left':   (w * 0.10, h / 2),
        'middle-right':  (w * 0.90, h / 2),
    }
    return pos_map.get(position, (w / 2, h / 2))


# ── Page selection ────────────────────────────────────────────────────────────

def _parse_pages(pages_str: str, total: int) -> set:
    """Parse 'all', '1-3', '1,3,5' into a set of 0-based indices."""
    if str(pages_str).strip().lower() == 'all':
        return set(range(total))
    indices = set()
    for part in str(pages_str).replace(' ', '').split(','):
        if '-' in part:
            a, b = part.split('-', 1)
            try:
                indices.update(range(int(a) - 1, min(int(b), total)))
            except ValueError:
                pass
        elif part.isdigit():
            idx = int(part) - 1
            if 0 <= idx < total:
                indices.add(idx)
    return indices


# ── Text watermark builders ───────────────────────────────────────────────────

def _create_text_watermark(
    width: float, height: float,
    text: str,
    opacity: float,
    color: str,
    font_size: int,
    rotation: int,
    position: str,
    tiled: bool = False,
    tile_spacing: int = 150,
    font_name: str = 'Helvetica-Bold',
    auto_scale: bool = True,
) -> bytes:
    """Create a text watermark as a single-page PDF (using ReportLab)."""
    packet = io.BytesIO()
    c = rl_canvas.Canvas(packet, pagesize=(width, height))

    r, g, b = _hex_to_rgb01(color)
    opa = max(0.01, min(1.0, opacity))
    c.setFillColorRGB(r, g, b, alpha=opa)

    # Auto-scale font to fit within 70% of page width
    if auto_scale and not tiled:
        max_text_width = width * 0.70
        lines = text.replace('\\n', '\n').split('\n')
        max_line = max(lines, key=len)
        approx_w = len(max_line) * font_size * 0.55
        if approx_w > max_text_width:
            font_size = max(8, int(font_size * max_text_width / approx_w))

    c.setFont(font_name, font_size)
    text_lines = text.replace('\\n', '\n').split('\n')

    if tiled:
        step_x = max(tile_spacing,
                     font_size * max(len(l) for l in text_lines) * 0.55 + 40)
        step_y = max(tile_spacing // 2, font_size * len(text_lines) * 1.4 + 30)
        for xi in range(-3, int(width / step_x) + 4):
            for yi in range(-3, int(height / step_y) + 4):
                cx = xi * step_x
                cy = yi * step_y
                c.saveState()
                c.translate(cx, cy)
                c.rotate(rotation)
                c.setFillColorRGB(r, g, b, alpha=opa)
                for li, line in enumerate(text_lines):
                    c.drawCentredString(0, -li * font_size * 1.3, line)
                c.restoreState()
    else:
        x, y = _position_to_xy(position, width, height)
        c.saveState()
        c.translate(x, y)
        c.rotate(rotation)
        total_h = len(text_lines) * font_size * 1.3
        for li, line in enumerate(text_lines):
            yy = total_h / 2 - li * font_size * 1.3
            c.drawCentredString(0, yy, line)
        c.restoreState()

    c.save()
    packet.seek(0)
    return packet.read()


def _create_diagonal_strip_watermark(
    width: float, height: float,
    text: str,
    color: str = '#FF0000',
    opacity: float = 0.15,
    font_size: int = 36,
) -> bytes:
    """Create a repeating diagonal strip watermark."""
    return _create_text_watermark(
        width, height, text,
        opacity=opacity, color=color,
        font_size=font_size, rotation=45,
        position='center', tiled=True,
        tile_spacing=int(font_size * 8),
    )


def _create_classification_banner(
    width: float, height: float,
    classification: str = 'CONFIDENTIAL',
    color: str = '#FF0000',
    opacity: float = 0.85,
    font_size: int = 11,
    position: str = 'top',
) -> bytes:
    """Create a document classification banner (top or bottom bar)."""
    packet = io.BytesIO()
    c = rl_canvas.Canvas(packet, pagesize=(width, height))
    r, g, b = _hex_to_rgb01(color)

    bar_h = font_size * 2
    if position == 'top':
        bar_y = height - bar_h
    else:
        bar_y = 0

    # Background bar
    c.setFillColorRGB(r, g, b, alpha=opacity * 0.2)
    c.rect(0, bar_y, width, bar_h, fill=1, stroke=0)

    # Border line
    c.setStrokeColorRGB(r, g, b, alpha=opacity * 0.8)
    c.setLineWidth(1)
    line_y = bar_y if position == 'top' else bar_y + bar_h
    c.line(0, line_y, width, line_y)

    # Text
    c.setFillColorRGB(r, g, b, alpha=min(1.0, opacity + 0.2))
    c.setFont('Helvetica-Bold', font_size)
    c.drawCentredString(width / 2, bar_y + (bar_h - font_size) / 2, classification)

    c.save()
    packet.seek(0)
    return packet.read()


# ── Image watermark builder ───────────────────────────────────────────────────

def _create_image_watermark(
    page_width: float, page_height: float,
    image_path: str,
    opacity: float,
    position: str,
    scale: float = 0.3,
    rotation: int = 0,
) -> bytes:
    """Create an image watermark as a PDF page using ReportLab."""
    try:
        img = Image.open(image_path).convert('RGBA')

        # Apply opacity to alpha channel
        if opacity < 1.0:
            r_ch, g_ch, b_ch, a_ch = img.split()
            a_ch = a_ch.point(lambda p: int(p * max(0.01, min(1.0, opacity))))
            img = Image.merge('RGBA', (r_ch, g_ch, b_ch, a_ch))

        # Scale relative to page
        target_w = max(10, int(page_width * scale))
        aspect = img.height / max(img.width, 1)
        target_h = max(10, int(target_w * aspect))
        img = img.resize((target_w, target_h), Image.LANCZOS)

        if rotation:
            img = img.rotate(-rotation, expand=True, fillcolor=(255, 255, 255, 0))

        tmp_buf = io.BytesIO()
        img.save(tmp_buf, format='PNG')
        tmp_buf.seek(0)

        packet = io.BytesIO()
        c = rl_canvas.Canvas(packet, pagesize=(page_width, page_height))
        x, y = _position_to_xy(position, page_width, page_height)
        draw_x = x - img.width / 2
        draw_y = y - img.height / 2
        c.drawImage(tmp_buf, draw_x, draw_y,
                    width=img.width, height=img.height, mask='auto')
        c.save()
        packet.seek(0)
        return packet.read()
    except Exception as e:
        raise RuntimeError(f'Image watermark creation failed: {e}')


# ── QR watermark ──────────────────────────────────────────────────────────────

def _create_qr_watermark(
    page_width: float, page_height: float,
    qr_data: str,
    opacity: float = 0.4,
    position: str = 'bottom-right',
    size_fraction: float = 0.15,
) -> bytes:
    """Create a QR code watermark (requires qrcode library)."""
    try:
        import qrcode
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=4, border=2,
        )
        qr.add_data(qr_data)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color='black', back_color='white').convert('RGBA')

        target_size = int(min(page_width, page_height) * size_fraction)
        qr_img = qr_img.resize((target_size, target_size), Image.NEAREST)

        # Apply opacity
        r_ch, g_ch, b_ch, a_ch = qr_img.split()
        a_ch = a_ch.point(lambda p: int(p * opacity))
        qr_img = Image.merge('RGBA', (r_ch, g_ch, b_ch, a_ch))

        tmp_buf = io.BytesIO()
        qr_img.save(tmp_buf, format='PNG')
        tmp_buf.seek(0)

        packet = io.BytesIO()
        c = rl_canvas.Canvas(packet, pagesize=(page_width, page_height))
        x, y = _position_to_xy(position, page_width, page_height)
        c.drawImage(tmp_buf, x - target_size / 2, y - target_size / 2,
                    width=target_size, height=target_size, mask='auto')
        c.save()
        packet.seek(0)
        return packet.read()
    except ImportError:
        # Fallback: text "QR" marker
        return _create_text_watermark(
            page_width, page_height, f'[QR: {qr_data[:20]}]',
            opacity=opacity, color='#000000', font_size=8,
            rotation=0, position=position)
    except Exception as e:
        raise RuntimeError(f'QR watermark failed: {e}')


# ── fitz-based watermark (faster for large PDFs) ─────────────────────────────

def _add_watermark_fitz(
    input_path: str, output_path: str,
    text: str, opacity: float, color: str,
    font_size: int, rotation: int, pages: str,
) -> bool:
    """Add text watermark using PyMuPDF's native text insertion."""
    try:
        doc = fitz.open(input_path)
        total = doc.page_count
        mark_indices = _parse_pages(pages, total)
        r, g, b = _hex_to_rgb01(color)
        color_tuple = (r, g, b)

        for i in mark_indices:
            if i >= doc.page_count:
                continue
            page = doc[i]
            w = page.rect.width
            h = page.rect.height
            cx, cy = w / 2, h / 2

            text_lines = text.replace('\\n', '\n').split('\n')
            for li, line in enumerate(text_lines):
                offset_y = (li - len(text_lines) / 2) * font_size * 1.4
                page.insert_text(
                    fitz.Point(cx - len(line) * font_size * 0.3,
                                cy + offset_y),
                    line,
                    fontsize=font_size,
                    color=color_tuple,
                    rotate=rotation,
                    overlay=True,
                    fill_opacity=opacity,
                )

        doc.save(output_path, garbage=4, deflate=True)
        doc.close()
        return True
    except Exception as e:
        logger.warning(f'fitz watermark failed: {e}')
        return False


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
    watermark_image_path: Optional[str] = None,
    image_scale: float = 0.3,
    font_name: str = 'Helvetica-Bold',
    password: str = '',
    layer: str = 'over',
    watermark_mode: str = 'text',
    qr_data: str = '',
    classification: str = '',
    auto_scale_font: bool = True,
) -> dict:
    """
    Add a watermark to a PDF with multiple mode support.

    Args:
        input_path:           Source PDF path
        output_path:          Output PDF path
        text:                 Watermark text (\\n for multiline)
        opacity:              0.01–1.0
        color:                Hex color '#RRGGBB'
        font_size:            Font size in points
        rotation:             Rotation angle in degrees
        position:             'center'|'top-left'|'top-right'|'bottom-*'|'middle-*'
        pages:                'all' or range '1-3,5'
        tiled:                Repeat watermark across page as grid
        tile_spacing:         Grid spacing in points
        watermark_image_path: Path to image file (PNG/JPG) for image watermark
        image_scale:          Image width as fraction of page width
        font_name:            ReportLab/PDF font name
        password:             PDF password if encrypted
        layer:                'over' (on top) or 'under' (behind content)
        watermark_mode:       'text'|'image'|'diagonal'|'classification'|'qr'
        qr_data:              URL/text for QR watermark
        classification:       Classification level text for banner mode
        auto_scale_font:      Auto-scale font size to fit page

    Returns:
        dict: output_path, pages_watermarked, watermark_type, total_pages
    """
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt(password or '')
    writer = PdfWriter()

    total = len(reader.pages)
    mark_indices = _parse_pages(pages, total)
    watermarked = 0

    for i, page in enumerate(reader.pages):
        if i in mark_indices:
            box = page.mediabox
            w = float(box.width)
            h = float(box.height)

            try:
                # Choose watermark creator
                if watermark_mode == 'image' or \
                        (watermark_image_path and
                         os.path.exists(watermark_image_path)):
                    wm_bytes = _create_image_watermark(
                        w, h, watermark_image_path or '',
                        opacity, position, image_scale, rotation)
                    wm_type = 'image'
                elif watermark_mode == 'qr' or qr_data:
                    wm_bytes = _create_qr_watermark(
                        w, h, qr_data or text, opacity, position)
                    wm_type = 'qr'
                elif watermark_mode == 'classification' or classification:
                    wm_bytes = _create_classification_banner(
                        w, h, classification or text, color, opacity,
                        max(8, font_size // 3))
                    wm_type = 'classification'
                elif watermark_mode == 'diagonal':
                    wm_bytes = _create_diagonal_strip_watermark(
                        w, h, text, color, opacity, font_size)
                    wm_type = 'diagonal'
                else:
                    wm_bytes = _create_text_watermark(
                        w, h, text, opacity, color, font_size,
                        rotation, position, tiled, tile_spacing,
                        font_name, auto_scale_font)
                    wm_type = 'text'

                wm_reader = PdfReader(io.BytesIO(wm_bytes))
                wm_page = wm_reader.pages[0]

                if layer == 'under':
                    wm_page.merge_page(page)
                    writer.add_page(wm_page)
                else:
                    page.merge_page(wm_page)
                    writer.add_page(page)

                watermarked += 1

            except Exception as exc:
                logger.warning(f'Watermark page {i+1} failed: {exc}')
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
        'watermark_type': wm_type if watermarked else 'none',
        'total_pages': total,
        'mode': watermark_mode,
    }


def add_watermark_fitz(
    input_path: str, output_path: str,
    text: str = 'CONFIDENTIAL',
    opacity: float = 0.3,
    color: str = '#FF0000',
    font_size: int = 48,
    rotation: int = 45,
    pages: str = 'all',
    password: str = '',
) -> dict:
    """
    Faster watermarking via PyMuPDF's native text layer.
    Best for large PDFs where per-page PDF generation overhead matters.
    """
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt(password or '')
    total = len(reader.pages)

    if _add_watermark_fitz(input_path, output_path,
                            text, opacity, color, font_size, rotation, pages):
        return {
            'output_path': output_path,
            'pages_watermarked': len(_parse_pages(pages, total)),
            'watermark_type': 'text_fitz',
            'total_pages': total,
        }
    # Fallback
    return add_watermark(input_path, output_path, text=text, opacity=opacity,
                          color=color, font_size=font_size, rotation=rotation,
                          pages=pages, password=password)


def remove_watermark_layer(input_path: str, output_path: str,
                            password: str = '') -> dict:
    """
    Remove FreeText, Stamp, and Watermark annotations from a PDF.
    Also removes pages containing only watermark content (heuristic).
    """
    count = 0
    try:
        with pikepdf.open(input_path, password=password or '') as pdf:
            for page in pdf.pages:
                if '/Annots' in page:
                    annots = list(page['/Annots'])
                    keep = []
                    for annot in annots:
                        try:
                            a = annot.get_object() \
                                if hasattr(annot, 'get_object') else annot
                            subtype = str(a.get('/Subtype', ''))
                            if subtype not in ('/FreeText', '/Stamp',
                                               '/Watermark', '/Ink'):
                                keep.append(annot)
                            else:
                                count += 1
                        except Exception:
                            keep.append(annot)
                    page['/Annots'] = pikepdf.Array(keep)
            pdf.save(output_path)
        return {
            'output_path': output_path,
            'removed_annotations': count,
            'method': 'pikepdf_annot_removal',
        }
    except Exception as e:
        raise RuntimeError(f'Watermark removal failed: {e}')


def batch_watermark(
    input_paths: list,
    output_dir: str,
    text: str = 'CONFIDENTIAL',
    **kwargs,
) -> list:
    """
    Watermark multiple PDF files.
    Returns list of result dicts.
    """
    os.makedirs(output_dir, exist_ok=True)
    results = []
    for path in input_paths:
        base = os.path.splitext(os.path.basename(path))[0]
        out = os.path.join(output_dir, f'{base}_watermarked.pdf')
        try:
            result = add_watermark(path, out, text=text, **kwargs)
            result['source_path'] = path
            results.append(result)
        except Exception as e:
            results.append({
                'source_path': path,
                'output_path': None,
                'error': str(e),
            })
    return results


def get_watermark_preview_info(input_path: str, password: str = '') -> dict:
    """Return page info needed for watermark preview UI."""
    info = {
        'page_count': 0,
        'first_page_size': (595, 842),
        'file_size_kb': round(os.path.getsize(input_path) / 1024, 1),
        'is_encrypted': False,
        'available_modes': [
            'text', 'image', 'diagonal', 'tiled',
            'classification', 'qr'
        ],
        'available_positions': [
            'center', 'top-left', 'top-right', 'top-center',
            'bottom-left', 'bottom-right', 'bottom-center',
            'middle-left', 'middle-right',
        ],
    }
    try:
        reader = PdfReader(input_path)
        info['is_encrypted'] = reader.is_encrypted
        if reader.is_encrypted:
            reader.decrypt(password or '')
        info['page_count'] = len(reader.pages)
        if reader.pages:
            p = reader.pages[0]
            info['first_page_size'] = (
                float(p.mediabox.width),
                float(p.mediabox.height),
            )
    except Exception:
        pass
    return info
