"""
pdf_unlock.py - Remove password protection from PDF
IshuTools.fun | Professional PDF Suite
"""
import pikepdf
from pypdf import PdfWriter, PdfReader


def unlock_pdf(input_path: str, output_path: str, password: str = '') -> str:
    """
    Remove password encryption from a PDF.
    
    Args:
        input_path: Password-protected PDF
        output_path: Unlocked output PDF
        password: Password to open the PDF (user or owner password)
    Returns:
        output_path
    Raises:
        ValueError if password is incorrect
    """
    # Try pikepdf first (handles more encryption types)
    try:
        with pikepdf.open(input_path, password=password) as pdf:
            # Save without encryption
            pdf.save(output_path)
        return output_path
    except pikepdf.PasswordError:
        raise ValueError('Incorrect password. Please provide the correct password.')
    except Exception:
        pass

    # Fallback: pypdf
    try:
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            result = reader.decrypt(password)
            if result == 0:
                raise ValueError('Incorrect password.')
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        with open(output_path, 'wb') as f:
            writer.write(f)
        return output_path
    except ValueError:
        raise
    except Exception as e:
        raise RuntimeError(f'Could not unlock PDF: {e}')
