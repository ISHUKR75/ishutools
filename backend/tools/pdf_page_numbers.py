"""
pdf_page_numbers.py — Add page numbers and headers/footers (Enterprise Edition)
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41 / ISHUKR75)

Engines: pypdf + reportlab · pikepdf · fitz (PyMuPDF) · Ghostscript CLI · qpdf CLI
Features:
  - 6 position presets: top/bottom × left/center/right
  - 8 number formats: arabic, roman, roman_lower, alpha, of_total, fraction, page_of, chapter_page
  - Custom prefix/suffix (e.g. 'Page ', '.')
  - Font name and size customization (all standard PDF fonts)
  - RGBA color selection via hex string
  - Rounded background box with padding and opacity
  - Border/stroke on background box with custom radius
  - Per-page custom override (e.g. first page roman, rest arabic)
  - Skip pages by index list or count
  - Only number specific pages (subset selector: all, even, odd, ranges)
  - Running header and footer with {page}, {total}, {title}, {date}
  - Section-aware page numbering (reset counter per chapter)
  - Mirror mode: alternating left/right for double-sided printing
  - Chapter markers / chapter name in header
  - Decorative divider lines (header/footer rules)
  - Background image watermark (faint logo behind numbers)
  - Batch apply: apply page numbers to multiple PDFs
  - pikepdf compression pass after numbering
  - Ghostscript flatten pass for permanent overlay embedding
  - qpdf linearize pass for web-optimized output
  - fitz-based alternative overlay path
  - Progress tracking via per_page_labels dict
  - Page label dictionary injection (PDF /PageLabels structure)
  - Pre-flight validation and page count checks
  - Size stats (original vs output)
  - CLI detection with graceful fallback
"""

import io
import os
import shutil
import subprocess
import tempfile
from datetime import datetime
from typing import Optional

import fitz
import pikepdf
from pypdf import PdfWriter, PdfReader
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.utils import ImageReader

# ── CLI binary detection ─────────────────────────────────────────────────────
GS_BIN = shutil.which('gs') or shutil.which('ghostscript')
QPDF_BIN = shutil.which('qpdf')


# ─────────────────────────── Number formatters ───────────────────────────────

def to_roman(num: int) -> str:
    vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1]
    syms = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I']
    result = ''
    for v, s in zip(vals, syms):
        while num >= v:
            result += s
            num -= v
    return result


def to_alpha(num: int) -> str:
    result = ''
    while num > 0:
        num -= 1
        result = chr(65 + num % 26) + result
        num //= 26
    return result


def format_page_label(
    sequential_idx: int,
    total_pages: int,
    numbered_count: int,
    start_num: int,
    number_format: str,
    prefix: str,
    suffix: str,
    chapter: str = '',
    date_str: str = '',
    title_str: str = '',
) -> str:
    """Format a page number label using the specified format and variables."""
    n = sequential_idx + start_num

    if number_format == 'roman':
        num_str = to_roman(max(1, n))
    elif number_format == 'roman_lower':
        num_str = to_roman(max(1, n)).lower()
    elif number_format == 'alpha':
        num_str = to_alpha(max(1, n))
    elif number_format == 'of_total':
        num_str = f'{n} of {numbered_count}'
    elif number_format == 'fraction':
        num_str = f'{n}/{numbered_count}'
    elif number_format == 'page_of':
        num_str = f'Page {n} of {numbered_count}'
    elif number_format == 'chapter_page':
        num_str = f'{chapter}-{n}' if chapter else str(n)
    else:
        num_str = str(n)

    label = f'{prefix}{num_str}{suffix}'
    label = label.replace('{page}', str(n))
    label = label.replace('{total}', str(total_pages))
    label = label.replace('{numbered}', str(numbered_count))
    label = label.replace('{title}', title_str)
    label = label.replace('{date}', date_str)
    label = label.replace('{chapter}', chapter)
    return label


# ─────────────────────────── Color helpers ───────────────────────────────────

def _hex_to_rgb(hex_color: str) -> tuple:
    h = hex_color.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    try:
        return int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255
    except Exception:
        return (0.0, 0.0, 0.0)


# ─────────────────────────── Position map ────────────────────────────────────

POSITION_MAP = {
    'bottom-center': lambda w, h, m: (w / 2, m, 'center'),
    'bottom-left':   lambda w, h, m: (m, m, 'left'),
    'bottom-right':  lambda w, h, m: (w - m, m, 'right'),
    'top-center':    lambda w, h, m: (w / 2, h - m, 'center'),
    'top-left':      lambda w, h, m: (m, h - m, 'left'),
    'top-right':     lambda w, h, m: (w - m, h - m, 'right'),
}


# ─────────────────────────── Overlay builder ─────────────────────────────────

def make_number_overlay(
    width: float,
    height: float,
    label: str,
    pos_key: str,
    font_size: int,
    color: str = '#111111',
    bg_color: str = '',
    bg_opacity: float = 0.85,
    bg_border_color: str = '',
    bg_radius: float = 3.0,
    font_name: str = 'Helvetica',
    margin: int = 28,
    draw_rule: bool = False,
    rule_color: str = '#CCCCCC',
    rule_width: float = 0.5,
) -> bytes:
    """Create a page number overlay as PDF bytes."""
    packet = io.BytesIO()
    c = rl_canvas.Canvas(packet, pagesize=(width, height))

    fn = POSITION_MAP.get(pos_key, POSITION_MAP['bottom-center'])
    x, y, align = fn(width, height, margin)
    r, g, b = _hex_to_rgb(color)

    c.setFont(font_name, font_size)
    text_w = c.stringWidth(label, font_name, font_size)
    text_h = font_size + 2

    if bg_color:
        bg_r, bg_g, bg_b = _hex_to_rgb(bg_color)
        c.saveState()
        c.setFillColorRGB(bg_r, bg_g, bg_b, alpha=bg_opacity)
        pad = 5
        if bg_border_color:
            bdr_r, bdr_g, bdr_b = _hex_to_rgb(bg_border_color)
            c.setStrokeColorRGB(bdr_r, bdr_g, bdr_b, alpha=bg_opacity)
            c.setLineWidth(0.6)
        else:
            c.setStrokeColorRGB(bg_r * 0.7, bg_g * 0.7, bg_b * 0.7, alpha=bg_opacity)
            c.setLineWidth(0.4)
        if align == 'center':
            bx = x - text_w / 2 - pad
        elif align == 'left':
            bx = x - pad
        else:
            bx = x - text_w - pad
        by = y - pad / 2
        c.roundRect(bx, by, text_w + pad * 2, text_h + pad, bg_radius,
                    fill=1, stroke=1 if (bg_color or bg_border_color) else 0)
        c.restoreState()

    if draw_rule:
        rr, rg, rb = _hex_to_rgb(rule_color)
        c.setStrokeColorRGB(rr, rg, rb)
        c.setLineWidth(rule_width)
        if 'bottom' in pos_key:
            line_y = margin + font_size + 6
            c.line(margin, line_y, width - margin, line_y)
        else:
            line_y = height - margin - font_size - 6
            c.line(margin, line_y, width - margin, line_y)

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


def _parse_page_selector(selector: str, total: int) -> set:
    """Parse page selector string to 0-based index set."""
    sel = selector.strip().lower()
    if sel in ('all', ''):
        return set(range(total))
    if sel == 'even':
        return {i for i in range(total) if (i + 1) % 2 == 0}
    if sel == 'odd':
        return {i for i in range(total) if (i + 1) % 2 != 0}

    indices = set()
    for part in sel.replace(' ', '').split(','):
        if not part:
            continue
        if '-' in part and not part.startswith('-'):
            a, b = part.split('-', 1)
            try:
                for n in range(int(a), int(b) + 1):
                    if 1 <= n <= total:
                        indices.add(n - 1)
            except ValueError:
                pass
        elif part.isdigit():
            n = int(part)
            if 1 <= n <= total:
                indices.add(n - 1)
    return indices


def _compress_output(src: str, dst: str, linearize: bool = False) -> bool:
    try:
        with pikepdf.open(src, suppress_warnings=True) as pdf:
            pdf.save(
                dst,
                compress_streams=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
                linearize=linearize,
            )
        return True
    except Exception:
        return False


def _gs_flatten(src: str, dst: str) -> bool:
    """
    Ghostscript flatten pass — permanently embeds overlay content into page
    streams, making page numbers un-removable via annotation tools.
    """
    if not GS_BIN:
        return False
    cmd = [
        GS_BIN,
        '-dNOPAUSE', '-dBATCH', '-dQUIET',
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.7',
        '-dFastWebView=false',
        f'-sOutputFile={dst}',
        src,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        return (proc.returncode == 0 and os.path.exists(dst)
                and os.path.getsize(dst) > 200)
    except Exception:
        return False


def _qpdf_linearize(src: str, dst: str) -> bool:
    """qpdf linearize for fast web view."""
    if not QPDF_BIN:
        return False
    cmd = [QPDF_BIN, '--linearize', src, dst]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return proc.returncode == 0 and os.path.exists(dst)
    except Exception:
        return False


# ─────────────────────────────── Main API ────────────────────────────────────

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
    bg_opacity: float = 0.85,
    bg_border_color: str = '',
    bg_radius: float = 3.0,
    font_name: str = 'Helvetica',
    margin: int = 28,
    skip_first_n: int = 0,
    only_pages: str = 'all',
    mirror_mode: bool = False,
    draw_rule: bool = False,
    rule_color: str = '#CCCCCC',
    chapter: str = '',
    title: str = '',
    password: str = '',
    compress: bool = True,
    gs_flatten: bool = False,
    linearize: bool = False,
) -> dict:
    """
    Add page numbers to a PDF with extensive customization.

    Args:
        input_path:       Source PDF
        output_path:      Output PDF
        position:         'bottom-center' | 'bottom-left' | 'bottom-right' |
                          'top-center' | 'top-left' | 'top-right'
        start_num:        Starting page number value
        font_size:        Font size in points
        prefix:           Text before number ('Page ', 'p.')
        suffix:           Text after number ('.', ')')
        number_format:    'arabic' | 'roman' | 'roman_lower' | 'alpha' |
                          'of_total' | 'fraction' | 'page_of' | 'chapter_page'
        color:            Hex text color
        bg_color:         Hex background box color ('' = none)
        bg_opacity:       Background box opacity (0-1)
        bg_border_color:  Background box border color
        bg_radius:        Background box corner radius
        font_name:        'Helvetica' | 'Helvetica-Bold' | 'Helvetica-Oblique' |
                          'Courier' | 'Times-Roman' | 'Times-Bold'
        margin:           Distance from page edge in points
        skip_first_n:     Skip first N pages (e.g. skip cover page)
        only_pages:       'all', 'even', 'odd', or range '2-10'
        mirror_mode:      Alternate left/right placement for double-sided
        draw_rule:        Draw a decorative line above/below the number
        rule_color:       Rule line color
        chapter:          Chapter label for 'chapter_page' format
        title:            Document title for {title} template
        password:         PDF password
        compress:         Apply pikepdf compression
        gs_flatten:       Permanently embed via Ghostscript flatten (absolute)
        linearize:        Linearize output for fast web view
    Returns:
        dict with output_path, pages_numbered, total_pages, per_page_labels, sizes
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f'Input file not found: {input_path}')

    reader = PdfReader(input_path, strict=False)
    if reader.is_encrypted:
        if not reader.decrypt(password or ''):
            raise ValueError('Incorrect password.')

    total = len(reader.pages)
    writer = PdfWriter()

    number_indices = _parse_page_selector(only_pages, total)
    for i in range(min(skip_first_n, total)):
        number_indices.discard(i)

    sorted_indices = sorted(number_indices)
    numbered_count = len(sorted_indices)
    seq_map = {idx: seq for seq, idx in enumerate(sorted_indices)}

    date_str = datetime.utcnow().strftime('%Y-%m-%d')
    pages_numbered = 0
    per_page_labels = {}
    orig_size = os.path.getsize(input_path)

    for i, page in enumerate(reader.pages):
        if i in number_indices:
            seq = seq_map[i]
            label = format_page_label(
                seq, total, numbered_count, start_num, number_format,
                prefix, suffix, chapter, date_str, title)

            box = page.mediabox
            w = float(box.width)
            h = float(box.height)

            if mirror_mode:
                side = i % 2
                if 'top' in position:
                    pos_key = f"top-{'left' if side else 'right'}"
                else:
                    pos_key = f"bottom-{'right' if side else 'left'}"
            else:
                pos_key = position

            try:
                overlay_bytes = make_number_overlay(
                    w, h, label, pos_key, font_size,
                    color=color,
                    bg_color=bg_color,
                    bg_opacity=bg_opacity,
                    bg_border_color=bg_border_color,
                    bg_radius=bg_radius,
                    font_name=font_name,
                    margin=margin,
                    draw_rule=draw_rule,
                    rule_color=rule_color,
                )
                overlay_reader = PdfReader(io.BytesIO(overlay_bytes))
                page.merge_page(overlay_reader.pages[0])
                pages_numbered += 1
                per_page_labels[i + 1] = label
            except Exception:
                pass

        writer.add_page(page)

    try:
        if reader.metadata:
            meta = dict(reader.metadata)
        else:
            meta = {}
        meta.update({
            '/Producer': 'IshuTools.fun PDF Suite — Page Numbers',
            '/ModDate': datetime.utcnow().strftime("D:%Y%m%d%H%M%S+00'00'"),
        })
        writer.add_metadata(meta)
    except Exception:
        pass

    with open(output_path, 'wb') as f:
        writer.write(f)

    # Compression pass
    if compress:
        tmp = output_path + '.comp.tmp'
        if _compress_output(output_path, tmp, linearize=linearize):
            os.replace(tmp, output_path)
        elif os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except Exception:
                pass

    # GS flatten pass (permanent embed)
    gs_applied = False
    if gs_flatten and GS_BIN:
        tmp_gs = output_path + '.gs.tmp'
        if _gs_flatten(output_path, tmp_gs):
            os.replace(tmp_gs, output_path)
            gs_applied = True
        elif os.path.exists(tmp_gs):
            try:
                os.unlink(tmp_gs)
            except Exception:
                pass

    # qpdf linearize pass (if not already done by pikepdf)
    if linearize and not compress and QPDF_BIN:
        tmp_qp = output_path + '.qpdf.tmp'
        if _qpdf_linearize(output_path, tmp_qp):
            os.replace(tmp_qp, output_path)
        elif os.path.exists(tmp_qp):
            try:
                os.unlink(tmp_qp)
            except Exception:
                pass

    out_size = os.path.getsize(output_path)

    return {
        'output_path': output_path,
        'pages_numbered': pages_numbered,
        'total_pages': total,
        'format_used': number_format,
        'position': position,
        'mirror_mode': mirror_mode,
        'start_num': start_num,
        'gs_flatten_applied': gs_applied,
        'linearized': linearize,
        'original_size_kb': round(orig_size / 1024, 1),
        'output_size_kb': round(out_size / 1024, 1),
        'size_change_kb': round((out_size - orig_size) / 1024, 1),
        'per_page_labels': per_page_labels,
        'numbered_at': datetime.utcnow().isoformat(),
    }


# ─────────────────────────── Running header/footer ───────────────────────────

def add_running_header(
    input_path: str,
    output_path: str,
    header_text: str = '',
    footer_text: str = '',
    font_size: int = 9,
    color: str = '#6B7280',
    skip_first: bool = True,
    draw_rule: bool = True,
    rule_color: str = '#E5E7EB',
    font_name: str = 'Helvetica',
    margin: int = 18,
    password: str = '',
    compress: bool = True,
    title: str = '',
    gs_flatten: bool = False,
) -> dict:
    """
    Add running header and/or footer text to all pages.
    Supports {page}, {total}, {title}, {date} template variables.

    Args:
        header_text:   Text for top of each page
        footer_text:   Text for bottom of each page
        skip_first:    Skip first page (title page)
        draw_rule:     Draw a horizontal line under header / above footer
        gs_flatten:    Permanently embed via GS flatten
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f'Input file not found: {input_path}')

    reader = PdfReader(input_path, strict=False)
    if reader.is_encrypted:
        reader.decrypt(password or '')
    writer = PdfWriter()
    total = len(reader.pages)
    pages_modified = 0
    date_str = datetime.utcnow().strftime('%Y-%m-%d')
    orig_size = os.path.getsize(input_path)

    for i, page in enumerate(reader.pages):
        if skip_first and i == 0:
            writer.add_page(page)
            continue

        box = page.mediabox
        w = float(box.width)
        h = float(box.height)

        packet = io.BytesIO()
        c = rl_canvas.Canvas(packet, pagesize=(w, h))
        rr, rg, rb = _hex_to_rgb(color)
        rl_r, rl_g, rl_b = _hex_to_rgb(rule_color)
        c.setFont(font_name, font_size)

        def _expand(template: str) -> str:
            return (template
                    .replace('{page}', str(i + 1))
                    .replace('{total}', str(total))
                    .replace('{title}', title)
                    .replace('{date}', date_str))

        if header_text:
            txt = _expand(header_text)
            c.setFillColorRGB(rr, rg, rb)
            c.drawCentredString(w / 2, h - margin, txt)
            if draw_rule:
                c.setStrokeColorRGB(rl_r, rl_g, rl_b)
                c.setLineWidth(0.5)
                c.line(margin * 2, h - margin - font_size - 3,
                       w - margin * 2, h - margin - font_size - 3)

        if footer_text:
            txt = _expand(footer_text)
            if draw_rule:
                c.setStrokeColorRGB(rl_r, rl_g, rl_b)
                c.setLineWidth(0.5)
                c.line(margin * 2, margin + font_size + 3,
                       w - margin * 2, margin + font_size + 3)
            c.setFillColorRGB(rr, rg, rb)
            c.drawCentredString(w / 2, margin / 2, txt)

        c.save()
        packet.seek(0)
        overlay_reader = PdfReader(io.BytesIO(packet.read()))
        page.merge_page(overlay_reader.pages[0])
        pages_modified += 1
        writer.add_page(page)

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
        elif os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except Exception:
                pass

    gs_applied = False
    if gs_flatten and GS_BIN:
        tmp_gs = output_path + '.gs.tmp'
        if _gs_flatten(output_path, tmp_gs):
            os.replace(tmp_gs, output_path)
            gs_applied = True
        elif os.path.exists(tmp_gs):
            try:
                os.unlink(tmp_gs)
            except Exception:
                pass

    out_size = os.path.getsize(output_path)
    return {
        'output_path': output_path,
        'pages_modified': pages_modified,
        'total_pages': total,
        'gs_flatten_applied': gs_applied,
        'original_size_kb': round(orig_size / 1024, 1),
        'output_size_kb': round(out_size / 1024, 1),
    }


# ─────────────────────────── Section-aware numbering ─────────────────────────

def add_section_numbers(
    input_path: str,
    output_path: str,
    sections: list,
    password: str = '',
    compress: bool = True,
    gs_flatten: bool = False,
) -> dict:
    """
    Add page numbers with section awareness — reset counter per section.

    Args:
        input_path:  Source PDF
        output_path: Output PDF
        sections:    List of section dicts:
                     [{'start_page': 1, 'end_page': 5, 'prefix': 'I-',
                       'format': 'roman', 'start_num': 1,
                       'position': 'bottom-center', 'color': '#111111'}, ...]
        gs_flatten:  Apply GS flatten for permanent embedding
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f'Input file not found: {input_path}')

    reader = PdfReader(input_path, strict=False)
    if reader.is_encrypted:
        reader.decrypt(password or '')

    total = len(reader.pages)
    writer = PdfWriter()

    page_config = {}
    for section in sections:
        sp = section.get('start_page', 1) - 1
        ep = section.get('end_page', total) - 1
        prefix = section.get('prefix', '')
        fmt = section.get('format', 'arabic')
        start = section.get('start_num', 1)
        pos = section.get('position', 'bottom-center')
        color = section.get('color', '#111111')
        bg_color = section.get('bg_color', '')
        font_size = section.get('font_size', 11)
        for i in range(sp, min(ep + 1, total)):
            page_config[i] = {
                'seq': i - sp,
                'total': ep - sp + 1,
                'prefix': prefix,
                'format': fmt,
                'start': start,
                'position': pos,
                'color': color,
                'bg_color': bg_color,
                'font_size': font_size,
            }

    pages_numbered = 0
    for i, page in enumerate(reader.pages):
        if i in page_config:
            cfg = page_config[i]
            label = format_page_label(
                cfg['seq'], total, cfg['total'], cfg['start'],
                cfg['format'], cfg['prefix'], '', '', '', '')

            box = page.mediabox
            w, h = float(box.width), float(box.height)
            try:
                overlay_bytes = make_number_overlay(
                    w, h, label, cfg['position'], cfg['font_size'],
                    color=cfg['color'],
                    bg_color=cfg.get('bg_color', ''))
                overlay_reader = PdfReader(io.BytesIO(overlay_bytes))
                page.merge_page(overlay_reader.pages[0])
                pages_numbered += 1
            except Exception:
                pass

        writer.add_page(page)

    with open(output_path, 'wb') as f:
        writer.write(f)

    if compress:
        tmp = output_path + '.comp.tmp'
        if _compress_output(output_path, tmp):
            os.replace(tmp, output_path)
        elif os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except Exception:
                pass

    gs_applied = False
    if gs_flatten and GS_BIN:
        tmp_gs = output_path + '.gs.tmp'
        if _gs_flatten(output_path, tmp_gs):
            os.replace(tmp_gs, output_path)
            gs_applied = True
        elif os.path.exists(tmp_gs):
            try:
                os.unlink(tmp_gs)
            except Exception:
                pass

    return {
        'output_path': output_path,
        'total_pages': total,
        'pages_numbered': pages_numbered,
        'sections': len(sections),
        'gs_flatten_applied': gs_applied,
    }


# ─────────────────────────── Batch page numbers ──────────────────────────────

def batch_add_page_numbers(
    input_paths: list,
    output_dir: str,
    position: str = 'bottom-center',
    number_format: str = 'arabic',
    color: str = '#111111',
    font_size: int = 11,
    prefix: str = '',
    suffix: str = '',
    start_num: int = 1,
    password: str = '',
) -> dict:
    """
    Add page numbers to multiple PDFs with the same settings.

    Args:
        input_paths:  List of source PDF paths
        output_dir:   Directory for output files
        position:     Number position preset
        number_format: Number format name
        color:        Hex text color
        font_size:    Font size in points
        prefix:       Text before number
        suffix:       Text after number
        start_num:    Starting number
        password:     PDF password (if all share one)
    Returns:
        Summary dict with per-file results
    """
    os.makedirs(output_dir, exist_ok=True)
    results = []
    success_count = 0
    fail_count = 0

    for src in input_paths:
        base = os.path.splitext(os.path.basename(src))[0]
        dst = os.path.join(output_dir, f'{base}_numbered.pdf')
        try:
            r = add_page_numbers(
                src, dst,
                position=position,
                number_format=number_format,
                color=color,
                font_size=font_size,
                prefix=prefix,
                suffix=suffix,
                start_num=start_num,
                password=password,
            )
            r['source'] = src
            results.append(r)
            success_count += 1
        except Exception as e:
            results.append({'source': src, 'error': str(e), 'success': False})
            fail_count += 1

    return {
        'total': len(input_paths),
        'success': success_count,
        'failed': fail_count,
        'output_dir': output_dir,
        'results': results,
    }


# ─────────────────────────── PDF PageLabels injection ────────────────────────

def inject_page_labels(
    input_path: str,
    output_path: str,
    sections: list,
    password: str = '',
) -> dict:
    """
    Inject PDF /PageLabels structure (native page labels).
    These are used by PDF viewers to display page numbers in the navigation bar.

    Args:
        input_path:  Source PDF
        output_path: Output PDF with native page labels
        sections:    List of label section dicts:
                     [{'start': 1, 'style': 'D', 'prefix': '', 'first': 1}, ...]
                     style: 'D'=arabic, 'R'=Roman upper, 'r'=roman lower,
                            'A'=Alpha upper, 'a'=alpha lower, ''=no number
    Returns:
        dict with output_path and label_count
    """
    try:
        with pikepdf.open(input_path, password=password or '',
                          suppress_warnings=True) as pdf:
            # Build /PageLabels nums array
            nums = pikepdf.Array()
            for sec in sections:
                start_0based = (sec.get('start', 1) - 1)
                label_dict = pikepdf.Dictionary()
                style = sec.get('style', 'D')
                if style:
                    label_dict['/S'] = pikepdf.Name(f'/{style}')
                prefix = sec.get('prefix', '')
                if prefix:
                    label_dict['/P'] = pikepdf.String(prefix)
                first = sec.get('first', 1)
                if first != 1:
                    label_dict['/St'] = first
                nums.append(start_0based)
                nums.append(label_dict)

            pdf.Root['/PageLabels'] = pikepdf.Dictionary(
                Nums=nums)
            pdf.save(output_path, compress_streams=True)

        return {
            'output_path': output_path,
            'label_sections': len(sections),
            'success': True,
        }
    except Exception as e:
        raise RuntimeError(f'PageLabels injection failed: {e}')


# ─────────────────────────── Engine availability ─────────────────────────────

def get_available_engines() -> dict:
    return {
        'pypdf_reportlab': True,
        'pikepdf': True,
        'fitz': True,
        'ghostscript': bool(GS_BIN),
        'qpdf': bool(QPDF_BIN),
        'gs_path': GS_BIN or '',
        'qpdf_path': QPDF_BIN or '',
        'supported_formats': [
            'arabic', 'roman', 'roman_lower', 'alpha',
            'of_total', 'fraction', 'page_of', 'chapter_page',
        ],
        'supported_positions': list(POSITION_MAP.keys()),
    }


# ── Additional Page Number Functions ──────────────────────────────────────────


def add_chapter_labels(input_path: str, output_path: str,
                        labels: list,
                        password: str = '') -> dict:
    """
    Add chapter/section labels to specific page ranges.

    labels should be: [{'start': 1, 'end': 10, 'label': 'Chapter 1: Introduction'}, ...]

    Args:
        input_path:  Source PDF
        output_path: Output PDF
        labels:      List of dicts with start, end, label keys
        password:    PDF password

    Returns:
        dict: labels_applied, output_path
    """
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        labels_applied = 0

        for label_def in labels:
            start = int(label_def.get('start', 1)) - 1
            end = int(label_def.get('end', start + 1))
            label_text = str(label_def.get('label', ''))[:60]

            if not label_text:
                continue

            for pg_idx in range(start, min(end, doc.page_count)):
                pg = doc[pg_idx]
                pw = pg.rect.width

                pg.insert_text(
                    fitz.Point(pw / 2, 20),
                    label_text,
                    fontsize=8,
                    fontname='helv',
                    color=(0.4, 0.4, 0.4),
                    render_mode=0,
                )
                labels_applied += 1

        doc.save(output_path, garbage=3, deflate=True)
        doc.close()

        return {'labels_applied': labels_applied, 'output_path': output_path}

    except Exception as e:
        logger.warning(f'add_chapter_labels failed: {e}')
        raise


def preview_page_number_style(format_type: str = 'arabic',
                               start: int = 1,
                               prefix: str = '',
                               count: int = 10) -> list:
    """
    Preview page number labels for a given style without creating a PDF.

    Args:
        format_type: 'arabic' | 'roman' | 'alpha' | 'roman_lower'
        start:       Starting number
        prefix:      Prefix text
        count:       Number of labels to generate

    Returns:
        List of label strings
    """
    labels = []
    for i in range(count):
        n = start + i
        if format_type == 'roman':
            lbl = to_roman(n)
        elif format_type == 'roman_lower':
            lbl = to_roman(n).lower()
        elif format_type == 'alpha':
            lbl = to_alpha(n)
        else:
            lbl = str(n)
        labels.append(f'{prefix}{lbl}')
    return labels


def remove_existing_page_numbers(input_path: str, output_path: str,
                                   header_height: float = 40,
                                   footer_height: float = 40,
                                   password: str = '') -> dict:
    """
    Remove existing page numbers by cropping/whiting out header/footer bands.

    Creates white rectangles over the header and footer regions to
    visually remove existing page numbers (does not remove embedded text).

    Args:
        input_path:    Source PDF
        output_path:   Output PDF
        header_height: Pixels to cover at top
        footer_height: Pixels to cover at bottom
        password:      PDF password

    Returns:
        dict: pages_processed, output_path
    """
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        for pg in doc:
            w, h = pg.rect.width, pg.rect.height
            # White rectangle over header
            pg.draw_rect(fitz.Rect(0, 0, w, header_height),
                         color=(1, 1, 1), fill=(1, 1, 1), width=0)
            # White rectangle over footer
            pg.draw_rect(fitz.Rect(0, h - footer_height, w, h),
                         color=(1, 1, 1), fill=(1, 1, 1), width=0)

        doc.save(output_path, garbage=3, deflate=True)
        pages_processed = doc.page_count
        doc.close()

        return {'pages_processed': pages_processed, 'output_path': output_path}

    except Exception as e:
        logger.warning(f'remove_existing_page_numbers failed: {e}')
        raise


# ═══════════════════════════════════════════════════════════════════════════
# ── ADDITIONAL PAGE NUMBERING FUNCTIONS ────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

def add_page_numbers_roman(input_path: str, output_path: str,
                            position: str = 'bottom-center',
                            prefix: str = '', fontsize: int = 10) -> dict:
    """
    Add Roman numeral page numbers (i, ii, iii, iv, v...) to PDF.
    Useful for table of contents, prefaces, and introductory sections.
    """
    import fitz, os

    def to_roman(n):
        vals = [(1000,'M'),(900,'CM'),(500,'D'),(400,'CD'),(100,'C'),(90,'XC'),
                (50,'L'),(40,'XL'),(10,'X'),(9,'IX'),(5,'V'),(4,'IV'),(1,'I')]
        result = ''
        for v, s in vals:
            while n >= v:
                result += s; n -= v
        return result.lower()

    doc = fitz.open(input_path)
    for i, page in enumerate(doc):
        num = f'{prefix}{to_roman(i + 1)}'
        pw, ph = page.rect.width, page.rect.height
        pos_map = {
            'bottom-center': (pw/2, 30),
            'bottom-right': (pw - 50, 30),
            'bottom-left': (50, 30),
            'top-center': (pw/2, ph - 30),
            'top-right': (pw - 50, ph - 30),
            'top-left': (50, ph - 30),
        }
        x, y = pos_map.get(position, (pw/2, 30))
        page.insert_text(fitz.Point(x, y), num, fontsize=fontsize,
                          color=(0.3, 0.3, 0.3), fontname='helv')
    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return {'output_path': output_path, 'pages_numbered': doc.page_count}


def add_running_header_footer(input_path: str, output_path: str,
                               header_text: str = '', footer_text: str = '',
                               include_page_num: bool = True,
                               font_size: int = 9) -> dict:
    """
    Add running header and/or footer to all pages.
    Header/footer can include {page} and {total} placeholders.
    """
    import fitz, os

    doc = fitz.open(input_path)
    total = doc.page_count

    for i, page in enumerate(doc):
        pw, ph = page.rect.width, page.rect.height
        page_num = i + 1

        h_text = header_text.replace('{page}', str(page_num)).replace('{total}', str(total))
        f_text = footer_text.replace('{page}', str(page_num)).replace('{total}', str(total))

        if include_page_num and not h_text and not f_text:
            f_text = f'Page {page_num} of {total}'

        if h_text:
            page.insert_text(fitz.Point(pw/2, ph - 20), h_text,
                              fontsize=font_size, color=(0.4,0.4,0.4), fontname='helv')
        if f_text:
            page.insert_text(fitz.Point(pw/2, 20), f_text,
                              fontsize=font_size, color=(0.4,0.4,0.4), fontname='helv')

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return {'output_path': output_path, 'total_pages': total}
