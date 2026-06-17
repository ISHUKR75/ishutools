"""
pdf_split.py - Split PDF into pages or page ranges
IshuTools.fun | Professional PDF Suite
"""
import os
import zipfile
from pypdf import PdfWriter, PdfReader


def parse_ranges(ranges_str: str, total_pages: int) -> list:
    """Parse a range string like '1-3,5,7-9' into list of 0-indexed page numbers."""
    pages = set()
    parts = ranges_str.replace(' ', '').split(',')
    for part in parts:
        if '-' in part:
            start, end = part.split('-', 1)
            s = max(0, int(start) - 1)
            e = min(total_pages - 1, int(end) - 1)
            pages.update(range(s, e + 1))
        elif part.isdigit():
            idx = int(part) - 1
            if 0 <= idx < total_pages:
                pages.add(idx)
    return sorted(pages)


def split_pdf(input_path: str, out_dir: str, result_zip: str,
              mode: str = 'all', ranges: str = '', every_n: int = 1) -> str:
    """
    Split a PDF into multiple files.
    
    Args:
        input_path: Source PDF path
        out_dir: Directory to store split pages
        result_zip: Path for the output ZIP archive
        mode: 'all' | 'range' | 'every_n'
        ranges: Page range string (used if mode='range')
        every_n: Split every N pages (used if mode='every_n')
    Returns:
        result_zip path
    """
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt('')
    total = len(reader.pages)

    output_files = []

    if mode == 'all':
        # One file per page
        for i, page in enumerate(reader.pages):
            writer = PdfWriter()
            writer.add_page(page)
            out_file = os.path.join(out_dir, f'page_{i + 1:04d}.pdf')
            with open(out_file, 'wb') as f:
                writer.write(f)
            output_files.append(out_file)

    elif mode == 'range':
        # Extract specific page range as one PDF
        page_indices = parse_ranges(ranges, total)
        writer = PdfWriter()
        for idx in page_indices:
            writer.add_page(reader.pages[idx])
        out_file = os.path.join(out_dir, 'extracted_range.pdf')
        with open(out_file, 'wb') as f:
            writer.write(f)
        output_files.append(out_file)

    elif mode == 'every_n':
        # Split into chunks of N pages
        n = max(1, every_n)
        chunk_num = 1
        for start in range(0, total, n):
            writer = PdfWriter()
            end = min(start + n, total)
            for i in range(start, end):
                writer.add_page(reader.pages[i])
            out_file = os.path.join(out_dir, f'part_{chunk_num:03d}_pages_{start+1}-{end}.pdf')
            with open(out_file, 'wb') as f:
                writer.write(f)
            output_files.append(out_file)
            chunk_num += 1

    # Create ZIP archive
    with zipfile.ZipFile(result_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
        for fp in output_files:
            zf.write(fp, os.path.basename(fp))

    return result_zip
