"""
pdf_watermark.py - Add text watermark to PDF pages
IshuTools.fun | Professional PDF Suite
"""
import io
from pypdf import PdfWriter, PdfReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter


def hex_to_rgb(hex_color: str):
    """Convert hex color string to (R, G, B) floats 0-1."""
    hex_color = hex_color.lstrip('#')
    r, g, b = (int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4))
    return r, g, b


def create_watermark_page(width: float, height: float, text: str,
                           opacity: float, color: str, font_size: int,
                           rotation: int, position: str) -> bytes:
    """Create a single-page watermark PDF in memory."""
    packet = io.BytesIO()
    c = rl_canvas.Canvas(packet, pagesize=(width, height))

    r, g, b = hex_to_rgb(color)
    c.setFillColorRGB(r, g, b, alpha=opacity)
    c.setFont('Helvetica-Bold', font_size)

    # Determine center position
    pos_map = {
        'center':        (width / 2, height / 2),
        'top-left':      (width * 0.2, height * 0.85),
        'top-right':     (width * 0.8, height * 0.85),
        'bottom-left':   (width * 0.2, height * 0.15),
        'bottom-right':  (width * 0.8, height * 0.15),
    }
    x, y = pos_map.get(position, (width / 2, height / 2))

    c.saveState()
    c.translate(x, y)
    c.rotate(rotation)
    c.drawCentredString(0, 0, text)
    c.restoreState()
    c.save()
    packet.seek(0)
    return packet.read()


def add_watermark(input_path: str, output_path: str,
                  text: str = 'CONFIDENTIAL', opacity: float = 0.3,
                  color: str = '#FF0000', font_size: int = 48,
                  rotation: int = 45, position: str = 'center') -> str:
    """
    Overlay a text watermark on every page of a PDF.
    
    Args:
        input_path: Source PDF
        output_path: Output PDF
        text: Watermark text
        opacity: Transparency (0.0 - 1.0)
        color: Hex color string e.g. '#FF0000'
        font_size: Font size in points
        rotation: Rotation angle in degrees
        position: 'center'|'top-left'|'top-right'|'bottom-left'|'bottom-right'
    Returns:
        output_path
    """
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt('')
    writer = PdfWriter()

    for page in reader.pages:
        box = page.mediabox
        w = float(box.width)
        h = float(box.height)

        wm_bytes = create_watermark_page(w, h, text, opacity, color,
                                          font_size, rotation, position)
        wm_reader = PdfReader(io.BytesIO(wm_bytes))
        wm_page = wm_reader.pages[0]

        page.merge_page(wm_page)
        writer.add_page(page)

    with open(output_path, 'wb') as f:
        writer.write(f)

    return output_path
