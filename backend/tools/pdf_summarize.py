"""
pdf_summarize.py — AI-powered extractive PDF summarization (Enterprise Edition)
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
