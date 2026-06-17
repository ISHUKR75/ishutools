"""
pdf_to_img.py - Convert PDF pages to images (JPG/PNG)
IshuTools.fun | Professional PDF Suite
"""
import os
import zipfile
from pdf2image import convert_from_path
from pypdf import PdfReader


def parse_pages(pages_str: str, total: int) -> list:
    """Parse page selection string to list of 1-based page numbers for pdf2image."""
    if pages_str.strip().lower() == 'all':
        return list(range(1, total + 1))
    pages = set()
    for part in pages_str.replace(' ', '').split(','):
        if '-' in part:
            a, b = part.split('-', 1)
            for n in range(int(a), int(b) + 1):
                if 1 <= n <= total:
                    pages.add(n)
        elif part.isdigit():
            n = int(part)
            if 1 <= n <= total:
                pages.add(n)
    return sorted(pages)


def pdf_to_images(input_path: str, out_dir: str, result_zip: str,
                  format_type: str = 'jpg', dpi: int = 150,
                  pages: str = 'all') -> str:
    """
    Convert PDF pages to image files and zip them.
    
    Args:
        input_path: Source PDF path
        out_dir: Directory to save images
        result_zip: Output ZIP path
        format_type: 'jpg' or 'png'
        dpi: Resolution (72-300)
        pages: 'all' or range string e.g. '1,3,5-8'
    Returns:
        result_zip path
    """
    reader = PdfReader(input_path)
    total = len(reader.pages)
    page_nums = parse_pages(pages, total)

    fmt = format_type.lower()
    pil_format = 'JPEG' if fmt in ('jpg', 'jpeg') else 'PNG'
    ext = '.jpg' if fmt in ('jpg', 'jpeg') else '.png'

    output_files = []

    for page_num in page_nums:
        try:
            imgs = convert_from_path(
                input_path,
                dpi=dpi,
                first_page=page_num,
                last_page=page_num,
                fmt=pil_format.lower()
            )
            if imgs:
                out_file = os.path.join(out_dir, f'page_{page_num:04d}{ext}')
                save_kwargs = {'format': pil_format}
                if pil_format == 'JPEG':
                    save_kwargs['quality'] = 90
                imgs[0].save(out_file, **save_kwargs)
                output_files.append(out_file)
        except Exception:
            continue

    if not output_files:
        raise RuntimeError('Could not convert any pages to images.')

    # Create ZIP
    with zipfile.ZipFile(result_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
        for fp in output_files:
            zf.write(fp, os.path.basename(fp))

    return result_zip
