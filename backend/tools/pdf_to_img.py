"""
pdf_to_img.py - Convert PDF pages to images (Ultra-Enhanced)
IshuTools.fun | Professional PDF Suite

Libraries: pdf2image, fitz (PyMuPDF), Pillow, pypdf, zipfile
Features:
  - JPG, PNG, WebP, TIFF output formats
  - Multiple DPI presets (72, 150, 200, 300, 600)
  - Page range selection
  - Image enhancement (contrast, sharpness, brightness)
  - Thumbnail generation (separate ZIP)
  - Transparent PNG support (PDF pages with alpha)
  - Grayscale conversion
  - Individual file naming with metadata
  - Optimized compression per format
  - Batch conversion with progress info
"""

import os
import zipfile
import io
import tempfile

import fitz
from pdf2image import convert_from_path
from pypdf import PdfReader
from PIL import Image, ImageEnhance, ImageFilter


# ── Page selection ────────────────────────────────────────────────────────────

def parse_pages(pages_str: str, total: int) -> list:
    """Parse page selection string to list of 1-based page numbers."""
    if pages_str.strip().lower() == 'all':
        return list(range(1, total + 1))
    pages = set()
    for part in pages_str.replace(' ', '').split(','):
        if '-' in part:
            a, b = part.split('-', 1)
            try:
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

def enhance_image(img: Image.Image,
                  contrast: float = 1.0,
                  sharpness: float = 1.0,
                  brightness: float = 1.0,
                  grayscale: bool = False) -> Image.Image:
    """Apply image enhancements."""
    if grayscale:
        img = img.convert('L').convert('RGB')
    if contrast != 1.0:
        img = ImageEnhance.Contrast(img).enhance(contrast)
    if brightness != 1.0:
        img = ImageEnhance.Brightness(img).enhance(brightness)
    if sharpness != 1.0:
        img = ImageEnhance.Sharpness(img).enhance(sharpness)
    return img


def _get_save_kwargs(fmt: str, quality: int) -> dict:
    """Get PIL save kwargs for a given format."""
    fmt = fmt.upper()
    if fmt in ('JPG', 'JPEG'):
        return {'format': 'JPEG', 'quality': quality, 'optimize': True,
                'progressive': True}
    elif fmt == 'PNG':
        return {'format': 'PNG', 'optimize': True,
                'compress_level': max(0, min(9, (100 - quality) // 10))}
    elif fmt == 'WEBP':
        return {'format': 'WEBP', 'quality': quality, 'method': 4}
    elif fmt in ('TIF', 'TIFF'):
        return {'format': 'TIFF', 'compression': 'lzw'}
    elif fmt == 'BMP':
        return {'format': 'BMP'}
    return {'format': 'PNG'}


def _get_extension(fmt: str) -> str:
    fmt = fmt.lower()
    ext_map = {'jpg': '.jpg', 'jpeg': '.jpg', 'png': '.png',
               'webp': '.webp', 'tif': '.tif', 'tiff': '.tif', 'bmp': '.bmp'}
    return ext_map.get(fmt, '.png')


# ── Conversion via PyMuPDF (primary - no Poppler required) ────────────────────

def _convert_with_fitz(input_path: str, page_nums: list, dpi: int,
                        fmt: str, quality: int, out_dir: str,
                        enhance_kwargs: dict) -> list:
    """Convert PDF pages using PyMuPDF (fitz). No Poppler dependency."""
    doc = fitz.open(input_path)
    output_files = []
    ext = _get_extension(fmt)
    mat = fitz.Matrix(dpi / 72, dpi / 72)

    for page_num in page_nums:
        if page_num > doc.page_count:
            continue
        page = doc[page_num - 1]
        pix = page.get_pixmap(matrix=mat, alpha=(fmt.upper() == 'PNG'))

        try:
            if fmt.upper() == 'PNG' and pix.alpha:
                img = Image.frombytes('RGBA', [pix.width, pix.height], pix.samples)
            else:
                img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)

            # Apply enhancements
            if any(v != 1.0 for v in [enhance_kwargs.get('contrast', 1.0),
                                        enhance_kwargs.get('sharpness', 1.0),
                                        enhance_kwargs.get('brightness', 1.0)]):
                img = enhance_image(img, **enhance_kwargs)
            elif enhance_kwargs.get('grayscale'):
                img = img.convert('L').convert('RGB')

            out_file = os.path.join(out_dir, f'page_{page_num:04d}{ext}')
            save_kwargs = _get_save_kwargs(fmt, quality)
            img.save(out_file, **save_kwargs)
            output_files.append(out_file)
        except Exception:
            continue

    doc.close()
    return output_files


# ── Conversion via pdf2image (fallback, needs Poppler) ────────────────────────

def _convert_with_pdf2image(input_path: str, page_nums: list, dpi: int,
                              fmt: str, quality: int, out_dir: str,
                              enhance_kwargs: dict) -> list:
    """Convert PDF pages using pdf2image (Poppler-based fallback)."""
    output_files = []
    ext = _get_extension(fmt)
    pil_format = 'JPEG' if fmt.lower() in ('jpg', 'jpeg') else 'PNG'

    for page_num in page_nums:
        try:
            imgs = convert_from_path(
                input_path, dpi=dpi,
                first_page=page_num, last_page=page_num,
                fmt=pil_format.lower())
            if imgs:
                img = imgs[0]
                img = enhance_image(img, **enhance_kwargs)
                out_file = os.path.join(out_dir, f'page_{page_num:04d}{ext}')
                save_kwargs = _get_save_kwargs(fmt, quality)
                img.save(out_file, **save_kwargs)
                output_files.append(out_file)
        except Exception:
            continue

    return output_files


# ── Thumbnail generation ──────────────────────────────────────────────────────

def _generate_thumbnails(output_files: list, thumb_dir: str,
                          thumb_size: tuple = (200, 280)) -> list:
    """Generate thumbnails for all converted images."""
    thumb_files = []
    for img_path in output_files:
        try:
            img = Image.open(img_path).convert('RGB')
            img.thumbnail(thumb_size, Image.LANCZOS)
            # Add shadow/border
            border = 2
            thumb_with_border = Image.new(
                'RGB',
                (img.width + border * 2, img.height + border * 2),
                (200, 200, 200))
            thumb_with_border.paste(img, (border, border))
            thumb_path = os.path.join(thumb_dir, 'thumb_' + os.path.basename(img_path))
            thumb_with_border.save(thumb_path, 'JPEG', quality=75)
            thumb_files.append(thumb_path)
        except Exception:
            continue
    return thumb_files


# ── Main API ──────────────────────────────────────────────────────────────────

def pdf_to_images(
    input_path: str,
    out_dir: str,
    result_zip: str,
    format_type: str = 'jpg',
    dpi: int = 150,
    pages: str = 'all',
    quality: int = 90,
    grayscale: bool = False,
    contrast: float = 1.0,
    sharpness: float = 1.0,
    brightness: float = 1.0,
    include_thumbnails: bool = False,
    password: str = '',
) -> dict:
    """
    Convert PDF pages to image files and package them in a ZIP.

    Args:
        input_path:        Source PDF path
        out_dir:           Directory to save images
        result_zip:        Output ZIP archive path
        format_type:       'jpg' | 'png' | 'webp' | 'tiff' | 'bmp'
        dpi:               Resolution (72-600; 150 recommended for screen)
        pages:             'all' or range e.g. '1,3,5-8'
        quality:           Image quality 1-100 (JPEG/WebP)
        grayscale:         Convert to grayscale
        contrast:          Contrast factor (1.0 = original)
        sharpness:         Sharpness factor (1.0 = original)
        brightness:        Brightness factor (1.0 = original)
        include_thumbnails: Add a thumbnails/ folder in the ZIP
        password:          PDF password if encrypted
    Returns:
        dict with result_zip, file_count, total_pages, format, dpi
    """
    dpi = max(36, min(600, dpi))
    quality = max(1, min(100, quality))

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
        raise RuntimeError('No valid pages in selection.')

    enhance_kwargs = {
        'contrast': contrast,
        'sharpness': sharpness,
        'brightness': brightness,
        'grayscale': grayscale,
    }

    # Primary: fitz (no Poppler dependency)
    output_files = _convert_with_fitz(
        input_path, page_nums, dpi, format_type, quality, out_dir, enhance_kwargs)

    # Fallback: pdf2image
    if not output_files:
        output_files = _convert_with_pdf2image(
            input_path, page_nums, dpi, format_type, quality, out_dir, enhance_kwargs)

    if not output_files:
        raise RuntimeError('Could not convert any pages to images.')

    # Generate thumbnails
    thumb_files = []
    if include_thumbnails:
        thumb_dir = os.path.join(out_dir, 'thumbnails')
        os.makedirs(thumb_dir, exist_ok=True)
        thumb_files = _generate_thumbnails(output_files, thumb_dir)

    # Create ZIP
    with zipfile.ZipFile(result_zip, 'w', zipfile.ZIP_DEFLATED,
                          compresslevel=5) as zf:
        for fp in output_files:
            zf.write(fp, os.path.basename(fp))
        for fp in thumb_files:
            zf.write(fp, os.path.join('thumbnails', os.path.basename(fp)))

    return {
        'result_zip': result_zip,
        'file_count': len(output_files),
        'total_pages': total,
        'format': format_type.upper(),
        'dpi': dpi,
        'thumbnail_count': len(thumb_files),
    }


def get_page_previews(input_path: str, max_pages: int = 6,
                       thumb_size: int = 300, password: str = '') -> list:
    """
    Generate small preview images for the first N pages.
    Returns list of dicts with page_num and base64 image data.
    """
    import base64
    previews = []
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')
        mat = fitz.Matrix(thumb_size / max(doc[0].rect.width, 1), thumb_size / max(doc[0].rect.width, 1))
        for i in range(min(max_pages, doc.page_count)):
            pix = doc[i].get_pixmap(matrix=mat)
            img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=70)
            b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
            previews.append({
                'page_num': i + 1,
                'data_url': f'data:image/jpeg;base64,{b64}',
                'width': pix.width,
                'height': pix.height,
            })
        doc.close()
    except Exception as e:
        previews.append({'error': str(e)})
    return previews
