"""
html_to_pdf.py - Convert HTML content or URL to PDF
IshuTools.fun | Professional PDF Suite
"""
import re
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT


def strip_html_tags(html: str) -> str:
    """Very basic HTML tag stripper."""
    clean = re.compile('<.*?>')
    return re.sub(clean, '', html)


def parse_html_simple(html: str) -> list:
    """Parse basic HTML into a list of (tag, text) tuples."""
    elements = []
    # Find all tags and text
    pattern = re.compile(r'<(/?\w+)[^>]*>(.*?)</\1>|<(/?\w+)[^>]*/?>|([^<]+)', 
                         re.DOTALL | re.IGNORECASE)
    
    for line in html.split('\n'):
        line = line.strip()
        if not line:
            elements.append(('br', ''))
            continue
        
        # Check for heading tags
        for level in range(1, 7):
            m = re.search(rf'<h{level}[^>]*>(.*?)</h{level}>', line, re.IGNORECASE)
            if m:
                elements.append((f'h{level}', strip_html_tags(m.group(1)).strip()))
                break
        else:
            # Paragraph or plain text
            clean = strip_html_tags(line).strip()
            if clean:
                if '<li' in line.lower():
                    elements.append(('li', '• ' + clean))
                elif '<p' in line.lower() or not re.search(r'<\w', line):
                    elements.append(('p', clean))
                else:
                    elements.append(('p', clean))
    
    return elements


def html_to_pdf(output_path: str, html_content: str = '', html_url: str = '') -> str:
    """
    Convert HTML content (or fetch URL) to a PDF file.
    
    Args:
        output_path: Output PDF path
        html_content: Raw HTML string
        html_url: URL to fetch (if html_content is empty)
    Returns:
        output_path
    """
    # Fetch URL if provided
    if html_url and not html_content:
        try:
            import requests
            resp = requests.get(html_url, timeout=15,
                                headers={'User-Agent': 'IshuTools/2.0'})
            html_content = resp.text
        except Exception as e:
            raise RuntimeError(f'Could not fetch URL: {e}')

    if not html_content:
        raise ValueError('No HTML content provided.')

    # Try weasyprint for high-quality conversion
    try:
        from weasyprint import HTML
        HTML(string=html_content).write_pdf(output_path)
        return output_path
    except Exception:
        pass

    # Fallback: parse and render with reportlab
    styles = getSampleStyleSheet()

    heading_styles = {
        'h1': ParagraphStyle('H1', parent=styles['Heading1'], fontSize=20, spaceAfter=12),
        'h2': ParagraphStyle('H2', parent=styles['Heading2'], fontSize=17, spaceAfter=10),
        'h3': ParagraphStyle('H3', parent=styles['Heading3'], fontSize=14, spaceAfter=8),
        'h4': ParagraphStyle('H4', parent=styles['Heading4'], fontSize=12, spaceAfter=6),
        'h5': ParagraphStyle('H5', parent=styles['Heading5'], fontSize=11, spaceAfter=6),
        'h6': ParagraphStyle('H6', parent=styles['Heading6'], fontSize=10, spaceAfter=4),
    }
    body_style = ParagraphStyle('Body', parent=styles['Normal'], fontSize=11, leading=16)
    li_style = ParagraphStyle('LI', parent=body_style, leftIndent=20)

    elements = parse_html_simple(html_content)
    story = []

    for tag, text in elements:
        if not text.strip() and tag == 'br':
            story.append(Spacer(1, 0.2*cm))
            continue
        if not text.strip():
            continue

        if tag in heading_styles:
            try:
                story.append(Paragraph(text, heading_styles[tag]))
            except Exception:
                pass
        elif tag == 'li':
            try:
                story.append(Paragraph(text, li_style))
            except Exception:
                pass
        elif tag == 'hr':
            story.append(HRFlowable(color=colors.HexColor('#E2E8F0')))
        else:
            try:
                story.append(Paragraph(text, body_style))
                story.append(Spacer(1, 0.2*cm))
            except Exception:
                pass

    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2.5*cm, bottomMargin=2*cm
    )
    doc.build(story)
    return output_path
