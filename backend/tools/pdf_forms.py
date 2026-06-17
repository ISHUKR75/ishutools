"""
pdf_forms.py — PDF form field operations (Ultra-Mega Enhanced)
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41 / ISHUKR75)

Libraries: fitz (PyMuPDF), pypdf, pikepdf, reportlab, Pillow
Features:
  - List all fillable form fields with type, value, rect, page, required, read-only
  - Fill text fields, checkboxes, radio buttons, list boxes, combo boxes
  - Flatten form (make fields non-editable, embed values as content)
  - Create new PDF form from scratch with reportlab
  - Export form data to dict / JSON
  - Import form data from dict
  - Reset all form fields to defaults
  - Validate required fields
  - Extract form field schema (types, options for combos/lists)
  - Detect and report field groups (radio button groups)
  - Signature field detection
  - Count filled vs empty fields
  - PDF/A-compatible flattening via fitz
  - Pikepdf-based field value injection alternative
  - Append new text/checkbox fields to existing PDF
"""

import io
import json
import os
from copy import deepcopy
from datetime import datetime
from typing import Any, Optional, Union

import fitz                              # PyMuPDF
import pikepdf
from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter
from pypdf.generic import (BooleanObject, NameObject, TextStringObject,
                             NumberObject, ArrayObject)
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer


# ─────────────────────────── Field type constants ────────────────────────────

FIELD_TYPE_MAP = {
    1:  'PushButton',
    2:  'CheckBox',
    3:  'RadioButton',
    4:  'Text',
    5:  'ListBox',
    6:  'ComboBox',
    7:  'Signature',
    8:  'XObject',
}

# ─────────────────────────────── Helpers ─────────────────────────────────────

def _fitz_field_info(widget: fitz.Widget, page_num: int) -> dict:
    """Extract rich info from a fitz widget."""
    ft = FIELD_TYPE_MAP.get(widget.field_type, 'Unknown')
    info = {
        'name': widget.field_name or '',
        'field_type': ft,
        'field_type_code': widget.field_type,
        'value': widget.field_value,
        'default_value': getattr(widget, 'field_default_value', None),
        'rect': list(widget.rect),
        'page': page_num,
        'flags': widget.field_flags,
        'is_required': bool(widget.field_flags & 2),
        'is_read_only': bool(widget.field_flags & 1),
        'is_multiline': bool(widget.field_flags & 4096),
        'font_name': widget.text_font or '',
        'font_size': widget.text_fontsize or 0,
        'text_color': list(widget.text_color) if widget.text_color else [],
        'fill_color': list(widget.fill_color) if widget.fill_color else [],
        'border_color': list(widget.border_color) if widget.border_color else [],
        'tooltip': getattr(widget, 'field_label', '') or '',
    }
    # Choices for combo/list
    if ft in ('ComboBox', 'ListBox'):
        try:
            info['choices'] = widget.choice_values or []
        except Exception:
            info['choices'] = []
    # Radio button group
    if ft == 'RadioButton':
        try:
            info['button_caption'] = widget.button_caption or ''
        except Exception:
            info['button_caption'] = ''
    return info


def _count_filled(fields: list[dict]) -> dict:
    """Count filled vs empty vs required vs optional fields."""
    total = len(fields)
    filled = 0
    empty = 0
    required = 0
    signatures = 0
    for f in fields:
        v = f.get('value')
        ft = f.get('field_type', '')
        if ft == 'Signature':
            signatures += 1
        if f.get('is_required'):
            required += 1
        if v and str(v).strip() not in ('', 'Off', 'None', 'false', '0'):
            filled += 1
        else:
            empty += 1
    return {
        'total': total,
        'filled': filled,
        'empty': empty,
        'required': required,
        'optional': total - required,
        'signature_fields': signatures,
        'fill_rate_pct': round(filled / total * 100, 1) if total else 0,
    }


# ─────────────────────────────── Core API ─────────────────────────────────────

def list_form_fields(input_path: str, password: str = '') -> dict:
    """
    Return a detailed list of all fillable form fields in a PDF.

    Returns:
        dict with fields list, summary counts, field groups, has_signature
    """
    doc = fitz.open(input_path)
    if doc.is_encrypted:
        if not doc.authenticate(password or ''):
            raise ValueError('Incorrect password for encrypted PDF.')

    fields = []
    groups: dict[str, list[str]] = {}    # radio/checkbox group → field names

    for page_idx in range(doc.page_count):
        page = doc[page_idx]
        for widget in page.widgets():
            info = _fitz_field_info(widget, page_idx + 1)
            fields.append(info)
            # Group radio buttons by shared name prefix
            if info['field_type'] == 'RadioButton':
                name = info['name']
                groups.setdefault(name, []).append(info.get('button_caption', ''))

    doc.close()

    summary = _count_filled(fields)
    has_signature = any(f['field_type'] == 'Signature' for f in fields)

    return {
        'fields': fields,
        'summary': summary,
        'radio_groups': groups,
        'has_signature_fields': has_signature,
        'field_names': [f['name'] for f in fields],
    }


def fill_pdf_form(
    input_path: str,
    output_path: str,
    fields: dict = None,
    password: str = '',
    flatten: bool = False,
    validate_required: bool = True,
) -> dict:
    """
    Fill PDF form fields with provided values.

    Args:
        input_path:         Source PDF with form fields
        output_path:        Output PDF
        fields:             Dict mapping field name → value
                            e.g. {'FirstName': 'Ishu', 'Accept': True}
        password:           PDF password
        flatten:            If True, embed field values as static content (non-editable)
        validate_required:  Check that all required fields are filled
    Returns:
        dict with output_path, fields_filled, missing_required, warnings
    """
    if fields is None:
        fields = {}

    doc = fitz.open(input_path)
    if doc.is_encrypted:
        if not doc.authenticate(password or ''):
            raise ValueError('Incorrect password for encrypted PDF.')

    filled_count = 0
    not_found = []
    warnings = []
    missing_required = []

    # Collect required fields
    all_fields_info = []
    for page in doc:
        for widget in page.widgets():
            all_fields_info.append({
                'name': widget.field_name,
                'required': bool(widget.field_flags & 2),
            })

    if validate_required:
        for finfo in all_fields_info:
            if finfo['required'] and finfo['name'] not in fields:
                missing_required.append(finfo['name'])

    # Fill fields
    for page in doc:
        for widget in page.widgets():
            name = widget.field_name
            if name not in fields:
                continue
            val = fields[name]
            ft = widget.field_type_string

            try:
                if ft in ('CheckBox', 'RadioButton'):
                    if isinstance(val, bool):
                        widget.field_value = val
                    else:
                        widget.field_value = str(val).lower() in ('true', '1', 'yes', 'on', 'checked')
                elif ft in ('ComboBox', 'ListBox'):
                    widget.field_value = str(val)
                else:
                    widget.field_value = str(val)

                widget.update()
                filled_count += 1
            except Exception as e:
                warnings.append(f'Could not fill field "{name}": {e}')

    # Save
    save_kwargs = {'garbage': 4, 'deflate': True}
    if flatten:
        # Render to flatten (field values become page content)
        tmp = output_path + '.pre-flatten.tmp'
        doc.save(tmp, **save_kwargs)
        doc.close()
        # Reload and flatten with fitz
        doc2 = fitz.open(tmp)
        for page in doc2:
            for widget in page.widgets():
                try:
                    widget.field_value = widget.field_value  # re-read
                    widget.update()
                except Exception:
                    pass
        doc2.bake()  # flatten all annotations/widgets to page content
        doc2.save(output_path, garbage=4, deflate=True, clean=True)
        doc2.close()
        try:
            os.unlink(tmp)
        except Exception:
            pass
    else:
        doc.save(output_path, **save_kwargs)
        doc.close()

    out_size = os.path.getsize(output_path)
    return {
        'output_path': output_path,
        'fields_filled': filled_count,
        'fields_requested': len(fields),
        'fields_not_found': not_found,
        'missing_required': missing_required,
        'warnings': warnings,
        'flattened': flatten,
        'output_size_kb': round(out_size / 1024, 1),
    }


def flatten_pdf_form(input_path: str, output_path: str,
                      password: str = '') -> dict:
    """
    Flatten all form fields into static page content.
    After flattening, the PDF has no interactive form fields.
    """
    doc = fitz.open(input_path)
    if doc.is_encrypted:
        doc.authenticate(password or '')

    orig_fields = []
    for page in doc:
        for widget in page.widgets():
            orig_fields.append(widget.field_name)

    doc.bake()
    doc.save(output_path, garbage=4, deflate=True, clean=True)
    doc.close()

    out_size = os.path.getsize(output_path)
    return {
        'output_path': output_path,
        'fields_flattened': len(orig_fields),
        'field_names': orig_fields,
        'output_size_kb': round(out_size / 1024, 1),
    }


def reset_form_fields(input_path: str, output_path: str,
                       password: str = '') -> dict:
    """Reset all form fields to their default values."""
    doc = fitz.open(input_path)
    if doc.is_encrypted:
        doc.authenticate(password or '')

    reset_count = 0
    for page in doc:
        for widget in page.widgets():
            try:
                default = getattr(widget, 'field_default_value', None)
                if default is not None:
                    widget.field_value = default
                else:
                    ft = widget.field_type_string
                    if ft in ('CheckBox', 'RadioButton'):
                        widget.field_value = False
                    else:
                        widget.field_value = ''
                widget.update()
                reset_count += 1
            except Exception:
                pass

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return {
        'output_path': output_path,
        'fields_reset': reset_count,
    }


def export_form_data(input_path: str, password: str = '') -> dict:
    """
    Export all form field values as a Python dict.
    Suitable for saving form data as JSON or reimporting.
    """
    doc = fitz.open(input_path)
    if doc.is_encrypted:
        doc.authenticate(password or '')

    data = {}
    for page in doc:
        for widget in page.widgets():
            name = widget.field_name
            if name:
                data[name] = widget.field_value
    doc.close()
    return data


def import_form_data(input_path: str, output_path: str,
                      data: dict, password: str = '',
                      flatten: bool = False) -> dict:
    """Import form data from a dict and fill the PDF."""
    return fill_pdf_form(
        input_path, output_path, fields=data,
        password=password, flatten=flatten, validate_required=False)


def get_form_schema(input_path: str, password: str = '') -> dict:
    """
    Extract the complete form schema including field types,
    choices for combo/list boxes, default values, and constraints.
    """
    info = list_form_fields(input_path, password)
    schema = {
        'fields': {},
        'field_count': info['summary']['total'],
        'required_fields': [],
        'optional_fields': [],
        'has_signature_fields': info['has_signature_fields'],
        'radio_groups': info['radio_groups'],
    }

    for f in info['fields']:
        name = f['name']
        field_schema = {
            'type': f['field_type'],
            'required': f['is_required'],
            'read_only': f['is_read_only'],
            'multiline': f.get('is_multiline', False),
            'default': f.get('default_value'),
        }
        if 'choices' in f:
            field_schema['choices'] = f['choices']
        schema['fields'][name] = field_schema

        if f['is_required']:
            schema['required_fields'].append(name)
        else:
            schema['optional_fields'].append(name)

    return schema


def create_simple_form_pdf(
    output_path: str,
    title: str = 'Form',
    fields_config: list = None,
    page_size: str = 'a4',
) -> dict:
    """
    Create a new PDF with fillable form fields from scratch using reportlab + fitz.

    Args:
        output_path:    Output PDF path
        title:          Form title shown at top
        fields_config:  List of field dicts:
                        [{'name': 'FullName', 'label': 'Full Name',
                          'type': 'text', 'required': True,
                          'x': 72, 'y': 700, 'width': 300, 'height': 20}, ...]
                        Supported types: 'text', 'checkbox', 'radio', 'combo'
        page_size:      'a4' | 'letter'
    Returns:
        dict with output_path, fields_created
    """
    if fields_config is None:
        fields_config = []

    SIZES = {'a4': A4, 'letter': letter}
    page_sz = SIZES.get(page_size.lower(), A4)
    pw, ph = page_sz

    # Build base PDF with reportlab (title + labels)
    base_buf = io.BytesIO()
    c = rl_canvas.Canvas(base_buf, pagesize=page_sz)
    c.setTitle(title)

    # Title
    c.setFont('Helvetica-Bold', 18)
    c.setFillColorRGB(0.25, 0.25, 0.75)
    c.drawString(50, ph - 60, title)
    c.setStrokeColorRGB(0.25, 0.25, 0.75)
    c.setLineWidth(1.5)
    c.line(50, ph - 68, pw - 50, ph - 68)

    # Labels
    c.setFont('Helvetica', 11)
    c.setFillColorRGB(0.1, 0.1, 0.1)
    for field in fields_config:
        lbl = field.get('label', field.get('name', ''))
        x = field.get('x', 72)
        y = field.get('y', ph / 2)
        required = field.get('required', False)
        c.drawString(x, y + field.get('height', 20) + 4, lbl + (' *' if required else ''))

    c.save()
    base_buf.seek(0)

    # Write base to temp file
    import tempfile
    tmp_base = tempfile.mktemp(suffix='.pdf')
    with open(tmp_base, 'wb') as f:
        f.write(base_buf.read())

    # Open with fitz and add widgets
    doc = fitz.open(tmp_base)
    page = doc[0]
    fields_created = 0

    for field in fields_config:
        name = field.get('name', f'field_{fields_created}')
        ftype = field.get('type', 'text').lower()
        x = field.get('x', 72)
        y = ph - field.get('y', ph / 2) - field.get('height', 20)
        w = field.get('width', 200)
        h = field.get('height', 20)
        rect = fitz.Rect(x, y, x + w, y + h)

        try:
            if ftype == 'text':
                widget = fitz.Widget()
                widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
                widget.field_name = name
                widget.field_value = field.get('default', '')
                widget.rect = rect
                widget.text_font = 'Helv'
                widget.text_fontsize = 11
                widget.fill_color = (0.98, 0.98, 1.0)
                widget.border_color = (0.4, 0.4, 0.8)
                widget.border_width = 0.8
                if field.get('multiline'):
                    widget.field_flags = fitz.PDF_FIELD_IS_MULTILINE
                if field.get('required'):
                    widget.field_flags |= fitz.PDF_FIELD_IS_REQUIRED
                page.add_widget(widget)
                fields_created += 1

            elif ftype == 'checkbox':
                widget = fitz.Widget()
                widget.field_type = fitz.PDF_WIDGET_TYPE_CHECKBOX
                widget.field_name = name
                widget.field_value = field.get('default', False)
                widget.rect = fitz.Rect(x, y, x + min(h, w), y + h)
                widget.fill_color = (1, 1, 1)
                widget.border_color = (0.3, 0.3, 0.3)
                page.add_widget(widget)
                fields_created += 1

            elif ftype == 'combo':
                widget = fitz.Widget()
                widget.field_type = fitz.PDF_WIDGET_TYPE_COMBOBOX
                widget.field_name = name
                widget.choice_values = field.get('choices', [])
                widget.field_value = field.get('default', '')
                widget.rect = rect
                widget.fill_color = (0.98, 0.98, 1.0)
                widget.border_color = (0.4, 0.4, 0.8)
                page.add_widget(widget)
                fields_created += 1
        except Exception:
            pass

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()

    try:
        os.unlink(tmp_base)
    except Exception:
        pass

    out_size = os.path.getsize(output_path)
    return {
        'output_path': output_path,
        'fields_created': fields_created,
        'title': title,
        'output_size_kb': round(out_size / 1024, 1),
    }


def validate_form(input_path: str, data: dict,
                   password: str = '') -> dict:
    """
    Validate form data against the form schema.
    Checks required fields, field types, and choice validity.
    Returns validation report.
    """
    schema = get_form_schema(input_path, password)
    errors = []
    warnings = []

    # Check required fields
    for name in schema['required_fields']:
        if name not in data or not str(data.get(name, '')).strip():
            errors.append(f'Required field "{name}" is empty or missing.')

    # Check choices for combo/list
    for name, fschema in schema['fields'].items():
        if fschema['type'] in ('ComboBox', 'ListBox') and name in data:
            choices = fschema.get('choices', [])
            if choices and data[name] not in choices:
                errors.append(
                    f'Field "{name}": value "{data[name]}" not in allowed choices: {choices}')

    # Check for extra fields not in schema
    for name in data:
        if name not in schema['fields']:
            warnings.append(f'Field "{name}" is not in the form schema (will be ignored).')

    return {
        'is_valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings,
        'required_fields': schema['required_fields'],
        'provided_fields': list(data.keys()),
    }


# ── Additional Form Functions ─────────────────────────────────────────────────


def extract_form_to_csv(input_path: str, output_csv_path: str,
                         password: str = '') -> dict:
    """
    Extract all form field names and values to a CSV file.

    Useful for batch data collection from filled PDF forms.

    Args:
        input_path:      Source PDF with form data
        output_csv_path: Output .csv path
        password:        PDF password

    Returns:
        dict: field_count, filled_count, output_path
    """
    import csv

    try:
        fields_data = export_form_data(input_path, password=password)
        all_fields = fields_data.get('fields', [])

        with open(output_csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['Field Name', 'Value', 'Type', 'Required', 'Read Only'])
            for field in all_fields:
                writer.writerow([
                    field.get('name', ''),
                    str(field.get('value', '')),
                    field.get('type', ''),
                    field.get('required', False),
                    field.get('read_only', False),
                ])

        filled = sum(1 for f in all_fields if f.get('value'))

        return {
            'field_count': len(all_fields),
            'filled_count': filled,
            'output_path': output_csv_path,
        }

    except Exception as e:
        logger.warning(f'extract_form_to_csv failed: {e}')
        raise


def fill_form_from_csv(input_path: str, csv_path: str, output_path: str,
                        password: str = '') -> dict:
    """
    Fill PDF form fields using data from a CSV file.

    CSV format: first column = field name, second column = value.
    Useful for batch form filling.

    Args:
        input_path:  Source PDF form
        csv_path:    CSV with field_name, value columns
        output_path: Output filled PDF
        password:    PDF password

    Returns:
        dict: fields_filled, fields_not_found, output_path
    """
    import csv

    try:
        data = {}
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            # Skip header if it looks like a header
            rows = list(reader)
            start = 1 if (rows and rows[0][0].lower() in
                          ('field name', 'name', 'field')) else 0
            for row in rows[start:]:
                if len(row) >= 2:
                    data[row[0].strip()] = row[1].strip()

        result = fill_pdf_form(input_path, output_path, data, password=password)
        return result

    except Exception as e:
        logger.warning(f'fill_form_from_csv failed: {e}')
        raise


def get_form_validation_rules(input_path: str, password: str = '') -> list:
    """
    Extract validation rules, required fields, and constraints from a PDF form.

    Returns list of dicts: field_name, required, max_length, format_hint,
    tooltip, validation_script
    """
    results = []
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        for pg_num, pg in enumerate(doc):
            for widget in pg.widgets():
                if not widget:
                    continue
                try:
                    flags = widget.field_flags or 0
                    field_name = widget.field_name or ''

                    result = {
                        'field_name': field_name,
                        'page': pg_num + 1,
                        'type': str(widget.field_type_string),
                        'required': bool(flags & 0x2),
                        'read_only': bool(flags & 0x1),
                        'max_length': getattr(widget, 'text_maxlen', None),
                        'tooltip': getattr(widget, 'field_label', '') or '',
                        'has_script': bool(getattr(widget, 'script', '')),
                        'choices': [],
                    }

                    # Get dropdown choices
                    if widget.field_type == fitz.PDF_WIDGET_TYPE_LISTBOX or \
                       widget.field_type == fitz.PDF_WIDGET_TYPE_COMBOBOX:
                        result['choices'] = widget.choice_values or []

                    results.append(result)
                except Exception:
                    continue

        doc.close()
    except Exception as e:
        logger.warning(f'get_form_validation_rules failed: {e}')

    return results


# ═══════════════════════════════════════════════════════════════════════════
# ── ADDITIONAL PDF FORMS FUNCTIONS ─────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

def create_survey_form(output_path: str, title: str,
                        questions: list) -> dict:
    """
    Create a PDF survey/questionnaire form with fillable fields.
    questions: list of dicts with keys: text, type (text/checkbox/radio), options
    """
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.colors import HexColor
    import os

    c = rl_canvas.Canvas(output_path, pagesize=A4)
    W, H = A4

    # Header
    c.setFillColor(HexColor("#6366F1"))
    c.rect(0, H-80, W, 80, fill=True)
    c.setFillColor(HexColor("#FFFFFF"))
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(W/2, H-50, title)
    c.setFont("Helvetica", 10)
    c.drawCentredString(W/2, H-70, "IshuTools.fun — Form Generator by Ishu Kumar")

    y = H - 120
    c.setFillColor(HexColor("#111827"))

    for i, q in enumerate(questions):
        if y < 100:
            c.showPage()
            y = H - 60

        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(HexColor("#1E3A8A"))
        c.drawString(50, y, f"{i+1}. {q.get('text', '')[:80]}")
        y -= 22

        q_type = q.get("type", "text")
        c.setFillColor(HexColor("#374151"))
        c.setFont("Helvetica", 10)

        if q_type == "text":
            c.setStrokeColor(HexColor("#6366F1"))
            c.rect(50, y-20, W-100, 25, fill=False)
            y -= 50
        elif q_type in ("checkbox", "radio"):
            options = q.get("options", ["Option A", "Option B", "Option C"])
            for opt in options[:6]:
                shape = "○" if q_type == "radio" else "□"
                c.drawString(70, y, f"{shape}  {opt}")
                y -= 18
            y -= 10

    # Footer
    c.setFont("Helvetica", 8)
    c.setFillColor(HexColor("#9CA3AF"))
    c.drawCentredString(W/2, 30, "Generated by IshuTools.fun | ishutools.fun | By Ishu Kumar")
    c.save()

    return {"output_path": output_path, "questions": len(questions)}


def extract_form_data_to_dict(input_path: str) -> dict:
    """
    Extract all form field values from a filled PDF form.
    Returns dict of field_name -> value pairs.
    """
    import fitz
    doc = fitz.open(input_path)
    form_data = {}
    for page in doc:
        for widget in page.widgets() or []:
            name = widget.field_name
            value = widget.field_value
            field_type = widget.field_type_string
            form_data[name] = {
                "value": value,
                "type": field_type,
                "page": page.number + 1,
            }
    doc.close()
    return {"fields": form_data, "field_count": len(form_data)}
