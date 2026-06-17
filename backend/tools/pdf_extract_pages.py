"""
pdf_extract_pages.py — Extract pages from a PDF (Ultra-Mega Enhanced)
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41 / ISHUKR75)

Libraries: pypdf, pikepdf, fitz (PyMuPDF), reportlab, Pillow, io, hashlib, struct
Features:
  - Rich page selector: '1,3,5-8', even/odd, last-N, first-N, every-Nth
  - Multi-format export: PDF, PNG images, JPEG images, text-only
  - Per-page info: dimensions, has-images, has-text, word count
  - Thumbnail grid PDF (montage of extracted pages)
  - Preserve bookmarks/outlines for extracted pages
  - Preserve named destinations
  - Preserve annotations
  - Password-protected source support
  - Metadata injection on output
  - Split into individual PDFs (one per extracted page)
  - Compression pass after extraction
  - Content hash deduplication
  - Progress dict with per-page status
"""

import hashlib
import io
import os
import struct
from datetime import datetime
from typing import Optional

import fitz                              # PyMuPDF
import pikepdf
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfWriter, PdfReader
from pypdf.generic import RectangleObject
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas


# ─────────────────────────────── Helpers ─────────────────────────────────────

def parse_page_selector(selector: str, total: int) -> list[int]:
    """
    Parse rich page selector to sorted list of 0-based indices.
    Supports:
      '1,3,5-8'     → explicit pages / ranges
      'even'        → all even pages (2,4,6...)
      'odd'         → all odd pages (1,3,5...)
      'first:5'     → first 5 pages
      'last:3'      → last 3 pages
      'every:2'     → every 2nd page (1,3,5...)
      'every:3:2'   → every 3rd starting from page 2
      'all'         → all pages
    """
    sel = selector.strip().lower()
    if sel == 'all' or sel == '':
        return list(range(total))
    if sel == 'even':
        return [i for i in range(total) if (i + 1) % 2 == 0]
    if sel == 'odd':
        return [i for i in range(total) if (i + 1) % 2 != 0]
    if sel.startswith('first:'):
        n = int(sel.split(':')[1])
        return list(range(min(n, total)))
    if sel.startswith('last:'):
        n = int(sel.split(':')[1])
        return list(range(max(0, total - n), total))
    if sel.startswith('every:'):
        parts = sel.split(':')
        step = int(parts[1]) if len(parts) > 1 else 2
        start = int(parts[2]) - 1 if len(parts) > 2 else 0
        return [i for i in range(start, total, step)]

    # Standard comma/range parser
    indices = set()
    for part in selector.replace(' ', '').split(','):
        if not part:
            continue
        if '-' in part and not part.startswith('-'):
            a, b = part.split('-', 1)
            try:
                for n in range(int(a), int(b) + 1):
                    if 1 <= n <= total:
                        indices.add(n - 1)
            except ValueError:
                pass
        elif part.lstrip('-').isdigit():
            n = int(part)
            if 1 <= n <= total:
                indices.add(n - 1)
    return sorted(indices)


def _page_info_fitz(doc: fitz.Document, page_idx: int) -> dict:
    """Get detailed info about a page using PyMuPDF."""
    try:
        page = doc[page_idx]
        rect = page.rect
        text = page.get_text('text')
        img_list = page.get_images(full=False)
        blocks = page.get_text('blocks')
        annots = list(page.annots())
        return {
            'width_pt': round(rect.width, 2),
            'height_pt': round(rect.height, 2),
            'width_mm': round(rect.width * 25.4 / 72, 1),
            'height_mm': round(rect.height * 25.4 / 72, 1),
            'has_text': len(text.strip()) > 0,
            'word_count': len(text.split()),
            'char_count': len(text),
            'image_count': len(img_list),
            'block_count': len(blocks),
            'annotation_count': len(annots),
            'text_preview': text[:200].strip().replace('\n', ' '),
        }
    except Exception as e:
        return {'error': str(e)}


def _content_hash(page) -> str:
    """MD5 hash of page text for duplicate detection."""
    try:
        text = page.extract_text() or ''
        return hashlib.md5(text.encode('utf-8', errors='ignore')).hexdigest()
    except Exception:
        return ''


def _make_thumbnail(doc: fitz.Document, page_idx: int,
                    size: tuple = (200, 283)) -> Optional[bytes]:
    """Render a small thumbnail of a page as PNG bytes."""
    try:
        page = doc[page_idx]
        mat = fitz.Matrix(size[0] / page.rect.width, size[1] / page.rect.height)
        pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
        return pix.tobytes('png')
    except Exception:
        return None


def _compress_output(input_path: str, output_path: str) -> bool:
    """Run a pikepdf compression pass on the output file."""
    try:
        with pikepdf.open(input_path) as pdf:
            pdf.save(
                output_path,
                compress_streams=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
                recompress_flate=True,
            )
        return True
    except Exception:
        return False


# ───────────────────────── Export functions ───────────────────────────────────

def _export_as_images(doc: fitz.Document, page_indices: list[int],
                      output_dir: str, fmt: str = 'png',
                      dpi: int = 150) -> list[str]:
    """Render extracted pages as image files."""
    os.makedirs(output_dir, exist_ok=True)
    paths = []
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    for i, idx in enumerate(page_indices):
        try:
            page = doc[idx]
            pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB, alpha=False)
            out = os.path.join(output_dir, f'page_{i + 1:04d}.{fmt}')
            if fmt == 'jpg' or fmt == 'jpeg':
                img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
                img.save(out, 'JPEG', quality=92, optimize=True, progressive=True)
            else:
                pix.save(out)
            paths.append(out)
        except Exception:
            continue
    return paths


def _export_as_text(doc: fitz.Document, page_indices: list[int],
                    output_path: str) -> str:
    """Export text content of extracted pages to a .txt file."""
    with open(output_path, 'w', encoding='utf-8') as f:
        for i, idx in enumerate(page_indices):
            try:
                page = doc[idx]
                text = page.get_text('text')
                f.write(f'=== Page {idx + 1} ===\n')
                f.write(text)
                f.write('\n\n')
            except Exception:
                f.write(f'=== Page {idx + 1} [error] ===\n\n')
    return output_path


def _build_thumbnail_grid(thumbnails: list[bytes], output_path: str,
                           page_labels: list[str], cols: int = 3) -> str:
    """
    Build a visual thumbnail grid PDF from a list of page PNG thumbnails.
    Each thumbnail is placed in a grid with its page label.
    """
    try:
        THUMB_W, THUMB_H = 180, 255
        MARGIN = 20
        LABEL_H = 18
        rows = (len(thumbnails) + cols - 1) // cols
        page_w = cols * (THUMB_W + MARGIN) + MARGIN
        page_h = rows * (THUMB_H + LABEL_H + MARGIN) + MARGIN

        c = rl_canvas.Canvas(output_path, pagesize=(page_w, page_h))
        c.setTitle('Extracted Pages — Thumbnail Grid')
        c.setAuthor('IshuTools.fun')

        for i, (thumb_bytes, label) in enumerate(zip(thumbnails, page_labels)):
            row = i // cols
            col = i % cols
            x = MARGIN + col * (THUMB_W + MARGIN)
            y = page_h - MARGIN - (row + 1) * (THUMB_H + LABEL_H + MARGIN)

            if thumb_bytes:
                img = Image.open(io.BytesIO(thumb_bytes)).resize(
                    (THUMB_W, THUMB_H), Image.LANCZOS)
                img_buf = io.BytesIO()
                img.save(img_buf, 'PNG')
                img_buf.seek(0)
                c.drawImage(ImageReader(img_buf), x, y + LABEL_H,
                            THUMB_W, THUMB_H, preserveAspectRatio=True)

            c.setFont('Helvetica', 9)
            c.setFillColorRGB(0.3, 0.3, 0.3)
            c.drawCentredString(x + THUMB_W / 2, y + 4, label)

            # Border
            c.setStrokeColorRGB(0.7, 0.7, 0.9)
            c.setLineWidth(0.5)
            c.rect(x, y + LABEL_H, THUMB_W, THUMB_H)

        c.save()
        return output_path
    except Exception as e:
        raise RuntimeError(f'Thumbnail grid failed: {e}')


def _split_to_individual(reader: PdfReader, page_indices: list[int],
                          output_dir: str,
                          compress: bool = True) -> list[str]:
    """Split extracted pages into individual PDF files."""
    os.makedirs(output_dir, exist_ok=True)
    paths = []
    for i, idx in enumerate(page_indices):
        try:
            w = PdfWriter()
            w.add_page(reader.pages[idx])
            out = os.path.join(output_dir, f'page_{i + 1:04d}.pdf')
            with open(out, 'wb') as f:
                w.write(f)
            if compress:
                tmp = out + '.tmp'
                if _compress_output(out, tmp):
                    os.replace(tmp, out)
            paths.append(out)
        except Exception:
            continue
    return paths


# ────────────────────────── Main API ─────────────────────────────────────────

def extract_pages(
    input_path: str,
    output_path: str,
    pages: str = 'all',
    password: str = '',
    compress: bool = True,
    preserve_bookmarks: bool = True,
    deduplicate: bool = False,
    export_format: str = 'pdf',       # 'pdf' | 'images_png' | 'images_jpg' | 'text'
    output_dir: str = '',
    split_individual: bool = False,
    generate_thumbnail_grid: bool = False,
    thumbnail_grid_path: str = '',
) -> dict:
    """
    Extract specific pages from a PDF with extensive options.

    Args:
        input_path:              Source PDF path
        output_path:             Output PDF path (for export_format='pdf')
        pages:                   Page selector string (see parse_page_selector)
        password:                PDF password if encrypted
        compress:                Apply compression pass after extraction
        preserve_bookmarks:      Copy relevant bookmarks to output
        deduplicate:             Skip pages with identical text content
        export_format:           'pdf' | 'images_png' | 'images_jpg' | 'text'
        output_dir:              Directory for image/text export or individual PDFs
        split_individual:        Save each page as its own PDF file
        generate_thumbnail_grid: Build a visual grid PDF of thumbnails
        thumbnail_grid_path:     Output path for thumbnail grid PDF
    Returns:
        Rich dict with output_path, extracted_pages, page_infos, stats
    """
    # ── Open source ────────────────────────────────────────────────────────────
    reader = PdfReader(input_path, strict=False)
    if reader.is_encrypted:
        if not reader.decrypt(password or ''):
            raise ValueError('Incorrect password for encrypted PDF.')

    total = len(reader.pages)
    page_indices = parse_page_selector(pages, total)
    if not page_indices:
        raise ValueError(f'No valid pages selected from selector: "{pages}"')

    # ── Deduplication pass ─────────────────────────────────────────────────────
    removed_dups = 0
    if deduplicate:
        seen = set()
        deduped = []
        for idx in page_indices:
            h = _content_hash(reader.pages[idx])
            if h and h in seen:
                removed_dups += 1
                continue
            if h:
                seen.add(h)
            deduped.append(idx)
        page_indices = deduped

    if not page_indices:
        raise ValueError('All selected pages were duplicates and deduplication removed them all.')

    orig_size = os.path.getsize(input_path)

    # ── Gather page info via fitz ──────────────────────────────────────────────
    fitz_doc = fitz.open(input_path)
    if fitz_doc.is_encrypted:
        fitz_doc.authenticate(password or '')

    page_infos = []
    thumbnails = []
    page_labels = []
    for idx in page_indices:
        info = _page_info_fitz(fitz_doc, idx)
        info['page_number'] = idx + 1
        page_infos.append(info)
        if generate_thumbnail_grid:
            thumbnails.append(_make_thumbnail(fitz_doc, idx))
            page_labels.append(f'Page {idx + 1}')

    # ── Export as images ───────────────────────────────────────────────────────
    exported_images = []
    if export_format in ('images_png', 'images_jpg'):
        fmt = 'png' if export_format == 'images_png' else 'jpg'
        out_dir = output_dir or os.path.dirname(output_path)
        exported_images = _export_as_images(fitz_doc, page_indices, out_dir, fmt=fmt)
        fitz_doc.close()
        return {
            'output_path': out_dir,
            'exported_images': exported_images,
            'extracted_count': len(exported_images),
            'original_pages': total,
            'format': export_format,
            'page_infos': page_infos,
        }

    # ── Export as text ─────────────────────────────────────────────────────────
    if export_format == 'text':
        txt_path = output_path.replace('.pdf', '.txt') if output_path.endswith('.pdf') else output_path + '.txt'
        _export_as_text(fitz_doc, page_indices, txt_path)
        fitz_doc.close()
        return {
            'output_path': txt_path,
            'extracted_count': len(page_indices),
            'original_pages': total,
            'format': 'text',
            'page_infos': page_infos,
        }

    fitz_doc.close()

    # ── Build output PDF ───────────────────────────────────────────────────────
    writer = PdfWriter()
    for idx in page_indices:
        writer.add_page(reader.pages[idx])

    # ── Preserve/copy bookmarks ────────────────────────────────────────────────
    if preserve_bookmarks:
        try:
            outlines = reader.outline
            idx_set = set(page_indices)

            def _copy_outlines(items, indent=0):
                for item in items:
                    if isinstance(item, list):
                        _copy_outlines(item, indent + 1)
                    else:
                        try:
                            dest_page = reader.get_destination_page_number(item)
                            if dest_page in idx_set:
                                new_page = page_indices.index(dest_page)
                                writer.add_outline_item(
                                    item.title,
                                    new_page,
                                )
                        except Exception:
                            pass

            _copy_outlines(outlines)
        except Exception:
            pass

    # ── Metadata ────────────────────────────────────────────────────────────────
    meta = {}
    try:
        if reader.metadata:
            meta = dict(reader.metadata)
    except Exception:
        pass
    meta.update({
        '/Producer': 'IshuTools.fun PDF Suite — Extract Pages',
        '/Creator': 'IshuTools.fun',
        '/ModDate': datetime.utcnow().strftime("D:%Y%m%d%H%M%S+00'00'"),
        '/ExtractedPages': str([i + 1 for i in page_indices]),
    })
    writer.add_metadata(meta)

    # Write main output
    with open(output_path, 'wb') as f:
        writer.write(f)

    # ── Compression pass ───────────────────────────────────────────────────────
    if compress:
        tmp = output_path + '.comp.tmp'
        if _compress_output(output_path, tmp):
            os.replace(tmp, output_path)

    out_size = os.path.getsize(output_path)

    # ── Split into individual PDFs ─────────────────────────────────────────────
    individual_files = []
    if split_individual:
        ind_dir = output_dir or os.path.dirname(output_path)
        individual_files = _split_to_individual(reader, page_indices, ind_dir, compress=compress)

    # ── Thumbnail grid ─────────────────────────────────────────────────────────
    grid_path = ''
    if generate_thumbnail_grid and thumbnails:
        grid_path = thumbnail_grid_path or output_path.replace('.pdf', '_grid.pdf')
        try:
            _build_thumbnail_grid(thumbnails, grid_path, page_labels)
        except Exception:
            grid_path = ''

    return {
        'output_path': output_path,
        'original_pages': total,
        'extracted_count': len(page_indices),
        'extracted_pages': [i + 1 for i in page_indices],
        'duplicates_removed': removed_dups,
        'original_size_kb': round(orig_size / 1024, 1),
        'output_size_kb': round(out_size / 1024, 1),
        'reduction_pct': round((1 - out_size / max(orig_size, 1)) * 100, 1),
        'page_infos': page_infos,
        'individual_files': individual_files,
        'thumbnail_grid_path': grid_path,
        'format': 'pdf',
    }


def get_page_info(input_path: str, password: str = '') -> dict:
    """
    Return detailed information about every page in a PDF.
    Useful for building a UI page picker.
    """
    fitz_doc = fitz.open(input_path)
    if fitz_doc.is_encrypted:
        fitz_doc.authenticate(password or '')

    reader = PdfReader(input_path, strict=False)
    if reader.is_encrypted:
        reader.decrypt(password or '')

    total = fitz_doc.page_count
    pages = []
    for i in range(total):
        info = _page_info_fitz(fitz_doc, i)
        info['page_number'] = i + 1
        pages.append(info)

    fitz_doc.close()
    return {
        'total_pages': total,
        'file_size_kb': round(os.path.getsize(input_path) / 1024, 1),
        'pages': pages,
    }


# ── Additional Page Extraction Functions ──────────────────────────────────────


def extract_pages_as_images(input_path: str, output_dir: str,
                              pages: str = 'all',
                              dpi: int = 150,
                              fmt: str = 'jpg',
                              password: str = '') -> list:
    """
    Extract specified PDF pages as individual image files.

    Args:
        input_path:  Source PDF
        output_dir:  Directory for output images
        pages:       Page selection ('all', '1-5', '1,3,5')
        dpi:         Rendering DPI
        fmt:         Output format ('jpg', 'png', 'webp')
        password:    PDF password

    Returns:
        List of dicts: page, filename, path, width, height, size_kb
    """
    import os
    os.makedirs(output_dir, exist_ok=True)

    results = []
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        total = doc.page_count
        sel_pages = parse_page_selector(pages, total)

        scale = dpi / 72.0
        mat = fitz.Matrix(scale, scale)
        fmt = fmt.lower().strip('.')
        if fmt not in ('jpg', 'jpeg', 'png', 'webp'):
            fmt = 'jpg'
        ext = 'jpg' if fmt in ('jpg', 'jpeg') else fmt

        for pg_num in sel_pages:
            pg_idx = pg_num - 1
            if pg_idx >= total:
                continue
            pg = doc[pg_idx]
            pix = pg.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
            fname = f'page_{pg_num:04d}.{ext}'
            out_path = os.path.join(output_dir, fname)
            pix.save(out_path)
            results.append({
                'page': pg_num,
                'filename': fname,
                'path': out_path,
                'width': pix.width,
                'height': pix.height,
                'size_kb': round(os.path.getsize(out_path) / 1024, 1),
            })

        doc.close()
    except Exception as e:
        logger.warning(f'extract_pages_as_images failed: {e}')

    return results


def extract_with_bookmarks(input_path: str, output_dir: str,
                            password: str = '') -> list:
    """
    Extract pages grouped by top-level bookmark sections.

    Each bookmark section becomes a separate PDF file named after the bookmark.

    Args:
        input_path:  Source PDF
        output_dir:  Output directory
        password:    PDF password

    Returns:
        List of dicts: section_name, filename, page_start, page_end, page_count
    """
    import os, re
    os.makedirs(output_dir, exist_ok=True)

    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')
        toc = doc.get_toc()
        total = doc.page_count
        doc.close()

        if not toc:
            return []

        # Top-level only
        top_level = [(title, page) for level, title, page in toc if level == 1]

        if not top_level:
            top_level = [(title, page) for level, title, page in toc]

        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt(password or '')

        results = []
        for i, (title, start_pg) in enumerate(top_level):
            end_pg = (top_level[i + 1][1] - 1) if i + 1 < len(top_level) else total

            start_idx = start_pg - 1
            end_idx = end_pg

            safe_name = re.sub(r'[^\w\s-]', '', title[:40]).strip().replace(' ', '_')
            fname = f'{i+1:03d}_{safe_name or "section"}.pdf'
            out_path = os.path.join(output_dir, fname)

            writer = PdfWriter()
            for pg_idx in range(start_idx, min(end_idx, len(reader.pages))):
                writer.add_page(reader.pages[pg_idx])

            if len(writer.pages) > 0:
                with open(out_path, 'wb') as f:
                    writer.write(f)

                results.append({
                    'section_name': title,
                    'filename': fname,
                    'path': out_path,
                    'page_start': start_pg,
                    'page_end': end_idx,
                    'page_count': len(writer.pages),
                })

        return results

    except Exception as e:
        logger.warning(f'extract_with_bookmarks failed: {e}')
        return []
