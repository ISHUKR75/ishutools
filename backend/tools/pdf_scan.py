"""
pdf_scan.py - Convert scanned images to searchable PDF (Scan to PDF)
IshuTools.fun | Professional PDF Suite
"""
import os
import tempfile
import pytesseract
from PIL import Image, ImageFilter, ImageEnhance
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.pagesizes import A4


def enhance_scan(img: Image.Image) -> Image.Image:
    """Apply image enhancement for better OCR quality."""
    img = img.convert('L')                        # Grayscale
    img = img.filter(ImageFilter.SHARPEN)         # Sharpen
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(1.5)                   # Boost contrast
    enhancer = ImageEnhance.Brightness(img)
    img = enhancer.enhance(1.1)                   # Slight brightness boost
    img = img.convert('RGB')
    return img


def scan_to_pdf(input_paths: list, output_path: str,
                language: str = 'eng', enhance: bool = True) -> str:
    """
    Convert scanned image(s) to a searchable PDF with embedded text layer.
    
    Args:
        input_paths: List of image file paths
        output_path: Output PDF path
        language: Tesseract OCR language code
        enhance: Whether to apply image enhancement
    Returns:
        output_path
    """
    c = rl_canvas.Canvas(output_path, pagesize=A4)
    page_w, page_h = A4
    tmp_dir = tempfile.mkdtemp()

    for i, img_path in enumerate(input_paths):
        try:
            img = Image.open(img_path)
        except Exception:
            continue

        if enhance:
            img = enhance_scan(img)
        else:
            img = img.convert('RGB')

        # OCR
        try:
            ocr_text = pytesseract.image_to_string(img, lang=language)
        except Exception:
            ocr_text = ''

        # Save processed image
        tmp_img = os.path.join(tmp_dir, f'scan_{i:04d}.jpg')
        img.save(tmp_img, 'JPEG', quality=95)

        # Draw image as page background
        c.drawImage(tmp_img, 0, 0, width=page_w, height=page_h,
                    preserveAspectRatio=True, anchor='c')

        # Overlay invisible OCR text for searchability
        c.setFillColorRGB(1, 1, 1, alpha=0)
        c.setFont('Helvetica', 8)
        lines = ocr_text.split('\n')
        y = page_h - 20
        for line in lines:
            if y < 10:
                break
            if line.strip():
                c.drawString(10, y, line[:120])
            y -= 10

        if i < len(input_paths) - 1:
            c.showPage()

    c.save()
    return output_path
