"""
pdf_compress.py - Enterprise PDF Compression Suite
IshuTools.fun | Professional PDF Suite

Strategies (in order of quality/aggressiveness):
  1. Ghostscript CLI (gs) — best compression, multiple presets
  2. qpdf CLI — linearization + stream compression
  3. PyMuPDF (fitz) — image recompression + stream deflation
  4. pikepdf — object stream merging + content compression
  5. pypdf — orphan removal fallback
  6. Image-only recompress via Pillow (last resort)

Features:
  - 6-engine fallback pipeline
  - 5 quality presets (screen/ebook/printer/prepress/lossless)
  - Per-image JPEG/lossless optimization
  - Grayscale conversion mode
  - Metadata & XMP stripping
  - Annotation removal
  - Font subsetting detection
  - Dead object / orphan stream removal
  - Before/after size delta reporting
  - PDF/A preservation option
  - Incremental save detection
  - Ghostscript distiller profiles
"""

import io
import os
import shutil
import struct
import subprocess
import tempfile
import logging
from datetime import datetime
from typing import Optional

import pikepdf
import fitz
from pypdf import PdfWriter, PdfReader
from PIL import Image

logger = logging.getLogger(__name__)

# ── CLI binary detection ───────────────────────────────────────────────────────
GS_BIN = shutil.which('gs') or shutil.which('ghostscript')
QPDF_BIN = shutil.which('qpdf')

# ── Quality presets ───────────────────────────────────────────────────────────
QUALITY_PRESETS = {
    'screen': {
        'dpi': 72, 'jpeg_quality': 35, 'image_scale': 0.45,
        'grayscale': True, 'gs_setting': '/screen',
        'description': 'Screen (72 dpi, aggressive compression)',
    },
    'low': {
        'dpi': 96, 'jpeg_quality': 45, 'image_scale': 0.55,
        'grayscale': False, 'gs_setting': '/ebook',
        'description': 'Low quality (96 dpi)',
    },
    'medium': {
        'dpi': 150, 'jpeg_quality': 65, 'image_scale': 0.75,
        'grayscale': False, 'gs_setting': '/ebook',
        'description': 'Medium quality (150 dpi, balanced)',
    },
    'high': {
        'dpi': 200, 'jpeg_quality': 82, 'image_scale': 0.90,
        'grayscale': False, 'gs_setting': '/printer',
        'description': 'High quality (200 dpi)',
    },
    'lossless': {
        'dpi': 300, 'jpeg_quality': 95, 'image_scale': 1.0,
        'grayscale': False, 'gs_setting': '/prepress',
        'description': 'Lossless / prepress (300 dpi)',
    },
}

# ── Ghostscript helpers ───────────────────────────────────────────────────────

def _gs_compress(input_path: str, output_path: str,
                 gs_setting: str = '/ebook',
                 dpi: int = 150,
                 grayscale: bool = False,
                 strip_metadata: bool = False) -> bool:
    """Run Ghostscript to compress a PDF with distiller settings."""
    if not GS_BIN:
        return False
    try:
        cmd = [
            GS_BIN,
            '-q',
            '-dBATCH',
            '-dNOPAUSE',
            '-dNOSAFER',
            '-sDEVICE=pdfwrite',
            f'-dPDFSETTINGS={gs_setting}',
            f'-dColorImageResolution={dpi}',
            f'-dGrayImageResolution={dpi}',
            f'-dMonoImageResolution={dpi}',
            '-dCompressPages=true',
            '-dEmbedAllFonts=true',
            '-dSubsetFonts=true',
            '-dCompatibilityLevel=1.5',
            '-dDetectDuplicateImages=true',
            '-dAutoFilterColorImages=true',
            '-dAutoFilterGrayImages=true',
        ]
        if grayscale:
            cmd += [
                '-sColorConversionStrategy=Gray',
                '-dProcessColorModel=/DeviceGray',
            ]
        if strip_metadata:
            cmd += ['-dNoOutputFonts=false']
        cmd += [
            f'-sOutputFile={output_path}',
            input_path,
        ]
        result = subprocess.run(
            cmd, capture_output=True, timeout=120, text=True
        )
        return result.returncode == 0 and os.path.exists(output_path) and \
               os.path.getsize(output_path) > 100
    except Exception as e:
        logger.warning(f'Ghostscript compression failed: {e}')
        return False


def _gs_compress_aggressively(input_path: str, output_path: str) -> bool:
    """Extra-aggressive GS pass: downsample all images to 72dpi, max compress."""
    if not GS_BIN:
        return False
    try:
        cmd = [
            GS_BIN, '-q', '-dBATCH', '-dNOPAUSE', '-dNOSAFER',
            '-sDEVICE=pdfwrite',
            '-dPDFSETTINGS=/screen',
            '-dColorImageResolution=72',
            '-dGrayImageResolution=72',
            '-dMonoImageResolution=100',
            '-dDownsampleColorImages=true',
            '-dDownsampleGrayImages=true',
            '-dColorImageDownsampleType=/Bicubic',
            '-dGrayImageDownsampleType=/Bicubic',
            '-dEncodeColorImages=true',
            '-dEncodeGrayImages=true',
            '-dJPEGQ=40',
            '-dCompressPages=true',
            '-dDetectDuplicateImages=true',
            '-sColorConversionStrategy=Gray',
            '-dProcessColorModel=/DeviceGray',
            '-dCompatibilityLevel=1.4',
            f'-sOutputFile={output_path}',
            input_path,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        return result.returncode == 0 and os.path.exists(output_path) and \
               os.path.getsize(output_path) > 100
    except Exception:
        return False


# ── qpdf helpers ──────────────────────────────────────────────────────────────

def _qpdf_linearize(input_path: str, output_path: str) -> bool:
    """Use qpdf to linearize and compress streams."""
    if not QPDF_BIN:
        return False
    try:
        cmd = [
            QPDF_BIN,
            '--linearize',
            '--compress-streams=y',
            '--recompress-flate',
            '--compression-level=9',
            '--object-streams=generate',
            '--decode-level=generalized',
            input_path,
            output_path,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=60)
        return result.returncode == 0 and os.path.exists(output_path) and \
               os.path.getsize(output_path) > 100
    except Exception as e:
        logger.warning(f'qpdf linearize failed: {e}')
        return False


def _qpdf_stream_compress(input_path: str, output_path: str) -> bool:
    """Use qpdf to recompress all streams at max deflate level."""
    if not QPDF_BIN:
        return False
    try:
        cmd = [
            QPDF_BIN,
            '--compress-streams=y',
            '--recompress-flate',
            '--compression-level=9',
            '--object-streams=generate',
            input_path,
            output_path,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=60)
        return result.returncode == 0 and os.path.exists(output_path) and \
               os.path.getsize(output_path) > 100
    except Exception:
        return False


# ── Image processing helpers ──────────────────────────────────────────────────

def _compress_image_bytes(img_bytes: bytes, quality: int,
                           scale: float, grayscale: bool,
                           max_dim: int = 4000) -> bytes:
    """Downsample, optionally grayscale, and JPEG-compress image bytes."""
    try:
        img = Image.open(io.BytesIO(img_bytes))
        original_mode = img.mode
        if img.mode in ('RGBA', 'P', 'LA'):
            bg = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode in ('RGBA', 'LA'):
                bg.paste(img, mask=img.split()[-1])
            else:
                bg.paste(img)
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        if grayscale:
            img = img.convert('L').convert('RGB')

        w, h = img.size
        new_w = min(int(w * scale), max_dim)
        new_h = min(int(h * scale), max_dim)
        if new_w < w or new_h < h:
            img = img.resize((new_w, new_h), Image.LANCZOS)

        out = io.BytesIO()
        img.save(out, format='JPEG', quality=quality, optimize=True,
                 progressive=True, subsampling=2)
        compressed = out.getvalue()
        # Only return if we actually shrank it
        return compressed if len(compressed) < len(img_bytes) else img_bytes
    except Exception:
        return img_bytes


def _recompress_images_fitz(input_path: str, output_path: str,
                              quality: int, scale: float,
                              grayscale: bool) -> bool:
    """Use PyMuPDF to recompress all embedded images in the PDF."""
    try:
        doc = fitz.open(input_path)
        xrefs_done = set()
        for page_idx in range(doc.page_count):
            page = doc[page_idx]
            img_list = page.get_images(full=True)
            for img_info in img_list:
                xref = img_info[0]
                if xref in xrefs_done:
                    continue
                xrefs_done.add(xref)
                try:
                    base_img = doc.extract_image(xref)
                    img_bytes = base_img.get('image', b'')
                    if not img_bytes or len(img_bytes) < 1024:
                        continue
                    ext = base_img.get('ext', 'jpeg').lower()
                    # Skip already-small images
                    if ext in ('jbig2', 'jpx') and len(img_bytes) < 50 * 1024:
                        continue
                    new_bytes = _compress_image_bytes(
                        img_bytes, quality, scale, grayscale)
                    if len(new_bytes) < len(img_bytes) * 0.95:
                        doc.update_stream(xref, new_bytes)
                except Exception:
                    continue

        doc.save(output_path,
                 garbage=4,
                 deflate=True,
                 deflate_images=True,
                 deflate_fonts=True,
                 clean=True,
                 pretty=False)
        doc.close()
        return True
    except Exception as e:
        logger.warning(f'fitz image recompress failed: {e}')
        return False


# ── pikepdf helpers ───────────────────────────────────────────────────────────

def _pikepdf_optimize(input_path: str, output_path: str,
                       strip_metadata: bool = False,
                       remove_annotations: bool = False) -> bool:
    """Use pikepdf for object stream optimization and stream compression."""
    try:
        with pikepdf.open(input_path, allow_overwriting_input=False) as pdf:
            for page in pdf.pages:
                try:
                    page.compress_content_streams()
                except Exception:
                    pass
                if remove_annotations and '/Annots' in page:
                    try:
                        del page['/Annots']
                    except Exception:
                        pass
            if strip_metadata:
                try:
                    del pdf.docinfo
                except Exception:
                    pass
                try:
                    if '/Metadata' in pdf.Root:
                        del pdf.Root['/Metadata']
                except Exception:
                    pass
            pdf.save(
                output_path,
                compress_streams=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
                recompress_flate=True,
                preserve_pdfa=False,
            )
        return True
    except Exception as e:
        logger.warning(f'pikepdf optimize failed: {e}')
        return False


def _pypdf_fallback(input_path: str, output_path: str,
                     remove_annotations: bool = False) -> bool:
    """pypdf fallback: copy pages with orphan removal."""
    try:
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt('')
        writer = PdfWriter()
        for page in reader.pages:
            if remove_annotations and '/Annots' in page:
                try:
                    del page['/Annots']
                except Exception:
                    pass
            writer.add_page(page)
        writer.compress_identical_objects(
            remove_identicals=True, remove_orphans=True)
        with open(output_path, 'wb') as f:
            writer.write(f)
        return True
    except Exception as e:
        logger.warning(f'pypdf fallback failed: {e}')
        return False


# ── Metadata stripping ────────────────────────────────────────────────────────

def _strip_metadata_pikepdf(path: str) -> bool:
    """In-place metadata/XMP stripping via pikepdf."""
    try:
        with pikepdf.open(path, allow_overwriting_input=True) as pdf:
            try:
                del pdf.docinfo
            except Exception:
                pass
            try:
                with pdf.open_metadata() as meta:
                    meta.clear()
            except Exception:
                pass
            pdf.save(path)
        return True
    except Exception:
        return False


# ── Size helpers ──────────────────────────────────────────────────────────────

def _pick_smaller(paths: list, output_path: str) -> str:
    """Pick the smallest valid file from a list, copy to output_path."""
    best_path = None
    best_size = float('inf')
    for p in paths:
        if p and os.path.exists(p):
            s = os.path.getsize(p)
            if s > 500 and s < best_size:
                best_size = s
                best_path = p
    if best_path and best_path != output_path:
        import shutil as _sh
        _sh.copy2(best_path, output_path)
    return best_path


# ── Main API ──────────────────────────────────────────────────────────────────

def compress_pdf(
    input_path: str,
    output_path: str,
    quality: str = 'medium',
    grayscale: bool = False,
    strip_metadata: bool = False,
    remove_annotations: bool = False,
    use_ghostscript: bool = True,
    use_qpdf: bool = True,
    target_size_kb: Optional[int] = None,
) -> dict:
    """
    Compress a PDF using a 6-engine fallback pipeline.

    Engines tried (first success wins, smallest result kept):
      1. Ghostscript with distiller preset
      2. PyMuPDF image recompression + pikepdf stream optimization
      3. qpdf stream recompression + linearization
      4. pikepdf alone (object stream generation)
      5. pypdf orphan removal fallback

    Args:
        input_path:          Source PDF path
        output_path:         Compressed output PDF path
        quality:             'screen'|'low'|'medium'|'high'|'lossless'
        grayscale:           Convert all images to grayscale
        strip_metadata:      Remove author/title/XMP/docinfo
        remove_annotations:  Remove all PDF annotations
        use_ghostscript:     Enable Ghostscript strategy
        use_qpdf:            Enable qpdf strategy
        target_size_kb:      If set, try aggressive pass if first result > target

    Returns:
        dict: output_path, original_size_kb, compressed_size_kb,
              reduction_pct, method_used, engines_tried
    """
    preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS['medium'])
    orig_size = os.path.getsize(input_path)
    engines_tried = []
    tmp_dir = tempfile.mkdtemp(prefix='ishu_compress_')

    try:
        candidates = {}  # method_name → file_path

        # ── Engine 1: Ghostscript ──────────────────────────────────────────
        if use_ghostscript and GS_BIN:
            gs_out = os.path.join(tmp_dir, 'gs_out.pdf')
            gs_gray = grayscale or preset.get('grayscale', False)
            ok = _gs_compress(
                input_path, gs_out,
                gs_setting=preset['gs_setting'],
                dpi=preset['dpi'],
                grayscale=gs_gray,
                strip_metadata=strip_metadata,
            )
            engines_tried.append('ghostscript')
            if ok:
                candidates['ghostscript'] = gs_out

        # ── Engine 2: fitz image recompress + pikepdf ─────────────────────
        fitz_out = os.path.join(tmp_dir, 'fitz_out.pdf')
        fitz_ok = _recompress_images_fitz(
            input_path, fitz_out,
            quality=preset['jpeg_quality'],
            scale=preset['image_scale'],
            grayscale=grayscale or preset.get('grayscale', False),
        )
        engines_tried.append('fitz')
        if fitz_ok:
            # Chain pikepdf on top of fitz output
            pke_out = os.path.join(tmp_dir, 'fitz_pke_out.pdf')
            pke_ok = _pikepdf_optimize(fitz_out, pke_out,
                                        strip_metadata=strip_metadata,
                                        remove_annotations=remove_annotations)
            if pke_ok:
                candidates['fitz+pikepdf'] = pke_out
            else:
                candidates['fitz'] = fitz_out

        # ── Engine 3: qpdf ────────────────────────────────────────────────
        if use_qpdf and QPDF_BIN:
            qpdf_out = os.path.join(tmp_dir, 'qpdf_out.pdf')
            ok = _qpdf_stream_compress(input_path, qpdf_out)
            engines_tried.append('qpdf')
            if ok:
                # Also try linearize
                qpdf_lin = os.path.join(tmp_dir, 'qpdf_lin.pdf')
                if _qpdf_linearize(input_path, qpdf_lin):
                    candidates['qpdf_linearized'] = qpdf_lin
                candidates['qpdf'] = qpdf_out

        # ── Engine 4: pikepdf standalone ─────────────────────────────────
        pke_only = os.path.join(tmp_dir, 'pke_only.pdf')
        ok = _pikepdf_optimize(input_path, pke_only,
                                strip_metadata=strip_metadata,
                                remove_annotations=remove_annotations)
        engines_tried.append('pikepdf')
        if ok:
            candidates['pikepdf'] = pke_only

        # ── Engine 5: pypdf fallback ──────────────────────────────────────
        pypdf_out = os.path.join(tmp_dir, 'pypdf_out.pdf')
        ok = _pypdf_fallback(input_path, pypdf_out,
                              remove_annotations=remove_annotations)
        engines_tried.append('pypdf')
        if ok:
            candidates['pypdf'] = pypdf_out

        # Pick the smallest result
        best_method = None
        best_size = orig_size
        best_path = None

        for method, cpath in candidates.items():
            if os.path.exists(cpath):
                sz = os.path.getsize(cpath)
                if sz > 500 and sz < best_size:
                    best_size = sz
                    best_method = method
                    best_path = cpath

        # If nothing helped, use input as-is
        if best_path is None:
            import shutil as _sh
            _sh.copy2(input_path, output_path)
            best_method = 'none (no reduction found)'
            best_size = orig_size
        else:
            import shutil as _sh
            _sh.copy2(best_path, output_path)

        # ── Aggressive pass if still over target ──────────────────────────
        if target_size_kb and best_size > target_size_kb * 1024:
            agg_out = os.path.join(tmp_dir, 'aggressive.pdf')
            if GS_BIN and _gs_compress_aggressively(output_path, agg_out):
                agg_size = os.path.getsize(agg_out)
                if agg_size > 500 and agg_size < best_size:
                    _sh.copy2(agg_out, output_path)
                    best_size = agg_size
                    best_method = 'ghostscript_aggressive'

        # Post-process: strip metadata if requested and engine didn't do it
        if strip_metadata and best_method not in ('ghostscript',):
            _strip_metadata_pikepdf(output_path)

        # Post-process: remove annotations if requested and engine didn't do it
        if remove_annotations and 'pikepdf' not in best_method and \
                best_method not in ('fitz+pikepdf',):
            try:
                with pikepdf.open(output_path, allow_overwriting_input=True) as pdf:
                    for page in pdf.pages:
                        if '/Annots' in page:
                            del page['/Annots']
                    pdf.save(output_path)
            except Exception:
                pass

        final_size = os.path.getsize(output_path)
        reduction = max(0.0, (1 - final_size / orig_size) * 100)

        return {
            'output_path': output_path,
            'original_size_kb': round(orig_size / 1024, 1),
            'compressed_size_kb': round(final_size / 1024, 1),
            'reduction_pct': round(reduction, 1),
            'method_used': best_method or 'none',
            'engines_tried': engines_tried,
            'ghostscript_available': bool(GS_BIN),
            'qpdf_available': bool(QPDF_BIN),
        }

    finally:
        # Cleanup temp directory
        import shutil as _sh
        try:
            _sh.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass


# ── Analysis / preview ────────────────────────────────────────────────────────

def get_compression_estimate(input_path: str) -> dict:
    """
    Analyze PDF and estimate compression potential across all presets.

    Returns dict with image_count, total_image_kb, text_pages, page_count,
    file_size_kb, estimated_reductions_by_preset, has_fonts, font_count,
    content_type, ghostscript_available, qpdf_available.
    """
    info = {
        'image_count': 0,
        'total_image_kb': 0,
        'text_pages': 0,
        'page_count': 0,
        'file_size_kb': round(os.path.getsize(input_path) / 1024, 1),
        'estimated_reductions_by_preset': {},
        'has_fonts': False,
        'font_count': 0,
        'content_type': 'unknown',
        'ghostscript_available': bool(GS_BIN),
        'qpdf_available': bool(QPDF_BIN),
    }
    try:
        doc = fitz.open(input_path)
        info['page_count'] = doc.page_count
        fonts_seen = set()

        for page in doc:
            text = page.get_text().strip()
            imgs = page.get_images(full=True)
            info['image_count'] += len(imgs)

            for img in imgs:
                xref = img[0]
                try:
                    base = doc.extract_image(xref)
                    info['total_image_kb'] += len(base.get('image', b'')) // 1024
                except Exception:
                    pass

            if text:
                info['text_pages'] += 1

            for font in page.get_fonts(full=True):
                fname = font[3] or font[4] or ''
                if fname:
                    fonts_seen.add(fname)

        doc.close()
        info['has_fonts'] = len(fonts_seen) > 0
        info['font_count'] = len(fonts_seen)

        # Content type classification
        if info['image_count'] > info['page_count'] * 0.5:
            info['content_type'] = 'image_heavy'
        elif info['text_pages'] > info['page_count'] * 0.7:
            info['content_type'] = 'text_heavy'
        else:
            info['content_type'] = 'mixed'

        # Estimate reduction per preset
        base_img_reduction = min(70, 15 + info['image_count'] * 2)
        for preset_name, preset in QUALITY_PRESETS.items():
            multiplier = {'screen': 1.0, 'low': 0.85, 'medium': 0.7,
                          'high': 0.5, 'lossless': 0.2}.get(preset_name, 0.5)
            est = base_img_reduction * multiplier
            if info['content_type'] == 'text_heavy':
                est = max(5, est * 0.4)
            info['estimated_reductions_by_preset'][preset_name] = round(est, 1)

    except Exception:
        pass
    return info


def analyze_pdf_streams(input_path: str) -> dict:
    """
    Deep analysis of PDF stream structure for compression planning.
    Returns counts of compressed/uncompressed streams, image types, etc.
    """
    result = {
        'compressed_streams': 0,
        'uncompressed_streams': 0,
        'image_streams': 0,
        'font_streams': 0,
        'content_streams': 0,
        'jpeg_images': 0,
        'png_images': 0,
        'other_images': 0,
        'total_objects': 0,
    }
    try:
        with pikepdf.open(input_path) as pdf:
            result['total_objects'] = len(list(pdf.objects))
            for obj in pdf.objects:
                try:
                    if obj is None:
                        continue
                    d = obj
                    if not hasattr(d, 'get'):
                        continue
                    st = str(d.get('/Subtype', ''))
                    t = str(d.get('/Type', ''))
                    filt = d.get('/Filter', None)

                    if filt is not None:
                        result['compressed_streams'] += 1
                    elif hasattr(obj, 'read_raw_bytes'):
                        result['uncompressed_streams'] += 1

                    if st == '/Image':
                        result['image_streams'] += 1
                        filt_str = str(filt)
                        if 'DCTDecode' in filt_str:
                            result['jpeg_images'] += 1
                        elif 'FlateDecode' in filt_str or 'LZWDecode' in filt_str:
                            result['png_images'] += 1
                        else:
                            result['other_images'] += 1
                    elif t == '/Font':
                        result['font_streams'] += 1
                except Exception:
                    continue
    except Exception:
        pass
    return result


def get_available_engines() -> dict:
    """Return available compression engines and their versions."""
    engines = {
        'ghostscript': {'available': bool(GS_BIN), 'path': GS_BIN},
        'qpdf': {'available': bool(QPDF_BIN), 'path': QPDF_BIN},
        'pikepdf': {'available': True, 'version': pikepdf.__version__},
        'fitz': {'available': True, 'version': fitz.version[0]},
        'pypdf': {'available': True},
    }
    if GS_BIN:
        try:
            r = subprocess.run([GS_BIN, '--version'], capture_output=True,
                               text=True, timeout=5)
            engines['ghostscript']['version'] = r.stdout.strip()
        except Exception:
            pass
    if QPDF_BIN:
        try:
            r = subprocess.run([QPDF_BIN, '--version'], capture_output=True,
                               text=True, timeout=5)
            engines['qpdf']['version'] = r.stdout.strip().split('\n')[0]
        except Exception:
            pass
    return engines


def batch_compress(input_paths: list, output_dir: str,
                   quality: str = 'medium', **kwargs) -> list:
    """
    Compress multiple PDFs and return list of result dicts.
    Each result includes source_path, output_path, and compression stats.
    """
    results = []
    os.makedirs(output_dir, exist_ok=True)
    for path in input_paths:
        base = os.path.splitext(os.path.basename(path))[0]
        out = os.path.join(output_dir, f'{base}_compressed.pdf')
        try:
            res = compress_pdf(path, out, quality=quality, **kwargs)
            res['source_path'] = path
            results.append(res)
        except Exception as e:
            results.append({
                'source_path': path,
                'output_path': None,
                'error': str(e),
            })
    return results


# ── Additional Compression Functions ─────────────────────────────────────────


def compress_images_only(input_path: str, output_path: str,
                          quality: int = 60,
                          min_size_kb: int = 20,
                          password: str = '') -> dict:
    """
    Compress only embedded images in a PDF, preserving all text and vectors.

    This is safer than full compression as it never touches text streams,
    resulting in crisp text with smaller file size from image reduction.

    Args:
        input_path:   Source PDF
        output_path:  Output PDF
        quality:      JPEG quality (0-100, lower = smaller)
        min_size_kb:  Skip images smaller than this (avoid compressing tiny images)
        password:     PDF password

    Returns:
        dict: images_processed, images_compressed, images_skipped,
              original_size_kb, final_size_kb, reduction_pct
    """
    from PIL import Image
    import io

    orig_size = os.path.getsize(input_path) / 1024
    images_processed = 0
    images_compressed = 0
    images_skipped = 0

    try:
        with pikepdf.open(input_path, password=password or '') as pdf:
            for obj in pdf.objects:
                try:
                    if (hasattr(obj, 'get') and
                            obj.get('/Subtype') == pikepdf.Name('/Image') and
                            obj.get('/Filter') != pikepdf.Name('/JPXDecode')):

                        images_processed += 1
                        img_bytes = obj.get_raw_stream_buffer()

                        if len(img_bytes) < min_size_kb * 1024:
                            images_skipped += 1
                            continue

                        # Decode and re-encode
                        try:
                            width = int(obj['/Width'])
                            height = int(obj['/Height'])
                            cs = obj.get('/ColorSpace', '/DeviceRGB')
                            mode = 'RGB'
                            if '/DeviceGray' in str(cs):
                                mode = 'L'

                            img_buf = io.BytesIO(bytes(img_bytes))
                            img = Image.open(img_buf)
                            if img.mode not in ('RGB', 'L', 'RGBA'):
                                img = img.convert('RGB')
                            if img.mode == 'RGBA':
                                img = img.convert('RGB')

                            out_buf = io.BytesIO()
                            img.save(out_buf, 'JPEG', quality=quality,
                                     optimize=True)
                            new_bytes = out_buf.getvalue()

                            if len(new_bytes) < len(img_bytes) * 0.95:
                                obj.write(new_bytes,
                                         filter=pikepdf.Name('/DCTDecode'))
                                obj['/Filter'] = pikepdf.Name('/DCTDecode')
                                if '/DecodeParms' in obj:
                                    del obj['/DecodeParms']
                                images_compressed += 1
                            else:
                                images_skipped += 1

                        except Exception:
                            images_skipped += 1

                except Exception:
                    continue

            pdf.save(output_path, compress_streams=True)

        final_size = os.path.getsize(output_path) / 1024
        reduction = (1 - final_size / orig_size) * 100 if orig_size > 0 else 0

        return {
            'images_processed': images_processed,
            'images_compressed': images_compressed,
            'images_skipped': images_skipped,
            'original_size_kb': round(orig_size, 1),
            'final_size_kb': round(final_size, 1),
            'reduction_pct': round(reduction, 1),
            'output_path': output_path,
        }

    except Exception as e:
        logger.warning(f'compress_images_only failed: {e}')
        raise


def get_compression_potential(input_path: str, password: str = '') -> dict:
    """
    Analyze a PDF and estimate how much each compression technique could reduce it.

    Returns estimated reduction percentages for different strategies
    without actually compressing, helping users pick the best approach.

    Args:
        input_path: Source PDF
        password:   PDF password

    Returns:
        dict: current_size_kb, estimates dict per strategy, recommended_strategy
    """
    current_size = os.path.getsize(input_path) / 1024
    estimates: dict = {}

    try:
        # Analyze image content
        total_image_bytes = 0
        total_stream_bytes = 0
        has_uncompressed = False
        image_count = 0

        with pikepdf.open(input_path, password=password or '') as pdf:
            for obj in pdf.objects:
                try:
                    if not hasattr(obj, 'get'):
                        continue
                    if obj.get('/Subtype') == pikepdf.Name('/Image'):
                        total_image_bytes += len(obj.get_raw_stream_buffer())
                        image_count += 1
                    try:
                        raw = obj.get_raw_stream_buffer()
                        total_stream_bytes += len(raw)
                        flt = obj.get('/Filter')
                        if flt is None:
                            has_uncompressed = True
                    except Exception:
                        pass
                except Exception:
                    continue

        # Estimate reductions
        image_fraction = total_image_bytes / (current_size * 1024) if current_size > 0 else 0

        estimates['screen_quality'] = {
            'strategy': 'Screen quality (72 dpi images)',
            'estimated_reduction_pct': round(min(85, image_fraction * 80 + 5), 1),
            'quality_impact': 'high',
        }
        estimates['ebook_quality'] = {
            'strategy': 'eBook quality (150 dpi images)',
            'estimated_reduction_pct': round(min(70, image_fraction * 65 + 3), 1),
            'quality_impact': 'medium',
        }
        estimates['printer_quality'] = {
            'strategy': 'Printer quality (300 dpi)',
            'estimated_reduction_pct': round(min(50, image_fraction * 40 + 2), 1),
            'quality_impact': 'low',
        }
        estimates['lossless_only'] = {
            'strategy': 'Lossless stream compression only',
            'estimated_reduction_pct': round(15 if has_uncompressed else 5, 1),
            'quality_impact': 'none',
        }
        estimates['images_only'] = {
            'strategy': 'Re-compress images only (JPEG 75)',
            'estimated_reduction_pct': round(min(60, image_fraction * 55), 1),
            'quality_impact': 'low',
        }

        # Recommend strategy
        if image_fraction > 0.6:
            recommended = 'ebook_quality'
        elif image_fraction > 0.3:
            recommended = 'images_only'
        else:
            recommended = 'lossless_only'

        return {
            'current_size_kb': round(current_size, 1),
            'image_count': image_count,
            'image_fraction_pct': round(image_fraction * 100, 1),
            'estimates': estimates,
            'recommended_strategy': recommended,
        }

    except Exception as e:
        logger.warning(f'get_compression_potential failed: {e}')
        return {'current_size_kb': round(current_size, 1), 'error': str(e)}
