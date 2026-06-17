"""
pdf_remove_pages.py - Remove specific pages from a PDF
IshuTools.fun | Professional PDF Suite
"""
from pypdf import PdfWriter, PdfReader


def parse_pages(pages_str: str, total: int) -> set:
    """Parse page string like '1,3,5-8' to set of 0-based indices."""
    indices = set()
    for part in pages_str.replace(' ', '').split(','):
        if '-' in part:
            a, b = part.split('-', 1)
            for n in range(int(a), int(b) + 1):
                if 1 <= n <= total:
                    indices.add(n - 1)
        elif part.isdigit():
            n = int(part)
            if 1 <= n <= total:
                indices.add(n - 1)
    return indices


def remove_pages(input_path: str, output_path: str, pages: str) -> str:
    """
    Remove specified pages from a PDF.
    
    Args:
        input_path: Source PDF
        output_path: Output PDF
        pages: Comma-separated page numbers / ranges e.g. '1,3,5-8'
    Returns:
        output_path
    """
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt('')

    total = len(reader.pages)
    remove_indices = parse_pages(pages, total)

    writer = PdfWriter()
    for i, page in enumerate(reader.pages):
        if i not in remove_indices:
            writer.add_page(page)

    if len(writer.pages) == 0:
        raise ValueError('Cannot remove all pages. At least one page must remain.')

    with open(output_path, 'wb') as f:
        writer.write(f)

    return output_path
