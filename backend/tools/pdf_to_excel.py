"""
pdf_to_excel.py - Extract tables and text from PDF to Excel
IshuTools.fun | Professional PDF Suite
"""
import re
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from pdfminer.high_level import extract_text, extract_pages
from pdfminer.layout import LTTextBox


def extract_tables_simple(text: str) -> list:
    """Heuristically detect table-like data in extracted text."""
    tables = []
    current_table = []
    lines = text.split('\n')

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if len(current_table) >= 2:
                tables.append(current_table)
            current_table = []
            continue

        # Detect columns by multiple spaces or tabs
        cols = re.split(r'\s{2,}|\t', stripped)
        if len(cols) >= 2:
            current_table.append(cols)
        else:
            if len(current_table) >= 2:
                tables.append(current_table)
            current_table = []

    if len(current_table) >= 2:
        tables.append(current_table)

    return tables


def pdf_to_excel(input_path: str, output_path: str) -> str:
    """
    Extract text and detected table data from PDF to an Excel workbook.
    
    Args:
        input_path: Source PDF
        output_path: Output .xlsx path
    Returns:
        output_path
    """
    raw_text = extract_text(input_path)

    wb = openpyxl.Workbook()

    # Sheet 1: Raw extracted text
    ws_text = wb.active
    ws_text.title = 'Extracted Text'

    header_fill = PatternFill('solid', fgColor='1E40AF')
    header_font = Font(color='FFFFFF', bold=True, name='Calibri', size=11)
    header_align = Alignment(horizontal='center', vertical='center', wrap_text=True)

    ws_text['A1'] = 'Extracted Text from PDF'
    ws_text['A1'].font = Font(bold=True, name='Calibri', size=14, color='1E40AF')
    ws_text.row_dimensions[1].height = 25

    row = 2
    for line in raw_text.split('\n'):
        if line.strip():
            ws_text.cell(row=row, column=1, value=line.strip())
            ws_text.row_dimensions[row].height = 15
            row += 1

    ws_text.column_dimensions['A'].width = 100

    # Sheet 2: Detected tables
    ws_tables = wb.create_sheet('Detected Tables')
    tables = extract_tables_simple(raw_text)

    current_row = 1
    for t_idx, table in enumerate(tables):
        ws_tables.cell(row=current_row, column=1, value=f'Table {t_idx + 1}')
        ws_tables.cell(row=current_row, column=1).font = Font(bold=True, color='1E40AF', size=12)
        current_row += 1

        max_cols = max(len(row) for row in table)

        for r_idx, row_data in enumerate(table):
            for c_idx, cell_val in enumerate(row_data):
                cell = ws_tables.cell(row=current_row, column=c_idx + 1, value=cell_val.strip())
                cell.alignment = Alignment(wrap_text=True, vertical='top')

                if r_idx == 0:
                    cell.fill = PatternFill('solid', fgColor='3B82F6')
                    cell.font = Font(color='FFFFFF', bold=True, name='Calibri')
                elif r_idx % 2 == 0:
                    cell.fill = PatternFill('solid', fgColor='F1F5F9')

                thin = Side(style='thin', color='E2E8F0')
                cell.border = Border(left=thin, right=thin, top=thin, bottom=thin)

            current_row += 1

        # Auto-size columns
        for col in range(1, max_cols + 1):
            col_letter = get_column_letter(col)
            ws_tables.column_dimensions[col_letter].width = 25

        current_row += 2  # Gap between tables

    wb.save(output_path)
    return output_path
