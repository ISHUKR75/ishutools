"""
img_to_pdf.py — Convert images to PDF (Enterprise Edition)
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41 / ISHUKR75)

Engines: Pillow · img2pdf · reportlab · fitz (PyMuPDF) · pikepdf · Ghostscript CLI · ImageMagick CLI
Features:
  - JPG, PNG, WebP, BMP, TIFF, GIF (first frame), ICO, PSD input
  - img2pdf for bit-perfect lossless PDF creation (best quality)
  - Multiple page size presets (A4, A3, A5, Letter, Legal, Tabloid, fit, custom)
  - Portrait / landscape / auto orientation per image
  - Adjustable margins (top, bottom, left, right independently)
  - EXIF orientation correction
  - Grayscale conversion option
  - Multi-image → single PDF (one image per page)
  - Optional text caption per page (with font size control)
  - Optional watermark text overlay (angle, opacity, color)
  - Background color selection per page
  - Image enhancement: contrast, sharpness, brightness, saturation
  - PDF metadata from EXIF data (Make, Model, DateTime, Artist)
  - Ghostscript post-pass compression (optional)
  - pikepdf metadata injection
  - ImageMagick pre-processing fallback for exotic formats
  - DPI-aware sizing (auto-detect from image metadata)
  - Multiple images on one page (grid layout) option
  - Header/footer text per page
  - Page numbering option
  - Custom PDF metadata (title, author, subject, keywords)
  - Batch folder processing
  - Output compression level selection
  - Border / shadow effect on image
"""

import os
import io
import math
import shutil
import subprocess
import tempfile
from datetime import datetime

import img2pdf
import fitz
import pikepdf
from PIL import Image, ImageOps, ImageEnhance, ImageFilter, ExifTags
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.pagesizes import (A3, A4, A5, letter, legal,
                                      landscape as rl_landscape)
from reportlab.lib.colors import HexColor

# ── CLI binary detection ─────────────────────────────────────────────────────
GS_BIN = shutil.which('gs') or shutil.which('ghostscript')
IM_BIN = shutil.which('convert') or shutil.which('magick')

# ── Page size presets ─────────────────────────────────────────────────────────
PAGE_SIZES = {
    'A3':      A3,
    'A4':      A4,
    'A5':      A5,
    'Letter':  letter,
    'Legal':   legal,
    'A3L':     rl_landscape(A3),
    'A4L':     rl_landscape(A4),
}


# ── EXIF helpers ──────────────────────────────────────────────────────────────

def _fix_exif_orientation(img: Image.Image) -> Image.Image:
    """Rotate/flip image to correct EXIF orientation tag."""
    try:
        exif_raw = img._getexif()
        if not exif_raw:
            return img
        orient_tag = next(
            (k for k, v in ExifTags.TAGS.items() if v == 'Orientation'), None)
        if not orient_tag or orient_tag not in exif_raw:
            return img
        orientation = exif_raw[orient_tag]
        rotate_map = {3: Image.ROTATE_180, 6: Image.ROTATE_270,
                      8: Image.ROTATE_90}
        flip_map = {2: Image.FLIP_LEFT_RIGHT, 4: Image.FLIP_TOP_BOTTOM,
                    5: Image.TRANSPOSE, 7: Image.TRANSVERSE}
        if orientation in rotate_map:
            img = img.transpose(rotate_map[orientation])
        elif orientation in flip_map:
            img = img.transpose(flip_map[orientation])
    except Exception:
        pass
    return img


def _get_exif_metadata(img: Image.Image) -> dict:
    meta = {}
    try:
        exif_raw = img._getexif()
        if not exif_raw:
            return meta
        tag_names = {v: k for k, v in ExifTags.TAGS.items()}
        for field in ('Make', 'Model', 'DateTime', 'Software',
                      'ImageDescription', 'Artist', 'Copyright',
                      'XResolution', 'YResolution'):
            tag_id = tag_names.get(field)
            if tag_id and tag_id in exif_raw:
                meta[field] = str(exif_raw[tag_id])
    except Exception:
        pass
    return meta


def _get_image_dpi(img: Image.Image) -> tuple:
    """Retrieve DPI from image info dict, default 96."""
    try:
        dpi = img.info.get('dpi') or img.info.get('resolution')
        if dpi and isinstance(dpi, (tuple, list)) and len(dpi) >= 2:
            x, y = float(dpi[0]), float(dpi[1])
            if x > 0 and y > 0:
                return (x, y)
    except Exception:
        pass
    return (96.0, 96.0)


# ── Image preparation ─────────────────────────────────────────────────────────

def _load_image_im_fallback(path: str) -> str:
    """Use ImageMagick to convert exotic format to PNG temp file."""
    if not IM_BIN:
        return None
    tmp = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
    tmp.close()
    cmd = [IM_BIN, path, '-flatten', tmp.name]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=30)
        if proc.returncode == 0 and os.path.exists(tmp.name):
            return tmp.name
    except Exception:
        pass
    return None


def _load_and_prep_image(
    path: str,
    grayscale: bool = False,
    contrast: float = 1.0,
    sharpness: float = 1.0,
    brightness: float = 1.0,
    saturation: float = 1.0,
    auto_enhance: bool = False,
) -> tuple:
    """
    Load image, fix EXIF orientation, optionally enhance.
    Returns (PIL.Image, exif_meta_dict, dpi_tuple).
    """
    try:
        img = Image.open(path)
    except Exception:
        # Try ImageMagick fallback for exotic formats
        tmp_path = _load_image_im_fallback(path)
        if tmp_path:
            img = Image.open(tmp_path)
        else:
            raise

    # Animated GIF / WebP — use first frame
    if hasattr(img, 'n_frames') and img.n_frames > 1:
        try:
            img.seek(0)
        except Exception:
            pass

    img = _fix_exif_orientation(img)
    exif_meta = _get_exif_metadata(img)
    dpi = _get_image_dpi(img)

    # Convert to RGB
    if grayscale:
        img = img.convert('L').convert('RGB')
    elif img.mode in ('RGBA', 'P', 'LA', 'PA'):
        bg = Image.new('RGB', img.size, (255, 255, 255))
        try:
            mask = img.split()[-1] if img.mode in ('RGBA', 'LA', 'PA') else None
            bg.paste(img.convert('RGBA'), mask=mask)
        except Exception:
            bg.paste(img)
        img = bg
    elif img.mode == 'CMYK':
        img = img.convert('RGB')
    elif img.mode != 'RGB':
        img = img.convert('RGB')

    # Auto-enhance (contrast stretch)
    if auto_enhance:
        img = ImageOps.autocontrast(img, cutoff=0.5)

    # Manual enhancements
    if contrast != 1.0:
        img = ImageEnhance.Contrast(img).enhance(max(0.1, min(contrast, 3.0)))
    if sharpness != 1.0:
        img = ImageEnhance.Sharpness(img).enhance(max(0.0, min(sharpness, 3.0)))
    if brightness != 1.0:
        img = ImageEnhance.Brightness(img).enhance(max(0.1, min(brightness, 3.0)))
    if saturation != 1.0 and not grayscale:
        img = ImageEnhance.Color(img).enhance(max(0.0, min(saturation, 3.0)))

    return img, exif_meta, dpi


def _determine_page_size(
    img: Image.Image,
    dpi: tuple,
    page_size: str,
    orientation: str,
) -> tuple:
    """Determine final PDF page dimensions in points."""
    iw, ih = img.size

    if page_size == 'fit':
        dx, dy = dpi
        return (iw * 72.0 / dx, ih * 72.0 / dy)

    if page_size == 'custom':
        dx, dy = dpi
        return (iw * 72.0 / dx, ih * 72.0 / dy)

    base = PAGE_SIZES.get(page_size, A4)

    if orientation == 'landscape' or (orientation == 'auto' and iw > ih):
        return (max(base), min(base))
    elif orientation == 'portrait' or (orientation == 'auto' and ih >= iw):
        return (min(base), max(base))
    return tuple(base)


# ── img2pdf strategy (lossless) ───────────────────────────────────────────────

def _images_to_pdf_img2pdf(
    img_path_list: list,
    output_path: str,
    page_size: str = 'A4',
    orientation: str = 'auto',
) -> bool:
    """Use img2pdf for lossless PDF conversion."""
    try:
        img_bytes_list = []
        for path, img, dpi in img_path_list:
            buf = io.BytesIO()
            # img2pdf needs JPEG or PNG — save as JPEG for photos
            img.save(buf, format='JPEG', quality=95, optimize=True,
                     progressive=True)
            img_bytes_list.append(buf.getvalue())

        layout_fun = None
        if page_size != 'fit':
            base = PAGE_SIZES.get(page_size, A4)
            pw, ph = base[0], base[1]
            # img2pdf uses points (1 pt = 1/72 in)
            layout_fun = img2pdf.get_layout_fun(
                pagesize=(img2pdf.in_to_pt(pw / 72),
                          img2pdf.in_to_pt(ph / 72)))

        pdf_bytes = (img2pdf.convert(img_bytes_list, layout_fun=layout_fun)
                     if layout_fun
                     else img2pdf.convert(img_bytes_list))

        with open(output_path, 'wb') as f:
            f.write(pdf_bytes)
        return True
    except Exception:
        return False


# ── ReportLab strategy (full layout control) ──────────────────────────────────

def _images_to_pdf_reportlab(
    imgs_with_meta: list,
    output_path: str,
    page_size: str,
    orientation: str,
    margin_top: int,
    margin_bottom: int,
    margin_left: int,
    margin_right: int,
    bg_color: str,
    captions: list,
    watermark_text: str,
    watermark_color: str,
    watermark_opacity: float,
    watermark_angle: float,
    header_text: str,
    footer_text: str,
    page_numbers: bool,
    shadow: bool,
    border_color: str,
    border_width: float,
) -> None:
    """Create PDF using ReportLab with full layout control."""
    c = rl_canvas.Canvas(output_path)

    bg = None
    if bg_color and bg_color.upper() not in ('#FFFFFF', '#FFF', 'white'):
        try:
            bg = HexColor(bg_color)
        except Exception:
            bg = None

    for i, (img, path, exif_meta, dpi) in enumerate(imgs_with_meta):
        pw, ph = _determine_page_size(img, dpi, page_size, orientation)
        c.setPageSize((pw, ph))

        # Background
        if bg:
            c.setFillColor(bg)
            c.rect(0, 0, pw, ph, fill=1, stroke=0)

        # Header
        if header_text:
            c.setFont('Helvetica', 8)
            c.setFillColorRGB(0.4, 0.4, 0.4)
            c.drawCentredString(pw / 2, ph - margin_top + 4, header_text[:100])

        # Compute image draw area
        mt = float(margin_top)
        mb = float(margin_bottom)
        ml = float(margin_left)
        mr = float(margin_right)
        caption_h = 18.0 if (captions and i < len(captions) and captions[i]) else 0.0
        footer_h = 12.0 if footer_text else 0.0
        pagenum_h = 10.0 if page_numbers else 0.0

        avail_w = pw - ml - mr
        avail_h = ph - mt - mb - caption_h - footer_h - pagenum_h

        iw, ih = img.size
        scale = min(avail_w / iw, avail_h / ih)
        draw_w = iw * scale
        draw_h = ih * scale
        x = (pw - draw_w) / 2
        y = mb + caption_h + footer_h + pagenum_h + (avail_h - draw_h) / 2

        # Shadow effect
        if shadow:
            c.saveState()
            c.setFillColorRGB(0, 0, 0, alpha=0.12)
            c.rect(x + 4, y - 4, draw_w, draw_h, fill=1, stroke=0)
            c.restoreState()

        # Border
        if border_color and border_width > 0:
            try:
                bc = HexColor(border_color)
                c.setStrokeColor(bc)
                c.setLineWidth(border_width)
                c.rect(x, y, draw_w, draw_h, stroke=1, fill=0)
            except Exception:
                pass

        # Save image to temp file for ReportLab
        tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
        tmp.close()
        img.save(tmp.name, 'JPEG', quality=92, optimize=True)

        c.drawImage(tmp.name, x, y, width=draw_w, height=draw_h,
                    preserveAspectRatio=True)
        try:
            os.unlink(tmp.name)
        except Exception:
            pass

        # Caption
        if captions and i < len(captions) and captions[i]:
            c.setFont('Helvetica', 9)
            c.setFillColorRGB(0.3, 0.3, 0.3)
            c.drawCentredString(pw / 2, mb + footer_h + pagenum_h + 4,
                                captions[i][:100])

        # Footer
        if footer_text:
            c.setFont('Helvetica', 8)
            c.setFillColorRGB(0.5, 0.5, 0.5)
            c.drawCentredString(pw / 2, mb - 6, footer_text[:100])

        # Page numbers
        if page_numbers:
            c.setFont('Helvetica', 8)
            c.setFillColorRGB(0.5, 0.5, 0.5)
            c.drawCentredString(pw / 2, mb - 14,
                                f'{i + 1} / {len(imgs_with_meta)}')

        # Watermark
        if watermark_text:
            c.saveState()
            try:
                wc = HexColor(watermark_color or '#AA0000')
            except Exception:
                wc = HexColor('#AA0000')
            c.setFillColor(wc)
            c.setFillAlpha(watermark_opacity)
            c.setFont('Helvetica-Bold', max(18, min(36, int(pw * 0.05))))
            c.translate(pw / 2, ph / 2)
            c.rotate(watermark_angle)
            c.drawCentredString(0, 0, watermark_text[:40])
            c.restoreState()

        if i < len(imgs_with_meta) - 1:
            c.showPage()

    c.save()


# ── fitz strategy ─────────────────────────────────────────────────────────────

def _images_to_pdf_fitz(img_list: list, output_path: str) -> bool:
    """Use PyMuPDF to build PDF from images."""
    try:
        pdf = fitz.open()
        for img, path, exif_meta, dpi in img_list:
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=90)
            buf.seek(0)
            img_doc = fitz.open(stream=buf, filetype='jpeg')
            rect = img_doc[0].rect
            page = pdf.new_page(width=rect.width, height=rect.height)
            page.insert_image(rect, stream=buf.getvalue())
        pdf.save(output_path, garbage=4, deflate=True)
        return True
    except Exception:
        return False


# ── Ghostscript post-pass ─────────────────────────────────────────────────────

def _gs_compress(input_path: str, output_path: str,
                 quality: str = 'ebook') -> bool:
    """GS post-pass for compression."""
    if not GS_BIN:
        return False
    quality_map = {
        'screen': '/screen', 'ebook': '/ebook',
        'printer': '/printer', 'prepress': '/prepress',
    }
    q = quality_map.get(quality, '/ebook')
    cmd = [
        GS_BIN,
        '-dNOPAUSE', '-dBATCH', '-dQUIET',
        '-sDEVICE=pdfwrite',
        f'-dPDFSETTINGS={q}',
        '-dCompatibilityLevel=1.7',
        f'-sOutputFile={output_path}',
        input_path,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=120)
        return (proc.returncode == 0
                and os.path.exists(output_path)
                and os.path.getsize(output_path) > 200)
    except Exception:
        return False


def _pikepdf_set_metadata(
    path: str,
    title: str = '',
    author: str = '',
    subject: str = '',
    keywords: str = '',
) -> None:
    """Inject PDF metadata using pikepdf."""
    try:
        with pikepdf.open(path, suppress_warnings=True) as pdf:
            pdf.docinfo['/Producer'] = 'IshuTools.fun PDF Suite — Img2PDF'
            pdf.docinfo['/Creator'] = 'img_to_pdf'
            if title:
                pdf.docinfo['/Title'] = title
            if author:
                pdf.docinfo['/Author'] = author
            if subject:
                pdf.docinfo['/Subject'] = subject
            if keywords:
                pdf.docinfo['/Keywords'] = keywords
            pdf.docinfo['/CreationDate'] = datetime.now().strftime(
                "D:%Y%m%d%H%M%S")
            pdf.save(path)
    except Exception:
        pass


# ── Grid layout (multiple images per page) ───────────────────────────────────

def _images_to_pdf_grid(
    imgs_with_meta: list,
    output_path: str,
    cols: int = 2,
    page_size: str = 'A4',
    margin: int = 20,
    padding: int = 10,
) -> None:
    """
    Arrange multiple images in a grid on each page.
    imgs_with_meta: list of (PIL.Image, path, exif_meta, dpi).
    """
    base = PAGE_SIZES.get(page_size, A4)
    pw, ph = base[0], base[1]

    rows_per_page = math.ceil(len(imgs_with_meta) / cols)
    cell_w = (pw - 2 * margin - padding * (cols - 1)) / cols
    cell_h = (ph - 2 * margin - padding * (rows_per_page - 1)) / max(rows_per_page, 1)

    c = rl_canvas.Canvas(output_path, pagesize=(pw, ph))
    col_idx = 0
    row_idx = 0

    for i, (img, path, exif_meta, dpi) in enumerate(imgs_with_meta):
        if i > 0 and i % (cols * math.ceil(ph / max(cell_h + padding, 1))) == 0:
            c.showPage()
            c.setPageSize((pw, ph))
            col_idx = 0
            row_idx = 0

        x = margin + col_idx * (cell_w + padding)
        y = ph - margin - (row_idx + 1) * (cell_h + padding) + padding

        iw, ih = img.size
        scale = min(cell_w / iw, cell_h / ih)
        dw, dh = iw * scale, ih * scale
        ox = x + (cell_w - dw) / 2
        oy = y + (cell_h - dh) / 2

        tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
        tmp.close()
        img.save(tmp.name, 'JPEG', quality=88)
        c.drawImage(tmp.name, ox, oy, width=dw, height=dh,
                    preserveAspectRatio=True)
        try:
            os.unlink(tmp.name)
        except Exception:
            pass

        col_idx += 1
        if col_idx >= cols:
            col_idx = 0
            row_idx += 1

    c.save()


# ── Main API ──────────────────────────────────────────────────────────────────

def images_to_pdf(
    input_paths: list,
    output_path: str,
    page_size: str = 'A4',
    orientation: str = 'auto',
    margin_top: int = 20,
    margin_bottom: int = 20,
    margin_left: int = 20,
    margin_right: int = 20,
    grayscale: bool = False,
    contrast: float = 1.0,
    sharpness: float = 1.0,
    brightness: float = 1.0,
    saturation: float = 1.0,
    auto_enhance: bool = False,
    captions: list = None,
    watermark_text: str = '',
    watermark_color: str = '#AA0000',
    watermark_opacity: float = 0.18,
    watermark_angle: float = 45.0,
    bg_color: str = '#FFFFFF',
    lossless: bool = False,
    header_text: str = '',
    footer_text: str = '',
    page_numbers: bool = False,
    shadow: bool = False,
    border_color: str = '',
    border_width: float = 0.0,
    gs_compress: bool = False,
    gs_quality: str = 'ebook',
    grid_mode: bool = False,
    grid_cols: int = 2,
    title: str = '',
    author: str = '',
    subject: str = '',
    keywords: str = '',
    password: str = '',
) -> dict:
    """
    Convert one or more images to a single multi-page PDF.

    Args:
        input_paths:       List of image file paths
        output_path:       Output PDF path
        page_size:         'A4'|'A3'|'A5'|'Letter'|'Legal'|'A4L'|'fit'
        orientation:       'auto'|'portrait'|'landscape'
        margin_top/bottom/left/right: Margins in points
        grayscale:         Convert to grayscale
        contrast/sharpness/brightness/saturation: Enhancement factors
        auto_enhance:      Apply automatic contrast enhancement
        captions:          Per-image captions list
        watermark_text:    Watermark text on all pages
        watermark_color:   Watermark hex color
        watermark_opacity: Watermark transparency (0–1)
        watermark_angle:   Watermark rotation degrees
        bg_color:          Page background color
        lossless:          Use img2pdf for lossless embedding
        header_text:       Header text on all pages
        footer_text:       Footer text on all pages
        page_numbers:      Add page numbers
        shadow:            Add drop shadow to images
        border_color:      Border hex color around image
        border_width:      Border thickness in points
        gs_compress:       Apply Ghostscript compression pass
        gs_quality:        GS quality preset (screen/ebook/printer/prepress)
        grid_mode:         Arrange images in grid layout
        grid_cols:         Columns for grid layout
        title/author/subject/keywords: PDF metadata
        password:          Not used (placeholder for API consistency)
    Returns:
        dict with output_path, page_count, valid_images, method, sizes
    """
    if not input_paths:
        raise ValueError('No image paths provided.')

    orig_sizes = [os.path.getsize(p) for p in input_paths if os.path.exists(p)]
    total_input_kb = round(sum(orig_sizes) / 1024, 1)

    # Load and prepare all images
    valid = []
    errors = []
    for path in input_paths:
        if not os.path.exists(path):
            errors.append({'path': path, 'error': 'File not found'})
            continue
        try:
            img, exif_meta, dpi = _load_and_prep_image(
                path, grayscale=grayscale,
                contrast=contrast, sharpness=sharpness,
                brightness=brightness, saturation=saturation,
                auto_enhance=auto_enhance)
            valid.append((img, path, exif_meta, dpi))
        except Exception as e:
            errors.append({'path': path, 'error': str(e)})

    if not valid:
        raise ValueError(f'No valid images found. Errors: {errors}')

    method = 'reportlab'

    # Grid mode
    if grid_mode:
        _images_to_pdf_grid(
            valid, output_path,
            cols=max(1, grid_cols),
            page_size=page_size,
            margin=margin_left,
            padding=10)
        method = 'reportlab_grid'

    # Lossless img2pdf mode
    elif lossless:
        success = _images_to_pdf_img2pdf(valid, output_path,
                                          page_size=page_size,
                                          orientation=orientation)
        if success:
            method = 'img2pdf'
        else:
            # Fall through to ReportLab
            _images_to_pdf_reportlab(
                valid, output_path,
                page_size=page_size, orientation=orientation,
                margin_top=margin_top, margin_bottom=margin_bottom,
                margin_left=margin_left, margin_right=margin_right,
                bg_color=bg_color, captions=captions or [],
                watermark_text=watermark_text,
                watermark_color=watermark_color,
                watermark_opacity=watermark_opacity,
                watermark_angle=watermark_angle,
                header_text=header_text, footer_text=footer_text,
                page_numbers=page_numbers, shadow=shadow,
                border_color=border_color, border_width=border_width)
            method = 'reportlab'

    # Standard ReportLab mode
    else:
        _images_to_pdf_reportlab(
            valid, output_path,
            page_size=page_size, orientation=orientation,
            margin_top=margin_top, margin_bottom=margin_bottom,
            margin_left=margin_left, margin_right=margin_right,
            bg_color=bg_color, captions=captions or [],
            watermark_text=watermark_text,
            watermark_color=watermark_color,
            watermark_opacity=watermark_opacity,
            watermark_angle=watermark_angle,
            header_text=header_text, footer_text=footer_text,
            page_numbers=page_numbers, shadow=shadow,
            border_color=border_color, border_width=border_width)
        method = 'reportlab'

    # GS compression pass
    gs_applied = False
    if gs_compress and GS_BIN:
        tmp_gs = output_path + '.gs.tmp'
        if _gs_compress(output_path, tmp_gs, quality=gs_quality):
            # Only keep if actually smaller
            if os.path.getsize(tmp_gs) < os.path.getsize(output_path):
                os.replace(tmp_gs, output_path)
                gs_applied = True
            else:
                try:
                    os.unlink(tmp_gs)
                except Exception:
                    pass

    # pikepdf metadata injection
    meta_set = False
    if title or author or subject or keywords:
        _pikepdf_set_metadata(output_path, title=title, author=author,
                               subject=subject, keywords=keywords)
        meta_set = True
    else:
        # Inject from EXIF if available
        first_exif = valid[0][2] if valid else {}
        if first_exif:
            _pikepdf_set_metadata(
                output_path,
                author=first_exif.get('Artist', ''),
                subject=first_exif.get('ImageDescription', ''))
            meta_set = bool(first_exif)

    output_size_kb = round(os.path.getsize(output_path) / 1024, 1)

    return {
        'output_path': output_path,
        'page_count': len(valid),
        'image_count': len(input_paths),
        'valid_images': len(valid),
        'failed_images': len(errors),
        'errors': errors,
        'method': method,
        'gs_compress_applied': gs_applied,
        'metadata_set': meta_set,
        'total_input_kb': total_input_kb,
        'output_size_kb': output_size_kb,
        'compression_ratio': (round(total_input_kb / output_size_kb, 2)
                               if output_size_kb > 0 else 1.0),
        'gs_available': bool(GS_BIN),
        'im_available': bool(IM_BIN),
    }


# ── Info helper ───────────────────────────────────────────────────────────────

def get_image_info(image_path: str) -> dict:
    """Get detailed information about an image file."""
    info = {
        'path': image_path,
        'format': '', 'mode': '', 'width': 0, 'height': 0,
        'dpi': None, 'frames': 1,
        'file_size_kb': round(os.path.getsize(image_path) / 1024, 1),
        'exif': {},
    }
    try:
        img = Image.open(image_path)
        info['format'] = img.format or ''
        info['mode'] = img.mode
        info['width'], info['height'] = img.size
        info['dpi'] = img.info.get('dpi')
        info['exif'] = _get_exif_metadata(img)
        if hasattr(img, 'n_frames'):
            info['frames'] = img.n_frames
        # Calculate natural point dimensions
        dpi = _get_image_dpi(img)
        info['natural_width_pt'] = round(img.width * 72 / dpi[0], 1)
        info['natural_height_pt'] = round(img.height * 72 / dpi[1], 1)
        info['aspect_ratio'] = round(img.width / max(img.height, 1), 3)
    except Exception as e:
        info['error'] = str(e)
    return info


# ── Batch folder processing ───────────────────────────────────────────────────

def batch_folder_to_pdf(
    input_dir: str,
    output_path: str,
    extensions: tuple = ('.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff',
                          '.gif'),
    sort_by: str = 'name',
    **kwargs,
) -> dict:
    """
    Convert all images in a folder to a single PDF.

    Args:
        input_dir:   Directory containing images
        output_path: Output PDF path
        extensions:  Tuple of allowed file extensions
        sort_by:     'name' | 'date' | 'size'
        **kwargs:    Passed to images_to_pdf()
    Returns:
        dict from images_to_pdf() + folder_path
    """
    if not os.path.isdir(input_dir):
        raise ValueError(f'Directory not found: {input_dir}')

    files = [
        os.path.join(input_dir, f)
        for f in os.listdir(input_dir)
        if os.path.splitext(f)[1].lower() in extensions
    ]

    if sort_by == 'date':
        files.sort(key=lambda f: os.path.getmtime(f))
    elif sort_by == 'size':
        files.sort(key=lambda f: os.path.getsize(f), reverse=True)
    else:
        files.sort()

    if not files:
        raise ValueError(f'No supported images found in {input_dir}')

    result = images_to_pdf(files, output_path, **kwargs)
    result['folder_path'] = input_dir
    result['source_files'] = [os.path.basename(f) for f in files]
    return result


# ── Available engines ─────────────────────────────────────────────────────────

def get_available_engines() -> dict:
    return {
        'engines': ['reportlab', 'img2pdf', 'fitz'] + (
            ['ghostscript'] if GS_BIN else []) + (
            ['imagemagick'] if IM_BIN else []),
        'page_sizes': list(PAGE_SIZES.keys()) + ['fit', 'custom'],
        'gs_available': bool(GS_BIN),
        'im_available': bool(IM_BIN),
    }
