"""
pdf_merge.py - Merge multiple PDF files into one
IshuTools.fun | Professional PDF Suite
"""
from pypdf import PdfWriter, PdfReader


def merge_pdfs(input_paths: list, output_path: str) -> str:
    """
    Merge multiple PDF files into a single PDF.
    
    Args:
        input_paths: List of input PDF file paths (in order)
        output_path: Path for the merged output PDF
    Returns:
        output_path on success
    """
    writer = PdfWriter()

    for pdf_path in input_paths:
        reader = PdfReader(pdf_path)
        # Handle encrypted PDFs with empty password
        if reader.is_encrypted:
            reader.decrypt('')
        for page in reader.pages:
            writer.add_page(page)

    # Preserve metadata from first PDF if available
    try:
        first_reader = PdfReader(input_paths[0])
        if first_reader.metadata:
            writer.add_metadata(dict(first_reader.metadata))
    except Exception:
        pass

    with open(output_path, 'wb') as f:
        writer.write(f)

    return output_path
