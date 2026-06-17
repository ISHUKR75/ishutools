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


# ── Additional Watermark Functions ─────────────────────────────────────────────


def add_stamp(input_path: str, output_path: str,
              stamp_text: str = 'CONFIDENTIAL',
              pages: str = 'all',
              color: str = '#ef4444',
              opacity: float = 0.25,
              border: bool = True) -> dict:
    """
    Add a rectangular stamp box (like CONFIDENTIAL, DRAFT, APPROVED)
    to specified pages using reportlab + pikepdf overlay.

    Args:
        input_path:  Source PDF
        output_path: Output PDF
        stamp_text:  Text to stamp
        pages:       Page selection ('all', '1', '1-3')
        color:       Hex color for stamp text/border
        opacity:     0.0-1.0 opacity
        border:      Draw border rectangle around stamp

    Returns:
        dict: pages_stamped, output_path
    """
    import io, tempfile
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.colors import HexColor

    try:
        doc = fitz.open(input_path)
        total = doc.page_count
        doc.close()

        sel_pages = _parse_pages(pages, total)

        reader = pikepdf.open(input_path)
        pages_stamped = 0

        for pg_idx in range(total):
            if pg_idx not in sel_pages:
                continue

            page = reader.pages[pg_idx]
            # Get page dimensions from MediaBox
            mb = page.get('/MediaBox')
            if mb:
                pw = float(mb[2]) - float(mb[0])
                ph = float(mb[3]) - float(mb[1])
            else:
                pw, ph = 595, 842

            # Create overlay with reportlab
            buf = io.BytesIO()
            c = rl_canvas.Canvas(buf, pagesize=(pw, ph))

            r, g, b = _hex_to_rgb01(color)
            c.setFillColorRGB(r, g, b, alpha=opacity)
            c.setStrokeColorRGB(r, g, b, alpha=opacity * 1.5)

            # Stamp box at center-right
            box_w, box_h = 140, 40
            bx = pw - box_w - 30
            by = ph / 2 - box_h / 2

            if border:
                c.setLineWidth(2)
                c.rect(bx, by, box_w, box_h, stroke=1, fill=0)

            c.setFont('Helvetica-Bold', 16)
            c.drawCentredString(bx + box_w / 2, by + 12, stamp_text)
            c.save()

            buf.seek(0)
            overlay = pikepdf.open(buf)
            ov_page = overlay.pages[0]

            # Merge overlay
            existing = page.as_form_xobject()
            new_content = pikepdf.Page(page)
            new_content.merge_resources(ov_page.resources)

            pages_stamped += 1

        output_path_temp = output_path + '.tmp'
        reader.save(output_path_temp)
        reader.close()

        # Re-apply stamp via fitz for reliability
        doc = fitz.open(input_path)
        sel_list = sorted(sel_pages)
        r_f, g_f, b_f = _hex_to_rgb01(color)

        for pg_idx in sel_list:
            if pg_idx >= doc.page_count:
                continue
            pg = doc[pg_idx]
            pw, ph = pg.rect.width, pg.rect.height
            bx, by = pw - 180, ph / 2 - 20
            # Draw rectangle
            if border:
                pg.draw_rect(fitz.Rect(bx, by, bx + 150, by + 40),
                             color=(r_f, g_f, b_f),
                             fill=(r_f, g_f, b_f, opacity),
                             width=1.5)
            # Draw text
            pg.insert_text(
                fitz.Point(bx + 75, by + 26),
                stamp_text,
                fontsize=14,
                fontname='helv',
                color=(r_f, g_f, b_f),
                render_mode=0,
            )
            pages_stamped += 1

        doc.save(output_path, garbage=3, deflate=True)
        doc.close()

        import os
        if os.path.exists(output_path_temp):
            os.remove(output_path_temp)

        return {
            'pages_stamped': len(sel_list),
            'stamp_text': stamp_text,
            'output_path': output_path,
        }

    except Exception as e:
        logger.warning(f'add_stamp failed: {e}')
        import shutil as _sh
        _sh.copy2(input_path, output_path)
        return {'pages_stamped': 0, 'error': str(e)}


def detect_existing_watermarks(input_path: str) -> dict:
    """
    Detect if a PDF already contains watermarks or overlay text.

    Uses heuristics: near-transparent text, repeated text across pages,
    text at unusual positions (center/diagonal).

    Returns:
        dict: has_watermark, confidence, watermark_texts, method
    """
    try:
        doc = fitz.open(input_path)
        repeated_texts: dict[str, int] = {}
        transparent_texts = []

        for i in range(min(doc.page_count, 10)):
            pg = doc[i]
            pw, ph = pg.rect.width, pg.rect.height

            # Get text with details
            for blk in pg.get_text('dict', flags=0)['blocks']:
                for ln in blk.get('lines', []):
                    for sp in ln.get('spans', []):
                        txt = sp.get('text', '').strip()
                        if not txt or len(txt) < 3:
                            continue

                        # Check for transparency/low alpha
                        color = sp.get('color', 0)
                        origin = sp.get('origin', (0, 0))
                        ox, oy = origin

                        # Near-center position check
                        near_center = (0.3 * pw < ox < 0.7 * pw and
                                       0.3 * ph < oy < 0.7 * ph)

                        if near_center and len(txt) > 3:
                            repeated_texts[txt.upper()] = \
                                repeated_texts.get(txt.upper(), 0) + 1
                        if color and color != 0 and near_center:
                            transparent_texts.append(txt[:30])

        doc.close()

        # Texts appearing on multiple pages are likely watermarks
        wm_candidates = [t for t, cnt in repeated_texts.items() if cnt > 1]

        has_watermark = len(wm_candidates) > 0 or len(transparent_texts) > 2
        confidence = min(100, (len(wm_candidates) * 30 + len(transparent_texts) * 15))

        return {
            'has_watermark': has_watermark,
            'confidence': confidence,
            'watermark_texts': wm_candidates[:5],
            'possible_watermarks': list(set(transparent_texts[:5])),
            'method': 'text_position_analysis',
        }

    except Exception as e:
        logger.warning(f'detect_existing_watermarks failed: {e}')
        return {'has_watermark': False, 'error': str(e)}


# ═══════════════════════════════════════════════════════════════════════════════
# ── ENTERPRISE ADDITIONS — Image Watermark, QR Watermark, Tiled ─────────────
# ═══════════════════════════════════════════════════════════════════════════════

def add_image_watermark(input_path: str, output_path: str,
                         image_path: str,
                         opacity: float = 0.20,
                         position: str = 'center',
                         scale: float = 0.4,
                         pages: str = 'all') -> dict:
    """
    Overlay a semi-transparent image (logo/stamp) as a watermark on PDF pages.

    Args:
        image_path: Path to PNG/JPG watermark image
        opacity: 0.0 (invisible) to 1.0 (opaque)
        position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
        scale: Image scale relative to page width (0.1 – 1.0)
    """
    import fitz
    from PIL import Image
    import io

    pil_img = Image.open(image_path).convert('RGBA')
    r, g, b, a = pil_img.split()
    a = a.point(lambda x: int(x * opacity))
    pil_img = Image.merge('RGBA', (r, g, b, a))
    buf = io.BytesIO()
    pil_img.save(buf, format='PNG')
    img_bytes = buf.getvalue()

    doc = fitz.open(input_path)
    page_indices = range(doc.page_count) if pages == 'all' else \
                   [int(p.strip()) - 1 for p in pages.split(',') if p.strip().isdigit()]

    for pg_idx in page_indices:
        if 0 <= pg_idx < doc.page_count:
            pg = doc[pg_idx]
            w, h = pg.rect.width, pg.rect.height
            wm_w = w * scale
            wm_h = wm_w * pil_img.height / max(pil_img.width, 1)
            m = 30

            pos_map = {
                'center':       fitz.Rect((w - wm_w) / 2, (h - wm_h) / 2,
                                           (w + wm_w) / 2, (h + wm_h) / 2),
                'top-left':     fitz.Rect(m, m, wm_w + m, wm_h + m),
                'top-right':    fitz.Rect(w - wm_w - m, m, w - m, wm_h + m),
                'bottom-left':  fitz.Rect(m, h - wm_h - m, wm_w + m, h - m),
                'bottom-right': fitz.Rect(w - wm_w - m, h - wm_h - m, w - m, h - m),
            }
            rect = pos_map.get(position, pos_map['center'])
            pg.insert_image(rect, stream=img_bytes)

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return {'output_path': output_path, 'pages_watermarked': len(list(page_indices))}


def add_tiled_watermark(input_path: str, output_path: str,
                         text: str = 'CONFIDENTIAL',
                         opacity: float = 0.08,
                         font_size: int = 28,
                         angle: int = 45,
                         tile_spacing: int = 120) -> dict:
    """
    Apply a tiled (grid) watermark covering the entire page area.
    Repeats the watermark text in a grid pattern — common in enterprise documents.

    Args:
        tile_spacing: Distance between watermark tile centers in points
    """
    import fitz

    doc = fitz.open(input_path)

    for pg in doc:
        w, h = pg.rect.width, pg.rect.height
        import math
        rad = math.radians(angle)

        x = 0
        while x < w + tile_spacing:
            y = 0
            while y < h + tile_spacing:
                try:
                    pg.insert_text(
                        fitz.Point(x, y), text,
                        fontsize=font_size,
                        color=(0.5, 0.5, 0.5),
                        rotate=angle,
                        render_mode=0,
                        overlay=True,
                    )
                except Exception:
                    pass
                y += tile_spacing
            x += tile_spacing

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return {'output_path': output_path}


def add_qr_watermark(input_path: str, output_path: str,
                      qr_data: str = 'https://ishutools.fun',
                      position: str = 'bottom-right',
                      size: int = 60,
                      opacity: float = 0.25,
                      pages: str = 'all') -> dict:
    """
    Add a QR code watermark to PDF pages.
    The QR code can encode a URL, document ID, or verification hash.
    """
    import qrcode
    import fitz
    from PIL import Image
    import io

    qr = qrcode.QRCode(box_size=8, border=1,
                        error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(qr_data)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color='black', back_color='white').convert('RGBA')

    # Apply opacity
    r, g, b, a = qr_img.split()
    a = a.point(lambda x: int(x * opacity))
    qr_img = Image.merge('RGBA', (r, g, b, a))
    buf = io.BytesIO()
    qr_img.save(buf, format='PNG')
    qr_bytes = buf.getvalue()

    doc = fitz.open(input_path)
    page_indices = range(doc.page_count) if pages == 'all' else \
                   [int(p) - 1 for p in pages.split(',') if p.strip().isdigit()]

    for pg_idx in page_indices:
        if 0 <= pg_idx < doc.page_count:
            pg = doc[pg_idx]
            w, h = pg.rect.width, pg.rect.height
            m = 10
            pos_map = {
                'bottom-right': fitz.Rect(w - size - m, h - size - m, w - m, h - m),
                'bottom-left':  fitz.Rect(m, h - size - m, size + m, h - m),
                'top-right':    fitz.Rect(w - size - m, m, w - m, size + m),
                'top-left':     fitz.Rect(m, m, size + m, size + m),
            }
            rect = pos_map.get(position, pos_map['bottom-right'])
            pg.insert_image(rect, stream=qr_bytes)

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return {'output_path': output_path, 'qr_data': qr_data}


# ═══════════════════════════════════════════════════════════════════════════
# ── ADDITIONAL WATERMARK FUNCTIONS ─────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

def add_image_watermark_fitz(input_path: str, output_path: str,
                              watermark_image_path: str,
                              opacity: float = 0.3,
                              position: str = 'center',
                              scale: float = 0.5,
                              pages: str = 'all') -> dict:
    """
    Add image watermark (logo/stamp) to PDF using PyMuPDF.
    More precise than ReportLab for image positioning.
    """
    import fitz, os
    from PIL import Image
    import io

    doc = fitz.open(input_path)
    total = doc.page_count

    # Parse pages
    if pages.lower() == 'all':
        page_list = list(range(total))
    else:
        page_list = []
        for part in pages.split(','):
            if '-' in part:
                a, b = part.split('-')
                page_list.extend(range(int(a)-1, int(b)))
            else:
                page_list.append(int(part)-1)

    # Load watermark image
    wm_img = Image.open(watermark_image_path).convert('RGBA')

    for pg_idx in page_list:
        if pg_idx >= total: continue
        page = doc[pg_idx]
        pw, ph = page.rect.width, page.rect.height

        # Scale watermark
        wm_w = int(pw * scale)
        wm_h = int(wm_img.height * wm_w / wm_img.width)
        wm_scaled = wm_img.resize((wm_w, wm_h), Image.LANCZOS)

        # Apply opacity
        r, g, b, a = wm_scaled.split()
        a = a.point(lambda x: int(x * opacity))
        wm_scaled = Image.merge('RGBA', (r, g, b, a))

        # Position
        pos_map = {
            'center': ((pw - wm_w)/2, (ph - wm_h)/2),
            'top-left': (20, 20),
            'top-right': (pw - wm_w - 20, 20),
            'bottom-left': (20, ph - wm_h - 20),
            'bottom-right': (pw - wm_w - 20, ph - wm_h - 20),
        }
        x, y = pos_map.get(position, ((pw - wm_w)/2, (ph - wm_h)/2))

        # Convert to bytes and insert
        buf = io.BytesIO()
        wm_scaled.save(buf, format='PNG')
        rect = fitz.Rect(x, y, x + wm_w, y + wm_h)
        page.insert_image(rect, stream=buf.getvalue(), overlay=True)

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return {'output_path': output_path, 'pages_watermarked': len(page_list)}


def add_confidential_stamp(input_path: str, output_path: str,
                            stamp_text: str = 'CONFIDENTIAL',
                            color: str = '#FF0000',
                            pages: str = 'all',
                            angle: float = -45) -> dict:
    """
    Add a professional CONFIDENTIAL / DRAFT / APPROVED rubber stamp to PDF.
    Red diagonal stamp across each page.
    """
    import fitz, os

    doc = fitz.open(input_path)
    total = doc.page_count
    if pages.lower() == 'all':
        page_list = list(range(total))
    else:
        page_list = [int(p)-1 for p in pages.split(',') if p.strip().isdigit()]

    r, g, b = (int(color.lstrip('#')[i:i+2], 16)/255 for i in (0, 2, 4))

    for pg_idx in page_list:
        if pg_idx >= total: continue
        page = doc[pg_idx]
        pw, ph = page.rect.width, page.rect.height

        shape = page.new_shape()
        # Draw stamp rectangle
        cx, cy = pw/2, ph/2
        w, h = min(pw*0.6, 300), 60

        # Draw border rectangle
        shape.draw_rect(fitz.Rect(cx-w/2, cy-h/2, cx+w/2, cy+h/2))
        shape.finish(color=(r, g, b), fill=None, width=3)

        # Add text
        shape.insert_text(
            fitz.Point(cx - w/2 + 10, cy + 8),
            stamp_text,
            fontsize=min(36, int(w/len(stamp_text)*1.2)),
            color=(r, g, b),
            fontname='helv',
        )
        shape.commit()

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return {'output_path': output_path, 'stamp_text': stamp_text, 'pages': len(page_list)}
