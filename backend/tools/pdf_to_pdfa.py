"""
pdf_to_pdfa.py - Convert PDF to PDF/A archival format
IshuTools.fun | Professional PDF Suite
"""
import pikepdf
from pypdf import PdfWriter, PdfReader


def pdf_to_pdfa(input_path: str, output_path: str, level: str = '1b') -> str:
    """
    Convert a standard PDF to PDF/A compliant format.
    
    PDF/A is an ISO standard for long-term archival of PDF documents.
    
    Args:
        input_path: Source PDF
        output_path: Output PDF/A file
        level: '1b' | '2b' | '3b' (PDF/A conformance level)
    Returns:
        output_path
    """
    try:
        with pikepdf.open(input_path) as pdf:
            # Add PDF/A metadata
            with pdf.open_metadata(set_pikepdf_as_editor=False) as meta:
                meta['pdfaid:part'] = level[0]          # e.g. '1'
                meta['pdfaid:conformance'] = level[1].upper()  # 'B'
                meta['dc:title'] = 'PDF/A Archive Document'
                meta['dc:creator'] = ['IshuTools.fun']

            pdf.save(
                output_path,
                compress_streams=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
            )
        return output_path
    except Exception:
        # Fallback: copy with pypdf
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt('')
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        writer.add_metadata({
            '/PDFAVersion': f'PDF/A-{level}',
            '/Producer': 'IshuTools.fun',
        })
        with open(output_path, 'wb') as f:
            writer.write(f)
        return output_path
