"""
img_to_pdf.py - Convert images (JPG/PNG/WebP/BMP) to PDF
IshuTools.fun | Professional PDF Suite
"""
import os
import io
from PIL import Image
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.pagesizes import A4, A3, letter, legal


PAGE_SIZES = {
    'A4':     A4,
    'A3':     A3,
    'Letter': letter,
    'Legal':  legal,
}


def images_to_pdf(input_paths: list, output_path: str,
                  page_size: str = 'A4', orientation: str = 'auto',
                  margin: int = 0) -> str:
    """
    Convert one or more images to a single multi-page PDF.

    Args:
        input_paths: List of image file paths
        output_path: Output PDF path
        page_size: 'A4', 'A3', 'Letter', 'Legal', or 'fit' (fit to image)
        orientation: 'auto', 'portrait', 'landscape'
        margin: Margin in points (0 = no margin)
    Returns:
        output_path
    """
    # Validate images first
    valid_images = []
    for p in input_paths:
        try:
            img = Image.open(p).convert('RGB')
            valid_images.append((p, img))
        except Exception:
            continue

    if not valid_images:
        raise ValueError('No valid images found in upload.')

    if page_size == 'fit':
        # Each page fits exactly to the image dimensions
        _images_to_pdf_fit(valid_images, output_path)
    else:
        _images_to_pdf_fixed(valid_images, output_path, page_size, orientation, margin)

    return output_path


def _images_to_pdf_fit(images, output_path):
    """Create PDF where each page size matches the image."""
    c = rl_canvas.Canvas(output_path)
    for i, (path, img) in enumerate(images):
        iw, ih = img.size
        # Convert pixels to points (72 DPI assumption)
        pw = iw * 72 / 96
        ph = ih * 72 / 96
        c.setPageSize((pw, ph))
        c.drawImage(path, 0, 0, width=pw, height=ph)
        if i < len(images) - 1:
            c.showPage()
    c.save()


def _images_to_pdf_fixed(images, output_path, page_size, orientation, margin):
    """Create PDF with fixed page size."""
    base_size = PAGE_SIZES.get(page_size, A4)
    c = rl_canvas.Canvas(output_path)

    for i, (path, img) in enumerate(images):
        iw, ih = img.size

        # Choose orientation
        if orientation == 'landscape' or (orientation == 'auto' and iw > ih):
            page_w = max(base_size)
            page_h = min(base_size)
        else:
            page_w = min(base_size)
            page_h = max(base_size)

        c.setPageSize((page_w, page_h))

        # Calculate draw area
        m = float(margin)
        avail_w = page_w - 2 * m
        avail_h = page_h - 2 * m

        scale = min(avail_w / iw, avail_h / ih)
        draw_w = iw * scale
        draw_h = ih * scale

        x = (page_w - draw_w) / 2
        y = (page_h - draw_h) / 2

        c.drawImage(path, x, y, width=draw_w, height=draw_h,
                    preserveAspectRatio=True)

        if i < len(images) - 1:
            c.showPage()

    c.save()
