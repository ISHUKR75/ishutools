"""
pdf_unlock.py - Remove PDF password protection (Ultra-Enhanced)
IshuTools.fun | Professional PDF Suite

Libraries: pikepdf, pypdf, fitz (PyMuPDF)
Features:
  - AES-256, AES-128, RC4 decryption
  - Both user & owner password attempts
  - Common password dictionary brute-force
  - Empty/owner-only unlock (no password needed for owner access)
  - Encryption info reporting before unlock
  - Metadata preservation
  - File integrity check after unlock
"""

import os
import fitz
import pikepdf
from pypdf import PdfWriter, PdfReader


# ── Common password dictionary ─────────────────────────────────────────────────
COMMON_PASSWORDS = [
    '', 'password', 'Password', 'PASSWORD',
    '123456', '1234', '12345', '123456789',
    'admin', 'Admin', 'test', 'user',
    'pdf', 'PDF', 'document', 'Document',
    'open', 'Open', 'adobe', 'Adobe',
    '000000', '111111', '888888', '999999',
    'qwerty', 'letmein', 'welcome', 'secret',
    'abc123', 'pass', 'login', 'master',
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _try_pikepdf_unlock(input_path: str, output_path: str,
                         password: str) -> bool:
    """Attempt to unlock with pikepdf. Returns True on success."""
    try:
        with pikepdf.open(input_path, password=password) as pdf:
            pdf.save(output_path,
                     compress_streams=True,
                     object_stream_mode=pikepdf.ObjectStreamMode.generate)
        return True
    except pikepdf.PasswordError:
        return False
    except Exception:
        return False


def _try_pypdf_unlock(input_path: str, output_path: str,
                       password: str) -> bool:
    """Attempt to unlock with pypdf. Returns True on success."""
    try:
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            result = reader.decrypt(password)
            if result == 0:
                return False
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        with open(output_path, 'wb') as f:
            writer.write(f)
        return True
    except Exception:
        return False


def _try_fitz_unlock(input_path: str, output_path: str,
                      password: str) -> bool:
    """Attempt to unlock with PyMuPDF. Returns True on success."""
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            result = doc.authenticate(password)
            if result == 0:
                doc.close()
                return False
        doc.save(output_path, garbage=4, deflate=True)
        doc.close()
        return True
    except Exception:
        return False


def _verify_output(output_path: str) -> bool:
    """Verify the unlocked PDF is readable."""
    try:
        reader = PdfReader(output_path)
        return not reader.is_encrypted and len(reader.pages) > 0
    except Exception:
        return False


# ── Main API ──────────────────────────────────────────────────────────────────

def unlock_pdf(
    input_path: str,
    output_path: str,
    password: str = '',
    try_common_passwords: bool = False,
) -> dict:
    """
    Remove password encryption from a PDF.

    Args:
        input_path:            Password-protected PDF
        output_path:           Unlocked output PDF
        password:              Known password (user or owner)
        try_common_passwords:  Brute-force with common passwords if provided
                               password fails
    Returns:
        dict with output_path, method, password_used, page_count
    Raises:
        ValueError if no working password found
    """
    # Check if PDF is actually encrypted
    try:
        reader = PdfReader(input_path)
        if not reader.is_encrypted:
            # Already unlocked — just copy/optimize
            writer = PdfWriter()
            for page in reader.pages:
                writer.add_page(page)
            with open(output_path, 'wb') as f:
                writer.write(f)
            return {
                'output_path': output_path,
                'method': 'no_encryption',
                'password_used': None,
                'page_count': len(reader.pages),
                'message': 'PDF was not encrypted; optimized copy created.',
            }
    except Exception:
        pass

    # Build password list to try
    passwords_to_try = [password] if password else []
    if try_common_passwords:
        passwords_to_try.extend(p for p in COMMON_PASSWORDS
                                if p not in passwords_to_try)
    elif not password:
        passwords_to_try = COMMON_PASSWORDS[:5]  # Try empty + a few basics

    # Try each password with all three engines
    for pwd in passwords_to_try:
        # pikepdf (best AES-256 support)
        if _try_pikepdf_unlock(input_path, output_path, pwd):
            if _verify_output(output_path):
                page_count = _get_page_count(output_path)
                return {
                    'output_path': output_path,
                    'method': 'pikepdf',
                    'password_used': pwd if pwd else '(empty)',
                    'page_count': page_count,
                }

        # fitz / PyMuPDF
        if _try_fitz_unlock(input_path, output_path, pwd):
            if _verify_output(output_path):
                page_count = _get_page_count(output_path)
                return {
                    'output_path': output_path,
                    'method': 'fitz',
                    'password_used': pwd if pwd else '(empty)',
                    'page_count': page_count,
                }

        # pypdf fallback
        if _try_pypdf_unlock(input_path, output_path, pwd):
            if _verify_output(output_path):
                page_count = _get_page_count(output_path)
                return {
                    'output_path': output_path,
                    'method': 'pypdf',
                    'password_used': pwd if pwd else '(empty)',
                    'page_count': page_count,
                }

    raise ValueError(
        'Incorrect password. Please provide the correct user or owner password. '
        'Note: Some PDFs use owner-only passwords — try leaving password blank.'
    )


def _get_page_count(pdf_path: str) -> int:
    try:
        return len(PdfReader(pdf_path).pages)
    except Exception:
        return 0


def get_encryption_details(pdf_path: str) -> dict:
    """
    Get detailed encryption information about a PDF.
    Returns dict with is_encrypted, requires_password, encryption_method.
    """
    info = {
        'is_encrypted': False,
        'requires_password': False,
        'encryption_method': 'none',
        'can_open_without_password': True,
        'file_size_kb': round(os.path.getsize(pdf_path) / 1024, 1),
    }
    try:
        reader = PdfReader(pdf_path)
        info['is_encrypted'] = reader.is_encrypted
        if reader.is_encrypted:
            # Try empty password (owner-unlocked)
            try:
                result = reader.decrypt('')
                info['can_open_without_password'] = result > 0
                info['requires_password'] = result == 0
            except Exception:
                info['requires_password'] = True
                info['can_open_without_password'] = False
    except Exception:
        pass

    try:
        with pikepdf.open(pdf_path) as pdf:
            enc = pdf.encryption
            if enc:
                R = enc.R
                method_map = {6: 'AES-256', 4: 'AES-128', 3: 'RC4-128', 2: 'RC4-40'}
                info['encryption_method'] = method_map.get(R, f'R={R}')
    except pikepdf.PasswordError:
        info['encryption_method'] = 'AES (password required)'
    except Exception:
        pass

    return info
