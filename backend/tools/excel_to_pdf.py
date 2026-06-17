"""
excel_to_pdf.py - Convert Excel (.xlsx) to PDF
IshuTools.fun | Professional PDF Suite
"""
import openpyxl
from openpyxl.utils import get_column_letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm


def excel_to_pdf(input_path: str, output_path: str) -> str:
    """
    Convert an Excel spreadsheet to a PDF document.
    
    Args:
        input_path: Source .xlsx file
        output_path: Output .pdf file
    Returns:
        output_path
    """
    wb = openpyxl.load_workbook(input_path, data_only=True)
    styles_obj = getSampleStyleSheet()
    body_style = styles_obj['Normal']
    body_style.fontSize = 9

    story = []

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]

        # Add sheet title
        title_para = Paragraph(f'<b>Sheet: {sheet_name}</b>',
                               styles_obj['Heading2'])
        story.append(title_para)
        story.append(Spacer(1, 0.3*cm))

        data = []
        for row in ws.iter_rows(values_only=True):
            row_data = [str(cell) if cell is not None else '' for cell in row]
            if any(cell.strip() for cell in row_data):
                data.append(row_data)

        if not data:
            story.append(Paragraph('(Empty sheet)', body_style))
            story.append(Spacer(1, 0.5*cm))
            continue

        # Determine column widths
        num_cols = max(len(row) for row in data)
        available_w = 23 * cm
        col_w = available_w / max(num_cols, 1)
        col_widths = [col_w] * num_cols

        table = Table(data, colWidths=col_widths, repeatRows=1)
        table.setStyle(TableStyle([
            # Header row
            ('BACKGROUND',    (0, 0), (-1, 0), colors.HexColor('#1E40AF')),
            ('TEXTCOLOR',     (0, 0), (-1, 0), colors.white),
            ('FONTNAME',      (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE',      (0, 0), (-1, 0), 9),
            # Data rows
            ('FONTSIZE',      (0, 1), (-1, -1), 8),
            ('FONTNAME',      (0, 1), (-1, -1), 'Helvetica'),
            ('ROWBACKGROUNDS',(0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
            ('GRID',          (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING',    (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING',   (0, 0), (-1, -1), 4),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 4),
            ('WORDWRAP',      (0, 0), (-1, -1), 'WORD'),
        ]))

        story.append(table)
        story.append(Spacer(1, 0.8*cm))

    doc = SimpleDocTemplate(
        output_path,
        pagesize=landscape(A4) if any(
            ws.max_column > 6 for ws in wb.worksheets
        ) else A4,
        leftMargin=1.5*cm, rightMargin=1.5*cm,
        topMargin=2*cm, bottomMargin=2*cm
    )
    doc.build(story)
    return output_path
