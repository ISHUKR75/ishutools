"""
pdf_protect.py - Add password protection to PDF
IshuTools.fun | Professional PDF Suite
"""
import pikepdf
from pypdf import PdfWriter, PdfReader
from pypdf.generic import NameObject


def protect_pdf(input_path: str, output_path: str,
                user_password: str = '', owner_password: str = '',
                permissions: str = 'all') -> str:
    """
    Encrypt a PDF with user and owner passwords.
    
    Args:
        input_path: Source PDF
        output_path: Protected output PDF
        user_password: Password for opening/viewing
        owner_password: Password for full access
        permissions: 'all' | 'print_only' | 'read_only'
    Returns:
        output_path
    """
    # Build permission flags
    perm_flags = pikepdf.Permissions()
    if permissions == 'print_only':
        perm_flags = pikepdf.Permissions(
            print_lowres=True, print_highres=False,
            modify_other=False, modify_annotation=False,
            extract=False, assemble=False
        )
    elif permissions == 'read_only':
        perm_flags = pikepdf.Permissions(
            print_lowres=False, print_highres=False,
            modify_other=False, modify_annotation=False,
            extract=False, assemble=False
        )

    try:
        with pikepdf.open(input_path) as pdf:
            pdf.save(
                output_path,
                encryption=pikepdf.Encryption(
                    user=user_password,
                    owner=owner_password or user_password,
                    R=6,  # AES-256
                    allow=perm_flags,
                )
            )
        return output_path
    except Exception:
        # Fallback: pypdf
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt('')
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        writer.encrypt(user_password=user_password,
                       owner_password=owner_password or user_password,
                       use_128bit=True)
        with open(output_path, 'wb') as f:
            writer.write(f)
        return output_path
