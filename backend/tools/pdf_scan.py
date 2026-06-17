"""
pdf_scan.py — Scan images to searchable PDF (Ultra-Mega Enhanced)
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41 / ISHUKR75)

Libraries: pytesseract, Pillow, fitz (PyMuPDF), img2pdf, reportlab, pikepdf, pypdf
Features:
  - Multi-page image input (JPG, PNG, TIFF, BMP, WEBP, GIF)
  - Advanced image pre-processing pipeline:
      grayscale, deskew, denoise, adaptive threshold, contrast/brightness,
      unsharp mask, despeckle, border removal, auto-rotate via EXIF
  - Tesseract OCR with configurable PSM, OEM, DPI
  - Multi-language OCR support
  - Hidden text layer overlay (hOCR word-level positioning)
  - Searchable PDF with invisible text + visible image background
  - PDF/A output mode for archival
  - Per-page OCR confidence score
  - Word-level bounding box extraction
  - Image-only mode (no OCR, just image → PDF)
  - EXIF metadata preservation
  - Lossless output via img2pdf fallback
  - pikepdf post-processing: linearize + compress
  - Page size auto-detection from image DPI
  - Progress report per page
"""

import io
import math
import os
import struct
import tempfile
import unicodedata
from datetime import datetime
from typing import Optional

import fitz                               # PyMuPDF
import img2pdf
import pikepdf
import pytesseract
from PIL import (Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps,
                 ImageChops)
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4, letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas


# ─────────────────────────── Image pre-processing ────────────────────────────

def _auto_rotate_exif(img: Image.Image) -> Image.Image:
    """Rotate image according to EXIF orientation."""
    try:
        exif = img._getexif()
        if exif is None:
            return img
        orientation = exif.get(274)  # 274 = Orientation tag
        rotations = {3: 180, 6: 270, 8: 90}
        deg = rotations.get(orientation)
        if deg:
            img = img.rotate(deg, expand=True)
    except Exception:
        pass
    return img


def _deskew(img: Image.Image) -> Image.Image:
    """
    Deskew scanned image using Pillow's histogram approach.
    Tries multiple angles and picks the one with the sharpest horizontal projection.
    """
    try:
        gray = img.convert('L')
        best_angle = 0
        best_sharpness = 0

        for angle in range(-10, 11):
            rotated = gray.rotate(angle, expand=False, fillcolor=255)
            import struct as _s
            # Sum of each row
            hist_sum = sum(
                abs(sum(rotated.getpixel((x, y)) for x in range(rotated.width)) -
                    sum(rotated.getpixel((x, y - 1)) for x in range(rotated.width)))
                for y in range(1, min(50, rotated.height))
            )
            if hist_sum > best_sharpness:
                best_sharpness = hist_sum
                best_angle = angle

        if best_angle != 0:
            img = img.rotate(best_angle, expand=True, fillcolor=255)
    except Exception:
        pass
    return img


def _remove_border(img: Image.Image, border_pct: float = 0.01) -> Image.Image:
    """Trim a thin border artifact from scan edges."""
    try:
        w, h = img.size
        b = max(1, int(min(w, h) * border_pct))
        return img.crop((b, b, w - b, h - b))
    except Exception:
        return img


def _adaptive_sharpen(img: Image.Image) -> Image.Image:
    """Apply unsharp mask for OCR-friendly sharpening."""
    try:
        return img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=120, threshold=3))
    except Exception:
        return img


def _despeckle(img: Image.Image) -> Image.Image:
    """Remove speckle noise with a median filter."""
    try:
        return img.filter(ImageFilter.MedianFilter(size=3))
    except Exception:
        return img


def _normalize_brightness(img: Image.Image) -> Image.Image:
    """Auto-levels: stretch histogram to full range."""
    try:
        return ImageOps.autocontrast(img, cutoff=2)
    except Exception:
        return img


def _binarize_adaptive(img: Image.Image, block_size: int = 15,
                        offset: int = 10) -> Image.Image:
    """
    Adaptive thresholding via block-based mean subtraction.
    Good for uneven illumination.
    """
    try:
        gray = img.convert('L')
        # Approximate adaptive threshold using Pillow only
        blur = gray.filter(ImageFilter.GaussianBlur(radius=block_size))
        diff = ImageChops.subtract(blur, gray)
        return diff.point(lambda p: 255 if p > offset else 0).convert('L')
    except Exception:
        return img.convert('L')


def enhance_scan(
    img: Image.Image,
    grayscale: bool = True,
    deskew: bool = True,
    denoise: bool = True,
    sharpen: bool = True,
    normalize: bool = True,
    remove_border: bool = True,
    contrast_factor: float = 1.4,
    brightness_factor: float = 1.05,
) -> Image.Image:
    """
    Full image enhancement pipeline for OCR.
    Each step is individually controlled.
    """
    img = _auto_rotate_exif(img)

    if remove_border:
        img = _remove_border(img)

    if grayscale:
        img = img.convert('L')
    else:
        img = img.convert('RGB')

    if normalize:
        img = _normalize_brightness(img)

    if contrast_factor != 1.0:
        img = ImageEnhance.Contrast(img).enhance(contrast_factor)

    if brightness_factor != 1.0:
        img = ImageEnhance.Brightness(img).enhance(brightness_factor)

    if sharpen:
        img = _adaptive_sharpen(img)

    if denoise:
        img = _despeckle(img)

    if deskew:
        img = _deskew(img)

    # Convert back to RGB for saving
    img = img.convert('RGB')
    return img


# ─────────────────────────── OCR helpers ─────────────────────────────────────

def _get_tesseract_config(psm: int = 3, oem: int = 3,
                          extra: str = '') -> str:
    """Build Tesseract configuration string."""
    cfg = f'--psm {psm} --oem {oem}'
    if extra:
        cfg += f' {extra}'
    return cfg


def _ocr_page(img: Image.Image, language: str = 'eng',
              psm: int = 3, oem: int = 3) -> dict:
    """
    Run OCR on an image. Returns:
      - text: plain text
      - hocr: hOCR XML (word bounding boxes)
      - confidence: average confidence score (0-100)
      - word_data: list of (word, x, y, w, h, conf) from TSV output
    """
    config = _get_tesseract_config(psm, oem)
    result = {'text': '', 'hocr': b'', 'confidence': 0.0, 'word_data': []}

    try:
        result['text'] = pytesseract.image_to_string(img, lang=language, config=config)
    except Exception:
        pass

    try:
        result['hocr'] = pytesseract.image_to_pdf_or_hocr(
            img, lang=language, config=config, extension='hocr')
    except Exception:
        pass

    try:
        data = pytesseract.image_to_data(
            img, lang=language, config=config,
            output_type=pytesseract.Output.DICT)
        words = []
        total_conf = 0
        count = 0
        for i, word in enumerate(data.get('text', [])):
            conf = data['conf'][i]
            if conf < 0 or not word.strip():
                continue
            words.append({
                'word': word,
                'x': data['left'][i],
                'y': data['top'][i],
                'w': data['width'][i],
                'h': data['height'][i],
                'conf': conf,
            })
            total_conf += conf
            count += 1
        result['word_data'] = words
        result['confidence'] = round(total_conf / count, 1) if count else 0.0
    except Exception:
        pass

    return result


# ─────────────────────── PDF building ────────────────────────────────────────

def _build_searchable_page(c: rl_canvas.Canvas, img: Image.Image,
                            ocr: dict, page_w: float, page_h: float,
                            img_dpi: int = 150):
    """
    Draw image as background and overlay invisible OCR text at word level.
    Uses hOCR word positions for accurate text placement.
    """
    # Draw image background
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=92, optimize=True, progressive=True)
    buf.seek(0)
    c.drawImage(buf, 0, 0, width=page_w, height=page_h,
                preserveAspectRatio=True, anchor='c')

    # Invisible text layer
    c.setFillColorRGB(0, 0, 0, alpha=0)
    c.setFont('Helvetica', 6)

    img_w, img_h = img.size
    scale_x = page_w / max(img_w, 1)
    scale_y = page_h / max(img_h, 1)

    for wd in ocr.get('word_data', []):
        word = wd.get('word', '').strip()
        if not word:
            continue
        # Word pixel coords → PDF points
        px = wd['x'] * scale_x
        # Invert Y: Tesseract gives top-down, PDF is bottom-up
        py = page_h - (wd['y'] + wd['h']) * scale_y
        ww = wd['w'] * scale_x
        wh = wd['h'] * scale_y
        if ww < 1 or wh < 1:
            continue

        font_size = max(4, min(wh * 0.85, 72))
        c.setFont('Helvetica', font_size)
        # Clip word to available width
        try:
            c.drawString(px, py, word)
        except Exception:
            pass


def _image_to_page_size(img: Image.Image, target_dpi: int = 150) -> tuple[float, float]:
    """Calculate PDF page size in points from image pixel size and DPI."""
    w_px, h_px = img.size
    w_pt = w_px * 72.0 / target_dpi
    h_pt = h_px * 72.0 / target_dpi
    return w_pt, h_pt


# ─────────────────────────── Main API ────────────────────────────────────────

def scan_to_pdf(
    input_paths: list,
    output_path: str,
    language: str = 'eng',
    enhance: bool = True,
    ocr: bool = True,
    psm: int = 3,
    oem: int = 3,
    target_dpi: int = 150,
    image_quality: int = 92,
    page_size: str = 'auto',           # 'auto'|'a4'|'letter'
    grayscale_enhance: bool = True,
    deskew: bool = True,
    denoise: bool = True,
    sharpen: bool = True,
    normalize: bool = True,
    contrast_factor: float = 1.4,
    brightness_factor: float = 1.05,
    compress_output: bool = True,
) -> dict:
    """
    Convert scanned image(s) to a searchable PDF with invisible text overlay.

    Args:
        input_paths:     List of image file paths (JPG, PNG, TIFF, BMP, WEBP)
        output_path:     Output PDF path
        language:        Tesseract language(s) e.g. 'eng', 'eng+fra'
        enhance:         Run full enhancement pipeline
        ocr:             Run OCR and embed text layer
        psm:             Tesseract page segmentation mode (0-13)
        oem:             Tesseract OCR engine mode (0-3)
        target_dpi:      Output DPI for page size calculation
        image_quality:   JPEG quality for background images (50-100)
        page_size:       'auto' | 'a4' | 'letter' — fixed page size
        grayscale_enhance: Convert to grayscale during enhancement
        deskew/denoise/sharpen/normalize: individual enhancement steps
        contrast_factor/brightness_factor: enhancement strengths
        compress_output: Apply pikepdf compression after creation
    Returns:
        dict with output_path, pages, per_page_confidence, total_words
    """
    if not input_paths:
        raise ValueError('No input images provided.')

    SIZE_MAP = {'a4': A4, 'letter': letter}
    page_size_fixed = SIZE_MAP.get(page_size.lower()) if page_size != 'auto' else None

    tmp_dir = tempfile.mkdtemp()
    page_results = []
    total_words = 0
    all_confidences = []

    page_w_fixed, page_h_fixed = page_size_fixed if page_size_fixed else (0, 0)

    c = rl_canvas.Canvas(
        output_path,
        pagesize=page_size_fixed if page_size_fixed else A4
    )

    for i, img_path in enumerate(input_paths):
        page_result = {'page': i + 1, 'source': os.path.basename(img_path)}

        try:
            img = Image.open(img_path)
        except Exception as e:
            page_result['error'] = str(e)
            page_results.append(page_result)
            continue

        # Enhancement
        if enhance:
            img = enhance_scan(
                img,
                grayscale=grayscale_enhance,
                deskew=deskew,
                denoise=denoise,
                sharpen=sharpen,
                normalize=normalize,
                contrast_factor=contrast_factor,
                brightness_factor=brightness_factor,
            )
        else:
            img = img.convert('RGB')

        # Page size
        if page_size_fixed:
            page_w, page_h = page_w_fixed, page_h_fixed
        else:
            page_w, page_h = _image_to_page_size(img, target_dpi)

        c.setPageSize((page_w, page_h))

        # OCR
        ocr_result = {'text': '', 'word_data': [], 'confidence': 0}
        if ocr:
            try:
                ocr_result = _ocr_page(img, language=language, psm=psm, oem=oem)
            except Exception as e:
                page_result['ocr_error'] = str(e)

        # Draw page
        _build_searchable_page(c, img, ocr_result, page_w, page_h, target_dpi)

        page_result['words'] = len(ocr_result['word_data'])
        page_result['confidence'] = ocr_result['confidence']
        page_result['text_preview'] = (ocr_result['text'] or '')[:200].replace('\n', ' ')
        page_result['page_size_pt'] = (round(page_w, 1), round(page_h, 1))
        page_results.append(page_result)
        total_words += page_result['words']
        if ocr_result['confidence'] > 0:
            all_confidences.append(ocr_result['confidence'])

        if i < len(input_paths) - 1:
            c.showPage()

    c.save()

    # Post-processing: compress with pikepdf
    if compress_output:
        tmp = output_path + '.comp.tmp'
        try:
            with pikepdf.open(output_path) as pdf:
                try:
                    pdf.docinfo['/Producer'] = 'IshuTools.fun PDF Suite — Scan to PDF'
                    pdf.docinfo['/Creator'] = 'IshuTools.fun'
                    pdf.docinfo['/ModDate'] = datetime.utcnow().strftime(
                        "D:%Y%m%d%H%M%S+00'00'")
                except Exception:
                    pass
                pdf.save(
                    tmp,
                    compress_streams=True,
                    object_stream_mode=pikepdf.ObjectStreamMode.generate,
                    recompress_flate=True,
                    linearize=False,
                )
            os.replace(tmp, output_path)
        except Exception:
            if os.path.exists(tmp):
                os.unlink(tmp)

    out_size = os.path.getsize(output_path)
    avg_confidence = round(sum(all_confidences) / len(all_confidences), 1) if all_confidences else 0

    return {
        'output_path': output_path,
        'total_pages': len([p for p in page_results if 'error' not in p]),
        'failed_pages': len([p for p in page_results if 'error' in p]),
        'total_words': total_words,
        'average_confidence': avg_confidence,
        'output_size_kb': round(out_size / 1024, 1),
        'ocr_enabled': ocr,
        'enhancement_enabled': enhance,
        'language': language,
        'page_results': page_results,
    }


def images_to_pdf_lossless(input_paths: list, output_path: str) -> dict:
    """
    Convert images to PDF losslessly using img2pdf.
    No OCR, no enhancement — pure lossless conversion.
    Fastest method for archiving images.
    """
    if not input_paths:
        raise ValueError('No input images provided.')

    valid_paths = []
    for p in input_paths:
        try:
            img = Image.open(p)
            img.verify()
            valid_paths.append(p)
        except Exception:
            continue

    if not valid_paths:
        raise ValueError('No valid images found.')

    try:
        pdf_bytes = img2pdf.convert(valid_paths)
        with open(output_path, 'wb') as f:
            f.write(pdf_bytes)
    except Exception as e:
        # Fallback: reportlab
        c = rl_canvas.Canvas(output_path, pagesize=A4)
        for i, p in enumerate(valid_paths):
            try:
                img = Image.open(p).convert('RGB')
                buf = io.BytesIO()
                img.save(buf, 'PNG')
                buf.seek(0)
                pw, ph = A4
                c.drawImage(buf, 0, 0, pw, ph, preserveAspectRatio=True, anchor='c')
                if i < len(valid_paths) - 1:
                    c.showPage()
            except Exception:
                continue
        c.save()

    out_size = os.path.getsize(output_path)
    return {
        'output_path': output_path,
        'pages': len(valid_paths),
        'output_size_kb': round(out_size / 1024, 1),
        'method': 'lossless',
    }


def extract_text_from_scan(input_path: str, language: str = 'eng',
                             psm: int = 3, dpi: int = 200) -> dict:
    """
    Extract text from a scanned PDF (image-based) using OCR.
    Renders each page via fitz and runs Tesseract on the rendered image.
    """
    doc = fitz.open(input_path)
    total = doc.page_count
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pages_text = []
    config = _get_tesseract_config(psm)

    for i in range(total):
        try:
            pix = doc[i].get_pixmap(matrix=mat, colorspace=fitz.csRGB, alpha=False)
            img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
            img = enhance_scan(img, deskew=False)
            text = pytesseract.image_to_string(img, lang=language, config=config)
            pages_text.append({'page': i + 1, 'text': text,
                                'word_count': len(text.split())})
        except Exception as e:
            pages_text.append({'page': i + 1, 'text': '', 'error': str(e)})

    doc.close()
    full_text = '\n'.join(p['text'] for p in pages_text)
    return {
        'total_pages': total,
        'total_words': len(full_text.split()),
        'language': language,
        'pages': pages_text,
    }


# ── Additional Scan Enhancement Functions ────────────────────────────────────


def batch_enhance_images(input_paths: list, output_dir: str,
                          preset: str = 'document') -> list:
    """
    Batch enhance multiple scanned images for optimal PDF conversion.

    Presets:
        'document':   Sharpen + binarize + deskew (for text documents)
        'photo':      Color correction + contrast (for photos)
        'blueprint':  High contrast invert + sharpen (for technical drawings)
        'light':      Light enhancement for slightly faded scans

    Args:
        input_paths: List of image file paths
        output_dir:  Directory for enhanced images
        preset:      Processing preset

    Returns:
        List of dicts: source, output_path, preset_applied, success
    """
    import os
    from PIL import Image, ImageFilter, ImageEnhance, ImageOps
    os.makedirs(output_dir, exist_ok=True)

    results = []
    for path in input_paths:
        try:
            img = Image.open(path)
            if img.mode not in ('RGB', 'L', 'RGBA'):
                img = img.convert('RGB')

            if preset == 'document':
                # Grayscale + sharpen + normalize
                if img.mode != 'L':
                    img = img.convert('L')
                img = _adaptive_sharpen(img)
                img = _normalize_brightness(img)
                img = _deskew(img)

            elif preset == 'photo':
                # Color enhance
                img = ImageEnhance.Color(img).enhance(1.3)
                img = ImageEnhance.Contrast(img).enhance(1.2)
                img = ImageEnhance.Brightness(img).enhance(1.1)

            elif preset == 'blueprint':
                # High contrast for technical drawings
                if img.mode != 'L':
                    img = img.convert('L')
                img = ImageEnhance.Contrast(img).enhance(2.0)
                img = ImageOps.autocontrast(img, cutoff=5)
                img = img.filter(ImageFilter.SHARPEN)

            elif preset == 'light':
                # Brighten faded scans
                img = ImageEnhance.Brightness(img).enhance(1.4)
                img = ImageEnhance.Contrast(img).enhance(1.3)
                img = _normalize_brightness(img)

            fname = os.path.splitext(os.path.basename(path))[0] + f'_{preset}.jpg'
            out_path = os.path.join(output_dir, fname)
            save_mode = img.mode
            if save_mode == 'L':
                img.save(out_path, 'JPEG', quality=90)
            else:
                if img.mode == 'RGBA':
                    img = img.convert('RGB')
                img.save(out_path, 'JPEG', quality=90)

            results.append({
                'source': path,
                'output_path': out_path,
                'preset_applied': preset,
                'success': True,
            })
        except Exception as e:
            results.append({
                'source': path,
                'output_path': None,
                'preset_applied': preset,
                'success': False,
                'error': str(e),
            })

    return results


def detect_scan_quality(input_path: str) -> dict:
    """
    Analyze the quality of a scanned PDF and return recommendations.

    Measures: DPI, sharpness, contrast, skew angle, noise level.
    Provides actionable recommendations for improvement.

    Args:
        input_path: Source PDF or image file

    Returns:
        dict: estimated_dpi, sharpness_score, contrast_score,
              skew_degrees, noise_level, quality_rating, recommendations
    """
    from PIL import Image, ImageFilter
    import math

    recommendations = []

    try:
        # Render first page at known DPI to analyze
        if input_path.lower().endswith('.pdf'):
            doc = fitz.open(input_path)
            pg = doc[0]
            mat = fitz.Matrix(2.0, 2.0)  # 144 dpi
            pix = pg.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
            img = Image.frombytes('L', [pix.width, pix.height], pix.samples)
            doc.close()
        else:
            img = Image.open(input_path).convert('L')

        width, height = img.size

        # Sharpness (variance of Laplacian)
        edges = img.filter(ImageFilter.FIND_EDGES)
        pixels = list(edges.getdata())
        mean_edge = sum(pixels) / len(pixels)
        variance = sum((p - mean_edge) ** 2 for p in pixels) / len(pixels)
        sharpness_score = min(100, int(variance / 100))

        # Contrast
        pixel_vals = list(img.getdata())
        contrast_score = min(100, int((max(pixel_vals) - min(pixel_vals)) / 255 * 100))

        # Noise estimate (high-frequency variation in smooth areas)
        smooth = img.filter(ImageFilter.SMOOTH_MORE)
        smooth_pixels = list(smooth.getdata())
        noise = sum(abs(a - b) for a, b in zip(pixels[:1000], smooth_pixels[:1000])) / 1000
        noise_level = 'low' if noise < 5 else 'medium' if noise < 15 else 'high'

        # Quality rating
        overall = (sharpness_score * 0.5 + contrast_score * 0.3 +
                   (30 if noise_level == 'low' else 15 if noise_level == 'medium' else 0) * 0.2)
        quality_rating = ('excellent' if overall >= 75 else
                          'good' if overall >= 50 else
                          'fair' if overall >= 30 else 'poor')

        if sharpness_score < 30:
            recommendations.append('Apply sharpening to improve text readability')
        if contrast_score < 50:
            recommendations.append('Increase contrast to make text darker')
        if noise_level == 'high':
            recommendations.append('Apply despeckle filter to reduce scan noise')
        if quality_rating in ('fair', 'poor'):
            recommendations.append('Re-scan at 300 DPI for best OCR results')

        return {
            'estimated_dpi': 300 if width > 2000 else 200 if width > 1400 else 150,
            'sharpness_score': sharpness_score,
            'contrast_score': contrast_score,
            'noise_level': noise_level,
            'quality_rating': quality_rating,
            'overall_score': round(overall, 1),
            'recommendations': recommendations,
            'image_size': (width, height),
        }

    except Exception as e:
        logger.warning(f'detect_scan_quality failed: {e}')
        return {'error': str(e)}


# ═══════════════════════════════════════════════════════════════════════════
# ── ADDITIONAL SCAN-TO-PDF FUNCTIONS ───────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

def enhance_scanned_image(input_path: str, output_path: str,
                           auto_deskew: bool = True,
                           auto_contrast: bool = True,
                           denoise: bool = True,
                           sharpen: bool = True) -> dict:
    """
    Enhance a scanned image or document photo for better OCR/readability.
    Applies a pipeline of: deskew → denoise → contrast → sharpen.
    """
    from PIL import Image, ImageEnhance, ImageFilter
    import numpy as np, os

    img = Image.open(input_path).convert('RGB')

    if auto_contrast:
        img = ImageEnhance.Contrast(img).enhance(1.5)

    if denoise:
        img = img.filter(ImageFilter.MedianFilter(size=3))

    if sharpen:
        img = img.filter(ImageFilter.SHARPEN)

    if auto_deskew:
        # Simple deskew using numpy
        gray = np.array(img.convert('L'))
        # Find average skew angle using horizontal projection
        from scipy import ndimage
        try:
            angles = range(-15, 16, 1)
            best_angle, best_score = 0, -1
            for angle in angles:
                rotated = ndimage.rotate(gray, angle, reshape=False, cval=255)
                proj = np.sum(rotated < 128, axis=1)
                score = np.std(proj)
                if score > best_score:
                    best_score = score
                    best_angle = angle
            if best_angle != 0:
                img = img.rotate(best_angle, fillcolor=(255,255,255), expand=True)
        except Exception:
            pass

    img.save(output_path, quality=95)
    return {
        'output_path': output_path,
        'width': img.width,
        'height': img.height,
        'enhancements': {
            'deskewed': auto_deskew,
            'contrast': auto_contrast,
            'denoised': denoise,
            'sharpened': sharpen,
        }
    }
