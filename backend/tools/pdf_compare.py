"""
pdf_compare.py - Compare two PDFs and report differences
IshuTools.fun | Professional PDF Suite
"""
from pypdf import PdfReader
from pdfminer.high_level import extract_text
import difflib


def compare_pdfs(path1: str, path2: str, output_path: str) -> dict:
    """
    Compare two PDF files text-wise and return a difference report.
    
    Args:
        path1: First PDF path
        path2: Second PDF path
        output_path: Not used for text diff; reserved for future image diff
    Returns:
        dict with comparison results
    """
    # Extract text from both PDFs
    try:
        text1 = extract_text(path1)
    except Exception:
        text1 = ''

    try:
        text2 = extract_text(path2)
    except Exception:
        text2 = ''

    # Get page counts
    reader1 = PdfReader(path1)
    reader2 = PdfReader(path2)
    pages1 = len(reader1.pages)
    pages2 = len(reader2.pages)

    # Compute text diff
    lines1 = text1.splitlines(keepends=True)
    lines2 = text2.splitlines(keepends=True)

    differ = difflib.unified_diff(lines1, lines2,
                                   fromfile='Document 1',
                                   tofile='Document 2',
                                   lineterm='')
    diff_text = list(differ)

    added = sum(1 for l in diff_text if l.startswith('+') and not l.startswith('+++'))
    removed = sum(1 for l in diff_text if l.startswith('-') and not l.startswith('---'))

    # Similarity ratio
    similarity = difflib.SequenceMatcher(None, text1, text2).ratio()

    result = {
        'document1_pages': pages1,
        'document2_pages': pages2,
        'page_count_diff': abs(pages1 - pages2),
        'text_similarity': round(similarity * 100, 2),
        'lines_added': added,
        'lines_removed': removed,
        'total_changes': added + removed,
        'are_identical': similarity >= 0.999,
        'diff_preview': ''.join(diff_text[:100]),  # First 100 diff lines
    }

    return result
