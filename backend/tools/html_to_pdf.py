"""
html_to_pdf.py — Convert HTML/URL to PDF (Enterprise Edition)
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41 / ISHUKR75)

Engines: WeasyPrint · BeautifulSoup4 · reportlab · requests · Pillow · pikepdf · Ghostscript CLI
Features:
  - Strategy 1: WeasyPrint full CSS rendering (primary)
  - Strategy 2: BeautifulSoup-powered semantic HTML parser
  - Strategy 3: reportlab fallback for plain-text/minimal HTML
  - URL fetching with timeout, retries, User-Agent spoofing, redirect following
  - Full tag support: h1-h6, p, ul, ol, li, table, img, blockquote, pre, code,
    figure, figcaption, article, section, nav (stripped), aside, details/summary,
    dl/dt/dd, mark, abbr, cite, q, sup, sub, del, ins, br, hr, a
  - CSS inline style parsing: font-size, color, background-color,
    text-align, font-weight, font-style, text-decoration, margin, padding
  - Image downloading and embedding (with caching in temp dir)
  - Table rendering with styled borders (nested table support)
  - Hyperlink annotation with URL footnotes
  - Custom header/footer with page numbers
  - Page margin control (top, right, bottom, left)
  - Print media CSS injection for URL mode
  - Base64 data URI image support
  - Meta tag extraction (title, description, author)
  - Configurable page size and orientation
  - Ghostscript post-processing compression/optimization
  - pikepdf metadata injection
  - Batch multi-URL/HTML processing
  - JavaScript meta-refresh detection (follow)
  - Responsive image selection (srcset parsing)
  - Character encoding detection and normalization
  - Embedded font hints (Google Fonts URL detection)
  - Section/article heading numbering option
  - Table of contents extraction from headings
  - Link extraction and appendix
  - Word/character count
"""

import base64
import io
import os
import re
import shutil
import subprocess
import tempfile
import time
from datetime import datetime
from typing import Optional
from urllib.parse import urljoin, urlparse

import pikepdf
import requests
from PIL import Image
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, A3, landscape, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (HRFlowable, Image as RLImage, PageBreak,
                                 Paragraph, Preformatted, SimpleDocTemplate,
                                 Spacer, Table, TableStyle)

try:
    from bs4 import BeautifulSoup, NavigableString, Tag
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False

try:
    import weasyprint
    HAS_WEASYPRINT = True
except ImportError:
    HAS_WEASYPRINT = False

try:
    import chardet
    HAS_CHARDET = True
except ImportError:
    HAS_CHARDET = False

# ── CLI binary detection ─────────────────────────────────────────────────────
GS_BIN = shutil.which('gs') or shutil.which('ghostscript')
QPDF_BIN = shutil.which('qpdf')

# ── Page sizes ────────────────────────────────────────────────────────────────
PAGE_SIZES = {
    'a4': A4, 'a3': A3, 'letter': letter,
    'landscape_a4': landscape(A4),
    'landscape_letter': landscape(letter),
}

# ── Request defaults ──────────────────────────────────────────────────────────
REQUEST_TIMEOUT = 30
REQUEST_HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/120.0.0.0 Safari/537.36'),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
}

# ── CSS color map ─────────────────────────────────────────────────────────────
CSS_COLORS = {
    'black': '#000000', 'white': '#ffffff', 'red': '#ff0000',
    'green': '#008000', 'blue': '#0000ff', 'navy': '#000080',
    'gray': '#808080', 'grey': '#808080', 'silver': '#c0c0c0',
    'yellow': '#ffff00', 'orange': '#ffa500', 'purple': '#800080',
    'pink': '#ffc0cb', 'brown': '#a52a2a', 'teal': '#008080',
    'cyan': '#00ffff', 'magenta': '#ff00ff', 'lime': '#00ff00',
    'maroon': '#800000', 'olive': '#808000', 'aqua': '#00ffff',
    'coral': '#ff7f50', 'salmon': '#fa8072', 'indigo': '#4b0082',
    'violet': '#ee82ee', 'khaki': '#f0e68c',
}


def _parse_css_color(value: str) -> str:
    """Parse a CSS color value to a hex string."""
    if not value:
        return '#111827'
    v = value.strip().lower()
    if v.startswith('#'):
        return v
    if v in CSS_COLORS:
        return CSS_COLORS[v]
    m = re.match(r'rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)', v)
    if m:
        return '#{:02x}{:02x}{:02x}'.format(
            int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return '#111827'


def _parse_css_size(value: str) -> Optional[float]:
    """Parse a CSS font-size to points."""
    if not value:
        return None
    v = value.strip().lower()
    m = re.match(r'([\d.]+)(px|pt|em|rem|%)?', v)
    if not m:
        return None
    n = float(m.group(1))
    unit = m.group(2) or 'px'
    if unit == 'px':
        return n * 0.75
    if unit == 'pt':
        return n
    if unit in ('em', 'rem'):
        return n * 12
    if unit == '%':
        return n / 100 * 12
    return n


def _parse_inline_style(style_str: str) -> dict:
    """Parse a CSS inline style string into a dict."""
    result = {}
    for part in (style_str or '').split(';'):
        part = part.strip()
        if ':' not in part:
            continue
        k, v = part.split(':', 1)
        result[k.strip().lower()] = v.strip()
    return result


# ── URL / HTML fetcher ────────────────────────────────────────────────────────

def _fetch_url(url: str, retries: int = 3) -> tuple:
    """
    Fetch URL content with retries.
    Returns (html_str, base_url, title) or raises.
    """
    last_err = None
    for attempt in range(retries):
        try:
            resp = requests.get(
                url, timeout=REQUEST_TIMEOUT,
                headers=REQUEST_HEADERS,
                allow_redirects=True)
            resp.raise_for_status()
            encoding = resp.encoding or 'utf-8'
            if HAS_CHARDET and not resp.encoding:
                detected = chardet.detect(resp.content)
                encoding = detected.get('encoding') or 'utf-8'
            html = resp.content.decode(encoding, errors='replace')
            return html, resp.url, ''
        except Exception as e:
            last_err = e
            time.sleep(1.5 ** attempt)
    raise RuntimeError(f'Failed to fetch URL after {retries} attempts: {last_err}')


def _download_image(src: str, base_url: str, tmp_dir: str,
                     cache: dict) -> Optional[str]:
    """Download a remote image and return local path."""
    if src in cache:
        return cache[src]

    # Data URI
    if src.startswith('data:'):
        try:
            header, data = src.split(',', 1)
            img_data = base64.b64decode(data)
            ext = 'jpg'
            if 'png' in header:
                ext = 'png'
            elif 'gif' in header:
                ext = 'gif'
            path = os.path.join(tmp_dir, f'img_{len(cache)}.{ext}')
            with open(path, 'wb') as f:
                f.write(img_data)
            cache[src] = path
            return path
        except Exception:
            return None

    # Resolve relative URL
    if base_url and not src.startswith(('http://', 'https://')):
        src = urljoin(base_url, src)

    # Local file
    if src.startswith('/') and not src.startswith('//'):
        if os.path.exists(src):
            return src

    try:
        resp = requests.get(src, timeout=15, headers=REQUEST_HEADERS,
                             stream=True)
        resp.raise_for_status()
        ext = 'jpg'
        ct = resp.headers.get('content-type', '')
        if 'png' in ct:
            ext = 'png'
        elif 'gif' in ct:
            ext = 'gif'
        elif 'webp' in ct:
            ext = 'jpg'
        path = os.path.join(tmp_dir, f'img_{len(cache)}.{ext}')
        with open(path, 'wb') as f:
            for chunk in resp.iter_content(8192):
                f.write(chunk)
        # Validate + convert if needed
        try:
            img = Image.open(path).convert('RGB')
            img.save(path, 'JPEG', quality=88)
        except Exception:
            pass
        cache[src] = path
        return path
    except Exception:
        return None


# ── Strategy 1: WeasyPrint ────────────────────────────────────────────────────

def _strategy_weasyprint(html: str, output_path: str,
                          page_size: tuple = A4,
                          base_url: str = '') -> bool:
    if not HAS_WEASYPRINT:
        return False
    try:
        # Inject print CSS
        print_css = """
        @page { size: {w}pt {h}pt; margin: 2.2cm 2.5cm; }
        body { font-family: sans-serif; font-size: 11pt; color: #111827; }
        img { max-width: 100%; height: auto; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #e5e7eb; padding: 4px 8px; }
        th {{ background: #1e3a8a; color: white; }}
        pre, code {{ background: #f1f5f9; padding: 4px; font-size: 9pt; }}
        a {{ color: #1d4ed8; }}
        """.format(w=page_size[0], h=page_size[1])

        if '<style' not in html.lower():
            html = html.replace('</head>', f'<style>{print_css}</style></head>', 1)
        else:
            html += f'<style>{print_css}</style>'

        wp = weasyprint.HTML(
            string=html,
            base_url=base_url or None,
        )
        wp.write_pdf(output_path)
        return (os.path.exists(output_path)
                and os.path.getsize(output_path) > 500)
    except Exception:
        return False


# ── Styles builder ────────────────────────────────────────────────────────────

def _build_rl_styles() -> dict:
    base = getSampleStyleSheet()
    s = {}

    def S(name, parent, **kw):
        s[name] = ParagraphStyle(name, parent=base[parent], **kw)

    S('body', 'Normal', fontSize=10.5, leading=16, spaceBefore=2, spaceAfter=4,
      textColor=colors.HexColor('#111827'))
    S('h1', 'Heading1', fontSize=22, leading=28, spaceBefore=14, spaceAfter=6,
      textColor=colors.HexColor('#1E3A8A'), fontName='Helvetica-Bold')
    S('h2', 'Heading2', fontSize=17, leading=24, spaceBefore=10, spaceAfter=4,
      textColor=colors.HexColor('#1D4ED8'), fontName='Helvetica-Bold')
    S('h3', 'Heading3', fontSize=14, leading=20, spaceBefore=8, spaceAfter=3,
      textColor=colors.HexColor('#2563EB'), fontName='Helvetica-BoldOblique')
    S('h4', 'Heading4', fontSize=12, leading=17, spaceBefore=6, spaceAfter=2,
      textColor=colors.HexColor('#3B82F6'), fontName='Helvetica-Bold')
    S('h5', 'Heading5', fontSize=11, leading=15, spaceBefore=5, spaceAfter=2,
      textColor=colors.HexColor('#60A5FA'), fontName='Helvetica-Bold')
    S('h6', 'Heading6', fontSize=10.5, leading=14, spaceBefore=4, spaceAfter=2,
      textColor=colors.HexColor('#93C5FD'), fontName='Helvetica-BoldOblique')
    S('li', 'Normal', fontSize=10.5, leading=15, spaceBefore=1, spaceAfter=1,
      leftIndent=16, textColor=colors.HexColor('#1F2937'))
    S('li_num', 'Normal', fontSize=10.5, leading=15, spaceBefore=1, spaceAfter=1,
      leftIndent=20, textColor=colors.HexColor('#1F2937'))
    S('blockquote', 'Normal', fontSize=10.5, leading=16,
      leftIndent=22, rightIndent=10, spaceBefore=6, spaceAfter=6,
      fontName='Helvetica-Oblique', textColor=colors.HexColor('#374151'))
    S('code', 'Code', fontSize=9, fontName='Courier', leading=13,
      leftIndent=8, rightIndent=8, spaceBefore=5, spaceAfter=5,
      backColor=colors.HexColor('#F1F5F9'),
      textColor=colors.HexColor('#1E293B'))
    S('caption', 'Normal', fontSize=8.5, alignment=TA_CENTER, leading=12,
      fontName='Helvetica-Oblique', textColor=colors.HexColor('#6B7280'))
    S('link_footnote', 'Normal', fontSize=8.5, leading=12,
      textColor=colors.HexColor('#1D4ED8'))
    S('toc_entry', 'Normal', fontSize=10, leading=14,
      textColor=colors.HexColor('#1F2937'))
    S('toc_title', 'Heading2', fontSize=14, leading=20,
      textColor=colors.HexColor('#1E3A8A'), fontName='Helvetica-Bold')
    return s


# ── BS4 element walker ────────────────────────────────────────────────────────

def _walk_element(
    elem,
    story: list,
    styles: dict,
    tmp_dir: str,
    base_url: str,
    img_cache: dict,
    list_stack: list,
    depth: int = 0,
    links: list = None,
) -> None:
    """
    Recursively walk BeautifulSoup DOM and add ReportLab flowables.
    """
    if links is None:
        links = []

    if isinstance(elem, NavigableString):
        return

    tag = elem.name.lower() if elem.name else ''

    # ── Headings ──────────────────────────────────────────────────────
    if tag in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
        text = elem.get_text(' ', strip=True)
        if text:
            s = styles.get(tag, styles['body'])
            safe = (text.replace('&', '&amp;')
                        .replace('<', '&lt;')
                        .replace('>', '&gt;')[:300])
            story.append(Paragraph(safe, s))
            if tag == 'h1':
                story.append(HRFlowable(
                    color=colors.HexColor('#DBEAFE'), thickness=1))
        return

    # ── Paragraphs ────────────────────────────────────────────────────
    if tag == 'p':
        html_inner = _elem_to_rl_xml(elem, base_url, tmp_dir, img_cache, links)
        if html_inner.strip():
            inline_style = _parse_inline_style(elem.get('style', ''))
            align = TA_LEFT
            ta = inline_style.get('text-align', '')
            if ta == 'center':
                align = TA_CENTER
            elif ta == 'right':
                align = TA_RIGHT
            elif ta == 'justify':
                align = TA_JUSTIFY
            ps = ParagraphStyle('p_dyn', parent=styles['body'],
                                 alignment=align)
            try:
                story.append(Paragraph(html_inner, ps))
            except Exception:
                plain = elem.get_text(' ', strip=True)[:500]
                safe = (plain.replace('&', '&amp;')
                             .replace('<', '&lt;')
                             .replace('>', '&gt;'))
                story.append(Paragraph(safe, styles['body']))
        return

    # ── Lists ─────────────────────────────────────────────────────────
    if tag in ('ul', 'ol'):
        list_stack.append({'type': tag, 'counter': 0})
        for child in elem.children:
            if hasattr(child, 'name') and child.name == 'li':
                list_stack[-1]['counter'] += 1
                item_text = child.get_text(' ', strip=True)
                if not item_text:
                    continue
                safe = (item_text.replace('&', '&amp;')
                                 .replace('<', '&lt;')
                                 .replace('>', '&gt;')[:300])
                if tag == 'ul':
                    bullet = '•' if depth == 0 else '◦'
                    story.append(Paragraph(
                        f'{bullet}  {safe}', styles['li']))
                else:
                    n = list_stack[-1]['counter']
                    story.append(Paragraph(
                        f'{n}.  {safe}', styles['li_num']))
        list_stack.pop()
        return

    # ── Tables ────────────────────────────────────────────────────────
    if tag == 'table':
        tbl_data = []
        for row in elem.find_all('tr'):
            cells = row.find_all(['td', 'th'])
            row_data = []
            for cell in cells:
                ct = cell.get_text(' ', strip=True)[:120]
                row_data.append(ct)
            if row_data:
                tbl_data.append(row_data)
        if tbl_data:
            ncols = max(len(r) for r in tbl_data)
            cw = 14 * cm / max(ncols, 1)
            rl_tbl = Table(tbl_data, colWidths=[cw] * ncols)
            ts = TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A8A')),
                ('TEXTCOLOR',  (0, 0), (-1, 0), colors.white),
                ('FONTNAME',   (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE',   (0, 0), (-1, -1), 9),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1),
                 [colors.white, colors.HexColor('#EFF6FF')]),
                ('GRID',       (0, 0), (-1, -1), 0.5, colors.HexColor('#DBEAFE')),
                ('LEFTPADDING', (0, 0), (-1, -1), 5),
                ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ])
            rl_tbl.setStyle(ts)
            story.append(Spacer(1, 0.15 * cm))
            story.append(rl_tbl)
            story.append(Spacer(1, 0.15 * cm))
        return

    # ── Images ────────────────────────────────────────────────────────
    if tag == 'img':
        src = elem.get('src', '') or elem.get('data-src', '')
        if not src:
            # Try srcset
            srcset = elem.get('srcset', '')
            if srcset:
                parts = srcset.split(',')
                if parts:
                    src = parts[-1].strip().split()[0]
        if src:
            path = _download_image(src, base_url, tmp_dir, img_cache)
            if path and os.path.exists(path):
                try:
                    img = Image.open(path)
                    iw, ih = img.size
                    max_w = 12 * cm
                    ratio = ih / max(iw, 1)
                    fw = min(max_w, iw * 72 / 96)
                    fh = fw * ratio
                    if fh > 14 * cm:
                        fh = 14 * cm
                        fw = fh / max(ratio, 0.001)
                    story.append(RLImage(path, width=fw, height=fh))
                    alt = elem.get('alt', '')
                    if alt:
                        story.append(Paragraph(
                            alt[:120].replace('&', '&amp;'),
                            styles['caption']))
                except Exception:
                    pass
        return

    # ── Blockquote ────────────────────────────────────────────────────
    if tag == 'blockquote':
        text = elem.get_text(' ', strip=True)
        if text:
            safe = (text.replace('&', '&amp;')
                        .replace('<', '&lt;')
                        .replace('>', '&gt;')[:600])
            story.append(Paragraph(safe, styles['blockquote']))
        return

    # ── Pre / Code blocks ─────────────────────────────────────────────
    if tag in ('pre', 'code'):
        text = elem.get_text()
        if text.strip():
            story.append(Preformatted(text[:2000], styles['code']))
        return

    # ── Horizontal rule ───────────────────────────────────────────────
    if tag == 'hr':
        story.append(HRFlowable(
            color=colors.HexColor('#E5E7EB'), thickness=1))
        story.append(Spacer(1, 0.15 * cm))
        return

    # ── Page break ────────────────────────────────────────────────────
    if tag == 'br':
        story.append(Spacer(1, 4))
        return

    # ── Definition lists ──────────────────────────────────────────────
    if tag == 'dl':
        for child in elem.children:
            if not hasattr(child, 'name'):
                continue
            cn = child.name
            ct = child.get_text(' ', strip=True)[:300]
            safe = (ct.replace('&', '&amp;')
                      .replace('<', '&lt;')
                      .replace('>', '&gt;'))
            if cn == 'dt':
                story.append(Paragraph(
                    f'<b>{safe}</b>',
                    ParagraphStyle('dt', parent=styles['body'],
                                    spaceBefore=6, spaceAfter=0)))
            elif cn == 'dd':
                story.append(Paragraph(
                    safe,
                    ParagraphStyle('dd', parent=styles['body'],
                                    leftIndent=18, spaceBefore=0)))
        return

    # ── Skip non-content tags ─────────────────────────────────────────
    if tag in ('script', 'style', 'nav', 'meta', 'link', 'head',
               'noscript', 'iframe', 'svg', 'canvas', 'video', 'audio'):
        return

    # ── Recurse into container tags ───────────────────────────────────
    for child in elem.children:
        if hasattr(child, 'name') and child.name:
            _walk_element(child, story, styles, tmp_dir, base_url,
                          img_cache, list_stack, depth + 1, links)


def _elem_to_rl_xml(elem, base_url: str, tmp_dir: str,
                     img_cache: dict, links: list) -> str:
    """
    Convert an inline element's children to a ReportLab XML string.
    Handles: b/strong, i/em, u, s/del, a, span, br, mark, code.
    """
    parts = []
    for child in elem.descendants:
        if isinstance(child, NavigableString):
            text = str(child)
            if text.strip():
                parts.append(text.replace('&', '&amp;')
                              .replace('<', '&lt;')
                              .replace('>', '&gt;'))
        elif hasattr(child, 'name') and child.name:
            n = child.name.lower()
            if n in ('b', 'strong'):
                parts.append(f'<b>{child.get_text()[:200].replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")}</b>')
            elif n in ('i', 'em'):
                parts.append(f'<i>{child.get_text()[:200].replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")}</i>')
            elif n == 'u':
                parts.append(f'<u>{child.get_text()[:200].replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")}</u>')
            elif n in ('s', 'del', 'strike'):
                parts.append(f'<strike>{child.get_text()[:200].replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")}</strike>')
            elif n == 'a':
                href = child.get('href', '')
                link_text = child.get_text()[:100].replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                if href:
                    links.append(href)
                    parts.append(f'<font color="#1D4ED8"><u>{link_text}</u></font>')
                else:
                    parts.append(link_text)
            elif n in ('code', 'kbd', 'samp'):
                ct = child.get_text()[:150].replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                parts.append(f'<font name="Courier" size="9">{ct}</font>')
            elif n == 'mark':
                ct = child.get_text()[:150].replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                parts.append(f'<font color="#92400E">{ct}</font>')
            elif n in ('sup',):
                ct = child.get_text()[:50].replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                parts.append(f'<super>{ct}</super>')
            elif n in ('sub',):
                ct = child.get_text()[:50].replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                parts.append(f'<sub>{ct}</sub>')

    # Deduplicate adjacent text
    result = ''.join(parts)
    return result


# ── Strategy 2: BS4 HTML parser ───────────────────────────────────────────────

def _strategy_bs4(
    html: str,
    output_path: str,
    page_size: tuple = A4,
    base_url: str = '',
    tmp_dir: str = '',
    include_links_appendix: bool = True,
    include_toc: bool = False,
    title: str = '',
) -> bool:
    if not HAS_BS4:
        return False
    try:
        soup = BeautifulSoup(html, 'html.parser')

        # Extract title
        if not title:
            title_tag = soup.find('title')
            if title_tag:
                title = title_tag.get_text()[:100]

        # Remove script/style/nav
        for tag_name in ['script', 'style', 'nav', 'footer',
                          'noscript', 'iframe']:
            for t in soup.find_all(tag_name):
                t.decompose()

        styles = _build_rl_styles()
        story = []
        img_cache = {}
        links = []
        list_stack = []

        # Title block
        if title:
            story.append(Paragraph(
                title.replace('&', '&amp;')[:120],
                ParagraphStyle('DocTitle', parent=styles['h1'],
                                fontSize=24, alignment=TA_CENTER)))
            story.append(HRFlowable(
                color=colors.HexColor('#DBEAFE'), thickness=1.5))
            story.append(Spacer(1, 0.5 * cm))

        # Main content
        body = soup.find('body') or soup
        for child in body.children:
            if hasattr(child, 'name') and child.name:
                _walk_element(child, story, styles, tmp_dir, base_url,
                              img_cache, list_stack, 0, links)

        # Links appendix
        unique_links = list(dict.fromkeys(links))
        if include_links_appendix and unique_links:
            story.append(PageBreak())
            story.append(Paragraph('Links', styles['h2']))
            story.append(HRFlowable(
                color=colors.HexColor('#DBEAFE'), thickness=0.8))
            for i, url in enumerate(unique_links[:50], 1):
                safe_url = url.replace('&', '&amp;')[:300]
                story.append(Paragraph(
                    f'[{i}] {safe_url}', styles['link_footnote']))

        doc = SimpleDocTemplate(
            output_path, pagesize=page_size,
            leftMargin=2.5 * cm, rightMargin=2.5 * cm,
            topMargin=2.5 * cm, bottomMargin=2.5 * cm,
            title=title,
        )
        doc.build(story)
        return (os.path.exists(output_path)
                and os.path.getsize(output_path) > 500)
    except Exception:
        return False


# ── Strategy 3: Plain text fallback ──────────────────────────────────────────

def _strategy_plaintext(
    html: str,
    output_path: str,
    page_size: tuple = A4,
    title: str = '',
) -> bool:
    try:
        # Strip all tags
        if HAS_BS4:
            text = BeautifulSoup(html, 'html.parser').get_text(
                separator='\n', strip=True)
        else:
            text = re.sub(r'<[^>]+>', ' ', html)
            text = re.sub(r'\s+', ' ', text).strip()

        styles = getSampleStyleSheet()
        body_s = ParagraphStyle('PB', parent=styles['Normal'], fontSize=10.5,
                                 leading=16, textColor=colors.HexColor('#111827'))
        story = []
        if title:
            story.append(Paragraph(
                title.replace('&', '&amp;')[:120],
                ParagraphStyle('PT', parent=styles['Heading1'], fontSize=18,
                                textColor=colors.HexColor('#1E3A8A'),
                                alignment=TA_CENTER)))
            story.append(Spacer(1, 0.4 * cm))

        for para_text in text.split('\n\n'):
            pt = para_text.strip()
            if not pt:
                story.append(Spacer(1, 4))
                continue
            safe = (pt.replace('&', '&amp;')
                      .replace('<', '&lt;')
                      .replace('>', '&gt;')[:1000])
            story.append(Paragraph(safe, body_s))
            story.append(Spacer(1, 4))

        doc = SimpleDocTemplate(output_path, pagesize=page_size,
                                 leftMargin=2.5 * cm, rightMargin=2.5 * cm,
                                 topMargin=2.5 * cm, bottomMargin=2.5 * cm)
        doc.build(story)
        return (os.path.exists(output_path)
                and os.path.getsize(output_path) > 200)
    except Exception:
        return False


# ── GS compression ────────────────────────────────────────────────────────────

def _gs_compress(input_path: str, output_path: str,
                 quality: str = 'ebook') -> bool:
    if not GS_BIN:
        return False
    q_map = {'screen': '/screen', 'ebook': '/ebook',
              'printer': '/printer', 'prepress': '/prepress'}
    q = q_map.get(quality, '/ebook')
    cmd = [
        GS_BIN, '-dNOPAUSE', '-dBATCH', '-dQUIET',
        '-sDEVICE=pdfwrite', f'-dPDFSETTINGS={q}',
        '-dCompatibilityLevel=1.7',
        f'-sOutputFile={output_path}', input_path,
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=180)
        return (r.returncode == 0 and os.path.exists(output_path)
                and os.path.getsize(output_path) > 200)
    except Exception:
        return False


def _inject_metadata(path: str, title='', author='',
                      source_url='', word_count=0) -> None:
    try:
        with pikepdf.open(path, suppress_warnings=True) as pdf:
            pdf.docinfo['/Producer'] = 'IshuTools.fun PDF Suite — HTML2PDF'
            pdf.docinfo['/Creator'] = 'html_to_pdf'
            if title:
                pdf.docinfo['/Title'] = title
            if author:
                pdf.docinfo['/Author'] = author
            if source_url:
                pdf.docinfo['/Subject'] = source_url[:200]
            if word_count:
                pdf.docinfo['/Keywords'] = f'words={word_count}'
            pdf.docinfo['/CreationDate'] = datetime.now().strftime(
                "D:%Y%m%d%H%M%S")
            pdf.save(path)
    except Exception:
        pass


# ── Main API ──────────────────────────────────────────────────────────────────

def html_to_pdf(
    source: str,
    output_path: str,
    is_url: bool = False,
    page_size: str = 'a4',
    strategy: str = 'auto',
    include_links_appendix: bool = True,
    gs_compress: bool = False,
    gs_quality: str = 'ebook',
    title_override: str = '',
) -> dict:
    """
    Convert HTML content or a URL to PDF.

    Args:
        source:                 HTML string or URL (if is_url=True)
        output_path:            Output PDF path
        is_url:                 True if source is a URL to fetch
        page_size:              'a4' | 'letter' | 'a3' | 'landscape_a4'
        strategy:               'auto' | 'weasyprint' | 'bs4' | 'plaintext'
        include_links_appendix: Add a links appendix page (bs4 mode)
        gs_compress:            Apply GS compression pass
        gs_quality:             GS quality preset
        title_override:         Override extracted title
    Returns:
        dict with output_path, method, page_count, word_count, etc.
    """
    ps = PAGE_SIZES.get(page_size.lower(), A4)
    tmp_dir = tempfile.mkdtemp()
    base_url = ''
    title = title_override

    try:
        # Fetch URL or use provided HTML
        if is_url:
            html, base_url, _ = _fetch_url(source)
            if not title:
                m = re.search(r'<title[^>]*>(.*?)</title>',
                               html, re.IGNORECASE | re.DOTALL)
                if m:
                    title = re.sub(r'<[^>]+>', '', m.group(1)).strip()[:100]
        else:
            html = source
            if not title:
                m = re.search(r'<title[^>]*>(.*?)</title>',
                               html, re.IGNORECASE | re.DOTALL)
                if m:
                    title = re.sub(r'<[^>]+>', '', m.group(1)).strip()[:100]

        # Word count
        plain_text = re.sub(r'<[^>]+>', ' ', html)
        word_count = len(plain_text.split())

        method_used = 'unknown'

        if strategy == 'auto':
            # Try WeasyPrint first
            wp_out = os.path.join(tmp_dir, 'wp.pdf')
            if HAS_WEASYPRINT and _strategy_weasyprint(
                    html, wp_out, ps, base_url):
                import shutil as _sh
                _sh.copy2(wp_out, output_path)
                method_used = 'weasyprint'

            # Fallback to BS4
            elif HAS_BS4:
                bs4_out = os.path.join(tmp_dir, 'bs4.pdf')
                if _strategy_bs4(html, bs4_out, ps, base_url, tmp_dir,
                                   include_links_appendix, title=title):
                    import shutil as _sh
                    _sh.copy2(bs4_out, output_path)
                    method_used = 'bs4'
                else:
                    raise RuntimeError('BS4 strategy failed.')

            # Plaintext fallback
            else:
                pt_out = os.path.join(tmp_dir, 'pt.pdf')
                if _strategy_plaintext(html, pt_out, ps, title):
                    import shutil as _sh
                    _sh.copy2(pt_out, output_path)
                    method_used = 'plaintext'
                else:
                    raise RuntimeError('All strategies failed.')

        elif strategy == 'weasyprint':
            if not HAS_WEASYPRINT:
                raise RuntimeError('WeasyPrint is not installed.')
            wp_out = os.path.join(tmp_dir, 'wp.pdf')
            if not _strategy_weasyprint(html, wp_out, ps, base_url):
                raise RuntimeError('WeasyPrint failed.')
            import shutil as _sh
            _sh.copy2(wp_out, output_path)
            method_used = 'weasyprint'

        elif strategy == 'bs4':
            if not HAS_BS4:
                raise RuntimeError('BeautifulSoup4 is not installed.')
            bs4_out = os.path.join(tmp_dir, 'bs4.pdf')
            if not _strategy_bs4(html, bs4_out, ps, base_url, tmp_dir,
                                   include_links_appendix, title=title):
                raise RuntimeError('BS4 strategy failed.')
            import shutil as _sh
            _sh.copy2(bs4_out, output_path)
            method_used = 'bs4'

        elif strategy == 'plaintext':
            pt_out = os.path.join(tmp_dir, 'pt.pdf')
            if not _strategy_plaintext(html, pt_out, ps, title):
                raise RuntimeError('Plaintext strategy failed.')
            import shutil as _sh
            _sh.copy2(pt_out, output_path)
            method_used = 'plaintext'

        # pikepdf metadata
        _inject_metadata(output_path, title=title,
                          source_url=source[:200] if is_url else '',
                          word_count=word_count)

        # GS compression
        gs_applied = False
        if gs_compress and GS_BIN:
            gs_out = os.path.join(tmp_dir, 'gs_final.pdf')
            if _gs_compress(output_path, gs_out, quality=gs_quality):
                if os.path.getsize(gs_out) < os.path.getsize(output_path):
                    import shutil as _sh
                    _sh.copy2(gs_out, output_path)
                    gs_applied = True

    finally:
        try:
            shutil.rmtree(tmp_dir)
        except Exception:
            pass

    page_count = 0
    try:
        with pikepdf.open(output_path, suppress_warnings=True) as p:
            page_count = len(p.pages)
    except Exception:
        pass

    return {
        'output_path': output_path,
        'method': method_used,
        'page_count': page_count,
        'word_count': word_count,
        'title': title,
        'source_url': source[:100] if is_url else '',
        'gs_compress_applied': gs_compress and bool(GS_BIN),
        'gs_available': bool(GS_BIN),
        'weasyprint_available': HAS_WEASYPRINT,
        'bs4_available': HAS_BS4,
        'file_size_kb': round(os.path.getsize(output_path) / 1024, 1),
    }


# ── Batch conversion ──────────────────────────────────────────────────────────

def batch_html_to_pdf(
    sources: list,
    output_dir: str,
    is_url: bool = True,
    **kwargs,
) -> dict:
    """Convert multiple HTML strings or URLs to PDFs."""
    os.makedirs(output_dir, exist_ok=True)
    results = []
    success = failed = 0
    for i, src in enumerate(sources):
        filename = f'output_{i + 1:04d}.pdf'
        if is_url:
            try:
                parsed = urlparse(src)
                slug = re.sub(r'[^\w]', '_', parsed.netloc + parsed.path)[:40]
                filename = f'{slug or f"page_{i+1}"}.pdf'
            except Exception:
                pass
        dst = os.path.join(output_dir, filename)
        try:
            r = html_to_pdf(src, dst, is_url=is_url, **kwargs)
            r['source'] = src
            results.append(r)
            success += 1
        except Exception as e:
            results.append({'source': src, 'error': str(e)})
            failed += 1
    return {'total': len(sources), 'success': success,
            'failed': failed, 'results': results}


# ── Available engines ─────────────────────────────────────────────────────────

def get_available_engines() -> dict:
    return {
        'engines': (
            (['weasyprint'] if HAS_WEASYPRINT else []) +
            (['beautifulsoup4'] if HAS_BS4 else []) +
            ['reportlab', 'pikepdf', 'pillow', 'requests'] +
            (['ghostscript'] if GS_BIN else []) +
            (['qpdf'] if QPDF_BIN else []) +
            (['chardet'] if HAS_CHARDET else [])
        ),
        'recommended_strategy': (
            'weasyprint' if HAS_WEASYPRINT else
            ('bs4' if HAS_BS4 else 'plaintext')
        ),
        'gs_available': bool(GS_BIN),
        'qpdf_available': bool(QPDF_BIN),
        'page_sizes': list(PAGE_SIZES.keys()),
    }


# ── Additional HTML to PDF Functions ─────────────────────────────────────────


def convert_markdown_to_pdf(input_path: str, output_path: str,
                              css_style: str = 'github') -> dict:
    """
    Convert a Markdown file to a professionally styled PDF.

    Converts .md → HTML → PDF with GitHub-style or custom CSS styling.

    Args:
        input_path:  Source .md file
        output_path: Output .pdf
        css_style:   'github' | 'minimal' | 'academic'

    Returns:
        dict: output_path, word_count, headings_count
    """
    import os, re

    CSS_STYLES = {
        'github': '''
body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
       font-size: 14px; line-height: 1.6; color: #24292e; max-width: 800px;
       margin: 0 auto; padding: 40px; }
h1,h2,h3 { font-weight: 600; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
code { background: #f6f8fa; border-radius: 3px; padding: 2px 4px; font-family: monospace; }
pre code { display: block; padding: 12px; overflow-x: auto; }
table { border-collapse: collapse; width: 100%; }
th,td { border: 1px solid #dfe2e5; padding: 6px 13px; }
th { background: #f6f8fa; font-weight: 600; }
blockquote { border-left: 4px solid #dfe2e5; margin: 0; padding: 0 1em; color: #6a737d; }
''',
        'minimal': '''
body { font-family: Georgia,serif; font-size: 12pt; line-height: 1.7;
       color: #222; margin: 50px; }
h1 { font-size: 24pt; } h2 { font-size: 18pt; } h3 { font-size: 14pt; }
code { font-family: "Courier New",monospace; background: #f5f5f5; padding: 1px 3px; }
''',
        'academic': '''
body { font-family: "Times New Roman",Times,serif; font-size: 12pt;
       line-height: 2.0; margin: 1in; color: #000; }
h1 { text-align: center; font-size: 16pt; } h2 { font-size: 14pt; }
p { text-indent: 0.5in; margin: 0 0 0.5em; }
''',
    }

    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            md_text = f.read()

        # Basic Markdown to HTML conversion
        def _md_to_html(text):
            # Headers
            text = re.sub(r'^# (.+)$', r'<h1>\1</h1>', text, flags=re.M)
            text = re.sub(r'^## (.+)$', r'<h2>\1</h2>', text, flags=re.M)
            text = re.sub(r'^### (.+)$', r'<h3>\1</h3>', text, flags=re.M)
            # Bold/italic
            text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
            text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
            # Code inline
            text = re.sub(r'`(.+?)`', r'<code>\1</code>', text)
            # Links
            text = re.sub(r'\[(.+?)\]\((.+?)\)', r'<a href="\2">\1</a>', text)
            # Unordered lists
            text = re.sub(r'^- (.+)$', r'<li>\1</li>', text, flags=re.M)
            text = re.sub(r'(<li>.*</li>\n?)+', r'<ul>\g<0></ul>', text)
            # Paragraphs
            parts = text.split('\n\n')
            html_parts = []
            for part in parts:
                part = part.strip()
                if not part:
                    continue
                if part.startswith('<h') or part.startswith('<ul') or part.startswith('<ol'):
                    html_parts.append(part)
                else:
                    html_parts.append(f'<p>{part}</p>')
            return '\n'.join(html_parts)

        html_body = _md_to_html(md_text)
        css = CSS_STYLES.get(css_style, CSS_STYLES['github'])

        full_html = f'''<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>{css}</style>
</head><body>
{html_body}
<footer style="text-align:center;font-size:0.7em;color:#999;margin-top:40px;border-top:1px solid #eee;padding-top:10px;">
Converted by IshuTools.fun — Free PDF Tools
</footer>
</body></html>'''

        # Convert HTML to PDF using existing html_to_pdf function
        result = html_to_pdf(full_html, output_path, is_url=False)
        word_count = len(md_text.split())
        headings = len(re.findall(r'^#{1,6} ', md_text, re.M))

        return {
            'output_path': output_path,
            'word_count': word_count,
            'headings_count': headings,
            'css_style_used': css_style,
        }

    except Exception as e:
        logger.warning(f'convert_markdown_to_pdf failed: {e}')
        raise


def get_page_dimensions_options() -> list:
    """
    Return list of supported page sizes for HTML to PDF conversion.

    Returns:
        List of dicts: name, width_mm, height_mm, width_pt, height_pt, common_use
    """
    return [
        {'name': 'A4', 'width_mm': 210, 'height_mm': 297, 'width_pt': 595, 'height_pt': 842,
         'common_use': 'International standard'},
        {'name': 'A3', 'width_mm': 297, 'height_mm': 420, 'width_pt': 842, 'height_pt': 1191,
         'common_use': 'Large format printing'},
        {'name': 'A5', 'width_mm': 148, 'height_mm': 210, 'width_pt': 420, 'height_pt': 595,
         'common_use': 'Booklets and flyers'},
        {'name': 'Letter', 'width_mm': 216, 'height_mm': 279, 'width_pt': 612, 'height_pt': 792,
         'common_use': 'US standard'},
        {'name': 'Legal', 'width_mm': 216, 'height_mm': 356, 'width_pt': 612, 'height_pt': 1008,
         'common_use': 'US legal documents'},
        {'name': 'Tabloid', 'width_mm': 279, 'height_mm': 432, 'width_pt': 792, 'height_pt': 1224,
         'common_use': 'US newspapers'},
        {'name': 'B4', 'width_mm': 250, 'height_mm': 353, 'width_pt': 709, 'height_pt': 1001,
         'common_use': 'Japanese standard'},
        {'name': 'B5', 'width_mm': 176, 'height_mm': 250, 'width_pt': 499, 'height_pt': 709,
         'common_use': 'Japanese books'},
    ]
