"""
pdf_sign.py - Add a visual signature to PDF
IshuTools.fun | Professional PDF Suite
"""
import io
from pypdf import PdfWriter, PdfReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.colors import HexColor
from PIL import Image


def create_text_signature_overlay(width: float, height: float,
                                   text: str, x_pct: float, y_pct: float,
                                   font_size: int = 24) -> bytes:
    """Generate a signature overlay page as bytes."""
    packet = io.BytesIO()
    c = rl_canvas.Canvas(packet, pagesize=(width, height))

    x = width * x_pct / 100
    y = height * y_pct / 100

    # Draw signature box
    c.setStrokeColorRGB(0.0, 0.2, 0.6)
    c.setFillColorRGB(0.95, 0.97, 1.0, alpha=0.7)
    box_w = min(200, width * 0.4)
    box_h = font_size + 20
    c.roundRect(x - 5, y - 5, box_w, box_h, 5, stroke=1, fill=1)

    # Draw signature text in script-like style
    c.setFont('Helvetica-BoldOblique', font_size)
    c.setFillColorRGB(0.0, 0.1, 0.5)
    c.drawString(x, y + 5, text)

    # Draw underline
    c.setLineWidth(1.5)
    c.setStrokeColorRGB(0.0, 0.1, 0.5)
    c.line(x, y + 2, x + len(text) * font_size * 0.55, y + 2)

    # Timestamp label
    c.setFont('Helvetica', 7)
    c.setFillColorRGB(0.4, 0.4, 0.4)
    from datetime import datetime
    ts = datetime.utcnow().strftime('Signed: %Y-%m-%d %H:%M UTC')
    c.drawString(x, y - 10, ts)

    c.save()
    packet.seek(0)
    return packet.read()


def sign_pdf(input_path: str, output_path: str,
             signature_type: str = 'text', signature_text: str = 'Signed',
             page_num: int = 0, x_pos: float = 50, y_pos: float = 20,
             sig_image_path: str = None) -> str:
    """
    Add a visual signature to a specific page of a PDF.
    
    Args:
        input_path: Source PDF
        output_path: Signed output PDF
        signature_type: 'text' or 'image'
        signature_text: Text to use as signature
        page_num: 0-based page index
        x_pos: X position as % of page width
        y_pos: Y position as % of page height
        sig_image_path: Path to signature image (if type='image')
    Returns:
        output_path
    """
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt('')
    writer = PdfWriter()

    total = len(reader.pages)
    page_num = max(0, min(page_num, total - 1))

    for i, page in enumerate(reader.pages):
        if i == page_num:
            box = page.mediabox
            w, h = float(box.width), float(box.height)

            if signature_type == 'text' or not sig_image_path:
                overlay_bytes = create_text_signature_overlay(
                    w, h, signature_text, x_pos, y_pos)
                overlay_reader = PdfReader(io.BytesIO(overlay_bytes))
                page.merge_page(overlay_reader.pages[0])
        writer.add_page(page)

    with open(output_path, 'wb') as f:
        writer.write(f)

    return output_path
