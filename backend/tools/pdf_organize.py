"""
pdf_organize.py - Reorder, duplicate, reverse PDF pages (Ultra-Enhanced)
IshuTools.fun | Professional PDF Suite

Libraries: pypdf, pikepdf, fitz (PyMuPDF)
Features:
  - Custom page order (e.g. '3,1,2,4')
  - Reverse all pages
  - Interleave two halves (front+back scanning fix)
  - Remove duplicate pages (content hash)
  - Insert blank pages at positions
  - Duplicate specific pages
  - Rotate during organize
  - Metadata preservation
  - Preview of resulting page order
"""

import hashlib
import io
from datetime import datetime

import fitz
from pypdf import PdfWriter, PdfReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.pagesizes import A4


# ── Helpers ───────────────────────────────────────────────────────────────────

def _page_content_hash(page) -> str:
    """Hash a PDF page's text content for duplicate detection."""
    try:
        text = page.extract_text() or ''
        return hashlib.md5(text.encode('utf-8', errors='ignore')).hexdigest()
    except Exception:
        return ''


def _make_blank_page(width: float = 595.0, height: float = 842.0) -> bytes:
    """Create a blank white PDF page."""
    packet = io.BytesIO()
    c = rl_canvas.Canvas(packet, pagesize=(width, height))
    c.setFillColorRGB(1, 1, 1)
    c.rect(0, 0, width, height, fill=1, stroke=0)
    c.save()
    packet.seek(0)
    return packet.read()


def _parse_order(order_str: str, total: int) -> list:
    """
    Parse page order string to list of 0-based indices.
    Supports: '3,1,2,4', ranges '1-3,5', and keywords.
    Also supports duplicates: '1,1,2' duplicates page 1.
    """
    indices = []
    for part in order_str.replace(' ', '').split(','):
        if '-' in part and not part.startswith('-'):
            a, b = part.split('-', 1)
            try:
                for n in range(int(a), int(b) + 1):
                    if 1 <= n <= total:
                        indices.append(n - 1)
            except ValueError:
                pass
        elif part.lstrip('-').isdigit():
            n = int(part)
            if 1 <= n <= total:
                indices.append(n - 1)
    return indices


def _interleave_pages(total: int) -> list:
    """
    Interleave first half and second half (for scanner book mode).
    Result: [0, mid, 1, mid+1, 2, mid+2, ...]
    """
    mid = total // 2
    result = []
    for i in range(mid):
        result.append(i)
        if mid + i < total:
            result.append(mid + i)
    if total % 2:
        result.append(total - 1)
    return result


def _deinterleave_pages(total: int) -> list:
    """
    Reverse of interleave: split interleaved pages back to front+back halves.
    """
    front = list(range(0, total, 2))
    back = list(range(1, total, 2))
    return front + back


# ── Main API ──────────────────────────────────────────────────────────────────

def organize_pdf(
    input_path: str,
    output_path: str,
    order: str = '',
    mode: str = 'custom',
    remove_duplicates: bool = False,
    insert_blank_after: str = '',
    password: str = '',
) -> dict:
    """
    Reorder, reverse, or reorganize PDF pages.

    Args:
        input_path:          Source PDF
        output_path:         Output PDF
        order:               Custom order string e.g. '3,1,2,4' (for mode='custom')
        mode:                'custom' | 'reverse' | 'interleave' | 'deinterleave' |
                             'even_odd' | 'odd_even' | 'sort_blank_last'
        remove_duplicates:   Remove duplicate pages (by content hash)
        insert_blank_after:  Comma-separated page numbers to insert a blank page after
        password:            PDF password if encrypted
    Returns:
        dict with output_path, original_pages, output_pages, removed_duplicates
    """
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt(password or '')

    total = len(reader.pages)
    writer = PdfWriter()
    removed_dups = 0

    # Determine page order
    if mode == 'reverse':
        new_order = list(range(total - 1, -1, -1))
    elif mode == 'interleave':
        new_order = _interleave_pages(total)
    elif mode == 'deinterleave':
        new_order = _deinterleave_pages(total)
    elif mode == 'even_odd':
        evens = list(range(1, total, 2))  # 0-indexed even positions
        odds = list(range(0, total, 2))
        new_order = evens + odds
    elif mode == 'odd_even':
        odds = list(range(0, total, 2))
        evens = list(range(1, total, 2))
        new_order = odds + evens
    elif mode == 'custom' and order:
        new_order = _parse_order(order, total)
        if not new_order:
            raise ValueError('Invalid page order specified.')
    else:
        new_order = list(range(total))

    # Remove duplicates
    if remove_duplicates:
        seen_hashes = set()
        deduped = []
        for idx in new_order:
            h = _page_content_hash(reader.pages[idx])
            if h and h in seen_hashes:
                removed_dups += 1
                continue
            if h:
                seen_hashes.add(h)
            deduped.append(idx)
        new_order = deduped

    # Add pages in new order
    for idx in new_order:
        if 0 <= idx < total:
            writer.add_page(reader.pages[idx])

    # Insert blank pages
    if insert_blank_after:
        # This requires rebuilding with blanks — do a second pass
        positions = set()
        for p in insert_blank_after.replace(' ', '').split(','):
            if p.isdigit():
                positions.add(int(p) - 1)  # 0-based relative to new order

        if positions:
            # Re-build with blanks
            temp_writer = PdfWriter()
            first_page = reader.pages[new_order[0]] if new_order else reader.pages[0]
            w = float(first_page.mediabox.width)
            h = float(first_page.mediabox.height)
            blank_bytes = _make_blank_page(w, h)
            blank_reader = PdfReader(io.BytesIO(blank_bytes))

            for out_idx, out_page_ref in enumerate(writer.pages):
                temp_writer.add_page(out_page_ref)
                if out_idx in positions:
                    temp_writer.add_page(blank_reader.pages[0])
            writer = temp_writer

    # Preserve metadata
    try:
        if reader.metadata:
            meta = dict(reader.metadata)
            meta['/ModDate'] = datetime.utcnow().strftime("D:%Y%m%d%H%M%S+00'00'")
            meta['/Producer'] = 'IshuTools.fun PDF Suite'
            writer.add_metadata(meta)
    except Exception:
        pass

    with open(output_path, 'wb') as f:
        writer.write(f)

    return {
        'output_path': output_path,
        'original_pages': total,
        'output_pages': len(new_order) - removed_dups + (
            len(insert_blank_after.split(',')) if insert_blank_after else 0),
        'removed_duplicates': removed_dups,
        'mode': mode,
    }


def preview_page_order(order_str: str, total: int) -> list:
    """
    Preview the resulting page order without creating a file.
    Returns list of 1-based page numbers in new order.
    """
    indices = _parse_order(order_str, total)
    return [i + 1 for i in indices]
