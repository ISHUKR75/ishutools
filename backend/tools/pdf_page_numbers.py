"""
pdf_page_numbers.py - Add page numbers to PDF
IshuTools.fun | Professional PDF Suite
"""
import io
from pypdf import PdfWriter, PdfReader
from reportlab.pdfgen import canvas as rl_canvas


POSITION_MAP = {
    'bottom-center': lambda w, h, margin: (w / 2, margin, 'center'),
    'bottom-left':   lambda w, h, margin: (margin, margin, 'left'),
    'bottom-right':  lambda w, h, margin: (w - margin, margin, 'right'),
    'top-center':    lambda w, h, margin: (w / 2, h - margin, 'center'),
    'top-left':      lambda w, h, margin: (margin, h - margin, 'left'),
    'top-right':     lambda w, h, margin: (w - margin, h - margin, 'right'),
}


def make_number_overlay(width: float, height: float, label: str,
                         pos_key: str, font_size: int) -> bytes:
    """Create a transparent page with a page number label."""
    packet = io.BytesIO()
    c = rl_canvas.Canvas(packet, pagesize=(width, height))
    c.setFont('Helvetica', font_size)
    c.setFillColorRGB(0.1, 0.1, 0.1)

    margin = 30
    fn = POSITION_MAP.get(pos_key, POSITION_MAP['bottom-center'])
    x, y, align = fn(width, height, margin)

    if align == 'center':
        c.drawCentredString(x, y, label)
    elif align == 'left':
        c.drawString(x, y, label)
    else:
        c.drawRightString(x, y, label)

    c.save()
    packet.seek(0)
    return packet.read()


def add_page_numbers(input_path: str, output_path: str,
                     position: str = 'bottom-center', start_num: int = 1,
                     font_size: int = 12, prefix: str = '') -> str:
    """
    Stamp page numbers onto each page of a PDF.
    
    Args:
        input_path: Source PDF
        output_path: Output PDF
        position: e.g. 'bottom-center', 'top-right' etc.
        start_num: Starting page number
        font_size: Font size in points
        prefix: Optional prefix like 'Page '
    Returns:
        output_path
    """
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt('')
    writer = PdfWriter()

    for i, page in enumerate(reader.pages):
        box = page.mediabox
        w = float(box.width)
        h = float(box.height)

        label = f"{prefix}{start_num + i}"
        overlay_bytes = make_number_overlay(w, h, label, position, font_size)
        overlay_reader = PdfReader(io.BytesIO(overlay_bytes))
        page.merge_page(overlay_reader.pages[0])
        writer.add_page(page)

    with open(output_path, 'wb') as f:
        writer.write(f)

    return output_path
