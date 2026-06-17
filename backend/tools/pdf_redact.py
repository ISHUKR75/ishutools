"""
pdf_redact.py - Redact sensitive content from PDF (Ultra-Enhanced)
IshuTools.fun | Professional PDF Suite

Libraries: fitz (PyMuPDF), pypdf, reportlab, pdfminer, re
Features:
  - Text-search redaction (exact & case-insensitive)
  - Regex pattern redaction (email, phone, SSN, credit card, IP address)
  - Page-range specific redaction
  - Custom redaction color (black, white, blue, custom hex)
  - Redaction label overlay (e.g. "[REDACTED]")
  - Count of redacted instances per page
  - Flatten redactions (permanent, not removable)
  - Named pattern presets (PII, financial, legal)
"""

import io
import re
import os

import fitz
from pypdf import PdfWriter, PdfReader
from pdfminer.high_level import extract_pages as pm_extract
from pdfminer.layout import LTTextBox
from reportlab.pdfgen import canvas as rl_canvas


# ── Regex pattern presets ─────────────────────────────────────────────────────
PATTERN_PRESETS = {
    'email':       r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b',
    'phone_us':    r'\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b',
    'phone_india': r'\b(?:\+?91[-.\s]?)?[6-9]\d{9}\b',
    'ssn':         r'\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b',
    'credit_card': r'\b(?:\d[ \-]?){13,16}\b',
    'ip_address':  r'\b(?:\d{1,3}\.){3}\d{1,3}\b',
    'date':        r'\b(?:\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}|\d{4}[/\-]\d{2}[/\-]\d{2})\b',
    'aadhaar':     r'\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b',
    'pan':         r'\b[A-Z]{5}\d{4}[A-Z]\b',
    'passport_us': r'\b[A-Z]\d{8}\b',
    'url':         r'https?://[^\s<>"]+|www\.[^\s<>"]+',
}

PII_PATTERNS = ['email', 'phone_us', 'phone_india', 'ssn', 'credit_card']
FINANCIAL_PATTERNS = ['credit_card', 'ssn', 'aadhaar', 'pan']


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hex_to_fitz_color(hex_color: str) -> tuple:
    """Convert hex color to fitz RGB tuple (0-1 range)."""
    h = hex_color.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return (int(h[0:2], 16) / 255,
            int(h[2:4], 16) / 255,
            int(h[4:6], 16) / 255)


def _parse_page_selection(pages_str: str, total: int) -> set:
    """Parse page range string to set of 0-based indices."""
    if not pages_str or pages_str.strip().lower() == 'all':
        return set(range(total))
    indices = set()
    for part in pages_str.replace(' ', '').split(','):
        if '-' in part:
            a, b = part.split('-', 1)
            try:
                indices.update(range(int(a) - 1, int(b)))
            except ValueError:
                pass
        elif part.isdigit():
            idx = int(part) - 1
            if 0 <= idx < total:
                indices.add(idx)
    return indices


def _compile_patterns(search_terms: list, use_regex: bool,
                       pattern_presets: list) -> list:
    """Compile search terms and patterns into regex objects."""
    compiled = []

    # Literal search terms
    for term in (search_terms or []):
        if term.strip():
            if use_regex:
                try:
                    compiled.append(re.compile(term, re.IGNORECASE))
                except re.error:
                    compiled.append(re.compile(re.escape(term), re.IGNORECASE))
            else:
                compiled.append(re.compile(re.escape(term), re.IGNORECASE))

    # Named pattern presets
    for preset_name in (pattern_presets or []):
        if preset_name in PATTERN_PRESETS:
            compiled.append(re.compile(PATTERN_PRESETS[preset_name]))
        elif preset_name == 'pii':
            for p in PII_PATTERNS:
                compiled.append(re.compile(PATTERN_PRESETS[p]))
        elif preset_name == 'financial':
            for p in FINANCIAL_PATTERNS:
                compiled.append(re.compile(PATTERN_PRESETS[p]))

    return compiled


# ── PyMuPDF-based redaction (permanent) ──────────────────────────────────────

def _redact_with_fitz(
    input_path: str,
    output_path: str,
    compiled_patterns: list,
    page_indices: set,
    fill_color: tuple,
    label: str,
    label_color: tuple,
) -> dict:
    """
    Use PyMuPDF to search, mark, and permanently flatten redactions.
    This is the most reliable method as fitz handles text location precisely.
    """
    doc = fitz.open(input_path)
    total_redacted = 0
    per_page = {}

    for page_idx in range(doc.page_count):
        if page_idx not in page_indices:
            continue
        page = doc[page_idx]
        page_count = 0

        for pattern in compiled_patterns:
            # Get all text instances on this page
            page_text = page.get_text()
            for match in pattern.finditer(page_text):
                matched_text = match.group()
                # Search for the actual rect on the page
                rects = page.search_for(matched_text)
                for rect in rects:
                    # Add redaction annotation
                    page.add_redact_annot(
                        rect,
                        text=label,
                        fontname='Helvetica',
                        fontsize=7,
                        fill=fill_color,
                        text_color=label_color,
                    )
                    page_count += 1

        # Apply (flatten) all redactions on this page
        if page_count > 0:
            page.apply_redactions()
            total_redacted += page_count
            per_page[page_idx + 1] = page_count

    doc.save(output_path, garbage=4, deflate=True, clean=True)
    doc.close()

    return {
        'total_redacted': total_redacted,
        'per_page': per_page,
    }


# ── Overlay-based redaction (pypdf fallback) ──────────────────────────────────

def _find_text_boxes(input_path: str, patterns: list, page_idx: int) -> list:
    """Find bounding boxes of matched text using pdfminer."""
    matches = []
    try:
        for i, page_layout in enumerate(pm_extract(input_path)):
            if i != page_idx:
                continue
            for element in page_layout:
                if isinstance(element, LTTextBox):
                    text = element.get_text()
                    for pattern in patterns:
                        if pattern.search(text):
                            matches.append({
                                'x0': element.x0, 'y0': element.y0,
                                'x1': element.x1, 'y1': element.y1,
                            })
                            break
    except Exception:
        pass
    return matches


def _overlay_redaction(width: float, height: float, boxes: list,
                        fill_color: tuple, label: str) -> bytes:
    """Create redaction rectangle overlay as PDF bytes."""
    packet = io.BytesIO()
    c = rl_canvas.Canvas(packet, pagesize=(width, height))
    r, g, b = fill_color
    c.setFillColorRGB(r, g, b)
    c.setStrokeColorRGB(r, g, b)
    for box in boxes:
        c.rect(box['x0'] - 2, box['y0'] - 2,
               (box['x1'] - box['x0']) + 4,
               (box['y1'] - box['y0']) + 4,
               fill=1, stroke=0)
    c.save()
    packet.seek(0)
    return packet.read()


# ── Main API ──────────────────────────────────────────────────────────────────

def redact_pdf(
    input_path: str,
    output_path: str,
    search_terms: list = None,
    use_regex: bool = False,
    pattern_presets: list = None,
    pages: str = 'all',
    fill_color: str = '#000000',
    label: str = '',
    password: str = '',
) -> dict:
    """
    Permanently redact text from a PDF using search terms or regex patterns.

    Args:
        input_path:      Source PDF
        output_path:     Redacted output PDF
        search_terms:    List of literal strings or regex patterns to redact
        use_regex:       Treat search_terms as regular expressions
        pattern_presets: Named presets: 'email', 'phone_us', 'ssn', 'credit_card',
                         'ip_address', 'aadhaar', 'pan', 'url', 'pii', 'financial'
        pages:           'all' or page range like '1-5,7'
        fill_color:      Hex color for redaction box ('#000000' = black)
        label:           Text to show inside redaction box (e.g. '[REDACTED]')
        password:        PDF password if encrypted
    Returns:
        dict with output_path, total_redacted, per_page_counts
    """
    if not search_terms and not pattern_presets:
        raise ValueError('Please provide at least one search term or pattern preset.')

    compiled = _compile_patterns(search_terms or [], use_regex, pattern_presets or [])
    if not compiled:
        raise ValueError('No valid patterns compiled from inputs.')

    fill_rgb = _hex_to_fitz_color(fill_color)
    # Label color: white on dark, black on light
    brightness = sum(fill_rgb) / 3
    label_color = (1, 1, 1) if brightness < 0.5 else (0, 0, 0)

    # Get page count
    try:
        doc_tmp = fitz.open(input_path)
        total_pages = doc_tmp.page_count
        doc_tmp.close()
    except Exception:
        total_pages = 1

    page_indices = _parse_page_selection(pages, total_pages)

    # Primary: fitz permanent redaction
    try:
        stats = _redact_with_fitz(
            input_path, output_path, compiled, page_indices,
            fill_rgb, label or '[REDACTED]', label_color)
        return {
            'output_path': output_path,
            'total_redacted': stats['total_redacted'],
            'per_page_counts': stats['per_page'],
            'method': 'fitz',
        }
    except Exception:
        pass

    # Fallback: overlay method
    try:
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt(password or '')
        writer = PdfWriter()
        total_redacted = 0
        per_page = {}

        for i, page in enumerate(reader.pages):
            if i in page_indices:
                box = page.mediabox
                w, h = float(box.width), float(box.height)
                boxes = _find_text_boxes(input_path, compiled, i)
                if boxes:
                    overlay_bytes = _overlay_redaction(w, h, boxes, fill_rgb, label)
                    ov_reader = PdfReader(io.BytesIO(overlay_bytes))
                    page.merge_page(ov_reader.pages[0])
                    per_page[i + 1] = len(boxes)
                    total_redacted += len(boxes)
            writer.add_page(page)

        with open(output_path, 'wb') as f:
            writer.write(f)

        return {
            'output_path': output_path,
            'total_redacted': total_redacted,
            'per_page_counts': per_page,
            'method': 'overlay',
        }
    except Exception as e:
        raise RuntimeError(f'Redaction failed: {e}')


def scan_for_sensitive_data(input_path: str) -> dict:
    """
    Scan a PDF for common sensitive data patterns without redacting.
    Returns dict with found patterns and their match counts.
    """
    result = {}
    try:
        doc = fitz.open(input_path)
        full_text = ' '.join(page.get_text() for page in doc)
        doc.close()

        for name, pattern_str in PATTERN_PRESETS.items():
            matches = re.findall(pattern_str, full_text)
            if matches:
                result[name] = {
                    'count': len(matches),
                    'examples': list(set(matches[:3])),
                }
    except Exception as e:
        result['error'] = str(e)

    return result
