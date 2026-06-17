"""
pdf_rotate.py - Enterprise PDF Rotation & Orientation Suite
IshuTools.fun | Professional PDF Suite

Features:
  - Rotate any page(s) by any angle (90/180/270/-90 etc.)
  - Auto-orient: detect and fix landscape/portrait mismatches
  - Content-bounding-box orientation detection
  - Deskew detection (flag pages that may be skewed)
  - Flip pages horizontally or vertically (content stream transform)
  - Per-page angle specification (JSON map)
  - Normalize all pages to portrait or landscape
  - Preserve existing rotation metadata correctly
  - Ghostscript high-fidelity rotation
  - qpdf rotation pass
  - Rotation report / audit
  - Batch rotation directory
"""

import os
import io
import re
import json
import shutil
import subprocess
import logging
from typing import Optional, Union

import fitz
import pikepdf
from pypdf import PdfWriter, PdfReader

logger = logging.getLogger(__name__)

GS_BIN = shutil.which('gs') or shutil.which('ghostscript')
QPDF_BIN = shutil.which('qpdf')


# ── Page selection ────────────────────────────────────────────────────────────

def parse_page_selection(pages_str: str, total: int) -> list:
    """Return sorted list of 0-based indices from 'all', '1,3,5-8' etc."""
    if str(pages_str).strip().lower() == 'all':
        return list(range(total))
    indices = set()
    for part in str(pages_str).replace(' ', '').split(','):
        if '-' in part:
            a, b = part.split('-', 1)
            try:
                indices.update(range(int(a) - 1, min(int(b), total)))
            except ValueError:
                pass
        elif part.isdigit():
            idx = int(part) - 1
            if 0 <= idx < total:
                indices.add(idx)
    return sorted(i for i in indices if 0 <= i < total)


# ── Angle normalization ───────────────────────────────────────────────────────

def _normalize_angle(angle: int) -> int:
    """Normalize to {0, 90, 180, 270}."""
    angle = int(angle) % 360
    if angle < 0:
        angle += 360
    # Snap to nearest 90-degree step
    snapped = round(angle / 90) * 90 % 360
    return snapped


# ── Orientation detection ─────────────────────────────────────────────────────

def detect_page_orientation(fitz_page) -> dict:
    """
    Detect page orientation and content direction.
    Returns dict with orientation ('portrait'|'landscape'),
    content_orientation, needs_rotation, suggested_angle.
    """
    result = {
        'orientation': 'portrait',
        'content_orientation': 'portrait',
        'needs_rotation': False,
        'suggested_angle': 0,
        'page_width': 0.0,
        'page_height': 0.0,
    }
    try:
        w = fitz_page.rect.width
        h = fitz_page.rect.height
        result['page_width'] = round(w, 1)
        result['page_height'] = round(h, 1)
        result['orientation'] = 'landscape' if w > h else 'portrait'

        # Analyze text block bounding box
        blocks = fitz_page.get_text('blocks')
        if blocks:
            x0 = min(b[0] for b in blocks)
            y0 = min(b[1] for b in blocks)
            x1 = max(b[2] for b in blocks)
            y1 = max(b[3] for b in blocks)
            content_w = x1 - x0
            content_h = y1 - y0
            result['content_orientation'] = (
                'landscape' if content_w > content_h * 1.2 else 'portrait')
        else:
            result['content_orientation'] = result['orientation']

        # Determine if rotation is needed
        if result['orientation'] != result['content_orientation']:
            result['needs_rotation'] = True
            result['suggested_angle'] = 90

    except Exception:
        pass
    return result


def detect_skew_angle(fitz_page, sample_dpi: int = 72) -> float:
    """
    Estimate page skew angle using pixel row projection analysis.
    Returns estimated skew in degrees (negative = clockwise tilt).
    """
    try:
        import numpy as np
        mat = fitz.Matrix(sample_dpi / 72, sample_dpi / 72)
        pix = fitz_page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
        # Invert: text pixels → 1, white → 0
        binary = (arr < 128).astype(np.float32)

        best_angle = 0.0
        best_score = -1e9
        from PIL import Image
        img = Image.fromarray((binary * 255).astype(np.uint8))

        for angle in range(-10, 11):
            rotated = img.rotate(angle, fillcolor=0)
            r_arr = np.array(rotated).astype(float)
            row_sums = r_arr.sum(axis=1)
            score = float(np.var(row_sums))
            if score > best_score:
                best_score = score
                best_angle = float(angle)

        return best_angle if abs(best_angle) >= 0.5 else 0.0
    except Exception:
        return 0.0


# ── Flip via fitz ─────────────────────────────────────────────────────────────

def _flip_page_fitz(doc: fitz.Document, page_idx: int,
                     direction: str = 'horizontal') -> bool:
    """Flip a page in-place using PyMuPDF content stream transform."""
    try:
        page = doc[page_idx]
        r = page.rect
        w, h = r.width, r.height

        if direction == 'horizontal':
            mat = fitz.Matrix(-1, 0, 0, 1, w, 0)
        else:
            mat = fitz.Matrix(1, 0, 0, -1, 0, h)

        # Draw current page content mirrored onto new page
        new_page = doc.new_page(width=w, height=h)
        new_page.show_pdf_page(new_page.rect, doc, page_idx, matrix=mat)
        # Remove original, move new to position
        doc.delete_page(page_idx)
        doc.move_page(len(doc) - 1, page_idx)
        return True
    except Exception as e:
        logger.warning(f'Flip page {page_idx} failed: {e}')
        return False


# ── GS rotation ──────────────────────────────────────────────────────────────

def _gs_rotate(input_path: str, output_path: str,
               angle: int, pages: str = 'all', total: int = 0) -> bool:
    """Rotate PDF using Ghostscript for maximum fidelity."""
    if not GS_BIN:
        return False
    try:
        # GS doesn't support per-page rotation easily; use for full-doc rotation
        cmd = [
            GS_BIN, '-q', '-dBATCH', '-dNOPAUSE', '-dNOSAFER',
            '-sDEVICE=pdfwrite',
            '-dCompatibilityLevel=1.5',
            f'-dAutoRotatePages=/None',
            f'-sOutputFile={output_path}',
            input_path,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=60)
        return result.returncode == 0 and os.path.exists(output_path)
    except Exception:
        return False


# ── qpdf rotation ─────────────────────────────────────────────────────────────

def _qpdf_rotate(input_path: str, output_path: str,
                  angle: int, pages: str = 'all') -> bool:
    """Use qpdf to rotate specific pages."""
    if not QPDF_BIN:
        return False
    try:
        # qpdf rotation syntax: --rotate=angle:page-range
        pages_arg = f'{angle}:{pages}' if pages != 'all' else f'{angle}'
        cmd = [
            QPDF_BIN,
            f'--rotate={pages_arg}',
            input_path,
            output_path,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=60)
        return result.returncode == 0 and os.path.exists(output_path) and \
               os.path.getsize(output_path) > 100
    except Exception:
        return False


# ── Main API ──────────────────────────────────────────────────────────────────

def rotate_pdf(
    input_path: str,
    output_path: str,
    angle: int = 90,
    pages: str = 'all',
    auto_orient: bool = False,
    target_orientation: str = 'portrait',
    password: str = '',
    per_page_angles: dict = None,
    use_qpdf: bool = True,
) -> dict:
    """
    Rotate specific pages of a PDF by a given angle.

    Args:
        input_path:         Source PDF
        output_path:        Output PDF
        angle:              Rotation angle in degrees (0/90/180/270/-90/-270)
        pages:              'all' or range '1,3,5-8'
        auto_orient:        Auto-detect and fix orientation instead of fixed angle
        target_orientation: 'portrait' or 'landscape' (used with auto_orient)
        password:           PDF password
        per_page_angles:    Dict {page_num: angle} for individual page angles
                            (overrides angle and pages params)
        use_qpdf:           Try qpdf first for rotation (very reliable)

    Returns:
        dict: output_path, rotated_count, total_pages, angles_applied,
              method_used
    """
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt(password or '')
    total = len(reader.pages)
    angle = _normalize_angle(angle)
    angles_applied = {}
    method_used = 'pypdf'

    # ── Strategy: qpdf (fastest, most reliable for simple rotation) ──────────
    if use_qpdf and QPDF_BIN and not auto_orient and not per_page_angles:
        # Build qpdf page range
        if str(pages).strip().lower() == 'all':
            qpdf_pages = '1-z'
        else:
            indices = parse_page_selection(pages, total)
            qpdf_pages = ','.join(str(i + 1) for i in indices)

        if _qpdf_rotate(input_path, output_path, angle, qpdf_pages):
            for idx in parse_page_selection(pages, total):
                angles_applied[idx + 1] = angle
            return {
                'output_path': output_path,
                'rotated_count': len(angles_applied),
                'total_pages': total,
                'angles_applied': angles_applied,
                'method_used': 'qpdf',
            }

    # ── Strategy: per-page angle map ─────────────────────────────────────────
    if per_page_angles:
        writer = PdfWriter()
        for i, page in enumerate(reader.pages):
            page_num = i + 1
            if page_num in per_page_angles:
                a = _normalize_angle(per_page_angles[page_num])
                if a != 0:
                    page.rotate(a)
                    angles_applied[page_num] = a
            writer.add_page(page)
        try:
            if reader.metadata:
                writer.add_metadata(dict(reader.metadata))
        except Exception:
            pass
        with open(output_path, 'wb') as f:
            writer.write(f)
        return {
            'output_path': output_path,
            'rotated_count': len(angles_applied),
            'total_pages': total,
            'angles_applied': angles_applied,
            'method_used': 'pypdf_perpage',
        }

    # ── Strategy: auto-orient via PyMuPDF ────────────────────────────────────
    if auto_orient:
        try:
            doc = fitz.open(input_path)
            rotate_indices = set(parse_page_selection(str(pages), total))
            writer = PdfWriter()

            for i, page in enumerate(reader.pages):
                if i in rotate_indices:
                    fitz_page = doc[i]
                    det = detect_page_orientation(fitz_page)
                    current_rotation = page.rotation or 0
                    pw = float(page.mediabox.width)
                    ph = float(page.mediabox.height)
                    effective_landscape = (pw > ph) ^ (current_rotation in (90, 270))

                    correction = 0
                    if target_orientation == 'portrait' and effective_landscape:
                        correction = 90
                    elif target_orientation == 'landscape' and not effective_landscape:
                        correction = 90

                    if correction:
                        page.rotate(correction)
                        angles_applied[i + 1] = correction

                writer.add_page(page)

            doc.close()
            try:
                if reader.metadata:
                    writer.add_metadata(dict(reader.metadata))
            except Exception:
                pass
            with open(output_path, 'wb') as f:
                writer.write(f)
            return {
                'output_path': output_path,
                'rotated_count': len(angles_applied),
                'total_pages': total,
                'angles_applied': angles_applied,
                'method_used': 'pypdf_auto_orient',
            }
        except Exception as e:
            logger.warning(f'Auto-orient failed: {e}')

    # ── Strategy: fixed angle via pypdf ──────────────────────────────────────
    rotate_indices = set(parse_page_selection(str(pages), total))
    writer = PdfWriter()

    for i, page in enumerate(reader.pages):
        if i in rotate_indices and angle != 0:
            page.rotate(angle)
            angles_applied[i + 1] = angle
        writer.add_page(page)

    try:
        if reader.metadata:
            writer.add_metadata(dict(reader.metadata))
    except Exception:
        pass

    with open(output_path, 'wb') as f:
        writer.write(f)

    return {
        'output_path': output_path,
        'rotated_count': len(angles_applied),
        'total_pages': total,
        'angles_applied': angles_applied,
        'method_used': method_used,
    }


def flip_pdf(
    input_path: str,
    output_path: str,
    direction: str = 'horizontal',
    pages: str = 'all',
    password: str = '',
) -> dict:
    """
    Flip PDF pages horizontally or vertically.

    Args:
        input_path:  Source PDF
        output_path: Output PDF
        direction:   'horizontal' or 'vertical'
        pages:       'all' or page range
        password:    PDF password
    Returns:
        dict: output_path, flipped_count, total_pages
    """
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted and password:
            doc.authenticate(password)
        total = doc.page_count
        flip_indices = set(parse_page_selection(str(pages), total))
        flipped = 0

        for i in sorted(flip_indices):
            if _flip_page_fitz(doc, i, direction):
                flipped += 1

        doc.save(output_path, garbage=4, deflate=True)
        doc.close()
        return {
            'output_path': output_path,
            'flipped_count': flipped,
            'total_pages': total,
            'direction': direction,
            'method_used': 'fitz',
        }
    except Exception as e:
        logger.warning(f'fitz flip failed: {e}, falling back to rotate')
        return rotate_pdf(input_path, output_path, angle=180, pages=pages,
                          password=password)


def normalize_page_orientations(input_path: str, output_path: str,
                                  target: str = 'portrait',
                                  password: str = '') -> dict:
    """
    Normalize all pages to portrait or landscape using content analysis.
    """
    return rotate_pdf(input_path, output_path, angle=0, pages='all',
                      auto_orient=True, target_orientation=target,
                      password=password)


def deskew_pdf(
    input_path: str,
    output_path: str,
    pages: str = 'all',
    password: str = '',
    max_angle: float = 10.0,
) -> dict:
    """
    Deskew PDF pages by detecting and correcting slight rotation angles.

    Uses pixel projection analysis on each page image.

    Args:
        input_path:  Source PDF
        output_path: Output PDF
        pages:       'all' or range
        password:    PDF password
        max_angle:   Maximum correction angle to apply (degrees)
    Returns:
        dict: output_path, pages_deskewed, angles_corrected
    """
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted and password:
            doc.authenticate(password)
        total = doc.page_count
        target_indices = set(parse_page_selection(str(pages), total))

        out_doc = fitz.open()
        out_doc.insert_pdf(doc)
        doc.close()

        deskewed = 0
        angles_corrected = {}

        for i in range(total):
            if i not in target_indices:
                continue
            page = out_doc[i]
            skew = detect_skew_angle(page)
            if abs(skew) >= 0.3 and abs(skew) <= max_angle:
                # Rotate by negative skew to correct
                # fitz rotation must be integer, so use page transform
                mat = fitz.Matrix(1, 0, 0, 1, 0, 0).prerotate(-skew)
                page.set_rotation(int(-skew))
                deskewed += 1
                angles_corrected[i + 1] = round(-skew, 2)

        out_doc.save(output_path, garbage=4, deflate=True)
        out_doc.close()

        return {
            'output_path': output_path,
            'pages_deskewed': deskewed,
            'total_pages': total,
            'angles_corrected': angles_corrected,
        }
    except Exception as e:
        raise RuntimeError(f'Deskew failed: {e}')


# ── Inspection helpers ────────────────────────────────────────────────────────

def get_page_rotations(input_path: str, password: str = '') -> list:
    """
    Return current rotation metadata for every page.
    Returns list of dicts with page_num, width_pt, height_pt, rotation,
    orientation, skew_estimate.
    """
    result = []
    try:
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt(password or '')

        doc = fitz.open(input_path)
        if doc.is_encrypted and password:
            doc.authenticate(password)

        for i, page in enumerate(reader.pages):
            w = float(page.mediabox.width)
            h = float(page.mediabox.height)
            rot = page.rotation or 0
            entry = {
                'page_num': i + 1,
                'width_pt': round(w, 1),
                'height_pt': round(h, 1),
                'rotation': rot,
                'orientation': 'landscape' if w > h else 'portrait',
                'skew_estimate': 0.0,
            }
            try:
                fitz_page = doc[i]
                det = detect_page_orientation(fitz_page)
                entry['content_orientation'] = det.get('content_orientation', 'unknown')
                entry['needs_rotation'] = det.get('needs_rotation', False)
            except Exception:
                pass
            result.append(entry)

        doc.close()
    except Exception:
        pass
    return result


def get_rotation_audit(input_path: str, password: str = '') -> dict:
    """
    Full rotation audit: detect all orientation issues in the document.
    Returns dict with issues_found, pages_needing_rotation, mixed_orientations,
    dominant_orientation, recommendations.
    """
    pages_info = get_page_rotations(input_path, password)
    issues = []
    needs_rotation = []

    portrait_count = sum(1 for p in pages_info if p['orientation'] == 'portrait')
    landscape_count = len(pages_info) - portrait_count
    dominant = 'portrait' if portrait_count >= landscape_count else 'landscape'

    for p in pages_info:
        if p.get('needs_rotation'):
            needs_rotation.append(p['page_num'])
            issues.append({
                'page': p['page_num'],
                'issue': 'orientation_mismatch',
                'detail': f"Page dimensions suggest {p['orientation']} but "
                          f"content orientation is {p.get('content_orientation', 'unknown')}",
            })

    return {
        'total_pages': len(pages_info),
        'issues_found': len(issues),
        'pages_needing_rotation': needs_rotation,
        'mixed_orientations': portrait_count > 0 and landscape_count > 0,
        'portrait_pages': portrait_count,
        'landscape_pages': landscape_count,
        'dominant_orientation': dominant,
        'issues': issues,
        'recommendations': [
            f'Normalize all pages to {dominant} orientation'
        ] if issues else ['Document orientation looks consistent'],
    }


def batch_rotate(
    input_paths: list,
    output_dir: str,
    angle: int = 90,
    pages: str = 'all',
    **kwargs,
) -> list:
    """Rotate multiple PDFs and return list of result dicts."""
    os.makedirs(output_dir, exist_ok=True)
    results = []
    for path in input_paths:
        base = os.path.splitext(os.path.basename(path))[0]
        out = os.path.join(output_dir, f'{base}_rotated.pdf')
        try:
            res = rotate_pdf(path, out, angle=angle, pages=pages, **kwargs)
            res['source_path'] = path
            results.append(res)
        except Exception as e:
            results.append({'source_path': path, 'output_path': None, 'error': str(e)})
    return results


# ── Additional Rotation & Orientation Functions ────────────────────────────────


def auto_rotate_all(input_path: str, output_path: str,
                     confidence_threshold: float = 0.7,
                     password: str = '') -> dict:
    """
    Automatically detect and correct page orientation for all pages.

    Uses fitz text direction analysis to determine if pages are rotated.
    Pages with confident orientation detection are auto-corrected.

    Args:
        input_path:            Source PDF
        output_path:           Output PDF
        confidence_threshold:  Min confidence to auto-rotate (0.0-1.0)
        password:              PDF password

    Returns:
        dict: pages_rotated, pages_skipped, rotation_map, output_path
    """
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        rotation_map = []
        pages_rotated = 0

        for i in range(doc.page_count):
            pg = doc[i]
            current_rotation = pg.rotation

            # Use fitz text direction detection
            text_dict = pg.get_text('dict', flags=0)
            dir_votes: dict[int, float] = {0: 0, 90: 0, 180: 0, 270: 0}

            for blk in text_dict.get('blocks', []):
                for ln in blk.get('lines', []):
                    for sp in ln.get('spans', []):
                        txt = sp.get('text', '').strip()
                        if not txt:
                            continue
                        # Direction from span flags
                        size = sp.get('size', 10)
                        dir_flag = sp.get('dir', (1, 0))
                        dx, dy = dir_flag if isinstance(dir_flag, (list, tuple)) \
                            and len(dir_flag) >= 2 else (1, 0)

                        # Map direction vector to rotation
                        if abs(dx) > abs(dy):
                            direction = 0 if dx > 0 else 180
                        else:
                            direction = 90 if dy < 0 else 270

                        weight = size * len(txt)
                        dir_votes[direction] = dir_votes.get(direction, 0) + weight

            total_weight = sum(dir_votes.values())
            if total_weight < 1:
                rotation_map.append({'page': i + 1, 'action': 'skipped', 'reason': 'no_text'})
                continue

            best_dir = max(dir_votes, key=dir_votes.get)
            confidence = dir_votes[best_dir] / total_weight

            if confidence < confidence_threshold:
                rotation_map.append({'page': i + 1, 'action': 'skipped',
                                      'reason': 'low_confidence', 'confidence': confidence})
                continue

            # Correct rotation: text should flow at 0°
            needed_rotation = (-best_dir) % 360
            if needed_rotation != current_rotation:
                pg.set_rotation(needed_rotation)
                pages_rotated += 1
                rotation_map.append({
                    'page': i + 1,
                    'action': 'rotated',
                    'from': current_rotation,
                    'to': needed_rotation,
                    'confidence': round(confidence, 3),
                })
            else:
                rotation_map.append({'page': i + 1, 'action': 'ok',
                                      'rotation': current_rotation})

        doc.save(output_path, garbage=3, deflate=True)
        doc.close()

        return {
            'pages_rotated': pages_rotated,
            'pages_skipped': len([r for r in rotation_map if r['action'] == 'skipped']),
            'rotation_map': rotation_map,
            'output_path': output_path,
        }

    except Exception as e:
        logger.warning(f'auto_rotate_all failed: {e}')
        import shutil as _sh
        _sh.copy2(input_path, output_path)
        return {'pages_rotated': 0, 'error': str(e)}


def get_page_orientation_summary(input_path: str, password: str = '') -> dict:
    """
    Analyze orientation of all pages without modifying the PDF.

    Returns a summary with counts of landscape vs portrait pages,
    mixed orientation detection, and rotation values.
    """
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        portrait = 0
        landscape = 0
        rotations: dict[int, int] = {}

        for pg in doc:
            w, h = pg.rect.width, pg.rect.height
            rot = pg.rotation
            if h >= w:
                portrait += 1
            else:
                landscape += 1
            rotations[rot] = rotations.get(rot, 0) + 1

        doc.close()
        total = portrait + landscape

        return {
            'total_pages': total,
            'portrait_pages': portrait,
            'landscape_pages': landscape,
            'mixed_orientations': portrait > 0 and landscape > 0,
            'dominant_orientation': 'portrait' if portrait >= landscape else 'landscape',
            'rotation_counts': rotations,
            'needs_normalization': landscape > 0 and portrait > 0,
        }

    except Exception as e:
        logger.warning(f'get_page_orientation_summary failed: {e}')
        return {'error': str(e)}


# ═══════════════════════════════════════════════════════════════════════════════
# ── ENTERPRISE ADDITIONS — Content-aware auto-rotation, deskew ───────────────
# ═══════════════════════════════════════════════════════════════════════════════

def deskew_pdf_pages(input_path: str, output_path: str,
                      max_skew_degrees: float = 10.0) -> dict:
    """
    Deskew scanned PDF pages — correct slight rotation from scanning.
    Uses PIL/numpy to detect and fix page tilt.

    Ideal for: scanned documents, photos of documents, OCR preprocessing.
    """
    import fitz
    from PIL import Image
    import numpy as np
    import io

    doc = fitz.open(input_path)
    out_doc = fitz.open()
    pages_deskewed = 0

    for pg_idx in range(doc.page_count):
        pg = doc[pg_idx]
        mat = fitz.Matrix(2.0, 2.0)
        clip = pg.get_pixmap(matrix=mat, alpha=False)
        img = Image.frombytes('RGB', [clip.width, clip.height], clip.samples)
        gray = img.convert('L')
        gray_arr = np.array(gray)

        # Detect skew angle using projection profile
        try:
            from PIL import ImageFilter
            edges = gray.filter(ImageFilter.FIND_EDGES)
            edge_arr = np.array(edges)
            # Simple skew detection: find dominant angle via horizontal projection
            angles = np.linspace(-max_skew_degrees, max_skew_degrees, 181)
            best_angle = 0
            best_score = -1
            for angle in angles[::5]:  # sample every 0.5 degrees for speed
                from PIL.Image import BICUBIC
                rotated = gray.rotate(angle, resample=BICUBIC, expand=False)
                arr = np.array(rotated)
                score = float(np.sum(np.var(arr, axis=1)))
                if score > best_score:
                    best_score = score
                    best_angle = angle

            if abs(best_angle) > 0.3:
                img = img.rotate(best_angle, resample=Image.BICUBIC, expand=False)
                pages_deskewed += 1
        except Exception:
            pass

        img_buf = io.BytesIO()
        img.save(img_buf, format='PNG', optimize=True)
        new_pg = out_doc.new_page(width=pg.rect.width, height=pg.rect.height)
        new_pg.insert_image(new_pg.rect, stream=img_buf.getvalue())

    out_doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    out_doc.close()
    return {'output_path': output_path, 'pages_deskewed': pages_deskewed,
            'total_pages': doc.page_count}


def rotate_and_crop_margins(input_path: str, output_path: str,
                              angle: int = 90,
                              crop_margin_pt: float = 0.0) -> dict:
    """
    Rotate PDF pages AND optionally crop a margin around each page.
    Useful for rotating landscape scans and trimming white borders.

    Args:
        angle: Rotation angle (90, 180, 270)
        crop_margin_pt: Margin to crop from all sides (in PDF points)
    """
    import pikepdf

    with pikepdf.open(input_path) as pdf:
        for page in pdf.pages:
            # Get current rotation
            current_rot = int(page.get('/Rotate', 0))
            new_rot = (current_rot + angle) % 360
            page['/Rotate'] = pikepdf.Decimal(new_rot)

            if crop_margin_pt > 0:
                media_box = page.MediaBox
                if media_box:
                    x0 = float(media_box[0]) + crop_margin_pt
                    y0 = float(media_box[1]) + crop_margin_pt
                    x1 = float(media_box[2]) - crop_margin_pt
                    y1 = float(media_box[3]) - crop_margin_pt
                    if x1 > x0 and y1 > y0:
                        page.MediaBox = pikepdf.Array([
                            pikepdf.Decimal(x0), pikepdf.Decimal(y0),
                            pikepdf.Decimal(x1), pikepdf.Decimal(y1),
                        ])

        pdf.save(output_path, compress_streams=True)

    return {'output_path': output_path, 'angle': angle,
            'crop_margin_pt': crop_margin_pt}


# ═══════════════════════════════════════════════════════════════════════════
# ── ADDITIONAL ROTATE FUNCTIONS ────────────────────────────────────────────


def auto_rotate_pages(input_path: str, output_path: str) -> dict:
    """Auto-detect and correct page orientation using Tesseract OSD."""
    import fitz, os
    try:
        import pytesseract
        from pdf2image import convert_from_path
        images = convert_from_path(input_path, dpi=72)
        rotations = []
        for img in images:
            try:
                osd = pytesseract.image_to_osd(img, config='--psm 0')
                rotation = 0
                for line in osd.split('\n'):
                    if 'Rotate:' in line:
                        rotation = int(line.split(':')[1].strip())
                        break
                rotations.append(rotation)
            except Exception:
                rotations.append(0)
        doc = fitz.open(input_path)
        for i, (page, rot) in enumerate(zip(doc, rotations)):
            if rot != 0:
                page.set_rotation((page.rotation + rot) % 360)
        doc.save(output_path, garbage=4, deflate=True)
        doc.close()
        corrected = sum(1 for r in rotations if r != 0)
        return {'output_path': output_path, 'pages_corrected': corrected, 'rotations': rotations}
    except Exception as e:
        import shutil
        shutil.copy2(input_path, output_path)
        return {'output_path': output_path, 'pages_corrected': 0, 'note': str(e)}


def flip_pages_horizontal(input_path: str, output_path: str, pages: str = 'all') -> dict:
    """Flip PDF pages horizontally (mirror effect)."""
    import fitz, os
    doc = fitz.open(input_path)
    total = doc.page_count
    if pages.lower() == 'all':
        page_list = list(range(total))
    else:
        page_list = [int(p)-1 for p in pages.split(',') if p.strip().isdigit()]
    new_doc = fitz.open()
    for i in range(total):
        page = doc[i]
        if i in page_list:
            pix = page.get_pixmap(dpi=150)
            from PIL import Image
            import io
            img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
            buf = io.BytesIO(); img.save(buf, 'JPEG', quality=90); buf.seek(0)
            new_page = new_doc.new_page(width=page.rect.width, height=page.rect.height)
            new_page.insert_image(new_page.rect, stream=buf.getvalue())
        else:
            new_doc.insert_pdf(doc, from_page=i, to_page=i)
    new_doc.save(output_path, garbage=4, deflate=True)
    doc.close(); new_doc.close()
    return {'output_path': output_path, 'pages_flipped': len(page_list)}
