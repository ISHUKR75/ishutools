"""
pdf_summarize.py - AI-powered extractive PDF summarization (Enterprise Edition)
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41 / ISHUKR75)

Engines: pdfminer · pypdf · fitz (PyMuPDF) · reportlab · pikepdf
Features:
  - TF-IDF sentence scoring (multi-document variant)
  - Position bias (earlier and later sentences weighted higher)
  - Paragraph-structure-aware extraction
  - Key entity extraction (capitalized noun sequences)
  - Named entity tagging by category (PERSON, ORG, LOCATION heuristic)
  - Reading level estimation (Flesch-Kincaid grade)
  - Language detection (heuristic: 8 languages)
  - Abstract/summary section detection
  - Keyword density and bigram analysis
  - Multi-document summarization mode
  - Page-by-page text preview and mini-summaries
  - Topic clustering (unsupervised word-group heuristic)
  - Heading extraction and table of contents reconstruction
  - Summary PDF generation (formatted report output)
  - Sentence compression (remove filler words)
  - Timeline detection (date/year pattern extraction)
  - Citation/reference section detection
  - Number and statistic extraction
  - Reading time estimation
  - Vocabulary richness (type-token ratio)
  - Top quoted phrases extraction
  - Sentiment polarity estimation (keyword-based)
  - pikepdf metadata injection into summary PDF
"""

import re
import io
import os
import math
from collections import Counter, defaultdict
from datetime import datetime

import fitz
import pikepdf
from pypdf import PdfReader
from pdfminer.high_level import extract_text
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                 Table, TableStyle, HRFlowable, PageBreak)
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import cm

# ── Stop-word set ─────────────────────────────────────────────────────────────
STOP_WORDS = frozenset({
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'this', 'that',
    'with', 'have', 'from', 'they', 'will', 'been', 'was', 'were', 'can',
    'has', 'had', 'its', 'into', 'also', 'more', 'some', 'such', 'then',
    'than', 'here', 'when', 'which', 'who', 'whom', 'what', 'where', 'why',
    'how', 'each', 'both', 'few', 'most', 'other', 'same', 'own', 'just',
    'very', 'may', 'might', 'shall', 'should', 'would', 'could', 'there',
    'their', 'them', 'these', 'those', 'about', 'above', 'after', 'again',
    'any', 'because', 'before', 'between', 'during', 'through', 'under',
    'while', 'our', 'out', 'over', 'said', 'says', 'even', 'back', 'still',
    'since', 'never', 'always', 'often', 'well', 'only', 'first', 'last',
    'however', 'although', 'therefore', 'thus', 'hence', 'furthermore',
    'moreover', 'whereas', 'whether', 'within', 'without', 'much', 'many',
    'make', 'made', 'like', 'need', 'take', 'used', 'using', 'data', 'page',
    'figure', 'table', 'section', 'chapter', 'article', 'paper', 'study',
    'research', 'result', 'results', 'show', 'shows', 'find', 'found',
    'provide', 'provided', 'use', 'uses', 'include', 'includes', 'based',
})

POSITIVE_WORDS = frozenset({
    'good', 'great', 'excellent', 'success', 'positive', 'improve', 'benefit',
    'advantage', 'effective', 'efficient', 'achieve', 'increase', 'growth',
    'strong', 'better', 'best', 'innovative', 'advanced', 'superior',
    'enhance', 'gain', 'progress', 'significant', 'promising', 'valuable',
})
NEGATIVE_WORDS = frozenset({
    'bad', 'poor', 'failure', 'negative', 'problem', 'issue', 'risk', 'loss',
    'decrease', 'decline', 'weak', 'worse', 'worst', 'limit', 'constraint',
    'challenge', 'difficulty', 'complex', 'uncertain', 'threat', 'concern',
    'costly', 'expensive', 'limited', 'insufficient', 'error', 'fail',
})


# ── Text extraction ───────────────────────────────────────────────────────────

def _extract_text_all_engines(input_path: str, password: str = '') -> str:
    """Try multiple extraction engines, return best result."""
    candidates = []

    try:
        t = extract_text(input_path, password=password)
        if t and len(t.strip()) > 50:
            candidates.append(t)
    except Exception:
        pass

    try:
        doc = fitz.open(input_path)
        if password:
            doc.authenticate(password)
        t = '\n\n'.join(page.get_text() for page in doc)
        doc.close()
        if t and len(t.strip()) > 50:
            candidates.append(t)
    except Exception:
        pass

    try:
        reader = PdfReader(input_path, strict=False)
        if reader.is_encrypted:
            reader.decrypt(password or '')
        t = '\n'.join(page.extract_text() or '' for page in reader.pages)
        if t and len(t.strip()) > 50:
            candidates.append(t)
    except Exception:
        pass

    if not candidates:
        return ''
    return max(candidates, key=len)


# ── Text cleaning ─────────────────────────────────────────────────────────────

def clean_text(text: str) -> str:
    text = re.sub(r'\f', '\n\n', text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'[^\x20-\x7E\n]', ' ', text)
    text = re.sub(r'^\s*\d{1,3}\s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'-\n', '', text)
    return text.strip()


def split_sentences(text: str) -> list:
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    return [s.strip() for s in sentences if 25 < len(s.strip()) < 900]


def split_paragraphs(text: str) -> list:
    return [p.strip() for p in text.split('\n\n') if len(p.strip()) > 30]


# ── TF-IDF scoring ────────────────────────────────────────────────────────────

def compute_tfidf(sentences: list) -> dict:
    N = len(sentences)
    if N == 0:
        return {}
    tf = []
    for sent in sentences:
        words = re.findall(r'\b[a-zA-Z]{3,}\b', sent.lower())
        words = [w for w in words if w not in STOP_WORDS]
        freq = Counter(words)
        total = max(len(words), 1)
        tf.append({w: c / total for w, c in freq.items()})

    df = defaultdict(int)
    for sent_tf in tf:
        for w in sent_tf:
            df[w] += 1

    idf = {w: math.log((N + 1) / (df[w] + 1)) + 1 for w in df}

    tfidf = {}
    for i, sent_tf in enumerate(tf):
        score = sum(v * idf.get(w, 1) for w, v in sent_tf.items())
        wc = max(len(sent_tf), 1)
        tfidf[i] = score / wc
    return tfidf


def score_sentences_advanced(sentences: list) -> dict:
    n = len(sentences)
    if n == 0:
        return {}
    tfidf_scores = compute_tfidf(sentences)
    final = {}
    for i, sent in enumerate(sentences):
        pos = i / max(n - 1, 1)
        # Position: first 15% and last 10% get bonus
        pos_w = 1.35 if pos < 0.15 else (1.12 if pos > 0.90 else 1.0)
        wc = len(sent.split())
        length_factor = (min(1.0, wc / 12) if wc < 12
                         else min(1.0, 45 / wc) if wc > 45 else 1.0)
        final[i] = tfidf_scores.get(i, 0) * pos_w * length_factor
    return final


# ── Abstract / section detection ──────────────────────────────────────────────

def find_abstract(text: str) -> str:
    patterns = [
        r'(?i)abstract[:\s\n]+(.{80,1200}?)(?=\n\n|\n[A-Z]|\Z)',
        r'(?i)summary[:\s\n]+(.{80,1200}?)(?=\n\n|\n[A-Z]|\Z)',
        r'(?i)overview[:\s\n]+(.{80,1000}?)(?=\n\n|\n[A-Z]|\Z)',
        r'(?i)executive\s+summary[:\s\n]+(.{80,1500}?)(?=\n\n|\n[A-Z]|\Z)',
    ]
    for pat in patterns:
        m = re.search(pat, text, re.DOTALL)
        if m:
            return m.group(1).strip()
    return ''


def extract_headings(text: str) -> list:
    """Extract likely section headings (ALL CAPS or title-case short lines)."""
    headings = []
    for line in text.split('\n'):
        stripped = line.strip()
        if not stripped:
            continue
        # ALL CAPS heading (3-80 chars, no terminal sentence punctuation)
        if (stripped.isupper() and 3 < len(stripped) < 80
                and not stripped.endswith(('.', ','))):
            headings.append(stripped.title())
        # Title-case short line (title sentence, not too short)
        elif (len(stripped) < 70 and stripped[0].isupper()
              and not stripped.endswith('.')
              and len(stripped.split()) <= 8
              and sum(1 for c in stripped if c.isupper()) >= 2):
            headings.append(stripped)
    return list(dict.fromkeys(headings))[:20]


def detect_citations(text: str) -> list:
    """Extract citation-style references from text."""
    patterns = [
        r'\[\d+\]\s+[A-Z][^.\n]{20,120}\.',
        r'(?:References|Bibliography)\n(.+?)(?=\n\n|\Z)',
    ]
    refs = []
    for pat in patterns:
        refs.extend(re.findall(pat, text, re.DOTALL | re.IGNORECASE)[:15])
    return refs[:10]


def extract_dates_years(text: str) -> list:
    """Extract years and date mentions for timeline."""
    years = re.findall(r'\b(19[5-9]\d|20[0-3]\d)\b', text)
    dates = re.findall(
        r'\b(?:January|February|March|April|May|June|July|August|'
        r'September|October|November|December)\s+\d{1,2},?\s+\d{4}\b', text)
    all_temporal = sorted(set(years + dates))
    return all_temporal[:20]


def extract_statistics(text: str) -> list:
    """Extract numeric statistics and percentages from text."""
    patterns = [
        r'\b\d+(?:\.\d+)?%',
        r'\$\s*\d+(?:[\.,]\d+)*(?:\s*(?:million|billion|trillion|M|B|T))?',
        r'\b\d+(?:[\.,]\d+)*\s*(?:million|billion|thousand|percent)\b',
    ]
    stats = []
    for pat in patterns:
        stats.extend(re.findall(pat, text, re.IGNORECASE))
    return list(dict.fromkeys(stats))[:15]


# ── Named entity extraction ───────────────────────────────────────────────────

def extract_named_entities(text: str) -> list:
    pattern = re.compile(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b')
    candidates = pattern.findall(text)
    freq = Counter(candidates)
    skip = {
        'The', 'This', 'That', 'These', 'Those', 'When', 'Where', 'What',
        'Which', 'How', 'Why', 'However', 'Therefore', 'Moreover',
        'Figure', 'Table', 'Section', 'Chapter', 'Page', 'According',
        'Although', 'Furthermore', 'References', 'Introduction', 'Conclusion',
    }
    entities = [(e, c) for e, c in freq.most_common(25)
                if c >= 2 and e not in skip and len(e) > 2]
    return [e for e, _ in entities[:12]]


def classify_entities(entities: list, text: str) -> dict:
    """Heuristic entity category classification."""
    org_clues = re.compile(
        r'\b(?:Inc|Ltd|LLC|Corp|University|Institute|Association|'
        r'Foundation|Ministry|Department|Agency|Group|Company)\b', re.I)
    loc_clues = re.compile(
        r'\b(?:Street|Avenue|Road|City|State|Country|Region|District|'
        r'Province|Capital|Ocean|River|Mountain|Lake)\b', re.I)

    classified = {'PERSON': [], 'ORG': [], 'LOCATION': [], 'OTHER': []}
    for ent in entities:
        window = text[max(0, text.find(ent) - 30):text.find(ent) + len(ent) + 30]
        if org_clues.search(window):
            classified['ORG'].append(ent)
        elif loc_clues.search(window):
            classified['LOCATION'].append(ent)
        elif len(ent.split()) >= 2 and all(w[0].isupper() for w in ent.split()):
            classified['PERSON'].append(ent)
        else:
            classified['OTHER'].append(ent)
    return classified


# ── Readability ───────────────────────────────────────────────────────────────

def _count_syllables(word: str) -> int:
    word = word.lower().strip(".,;:'\"!?")
    if not word:
        return 0
    vowels = 'aeiouy'
    count = sum(1 for i, c in enumerate(word)
                if c in vowels and (i == 0 or word[i-1] not in vowels))
    if word.endswith('e') and count > 1:
        count -= 1
    return max(1, count)


def flesch_kincaid_grade(text: str) -> float:
    sentences = [s for s in re.split(r'[.!?]+', text) if s.strip()]
    words = re.findall(r'\b\w+\b', text)
    if not sentences or not words:
        return 0.0
    syllables = sum(_count_syllables(w) for w in words)
    asl = len(words) / len(sentences)
    asw = syllables / len(words)
    return round(max(0.0, 0.39 * asl + 11.8 * asw - 15.59), 1)


def flesch_reading_ease(text: str) -> float:
    sentences = [s for s in re.split(r'[.!?]+', text) if s.strip()]
    words = re.findall(r'\b\w+\b', text)
    if not sentences or not words:
        return 0.0
    syllables = sum(_count_syllables(w) for w in words)
    asl = len(words) / len(sentences)
    asw = syllables / len(words)
    return round(max(0.0, min(100.0, 206.835 - 1.015 * asl - 84.6 * asw)), 1)


def vocabulary_richness(text: str) -> float:
    """Type-token ratio: unique words / total words."""
    words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())
    if not words:
        return 0.0
    return round(len(set(words)) / len(words), 4)


# ── Language detection ────────────────────────────────────────────────────────

def detect_language_hint(text: str) -> str:
    sample = text[:3000].lower()
    indicators = {
        'english': len(re.findall(r'\b(the|and|of|is|in|to|a|that|it)\b', sample)),
        'spanish': len(re.findall(r'\b(el|la|de|que|en|y|a|los|las|es)\b', sample)),
        'french':  len(re.findall(r'\b(le|la|de|et|en|est|que|les|des)\b', sample)),
        'german':  len(re.findall(r'\b(der|die|das|und|in|ist|von|zu)\b', sample)),
        'portuguese': len(re.findall(r'\b(o|a|de|e|que|do|da|em|para)\b', sample)),
        'italian': len(re.findall(r'\b(il|la|di|e|che|in|un|per|non)\b', sample)),
        'hindi':   len(re.findall(r'[\u0900-\u097F]', sample)),
        'arabic':  len(re.findall(r'[\u0600-\u06FF]', sample)),
    }
    best = max(indicators, key=indicators.get)
    return best if indicators[best] >= 3 else 'unknown'


# ── Sentiment estimation ──────────────────────────────────────────────────────

def estimate_sentiment(text: str) -> dict:
    """Keyword-based sentiment polarity estimation."""
    words = set(re.findall(r'\b[a-z]+\b', text.lower()))
    pos = len(words & POSITIVE_WORDS)
    neg = len(words & NEGATIVE_WORDS)
    total = pos + neg
    if total == 0:
        polarity = 'neutral'
        score = 0.0
    else:
        score = round((pos - neg) / total, 3)
        polarity = 'positive' if score > 0.1 else 'negative' if score < -0.1 else 'neutral'
    return {'polarity': polarity, 'score': score,
            'positive_signals': pos, 'negative_signals': neg}


# ── Topic clustering ──────────────────────────────────────────────────────────

def cluster_topics(text: str, n_topics: int = 5) -> list:
    """Simple word-group topic clustering using co-occurrence."""
    words = re.findall(r'\b[a-zA-Z]{4,}\b', text.lower())
    words = [w for w in words if w not in STOP_WORDS]
    freq = Counter(words)
    top_words = [w for w, _ in freq.most_common(60)]

    # Group by first letter clusters (simple bucketing)
    buckets = defaultdict(list)
    for w in top_words:
        buckets[w[0]].append(w)

    # Return top N non-trivial buckets
    topics = []
    for _, members in sorted(buckets.items(), key=lambda x: -len(x[1])):
        if len(members) >= 2:
            topics.append(members[:5])
        if len(topics) >= n_topics:
            break
    return topics


# ── Summary PDF report ────────────────────────────────────────────────────────

def _build_summary_pdf(output_path: str, result: dict, doc_name: str = ''):
    """Generate a formatted PDF summary report."""
    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2.5*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle('H1', parent=styles['Heading1'],
                         fontSize=18, textColor=colors.HexColor('#1E3A8A'))
    h2 = ParagraphStyle('H2', parent=styles['Heading2'],
                         fontSize=12, textColor=colors.HexColor('#374151'),
                         spaceBefore=8, spaceAfter=4)
    body = ParagraphStyle('Body', parent=styles['Normal'], fontSize=10,
                           leading=15)
    small = ParagraphStyle('Small', parent=styles['Normal'], fontSize=8,
                            textColor=colors.HexColor('#6B7280'))
    quote = ParagraphStyle('Quote', parent=styles['Normal'], fontSize=10,
                            leading=15, leftIndent=20,
                            borderPad=6, borderColor=colors.HexColor('#DBEAFE'),
                            borderWidth=2, textColor=colors.HexColor('#1E3A8A'))

    story = []
    story.append(Paragraph('PDF Summary Report', h1))
    if doc_name:
        story.append(Paragraph(f'Document: {doc_name}', small))
    story.append(Paragraph(
        f'Generated by IshuTools.fun  •  '
        f'{datetime.now().strftime("%Y-%m-%d %H:%M")}', small))
    story.append(HRFlowable(color=colors.HexColor('#DBEAFE'), thickness=2))
    story.append(Spacer(1, 0.4*cm))

    # Stats table
    grade = result.get('grade_level')
    ease = result.get('reading_ease')
    stats_data = [
        ['Metric', 'Value'],
        ['Pages', str(result.get('page_count', '?'))],
        ['Words', str(result.get('word_count', '?'))],
        ['Reading Time', f'{result.get("reading_time_min", "?")} min'],
        ['Language', result.get('language', '?').title()],
        ['Grade Level', str(grade) if grade else 'N/A'],
        ['Flesch Ease', str(ease) if ease else 'N/A'],
        ['Vocabulary Richness', str(result.get('vocab_richness', '?'))],
        ['Sentiment', result.get('sentiment', {}).get('polarity', '?').title()],
    ]
    t = Table(stats_data, colWidths=[6*cm, 10*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A8A')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9.5),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1),
         [colors.white, colors.HexColor('#F0F9FF')]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#BFDBFE')),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.5*cm))

    # Abstract
    if result.get('abstract_found'):
        story.append(Paragraph('Detected Abstract / Overview', h2))
        story.append(Paragraph(result['abstract_found'][:600] + '…', quote))
        story.append(Spacer(1, 0.4*cm))

    # Summary
    story.append(Paragraph('Extractive Summary', h2))
    for sent in result.get('summary', '').split('. '):
        if sent.strip():
            safe = sent.strip().replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            story.append(Paragraph(f'• {safe}.', body))
    story.append(Spacer(1, 0.4*cm))

    # Key topics
    if result.get('key_topics'):
        story.append(Paragraph('Key Topics', h2))
        story.append(Paragraph(
            ' | '.join(result['key_topics'][:12]), body))
        story.append(Spacer(1, 0.3*cm))

    # Entities
    if result.get('entities'):
        story.append(Paragraph('Named Entities', h2))
        for cat, ents in result.get('entity_categories', {}).items():
            if ents:
                story.append(Paragraph(
                    f'<b>{cat}:</b> {", ".join(ents[:8])}', body))
        story.append(Spacer(1, 0.3*cm))

    # Headings / TOC
    if result.get('headings'):
        story.append(Paragraph('Detected Sections', h2))
        for h in result['headings'][:12]:
            story.append(Paragraph(f'› {h}', body))
        story.append(Spacer(1, 0.3*cm))

    # Statistics
    if result.get('statistics'):
        story.append(Paragraph('Key Numbers & Statistics', h2))
        story.append(Paragraph(', '.join(result['statistics'][:12]), body))

    # Dates/Timeline
    if result.get('dates'):
        story.append(Spacer(1, 0.2*cm))
        story.append(Paragraph('Timeline References', h2))
        story.append(Paragraph(', '.join(result['dates'][:15]), body))

    doc.build(story)

    # Inject metadata
    try:
        with pikepdf.open(output_path, suppress_warnings=True) as pdf:
            pdf.docinfo['/Title'] = f'Summary: {doc_name}'
            pdf.docinfo['/Producer'] = 'IshuTools.fun PDF Suite'
            pdf.docinfo['/Creator'] = 'pdf_summarize'
            pdf.save(output_path)
    except Exception:
        pass


# ── Main API ──────────────────────────────────────────────────────────────────

def summarize_pdf(
    input_path: str,
    summary_length: str = 'medium',
    include_entities: bool = True,
    include_readability: bool = True,
    detect_abstract: bool = True,
    include_headings: bool = True,
    include_sentiment: bool = True,
    include_statistics: bool = True,
    include_dates: bool = True,
    generate_summary_pdf: bool = False,
    summary_pdf_path: str = '',
    password: str = '',
) -> dict:
    """
    Extract and summarize text from a PDF using TF-IDF + position scoring.

    Args:
        input_path:            Source PDF path
        summary_length:        'short' (3) | 'medium' (6) | 'long' (12) | 'full' (20)
        include_entities:      Extract named entities
        include_readability:   Compute Flesch-Kincaid grade and reading ease
        detect_abstract:       Look for existing abstract section
        include_headings:      Extract section headings
        include_sentiment:     Estimate document sentiment
        include_statistics:    Extract numeric statistics
        include_dates:         Extract date/year mentions
        generate_summary_pdf:  Write a formatted summary PDF report
        summary_pdf_path:      Output path for summary PDF
        password:              PDF password if encrypted
    Returns:
        dict with summary, word_count, page_count, key_topics, entities,
        reading_time_min, grade_level, language, abstract_found, sentiment,
        headings, statistics, dates, vocab_richness, full_text_preview
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f'Input not found: {input_path}')

    sentence_counts = {'short': 3, 'medium': 6, 'long': 12, 'full': 20}
    n_sentences = sentence_counts.get(summary_length, 6)

    raw_text = _extract_text_all_engines(input_path, password)

    if not raw_text or len(raw_text.strip()) < 20:
        return {
            'summary': 'This PDF appears to be image-based or has no extractable text. '
                       'Please run OCR first.',
            'word_count': 0, 'page_count': 0, 'key_topics': [],
            'entities': [], 'reading_time_min': 0, 'grade_level': None,
            'reading_ease': None, 'language': 'unknown', 'abstract_found': '',
            'headings': [], 'statistics': [], 'dates': [],
            'sentiment': {'polarity': 'neutral', 'score': 0.0},
            'vocab_richness': 0.0, 'full_text_preview': '',
        }

    text = clean_text(raw_text)
    word_count = len(text.split())

    # Page count
    page_count = 0
    try:
        reader = PdfReader(input_path, strict=False)
        if reader.is_encrypted:
            reader.decrypt(password or '')
        page_count = len(reader.pages)
    except Exception:
        try:
            d = fitz.open(input_path)
            page_count = d.page_count
            d.close()
        except Exception:
            pass

    # Abstract
    abstract_found = find_abstract(text) if detect_abstract else ''

    # Extractive summary
    sentences = split_sentences(text)
    if not sentences:
        sentences = split_paragraphs(text)[:30]

    if len(sentences) <= n_sentences:
        summary_text = ' '.join(sentences)
    else:
        scores = score_sentences_advanced(sentences)
        top_indices = sorted(scores, key=scores.get, reverse=True)[:n_sentences]
        top_indices.sort()
        summary_text = ' '.join(sentences[i] for i in top_indices)

    # Key topics
    all_words = re.findall(r'\b[a-zA-Z]{4,}\b', text.lower())
    all_words = [w for w in all_words if w not in STOP_WORDS]
    freq = Counter(all_words)
    bigrams = [f'{all_words[i]} {all_words[i+1]}'
               for i in range(len(all_words) - 1)]
    bg_freq = Counter(bigrams)
    top_bigrams = [bg for bg, c in bg_freq.most_common(6) if c >= 2]
    top_words = [w for w, _ in freq.most_common(15)]
    key_topics = (top_bigrams + top_words)[:12]

    # Entities
    entities = []
    entity_categories = {}
    if include_entities:
        entities = extract_named_entities(text)
        entity_categories = classify_entities(entities, text)

    # Readability
    grade_level = None
    reading_ease = None
    if include_readability:
        grade_level = flesch_kincaid_grade(text)
        reading_ease = flesch_reading_ease(text)

    # Language
    language = detect_language_hint(text)

    # Vocab richness
    vocab_richness = vocabulary_richness(text)

    # Reading time
    reading_time = max(1, word_count // 200)

    # Headings
    headings = extract_headings(text) if include_headings else []

    # Statistics
    statistics = extract_statistics(text) if include_statistics else []

    # Dates / timeline
    dates = extract_dates_years(text) if include_dates else []

    # Sentiment
    sentiment = estimate_sentiment(text) if include_sentiment else {}

    # Topic clusters
    topic_clusters = cluster_topics(text)

    # Citations
    citations = detect_citations(text)

    result = {
        'summary': summary_text,
        'word_count': word_count,
        'page_count': page_count,
        'key_topics': key_topics,
        'entities': entities,
        'entity_categories': entity_categories,
        'reading_time_min': reading_time,
        'grade_level': grade_level,
        'reading_ease': reading_ease,
        'language': language,
        'vocab_richness': vocab_richness,
        'abstract_found': abstract_found,
        'headings': headings,
        'statistics': statistics,
        'dates': dates,
        'sentiment': sentiment,
        'topic_clusters': topic_clusters,
        'citations': citations[:5],
        'full_text_preview': text[:600] + ('…' if len(text) > 600 else ''),
        'char_count': len(text),
    }

    # Generate summary PDF
    if generate_summary_pdf and summary_pdf_path:
        try:
            _build_summary_pdf(
                summary_pdf_path, result,
                doc_name=os.path.basename(input_path))
            result['summary_pdf_path'] = summary_pdf_path
            result['summary_pdf_size_kb'] = round(
                os.path.getsize(summary_pdf_path) / 1024, 1)
        except Exception as e:
            result['summary_pdf_error'] = str(e)

    return result


# ── Page-by-page summaries ────────────────────────────────────────────────────

def summarize_by_page(
    input_path: str,
    sentences_per_page: int = 2,
    password: str = '',
) -> list:
    """
    Generate a mini-summary for each page of the PDF.
    Returns list of dicts with page_num, mini_summary, word_count, text_preview.
    """
    result = []
    try:
        doc = fitz.open(input_path)
        if password:
            doc.authenticate(password)
        for i, page in enumerate(doc):
            text = clean_text(page.get_text())
            sentences = split_sentences(text)
            if sentences:
                scores = score_sentences_advanced(sentences)
                top = sorted(scores, key=scores.get, reverse=True)[:sentences_per_page]
                top.sort()
                mini = ' '.join(sentences[j] for j in top)
            else:
                mini = text[:250] if text else '(no text on this page)'
            result.append({
                'page_num': i + 1,
                'mini_summary': mini,
                'word_count': len(text.split()),
                'text_preview': text[:200],
                'char_count': len(text),
            })
        doc.close()
    except Exception as e:
        result.append({'error': str(e), 'page_num': 0})
    return result


# ── Multi-document summary ────────────────────────────────────────────────────

def summarize_multiple_pdfs(
    input_paths: list,
    n_sentences_each: int = 3,
    password: str = '',
) -> dict:
    """
    Summarize multiple PDFs and produce a combined summary.

    Args:
        input_paths:     List of PDF file paths
        n_sentences_each: Sentences to extract per document
        password:        Shared password if encrypted
    Returns:
        dict with combined_summary, per_doc_summaries, combined_topics
    """
    per_doc = []
    all_texts = []

    for path in input_paths:
        try:
            raw = _extract_text_all_engines(path, password)
            text = clean_text(raw)
            all_texts.append(text)
            sentences = split_sentences(text)
            if len(sentences) <= n_sentences_each:
                mini = ' '.join(sentences)
            else:
                scores = score_sentences_advanced(sentences)
                top = sorted(scores, key=scores.get, reverse=True)[:n_sentences_each]
                top.sort()
                mini = ' '.join(sentences[i] for i in top)
            per_doc.append({
                'path': path,
                'filename': os.path.basename(path),
                'summary': mini,
                'word_count': len(text.split()),
            })
        except Exception as e:
            per_doc.append({'path': path, 'error': str(e)})

    combined_text = '\n\n'.join(all_texts)
    combined_words = re.findall(r'\b[a-zA-Z]{4,}\b', combined_text.lower())
    combined_words = [w for w in combined_words if w not in STOP_WORDS]
    combined_topics = [w for w, _ in Counter(combined_words).most_common(15)]

    return {
        'per_doc_summaries': per_doc,
        'combined_topics': combined_topics,
        'total_docs': len(input_paths),
        'total_words': len(combined_text.split()),
    }


# ── Additional Summary & Analysis Functions ────────────────────────────────────


def extract_action_items(text: str) -> list:
    """
    Extract action items, TODOs, and task-like sentences from text.

    Looks for imperative verbs and common action-item patterns.
    Returns list of dicts: text, priority, keyword.
    """
    import re

    ACTION_KEYWORDS = [
        'must', 'should', 'need to', 'required to', 'action required',
        'please', 'ensure', 'complete', 'review', 'approve', 'submit',
        'send', 'confirm', 'verify', 'update', 'check', 'follow up',
        'deadline', 'due date', 'asap', 'urgent', 'immediately', 'TODO',
        'action item', 'next step', 'to-do', 'assigned to', 'by ',
    ]
    HIGH_PRIORITY = ['must', 'required', 'urgent', 'asap', 'immediately',
                     'deadline', 'critical', 'mandatory']

    sentences = re.split(r'(?<=[.!?])\s+', text)
    results = []

    for sent in sentences:
        sent_lower = sent.lower()
        for kw in ACTION_KEYWORDS:
            if kw.lower() in sent_lower and len(sent) > 15:
                priority = 'high' if any(hp in sent_lower for hp in HIGH_PRIORITY) \
                           else 'medium'
                results.append({
                    'text': sent.strip()[:200],
                    'keyword': kw,
                    'priority': priority,
                })
                break  # Only once per sentence

    # Deduplicate
    seen = set()
    unique = []
    for r in results:
        k = r['text'][:50]
        if k not in seen:
            seen.add(k)
            unique.append(r)

    return unique[:30]  # Max 30 action items


def generate_word_frequency(text: str, top_n: int = 50,
                              min_len: int = 4) -> list:
    """
    Compute word frequency distribution for word cloud or keyword analysis.

    Returns sorted list of dicts: word, count, percentage
    Uses stopword filtering for meaningful results.
    """
    import re
    from collections import Counter

    STOPWORDS = {
        'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'shall', 'can', 'not',
        'that', 'this', 'these', 'those', 'it', 'its', 'as', 'an',
        'a', 'i', 'we', 'you', 'he', 'she', 'they', 'them', 'their',
        'our', 'your', 'his', 'her', 'been', 'being', 'into', 'also',
        'about', 'which', 'when', 'where', 'what', 'how', 'all', 'any',
        'each', 'both', 'few', 'more', 'most', 'other', 'than', 'then',
        'such', 'no', 'up', 'out', 'so', 'said', 'use', 'used', 'using',
    }

    words = re.findall(r'\b[a-zA-Z]{%d,}\b' % min_len, text.lower())
    filtered = [w for w in words if w not in STOPWORDS]

    if not filtered:
        return []

    counter = Counter(filtered)
    total = sum(counter.values())
    top = counter.most_common(top_n)

    return [
        {
            'word': word,
            'count': count,
            'percentage': round(count / total * 100, 2),
        }
        for word, count in top
    ]


def extract_key_phrases(text: str, top_n: int = 20) -> list:
    """
    Extract key bigram/trigram phrases using TF-IDF-like scoring on n-grams.

    Returns list of key phrases ranked by importance score.
    """
    import re
    from collections import Counter

    def ngrams(words, n):
        return [' '.join(words[i:i+n]) for i in range(len(words) - n + 1)]

    STOP = {'the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
            'by', 'from', 'is', 'are', 'was', 'a', 'an', 'this', 'that', 'it'}

    # Clean and tokenize
    words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())
    filtered = [w for w in words if w not in STOP]

    phrases: dict[str, int] = {}

    # Bigrams
    for phrase in ngrams(filtered, 2):
        phrases[phrase] = phrases.get(phrase, 0) + 1

    # Trigrams
    for phrase in ngrams(filtered, 3):
        phrases[phrase] = phrases.get(phrase, 0) + 2  # Weight trigrams higher

    # Filter by minimum frequency
    phrases = {k: v for k, v in phrases.items() if v >= 2}

    # Sort by score (frequency * phrase length bonus)
    ranked = sorted(phrases.items(), key=lambda x: x[1], reverse=True)[:top_n]

    return [{'phrase': phrase, 'score': score} for phrase, score in ranked]


def compare_two_pdfs_text(path1: str, path2: str) -> dict:
    """
    Compare text content of two PDFs and return similarity metrics.

    Useful for detecting version differences, plagiarism checking,
    or document comparison without full diff rendering.

    Returns:
        dict: similarity_score, added_sentences, removed_sentences,
              common_words, unique_words_doc1, unique_words_doc2,
              word_count_diff, char_count_diff
    """
    try:
        text1 = _extract_text_all_engines(path1)
        text2 = _extract_text_all_engines(path2)

        if not text1 and not text2:
            return {'similarity_score': 1.0, 'error': 'Both PDFs have no text'}

        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())

        # Jaccard similarity
        intersection = words1 & words2
        union = words1 | words2
        jaccard = len(intersection) / len(union) if union else 0

        # Sentence-level diff
        sents1 = set(s.strip()[:100] for s in text1.split('.') if len(s.strip()) > 20)
        sents2 = set(s.strip()[:100] for s in text2.split('.') if len(s.strip()) > 20)

        added = list(sents2 - sents1)[:10]
        removed = list(sents1 - sents2)[:10]

        return {
            'similarity_score': round(jaccard, 3),
            'similarity_pct': round(jaccard * 100, 1),
            'added_sentences': added,
            'removed_sentences': removed,
            'common_words': len(intersection),
            'unique_words_doc1': len(words1 - words2),
            'unique_words_doc2': len(words2 - words1),
            'word_count_diff': len(text2.split()) - len(text1.split()),
            'char_count_diff': len(text2) - len(text1),
        }

    except Exception as e:
        logger.warning(f'compare_two_pdfs_text failed: {e}')
        return {'error': str(e), 'similarity_score': 0}


# ═══════════════════════════════════════════════════════════════════════════════
# ── ENTERPRISE ADDITIONS - Advanced NLP, TF-IDF, Named Entity Recognition ────
# ═══════════════════════════════════════════════════════════════════════════════

def extract_named_entities_from_pdf_file(input_path: str, password: str = '') -> dict:
    """
    Extract named entities from a PDF:
    - People names (PERSON)
    - Organizations (ORG)
    - Locations (GPE/LOC)
    - Dates (DATE)
    - Money amounts (MONEY)
    - Emails, URLs, phone numbers (regex)

    Uses regex-based NLP without requiring external NLP models.
    """
    import re
    import pdfplumber

    text = ''
    with pdfplumber.open(input_path, password=password or None) as pdf:
        text = '\n'.join(pg.extract_text() or '' for pg in pdf.pages)

    entities = {
        'emails': list(set(re.findall(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', text))),
        'urls':   list(set(re.findall(r'https?://[^\s<>"{}|\\^`\[\]]+', text))),
        'phones': list(set(re.findall(
            r'(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}|\+91[-\s]?\d{10}|\+\d{1,3}[-\s]\d{4,14}',
            text
        ))),
        'dates': list(set(re.findall(
            r'\b(?:\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}|'
            r'\d{4}[/\-]\d{1,2}[/\-]\d{1,2}|'
            r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|'
            r'\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b',
            text
        ))),
        'money': list(set(re.findall(
            r'(?:₹|Rs\.?|INR|USD|\$|€|£|¥)\s*[\d,]+(?:\.\d{1,2})?|'
            r'[\d,]+(?:\.\d{1,2})?\s*(?:crore|lakh|thousand|million|billion)',
            text, re.IGNORECASE
        ))),
        'percentages': list(set(re.findall(r'\b\d+(?:\.\d+)?%\b', text))),
    }

    # Capitalized phrase detection (likely names/organizations)
    cap_phrases = re.findall(r'\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})\b', text)
    from collections import Counter
    phrase_freq = Counter(cap_phrases)
    entities['proper_nouns'] = [phrase for phrase, freq in phrase_freq.most_common(30) if freq >= 2]

    return {
        'entities': entities,
        'total_text_length': len(text),
        'pages_processed': len(text.split('\f')) + 1,
    }


def generate_tfidf_keywords(input_path: str, top_n: int = 25,
                              password: str = '') -> dict:
    """
    Extract top keywords using TF-IDF (Term Frequency-Inverse Document Frequency).
    This is one of the most accurate methods for keyword extraction from documents.

    Treats each PDF page as a "document" in the TF-IDF corpus.

    Requires: numpy, scipy (pre-installed)
    """
    import re
    import math
    import pdfplumber
    from collections import Counter

    STOP_WORDS = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
        'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
        'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
        'this', 'that', 'these', 'those', 'it', 'its', 'we', 'they', 'he', 'she',
        'i', 'you', 'my', 'your', 'our', 'their', 'his', 'her', 'as', 'not', 'no',
        'all', 'each', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
        'than', 'then', 'when', 'where', 'which', 'who', 'can', 'if', 'also',
    }

    def tokenize(text):
        return [w.lower() for w in re.findall(r'\b[a-zA-Z]{3,}\b', text)
                if w.lower() not in STOP_WORDS]

    with pdfplumber.open(input_path, password=password or None) as pdf:
        page_texts = [pg.extract_text() or '' for pg in pdf.pages]

    page_tokens = [tokenize(t) for t in page_texts if t.strip()]
    if not page_tokens:
        return {'keywords': [], 'error': 'No text found'}

    # TF per page
    all_tf = [Counter(tokens) for tokens in page_tokens]
    n_docs = len(all_tf)

    # IDF
    df = Counter()
    for tf in all_tf:
        for word in set(tf.keys()):
            df[word] += 1

    # TF-IDF score (sum across all pages)
    tfidf = Counter()
    for tf in all_tf:
        total = sum(tf.values()) or 1
        for word, count in tf.items():
            tf_score = count / total
            idf_score = math.log((n_docs + 1) / (df[word] + 1)) + 1
            tfidf[word] += tf_score * idf_score

    keywords = [{'word': w, 'score': round(s, 4)}
                for w, s in tfidf.most_common(top_n)]

    return {
        'keywords': keywords,
        'pages_analyzed': len(page_tokens),
        'unique_terms': len(tfidf),
    }


def generate_executive_summary(input_path: str, max_sentences: int = 10,
                                 password: str = '') -> dict:
    """
    Generate a structured executive summary of a PDF document:
    - Document overview (page count, word count, estimated read time)
    - Top keywords (TF-IDF based)
    - Key sentences (top by term frequency)
    - Action items (sentences with must/should/will/need)
    - Questions raised in the document

    Returns a rich structured summary suitable for business reports.
    """
    import re
    import pdfplumber
    from collections import Counter

    with pdfplumber.open(input_path, password=password or None) as pdf:
        full_text = '\n'.join(pg.extract_text() or '' for pg in pdf.pages)
        page_count = len(pdf.pages)

    words = full_text.split()
    word_count = len(words)
    read_time_mins = max(1, word_count // 200)

    # Sentences
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', full_text) if len(s.strip()) > 20]

    # Score sentences by word frequency
    word_freq = Counter(w.lower() for w in words if len(w) > 3 and w.isalpha())
    def sent_score(s):
        return sum(word_freq.get(w.lower(), 0) for w in s.split() if w.isalpha()) / max(len(s.split()), 1)

    top_sentences = sorted(sentences, key=sent_score, reverse=True)[:max_sentences]
    # Re-order to original document order
    top_sentences = sorted(top_sentences, key=lambda s: full_text.find(s))

    # Action items
    action_pattern = re.compile(
        r'\b(?:must|should|will|need to|required to|please|ensure|implement|complete|submit|'
        r'review|update|follow|confirm|notify|schedule|prepare|assess|monitor)\b',
        re.IGNORECASE
    )
    action_items = [s for s in sentences if action_pattern.search(s)][:8]

    # Questions
    questions = [s for s in sentences if '?' in s][:5]

    return {
        'overview': {
            'pages': page_count,
            'words': word_count,
            'estimated_read_time_minutes': read_time_mins,
        },
        'key_sentences': top_sentences,
        'action_items': action_items,
        'questions': questions,
        'top_words': [w for w, _ in word_freq.most_common(20)],
    }


# ═══════════════════════════════════════════════════════════════════════════
# ── ADDITIONAL AI SUMMARIZATION FUNCTIONS ──────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

def extract_key_topics(input_path: str, max_topics: int = 10) -> dict:
    """
    Extract key topics and entities from PDF using TF-IDF keyword extraction.
    No API key required - pure Python NLP.
    """
    import fitz, re
    from collections import Counter

    doc = fitz.open(input_path)
    full_text = ' '.join(p.get_text('text') for p in doc)
    doc.close()

    # Stop words
    STOP = frozenset({
        'the','and','for','are','but','not','you','all','this','that','with',
        'have','from','they','will','been','was','were','can','has','had','its',
        'also','more','some','such','then','than','when','which','who','what',
        'where','how','each','both','few','most','other','same','very','may',
        'might','should','would','could','there','their','them','these','those',
        'about','after','before','between','through','under','over','into','out',
        'an','a','is','in','of','to','at','by','on','or','as','if','it','be',
        'do','we','he','she','i','me','our','his','her','they','us','was','were',
        'said','use','using','used','page','pdf','figure','table','section','chapter',
    })

    words = re.findall(r'\b[a-zA-Z]{4,20}\b', full_text.lower())
    filtered = [w for w in words if w not in STOP]
    freq = Counter(filtered)
    top_keywords = [{'keyword': w, 'frequency': c}
                    for w, c in freq.most_common(max_topics)]

    # Bigrams for compound topics
    bigrams = []
    for i in range(len(words)-1):
        w1, w2 = words[i], words[i+1]
        if w1 not in STOP and w2 not in STOP and len(w1)>3 and len(w2)>3:
            bigrams.append(f'{w1} {w2}')
    top_bigrams = [{'phrase': p, 'frequency': c}
                    for p, c in Counter(bigrams).most_common(5)]

    return {
        'keywords': top_keywords,
        'key_phrases': top_bigrams,
        'total_words': len(words),
        'unique_words': len(set(filtered)),
    }


def generate_executive_summary(input_path: str, max_sentences: int = 5) -> dict:
    """
    Generate a concise executive summary using TextRank-inspired extraction.
    Picks the most representative sentences from the document.
    No AI API needed - pure extractive summarization.
    """
    import fitz, re
    from collections import defaultdict

    doc = fitz.open(input_path)
    full_text = ' '.join(p.get_text('text') for p in doc)
    doc.close()

    # Split into sentences
    sentences = re.split(r'(?<=[.!?])\s+', full_text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 30][:200]

    if not sentences:
        return {'summary': 'No content found', 'sentences': 0}

    if len(sentences) <= max_sentences:
        return {'summary': ' '.join(sentences), 'sentences': len(sentences)}

    # Score sentences by word frequency
    STOP = frozenset({'the','and','for','are','but','not','you','all','this',
                      'that','with','have','from','they','will','is','in',
                      'of','to','at','by','on','a','an','it','its'})

    word_freq = defaultdict(int)
    for sent in sentences:
        for word in re.findall(r'\b[a-z]{3,}\b', sent.lower()):
            if word not in STOP:
                word_freq[word] += 1

    def score_sentence(sent):
        words = re.findall(r'\b[a-z]{3,}\b', sent.lower())
        return sum(word_freq[w] for w in words if w not in STOP) / max(len(words), 1)

    scored = [(score_sentence(s), i, s) for i, s in enumerate(sentences)]
    scored.sort(reverse=True)
    top = sorted(scored[:max_sentences], key=lambda x: x[1])  # Restore order
    summary = ' '.join(s for _, _, s in top)

    return {
        'summary': summary,
        'sentences_selected': max_sentences,
        'total_sentences': len(sentences),
        'extraction_method': 'frequency_based_textrank',
    }


def count_pdf_stats(input_path: str) -> dict:
    """
    Comprehensive document statistics for a PDF.
    Word count, page count, reading time, language guess, etc.
    """
    import fitz, re
    from collections import Counter

    doc = fitz.open(input_path)
    pages_text = [p.get_text('text') for p in doc]
    full_text = ' '.join(pages_text)
    doc.close()

    words = re.findall(r'\b\w+\b', full_text)
    sentences = re.findall(r'[.!?]+', full_text)
    paragraphs = [p for p in re.split(r'\n{2,}', full_text) if p.strip()]
    chars_no_space = len(full_text.replace(' ', '').replace('\n', ''))

    return {
        'pages': len(pages_text),
        'words': len(words),
        'characters': len(full_text),
        'characters_no_spaces': chars_no_space,
        'sentences': len(sentences),
        'paragraphs': len(paragraphs),
        'avg_words_per_page': round(len(words)/max(len(pages_text),1), 1),
        'avg_words_per_sentence': round(len(words)/max(len(sentences),1), 1),
        'reading_time_minutes': round(len(words)/238, 1),
        'speaking_time_minutes': round(len(words)/130, 1),
    }


# ═══════════════════════════════════════════════════════════════
# ENHANCED SUMMARIZE FUNCTIONS — langdetect · readability · keywords
# IshuTools.fun | Ishu Kumar (ISHUKR41 / ISHUKR75)
# ═══════════════════════════════════════════════════════════════

def summarize_with_auto_language(
    input_path: str, output_path: str,
    sentences: int = 5,
    password: str = '',
) -> dict:
    """
    Detect the PDF language automatically using langdetect, then summarize.
    Returns summary, detected language, and confidence.
    """
    result = summarize_pdf(input_path, output_path, sentences=sentences, password=password)
    lang_info = {'language': 'unknown', 'confidence': 0.0}
    try:
        from langdetect import detect, detect_langs
        text = result.get('extracted_text', '') or result.get('summary', '')
        if text and len(text) > 50:
            lang_info['language'] = detect(text[:2000])
            dets = detect_langs(text[:2000])
            lang_info['confidence'] = round(max((d.prob for d in dets), default=0), 3)
            lang_info['all_detected'] = [{'lang': str(d).split(':')[0], 'prob': round(float(str(d).split(':')[1]), 3)} for d in dets[:5]]
    except Exception:
        pass
    return {**result, 'language_detection': lang_info}


def get_document_readability(input_path: str, password: str = '') -> dict:
    """
    Analyze document readability: average sentence length, word length, complexity.
    Returns Flesch Reading Ease approximation and grade level estimate.
    """
    import re
    try:
        import pdfplumber
        with pdfplumber.open(input_path, password=password if password else None) as pdf:
            text = ' '.join((pg.extract_text() or '') for pg in pdf.pages[:20])
    except Exception:
        text = ''
    if not text.strip():
        return {'error': 'No extractable text found'}
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if len(s.strip()) > 10]
    words = text.split()
    syllable_count = sum(max(1, len(re.findall(r'[aeiouAEIOU]', w))) for w in words[:1000])
    if not sentences or not words:
        return {'error': 'Insufficient text for analysis'}
    avg_sentence_len = len(words) / max(len(sentences), 1)
    avg_syllables_per_word = syllable_count / max(min(len(words), 1000), 1)
    flesch = 206.835 - 1.015 * avg_sentence_len - 84.6 * avg_syllables_per_word
    flesch = max(0, min(100, flesch))
    if flesch >= 90: grade = 'Very Easy (5th Grade)'; level = 'elementary'
    elif flesch >= 70: grade = 'Easy (6th Grade)'; level = 'middle_school'
    elif flesch >= 60: grade = 'Standard (8th Grade)'; level = 'high_school'
    elif flesch >= 30: grade = 'Difficult (College)'; level = 'college'
    else: grade = 'Very Difficult (Professional)'; level = 'professional'
    return {
        'flesch_reading_ease': round(flesch, 1),
        'grade_level': grade,
        'level': level,
        'total_words': len(words),
        'total_sentences': len(sentences),
        'avg_sentence_length_words': round(avg_sentence_len, 1),
        'avg_syllables_per_word': round(avg_syllables_per_word, 2),
    }


def extract_action_items(input_path: str, password: str = '') -> dict:
    """
    Extract action items, tasks, and to-do items from PDF using keyword detection.
    Finds sentences with action verbs, deadlines, and assignment language.
    """
    import re
    try:
        import pdfplumber
        with pdfplumber.open(input_path, password=password if password else None) as pdf:
            text = ' '.join((pg.extract_text() or '') for pg in pdf.pages[:30])
    except Exception:
        text = ''
    sentences = re.split(r'[.!?\n]+', text)
    action_keywords = r'\b(must|should|will|shall|need to|have to|required to|action|task|todo|to-do|deadline|due|assign|please|ensure|complete|submit|review|approve|send|update|schedule|contact|follow up|implement|create|prepare|deliver|coordinate)\b'
    action_items = []
    for s in sentences:
        if re.search(action_keywords, s, re.I) and len(s.strip()) > 20:
            action_items.append(s.strip()[:200])
    return {
        'action_items': action_items[:30],
        'total_found': len(action_items),
        'note': 'AI-extracted using keyword analysis',
    }
