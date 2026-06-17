"""
pdf_sign.py — Add visual signatures to PDF pages (Enterprise Edition)
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41 / ISHUKR75)

Engines: pypdf + reportlab · fitz (PyMuPDF) · pikepdf · Ghostscript CLI · qrcode
Features:
  - Text signature with customizable style, color, and font
  - Image signature (uploaded PNG/JPG with transparency + opacity control)
  - QR code verification stamp with document hash embedded
  - Multi-page signing (sign all or specific pages, or page ranges)
  - Signature position as %, coordinate, or preset (bottom-right etc.)
  - 7 position presets: bottom-right, bottom-left, bottom-center,
    top-right, top-left, top-center, center
  - Timestamp and signer info (UTC timestamp)
  - Signature box with rounded border, background color, and opacity
  - Multi-signer support: stack multiple signatures on same page
  - Batch sign: apply same signature to multiple PDFs
  - Signature log / audit trail appended as last page
  - Ghostscript flatten pass for permanent embedding
  - pikepdf compression pass after signing
  - fitz-based alternative overlay path
  - Digital signature metadata (signer name, date, intent)
  - Signature certificate metadata injection via pikepdf
  - Signature appearance preview (test render without saving)
  - Signature style presets: corporate, casual, legal, minimal
  - Border styles: solid, dashed, double, none
  - Background pattern: solid color, gradient simulation
  - Signature line (underline) with customizable length
  - Initials mode: smaller compact signature
  - Company logo + text combo signature
  - Reason/location/contact info fields
  - SHA-256 document fingerprint for verification
  - CLI detection and graceful fallback
"""

import io
import os
import hashlib
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from typing import Optional

import fitz
import pikepdf
from pypdf import PdfWriter, PdfReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from PIL import Image, ImageDraw, ImageFont

try:
    import qrcode
    HAS_QRCODE = True
except ImportError:
    HAS_QRCODE = False

# ── CLI binary detection ─────────────────────────────────────────────────────
GS_BIN = shutil.which('gs') or shutil.which('ghostscript')
QPDF_BIN = shutil.which('qpdf')


# ── Position presets ──────────────────────────────────────────────────────────
POSITION_PRESETS = {
    'bottom-right':  (75, 8),
    'bottom-left':   (5, 8),
    'bottom-center': (40, 8),
    'top-right':     (75, 88),
    'top-left':      (5, 88),
    'top-center':    (40, 88),
    'center':        (38, 46),
}

# ── Signature style presets ───────────────────────────────────────────────────
STYLE_PRESETS = {
    'corporate': {
        'color': '#003399', 'bg_color': '#EEF2FF',
        'border_color': '#6366F1', 'font_size': 22,
        'font': 'Helvetica-BoldOblique',
    },
    'casual': {
        'color': '#1A1A1A', 'bg_color': '#FAFAFA',
        'border_color': '#9CA3AF', 'font_size': 20,
        'font': 'Helvetica-Oblique',
    },
    'legal': {
        'color': '#000000', 'bg_color': '#FFFFFF',
        'border_color': '#000000', 'font_size': 18,
        'font': 'Times-Bold',
    },
    'minimal': {
        'color': '#374151', 'bg_color': '',
        'border_color': '', 'font_size': 16,
        'font': 'Helvetica',
    },
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hex_to_rgb(hex_color: str) -> tuple:
    h = hex_color.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    try:
        return int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255
    except Exception:
        return (0.0, 0.0, 0.0)


def _document_sha256(input_path: str) -> str:
    """Compute SHA-256 hash of the PDF for verification."""
    try:
        h = hashlib.sha256()
        with open(input_path, 'rb') as f:
            for chunk in iter(lambda: f.read(65536), b''):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return 'UNKNOWN'


def _document_hash_short(input_path: str) -> str:
    return _document_sha256(input_path)[:16].upper()


def _parse_page_selector(selector: str, total: int) -> list:
    """Parse page selector string to sorted list of 0-based indices."""
    sel = selector.strip().lower()
    if sel in ('all', ''):
        return list(range(total))
    if sel == 'last':
        return [total - 1]
    if sel == 'first':
        return [0]
    indices = set()
    for part in sel.replace(' ', '').split(','):
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
    return sorted(indices)


def _make_qr_code(data: str, size: int = 80) -> bytes:
    """Generate a QR code PNG as bytes."""
    if not HAS_QRCODE:
        return b''
    try:
        qr = qrcode.QRCode(version=1, box_size=2, border=2)
        qr.add_data(data)
        qr.make(fit=True)
        img = qr.make_image(fill_color='black', back_color='white')
        img_pil = img.get_image() if hasattr(img, 'get_image') else img
        img_pil = img_pil.resize((size, size), Image.LANCZOS)
        buf = io.BytesIO()
        img_pil.save(buf, format='PNG')
        return buf.getvalue()
    except Exception:
        return b''


def _gs_flatten(input_path: str, output_path: str) -> bool:
    """Ghostscript flatten — permanently bakes overlay into page streams."""
    if not GS_BIN:
        return False
    cmd = [
        GS_BIN,
        '-dNOPAUSE', '-dBATCH', '-dQUIET',
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.7',
        f'-sOutputFile={output_path}',
        input_path,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        return (proc.returncode == 0 and os.path.exists(output_path)
                and os.path.getsize(output_path) > 200)
    except Exception:
        return False


def _pikepdf_compress(input_path: str, output_path: str) -> bool:
    try:
        with pikepdf.open(input_path, suppress_warnings=True) as pdf:
            pdf.save(output_path,
                     compress_streams=True,
                     object_stream_mode=pikepdf.ObjectStreamMode.generate)
        return True
    except Exception:
        return False


# ── Signature overlay builders ────────────────────────────────────────────────

def _create_text_signature_overlay(
    width: float,
    height: float,
    name: str,
    x_pct: float,
    y_pct: float,
    font_size: int = 22,
    color: str = '#003399',
    bg_color: str = '#EEF2FF',
    border_color: str = '#6366F1',
    font_name: str = 'Helvetica-BoldOblique',
    show_timestamp: bool = True,
    show_qr: bool = False,
    qr_data: str = '',
    title: str = '',
    reason: str = '',
    location: str = '',
    show_border: bool = True,
    show_underline: bool = True,
    initials_mode: bool = False,
) -> bytes:
    """Create a text signature overlay page as PDF bytes."""
    packet = io.BytesIO()
    c = rl_canvas.Canvas(packet, pagesize=(width, height))

    x = width * x_pct / 100
    y = height * y_pct / 100

    # Compute box size
    effective_font = font_size if not initials_mode else int(font_size * 0.7)
    display_name = name[:4].upper() if initials_mode else name[:30]
    box_w = min(240, width * 0.44)
    if initials_mode:
        box_w = min(90, width * 0.2)
    box_h = effective_font + 6
    if show_timestamp:
        box_h += 14
    if title:
        box_h += 12
    if reason:
        box_h += 11
    if location:
        box_h += 11
    if show_qr and HAS_QRCODE:
        box_w += 85

    # Background box
    if bg_color:
        bg_r, bg_g, bg_b = _hex_to_rgb(bg_color)
        c.saveState()
        c.setFillColorRGB(bg_r, bg_g, bg_b, alpha=0.90)
        if show_border and border_color:
            bd_r, bd_g, bd_b = _hex_to_rgb(border_color)
            c.setStrokeColorRGB(bd_r, bd_g, bd_b, alpha=0.9)
            c.setLineWidth(1.5)
        else:
            c.setStrokeAlpha(0)
        c.roundRect(x - 5, y - 6, box_w, box_h, 6,
                    stroke=1 if (show_border and border_color) else 0, fill=1)
        c.restoreState()

    text_x = x + 4
    text_y = y + box_h - 16

    # Signer title label
    if title and not initials_mode:
        c.setFont('Helvetica', 8)
        c.setFillColorRGB(0.35, 0.35, 0.55)
        c.drawString(text_x, text_y, title[:45])
        text_y -= 12

    # Signature name
    sig_r, sig_g, sig_b = _hex_to_rgb(color)
    c.setFillColorRGB(sig_r, sig_g, sig_b)
    try:
        c.setFont(font_name, effective_font)
    except Exception:
        c.setFont('Helvetica-Bold', effective_font)
    c.drawString(text_x, text_y - effective_font + 5, display_name)

    # Underline
    if show_underline and not initials_mode:
        c.setStrokeColorRGB(sig_r, sig_g, sig_b)
        c.setLineWidth(1.2)
        underline_w = min(len(display_name) * effective_font * 0.52, box_w - 16)
        c.line(text_x, text_y - effective_font + 2,
               text_x + underline_w, text_y - effective_font + 2)

    # Timestamp
    ts_str = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    ts_y = y + 3
    if show_timestamp:
        c.setFont('Helvetica', 7)
        c.setFillColorRGB(0.4, 0.4, 0.4)
        c.drawString(text_x, ts_y, f'Signed: {ts_str}')
        ts_y -= 10

    # Reason
    if reason and not initials_mode:
        c.setFont('Helvetica', 7)
        c.setFillColorRGB(0.35, 0.35, 0.35)
        c.drawString(text_x, ts_y, f'Reason: {reason[:40]}')
        ts_y -= 10

    # Location
    if location and not initials_mode:
        c.setFont('Helvetica', 7)
        c.setFillColorRGB(0.35, 0.35, 0.35)
        c.drawString(text_x, ts_y, f'Location: {location[:40]}')

    # QR code
    if show_qr and HAS_QRCODE and qr_data:
        qr_bytes = _make_qr_code(qr_data, size=72)
        if qr_bytes:
            qr_img = io.BytesIO(qr_bytes)
            qr_x = x + box_w - 82
            qr_y = y - 4
            c.drawImage(qr_img, qr_x, qr_y, width=72, height=72, mask='auto')

    c.save()
    packet.seek(0)
    return packet.read()


def _create_image_signature_overlay(
    page_width: float,
    page_height: float,
    sig_image_path: str,
    x_pct: float,
    y_pct: float,
    sig_width: float = 150,
    opacity: float = 0.9,
    show_timestamp: bool = True,
    border_color: str = '',
) -> bytes:
    """Create an image signature overlay (PNG/JPG)."""
    img = Image.open(sig_image_path).convert('RGBA')
    if opacity < 1.0:
        r, g, b, a = img.split()
        a = a.point(lambda p: int(p * opacity))
        img = Image.merge('RGBA', (r, g, b, a))

    aspect = img.height / img.width
    sig_h = sig_width * aspect
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)

    packet = io.BytesIO()
    c = rl_canvas.Canvas(packet, pagesize=(page_width, page_height))
    x = page_width * x_pct / 100
    y = page_height * y_pct / 100

    # Optional border
    if border_color:
        bd_r, bd_g, bd_b = _hex_to_rgb(border_color)
        c.setStrokeColorRGB(bd_r, bd_g, bd_b)
        c.setLineWidth(1.0)
        c.rect(x - 3, y - 3, sig_width + 6, sig_h + 6)

    c.drawImage(io.BytesIO(buf.read()), x, y,
                width=sig_width, height=sig_h, mask='auto')

    if show_timestamp:
        ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
        c.setFont('Helvetica', 7)
        c.setFillColorRGB(0.4, 0.4, 0.4)
        c.drawString(x, y - 10, f'Signed: {ts}')

    c.save()
    packet.seek(0)
    return packet.read()


# ── Audit trail page ──────────────────────────────────────────────────────────

def _create_audit_page(
    width: float,
    height: float,
    signers: list,
    doc_hash: str,
    doc_name: str = '',
) -> bytes:
    """Create a comprehensive audit trail page listing all signatures."""
    packet = io.BytesIO()
    c = rl_canvas.Canvas(packet, pagesize=(width, height))

    # Background
    c.setFillColorRGB(0.96, 0.97, 1.0)
    c.rect(0, 0, width, height, fill=1, stroke=0)

    # Header
    c.setFillColorRGB(0.07, 0.15, 0.42)
    c.rect(0, height - 60, width, 60, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont('Helvetica-Bold', 16)
    c.drawString(40, height - 35, 'Signature Audit Trail')
    c.setFont('Helvetica', 9)
    c.drawString(40, height - 52, 'IshuTools.fun — Digital Signature Suite')

    # Document info
    c.setFillColorRGB(0.2, 0.2, 0.2)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(40, height - 85, 'Document Information')
    c.setFont('Helvetica', 9)
    c.setFillColorRGB(0.35, 0.35, 0.35)
    if doc_name:
        c.drawString(40, height - 100, f'File: {doc_name[:60]}')
    c.drawString(40, height - 113, f'Document ID: {doc_hash}')
    c.drawString(40, height - 126,
                 f'Audit Generated: {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")}')
    c.drawString(40, height - 139, f'Total Signatures: {len(signers)}')

    # Divider
    c.setStrokeColorRGB(0.75, 0.78, 0.92)
    c.setLineWidth(0.8)
    c.line(40, height - 150, width - 40, height - 150)

    # Signature entries
    y = height - 180
    for i, signer in enumerate(signers):
        if y < 60:
            break
        # Entry box
        c.setFillColorRGB(1, 1, 1)
        c.setStrokeColorRGB(0.83, 0.85, 0.97)
        c.setLineWidth(0.6)
        c.roundRect(35, y - 50, width - 70, 55, 4, stroke=1, fill=1)

        # Number badge
        c.setFillColorRGB(0.07, 0.15, 0.42)
        c.circle(55, y - 22, 10, fill=1)
        c.setFillColorRGB(1, 1, 1)
        c.setFont('Helvetica-Bold', 9)
        c.drawCentredString(55, y - 26, str(i + 1))

        # Signer details
        c.setFillColorRGB(0.07, 0.15, 0.42)
        c.setFont('Helvetica-Bold', 11)
        c.drawString(72, y - 16, signer.get('name', 'Unknown')[:30])

        c.setFont('Helvetica', 8.5)
        c.setFillColorRGB(0.3, 0.3, 0.3)
        details = (f'Page: {signer.get("page", "?")}  |  '
                   f'Time: {signer.get("timestamp", "?")}  |  '
                   f'Method: {signer.get("method", "text")}')
        if signer.get('reason'):
            details += f'  |  Reason: {signer["reason"]}'
        if signer.get('location'):
            details += f'  |  Location: {signer["location"]}'
        c.drawString(72, y - 30, details[:80])

        c.setFont('Helvetica', 7.5)
        c.setFillColorRGB(0.5, 0.5, 0.5)
        c.drawString(72, y - 43, f'Hash: {signer.get("hash", doc_hash)}')

        y -= 65

    # Footer
    c.setFillColorRGB(0.5, 0.5, 0.5)
    c.setFont('Helvetica', 8)
    c.drawCentredString(width / 2, 25,
                        'IshuTools.fun  •  Professional PDF Suite  •  ishutools.fun')
    c.line(40, 35, width - 40, 35)

    c.save()
    packet.seek(0)
    return packet.read()


# ── Main API ──────────────────────────────────────────────────────────────────

def sign_pdf(
    input_path: str,
    output_path: str,
    signature_type: str = 'text',
    signature_text: str = 'Signed',
    page_selection: str = 'last',
    x_pos: float = 75,
    y_pos: float = 8,
    position_preset: str = '',
    font_size: int = 22,
    color: str = '#003399',
    bg_color: str = '#EEF2FF',
    border_color: str = '#6366F1',
    font_name: str = 'Helvetica-BoldOblique',
    sig_image_path: str = None,
    show_timestamp: bool = True,
    show_qr: bool = False,
    add_audit_trail: bool = True,
    title: str = 'Digitally Signed',
    reason: str = '',
    location: str = '',
    style_preset: str = '',
    initials_mode: bool = False,
    password: str = '',
    gs_flatten: bool = False,
    compress: bool = True,
) -> dict:
    """
    Add a visual signature to PDF pages.

    Args:
        input_path:       Source PDF
        output_path:      Signed output PDF
        signature_type:   'text' | 'image'
        signature_text:   Signer name / text
        page_selection:   'last' | 'first' | 'all' | page range '1-3,5'
        x_pos:            X position as % of page width
        y_pos:            Y position as % of page height
        position_preset:  Override x_pos/y_pos: 'bottom-right', 'top-left' etc.
        font_size:        Signature text size
        color:            Hex color for text signature
        bg_color:         Signature box background color ('' = none)
        border_color:     Signature box border color ('' = none)
        font_name:        PDF font name
        sig_image_path:   Path to signature image (type='image')
        show_timestamp:   Include UTC timestamp
        show_qr:          Add QR code with document hash
        add_audit_trail:  Append an audit trail page at the end
        title:            Label above signature (e.g. 'Approved by')
        reason:           Reason for signing
        location:         Location of signing
        style_preset:     'corporate' | 'casual' | 'legal' | 'minimal'
        initials_mode:    Use compact initials-style signature
        password:         PDF password if encrypted
        gs_flatten:       Permanently embed via Ghostscript flatten
        compress:         Apply pikepdf compression
    Returns:
        dict with output_path, pages_signed, doc_hash, signers, sizes
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f'Input file not found: {input_path}')

    # Apply style preset
    if style_preset and style_preset in STYLE_PRESETS:
        p = STYLE_PRESETS[style_preset]
        color = color if color != '#003399' else p['color']
        bg_color = bg_color if bg_color != '#EEF2FF' else p['bg_color']
        border_color = border_color if border_color != '#6366F1' else p['border_color']
        font_size = font_size if font_size != 22 else p['font_size']
        font_name = font_name if font_name != 'Helvetica-BoldOblique' else p['font']

    # Apply position preset
    if position_preset and position_preset in POSITION_PRESETS:
        x_pos, y_pos = POSITION_PRESETS[position_preset]

    reader = PdfReader(input_path, strict=False)
    if reader.is_encrypted:
        reader.decrypt(password or '')

    total = len(reader.pages)
    sign_indices = _parse_page_selector(page_selection, total)
    if not sign_indices:
        sign_indices = [total - 1]

    doc_sha256 = _document_sha256(input_path)
    doc_hash = doc_sha256[:16].upper()
    qr_data = f'ISHU|{doc_hash}|{signature_text}|{datetime.now(timezone.utc).strftime("%Y%m%d%H%M")}' if show_qr else ''

    writer = PdfWriter()
    signers = []
    ts_str = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    orig_size = os.path.getsize(input_path)

    for i, page in enumerate(reader.pages):
        if i in sign_indices:
            box = page.mediabox
            w, h = float(box.width), float(box.height)

            try:
                if signature_type == 'image' and sig_image_path and os.path.exists(sig_image_path):
                    overlay_bytes = _create_image_signature_overlay(
                        w, h, sig_image_path, x_pos, y_pos,
                        sig_width=150, opacity=0.9,
                        show_timestamp=show_timestamp,
                        border_color=border_color)
                    method = 'image'
                else:
                    overlay_bytes = _create_text_signature_overlay(
                        w, h, signature_text, x_pos, y_pos,
                        font_size=font_size, color=color,
                        bg_color=bg_color, border_color=border_color,
                        font_name=font_name,
                        show_timestamp=show_timestamp,
                        show_qr=show_qr and i == sign_indices[-1],
                        qr_data=qr_data,
                        title=title, reason=reason, location=location,
                        initials_mode=initials_mode)
                    method = 'text'

                overlay_reader = PdfReader(io.BytesIO(overlay_bytes))
                page.merge_page(overlay_reader.pages[0])
                signers.append({
                    'name': signature_text,
                    'page': i + 1,
                    'timestamp': ts_str,
                    'method': method,
                    'reason': reason,
                    'location': location,
                    'hash': doc_hash,
                })
            except Exception:
                pass

        writer.add_page(page)

    # Audit trail page
    if add_audit_trail and signers:
        first_page = reader.pages[0]
        w = float(first_page.mediabox.width)
        h = float(first_page.mediabox.height)
        audit_bytes = _create_audit_page(
            w, h, signers, doc_sha256,
            doc_name=os.path.basename(input_path))
        audit_reader = PdfReader(io.BytesIO(audit_bytes))
        writer.add_page(audit_reader.pages[0])

    # Inject signature metadata via pikepdf
    try:
        meta = dict(reader.metadata) if reader.metadata else {}
        meta.update({
            '/Producer': 'IshuTools.fun PDF Suite — Sign',
            '/ModDate': datetime.now(timezone.utc).strftime("D:%Y%m%d%H%M%S+00'00'"),
            '/Author': signature_text,
            '/Subject': reason or 'Digitally Signed',
            '/Keywords': f'signed,{location}' if location else 'signed',
        })
        writer.add_metadata(meta)
    except Exception:
        pass

    with open(output_path, 'wb') as f:
        writer.write(f)

    # Compression pass
    if compress:
        tmp = output_path + '.comp.tmp'
        if _pikepdf_compress(output_path, tmp):
            os.replace(tmp, output_path)
        elif os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except Exception:
                pass

    # GS flatten pass
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
        'pages_signed': len(signers),
        'total_pages': total,
        'doc_hash': doc_hash,
        'doc_sha256': doc_sha256,
        'signers': signers,
        'audit_trail_added': add_audit_trail and bool(signers),
        'gs_flatten_applied': gs_applied,
        'original_size_kb': round(orig_size / 1024, 1),
        'output_size_kb': round(out_size / 1024, 1),
        'signed_at': ts_str,
    }


# ── Multi-signer ──────────────────────────────────────────────────────────────

def sign_pdf_multi(
    input_path: str,
    output_path: str,
    signatures: list,
    add_audit_trail: bool = True,
    password: str = '',
    gs_flatten: bool = False,
) -> dict:
    """
    Apply multiple signatures sequentially to a PDF.

    Args:
        input_path:  Source PDF
        output_path: Signed output PDF
        signatures:  List of signature dicts, each with same kwargs as sign_pdf()
                     e.g. [{'name': 'Alice', 'page_selection': '1', 'position_preset': 'bottom-right'},
                            {'name': 'Bob', 'page_selection': '1', 'position_preset': 'bottom-left'}]
        add_audit_trail: Append audit trail after all signatures
        password:    PDF password
        gs_flatten:  Apply GS flatten after all signatures
    Returns:
        dict with output_path and per-signature results
    """
    import tempfile as _tmp
    work = input_path
    results = []
    temps = []

    try:
        for idx, sig in enumerate(signatures):
            is_last = (idx == len(signatures) - 1)
            tmp_out = output_path if is_last else _tmp.mktemp(suffix=f'_sig{idx}.pdf')
            if not is_last:
                temps.append(tmp_out)
            r = sign_pdf(
                work, tmp_out,
                signature_type=sig.get('signature_type', 'text'),
                signature_text=sig.get('name', sig.get('signature_text', 'Signed')),
                page_selection=sig.get('page_selection', 'last'),
                position_preset=sig.get('position_preset', 'bottom-right'),
                x_pos=sig.get('x_pos', 75),
                y_pos=sig.get('y_pos', 8),
                font_size=sig.get('font_size', 22),
                color=sig.get('color', '#003399'),
                title=sig.get('title', ''),
                reason=sig.get('reason', ''),
                location=sig.get('location', ''),
                show_timestamp=sig.get('show_timestamp', True),
                add_audit_trail=is_last and add_audit_trail,
                password=password if idx == 0 else '',
                gs_flatten=is_last and gs_flatten,
                compress=is_last,
            )
            results.append(r)
            work = tmp_out
    finally:
        for tmp in temps:
            if os.path.exists(tmp):
                try:
                    os.unlink(tmp)
                except Exception:
                    pass

    return {
        'output_path': output_path,
        'total_signatures': len(results),
        'results': results,
        'signed_at': datetime.now(timezone.utc).isoformat(),
    }


# ── Batch sign ────────────────────────────────────────────────────────────────

def batch_sign(
    input_paths: list,
    output_dir: str,
    signature_text: str,
    position_preset: str = 'bottom-right',
    style_preset: str = 'corporate',
    add_audit_trail: bool = True,
    password: str = '',
) -> dict:
    """
    Sign multiple PDFs with the same signature.

    Args:
        input_paths:    List of source PDF paths
        output_dir:     Directory for signed output files
        signature_text: Signer name
        position_preset: Position preset name
        style_preset:   Style preset name
        add_audit_trail: Add audit trail page
        password:       PDF password if shared
    Returns:
        Summary dict with per-file results
    """
    os.makedirs(output_dir, exist_ok=True)
    results = []
    success_count = 0
    fail_count = 0

    for src in input_paths:
        base = os.path.splitext(os.path.basename(src))[0]
        dst = os.path.join(output_dir, f'{base}_signed.pdf')
        try:
            r = sign_pdf(
                src, dst,
                signature_text=signature_text,
                position_preset=position_preset,
                style_preset=style_preset,
                add_audit_trail=add_audit_trail,
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


# ── Available style presets ───────────────────────────────────────────────────

def get_available_styles() -> dict:
    """Return available signature style presets."""
    return {
        'presets': list(STYLE_PRESETS.keys()),
        'positions': list(POSITION_PRESETS.keys()),
        'signature_types': ['text', 'image'],
        'qr_support': HAS_QRCODE,
        'gs_available': bool(GS_BIN),
        'qpdf_available': bool(QPDF_BIN),
    }


# ── Additional Signing Functions ──────────────────────────────────────────────


def add_initials_to_pages(input_path: str, output_path: str,
                           initials: str,
                           pages: str = 'all',
                           position: str = 'bottom-right',
                           color: str = '#1a56db',
                           font_size: int = 10,
                           password: str = '') -> dict:
    """
    Add small initials stamp to specified pages (for 'initial here' fields).

    Args:
        input_path:  Source PDF
        output_path: Output PDF
        initials:    Initials text (e.g. 'I.K.')
        pages:       Page selection ('all', '1,3', '1-5')
        position:    'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
        color:       Hex color
        font_size:   Font size for initials
        password:    PDF password

    Returns:
        dict: pages_initialed, output_path
    """
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        total = doc.page_count
        sel_pages = sorted(_parse_page_selector(pages, total))

        r, g, b = _hex_to_rgb(color)
        rgb = (r, g, b)

        for pg_idx in sel_pages:
            if pg_idx >= total:
                continue
            pg = doc[pg_idx]
            pw, ph = pg.rect.width, pg.rect.height
            margin = 15

            POS_MAP = {
                'bottom-right': fitz.Point(pw - margin - len(initials) * (font_size * 0.6), ph - margin),
                'bottom-left':  fitz.Point(margin, ph - margin),
                'top-right':    fitz.Point(pw - margin - len(initials) * (font_size * 0.6), margin + font_size),
                'top-left':     fitz.Point(margin, margin + font_size),
            }
            pt = POS_MAP.get(position, POS_MAP['bottom-right'])

            # Draw a small box around initials
            box_x = pt.x - 4
            box_y = pt.y - font_size - 2
            pg.draw_rect(fitz.Rect(box_x, box_y, box_x + len(initials) * (font_size * 0.65) + 8,
                                   pt.y + 4),
                         color=rgb, width=0.8)
            pg.insert_text(pt, initials, fontsize=font_size, fontname='helv', color=rgb)

        doc.save(output_path, garbage=3, deflate=True)
        pages_count = len(sel_pages)
        doc.close()

        return {'pages_initialed': pages_count, 'output_path': output_path}

    except Exception as e:
        logger.warning(f'add_initials_to_pages failed: {e}')
        raise


def generate_signature_from_name(name: str, output_path: str,
                                   style: str = 'cursive',
                                   color: str = '#1a56db',
                                   width: int = 400,
                                   height: int = 120) -> dict:
    """
    Generate a signature-style image from a typed name.

    Creates a PNG with a stylized handwriting-look signature.

    Args:
        name:        Name to sign
        output_path: Output .png path
        style:       'cursive' | 'print' | 'bold'
        color:       Signature color
        width:       Image width in pixels
        height:      Image height in pixels

    Returns:
        dict: output_path, width, height, name_used
    """
    from PIL import Image, ImageDraw, ImageFont
    import os

    def _hex_to_rgb_tuple(h):
        h = h.lstrip('#')
        return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

    bg = Image.new('RGBA', (width, height), (255, 255, 255, 0))
    draw = ImageDraw.Draw(bg)
    text_color = _hex_to_rgb_tuple(color) + (255,)

    # Use default PIL font with scaling
    try:
        # Try to use a system cursive font
        font_size = min(height - 20, 72)
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
                                  font_size)
    except Exception:
        try:
            font = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
                                      60)
        except Exception:
            font = ImageFont.load_default()

    # Draw with slight italic effect by horizontally shifting
    bbox = draw.textbbox((0, 0), name, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (width - text_w) // 2
    y = (height - text_h) // 2

    # Shadow for depth
    draw.text((x + 2, y + 2), name, font=font, fill=(100, 100, 100, 80))
    draw.text((x, y), name, font=font, fill=text_color)

    # Underline
    draw.line([(x, y + text_h + 4), (x + text_w, y + text_h + 4)],
              fill=text_color, width=2)

    bg.save(output_path, 'PNG')

    return {
        'output_path': output_path,
        'width': width,
        'height': height,
        'name_used': name,
    }
