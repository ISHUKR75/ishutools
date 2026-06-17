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
    # ── Blank / empty (try first — owner-password-only PDFs open without user pw)
    '', ' ', '  ',

    # ── Most common worldwide passwords ──────────────────────────────────────
    'password', 'Password', 'PASSWORD',
    'pass', 'Pass', 'PASS',
    '123456', '1234', '12345', '123456789', '12345678',
    'qwerty', 'qwerty123', 'Qwerty', 'QWERTY',
    'abc123', 'Abc123', 'ABC123',
    'letmein', 'dragon', 'master', 'Master', 'MASTER',
    'welcome', 'Welcome', 'WELCOME',
    'monkey', 'shadow', 'sunshine', 'princess', 'iloveyou',
    'football', 'baseball', 'trustno1', 'superman', 'batman',
    'hello', 'Hello', 'HELLO',
    'secret', 'Secret', 'SECRET',
    'admin', 'Admin', 'ADMIN',
    'administrator', 'root', 'ROOT',
    'test', 'Test', 'TEST',
    'demo', 'Demo', 'DEMO',
    'user', 'User', 'USER',
    'guest', 'Guest', 'GUEST',
    'login', 'Login', 'LOGIN',

    # ── Digit-only sequences ──────────────────────────────────────────────────
    '0000', '00000', '000000',
    '1111', '11111', '111111',
    '2222', '22222', '222222',
    '3333', '33333', '333333',
    '4444', '44444', '444444',
    '5555', '55555', '555555',
    '6666', '66666', '666666',
    '7777', '77777', '777777',
    '8888', '88888', '888888',
    '9999', '99999', '999999',
    '123123', '321321', '112233', '123321',
    '1234567', '12345678', '123456789', '1234567890',
    '0987', '9876', '8765', '7654', '6543', '5432', '4321',
    '2580', '1470', '3690', '7410', '8520', '9630',
    '1212', '2121', '1313', '3131', '1414', '4141',
    '1122', '2211', '1221', '2112',
    '1357', '2468', '1379', '2460',
    '159753', '123789', '147258', '357159', '951753',
    '1001', '2002', '3003', '4004', '5005',
    '1010', '0101', '2020', '3030',
    '1969', '1984', '2000', '2001', '2010',

    # ── Years: 1980-2026 (very common PDF passwords) ──────────────────────────
    '1980', '1981', '1982', '1983', '1984', '1985', '1986', '1987',
    '1988', '1989', '1990', '1991', '1992', '1993', '1994', '1995',
    '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003',
    '2004', '2005', '2006', '2007', '2008', '2009', '2010', '2011',
    '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019',
    '2020', '2021', '2022', '2023', '2024', '2025', '2026',

    # ── Date-based passwords (DDMMYYYY, MMDDYYYY, YYYYMMDD patterns) ──────────
    '01012000', '01011990', '01012024', '31122023', '01012023',
    '01011980', '01011970', '01012010', '01012015', '01012020',
    '1jan2000', '1jan2024', 'jan2024', 'Jan2024', 'jan2023',

    # ── PDF and document specific ─────────────────────────────────────────────
    'pdf', 'PDF', 'Pdf',
    'document', 'Document', 'DOCUMENT',
    'doc', 'Doc', 'DOC',
    'file', 'File', 'FILE',
    'open', 'Open', 'OPEN',
    'adobe', 'Adobe', 'ADOBE',
    'acrobat', 'Acrobat', 'ACROBAT',
    'reader', 'Reader', 'READER',
    'pdf123', 'PDF123', 'doc123', 'file123',
    'mypdf', 'myfile', 'mydoc',

    # ── Security / access words ───────────────────────────────────────────────
    'owner', 'Owner', 'OWNER',
    'locked', 'Locked', 'LOCKED',
    'protected', 'Protected', 'PROTECTED',
    'confidential', 'Confidential', 'CONFIDENTIAL',
    'private', 'Private', 'PRIVATE',
    'secure', 'Secure', 'SECURE',
    'internal', 'Internal', 'INTERNAL',
    'restricted', 'Restricted',
    'classified', 'Classified',
    'encrypt', 'Encrypt', 'encrypted',

    # ── Office / enterprise ───────────────────────────────────────────────────
    'company', 'Company', 'COMPANY',
    'office', 'Office', 'OFFICE',
    'work', 'Work', 'WORK',
    'business', 'Business', 'BUSINESS',
    'project', 'Project', 'PROJECT',
    'report', 'Report', 'REPORT',
    'invoice', 'Invoice', 'INVOICE',
    'contract', 'Contract', 'CONTRACT',
    'proposal', 'Proposal',
    'finance', 'Finance', 'financial',
    'hr', 'HR', 'legal', 'Legal',
    'sales', 'Sales', 'marketing', 'Marketing',

    # ── Common password variations ────────────────────────────────────────────
    'passw0rd', 'Passw0rd', 'PASSW0RD',
    'p@ssword', 'P@ssword', 'P@SSWORD',
    'p@ssw0rd', 'P@ssw0rd',
    'pa$$word', 'Pa$$word',
    'password1', 'Password1', 'password12', 'password123',
    'password!', 'password@', 'password#',
    'pass123', 'Pass123', 'PASS123',
    'pass1234', 'Pass1234',
    'pass@123', 'Pass@123', 'pass@1234',
    'admin123', 'Admin123', 'ADMIN123',
    'admin@123', 'Admin@123', 'admin@1234',
    'login123', 'Login123',
    'test123', 'Test123', 'TEST123',
    'user123', 'User123',
    'guest123', 'Guest123',
    'welcome1', 'welcome123', 'Welcome1', 'Welcome123',
    'welcome@123', 'Welcome@123',
    'changeme', 'changeme1', 'changeme123',
    'default', 'Default', 'DEFAULT',
    'temp', 'Temp', 'TEMP', 'temp123', 'Temp123',
    'abc', 'ABC', 'Abc', 'abcd', 'ABCD',
    '1234abcd', 'abcd1234', 'abcde12345',
    'qwer1234', '1234qwer', 'asdf1234',

    # ── Keyboard walk patterns ────────────────────────────────────────────────
    'qwertyui', 'qwertyuiop',
    'asdfgh', 'asdfghjk', 'asdfghjkl',
    'zxcvbn', 'zxcvbnm',
    '1qaz2wsx', '1q2w3e4r', '1q2w3e', 'q1w2e3r4',
    '!qaz@wsx', 'qazwsx', 'qazwsxedc',
    'zaq12wsx', '!QAZ2wsx',

    # ── Indian / South Asian common passwords ────────────────────────────────
    'india', 'India', 'INDIA',
    'bharat', 'Bharat', 'BHARAT',
    'india123', 'India123', 'India@123', 'india@123', 'india@1234',
    'bharat123', 'Bharat@123',
    'ishu', 'Ishu', 'ISHU',
    'ishu123', 'Ishu123', 'ishu@123',
    'ram', 'Ram', 'ravi', 'Ravi',
    'raj', 'Raj', 'kumar', 'Kumar',
    'sharma', 'Sharma', 'gupta', 'Gupta',
    'singh', 'Singh', 'patel', 'Patel',
    'shah', 'Shah', 'mehta', 'Mehta',
    'delhi', 'Delhi', 'mumbai', 'Mumbai',
    'chennai', 'Chennai', 'kolkata', 'Kolkata',
    'bengaluru', 'Bengaluru', 'hyderabad', 'Hyderabad',
    'namaste', 'Namaste', 'namaskar',
    'ganesh', 'Ganesh', 'shiva', 'Shiva', 'krishna', 'Krishna',

    # ── Common first names (global) ───────────────────────────────────────────
    'john', 'John', 'JOHN',
    'jane', 'Jane', 'JANE',
    'mike', 'Mike', 'MIKE',
    'james', 'James', 'JAMES',
    'david', 'David', 'DAVID',
    'alex', 'Alex', 'ALEX',
    'sarah', 'Sarah', 'SARAH',
    'anna', 'Anna', 'ANNA',
    'emma', 'Emma', 'EMMA',
    'michael', 'Michael', 'MICHAEL',
    'peter', 'Peter', 'PETER',
    'robert', 'Robert', 'ROBERT',
    'lisa', 'Lisa', 'LISA',
    'mary', 'Mary', 'MARY',
    'chris', 'Chris', 'CHRIS',
    'daniel', 'Daniel', 'DANIEL',

    # ── Symbol variants (short) ───────────────────────────────────────────────
    'pass!', 'pass@', 'pass#', 'pass$',
    'admin!', 'admin@', 'admin#',
    '123!', '1234!', '12345!', '123456!',
    '123@', '1234@', '12345@',

    # ── Leet-speak variants ───────────────────────────────────────────────────
    's3cr3t', 'p4ssw0rd', '4dm1n', 'p@$$w0rd',
    'l3tm31n', 'h3ll0', 'w3lc0me',

    # ── Short brute patterns ──────────────────────────────────────────────────
    'aaa', 'bbb', 'ccc', 'zzz', 'aaaaaa', 'bbbbbb',
    '111', '222', '333', '444', '555', '666', '777', '888', '999',
    'aa', 'bb', 'cc', 'ab', 'xy', 'ok', 'no',
    'a', 'b', '1', '0',
]


# ── PIN brute-force generator ─────────────────────────────────────────────────

def _generate_4digit_pins() -> list:
    """Generate all 4-digit numeric PINs: 0000-9999 (10 000 candidates)."""
    return [f'{i:04d}' for i in range(10000)]


def _generate_common_6digit_pins() -> list:
    """Generate the most common 6-digit PINs (sequential, repeating, etc.)."""
    pins = []
    # Sequential
    for start in range(10):
        pins.append(''.join(str((start + i) % 10) for i in range(6)))
    # Repeating pairs
    for d in range(10):
        pins.append(str(d) * 6)
        pins.append(str(d) * 3 + str(d) * 3)
    # Common phone/DOB formats
    for y in range(1980, 2027):
        pins.append(f'01{str(y)[2:]}')    # 0124 etc.
        pins.append(str(y)[2:] + '00')
    # Top 50 most-used 6-digit PINs
    top_6 = [
        '123456', '000000', '111111', '121212', '654321', '123123',
        '159753', '123789', '147258', '357159', '951753', '456789',
        '321654', '987654', '246810', '135790', '112233', '998877',
        '223344', '334455', '445566', '556677', '667788', '778899',
        '889900', '100000', '200000', '300000', '400000', '500000',
        '600000', '700000', '800000', '900000', '010101', '020202',
        '030303', '040404', '050505', '060606', '070707', '080808',
        '090909', '001100', '110011', '010010', '100100', '001001',
        '012345', '543210',
    ]
    pins.extend(top_6)
    return list(dict.fromkeys(pins))


def _generate_year_date_passwords() -> list:
    """Generate date-based password candidates (DDMMYYYY, MMDDYYYY, etc.)."""
    passwords = []
    for year in range(1970, 2027):
        ys = str(year)
        passwords.extend([
            ys,                        # 2024
            f'01{ys}',                  # 012024
            f'0101{ys}',               # 01012024
            f'{ys}01',                 # 202401
            f'{ys}0101',               # 20240101
            ys[2:],                    # 24
            f'1{ys[2:]}',              # 124
            f'pass{ys}',               # pass2024
            f'Pass{ys}',               # Pass2024
            f'admin{ys}',              # admin2024
            f'pdf{ys}',                # pdf2024
        ])
    return list(dict.fromkeys(passwords))


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
    try_common_passwords: bool = True,
    optimize: bool = True,
    repair: bool = False,
    brute_force_level: str = 'medium',
) -> dict:
    """
    Remove password encryption from a PDF using 5 cascading engines.

    Args:
        input_path:            Password-protected PDF
        output_path:           Unlocked output PDF
        password:              Known password (user or owner)
        try_common_passwords:  Brute-force with common-password dictionary
        optimize:              Apply deflate + object-stream optimization after unlock
        repair:                Attempt structural repair (pikepdf attempt_recovery)
        brute_force_level:     'quick' (50 passwords) | 'medium' (full dictionary,
                               500+ passwords) | 'deep' (medium + all 4-digit PINs,
                               ~10 500 candidates) | 'max' (deep + 6-digit PINs +
                               date patterns, ~12 000+ candidates)
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
    seen_pw = set()
    passwords_to_try = []

    def _add_pw(p):
        if p not in seen_pw:
            seen_pw.add(p)
            passwords_to_try.append(p)

    # Priority 1: user-supplied password and its variants (always first)
    if password:
        for v in _password_variants(password):
            _add_pw(v)

    # Priority 2: dictionary / brute-force
    level = brute_force_level.lower() if brute_force_level else 'medium'

    if level == 'quick':
        # First 50 most-common entries
        for p in COMMON_PASSWORDS[:50]:
            _add_pw(p)

    elif level == 'medium' or try_common_passwords:
        # Full common-password dictionary (500+ entries)
        for p in COMMON_PASSWORDS:
            _add_pw(p)

    elif level == 'none':
        # Only user-supplied password + empty string
        _add_pw('')

    else:
        # If not quick/medium/none, still do the full dictionary
        for p in COMMON_PASSWORDS:
            _add_pw(p)

    # Priority 3: ALL 4-digit PINs (level=deep or max)
    if level in ('deep', 'max'):
        for p in _generate_4digit_pins():
            _add_pw(p)

    # Priority 4: 6-digit PINs + date patterns (level=max only)
    if level == 'max':
        for p in _generate_common_6digit_pins():
            _add_pw(p)
        for p in _generate_year_date_passwords():
            _add_pw(p)

    # Always ensure empty string is in the list (owner-only PDFs open without pw)
    _add_pw('')

    log.append(f'Trying {len(passwords_to_try)} password candidates (level={level})')

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


# ── Additional Unlock & Security Functions ─────────────────────────────────────


def get_encryption_details(pdf_path: str, password: str = '') -> dict:
    """
    Get detailed encryption and permission information for a PDF.

    Returns encryption algorithm, key length, version, and all permissions.

    Args:
        pdf_path: Path to PDF file
        password: Password to test (optional)

    Returns:
        dict: is_encrypted, encryption_method, key_length, permissions,
              pdf_version, can_open_without_password
    """
    result = {
        'is_encrypted': False,
        'encryption_method': 'none',
        'key_length': 0,
        'permissions': {},
        'pdf_version': '',
        'can_open_without_password': True,
    }

    try:
        with pikepdf.open(pdf_path, password=password or '') as pdf:
            result['is_encrypted'] = pdf.is_encrypted
            result['pdf_version'] = str(pdf.pdf_version)

            if pdf.is_encrypted:
                enc = pdf.encryption
                result['encryption_method'] = getattr(enc, 'method', 'RC4')
                result['key_length'] = getattr(enc, 'keylen', 128)

                try:
                    perms = pdf.allow
                    result['permissions'] = {
                        'print': getattr(perms, 'print_highres', True),
                        'print_lowres': getattr(perms, 'print_lowres', True),
                        'copy': getattr(perms, 'extract', True),
                        'modify': getattr(perms, 'modify_other', True),
                        'annotate': getattr(perms, 'modify_annotation', True),
                        'fill_forms': getattr(perms, 'fill_forms', True),
                        'accessibility': getattr(perms, 'accessibility', True),
                        'assemble': getattr(perms, 'assemble', True),
                    }
                except Exception:
                    result['permissions'] = {}

    except pikepdf.PasswordError:
        result['is_encrypted'] = True
        result['can_open_without_password'] = False
    except Exception as e:
        result['error'] = str(e)

    return result


def unlock_and_optimize(input_path: str, output_path: str,
                         password: str = '',
                         compress: bool = True) -> dict:
    """
    Unlock a PDF (remove password protection) and optionally compress it.

    Combines unlock + compression in one step for efficiency.

    Args:
        input_path:  Source encrypted PDF
        output_path: Output unlocked (and optionally compressed) PDF
        password:    PDF password
        compress:    Apply pikepdf compression pass after unlocking

    Returns:
        dict: unlocked, pages, original_size_kb, final_size_kb, reduction_pct
    """
    import os, tempfile

    tmp_unlocked = output_path + '.unlocked_tmp'

    try:
        # Step 1: Unlock
        result = unlock_pdf(input_path, tmp_unlocked, password=password)
        if not result.get('unlocked'):
            return result

        if not compress:
            os.rename(tmp_unlocked, output_path)
            return result

        # Step 2: Compress with pikepdf
        orig_size = os.path.getsize(tmp_unlocked) / 1024
        with pikepdf.open(tmp_unlocked) as pdf:
            pdf.save(output_path,
                     compress_streams=True,
                     object_stream_mode=pikepdf.ObjectStreamMode.generate,
                     recompress_flate=True)
        final_size = os.path.getsize(output_path) / 1024
        reduction = (1 - final_size / orig_size) * 100 if orig_size > 0 else 0

        os.remove(tmp_unlocked)

        result['original_size_kb'] = round(orig_size, 1)
        result['final_size_kb'] = round(final_size, 1)
        result['compression_reduction_pct'] = round(reduction, 1)
        return result

    except Exception as e:
        logger.warning(f'unlock_and_optimize failed: {e}')
        if os.path.exists(tmp_unlocked):
            os.remove(tmp_unlocked)
        raise
