"""
pdf_ocr.py - Extract text from scanned PDFs using Tesseract OCR
IshuTools.fun | Professional PDF Suite
"""
import os
import tempfile
import pytesseract
from PIL import Image
from pdf2image import convert_from_path
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.pagesizes import A4


def ocr_pdf(input_path: str, output_path: str,
            language: str = 'eng', output_format: str = 'pdf') -> str:
    """
    Perform OCR on a PDF (or image-based PDF) and return searchable output.
    
    Args:
        input_path: Source PDF or image path
        output_path: Output file path (.pdf or .txt)
        language: Tesseract language code e.g. 'eng', 'hin', 'fra'
        output_format: 'pdf' or 'txt'
    Returns:
        output_path
    """
    # Convert PDF pages to images for OCR
    try:
        images = convert_from_path(input_path, dpi=300)
    except Exception:
        # Try as plain image
        img = Image.open(input_path).convert('RGB')
        images = [img]

    all_text = []

    for img in images:
        try:
            text = pytesseract.image_to_string(img, lang=language)
            all_text.append(text)
        except Exception:
            all_text.append('')

    if output_format == 'txt':
        combined = '\n\n--- Page Break ---\n\n'.join(all_text)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(combined)
    else:
        # Create searchable PDF with text overlay
        c = rl_canvas.Canvas(output_path, pagesize=A4)
        page_w, page_h = A4

        for i, (img, text) in enumerate(zip(images, all_text)):
            # Draw the image as background
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                img_path = tmp.name
            img.save(img_path, 'JPEG', quality=90)

            c.drawImage(img_path, 0, 0, width=page_w, height=page_h,
                        preserveAspectRatio=True)

            # Overlay invisible text for searchability
            c.setFillColorRGB(1, 1, 1, alpha=0)
            c.setFont('Helvetica', 10)
            lines = text.split('\n')
            y = page_h - 30
            for line in lines:
                if y < 30:
                    break
                c.drawString(30, y, line)
                y -= 12

            os.unlink(img_path)

            if i < len(images) - 1:
                c.showPage()

        c.save()

    return output_path
