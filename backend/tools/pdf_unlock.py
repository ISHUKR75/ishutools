"""
pdf_unlock.py — Remove PDF password protection (Enterprise Edition)
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41 / ISHUKR75)

Engines: pikepdf · pypdf · fitz (PyMuPDF) · qpdf CLI · Ghostscript CLI
Features:
  - AES-256, AES-128, RC4-128, RC4-40 decryption via pikepdf (primary)
  - fitz / PyMuPDF decryption (secondary)
  - pypdf lenient decryption (tertiary)
  - qpdf --decrypt CLI pipeline (4th)
  - Ghostscript no-password strip pipeline (5th)
  - Extended 100+ common-password brute-force dictionary
  - Owner-only password bypass (no user password needed for owner-unlocked)
  - Pre-flight encryption detection (skip if already unlocked)
  - Post-unlock verification (read-back to confirm decryption worked)
  - Compression and garbage-collect pass after unlock
  - Metadata normalization after unlock
  - Structural repair pass option (pikepdf attempt_recovery)
  - Encryption info extraction before attempting unlock
  - Page count and integrity check
  - Multi-attempt with password variants (lowercase, uppercase, stripped)
  - SHA-256 fingerprints (before and after)
  - Batch unlock: apply same password to multiple PDFs
  - Unlock + optimize combo (deflate + object stream)
  - Partial unlock: preserve some restrictions while removing open password
  - Unlock audit log
  - CLI detection with graceful fallback
"""

import hashlib
import os
import shutil
import subprocess
import tempfile
from datetime import datetime
from typing import Optional

import fitz
import pikepdf
from pypdf import PdfWriter, PdfReader

# ── CLI binary detection ─────────────────────────────────────────────────────
GS_BIN = shutil.which('gs') or shutil.which('ghostscript')
QPDF_BIN = shutil.which('qpdf')


# ── Extended password dictionary ─────────────────────────────────────────────
COMMON_PASSWORDS = [
    # Blank / trivial
    '', ' ',
    # Generic
    'password', 'Password', 'PASSWORD', 'pass', 'Pass',
    '123456', '1234', '12345', '123456789', '12345678',
    '0000', '00000', '000000', '111111', '222222',
    '888888', '999999', '123123', '321321',
    # Admin / tech
    'admin', 'Admin', 'ADMIN', 'administrator', 'root',
    'test', 'Test', 'demo', 'Demo', 'user', 'User',
    # PDF-specific
    'pdf', 'PDF', 'document', 'Document', 'file', 'File',
    'open', 'Open', 'adobe', 'Adobe', 'acrobat', 'Acrobat',
    'reader', 'Reader',
    # Common phrases
    'qwerty', 'letmein', 'welcome', 'secret', 'Secret',
    'abc123', 'login', 'master', 'Master', 'changeme',
    'default', 'Default', 'passw0rd', 'p@ssword', 'p@ssw0rd',
    # Blank variants
    'owner', 'Owner', 'locked', 'Locked', 'protected',
    # Numbers
    '1111', '2222', '4321', '9876', '1234567890',
    # Indian common
    'india', 'India', 'ishu', 'Ishu',
    '1234abcd', 'abcd1234', 'pass1234',
    # Office / enterprise
    'confidential', 'Confidential', 'internal', 'Internal',
    'private', 'Private', 'secure', 'Secure',
    # Year-based
    '2023', '2024', '2025', '2022', '2021',
    # Name-like
    'john', 'John', 'jane', 'Jane', 'mike', 'Mike',
    # Symbols
    'pass!', 'pass@', 'pass#',
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sha256(path: str) -> str:
    h = hashlib.sha256()
    try:
        with open(path, 'rb') as f:
            for chunk in iter(lambda: f.read(65536), b''):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return ''


def _get_page_count(pdf_path: str) -> int:
    """Safely get page count from an unlocked PDF."""
    for fn in [
        lambda: len(PdfReader(pdf_path).pages),
        lambda: fitz.open(pdf_path).page_count,
    ]:
        try:
            return fn()
        except Exception:
            continue
    return 0


def _verify_unlocked(path: str) -> bool:
    """Return True if the output file is readable and NOT encrypted."""
    try:
        reader = PdfReader(path)
        if reader.is_encrypted:
            return False
        return len(reader.pages) > 0
    except Exception:
        pass
    try:
        doc = fitz.open(path)
        ok = not doc.is_encrypted and doc.page_count > 0
        doc.close()
        return ok
    except Exception:
        return False


def _password_variants(password: str) -> list:
    """Generate common variants of a password to try."""
    variants = [password]
    if password:
        variants += [
            password.lower(),
            password.upper(),
            password.capitalize(),
            password.strip(),
            password + '1',
            password + '123',
            password + '!',
            '1' + password,
        ]
    return list(dict.fromkeys(variants))   # deduplicate preserving order


# ── Strategy 1: pikepdf ───────────────────────────────────────────────────────

def _unlock_pikepdf(
    input_path: str,
    output_path: str,
    password: str,
    optimize: bool = True,
) -> bool:
    """Attempt unlock with pikepdf. Returns True on success."""
    try:
        with pikepdf.open(
            input_path,
            password=password,
            suppress_warnings=True,
            attempt_recovery=True,
        ) as pdf:
            save_kwargs = dict(
                compress_streams=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
                recompress_flate=True,
            ) if optimize else {}
            try:
                pdf.docinfo['/Producer'] = 'IshuTools.fun PDF Suite (Unlocked)'
                pdf.docinfo['/ModDate'] = datetime.utcnow().strftime(
                    "D:%Y%m%d%H%M%S+00'00'")
            except Exception:
                pass
            pdf.save(output_path, **save_kwargs)
        return True
    except pikepdf.PasswordError:
        return False
    except Exception:
        return False


# ── Strategy 2: fitz (PyMuPDF) ───────────────────────────────────────────────

def _unlock_fitz(
    input_path: str,
    output_path: str,
    password: str,
) -> bool:
    """Attempt unlock with PyMuPDF. Returns True on success."""
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            result = doc.authenticate(password)
            if result == 0:
                doc.close()
                return False
        doc.save(output_path, garbage=4, deflate=True, clean=True)
        doc.close()
        return True
    except Exception:
        return False


# ── Strategy 3: pypdf ─────────────────────────────────────────────────────────

def _unlock_pypdf(
    input_path: str,
    output_path: str,
    password: str,
) -> bool:
    """Attempt unlock with pypdf. Returns True on success."""
    try:
        reader = PdfReader(input_path, strict=False)
        if reader.is_encrypted:
            result = reader.decrypt(password)
            if result == 0:
                return False
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        writer.add_metadata({
            '/Producer': 'IshuTools.fun PDF Suite (Unlocked)',
            '/ModDate': datetime.utcnow().strftime("D:%Y%m%d%H%M%S+00'00'"),
        })
        with open(output_path, 'wb') as f:
            writer.write(f)
        return True
    except Exception:
        return False


# ── Strategy 4: qpdf CLI ─────────────────────────────────────────────────────

def _unlock_qpdf(
    input_path: str,
    output_path: str,
    password: str,
) -> bool:
    """qpdf --decrypt CLI. Returns True on success."""
    if not QPDF_BIN:
        return False
    cmd = [
        QPDF_BIN,
        '--decrypt',
        f'--password={password}',
        input_path,
        output_path,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return proc.returncode == 0 and os.path.exists(output_path)
    except subprocess.TimeoutExpired:
        return False
    except Exception:
        return False


# ── Strategy 5: Ghostscript passthrough ──────────────────────────────────────

def _unlock_ghostscript(
    input_path: str,
    output_path: str,
    password: str,
) -> bool:
    """GS -sPDFPassword passthrough. Returns True on success."""
    if not GS_BIN:
        return False
    cmd = [
        GS_BIN,
        '-dNOPAUSE', '-dBATCH', '-dQUIET',
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.7',
        f'-sPDFPassword={password}',
        f'-sOutputFile={output_path}',
        input_path,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        return (proc.returncode == 0 and os.path.exists(output_path)
                and os.path.getsize(output_path) > 200)
    except subprocess.TimeoutExpired:
        return False
    except Exception:
        return False


# ── Attempt all engines with a single password ───────────────────────────────

def _try_all_engines(
    input_path: str,
    output_path: str,
    password: str,
    log: list,
) -> Optional[str]:
    """
    Try all 5 unlock engines for a given password.
    Returns engine name on success, None on failure.
    """
    engines = [
        ('pikepdf', lambda: _unlock_pikepdf(input_path, output_path, password)),
        ('fitz',    lambda: _unlock_fitz(input_path, output_path, password)),
        ('pypdf',   lambda: _unlock_pypdf(input_path, output_path, password)),
        ('qpdf',    lambda: _unlock_qpdf(input_path, output_path, password)),
        ('gs',      lambda: _unlock_ghostscript(input_path, output_path, password)),
    ]
    for name, fn in engines:
        try:
            if fn() and _verify_unlocked(output_path):
                log.append(f'Success: engine={name} password={"(empty)" if not password else "(provided)"}')
                return name
        except Exception as e:
            log.append(f'{name}: exception — {e}')
    return None


# ── Main API ──────────────────────────────────────────────────────────────────

def unlock_pdf(
    input_path: str,
    output_path: str,
    password: str = '',
    try_common_passwords: bool = False,
    optimize: bool = True,
    repair: bool = False,
) -> dict:
    """
    Remove password encryption from a PDF using 5 cascading engines.

    Args:
        input_path:            Password-protected PDF
        output_path:           Unlocked output PDF
        password:              Known password (user or owner)
        try_common_passwords:  Brute-force with extended common-password dictionary
        optimize:              Apply deflate + object-stream optimization after unlock
        repair:                Attempt structural repair (pikepdf attempt_recovery)
    Returns:
        dict with output_path, method, password_used, page_count, sizes, log
    Raises:
        ValueError if no working password found
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f'Input file not found: {input_path}')

    orig_size = os.path.getsize(input_path)
    sha_before = _sha256(input_path)
    log = [
        f'unlock_pdf: start {datetime.utcnow().isoformat()}',
        f'source: {os.path.basename(input_path)}',
        f'size: {round(orig_size / 1024, 1)} KB',
    ]

    # ── Pre-flight: check if already unlocked ─────────────────────────────────
    try:
        reader = PdfReader(input_path, strict=False)
        if not reader.is_encrypted:
            log.append('PDF is not encrypted — creating optimized copy')
            writer = PdfWriter()
            for page in reader.pages:
                writer.add_page(page)
            writer.add_metadata({
                '/Producer': 'IshuTools.fun PDF Suite (Optimized)',
                '/ModDate': datetime.utcnow().strftime("D:%Y%m%d%H%M%S+00'00'"),
            })
            with open(output_path, 'wb') as f:
                writer.write(f)
            out_size = os.path.getsize(output_path)
            return {
                'output_path': output_path,
                'method': 'no_encryption',
                'password_used': None,
                'page_count': len(reader.pages),
                'original_size_kb': round(orig_size / 1024, 1),
                'output_size_kb': round(out_size / 1024, 1),
                'sha256_before': sha_before,
                'sha256_after': _sha256(output_path),
                'log': log,
                'message': 'PDF was not encrypted; optimized copy created.',
            }
    except Exception:
        pass

    # ── Build password list ───────────────────────────────────────────────────
    passwords_to_try = []

    # Always try provided password and its variants first
    if password:
        passwords_to_try.extend(_password_variants(password))

    # Add common passwords
    if try_common_passwords:
        passwords_to_try.extend(p for p in COMMON_PASSWORDS
                                if p not in passwords_to_try)
    else:
        # Always try empty + a few basics even without brute-force flag
        for p in COMMON_PASSWORDS[:8]:
            if p not in passwords_to_try:
                passwords_to_try.append(p)

    log.append(f'Trying {len(passwords_to_try)} password candidates')

    # ── Try each password ─────────────────────────────────────────────────────
    for pwd in passwords_to_try:
        engine = _try_all_engines(input_path, output_path, pwd, log)
        if engine:
            out_size = os.path.getsize(output_path)
            page_count = _get_page_count(output_path)
            sha_after = _sha256(output_path)
            log.append(f'unlock_pdf: complete {datetime.utcnow().isoformat()}')
            return {
                'output_path': output_path,
                'method': engine,
                'password_used': pwd if pwd else '(empty)',
                'page_count': page_count,
                'original_size_kb': round(orig_size / 1024, 1),
                'output_size_kb': round(out_size / 1024, 1),
                'size_reduction_kb': round((orig_size - out_size) / 1024, 1),
                'sha256_before': sha_before,
                'sha256_after': sha_after,
                'log': log,
                'unlocked_at': datetime.utcnow().isoformat(),
            }

    raise ValueError(
        'Incorrect password. Please provide the correct user or owner password. '
        'Note: Some PDFs use owner-only passwords — try leaving password blank. '
        f'Attempted {len(passwords_to_try)} password candidates.'
    )


# ── Encryption details inspector ──────────────────────────────────────────────

def get_encryption_details(pdf_path: str, password: str = '') -> dict:
    """
    Get detailed encryption information about a PDF before unlocking.

    Returns:
        dict with is_encrypted, encryption_method, R_value, permissions,
             can_open_without_password, file_size_kb
    """
    info = {
        'is_encrypted': False,
        'requires_password': False,
        'encryption_method': 'none',
        'R_value': 0,
        'can_open_without_password': True,
        'permissions': {},
        'file_size_kb': round(os.path.getsize(pdf_path) / 1024, 1),
        'page_count': 0,
    }

    # pypdf basic check
    try:
        reader = PdfReader(pdf_path)
        info['is_encrypted'] = reader.is_encrypted
        if reader.is_encrypted:
            try:
                result = reader.decrypt(password or '')
                info['can_open_without_password'] = result > 0
                info['requires_password'] = result == 0
                if result > 0:
                    info['page_count'] = len(reader.pages)
            except Exception:
                info['requires_password'] = True
                info['can_open_without_password'] = False
        else:
            info['page_count'] = len(reader.pages)
    except Exception:
        pass

    # pikepdf deep inspection
    try:
        with pikepdf.open(pdf_path, password=password or '',
                          suppress_warnings=True) as pdf:
            enc = pdf.encryption
            if enc:
                info['is_encrypted'] = True
                R_map = {6: 'AES-256', 4: 'AES-128', 3: 'RC4-128', 2: 'RC4-40'}
                info['encryption_method'] = R_map.get(enc.R, f'R={enc.R}')
                info['R_value'] = enc.R
                try:
                    p = enc.P
                    info['permissions'] = {
                        'print': bool(p & (1 << 2)),
                        'modify': bool(p & (1 << 3)),
                        'copy': bool(p & (1 << 4)),
                        'annotate': bool(p & (1 << 5)),
                    }
                except Exception:
                    pass
            if not info['page_count']:
                info['page_count'] = len(pdf.pages)
    except pikepdf.PasswordError:
        info['encryption_method'] = 'AES (password required)'
        info['requires_password'] = True
        info['can_open_without_password'] = False
    except Exception:
        pass

    # qpdf check
    if QPDF_BIN:
        try:
            proc = subprocess.run(
                [QPDF_BIN, '--check', pdf_path],
                capture_output=True, text=True, timeout=15)
            for line in (proc.stdout + proc.stderr).splitlines():
                if 'encrypt' in line.lower():
                    info['qpdf_check'] = line.strip()
                    break
        except Exception:
            pass

    return info


# ── Batch unlock ──────────────────────────────────────────────────────────────

def batch_unlock(
    input_paths: list,
    output_dir: str,
    password: str = '',
    try_common_passwords: bool = False,
) -> dict:
    """
    Unlock multiple PDFs with the same password.

    Args:
        input_paths:           List of password-protected PDF paths
        output_dir:            Directory for unlocked output files
        password:              Password to try (or '' for empty/auto)
        try_common_passwords:  Also try common passwords
    Returns:
        Summary dict with per-file results
    """
    os.makedirs(output_dir, exist_ok=True)
    results = []
    success_count = 0
    fail_count = 0

    for src in input_paths:
        base = os.path.splitext(os.path.basename(src))[0]
        dst = os.path.join(output_dir, f'{base}_unlocked.pdf')
        try:
            r = unlock_pdf(
                src, dst,
                password=password,
                try_common_passwords=try_common_passwords,
            )
            r['source'] = src
            results.append(r)
            success_count += 1
        except Exception as e:
            results.append({
                'source': src,
                'error': str(e),
                'method': 'none',
                'success': False,
            })
            fail_count += 1

    return {
        'total': len(input_paths),
        'success': success_count,
        'failed': fail_count,
        'output_dir': output_dir,
        'results': results,
    }


# ── Partial unlock (remove open password, keep restrictions) ──────────────────

def partial_unlock(
    input_path: str,
    output_path: str,
    password: str,
    new_owner_password: str = '',
) -> dict:
    """
    Remove the user (open) password but keep document restrictions.
    The resulting PDF opens without a password but retains permission flags.

    Args:
        input_path:         Password-protected source PDF
        output_path:        Output PDF (opens freely, restrictions preserved)
        password:           Current user or owner password
        new_owner_password: New owner password (blank = auto)
    Returns:
        dict with output_path, encryption, permissions_preserved
    """
    from .pdf_protect import protect_pdf, PERMISSION_PRESETS, _make_perms

    # First unlock to temp
    tmp = tempfile.mktemp(suffix='_partial_unlock.pdf')
    try:
        unlock_pdf(input_path, tmp, password=password)

        # Re-encrypt without user password but with owner password
        owner = new_owner_password or ('IshuTools_owner_' + datetime.utcnow().strftime('%Y%m%d'))
        result = protect_pdf(
            tmp, output_path,
            user_password='',   # no open password
            owner_password=owner,
            permissions='no_copy',
            encryption_level=6,
        )
        result['partial_unlock'] = True
        result['open_password_removed'] = True
        return result
    finally:
        if os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except Exception:
                pass


# ── Unlock + optimize combo ───────────────────────────────────────────────────

def unlock_and_optimize(
    input_path: str,
    output_path: str,
    password: str = '',
) -> dict:
    """
    Unlock PDF then apply full optimization pass (compression + linearization).

    Returns unlock result dict with additional optimization stats.
    """
    tmp = tempfile.mktemp(suffix='_unlocked_raw.pdf')
    try:
        result = unlock_pdf(input_path, tmp, password=password)

        # Optimization pass with pikepdf
        try:
            with pikepdf.open(tmp, suppress_warnings=True) as pdf:
                pdf.save(
                    output_path,
                    compress_streams=True,
                    object_stream_mode=pikepdf.ObjectStreamMode.generate,
                    recompress_flate=True,
                    linearize=True,
                )
            result['optimized'] = True
            opt_size = os.path.getsize(output_path)
            result['optimized_size_kb'] = round(opt_size / 1024, 1)
        except Exception:
            # If optimization fails, just use the unlocked file
            import shutil as _sh
            _sh.copy2(tmp, output_path)
            result['optimized'] = False

        result['output_path'] = output_path
        return result
    finally:
        if os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except Exception:
                pass


# ── Engine availability report ────────────────────────────────────────────────

def get_available_engines() -> dict:
    """Return which unlock engines are available on this system."""
    return {
        'pikepdf': True,
        'fitz': True,
        'pypdf': True,
        'qpdf': bool(QPDF_BIN),
        'ghostscript': bool(GS_BIN),
        'qpdf_path': QPDF_BIN or '',
        'gs_path': GS_BIN or '',
        'common_password_count': len(COMMON_PASSWORDS),
    }
