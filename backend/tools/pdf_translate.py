"""
pdf_translate.py - Translate PDF content to another language
IshuTools.fun | Professional PDF Suite
"""
from pdfminer.high_level import extract_text
from deep_translator import GoogleTranslator
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.units import cm
import re, os, textwrap


def chunk_text(text: str, max_chars: int = 4500) -> list:
    """Split text into chunks safe for Google Translate API."""
    chunks = []
    current = ''
    for sentence in re.split(r'(?<=[.!?])\s+', text):
        if len(current) + len(sentence) > max_chars:
            if current:
                chunks.append(current.strip())
            current = sentence
        else:
            current += ' ' + sentence
    if current.strip():
        chunks.append(current.strip())
    return chunks


def translate_pdf(input_path: str, output_path: str,
                  target_lang: str = 'hi', source_lang: str = 'auto') -> str:
    """
    Translate a PDF's text content and create a new PDF in the target language.
    
    Args:
        input_path: Source PDF
        output_path: Translated output PDF
        target_lang: Target language code e.g. 'hi', 'fr', 'es', 'ar'
        source_lang: Source language code or 'auto' for auto-detect
    Returns:
        output_path
    """
    # Extract text
    raw_text = extract_text(input_path)
    raw_text = re.sub(r'\s+', ' ', raw_text).strip()

    if len(raw_text) < 5:
        raise ValueError('PDF has no extractable text. Please use OCR first.')

    # Translate in chunks
    translator = GoogleTranslator(
        source=source_lang if source_lang != 'auto' else 'auto',
        target=target_lang
    )

    chunks = chunk_text(raw_text, max_chars=4500)
    translated_parts = []

    for chunk in chunks:
        try:
            translated = translator.translate(chunk)
            translated_parts.append(translated or chunk)
        except Exception:
            translated_parts.append(chunk)

    full_translation = '\n\n'.join(translated_parts)

    # Write to PDF
    doc = SimpleDocTemplate(output_path, pagesize=A4,
                            leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    style = styles['Normal']
    style.fontSize = 11
    style.leading = 16

    story = []
    for paragraph in full_translation.split('\n\n'):
        if paragraph.strip():
            try:
                story.append(Paragraph(paragraph.strip().replace('\n', '<br/>'), style))
                story.append(Spacer(1, 0.3*cm))
            except Exception:
                pass

    doc.build(story)
    return output_path
