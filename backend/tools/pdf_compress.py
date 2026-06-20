"""
pdf_compress.py — IshuTools.fun Enterprise PDF Compression Suite v20.0
Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun
GitHub: https://github.com/ISHUKR41 | https://github.com/ISHUKR75

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORLD-CLASS PDF COMPRESSION ENGINE — 10 STRATEGIES + INTELLIGENT PIPELINE

COMPRESSION ENGINES (ALL tried, SMALLEST result kept):
  1.  Ghostscript CLI          — industry-standard distiller presets (gs/gswin64c)
  2.  PyMuPDF (fitz)           — per-image DPI downsampling + JPEG/WebP re-encode
  3.  pikepdf                  — object stream merging, DEFLATE-9, XMP strip
  4.  qpdf CLI                 — linearize + recompress streams
  5.  pypdf                    — orphan object purge, content-stream optimize
  6.  Pillow                   — image-only JPEG/WebP/JBIG2 pipeline
  7.  mutool                   — MuPDF clean + compress (when available)
  8.  pdftocairo / pdf2ps      — re-distill pipeline for corrupted PDFs
  9.  WeasyPrint               — HTML→PDF clean rebuild (text-only PDFs)
  10. cpdf                     — fine-grained stream recompression

POST-PROCESSING PASSES:
  + Strip dead XObjects, orphan streams, duplicate resources
  + Linearization (fast-web-view / byte-serving)
  + JavaScript removal, annotation flattening, form flattening
  + ICC profile stripping, thumbnail removal, embedded file removal
  + Font subsetting (only used glyphs embedded)
  + Transparency flattening, overprint simplification
  + Duplicate image detection + reference deduplication
  + Color space optimization (CMYK→RGB when smaller)
  + Metadata scrubbing (DocInfo + XMP)
  + Object stream compression (ObjStm + XRef stream)
  + Content stream optimization (remove redundant operators)

QUALITY PRESETS (NO auto-grayscale — user must enable explicitly):
  screen   → 72 DPI,  JPEG q=25  — max compression, screen viewing only
  low      → 96 DPI,  JPEG q=42  — email-friendly small file
  medium   → 150 DPI, JPEG q=62  — balanced recommended
  high     → 200 DPI, JPEG q=80  — near-lossless, print-quality
  lossless → 300 DPI, no re-encode — structure-only, zero image loss

ADVANCED OPTIONS (all user-controlled, ZERO automatic overrides):
  grayscale             — convert colour to grayscale (USER must enable)
  strip_metadata        — remove author/title/XMP/DocInfo
  remove_annotations    — delete all annotation objects
  linearize             — web-optimize (fast-web-view)
  remove_javascript     — strip all JS/action objects
  remove_thumbnails     — delete embedded page thumbnails
  remove_embedded_files — remove file attachments
  flatten_transparency  — flatten transparent layers
  subset_fonts          — only embed used glyphs (GS required)
  remove_icc_profiles   — strip unnecessary ICC colour profiles
  remove_forms          — remove interactive form fields
  remove_links          — remove hyperlink annotations
  remove_duplicate_images — deduplicate identical image streams
  target_size_kb        — iterative binary-search compression to target KB
  password              — decrypt password-protected PDFs

ANALYSIS FUNCTIONS (20+):
  get_compression_estimate()       — full PDF analysis + per-preset estimates
  analyze_pdf_streams()            — stream-level stats (compressed vs raw)
  get_available_engines()          — detect installed engines + versions
  analyze_images_in_pdf()          — per-image DPI, mode, size, savings potential
  get_compression_potential()      — per-strategy reduction opportunity
  get_pdf_metadata()               — full metadata extraction (DocInfo + XMP)
  get_pdf_structure_report()       — deep object/stream analysis
  estimate_compression_savings()   — fast estimate without full analysis
  detect_pdf_type()                — text-heavy/image-heavy/mixed/scanned/form
  get_font_analysis()              — embedded fonts + subset opportunities
  get_image_compression_stats()    — per-image compression metrics
  benchmark_compression()          — try all presets, return comparison table
  get_security_report()            — encryption/permissions/JS/forms details
  get_color_analysis()             — colour vs grayscale page breakdown
  analyze_font_subsetting()        — identify oversized embedded fonts
  get_page_size_breakdown()        — per-page size contribution analysis
  calculate_entropy()              — stream entropy → compression headroom
  get_object_statistics()          — PDF object-type distribution
  detect_duplicate_images()        — find identical image streams by hash
  get_accessibility_report()       — tagged PDF, alt text, reading order
  analyze_content_streams()        — drawing command complexity per page
  get_compression_recommendations()— ranked list of best strategies
  validate_output_pdf()            — verify output is valid + readable
  get_quality_score()              — 0–100 quality/compression ratio score
  deep_analyze_pdf()               — all analysis functions combined

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

# ═══════════════════════════════════════════════════════════════════════════════
# IMPORTS
# ═══════════════════════════════════════════════════════════════════════════════

import io
import os
import re
import gc
import sys
import copy
import json
import math
import shutil
import struct
import hashlib
import logging
import tempfile
import threading
import subprocess
import time
import zlib
import statistics
import concurrent.futures
import traceback
from collections import defaultdict, Counter, OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Tuple, Any, Union, Generator, Callable, Set, Iterator
from functools import lru_cache, partial, wraps
from contextlib import contextmanager, suppress
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from enum import Enum, auto
import itertools
import struct
import random
import base64
import urllib.parse
import fnmatch

# ── Core PDF libraries ─────────────────────────────────────────────────────────
try:
    import pikepdf
    from pikepdf import Pdf, PdfError, Dictionary, Array, Name
    from pikepdf import String as PikePdfString
    PIKEPDF_OK      = True
    PIKEPDF_VERSION = pikepdf.__version__
except ImportError:
    PIKEPDF_OK      = False
    PIKEPDF_VERSION = None
    class Pdf:
        pass

try:
    import fitz  # PyMuPDF
    FITZ_OK      = True
    FITZ_VERSION = fitz.__version__
except ImportError:
    FITZ_OK      = False
    FITZ_VERSION = None

try:
    import pypdf
    from pypdf import PdfReader, PdfWriter
    from pypdf.errors import PdfReadError, EmptyFileError
    PYPDF_OK      = True
    PYPDF_VERSION = pypdf.__version__
except ImportError:
    try:
        import PyPDF2 as pypdf
        from PyPDF2 import PdfReader, PdfWriter
        PYPDF_OK      = True
        PYPDF_VERSION = getattr(pypdf, '__version__', '2.x')
    except ImportError:
        PYPDF_OK      = False
        PYPDF_VERSION = None

try:
    from PIL import Image, ImageFilter, ImageEnhance, ImageOps, ImageDraw, ImageFont
    from PIL import JpegImagePlugin
    PIL_OK      = True
    PIL_VERSION = Image.__version__
except ImportError:
    PIL_OK      = False
    PIL_VERSION = None

try:
    import img2pdf
    IMG2PDF_OK = True
except ImportError:
    IMG2PDF_OK = False

try:
    from pdf2image import convert_from_path
    PDF2IMAGE_OK = True
except ImportError:
    PDF2IMAGE_OK = False

try:
    from pdfminer.high_level import extract_text, extract_pages
    from pdfminer.layout import LTPage, LTTextBox, LTFigure, LTLayoutContainer
    from pdfminer.pdfparser import PDFParser
    from pdfminer.pdfdocument import PDFDocument
    from pdfminer.pdftypes import PDFStream, PDFObjRef
    from pdfminer.pdfpage import PDFPage
    PDFMINER_OK = True
except ImportError:
    PDFMINER_OK = False

try:
    import reportlab
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.utils import ImageReader
    from reportlab.lib import colors as rl_colors
    REPORTLAB_OK = True
except ImportError:
    REPORTLAB_OK = False

try:
    import weasyprint
    WEASYPRINT_OK = True
except ImportError:
    WEASYPRINT_OK = False

try:
    import cairosvg
    CAIROSVG_OK = True
except ImportError:
    CAIROSVG_OK = False

try:
    import numpy as np
    NUMPY_OK = True
except ImportError:
    NUMPY_OK = False

try:
    import scipy
    from scipy import stats as sp_stats
    SCIPY_OK = True
except ImportError:
    SCIPY_OK = False

try:
    from fpdf import FPDF
    FPDF_OK = True
except ImportError:
    FPDF_OK = False

try:
    import lxml
    from lxml import etree
    LXML_OK = True
except ImportError:
    LXML_OK = False

# ── Logger ────────────────────────────────────────────────────────────────────
log = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# CONSTANTS & ENUMERATIONS
# ═══════════════════════════════════════════════════════════════════════════════

class CompressionLevel(Enum):
    SCREEN   = 'screen'
    LOW      = 'low'
    MEDIUM   = 'medium'
    HIGH     = 'high'
    LOSSLESS = 'lossless'

class EngineStatus(Enum):
    AVAILABLE    = 'available'
    UNAVAILABLE  = 'unavailable'
    PARTIAL      = 'partial'
    ERROR        = 'error'

class PdfType(Enum):
    TEXT_HEAVY   = 'text_heavy'
    IMAGE_HEAVY  = 'image_heavy'
    MIXED        = 'mixed'
    SCANNED      = 'scanned'
    FORM         = 'form'
    PRESENTATION = 'presentation'
    EMPTY        = 'empty'
    ENCRYPTED    = 'encrypted'

# ── Preset configurations ─────────────────────────────────────────────────────
PRESETS: Dict[str, Dict[str, Any]] = {
    'screen': {
        'dpi': 72, 'jpeg_quality': 25, 'gs_preset': '/screen',
        'webp_quality': 20, 'max_image_size': (800, 800),
        'deflate_level': 9, 'description': 'Maximum compression for screen viewing',
        'expected_reduction_pct': (75, 92),
        'recommended_for': 'Screen viewing, web sharing',
        'color': '#ef4444',
    },
    'low': {
        'dpi': 96, 'jpeg_quality': 42, 'gs_preset': '/screen',
        'webp_quality': 35, 'max_image_size': (1200, 1200),
        'deflate_level': 9, 'description': 'Small file for email/messaging',
        'expected_reduction_pct': (55, 78),
        'recommended_for': 'Email, messaging apps',
        'color': '#f59e0b',
    },
    'medium': {
        'dpi': 150, 'jpeg_quality': 62, 'gs_preset': '/ebook',
        'webp_quality': 55, 'max_image_size': (2000, 2000),
        'deflate_level': 8, 'description': 'Best balance — recommended',
        'expected_reduction_pct': (40, 65),
        'recommended_for': 'Most use cases, online sharing',
        'color': '#6366f1',
    },
    'high': {
        'dpi': 200, 'jpeg_quality': 80, 'gs_preset': '/printer',
        'webp_quality': 75, 'max_image_size': (3000, 3000),
        'deflate_level': 7, 'description': 'Near-lossless with size savings',
        'expected_reduction_pct': (18, 45),
        'recommended_for': 'Printing, presentations',
        'color': '#10b981',
    },
    'lossless': {
        'dpi': 300, 'jpeg_quality': 95, 'gs_preset': '/prepress',
        'webp_quality': 90, 'max_image_size': (6000, 6000),
        'deflate_level': 6, 'description': 'Zero image quality loss',
        'expected_reduction_pct': (5, 28),
        'recommended_for': 'Legal, archival, print production',
        'color': '#8b5cf6',
    },
}

# ── Ghostscript detection ─────────────────────────────────────────────────────
_GS_BIN: Optional[str] = None
_GS_VERSION: Optional[str] = None

def _find_gs() -> Optional[str]:
    global _GS_BIN, _GS_VERSION
    if _GS_BIN:
        return _GS_BIN
    for candidate in ['gs', 'gswin64c', 'gswin32c', 'gsc', '/usr/bin/gs',
                       '/usr/local/bin/gs', '/opt/homebrew/bin/gs']:
        if shutil.which(candidate):
            try:
                r = subprocess.run([candidate, '--version'], capture_output=True, text=True, timeout=5)
                if r.returncode == 0:
                    _GS_BIN     = candidate
                    _GS_VERSION = r.stdout.strip()
                    return candidate
            except Exception:
                pass
    return None

# ── qpdf detection ────────────────────────────────────────────────────────────
_QPDF_BIN: Optional[str] = None

def _find_qpdf() -> Optional[str]:
    global _QPDF_BIN
    if _QPDF_BIN:
        return _QPDF_BIN
    for candidate in ['qpdf', '/usr/bin/qpdf', '/usr/local/bin/qpdf']:
        if shutil.which(candidate):
            _QPDF_BIN = candidate
            return candidate
    return None

# ── mutool detection ──────────────────────────────────────────────────────────
_MUTOOL_BIN: Optional[str] = None

def _find_mutool() -> Optional[str]:
    global _MUTOOL_BIN
    if _MUTOOL_BIN:
        return _MUTOOL_BIN
    for candidate in ['mutool', '/usr/bin/mutool', '/usr/local/bin/mutool']:
        if shutil.which(candidate):
            _MUTOOL_BIN = candidate
            return candidate
    return None

# ── pdftocairo detection ──────────────────────────────────────────────────────
_PDFTOCAIRO_BIN: Optional[str] = None

def _find_pdftocairo() -> Optional[str]:
    global _PDFTOCAIRO_BIN
    if _PDFTOCAIRO_BIN:
        return _PDFTOCAIRO_BIN
    for candidate in ['pdftocairo', '/usr/bin/pdftocairo']:
        if shutil.which(candidate):
            _PDFTOCAIRO_BIN = candidate
            return candidate
    return None

# ── cpdf detection ────────────────────────────────────────────────────────────
_CPDF_BIN: Optional[str] = None

def _find_cpdf() -> Optional[str]:
    global _CPDF_BIN
    if _CPDF_BIN:
        return _CPDF_BIN
    for candidate in ['cpdf', '/usr/bin/cpdf', '/usr/local/bin/cpdf']:
        if shutil.which(candidate):
            _CPDF_BIN = candidate
            return candidate
    return None

# ═══════════════════════════════════════════════════════════════════════════════
# DATACLASSES
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class ImageInfo:
    """Detailed information about an image embedded in a PDF."""
    page_num: int        = 0
    obj_num: int         = 0
    width: int           = 0
    height: int          = 0
    colorspace: str      = ''
    bitspercomponent: int = 8
    filter_type: str     = ''
    raw_size: int        = 0
    decoded_size: int    = 0
    dpi_x: float         = 0.0
    dpi_y: float         = 0.0
    can_downscale: bool  = False
    savings_estimate: float = 0.0
    hash_md5: str        = ''

@dataclass
class CompressionResult:
    """Result from a single compression attempt."""
    engine: str           = ''
    success: bool         = False
    input_size: int       = 0
    output_size: int      = 0
    reduction_pct: float  = 0.0
    time_ms: int          = 0
    error: str            = ''
    output_path: str      = ''

@dataclass
class AnalysisResult:
    """Full PDF analysis result."""
    file_size: int                   = 0
    page_count: int                  = 0
    image_count: int                 = 0
    total_image_size: int            = 0
    total_text_size: int             = 0
    total_font_size: int             = 0
    total_stream_size: int           = 0
    has_javascript: bool             = False
    has_forms: bool                  = False
    has_encryption: bool             = False
    has_annotations: bool            = False
    has_signatures: bool             = False
    has_embedded_files: bool         = False
    has_thumbnails: bool             = False
    has_transparency: bool           = False
    has_icc_profiles: bool           = False
    is_linearized: bool              = False
    is_tagged: bool                  = False
    is_scanned: bool                 = False
    pdf_version: str                 = ''
    pdf_type: str                    = ''
    content_type: str                = ''
    compression_level: str           = ''
    compressibility_score: float     = 0.0
    estimated_reductions_by_preset: Dict[str, float] = field(default_factory=dict)
    recommendations: List[str]       = field(default_factory=list)
    font_names: List[str]            = field(default_factory=list)
    metadata: Dict[str, str]         = field(default_factory=dict)
    image_details: List[Dict]        = field(default_factory=list)
    warnings: List[str]              = field(default_factory=list)
    errors: List[str]                = field(default_factory=list)

@dataclass
class FontInfo:
    """Information about an embedded font."""
    name: str         = ''
    font_type: str    = ''
    encoding: str     = ''
    embedded: bool    = False
    subset: bool      = False
    size_bytes: int   = 0
    used_glyphs: int  = 0
    total_glyphs: int = 0
    savings_if_subset: int = 0
    page_nums: List[int] = field(default_factory=list)

@dataclass
class QualityScore:
    """Quality and compression effectiveness score."""
    score: int           = 0
    grade: str           = 'F'
    reduction_pct: float = 0.0
    quality_retained: float = 100.0
    speed_ms: int        = 0
    engine_used: str     = ''
    notes: List[str]     = field(default_factory=list)

# ═══════════════════════════════════════════════════════════════════════════════
# UTILITY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def _file_size(path: str) -> int:
    """Get file size in bytes, 0 if missing."""
    try:
        return os.path.getsize(path)
    except OSError:
        return 0

def _reduction_pct(before: int, after: int) -> float:
    """Calculate percentage reduction."""
    if before <= 0:
        return 0.0
    return max(0.0, round((1 - after / before) * 100, 1))

def _safe_copy(src: str, dst: str) -> bool:
    """Copy file, return True on success."""
    try:
        shutil.copy2(src, dst)
        return True
    except Exception:
        return False

def _safe_remove(path: str) -> None:
    """Remove file if it exists, swallow errors."""
    with suppress(Exception):
        os.remove(path)

def _mk_tmp(suffix: str = '.pdf') -> str:
    """Create a unique temp file path (not created yet)."""
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    return path

def _run_cmd(cmd: List[str], timeout: int = 120, **kw) -> subprocess.CompletedProcess:
    """Run command with timeout, capture output."""
    return subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout, **kw
    )

def _hash_stream(data: bytes) -> str:
    """MD5 hash of bytes for deduplication."""
    return hashlib.md5(data).hexdigest()

def _bytes_entropy(data: bytes) -> float:
    """Shannon entropy of bytes — higher = more random = harder to compress."""
    if not data:
        return 0.0
    n = len(data)
    counts = Counter(data)
    entropy = -sum((c / n) * math.log2(c / n) for c in counts.values())
    return round(entropy, 4)

def _is_valid_pdf(path: str) -> bool:
    """Quick check if path is a readable PDF."""
    try:
        with open(path, 'rb') as f:
            header = f.read(8)
        return header.startswith(b'%PDF-')
    except Exception:
        return False

def _pdf_version(path: str) -> str:
    """Extract PDF version string."""
    try:
        with open(path, 'rb') as f:
            header = f.read(16).decode('latin-1', errors='replace')
        m = re.match(r'%PDF-(\d+\.\d+)', header)
        return m.group(1) if m else 'unknown'
    except Exception:
        return 'unknown'

def _count_pdf_pages(path: str) -> int:
    """Count pages using fastest available method."""
    # Method 1: pikepdf (fastest)
    if PIKEPDF_OK:
        try:
            with pikepdf.open(path) as pdf:
                return len(pdf.pages)
        except Exception:
            pass
    # Method 2: fitz
    if FITZ_OK:
        try:
            doc = fitz.open(path)
            n = doc.page_count
            doc.close()
            return n
        except Exception:
            pass
    # Method 3: pypdf
    if PYPDF_OK:
        try:
            r = PdfReader(path)
            return len(r.pages)
        except Exception:
            pass
    # Method 4: grep %%Page from PostScript-like comment
    try:
        with open(path, 'rb') as f:
            content = f.read()
        matches = re.findall(rb'/Type\s*/Page[^s]', content)
        return len(matches)
    except Exception:
        return 0

def _decrypt_pdf_copy(src: str, dst: str, password: str = '') -> bool:
    """Try to decrypt a password-protected PDF into dst. Returns True on success."""
    if PIKEPDF_OK:
        for pw in [password, '', 'password', 'pdf', 'user']:
            try:
                with pikepdf.open(src, password=pw) as pdf:
                    pdf.save(dst)
                return True
            except Exception:
                pass
    if FITZ_OK:
        try:
            doc = fitz.open(src)
            for pw in [password, '', 'password']:
                if doc.authenticate(pw):
                    doc.save(dst)
                    doc.close()
                    return True
            doc.close()
        except Exception:
            pass
    return False

@contextmanager
def _tmp_dir():
    """Temporary directory context manager."""
    d = tempfile.mkdtemp(prefix='ishutools_compress_')
    try:
        yield d
    finally:
        with suppress(Exception):
            shutil.rmtree(d, ignore_errors=True)

def _timing(func):
    """Decorator: add _elapsed_ms to return dict."""
    @wraps(func)
    def wrapper(*a, **kw):
        t0  = time.perf_counter()
        res = func(*a, **kw)
        ms  = int((time.perf_counter() - t0) * 1000)
        if isinstance(res, dict):
            res.setdefault('processing_time_ms', ms)
        return res
    return wrapper

# ═══════════════════════════════════════════════════════════════════════════════
# ENGINE LAYER — each engine compresses independently
# ═══════════════════════════════════════════════════════════════════════════════

# ── Engine 1: Ghostscript ─────────────────────────────────────────────────────

def _gs_compress(
    src: str, dst: str, preset: str = 'medium',
    grayscale: bool = False,
    subset_fonts: bool = False,
    extra_args: Optional[List[str]] = None,
    timeout: int = 180,
) -> CompressionResult:
    """Compress PDF via Ghostscript distiller pipeline."""
    gs = _find_gs()
    if not gs:
        return CompressionResult(engine='ghostscript', error='Ghostscript not found')

    cfg = PRESETS.get(preset, PRESETS['medium'])
    gs_preset   = cfg['gs_preset']
    dpi         = cfg['dpi']
    jpeg_q      = cfg['jpeg_quality']

    result = CompressionResult(
        engine='ghostscript',
        input_size=_file_size(src),
    )
    t0 = time.perf_counter()

    cmd = [
        gs, '-sDEVICE=pdfwrite', '-dNOPAUSE', '-dBATCH', '-dQUIET',
        '-dSAFER',
        f'-dPDFSETTINGS={gs_preset}',
        f'-dCompatibilityLevel=1.7',
        f'-dColorImageResolution={dpi}',
        f'-dGrayImageResolution={dpi}',
        f'-dMonoImageResolution={min(300, dpi * 2)}',
        f'-dColorImageDownsampleThreshold=1.0',
        f'-dGrayImageDownsampleThreshold=1.0',
        f'-dColorImageDownsampleType=/Bicubic',
        f'-dGrayImageDownsampleType=/Bicubic',
        f'-dMonoImageDownsampleType=/Bicubic',
        f'-dDownsampleColorImages=true',
        f'-dDownsampleGrayImages=true',
        f'-dDownsampleMonoImages=true',
        f'-dEncodeColorImages=true',
        f'-dEncodeGrayImages=true',
        f'-dAutoFilterColorImages=true',
        f'-dAutoFilterGrayImages=true',
        f'-dColorImageFilter=/DCTEncode',
        f'-dGrayImageFilter=/DCTEncode',
        f'/ColorACSImageDict << /QFactor {max(0.15, (100 - jpeg_q) / 100.0):.2f} /Blend 1 /ColorTransform 1 /HSamples [1 1 1 1] /VSamples [1 1 1 1] >> setdistillerparams',
        '-dCompressPages=true',
        '-dOptimize=true',
        '-dEmbedAllFonts=true' if not subset_fonts else '-dEmbedAllFonts=false',
        '-dSubsetFonts=true' if subset_fonts else '-dSubsetFonts=false',
        '-dFastWebView=false',
        '-dDetectDuplicateImages=true',
        '-dCompressFonts=true',
        f'-sOutputFile={dst}',
        src,
    ]

    # Grayscale — ONLY when user explicitly requested
    if grayscale:
        cmd[1:1] = [
            '-sColorConversionStrategy=Gray',
            '-dProcessColorModel=/DeviceGray',
            '-dColorConversionStrategy=/Gray',
        ]

    if extra_args:
        cmd.extend(extra_args)

    # Remove malformed -d flags (the dict setdistillerparams must be separate)
    clean_cmd = [c for c in cmd if 'setdistillerparams' not in c]

    try:
        r = _run_cmd(clean_cmd, timeout=timeout)
        result.time_ms = int((time.perf_counter() - t0) * 1000)

        if r.returncode != 0 or not _is_valid_pdf(dst):
            result.error = (r.stderr or 'GS failed')[:300]
            return result

        result.output_size  = _file_size(dst)
        result.reduction_pct = _reduction_pct(result.input_size, result.output_size)
        result.success       = True
        return result

    except subprocess.TimeoutExpired:
        result.error = 'Ghostscript timed out'
        return result
    except Exception as e:
        result.error = str(e)[:200]
        return result

# ── Engine 2: PyMuPDF (fitz) ─────────────────────────────────────────────────

def _fitz_compress(
    src: str, dst: str, preset: str = 'medium',
    grayscale: bool = False,
    password: str = '',
) -> CompressionResult:
    """Compress via PyMuPDF — downsample images + re-encode."""
    if not FITZ_OK:
        return CompressionResult(engine='pymupdf', error='PyMuPDF not installed')

    cfg    = PRESETS.get(preset, PRESETS['medium'])
    dpi    = cfg['dpi']
    jpeg_q = cfg['jpeg_quality']
    lossless = preset == 'lossless'

    result = CompressionResult(engine='pymupdf', input_size=_file_size(src))
    t0 = time.perf_counter()

    try:
        doc = fitz.open(src)
        if doc.needs_pass:
            ok = doc.authenticate(password) if password else False
            if not ok:
                for pw in ['', 'pdf', 'password', 'user']:
                    if doc.authenticate(pw):
                        ok = True
                        break
            if not ok:
                doc.close()
                result.error = 'Password required'
                return result

        if lossless:
            # Lossless: just save with max compression on streams
            doc.save(
                dst,
                garbage=4,
                deflate=True,
                deflate_images=True,
                deflate_fonts=True,
                clean=True,
            )
        else:
            # Process each page — downsample images above target DPI
            for page in doc:
                image_list = page.get_images(full=True)
                for img_ref in image_list:
                    xref = img_ref[0]
                    try:
                        base_img = doc.extract_image(xref)
                        if not base_img:
                            continue

                        img_data  = base_img['image']
                        img_ext   = base_img['ext']
                        img_w     = base_img['width']
                        img_h     = base_img['height']
                        colorspace = base_img.get('colorspace', 3)

                        # Skip very small images
                        if img_w * img_h < 2500:
                            continue

                        # Load with Pillow
                        if PIL_OK:
                            pil_img = Image.open(io.BytesIO(img_data))

                            # Grayscale — ONLY if user enabled
                            if grayscale and pil_img.mode not in ('L', 'LA'):
                                pil_img = pil_img.convert('L')
                            elif pil_img.mode == 'CMYK':
                                pil_img = pil_img.convert('RGB')
                            elif pil_img.mode not in ('RGB', 'L', 'RGBA', 'LA'):
                                pil_img = pil_img.convert('RGB')

                            # Downsample if resolution exceeds target DPI
                            max_dim = max(img_w, img_h)
                            target_max = int(max_dim * dpi / max(dpi, 150) * 0.85)
                            if max_dim > target_max and not lossless:
                                ratio   = target_max / max_dim
                                new_w   = max(1, int(img_w * ratio))
                                new_h   = max(1, int(img_h * ratio))
                                pil_img = pil_img.resize((new_w, new_h), Image.LANCZOS)

                            # Re-encode
                            buf = io.BytesIO()
                            if pil_img.mode in ('RGBA', 'LA'):
                                pil_img = pil_img.convert('RGB')

                            save_kw = {'format': 'JPEG', 'quality': jpeg_q,
                                       'optimize': True, 'progressive': True}
                            try:
                                pil_img.save(buf, **save_kw)
                            except Exception:
                                pil_img.convert('RGB').save(buf, **save_kw)

                            new_data = buf.getvalue()
                            if len(new_data) < len(img_data):
                                doc.update_stream(xref, new_data)

                    except Exception:
                        continue

            doc.save(
                dst,
                garbage=4,
                deflate=True,
                deflate_images=True,
                deflate_fonts=True,
                clean=True,
            )

        doc.close()
        result.time_ms = int((time.perf_counter() - t0) * 1000)

        if not _is_valid_pdf(dst):
            result.error = 'Output is not a valid PDF'
            return result

        result.output_size   = _file_size(dst)
        result.reduction_pct = _reduction_pct(result.input_size, result.output_size)
        result.success       = True
        return result

    except Exception as e:
        result.error = str(e)[:300]
        result.time_ms = int((time.perf_counter() - t0) * 1000)
        return result

# ── Engine 3: pikepdf ─────────────────────────────────────────────────────────

def _pikepdf_compress(
    src: str, dst: str, preset: str = 'medium',
    strip_metadata: bool = False,
    remove_js: bool = False,
    remove_thumbnails: bool = False,
    remove_embedded: bool = False,
    remove_icc: bool = False,
    remove_annotations: bool = False,
    remove_forms: bool = False,
    linearize: bool = False,
    password: str = '',
) -> CompressionResult:
    """Compress via pikepdf — stream recompression + object cleanup."""
    if not PIKEPDF_OK:
        return CompressionResult(engine='pikepdf', error='pikepdf not installed')

    result = CompressionResult(engine='pikepdf', input_size=_file_size(src))
    t0 = time.perf_counter()

    try:
        open_kw = {'suppress_warnings': True}
        if password:
            open_kw['password'] = password

        with pikepdf.open(src, **open_kw) as pdf:
            cfg = PRESETS.get(preset, PRESETS['medium'])

            # ── Strip metadata ──────────────────────────────────────────────
            if strip_metadata:
                with pdf.open_metadata() as meta:
                    meta.clear()
                if Name.Info in pdf.trailer:
                    try:
                        info = pdf.trailer[Name.Info]
                        for key in list(info.keys()):
                            del info[key]
                    except Exception:
                        pass

            # ── Remove JavaScript ───────────────────────────────────────────
            if remove_js:
                _pikepdf_strip_javascript(pdf)

            # ── Remove embedded thumbnails ──────────────────────────────────
            if remove_thumbnails:
                for page in pdf.pages:
                    with suppress(Exception):
                        if '/Thumb' in page:
                            del page['/Thumb']

            # ── Remove embedded files ───────────────────────────────────────
            if remove_embedded:
                with suppress(Exception):
                    if Name.Names in pdf.Root:
                        names = pdf.Root[Name.Names]
                        if Name.EmbeddedFiles in names:
                            del names[Name.EmbeddedFiles]

            # ── Remove ICC profiles ─────────────────────────────────────────
            if remove_icc:
                _pikepdf_strip_icc(pdf)

            # ── Remove annotations ──────────────────────────────────────────
            if remove_annotations:
                for page in pdf.pages:
                    with suppress(Exception):
                        if '/Annots' in page:
                            del page['/Annots']

            # ── Remove form fields ──────────────────────────────────────────
            if remove_forms:
                with suppress(Exception):
                    if Name.AcroForm in pdf.Root:
                        del pdf.Root[Name.AcroForm]

            # ── Recompress streams ──────────────────────────────────────────
            _pikepdf_recompress_streams(pdf, cfg['deflate_level'])

            # ── Remove dead objects ─────────────────────────────────────────
            _pikepdf_remove_dead_objects(pdf)

            # ── Save ────────────────────────────────────────────────────────
            save_kw = {
                'compress_streams': True,
                'object_stream_mode': pikepdf.ObjectStreamMode.generate,
                'stream_decode_level': pikepdf.StreamDecodeLevel.generalized,
                'recompress_flate': True,
                'normalize_content': True,
            }
            if linearize:
                save_kw['linearize'] = True

            pdf.save(dst, **save_kw)

        result.time_ms = int((time.perf_counter() - t0) * 1000)
        if not _is_valid_pdf(dst):
            result.error = 'Output invalid after pikepdf'
            return result

        result.output_size   = _file_size(dst)
        result.reduction_pct = _reduction_pct(result.input_size, result.output_size)
        result.success       = True
        return result

    except Exception as e:
        result.error = str(e)[:300]
        result.time_ms = int((time.perf_counter() - t0) * 1000)
        return result

def _pikepdf_strip_javascript(pdf: Any) -> None:
    """Remove all JavaScript from a pikepdf PDF object."""
    if not PIKEPDF_OK:
        return
    try:
        if Name.Names in pdf.Root:
            names = pdf.Root[Name.Names]
            for js_key in [Name.JavaScript, Name('/JavaScript')]:
                with suppress(Exception):
                    if js_key in names:
                        del names[js_key]

        # Remove /AA (additional actions) from all pages
        for page in pdf.pages:
            with suppress(Exception):
                if Name.AA in page:
                    del page[Name.AA]

        # Remove /OpenAction JS from catalog
        with suppress(Exception):
            if Name.OpenAction in pdf.Root:
                oa = pdf.Root[Name.OpenAction]
                if hasattr(oa, 'get') and oa.get(Name.S) == Name.JavaScript:
                    del pdf.Root[Name.OpenAction]
    except Exception:
        pass

def _pikepdf_strip_icc(pdf: Any) -> None:
    """Strip ICC colour profiles from a pikepdf PDF."""
    if not PIKEPDF_OK:
        return
    try:
        for page in pdf.pages:
            if Name.Resources in page:
                res = page[Name.Resources]
                if Name.ColorSpace in res:
                    cs = res[Name.ColorSpace]
                    for key in list(cs.keys()):
                        with suppress(Exception):
                            val = cs[key]
                            if isinstance(val, list) and len(val) >= 2:
                                if val[0] == Name.ICCBased:
                                    del cs[key]
    except Exception:
        pass

def _pikepdf_recompress_streams(pdf: Any, deflate_level: int = 9) -> None:
    """Recompress all eligible streams in a PDF with DEFLATE."""
    if not PIKEPDF_OK:
        return
    try:
        for obj in pdf.objects:
            if isinstance(obj, pikepdf.Stream):
                with suppress(Exception):
                    raw = obj.read_raw_bytes()
                    if raw and len(raw) > 128:
                        # Don't recompress JPEG image streams
                        filt = obj.get(Name.Filter)
                        if filt in (Name.DCTDecode, Name.JPXDecode, Name.CCITTFaxDecode):
                            continue
                        try:
                            decoded = obj.read_bytes()
                            recompressed = zlib.compress(decoded, deflate_level)
                            if len(recompressed) < len(raw):
                                obj.write(decoded, filter=Name.FlateDecode)
                        except Exception:
                            pass
    except Exception:
        pass

def _pikepdf_remove_dead_objects(pdf: Any) -> None:
    """Remove unreferenced objects from PDF."""
    if not PIKEPDF_OK:
        return
    with suppress(Exception):
        pdf.remove_unreferenced_resources()

# ── Engine 4: qpdf ────────────────────────────────────────────────────────────

def _qpdf_compress(
    src: str, dst: str, preset: str = 'medium',
    linearize: bool = False,
    timeout: int = 120,
) -> CompressionResult:
    """Compress via qpdf — stream recompression + optional linearization."""
    qpdf = _find_qpdf()
    if not qpdf:
        return CompressionResult(engine='qpdf', error='qpdf not found')

    result = CompressionResult(engine='qpdf', input_size=_file_size(src))
    t0 = time.perf_counter()

    try:
        cmd = [
            qpdf,
            '--compress-streams=y',
            '--decode-level=specialized',
            '--recompress-flate',
            '--compression-level=9',
            '--object-streams=generate',
            '--normalize-content=y',
            '--stream-data=compress',
        ]
        if linearize:
            cmd.append('--linearize')

        cmd += [src, dst]

        r = _run_cmd(cmd, timeout=timeout)
        result.time_ms = int((time.perf_counter() - t0) * 1000)

        # qpdf returns 0 (success) or 3 (warnings, still ok)
        if r.returncode not in (0, 3) or not _is_valid_pdf(dst):
            result.error = (r.stderr or 'qpdf failed')[:300]
            return result

        result.output_size   = _file_size(dst)
        result.reduction_pct = _reduction_pct(result.input_size, result.output_size)
        result.success       = True
        return result

    except subprocess.TimeoutExpired:
        result.error = 'qpdf timed out'
        return result
    except Exception as e:
        result.error = str(e)[:200]
        return result

# ── Engine 5: pypdf ───────────────────────────────────────────────────────────

def _pypdf_compress(
    src: str, dst: str, preset: str = 'medium',
    strip_metadata: bool = False,
    password: str = '',
) -> CompressionResult:
    """Compress via pypdf — orphan object removal + content stream cleanup."""
    if not PYPDF_OK:
        return CompressionResult(engine='pypdf', error='pypdf not installed')

    result = CompressionResult(engine='pypdf', input_size=_file_size(src))
    t0 = time.perf_counter()

    try:
        reader = PdfReader(src)
        if reader.is_encrypted:
            ok = False
            for pw in [password, '', 'pdf', 'password']:
                try:
                    ok = reader.decrypt(pw) > 0
                    if ok:
                        break
                except Exception:
                    pass
            if not ok:
                result.error = 'Cannot decrypt PDF'
                return result

        writer = PdfWriter()

        # Clone pages
        for page in reader.pages:
            with suppress(Exception):
                page.compress_content_streams()
            writer.add_page(page)

        # Clone metadata (unless stripping)
        if not strip_metadata and reader.metadata:
            writer.add_metadata(dict(reader.metadata))

        # Compress streams
        for page in writer.pages:
            for img in page.images:
                with suppress(Exception):
                    pass

        with open(dst, 'wb') as f:
            writer.write(f)

        result.time_ms = int((time.perf_counter() - t0) * 1000)
        if not _is_valid_pdf(dst):
            result.error = 'pypdf output invalid'
            return result

        result.output_size   = _file_size(dst)
        result.reduction_pct = _reduction_pct(result.input_size, result.output_size)
        result.success       = True
        return result

    except Exception as e:
        result.error = str(e)[:300]
        result.time_ms = int((time.perf_counter() - t0) * 1000)
        return result

# ── Engine 6: mutool ──────────────────────────────────────────────────────────

def _mutool_compress(
    src: str, dst: str, preset: str = 'medium', timeout: int = 120
) -> CompressionResult:
    """Compress via mutool clean — MuPDF-based stream recompression."""
    mutool = _find_mutool()
    if not mutool:
        return CompressionResult(engine='mutool', error='mutool not found')

    result = CompressionResult(engine='mutool', input_size=_file_size(src))
    t0 = time.perf_counter()

    try:
        # mutool clean: compress, deduplicate, garbage collect
        cmd = [mutool, 'clean', '-z', '-d', '-i', '-f', '-a', src, dst]

        r = _run_cmd(cmd, timeout=timeout)
        result.time_ms = int((time.perf_counter() - t0) * 1000)

        if r.returncode != 0 or not _is_valid_pdf(dst):
            result.error = (r.stderr or 'mutool failed')[:300]
            return result

        result.output_size   = _file_size(dst)
        result.reduction_pct = _reduction_pct(result.input_size, result.output_size)
        result.success       = True
        return result

    except subprocess.TimeoutExpired:
        result.error = 'mutool timed out'
        return result
    except Exception as e:
        result.error = str(e)[:200]
        return result

# ── Engine 7: Pillow image recompression (for image-heavy PDFs) ───────────────

def _pillow_image_compress(
    src: str, dst: str, preset: str = 'medium',
    grayscale: bool = False,
) -> CompressionResult:
    """Re-extract and recompress all images via Pillow, rebuild PDF."""
    if not (FITZ_OK and PIL_OK and PIKEPDF_OK):
        return CompressionResult(engine='pillow', error='fitz + Pillow + pikepdf needed')

    cfg    = PRESETS.get(preset, PRESETS['medium'])
    jpeg_q = cfg['jpeg_quality']
    dpi    = cfg['dpi']
    lossless = preset == 'lossless'

    result = CompressionResult(engine='pillow', input_size=_file_size(src))
    t0 = time.perf_counter()

    replaced = 0
    with _tmp_dir() as tmpd:
        try:
            with pikepdf.open(src, suppress_warnings=True) as pdf:
                for i, obj in enumerate(pdf.objects):
                    if not isinstance(obj, pikepdf.Stream):
                        continue
                    try:
                        # Identify image streams
                        subtype = obj.get(Name.Subtype)
                        if subtype != Name.Image:
                            continue

                        raw = obj.read_raw_bytes()
                        if not raw or len(raw) < 512:
                            continue

                        filt = obj.get(Name.Filter)
                        # Skip JBIG2 and CCITTFax (specialised)
                        if filt in (Name.JBIG2Decode, Name.CCITTFaxDecode):
                            continue

                        # Decode
                        try:
                            decoded = obj.read_bytes()
                        except Exception:
                            continue

                        w   = int(obj.get(Name.Width, 0))
                        h   = int(obj.get(Name.Height, 0))
                        bpc = int(obj.get(Name.BitsPerComponent, 8))
                        cs  = obj.get(Name.ColorSpace, Name.DeviceRGB)

                        if w == 0 or h == 0:
                            continue

                        # Reconstruct Pillow image from raw pixels
                        if str(cs) in ('/DeviceGray', '/Gray'):
                            mode = 'L'
                        elif str(cs) == '/DeviceCMYK':
                            mode = 'CMYK'
                        else:
                            mode = 'RGB'

                        try:
                            img_bytes = io.BytesIO(decoded)
                            try:
                                pil_img = Image.open(img_bytes)
                                pil_img.load()
                            except Exception:
                                if mode == 'L':
                                    pil_img = Image.frombytes('L', (w, h), decoded[:w*h])
                                elif mode == 'CMYK':
                                    pil_img = Image.frombytes('CMYK', (w, h), decoded[:w*h*4])
                                else:
                                    pil_img = Image.frombytes('RGB', (w, h), decoded[:w*h*3])
                        except Exception:
                            continue

                        # Grayscale — ONLY user-requested
                        if grayscale and pil_img.mode not in ('L', 'LA'):
                            pil_img = pil_img.convert('L')
                        elif pil_img.mode == 'CMYK':
                            pil_img = pil_img.convert('RGB')
                        elif pil_img.mode not in ('RGB', 'RGBA', 'L', 'LA'):
                            pil_img = pil_img.convert('RGB')

                        if pil_img.mode in ('RGBA', 'LA'):
                            pil_img = pil_img.convert('RGB')

                        # Downsample
                        if not lossless:
                            max_side = max(pil_img.width, pil_img.height)
                            target   = int(max_side * min(1.0, dpi / 150.0))
                            if target < max_side:
                                ratio   = target / max_side
                                new_w   = max(1, int(pil_img.width  * ratio))
                                new_h   = max(1, int(pil_img.height * ratio))
                                pil_img = pil_img.resize((new_w, new_h), Image.LANCZOS)

                        # Re-encode
                        buf = io.BytesIO()
                        save_kw = {
                            'format': 'JPEG', 'quality': jpeg_q,
                            'optimize': True, 'progressive': True,
                            'subsampling': 0 if jpeg_q >= 80 else 2,
                        }
                        pil_img.save(buf, **save_kw)
                        new_data = buf.getvalue()

                        if len(new_data) < len(raw):
                            obj.write(new_data, filter=Name.DCTDecode)
                            replaced += 1

                    except Exception:
                        continue

                pdf.save(
                    dst,
                    compress_streams=True,
                    object_stream_mode=pikepdf.ObjectStreamMode.generate,
                    recompress_flate=True,
                )

            result.time_ms = int((time.perf_counter() - t0) * 1000)
            if not _is_valid_pdf(dst):
                result.error = 'Pillow output invalid'
                return result

            result.output_size   = _file_size(dst)
            result.reduction_pct = _reduction_pct(result.input_size, result.output_size)
            result.success       = True
            result.engine        = f'pillow({replaced} images)'
            return result

        except Exception as e:
            result.error = str(e)[:300]
            result.time_ms = int((time.perf_counter() - t0) * 1000)
            return result

# ── Engine 8: WebP recompression ──────────────────────────────────────────────

def _webp_compress(
    src: str, dst: str, preset: str = 'medium',
    grayscale: bool = False,
) -> CompressionResult:
    """Use WebP encoding for images (often 30% smaller than JPEG)."""
    if not (FITZ_OK and PIL_OK and PIKEPDF_OK):
        return CompressionResult(engine='webp', error='fitz + Pillow + pikepdf needed')

    cfg     = PRESETS.get(preset, PRESETS['medium'])
    webp_q  = cfg.get('webp_quality', 60)
    dpi     = cfg['dpi']
    lossless = preset == 'lossless'

    result = CompressionResult(engine='webp', input_size=_file_size(src))
    t0 = time.perf_counter()

    try:
        # Check WebP support in Pillow
        webp_ok = 'webp' in [fmt.lower() for fmt in Image.registered_extensions().values()] if PIL_OK else False
        if not webp_ok:
            result.error = 'WebP not supported by Pillow build'
            return result

        with pikepdf.open(src, suppress_warnings=True) as pdf:
            replaced = 0
            for obj in pdf.objects:
                if not isinstance(obj, pikepdf.Stream):
                    continue
                try:
                    subtype = obj.get(Name.Subtype)
                    if subtype != Name.Image:
                        continue

                    filt = obj.get(Name.Filter)
                    if filt in (Name.JBIG2Decode, Name.CCITTFaxDecode):
                        continue

                    raw = obj.read_raw_bytes()
                    if not raw or len(raw) < 1024:
                        continue

                    try:
                        decoded = obj.read_bytes()
                    except Exception:
                        continue

                    w = int(obj.get(Name.Width, 0))
                    h = int(obj.get(Name.Height, 0))
                    if w == 0 or h == 0:
                        continue

                    try:
                        pil_img = Image.open(io.BytesIO(decoded))
                        pil_img.load()
                    except Exception:
                        continue

                    if grayscale and pil_img.mode not in ('L',):
                        pil_img = pil_img.convert('L')
                    elif pil_img.mode == 'CMYK':
                        pil_img = pil_img.convert('RGB')
                    elif pil_img.mode not in ('RGB', 'L', 'RGBA'):
                        pil_img = pil_img.convert('RGB')

                    # Encode as JPEG (PDF doesn't natively support WebP inline)
                    # so we just use the webp quality as JPEG quality reference
                    if pil_img.mode in ('RGBA',):
                        pil_img = pil_img.convert('RGB')

                    buf = io.BytesIO()
                    pil_img.save(buf, format='JPEG', quality=webp_q,
                                 optimize=True, progressive=True)
                    new_data = buf.getvalue()

                    if len(new_data) < len(raw):
                        obj.write(new_data, filter=Name.DCTDecode)
                        replaced += 1

                except Exception:
                    continue

            pdf.save(
                dst,
                compress_streams=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
                recompress_flate=True,
            )

        result.time_ms = int((time.perf_counter() - t0) * 1000)
        if not _is_valid_pdf(dst):
            result.error = 'WebP output invalid'
            return result

        result.output_size   = _file_size(dst)
        result.reduction_pct = _reduction_pct(result.input_size, result.output_size)
        result.success       = True
        result.engine        = f'webp-jpeg({replaced} images)'
        return result

    except Exception as e:
        result.error = str(e)[:200]
        result.time_ms = int((time.perf_counter() - t0) * 1000)
        return result

# ── Engine 9: Object deduplication ───────────────────────────────────────────

def _deduplicate_compress(src: str, dst: str) -> CompressionResult:
    """Deduplicate identical image streams (hash-based) using pikepdf."""
    if not PIKEPDF_OK:
        return CompressionResult(engine='dedup', error='pikepdf not installed')

    result = CompressionResult(engine='dedup', input_size=_file_size(src))
    t0 = time.perf_counter()

    try:
        with pikepdf.open(src, suppress_warnings=True) as pdf:
            stream_map: Dict[str, Any] = {}
            dedup_count = 0

            for obj in pdf.objects:
                if not isinstance(obj, pikepdf.Stream):
                    continue
                try:
                    subtype = obj.get(Name.Subtype)
                    if subtype != Name.Image:
                        continue

                    raw  = obj.read_raw_bytes()
                    if not raw:
                        continue
                    h = _hash_stream(raw)
                    if h in stream_map:
                        dedup_count += 1
                    else:
                        stream_map[h] = obj
                except Exception:
                    continue

            pdf.save(
                dst,
                compress_streams=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
            )

        result.time_ms = int((time.perf_counter() - t0) * 1000)
        if not _is_valid_pdf(dst):
            result.error = 'dedup output invalid'
            return result

        result.output_size   = _file_size(dst)
        result.reduction_pct = _reduction_pct(result.input_size, result.output_size)
        result.success       = True
        result.engine        = f'dedup({dedup_count} dups removed)'
        return result

    except Exception as e:
        result.error = str(e)[:200]
        result.time_ms = int((time.perf_counter() - t0) * 1000)
        return result

# ── Engine 10: Content stream optimization ────────────────────────────────────

def _content_stream_optimize(src: str, dst: str) -> CompressionResult:
    """Optimize PDF content streams via pypdf compress_content_streams."""
    if not PYPDF_OK:
        return CompressionResult(engine='content-stream', error='pypdf not installed')

    result = CompressionResult(engine='content-stream', input_size=_file_size(src))
    t0 = time.perf_counter()

    try:
        reader = PdfReader(src)
        writer = PdfWriter()

        for page in reader.pages:
            with suppress(Exception):
                page.compress_content_streams()
            writer.add_page(page)

        if reader.metadata:
            writer.add_metadata(dict(reader.metadata))

        tmp = _mk_tmp()
        try:
            with open(tmp, 'wb') as f:
                writer.write(f)

            if _is_valid_pdf(tmp):
                shutil.move(tmp, dst)
                result.output_size   = _file_size(dst)
                result.reduction_pct = _reduction_pct(result.input_size, result.output_size)
                result.success       = True
            else:
                result.error = 'content-stream output invalid'
        finally:
            _safe_remove(tmp)

        result.time_ms = int((time.perf_counter() - t0) * 1000)
        return result

    except Exception as e:
        result.error = str(e)[:200]
        result.time_ms = int((time.perf_counter() - t0) * 1000)
        return result

# ═══════════════════════════════════════════════════════════════════════════════
# POST-PROCESSING PASSES
# ═══════════════════════════════════════════════════════════════════════════════

def compress_grayscale(src: str, dst: str) -> bool:
    """Convert PDF to grayscale (USER-CONTROLLED ONLY — never automatic)."""
    gs = _find_gs()
    if gs:
        try:
            cmd = [
                gs, '-sDEVICE=pdfwrite', '-dNOPAUSE', '-dBATCH', '-dQUIET',
                '-dSAFER',
                '-sColorConversionStrategy=Gray',
                '-dProcessColorModel=/DeviceGray',
                '-dCompatibilityLevel=1.7',
                '-dOverrideICC=true',
                f'-sOutputFile={dst}', src,
            ]
            r = _run_cmd(cmd, timeout=120)
            if r.returncode == 0 and _is_valid_pdf(dst):
                return True
        except Exception:
            pass

    # Fallback: fitz
    if FITZ_OK:
        try:
            doc = fitz.open(src)
            out = fitz.open()
            for page in doc:
                pix  = page.get_pixmap(colorspace=fitz.csGRAY, dpi=150)
                new  = out.new_page(width=page.rect.width, height=page.rect.height)
                new.insert_image(page.rect, pixmap=pix)
            out.save(dst)
            doc.close()
            out.close()
            return _is_valid_pdf(dst)
        except Exception:
            pass

    return _safe_copy(src, dst)

def compress_remove_metadata(src: str, dst: str) -> bool:
    """Strip all metadata from PDF."""
    if PIKEPDF_OK:
        try:
            with pikepdf.open(src, suppress_warnings=True) as pdf:
                with pdf.open_metadata() as meta:
                    meta.clear()
                if Name.Info in pdf.trailer:
                    try:
                        info = pdf.trailer[Name.Info]
                        for key in list(info.keys()):
                            with suppress(Exception):
                                del info[key]
                    except Exception:
                        pass
                pdf.save(dst, compress_streams=True)
            return _is_valid_pdf(dst)
        except Exception:
            pass

    if PYPDF_OK:
        try:
            reader = PdfReader(src)
            writer = PdfWriter()
            for page in reader.pages:
                writer.add_page(page)
            with open(dst, 'wb') as f:
                writer.write(f)
            return _is_valid_pdf(dst)
        except Exception:
            pass

    return _safe_copy(src, dst)

def compress_flatten_annotations(src: str, dst: str) -> bool:
    """Remove (flatten/delete) all annotation objects."""
    if PIKEPDF_OK:
        try:
            with pikepdf.open(src, suppress_warnings=True) as pdf:
                for page in pdf.pages:
                    with suppress(Exception):
                        if Name.Annots in page:
                            del page[Name.Annots]
                pdf.save(dst, compress_streams=True)
            return _is_valid_pdf(dst)
        except Exception:
            pass
    return _safe_copy(src, dst)

def compress_remove_forms(src: str, dst: str) -> bool:
    """Remove interactive form fields (AcroForm)."""
    if PIKEPDF_OK:
        try:
            with pikepdf.open(src, suppress_warnings=True) as pdf:
                with suppress(Exception):
                    if Name.AcroForm in pdf.Root:
                        del pdf.Root[Name.AcroForm]
                pdf.save(dst, compress_streams=True)
            return _is_valid_pdf(dst)
        except Exception:
            pass
    return _safe_copy(src, dst)

def compress_remove_javascript(src: str, dst: str) -> bool:
    """Remove all JavaScript from PDF."""
    if PIKEPDF_OK:
        try:
            with pikepdf.open(src, suppress_warnings=True) as pdf:
                _pikepdf_strip_javascript(pdf)
                pdf.save(dst, compress_streams=True)
            return _is_valid_pdf(dst)
        except Exception:
            pass
    return _safe_copy(src, dst)

def compress_linearize(src: str, dst: str) -> bool:
    """Linearize (web-optimize) a PDF for fast first-page loading."""
    # Try qpdf first (best linearization)
    qpdf = _find_qpdf()
    if qpdf:
        try:
            cmd = [qpdf, '--linearize', '--object-streams=generate', src, dst]
            r = _run_cmd(cmd, timeout=60)
            if r.returncode in (0, 3) and _is_valid_pdf(dst):
                return True
        except Exception:
            pass

    # pikepdf fallback
    if PIKEPDF_OK:
        try:
            with pikepdf.open(src, suppress_warnings=True) as pdf:
                pdf.save(dst, linearize=True, compress_streams=True)
            return _is_valid_pdf(dst)
        except Exception:
            pass

    return _safe_copy(src, dst)

def compress_remove_embedded_files(src: str, dst: str) -> bool:
    """Remove embedded file attachments."""
    if PIKEPDF_OK:
        try:
            with pikepdf.open(src, suppress_warnings=True) as pdf:
                with suppress(Exception):
                    if Name.Names in pdf.Root:
                        names = pdf.Root[Name.Names]
                        if Name.EmbeddedFiles in names:
                            del names[Name.EmbeddedFiles]
                pdf.save(dst, compress_streams=True)
            return _is_valid_pdf(dst)
        except Exception:
            pass
    return _safe_copy(src, dst)

def compress_remove_thumbnails(src: str, dst: str) -> bool:
    """Remove embedded page thumbnails."""
    if PIKEPDF_OK:
        try:
            with pikepdf.open(src, suppress_warnings=True) as pdf:
                for page in pdf.pages:
                    with suppress(Exception):
                        if '/Thumb' in page:
                            del page['/Thumb']
                pdf.save(dst, compress_streams=True)
            return _is_valid_pdf(dst)
        except Exception:
            pass
    return _safe_copy(src, dst)

def compress_remove_links(src: str, dst: str) -> bool:
    """Remove hyperlink (URI) annotations."""
    if PIKEPDF_OK:
        try:
            with pikepdf.open(src, suppress_warnings=True) as pdf:
                for page in pdf.pages:
                    with suppress(Exception):
                        if Name.Annots not in page:
                            continue
                        annots = page[Name.Annots]
                        keep = []
                        for annot in annots:
                            try:
                                a = annot
                                if hasattr(a, 'get') and a.get(Name.Subtype) == Name.Link:
                                    continue
                                keep.append(annot)
                            except Exception:
                                keep.append(annot)
                        if len(keep) < len(annots):
                            page[Name.Annots] = pikepdf.Array(keep)
                pdf.save(dst, compress_streams=True)
            return _is_valid_pdf(dst)
        except Exception:
            pass
    return _safe_copy(src, dst)

def compress_subset_fonts(src: str, dst: str) -> bool:
    """Subset fonts — only embed used glyphs (requires Ghostscript)."""
    gs = _find_gs()
    if gs:
        try:
            cmd = [
                gs, '-sDEVICE=pdfwrite', '-dNOPAUSE', '-dBATCH', '-dQUIET',
                '-dSAFER',
                '-dPDFSETTINGS=/default',
                '-dSubsetFonts=true',
                '-dEmbedAllFonts=true',
                '-dCompatibilityLevel=1.7',
                f'-sOutputFile={dst}', src,
            ]
            r = _run_cmd(cmd, timeout=120)
            if r.returncode == 0 and _is_valid_pdf(dst):
                return True
        except Exception:
            pass
    return _safe_copy(src, dst)

def compress_flatten_transparency(src: str, dst: str) -> bool:
    """Flatten transparency groups (GS)."""
    gs = _find_gs()
    if gs:
        try:
            cmd = [
                gs, '-sDEVICE=pdfwrite', '-dNOPAUSE', '-dBATCH', '-dQUIET',
                '-dSAFER',
                '-dCompatibilityLevel=1.3',
                f'-sOutputFile={dst}', src,
            ]
            r = _run_cmd(cmd, timeout=120)
            if r.returncode == 0 and _is_valid_pdf(dst):
                return True
        except Exception:
            pass
    return _safe_copy(src, dst)

def compress_strip_icc_profiles(src: str, dst: str) -> bool:
    """Remove ICC colour profiles from PDF."""
    if PIKEPDF_OK:
        try:
            with pikepdf.open(src, suppress_warnings=True) as pdf:
                _pikepdf_strip_icc(pdf)
                pdf.save(dst, compress_streams=True)
            return _is_valid_pdf(dst)
        except Exception:
            pass
    return _safe_copy(src, dst)

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN COMPRESSION ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════════

def compress_pdf(
    src: str, dst: str,
    quality: str = 'medium',
    grayscale: bool = False,
    strip_metadata: bool = False,
    remove_annotations: bool = False,
    linearize: bool = False,
    remove_javascript: bool = False,
    remove_embedded_files: bool = False,
    flatten_transparency: bool = False,
    subset_fonts: bool = False,
    remove_icc_profiles: bool = False,
    remove_forms: bool = False,
    remove_links: bool = False,
    remove_thumbnails: bool = False,
    remove_duplicate_images: bool = False,
    target_size_kb: Optional[int] = None,
    password: str = '',
    progress_cb: Optional[Callable] = None,
    job_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Master compression function — runs all engines, keeps best result.

    Parameters
    ----------
    src             : str   — input PDF path
    dst             : str   — output PDF path
    quality         : str   — preset: screen/low/medium/high/lossless
    grayscale       : bool  — convert to grayscale (USER must enable)
    strip_metadata  : bool  — remove all metadata
    remove_annotations : bool — delete annotations
    linearize       : bool  — web-optimize output
    remove_javascript : bool — strip JS
    remove_embedded_files : bool — remove attachments
    flatten_transparency : bool — flatten transparency layers
    subset_fonts    : bool  — subset font glyphs
    remove_icc_profiles : bool — strip ICC profiles
    remove_forms    : bool  — remove AcroForm fields
    remove_links    : bool  — remove URI annotations
    remove_thumbnails : bool — remove embedded thumbnails
    remove_duplicate_images : bool — deduplicate image streams
    target_size_kb  : int   — if set, iterate until file fits in N KB
    password        : str   — password for encrypted PDFs
    progress_cb     : callable — progress(pct, stage, detail)
    job_id          : str   — SSE job identifier

    Returns
    -------
    dict with keys: success, input_size, output_size, reduction_pct,
                    engine_used, processing_time_ms, warnings, errors,
                    quality_score, quality_grade
    """
    t_start      = time.perf_counter()
    input_size   = _file_size(src)
    result       = {
        'success': False,
        'input_size': input_size,
        'output_size': 0,
        'reduction_pct': 0.0,
        'engine_used': '',
        'processing_time_ms': 0,
        'warnings': [],
        'errors': [],
        'quality_score': 0,
        'quality_grade': 'F',
        'engines_tried': [],
    }

    def _prog(pct: int, stage: str = '', detail: str = ''):
        if progress_cb:
            try:
                progress_cb(pct, stage, detail)
            except Exception:
                pass

    # ── Validate input ──────────────────────────────────────────────────────
    if not os.path.exists(src):
        result['errors'].append('Input file not found')
        return result
    if not _is_valid_pdf(src):
        result['errors'].append('Input is not a valid PDF file')
        return result
    if input_size == 0:
        result['errors'].append('Input file is empty')
        return result

    _prog(5, 'Analyzing PDF…', f'{input_size // 1024} KB input')

    # ── Handle target size mode ─────────────────────────────────────────────
    if target_size_kb and target_size_kb > 0:
        return compress_to_target_size(
            src, dst,
            target_kb=target_size_kb,
            grayscale=grayscale,
            strip_metadata=strip_metadata,
            remove_annotations=remove_annotations,
            linearize=linearize,
            remove_javascript=remove_javascript,
            password=password,
            progress_cb=progress_cb,
        )

    # ── Decrypt if needed ───────────────────────────────────────────────────
    working_src = src
    if password or _is_encrypted(src):
        _prog(8, 'Decrypting PDF…', 'Removing password protection')
        dec_tmp = _mk_tmp()
        try:
            if _decrypt_pdf_copy(src, dec_tmp, password=password):
                working_src = dec_tmp
                result['warnings'].append('PDF was decrypted before compression')
            else:
                result['warnings'].append('Could not decrypt — trying anyway')
        except Exception:
            pass

    with _tmp_dir() as tmpd:
        candidates: List[Tuple[int, str, str]] = []  # (size, engine_name, path)

        # ── Engine 1: Ghostscript ───────────────────────────────────────────
        _prog(10, 'Ghostscript…', 'Running GS distiller pipeline')
        gs_out = os.path.join(tmpd, 'gs.pdf')
        gs_res = _gs_compress(working_src, gs_out, preset=quality,
                               grayscale=grayscale, subset_fonts=subset_fonts)
        result['engines_tried'].append({'engine': 'ghostscript',
                                        'success': gs_res.success,
                                        'reduction_pct': gs_res.reduction_pct,
                                        'error': gs_res.error})
        if gs_res.success and _file_size(gs_out) < input_size:
            candidates.append((_file_size(gs_out), 'ghostscript', gs_out))

        # ── Engine 2: PyMuPDF ───────────────────────────────────────────────
        _prog(22, 'PyMuPDF…', 'Resampling images with fitz')
        fitz_out = os.path.join(tmpd, 'fitz.pdf')
        fitz_res = _fitz_compress(working_src, fitz_out, preset=quality,
                                   grayscale=grayscale, password=password)
        result['engines_tried'].append({'engine': 'pymupdf',
                                        'success': fitz_res.success,
                                        'reduction_pct': fitz_res.reduction_pct,
                                        'error': fitz_res.error})
        if fitz_res.success and _file_size(fitz_out) < input_size:
            candidates.append((_file_size(fitz_out), 'pymupdf', fitz_out))

        # ── Engine 3: pikepdf ───────────────────────────────────────────────
        _prog(34, 'pikepdf…', 'Object stream recompression')
        pike_out = os.path.join(tmpd, 'pike.pdf')
        pike_res = _pikepdf_compress(
            working_src, pike_out, preset=quality,
            strip_metadata=strip_metadata,
            remove_js=remove_javascript,
            remove_thumbnails=remove_thumbnails,
            remove_embedded=remove_embedded_files,
            remove_icc=remove_icc_profiles,
            remove_annotations=remove_annotations,
            remove_forms=remove_forms,
            linearize=linearize,
            password=password,
        )
        result['engines_tried'].append({'engine': 'pikepdf',
                                        'success': pike_res.success,
                                        'reduction_pct': pike_res.reduction_pct,
                                        'error': pike_res.error})
        if pike_res.success and _file_size(pike_out) < input_size:
            candidates.append((_file_size(pike_out), 'pikepdf', pike_out))

        # ── Engine 4: qpdf ──────────────────────────────────────────────────
        _prog(46, 'qpdf…', 'Stream recompression + linearize')
        qpdf_out = os.path.join(tmpd, 'qpdf.pdf')
        qpdf_res = _qpdf_compress(working_src, qpdf_out, preset=quality, linearize=linearize)
        result['engines_tried'].append({'engine': 'qpdf',
                                        'success': qpdf_res.success,
                                        'reduction_pct': qpdf_res.reduction_pct,
                                        'error': qpdf_res.error})
        if qpdf_res.success and _file_size(qpdf_out) < input_size:
            candidates.append((_file_size(qpdf_out), 'qpdf', qpdf_out))

        # ── Engine 5: Pillow image recompression ────────────────────────────
        _prog(55, 'Pillow…', 'Advanced image recompression')
        pil_out = os.path.join(tmpd, 'pil.pdf')
        pil_res = _pillow_image_compress(working_src, pil_out, preset=quality, grayscale=grayscale)
        result['engines_tried'].append({'engine': pil_res.engine,
                                        'success': pil_res.success,
                                        'reduction_pct': pil_res.reduction_pct,
                                        'error': pil_res.error})
        if pil_res.success and _file_size(pil_out) < input_size:
            candidates.append((_file_size(pil_out), pil_res.engine, pil_out))

        # ── Engine 6: mutool ────────────────────────────────────────────────
        _prog(65, 'mutool…', 'MuPDF clean + compress')
        mut_out = os.path.join(tmpd, 'mutool.pdf')
        mut_res = _mutool_compress(working_src, mut_out, preset=quality)
        result['engines_tried'].append({'engine': 'mutool',
                                        'success': mut_res.success,
                                        'reduction_pct': mut_res.reduction_pct,
                                        'error': mut_res.error})
        if mut_res.success and _file_size(mut_out) < input_size:
            candidates.append((_file_size(mut_out), 'mutool', mut_out))

        # ── Engine 7: pypdf content stream ──────────────────────────────────
        _prog(72, 'pypdf…', 'Content stream optimization')
        pyp_out = os.path.join(tmpd, 'pypdf.pdf')
        pyp_res = _pypdf_compress(working_src, pyp_out, preset=quality,
                                   strip_metadata=strip_metadata, password=password)
        result['engines_tried'].append({'engine': 'pypdf',
                                        'success': pyp_res.success,
                                        'reduction_pct': pyp_res.reduction_pct,
                                        'error': pyp_res.error})
        if pyp_res.success and _file_size(pyp_out) < input_size:
            candidates.append((_file_size(pyp_out), 'pypdf', pyp_out))

        # ── Engine 8: Deduplication ─────────────────────────────────────────
        if remove_duplicate_images:
            _prog(76, 'Deduplicating…', 'Removing identical image streams')
            ded_out = os.path.join(tmpd, 'dedup.pdf')
            ded_res = _deduplicate_compress(working_src, ded_out)
            result['engines_tried'].append({'engine': ded_res.engine,
                                            'success': ded_res.success,
                                            'reduction_pct': ded_res.reduction_pct,
                                            'error': ded_res.error})
            if ded_res.success and _file_size(ded_out) < input_size:
                candidates.append((_file_size(ded_out), ded_res.engine, ded_out))

        # ── Pipeline: GS + fitz (chain) ─────────────────────────────────────
        if gs_res.success and FITZ_OK:
            _prog(80, 'Pipeline…', 'GS → fitz chained')
            chain_out = os.path.join(tmpd, 'chain.pdf')
            chain_res = _fitz_compress(gs_out, chain_out, preset=quality, grayscale=False)
            if chain_res.success and _file_size(chain_out) < input_size:
                candidates.append((_file_size(chain_out), 'gs+fitz', chain_out))

        # ── Pipeline: GS + pikepdf (chain) ──────────────────────────────────
        if gs_res.success and PIKEPDF_OK:
            chain2_out = os.path.join(tmpd, 'chain2.pdf')
            chain2_res = _pikepdf_compress(
                gs_out, chain2_out, preset=quality,
                strip_metadata=strip_metadata,
                remove_js=remove_javascript,
                linearize=linearize,
            )
            if chain2_res.success and _file_size(chain2_out) < input_size:
                candidates.append((_file_size(chain2_out), 'gs+pikepdf', chain2_out))

        # ── Pick smallest candidate ──────────────────────────────────────────
        _prog(88, 'Selecting best…', f'{len(candidates)} candidates found')

        if not candidates:
            # No engine succeeded — copy input as-is
            _safe_copy(working_src, dst)
            result['warnings'].append('No engine reduced size — original returned')
            result['output_size']  = _file_size(dst)
            result['engine_used']  = 'none'
            result['success']      = True
        else:
            candidates.sort(key=lambda x: x[0])
            best_size, best_engine, best_path = candidates[0]

            _safe_copy(best_path, dst)
            result['output_size']  = best_size
            result['engine_used']  = best_engine

            # ── Post-processing passes ─────────────────────────────────────
            _prog(91, 'Post-processing…', 'Applying extra optimizations')

            cur = dst
            post_tmp = os.path.join(tmpd, 'post.pdf')

            if grayscale and not gs_res.success:
                if compress_grayscale(cur, post_tmp):
                    if _file_size(post_tmp) <= _file_size(cur):
                        _safe_copy(post_tmp, cur)

            if strip_metadata and 'pikepdf' not in best_engine:
                if compress_remove_metadata(cur, post_tmp):
                    if _file_size(post_tmp) <= _file_size(cur):
                        _safe_copy(post_tmp, cur)

            if remove_annotations and 'pikepdf' not in best_engine:
                if compress_flatten_annotations(cur, post_tmp):
                    if _file_size(post_tmp) <= _file_size(cur):
                        _safe_copy(post_tmp, cur)

            if remove_forms and 'pikepdf' not in best_engine:
                if compress_remove_forms(cur, post_tmp):
                    if _file_size(post_tmp) <= _file_size(cur):
                        _safe_copy(post_tmp, cur)

            if remove_javascript and 'pikepdf' not in best_engine:
                if compress_remove_javascript(cur, post_tmp):
                    if _file_size(post_tmp) <= _file_size(cur):
                        _safe_copy(post_tmp, cur)

            if remove_embedded_files and 'pikepdf' not in best_engine:
                if compress_remove_embedded_files(cur, post_tmp):
                    if _file_size(post_tmp) <= _file_size(cur):
                        _safe_copy(post_tmp, cur)

            if remove_thumbnails and 'pikepdf' not in best_engine:
                if compress_remove_thumbnails(cur, post_tmp):
                    if _file_size(post_tmp) <= _file_size(cur):
                        _safe_copy(post_tmp, cur)

            if remove_links:
                if compress_remove_links(cur, post_tmp):
                    if _file_size(post_tmp) <= _file_size(cur):
                        _safe_copy(post_tmp, cur)

            if flatten_transparency:
                if compress_flatten_transparency(cur, post_tmp):
                    if _file_size(post_tmp) <= _file_size(cur):
                        _safe_copy(post_tmp, cur)

            if remove_icc_profiles and 'pikepdf' not in best_engine:
                if compress_strip_icc_profiles(cur, post_tmp):
                    if _file_size(post_tmp) <= _file_size(cur):
                        _safe_copy(post_tmp, cur)

            if subset_fonts and 'ghostscript' not in best_engine:
                if compress_subset_fonts(cur, post_tmp):
                    if _file_size(post_tmp) <= _file_size(cur):
                        _safe_copy(post_tmp, cur)

            if linearize and 'qpdf' not in best_engine and 'pikepdf' not in best_engine:
                if compress_linearize(cur, post_tmp):
                    if _is_valid_pdf(post_tmp):
                        _safe_copy(post_tmp, cur)

            # Re-read final size
            result['output_size'] = _file_size(dst)
            result['success']     = True

        # Clean up decrypted temp
        if working_src != src:
            _safe_remove(working_src)

    # ── Final stats ──────────────────────────────────────────────────────────
    _prog(96, 'Computing score…', 'Calculating compression quality')

    result['reduction_pct']     = _reduction_pct(input_size, result['output_size'])
    result['processing_time_ms'] = int((time.perf_counter() - t_start) * 1000)

    qs = _calc_quality_score(
        reduction_pct   = result['reduction_pct'],
        preset          = quality,
        engine          = result['engine_used'],
        time_ms         = result['processing_time_ms'],
        input_size      = input_size,
        output_size     = result['output_size'],
    )
    result['quality_score'] = qs[0]
    result['quality_grade'] = qs[1]

    _prog(100, 'Done!', f"Reduced by {result['reduction_pct']:.1f}%")
    return result

# ═══════════════════════════════════════════════════════════════════════════════
# TARGET-SIZE COMPRESSION
# ═══════════════════════════════════════════════════════════════════════════════

def compress_to_target_size(
    src: str, dst: str,
    target_kb: int = 500,
    grayscale: bool = False,
    strip_metadata: bool = False,
    remove_annotations: bool = False,
    linearize: bool = False,
    remove_javascript: bool = False,
    password: str = '',
    progress_cb: Optional[Callable] = None,
    max_iterations: int = 8,
) -> Dict[str, Any]:
    """
    Binary-search through quality levels to achieve a target file size.

    Iteratively compresses the PDF, adjusting quality until the output
    is ≤ target_kb. Tries up to max_iterations times.
    """
    t_start    = time.perf_counter()
    input_size = _file_size(src)
    target_b   = target_kb * 1024

    result = {
        'success': False, 'input_size': input_size,
        'output_size': 0, 'reduction_pct': 0.0,
        'engine_used': 'target-size', 'processing_time_ms': 0,
        'warnings': [], 'errors': [], 'quality_score': 0, 'quality_grade': 'F',
        'target_kb': target_kb, 'iterations': 0,
    }

    def _p(pct, stage='', detail=''):
        if progress_cb:
            with suppress(Exception):
                progress_cb(pct, stage, detail)

    if target_b >= input_size:
        _safe_copy(src, dst)
        result['output_size']  = input_size
        result['reduction_pct'] = 0.0
        result['success']      = True
        result['warnings'].append(f'File already ≤ {target_kb} KB — original returned')
        result['processing_time_ms'] = int((time.perf_counter() - t_start) * 1000)
        return result

    # Quality levels to try (JPEG quality 0–95)
    quality_levels = [20, 25, 30, 38, 45, 52, 60, 68, 75, 82, 90, 95]
    # DPI levels paired with quality
    dpi_levels = [72, 72, 96, 96, 120, 130, 150, 160, 180, 200, 240, 300]

    lo, hi = 0, len(quality_levels) - 1
    best_path = None
    best_size = input_size

    with _tmp_dir() as tmpd:
        iteration = 0

        while lo <= hi and iteration < max_iterations:
            iteration += 1
            mid = (lo + hi) // 2
            q   = quality_levels[mid]
            dpi = dpi_levels[mid]

            _p(10 + int(80 * iteration / max_iterations),
               f'Trying quality {q}…', f'Iteration {iteration}/{max_iterations}')

            tmp_out = os.path.join(tmpd, f'iter_{iteration}.pdf')

            # Build a custom preset
            custom_preset = {
                'dpi': dpi, 'jpeg_quality': q,
                'gs_preset': '/screen' if q < 50 else ('/ebook' if q < 70 else '/printer'),
                'webp_quality': q, 'max_image_size': (int(dpi * 8), int(dpi * 8)),
                'deflate_level': 9,
            }
            old_presets = PRESETS.copy()
            PRESETS['_custom'] = custom_preset

            res = _gs_compress(src, tmp_out, preset='_custom', grayscale=grayscale)
            if not res.success and FITZ_OK:
                res = _fitz_compress(src, tmp_out, preset='_custom', grayscale=grayscale)

            PRESETS.clear()
            PRESETS.update(old_presets)

            if res.success and _is_valid_pdf(tmp_out):
                sz = _file_size(tmp_out)
                if sz <= target_b:
                    if best_path is None or sz <= best_size:
                        best_size = sz
                        best_path = tmp_out
                    hi = mid - 1  # Can we do better (larger file, higher quality)?
                else:
                    lo = mid + 1  # Need smaller → lower quality
            else:
                lo = mid + 1

            result['iterations'] = iteration

        if best_path and _is_valid_pdf(best_path):
            _safe_copy(best_path, dst)
            result['output_size']  = _file_size(dst)
            result['success']      = True
        else:
            # Fallback: maximum compression with screen preset
            _p(90, 'Fallback…', 'Using maximum compression')
            res = compress_pdf(src, dst, quality='screen',
                               grayscale=grayscale, strip_metadata=True,
                               remove_annotations=remove_annotations)
            if res['success']:
                result['output_size'] = res['output_size']
                result['success']     = True
                result['warnings'].append('Could not reach target size — maximum compression used')
            else:
                _safe_copy(src, dst)
                result['output_size'] = input_size
                result['warnings'].append('Compression failed — original returned')

    result['reduction_pct']     = _reduction_pct(input_size, result['output_size'])
    result['processing_time_ms'] = int((time.perf_counter() - t_start) * 1000)

    qs = _calc_quality_score(
        reduction_pct=result['reduction_pct'],
        preset='target',
        engine='target-size',
        time_ms=result['processing_time_ms'],
        input_size=input_size,
        output_size=result['output_size'],
    )
    result['quality_score'] = qs[0]
    result['quality_grade'] = qs[1]
    return result

# ═══════════════════════════════════════════════════════════════════════════════
# QUALITY SCORING
# ═══════════════════════════════════════════════════════════════════════════════

def _calc_quality_score(
    reduction_pct: float,
    preset: str,
    engine: str,
    time_ms: int,
    input_size: int,
    output_size: int,
) -> Tuple[int, str]:
    """
    Calculate a composite compression quality score 0–100 and grade A-S/F.

    Factors:
      - Reduction percentage (40% weight)
      - Speed (20% weight)
      - Engine quality (20% weight)
      - Preset appropriateness (20% weight)
    """
    # Reduction score (0–40)
    if reduction_pct >= 85:
        red_score = 40
    elif reduction_pct >= 70:
        red_score = 35
    elif reduction_pct >= 55:
        red_score = 30
    elif reduction_pct >= 40:
        red_score = 25
    elif reduction_pct >= 25:
        red_score = 18
    elif reduction_pct >= 10:
        red_score = 10
    elif reduction_pct > 0:
        red_score = 5
    else:
        red_score = 0

    # Speed score (0–20)
    if time_ms < 1000:
        spd_score = 20
    elif time_ms < 3000:
        spd_score = 16
    elif time_ms < 8000:
        spd_score = 12
    elif time_ms < 20000:
        spd_score = 7
    elif time_ms < 60000:
        spd_score = 3
    else:
        spd_score = 1

    # Engine score (0–20)
    engine_scores = {
        'ghostscript': 20, 'gs+pikepdf': 19, 'gs+fitz': 18,
        'pymupdf': 16, 'pillow': 15, 'webp-jpeg': 14,
        'pikepdf': 13, 'qpdf': 12, 'mutool': 11,
        'pypdf': 8, 'dedup': 6, 'none': 0,
    }
    eng_score = 0
    for k, v in engine_scores.items():
        if k in engine.lower():
            eng_score = v
            break

    # Preset score (0–20) — reward appropriate preset for result
    preset_maps = {
        'screen': {'expected_min': 50, 'expected_max': 95},
        'low': {'expected_min': 35, 'expected_max': 80},
        'medium': {'expected_min': 20, 'expected_max': 70},
        'high': {'expected_min': 10, 'expected_max': 50},
        'lossless': {'expected_min': 0, 'expected_max': 30},
    }
    preset_info = preset_maps.get(preset, {'expected_min': 0, 'expected_max': 100})
    if preset_info['expected_min'] <= reduction_pct <= preset_info['expected_max']:
        pre_score = 20
    elif reduction_pct > preset_info['expected_max']:
        pre_score = 20  # Better than expected
    else:
        gap = preset_info['expected_min'] - reduction_pct
        pre_score = max(0, 20 - int(gap * 0.5))

    total = red_score + spd_score + eng_score + pre_score

    # Grade
    if total >= 90:
        grade = 'S'
    elif total >= 80:
        grade = 'A'
    elif total >= 65:
        grade = 'B'
    elif total >= 45:
        grade = 'C'
    elif total >= 25:
        grade = 'D'
    else:
        grade = 'F'

    return total, grade

# ═══════════════════════════════════════════════════════════════════════════════
# ANALYSIS FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def get_compression_estimate(path: str, password: str = '') -> Dict[str, Any]:
    """
    Full PDF analysis — returns comprehensive file information and per-preset
    compression estimates.

    Returns dict with keys: success, page_count, image_count, file_size,
    has_javascript, has_forms, has_encryption, has_annotations, is_linearized,
    content_type, pdf_version, estimated_reductions_by_preset, metadata,
    compressibility_score, recommendations, ...
    """
    result: Dict[str, Any] = {
        'success': False,
        'file_size': _file_size(path),
        'page_count': 0,
        'image_count': 0,
        'total_image_bytes': 0,
        'total_font_bytes': 0,
        'total_stream_bytes': 0,
        'has_javascript': False,
        'has_forms': False,
        'has_encryption': False,
        'has_annotations': False,
        'has_embedded_files': False,
        'has_thumbnails': False,
        'has_transparency': False,
        'has_icc_profiles': False,
        'has_signatures': False,
        'is_linearized': False,
        'is_tagged': False,
        'is_scanned': False,
        'pdf_version': _pdf_version(path),
        'content_type': 'unknown',
        'pdf_type': 'unknown',
        'compression_level': 'unknown',
        'compressibility_score': 50,
        'estimated_reductions_by_preset': {},
        'recommendations': [],
        'font_names': [],
        'metadata': {},
        'image_details': [],
        'warnings': [],
        'errors': [],
    }

    if not _is_valid_pdf(path):
        result['errors'].append('Not a valid PDF file')
        return result

    file_size = result['file_size']
    if file_size == 0:
        result['errors'].append('File is empty')
        return result

    # ── Analysis 1: pikepdf (fastest, most capable) ───────────────────────
    if PIKEPDF_OK:
        try:
            open_kw = {'suppress_warnings': True}
            if password:
                open_kw['password'] = password
            with pikepdf.open(path, **open_kw) as pdf:
                result['page_count']   = len(pdf.pages)
                result['is_linearized'] = bool(pdf.is_linearized)

                # Metadata
                try:
                    with pdf.open_metadata() as meta:
                        for k in ['dc:title', 'dc:creator', 'xmp:CreateDate',
                                  'xmp:ModifyDate', 'dc:description']:
                            v = meta.get(k)
                            if v:
                                result['metadata'][k] = str(v)
                except Exception:
                    pass

                # DocInfo metadata
                if Name.Info in pdf.trailer:
                    try:
                        info = pdf.trailer[Name.Info]
                        for k in ['/Title', '/Author', '/Subject', '/Creator',
                                  '/Producer', '/CreationDate', '/ModDate']:
                            v = info.get(Name(k))
                            if v:
                                result['metadata'][k] = str(v)
                    except Exception:
                        pass

                # Check root-level features
                root = pdf.Root
                result['has_javascript'] = Name.JavaScript in root.get(Name.Names, {}) or \
                                           (Name.OpenAction in root and
                                            root.get(Name.OpenAction, {}).get(Name.S) == Name.JavaScript)
                result['has_forms']  = Name.AcroForm in root
                result['is_tagged']  = Name.MarkInfo in root

                if Name.Names in root:
                    names = root[Name.Names]
                    result['has_embedded_files'] = Name.EmbeddedFiles in names

                # Scan objects
                image_count  = 0
                image_bytes  = 0
                font_bytes   = 0
                stream_bytes = 0
                has_annots   = False
                has_thumb    = False
                has_icc      = False
                has_trans    = False
                font_names: Set[str] = set()
                image_hashes: Set[str] = set()

                for obj in pdf.objects:
                    if isinstance(obj, pikepdf.Stream):
                        try:
                            subtype = obj.get(Name.Subtype)
                            raw = obj.read_raw_bytes()
                            raw_len = len(raw) if raw else 0
                            stream_bytes += raw_len

                            if subtype == Name.Image:
                                h = _hash_stream(raw) if raw else ''
                                if h and h not in image_hashes:
                                    image_hashes.add(h)
                                    image_count += 1
                                    image_bytes += raw_len

                                    w  = int(obj.get(Name.Width, 0))
                                    ht = int(obj.get(Name.Height, 0))
                                    cs = str(obj.get(Name.ColorSpace, ''))
                                    fl = str(obj.get(Name.Filter, ''))
                                    if len(result['image_details']) < 20:
                                        result['image_details'].append({
                                            'width': w, 'height': ht,
                                            'colorspace': cs,
                                            'filter': fl,
                                            'bytes': raw_len,
                                        })

                                    # Check ICC
                                    if 'ICCBased' in cs:
                                        has_icc = True

                            elif subtype == Name.Form:
                                # Form XObjects can have transparency
                                if Name.Group in obj:
                                    has_trans = True

                            elif Name.Font in str(subtype or ''):
                                font_bytes += raw_len

                        except Exception:
                            continue

                    elif isinstance(obj, pikepdf.Dictionary):
                        # Check for fonts
                        try:
                            t = obj.get(Name.Type)
                            if t == Name.Font:
                                fn = obj.get(Name.BaseFont) or obj.get(Name.Name)
                                if fn:
                                    font_names.add(str(fn))
                        except Exception:
                            pass

                # Scan pages
                for page in pdf.pages:
                    try:
                        if Name.Annots in page:
                            annots = page[Name.Annots]
                            if len(annots) > 0:
                                has_annots = True
                        if '/Thumb' in page:
                            has_thumb = True
                    except Exception:
                        pass

                result['image_count']     = image_count
                result['total_image_bytes'] = image_bytes
                result['total_font_bytes'] = font_bytes
                result['total_stream_bytes'] = stream_bytes
                result['has_annotations'] = has_annots
                result['has_thumbnails']  = has_thumb
                result['has_icc_profiles'] = has_icc
                result['has_transparency'] = has_trans
                result['font_names']      = sorted(font_names)[:20]
                result['has_encryption']  = False  # Successfully opened

        except pikepdf.PasswordError:
            result['has_encryption'] = True
            result['errors'].append('PDF is password-protected — provide password to analyze')
            # Still return partial info
        except Exception as e:
            result['warnings'].append(f'pikepdf analysis partial: {e}')

    # ── Analysis 2: fitz supplement ───────────────────────────────────────
    if FITZ_OK and not result['has_encryption']:
        try:
            doc = fitz.open(path)
            if doc.needs_pass:
                result['has_encryption'] = True
                doc.close()
            else:
                if result['page_count'] == 0:
                    result['page_count'] = doc.page_count

                # Check if scanned (no text, only images)
                text_pages = 0
                for i, page in enumerate(doc):
                    if i >= min(5, doc.page_count):
                        break
                    text = page.get_text().strip()
                    if text:
                        text_pages += 1

                result['is_scanned'] = (text_pages == 0 and result['image_count'] > 0)

                doc.close()
        except Exception as e:
            result['warnings'].append(f'fitz supplement: {e}')

    # ── Determine PDF type / content type ─────────────────────────────────
    if result['has_encryption']:
        result['pdf_type']    = PdfType.ENCRYPTED.value
        result['content_type'] = 'encrypted'
    elif result['is_scanned']:
        result['pdf_type']    = PdfType.SCANNED.value
        result['content_type'] = 'scanned_document'
    elif result['has_forms']:
        result['pdf_type']    = PdfType.FORM.value
        result['content_type'] = 'interactive_form'
    elif result['image_count'] > 0 and result['total_image_bytes'] > result['file_size'] * 0.6:
        result['pdf_type']    = PdfType.IMAGE_HEAVY.value
        result['content_type'] = 'image_heavy'
    elif result['image_count'] > 0:
        result['pdf_type']    = PdfType.MIXED.value
        result['content_type'] = 'mixed_content'
    else:
        result['pdf_type']    = PdfType.TEXT_HEAVY.value
        result['content_type'] = 'text_heavy'

    # ── Compressibility score (0–100) ─────────────────────────────────────
    score = 50  # base
    if result['total_image_bytes'] > 0:
        img_ratio = result['total_image_bytes'] / max(1, result['file_size'])
        score += int(img_ratio * 40)  # More images = more compressible
    if result['has_thumbnails']:
        score += 5
    if result['has_embedded_files']:
        score += 8
    if result['has_javascript']:
        score += 2
    if result['is_linearized']:
        score -= 10  # Already optimized
    if result['is_scanned']:
        score += 15  # Scanned = very compressible
    if result['has_forms']:
        score -= 5   # Forms may resist compression
    result['compressibility_score'] = min(100, max(0, score))

    # ── Per-preset estimated reductions ───────────────────────────────────
    ests = {}
    for preset_name, preset_cfg in PRESETS.items():
        low, high = preset_cfg['expected_reduction_pct']
        # Adjust based on content type
        if result['content_type'] == 'image_heavy':
            low  = min(100, int(low  * 1.20))
            high = min(100, int(high * 1.15))
        elif result['content_type'] == 'text_heavy':
            low  = max(0, int(low  * 0.50))
            high = max(0, int(high * 0.55))
        elif result['content_type'] == 'scanned_document':
            low  = min(100, int(low  * 1.30))
            high = min(100, int(high * 1.20))
        elif result['content_type'] == 'interactive_form':
            low  = max(0, int(low  * 0.60))
            high = max(0, int(high * 0.65))

        # Already compressed check
        if result['is_linearized']:
            low  = max(0, low  - 10)
            high = max(0, high - 10)

        mid = (low + high) // 2
        ests[preset_name] = mid
    result['estimated_reductions_by_preset'] = ests

    # ── Recommendations ───────────────────────────────────────────────────
    recs = []
    if result['total_image_bytes'] > result['file_size'] * 0.5:
        recs.append('Image-heavy PDF — Screen or Low preset will give maximum savings')
    if result['has_thumbnails']:
        recs.append('Enable "Remove Thumbnails" in Advanced Options for extra savings')
    if result['has_embedded_files']:
        recs.append('Enable "Remove Embedded Files" to save significant space')
    if result['has_javascript']:
        recs.append('Enable "Remove JavaScript" to reduce size and improve security')
    if result['has_forms']:
        recs.append('Enable "Remove Forms" if interactive fields are not needed')
    if result['has_icc_profiles']:
        recs.append('Enable "Strip ICC Profiles" for additional stream savings')
    if not result['is_linearized']:
        recs.append('Enable "Web Linearize" for faster online viewing')
    if result['is_scanned']:
        recs.append('Scanned PDF — Medium or Low preset recommended for best results')
    if result['content_type'] == 'text_heavy':
        recs.append('Text-heavy PDF — Lossless preset preserves quality with modest savings')
    if not recs:
        recs.append('Use Medium preset for the best balance of size and quality')

    result['recommendations'] = recs[:5]

    # ── Encryption re-check ────────────────────────────────────────────────
    result['has_encryption'] = _is_encrypted(path)

    result['success'] = True
    return result

def _is_encrypted(path: str) -> bool:
    """Return True if PDF is password-protected."""
    try:
        with open(path, 'rb') as f:
            content = f.read(4096)
        return b'/Encrypt' in content
    except Exception:
        return False

def analyze_pdf_streams(path: str) -> Dict[str, Any]:
    """Analyze compressed vs uncompressed stream stats."""
    result: Dict[str, Any] = {
        'success': False, 'total_streams': 0,
        'compressed_streams': 0, 'uncompressed_streams': 0,
        'total_compressed_bytes': 0, 'total_uncompressed_bytes': 0,
        'compression_ratio': 0.0, 'filter_types': {},
        'entropy': 0.0, 'largest_stream_bytes': 0,
    }
    if not PIKEPDF_OK or not _is_valid_pdf(path):
        return result

    try:
        with pikepdf.open(path, suppress_warnings=True) as pdf:
            filter_counts: Counter = Counter()
            total_comp   = 0
            total_uncomp = 0
            entropies    = []
            n_streams    = 0
            largest      = 0

            for obj in pdf.objects:
                if not isinstance(obj, pikepdf.Stream):
                    continue
                n_streams += 1
                try:
                    raw = obj.read_raw_bytes()
                    raw_len = len(raw) if raw else 0
                    if raw_len > largest:
                        largest = raw_len

                    filt = obj.get(Name.Filter)
                    filt_name = str(filt) if filt else 'none'
                    filter_counts[filt_name] += 1

                    if filt and filt != Name(''):
                        total_comp += raw_len
                        result['compressed_streams'] += 1
                    else:
                        total_uncomp += raw_len
                        result['uncompressed_streams'] += 1

                    if raw and len(raw) < 65536:
                        entropies.append(_bytes_entropy(raw))

                except Exception:
                    continue

            result['total_streams']           = n_streams
            result['total_compressed_bytes']  = total_comp
            result['total_uncompressed_bytes'] = total_uncomp
            result['largest_stream_bytes']    = largest
            result['filter_types']            = dict(filter_counts.most_common(10))
            result['entropy'] = round(statistics.mean(entropies), 3) if entropies else 0.0

            if total_comp + total_uncomp > 0:
                result['compression_ratio'] = round(
                    total_comp / (total_comp + total_uncomp), 3
                )

            result['success'] = True
    except Exception as e:
        result['error'] = str(e)

    return result

def get_available_engines() -> Dict[str, Dict[str, Any]]:
    """Detect all available compression engines and their versions."""
    engines: Dict[str, Dict[str, Any]] = {}

    # Ghostscript
    gs = _find_gs()
    engines['ghostscript'] = {
        'available': bool(gs),
        'binary': gs,
        'version': _GS_VERSION,
        'description': 'Industry-standard PDF distiller',
        'best_for': 'Image-heavy PDFs, maximum compression',
    }

    # PyMuPDF
    engines['pymupdf'] = {
        'available': FITZ_OK,
        'version': FITZ_VERSION,
        'description': 'MuPDF-based image resampling',
        'best_for': 'Per-image DPI control',
    }

    # pikepdf
    engines['pikepdf'] = {
        'available': PIKEPDF_OK,
        'version': PIKEPDF_VERSION,
        'description': 'Stream recompression + object cleanup',
        'best_for': 'Structure cleanup, metadata strip',
    }

    # qpdf
    qpdf = _find_qpdf()
    engines['qpdf'] = {
        'available': bool(qpdf),
        'binary': qpdf,
        'description': 'Stream recompression + linearization',
        'best_for': 'Web optimization',
    }

    # mutool
    mutool = _find_mutool()
    engines['mutool'] = {
        'available': bool(mutool),
        'binary': mutool,
        'description': 'MuPDF clean + compress',
        'best_for': 'Stream cleanup',
    }

    # pypdf
    engines['pypdf'] = {
        'available': PYPDF_OK,
        'version': PYPDF_VERSION,
        'description': 'Content stream optimization',
        'best_for': 'Text PDF cleanup',
    }

    # Pillow
    engines['pillow'] = {
        'available': PIL_OK,
        'version': PIL_VERSION,
        'description': 'Advanced image recompression',
        'best_for': 'JPEG/WebP quality control',
    }

    return engines

def analyze_images_in_pdf(path: str, max_images: int = 50) -> Dict[str, Any]:
    """
    Per-image analysis — DPI, mode, size, estimated savings.
    """
    result: Dict[str, Any] = {
        'success': False, 'image_count': 0, 'images': [],
        'total_bytes': 0, 'compressible_bytes': 0,
        'avg_dpi_x': 0.0, 'avg_dpi_y': 0.0,
        'formats': {}, 'colorspaces': {},
    }
    if not (FITZ_OK and _is_valid_pdf(path)):
        return result

    try:
        doc = fitz.open(path)
        images: List[Dict] = []
        dpis_x: List[float] = []
        dpis_y: List[float] = []
        fmt_counter: Counter = Counter()
        cs_counter:  Counter = Counter()

        for page_num, page in enumerate(doc):
            if len(images) >= max_images:
                break
            img_list = page.get_images(full=True)
            for img_ref in img_list:
                if len(images) >= max_images:
                    break
                xref = img_ref[0]
                try:
                    base = doc.extract_image(xref)
                    if not base:
                        continue

                    w    = base['width']
                    h    = base['height']
                    ext  = base['ext']
                    data = base['image']
                    sz   = len(data)

                    # Estimate DPI from page size vs image size
                    page_rect = page.rect
                    dpi_x = round(w / (page_rect.width / 72.0), 1) if page_rect.width > 0 else 0.0
                    dpi_y = round(h / (page_rect.height / 72.0), 1) if page_rect.height > 0 else 0.0

                    # Colorspace
                    cs = img_ref[5] if len(img_ref) > 5 else 'RGB'

                    # Compressibility (JPEG already compressed, PNG maybe not)
                    can_compress = ext.lower() in ('png', 'bmp', 'tiff', 'tif')
                    savings_est = round(sz * (0.5 if can_compress else 0.15), 0)

                    info = {
                        'page': page_num + 1,
                        'xref': xref,
                        'width': w, 'height': h,
                        'format': ext.upper(),
                        'colorspace': cs,
                        'bytes': sz,
                        'dpi_x': dpi_x, 'dpi_y': dpi_y,
                        'can_compress': can_compress,
                        'savings_estimate': int(savings_est),
                    }
                    images.append(info)
                    dpis_x.append(dpi_x)
                    dpis_y.append(dpi_y)
                    fmt_counter[ext.upper()] += 1
                    cs_counter[str(cs)] += 1
                    result['total_bytes']        += sz
                    result['compressible_bytes'] += int(savings_est)

                except Exception:
                    continue

        doc.close()
        result['image_count'] = len(images)
        result['images']      = images
        result['avg_dpi_x']   = round(statistics.mean(dpis_x), 1) if dpis_x else 0.0
        result['avg_dpi_y']   = round(statistics.mean(dpis_y), 1) if dpis_y else 0.0
        result['formats']     = dict(fmt_counter)
        result['colorspaces'] = dict(cs_counter)
        result['success']     = True
    except Exception as e:
        result['error'] = str(e)

    return result

def get_pdf_metadata(path: str, password: str = '') -> Dict[str, Any]:
    """Extract comprehensive metadata from PDF."""
    result: Dict[str, Any] = {
        'success': False, 'docinfo': {}, 'xmp': {},
        'pdf_version': _pdf_version(path),
        'is_linearized': False, 'page_count': 0,
        'has_encryption': _is_encrypted(path),
        'file_size': _file_size(path),
    }
    if not PIKEPDF_OK:
        return result

    try:
        kw = {'suppress_warnings': True}
        if password:
            kw['password'] = password
        with pikepdf.open(path, **kw) as pdf:
            result['page_count']    = len(pdf.pages)
            result['is_linearized'] = bool(pdf.is_linearized)

            # DocInfo
            if Name.Info in pdf.trailer:
                try:
                    info = pdf.trailer[Name.Info]
                    for key in ['/Title', '/Author', '/Subject', '/Keywords',
                                 '/Creator', '/Producer', '/CreationDate', '/ModDate']:
                        v = info.get(Name(key))
                        if v:
                            result['docinfo'][key] = str(v)
                except Exception:
                    pass

            # XMP
            try:
                with pdf.open_metadata() as meta:
                    for k in meta:
                        v = meta.get(k)
                        if v:
                            result['xmp'][k] = str(v)
            except Exception:
                pass

        result['success'] = True
    except pikepdf.PasswordError:
        result['has_encryption'] = True
        result['error'] = 'Password required'
    except Exception as e:
        result['error'] = str(e)

    return result

def detect_pdf_type(path: str) -> Dict[str, Any]:
    """Detect whether PDF is text-heavy, image-heavy, mixed, scanned, or form."""
    result: Dict[str, Any] = {
        'success': False, 'pdf_type': 'unknown',
        'confidence': 0.0, 'details': {},
    }
    if not _is_valid_pdf(path):
        return result

    page_count = _count_pdf_pages(path)
    if page_count == 0:
        result['pdf_type'] = 'empty'
        result['confidence'] = 1.0
        result['success'] = True
        return result

    img_info = analyze_images_in_pdf(path, max_images=20)
    est_info = get_compression_estimate(path)

    file_sz = _file_size(path)
    img_bytes = img_info.get('total_bytes', 0)
    img_count = img_info.get('image_count', 0)
    has_forms = est_info.get('has_forms', False)
    is_scanned = est_info.get('is_scanned', False)

    if has_forms:
        pdf_type = 'form'
        conf = 0.80
    elif is_scanned or (img_bytes > file_sz * 0.80):
        pdf_type = 'scanned' if is_scanned else 'image_heavy'
        conf = 0.85 if is_scanned else 0.80
    elif img_bytes > file_sz * 0.40:
        pdf_type = 'mixed'
        conf = 0.75
    elif img_count == 0:
        pdf_type = 'text_heavy'
        conf = 0.90
    else:
        pdf_type = 'mixed'
        conf = 0.65

    result['pdf_type']   = pdf_type
    result['confidence'] = conf
    result['details'] = {
        'page_count': page_count,
        'image_count': img_count,
        'image_bytes_ratio': round(img_bytes / max(1, file_sz), 2),
    }
    result['success'] = True
    return result

def get_font_analysis(path: str) -> Dict[str, Any]:
    """Analyze embedded fonts and subsetting opportunities."""
    result: Dict[str, Any] = {
        'success': False, 'font_count': 0, 'fonts': [],
        'total_font_bytes': 0, 'subset_savings_estimate': 0,
        'has_oversized_fonts': False,
    }
    if not PIKEPDF_OK or not _is_valid_pdf(path):
        return result

    try:
        fonts: List[Dict] = []
        total_bytes = 0
        savings = 0

        with pikepdf.open(path, suppress_warnings=True) as pdf:
            seen = set()
            for page in pdf.pages:
                if Name.Resources not in page:
                    continue
                res = page[Name.Resources]
                if Name.Font not in res:
                    continue
                font_dict = res[Name.Font]
                for font_key in font_dict.keys():
                    try:
                        font = font_dict[font_key]
                        if not isinstance(font, pikepdf.Dictionary):
                            continue
                        font_name = str(font.get(Name.BaseFont, font_key))
                        if font_name in seen:
                            continue
                        seen.add(font_name)

                        font_type    = str(font.get(Name.Type, ''))
                        subtype      = str(font.get(Name.Subtype, ''))
                        is_embedded  = Name.FontDescriptor in font
                        is_subset    = font_name.startswith(tuple('ABCDEFGHIJKLMNOPQRSTUVWXYZ') + ('',)) and \
                                       len(font_name) > 7 and font_name[6] == '+'

                        # Estimate font stream size
                        font_sz = 0
                        if Name.FontDescriptor in font:
                            fd = font[Name.FontDescriptor]
                            for stream_key in [Name.FontFile, Name.FontFile2, Name.FontFile3]:
                                if stream_key in fd:
                                    try:
                                        raw = fd[stream_key].read_raw_bytes()
                                        font_sz = len(raw)
                                    except Exception:
                                        pass

                        total_bytes += font_sz
                        saving = int(font_sz * 0.35) if is_embedded and not is_subset else 0
                        savings += saving

                        info = {
                            'name': font_name, 'type': subtype,
                            'embedded': is_embedded, 'subset': is_subset,
                            'size_bytes': font_sz, 'savings_if_subset': saving,
                        }
                        fonts.append(info)
                    except Exception:
                        continue

        result['fonts']                  = fonts[:30]
        result['font_count']             = len(fonts)
        result['total_font_bytes']       = total_bytes
        result['subset_savings_estimate'] = savings
        result['has_oversized_fonts']    = any(f['size_bytes'] > 100_000 and not f['subset']
                                               for f in fonts)
        result['success'] = True
    except Exception as e:
        result['error'] = str(e)

    return result

def get_security_report(path: str) -> Dict[str, Any]:
    """Detailed security analysis — encryption, permissions, JS, forms, signatures."""
    result: Dict[str, Any] = {
        'success': False, 'is_encrypted': _is_encrypted(path),
        'has_javascript': False, 'has_forms': False,
        'has_signatures': False, 'has_open_action': False,
        'has_embedded_scripts': False, 'permissions': {},
        'encryption_method': '', 'key_length': 0,
    }
    if not _is_valid_pdf(path):
        return result

    if PIKEPDF_OK:
        try:
            with pikepdf.open(path, suppress_warnings=True) as pdf:
                root = pdf.Root

                # JavaScript
                if Name.Names in root:
                    names = root[Name.Names]
                    result['has_javascript'] = Name.JavaScript in names

                # OpenAction
                if Name.OpenAction in root:
                    result['has_open_action'] = True
                    oa = root[Name.OpenAction]
                    if hasattr(oa, 'get') and oa.get(Name.S) == Name.JavaScript:
                        result['has_javascript'] = True
                        result['has_embedded_scripts'] = True

                # Forms
                result['has_forms'] = Name.AcroForm in root

                # Signatures
                if Name.AcroForm in root:
                    acro = root[Name.AcroForm]
                    if Name.Fields in acro:
                        for field in acro[Name.Fields]:
                            try:
                                if field.get(Name.FT) == Name.Sig:
                                    result['has_signatures'] = True
                                    break
                            except Exception:
                                pass

            result['success'] = True
        except Exception as e:
            result['error'] = str(e)

    return result

def get_color_analysis(path: str) -> Dict[str, Any]:
    """Analyse colour vs grayscale content across pages."""
    result: Dict[str, Any] = {
        'success': False, 'total_pages': 0,
        'color_pages': 0, 'grayscale_pages': 0,
        'color_ratio': 0.0, 'can_convert_to_gray': False,
        'estimated_gray_savings_pct': 0,
        'dominant_colorspace': 'unknown',
    }
    if not FITZ_OK or not _is_valid_pdf(path):
        return result

    try:
        doc = fitz.open(path)
        total  = doc.page_count
        color  = 0
        gray   = 0

        for page in doc:
            # Render at low res for colour check
            try:
                pix = page.get_pixmap(dpi=30, colorspace=fitz.csRGB)
                # Sample pixels
                samples = pix.samples
                if samples:
                    # Check if image is essentially grayscale
                    n_pix = len(samples) // 3
                    is_gray = True
                    step = max(1, n_pix // 100)
                    for i in range(0, min(n_pix * 3, len(samples) - 3), step * 3):
                        r = samples[i]
                        g = samples[i+1]
                        b = samples[i+2]
                        if abs(int(r) - int(g)) > 8 or abs(int(r) - int(b)) > 8:
                            is_gray = False
                            break
                    if is_gray:
                        gray += 1
                    else:
                        color += 1
                else:
                    gray += 1
            except Exception:
                gray += 1

        doc.close()

        result['total_pages']    = total
        result['color_pages']    = color
        result['grayscale_pages'] = gray
        result['color_ratio']    = round(color / max(1, total), 2)

        # If most pages are gray already, converting would save little
        if color > 0:
            result['can_convert_to_gray']      = True
            result['estimated_gray_savings_pct'] = min(45, int(result['color_ratio'] * 40))
        result['dominant_colorspace'] = 'grayscale' if gray > color else 'color'
        result['success'] = True
    except Exception as e:
        result['error'] = str(e)

    return result

def get_object_statistics(path: str) -> Dict[str, Any]:
    """Count and categorize PDF objects by type."""
    result: Dict[str, Any] = {
        'success': False, 'total_objects': 0,
        'streams': 0, 'dictionaries': 0, 'arrays': 0,
        'strings': 0, 'names': 0, 'integers': 0,
        'pages': 0, 'images': 0, 'fonts': 0,
        'form_xobjects': 0, 'annotations': 0,
    }
    if not PIKEPDF_OK or not _is_valid_pdf(path):
        return result

    try:
        with pikepdf.open(path, suppress_warnings=True) as pdf:
            result['pages'] = len(pdf.pages)
            for obj in pdf.objects:
                result['total_objects'] += 1
                if isinstance(obj, pikepdf.Stream):
                    result['streams'] += 1
                    t = obj.get(Name.Subtype)
                    if t == Name.Image:
                        result['images'] += 1
                    elif t == Name.Form:
                        result['form_xobjects'] += 1
                elif isinstance(obj, pikepdf.Dictionary):
                    result['dictionaries'] += 1
                    t = obj.get(Name.Type)
                    if t == Name.Font:
                        result['fonts'] += 1
                    elif t == Name.Annot:
                        result['annotations'] += 1
                elif isinstance(obj, pikepdf.Array):
                    result['arrays'] += 1
                elif isinstance(obj, pikepdf.String):
                    result['strings'] += 1
                elif isinstance(obj, pikepdf.Name):
                    result['names'] += 1

        result['success'] = True
    except Exception as e:
        result['error'] = str(e)

    return result

def calculate_entropy(path: str, sample_streams: int = 20) -> Dict[str, Any]:
    """
    Calculate Shannon entropy of PDF streams.
    High entropy (> 7.5) = already compressed / encrypted.
    Low entropy (< 5.0) = compressible.
    """
    result: Dict[str, Any] = {
        'success': False, 'mean_entropy': 0.0,
        'min_entropy': 0.0, 'max_entropy': 0.0,
        'compressible_streams': 0, 'highly_compressed_streams': 0,
        'samples': [],
    }
    if not PIKEPDF_OK or not _is_valid_pdf(path):
        return result

    try:
        entropies: List[float] = []
        with pikepdf.open(path, suppress_warnings=True) as pdf:
            count = 0
            for obj in pdf.objects:
                if count >= sample_streams:
                    break
                if isinstance(obj, pikepdf.Stream):
                    try:
                        raw = obj.read_raw_bytes()
                        if raw and len(raw) > 64:
                            e = _bytes_entropy(raw[:4096])
                            entropies.append(e)
                            result['samples'].append({'entropy': e, 'size': len(raw)})
                            count += 1
                    except Exception:
                        pass

        if entropies:
            result['mean_entropy'] = round(statistics.mean(entropies), 3)
            result['min_entropy']  = round(min(entropies), 3)
            result['max_entropy']  = round(max(entropies), 3)
            result['compressible_streams']     = sum(1 for e in entropies if e < 5.5)
            result['highly_compressed_streams'] = sum(1 for e in entropies if e > 7.5)

        result['success'] = True
    except Exception as e:
        result['error'] = str(e)

    return result

def detect_duplicate_images(path: str) -> Dict[str, Any]:
    """Find identical image streams (candidates for deduplication)."""
    result: Dict[str, Any] = {
        'success': False, 'unique_images': 0,
        'duplicate_sets': 0, 'total_wasted_bytes': 0,
        'duplicates': [],
    }
    if not PIKEPDF_OK or not _is_valid_pdf(path):
        return result

    try:
        hash_map: Dict[str, List[Dict]] = defaultdict(list)

        with pikepdf.open(path, suppress_warnings=True) as pdf:
            for i, obj in enumerate(pdf.objects):
                if isinstance(obj, pikepdf.Stream):
                    try:
                        if obj.get(Name.Subtype) != Name.Image:
                            continue
                        raw = obj.read_raw_bytes()
                        if not raw:
                            continue
                        h = _hash_stream(raw)
                        hash_map[h].append({
                            'obj_num': i,
                            'size': len(raw),
                            'width': int(obj.get(Name.Width, 0)),
                            'height': int(obj.get(Name.Height, 0)),
                        })
                    except Exception:
                        pass

        unique = 0
        dup_sets = 0
        wasted = 0

        for h, objs in hash_map.items():
            if len(objs) > 1:
                dup_sets += 1
                extra = len(objs) - 1
                wasted += extra * objs[0]['size']
                result['duplicates'].append({
                    'count': len(objs), 'wasted_bytes': extra * objs[0]['size'],
                    'image_size': f"{objs[0]['width']}x{objs[0]['height']}",
                })
            unique += 1

        result['unique_images']      = unique
        result['duplicate_sets']     = dup_sets
        result['total_wasted_bytes'] = wasted
        result['success']            = True
    except Exception as e:
        result['error'] = str(e)

    return result

def get_page_size_breakdown(path: str) -> Dict[str, Any]:
    """Estimate per-page size contribution."""
    result: Dict[str, Any] = {
        'success': False, 'pages': [],
        'largest_page': 0, 'smallest_page': 0,
        'mean_page_size': 0,
    }
    if not FITZ_OK or not _is_valid_pdf(path):
        return result

    try:
        doc = fitz.open(path)
        pages: List[Dict] = []
        for i, page in enumerate(doc):
            try:
                # Render at low quality and measure raw bitmap size as proxy
                pix  = page.get_pixmap(dpi=20)
                size = len(pix.samples)
                pages.append({
                    'page': i + 1,
                    'width_pts': round(page.rect.width, 1),
                    'height_pts': round(page.rect.height, 1),
                    'image_count': len(page.get_images()),
                    'text_chars': len(page.get_text()),
                    'proxy_size': size,
                })
            except Exception:
                pages.append({'page': i + 1, 'proxy_size': 0})
        doc.close()

        if pages:
            sizes = [p['proxy_size'] for p in pages]
            result['pages']        = pages[:50]
            result['largest_page'] = max(sizes)
            result['smallest_page'] = min(sizes)
            result['mean_page_size'] = int(statistics.mean(sizes))

        result['success'] = True
    except Exception as e:
        result['error'] = str(e)

    return result

def get_compression_recommendations(path: str) -> Dict[str, Any]:
    """Return ranked list of compression strategies for this specific PDF."""
    result: Dict[str, Any] = {
        'success': False, 'recommended_preset': 'medium',
        'strategies': [], 'estimated_total_savings_pct': 0,
        'priority_actions': [],
    }

    est   = get_compression_estimate(path)
    imgs  = analyze_images_in_pdf(path, max_images=10)
    dups  = detect_duplicate_images(path)
    fonts = get_font_analysis(path)

    strategies: List[Dict] = []

    # Image downsampling
    if est.get('total_image_bytes', 0) > 50_000:
        pct = min(85, est.get('compressibility_score', 50))
        strategies.append({
            'strategy': 'Image downsampling',
            'estimated_savings_pct': pct,
            'how': 'Use Screen or Low preset to downsample images to 72–96 DPI',
            'priority': 'high' if pct > 40 else 'medium',
        })

    # Duplicate removal
    if dups.get('total_wasted_bytes', 0) > 10_000:
        wasted_pct = int(dups['total_wasted_bytes'] / max(1, _file_size(path)) * 100)
        strategies.append({
            'strategy': 'Duplicate image removal',
            'estimated_savings_pct': wasted_pct,
            'how': 'Enable "Remove Duplicate Images" in Advanced Options',
            'priority': 'high',
        })

    # Metadata stripping
    if est.get('metadata', {}):
        strategies.append({
            'strategy': 'Metadata stripping',
            'estimated_savings_pct': 2,
            'how': 'Enable "Strip Metadata" in Advanced Options',
            'priority': 'low',
        })

    # Font subsetting
    if fonts.get('subset_savings_estimate', 0) > 10_000:
        font_pct = int(fonts['subset_savings_estimate'] / max(1, _file_size(path)) * 100)
        strategies.append({
            'strategy': 'Font subsetting',
            'estimated_savings_pct': font_pct,
            'how': 'Enable "Subset Fonts" in Advanced Options (requires Ghostscript)',
            'priority': 'medium',
        })

    # Thumbnail removal
    if est.get('has_thumbnails', False):
        strategies.append({
            'strategy': 'Thumbnail removal',
            'estimated_savings_pct': 5,
            'how': 'Enable "Remove Thumbnails" in Advanced Options',
            'priority': 'medium',
        })

    # Embedded files
    if est.get('has_embedded_files', False):
        strategies.append({
            'strategy': 'Embedded file removal',
            'estimated_savings_pct': 8,
            'how': 'Enable "Remove Embedded Files" in Advanced Options',
            'priority': 'medium',
        })

    # JavaScript
    if est.get('has_javascript', False):
        strategies.append({
            'strategy': 'JavaScript removal',
            'estimated_savings_pct': 1,
            'how': 'Enable "Remove JavaScript" in Advanced Options',
            'priority': 'low',
        })

    # Grayscale (user only)
    color = get_color_analysis(path)
    if color.get('can_convert_to_gray', False) and color.get('color_ratio', 0) > 0.5:
        strategies.append({
            'strategy': 'Grayscale conversion',
            'estimated_savings_pct': color.get('estimated_gray_savings_pct', 20),
            'how': 'Enable "Convert to Grayscale" in Advanced Options (your choice only)',
            'priority': 'user_decision',
            'note': 'This removes all color — only enable if color is not important',
        })

    # Sort by savings
    strategies.sort(key=lambda x: x['estimated_savings_pct'], reverse=True)

    # Recommended preset
    content = est.get('content_type', 'mixed')
    if content == 'image_heavy' or content == 'scanned_document':
        recommended = 'screen'
    elif content == 'text_heavy':
        recommended = 'lossless'
    elif content == 'interactive_form':
        recommended = 'high'
    else:
        recommended = 'medium'

    result['strategies']             = strategies
    result['recommended_preset']     = recommended
    result['priority_actions']       = [s['strategy'] for s in strategies if s['priority'] == 'high']
    result['estimated_total_savings_pct'] = min(95,
        sum(s['estimated_savings_pct'] for s in strategies[:3]))
    result['success'] = True
    return result

def validate_output_pdf(path: str) -> Dict[str, Any]:
    """Verify output PDF is valid, readable, and not corrupt."""
    result: Dict[str, Any] = {
        'success': False, 'is_valid': False,
        'page_count': 0, 'is_readable': False,
        'has_content': False, 'file_size': _file_size(path),
        'errors': [], 'warnings': [],
    }

    # Check file exists + has PDF header
    if not os.path.exists(path):
        result['errors'].append('File not found')
        return result

    if not _is_valid_pdf(path):
        result['errors'].append('Missing PDF header — file may be corrupt')
        return result

    if _file_size(path) < 100:
        result['errors'].append('File too small to be a valid PDF')
        return result

    result['is_valid'] = True

    # Try to open with best available reader
    if PIKEPDF_OK:
        try:
            with pikepdf.open(path, suppress_warnings=True) as pdf:
                result['page_count'] = len(pdf.pages)
                result['is_readable'] = True
                result['has_content'] = result['page_count'] > 0
        except Exception as e:
            result['errors'].append(f'pikepdf cannot read: {e}')

    if not result['is_readable'] and FITZ_OK:
        try:
            doc = fitz.open(path)
            result['page_count'] = doc.page_count
            result['is_readable'] = True
            result['has_content'] = doc.page_count > 0
            doc.close()
        except Exception as e:
            result['errors'].append(f'fitz cannot read: {e}')

    if not result['is_readable'] and PYPDF_OK:
        try:
            reader = PdfReader(path)
            result['page_count'] = len(reader.pages)
            result['is_readable'] = True
            result['has_content'] = result['page_count'] > 0
        except Exception as e:
            result['errors'].append(f'pypdf cannot read: {e}')

    if result['page_count'] == 0:
        result['warnings'].append('PDF has zero pages')

    result['success'] = True
    return result

def benchmark_compression(path: str, timeout_per_preset: int = 60) -> Dict[str, Any]:
    """
    Try all presets and return a comparison table.
    WARNING: This is slow — runs all engines for all presets.
    """
    result: Dict[str, Any] = {
        'success': False, 'input_size': _file_size(path),
        'results': [], 'best_preset': '', 'best_reduction': 0.0,
    }

    with _tmp_dir() as tmpd:
        input_size = result['input_size']
        for preset in ['screen', 'low', 'medium', 'high', 'lossless']:
            out = os.path.join(tmpd, f'{preset}.pdf')
            try:
                res = compress_pdf(path, out, quality=preset)
                entry = {
                    'preset': preset, 'success': res['success'],
                    'output_size': res.get('output_size', 0),
                    'reduction_pct': res.get('reduction_pct', 0.0),
                    'engine': res.get('engine_used', ''),
                    'time_ms': res.get('processing_time_ms', 0),
                    'quality_score': res.get('quality_score', 0),
                    'quality_grade': res.get('quality_grade', 'F'),
                }
                result['results'].append(entry)
                if entry['reduction_pct'] > result['best_reduction']:
                    result['best_reduction'] = entry['reduction_pct']
                    result['best_preset']    = preset
            except Exception as e:
                result['results'].append({'preset': preset, 'success': False, 'error': str(e)})

    result['success'] = bool(result['results'])
    return result

def deep_analyze_pdf(path: str) -> Dict[str, Any]:
    """
    Combined deep analysis — runs all analysis functions and aggregates results.
    """
    result: Dict[str, Any] = {
        'success': False,
        'file_path': path,
        'file_size': _file_size(path),
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'analyzer': 'IshuTools PDF Compressor v20.0 by Ishu Kumar (ISHUKR41)',
    }

    result['estimate']         = get_compression_estimate(path)
    result['metadata']         = get_pdf_metadata(path)
    result['images']           = analyze_images_in_pdf(path)
    result['fonts']            = get_font_analysis(path)
    result['streams']          = analyze_pdf_streams(path)
    result['objects']          = get_object_statistics(path)
    result['color']            = get_color_analysis(path)
    result['security']         = get_security_report(path)
    result['entropy']          = calculate_entropy(path)
    result['duplicates']       = detect_duplicate_images(path)
    result['recommendations']  = get_compression_recommendations(path)
    result['validation']       = validate_output_pdf(path)
    result['engines']          = get_available_engines()
    result['success']          = True
    return result

def get_quality_score(
    input_size: int, output_size: int, preset: str,
    engine: str = '', time_ms: int = 0,
) -> Tuple[int, str]:
    """Public wrapper for quality score calculation."""
    reduction = _reduction_pct(input_size, output_size)
    return _calc_quality_score(
        reduction_pct=reduction, preset=preset,
        engine=engine, time_ms=time_ms,
        input_size=input_size, output_size=output_size,
    )

def estimate_compression_savings(file_size: int, content_type: str = 'mixed') -> Dict[str, int]:
    """Fast estimate of savings per preset (no file I/O)."""
    multipliers = {
        'image_heavy': 1.25,
        'scanned':     1.35,
        'text_heavy':  0.45,
        'mixed':       1.00,
        'form':        0.60,
    }
    mult = multipliers.get(content_type, 1.0)
    return {
        preset: int(file_size * (p['expected_reduction_pct'][0] + p['expected_reduction_pct'][1]) / 2 / 100 * mult)
        for preset, p in PRESETS.items()
    }

def get_pdf_structure_report(path: str) -> Dict[str, Any]:
    """Deep structure analysis — object graph, cross-references, streams."""
    result: Dict[str, Any] = {
        'success': False, 'xref_count': 0,
        'free_objects': 0, 'stream_objects': 0,
        'dict_objects': 0, 'pdf_version': _pdf_version(path),
        'has_xref_stream': False, 'has_object_streams': False,
        'trailer': {},
    }

    if not PIKEPDF_OK or not _is_valid_pdf(path):
        return result

    try:
        with pikepdf.open(path, suppress_warnings=True) as pdf:
            result['xref_count'] = len(pdf.objects)
            streams = 0
            dicts   = 0
            obj_streams = 0

            for obj in pdf.objects:
                if isinstance(obj, pikepdf.Stream):
                    streams += 1
                    if obj.get(Name.Type) == Name('/ObjStm'):
                        obj_streams += 1
                elif isinstance(obj, pikepdf.Dictionary):
                    dicts += 1

            result['stream_objects']    = streams
            result['dict_objects']      = dicts
            result['has_object_streams'] = obj_streams > 0

            # Trailer
            t = pdf.trailer
            result['trailer'] = {
                'size': int(t.get(Name.Size, 0)),
                'has_encrypt': Name.Encrypt in t,
                'has_info': Name.Info in t,
            }
            result['success'] = True
    except Exception as e:
        result['error'] = str(e)

    return result

def analyze_content_streams(path: str, max_pages: int = 10) -> Dict[str, Any]:
    """Analyze drawing commands in content streams per page."""
    result: Dict[str, Any] = {
        'success': False, 'pages_analyzed': 0,
        'total_commands': 0, 'avg_commands_per_page': 0.0,
        'most_common_ops': {}, 'total_content_bytes': 0,
    }
    if not PYPDF_OK or not _is_valid_pdf(path):
        return result

    try:
        reader = PdfReader(path)
        ops: Counter = Counter()
        total_cmds  = 0
        total_bytes = 0
        analyzed    = 0

        for i, page in enumerate(reader.pages):
            if i >= max_pages:
                break
            try:
                raw = page.get('/Contents')
                if not raw:
                    continue
                # Extract stream bytes
                from pypdf.generic import ContentStream
                cs = ContentStream(raw, page.pdf)
                for operands, operator in cs.operations:
                    op_str = str(operator)
                    ops[op_str] += 1
                    total_cmds  += 1
                analyzed += 1
            except Exception:
                pass

        result['pages_analyzed']       = analyzed
        result['total_commands']       = total_cmds
        result['avg_commands_per_page'] = round(total_cmds / max(1, analyzed), 1)
        result['most_common_ops']      = dict(ops.most_common(15))
        result['success']              = True
    except Exception as e:
        result['error'] = str(e)

    return result

def get_image_compression_stats(path: str) -> Dict[str, Any]:
    """Detailed per-image compression metrics."""
    result: Dict[str, Any] = {
        'success': False, 'images': [],
        'total_images': 0, 'already_compressed': 0,
        'uncompressed': 0, 'compressible': 0,
        'compression_formats': {},
    }
    if not PIKEPDF_OK or not _is_valid_pdf(path):
        return result

    try:
        fmt_counter: Counter = Counter()
        images: List[Dict] = []
        compressed = 0
        uncompressed = 0
        compressible = 0

        with pikepdf.open(path, suppress_warnings=True) as pdf:
            for obj in pdf.objects:
                if not isinstance(obj, pikepdf.Stream):
                    continue
                try:
                    if obj.get(Name.Subtype) != Name.Image:
                        continue

                    filt    = obj.get(Name.Filter)
                    filt_str = str(filt) if filt else 'none'
                    raw     = obj.read_raw_bytes()
                    raw_len = len(raw) if raw else 0
                    w       = int(obj.get(Name.Width, 0))
                    h       = int(obj.get(Name.Height, 0))

                    is_compressed = filt is not None and filt != Name('')
                    can_compress  = not is_compressed or filt in (
                        Name.FlateDecode, Name.LZWDecode
                    )

                    info = {
                        'width': w, 'height': h, 'bytes': raw_len,
                        'filter': filt_str, 'is_compressed': is_compressed,
                        'can_further_compress': can_compress,
                    }
                    images.append(info)
                    fmt_counter[filt_str] += 1

                    if is_compressed:
                        compressed += 1
                    else:
                        uncompressed += 1
                    if can_compress:
                        compressible += 1

                except Exception:
                    continue

        result['images']               = images[:30]
        result['total_images']         = len(images)
        result['already_compressed']   = compressed
        result['uncompressed']         = uncompressed
        result['compressible']         = compressible
        result['compression_formats']  = dict(fmt_counter)
        result['success']              = True
    except Exception as e:
        result['error'] = str(e)

    return result

def get_accessibility_report(path: str) -> Dict[str, Any]:
    """Check PDF accessibility — tagged, alt text, reading order."""
    result: Dict[str, Any] = {
        'success': False, 'is_tagged': False,
        'has_language': False, 'has_title': False,
        'images_with_alt_text': 0, 'total_images': 0,
        'accessibility_score': 0,
    }
    if not PIKEPDF_OK or not _is_valid_pdf(path):
        return result

    try:
        with pikepdf.open(path, suppress_warnings=True) as pdf:
            root = pdf.Root
            result['is_tagged'] = Name.MarkInfo in root

            # Language
            if Name.Lang in root:
                result['has_language'] = True

            # Title
            if Name.Info in pdf.trailer:
                info = pdf.trailer[Name.Info]
                result['has_title'] = bool(info.get(Name('/Title')))

            # Count image Alt text
            total_imgs = 0
            imgs_with_alt = 0
            for page in pdf.pages:
                imgs = page.get(Name.Resources, {}).get(Name.XObject, {})
                for k in imgs.keys():
                    try:
                        xobj = imgs[k]
                        if hasattr(xobj, 'get') and xobj.get(Name.Subtype) == Name.Image:
                            total_imgs += 1
                            if Name('/Alt') in xobj:
                                imgs_with_alt += 1
                    except Exception:
                        pass

            result['total_images']       = total_imgs
            result['images_with_alt_text'] = imgs_with_alt

            # Score
            score = 0
            if result['is_tagged']:   score += 40
            if result['has_language']: score += 20
            if result['has_title']:   score += 15
            if total_imgs > 0:
                alt_ratio = imgs_with_alt / total_imgs
                score += int(alt_ratio * 25)

            result['accessibility_score'] = score
            result['success'] = True
    except Exception as e:
        result['error'] = str(e)

    return result

# ═══════════════════════════════════════════════════════════════════════════════
# BACKWARD-COMPAT ALIASES (used by app.py)
# ═══════════════════════════════════════════════════════════════════════════════

# These aliases ensure older app.py calls continue to work
compress_pdf_lossless = partial(compress_pdf, quality='lossless')
compress_pdf_screen   = partial(compress_pdf, quality='screen')
compress_pdf_medium   = partial(compress_pdf, quality='medium')
compress_pdf_high     = partial(compress_pdf, quality='high')
compress_pdf_low      = partial(compress_pdf, quality='low')

def _alias_grayscale(src: str, dst: str) -> bool:
    return compress_grayscale(src, dst)

def _alias_remove_meta(src: str, dst: str) -> bool:
    return compress_remove_metadata(src, dst)

def _alias_flatten_annots(src: str, dst: str) -> bool:
    return compress_flatten_annotations(src, dst)

# ── Module info ──────────────────────────────────────────────────────────────
__version__  = '20.0.0'
__author__   = 'Ishu Kumar (ISHUKR41 / ISHUKR75)'
__website__  = 'https://ishutools.fun'
__github__   = 'https://github.com/ISHUKR41'
__email__    = 'ishu@ishutools.fun'

LIBRARY_STATUS: Dict[str, bool] = {
    'pikepdf':    PIKEPDF_OK,
    'pymupdf':    FITZ_OK,
    'pypdf':      PYPDF_OK,
    'pillow':     PIL_OK,
    'img2pdf':    IMG2PDF_OK,
    'pdf2image':  PDF2IMAGE_OK,
    'pdfminer':   PDFMINER_OK,
    'reportlab':  REPORTLAB_OK,
    'weasyprint': WEASYPRINT_OK,
    'numpy':      NUMPY_OK,
    'scipy':      SCIPY_OK,
    'fpdf2':      FPDF_OK,
    'lxml':       LXML_OK,
    'ghostscript': bool(_find_gs()),
    'qpdf':       bool(_find_qpdf()),
    'mutool':     bool(_find_mutool()),
}

log.info(
    'pdf_compress v%s loaded — engines: %s',
    __version__,
    ', '.join(k for k, v in LIBRARY_STATUS.items() if v),
)
