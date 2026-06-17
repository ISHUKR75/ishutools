"""
pdf_organize.py - Reorder pages in a PDF (drag & drop order)
IshuTools.fun | Professional PDF Suite
"""
from pypdf import PdfWriter, PdfReader


def organize_pdf(input_path: str, output_path: str, order: str) -> str:
    """
    Reorder pages according to a new order.
    
    Args:
        input_path: Source PDF
        output_path: Output PDF
        order: Comma-separated new page order e.g. '3,1,2,4' (1-indexed)
    Returns:
        output_path
    """
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt('')

    total = len(reader.pages)
    new_order = []
    for part in order.replace(' ', '').split(','):
        if part.isdigit():
            idx = int(part) - 1
            if 0 <= idx < total:
                new_order.append(idx)

    if not new_order:
        raise ValueError('Invalid page order provided.')

    writer = PdfWriter()
    for idx in new_order:
        writer.add_page(reader.pages[idx])

    with open(output_path, 'wb') as f:
        writer.write(f)

    return output_path
