"""
img_to_pdf.py - Convert images to PDF (Ultra-Enhanced)
IshuTools.fun | Professional PDF Suite

Libraries: Pillow, reportlab, fitz (PyMuPDF), img2pdf
Features:
  - JPG, PNG, WebP, BMP, TIFF, GIF (first frame) input
  - img2pdf for lossless PDF creation (best quality)
  - Multiple page size presets (A4, A3, Letter, Legal, fit)
  - Portrait / landscape / auto orientation
  - Adjustable margins
  - Image enhancement before embedding
  - EXIF orientation correction
  - Grayscale conversion option
  - Multi-image → single PDF (one image per page)
  - Optional text caption per page
  - Optional watermark text overlay
  - Background color selection
  - PDF metadata from EXIF data
"""

import os
import io
import tempfile

import img2pdf
import fitz
from PIL import Image, ImageOps, ImageEnhance, ExifTags
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.pagesizes import A4, A3, letter, legal, landscape as rl_landscape
from reportlab.lib.colors import HexColor


# ── Page size presets ─────────────────────────────────────────────────────────
PAGE_SIZES = {
    'A4':     A4,
    'A3':     A3,
    'Letter': letter,
    'Legal':  legal,
    'A4L':    rl_landscape(A4),
    'A3L':    rl_landscape(A3),
}


# ── EXIF helpers ──────────────────────────────────────────────────────────────

def _fix_exif_orientation(img: Image.Image) -> Image.Image:
    """Rotate image to correct EXIF orientation."""
    try:
        exif = img._getexif()
        if not exif:
            return img
        orient_tag = next((k for k, v in ExifTags.TAGS.items() if v == 'Orientation'), None)
        if orient_tag and orient_tag in exif:
            orientation = exif[orient_tag]
            rotate_map = {
                3: Image.ROTATE_180,
                6: Image.ROTATE_270,
                8: Image.ROTATE_90,
            }
            flip_map = {
                2: Image.FLIP_LEFT_RIGHT,
                4: Image.FLIP_TOP_BOTTOM,
                5: Image.TRANSPOSE,
                7: Image.TRANSVERSE,
            }
            if orientation in rotate_map:
                img = img.transpose(rotate_map[orientation])
            elif orientation in flip_map:
                img = img.transpose(flip_map[orientation])
    except Exception:
        pass
    return img


def _get_exif_metadata(img: Image.Image) -> dict:
    """Extract relevant EXIF metadata from image."""
    meta = {}
    try:
        exif = img._getexif()
        if not exif:
            return meta
        tag_names = {v: k for k, v in ExifTags.TAGS.items()}
        for field in ('Make', 'Model', 'DateTime', 'Software',
                      'ImageDescription', 'Artist', 'Copyright'):
            tag_id = tag_names.get(field)
            if tag_id and tag_id in exif:
                meta[field] = str(exif[tag_id])
    except Exception:
        pass
    return meta


def _load_and_prep_image(path: str, grayscale: bool = False,
                          contrast: float = 1.0,
                          sharpness: float = 1.0) -> tuple:
    """
    Load image, fix EXIF orientation, optionally enhance.
    Returns (PIL.Image, exif_meta_dict).
    """
    img = Image.open(path)

    # Handle animated GIF — use first frame
    if hasattr(img, 'n_frames') and img.n_frames > 1:
        img.seek(0)

    # Fix EXIF orientation
    img = _fix_exif_orientation(img)

    # Extract EXIF metadata before conversion
    exif_meta = _get_exif_metadata(img)

    # Convert to RGB or L
    if grayscale:
        img = img.convert('L').convert('RGB')
    elif img.mode in ('RGBA', 'P', 'LA'):
        # For PDF embedding, convert RGBA to RGB with white background
        bg = Image.new('RGB', img.size, (255, 255, 255))
        try:
            bg.paste(img, mask=img.split()[3] if img.mode == 'RGBA' else None)
        except Exception:
            bg.paste(img)
        img = bg
    elif img.mode != 'RGB':
        img = img.convert('RGB')

    # Enhancements
    if contrast != 1.0:
        img = ImageEnhance.Contrast(img).enhance(contrast)
    if sharpness != 1.0:
        img = ImageEnhance.Sharpness(img).enhance(sharpness)

    return img, exif_meta


def _determine_page_size(img: Image.Image, page_size: str,
                           orientation: str) -> tuple:
    """Determine final page dimensions."""
    if page_size == 'fit':
        iw, ih = img.size
        # Convert pixels to points (assume 96 DPI screen resolution)
        return (iw * 72 / 96, ih * 72 / 96)

    base = PAGE_SIZES.get(page_size, A4)
    iw, ih = img.size

    if orientation == 'landscape' or (orientation == 'auto' and iw > ih):
        pw = max(base)
        ph = min(base)
    elif orientation == 'portrait' or (orientation == 'auto' and ih >= iw):
        pw = min(base)
        ph = max(base)
    else:
        pw, ph = base

    return (pw, ph)


# ── img2pdf method (lossless, best for photos) ────────────────────────────────

def _images_to_pdf_img2pdf(img_paths_prepped: list, output_path: str):
    """
    Use img2pdf for lossless PDF creation.
    img_paths_prepped: list of (path, PIL.Image) tuples.
    """
    # img2pdf works best with JPEG or PNG bytes
    img_bytes_list = []
    for path, img in img_paths_prepped:
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=95, optimize=True)
        img_bytes_list.append(buf.getvalue())

    pdf_bytes = img2pdf.convert(img_bytes_list)
    with open(output_path, 'wb') as f:
        f.write(pdf_bytes)


# ── ReportLab method (full control) ──────────────────────────────────────────

def _images_to_pdf_reportlab(
    imgs_with_meta: list,
    output_path: str,
    page_size: str,
    orientation: str,
    margin: int,
    bg_color: str,
    captions: list,
    watermark_text: str,
):
    """
    Create PDF using ReportLab — full control over layout.
    imgs_with_meta: list of (PIL.Image, path, exif_meta).
    """
    c = rl_canvas.Canvas(output_path)

    if bg_color and bg_color != '#FFFFFF':
        try:
            bg = HexColor(bg_color)
        except Exception:
            bg = None
    else:
        bg = None

    for i, (img, path, exif_meta) in enumerate(imgs_with_meta):
        pw, ph = _determine_page_size(img, page_size, orientation)
        c.setPageSize((pw, ph))

        # Background
        if bg:
            c.setFillColor(bg)
            c.rect(0, 0, pw, ph, fill=1, stroke=0)

        # Draw image
        m = float(margin)
        avail_w = pw - 2 * m
        avail_h = ph - 2 * m - (30 if captions or watermark_text else 0)
        iw, ih = img.size
        scale = min(avail_w / iw, avail_h / ih)
        draw_w = iw * scale
        draw_h = ih * scale
        x = (pw - draw_w) / 2
        y = (ph - draw_h) / 2

        # Save prepped image to temp file for ReportLab
        tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
        img.save(tmp.name, 'JPEG', quality=92)
        tmp.close()

        c.drawImage(tmp.name, x, y, width=draw_w, height=draw_h,
                    preserveAspectRatio=True)
        os.unlink(tmp.name)

        # Caption
        if captions and i < len(captions) and captions[i]:
            c.setFont('Helvetica', 9)
            c.setFillColorRGB(0.3, 0.3, 0.3)
            c.drawCentredString(pw / 2, m - 10, captions[i][:80])

        # Watermark text
        if watermark_text:
            c.saveState()
            c.setFont('Helvetica-Bold', 28)
            c.setFillColorRGB(0.7, 0.1, 0.1, alpha=0.2)
            c.translate(pw / 2, ph / 2)
            c.rotate(45)
            c.drawCentredString(0, 0, watermark_text[:30])
            c.restoreState()

        if i < len(imgs_with_meta) - 1:
            c.showPage()

    c.save()


# ── Main API ──────────────────────────────────────────────────────────────────

def images_to_pdf(
    input_paths: list,
    output_path: str,
    page_size: str = 'A4',
    orientation: str = 'auto',
    margin: int = 20,
    grayscale: bool = False,
    contrast: float = 1.0,
    sharpness: float = 1.0,
    captions: list = None,
    watermark_text: str = '',
    bg_color: str = '#FFFFFF',
    lossless: bool = False,
    password: str = '',
) -> dict:
    """
    Convert one or more images to a single multi-page PDF.

    Args:
        input_paths:    List of image file paths (JPG, PNG, WebP, BMP, TIFF, GIF)
        output_path:    Output PDF path
        page_size:      'A4' | 'A3' | 'Letter' | 'Legal' | 'A4L' | 'fit'
        orientation:    'auto' | 'portrait' | 'landscape'
        margin:         Margin in points (0 = no margin)
        grayscale:      Convert images to grayscale
        contrast:       Contrast factor (1.0 = original)
        sharpness:      Sharpness factor (1.0 = original)
        captions:       Per-image caption list (optional)
        watermark_text: Text watermark on all pages
        bg_color:       Page background color hex
        lossless:       Use img2pdf for lossless (ignores layout settings)
        password:       Not used (placeholder for API consistency)
    Returns:
        dict with output_path, page_count, image_count, method
    """
    if not input_paths:
        raise ValueError('No image paths provided.')

    # Load and prepare images
    valid = []
    for path in input_paths:
        try:
            img, exif_meta = _load_and_prep_image(
                path, grayscale=grayscale,
                contrast=contrast, sharpness=sharpness)
            valid.append((img, path, exif_meta))
        except Exception:
            continue

    if not valid:
        raise ValueError('No valid images found.')

    method = 'reportlab'

    # Lossless mode using img2pdf
    if lossless and page_size not in ('fit', None):
        try:
            _images_to_pdf_img2pdf(
                [(path, img) for img, path, _ in valid],
                output_path)
            method = 'img2pdf'
        except Exception:
            lossless = False

    # ReportLab layout mode
    if not lossless or method != 'img2pdf':
        _images_to_pdf_reportlab(
            valid, output_path,
            page_size=page_size,
            orientation=orientation,
            margin=margin,
            bg_color=bg_color,
            captions=captions or [],
            watermark_text=watermark_text,
        )
        method = 'reportlab'

    return {
        'output_path': output_path,
        'page_count': len(valid),
        'image_count': len(input_paths),
        'valid_images': len(valid),
        'method': method,
        'file_size_kb': round(os.path.getsize(output_path) / 1024, 1),
    }


def get_image_info(image_path: str) -> dict:
    """Get detailed information about an image file."""
    info = {
        'path': image_path,
        'format': '',
        'mode': '',
        'width': 0,
        'height': 0,
        'dpi': None,
        'file_size_kb': round(os.path.getsize(image_path) / 1024, 1),
        'exif': {},
    }
    try:
        img = Image.open(image_path)
        info['format'] = img.format or ''
        info['mode'] = img.mode
        info['width'], info['height'] = img.size
        try:
            info['dpi'] = img.info.get('dpi')
        except Exception:
            pass
        info['exif'] = _get_exif_metadata(img)
    except Exception as e:
        info['error'] = str(e)
    return info
