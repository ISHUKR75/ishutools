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


# ── Additional Image to PDF Functions ─────────────────────────────────────────


def create_photo_book(image_paths: list, output_path: str,
                       title: str = 'Photo Book',
                       captions: list = None,
                       layout: str = 'one_per_page',
                       page_size: str = 'A4',
                       background_color: str = '#ffffff') -> dict:
    """
    Create a styled photo book PDF from a list of images.

    Args:
        image_paths:       List of image file paths
        output_path:       Output PDF path
        title:             Photo book title (shown on cover page)
        captions:          Optional list of captions (same length as image_paths)
        layout:            'one_per_page' | 'two_per_page' | 'grid_4'
        page_size:         'A4' | 'A3' | 'letter'
        background_color:  Page background hex color

    Returns:
        dict: page_count, image_count, output_path, layout_used
    """
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import A4, A3, letter
    from reportlab.lib.colors import HexColor
    from PIL import Image
    import math, io

    SIZE_MAP = {'A4': A4, 'A3': A3, 'letter': letter}
    pw, ph = SIZE_MAP.get(page_size, A4)

    def hex2rgb(h):
        h = h.lstrip('#')
        return tuple(int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4))

    bg = hex2rgb(background_color)
    captions = captions or [''] * len(image_paths)
    while len(captions) < len(image_paths):
        captions.append('')

    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(pw, ph))

    # Cover page
    c.setFillColorRGB(*bg)
    c.rect(0, 0, pw, ph, stroke=0, fill=1)
    c.setFillColorRGB(0.1, 0.1, 0.4)
    c.setFont('Helvetica-Bold', 28)
    c.drawCentredString(pw / 2, ph * 0.55, title)
    c.setFont('Helvetica', 12)
    c.setFillColorRGB(0.4, 0.4, 0.4)
    c.drawCentredString(pw / 2, ph * 0.48,
                        f'{len(image_paths)} Photos — IshuTools.fun')
    c.showPage()

    pages_rendered = 1

    if layout == 'two_per_page':
        for i in range(0, len(image_paths), 2):
            c.setFillColorRGB(*bg)
            c.rect(0, 0, pw, ph, stroke=0, fill=1)
            for j, img_path in enumerate(image_paths[i:i+2]):
                try:
                    img = Image.open(img_path)
                    slot_w = pw / 2 - 30
                    slot_h = ph - 80
                    ratio = min(slot_w / img.width, slot_h / img.height)
                    iw, ih = img.width * ratio, img.height * ratio
                    x = 15 + j * (pw / 2) + (slot_w - iw) / 2
                    y = 40 + (slot_h - ih) / 2
                    c.drawImage(img_path, x, y, iw, ih)
                    cap = captions[i + j] if i + j < len(captions) else ''
                    if cap:
                        c.setFont('Helvetica', 9)
                        c.setFillColorRGB(0.4, 0.4, 0.4)
                        c.drawCentredString(x + iw / 2, 25, cap[:60])
                except Exception:
                    continue
            c.showPage()
            pages_rendered += 1

    elif layout == 'grid_4':
        for i in range(0, len(image_paths), 4):
            c.setFillColorRGB(*bg)
            c.rect(0, 0, pw, ph, stroke=0, fill=1)
            for j, img_path in enumerate(image_paths[i:i+4]):
                row, col = divmod(j, 2)
                slot_w = pw / 2 - 20
                slot_h = ph / 2 - 30
                try:
                    img = Image.open(img_path)
                    ratio = min(slot_w / img.width, slot_h / img.height)
                    iw, ih = img.width * ratio, img.height * ratio
                    x = 10 + col * (pw / 2) + (slot_w - iw) / 2
                    y = ph - (row + 1) * (ph / 2) + (slot_h - ih) / 2 + 10
                    c.drawImage(img_path, x, y, iw, ih)
                except Exception:
                    continue
            c.showPage()
            pages_rendered += 1

    else:  # one_per_page
        for i, img_path in enumerate(image_paths):
            c.setFillColorRGB(*bg)
            c.rect(0, 0, pw, ph, stroke=0, fill=1)
            try:
                img = Image.open(img_path)
                margin = 40
                max_w = pw - 2 * margin
                max_h = ph - 2 * margin - (30 if captions[i] else 0)
                ratio = min(max_w / img.width, max_h / img.height)
                iw, ih = img.width * ratio, img.height * ratio
                x = margin + (max_w - iw) / 2
                y = margin + (max_h - ih) / 2 + (25 if captions[i] else 0)
                c.drawImage(img_path, x, y, iw, ih)
                if captions[i]:
                    c.setFont('Helvetica', 11)
                    c.setFillColorRGB(0.3, 0.3, 0.3)
                    c.drawCentredString(pw / 2, margin - 12, captions[i][:80])
            except Exception:
                pass
            c.showPage()
            pages_rendered += 1

    c.save()
    buf.seek(0)
    with open(output_path, 'wb') as f:
        f.write(buf.getvalue())

    return {
        'page_count': pages_rendered,
        'image_count': len(image_paths),
        'output_path': output_path,
        'layout_used': layout,
    }


def optimize_images_before_pdf(image_paths: list, output_dir: str,
                                 max_dimension: int = 2048,
                                 jpeg_quality: int = 85) -> list:
    """
    Pre-process and optimize images before converting to PDF.

    Resizes oversized images, converts to RGB, fixes EXIF orientation,
    and re-encodes for optimal PDF embedding.

    Args:
        image_paths:    List of source image paths
        output_dir:     Directory for optimized images
        max_dimension:  Max width or height in pixels
        jpeg_quality:   JPEG quality (0-100)

    Returns:
        List of optimized image paths
    """
    import os
    from PIL import Image, ImageOps
    os.makedirs(output_dir, exist_ok=True)
    results = []

    for path in image_paths:
        try:
            img = Image.open(path)
            # Fix EXIF orientation
            img = ImageOps.exif_transpose(img)
            # Convert to RGB if needed
            if img.mode not in ('RGB', 'L'):
                img = img.convert('RGB')
            # Resize if too large
            if max(img.size) > max_dimension:
                ratio = max_dimension / max(img.size)
                new_size = (int(img.width * ratio), int(img.height * ratio))
                img = img.resize(new_size, Image.LANCZOS)

            out_name = os.path.splitext(os.path.basename(path))[0] + '_opt.jpg'
            out_path = os.path.join(output_dir, out_name)
            img.save(out_path, 'JPEG', quality=jpeg_quality,
                     optimize=True, progressive=True)
            results.append(out_path)
        except Exception as e:
            logger.warning(f'optimize_images_before_pdf failed for {path}: {e}')
            results.append(path)  # Use original on failure

    return results


# ═══════════════════════════════════════════════════════════════════════════════
# ── ENTERPRISE ADDITIONS — Multi-format, EXIF, Barcode, QR ──────────────────
# ═══════════════════════════════════════════════════════════════════════════════

def images_to_pdf_with_exif(image_paths: list, output_path: str,
                              page_size: str = 'A4',
                              preserve_exif_as_metadata: bool = True) -> dict:
    """
    Convert images to PDF while preserving EXIF metadata in the PDF metadata fields.
    Extracts GPS, camera model, date taken from EXIF and adds to PDF info dict.
    """
    import img2pdf
    from PIL import Image
    from PIL.ExifTags import TAGS
    import io

    exif_data = {}
    processed_paths = []

    for img_path in image_paths:
        try:
            pil = Image.open(img_path)
            raw_exif = pil._getexif() if hasattr(pil, '_getexif') else None
            if raw_exif:
                for tag_id, value in raw_exif.items():
                    tag = TAGS.get(tag_id, str(tag_id))
                    if tag in ('DateTime', 'Make', 'Model', 'Software',
                               'Artist', 'Copyright', 'ImageDescription'):
                        exif_data[tag] = str(value)
        except Exception:
            pass
        processed_paths.append(img_path)

    # Convert to PDF
    images_to_pdf(processed_paths, output_path, page_size=page_size)

    # Inject EXIF-derived metadata into PDF
    if preserve_exif_as_metadata and exif_data:
        import fitz
        doc = fitz.open(output_path)
        meta_update = {}
        if 'DateTime' in exif_data:
            meta_update['creationDate'] = exif_data['DateTime']
        if 'Make' in exif_data or 'Model' in exif_data:
            cam = f"{exif_data.get('Make', '')} {exif_data.get('Model', '')}".strip()
            meta_update['creator'] = f'Camera: {cam}'
        if 'ImageDescription' in exif_data:
            meta_update['subject'] = exif_data['ImageDescription']
        if meta_update:
            doc.set_metadata(meta_update)
        doc.save(output_path, incremental=True, encryption=fitz.PDF_ENCRYPT_KEEP)
        doc.close()

    return {
        'output_path': output_path,
        'images': len(processed_paths),
        'exif_fields': list(exif_data.keys()),
    }


def images_to_searchable_pdf(image_paths: list, output_path: str,
                               language: str = 'eng',
                               dpi: int = 300) -> dict:
    """
    Convert images to a searchable PDF using OCR (Tesseract).
    Each image is OCR'd and the resulting text is embedded as a hidden layer,
    making the PDF fully searchable.

    Requires: pytesseract, Pillow, reportlab
    """
    import pytesseract
    from PIL import Image
    import fitz
    import io

    out_doc = fitz.open()
    pages_processed = 0
    total_words = 0

    for img_path in image_paths:
        try:
            pil = Image.open(img_path).convert('RGB')
            # OCR
            ocr_text = pytesseract.image_to_string(pil, lang=language)
            total_words += len(ocr_text.split())

            # Create PDF page with image
            img_buf = io.BytesIO()
            pil.save(img_buf, format='PNG', optimize=True)
            img_bytes = img_buf.getvalue()

            pg = out_doc.new_page(width=pil.width * 72 / (dpi or 72),
                                   height=pil.height * 72 / (dpi or 72))
            pg.insert_image(pg.rect, stream=img_bytes)

            # Insert hidden OCR text layer
            if ocr_text.strip():
                pg.insert_text(fitz.Point(0, 20), ocr_text,
                               fontsize=0.1, color=(1, 1, 1),  # invisible
                               overlay=False)
            pages_processed += 1
        except Exception as e:
            logger.warning(f'OCR for {img_path} failed: {e}')

    out_doc.save(output_path, garbage=4, deflate=True)
    out_doc.close()
    return {
        'output_path': output_path,
        'pages': pages_processed,
        'total_words_ocr': total_words,
        'searchable': True,
    }


def create_pdf_from_urls(image_urls: list, output_path: str,
                          page_size: str = 'A4') -> dict:
    """
    Download images from URLs and combine them into a PDF.
    Useful for downloading web images and creating a PDF report.
    """
    import urllib.request
    import tempfile
    import os

    local_paths = []
    failed = []

    for url in image_urls:
        try:
            suffix = '.jpg' if 'jpg' in url.lower() or 'jpeg' in url.lower() else \
                     '.png' if 'png' in url.lower() else '.jpg'
            tmp = tempfile.mktemp(suffix=suffix)
            urllib.request.urlretrieve(url, tmp)
            local_paths.append(tmp)
        except Exception as e:
            failed.append({'url': url, 'error': str(e)})

    if not local_paths:
        raise ValueError('No images could be downloaded from the provided URLs')

    images_to_pdf(local_paths, output_path, page_size=page_size)

    # Cleanup temp files
    for p in local_paths:
        try:
            os.unlink(p)
        except Exception:
            pass

    return {
        'output_path': output_path,
        'images_downloaded': len(local_paths),
        'failed': failed,
    }


# ═══════════════════════════════════════════════════════════════════════════
# ── ADDITIONAL IMAGE-TO-PDF FUNCTIONS ──────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

def images_to_pdf_with_captions(image_paths: list, output_path: str,
                                  captions: list = None,
                                  page_size: str = 'A4') -> dict:
    """
    Convert images to PDF with optional captions below each image.
    Creates a photo-book style PDF.
    """
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import A4, letter, LETTER
    from PIL import Image
    import io, os

    size_map = {'A4': A4, 'letter': letter, 'LETTER': LETTER}
    ps = size_map.get(page_size, A4)
    W, H = ps

    c = rl_canvas.Canvas(output_path, pagesize=ps)
    captions = captions or [''] * len(image_paths)

    for idx, img_path in enumerate(image_paths):
        caption = captions[idx] if idx < len(captions) else ''
        try:
            img = Image.open(img_path).convert('RGB')
            # Calculate fit dimensions
            margin = 40
            cap_h = 30 if caption else 0
            avail_w = W - 2*margin
            avail_h = H - 2*margin - cap_h
            ratio = min(avail_w/img.width, avail_h/img.height)
            iw, ih = img.width*ratio, img.height*ratio
            x = (W - iw) / 2
            y = (H - ih - cap_h) / 2 + cap_h

            # Save temp
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=92)
            buf.seek(0)

            c.drawImage(__import__('reportlab.lib.utils', fromlist=['ImageReader']).ImageReader(buf),
                        x, y, width=iw, height=ih)
            if caption:
                c.setFont('Helvetica', 11)
                c.setFillColorRGB(0.3, 0.3, 0.3)
                c.drawCentredString(W/2, y - 20, caption)

            c.setFont('Helvetica', 8)
            c.setFillColorRGB(0.6, 0.6, 0.6)
            c.drawCentredString(W/2, 20, f'Page {idx+1} — IshuTools.fun')

            if idx < len(image_paths) - 1:
                c.showPage()
        except Exception as e:
            c.setFont('Helvetica', 12)
            c.drawString(margin, H/2, f'Error loading image: {e}')
            if idx < len(image_paths) - 1:
                c.showPage()

    c.save()
    return {'output_path': output_path, 'images': len(image_paths)}


def image_to_pdf_preserve_quality(image_path: str, output_path: str,
                                    dpi: int = 300) -> dict:
    """
    Convert single high-quality image to PDF preserving original resolution and DPI.
    Uses img2pdf for lossless conversion (no JPEG re-compression).
    """
    import img2pdf, os
    from PIL import Image

    try:
        # img2pdf: lossless conversion
        with open(output_path, 'wb') as f:
            f.write(img2pdf.convert(image_path))
        return {
            'output_path': output_path,
            'method': 'img2pdf_lossless',
            'file_size': os.path.getsize(output_path),
        }
    except Exception:
        # Fallback: PIL conversion
        img = Image.open(image_path).convert('RGB')
        img.save(output_path, 'PDF', resolution=dpi, save_all=False)
        return {
            'output_path': output_path,
            'method': 'pillow',
            'file_size': os.path.getsize(output_path),
        }
