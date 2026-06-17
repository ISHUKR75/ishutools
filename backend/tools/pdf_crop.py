"""
pdf_crop.py - Crop PDF pages to a specific area
IshuTools.fun | Professional PDF Suite
"""
from pypdf import PdfWriter, PdfReader
from pypdf.generic import RectangleObject


def crop_pdf(input_path: str, output_path: str,
             left: float = 0, bottom: float = 0,
             right: float = 100, top: float = 100,
             unit: str = 'percent') -> str:
    """
    Crop all pages in a PDF to the specified area.
    
    Args:
        input_path: Source PDF
        output_path: Cropped output PDF
        left, bottom, right, top: Crop boundaries
        unit: 'percent' (0-100%) or 'points' (absolute PDF points)
    Returns:
        output_path
    """
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt('')
    writer = PdfWriter()

    for page in reader.pages:
        box = page.mediabox
        pw = float(box.width)
        ph = float(box.height)

        if unit == 'percent':
            # Convert percent to points
            x0 = pw * left   / 100
            y0 = ph * bottom / 100
            x1 = pw * right  / 100
            y1 = ph * top    / 100
        else:
            # Absolute points
            x0 = float(left)
            y0 = float(bottom)
            x1 = float(right)
            y1 = float(top)

        # Clamp to page boundaries
        x0 = max(0, min(x0, pw))
        y0 = max(0, min(y0, ph))
        x1 = max(0, min(x1, pw))
        y1 = max(0, min(y1, ph))

        page.mediabox = RectangleObject([x0, y0, x1, y1])
        page.cropbox  = RectangleObject([x0, y0, x1, y1])
        writer.add_page(page)

    with open(output_path, 'wb') as f:
        writer.write(f)

    return output_path
