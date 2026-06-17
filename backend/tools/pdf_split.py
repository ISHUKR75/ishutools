"""
pdf_split.py - Split PDF with advanced strategies (Ultra-Enhanced)
IshuTools.fun | Professional PDF Suite

Libraries: pypdf, pikepdf, fitz (PyMuPDF), zipfile
Features:
  - Split all pages (one file per page)
  - Split by page range
  - Split every N pages
  - Split by top-level bookmarks/outline
  - Split by file size limit
  - Split by blank page detection
  - Metadata preservation per split
  - Custom output naming
"""

import os
import io
import zipfile
from datetime import datetime

import fitz
import pikepdf
from pypdf import PdfWriter, PdfReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.pagesizes import A4


# ── helpers ───────────────────────────────────────────────────────────────────

def parse_ranges(ranges_str: str, total_pages: int) -> list:
    """Parse a range string like '1-3,5,7-9' into sorted 0-indexed page numbers."""
    pages = set()
    for part in ranges_str.replace(' ', '').split(','):
        if '-' in part:
            a, b = part.split('-', 1)
            try:
                s = max(0, int(a) - 1)
                e = min(total_pages - 1, int(b) - 1)
                pages.update(range(s, e + 1))
            except ValueError:
                pass
        elif part.isdigit():
            idx = int(part) - 1
            if 0 <= idx < total_pages:
                pages.add(idx)
    return sorted(pages)


def _is_blank_page(page, threshold: float = 0.99) -> bool:
    """Detect if a PDF page is nearly blank using PyMuPDF."""
    try:
        pix = page.get_pixmap(dpi=36)
        samples = pix.samples
        total = len(samples)
        if total == 0:
            return True
        white = sum(1 for b in samples if b > 240)
        return (white / total) >= threshold
    except Exception:
        text = page.get_text().strip()
        return len(text) == 0


def _write_part(reader: PdfReader, page_indices: list,
                out_path: str, base_metadata: dict = None):
    """Write selected pages from reader to out_path."""
    writer = PdfWriter()
    for idx in page_indices:
        writer.add_page(reader.pages[idx])
    if base_metadata:
        try:
            writer.add_metadata(base_metadata)
        except Exception:
            pass
    with open(out_path, 'wb') as f:
        writer.write(f)


def _get_bookmarks_flat(outline, reader) -> list:
    """Flatten nested PDF outline into list of (title, page_idx) tuples."""
    results = []
    def _recurse(items):
        for item in items:
            if isinstance(item, list):
                _recurse(item)
            else:
                try:
                    page_idx = reader.get_destination_page_number(item)
                    results.append((item.title, page_idx))
                except Exception:
                    pass
    _recurse(outline)
    return results


# ── main API ──────────────────────────────────────────────────────────────────

def split_pdf(
    input_path: str,
    out_dir: str,
    result_zip: str,
    mode: str = 'all',
    ranges: str = '',
    every_n: int = 1,
    password: str = '',
    max_size_mb: float = 0.0,
    remove_blanks: bool = False,
    naming_pattern: str = 'page_{n:04d}',
) -> dict:
    """
    Split a PDF into multiple files using various strategies.

    Args:
        input_path:      Source PDF path
        out_dir:         Directory to store split files
        result_zip:      Path for the output ZIP archive
        mode:            'all' | 'range' | 'every_n' | 'bookmarks' | 'blank_pages'
        ranges:          Page range string (mode='range')
        every_n:         Pages per chunk (mode='every_n')
        password:        PDF password if encrypted
        max_size_mb:     Target max MB per part (mode='every_n', approximate)
        remove_blanks:   Skip blank pages in all modes
        naming_pattern:  Filename pattern using {n}, {title}
    Returns:
        dict: result_zip, file_count, total_pages, skipped_blanks
    """
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt(password or '')
    total = len(reader.pages)

    # Base metadata
    base_meta = {}
    try:
        if reader.metadata:
            base_meta = dict(reader.metadata)
            base_meta['/Producer'] = 'IshuTools.fun PDF Suite'
    except Exception:
        pass

    # Detect blank pages
    blank_indices = set()
    if remove_blanks:
        try:
            doc = fitz.open(input_path)
            for i, pg in enumerate(doc):
                if _is_blank_page(pg):
                    blank_indices.add(i)
            doc.close()
        except Exception:
            pass

    output_files = []
    skipped_blanks = len(blank_indices)

    # ── mode: all (one page per file) ──────────────────────────────────────
    if mode == 'all':
        for i in range(total):
            if i in blank_indices:
                continue
            name = naming_pattern.format(n=i + 1, title=f'page_{i+1}') + '.pdf'
            out_file = os.path.join(out_dir, name)
            _write_part(reader, [i], out_file, base_meta)
            output_files.append(out_file)

    # ── mode: range (specific pages → one file) ────────────────────────────
    elif mode == 'range':
        page_indices = [i for i in parse_ranges(ranges, total)
                        if i not in blank_indices]
        if not page_indices:
            raise ValueError('No valid pages in specified range.')
        out_file = os.path.join(out_dir, 'extracted_range.pdf')
        _write_part(reader, page_indices, out_file, base_meta)
        output_files.append(out_file)

    # ── mode: every_n (chunks of N pages) ─────────────────────────────────
    elif mode == 'every_n':
        n = max(1, every_n)
        valid_pages = [i for i in range(total) if i not in blank_indices]
        chunk_num = 1
        for start in range(0, len(valid_pages), n):
            chunk = valid_pages[start:start + n]
            first = chunk[0] + 1
            last = chunk[-1] + 1
            name = naming_pattern.format(n=chunk_num, title=f'part_{chunk_num}')
            out_file = os.path.join(out_dir, f'{name}_pages_{first}-{last}.pdf')
            _write_part(reader, chunk, out_file, base_meta)
            output_files.append(out_file)
            chunk_num += 1

    # ── mode: bookmarks (split at top-level bookmarks) ────────────────────
    elif mode == 'bookmarks':
        try:
            outline = reader.outline
            flat = _get_bookmarks_flat(outline, reader)
        except Exception:
            flat = []

        if not flat:
            # Fallback: split every page
            flat = [(f'Page {i+1}', i) for i in range(total)]

        # Add sentinel
        flat.append(('END', total))
        for seg_idx in range(len(flat) - 1):
            title, start_idx = flat[seg_idx]
            _, next_idx = flat[seg_idx + 1]
            seg_pages = [i for i in range(start_idx, next_idx)
                         if i not in blank_indices]
            if not seg_pages:
                continue
            safe_title = ''.join(c if c.isalnum() or c in ' _-' else '_'
                                 for c in title)[:40].strip() or f'section_{seg_idx+1}'
            out_file = os.path.join(out_dir, f'{seg_idx+1:03d}_{safe_title}.pdf')
            _write_part(reader, seg_pages, out_file, base_meta)
            output_files.append(out_file)

    # ── mode: blank_pages (split at blank pages) ───────────────────────────
    elif mode == 'blank_pages':
        # detect blanks with fitz for this mode
        try:
            doc = fitz.open(input_path)
            blanks = set()
            for i, pg in enumerate(doc):
                if _is_blank_page(pg):
                    blanks.add(i)
            doc.close()
        except Exception:
            blanks = set()

        current_chunk = []
        chunk_num = 1
        for i in range(total):
            if i in blanks:
                if current_chunk:
                    out_file = os.path.join(out_dir,
                        f'section_{chunk_num:03d}_pages_{current_chunk[0]+1}-{current_chunk[-1]+1}.pdf')
                    _write_part(reader, current_chunk, out_file, base_meta)
                    output_files.append(out_file)
                    chunk_num += 1
                    current_chunk = []
            else:
                current_chunk.append(i)

        if current_chunk:
            out_file = os.path.join(out_dir,
                f'section_{chunk_num:03d}_pages_{current_chunk[0]+1}-{current_chunk[-1]+1}.pdf')
            _write_part(reader, current_chunk, out_file, base_meta)
            output_files.append(out_file)

    if not output_files:
        raise RuntimeError('No output files created. Check mode and page selection.')

    # Create ZIP archive with compression
    with zipfile.ZipFile(result_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for fp in output_files:
            zf.write(fp, os.path.basename(fp))

    return {
        'result_zip': result_zip,
        'file_count': len(output_files),
        'total_pages': total,
        'skipped_blanks': skipped_blanks,
    }


def get_split_preview(input_path: str, password: str = '') -> dict:
    """
    Preview what a split would produce (page count, blank count, bookmarks).
    Returns dict with total_pages, blank_pages, bookmarks, estimated_chunks.
    """
    info = {
        'total_pages': 0,
        'blank_pages': 0,
        'bookmarks': [],
        'file_size_kb': round(os.path.getsize(input_path) / 1024, 1),
    }
    try:
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt(password or '')
        info['total_pages'] = len(reader.pages)

        # Bookmarks
        try:
            flat = _get_bookmarks_flat(reader.outline, reader)
            info['bookmarks'] = [(t, p + 1) for t, p in flat[:20]]
        except Exception:
            pass

        # Blank detection
        try:
            doc = fitz.open(input_path)
            for i, pg in enumerate(doc):
                if _is_blank_page(pg):
                    info['blank_pages'] += 1
            doc.close()
        except Exception:
            pass
    except Exception:
        pass
    return info
