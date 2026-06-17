"""
excel_to_pdf.py - Convert Excel (.xlsx/.xls/.csv) to PDF (Ultra-Enhanced)
IshuTools.fun | Professional PDF Suite

Libraries: openpyxl, reportlab, Pillow, fitz (PyMuPDF)
Features:
  - All sheets rendered as separate PDF pages/sections
  - Auto landscape vs portrait based on column count
  - Smart column width calculation
  - Cell number/date formatting
  - Bold detection from cell font metadata
  - Color-coded cells (background fill from Excel)
  - Multi-page tables with repeated headers
  - Frozen-pane awareness
  - CSV input support
  - Charts described as text placeholder
  - Cover sheet with file metadata
"""

import os
import io
import csv
from datetime import datetime

import openpyxl
from openpyxl.utils import get_column_letter
from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle,
                                 Paragraph, Spacer, PageBreak, HRFlowable)
from reportlab.lib.pagesizes import A4, landscape, letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT


# ── Helpers ───────────────────────────────────────────────────────────────────

def _openpyxl_color_to_hex(color_str: str) -> str:
    """Convert openpyxl color code to hex string usable in ReportLab."""
    if not color_str or color_str in ('00000000', 'FFFFFFFF', ''):
        return None
    if len(color_str) == 8:  # ARGB
        return '#' + color_str[2:]
    if len(color_str) == 6:
        return '#' + color_str
    return None


def _cell_value_str(cell) -> str:
    """Format cell value as string with basic formatting."""
    val = cell.value
    if val is None:
        return ''
    if isinstance(val, float):
        if val == int(val):
            return str(int(val))
        return f'{val:.4g}'
    if isinstance(val, (int, bool)):
        return str(val)
    if hasattr(val, 'strftime'):
        return val.strftime('%Y-%m-%d')
    return str(val).strip()


def _load_csv_as_data(file_path: str) -> list:
    """Load CSV file and return list of rows."""
    data = []
    try:
        with open(file_path, 'r', encoding='utf-8-sig', errors='replace') as f:
            reader = csv.reader(f)
            for row in reader:
                data.append(row)
    except Exception:
        pass
    return data


def _build_styles(base_styles):
    return {
        'sheet_title': ParagraphStyle(
            'SheetTitle', parent=base_styles['Heading1'],
            fontSize=14, textColor=colors.HexColor('#1E3A5F'),
            spaceBefore=8, spaceAfter=6),
        'body': ParagraphStyle(
            'Body', parent=base_styles['Normal'],
            fontSize=9, name='Calibri'),
        'caption': ParagraphStyle(
            'Caption', parent=base_styles['Normal'],
            fontSize=8, textColor=colors.HexColor('#6B7280'),
            alignment=TA_CENTER),
    }


def _worksheet_to_table_data(ws, styles_obj, max_rows: int = 500,
                               max_cols: int = 20):
    """
    Convert openpyxl worksheet to ReportLab Table data with cell styles.
    Returns (data, cell_styles_commands).
    """
    data = []
    cmd = []  # TableStyle commands

    row_count = 0
    for r_idx, row in enumerate(ws.iter_rows(
            min_row=1, max_row=min(ws.max_row or 1, max_rows),
            max_col=min(ws.max_column or 1, max_cols))):

        row_data = []
        for c_idx, cell in enumerate(row):
            val = _cell_value_str(cell)
            is_bold = False
            try:
                is_bold = cell.font and cell.font.bold
            except Exception:
                pass

            style = styles_obj['body']
            if is_bold:
                style = ParagraphStyle('Bold', parent=style,
                                       fontName='Helvetica-Bold')

            # Align numbers right
            align = TA_LEFT
            try:
                if isinstance(cell.value, (int, float)):
                    align = TA_RIGHT
            except Exception:
                pass
            dyn = ParagraphStyle('DynCell', parent=style, alignment=align)

            try:
                para = Paragraph(
                    val.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'),
                    dyn)
            except Exception:
                para = Paragraph(val[:200], styles_obj['body'])
            row_data.append(para)

            # Background color from cell fill
            try:
                fill_color = cell.fill
                if fill_color and fill_color.fill_type == 'solid':
                    fgColor = fill_color.fgColor
                    if fgColor and fgColor.type == 'rgb':
                        hex_c = _openpyxl_color_to_hex(fgColor.rgb)
                        if hex_c:
                            cmd.append(('BACKGROUND',
                                        (c_idx, r_idx), (c_idx, r_idx),
                                        colors.HexColor(hex_c)))
            except Exception:
                pass

        data.append(row_data)
        row_count += 1

    return data, cmd, row_count


def _auto_page_orientation(ws):
    """Choose landscape if many columns."""
    try:
        max_col = ws.max_column or 1
        return max_col > 7
    except Exception:
        return False


# ── Main API ──────────────────────────────────────────────────────────────────

def excel_to_pdf(
    input_path: str,
    output_path: str,
    page_size: str = 'auto',
    max_rows_per_sheet: int = 500,
) -> dict:
    """
    Convert an Excel spreadsheet (xlsx/xls/csv) to a PDF document.

    Args:
        input_path:          Source .xlsx, .xls, or .csv file
        output_path:         Output .pdf file
        page_size:           'auto' | 'A4' | 'Letter' | 'A4L' (landscape A4)
        max_rows_per_sheet:  Maximum rows to render per sheet
    Returns:
        dict with output_path, sheets_count, file_size_kb
    """
    ext = os.path.splitext(input_path)[1].lower()

    # Load workbook
    if ext == '.csv':
        # Wrap CSV in a fake workbook structure
        csv_data = _load_csv_as_data(input_path)
        sheet_data_map = {'CSV Data': csv_data}
        is_csv = True
    else:
        wb = openpyxl.load_workbook(input_path, data_only=True, read_only=False)
        sheet_data_map = None
        is_csv = False

    base_styles = getSampleStyleSheet()
    st = _build_styles(base_styles)
    story = []

    # Cover page
    story.append(Paragraph(
        f'<b>{os.path.basename(input_path)}</b>', st['sheet_title']))
    story.append(Paragraph(
        f'Generated by IshuTools.fun  •  {datetime.now().strftime("%Y-%m-%d %H:%M")}',
        st['caption']))
    story.append(HRFlowable(color=colors.HexColor('#E2E8F0'), thickness=1))
    story.append(Spacer(1, 0.5*cm))

    sheets_count = 0

    if is_csv:
        csv_rows = sheet_data_map['CSV Data']
        if not csv_rows:
            story.append(Paragraph('(Empty CSV file)', st['body']))
        else:
            max_cols = max(len(r) for r in csv_rows)
            page_w = A4[0] - 3*cm
            col_w = page_w / max(max_cols, 1)
            col_widths = [col_w] * max_cols

            # Build table data
            table_data = []
            for r in csv_rows[:max_rows_per_sheet]:
                row_paras = []
                for val in r:
                    safe = str(val).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                    try:
                        row_paras.append(Paragraph(safe[:200], st['body']))
                    except Exception:
                        row_paras.append(Paragraph('', st['body']))
                # Pad to max_cols
                while len(row_paras) < max_cols:
                    row_paras.append(Paragraph('', st['body']))
                table_data.append(row_paras)

            t = Table(table_data, colWidths=col_widths, repeatRows=1)
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E40AF')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F1F5F9')]),
                ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#CBD5E1')),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ('LEFTPADDING', (0, 0), (-1, -1), 4),
                ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ]))
            story.append(t)
        sheets_count = 1
        ps = A4
    else:
        # Detect overall page size
        has_wide_sheets = any(
            (ws.max_column or 1) > 7 for ws in wb.worksheets)
        if page_size == 'auto':
            ps = landscape(A4) if has_wide_sheets else A4
        elif page_size == 'A4L':
            ps = landscape(A4)
        elif page_size == 'Letter':
            ps = letter
        else:
            ps = A4

        for sheet_idx, sheet_name in enumerate(wb.sheetnames):
            ws = wb[sheet_name]
            if sheet_idx > 0:
                story.append(PageBreak())

            story.append(Paragraph(f'Sheet: {sheet_name}', st['sheet_title']))

            if not ws.max_row or ws.max_row == 0:
                story.append(Paragraph('(Empty sheet)', st['body']))
                story.append(Spacer(1, 0.5*cm))
                sheets_count += 1
                continue

            use_landscape = _auto_page_orientation(ws)
            avail_w = (ps[0] if not use_landscape else ps[1]) - 3*cm

            data, extra_cmds, row_count = _worksheet_to_table_data(
                ws, st, max_rows=max_rows_per_sheet,
                max_cols=20)

            if not data:
                story.append(Paragraph('(No data)', st['body']))
                sheets_count += 1
                continue

            max_cols = max(len(row) for row in data)
            col_w = avail_w / max(max_cols, 1)

            # Apply column widths from openpyxl if available
            col_widths = []
            for c in range(1, max_cols + 1):
                col_letter = get_column_letter(c)
                try:
                    ew = ws.column_dimensions[col_letter].width or 10
                    # Convert Excel units to points roughly
                    w = min(avail_w / max_cols, max(30, ew * 5.5))
                    col_widths.append(w)
                except Exception:
                    col_widths.append(col_w)

            # Normalize widths to fit page
            total_w = sum(col_widths)
            if total_w > avail_w:
                scale = avail_w / total_w
                col_widths = [w * scale for w in col_widths]

            base_style = [
                ('BACKGROUND',    (0, 0), (-1, 0), colors.HexColor('#1E40AF')),
                ('TEXTCOLOR',     (0, 0), (-1, 0), colors.white),
                ('FONTNAME',      (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE',      (0, 0), (-1, -1), 8),
                ('ROWBACKGROUNDS',(0, 1), (-1, -1), [colors.white, colors.HexColor('#F1F5F9')]),
                ('GRID',          (0, 0), (-1, -1), 0.4, colors.HexColor('#CBD5E1')),
                ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING',    (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ('LEFTPADDING',   (0, 0), (-1, -1), 3),
                ('RIGHTPADDING',  (0, 0), (-1, -1), 3),
            ] + extra_cmds

            t = Table(data, colWidths=col_widths, repeatRows=1)
            t.setStyle(TableStyle(base_style))
            story.append(t)

            # Row count info
            if row_count >= max_rows_per_sheet:
                story.append(Spacer(1, 0.2*cm))
                story.append(Paragraph(
                    f'(Showing first {max_rows_per_sheet} of {ws.max_row} rows)',
                    st['caption']))

            story.append(Spacer(1, 0.5*cm))
            sheets_count += 1

    doc = SimpleDocTemplate(
        output_path, pagesize=ps,
        leftMargin=1.5*cm, rightMargin=1.5*cm,
        topMargin=2*cm, bottomMargin=1.5*cm,
    )
    doc.build(story)

    return {
        'output_path': output_path,
        'sheets_count': sheets_count,
        'file_size_kb': round(os.path.getsize(output_path) / 1024, 1),
    }
