"""
pdf_page_numbers.py - Add page numbers to PDF (Ultra-Enhanced)
IshuTools.fun | Professional PDF Suite

Libraries: pypdf, reportlab, fitz (PyMuPDF)
Features:
  - All 6 position presets (top/bottom × left/center/right)
  - Roman numeral support (i, ii, iii, iv, v...)
  - Skip pages option (e.g. skip first N pages)
  - Custom number format: 'Page X of Y', 'X/Y', 'X', Roman, Alpha
  - Font name and size customization
  - Color selection
  - Background box behind numbers
  - Opacity control
  - Only add numbers to specific pages
  - Running headers/footers
"""

import io
import re
from datetime import datetime

import fitz
from pypdf import PdfWriter, PdfReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.colors import HexColor


# ── Roman numeral converter ────────────────────────────────────────────────────

def to_roman(num: int) -> str:
    """Convert integer to Roman numeral string."""
    vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1]
    syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I']
    result = ''
    for v, s in zip(vals, syms):
        while num >= v:
            result += s
            num -= v
    return result


def to_alpha(num: int) -> str:
    """Convert number to alphabetic label (A, B, ..., Z, AA, AB...)."""
    result = ''
    while num > 0:
        num -= 1
        result = chr(65 + num % 26) + result
        num //= 26
    return result


def format_page_label(page_idx: int, total_pages: int,
                       start_num: int, number_format: str,
                       prefix: str, suffix: str) -> str:
    """
    Format a page number label.
    number_format: 'arabic' | 'roman' | 'roman_lower' | 'alpha' | 'of_total'
    """
    n = page_idx + start_num

    if number_format == 'roman':
        num_str = to_roman(n)
    elif number_format == 'roman_lower':
        num_str = to_roman(n).lower()
    elif number_format == 'alpha':
        num_str = to_alpha(n)
    elif number_format == 'of_total':
        num_str = f'{n} of {total_pages}'
    elif number_format == 'fraction':
        num_str = f'{n}/{total_pages}'
    elif number_format == 'page_of':
        num_str = f'Page {n} of {total_pages}'
    else:  # arabic
        num_str = str(n)

    return f'{prefix}{num_str}{suffix}'


# ── Overlay builders ──────────────────────────────────────────────────────────

POSITION_MAP = {
    'bottom-center': lambda w, h, m: (w / 2, m, 'center'),
    'bottom-left':   lambda w, h, m: (m, m, 'left'),
    'bottom-right':  lambda w, h, m: (w - m, m, 'right'),
    'top-center':    lambda w, h, m: (w / 2, h - m, 'center'),
    'top-left':      lambda w, h, m: (m, h - m, 'left'),
    'top-right':     lambda w, h, m: (w - m, h - m, 'right'),
}


def _hex_to_rgb(hex_color: str) -> tuple:
    h = hex_color.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255


def make_number_overlay(
    width: float, height: float, label: str,
    pos_key: str, font_size: int,
    color: str = '#111111',
    bg_color: str = '',
    font_name: str = 'Helvetica',
    margin: int = 28,
) -> bytes:
    """Create a page number overlay as PDF bytes."""
    packet = io.BytesIO()
    c = rl_canvas.Canvas(packet, pagesize=(width, height))

    fn = POSITION_MAP.get(pos_key, POSITION_MAP['bottom-center'])
    x, y, align = fn(width, height, margin)

    r, g, b = _hex_to_rgb(color)

    # Optional background box
    if bg_color:
        text_w = len(label) * font_size * 0.6
        text_h = font_size + 4
        bg_r, bg_g, bg_b = _hex_to_rgb(bg_color)
        c.setFillColorRGB(bg_r, bg_g, bg_b, alpha=0.8)
        c.setStrokeColorRGB(bg_r * 0.7, bg_g * 0.7, bg_b * 0.7)
        if align == 'center':
            c.roundRect(x - text_w / 2 - 4, y - 3, text_w + 8, text_h, 3, fill=1, stroke=1)
        elif align == 'left':
            c.roundRect(x - 4, y - 3, text_w + 8, text_h, 3, fill=1, stroke=1)
        else:
            c.roundRect(x - text_w - 4, y - 3, text_w + 8, text_h, 3, fill=1, stroke=1)

    c.setFont(font_name, font_size)
    c.setFillColorRGB(r, g, b)

    if align == 'center':
        c.drawCentredString(x, y, label)
    elif align == 'left':
        c.drawString(x, y, label)
    else:
        c.drawRightString(x, y, label)

    c.save()
    packet.seek(0)
    return packet.read()


# ── Main API ──────────────────────────────────────────────────────────────────

def add_page_numbers(
    input_path: str,
    output_path: str,
    position: str = 'bottom-center',
    start_num: int = 1,
    font_size: int = 11,
    prefix: str = '',
    suffix: str = '',
    number_format: str = 'arabic',
    color: str = '#111111',
    bg_color: str = '',
    font_name: str = 'Helvetica',
    skip_first_n: int = 0,
    only_pages: str = 'all',
    password: str = '',
) -> dict:
    """
    Add page numbers to a PDF with extensive customization.

    Args:
        input_path:      Source PDF
        output_path:     Output PDF
        position:        'bottom-center'|'bottom-left'|'bottom-right'|
                         'top-center'|'top-left'|'top-right'
        start_num:       Starting page number
        font_size:       Font size in points
        prefix:          Text before number (e.g. 'Page ')
        suffix:          Text after number (e.g. '.')
        number_format:   'arabic'|'roman'|'roman_lower'|'alpha'|
                         'of_total'|'fraction'|'page_of'
        color:           Hex text color
        bg_color:        Hex background box color ('' = none)
        font_name:       'Helvetica'|'Helvetica-Bold'|'Helvetica-Oblique'|'Courier'|'Times-Roman'
        skip_first_n:    Skip first N pages (e.g. skip cover page)
        only_pages:      'all' or comma/range string e.g. '2-10'
        password:        PDF password if encrypted
    Returns:
        dict with output_path, pages_numbered, total_pages
    """
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt(password or '')
    writer = PdfWriter()

    total = len(reader.pages)

    # Parse only_pages
    if only_pages.strip().lower() == 'all':
        number_indices = set(range(total))
    else:
        number_indices = set()
        for part in only_pages.replace(' ', '').split(','):
            if '-' in part:
                a, b = part.split('-', 1)
                try:
                    number_indices.update(range(int(a) - 1, int(b)))
                except ValueError:
                    pass
            elif part.isdigit():
                number_indices.add(int(part) - 1)

    # Apply skip_first_n
    for i in range(min(skip_first_n, total)):
        number_indices.discard(i)

    pages_numbered = 0
    page_counter = 0  # Sequential counter for number label

    for i, page in enumerate(reader.pages):
        if i in number_indices:
            label = format_page_label(
                page_counter, total - skip_first_n,
                start_num, number_format, prefix, suffix)

            box = page.mediabox
            w = float(box.width)
            h = float(box.height)

            try:
                overlay_bytes = make_number_overlay(
                    w, h, label, position, font_size,
                    color, bg_color, font_name)
                overlay_reader = PdfReader(io.BytesIO(overlay_bytes))
                page.merge_page(overlay_reader.pages[0])
                pages_numbered += 1
            except Exception:
                pass
            page_counter += 1

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
        'pages_numbered': pages_numbered,
        'total_pages': total,
        'format_used': number_format,
        'position': position,
    }


def add_running_header(
    input_path: str,
    output_path: str,
    header_text: str = '',
    footer_text: str = '',
    font_size: int = 9,
    color: str = '#6B7280',
    skip_first: bool = True,
    password: str = '',
) -> dict:
    """
    Add running header and/or footer text to all pages.

    Args:
        header_text: Text for top of each page (supports {page} and {total})
        footer_text: Text for bottom of each page
        skip_first:  Skip first page (e.g. title page)
    """
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt(password or '')
    writer = PdfWriter()
    total = len(reader.pages)
    pages_modified = 0

    for i, page in enumerate(reader.pages):
        if skip_first and i == 0:
            writer.add_page(page)
            continue

        box = page.mediabox
        w = float(box.width)
        h = float(box.height)

        packet = io.BytesIO()
        c = rl_canvas.Canvas(packet, pagesize=(w, h))
        r, g, b = _hex_to_rgb(color)
        c.setFillColorRGB(r, g, b)
        c.setFont('Helvetica', font_size)

        if header_text:
            txt = header_text.replace('{page}', str(i + 1)).replace('{total}', str(total))
            c.drawCentredString(w / 2, h - 18, txt)
            c.setStrokeColorRGB(r, g, b, alpha=0.3)
            c.setLineWidth(0.5)
            c.line(36, h - 22, w - 36, h - 22)

        if footer_text:
            txt = footer_text.replace('{page}', str(i + 1)).replace('{total}', str(total))
            c.setStrokeColorRGB(r, g, b, alpha=0.3)
            c.setLineWidth(0.5)
            c.line(36, 22, w - 36, 22)
            c.drawCentredString(w / 2, 8, txt)

        c.save()
        packet.seek(0)
        overlay_reader = PdfReader(io.BytesIO(packet.read()))
        page.merge_page(overlay_reader.pages[0])
        pages_modified += 1
        writer.add_page(page)

    with open(output_path, 'wb') as f:
        writer.write(f)

    return {
        'output_path': output_path,
        'pages_modified': pages_modified,
        'total_pages': total,
    }
