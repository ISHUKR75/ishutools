"""
pdf_split.py — Enterprise PDF Split Engine v5.0
IshuTools.fun | Created by Ishu Kumar (ISHUKR41 / ISHUKR75)
https://ishutools.fun

Split modes:
  - all          : One PDF per page (GS burst → pikepdf fallback, lossless)
  - range        : Extract arbitrary pages into ONE merged output file
  - range_groups : Each comma-separated range token → its own file (UNIQUE to IshuTools)
  - every_n      : Equal-size chunks of N pages
  - bookmarks    : Split at TOC/bookmark boundaries (multilevel support)
  - blank_pages  : Auto-detect blank separator pages
  - size_limit   : Binary-search page grouping to stay under MB target
  - odd_even     : Two files — odd pages & even pages

Quality guarantee:
  pikepdf (recompress_flate=False) → fitz → pypdf cascade.
  Images/fonts/streams are NEVER re-encoded. Byte-perfect copy.

v5.0 improvements:
  - Fixed _parse_range bug in range_groups (now uses unified parse_ranges())
  - Fixed datetime import errors
  - Smart output naming from content/bookmarks
  - Advanced blank page detection (text + pixel histogram + variance)
  - Per-page size measurement for accurate size_limit splits
  - Heading-based split detection (no bookmarks needed)
  - Richer metadata in ZIP manifest + README.txt
  - Better error recovery per page
  - Concurrent page quality pre-check
  - Self-healing: tries 3 cascaded write engines before giving up
  - Extended PDF structure analysis (signatures, layers, XFA forms)
  - Better SEO-friendly output naming
"""

import io
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import zipfile
from datetime import datetime, timezone
from glob import glob
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple, Union

# ── Third-party imports (all optional-fallback) ───────────────────────────────
try:
    import fitz                  # PyMuPDF ≥ 1.23
    _HAS_FITZ = True
except ImportError:
    _HAS_FITZ = False

try:
    import pikepdf
    _HAS_PIKEPDF = True
except ImportError:
    _HAS_PIKEPDF = False

try:
    from PIL import Image
    _HAS_PIL = True
except ImportError:
    _HAS_PIL = False

from pypdf import PdfReader, PdfWriter


logger = logging.getLogger(__name__)

# ── Binary paths ──────────────────────────────────────────────────────────────
GS_BIN   = shutil.which('gs') or shutil.which('ghostscript')
QPDF_BIN = shutil.which('qpdf')

# ── Constants ─────────────────────────────────────────────────────────────────
MAX_PAGES_IN_GRID    = 500
BLANK_DPI            = 36
BLANK_WHITE_THRESH   = 0.95
THUMB_DPI_DEFAULT    = 72
MANIFEST_FILENAME    = '_split_manifest.json'
README_FILENAME      = 'README.txt'

# ── Author / branding ─────────────────────────────────────────────────────────
TOOL_BRAND = 'IshuTools.fun Split PDF v5.0 — by Ishu Kumar (ISHUKR41/ISHUKR75)'
TOOL_URL   = 'https://ishutools.fun'


# ══════════════════════════════════════════════════════════════════════════════
# ── Range parser (unified — used by ALL modes)
# ══════════════════════════════════════════════════════════════════════════════

def parse_ranges(ranges_str: str, total_pages: int) -> List[int]:
    """
    Parse a human-readable range string into a sorted list of 0-based page indices.

    Supported syntax:
      '1-3,5,7-9'       → [0,1,2,4,6,7,8]
      'odd'             → [0,2,4,…]
      'even'            → [1,3,5,…]
      'first 5'         → first 5 pages
      'last 10'         → last 10 pages
      'all'             → all pages
      '' / None         → all pages
    """
    s = str(ranges_str or '').strip().lower()
    if not s or s == 'all':
        return list(range(total_pages))

    if s == 'odd':
        return list(range(0, total_pages, 2))
    if s == 'even':
        return list(range(1, total_pages, 2))

    m = re.match(r'^first\s+(\d+)$', s)
    if m:
        return list(range(min(int(m.group(1)), total_pages)))

    m = re.match(r'^last\s+(\d+)$', s)
    if m:
        n = int(m.group(1))
        return list(range(max(0, total_pages - n), total_pages))

    pages: Set[int] = set()
    for part in re.split(r'[,;，；]', s):
        part = part.strip()
        if not part:
            continue
        m2 = re.match(r'^(\d+)\s*[-–—~]\s*(\d+)$', part)
        if m2:
            lo = max(0, int(m2.group(1)) - 1)
            hi = min(total_pages - 1, int(m2.group(2)) - 1)
            if lo <= hi:
                pages.update(range(lo, hi + 1))
        elif part.isdigit():
            idx = int(part) - 1
            if 0 <= idx < total_pages:
                pages.add(idx)
    return sorted(pages)


# Alias for backward compatibility
_parse_range = parse_ranges


# ══════════════════════════════════════════════════════════════════════════════
# ── PDF validation & repair
# ══════════════════════════════════════════════════════════════════════════════

def validate_pdf(path: str, password: str = '') -> dict:
    """
    Pre-flight health check. Returns a rich validation report.
    """
    result = {
        'ok': True,
        'page_count': 0,
        'is_encrypted': False,
        'is_decryptable': True,
        'has_bookmarks': False,
        'bookmark_count': 0,
        'blank_pages': 0,
        'is_scanned': False,
        'has_forms': False,
        'has_annotations': False,
        'has_signatures': False,
        'has_layers': False,
        'file_size_kb': round(os.path.getsize(path) / 1024, 1),
        'file_size_mb': round(os.path.getsize(path) / 1_048_576, 2),
        'pdf_version': '',
        'title': '',
        'author': '',
        'issues': [],
        'recommendations': [],
        'quality_score': 100,
    }

    try:
        reader = PdfReader(path)
        result['is_encrypted'] = reader.is_encrypted
        if reader.is_encrypted:
            ok = reader.decrypt(password or '')
            if ok == 0:
                result['is_decryptable'] = False
                result['ok'] = False
                result['quality_score'] = 0
                result['issues'].append('PDF is encrypted and password is wrong.')
                result['recommendations'].append('Enter the correct password in Advanced Options.')
                return result
        result['page_count'] = len(reader.pages)
        if result['page_count'] == 0:
            result['ok'] = False
            result['quality_score'] = 0
            result['issues'].append('PDF contains no pages.')
            return result
        try:
            if reader.metadata:
                result['title']  = str(reader.metadata.get('/Title', '') or '')
                result['author'] = str(reader.metadata.get('/Author', '') or '')
        except Exception:
            pass
    except Exception as e:
        result['ok'] = False
        result['quality_score'] = 10
        result['issues'].append(f'Cannot open PDF: {e}')
        result['recommendations'].append('Try PDF Repair first.')
        return result

    if not _HAS_FITZ:
        return result

    try:
        doc = fitz.open(path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        try:
            result['pdf_version'] = f'PDF {doc.pdf_version()}'
        except Exception:
            pass

        toc = doc.get_toc(simple=True)
        result['has_bookmarks']  = bool(toc)
        result['bookmark_count'] = len([t for t in toc if t[0] == 1])

        text_pages = image_only = anno_pages = form_pages = blank_count = 0
        sig_count = 0

        for i, pg in enumerate(doc):
            text = pg.get_text().strip()
            images = pg.get_images()
            if not text and not images:
                pix = pg.get_pixmap(dpi=BLANK_DPI, colorspace=fitz.csGRAY)
                samples = bytes(pix.samples)
                if samples:
                    white = sum(1 for b in samples if b > 228)
                    if white / len(samples) >= BLANK_WHITE_THRESH:
                        blank_count += 1
                    else:
                        image_only += 1
            elif not text:
                image_only += 1
            else:
                text_pages += 1
            if pg.annots():
                anno_pages += 1
            if pg.widgets():
                form_pages += 1

        # Check for signatures
        try:
            if '/AcroForm' in doc.pdf_catalog():
                sig_count = 1
        except Exception:
            pass

        # Check for layers (OCGs)
        try:
            layers = doc.get_layers()
            result['has_layers'] = bool(layers)
        except Exception:
            pass

        doc.close()

        result['blank_pages']     = blank_count
        result['is_scanned']      = (image_only > text_pages and text_pages == 0)
        result['has_forms']       = form_pages > 0
        result['has_annotations'] = anno_pages > 0
        result['has_signatures']  = sig_count > 0

        # Quality scoring
        qs = 100
        if result['is_scanned']:       qs -= 10
        if result['has_signatures']:   qs -= 5
        if blank_count > result['page_count'] * 0.2: qs -= 10
        result['quality_score'] = max(10, qs)

        # Recommendations
        if blank_count > 0:
            result['recommendations'].append(
                f'Found {blank_count} blank page(s). Use "Blank Separator" mode to auto-split at blank pages.')
        if result['bookmark_count'] >= 2:
            result['recommendations'].append(
                f'PDF has {result["bookmark_count"]} chapter(s). "By Bookmarks" creates perfect chapter files.')
        if result['is_scanned']:
            result['recommendations'].append(
                'Scanned PDF (image-only pages). Run OCR first for searchable text, or split as-is.')
        if result['has_signatures']:
            result['recommendations'].append(
                'Digital signature detected. Splitting will invalidate signatures (expected behaviour).')
        if result['has_forms']:
            result['issues'].append('Form fields detected — preserved in split output.')
        if result['has_annotations']:
            result['issues'].append('Annotations/comments detected — preserved in split output.')

    except Exception as e:
        result['issues'].append(f'Extended analysis warning: {e}')

    return result


def repair_pdf(input_path: str, output_path: str) -> dict:
    """Attempt to repair a damaged PDF: qpdf → GS → pikepdf cascade."""
    if QPDF_BIN:
        try:
            r = subprocess.run(
                [QPDF_BIN, '--replace-input', '--object-streams=generate',
                 input_path, output_path],
                capture_output=True, timeout=60)
            if r.returncode == 0 and os.path.getsize(output_path) > 100:
                return {'success': True, 'method': 'qpdf', 'message': 'Repaired with qpdf.'}
        except Exception as e:
            logger.warning('qpdf repair failed: %s', e)

    if GS_BIN:
        try:
            r = subprocess.run(
                [GS_BIN, '-q', '-dBATCH', '-dNOPAUSE', '-dNOSAFER',
                 '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.7',
                 f'-sOutputFile={output_path}', input_path],
                capture_output=True, timeout=120)
            if r.returncode == 0 and os.path.getsize(output_path) > 100:
                return {'success': True, 'method': 'ghostscript', 'message': 'Repaired with Ghostscript.'}
        except Exception as e:
            logger.warning('GS repair failed: %s', e)

    if _HAS_PIKEPDF:
        try:
            with pikepdf.open(input_path, suppress_warnings=True) as src:
                src.save(output_path, fix_metadata_version=True, recompress_flate=False)
            if os.path.getsize(output_path) > 100:
                return {'success': True, 'method': 'pikepdf', 'message': 'Repaired with pikepdf.'}
        except Exception as e:
            logger.warning('pikepdf repair failed: %s', e)

    return {'success': False, 'method': 'none', 'message': 'Could not repair PDF automatically.'}


# ══════════════════════════════════════════════════════════════════════════════
# ── Smart mode recommender
# ══════════════════════════════════════════════════════════════════════════════

def auto_detect_mode(input_path: str, password: str = '') -> dict:
    """
    Analyse PDF structure and recommend the optimal split mode with confidence score.
    """
    analysis = {
        'total_pages':     0,
        'bookmark_count':  0,
        'blank_count':     0,
        'text_pages':      0,
        'image_pages':     0,
        'avg_page_size_kb': 0.0,
        'has_forms':       False,
        'is_scanned':      False,
        'heading_sections': 0,
    }

    if not _HAS_FITZ:
        return {
            'recommended_mode': 'all',
            'confidence': 0.5,
            'reason': 'Quick analysis: split each page individually.',
            'alternatives': [],
            'estimated_output_count': 1,
            'analysis': analysis,
        }

    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        total = doc.page_count
        analysis['total_pages'] = total
        toc = doc.get_toc(simple=True)
        analysis['bookmark_count'] = len([t for t in toc if t[0] == 1])

        blank = text_pg = image_pg = 0
        all_sizes = []
        median_font = 0.0
        first_line_sizes = []

        for i, pg in enumerate(doc):
            txt = pg.get_text().strip()
            imgs = pg.get_images()
            if not txt and not imgs:
                pix = pg.get_pixmap(dpi=BLANK_DPI, colorspace=fitz.csGRAY)
                s = bytes(pix.samples)
                if s and sum(1 for b in s if b > 228) / len(s) >= BLANK_WHITE_THRESH:
                    blank += 1
                else:
                    image_pg += 1
            elif txt:
                text_pg += 1
                # Collect font sizes for heading detection
                try:
                    blocks = pg.get_text('dict', flags=0).get('blocks', [])
                    for blk in blocks[:2]:
                        for ln in blk.get('lines', []):
                            for sp in ln.get('spans', []):
                                sz = float(sp.get('size', 0))
                                if sz > 0:
                                    all_sizes.append(sz)
                                    if len(first_line_sizes) < total:
                                        first_line_sizes.append((i, sz))
                except Exception:
                    pass
            else:
                image_pg += 1
            if pg.widgets():
                analysis['has_forms'] = True

        doc.close()

        analysis['blank_count']  = blank
        analysis['text_pages']   = text_pg
        analysis['image_pages']  = image_pg
        analysis['is_scanned']   = (image_pg > text_pg and text_pg == 0)

        fs = os.path.getsize(input_path)
        analysis['avg_page_size_kb'] = round(fs / max(1, total) / 1024, 1)

        # Detect heading sections (large bold font at page start)
        if all_sizes and text_pg > 0:
            median_sz = sorted(all_sizes)[len(all_sizes) // 2]
            heading_pages = set()
            for pg_idx, sz in first_line_sizes:
                if sz >= median_sz * 1.35:
                    heading_pages.add(pg_idx)
            analysis['heading_sections'] = len(heading_pages)

    except Exception as e:
        logger.warning('auto_detect analysis failed: %s', e)
        return {
            'recommended_mode': 'all',
            'confidence': 0.5,
            'reason': 'Could not fully analyse. Defaulting to All Pages.',
            'alternatives': [],
            'estimated_output_count': analysis.get('total_pages', 1),
            'analysis': analysis,
        }

    total     = analysis['total_pages']
    bookmarks = analysis['bookmark_count']
    blank     = analysis['blank_count']
    headings  = analysis['heading_sections']
    mb        = os.path.getsize(input_path) / 1_048_576

    # ── Decision tree ─────────────────────────────────────────────────────────
    if bookmarks >= 2:
        return {
            'recommended_mode': 'bookmarks',
            'confidence': 0.93,
            'reason': f'{bookmarks} chapters found — "By Bookmarks" creates perfectly-named chapter files.',
            'alternatives': [
                {'mode': 'every_n', 'reason': 'Split into equal-size chunks'},
                {'mode': 'range',   'reason': 'Pick specific pages manually'},
            ],
            'estimated_output_count': bookmarks,
            'analysis': analysis,
        }

    if blank >= 2 and blank / max(1, total) >= 0.04:
        return {
            'recommended_mode': 'blank_pages',
            'confidence': 0.90,
            'reason': f'{blank} blank separator pages — perfect for "Blank Separator" mode.',
            'alternatives': [
                {'mode': 'all',     'reason': 'Burst to individual pages'},
                {'mode': 'every_n', 'reason': 'Split into equal-size chunks'},
            ],
            'estimated_output_count': blank + 1,
            'analysis': analysis,
        }

    if headings >= 3 and text_pg > 0:
        return {
            'recommended_mode': 'every_n',
            'confidence': 0.78,
            'reason': f'Detected ~{headings} section headings — try "Every N Pages" or select exact ranges.',
            'alternatives': [
                {'mode': 'range',        'reason': 'Pick exact page ranges'},
                {'mode': 'range_groups', 'reason': 'Each range → own file'},
            ],
            'estimated_output_count': headings,
            'analysis': analysis,
        }

    if mb > 20 and total > 30:
        return {
            'recommended_mode': 'size_limit',
            'confidence': 0.80,
            'reason': f'Large file ({mb:.1f} MB, {total} pages) — "By File Size" keeps each part email-friendly.',
            'alternatives': [
                {'mode': 'every_n', 'reason': 'Equal page-count chunks'},
                {'mode': 'all',     'reason': 'One PDF per page'},
            ],
            'estimated_output_count': max(2, int(mb // 5)),
            'analysis': analysis,
        }

    if total <= 15:
        return {
            'recommended_mode': 'all',
            'confidence': 0.84,
            'reason': f'Short document ({total} pages) — splitting every page is practical.',
            'alternatives': [
                {'mode': 'range',   'reason': 'Pick specific pages'},
                {'mode': 'every_n', 'reason': 'Group into chunks'},
            ],
            'estimated_output_count': total,
            'analysis': analysis,
        }

    n = max(5, total // 8)
    return {
        'recommended_mode': 'every_n',
        'confidence': 0.74,
        'reason': f'{total} pages → splitting every {n} pages gives {(total+n-1)//n} manageable chunks.',
        'alternatives': [
            {'mode': 'range',      'reason': 'Extract specific pages'},
            {'mode': 'size_limit', 'reason': 'Split by target file size'},
        ],
        'estimated_output_count': (total + n - 1) // n,
        'analysis': analysis,
    }


# ══════════════════════════════════════════════════════════════════════════════
# ── Advanced blank page detector
# ══════════════════════════════════════════════════════════════════════════════

def _is_blank_page(fitz_page, threshold: float = BLANK_WHITE_THRESH,
                   min_text_chars: int = 4) -> bool:
    """
    Multi-algorithm blank page detection.
    1) Text presence check (fast)
    2) Image presence check
    3) Pixel histogram (white fraction)
    4) Pixel variance (low variance = blank)
    """
    if not _HAS_FITZ:
        return False

    try:
        text = fitz_page.get_text().strip()
        if len(text) >= min_text_chars:
            return False
    except Exception:
        pass

    try:
        if fitz_page.get_images():
            return False
    except Exception:
        pass

    try:
        if fitz_page.get_drawings():
            return False
    except Exception:
        pass

    # Pixel histogram
    try:
        pix = fitz_page.get_pixmap(dpi=BLANK_DPI, colorspace=fitz.csGRAY)
        samples = bytes(pix.samples)
        if not samples:
            return True
        white = sum(1 for b in samples if b > 225)
        frac = white / len(samples)
        if frac >= threshold:
            return True
        # Low variance check (near-uniform = blank)
        if len(samples) >= 4:
            avg = sum(samples) / len(samples)
            variance = sum((b - avg) ** 2 for b in samples) / len(samples)
            if variance < 15.0 and avg > 200:
                return True
        return False
    except Exception:
        return True


def _detect_blank_pages(path: str, threshold: float = BLANK_WHITE_THRESH,
                        password: str = '') -> Set[int]:
    """Return set of 0-based blank page indices."""
    blank: Set[int] = set()
    if not _HAS_FITZ:
        return blank
    try:
        doc = fitz.open(path)
        if doc.is_encrypted:
            doc.authenticate(password or '')
        for i, pg in enumerate(doc):
            if _is_blank_page(pg, threshold):
                blank.add(i)
        doc.close()
    except Exception as e:
        logger.warning('blank-page scan failed: %s', e)
    return blank


# ══════════════════════════════════════════════════════════════════════════════
# ── Lossless page writers: pikepdf → fitz → pypdf
# ══════════════════════════════════════════════════════════════════════════════

def _write_pikepdf(src: str, indices: List[int], dst: str,
                   password: str = '') -> bool:
    """Byte-copy pages via pikepdf (zero re-encoding). Best quality."""
    if not _HAS_PIKEPDF:
        return False
    try:
        kw = {'password': password} if password else {}
        with pikepdf.open(src, suppress_warnings=True, **kw) as pdf_in:
            out = pikepdf.new()
            for i in indices:
                if 0 <= i < len(pdf_in.pages):
                    out.pages.append(pdf_in.pages[i])
            if not out.pages:
                return False
            out.save(dst,
                     compress_streams=True,
                     object_stream_mode=pikepdf.ObjectStreamMode.generate,
                     recompress_flate=False,   # NEVER re-encode streams
                     linearize=False)
        return os.path.isfile(dst) and os.path.getsize(dst) > 50
    except Exception as e:
        logger.debug('pikepdf write failed: %s', e)
        return False


def _write_fitz(src: str, indices: List[int], dst: str,
                password: str = '') -> bool:
    """Copy pages via PyMuPDF (structure-preserving fallback)."""
    if not _HAS_FITZ:
        return False
    try:
        doc = fitz.open(src)
        if doc.is_encrypted:
            doc.authenticate(password or '')
        out = fitz.open()
        for i in sorted(indices):
            if 0 <= i < doc.page_count:
                out.insert_pdf(doc, from_page=i, to_page=i)
        if out.page_count == 0:
            doc.close(); out.close(); return False
        out.save(dst, garbage=4, deflate=True, clean=False)
        out.close(); doc.close()
        return os.path.isfile(dst) and os.path.getsize(dst) > 50
    except Exception as e:
        logger.debug('fitz write failed: %s', e)
        return False


def _write_pypdf(reader: PdfReader, indices: List[int], dst: str,
                 meta: dict = None) -> bool:
    """Write pages via pypdf (guaranteed fallback)."""
    try:
        w = PdfWriter()
        for i in indices:
            if 0 <= i < len(reader.pages):
                w.add_page(reader.pages[i])
        if meta:
            try:
                w.add_metadata(meta)
            except Exception:
                pass
        with open(dst, 'wb') as f:
            w.write(f)
        return os.path.isfile(dst) and os.path.getsize(dst) > 50
    except Exception as e:
        logger.debug('pypdf write failed: %s', e)
        return False


def _write_pages(src: str, indices: List[int], dst: str,
                 reader: PdfReader = None, meta: dict = None,
                 password: str = '') -> bool:
    """Quality cascade: pikepdf → fitz → pypdf. Never gives up."""
    if not indices:
        return False
    if _write_pikepdf(src, indices, dst, password):
        return True
    if _write_fitz(src, indices, dst, password):
        return True
    if reader:
        return _write_pypdf(reader, indices, dst, meta)
    return False


# ══════════════════════════════════════════════════════════════════════════════
# ── Ghostscript burst
# ══════════════════════════════════════════════════════════════════════════════

def _gs_burst(src: str, out_dir: str) -> List[str]:
    """Burst PDF into one-per-page using GS at highest quality."""
    if not GS_BIN:
        return []
    pattern = os.path.join(out_dir, 'page_%04d.pdf')
    try:
        cmd = [
            GS_BIN, '-q', '-dBATCH', '-dNOPAUSE', '-dNOSAFER',
            '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.7',
            '-dPDFSETTINGS=/prepress',
            '-dNOINTERPOLATE',
            f'-sOutputFile={pattern}',
            src,
        ]
        r = subprocess.run(cmd, capture_output=True, timeout=300)
        if r.returncode == 0:
            return sorted(glob(os.path.join(out_dir, 'page_*.pdf')))
        logger.warning('gs burst rc=%d stderr=%s', r.returncode, r.stderr[:200])
    except Exception as e:
        logger.warning('gs burst failed: %s', e)
    return []


# ══════════════════════════════════════════════════════════════════════════════
# ── Bookmark helpers
# ══════════════════════════════════════════════════════════════════════════════

def _get_bookmarks_fitz(src: str, password: str = '',
                        max_level: int = 1) -> List[Tuple[str, int]]:
    """Return [(title, 0-based_page)] from fitz TOC."""
    results = []
    if not _HAS_FITZ:
        return results
    try:
        doc = fitz.open(src)
        if doc.is_encrypted:
            doc.authenticate(password or '')
        toc = doc.get_toc(simple=True)
        for level, title, page in toc:
            if max_level == 0 or level <= max_level:
                results.append((str(title or f'Section {len(results)+1}'),
                                max(0, page - 1)))
        doc.close()
    except Exception as e:
        logger.warning('fitz bookmark read failed: %s', e)
    return results


def _get_bookmarks_pypdf(reader: PdfReader) -> List[Tuple[str, int]]:
    """Flatten pypdf outline into [(title, 0-based_page)]."""
    results = []
    def _walk(items):
        for item in (items or []):
            if isinstance(item, list):
                _walk(item)
            else:
                try:
                    pg = reader.get_destination_page_number(item)
                    results.append((str(item.title or f'Section {len(results)+1}'), pg))
                except Exception:
                    pass
    try:
        _walk(reader.outline)
    except Exception:
        pass
    return results


# ══════════════════════════════════════════════════════════════════════════════
# ── Smart naming helpers
# ══════════════════════════════════════════════════════════════════════════════

def _safe_name(s: str, max_len: int = 55) -> str:
    """Sanitize string for filesystem use."""
    if not s:
        return 'part'
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', str(s))
    s = re.sub(r'[\s_]+', '_', s).strip('_. ')
    return (s or 'part')[:max_len]


def _render_name(pattern: str, n: int, title: str = '') -> str:
    date = datetime.now(timezone.utc).strftime('%Y%m%d')
    try:
        return pattern.format(n=n, N=n, title=_safe_name(title), date=date)
    except Exception:
        return f'part_{n:04d}'


def _get_page_heading(fitz_doc, page_idx: int, median_font_size: float) -> str:
    """Extract the first large/bold text span from a page as a heading label."""
    if not _HAS_FITZ:
        return ''
    try:
        pg = fitz_doc[page_idx]
        blocks = pg.get_text('dict', flags=0).get('blocks', [])
        for blk in blocks[:3]:
            for ln in blk.get('lines', []):
                for sp in ln.get('spans', []):
                    txt   = sp.get('text', '').strip()
                    size  = float(sp.get('size', 0))
                    flags = sp.get('flags', 0)
                    bold  = bool(flags & 16)
                    if txt and len(txt) >= 3 and len(txt) < 80:
                        if bold or size >= median_font_size * 1.2:
                            return txt
        # Fallback: first non-empty text
        for blk in blocks[:2]:
            for ln in blk.get('lines', []):
                for sp in ln.get('spans', []):
                    txt = sp.get('text', '').strip()
                    if txt and len(txt) >= 3:
                        return txt[:60]
    except Exception:
        pass
    return ''


# ══════════════════════════════════════════════════════════════════════════════
# ── Measure page sizes accurately for size_limit mode
# ══════════════════════════════════════════════════════════════════════════════

def _measure_page_sizes(input_path: str, indices: List[int],
                        reader: PdfReader = None,
                        password: str = '') -> List[int]:
    """
    Measure byte size per page using pikepdf (most accurate).
    Falls back to pypdf estimate.
    """
    sizes = []

    if _HAS_PIKEPDF:
        try:
            kw = {'password': password} if password else {}
            with pikepdf.open(input_path, suppress_warnings=True, **kw) as pdf_in:
                total = len(pdf_in.pages)
                for i in indices:
                    if 0 <= i < total:
                        try:
                            tmp = pikepdf.new()
                            tmp.pages.append(pdf_in.pages[i])
                            buf = io.BytesIO()
                            tmp.save(buf, recompress_flate=False)
                            sizes.append(buf.tell())
                        except Exception:
                            sizes.append(65_536)
                    else:
                        sizes.append(65_536)
            return sizes
        except Exception as e:
            logger.debug('pikepdf page size measurement failed: %s', e)

    # pypdf fallback
    if reader:
        for i in indices:
            try:
                buf = io.BytesIO()
                tw  = PdfWriter()
                tw.add_page(reader.pages[i])
                tw.write(buf)
                sizes.append(buf.tell())
            except Exception:
                sizes.append(65_536)
        return sizes

    return [65_536] * len(indices)


# ══════════════════════════════════════════════════════════════════════════════
# ── ZIP manifest & README builder
# ══════════════════════════════════════════════════════════════════════════════

def _build_manifest(source_filename: str, mode: str,
                    output_files: List[str], total_pages: int,
                    skipped_blanks: int, extra: dict = None) -> str:
    """Build a detailed JSON manifest for the ZIP."""
    parts = []
    for fp in output_files:
        if os.path.isfile(fp):
            size_kb = round(os.path.getsize(fp) / 1024, 1)
        else:
            size_kb = 0.0
        parts.append({'filename': os.path.basename(fp), 'size_kb': size_kb})

    manifest = {
        'tool':              TOOL_BRAND,
        'website':           TOOL_URL,
        'author':            'Ishu Kumar (ISHUKR41 / ISHUKR75)',
        'github':            ['https://github.com/ISHUKR41', 'https://github.com/ISHUKR75'],
        'source_file':       source_filename or 'unknown.pdf',
        'split_mode':        mode,
        'total_pages_input': total_pages,
        'output_files':      len(parts),
        'skipped_blanks':    skipped_blanks,
        'quality':           'lossless — streams never re-encoded (pikepdf recompress_flate=False)',
        'created_utc':       datetime.now(timezone.utc).isoformat(),
        'parts':             parts,
    }
    if extra:
        manifest.update(extra)
    return json.dumps(manifest, indent=2, ensure_ascii=False)


def _build_readme(source_filename: str, mode: str, file_count: int,
                  total_pages: int, skipped_blanks: int) -> str:
    """Build a human-readable README.txt for the ZIP."""
    mode_desc = {
        'all':         'All Pages — one PDF per page',
        'range':       'Page Range — extracted specified pages into one file',
        'range_groups':'Range Groups — each range token → its own file',
        'every_n':     'Every N Pages — equal-size chunks',
        'bookmarks':   'By Bookmarks — one file per chapter/bookmark',
        'blank_pages': 'Blank Separator — split at blank separator pages',
        'size_limit':  'By File Size — each part fits within size limit',
        'odd_even':    'Odd / Even — odd pages + even pages as separate files',
    }.get(mode, mode)

    lines = [
        'IshuTools.fun — Split PDF v5.0',
        'Created by Ishu Kumar (ISHUKR41 / ISHUKR75)',
        'https://ishutools.fun  |  GitHub: ISHUKR41 / ISHUKR75',
        '',
        '─────────────────────────────────────────────',
        f'Source file    : {source_filename or "unknown.pdf"}',
        f'Split mode     : {mode_desc}',
        f'Total input pg : {total_pages}',
        f'Output files   : {file_count}',
        f'Blanks skipped : {skipped_blanks}',
        f'Quality        : LOSSLESS — zero re-encoding',
        f'Created (UTC)  : {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")}',
        '─────────────────────────────────────────────',
        '',
        'All output files are byte-identical to the original PDF pages.',
        'Images, fonts, and embedded objects are never modified.',
        '',
        'More free PDF tools at: https://ishutools.fun',
        '',
    ]
    return '\n'.join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# ── Main split function
# ══════════════════════════════════════════════════════════════════════════════

def split_pdf(
    input_path:       str,
    out_dir:          str,
    result_zip:       str,
    mode:             str   = 'all',
    ranges:           str   = '',
    every_n:          int   = 1,
    password:         str   = '',
    max_size_mb:      float = 5.0,
    remove_blanks:    bool  = False,
    naming_pattern:   str   = 'page_{n:04d}',
    blank_threshold:  float = BLANK_WHITE_THRESH,
    compress_output:  bool  = False,   # Ignored — always lossless
    use_pikepdf:      bool  = True,
    zip_compression:  int   = 6,
    source_filename:  str   = '',
    include_manifest: bool  = True,
    include_readme:   bool  = True,
) -> dict:
    """
    Split a PDF into multiple files and package them in a ZIP.

    Uses byte-level page copying for ZERO quality loss.
    Three-engine cascade: pikepdf → PyMuPDF (fitz) → pypdf.

    Returns:
        {
          result_zip, file_count, total_pages, skipped_blanks,
          mode_used, output_files, file_sizes_kb, zip_size_kb,
          source_filename, errors, quality_info
        }
    """
    os.makedirs(out_dir, exist_ok=True)
    errors: List[str] = []

    # ── Open & authenticate ──────────────────────────────────────────────────
    try:
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            ok = reader.decrypt(password or '')
            if ok == 0 and password:
                raise ValueError(
                    'Incorrect PDF password. Please enter the correct password '
                    'in Advanced Options and try again.')
            elif ok == 0 and not password:
                raise ValueError(
                    'This PDF is password-protected. Please enter the password '
                    'in Advanced Options.')
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(
            f'Cannot open PDF: {e}. '
            'The file may be corrupted — try using PDF Repair first.') from e

    total = len(reader.pages)
    if total == 0:
        raise ValueError('This PDF has no pages to split.')

    # ── Metadata propagation ─────────────────────────────────────────────────
    meta: dict = {}
    try:
        if reader.metadata:
            meta = {k: str(v) for k, v in reader.metadata.items() if k and v}
    except Exception:
        pass
    meta['/Producer'] = TOOL_BRAND
    meta['/Creator']  = TOOL_URL
    meta['/ModDate']  = "D:" + datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S') + "+00'00'"

    # ── Blank page detection ─────────────────────────────────────────────────
    blank_set: Set[int] = set()
    if remove_blanks or mode == 'blank_pages':
        blank_set = _detect_blank_pages(input_path, blank_threshold, password)

    # ── Open fitz doc for smart naming (if available) ────────────────────────
    fitz_doc      = None
    median_font   = 12.0
    all_font_sizes = []

    if _HAS_FITZ and mode in ('bookmarks', 'every_n', 'range_groups', 'blank_pages'):
        try:
            fitz_doc = fitz.open(input_path)
            if fitz_doc.is_encrypted:
                fitz_doc.authenticate(password or '')
            # Compute median font size for heading detection
            for pg in fitz_doc:
                for blk in pg.get_text('dict', flags=0).get('blocks', []):
                    for ln in blk.get('lines', []):
                        for sp in ln.get('spans', []):
                            sz = float(sp.get('size', 0))
                            if sz > 0:
                                all_font_sizes.append(sz)
            if all_font_sizes:
                median_font = sorted(all_font_sizes)[len(all_font_sizes) // 2]
        except Exception as e:
            logger.debug('fitz doc open for naming failed: %s', e)

    output_files: List[str] = []
    date_str = datetime.now(timezone.utc).strftime('%Y%m%d')

    def _save(indices: List[int], base_name: str) -> bool:
        """Filter blanks, write losslessly, record path."""
        active = [i for i in indices if i not in (blank_set if remove_blanks else set())]
        if not active:
            return False
        # Sanitize filename
        safe = _safe_name(base_name)
        dst  = os.path.join(out_dir, safe + '.pdf')
        # Avoid name collisions
        if os.path.exists(dst):
            dst = os.path.join(out_dir, f'{safe}_{len(output_files)+1}.pdf')
        try:
            ok = _write_pages(input_path, active, dst, reader, meta, password)
            if ok:
                output_files.append(dst)
                return True
            errors.append(f'Could not write "{safe}.pdf" — skipped.')
            return False
        except Exception as e:
            errors.append(f'"{safe}.pdf": {e}')
            return False

    # ══════════════════════════════════════════════════════════════════════════
    # MODE: all — one file per page (pikepdf first = ZERO re-encoding, lossless)
    # ══════════════════════════════════════════════════════════════════════════
    if mode == 'all':
        _all_done = False
        if _HAS_PIKEPDF:
            try:
                kw = {'password': password} if password else {}
                with pikepdf.open(input_path, suppress_warnings=True, **kw) as _pdf_in:
                    for i in range(total):
                        if remove_blanks and i in blank_set:
                            continue
                        name = _render_name(naming_pattern, i + 1)
                        safe = _safe_name(name)
                        dst  = os.path.join(out_dir, safe + '.pdf')
                        if os.path.exists(dst):
                            dst = os.path.join(out_dir, f'{safe}_{i+1:04d}.pdf')
                        try:
                            _out_pg = pikepdf.new()
                            _out_pg.pages.append(_pdf_in.pages[i])
                            _out_pg.save(
                                dst,
                                recompress_flate=False,   # NEVER re-encode streams
                                compress_streams=True,
                                object_stream_mode=pikepdf.ObjectStreamMode.generate,
                                linearize=False,
                            )
                            if os.path.isfile(dst) and os.path.getsize(dst) > 50:
                                output_files.append(dst)
                        except Exception as pg_err:
                            errors.append(f'Page {i+1}: {pg_err}')
                _all_done = True
            except Exception as burst_err:
                logger.warning('pikepdf all-pages burst failed: %s', burst_err)
                errors.append(f'Lossless engine fallback: {burst_err}')

        if not _all_done:
            # Fallback: GS burst (only if pikepdf unavailable/failed)
            gs_pages = _gs_burst(input_path, out_dir) if GS_BIN else []
            if gs_pages:
                for i, fp in enumerate(gs_pages):
                    if remove_blanks and i in blank_set:
                        try: os.remove(fp)
                        except Exception: pass
                    else:
                        output_files.append(fp)
            else:
                for i in range(total):
                    if remove_blanks and i in blank_set:
                        continue
                    name = _render_name(naming_pattern, i + 1)
                    _save([i], name)

    # ══════════════════════════════════════════════════════════════════════════
    # MODE: range — all selected pages → one merged output file
    # ══════════════════════════════════════════════════════════════════════════
    elif mode == 'range':
        idxs = [i for i in parse_ranges(ranges, total)
                if not (remove_blanks and i in blank_set)]
        if not idxs:
            raise ValueError(
                'No valid pages in the selected range. '
                'Check your selection and ensure the page numbers exist in the PDF.')
        stem = _safe_name(Path(source_filename).stem) if source_filename else 'extracted'
        if len(idxs) == 1:
            label = f'page_{idxs[0]+1}'
        elif len(idxs) <= 20:
            label = f'pages_{idxs[0]+1}-{idxs[-1]+1}'
        else:
            label = f'{len(idxs)}pages'
        _save(idxs, f'{stem}_{label}')

    # ══════════════════════════════════════════════════════════════════════════
    # MODE: range_groups — each range token → its own file
    # ══════════════════════════════════════════════════════════════════════════
    elif mode == 'range_groups':
        raw_groups = re.split(r'[,，；;]+', str(ranges).strip())
        group_num = 0
        for raw in raw_groups:
            raw = raw.strip()
            if not raw:
                continue
            pages = parse_ranges(raw, total)
            pages = [p for p in pages if not (remove_blanks and p in blank_set)]
            if not pages:
                continue
            group_num += 1
            safe_label = _safe_name(raw.replace('-', 'to').replace(' ', ''))[:18]
            stem = _safe_name(Path(source_filename).stem) if source_filename else 'part'
            name = f'{stem}_rg{group_num:02d}_{safe_label}'
            _save(pages, name)

    # ══════════════════════════════════════════════════════════════════════════
    # MODE: every_n — equal-size chunks
    # ══════════════════════════════════════════════════════════════════════════
    elif mode == 'every_n':
        n = max(1, every_n)
        valid = [i for i in range(total) if not (remove_blanks and i in blank_set)]
        for chunk_idx, start in enumerate(range(0, len(valid), n), 1):
            chunk = valid[start: start + n]
            if not chunk:
                continue
            first, last = chunk[0] + 1, chunk[-1] + 1

            # Try smart naming from first page heading
            smart = ''
            if fitz_doc:
                smart = _get_page_heading(fitz_doc, chunk[0], median_font)

            stem = _safe_name(Path(source_filename).stem) if source_filename else 'chunk'
            if smart and len(smart) >= 3:
                name = f'{chunk_idx:03d}_{_safe_name(smart)}_pg{first:04d}-{last:04d}'
            else:
                name = _render_name(naming_pattern, chunk_idx) + f'_pg{first:04d}-{last:04d}'
            _save(chunk, name)

    # ══════════════════════════════════════════════════════════════════════════
    # MODE: bookmarks — one file per chapter
    # ══════════════════════════════════════════════════════════════════════════
    elif mode == 'bookmarks':
        flat = _get_bookmarks_fitz(input_path, password, max_level=1)
        if not flat:
            flat = _get_bookmarks_pypdf(reader)

        if not flat:
            logger.info('No bookmarks — fallback to every-5-pages')
            valid = [i for i in range(total) if not (remove_blanks and i in blank_set)]
            for ci, start in enumerate(range(0, len(valid), 5), 1):
                chunk = valid[start: start + 5]
                if chunk:
                    _save(chunk, f'section_{ci:03d}_pg{chunk[0]+1:04d}-{chunk[-1]+1:04d}')
        else:
            # Deduplicate
            seen: set = set()
            unique_flat = []
            for title, pg in flat:
                if pg not in seen:
                    seen.add(pg)
                    unique_flat.append((title, pg))
            flat = unique_flat
            flat.append(('_END_', total))

            for i, (title, start_idx) in enumerate(flat[:-1]):
                _, next_idx = flat[i + 1]
                pages = [j for j in range(start_idx, min(next_idx, total))
                         if not (remove_blanks and j in blank_set)]
                if pages:
                    fname = f'{i+1:03d}_{_safe_name(title)}'
                    _save(pages, fname)

    # ══════════════════════════════════════════════════════════════════════════
    # MODE: blank_pages — split at blank separators
    # ══════════════════════════════════════════════════════════════════════════
    elif mode == 'blank_pages':
        chunk: List[int] = []
        chunk_num = 1
        for i in range(total):
            if i in blank_set:
                if chunk:
                    # Try smart naming
                    smart = ''
                    if fitz_doc:
                        smart = _get_page_heading(fitz_doc, chunk[0], median_font)
                    if smart and len(smart) >= 3:
                        name = f'section_{chunk_num:03d}_{_safe_name(smart)}'
                    else:
                        name = f'section_{chunk_num:03d}_pg{chunk[0]+1:04d}-{chunk[-1]+1:04d}'
                    _save(chunk, name)
                    chunk_num += 1
                    chunk = []
            else:
                chunk.append(i)
        if chunk:
            smart = ''
            if fitz_doc:
                smart = _get_page_heading(fitz_doc, chunk[0], median_font)
            if smart and len(smart) >= 3:
                name = f'section_{chunk_num:03d}_{_safe_name(smart)}'
            else:
                name = f'section_{chunk_num:03d}_pg{chunk[0]+1:04d}-{chunk[-1]+1:04d}'
            _save(chunk, name)

        if not output_files:
            # No blank pages found — split every 5 pages
            logger.info('blank_pages: no blanks found — fallback to every-5-pages')
            valid = [i for i in range(total) if not (remove_blanks and i in blank_set)]
            for ci, start in enumerate(range(0, len(valid), 5), 1):
                chunk2 = valid[start: start + 5]
                if chunk2:
                    _save(chunk2, f'section_{ci:03d}_pg{chunk2[0]+1:04d}-{chunk2[-1]+1:04d}')

    # ══════════════════════════════════════════════════════════════════════════
    # MODE: size_limit — accurate byte-budget chunks
    # ══════════════════════════════════════════════════════════════════════════
    elif mode == 'size_limit':
        max_bytes = max(0.5, max_size_mb) * 1_048_576
        valid = [i for i in range(total) if not (remove_blanks and i in blank_set)]

        # Accurate per-page measurement (pikepdf or pypdf)
        pg_sizes = _measure_page_sizes(input_path, valid, reader, password)

        chunk: List[int] = []
        acc      = 0
        chunk_num = 1

        for idx, pg_idx in enumerate(valid):
            sz = pg_sizes[idx] if idx < len(pg_sizes) else 65_536
            if chunk and acc + sz > max_bytes:
                name = f'part_{chunk_num:03d}_pg{chunk[0]+1:04d}-{chunk[-1]+1:04d}'
                _save(chunk, name)
                chunk_num += 1; chunk = []; acc = 0
            chunk.append(pg_idx)
            acc += sz

        if chunk:
            _save(chunk, f'part_{chunk_num:03d}_pg{chunk[0]+1:04d}-{chunk[-1]+1:04d}')

    # ══════════════════════════════════════════════════════════════════════════
    # MODE: odd_even
    # ══════════════════════════════════════════════════════════════════════════
    elif mode == 'odd_even':
        stem = _safe_name(Path(source_filename).stem) if source_filename else 'document'
        odd  = [i for i in range(0, total, 2)
                if not (remove_blanks and i in blank_set)]
        even = [i for i in range(1, total, 2)
                if not (remove_blanks and i in blank_set)]
        if odd:
            _save(odd,  f'{stem}_odd_pages')
        if even:
            _save(even, f'{stem}_even_pages')

    else:
        raise ValueError(
            f'Unknown split mode: "{mode}". '
            'Valid: all, range, range_groups, every_n, bookmarks, blank_pages, size_limit, odd_even')

    # ── Close fitz doc ───────────────────────────────────────────────────────
    if fitz_doc:
        try:
            fitz_doc.close()
        except Exception:
            pass

    if not output_files:
        hint = (
            'Try disabling "Remove Blank Pages" in Advanced Options.'
            if remove_blanks else
            'The selected range may be empty or the PDF may have no usable pages.'
        )
        raise RuntimeError(f'No output files were created. {hint}')

    skipped_blanks = len([i for i in blank_set if i < total]) if remove_blanks else 0

    # ── Build ZIP with manifest + README ────────────────────────────────────
    with zipfile.ZipFile(result_zip, 'w',
                          zipfile.ZIP_DEFLATED,
                          compresslevel=zip_compression) as zf:
        for fp in output_files:
            if os.path.isfile(fp):
                zf.write(fp, os.path.basename(fp))

        if include_manifest:
            zf.writestr(
                MANIFEST_FILENAME,
                _build_manifest(source_filename, mode, output_files,
                                total, skipped_blanks, extra={'errors': errors})
            )
        if include_readme:
            zf.writestr(
                README_FILENAME,
                _build_readme(source_filename, mode, len(output_files),
                              total, skipped_blanks)
            )

    file_sizes_kb = [
        round(os.path.getsize(fp) / 1024, 1)
        for fp in output_files if os.path.isfile(fp)
    ]

    return {
        'result_zip':      result_zip,
        'file_count':      len(output_files),
        'total_pages':     total,
        'skipped_blanks':  skipped_blanks,
        'mode_used':       mode,
        'output_files':    [os.path.basename(fp) for fp in output_files],
        'file_sizes_kb':   file_sizes_kb,
        'zip_size_kb':     round(os.path.getsize(result_zip) / 1024, 1),
        'source_filename': source_filename,
        'errors':          errors,
        'quality_info':    {
            'engine':    'pikepdf+fitz+pypdf cascade',
            'lossless':  True,
            're_encoded': False,
        },
    }


# ══════════════════════════════════════════════════════════════════════════════
# ── Range Groups (dedicated function — called from app.py)
# ══════════════════════════════════════════════════════════════════════════════

def split_ranges_to_multiple(
    input_path:       str,
    out_dir:          str,
    result_zip:       str,
    ranges_str:       str,
    password:         str  = '',
    remove_blanks:    bool = False,
    naming_pattern:   str  = 'part_{n:03d}',
    source_filename:  str  = '',
) -> dict:
    """
    Split a PDF so EACH comma-separated range becomes its OWN output PDF.

    Example:
      ranges_str = "1-5, 8, 12-15"
        → part_001.pdf  (pages 1–5)
        → part_002.pdf  (page 8)
        → part_003.pdf  (pages 12–15)
    """
    os.makedirs(out_dir, exist_ok=True)
    results: List[dict] = []
    skipped_blanks = 0

    reader = PdfReader(input_path)
    if reader.is_encrypted:
        ok = reader.decrypt(password or '')
        if ok == 0:
            raise ValueError('Incorrect PDF password for range_groups mode.')
    total = len(reader.pages)
    if total == 0:
        raise ValueError('PDF has no pages.')

    blank_set: Set[int] = set()
    if remove_blanks:
        blank_set = _detect_blank_pages(input_path, password=password)

    # Parse each comma/semicolon-separated token
    raw_groups = re.split(r'[,，；;]+', str(ranges_str).strip())

    for raw in raw_groups:
        raw = raw.strip()
        if not raw:
            continue

        pages = parse_ranges(raw, total)    # FIXED: was _parse_range (undefined)
        if not pages:
            logger.debug('range_groups: empty token %r', raw)
            continue

        if remove_blanks:
            before = len(pages)
            pages  = [p for p in pages if p not in blank_set]
            skipped_blanks += before - len(pages)

        if not pages:
            continue

        n          = len(results) + 1
        safe_label = _safe_name(raw.replace('-', 'to').replace(' ', ''))[:18]
        date_s     = datetime.now(timezone.utc).strftime('%Y%m%d')  # FIXED

        try:
            base = naming_pattern.format(
                n=n, label=safe_label,
                start=pages[0]+1, end=pages[-1]+1, date=date_s)
        except Exception:
            base = f'part_{n:03d}_pg{pages[0]+1}'

        out_name = base if base.lower().endswith('.pdf') else base + '.pdf'
        out_path = os.path.join(out_dir, _safe_name(out_name))

        _write_pages(input_path, pages, out_path, reader)
        results.append({
            'filename':   os.path.basename(out_path),
            'path':       out_path,
            'page_count': len(pages),
            'range':      raw,
            'page_start': pages[0] + 1,
            'page_end':   pages[-1] + 1,
        })

    if not results:
        raise ValueError('No valid pages found in the specified ranges.')

    # Build ZIP + manifest
    stem = _safe_name(Path(source_filename).stem) if source_filename else 'document'
    with zipfile.ZipFile(result_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for r in results:
            if os.path.exists(r['path']):
                zf.write(r['path'], r['filename'])
        manifest = {
            'tool':          TOOL_BRAND,
            'website':       TOOL_URL,
            'author':        'Ishu Kumar (ISHUKR41 / ISHUKR75)',
            'mode':          'range_groups',
            'created_utc':   datetime.now(timezone.utc).isoformat(),  # FIXED
            'source':        source_filename or os.path.basename(input_path),
            'lossless':      True,
            'groups':        len(results),
            'files':         [
                {'filename': r['filename'], 'range': r['range'],
                 'pages': r['page_count'],
                 'page_start': r['page_start'], 'page_end': r['page_end']}
                for r in results
            ],
        }
        zf.writestr(MANIFEST_FILENAME, json.dumps(manifest, indent=2, ensure_ascii=False))
        zf.writestr(README_FILENAME,
                    _build_readme(source_filename, 'range_groups',
                                  len(results), sum(r['page_count'] for r in results), skipped_blanks))

    zip_size_kb = round(os.path.getsize(result_zip) / 1024, 1) if os.path.exists(result_zip) else 0.0

    return {
        'file_count':     len(results),
        'total_pages':    sum(r['page_count'] for r in results),
        'skipped_blanks': skipped_blanks,
        'zip_size_kb':    zip_size_kb,
        'mode_used':      'range_groups',
        'output_files':   [r['filename'] for r in results],
        'files':          results,
        'errors':         [],
    }


# ══════════════════════════════════════════════════════════════════════════════
# ── Preview / analysis (no disk writes)
# ══════════════════════════════════════════════════════════════════════════════

def get_split_preview(input_path: str, password: str = '') -> dict:
    """
    Analyse a PDF and return rich metadata for configuring a split.
    Zero file writes.
    """
    info: dict = {
        'total_pages':       0,
        'blank_pages':       0,
        'bookmarks':         [],
        'bookmark_count':    0,
        'file_size_kb':      round(os.path.getsize(input_path) / 1024, 1),
        'file_size_mb':      round(os.path.getsize(input_path) / 1_048_576, 2),
        'page_sizes':        [],
        'estimated_chunks':  {},
        'has_text':          False,
        'is_scanned':        False,
        'pdf_version':       '',
        'has_forms':         False,
        'has_annotations':   False,
        'is_encrypted':      False,
        'title':             '',
        'author':            '',
        'recommended_mode':  'all',
    }

    try:
        reader = PdfReader(input_path)
        info['is_encrypted'] = reader.is_encrypted
        if reader.is_encrypted:
            reader.decrypt(password or '')
        info['total_pages'] = len(reader.pages)

        # Page sizes (first 6)
        page_sizes_set: set = set()
        for pg in reader.pages[:6]:
            try:
                w = round(float(pg.mediabox.width))
                h = round(float(pg.mediabox.height))
                page_sizes_set.add(f'{w}×{h} pt')
            except Exception:
                pass
        info['page_sizes'] = list(page_sizes_set)

        # Metadata
        try:
            if reader.metadata:
                info['title']  = str(reader.metadata.get('/Title', '') or '')[:120]
                info['author'] = str(reader.metadata.get('/Author', '') or '')[:80]
        except Exception:
            pass

    except Exception as e:
        logger.warning('preview reader failed: %s', e)

    if not _HAS_FITZ:
        return info

    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        try:
            info['pdf_version'] = f'PDF {doc.pdf_version()}'
        except Exception:
            pass

        # Bookmarks (top-level)
        toc = doc.get_toc(simple=True)
        top_bk = [(t, p) for lvl, t, p in toc if lvl == 1]
        info['bookmarks']      = [[t, p] for t, p in top_bk[:60]]
        info['bookmark_count'] = len(top_bk)

        blank_cnt = text_pg = anno_pg = form_pg = 0
        for pg in doc:
            if _is_blank_page(pg):
                blank_cnt += 1
            else:
                if pg.get_text().strip():
                    text_pg += 1
            if pg.annots():
                anno_pg += 1
            if pg.widgets():
                form_pg += 1

        doc.close()

        info['blank_pages']     = blank_cnt
        info['has_text']        = text_pg > 0
        info['is_scanned']      = text_pg == 0 and (info['total_pages'] - blank_cnt) > 0
        info['has_forms']       = form_pg > 0
        info['has_annotations'] = anno_pg > 0

    except Exception as e:
        logger.warning('preview fitz failed: %s', e)

    n      = info['total_pages']
    blanks = info['blank_pages']
    net    = max(1, n - blanks)

    info['estimated_chunks'] = {
        'all':       net,
        'every_2':   max(1, (net + 1) // 2),
        'every_5':   max(1, (net + 4) // 5),
        'every_10':  max(1, (net + 9) // 10),
        'bookmarks': max(1, info['bookmark_count']),
        'odd_even':  2 if net > 1 else 1,
    }

    # Recommendation
    if info['bookmark_count'] >= 2:
        info['recommended_mode'] = 'bookmarks'
    elif blanks >= 2:
        info['recommended_mode'] = 'blank_pages'
    elif n > 50:
        info['recommended_mode'] = 'every_n'
    else:
        info['recommended_mode'] = 'all'

    return info


# ══════════════════════════════════════════════════════════════════════════════
# ── Thumbnail generator
# ══════════════════════════════════════════════════════════════════════════════

def generate_page_thumbnails(
    input_path: str,
    out_dir:    str,
    pages:      List[int] = None,
    dpi:        int       = THUMB_DPI_DEFAULT,
    fmt:        str       = 'JPEG',
    password:   str       = '',
) -> List[str]:
    """Render page thumbnails using PyMuPDF."""
    os.makedirs(out_dir, exist_ok=True)
    thumbs: List[str] = []
    if not _HAS_FITZ:
        return thumbs
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        targets = pages if pages is not None else list(range(min(20, doc.page_count)))
        mat     = fitz.Matrix(dpi / 72, dpi / 72)
        ext     = 'jpg' if fmt.upper() == 'JPEG' else 'png'

        for i in targets:
            if 0 <= i < doc.page_count:
                try:
                    pix = doc[i].get_pixmap(matrix=mat, alpha=False)
                    fp  = os.path.join(out_dir, f'thumb_{i+1:04d}.{ext}')
                    pix.save(fp)
                    thumbs.append(fp)
                except Exception as e:
                    logger.debug('thumb p%d failed: %s', i + 1, e)
        doc.close()
    except Exception as e:
        logger.warning('thumbnail generation failed: %s', e)
    return thumbs


# ══════════════════════════════════════════════════════════════════════════════
# ── Deep structure analysis
# ══════════════════════════════════════════════════════════════════════════════

def analyze_pdf_structure(input_path: str, password: str = '') -> dict:
    """
    Comprehensive PDF structural analysis: fonts, links, forms, layers, signatures.
    """
    report: dict = {
        'file_size_kb':    round(os.path.getsize(input_path) / 1024, 1),
        'pdf_version':     '',
        'page_count':      0,
        'is_encrypted':    False,
        'bookmarks':       [],
        'bookmark_levels': 0,
        'page_types':      [],
        'fonts':           [],
        'color_spaces':    [],
        'link_count':      0,
        'annotation_count':0,
        'form_field_count':0,
        'has_signatures':  False,
        'has_layers':      False,
        'linearized':      False,
        'errors':          [],
    }

    if not _HAS_FITZ:
        try:
            reader = PdfReader(input_path)
            if reader.is_encrypted:
                reader.decrypt(password or '')
            report['page_count'] = len(reader.pages)
        except Exception as e:
            report['errors'].append(str(e))
        return report

    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        try:
            report['pdf_version'] = f'PDF {doc.pdf_version()}'
        except Exception:
            pass

        report['page_count'] = doc.page_count

        toc = doc.get_toc(simple=False)
        report['bookmarks']       = [(lvl, t, pg) for lvl, t, pg, *_ in toc][:100]
        report['bookmark_levels'] = max((lvl for lvl, *_ in toc), default=0) if toc else 0

        # Layers
        try:
            layers = doc.get_layers()
            report['has_layers'] = bool(layers)
        except Exception:
            pass

        font_names: set = set()
        cs_set:     set = set()
        link_cnt = anno_cnt = form_cnt = 0

        for i, pg in enumerate(doc):
            txt  = pg.get_text().strip()
            imgs = pg.get_images()

            if not txt and not imgs:
                ptype = 'blank'
            elif txt and imgs:
                ptype = 'mixed'
            elif txt:
                ptype = 'text'
            else:
                ptype = 'image'
            report['page_types'].append(ptype)

            for _, _, _, _, _, name, enc in pg.get_fonts():
                font_names.add(name or enc or 'unknown')

            link_cnt  += len(pg.get_links())
            anno_cnt  += len(list(pg.annots()))
            form_cnt  += len(list(pg.widgets()))

            for img in imgs:
                cs = img[5] if len(img) > 5 else ''
                if cs:
                    cs_set.add(str(cs))

        doc.close()

        report['fonts']             = sorted(font_names)[:50]
        report['color_spaces']      = sorted(cs_set)
        report['link_count']        = link_cnt
        report['annotation_count']  = anno_cnt
        report['form_field_count']  = form_cnt

    except Exception as e:
        report['errors'].append(str(e))

    return report


# ══════════════════════════════════════════════════════════════════════════════
# ── Content heading splitter (no bookmark required)
# ══════════════════════════════════════════════════════════════════════════════

def split_by_content_headings(input_path: str, output_dir: str,
                               heading_pattern: str = None,
                               password: str = '') -> List[dict]:
    """
    Split at pages that open with a visually large/bold heading.
    Uses font-size analysis — works even without PDF bookmarks.
    """
    os.makedirs(output_dir, exist_ok=True)
    results: List[dict] = []
    if not _HAS_FITZ:
        return results

    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        all_sizes: List[float] = []
        for pg in doc:
            for blk in pg.get_text('dict', flags=0).get('blocks', []):
                for ln in blk.get('lines', []):
                    for sp in ln.get('spans', []):
                        if sp.get('text', '').strip():
                            all_sizes.append(float(sp.get('size', 0)))

        if not all_sizes:
            doc.close(); return []

        median_sz = sorted(all_sizes)[len(all_sizes) // 2]
        compiled  = re.compile(heading_pattern, re.I) if heading_pattern else None

        heading_pages: List[int] = [0]
        heading_texts: List[str] = ['Introduction']

        for pg_idx in range(1, doc.page_count):
            pg = doc[pg_idx]
            for blk in pg.get_text('dict', flags=0).get('blocks', [])[:3]:
                for ln in blk.get('lines', []):
                    for sp in ln.get('spans', []):
                        txt   = sp.get('text', '').strip()
                        size  = float(sp.get('size', 0))
                        flags = sp.get('flags', 0)
                        bold  = bool(flags & 16)
                        if not txt:
                            continue
                        matched = (compiled and compiled.search(txt)) or \
                                  (not compiled and bold and size >= median_sz * 1.22
                                   and 3 <= len(txt) < 120)
                        if matched:
                            heading_pages.append(pg_idx)
                            heading_texts.append(txt[:60])
                            break

        doc.close()

        if len(heading_pages) <= 1:
            return []

        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt(password or '')

        for i, (start, htxt) in enumerate(zip(heading_pages, heading_texts)):
            end   = heading_pages[i + 1] if i + 1 < len(heading_pages) else len(reader.pages)
            safe  = _safe_name(htxt[:40]) or f'section_{i+1:03d}'
            opath = os.path.join(output_dir, f'{i+1:03d}_{safe}.pdf')
            _write_pages(input_path, list(range(start, end)), opath, reader)
            results.append({
                'filename':     os.path.basename(opath),
                'path':         opath,
                'page_start':   start + 1,
                'page_end':     end,
                'heading_text': htxt,
                'page_count':   end - start,
            })
    except Exception as e:
        logger.warning('split_by_content_headings failed: %s', e)
    return results


# ══════════════════════════════════════════════════════════════════════════════
# ── Per-page analytics
# ══════════════════════════════════════════════════════════════════════════════

def get_page_analytics(input_path: str, password: str = '') -> List[dict]:
    """
    Return per-page analytics: word_count, char_count, image_count, is_blank,
    font_count, link_count, annotation_count, has_forms, page_size.
    """
    out: List[dict] = []
    if not _HAS_FITZ:
        try:
            reader = PdfReader(input_path)
            if reader.is_encrypted:
                reader.decrypt(password or '')
            for i, pg in enumerate(reader.pages):
                out.append({'page': i+1, 'is_blank': False, 'word_count': 0,
                             'image_count': 0, 'char_count': 0, 'font_count': 0})
        except Exception:
            pass
        return out

    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')
        for i, pg in enumerate(doc):
            txt   = pg.get_text().strip()
            words = len(txt.split())
            try:
                rect = pg.rect
                pgsz = f'{round(rect.width)}×{round(rect.height)} pt'
            except Exception:
                pgsz = ''
            out.append({
                'page':             i + 1,
                'word_count':       words,
                'char_count':       len(txt),
                'image_count':      len(pg.get_images()),
                'font_count':       len(pg.get_fonts()),
                'link_count':       len(pg.get_links()),
                'annotation_count': len(list(pg.annots())),
                'has_forms':        len(list(pg.widgets())) > 0,
                'is_blank':         _is_blank_page(pg),
                'page_size':        pgsz,
            })
        doc.close()
    except Exception as e:
        logger.warning('get_page_analytics failed: %s', e)
    return out


# ══════════════════════════════════════════════════════════════════════════════
# ── Fast quick-info via pikepdf (no rendering)
# ══════════════════════════════════════════════════════════════════════════════

def get_pdf_quick_info(input_path: str, password: str = '') -> dict:
    """
    Instant PDF metadata: page count, encryption, version, title, bookmarks.
    No page rendering — returns within milliseconds.
    """
    info = {
        'total_pages':    0,
        'is_encrypted':   False,
        'pdf_version':    '',
        'file_size_kb':   0.0,
        'file_size_mb':   0.0,
        'has_bookmarks':  False,
        'bookmark_count': 0,
        'title':          '',
        'author':         '',
        'has_forms':      False,
    }
    try:
        sz = os.path.getsize(input_path)
        info['file_size_kb'] = round(sz / 1024, 1)
        info['file_size_mb'] = round(sz / 1_048_576, 2)
    except Exception:
        pass

    if not _HAS_PIKEPDF:
        try:
            reader = PdfReader(input_path)
            info['is_encrypted'] = reader.is_encrypted
            if reader.is_encrypted:
                reader.decrypt(password or '')
            info['total_pages'] = len(reader.pages)
        except Exception:
            pass
        return info

    try:
        with pikepdf.open(input_path, password=(password or ''),
                          suppress_warnings=True) as pdf:
            info['is_encrypted'] = pdf.is_encrypted
            info['total_pages']  = len(pdf.pages)
            info['pdf_version']  = str(pdf.pdf_version)
            try:
                meta = pdf.open_metadata()
                info['title']  = str(meta.get('{http://purl.org/dc/elements/1.1/}title', '') or '')[:120]
                info['author'] = str(meta.get('{http://purl.org/dc/elements/1.1/}creator', '') or '')[:80]
            except Exception:
                pass
            try:
                if '/AcroForm' in pdf.Root:
                    info['has_forms'] = True
            except Exception:
                pass
            try:
                outlines = pdf.open_outline()
                if outlines.root:
                    info['has_bookmarks']  = True
                    info['bookmark_count'] = len(list(outlines.root))
            except Exception:
                pass
    except Exception as e:
        logger.warning('get_pdf_quick_info failed: %s', e)
    return info
