"""
pdf_to_word.py - Convert PDF to Microsoft Word (.docx)
IshuTools.fun | Professional PDF Suite
"""
from pdf2docx import Converter


def pdf_to_word(input_path: str, output_path: str) -> str:
    """
    Convert a PDF file to a Word document preserving layout.
    
    Uses pdf2docx which leverages pdfminer + python-docx.
    
    Args:
        input_path: Source PDF
        output_path: Output .docx path
    Returns:
        output_path
    """
    cv = Converter(input_path)
    try:
        cv.convert(output_path, start=0, end=None)
    finally:
        cv.close()
    return output_path
