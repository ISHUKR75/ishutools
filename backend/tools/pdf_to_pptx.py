"""
pdf_to_pptx.py - Convert PDF pages to PowerPoint slides
IshuTools.fun | Professional PDF Suite
"""
import os
import tempfile
from pdf2image import convert_from_path
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pypdf import PdfReader


def pdf_to_pptx(input_path: str, output_path: str, dpi: int = 150) -> str:
    """
    Convert each PDF page to a PowerPoint slide (image-based).
    
    Args:
        input_path: Source PDF
        output_path: Output .pptx file
        dpi: Resolution for page rendering
    Returns:
        output_path
    """
    reader = PdfReader(input_path)
    total_pages = len(reader.pages)

    # Render pages as images
    images = convert_from_path(input_path, dpi=dpi, fmt='jpeg')

    if not images:
        raise RuntimeError('Could not render PDF pages to images.')

    # Widescreen 16:9 presentation
    prs = Presentation()
    prs.slide_width  = Inches(13.33)
    prs.slide_height = Inches(7.5)

    blank_layout = prs.slide_layouts[6]  # Blank layout

    tmp_dir = tempfile.mkdtemp()

    for i, (img, page_num) in enumerate(zip(images, range(1, total_pages + 1))):
        slide = prs.slides.add_slide(blank_layout)

        # Save image to temp file
        img_path = os.path.join(tmp_dir, f'page_{i:04d}.jpg')
        img.save(img_path, 'JPEG', quality=90)

        # Fill slide with the page image
        left = top = Inches(0)
        slide.shapes.add_picture(
            img_path,
            left, top,
            width=prs.slide_width,
            height=prs.slide_height
        )

    prs.save(output_path)
    return output_path
