"""
pdf_optimize.py - Optimize PDF for web, print, or screen
IshuTools.fun | Professional PDF Suite
"""
import pikepdf
from pypdf import PdfWriter, PdfReader


def optimize_pdf(input_path: str, output_path: str, target: str = 'web') -> str:
    """
    Optimize a PDF for different output targets.
    
    Args:
        input_path: Source PDF
        output_path: Optimized output PDF
        target: 'web' | 'print' | 'screen'
    Returns:
        output_path
    """
    try:
        with pikepdf.open(input_path) as pdf:
            # Linearize for web (fast web view)
            if target == 'web':
                pdf.save(
                    output_path,
                    linearize=True,
                    compress_streams=True,
                    object_stream_mode=pikepdf.ObjectStreamMode.generate,
                    recompress_flate=True,
                )
            elif target == 'print':
                # Keep high quality, just compress streams
                pdf.save(
                    output_path,
                    compress_streams=True,
                    object_stream_mode=pikepdf.ObjectStreamMode.generate,
                )
            else:
                # Screen - aggressive compression
                pdf.save(
                    output_path,
                    compress_streams=True,
                    object_stream_mode=pikepdf.ObjectStreamMode.generate,
                    recompress_flate=True,
                )
    except Exception:
        # Fallback: pypdf
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt('')
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        writer.compress_identical_objects(remove_identicals=True, remove_orphans=True)
        with open(output_path, 'wb') as f:
            writer.write(f)

    return output_path
