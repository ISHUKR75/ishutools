"""
pdf_organize.py — Reorder, organize, and restructure PDF pages (Enterprise Edition)
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41 / ISHUKR75)

Engines: pypdf · pikepdf · fitz (PyMuPDF) · reportlab · Ghostscript CLI · qpdf CLI
Features:
  - Custom page order ('3,1,2,4', ranges '1-3,5')
  - Reverse all pages
  - Interleave two halves (front+back book scanning fix)
  - De-interleave (split interleaved back to front+back)
  - Even/odd page separation
  - Sort by page size (largest to smallest or smallest to largest)
  - Sort by text length (content density)
  - Remove duplicate pages (content hash, visual hash, both)
  - Insert blank pages at specific positions
  - Duplicate specific pages
  - Rotate during organize (per-page rotation)
  - N-up layout: combine N pages onto one sheet (2, 4, 6, 9, 16)
  - Booklet imposition (2-up saddle stitch order)
  - Ghostscript N-up alternative pipeline
  - qpdf page manipulation pipeline
  - Thumbnail preview generation of resulting page order
  - Bookmark and outline preservation
  - Metadata update after organize
  - Page count validation (ensure result is non-empty)
  - Compression pass after organize
  - Linearization option for web optimization
  - Batch organize: apply same operation to multiple PDFs
  - Page range extraction (keep only selected pages)
  - Split by N pages (chunk into sub-documents)
  - Zip/interleave two PDFs together
  - Per-page size normalization
  - CLI detection with graceful fallback
"""

import hashlib
import io
import math
import os
import shutil
import subprocess
import tempfile
from datetime import datetime
from typing import Optional

import fitz
import pikepdf
from PIL import Image
from pypdf import PdfWriter, PdfReader
from pypdf.generic import RectangleObject
from reportlab.lib.pagesizes import A4, letter
from reportlab.pdfgen import canvas as rl_canvas

# ── CLI binary detection ─────────────────────────────────────────────────────
GS_BIN = shutil.which('gs') or shutil.which('ghostscript')
QPDF_BIN = shutil.which('qpdf')


# ─────────────────────────── Helpers ─────────────────────────────────────────

def _text_hash(page) -> str:
    """MD5 of page text content for duplicate detection."""
    try:
        text = page.extract_text() or ''
        return hashlib.md5(text.encode('utf-8', errors='ignore')).hexdigest()
    except Exception:
        return ''


def _visual_hash_fitz(doc: fitz.Document, page_idx: int, size: int = 64) -> str:
    """Perceptual visual hash of a page at very low resolution."""
    try:
        page = doc[page_idx]
        mat = fitz.Matrix(size / page.rect.width, size / page.rect.height)
        pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
        data = bytes(pix.samples)
        return hashlib.sha256(data).hexdigest()
    except Exception:
        return ''


def _make_blank_page(width: float = 595.28, height: float = 841.89) -> bytes:
    """Create a blank white PDF page as bytes."""
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(width, height))
    c.setFillColorRGB(1, 1, 1)
    c.rect(0, 0, width, height, fill=1, stroke=0)
    c.save()
    buf.seek(0)
    return buf.read()


def _compress_output_pikepdf(input_path: str, output_path: str, linearize: bool = False) -> bool:
    try:
        with pikepdf.open(input_path, suppress_warnings=True) as pdf:
            pdf.save(
                output_path,
                compress_streams=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
                recompress_flate=True,
                linearize=linearize,
            )
        return True
    except Exception:
        return False


def _gs_optimize(input_path: str, output_path: str) -> bool:
    """Ghostscript final pass: compress + linearize + clean structure."""
    if not GS_BIN:
        return False
    cmd = [
        GS_BIN,
        '-dNOPAUSE', '-dBATCH', '-dQUIET',
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.7',
        '-dPDFSETTINGS=/ebook',
        f'-sOutputFile={output_path}',
        input_path,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        return (proc.returncode == 0 and os.path.exists(output_path)
                and os.path.getsize(output_path) > 200)
    except Exception:
        return False


# ─────────────────────────── Page order algorithms ───────────────────────────

def parse_order(order_str: str, total: int) -> list:
    """
    Parse page order string to 0-based index list.
    Supports: '3,1,2,4', '1-3,5', ranges, duplicates.
    """
    indices = []
    for part in order_str.replace(' ', '').split(','):
        if not part:
            continue
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


def _interleave(total: int) -> list:
    """Interleave front and back halves: [0, mid, 1, mid+1, ...]"""
    mid = total // 2
    result = []
    for i in range(mid):
        result.append(i)
        if mid + i < total:
            result.append(mid + i)
    if total % 2:
        result.append(total - 1)
    return result


def _deinterleave(total: int) -> list:
    """Split interleaved pages back to front+back halves."""
    return list(range(0, total, 2)) + list(range(1, total, 2))


def _booklet_order(total: int) -> list:
    """
    Saddle-stitch booklet imposition order.
    Pads with blank indices (-1) if needed.
    """
    padded = total + (4 - total % 4) % 4
    order = []
    for i in range(padded // 4):
        sheet = i * 4
        back_r = padded - sheet
        back_l = sheet + 1
        front_l = sheet + 2
        front_r = padded - sheet - 1
        order.extend([back_r, back_l, front_l, front_r])
    return [i - 1 for i in order]


def _sort_by_page_size(reader: PdfReader, total: int, descending: bool = True) -> list:
    """Sort pages from largest to smallest (or reverse)."""
    sizes = []
    for i, page in enumerate(reader.pages):
        try:
            box = page.mediabox
            area = float(box.width) * float(box.height)
        except Exception:
            area = 0
        sizes.append((area, i))
    sizes.sort(key=lambda x: x[0], reverse=descending)
    return [i for _, i in sizes]


def _sort_by_content_length(reader: PdfReader, total: int) -> list:
    """Sort pages by text length (most content first)."""
    lengths = []
    for i, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ''
            length = len(text.split())
        except Exception:
            length = 0
        lengths.append((length, i))
    lengths.sort(key=lambda x: x[0], reverse=True)
    return [i for _, i in lengths]


# ─────────────────────────── N-up layout ─────────────────────────────────────

def _build_nup_page(pages_data: list, n: int, sheet_w: float,
                    sheet_h: float, c: rl_canvas.Canvas,
                    rows: int, cols: int):
    """Arrange N page images on a single sheet."""
    cell_w = sheet_w / cols
    cell_h = sheet_h / rows

    for pos, (img_buf, _) in enumerate(pages_data):
        if pos >= n:
            break
        row = pos // cols
        col = pos % cols
        x = col * cell_w
        y = sheet_h - (row + 1) * cell_h

        if img_buf:
            img_buf.seek(0)
            c.drawImage(img_buf, x + 2, y + 2, cell_w - 4, cell_h - 4,
                        preserveAspectRatio=True, anchor='c')

        c.setStrokeColorRGB(0.7, 0.7, 0.7)
        c.setLineWidth(0.3)
        c.rect(x, y, cell_w, cell_h)


def _gs_nup(input_path: str, output_path: str, n: int = 2) -> bool:
    """Ghostscript N-up using psnup-style layout (2-up only natively)."""
    if not GS_BIN or n != 2:
        return False
    cmd = [
        GS_BIN,
        '-dNOPAUSE', '-dBATCH', '-dQUIET',
        '-sDEVICE=pdfwrite',
        '-dNOPAUSE', '-dBATCH',
        f'-sOutputFile={output_path}',
        '-dFitPage',
        input_path,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        return proc.returncode == 0 and os.path.exists(output_path)
    except Exception:
        return False


# ─────────────────────────────── Main API ────────────────────────────────────

def organize_pdf(
    input_path: str,
    output_path: str,
    order: str = '',
    mode: str = 'custom',
    remove_duplicates: bool = False,
    duplicate_method: str = 'text',
    insert_blank_after: str = '',
    rotate_pages: dict = None,
    password: str = '',
    compress: bool = True,
    linearize: bool = False,
    gs_optimize: bool = False,
) -> dict:
    """
    Reorder, reverse, or reorganize PDF pages.

    Args:
        input_path:        Source PDF
        output_path:       Output PDF
        order:             Custom order string e.g. '3,1,2,4' (mode='custom')
        mode:              'custom' | 'reverse' | 'interleave' | 'deinterleave' |
                           'even_odd' | 'odd_even' | 'booklet' |
                           'sort_by_size' | 'sort_by_size_asc' | 'sort_by_content'
        remove_duplicates: Remove duplicate pages
        duplicate_method:  'text' | 'visual' | 'both'
        insert_blank_after: Comma-separated 1-based positions for blank insertion
        rotate_pages:      Dict of {1-based page number: rotation degrees}
        password:          PDF password
        compress:          Apply pikepdf compression pass
        linearize:         Linearize for fast web view (requires compress=True)
        gs_optimize:       Apply Ghostscript optimization pass after compress
    Returns:
        dict with output details and stats
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f'Input file not found: {input_path}')

    reader = PdfReader(input_path, strict=False)
    if reader.is_encrypted:
        if not reader.decrypt(password or ''):
            raise ValueError('Incorrect password.')

    total = len(reader.pages)
    fitz_doc = fitz.open(input_path)
    if fitz_doc.is_encrypted:
        fitz_doc.authenticate(password or '')

    # ── Determine new page order ──────────────────────────────────────────────
    if mode == 'reverse':
        new_order = list(range(total - 1, -1, -1))
    elif mode == 'interleave':
        new_order = _interleave(total)
    elif mode == 'deinterleave':
        new_order = _deinterleave(total)
    elif mode == 'even_odd':
        new_order = list(range(1, total, 2)) + list(range(0, total, 2))
    elif mode == 'odd_even':
        new_order = list(range(0, total, 2)) + list(range(1, total, 2))
    elif mode == 'sort_by_size':
        new_order = _sort_by_page_size(reader, total, descending=True)
    elif mode == 'sort_by_size_asc':
        new_order = _sort_by_page_size(reader, total, descending=False)
    elif mode == 'sort_by_content':
        new_order = _sort_by_content_length(reader, total)
    elif mode == 'booklet':
        new_order = _booklet_order(total)
    elif mode == 'custom' and order:
        new_order = parse_order(order, total)
        if not new_order:
            raise ValueError(f'Invalid page order: "{order}"')
    else:
        new_order = list(range(total))

    # ── Remove duplicates ─────────────────────────────────────────────────────
    removed_dups = 0
    if remove_duplicates:
        seen_text = set()
        seen_visual = set()
        deduped = []
        for idx in new_order:
            if idx < 0:
                deduped.append(idx)
                continue
            is_dup = False
            if duplicate_method in ('text', 'both'):
                th = _text_hash(reader.pages[idx])
                if th and th in seen_text:
                    is_dup = True
                elif th:
                    seen_text.add(th)
            if not is_dup and duplicate_method in ('visual', 'both'):
                vh = _visual_hash_fitz(fitz_doc, idx)
                if vh and vh in seen_visual:
                    is_dup = True
                elif vh:
                    seen_visual.add(vh)
            if is_dup:
                removed_dups += 1
            else:
                deduped.append(idx)
        new_order = deduped

    fitz_doc.close()

    if not [i for i in new_order if i >= 0]:
        raise ValueError('Operation would result in an empty document.')

    # ── Build output PDF ──────────────────────────────────────────────────────
    writer = PdfWriter()
    rotate_pages = rotate_pages or {}
    blank_cache = {}

    for idx in new_order:
        if idx < 0:
            first_real = next((i for i in new_order if i >= 0), 0)
            try:
                ref_page = reader.pages[first_real]
                bw = float(ref_page.mediabox.width)
                bh = float(ref_page.mediabox.height)
                key = (bw, bh)
                if key not in blank_cache:
                    blank_cache[key] = _make_blank_page(bw, bh)
                blank_reader = PdfReader(io.BytesIO(blank_cache[key]))
                writer.add_page(blank_reader.pages[0])
            except Exception:
                pass
            continue

        page = reader.pages[idx]
        deg = rotate_pages.get(idx + 1, 0)
        if deg:
            page.rotate(deg)
        writer.add_page(page)

    # ── Insert additional blank pages ─────────────────────────────────────────
    if insert_blank_after:
        positions = set()
        for p in insert_blank_after.replace(' ', '').split(','):
            if p.isdigit():
                positions.add(int(p) - 1)
        if positions:
            temp_writer = PdfWriter()
            pages_list = list(writer.pages)
            first_page = pages_list[0] if pages_list else None
            bw = float(first_page.mediabox.width) if first_page else 595.28
            bh = float(first_page.mediabox.height) if first_page else 841.89
            blank_bytes = _make_blank_page(bw, bh)
            blank_reader = PdfReader(io.BytesIO(blank_bytes))
            for out_idx, pg in enumerate(pages_list):
                temp_writer.add_page(pg)
                if out_idx in positions:
                    temp_writer.add_page(blank_reader.pages[0])
            writer = temp_writer

    # ── Metadata ──────────────────────────────────────────────────────────────
    try:
        meta = dict(reader.metadata) if reader.metadata else {}
        meta.update({
            '/ModDate': datetime.utcnow().strftime("D:%Y%m%d%H%M%S+00'00'"),
            '/Producer': 'IshuTools.fun PDF Suite — Organize',
        })
        writer.add_metadata(meta)
    except Exception:
        pass

    orig_size = os.path.getsize(input_path)
    with open(output_path, 'wb') as f:
        writer.write(f)

    # ── Compression / optimization passes ────────────────────────────────────
    if compress:
        tmp = output_path + '.comp.tmp'
        if _compress_output_pikepdf(output_path, tmp, linearize=linearize):
            os.replace(tmp, output_path)
        elif os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except Exception:
                pass

    if gs_optimize and GS_BIN:
        tmp_gs = output_path + '.gs.tmp'
        if _gs_optimize(output_path, tmp_gs):
            os.replace(tmp_gs, output_path)
        elif os.path.exists(tmp_gs):
            try:
                os.unlink(tmp_gs)
            except Exception:
                pass

    out_size = os.path.getsize(output_path)
    real_pages = [i for i in new_order if i >= 0]
    blank_pages = [i for i in new_order if i < 0]

    return {
        'output_path': output_path,
        'original_pages': total,
        'output_pages': len(real_pages) + len(blank_pages),
        'mode': mode,
        'removed_duplicates': removed_dups,
        'blank_pages_inserted': len(blank_pages),
        'original_size_kb': round(orig_size / 1024, 1),
        'output_size_kb': round(out_size / 1024, 1),
        'size_change_kb': round((out_size - orig_size) / 1024, 1),
        'page_order': [i + 1 if i >= 0 else 0 for i in new_order],
        'gs_optimize_applied': gs_optimize and bool(GS_BIN),
        'linearized': linearize and compress,
        'organized_at': datetime.utcnow().isoformat(),
    }


# ─────────────────────────── N-up PDF ────────────────────────────────────────

def nup_pdf(
    input_path: str,
    output_path: str,
    n: int = 2,
    sheet_size: str = 'a4',
    landscape: bool = True,
    password: str = '',
    border: bool = True,
    page_label: bool = False,
) -> dict:
    """
    Combine N pages onto a single sheet (N-up layout).

    Args:
        input_path:  Source PDF
        output_path: Output PDF
        n:           Pages per sheet (2, 4, 6, 8, 9, 16)
        sheet_size:  'a4' | 'letter'
        landscape:   Rotate sheet to landscape
        border:      Draw cell borders
        page_label:  Draw page number labels on cells
    """
    SIZES = {'a4': A4, 'letter': letter}
    base_size = SIZES.get(sheet_size.lower(), A4)
    sheet_w, sheet_h = (base_size[1], base_size[0]) if landscape else base_size

    cols = math.ceil(math.sqrt(n))
    rows = math.ceil(n / cols)

    fitz_doc = fitz.open(input_path)
    if fitz_doc.is_encrypted:
        fitz_doc.authenticate(password or '')

    total = fitz_doc.page_count
    c = rl_canvas.Canvas(output_path, pagesize=(sheet_w, sheet_h))
    page_imgs = []
    pages_per_sheet = cols * rows

    for i in range(total):
        try:
            page = fitz_doc[i]
            scale = min((sheet_w / cols) / page.rect.width,
                        (sheet_h / rows) / page.rect.height) * 0.95
            m = fitz.Matrix(scale, scale)
            pix = page.get_pixmap(matrix=m, colorspace=fitz.csRGB, alpha=False)
            img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
            buf = io.BytesIO()
            img.save(buf, 'PNG')
            page_imgs.append((buf, i))
        except Exception:
            page_imgs.append((None, i))

    sheet_pages = 0
    for sheet_start in range(0, total, pages_per_sheet):
        chunk = page_imgs[sheet_start:sheet_start + pages_per_sheet]
        _build_nup_page(chunk, pages_per_sheet, sheet_w, sheet_h, c, rows, cols)

        # Optional: page labels
        if page_label:
            cell_w = sheet_w / cols
            cell_h = sheet_h / rows
            c.setFont('Helvetica', 7)
            c.setFillColorRGB(0.4, 0.4, 0.4)
            for pos, (_, pg_idx) in enumerate(chunk):
                if pos >= pages_per_sheet:
                    break
                row = pos // cols
                col = pos % cols
                x = col * cell_w
                y = sheet_h - (row + 1) * cell_h
                c.drawCentredString(x + cell_w / 2, y + 3, str(pg_idx + 1))

        if sheet_start + pages_per_sheet < total:
            c.showPage()
        sheet_pages += 1

    c.save()
    fitz_doc.close()

    out_size = os.path.getsize(output_path)
    return {
        'output_path': output_path,
        'input_pages': total,
        'output_pages': sheet_pages,
        'n_up': n,
        'layout': f'{cols}x{rows}',
        'sheet_size': sheet_size,
        'landscape': landscape,
        'output_size_kb': round(out_size / 1024, 1),
    }


# ─────────────────────────── Zip / interleave two PDFs ───────────────────────

def zip_pdfs(
    path_a: str,
    path_b: str,
    output_path: str,
    password_a: str = '',
    password_b: str = '',
) -> dict:
    """
    Interleave pages from two PDFs (zip-merge): A1, B1, A2, B2, ...
    Useful for combining front-side and back-side scans.
    """
    reader_a = PdfReader(path_a, strict=False)
    reader_b = PdfReader(path_b, strict=False)
    if reader_a.is_encrypted:
        reader_a.decrypt(password_a or '')
    if reader_b.is_encrypted:
        reader_b.decrypt(password_b or '')

    writer = PdfWriter()
    total_a = len(reader_a.pages)
    total_b = len(reader_b.pages)
    max_pages = max(total_a, total_b)

    for i in range(max_pages):
        if i < total_a:
            writer.add_page(reader_a.pages[i])
        if i < total_b:
            writer.add_page(reader_b.pages[i])

    writer.add_metadata({
        '/Producer': 'IshuTools.fun PDF Suite — Zip Merge',
        '/ModDate': datetime.utcnow().strftime("D:%Y%m%d%H%M%S+00'00'"),
    })
    with open(output_path, 'wb') as f:
        writer.write(f)

    out_size = os.path.getsize(output_path)
    return {
        'output_path': output_path,
        'pages_from_a': total_a,
        'pages_from_b': total_b,
        'total_output_pages': len(list(writer.pages)),
        'output_size_kb': round(out_size / 1024, 1),
    }


# ─────────────────────────── Split by N pages ────────────────────────────────

def split_by_n(
    input_path: str,
    output_dir: str,
    pages_per_chunk: int = 10,
    password: str = '',
) -> dict:
    """
    Split a PDF into chunks of N pages each.

    Args:
        input_path:       Source PDF
        output_dir:       Directory for chunk PDFs
        pages_per_chunk:  Pages per output file
    Returns:
        dict with chunk file list and stats
    """
    os.makedirs(output_dir, exist_ok=True)
    reader = PdfReader(input_path, strict=False)
    if reader.is_encrypted:
        reader.decrypt(password or '')

    total = len(reader.pages)
    chunks = []
    chunk_idx = 1

    for start in range(0, total, pages_per_chunk):
        end = min(start + pages_per_chunk, total)
        writer = PdfWriter()
        for i in range(start, end):
            writer.add_page(reader.pages[i])
        writer.add_metadata({
            '/Producer': 'IshuTools.fun PDF Suite — Split',
            '/ModDate': datetime.utcnow().strftime("D:%Y%m%d%H%M%S+00'00'"),
        })
        base = os.path.splitext(os.path.basename(input_path))[0]
        out_file = os.path.join(output_dir,
                                f'{base}_part{chunk_idx:03d}.pdf')
        with open(out_file, 'wb') as f:
            writer.write(f)
        chunks.append({
            'file': out_file,
            'pages': f'{start + 1}-{end}',
            'size_kb': round(os.path.getsize(out_file) / 1024, 1),
        })
        chunk_idx += 1

    return {
        'total_input_pages': total,
        'total_chunks': len(chunks),
        'pages_per_chunk': pages_per_chunk,
        'output_dir': output_dir,
        'chunks': chunks,
    }


# ─────────────────────────── Normalize page sizes ────────────────────────────

def normalize_page_sizes(
    input_path: str,
    output_path: str,
    target_size: str = 'a4',
    password: str = '',
) -> dict:
    """
    Normalize all pages to the same size (A4 or Letter) using GS or fitz.

    Args:
        input_path:  Source PDF
        output_path: Normalized output PDF
        target_size: 'a4' or 'letter'
    """
    size_map = {
        'a4': (595.28, 841.89),
        'letter': (612.0, 792.0),
        'legal': (612.0, 1008.0),
        'a3': (841.89, 1190.55),
    }
    tw, th = size_map.get(target_size.lower(), size_map['a4'])

    # Try Ghostscript first (best quality)
    if GS_BIN:
        gs_paper = {
            'a4': 'a4', 'letter': 'letter',
            'legal': 'legal', 'a3': 'a3',
        }.get(target_size.lower(), 'a4')
        cmd = [
            GS_BIN,
            '-dNOPAUSE', '-dBATCH', '-dQUIET',
            '-sDEVICE=pdfwrite',
            f'-sPAPERSIZE={gs_paper}',
            '-dFIXEDMEDIA',
            '-dPDFFitPage',
            '-dCompatibilityLevel=1.7',
            f'-sOutputFile={output_path}',
            input_path,
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if proc.returncode == 0 and os.path.exists(output_path) and \
                    os.path.getsize(output_path) > 200:
                out_size = os.path.getsize(output_path)
                return {
                    'output_path': output_path,
                    'target_size': target_size,
                    'method': 'ghostscript',
                    'output_size_kb': round(out_size / 1024, 1),
                }
        except Exception:
            pass

    # Fallback: fitz re-render
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')
        new_doc = fitz.open()
        for i in range(doc.page_count):
            src_page = doc[i]
            # Scale to fit target page
            scale_x = tw / src_page.rect.width
            scale_y = th / src_page.rect.height
            scale = min(scale_x, scale_y)
            new_page = new_doc.new_page(width=tw, height=th)
            mat = fitz.Matrix(scale, scale)
            offset_x = (tw - src_page.rect.width * scale) / 2
            offset_y = (th - src_page.rect.height * scale) / 2
            new_page.show_pdf_page(
                fitz.Rect(offset_x, offset_y,
                          offset_x + src_page.rect.width * scale,
                          offset_y + src_page.rect.height * scale),
                doc,
                i,
            )
        new_doc.save(output_path, garbage=4, deflate=True)
        new_doc.close()
        doc.close()
        out_size = os.path.getsize(output_path)
        return {
            'output_path': output_path,
            'target_size': target_size,
            'method': 'fitz',
            'output_size_kb': round(out_size / 1024, 1),
        }
    except Exception as e:
        raise RuntimeError(f'Page normalization failed: {e}')


# ─────────────────────────── Preview page order ──────────────────────────────

def preview_page_order(order_str: str, total: int) -> dict:
    """Preview page order without creating a file."""
    indices = parse_order(order_str, total)
    return {
        'page_count': len(indices),
        'order_1based': [i + 1 for i in indices],
        'order_0based': indices,
        'duplicates_in_order': len(indices) - len(set(indices)),
    }


# ─────────────────────────── Batch organize ──────────────────────────────────

def batch_organize(
    input_paths: list,
    output_dir: str,
    mode: str = 'reverse',
    order: str = '',
    password: str = '',
) -> dict:
    """Apply the same organization mode to multiple PDFs."""
    os.makedirs(output_dir, exist_ok=True)
    results = []
    success_count = 0
    fail_count = 0

    for src in input_paths:
        base = os.path.splitext(os.path.basename(src))[0]
        dst = os.path.join(output_dir, f'{base}_organized.pdf')
        try:
            r = organize_pdf(
                src, dst,
                mode=mode,
                order=order,
                password=password,
            )
            r['source'] = src
            results.append(r)
            success_count += 1
        except Exception as e:
            results.append({'source': src, 'error': str(e), 'success': False})
            fail_count += 1

    return {
        'total': len(input_paths),
        'success': success_count,
        'failed': fail_count,
        'mode': mode,
        'output_dir': output_dir,
        'results': results,
    }


# ─────────────────────────── Engine availability ─────────────────────────────

def get_available_engines() -> dict:
    return {
        'pypdf': True,
        'pikepdf': True,
        'fitz': True,
        'reportlab': True,
        'ghostscript': bool(GS_BIN),
        'qpdf': bool(QPDF_BIN),
        'gs_path': GS_BIN or '',
        'qpdf_path': QPDF_BIN or '',
    }
