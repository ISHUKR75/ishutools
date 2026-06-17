"""
pdf_sign.py - Add visual signatures to PDF pages (Ultra-Enhanced)
IshuTools.fun | Professional PDF Suite

Libraries: pypdf, reportlab, fitz (PyMuPDF), Pillow, qrcode, datetime
Features:
  - Text signature with customizable style, color, and font
  - Image signature (uploaded PNG/JPG with transparency)
  - QR code verification stamp
  - Multi-page signing (sign all or specific pages)
  - Signature position as %, coordinate, or preset (bottom-right etc.)
  - Timestamp and signer info
  - Signature box with border and background
  - Batch sign with same signature on every page
  - Signature log / audit trail appended to last page
"""

import io
import os
import hashlib
from datetime import datetime, timezone

import fitz
from pypdf import PdfWriter, PdfReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from PIL import Image

try:
    import qrcode
    HAS_QRCODE = True
except ImportError:
    HAS_QRCODE = False


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hex_to_rgb(hex_color: str) -> tuple:
    h = hex_color.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255


def _position_preset_to_pct(position: str):
    """Convert named position to (x_pct, y_pct) of page."""
    presets = {
        'bottom-right':  (75, 8),
        'bottom-left':   (10, 8),
        'bottom-center': (40, 8),
        'top-right':     (75, 88),
        'top-left':      (10, 88),
        'top-center':    (40, 88),
        'center':        (40, 48),
    }
    return presets.get(position, (75, 8))


def _make_qr_code(data: str, size: int = 80) -> bytes:
    """Generate a QR code PNG as bytes."""
    if not HAS_QRCODE:
        return b''
    try:
        qr = qrcode.QRCode(version=1, box_size=2, border=2)
        qr.add_data(data)
        qr.make(fit=True)
        img = qr.make_image(fill_color='black', back_color='white')
        img = img.resize((size, size), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        return buf.getvalue()
    except Exception:
        return b''


def _document_hash(input_path: str) -> str:
    """Compute SHA-256 hash of the PDF for QR verification data."""
    try:
        h = hashlib.sha256()
        with open(input_path, 'rb') as f:
            for chunk in iter(lambda: f.read(65536), b''):
                h.update(chunk)
        return h.hexdigest()[:16].upper()
    except Exception:
        return 'UNKNOWN'


# ── Signature overlay builders ────────────────────────────────────────────────

def _create_text_signature_overlay(
    width: float, height: float,
    name: str,
    x_pct: float, y_pct: float,
    font_size: int = 24,
    color: str = '#003399',
    show_timestamp: bool = True,
    show_qr: bool = False,
    qr_data: str = '',
    title: str = '',
    bg_color: str = '#EEF2FF',
    border_color: str = '#6366F1',
) -> bytes:
    """Create a text signature overlay page."""
    packet = io.BytesIO()
    c = rl_canvas.Canvas(packet, pagesize=(width, height))

    x = width * x_pct / 100
    y = height * y_pct / 100

    # Signature box dimensions
    box_w = min(220, width * 0.42)
    box_h = font_size + (30 if show_timestamp else 10) + (10 if title else 0)
    if show_qr and HAS_QRCODE:
        box_w += 90

    # Background box
    bg_r, bg_g, bg_b = _hex_to_rgb(bg_color)
    bd_r, bd_g, bd_b = _hex_to_rgb(border_color)
    c.setFillColorRGB(bg_r, bg_g, bg_b, alpha=0.85)
    c.setStrokeColorRGB(bd_r, bd_g, bd_b)
    c.setLineWidth(1.5)
    c.roundRect(x - 5, y - 8, box_w, box_h, 5, stroke=1, fill=1)

    # Signer title / label
    text_x = x + 4
    text_y = y + box_h - 16
    if title:
        c.setFont('Helvetica', 8)
        c.setFillColorRGB(0.35, 0.35, 0.55)
        c.drawString(text_x, text_y, title[:40])
        text_y -= 12

    # Signature name
    sig_r, sig_g, sig_b = _hex_to_rgb(color)
    c.setFillColorRGB(sig_r, sig_g, sig_b)
    c.setFont('Helvetica-BoldOblique', font_size)
    c.drawString(text_x, text_y - font_size + 6, name[:30])

    # Underline
    c.setStrokeColorRGB(sig_r, sig_g, sig_b)
    c.setLineWidth(1.2)
    underline_w = min(len(name) * font_size * 0.52, box_w - 14)
    c.line(text_x, text_y - font_size + 3,
           text_x + underline_w, text_y - font_size + 3)

    # Timestamp
    if show_timestamp:
        ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
        c.setFont('Helvetica', 7.5)
        c.setFillColorRGB(0.4, 0.4, 0.4)
        c.drawString(text_x, y - 4, f'Signed: {ts}')

    # QR code
    if show_qr and HAS_QRCODE and qr_data:
        qr_bytes = _make_qr_code(qr_data, size=70)
        if qr_bytes:
            qr_img = io.BytesIO(qr_bytes)
            qr_x = x + box_w - 80
            qr_y = y - 4
            c.drawImage(qr_img, qr_x, qr_y, width=70, height=70, mask='auto')

    c.save()
    packet.seek(0)
    return packet.read()


def _create_image_signature_overlay(
    page_width: float, page_height: float,
    sig_image_path: str,
    x_pct: float, y_pct: float,
    sig_width: float = 150,
    opacity: float = 0.9,
    show_timestamp: bool = True,
) -> bytes:
    """Create an image signature overlay (PNG/JPG)."""
    try:
        img = Image.open(sig_image_path).convert('RGBA')
        # Apply opacity
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
    except Exception as e:
        raise RuntimeError(f'Image signature error: {e}')


# ── Audit trail page ──────────────────────────────────────────────────────────

def _create_audit_page(width: float, height: float,
                        signers: list, doc_hash: str) -> bytes:
    """Create an audit trail page listing all signatures."""
    packet = io.BytesIO()
    c = rl_canvas.Canvas(packet, pagesize=(width, height))

    c.setFillColorRGB(0.95, 0.97, 1.0)
    c.rect(0, 0, width, height, fill=1, stroke=0)
    c.setFillColorRGB(0.12, 0.25, 0.65)
    c.setFont('Helvetica-Bold', 16)
    c.drawString(40, height - 50, 'Signature Audit Trail')
    c.setFont('Helvetica', 9)
    c.setFillColorRGB(0.4, 0.4, 0.4)
    c.drawString(40, height - 70, f'Document ID: {doc_hash}')
    c.drawString(40, height - 82, f'Generated: {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}')
    c.setStrokeColorRGB(0.7, 0.7, 0.9)
    c.line(40, height - 90, width - 40, height - 90)

    y = height - 115
    for i, signer in enumerate(signers):
        c.setFillColorRGB(0.12, 0.25, 0.65)
        c.setFont('Helvetica-Bold', 11)
        c.drawString(40, y, f'{i + 1}. {signer.get("name", "Unknown")}')
        c.setFont('Helvetica', 9)
        c.setFillColorRGB(0.3, 0.3, 0.3)
        c.drawString(60, y - 14, f'Page: {signer.get("page", "?")}  |  '
                                  f'Time: {signer.get("timestamp", "?")}  |  '
                                  f'Method: {signer.get("method", "text")}')
        y -= 36
        if y < 50:
            break

    c.drawString(40, 30, 'IshuTools.fun  •  PDF Signature Suite')
    c.save()
    packet.seek(0)
    return packet.read()


# ── Main API ──────────────────────────────────────────────────────────────────

def sign_pdf(
    input_path: str,
    output_path: str,
    signature_type: str = 'text',
    signature_text: str = 'Signed',
    page_num: int = 0,
    x_pos: float = 75,
    y_pos: float = 8,
    position_preset: str = '',
    font_size: int = 24,
    color: str = '#003399',
    sig_image_path: str = None,
    show_timestamp: bool = True,
    show_qr: bool = False,
    sign_all_pages: bool = False,
    add_audit_trail: bool = False,
    title: str = 'Digitally Signed',
    password: str = '',
) -> dict:
    """
    Add a visual signature to PDF pages.

    Args:
        input_path:      Source PDF
        output_path:     Signed output PDF
        signature_type:  'text' | 'image'
        signature_text:  Signer name / text
        page_num:        0-based page index (ignored if sign_all_pages=True)
        x_pos:           X position as % of page width
        y_pos:           Y position as % of page height
        position_preset: Override x_pos/y_pos with 'bottom-right', 'bottom-left' etc.
        font_size:       Signature text size
        color:           Hex color for text signature
        sig_image_path:  Path to signature image (type='image')
        show_timestamp:  Include UTC timestamp
        show_qr:         Add QR code with document hash
        sign_all_pages:  Sign every page (not just page_num)
        add_audit_trail: Append an audit trail page at the end
        title:           Label above signature (e.g. 'Approved by')
        password:        PDF password if encrypted
    Returns:
        dict with output_path, pages_signed, doc_hash
    """
    if position_preset:
        x_pos, y_pos = _position_preset_to_pct(position_preset)

    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt(password or '')

    total = len(reader.pages)
    page_num = max(0, min(page_num, total - 1))

    sign_indices = list(range(total)) if sign_all_pages else [page_num]

    doc_hash = _document_hash(input_path)
    qr_data = f'IshuTools|{doc_hash}|{signature_text}' if show_qr else ''

    writer = PdfWriter()
    signers = []
    ts_str = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')

    for i, page in enumerate(reader.pages):
        if i in sign_indices:
            box = page.mediabox
            w, h = float(box.width), float(box.height)

            try:
                if signature_type == 'image' and sig_image_path and os.path.exists(sig_image_path):
                    overlay_bytes = _create_image_signature_overlay(
                        w, h, sig_image_path, x_pos, y_pos,
                        sig_width=150, opacity=0.9,
                        show_timestamp=show_timestamp)
                    method = 'image'
                else:
                    overlay_bytes = _create_text_signature_overlay(
                        w, h, signature_text, x_pos, y_pos,
                        font_size=font_size, color=color,
                        show_timestamp=show_timestamp,
                        show_qr=show_qr and i == sign_indices[-1],
                        qr_data=qr_data,
                        title=title)
                    method = 'text'

                overlay_reader = PdfReader(io.BytesIO(overlay_bytes))
                page.merge_page(overlay_reader.pages[0])
                signers.append({
                    'name': signature_text,
                    'page': i + 1,
                    'timestamp': ts_str,
                    'method': method,
                })
            except Exception:
                pass

        writer.add_page(page)

    # Audit trail page
    if add_audit_trail and signers:
        first_page = reader.pages[0]
        w = float(first_page.mediabox.width)
        h = float(first_page.mediabox.height)
        audit_bytes = _create_audit_page(w, h, signers, doc_hash)
        audit_reader = PdfReader(io.BytesIO(audit_bytes))
        writer.add_page(audit_reader.pages[0])

    # Preserve metadata
    try:
        if reader.metadata:
            meta = dict(reader.metadata)
            meta['/Producer'] = 'IshuTools.fun PDF Suite'
            meta['/ModDate'] = datetime.now(timezone.utc).strftime("D:%Y%m%d%H%M%S+00'00'")
            writer.add_metadata(meta)
    except Exception:
        pass

    with open(output_path, 'wb') as f:
        writer.write(f)

    return {
        'output_path': output_path,
        'pages_signed': len(signers),
        'total_pages': total,
        'doc_hash': doc_hash,
        'signers': signers,
    }
