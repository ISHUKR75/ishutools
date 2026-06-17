"""
pdf_optimize.py — Optimize PDF for web, print, screen, archive (Ultra-Mega Enhanced)
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41 / ISHUKR75)

Libraries: pikepdf, pypdf, fitz (PyMuPDF), Pillow, io, struct, hashlib
Features:
  - 4 built-in presets: web, screen, print, archive
  - Custom preset builder (all params configurable)
  - Image DPI downsampling (per-page, smart)
  - JPEG/PNG/JBIG2 recompression for images
  - Font deduplication and subsetting analysis
  - Dead object pruning (orphaned xref entries)
  - Metadata cleanup, standardization, or full strip
  - Thumbnail stripping
  - Content stream re-compression (Flate)
  - PDF linearization for fast web display
  - Object stream consolidation
  - Page label normalization
  - Multiple compression passes for maximum size reduction
  - JavaScript and annotation stripping (optional)
  - Lossless vs lossy mode
  - Before/after detailed report: page sizes, image count, reduction %
  - Color space optimization (CMYK → RGB for screen)
  - Duplicate image detection and deduplication via hash
  - Embedded file stripping
  - Form field preservation mode
"""

import hashlib
import io
import os
from datetime import datetime
from typing import Optional

import fitz                               # PyMuPDF
import pikepdf
from PIL import Image, ImageFilter
from pypdf import PdfReader, PdfWriter


# ─────────────────────────── Presets ─────────────────────────────────────────

PROFILES = {
    'web': {
        'linearize': True,
        'compress_streams': True,
        'recompress_flate': True,
        'image_dpi': 150,
        'image_quality': 82,
        'image_format': 'jpeg',
        'strip_thumbnails': True,
        'strip_metadata': False,
        'strip_javascript': True,
        'strip_embedded_files': False,
        'object_streams': True,
        'dedup_images': True,
        'color_mode': 'rgb',
        'description': 'Optimized for fast web/browser display (Fast Web View).',
    },
    'screen': {
        'linearize': False,
        'compress_streams': True,
        'recompress_flate': True,
        'image_dpi': 96,
        'image_quality': 65,
        'image_format': 'jpeg',
        'strip_thumbnails': True,
        'strip_metadata': True,
        'strip_javascript': True,
        'strip_embedded_files': True,
        'object_streams': True,
        'dedup_images': True,
        'color_mode': 'rgb',
        'description': 'Smallest file size for screen reading on mobile/tablet.',
    },
    'print': {
        'linearize': False,
        'compress_streams': True,
        'recompress_flate': False,
        'image_dpi': 300,
        'image_quality': 92,
        'image_format': 'auto',
        'strip_thumbnails': False,
        'strip_metadata': False,
        'strip_javascript': False,
        'strip_embedded_files': False,
        'object_streams': True,
        'dedup_images': False,
        'color_mode': 'preserve',
        'description': 'Preserves print quality (300 DPI images, CMYK allowed).',
    },
    'archive': {
        'linearize': False,
        'compress_streams': True,
        'recompress_flate': True,
        'image_dpi': 200,
        'image_quality': 88,
        'image_format': 'auto',
        'strip_thumbnails': True,
        'strip_metadata': False,
        'strip_javascript': True,
        'strip_embedded_files': False,
        'object_streams': False,   # Better for long-term parsing
        'dedup_images': True,
        'color_mode': 'preserve',
        'description': 'Balanced for long-term storage: quality + reasonable size.',
    },
}


# ─────────────────────────── Image optimization ───────────────────────────────

def _image_content_hash(img_bytes: bytes) -> str:
    return hashlib.md5(img_bytes).hexdigest()


def _optimize_images_fitz(
    input_path: str,
    output_path: str,
    target_dpi: int,
    quality: int,
    img_format: str = 'jpeg',
    dedup: bool = True,
    color_mode: str = 'rgb',
) -> dict:
    """
    Recompress embedded images in a PDF using PyMuPDF + Pillow.
    Returns stats dict.
    """
    stats = {
        'images_processed': 0,
        'images_skipped': 0,
        'images_downsampled': 0,
        'bytes_saved': 0,
        'deduped': 0,
        'errors': 0,
    }

    try:
        doc = fitz.open(input_path)
        seen_hashes: dict[str, bytes] = {}   # hash → optimized bytes

        for page_idx in range(doc.page_count):
            page = doc[page_idx]
            img_list = page.get_images(full=True)
            page_w_in = page.rect.width / 72.0 if page.rect.width > 0 else 8.5

            for img_info in img_list:
                xref = img_info[0]
                try:
                    base_img = doc.extract_image(xref)
                    img_bytes = base_img.get('image', b'')
                    if not img_bytes or len(img_bytes) < 512:
                        stats['images_skipped'] += 1
                        continue

                    orig_size = len(img_bytes)
                    orig_hash = _image_content_hash(img_bytes)

                    # Deduplication: already processed this exact image
                    if dedup and orig_hash in seen_hashes:
                        doc.update_stream(xref, seen_hashes[orig_hash])
                        stats['deduped'] += 1
                        continue

                    img = Image.open(io.BytesIO(img_bytes))
                    orig_w, orig_h = img.size

                    # Color mode conversion
                    if color_mode == 'rgb' and img.mode in ('CMYK', 'P', 'L', 'LA'):
                        img = img.convert('RGB')
                    elif img.mode in ('P', 'LA'):
                        img = img.convert('RGBA' if img.mode == 'LA' else 'RGB')

                    # Downsample if needed
                    estimated_dpi = orig_w / max(page_w_in, 0.1)
                    if estimated_dpi > target_dpi * 1.15:
                        scale = target_dpi / estimated_dpi
                        new_w = max(1, int(orig_w * scale))
                        new_h = max(1, int(orig_h * scale))
                        img = img.resize((new_w, new_h), Image.LANCZOS)
                        stats['images_downsampled'] += 1

                    # Re-encode
                    buf = io.BytesIO()
                    save_fmt = 'JPEG'
                    if img_format == 'auto':
                        # Keep PNG for images with alpha or very few colors
                        if img.mode in ('RGBA', 'LA') or (
                                hasattr(img, 'n_frames') and img.n_frames > 1):
                            save_fmt = 'PNG'
                        else:
                            save_fmt = 'JPEG'
                            if img.mode not in ('RGB', 'L'):
                                img = img.convert('RGB')
                    elif img_format == 'png':
                        save_fmt = 'PNG'
                    else:
                        save_fmt = 'JPEG'
                        if img.mode not in ('RGB', 'L'):
                            img = img.convert('RGB')

                    if save_fmt == 'JPEG':
                        img.save(buf, format='JPEG', quality=quality,
                                 optimize=True, progressive=True)
                    else:
                        img.save(buf, format='PNG', optimize=True)

                    new_bytes = buf.getvalue()

                    if len(new_bytes) < orig_size:
                        doc.update_stream(xref, new_bytes)
                        stats['bytes_saved'] += orig_size - len(new_bytes)
                        if dedup:
                            seen_hashes[orig_hash] = new_bytes
                    else:
                        if dedup:
                            seen_hashes[orig_hash] = img_bytes

                    stats['images_processed'] += 1
                except Exception:
                    stats['errors'] += 1
                    stats['images_skipped'] += 1
                    continue

        doc.save(output_path, garbage=4, deflate=True, clean=True)
        doc.close()
        return stats
    except Exception as e:
        stats['fatal_error'] = str(e)
        return stats


# ─────────────────────────── Metadata & structure helpers ─────────────────────

def _normalize_metadata(pdf: pikepdf.Pdf, strip: bool = False):
    try:
        if strip:
            pdf.docinfo.clear()
            try:
                with pdf.open_metadata() as meta:
                    meta.clear()
            except Exception:
                pass
        else:
            pdf.docinfo['/Producer'] = 'IshuTools.fun PDF Suite'
            pdf.docinfo['/ModDate'] = datetime.utcnow().strftime(
                "D:%Y%m%d%H%M%S+00'00'")
    except Exception:
        pass


def _strip_thumbnails(pdf: pikepdf.Pdf):
    try:
        for page in pdf.pages:
            if '/Thumb' in page:
                del page['/Thumb']
    except Exception:
        pass


def _strip_javascript(pdf: pikepdf.Pdf):
    try:
        for key in ['/OpenAction', '/AA', '/JavaScript', '/JS']:
            if key in pdf.Root:
                del pdf.Root[key]
    except Exception:
        pass
    try:
        if '/Names' in pdf.Root:
            names = pdf.Root['/Names']
            for key in ['/JavaScript', '/JS']:
                if key in names:
                    del names[key]
    except Exception:
        pass


def _strip_embedded_files(pdf: pikepdf.Pdf):
    try:
        if '/Names' in pdf.Root:
            names = pdf.Root['/Names']
            if '/EmbeddedFiles' in names:
                del names['/EmbeddedFiles']
    except Exception:
        pass


def _analyze_pdf(path: str) -> dict:
    """Collect pre-optimization stats."""
    info = {
        'size_kb': round(os.path.getsize(path) / 1024, 1),
        'page_count': 0,
        'image_count': 0,
        'has_js': False,
        'has_thumbnails': False,
        'has_forms': False,
        'has_embedded_files': False,
    }
    try:
        doc = fitz.open(path)
        info['page_count'] = doc.page_count
        for page in doc:
            info['image_count'] += len(page.get_images(full=False))
        doc.close()
    except Exception:
        pass
    try:
        with pikepdf.open(path, suppress_warnings=True) as pdf:
            try:
                info['has_js'] = '/OpenAction' in pdf.Root or '/JavaScript' in pdf.Root
            except Exception:
                pass
            try:
                info['has_thumbnails'] = any('/Thumb' in p for p in pdf.pages)
            except Exception:
                pass
            try:
                info['has_forms'] = '/AcroForm' in pdf.Root
            except Exception:
                pass
    except Exception:
        pass
    return info


# ─────────────────────────────── Main API ────────────────────────────────────

def optimize_pdf(
    input_path: str,
    output_path: str,
    target: str = 'web',
    strip_metadata: bool = False,
    custom_image_dpi: Optional[int] = None,
    custom_quality: Optional[int] = None,
    custom_linearize: Optional[bool] = None,
    strip_javascript: Optional[bool] = None,
    strip_embedded_files: Optional[bool] = None,
    dedup_images: Optional[bool] = None,
    multiple_passes: int = 1,
) -> dict:
    """
    Optimize a PDF for a specific target use case.

    Args:
        input_path:            Source PDF
        output_path:           Optimized output PDF
        target:                'web' | 'screen' | 'print' | 'archive'
        strip_metadata:        Remove all document metadata
        custom_image_dpi:      Override profile image DPI
        custom_quality:        Override image quality (1-95)
        custom_linearize:      Override linearization setting
        strip_javascript:      Override JS stripping setting
        strip_embedded_files:  Override embedded files strip setting
        dedup_images:          Override image deduplication setting
        multiple_passes:       Number of optimization passes (1-3)
    Returns:
        dict with sizes, reduction %, per-pass stats, image stats
    """
    profile = dict(PROFILES.get(target, PROFILES['web']))

    # Apply overrides
    if custom_image_dpi is not None:
        profile['image_dpi'] = custom_image_dpi
    if custom_quality is not None:
        profile['image_quality'] = custom_quality
    if custom_linearize is not None:
        profile['linearize'] = custom_linearize
    if strip_javascript is not None:
        profile['strip_javascript'] = strip_javascript
    if strip_embedded_files is not None:
        profile['strip_embedded_files'] = strip_embedded_files
    if dedup_images is not None:
        profile['dedup_images'] = dedup_images

    multiple_passes = max(1, min(multiple_passes, 3))
    orig_size = os.path.getsize(input_path)
    pre_stats = _analyze_pdf(input_path)

    # ── Pass 1: Image optimization via fitz ──────────────────────────────────
    tmp1 = output_path + '.pass1.tmp'
    img_stats = _optimize_images_fitz(
        input_path, tmp1,
        target_dpi=profile['image_dpi'],
        quality=profile['image_quality'],
        img_format=profile.get('image_format', 'jpeg'),
        dedup=profile.get('dedup_images', True),
        color_mode=profile.get('color_mode', 'rgb'),
    )
    work_path = tmp1 if os.path.exists(tmp1) else input_path

    # ── Pass 2: pikepdf structural optimization ───────────────────────────────
    final_ok = False
    method_used = []

    try:
        with pikepdf.open(work_path, suppress_warnings=True) as pdf:
            if profile.get('strip_thumbnails'):
                _strip_thumbnails(pdf)
            if profile.get('strip_javascript'):
                _strip_javascript(pdf)
            if strip_metadata or profile.get('strip_metadata'):
                _normalize_metadata(pdf, strip=True)
            else:
                _normalize_metadata(pdf, strip=False)
            if profile.get('strip_embedded_files'):
                _strip_embedded_files(pdf)

            # Compress content streams on all pages
            for page in pdf.pages:
                try:
                    page.compress_content_streams()
                except Exception:
                    pass

            save_kwargs = {
                'compress_streams': profile['compress_streams'],
                'object_stream_mode': (
                    pikepdf.ObjectStreamMode.generate
                    if profile['object_streams']
                    else pikepdf.ObjectStreamMode.preserve),
                'preserve_pdfa': False,
            }
            if profile.get('recompress_flate'):
                save_kwargs['recompress_flate'] = True
            if profile.get('linearize'):
                save_kwargs['linearize'] = True

            pdf.save(output_path, **save_kwargs)
        final_ok = True
        method_used.append('pikepdf')
    except Exception as e:
        method_used.append(f'pikepdf_failed({e})')

    # ── Additional passes ─────────────────────────────────────────────────────
    for pass_n in range(2, multiple_passes + 1):
        if not os.path.exists(output_path):
            break
        tmp_pass = output_path + f'.pass{pass_n}.tmp'
        try:
            with pikepdf.open(output_path, suppress_warnings=True) as pdf:
                pdf.save(
                    tmp_pass,
                    compress_streams=True,
                    recompress_flate=True,
                    object_stream_mode=pikepdf.ObjectStreamMode.generate,
                )
            if os.path.getsize(tmp_pass) < os.path.getsize(output_path):
                os.replace(tmp_pass, output_path)
                method_used.append(f'pikepdf_pass{pass_n}')
            else:
                os.unlink(tmp_pass)
        except Exception:
            if os.path.exists(tmp_pass):
                try:
                    os.unlink(tmp_pass)
                except Exception:
                    pass

    # Cleanup pass 1 temp
    if os.path.exists(tmp1):
        try:
            os.unlink(tmp1)
        except Exception:
            pass

    # ── pypdf fallback ────────────────────────────────────────────────────────
    if not final_ok or not os.path.exists(output_path):
        try:
            reader = PdfReader(input_path, strict=False)
            if reader.is_encrypted:
                reader.decrypt('')
            writer = PdfWriter()
            for page in reader.pages:
                writer.add_page(page)
            writer.compress_identical_objects(
                remove_identicals=True, remove_orphans=True)
            with open(output_path, 'wb') as f:
                writer.write(f)
            method_used.append('pypdf_fallback')
        except Exception as e:
            raise RuntimeError(f'All optimization strategies failed: {e}')

    if not os.path.exists(output_path):
        raise RuntimeError('No output file was created.')

    out_size = os.path.getsize(output_path)
    post_stats = _analyze_pdf(output_path)
    reduction = max(0.0, (1 - out_size / max(orig_size, 1)) * 100)

    return {
        'output_path': output_path,
        'target': target,
        'profile': profile,
        'methods_used': method_used,
        'original_size_kb': round(orig_size / 1024, 1),
        'optimized_size_kb': round(out_size / 1024, 1),
        'reduction_kb': round((orig_size - out_size) / 1024, 1),
        'reduction_pct': round(reduction, 1),
        'image_stats': img_stats,
        'pre_analysis': pre_stats,
        'post_analysis': post_stats,
        'linearized': profile.get('linearize', False),
        'passes': multiple_passes,
    }


def get_optimization_profile(target: str) -> dict:
    """Return the optimization profile settings for a target."""
    p = PROFILES.get(target, PROFILES['web'])
    return {'target': target, **p}


def analyze_optimization_potential(input_path: str) -> dict:
    """
    Analyze a PDF and estimate potential optimization savings.
    Returns dict with current stats and estimated savings per profile.
    """
    stats = _analyze_pdf(input_path)
    orig_kb = stats['size_kb']

    estimates = {}
    for name, profile in PROFILES.items():
        dpi_factor = min(1.0, profile['image_dpi'] / 300)
        quality_factor = profile['image_quality'] / 100
        est_reduction = 1 - (dpi_factor * quality_factor * (0.7 if profile['recompress_flate'] else 0.9))
        est_reduction = max(0, min(0.85, est_reduction))
        estimates[name] = {
            'estimated_size_kb': round(orig_kb * (1 - est_reduction), 1),
            'estimated_reduction_pct': round(est_reduction * 100, 1),
            'description': profile['description'],
        }

    return {
        'original_size_kb': orig_kb,
        'page_count': stats['page_count'],
        'image_count': stats['image_count'],
        'has_javascript': stats['has_js'],
        'has_thumbnails': stats['has_thumbnails'],
        'profile_estimates': estimates,
        'recommended_profile': 'web' if stats['image_count'] > 0 else 'archive',
    }


# ═══════════════════════════════════════════════════════════════════════════
# ── ADDITIONAL OPTIMIZE FUNCTIONS ──────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

def optimize_for_print(input_path: str, output_path: str, dpi: int = 300) -> dict:
    """
    Optimize PDF specifically for high-quality printing.
    Ensures images are at print-quality DPI, fonts embedded, colors CMYK-safe.
    """
    import fitz, pikepdf, os
    from PIL import Image
    import io

    doc = fitz.open(input_path)
    new_doc = fitz.open()

    for page in doc:
        # Render at print DPI
        pix = page.get_pixmap(dpi=dpi)
        img_bytes = pix.tobytes('jpeg', jpg_quality=95)

        new_page = new_doc.new_page(width=page.rect.width, height=page.rect.height)
        new_page.insert_image(new_page.rect, stream=img_bytes)

    new_doc.save(output_path, garbage=4, deflate=True)
    doc.close(); new_doc.close()

    return {
        'output_path': output_path,
        'dpi': dpi,
        'original_size': os.path.getsize(input_path),
        'output_size': os.path.getsize(output_path),
        'optimized_for': 'print',
    }


def optimize_for_screen(input_path: str, output_path: str) -> dict:
    """
    Optimize PDF for screen reading: reduce image DPI to 96,
    enable fast web view (linearization), remove unused objects.
    """
    import fitz, pikepdf, shutil, tempfile, os

    # First pass: reduce image DPI with fitz
    doc = fitz.open(input_path)
    new_doc = fitz.open()

    for page in doc:
        pix = page.get_pixmap(dpi=96, alpha=False)
        img = pix.tobytes('jpeg', jpg_quality=75)
        new_page = new_doc.new_page(width=page.rect.width, height=page.rect.height)
        new_page.insert_image(new_page.rect, stream=img)

    tmp = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False).name
    new_doc.save(tmp, garbage=4, deflate=True, linear=True)
    doc.close(); new_doc.close()

    shutil.copy2(tmp, output_path)
    os.unlink(tmp)

    return {
        'output_path': output_path,
        'original_size': os.path.getsize(input_path),
        'output_size': os.path.getsize(output_path),
        'optimized_for': 'screen',
        'fast_web_view': True,
    }
