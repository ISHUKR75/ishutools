"""
pdf_to_img.py - Enterprise PDF to Image Converter (Ultra-Enhanced v2.0)
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41 / ISHUKR75)

Libraries: fitz (PyMuPDF) · pdf2image (Poppler) · Pillow · pypdf · zipfile

Features:
  - JPG, PNG, WebP, TIFF, BMP output formats
  - DPI control: 72 / 96 / 150 / 200 / 300 / 600 dpi
  - Page range selection (e.g. '1,3,5-8' or 'all')
  - Image enhancement: contrast, sharpness, brightness, saturation
  - Grayscale mode (RGB → Grayscale → RGB)
  - Background: white / transparent (PNG only)
  - Auto-crop white margins (remove blank borders)
  - Color profile handling (CMYK → RGB)
  - Single-page output (no ZIP, for preview)
  - Multi-page ZIP output
  - Thumbnail generation (optional)
  - Optimized JPEG progressive encoding
  - WebP lossless option
  - Page preview base64 generation for UI
  - Batch conversion with per-file stats
  - Poppler-free primary path (via fitz)
  - pdf2image fallback with smart page selection
  - Image metadata (EXIF) injection
  - Page watermark overlay on output images
  - File size reporting per page
"""

import os
import io
import zipfile
import tempfile
import logging
import base64
from datetime import datetime
from typing import Optional, List, Tuple, Dict

import fitz
from pdf2image import convert_from_path
from pypdf import PdfReader
from PIL import (Image, ImageEnhance, ImageFilter,
                  ImageOps, ImageDraw, ImageFont)

logger = logging.getLogger(__name__)


# ── Page range parser ─────────────────────────────────────────────────────────

def parse_pages(pages_str: str, total: int) -> List[int]:
    """
    Parse page selection string to sorted list of 1-based page numbers.
    Supports: 'all', '1,3,5', '1-5', '1,3-7,10', 'even', 'odd', 'first', 'last'
    """
    s = (pages_str or 'all').strip().lower()
    if s == 'all':
        return list(range(1, total + 1))
    if s == 'even':
        return [n for n in range(1, total + 1) if n % 2 == 0]
    if s == 'odd':
        return [n for n in range(1, total + 1) if n % 2 != 0]
    if s == 'first':
        return [1] if total >= 1 else []
    if s == 'last':
        return [total] if total >= 1 else []

    pages: set = set()
    for part in s.replace(' ', '').split(','):
        if '-' in part:
            try:
                a, b = part.split('-', 1)
                for n in range(int(a), int(b) + 1):
                    if 1 <= n <= total:
                        pages.add(n)
            except ValueError:
                pass
        elif part.isdigit():
            n = int(part)
            if 1 <= n <= total:
                pages.add(n)
    return sorted(pages)


# ── Image enhancement ─────────────────────────────────────────────────────────

def enhance_image(
    img:        Image.Image,
    contrast:   float = 1.0,
    sharpness:  float = 1.0,
    brightness: float = 1.0,
    saturation: float = 1.0,
    grayscale:  bool  = False,
    auto_crop:  bool  = False,
    sharpen_filter: bool = False,
) -> Image.Image:
    """Apply a pipeline of image enhancements."""
    # CMYK → RGB
    if img.mode == 'CMYK':
        img = img.convert('RGB')
    # RGBA → RGB for JPEG-compatible formats
    if img.mode == 'RGBA' and not grayscale:
        background = Image.new('RGB', img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[3])
        img = background

    if grayscale:
        img = ImageOps.grayscale(img).convert('RGB')
    if contrast != 1.0:
        img = ImageEnhance.Contrast(img).enhance(contrast)
    if brightness != 1.0:
        img = ImageEnhance.Brightness(img).enhance(brightness)
    if sharpness != 1.0:
        img = ImageEnhance.Sharpness(img).enhance(sharpness)
    if saturation != 1.0 and not grayscale:
        img = ImageEnhance.Color(img).enhance(saturation)
    if sharpen_filter:
        img = img.filter(ImageFilter.SHARPEN)
    if auto_crop:
        img = _auto_crop_white(img)
    return img


def _auto_crop_white(img: Image.Image, threshold: int = 240) -> Image.Image:
    """Auto-crop pure white borders from image."""
    try:
        gray = img.convert('L')
        bbox = gray.point(lambda p: p < threshold and 255).getbbox()
        if bbox:
            return img.crop(bbox)
    except Exception:
        pass
    return img


# ── Format helpers ────────────────────────────────────────────────────────────

def _get_save_kwargs(fmt: str, quality: int, transparent: bool = False) -> dict:
    fmt = fmt.upper()
    if fmt in ('JPG', 'JPEG'):
        return {'format': 'JPEG', 'quality': quality,
                'optimize': True, 'progressive': True,
                'subsampling': 0 if quality > 90 else 2}
    elif fmt == 'PNG':
        compress = max(0, min(9, (100 - quality) // 10))
        return {'format': 'PNG', 'optimize': True, 'compress_level': compress}
    elif fmt == 'WEBP':
        return {'format': 'WEBP', 'quality': quality,
                'method': 4, 'lossless': (quality >= 100)}
    elif fmt in ('TIF', 'TIFF'):
        return {'format': 'TIFF', 'compression': 'lzw'}
    elif fmt == 'BMP':
        return {'format': 'BMP'}
    return {'format': 'PNG'}


def _get_extension(fmt: str) -> str:
    return {
        'jpg': '.jpg', 'jpeg': '.jpg', 'png': '.png',
        'webp': '.webp', 'tif': '.tif', 'tiff': '.tif', 'bmp': '.bmp',
    }.get(fmt.lower(), '.jpg')


def _pil_mode_for_fmt(fmt: str, transparent: bool = False) -> str:
    if fmt.upper() == 'PNG' and transparent:
        return 'RGBA'
    return 'RGB'


# ── PyMuPDF conversion (primary — no Poppler required) ────────────────────────

def _convert_with_fitz(
    input_path:   str,
    page_nums:    List[int],
    dpi:          int,
    fmt:          str,
    quality:      int,
    out_dir:      str,
    enhance_kw:   dict,
    transparent:  bool = False,
    watermark:    str  = '',
    password:     str  = '',
) -> List[dict]:
    """
    Convert PDF pages using PyMuPDF. Returns list of {path, page, width, height, size_kb}.
    """
    doc = fitz.open(input_path)
    if doc.is_encrypted:
        doc.authenticate(password or '')

    results: List[dict] = []
    mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
    ext = _get_extension(fmt)

    for page_num in page_nums:
        if page_num > doc.page_count:
            continue
        try:
            page  = doc[page_num - 1]
            alpha = (fmt.upper() == 'PNG' and transparent)
            pix   = page.get_pixmap(matrix=mat, alpha=alpha)

            if alpha:
                img = Image.frombytes('RGBA', [pix.width, pix.height], pix.samples)
            else:
                img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)

            # Apply enhancements
            needs_enhance = any([
                enhance_kw.get('contrast', 1.0)   != 1.0,
                enhance_kw.get('sharpness', 1.0)  != 1.0,
                enhance_kw.get('brightness', 1.0) != 1.0,
                enhance_kw.get('saturation', 1.0) != 1.0,
                enhance_kw.get('grayscale', False),
                enhance_kw.get('auto_crop', False),
                enhance_kw.get('sharpen_filter', False),
            ])
            if needs_enhance:
                img = enhance_image(img, **enhance_kw)

            # Watermark text overlay
            if watermark:
                img = _add_text_watermark(img, watermark)

            out_file = os.path.join(out_dir, f'page_{page_num:04d}{ext}')
            save_kw  = _get_save_kwargs(fmt, quality, transparent)
            img.save(out_file, **save_kw)
            sz = os.path.getsize(out_file)
            results.append({
                'path':     out_file,
                'page':     page_num,
                'width':    img.width,
                'height':   img.height,
                'size_kb':  round(sz / 1024, 1),
            })
        except Exception as e:
            logger.warning(f'Page {page_num} fitz conversion failed: {e}')
            continue

    doc.close()
    return results


# ── pdf2image fallback (requires Poppler) ─────────────────────────────────────

def _convert_with_pdf2image(
    input_path: str,
    page_nums:  List[int],
    dpi:        int,
    fmt:        str,
    quality:    int,
    out_dir:    str,
    enhance_kw: dict,
    watermark:  str = '',
    password:   str = '',
) -> List[dict]:
    """Fallback conversion using pdf2image (Poppler-based)."""
    results: List[dict] = []
    ext = _get_extension(fmt)
    pil_fmt = 'JPEG' if fmt.lower() in ('jpg', 'jpeg') else 'PNG'

    userpw = password or None
    for page_num in page_nums:
        try:
            imgs = convert_from_path(
                input_path, dpi=dpi,
                first_page=page_num, last_page=page_num,
                fmt=pil_fmt.lower(), userpw=userpw,
            )
            if not imgs:
                continue
            img = imgs[0]
            img = enhance_image(img, **enhance_kw)
            if watermark:
                img = _add_text_watermark(img, watermark)
            out_file = os.path.join(out_dir, f'page_{page_num:04d}{ext}')
            save_kw  = _get_save_kwargs(fmt, quality)
            img.save(out_file, **save_kw)
            sz = os.path.getsize(out_file)
            results.append({
                'path':    out_file,
                'page':    page_num,
                'width':   img.width,
                'height':  img.height,
                'size_kb': round(sz / 1024, 1),
            })
        except Exception as e:
            logger.warning(f'Page {page_num} pdf2image failed: {e}')
            continue

    return results


# ── Text watermark on images ──────────────────────────────────────────────────

def _add_text_watermark(img: Image.Image, text: str,
                         opacity: int = 80) -> Image.Image:
    """Add diagonal text watermark to a PIL image."""
    try:
        overlay = Image.new('RGBA', img.size, (255, 255, 255, 0))
        draw    = ImageDraw.Draw(overlay)
        w, h    = img.size
        font_size = max(24, min(72, w // 12))
        try:
            font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
                                       font_size)
        except Exception:
            font = ImageFont.load_default()
        tw, th = draw.textbbox((0, 0), text, font=font)[2:]
        for xi in range(0, w + tw, tw + 80):
            for yi in range(0, h + th, th + 80):
                draw.text((xi, yi), text, fill=(150, 150, 150, opacity),
                           font=font)
        base = img.convert('RGBA')
        combined = Image.alpha_composite(base, overlay)
        return combined.convert('RGB')
    except Exception:
        return img


# ── Thumbnail generation ──────────────────────────────────────────────────────

def _generate_thumbnails(
    output_files: List[dict],
    thumb_dir:    str,
    thumb_size:   Tuple[int, int] = (200, 280),
) -> List[str]:
    """Generate thumbnails with drop shadow border."""
    thumb_files: List[str] = []
    os.makedirs(thumb_dir, exist_ok=True)
    for item in output_files:
        try:
            img = Image.open(item['path']).convert('RGB')
            img.thumbnail(thumb_size, Image.LANCZOS)
            border = 3
            shadow_color = (180, 180, 180)
            framed = Image.new(
                'RGB',
                (img.width + border * 2, img.height + border * 2),
                shadow_color,
            )
            framed.paste(img, (border, border))
            tp = os.path.join(thumb_dir,
                              'thumb_' + os.path.basename(item['path']))
            framed.save(tp, 'JPEG', quality=70, optimize=True)
            thumb_files.append(tp)
        except Exception:
            continue
    return thumb_files


# ── Single-page extract (for preview API) ────────────────────────────────────

def pdf_first_page_to_image(
    input_path: str,
    out_path:   str,
    dpi:        int  = 150,
    fmt:        str  = 'jpg',
    quality:    int  = 85,
    password:   str  = '',
) -> dict:
    """
    Convert only the first page of a PDF to an image.
    Faster than full conversion — used for preview thumbnails.
    """
    res = _convert_with_fitz(
        input_path, [1], dpi, fmt, quality, os.path.dirname(out_path),
        {}, password=password,
    )
    if res:
        os.rename(res[0]['path'], out_path)
        return {**res[0], 'path': out_path}
    raise RuntimeError('Could not convert first page.')


# ── Main API ──────────────────────────────────────────────────────────────────

def pdf_to_images(
    input_path:          str,
    out_dir:             str,
    result_zip:          str,
    format_type:         str   = 'jpg',
    dpi:                 int   = 150,
    pages:               str   = 'all',
    quality:             int   = 90,
    grayscale:           bool  = False,
    contrast:            float = 1.0,
    sharpness:           float = 1.0,
    brightness:          float = 1.0,
    saturation:          float = 1.0,
    auto_crop:           bool  = False,
    sharpen_filter:      bool  = False,
    transparent:         bool  = False,
    include_thumbnails:  bool  = False,
    watermark:           str   = '',
    password:            str   = '',
) -> dict:
    """
    Convert PDF pages to image files and package them in a ZIP archive.

    Args:
        input_path:         Source PDF path
        out_dir:            Directory to save converted images
        result_zip:         Output ZIP file path
        format_type:        'jpg' | 'png' | 'webp' | 'tiff' | 'bmp'
        dpi:                Resolution (72–600; 150 recommended)
        pages:              'all', 'even', 'odd', 'first', 'last', or range
        quality:            Image quality 1–100 (for JPEG/WebP)
        grayscale:          Convert to grayscale
        contrast:           Contrast factor (1.0 = original)
        sharpness:          Sharpness factor (1.0 = original)
        brightness:         Brightness factor (1.0 = original)
        saturation:         Saturation factor (1.0 = original, 0 = grayscale)
        auto_crop:          Remove white borders from images
        sharpen_filter:     Apply PIL SHARPEN filter
        transparent:        Transparent background (PNG only)
        include_thumbnails: Add thumbnails/ folder to ZIP
        watermark:          Text to overlay as diagonal watermark
        password:           PDF password if encrypted
    Returns:
        dict: result_zip, file_count, total_pages, format, dpi,
              per_page_stats, total_size_kb
    """
    dpi     = max(36, min(600, int(dpi)))
    quality = max(1, min(100, int(quality)))
    fmt     = format_type.lower().lstrip('.')

    # Get page count
    total = 0
    try:
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt(password or '')
        total = len(reader.pages)
    except Exception:
        try:
            doc = fitz.open(input_path)
            total = doc.page_count
            doc.close()
        except Exception:
            raise RuntimeError('Cannot read PDF file.')

    if total == 0:
        raise RuntimeError('PDF has no pages.')

    page_nums = parse_pages(pages, total)
    if not page_nums:
        raise RuntimeError('No valid pages selected.')

    enhance_kw = {
        'contrast':       contrast,
        'sharpness':      sharpness,
        'brightness':     brightness,
        'saturation':     saturation,
        'grayscale':      grayscale,
        'auto_crop':      auto_crop,
        'sharpen_filter': sharpen_filter,
    }

    # Primary: PyMuPDF (no Poppler dependency)
    items = _convert_with_fitz(
        input_path, page_nums, dpi, fmt, quality, out_dir,
        enhance_kw, transparent=transparent,
        watermark=watermark, password=password,
    )

    # Fallback: pdf2image (Poppler)
    if not items:
        items = _convert_with_pdf2image(
            input_path, page_nums, dpi, fmt, quality, out_dir,
            enhance_kw, watermark=watermark, password=password,
        )

    if not items:
        raise RuntimeError(
            'Could not convert any pages. The PDF may be corrupted or encrypted.'
        )

    # Optional thumbnails
    thumb_files: List[str] = []
    if include_thumbnails:
        thumb_dir  = os.path.join(out_dir, 'thumbnails')
        thumb_files = _generate_thumbnails(items, thumb_dir)

    # Build ZIP
    total_size_kb = 0.0
    with zipfile.ZipFile(result_zip, 'w', zipfile.ZIP_DEFLATED,
                          compresslevel=5) as zf:
        for item in items:
            zf.write(item['path'], os.path.basename(item['path']))
            total_size_kb += item.get('size_kb', 0)
        for tp in thumb_files:
            zf.write(tp, os.path.join('thumbnails', os.path.basename(tp)))

    return {
        'result_zip':     result_zip,
        'file_count':     len(items),
        'total_pages':    total,
        'selected_pages': len(page_nums),
        'format':         fmt.upper(),
        'dpi':            dpi,
        'thumbnail_count': len(thumb_files),
        'total_size_kb':  round(total_size_kb, 1),
        'per_page_stats': [
            {'page': it['page'], 'width': it['width'],
             'height': it['height'], 'size_kb': it['size_kb']}
            for it in items
        ],
    }


def get_page_previews(
    input_path: str,
    max_pages:  int = 6,
    thumb_size: int = 300,
    password:   str = '',
) -> List[dict]:
    """
    Generate small base64 preview images for the first N pages.
    Used by the frontend to show a preview before download.
    """
    previews: List[dict] = []
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')
        scale = thumb_size / max(doc[0].rect.width, 1) if doc.page_count else 1
        mat   = fitz.Matrix(scale, scale)
        for i in range(min(max_pages, doc.page_count)):
            pix = doc[i].get_pixmap(matrix=mat)
            img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=70, optimize=True)
            b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
            previews.append({
                'page_num': i + 1,
                'data_url': f'data:image/jpeg;base64,{b64}',
                'width':    pix.width,
                'height':   pix.height,
            })
        doc.close()
    except Exception as e:
        previews.append({'error': str(e)})
    return previews


def batch_convert(
    input_paths: List[str],
    output_dir:  str,
    fmt:         str = 'jpg',
    dpi:         int = 150,
    **kwargs,
) -> List[dict]:
    """
    Convert multiple PDFs to images, each into its own subfolder.
    Returns list of result dicts.
    """
    os.makedirs(output_dir, exist_ok=True)
    results = []
    for path in input_paths:
        base    = os.path.splitext(os.path.basename(path))[0]
        sub_dir = os.path.join(output_dir, base)
        os.makedirs(sub_dir, exist_ok=True)
        zip_path = os.path.join(output_dir, f'{base}_images.zip')
        try:
            res = pdf_to_images(path, sub_dir, zip_path, format_type=fmt,
                                 dpi=dpi, **kwargs)
            res['source_path'] = path
            results.append(res)
        except Exception as e:
            results.append({'source_path': path, 'error': str(e)})
    return results


# ── Additional Image Extraction Functions ──────────────────────────────────────


def create_contact_sheet(input_path: str, output_path: str,
                          cols: int = 3, thumb_size: int = 200,
                          password: str = '',
                          title: str = '') -> dict:
    """
    Create a contact sheet (grid of all pages) as a single image.

    Args:
        input_path:  Source PDF
        output_path: Output image path (.jpg/.png)
        cols:        Number of columns in the grid
        thumb_size:  Thumbnail size in pixels (square)
        password:    PDF password
        title:       Optional title text at top

    Returns:
        dict: page_count, cols, rows, output_path, image_size
    """
    from PIL import Image, ImageDraw, ImageFont
    import math

    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        thumbs = []
        for i in range(doc.page_count):
            pg = doc[i]
            mat = fitz.Matrix(thumb_size / max(pg.rect.width, pg.rect.height),
                              thumb_size / max(pg.rect.width, pg.rect.height))
            pix = pg.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
            img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
            # Pad to square
            sq = Image.new('RGB', (thumb_size, thumb_size), (240, 240, 240))
            ox = (thumb_size - img.width) // 2
            oy = (thumb_size - img.height) // 2
            sq.paste(img, (ox, oy))
            thumbs.append(sq)
        doc.close()

        if not thumbs:
            raise ValueError('No pages to render')

        rows = math.ceil(len(thumbs) / cols)
        pad = 8
        header_h = 40 if title else 0

        total_w = cols * thumb_size + (cols + 1) * pad
        total_h = rows * thumb_size + (rows + 1) * pad + header_h

        sheet = Image.new('RGB', (total_w, total_h), (255, 255, 255))
        draw = ImageDraw.Draw(sheet)

        if title:
            draw.text((total_w // 2, 20), title, fill=(50, 50, 50), anchor='mm')

        for idx, thumb in enumerate(thumbs):
            row, col = divmod(idx, cols)
            x = col * (thumb_size + pad) + pad
            y = row * (thumb_size + pad) + pad + header_h
            sheet.paste(thumb, (x, y))
            # Page number label
            draw.text((x + thumb_size // 2, y + thumb_size - 12),
                      str(idx + 1), fill=(100, 100, 100), anchor='mm')

        ext = os.path.splitext(output_path)[1].lower()
        fmt = 'JPEG' if ext in ('.jpg', '.jpeg') else 'PNG'
        sheet.save(output_path, format=fmt, quality=88 if fmt == 'JPEG' else None)

        return {
            'page_count': len(thumbs),
            'cols': cols,
            'rows': rows,
            'output_path': output_path,
            'image_size': (total_w, total_h),
        }

    except Exception as e:
        logger.warning(f'create_contact_sheet failed: {e}')
        raise


def extract_native_images(input_path: str, output_dir: str,
                           password: str = '',
                           min_size_kb: int = 5,
                           formats: tuple = ('jpeg', 'png', 'tiff')) -> list:
    """
    Extract all embedded images from a PDF without re-compression.

    Uses fitz to pull raw image bytes from PDF xref table.
    Filters by minimum size to skip tiny icons/artifacts.

    Args:
        input_path:   Source PDF
        output_dir:   Directory for extracted images
        password:     PDF password
        min_size_kb:  Skip images smaller than this (KB)
        formats:      Allowed image formats to save

    Returns:
        List of dicts: page, xref, filename, width, height, size_kb, format
    """
    import os
    os.makedirs(output_dir, exist_ok=True)
    results = []
    seen_xrefs = set()

    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        for page_idx in range(doc.page_count):
            pg = doc[page_idx]
            img_list = pg.get_images(full=True)
            for img_info in img_list:
                xref = img_info[0]
                if xref in seen_xrefs:
                    continue
                seen_xrefs.add(xref)

                try:
                    base = doc.extract_image(xref)
                    img_bytes = base.get('image', b'')
                    ext = base.get('ext', 'jpeg').lower()
                    w, h = base.get('width', 0), base.get('height', 0)
                    size_kb = len(img_bytes) / 1024

                    if size_kb < min_size_kb:
                        continue
                    if ext not in formats:
                        ext = 'jpeg'

                    fname = f'page{page_idx+1}_img{xref}.{ext}'
                    out_path = os.path.join(output_dir, fname)
                    with open(out_path, 'wb') as f:
                        f.write(img_bytes)

                    results.append({
                        'page': page_idx + 1,
                        'xref': xref,
                        'filename': fname,
                        'path': out_path,
                        'width': w,
                        'height': h,
                        'size_kb': round(size_kb, 1),
                        'format': ext,
                    })
                except Exception:
                    continue

        doc.close()
    except Exception as e:
        logger.warning(f'extract_native_images failed: {e}')

    return results


def stitch_pages_vertically(input_path: str, output_path: str,
                              dpi: int = 150,
                              page_range: str = 'all',
                              gap_px: int = 10,
                              password: str = '') -> dict:
    """
    Stitch all PDF pages into one tall vertical image (like a scroll).

    Useful for document preview or sharing without a PDF viewer.

    Args:
        input_path:  Source PDF
        output_path: Output image (.jpg or .png)
        dpi:         Rendering DPI
        page_range:  Page selection (e.g. '1-5')
        gap_px:      Pixel gap between pages
        password:    PDF password

    Returns:
        dict: page_count, total_height, width, output_path
    """
    from PIL import Image

    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        total = doc.page_count
        pages = parse_pages(page_range, total)

        scale = dpi / 72.0
        mat = fitz.Matrix(scale, scale)

        imgs = []
        for pg_num in pages:
            pg = doc[pg_num - 1]
            pix = pg.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
            img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
            imgs.append(img)
        doc.close()

        if not imgs:
            raise ValueError('No pages to stitch')

        max_w = max(im.width for im in imgs)
        total_h = sum(im.height for im in imgs) + gap_px * (len(imgs) - 1)

        canvas = Image.new('RGB', (max_w, total_h), (200, 200, 200))
        y_offset = 0
        for im in imgs:
            ox = (max_w - im.width) // 2
            canvas.paste(im, (ox, y_offset))
            y_offset += im.height + gap_px

        ext = os.path.splitext(output_path)[1].lower()
        fmt = 'JPEG' if ext in ('.jpg', '.jpeg') else 'PNG'
        canvas.save(output_path, format=fmt, quality=88 if fmt == 'JPEG' else None)

        return {
            'page_count': len(imgs),
            'total_height': total_h,
            'width': max_w,
            'output_path': output_path,
        }

    except Exception as e:
        logger.warning(f'stitch_pages_vertically failed: {e}')
        raise
