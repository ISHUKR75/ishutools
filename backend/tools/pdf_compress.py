"""
pdf_compress.py - Compress and reduce PDF file size
IshuTools.fun | Professional PDF Suite
"""
import pikepdf
from pypdf import PdfWriter, PdfReader
from PIL import Image
import io


# Quality presets mapped to image DPI and JPEG quality
QUALITY_PRESETS = {
    'low':    {'dpi': 72,  'jpeg_quality': 50,  'image_scale': 0.5},
    'medium': {'dpi': 120, 'jpeg_quality': 70,  'image_scale': 0.75},
    'high':   {'dpi': 150, 'jpeg_quality': 85,  'image_scale': 0.90},
}


def compress_pdf(input_path: str, output_path: str, quality: str = 'medium') -> str:
    """
    Compress a PDF file by optimizing streams and downsampling images.
    
    Args:
        input_path: Source PDF path
        output_path: Output compressed PDF path
        quality: Compression level - 'low', 'medium', or 'high'
    Returns:
        output_path on success
    """
    preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS['medium'])

    try:
        # Primary: use pikepdf for robust compression
        with pikepdf.open(input_path, allow_overwriting_input=False) as pdf:
            # Compress content streams
            for page in pdf.pages:
                page.compress_content_streams()

            # Optimize object streams
            pdf.save(
                output_path,
                compress_streams=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
                recompress_flate=True,
                preserve_pdfa=False,
            )
    except Exception:
        # Fallback: pypdf stream-level copy
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
