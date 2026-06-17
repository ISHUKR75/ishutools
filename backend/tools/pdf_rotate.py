"""
pdf_rotate.py - Rotate PDF pages by a given angle
IshuTools.fun | Professional PDF Suite
"""
from pypdf import PdfWriter, PdfReader


def parse_page_selection(pages_str: str, total: int) -> list:
    """Return list of 0-based indices from a page selection string or 'all'."""
    if pages_str.strip().lower() == 'all':
        return list(range(total))
    indices = set()
    for part in pages_str.replace(' ', '').split(','):
        if '-' in part:
            a, b = part.split('-', 1)
            indices.update(range(int(a) - 1, int(b)))
        elif part.isdigit():
            indices.add(int(part) - 1)
    return sorted([i for i in indices if 0 <= i < total])


def rotate_pdf(input_path: str, output_path: str,
               angle: int = 90, pages: str = 'all') -> str:
    """
    Rotate specific pages (or all pages) of a PDF.
    
    Args:
        input_path: Source PDF path
        output_path: Output PDF path
        angle: Rotation angle in degrees (90, 180, 270, -90)
        pages: 'all' or comma-separated / range string e.g. '1,3,5-8'
    Returns:
        output_path on success
    """
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt('')

    total = len(reader.pages)
    rotate_indices = set(parse_page_selection(str(pages), total))

    writer = PdfWriter()
    for i, page in enumerate(reader.pages):
        if i in rotate_indices:
            page.rotate(angle)
        writer.add_page(page)

    with open(output_path, 'wb') as f:
        writer.write(f)

    return output_path
