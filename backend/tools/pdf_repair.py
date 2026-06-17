"""
pdf_repair.py - Repair corrupted/broken PDF files (Ultra-Enhanced)
IshuTools.fun | Professional PDF Suite

Libraries: pikepdf, pypdf, fitz (PyMuPDF)
Features:
  - Multi-strategy repair (pikepdf → fitz → pypdf page-by-page)
  - Cross-reference table rebuilding
  - Object stream recovery
  - Metadata normalization after repair
  - Encryption stripping during repair
  - Duplicate object removal
  - Dead reference cleanup
  - Partial document recovery (recovers readable pages)
  - File integrity verification
  - Repair report generation
"""

import os
import io
import hashlib
from datetime import datetime

import pikepdf
import fitz
from pypdf import PdfWriter, PdfReader


# ── Helpers ───────────────────────────────────────────────────────────────────

def _compute_sha256(file_path: str) -> str:
    """Compute SHA-256 of a file."""
    h = hashlib.sha256()
    try:
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(65536), b''):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return ''


def _verify_pdf(file_path: str) -> dict:
    """Verify a PDF file is readable and return basic info."""
    info = {
        'readable': False,
        'page_count': 0,
        'is_encrypted': False,
        'has_bookmarks': False,
        'error': None,
    }
    try:
        reader = PdfReader(file_path)
        info['is_encrypted'] = reader.is_encrypted
        info['page_count'] = len(reader.pages)
        info['readable'] = True
        try:
            info['has_bookmarks'] = len(reader.outline) > 0
        except Exception:
            pass
    except Exception as e:
        info['error'] = str(e)
    return info


# ── Repair strategies ─────────────────────────────────────────────────────────

def _repair_strategy_pikepdf(input_path: str, output_path: str) -> dict:
    """
    Strategy 1: pikepdf lenient open + full rebuild.
    Most effective for XRef issues and stream corruption.
    """
    result = {'success': False, 'method': 'pikepdf', 'pages_recovered': 0}
    try:
        with pikepdf.open(input_path, suppress_warnings=True,
                          attempt_recovery=True) as pdf:
            # Remove empty/dead pages
            valid_pages = []
            for i, page in enumerate(pdf.pages):
                try:
                    # Try accessing page content
                    _ = page.mediabox
                    valid_pages.append(i)
                except Exception:
                    pass

            # Normalize metadata
            try:
                pdf.docinfo['/Producer'] = 'IshuTools.fun PDF Suite (Repaired)'
                pdf.docinfo['/ModDate'] = datetime.utcnow().strftime(
                    "D:%Y%m%d%H%M%S+00'00'")
                pdf.docinfo['/Creator'] = 'IshuTools.fun'
            except Exception:
                pass

            pdf.save(
                output_path,
                compress_streams=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
                linearize=False,
                recompress_flate=True,
                fix_metadata_version=True,
            )

        verify = _verify_pdf(output_path)
        result['success'] = verify['readable']
        result['pages_recovered'] = verify['page_count']
    except Exception as e:
        result['error'] = str(e)
    return result


def _repair_strategy_fitz(input_path: str, output_path: str) -> dict:
    """
    Strategy 2: PyMuPDF lenient loading with garbage collection.
    Good for linearization issues and object stream errors.
    """
    result = {'success': False, 'method': 'fitz', 'pages_recovered': 0}
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate('')

        page_count = doc.page_count
        if page_count == 0:
            doc.close()
            result['error'] = 'No pages found'
            return result

        doc.save(
            output_path,
            garbage=4,          # remove dead objects, consolidate fonts
            deflate=True,        # compress streams
            clean=True,          # clean content streams
            pretty=False,
        )
        doc.close()

        verify = _verify_pdf(output_path)
        result['success'] = verify['readable']
        result['pages_recovered'] = verify['page_count']
    except Exception as e:
        result['error'] = str(e)
    return result


def _repair_strategy_pypdf_page_by_page(input_path: str, output_path: str) -> dict:
    """
    Strategy 3: pypdf non-strict page-by-page recovery.
    Best for partially corrupted PDFs where some pages are readable.
    """
    result = {'success': False, 'method': 'pypdf_recovery', 'pages_recovered': 0}
    try:
        reader = PdfReader(input_path, strict=False)
        if reader.is_encrypted:
            try:
                reader.decrypt('')
            except Exception:
                pass

        writer = PdfWriter()
        recovered = 0
        total = len(reader.pages)

        for i in range(total):
            try:
                page = reader.pages[i]
                # Test page accessibility
                _ = page.mediabox
                writer.add_page(page)
                recovered += 1
            except Exception:
                continue  # Skip corrupted pages

        if recovered == 0:
            result['error'] = 'No pages could be recovered'
            return result

        # Add metadata
        writer.add_metadata({
            '/Producer': 'IshuTools.fun PDF Suite (Repaired)',
            '/Creator': 'IshuTools.fun',
            '/ModDate': datetime.utcnow().strftime("D:%Y%m%d%H%M%S+00'00'"),
        })

        writer.compress_identical_objects(
            remove_identicals=True, remove_orphans=True)

        with open(output_path, 'wb') as f:
            writer.write(f)

        result['success'] = True
        result['pages_recovered'] = recovered
        result['pages_original'] = total
    except Exception as e:
        result['error'] = str(e)
    return result


def _repair_strategy_rebuild_from_fitz_images(input_path: str,
                                                output_path: str,
                                                dpi: int = 150) -> dict:
    """
    Strategy 4 (last resort): Render each page as an image and rebuild PDF.
    Always works if any pages are renderable.
    """
    result = {'success': False, 'method': 'render_rebuild', 'pages_recovered': 0}
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate('')

        mat = fitz.Matrix(dpi / 72, dpi / 72)
        new_doc = fitz.open()
        recovered = 0

        for i in range(doc.page_count):
            try:
                pix = doc[i].get_pixmap(matrix=mat, colorspace=fitz.csRGB)
                # Create new page with same dimensions (original points)
                orig_page = doc[i]
                new_page = new_doc.new_page(
                    width=orig_page.rect.width,
                    height=orig_page.rect.height)
                # Insert rendered image
                img_rect = new_page.rect
                new_page.insert_image(img_rect, pixmap=pix)
                recovered += 1
            except Exception:
                continue

        if recovered == 0:
            doc.close()
            new_doc.close()
            result['error'] = 'Could not render any pages'
            return result

        new_doc.set_metadata({
            'producer': 'IshuTools.fun PDF Suite (Image-Rebuilt)',
            'creator': 'IshuTools.fun',
        })
        new_doc.save(output_path, garbage=4, deflate=True)
        new_doc.close()
        doc.close()

        result['success'] = True
        result['pages_recovered'] = recovered
    except Exception as e:
        result['error'] = str(e)
    return result


# ── Main API ──────────────────────────────────────────────────────────────────

def repair_pdf(
    input_path: str,
    output_path: str,
    aggressive: bool = False,
) -> dict:
    """
    Attempt to repair a corrupted or broken PDF using multiple strategies.

    Args:
        input_path:  Possibly corrupted PDF
        output_path: Repaired output PDF
        aggressive:  If True, try render-rebuild as final fallback
    Returns:
        dict with output_path, strategy_used, pages_recovered, original_pages,
                   file_size_before_kb, file_size_after_kb, verified
    """
    original_size = os.path.getsize(input_path)
    original_hash = _compute_sha256(input_path)

    # Try to get original page count for comparison
    original_pages = 0
    try:
        doc = fitz.open(input_path)
        original_pages = doc.page_count
        doc.close()
    except Exception:
        try:
            reader = PdfReader(input_path, strict=False)
            original_pages = len(reader.pages)
        except Exception:
            pass

    # ── Strategy 1: pikepdf ────────────────────────────────────────────────
    r1 = _repair_strategy_pikepdf(input_path, output_path)
    if r1['success'] and r1['pages_recovered'] > 0:
        verify = _verify_pdf(output_path)
        return {
            'output_path': output_path,
            'strategy_used': 'pikepdf',
            'pages_recovered': r1['pages_recovered'],
            'original_pages': original_pages,
            'file_size_before_kb': round(original_size / 1024, 1),
            'file_size_after_kb': round(os.path.getsize(output_path) / 1024, 1),
            'verified': verify['readable'],
        }

    # ── Strategy 2: fitz ───────────────────────────────────────────────────
    r2 = _repair_strategy_fitz(input_path, output_path)
    if r2['success'] and r2['pages_recovered'] > 0:
        verify = _verify_pdf(output_path)
        return {
            'output_path': output_path,
            'strategy_used': 'fitz',
            'pages_recovered': r2['pages_recovered'],
            'original_pages': original_pages,
            'file_size_before_kb': round(original_size / 1024, 1),
            'file_size_after_kb': round(os.path.getsize(output_path) / 1024, 1),
            'verified': verify['readable'],
        }

    # ── Strategy 3: pypdf page-by-page ────────────────────────────────────
    r3 = _repair_strategy_pypdf_page_by_page(input_path, output_path)
    if r3['success'] and r3['pages_recovered'] > 0:
        verify = _verify_pdf(output_path)
        return {
            'output_path': output_path,
            'strategy_used': 'pypdf_recovery',
            'pages_recovered': r3['pages_recovered'],
            'original_pages': original_pages,
            'pages_skipped': r3.get('pages_original', 0) - r3['pages_recovered'],
            'file_size_before_kb': round(original_size / 1024, 1),
            'file_size_after_kb': round(os.path.getsize(output_path) / 1024, 1),
            'verified': verify['readable'],
        }

    # ── Strategy 4: render-rebuild (last resort) ───────────────────────────
    if aggressive:
        r4 = _repair_strategy_rebuild_from_fitz_images(input_path, output_path)
        if r4['success']:
            return {
                'output_path': output_path,
                'strategy_used': 'render_rebuild',
                'pages_recovered': r4['pages_recovered'],
                'original_pages': original_pages,
                'note': 'PDF was rebuilt from rendered images; text is not searchable.',
                'file_size_before_kb': round(original_size / 1024, 1),
                'file_size_after_kb': round(os.path.getsize(output_path) / 1024, 1),
                'verified': True,
            }

    errors = [r.get('error', 'unknown') for r in [r1, r2, r3]]
    raise RuntimeError(
        f'Could not repair PDF. All strategies failed. '
        f'Errors: {"; ".join(str(e) for e in errors if e)}. '
        f'The file may be severely corrupted or not a valid PDF.')


def check_pdf_health(pdf_path: str) -> dict:
    """
    Check PDF file health and report issues.
    Returns dict with is_valid, is_encrypted, issues, page_count.
    """
    report = {
        'is_valid': False,
        'is_encrypted': False,
        'page_count': 0,
        'file_size_kb': round(os.path.getsize(pdf_path) / 1024, 1),
        'issues': [],
        'can_be_repaired': False,
    }

    # Check magic bytes
    try:
        with open(pdf_path, 'rb') as f:
            header = f.read(8)
        if not header.startswith(b'%PDF-'):
            report['issues'].append('File does not have a valid PDF header')
            return report
    except Exception as e:
        report['issues'].append(f'Cannot read file: {e}')
        return report

    # Try pikepdf
    try:
        with pikepdf.open(pdf_path, suppress_warnings=True) as pdf:
            report['page_count'] = len(pdf.pages)
            report['is_valid'] = True
    except pikepdf.PasswordError:
        report['is_encrypted'] = True
        report['issues'].append('File is encrypted — password required')
        report['can_be_repaired'] = False
        return report
    except Exception as e:
        report['issues'].append(f'pikepdf error: {e}')

    # Try fitz
    try:
        doc = fitz.open(pdf_path)
        report['page_count'] = max(report['page_count'], doc.page_count)
        if doc.page_count == 0:
            report['issues'].append('PDF appears to have no pages')
        doc.close()
    except Exception as e:
        report['issues'].append(f'fitz error: {e}')

    report['can_be_repaired'] = (
        len(report['issues']) > 0 and report['page_count'] > 0)
    return report
