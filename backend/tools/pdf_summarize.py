"""
pdf_summarize.py - AI-powered extractive PDF summarization (Ultra-Enhanced)
IshuTools.fun | Professional PDF Suite

Libraries: pdfminer, pypdf, fitz (PyMuPDF), re, collections, heapq, math
Features:
  - TF-IDF sentence scoring (not just word frequency)
  - Position bias (earlier sentences weighted higher)
  - Paragraph-structure-aware extraction
  - Key entity extraction (capitalized nouns as named entities)
  - Reading level estimation (Flesch-Kincaid)
  - Language detection (basic heuristic)
  - Abstract detection (finds existing abstract/summary sections)
  - Keyword density analysis
  - Multi-document mode
  - Page-by-page text preview
"""

import re
import math
from collections import Counter, defaultdict
from pdfminer.high_level import extract_text
from pypdf import PdfReader
import fitz


# ── Extended stop-words ───────────────────────────────────────────────────────
STOP_WORDS = {
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'this', 'that',
    'with', 'have', 'from', 'they', 'will', 'been', 'was', 'were', 'can',
    'has', 'had', 'its', 'into', 'also', 'more', 'some', 'such', 'then',
    'than', 'here', 'when', 'which', 'who', 'whom', 'what', 'where', 'why',
    'how', 'each', 'both', 'few', 'more', 'most', 'other', 'same', 'own',
    'just', 'very', 'may', 'might', 'shall', 'should', 'would', 'could',
    'there', 'their', 'them', 'these', 'those', 'about', 'above', 'after',
    'again', 'any', 'because', 'before', 'between', 'during', 'through',
    'under', 'while', 'our', 'out', 'over', 'said', 'says', 'even', 'back',
    'still', 'since', 'never', 'always', 'often', 'well', 'only', 'first',
    'last', 'however', 'although', 'therefore', 'thus', 'hence', 'furthermore',
    'moreover', 'whereas', 'whether', 'within', 'without', 'much', 'many',
    'make', 'made', 'like', 'need', 'take', 'used', 'using', 'data',
}


# ── Text cleaning ─────────────────────────────────────────────────────────────

def clean_text(text: str) -> str:
    """Clean and normalize extracted PDF text."""
    text = re.sub(r'\f', '\n\n', text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'[^\x20-\x7E\n]', ' ', text)
    text = re.sub(r'\b\d{1,2}\b\s*\n', '', text)  # Remove page numbers
    text = re.sub(r'-\n', '', text)  # Join hyphenated line breaks
    return text.strip()


def split_sentences(text: str) -> list:
    """Split text into meaningful sentences."""
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    return [s.strip() for s in sentences
            if len(s.strip()) > 25 and len(s.strip()) < 800]


def split_paragraphs(text: str) -> list:
    """Split text into paragraphs."""
    return [p.strip() for p in text.split('\n\n') if len(p.strip()) > 30]


# ── TF-IDF scoring ────────────────────────────────────────────────────────────

def compute_tfidf(sentences: list) -> dict:
    """Compute TF-IDF scores for all words across sentences (as documents)."""
    N = len(sentences)
    if N == 0:
        return {}

    # TF per sentence
    tf = []
    for sent in sentences:
        words = re.findall(r'\b[a-zA-Z]{3,}\b', sent.lower())
        words = [w for w in words if w not in STOP_WORDS]
        freq = Counter(words)
        total = max(len(words), 1)
        tf.append({w: c / total for w, c in freq.items()})

    # IDF across sentences
    df = defaultdict(int)
    for sent_tf in tf:
        for w in sent_tf:
            df[w] += 1
    idf = {w: math.log((N + 1) / (df[w] + 1)) + 1 for w in df}

    # TF-IDF per sentence
    tfidf = {}
    for i, sent_tf in enumerate(tf):
        score = sum(v * idf.get(w, 1) for w, v in sent_tf.items())
        word_count = sum(1 for w in sent_tf)
        tfidf[i] = score / max(word_count, 1)

    return tfidf


def score_sentences_advanced(sentences: list) -> dict:
    """
    Score sentences using TF-IDF + position bias + length normalization.
    Returns dict of {sentence_idx: score}.
    """
    n = len(sentences)
    if n == 0:
        return {}

    tfidf_scores = compute_tfidf(sentences)

    # Position bias: sentences in the first and last 20% get a bonus
    position_weight = {}
    for i in range(n):
        pos = i / n
        if pos < 0.2:
            position_weight[i] = 1.3
        elif pos > 0.8:
            position_weight[i] = 1.1
        else:
            position_weight[i] = 1.0

    # Combine scores
    final_scores = {}
    for i, sent in enumerate(sentences):
        tfidf = tfidf_scores.get(i, 0)
        pos_w = position_weight.get(i, 1.0)
        # Length penalty: prefer medium-length sentences
        wc = len(sent.split())
        length_factor = min(1.0, wc / 15) if wc < 15 else min(1.0, 40 / wc)
        final_scores[i] = tfidf * pos_w * length_factor

    return final_scores


# ── Abstract detection ─────────────────────────────────────────────────────────

def find_abstract(text: str) -> str:
    """Find an existing abstract/summary section in the text."""
    patterns = [
        r'(?i)abstract[:\s]+(.{100,1000}?)(?=\n\n|\Z)',
        r'(?i)summary[:\s]+(.{100,1000}?)(?=\n\n|\Z)',
        r'(?i)overview[:\s]+(.{100,800}?)(?=\n\n|\Z)',
        r'(?i)introduction[:\s]+(.{100,1000}?)(?=\n\n|\Z)',
    ]
    for pat in patterns:
        m = re.search(pat, text, re.DOTALL)
        if m:
            return m.group(1).strip()
    return ''


# ── Named entity extraction ───────────────────────────────────────────────────

def extract_named_entities(text: str) -> list:
    """
    Simple heuristic named entity extraction:
    capitalized multi-word sequences that repeat.
    """
    # Find capitalized word sequences (potential entities)
    pattern = re.compile(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b')
    candidates = pattern.findall(text)
    freq = Counter(candidates)
    # Filter to those appearing ≥ 2 times and not common words
    skip = {'The', 'This', 'That', 'These', 'Those', 'When', 'Where', 'What',
            'Which', 'How', 'Why', 'However', 'Therefore', 'Moreover',
            'Figure', 'Table', 'Section', 'Chapter', 'Page'}
    entities = [(e, c) for e, c in freq.most_common(20)
                if c >= 2 and e not in skip and len(e) > 2]
    return [e for e, _ in entities[:10]]


# ── Readability ───────────────────────────────────────────────────────────────

def flesch_kincaid_grade(text: str) -> float:
    """Estimate Flesch-Kincaid reading grade level."""
    sentences = re.split(r'[.!?]+', text)
    sentences = [s for s in sentences if s.strip()]
    words = re.findall(r'\b\w+\b', text)
    syllables = sum(_count_syllables(w) for w in words)
    if not sentences or not words:
        return 0.0
    asl = len(words) / len(sentences)  # avg sentence length
    asw = syllables / len(words)       # avg syllables per word
    grade = 0.39 * asl + 11.8 * asw - 15.59
    return round(max(0, grade), 1)


def _count_syllables(word: str) -> int:
    """Approximate syllable count for a word."""
    word = word.lower().strip(".,;:'\"")
    if not word:
        return 0
    vowels = 'aeiouy'
    count = sum(1 for i, c in enumerate(word)
                if c in vowels and (i == 0 or word[i-1] not in vowels))
    if word.endswith('e') and count > 1:
        count -= 1
    return max(1, count)


# ── Language detection (heuristic) ────────────────────────────────────────────

def detect_language_hint(text: str) -> str:
    """Very simple language heuristic based on common function words."""
    sample = text[:2000].lower()
    indicators = {
        'english':  len(re.findall(r'\b(the|and|of|is|in|to|a)\b', sample)),
        'spanish':  len(re.findall(r'\b(el|la|de|que|en|y|a|los|las)\b', sample)),
        'french':   len(re.findall(r'\b(le|la|de|et|en|est|que|les)\b', sample)),
        'german':   len(re.findall(r'\b(der|die|das|und|in|ist|von)\b', sample)),
        'hindi':    len(re.findall(r'[\u0900-\u097F]', sample)),
        'arabic':   len(re.findall(r'[\u0600-\u06FF]', sample)),
    }
    best = max(indicators, key=indicators.get)
    if indicators[best] < 3:
        return 'unknown'
    return best


# ── Main API ──────────────────────────────────────────────────────────────────

def summarize_pdf(
    input_path: str,
    summary_length: str = 'medium',
    include_entities: bool = True,
    include_readability: bool = True,
    detect_abstract: bool = True,
) -> dict:
    """
    Extract and summarize text from a PDF using TF-IDF + position scoring.

    Args:
        input_path:           Source PDF path
        summary_length:       'short' (3 sentences) | 'medium' (6) | 'long' (12)
        include_entities:     Extract named entities
        include_readability:  Compute Flesch-Kincaid grade
        detect_abstract:      Look for existing abstract section
    Returns:
        dict with summary, word_count, page_count, key_topics, entities,
                   reading_time_min, grade_level, language, abstract_found
    """
    sentence_counts = {'short': 3, 'medium': 6, 'long': 12}
    n_sentences = sentence_counts.get(summary_length, 6)

    # Extract text — try pdfminer then fitz
    raw_text = ''
    try:
        raw_text = extract_text(input_path)
    except Exception:
        pass

    if not raw_text or len(raw_text.strip()) < 20:
        try:
            doc = fitz.open(input_path)
            raw_text = '\n\n'.join(page.get_text() for page in doc)
            doc.close()
        except Exception:
            pass

    if not raw_text or len(raw_text.strip()) < 20:
        return {
            'summary': 'This PDF appears to be image-based or contains no extractable text. '
                       'Please run OCR first.',
            'word_count': 0,
            'page_count': 0,
            'key_topics': [],
            'entities': [],
            'reading_time_min': 0,
            'grade_level': None,
            'language': 'unknown',
            'abstract_found': '',
        }

    text = clean_text(raw_text)
    word_count = len(text.split())

    # Page count
    page_count = 0
    try:
        reader = PdfReader(input_path)
        page_count = len(reader.pages)
    except Exception:
        try:
            doc = fitz.open(input_path)
            page_count = doc.page_count
            doc.close()
        except Exception:
            pass

    # Look for existing abstract
    abstract_found = ''
    if detect_abstract:
        abstract_found = find_abstract(text)

    # Generate extractive summary
    sentences = split_sentences(text)
    if not sentences:
        sentences = [p for p in split_paragraphs(text)][:20]

    if len(sentences) <= n_sentences:
        summary = ' '.join(sentences)
    else:
        scores = score_sentences_advanced(sentences)
        top_indices = sorted(scores, key=scores.get, reverse=True)[:n_sentences]
        top_indices.sort()
        summary = ' '.join(sentences[i] for i in top_indices)

    # Key topics (TF-IDF top words)
    all_words = re.findall(r'\b[a-zA-Z]{4,}\b', text.lower())
    all_words = [w for w in all_words if w not in STOP_WORDS]
    freq = Counter(all_words)

    # Bigrams for richer topics
    bigrams = []
    word_list = all_words
    for i in range(len(word_list) - 1):
        bg = f'{word_list[i]} {word_list[i+1]}'
        bigrams.append(bg)
    bg_freq = Counter(bigrams)
    top_bigrams = [bg for bg, c in bg_freq.most_common(5) if c >= 2]
    top_words = [w for w, _ in freq.most_common(15)]
    key_topics = (top_bigrams + top_words)[:10]

    # Named entities
    entities = []
    if include_entities:
        entities = extract_named_entities(text)

    # Readability
    grade_level = None
    if include_readability:
        grade_level = flesch_kincaid_grade(text)

    # Language
    language = detect_language_hint(text)

    reading_time = max(1, word_count // 200)

    return {
        'summary': summary,
        'word_count': word_count,
        'page_count': page_count,
        'key_topics': key_topics,
        'entities': entities,
        'reading_time_min': reading_time,
        'grade_level': grade_level,
        'language': language,
        'abstract_found': abstract_found,
        'full_text_preview': text[:500] + ('...' if len(text) > 500 else ''),
    }


def summarize_by_page(input_path: str, sentences_per_page: int = 2) -> list:
    """
    Generate a mini-summary for each page of the PDF.
    Returns list of dicts with page_num, text_preview, mini_summary, word_count.
    """
    result = []
    try:
        doc = fitz.open(input_path)
        for i, page in enumerate(doc):
            text = clean_text(page.get_text())
            sentences = split_sentences(text)
            if sentences:
                scores = score_sentences_advanced(sentences)
                top = sorted(scores, key=scores.get, reverse=True)[:sentences_per_page]
                top.sort()
                mini = ' '.join(sentences[j] for j in top)
            else:
                mini = text[:200] if text else '(no text)'
            result.append({
                'page_num': i + 1,
                'mini_summary': mini,
                'word_count': len(text.split()),
                'text_preview': text[:150],
            })
        doc.close()
    except Exception as e:
        result.append({'error': str(e)})
    return result
