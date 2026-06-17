"""
word_to_pdf.py - Convert Microsoft Word (.docx) to PDF
IshuTools.fun | Professional PDF Suite
"""
from docx import Document
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY


def word_to_pdf(input_path: str, output_path: str) -> str:
    """
    Convert a .docx Word file to PDF using python-docx + reportlab.
    
    Args:
        input_path: Source .docx path
        output_path: Output .pdf path
    Returns:
        output_path
    """
    doc = Document(input_path)
    styles = getSampleStyleSheet()

    # Custom styles
    heading1_style = ParagraphStyle('H1', parent=styles['Heading1'],
                                    fontSize=18, spaceAfter=12, spaceBefore=12)
    heading2_style = ParagraphStyle('H2', parent=styles['Heading2'],
                                    fontSize=15, spaceAfter=10, spaceBefore=10)
    heading3_style = ParagraphStyle('H3', parent=styles['Heading3'],
                                    fontSize=13, spaceAfter=8, spaceBefore=8)
    body_style = ParagraphStyle('Body', parent=styles['Normal'],
                                fontSize=11, leading=16, spaceAfter=6)
    bold_style = ParagraphStyle('Bold', parent=body_style, fontName='Helvetica-Bold')

    story = []
    pdf_doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=2.5*cm, rightMargin=2.5*cm,
        topMargin=2.5*cm, bottomMargin=2.5*cm
    )

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            story.append(Spacer(1, 0.3*cm))
            continue

        # Determine paragraph style
        style_name = para.style.name if para.style else ''
        if 'Heading 1' in style_name or 'heading 1' in style_name.lower():
            style = heading1_style
        elif 'Heading 2' in style_name or 'heading 2' in style_name.lower():
            style = heading2_style
        elif 'Heading 3' in style_name or 'heading 3' in style_name.lower():
            style = heading3_style
        else:
            style = body_style

        # Build text with inline formatting
        formatted = ''
        for run in para.runs:
            run_text = run.text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            if run.bold and run.italic:
                formatted += f'<b><i>{run_text}</i></b>'
            elif run.bold:
                formatted += f'<b>{run_text}</b>'
            elif run.italic:
                formatted += f'<i>{run_text}</i>'
            elif run.underline:
                formatted += f'<u>{run_text}</u>'
            else:
                formatted += run_text

        if not formatted:
            formatted = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

        try:
            story.append(Paragraph(formatted, style))
        except Exception:
            story.append(Paragraph(text, body_style))

    # Handle tables
    for table in doc.tables:
        data = []
        for row in table.rows:
            row_data = []
            for cell in row.cells:
                row_data.append(Paragraph(cell.text, body_style))
            data.append(row_data)

        if data:
            t = Table(data, repeatRows=1)
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
                ('TEXTCOLOR',  (0, 0), (-1, 0), colors.white),
                ('FONTNAME',   (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE',   (0, 0), (-1, -1), 10),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
                ('GRID',       (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
                ('VALIGN',     (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ]))
            story.append(Spacer(1, 0.3*cm))
            story.append(t)
            story.append(Spacer(1, 0.3*cm))

    pdf_doc.build(story)
    return output_path
