"""
pdf_repair.py - Attempt to repair corrupted or broken PDFs
IshuTools.fun | Professional PDF Suite
"""
import pikepdf
from pypdf import PdfWriter, PdfReader


def repair_pdf(input_path: str, output_path: str) -> str:
    """
    Attempt to repair a corrupted PDF file.
    
    Tries pikepdf's lenient reader first, then falls back to pypdf.
    
    Args:
        input_path: Possibly corrupted PDF path
        output_path: Repaired PDF output path
    Returns:
        output_path
    """
    # Strategy 1: pikepdf with lenient parsing
    try:
        with pikepdf.open(input_path, suppress_warnings=True) as pdf:
            pdf.save(output_path)
        return output_path
    except Exception as e1:
        pass

    # Strategy 2: pypdf page-by-page recovery
    try:
        reader = PdfReader(input_path, strict=False)
        if reader.is_encrypted:
            reader.decrypt('')
        writer = PdfWriter()
        for i, page in enumerate(reader.pages):
            try:
                writer.add_page(page)
            except Exception:
                continue  # Skip unreadable pages
        with open(output_path, 'wb') as f:
            writer.write(f)
        return output_path
    except Exception as e2:
        raise RuntimeError(f'Could not repair PDF. Error: {e2}')
