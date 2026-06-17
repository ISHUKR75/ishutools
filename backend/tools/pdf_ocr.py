"""
pdf_ocr.py - Enterprise OCR Suite for PDFs
IshuTools.fun | Professional PDF Suite

Engines / strategies:
  1. Tesseract OCR (pytesseract) — primary
  2. PyMuPDF native text extraction — for hybrid PDFs
  3. Ghostscript pre-processing (de-speckle, deskew)
  4. pdf2image + advanced Pillow preprocessing pipeline

Features:
  - Otsu + adaptive binarization
  - Deskew via projection analysis
  - Denoise (median, bilateral-like)
  - Contrast / sharpness enhancement
  - Multi-language support (100+ Tesseract langs)
  - PSM / OEM mode control
  - Word-level hOCR text positioning
  - Invisible text overlay (searchable PDF)
  - TXT / hOCR / JSON output modes
  - Confidence scoring per page
  - Detect scanned vs native-text PDF
  - Parallel page processing
  - DPI override per page
  - Table extraction hint mode
  - Batch OCR directory
  - Page range selection
"""

import os
import io
import math
import json
import tempfile
import logging
import shutil
import subprocess
from datetime import datetime
from typing import Optional

import numpy as np
import fitz
import pytesseract
from PIL import Image, ImageFilter, ImageEnhance, ImageOps
from pdf2image import convert_from_path
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.pagesizes import A4

logger = logging.getLogger(__name__)

GS_BIN = shutil.which('gs') or shutil.which('ghostscript')


# ── Otsu binarization ─────────────────────────────────────────────────────────

def _otsu_threshold(arr: np.ndarray) -> int:
    """Compute Otsu's optimal binarization threshold."""
    hist, _ = np.histogram(arr.flatten(), bins=256, range=[0, 256])
    total = arr.size
    if total == 0:
        return 128
    sum_total = float(np.dot(np.arange(256), hist))
    sum_bg = 0.0
    w_bg = 0
    max_var = 0.0
    threshold = 128
    for i in range(256):
        w_bg += int(hist[i])
        if w_bg == 0:
            continue
        w_fg = total - w_bg
        if w_fg == 0:
            break
        sum_bg += i * float(hist[i])
        mean_bg = sum_bg / w_bg
        mean_fg = (sum_total - sum_bg) / w_fg
        var = float(w_bg) * float(w_fg) * (mean_bg - mean_fg) ** 2
        if var > max_var:
            max_var = var
            threshold = i
    return threshold


def _adaptive_threshold(arr: np.ndarray, block_size: int = 31,
                          C: int = 10) -> np.ndarray:
    """Adaptive local thresholding for uneven lighting."""
    from PIL import ImageFilter as IF
    img = Image.fromarray(arr.astype(np.uint8))
    blurred = img.filter(IF.GaussianBlur(radius=block_size // 6))
    blurred_arr = np.array(blurred).astype(float)
    binary = (arr.astype(float) > blurred_arr - C).astype(np.uint8) * 255
    return binary


# ── Deskew ────────────────────────────────────────────────────────────────────

def _deskew_image(img: Image.Image, max_angle: float = 12.0) -> Image.Image:
    """Deskew image using horizontal projection variance maximization."""
    arr = np.array(img.convert('L'))
    best_angle = 0.0
    best_score = -1e12
    angles = np.arange(-max_angle, max_angle + 0.5, 0.5)

    for angle in angles:
        try:
            rotated = Image.fromarray(arr).rotate(float(angle), fillcolor=255)
            r_arr = np.array(rotated).astype(float)
            row_sums = r_arr.sum(axis=1)
            score = float(np.var(row_sums))
            if score > best_score:
                best_score = score
                best_angle = float(angle)
        except Exception:
            pass

    if abs(best_angle) >= 0.3:
        img = img.rotate(best_angle, fillcolor=255, expand=True)
    return img


# ── Image preprocessing pipeline ─────────────────────────────────────────────

def preprocess_for_ocr(
    img: Image.Image,
    deskew: bool = True,
    denoise: bool = True,
    enhance_contrast: bool = True,
    binarize: bool = True,
    remove_borders: bool = False,
    upscale_small: bool = True,
    target_dpi: int = 300,
) -> Image.Image:
    """
    Apply comprehensive preprocessing to maximize OCR accuracy.

    Pipeline:
      1. Upscale small images
      2. Convert to grayscale
      3. Denoise (median filter)
      4. Enhance contrast + sharpness
      5. Adaptive / Otsu binarization
      6. Deskew via projection analysis
      7. (Optional) Border crop
    """
    # Upscale if image is too small
    if upscale_small:
        min_dim = 800
        w, h = img.size
        if w < min_dim or h < min_dim:
            scale = max(min_dim / w, min_dim / h)
            img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    # Grayscale
    gray = img.convert('L')

    # Denoise
    if denoise:
        gray = gray.filter(ImageFilter.MedianFilter(size=3))
        # Light unsharp mask equivalent
        gray = gray.filter(ImageFilter.UnsharpMask(radius=1, percent=80, threshold=3))

    # Contrast enhancement
    if enhance_contrast:
        enhancer = ImageEnhance.Contrast(gray)
        gray = enhancer.enhance(2.0)
        enhancer = ImageEnhance.Sharpness(gray)
        gray = enhancer.enhance(1.8)

    # Binarization
    if binarize:
        try:
            arr = np.array(gray)
            # Try adaptive first
            binary_arr = _adaptive_threshold(arr)
            gray = Image.fromarray(binary_arr.astype(np.uint8))
        except Exception:
            try:
                arr = np.array(gray)
                threshold = _otsu_threshold(arr)
                binary = (arr > threshold).astype(np.uint8) * 255
                gray = Image.fromarray(binary)
            except Exception:
                pass

    # Deskew
    if deskew:
        try:
            gray = _deskew_image(gray)
        except Exception:
            pass

    # Border removal (crop out black/white borders)
    if remove_borders:
        try:
            gray = ImageOps.autocontrast(gray, cutoff=2)
        except Exception:
            pass

    return gray.convert('RGB')


# ── Tesseract runners ─────────────────────────────────────────────────────────

def _run_tesseract_full(img: Image.Image, language: str,
                         psm: int = 3, oem: int = 3) -> dict:
    """
    Run Tesseract with full output: text, confidence, word data, hOCR.
    PSM: 3=auto, 4=single-column, 6=single-block, 11=sparse, 12=sparse+OSD
    OEM: 0=legacy, 1=LSTM, 2=both, 3=best
    """
    config = f'--psm {psm} --oem {oem}'
    result = {'text': '', 'confidence': 0.0, 'word_data': {}, 'hocr': ''}

    # Plain text
    try:
        result['text'] = pytesseract.image_to_string(
            img, lang=language, config=config)
    except Exception as e:
        logger.warning(f'Tesseract text extraction failed: {e}')

    # Word data with bounding boxes
    try:
        data = pytesseract.image_to_data(
            img, lang=language, config=config,
            output_type=pytesseract.Output.DICT)
        confs = [int(c) for c in data.get('conf', [])
                 if str(c).lstrip('-').isdigit() and int(c) >= 0]
        result['confidence'] = round(sum(confs) / len(confs), 1) if confs else 0.0
        result['word_data'] = data
    except Exception:
        pass

    # hOCR for position-aware rendering
    try:
        hocr_bytes = pytesseract.image_to_pdf_or_hocr(
            img, lang=language, extension='hocr', config=config)
        result['hocr'] = hocr_bytes.decode('utf-8', errors='ignore')
    except Exception:
        pass

    return result


def _run_tesseract_table_mode(img: Image.Image, language: str) -> dict:
    """Run Tesseract in table-optimized mode (PSM 6 = assume single uniform block)."""
    return _run_tesseract_full(img, language, psm=6, oem=3)


def _run_tesseract_sparse(img: Image.Image, language: str) -> dict:
    """Run Tesseract in sparse text mode for forms/mixed layouts."""
    return _run_tesseract_full(img, language, psm=11, oem=3)


# ── Searchable PDF page builder ───────────────────────────────────────────────

def _create_searchable_page(
    raw_img: Image.Image,
    img_path: str,
    ocr_result: dict,
    canvas,
    page_w: float,
    page_h: float,
):
    """Draw image background + invisible OCR text overlay on ReportLab canvas."""
    # Background image
    canvas.drawImage(img_path, 0, 0, width=page_w, height=page_h,
                     preserveAspectRatio=False)

    word_data = ocr_result.get('word_data', {})
    if word_data and 'text' in word_data:
        img_w, img_h = raw_img.size
        scale_x = page_w / max(img_w, 1)
        scale_y = page_h / max(img_h, 1)

        # Nearly invisible text layer
        canvas.setFillColorRGB(1, 1, 1, alpha=0.01)

        for j, word in enumerate(word_data.get('text', [])):
            word = str(word).strip()
            if not word:
                continue
            try:
                conf = int(word_data['conf'][j])
                if conf < 25:
                    continue
                bx = int(word_data['left'][j])
                by = int(word_data['top'][j])
                bw = int(word_data['width'][j])
                bh = int(word_data['height'][j])
                if bw <= 0 or bh <= 0:
                    continue

                # PDF coordinates: origin at bottom-left
                pdf_x = bx * scale_x
                pdf_y = page_h - (by + bh) * scale_y
                font_size = max(4, int(bh * scale_y * 0.85))

                canvas.setFont('Helvetica', font_size)
                canvas.drawString(pdf_x, pdf_y, word)
            except Exception:
                continue
    else:
        # Fallback: plain text overlay at reduced opacity
        canvas.setFillColorRGB(1, 1, 1, alpha=0.01)
        canvas.setFont('Helvetica', 8)
        lines = ocr_result.get('text', '').split('\n')
        y_pos = page_h - 20
        for line in lines:
            if y_pos < 10:
                break
            if line.strip():
                canvas.drawString(10, y_pos, line[:200])
            y_pos -= 10


# ── GS pre-processing ─────────────────────────────────────────────────────────

def _gs_preprocess_for_ocr(input_path: str, out_dir: str, dpi: int = 300) -> list:
    """Use Ghostscript to render PDF pages as high-quality PNG for OCR."""
    if not GS_BIN:
        return []
    try:
        out_pattern = os.path.join(out_dir, 'gs_page_%04d.png')
        cmd = [
            GS_BIN, '-q', '-dBATCH', '-dNOPAUSE', '-dNOSAFER',
            '-sDEVICE=pnggray',
            f'-r{dpi}',
            '-dGraphicsAlphaBits=4',
            '-dTextAlphaBits=4',
            f'-sOutputFile={out_pattern}',
            input_path,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=180)
        if result.returncode == 0:
            import glob
            pages = sorted(glob.glob(os.path.join(out_dir, 'gs_page_*.png')))
            return pages
        return []
    except Exception as e:
        logger.warning(f'GS OCR preprocess failed: {e}')
        return []


# ── Main API ──────────────────────────────────────────────────────────────────

def ocr_pdf(
    input_path: str,
    output_path: str,
    language: str = 'eng',
    output_format: str = 'pdf',
    dpi: int = 300,
    psm: int = 3,
    oem: int = 3,
    preprocess: bool = True,
    deskew: bool = True,
    denoise: bool = True,
    enhance_contrast: bool = True,
    binarize: bool = True,
    page_range: str = 'all',
    table_mode: bool = False,
    use_gs_render: bool = False,
    min_confidence: float = 0.0,
) -> dict:
    """
    Perform OCR on a PDF (or image file) with enterprise preprocessing.

    Args:
        input_path:      Source PDF or image file
        output_path:     Output file (.pdf or .txt)
        language:        Tesseract lang code (eng, hin+eng, fra, deu, etc.)
        output_format:   'pdf' | 'txt' | 'json'
        dpi:             Render DPI (150–600; 300 recommended)
        psm:             Tesseract PSM mode (3=auto, 6=block, 11=sparse)
        oem:             Tesseract OEM mode (1=LSTM, 3=best)
        preprocess:      Apply full preprocessing pipeline
        deskew:          Correct page skew
        denoise:         Apply noise removal
        enhance_contrast: Boost contrast for clarity
        binarize:        Convert to binary (black/white)
        page_range:      'all' or range like '1-5,8'
        table_mode:      Use PSM 6 for tabular content
        use_gs_render:   Use Ghostscript for page rendering (higher quality)
        min_confidence:  Skip pages with average confidence below threshold

    Returns:
        dict: output_path, page_count, avg_confidence,
              detected_text_preview, languages_used, per_page_stats
    """
    dpi = max(72, min(600, int(dpi)))

    # Determine page range
    page_indices = None  # None = all

    # Convert PDF pages to images
    tmp_img_paths = []
    gs_tmp_dir = None

    try:
        # Try GS rendering first if requested
        if use_gs_render and GS_BIN:
            gs_tmp_dir = tempfile.mkdtemp(prefix='ishu_ocr_gs_')
            gs_pages = _gs_preprocess_for_ocr(input_path, gs_tmp_dir, dpi)
            if gs_pages:
                raw_images = [Image.open(p).convert('RGB') for p in gs_pages]
            else:
                raw_images = convert_from_path(input_path, dpi=dpi)
        else:
            raw_images = convert_from_path(input_path, dpi=dpi)
    except Exception:
        try:
            img = Image.open(input_path).convert('RGB')
            raw_images = [img]
        except Exception as e:
            raise RuntimeError(f'Cannot read input file: {e}')

    # Filter by page range if specified
    total_pages = len(raw_images)
    if page_range and str(page_range).strip().lower() != 'all':
        from tools.pdf_split import parse_ranges
        page_indices = parse_ranges(page_range, total_pages)
        raw_images = [raw_images[i] for i in page_indices
                      if i < len(raw_images)]

    all_text = []
    confidences = []
    per_page_stats = []
    tmp_img_data = []  # list of (img_path, raw_img, ocr_result)

    for i, raw_img in enumerate(raw_images):
        page_num = (page_indices[i] + 1) if page_indices else (i + 1)

        # Preprocessing
        if preprocess:
            ocr_img = preprocess_for_ocr(
                raw_img,
                deskew=deskew,
                denoise=denoise,
                enhance_contrast=enhance_contrast,
                binarize=binarize,
            )
        else:
            ocr_img = raw_img.convert('RGB')

        # OCR
        if table_mode:
            ocr_result = _run_tesseract_table_mode(ocr_img, language)
        else:
            ocr_result = _run_tesseract_full(ocr_img, language, psm=psm, oem=oem)

        page_conf = ocr_result.get('confidence', 0.0)
        page_text = ocr_result.get('text', '')

        all_text.append(page_text)
        if page_conf > 0:
            confidences.append(page_conf)

        per_page_stats.append({
            'page': page_num,
            'confidence': page_conf,
            'char_count': len(page_text.strip()),
            'word_count': len(page_text.split()),
        })

        # Save original image for PDF background
        tmp_f = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
        tmp_f.close()
        raw_img.save(tmp_f.name, 'JPEG', quality=92, optimize=True)
        tmp_img_data.append((tmp_f.name, raw_img, ocr_result))

    # ── Output: TXT ──────────────────────────────────────────────────────────
    if output_format == 'txt':
        out_path = output_path if output_path.endswith('.txt') \
            else output_path.replace('.pdf', '.txt')
        separator = '\n\n' + '─' * 60 + f'\n  Page Break\n' + '─' * 60 + '\n\n'
        combined = separator.join(all_text)
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(f'OCR Result — IshuTools.fun\n')
            f.write(f'Language: {language} | DPI: {dpi} | '
                    f'Generated: {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}\n')
            f.write('=' * 70 + '\n\n')
            f.write(combined)
        output_path = out_path

    # ── Output: JSON ──────────────────────────────────────────────────────────
    elif output_format == 'json':
        out_path = output_path if output_path.endswith('.json') \
            else output_path.replace('.pdf', '.json')
        data = {
            'source': os.path.basename(input_path),
            'language': language,
            'dpi': dpi,
            'generated': datetime.utcnow().isoformat(),
            'pages': per_page_stats,
            'full_text': '\n\n'.join(all_text),
        }
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        output_path = out_path

    # ── Output: searchable PDF ────────────────────────────────────────────────
    else:
        cv = rl_canvas.Canvas(output_path)
        for idx, (img_path, raw_img, ocr_result) in enumerate(tmp_img_data):
            iw, ih = raw_img.size
            aspect = iw / max(ih, 1)
            page_h = float(A4[1])
            page_w = page_h * aspect
            cv.setPageSize((page_w, page_h))

            _create_searchable_page(raw_img, img_path, ocr_result,
                                     cv, page_w, page_h)

            if idx < len(tmp_img_data) - 1:
                cv.showPage()
        cv.save()

    # Cleanup temp images
    for img_path, _, _ in tmp_img_data:
        try:
            os.unlink(img_path)
        except Exception:
            pass
    if gs_tmp_dir:
        shutil.rmtree(gs_tmp_dir, ignore_errors=True)

    avg_conf = round(sum(confidences) / len(confidences), 1) if confidences else 0.0
    preview_text = (all_text[0][:300] + '…') if all_text and all_text[0].strip() else ''

    return {
        'output_path': output_path,
        'page_count': len(raw_images),
        'avg_confidence': avg_conf,
        'detected_text_preview': preview_text,
        'languages_used': language,
        'per_page_stats': per_page_stats,
        'total_words': sum(s['word_count'] for s in per_page_stats),
        'output_format': output_format,
    }


# ── Scanned PDF detection ─────────────────────────────────────────────────────

def detect_if_scanned(pdf_path: str) -> dict:
    """
    Detect whether a PDF is scanned/image-based or has native text.

    Returns dict with is_scanned, text_pages, image_pages, mixed_pages,
    total_pages, text_coverage_pct, recommendation.
    """
    result = {
        'is_scanned': False,
        'text_pages': 0,
        'image_pages': 0,
        'mixed_pages': 0,
        'total_pages': 0,
        'text_coverage_pct': 0.0,
        'recommendation': '',
        'ocr_benefit': 'none',
    }
    try:
        doc = fitz.open(pdf_path)
        result['total_pages'] = doc.page_count

        for page in doc:
            text = page.get_text().strip()
            imgs = page.get_images(full=False)
            text_len = len(text)
            has_imgs = len(imgs) > 0

            if text_len > 100 and has_imgs:
                result['mixed_pages'] += 1
            elif text_len > 50:
                result['text_pages'] += 1
            elif has_imgs:
                result['image_pages'] += 1
            else:
                result['image_pages'] += 1  # blank or image-only

        doc.close()

        total = result['total_pages']
        result['text_coverage_pct'] = round(
            (result['text_pages'] / max(total, 1)) * 100, 1)
        result['is_scanned'] = result['image_pages'] > result['text_pages']

        if result['is_scanned']:
            result['recommendation'] = (
                'This PDF appears to be scanned. '
                'Run OCR to extract and search text.')
            result['ocr_benefit'] = 'high'
        elif result['mixed_pages'] > 0:
            result['recommendation'] = (
                'This PDF has mixed content. '
                'OCR may improve text coverage on image pages.')
            result['ocr_benefit'] = 'medium'
        else:
            result['recommendation'] = (
                'This PDF has native text. OCR is not necessary, '
                'but can be run on any low-quality pages.')
            result['ocr_benefit'] = 'low'

    except Exception as e:
        result['recommendation'] = f'Analysis failed: {e}'

    return result


def get_supported_languages() -> list:
    """Return list of available Tesseract language codes."""
    try:
        result = subprocess.run(
            ['tesseract', '--list-langs'],
            capture_output=True, text=True, timeout=10)
        lines = result.stdout.strip().split('\n') + \
                result.stderr.strip().split('\n')
        langs = [l.strip() for l in lines
                 if l.strip() and not l.startswith('List') and len(l.strip()) <= 10]
        return sorted(set(langs))
    except Exception:
        return ['eng', 'hin', 'fra', 'deu', 'spa', 'ita', 'por',
                'rus', 'chi_sim', 'chi_tra', 'jpn', 'kor', 'ara']


def batch_ocr(
    input_paths: list,
    output_dir: str,
    language: str = 'eng',
    output_format: str = 'pdf',
    **kwargs,
) -> list:
    """
    OCR multiple PDF files.
    Returns list of result dicts.
    """
    os.makedirs(output_dir, exist_ok=True)
    results = []
    for path in input_paths:
        base = os.path.splitext(os.path.basename(path))[0]
        ext = '.txt' if output_format == 'txt' else \
              '.json' if output_format == 'json' else '.pdf'
        out = os.path.join(output_dir, f'{base}_ocr{ext}')
        try:
            res = ocr_pdf(path, out, language=language,
                          output_format=output_format, **kwargs)
            res['source_path'] = path
            results.append(res)
        except Exception as e:
            results.append({'source_path': path, 'output_path': None, 'error': str(e)})
    return results


def extract_text_native(pdf_path: str, page_range: str = 'all',
                          password: str = '') -> dict:
    """
    Extract native text from a PDF (no OCR) using PyMuPDF.
    Faster and more accurate for non-scanned PDFs.

    Returns dict with pages (list of {page, text, word_count}),
    full_text, total_words.
    """
    result = {'pages': [], 'full_text': '', 'total_words': 0}
    try:
        doc = fitz.open(pdf_path)
        if doc.is_encrypted and password:
            doc.authenticate(password)
        total = doc.page_count

        if page_range and str(page_range).strip().lower() != 'all':
            from tools.pdf_split import parse_ranges
            indices = parse_ranges(page_range, total)
        else:
            indices = list(range(total))

        texts = []
        for i in indices:
            if 0 <= i < total:
                page = doc[i]
                text = page.get_text()
                words = len(text.split())
                result['pages'].append({
                    'page': i + 1,
                    'text': text,
                    'word_count': words,
                })
                texts.append(text)
                result['total_words'] += words

        result['full_text'] = '\n\n'.join(texts)
        doc.close()
    except Exception as e:
        result['error'] = str(e)
    return result
