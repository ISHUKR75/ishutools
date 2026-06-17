"""
pptx_to_pdf.py - Convert PowerPoint (.pptx) to PDF
IshuTools.fun | Professional PDF Suite
"""
import os
import tempfile
from pptx import Presentation
from pptx.util import Inches
from PIL import Image, ImageDraw, ImageFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage
from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
import io


def slide_to_image(slide, width: int = 1280, height: int = 720) -> Image.Image:
    """Render a PPTX slide to a PIL Image (simplified text-based rendering)."""
    img = Image.new('RGB', (width, height), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Draw a gradient-like background
    for y in range(height):
        r = int(240 + (y / height) * 15)
        g = int(245 + (y / height) * 10)
        b = 255
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # Draw shapes/text from slide
    y_offset = 60
    for shape in slide.shapes:
        if shape.has_text_frame:
            for para in shape.text_frame.paragraphs:
                text = para.text.strip()
                if not text:
                    continue
                # Approximate font size
                font_size = 24
                try:
                    if para.runs:
                        fs = para.runs[0].font.size
                        if fs:
                            font_size = max(12, min(72, int(fs / 12700)))
                except Exception:
                    pass

                # Choose color based on size
                color = (30, 30, 80) if font_size > 20 else (60, 60, 80)
                draw.text((60, y_offset), text[:120], fill=color)
                y_offset += font_size + 10

                if y_offset > height - 50:
                    break

    # Draw border
    draw.rectangle([10, 10, width - 10, height - 10],
                   outline=(100, 130, 200), width=2)

    return img


def pptx_to_pdf(input_path: str, output_path: str) -> str:
    """
    Convert a PowerPoint presentation to PDF.
    
    Each slide is rendered as a page in the output PDF.
    
    Args:
        input_path: Source .pptx file
        output_path: Output .pdf file
    Returns:
        output_path
    """
    prs = Presentation(input_path)
    styles = getSampleStyleSheet()
    story = []

    tmp_dir = tempfile.mkdtemp()
    img_paths = []

    for i, slide in enumerate(prs.slides):
        img = slide_to_image(slide, width=1024, height=576)
        img_path = os.path.join(tmp_dir, f'slide_{i:04d}.jpg')
        img.save(img_path, 'JPEG', quality=90)
        img_paths.append(img_path)

    if not img_paths:
        raise RuntimeError('No slides found in presentation.')

    doc = SimpleDocTemplate(
        output_path,
        pagesize=landscape(A4),
        leftMargin=1*cm, rightMargin=1*cm,
        topMargin=1*cm, bottomMargin=1*cm
    )

    page_w = landscape(A4)[0] - 2*cm
    page_h = landscape(A4)[1] - 2*cm

    for i, img_path in enumerate(img_paths):
        story.append(RLImage(img_path, width=page_w, height=page_h * 0.9))
        slide_label = Paragraph(
            f'<font size="8" color="#64748B">Slide {i + 1}</font>',
            styles['Normal']
        )
        story.append(slide_label)
        if i < len(img_paths) - 1:
            from reportlab.platypus import PageBreak
            story.append(PageBreak())

    doc.build(story)
    return output_path
