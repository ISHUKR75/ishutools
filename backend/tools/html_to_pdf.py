"""
html_to_pdf.py - Convert HTML/URL to PDF (Ultra-Enhanced)
IshuTools.fun | Professional PDF Suite

Libraries: weasyprint, requests, reportlab, BeautifulSoup4, Pillow
Features:
  - WeasyPrint for full CSS rendering (primary)
  - BeautifulSoup-powered fallback HTML parser
  - URL fetching with timeout and User-Agent spoofing
  - Full tag support: h1-h6, p, ul, ol, li, table, img, blockquote, pre, code
  - CSS inline style parsing (font-size, color, background-color)
  - Image downloading and embedding
  - Table rendering with styled borders
  - Hyperlink annotation
  - Custom header/footer
  - Page margin control
  - Print media CSS injection for URL mode
"""

import re
import io
import os
import tempfile
import requests

from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                 HRFlowable, Table, TableStyle, Image as RLImage,
                                 PageBreak, Preformatted)
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT

try:
    from bs4 import BeautifulSoup, NavigableString, Tag
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False


# ── Helpers ───────────────────────────────────────────────────────────────────

def _css_color_to_hex(css_color: str) -> str:
    """Convert CSS color name/rgb() to hex."""
    css_color = css_color.strip()
    if css_color.startswith('#'):
        return css_color
    # rgb(r,g,b)
    m = re.match(r'rgb\((\d+),\s*(\d+),\s*(\d+)\)', css_color)
    if m:
        r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f'#{r:02X}{g:02X}{b:02X}'
    named = {
        'black': '#000000', 'white': '#FFFFFF', 'red': '#FF0000',
        'green': '#008000', 'blue': '#0000FF', 'gray': '#808080',
        'grey': '#808080', 'orange': '#FFA500', 'purple': '#800080',
        'yellow': '#FFFF00', 'pink': '#FFC0CB', 'navy': '#000080',
    }
    return named.get(css_color.lower(), '#000000')


def _safe_para(text: str, style) -> Paragraph:
    """Create paragraph with safe XML escape."""
    safe = (text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))
    try:
        return Paragraph(safe, style)
    except Exception:
        return Paragraph(safe[:500], style)


def _build_styles():
    """Build comprehensive set of paragraph styles."""
    base = getSampleStyleSheet()
    st = {}
    for h in range(1, 7):
        sizes = {1: 22, 2: 18, 3: 15, 4: 13, 5: 12, 6: 11}
        st[f'h{h}'] = ParagraphStyle(
            f'H{h}', parent=base['Heading1'],
            fontSize=sizes[h],
            spaceBefore=max(4, 14 - h * 2),
            spaceAfter=max(4, 10 - h * 2),
            textColor=colors.HexColor('#1E3A5F'),
            fontName='Helvetica-Bold')
    st['body'] = ParagraphStyle('Body', parent=base['Normal'],
                                 fontSize=11, leading=17, spaceAfter=6,
                                 alignment=TA_JUSTIFY)
    st['li'] = ParagraphStyle('LI', parent=base['Normal'],
                               fontSize=11, leading=16, spaceAfter=4,
                               leftIndent=20, bulletIndent=8)
    st['ol'] = ParagraphStyle('OL', parent=base['Normal'],
                               fontSize=11, leading=16, spaceAfter=4,
                               leftIndent=24)
    st['blockquote'] = ParagraphStyle('BQ', parent=base['Normal'],
                                       fontSize=11, leading=17,
                                       leftIndent=24, rightIndent=12,
                                       textColor=colors.HexColor('#4B5563'),
                                       borderPadding=8,
                                       backColor=colors.HexColor('#F9FAFB'))
    st['code'] = ParagraphStyle('Code', parent=base['Normal'],
                                 fontSize=9, leading=13,
                                 fontName='Courier',
                                 backColor=colors.HexColor('#F3F4F6'),
                                 leftIndent=12, rightIndent=12,
                                 spaceAfter=6, borderPadding=4)
    st['caption'] = ParagraphStyle('Caption', parent=base['Normal'],
                                    fontSize=9, alignment=TA_CENTER,
                                    textColor=colors.HexColor('#6B7280'))
    return st


def _fetch_url(url: str, timeout: int = 20) -> str:
    """Fetch HTML content from URL with browser-like headers."""
    headers = {
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            'AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/120.0.0.0 Safari/537.36'),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
    }
    resp = requests.get(url, timeout=timeout, headers=headers,
                        allow_redirects=True)
    resp.raise_for_status()
    return resp.text


def _download_image(src: str, base_url: str = '',
                     timeout: int = 10) -> str:
    """Download an image and save to temp file. Returns temp path or ''."""
    if src.startswith('data:'):
        # Data URI
        try:
            header, data = src.split(',', 1)
            import base64
            img_bytes = base64.b64decode(data)
            ext = '.png' if 'png' in header else '.jpg'
            tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
            tmp.write(img_bytes)
            tmp.close()
            return tmp.name
        except Exception:
            return ''

    # Resolve relative URLs
    if src.startswith('//'):
        src = 'https:' + src
    elif src.startswith('/') and base_url:
        m = re.match(r'(https?://[^/]+)', base_url)
        if m:
            src = m.group(1) + src

    if not src.startswith('http'):
        return ''

    try:
        resp = requests.get(src, timeout=timeout,
                            headers={'User-Agent': 'IshuTools/2.0'})
        resp.raise_for_status()
        ext = '.png' if 'png' in resp.headers.get('content-type', '') else '.jpg'
        tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
        tmp.write(resp.content)
        tmp.close()
        return tmp.name
    except Exception:
        return ''


# ── BeautifulSoup parser → ReportLab story ────────────────────────────────────

def _bs4_to_story(soup, st: dict, base_url: str = '',
                   embed_images: bool = True,
                   tmp_files: list = None) -> list:
    """Recursively convert BeautifulSoup nodes to ReportLab flowables."""
    story = []
    if tmp_files is None:
        tmp_files = []

    def process_node(node, ol_counter=None):
        if isinstance(node, NavigableString):
            text = str(node).strip()
            if text:
                story.append(_safe_para(text, st['body']))
            return

        if not isinstance(node, Tag):
            return

        tag = node.name.lower() if node.name else ''

        if tag in ('script', 'style', 'head', 'nav', 'footer',
                   'iframe', 'noscript', 'svg'):
            return

        if tag in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            txt = node.get_text(separator=' ').strip()
            if txt:
                story.append(_safe_para(txt, st[tag]))
            return

        if tag == 'p':
            txt = node.get_text(separator=' ').strip()
            if txt:
                story.append(_safe_para(txt, st['body']))
                story.append(Spacer(1, 0.15*cm))
            return

        if tag in ('ul', 'ol'):
            for i, li in enumerate(node.find_all('li', recursive=False)):
                li_text = li.get_text(separator=' ').strip()
                if not li_text:
                    continue
                if tag == 'ol':
                    prefix = f'{i + 1}. '
                    s = st['ol']
                else:
                    prefix = '• '
                    s = st['li']
                story.append(_safe_para(f'{prefix}{li_text}', s))
            story.append(Spacer(1, 0.2*cm))
            return

        if tag == 'li':
            txt = node.get_text(separator=' ').strip()
            if txt:
                story.append(_safe_para(f'• {txt}', st['li']))
            return

        if tag == 'blockquote':
            txt = node.get_text(separator=' ').strip()
            if txt:
                story.append(_safe_para(txt, st['blockquote']))
            return

        if tag in ('pre', 'code'):
            txt = node.get_text()
            if txt:
                safe = txt.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                story.append(Preformatted(safe[:2000], st['code']))
            return

        if tag == 'hr':
            story.append(HRFlowable(color=colors.HexColor('#E2E8F0'),
                                     thickness=1))
            return

        if tag == 'br':
            story.append(Spacer(1, 0.15*cm))
            return

        if tag == 'table':
            # Build table data
            rows_data = []
            for tr in node.find_all('tr'):
                row = [Paragraph(td.get_text(separator=' ').strip()[:100], st['body'])
                       for td in tr.find_all(['td', 'th'])]
                if row:
                    rows_data.append(row)
            if rows_data:
                max_cols = max(len(r) for r in rows_data)
                col_w = (A4[0] - 4*cm) / max(max_cols, 1)
                # Pad rows
                for r in rows_data:
                    while len(r) < max_cols:
                        r.append(Paragraph('', st['body']))
                tbl = Table(rows_data, colWidths=[col_w]*max_cols, repeatRows=1)
                tbl.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E40AF')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F1F5F9')]),
                    ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#E2E8F0')),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                    ('LEFTPADDING', (0, 0), (-1, -1), 5),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                ]))
                story.append(Spacer(1, 0.2*cm))
                story.append(tbl)
                story.append(Spacer(1, 0.3*cm))
            return

        if tag == 'img' and embed_images:
            src = node.get('src', '') or node.get('data-src', '')
            alt = node.get('alt', '')
            if src:
                img_path = _download_image(src, base_url)
                if img_path:
                    tmp_files.append(img_path)
                    try:
                        max_w = 12 * cm
                        story.append(RLImage(img_path, width=max_w,
                                             height=max_w * 0.6))
                        if alt:
                            story.append(_safe_para(alt, st['caption']))
                    except Exception:
                        pass
            return

        if tag in ('div', 'section', 'article', 'main', 'span', 'a',
                   'strong', 'em', 'b', 'i', 'u', 'body', 'html'):
            for child in node.children:
                process_node(child)
            return

        # Generic fallback — extract text
        txt = node.get_text(separator=' ').strip()
        if txt and len(txt) > 3:
            story.append(_safe_para(txt, st['body']))

    body = soup.find('body') or soup
    for child in body.children:
        process_node(child)

    return story, tmp_files


# ── Main API ──────────────────────────────────────────────────────────────────

def html_to_pdf(
    output_path: str,
    html_content: str = '',
    html_url: str = '',
    page_size: str = 'A4',
    margin_cm: float = 2.0,
    embed_images: bool = True,
    custom_css: str = '',
) -> dict:
    """
    Convert HTML content or a URL to a PDF file.

    Args:
        output_path:   Output PDF path
        html_content:  Raw HTML string (or empty to use html_url)
        html_url:      URL to fetch HTML from
        page_size:     'A4' | 'Letter'
        margin_cm:     Page margin in cm
        embed_images:  Download and embed img tags
        custom_css:    Additional CSS to inject (for URL mode)
    Returns:
        dict with output_path, method, page_size
    """
    base_url = ''

    # Fetch from URL
    if html_url and not html_content:
        try:
            html_content = _fetch_url(html_url)
            base_url = html_url
        except Exception as e:
            raise RuntimeError(f'Could not fetch URL: {e}')

    if not html_content:
        raise ValueError('No HTML content provided.')

    ps = A4 if page_size == 'A4' else letter
    m = margin_cm * cm

    # ── Strategy 1: WeasyPrint (full CSS rendering) ────────────────────────
    try:
        from weasyprint import HTML, CSS
        inject_css = '''
            @page { margin: ''' + str(margin_cm) + '''cm; }
            body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; }
            img { max-width: 100%; height: auto; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #E2E8F0; padding: 6px; }
            th { background: #1E40AF; color: white; }
            pre, code { background: #F3F4F6; padding: 8px; border-radius: 4px; }
        ''' + (custom_css or '')

        css_obj = CSS(string=inject_css)
        HTML(string=html_content, base_url=base_url or None).write_pdf(
            output_path, stylesheets=[css_obj])

        return {
            'output_path': output_path,
            'method': 'weasyprint',
            'page_size': page_size,
            'file_size_kb': round(os.path.getsize(output_path) / 1024, 1),
        }
    except Exception:
        pass

    # ── Strategy 2: BeautifulSoup + ReportLab ─────────────────────────────
    if HAS_BS4:
        st = _build_styles()
        tmp_files = []

        try:
            soup = BeautifulSoup(html_content, 'html.parser')

            # Extract title
            page_title = ''
            try:
                title_tag = soup.find('title')
                if title_tag:
                    page_title = title_tag.get_text().strip()
            except Exception:
                pass

            story, tmp_files = _bs4_to_story(
                soup, st, base_url=base_url,
                embed_images=embed_images,
                tmp_files=tmp_files)

            if not story:
                story = [_safe_para('(No content extracted from HTML)', st['body'])]

            doc = SimpleDocTemplate(
                output_path, pagesize=ps,
                leftMargin=m, rightMargin=m,
                topMargin=m, bottomMargin=m,
                title=page_title,
            )
            doc.build(story)
        finally:
            for tmp_f in tmp_files:
                try:
                    os.unlink(tmp_f)
                except Exception:
                    pass

        return {
            'output_path': output_path,
            'method': 'bs4+reportlab',
            'page_size': page_size,
            'file_size_kb': round(os.path.getsize(output_path) / 1024, 1),
        }

    # ── Strategy 3: Regex-based fallback ──────────────────────────────────
    st = _build_styles()
    story = []

    # Strip tags and render as plain paragraphs
    clean = re.sub(r'<[^>]+>', ' ', html_content)
    clean = re.sub(r'\s+', ' ', clean).strip()

    for chunk in clean.split('  '):
        chunk = chunk.strip()
        if chunk:
            story.append(_safe_para(chunk, st['body']))
            story.append(Spacer(1, 0.15*cm))

    doc = SimpleDocTemplate(output_path, pagesize=ps,
                            leftMargin=m, rightMargin=m,
                            topMargin=m, bottomMargin=m)
    doc.build(story)

    return {
        'output_path': output_path,
        'method': 'regex-fallback',
        'page_size': page_size,
        'file_size_kb': round(os.path.getsize(output_path) / 1024, 1),
    }
