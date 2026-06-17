"""
pdf_summarize.py - AI-powered PDF text summarization
IshuTools.fun | Professional PDF Suite
"""
import re
from pdfminer.high_level import extract_text
from collections import Counter


def clean_text(text: str) -> str:
    """Clean extracted PDF text."""
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'[^\x20-\x7E\n]', ' ', text)
    return text.strip()


def split_sentences(text: str) -> list:
    """Split text into sentences."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if len(s.strip()) > 20]


def score_sentences(sentences: list) -> dict:
    """Score sentences by word frequency (extractive summarization)."""
    # Build word frequency
    all_words = []
    for sent in sentences:
        words = re.findall(r'\b[a-zA-Z]{3,}\b', sent.lower())
        all_words.extend(words)

    # Exclude common stop words
    stop_words = {'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
                  'this', 'that', 'with', 'have', 'from', 'they', 'will',
                  'been', 'was', 'were', 'can', 'has', 'had', 'its', 'into'}
    word_freq = Counter(w for w in all_words if w not in stop_words)

    scores = {}
    for i, sent in enumerate(sentences):
        words = re.findall(r'\b[a-zA-Z]{3,}\b', sent.lower())
        score = sum(word_freq.get(w, 0) for w in words if w not in stop_words)
        scores[i] = score / (len(words) + 1)

    return scores


def extractive_summary(text: str, num_sentences: int = 5) -> str:
    """Generate an extractive summary by selecting top-scored sentences."""
    sentences = split_sentences(text)
    if len(sentences) <= num_sentences:
        return ' '.join(sentences)

    scores = score_sentences(sentences)
    top_indices = sorted(scores, key=scores.get, reverse=True)[:num_sentences]
    top_indices.sort()  # Keep original order
    selected = [sentences[i] for i in top_indices]
    return ' '.join(selected)


def summarize_pdf(input_path: str, summary_length: str = 'medium') -> dict:
    """
    Extract and summarize text from a PDF.
    
    Args:
        input_path: Source PDF path
        summary_length: 'short' (3 sentences) | 'medium' (5) | 'long' (10)
    Returns:
        dict with 'summary', 'word_count', 'page_count', 'key_topics'
    """
    sentence_counts = {'short': 3, 'medium': 5, 'long': 10}
    n = sentence_counts.get(summary_length, 5)

    # Extract text
    try:
        raw_text = extract_text(input_path)
    except Exception as e:
        raise RuntimeError(f'Could not extract text from PDF: {e}')

    text = clean_text(raw_text)
    word_count = len(text.split())

    if word_count < 10:
        return {
            'summary': 'This PDF appears to be image-based or contains very little text. Try OCR first.',
            'word_count': word_count,
            'page_count': 0,
            'key_topics': [],
            'reading_time_min': 0,
        }

    # Generate summary
    summary = extractive_summary(text, num_sentences=n)

    # Extract key topics (top frequent non-stop words)
    all_words = re.findall(r'\b[a-zA-Z]{4,}\b', text.lower())
    stop_words = {'this', 'that', 'with', 'have', 'from', 'they', 'will',
                  'been', 'were', 'their', 'there', 'here', 'when', 'which',
                  'also', 'more', 'some', 'such', 'then', 'than', 'into'}
    freq = Counter(w for w in all_words if w not in stop_words)
    key_topics = [word for word, _ in freq.most_common(8)]

    # Get page count from pypdf
    try:
        from pypdf import PdfReader
        reader = PdfReader(input_path)
        page_count = len(reader.pages)
    except Exception:
        page_count = 0

    reading_time = max(1, word_count // 200)

    return {
        'summary': summary,
        'word_count': word_count,
        'page_count': page_count,
        'key_topics': key_topics,
        'reading_time_min': reading_time,
        'full_text_preview': text[:500] + ('...' if len(text) > 500 else ''),
    }
