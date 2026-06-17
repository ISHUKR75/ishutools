"""
pdf_extract_pages.py - Extract specific pages to a new PDF
IshuTools.fun | Professional PDF Suite
"""
from pypdf import PdfWriter, PdfReader


def parse_pages(pages_str: str, total: int) -> list:
    """Parse page string like '1,3,5-8' to sorted list of 0-based indices."""
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
    return sorted(indices)


def extract_pages(input_path: str, output_path: str, pages: str) -> str:
    """
    Extract specific pages from a PDF into a new file.
    
    Args:
        input_path: Source PDF
        output_path: Output PDF
        pages: Comma-separated page numbers / ranges e.g. '2,4,6-10'
    Returns:
        output_path
    """
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt('')

    total = len(reader.pages)
    page_indices = parse_pages(pages, total)

    if not page_indices:
        raise ValueError('No valid pages specified.')

    writer = PdfWriter()
    for idx in page_indices:
        writer.add_page(reader.pages[idx])

    with open(output_path, 'wb') as f:
        writer.write(f)

    return output_path
