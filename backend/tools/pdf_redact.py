"""
pdf_redact.py - Redact (black out) sensitive text in PDF
IshuTools.fun | Professional PDF Suite
"""
import io
from pypdf import PdfWriter, PdfReader
from pypdf.generic import ContentStream, ArrayObject, FloatObject
from reportlab.pdfgen import canvas as rl_canvas
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTTextBox


def find_text_positions(input_path: str, search_terms: list, page_idx: int):
    """Find approximate bounding boxes of search terms on a page."""
    matches = []
    try:
        from pdfminer.high_level import extract_pages as pm_extract
        from pdfminer.layout import LTTextBox, LTChar, LTAnon, LTText
        for i, page_layout in enumerate(pm_extract(input_path)):
            if i != page_idx:
                continue
            for element in page_layout:
                if isinstance(element, LTTextBox):
                    for line in element:
                        text = ''
                        try:
                            text = line.get_text()
                        except Exception:
                            continue
                        for term in search_terms:
                            if term.lower() in text.lower():
                                matches.append({
                                    'x0': element.x0, 'y0': element.y0,
                                    'x1': element.x1, 'y1': element.y1,
                                })
    except Exception:
        pass
    return matches


def create_redaction_overlay(width: float, height: float, boxes: list) -> bytes:
    """Create black rectangle overlay for redaction areas."""
    packet = io.BytesIO()
    c = rl_canvas.Canvas(packet, pagesize=(width, height))
    c.setFillColorRGB(0, 0, 0)
    c.setStrokeColorRGB(0, 0, 0)
    for box in boxes:
        c.rect(box['x0'] - 2, box['y0'] - 2,
               (box['x1'] - box['x0']) + 4,
               (box['y1'] - box['y0']) + 4,
               fill=1, stroke=0)
    c.save()
    packet.seek(0)
    return packet.read()


def redact_pdf(input_path: str, output_path: str, search_terms: list) -> str:
    """
    Redact occurrences of search terms in a PDF with black rectangles.
    
    Args:
        input_path: Source PDF
        output_path: Redacted output PDF
        search_terms: List of strings to redact
    Returns:
        output_path
    """
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt('')
    writer = PdfWriter()

    for i, page in enumerate(reader.pages):
        box = page.mediabox
        w, h = float(box.width), float(box.height)
        boxes = find_text_positions(input_path, search_terms, i)
        if boxes:
            overlay_bytes = create_redaction_overlay(w, h, boxes)
            overlay_reader = PdfReader(io.BytesIO(overlay_bytes))
            page.merge_page(overlay_reader.pages[0])
        writer.add_page(page)

    with open(output_path, 'wb') as f:
        writer.write(f)

    return output_path
