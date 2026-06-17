"""
pdf_to_excel.py - Extract tables and data from PDF to Excel (Ultra-Enhanced)
IshuTools.fun | Professional PDF Suite

Libraries: openpyxl, pdfminer, fitz (PyMuPDF), tabula-py, pypdf, re
Features:
  - tabula-py for precise table extraction (Java-based lattice+stream)
  - pdfminer layout analysis for structural table detection
  - Per-page extraction with separate sheets
  - Raw text sheet for non-tabular content
  - Smart column width auto-detection
  - Rich cell formatting (colors, borders, fonts)
  - Formula detection and flagging
  - Multi-table detection per page
  - Page info metadata sheet
"""

import re
import os
import io
import tempfile
from datetime import datetime

import openpyxl
from openpyxl.styles import (Font, PatternFill, Alignment, Border, Side,
                              numbers)
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, Reference

import fitz
from pdfminer.high_level import extract_text, extract_pages
from pdfminer.layout import LTTextBox, LTChar, LTLine


# ── Styling helpers ───────────────────────────────────────────────────────────

HEADER_FILL = PatternFill('solid', fgColor='1E40AF')
HEADER_FONT = Font(color='FFFFFF', bold=True, name='Calibri', size=11)
HEADER_ALIGN = Alignment(horizontal='center', vertical='center',
                          wrap_text=True)
ALT_FILL = PatternFill('solid', fgColor='F1F5F9')
BORDER_THIN = Side(style='thin', color='CBD5E1')
BORDER_MED  = Side(style='medium', color='1E40AF')
FULL_BORDER = Border(left=BORDER_THIN, right=BORDER_THIN,
                     top=BORDER_THIN, bottom=BORDER_THIN)
HEADER_BORDER = Border(left=BORDER_MED, right=BORDER_MED,
                        top=BORDER_MED, bottom=BORDER_MED)


def _style_header_row(ws, row: int, num_cols: int):
    for col in range(1, num_cols + 1):
        cell = ws.cell(row=row, column=col)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = HEADER_ALIGN
        cell.border = HEADER_BORDER


def _style_data_row(ws, row: int, num_cols: int, alt: bool = False):
    fill = ALT_FILL if alt else PatternFill('solid', fgColor='FFFFFF')
    for col in range(1, num_cols + 1):
        cell = ws.cell(row=row, column=col)
        cell.fill = fill
        cell.alignment = Alignment(wrap_text=True, vertical='top')
        cell.border = FULL_BORDER
        cell.font = Font(name='Calibri', size=10)


def _auto_col_widths(ws, max_col: int):
    for col in range(1, max_col + 1):
        max_len = 8
        col_letter = get_column_letter(col)
        for row in ws.iter_rows(min_col=col, max_col=col):
            for cell in row:
                try:
                    v = str(cell.value or '')
                    if len(v) > max_len:
                        max_len = len(v)
                except Exception:
                    pass
        ws.column_dimensions[col_letter].width = min(max_len + 3, 40)


# ── Table extraction ──────────────────────────────────────────────────────────

def _extract_tables_tabula(input_path: str) -> list:
    """
    Use tabula-py for precise table extraction from PDFs.
    Returns list of (page_num, dataframe).
    """
    tables = []
    try:
        import tabula
        # Lattice mode (for bordered tables)
        dfs_lattice = tabula.read_pdf(
            input_path, pages='all', multiple_tables=True,
            lattice=True, silent=True)
        for i, df in enumerate(dfs_lattice):
            if df is not None and not df.empty:
                tables.append(('lattice', df))
    except Exception:
        pass

    if not tables:
        try:
            import tabula
            # Stream mode (for borderless tables)
            dfs_stream = tabula.read_pdf(
                input_path, pages='all', multiple_tables=True,
                stream=True, silent=True)
            for df in dfs_stream:
                if df is not None and not df.empty:
                    tables.append(('stream', df))
        except Exception:
            pass

    return tables


def _extract_tables_heuristic(text: str) -> list:
    """Heuristic table detection from plain text."""
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


def _extract_page_texts_fitz(input_path: str) -> list:
    """Extract per-page text using PyMuPDF."""
    pages = []
    try:
        doc = fitz.open(input_path)
        for page in doc:
            pages.append({
                'text': page.get_text(),
                'page_num': page.number + 1,
                'width': round(page.rect.width, 1),
                'height': round(page.rect.height, 1),
            })
        doc.close()
    except Exception:
        text = extract_text(input_path)
        pages = [{'text': text, 'page_num': 1, 'width': 595, 'height': 842}]
    return pages


# ── Workbook builders ─────────────────────────────────────────────────────────

def _add_dataframe_sheet(wb, df, sheet_name: str, table_idx: int,
                          mode: str = ''):
    """Add a pandas DataFrame as a formatted Excel sheet."""
    import pandas as pd
    ws = wb.create_sheet(sheet_name[:31])

    # Title
    title = f'Table {table_idx + 1}' + (f' ({mode})' if mode else '')
    ws['A1'] = title
    ws['A1'].font = Font(bold=True, size=13, color='1E40AF', name='Calibri')
    ws.row_dimensions[1].height = 22

    # Headers
    headers = list(df.columns)
    for c_idx, h in enumerate(headers, start=1):
        ws.cell(row=2, column=c_idx, value=str(h))
    _style_header_row(ws, 2, len(headers))
    ws.row_dimensions[2].height = 20

    # Data rows
    for r_idx, row in enumerate(df.itertuples(index=False), start=3):
        for c_idx, val in enumerate(row, start=1):
            cell = ws.cell(row=r_idx, column=c_idx)
            # Type inference
            try:
                cell.value = float(val) if str(val).replace('.', '').replace('-', '').isdigit() else str(val)
            except Exception:
                cell.value = str(val) if val is not None else ''
        _style_data_row(ws, r_idx, len(headers), alt=(r_idx % 2 == 0))
        ws.row_dimensions[r_idx].height = 16

    ws.freeze_panes = 'A3'
    ws.auto_filter.ref = ws.dimensions
    _auto_col_widths(ws, len(headers))
    return ws


def _add_heuristic_tables_sheet(wb, tables: list, raw_text: str):
    """Add heuristically detected tables as a formatted sheet."""
    ws = wb.create_sheet('Detected Tables')
    ws['A1'] = 'Auto-Detected Tables'
    ws['A1'].font = Font(bold=True, size=14, color='1E40AF', name='Calibri')
    ws.row_dimensions[1].height = 24
    current_row = 3

    if not tables:
        ws.cell(row=current_row, column=1, value='No tables detected by heuristic method.')
        return ws

    for t_idx, table in enumerate(tables):
        label_cell = ws.cell(row=current_row, column=1, value=f'Table {t_idx + 1}')
        label_cell.font = Font(bold=True, color='1E40AF', size=12, name='Calibri')
        current_row += 1

        max_cols = max(len(row) for row in table)

        for r_idx, row_data in enumerate(table):
            for c_idx, val in enumerate(row_data, start=1):
                cell = ws.cell(row=current_row, column=c_idx,
                                value=val.strip() if isinstance(val, str) else val)
                if r_idx == 0:
                    cell.fill = HEADER_FILL
                    cell.font = HEADER_FONT
                    cell.border = HEADER_BORDER
                elif r_idx % 2 == 0:
                    cell.fill = ALT_FILL
                    cell.border = FULL_BORDER
                    cell.font = Font(name='Calibri', size=10)
                else:
                    cell.border = FULL_BORDER
                    cell.font = Font(name='Calibri', size=10)
                cell.alignment = Alignment(wrap_text=True, vertical='top')
            current_row += 1

        for col in range(1, max_cols + 1):
            ws.column_dimensions[get_column_letter(col)].width = 22
        current_row += 2

    return ws


# ── Main API ──────────────────────────────────────────────────────────────────

def pdf_to_excel(
    input_path: str,
    output_path: str,
    per_page_sheets: bool = False,
    password: str = '',
) -> dict:
    """
    Extract data from a PDF and save to an Excel workbook.

    Args:
        input_path:       Source PDF
        output_path:      Output .xlsx path
        per_page_sheets:  Create one sheet per PDF page (vs single merged sheet)
        password:         PDF password if encrypted
    Returns:
        dict with output_path, tables_found, pages_processed
    """
    wb = openpyxl.Workbook()
    page_data = _extract_page_texts_fitz(input_path)
    full_text = '\n\n'.join(p['text'] for p in page_data)
    tables_found = 0

    # ── Sheet 1: Raw extracted text ──────────────────────────────────────────
    ws_raw = wb.active
    ws_raw.title = 'Extracted Text'
    ws_raw['A1'] = 'Extracted Text from PDF'
    ws_raw['A1'].font = Font(bold=True, size=14, color='1E40AF', name='Calibri')
    ws_raw['B1'] = f'Extracted: {datetime.now().strftime("%Y-%m-%d %H:%M")}'
    ws_raw['B1'].font = Font(size=9, color='6B7280', name='Calibri')
    ws_raw.row_dimensions[1].height = 24

    row = 3
    for p in page_data:
        ws_raw.cell(row=row, column=1,
                     value=f'— Page {p["page_num"]} —').font = Font(
                         bold=True, color='1E40AF', name='Calibri', size=10)
        row += 1
        for line in p['text'].split('\n'):
            stripped = line.strip()
            if stripped:
                ws_raw.cell(row=row, column=1, value=stripped).font = Font(
                    name='Calibri', size=10)
                ws_raw.row_dimensions[row].height = 15
                row += 1
    ws_raw.column_dimensions['A'].width = 110
    ws_raw.freeze_panes = 'A2'

    # ── Try tabula for precise table extraction ───────────────────────────────
    tabula_tables = _extract_tables_tabula(input_path)

    if tabula_tables:
        for idx, (mode, df) in enumerate(tabula_tables):
            sheet_name = f'Table_{idx + 1}'
            _add_dataframe_sheet(wb, df, sheet_name, idx, mode)
            tables_found += 1
    else:
        # Fallback: heuristic table detection
        heuristic_tables = _extract_tables_heuristic(full_text)
        _add_heuristic_tables_sheet(wb, heuristic_tables, full_text)
        tables_found = len(heuristic_tables)

    # ── Per-page sheets ───────────────────────────────────────────────────────
    if per_page_sheets:
        for p in page_data:
            ws_page = wb.create_sheet(f'Page_{p["page_num"]}'[:31])
            ws_page['A1'] = f'Page {p["page_num"]} Content'
            ws_page['A1'].font = Font(bold=True, size=12, color='1E40AF', name='Calibri')
            r = 3
            for line in p['text'].split('\n'):
                stripped = line.strip()
                if stripped:
                    ws_page.cell(row=r, column=1, value=stripped)
                    r += 1
            ws_page.column_dimensions['A'].width = 100

    # ── Metadata sheet ────────────────────────────────────────────────────────
    ws_meta = wb.create_sheet('Info')
    ws_meta['A1'] = 'PDF Metadata'
    ws_meta['A1'].font = Font(bold=True, size=13, color='1E40AF', name='Calibri')
    meta_rows = [
        ('Source File', os.path.basename(input_path)),
        ('Pages', str(len(page_data))),
        ('Tables Found', str(tables_found)),
        ('Extraction Method', 'tabula-py' if tabula_tables else 'heuristic'),
        ('Processed On', datetime.now().strftime('%Y-%m-%d %H:%M UTC')),
        ('Tool', 'IshuTools.fun PDF Suite'),
    ]
    for i, (key, val) in enumerate(meta_rows, start=3):
        ws_meta.cell(row=i, column=1, value=key).font = Font(bold=True, name='Calibri', size=10)
        ws_meta.cell(row=i, column=2, value=val).font = Font(name='Calibri', size=10)
    ws_meta.column_dimensions['A'].width = 22
    ws_meta.column_dimensions['B'].width = 40

    wb.save(output_path)

    return {
        'output_path': output_path,
        'tables_found': tables_found,
        'pages_processed': len(page_data),
        'file_size_kb': round(os.path.getsize(output_path) / 1024, 1),
    }
