"""
IshuTools.fun - Main Flask Application
Professional PDF Tools Suite — 36+ Tools
Author: Ishu Kumar (GitHub: ISHUKR41 / ISHUKR75)
Domain: ishutools.fun
"""

import os
import uuid
import json
import queue
import threading
import time
from pathlib import Path
import tempfile
import logging
from flask import Flask, request, jsonify, send_file, send_from_directory, Response, stream_with_context
from flask_cors import CORS
from werkzeug.utils import secure_filename
from werkzeug.exceptions import RequestEntityTooLarge

# ── SSE Progress store ────────────────────────────────────────────────────────
_progress_queues: dict = {}   # job_id → queue.Queue
_progress_lock = threading.Lock()

def _get_or_create_queue(job_id: str) -> queue.Queue:
    with _progress_lock:
        if job_id not in _progress_queues:
            _progress_queues[job_id] = queue.Queue(maxsize=120)
        return _progress_queues[job_id]

def _push_progress(job_id: str, pct: int, title: str = '', sub: str = '', done: bool = False):
    if not job_id:
        return
    try:
        q = _get_or_create_queue(job_id)
        msg = {'pct': pct, 'title': title, 'sub': sub, 'done': done}
        try:
            q.put_nowait(msg)
        except queue.Full:
            pass
    except Exception:
        pass

def _cleanup_queue(job_id: str):
    with _progress_lock:
        _progress_queues.pop(job_id, None)

# ── Import all tool modules ──────────────────────────────────────────────────
from tools.pdf_merge        import merge_pdfs
from tools.pdf_split        import split_pdf
from tools.pdf_compress     import compress_pdf
from tools.pdf_rotate       import rotate_pdf
from tools.pdf_watermark    import add_watermark
from tools.pdf_page_numbers import add_page_numbers
from tools.pdf_remove_pages import remove_pages
from tools.pdf_extract_pages import extract_pages
from tools.pdf_organize     import organize_pdf
from tools.pdf_repair       import repair_pdf
from tools.pdf_ocr          import ocr_pdf
from tools.pdf_optimize     import optimize_pdf
from tools.pdf_unlock       import unlock_pdf
from tools.pdf_protect      import protect_pdf
from tools.pdf_sign         import sign_pdf
from tools.pdf_redact       import redact_pdf
from tools.pdf_compare      import compare_pdfs
from tools.pdf_summarize    import summarize_pdf
from tools.pdf_translate    import translate_pdf
from tools.img_to_pdf       import images_to_pdf
from tools.pdf_to_img       import pdf_to_images
from tools.pdf_to_word      import pdf_to_word
from tools.word_to_pdf      import word_to_pdf
from tools.pdf_to_excel     import pdf_to_excel
from tools.excel_to_pdf     import excel_to_pdf
from tools.pdf_to_pptx      import pdf_to_pptx
from tools.pptx_to_pdf      import pptx_to_pdf
from tools.html_to_pdf      import html_to_pdf
from tools.pdf_crop         import crop_pdf
from tools.pdf_scan         import scan_to_pdf
from tools.pdf_to_pdfa      import pdf_to_pdfa
from tools.pdf_edit         import edit_pdf
from tools.pdf_forms        import fill_pdf_form

# ── App Configuration ────────────────────────────────────────────────────────
app = Flask(
    __name__,
    static_folder=os.path.join(os.path.dirname(__file__), '..', 'frontend', 'static'),
    static_url_path='/static'
)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Max upload: 1 GB
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024

# Temp directories for file processing
UPLOAD_FOLDER = tempfile.mkdtemp()
OUTPUT_FOLDER = tempfile.mkdtemp()
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['OUTPUT_FOLDER'] = OUTPUT_FOLDER

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
logger = logging.getLogger(__name__)

# Frontend directory
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), '..', 'frontend')
TOOLS_DIR    = os.path.join(FRONTEND_DIR, 'tools')

# ── Helper Functions ─────────────────────────────────────────────────────────

def save_uploaded_file(file_obj, suffix='.pdf'):
    """Save an uploaded file to temp dir and return its path."""
    filename = secure_filename(file_obj.filename) or ('upload' + suffix)
    uid  = str(uuid.uuid4())[:8]
    path = os.path.join(UPLOAD_FOLDER, f"{uid}_{filename}")
    file_obj.save(path)
    return path

def file_stem(file_obj, default='output'):
    """Extract the original filename stem (without extension) for smart download names."""
    if file_obj and file_obj.filename:
        name = secure_filename(file_obj.filename)
        return Path(name).stem or default
    return default

def save_uploaded_files(files_list, suffix='.pdf'):
    """Save multiple uploaded files and return list of paths."""
    return [save_uploaded_file(f, suffix) for f in files_list]

def output_path(filename):
    """Generate a unique output file path."""
    uid = str(uuid.uuid4())[:8]
    return os.path.join(OUTPUT_FOLDER, f"{uid}_{filename}")

def send_result(path, download_name=None, mimetype='application/pdf'):
    """Send a processed file as a download attachment."""
    name = download_name or os.path.basename(path)
    return send_file(path, as_attachment=True, download_name=name, mimetype=mimetype)

def error_response(msg, code=400):
    """Return a JSON error response."""
    return jsonify({'success': False, 'error': str(msg)}), code

# ── Large-file error handler ─────────────────────────────────────────────────
@app.errorhandler(RequestEntityTooLarge)
def handle_too_large(e):
    return error_response('File too large. Maximum upload size is 1 GB.', 413)

# ══════════════════════════════════════════════════════════════════════════════
# FRONTEND ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/')
def index():
    """Serve the main homepage."""
    return send_from_directory(FRONTEND_DIR, 'index.html')

TOOL_REDIRECTS = {
    'ai-summarizer': 'summarize-pdf',
}

@app.route('/tools/<tool_name>/')
@app.route('/tools/<tool_name>')
def tool_page(tool_name):
    """Serve individual tool pages (each tool has its own folder)."""
    # Permanent redirects for renamed tools
    if tool_name in TOOL_REDIRECTS:
        from flask import redirect
        return redirect(f'/tools/{TOOL_REDIRECTS[tool_name]}/', code=301)
    tool_folder = os.path.join(TOOLS_DIR, tool_name)
    index_file  = os.path.join(tool_folder, 'index.html')
    if os.path.exists(index_file):
        return send_from_directory(tool_folder, 'index.html')
    # Fallback: redirect to homepage if tool not found
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/tools/<tool_name>/<path:filename>')
def tool_static(tool_name, filename):
    """Serve static files (CSS/JS) belonging to a tool page."""
    tool_folder = os.path.join(TOOLS_DIR, tool_name)
    return send_from_directory(tool_folder, filename)

@app.route('/sitemap.xml')
def sitemap():
    """Serve the SEO sitemap."""
    return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'seo'), 'sitemap.xml')

@app.route('/sitemap-tools.xml')
def sitemap_tools():
    """Serve the tools-specific SEO sitemap."""
    return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'seo'), 'sitemap-tools.xml',
                               mimetype='application/xml')

@app.route('/sitemap-merge-pdf.xml')
def sitemap_merge_pdf():
    """Serve the dedicated merge-pdf SEO sitemap."""
    return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'seo'), 'sitemap-merge-pdf.xml',
                               mimetype='application/xml')

@app.route('/sitemap-index.xml')
def sitemap_index():
    """Serve the sitemap index."""
    return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'seo'), 'sitemap-index.xml',
                               mimetype='application/xml')

@app.route('/ishu-kumar/')
@app.route('/ishu-kumar')
def ishu_kumar_page():
    """Serve the Ishu Kumar author / entity page — for Google Knowledge Graph."""
    ishu_dir = os.path.join(FRONTEND_DIR, 'ishu-kumar')
    return send_from_directory(ishu_dir, 'index.html')

@app.route('/robots.txt')
def robots():
    """Serve robots.txt for SEO crawlers."""
    return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'seo'), 'robots.txt')

# ── Health Check ─────────────────────────────────────────────────────────────
@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'service': 'IshuTools PDF Suite', 'version': '3.0', 'tools': 36})

# ══════════════════════════════════════════════════════════════════════════════
# ─────────────── ORGANIZE PDF TOOLS ─────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/merge-pdf', methods=['POST'])
def api_merge_pdf():
    """Merge multiple PDFs + images into one combined document with advanced options."""
    try:
        files = request.files.getlist('files')
        if len(files) < 2:
            return error_response('Please upload at least 2 files.')

        import json as _json
        from tools.pdf_merge import convert_image_to_pdf_file

        # Image extensions supported
        IMAGE_EXTS = {'.jpg','.jpeg','.png','.webp','.gif','.bmp','.tiff','.tif'}

        add_separators   = request.form.get('add_separators', 'false').lower() == 'true'
        add_toc          = request.form.get('add_toc', 'false').lower() == 'true'
        skip_duplicates  = request.form.get('skip_duplicates', 'false').lower() == 'true'
        preserve_bmarks  = request.form.get('preserve_bookmarks', 'true').lower() == 'true'
        normalize_size   = request.form.get('normalize_page_size', 'false').lower() == 'true'
        target_size      = request.form.get('target_page_size', 'A4')
        compress_out     = request.form.get('compress_output', 'false').lower() == 'true'
        linearize_out    = request.form.get('linearize', 'false').lower() == 'true'
        merge_method     = request.form.get('merge_method', 'auto')
        out_title        = request.form.get('output_title', '')
        out_author       = request.form.get('output_author', '')
        out_filename_req = request.form.get('output_filename', '')

        try:
            page_ranges_raw = request.form.get('page_ranges', '[]')
            page_ranges = _json.loads(page_ranges_raw) if page_ranges_raw else []
        except Exception:
            page_ranges = []

        try:
            passwords_raw = request.form.get('passwords', '[]')
            passwords = _json.loads(passwords_raw) if passwords_raw else []
        except Exception:
            passwords = []

        try:
            display_names_raw = request.form.get('display_names', '[]')
            display_names = _json.loads(display_names_raw) if display_names_raw else []
        except Exception:
            display_names = []

        try:
            file_types_raw = request.form.get('file_types', '[]')
            file_types = _json.loads(file_types_raw) if file_types_raw else []
        except Exception:
            file_types = []

        # Grab SSE job_id for real-time progress
        job_id = request.form.get('job_id', '').strip()[:64]
        def push(pct, title='', sub=''):
            _push_progress(job_id, pct, title, sub)

        push(8, 'Uploading…', f'Received {len(files)} file{"s" if len(files)!=1 else ""}')

        # Save all uploaded files first
        paths = save_uploaded_files(files)
        push(18, 'Processing files…', 'Checking formats and converting images')

        # Pre-convert any image files to PDF
        converted_paths = []
        for i, (path, f) in enumerate(zip(paths, files)):
            fn = secure_filename(f.filename or '')
            suf = os.path.splitext(fn)[1].lower()
            ftype = file_types[i] if i < len(file_types) else 'pdf'
            if suf in IMAGE_EXTS or ftype == 'img':
                try:
                    pdf_path = path + '_img2pdf.pdf'
                    convert_image_to_pdf_file(path, pdf_path)
                    converted_paths.append(pdf_path)
                    logger.info(f'Converted image {fn} → PDF for merge')
                except Exception as img_e:
                    logger.warning(f'Image conversion failed for {fn}: {img_e}')
                    converted_paths.append(path)
            else:
                converted_paths.append(path)
        paths = converted_paths
        push(28, 'Merging…', 'Combining documents')

        # Pad lists to match file count
        while len(page_ranges) < len(paths):
            page_ranges.append('all')
        while len(passwords) < len(paths):
            passwords.append(None)
        while len(display_names) < len(paths):
            display_names.append(None)

        out = output_path('merged.pdf')

        output_metadata = {}
        if out_title:
            output_metadata['title'] = out_title
        if out_author:
            output_metadata['author'] = out_author

        # Build per-file progress callback for merge_pdfs
        n_files = len(paths)
        def file_progress_cb(file_idx, file_name):
            pct = 28 + int((file_idx / max(n_files, 1)) * 45)
            push(pct, 'Merging…', f'Processing file {file_idx+1}/{n_files}: {file_name[:40]}')

        # Choose merge method
        if merge_method == 'gs':
            push(32, 'Merging…', 'Using Ghostscript engine')
            from tools.pdf_merge import merge_pdfs_gs
            result = merge_pdfs_gs(paths, out)
        elif merge_method == 'fitz':
            push(32, 'Merging…', 'Using PyMuPDF engine')
            from tools.pdf_merge import merge_pdfs_fitz
            result = merge_pdfs_fitz(paths, out, passwords=passwords, page_ranges=page_ranges)
        else:
            result = merge_pdfs(
                paths, out,
                passwords=passwords,
                page_ranges=page_ranges,
                add_separators=add_separators,
                add_toc=add_toc,
                skip_duplicates=skip_duplicates,
                preserve_bookmarks=preserve_bmarks,
                normalize_page_size=normalize_size,
                target_page_size=target_size,
                compress_output=compress_out,
                output_metadata=output_metadata if output_metadata else None,
                file_names=display_names if display_names else None,
                progress_cb=file_progress_cb,
            )

        push(78, 'Optimizing…', 'Finalizing output PDF')

        # Optional linearization for web-optimized viewing (fast open in browser)
        if linearize_out:
            try:
                import pikepdf
                lin_out = out + '.linear.pdf'
                with pikepdf.open(out, suppress_warnings=True) as pdf:
                    pdf.save(lin_out, linearize=True, compress_streams=True)
                if os.path.exists(lin_out) and os.path.getsize(lin_out) > 0:
                    os.replace(lin_out, out)
                    result['linearized'] = True
                    result['method_used'] = result.get('method_used', 'pypdf') + '+linearized'
            except Exception as lin_e:
                logger.warning(f'Linearization failed (non-fatal): {lin_e}')

        push(92, 'Almost done…', 'Preparing download')

        # Download name — prefer client-requested, fall back to first file's stem
        if out_filename_req:
            safe = secure_filename(out_filename_req)
            if not safe.lower().endswith('.pdf'):
                safe += '.pdf'
            download_name = safe or 'merged.pdf'
        else:
            # Use first file's stem only (as client smartOutputFilename does)
            download_name = file_stem(files[0]) + '_merged.pdf'

        push(98, 'Done!', 'Download ready')
        _push_progress(job_id, 100, 'Done!', 'Merge complete', done=True)
        resp = send_result(out, download_name)
        out_size = os.path.getsize(out)
        resp.headers['X-Total-Pages']       = str(result.get('total_pages', 0))
        resp.headers['X-Source-Count']      = str(result.get('source_count', len(files)))
        resp.headers['X-Skipped-Dupes']     = str(result.get('skipped_duplicates', 0))
        resp.headers['X-TOC-Added']         = str(result.get('toc_added', False))
        resp.headers['X-Method-Used']       = str(result.get('method_used', 'pypdf'))
        resp.headers['X-Output-Size']       = str(out_size)
        resp.headers['X-Linearized']        = str(result.get('linearized', False))

        # Quality score — result already contains score/grade from merge_pdfs()
        qs_score = result.get('quality_score', 100)
        qs_grade = result.get('quality_grade', 'A+')
        if not qs_score or qs_score == 100:
            try:
                from tools.pdf_merge import estimate_merge_quality_score
                in_bytes = sum(os.path.getsize(p) for p in paths if os.path.exists(p))
                qs_score, qs_grade = estimate_merge_quality_score(result, in_bytes)
            except Exception:
                qs_score, qs_grade = 100, 'A+'
        resp.headers['X-Quality-Score'] = str(qs_score)
        resp.headers['X-Quality-Grade'] = str(qs_grade)

        resp.headers['Access-Control-Expose-Headers'] = (
            'X-Total-Pages,X-Source-Count,X-Skipped-Dupes,X-TOC-Added,'
            'X-Method-Used,X-Output-Size,X-Linearized,X-Quality-Score,X-Quality-Grade'
        )
        return resp
    except Exception as e:
        logger.exception("merge-pdf error")
        raw = str(e).lower()
        if 'password' in raw or 'encrypted' in raw or 'decrypt' in raw:
            msg = 'One or more PDFs are password-protected — expand the file card and enter the correct password.'
        elif 'corrupt' in raw or 'invalid' in raw or 'not a pdf' in raw or 'eoferror' in raw:
            msg = 'One or more files appear to be corrupt or not a valid PDF. Please check your files and try again.'
        elif 'memory' in raw or 'memoryerror' in raw:
            msg = 'Not enough server memory — try merging fewer or smaller files at a time.'
        elif 'timeout' in raw or 'timed out' in raw:
            msg = 'Merge timed out — your files may be too large. Try merging in smaller batches.'
        elif 'permission' in raw or 'access' in raw:
            msg = 'A file could not be read — it may be in use or have restricted permissions.'
        elif 'no pages' in raw or 'empty' in raw:
            msg = 'One or more files have no pages or are empty. Please check your files.'
        elif 'image' in raw and ('convert' in raw or 'pil' in raw or 'img2pdf' in raw):
            msg = 'Could not convert one of the images to PDF. Make sure the image is not corrupted.'
        else:
            msg = f'Merge failed — {str(e)[:180]}. Please check your files and try again.'
        return error_response(msg)


@app.route('/api/merge-pdf/progress/<job_id>')
def api_merge_progress(job_id):
    """SSE endpoint — real-time merge progress stream."""
    job_id = job_id[:64]  # sanitize length
    def generate():
        q = _get_or_create_queue(job_id)
        deadline = time.time() + 180  # 3-min max
        while time.time() < deadline:
            try:
                msg = q.get(timeout=1.5)
                yield f"data: {json.dumps(msg)}\n\n"
                if msg.get('done'):
                    break
            except queue.Empty:
                yield "data: {\"ping\":true}\n\n"
        _cleanup_queue(job_id)
    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*',
        }
    )


@app.route('/api/merge-pdf/info', methods=['POST'])
def api_merge_pdf_info():
    """Get PDF info (pages, size, metadata) for a single file — used for previews."""
    try:
        file = request.files.get('file')
        if not file:
            return error_response('No file provided.')
        password = request.form.get('password', '')
        path = save_uploaded_file(file)
        from tools.pdf_merge import get_pdf_info
        info = get_pdf_info(path, password=password)
        info['filename'] = secure_filename(file.filename)
        info['file_size'] = os.path.getsize(path)
        return jsonify({'success': True, 'info': info})
    except Exception as e:
        logger.exception("merge-pdf/info error")
        return error_response(str(e))


@app.route('/api/merge-pdf/validate', methods=['POST'])
def api_merge_pdf_validate():
    """
    Pre-merge validation: returns metadata, page count, warnings, form/annotation detection.
    Accepts a single file upload + optional password.
    """
    try:
        file = request.files.get('file')
        if not file:
            return error_response('No file provided.')
        password = request.form.get('password', '')
        path = save_uploaded_file(file)
        from tools.pdf_merge import validate_for_merge
        result = validate_for_merge(path, password=password)
        result['filename'] = secure_filename(file.filename)
        result['file_size'] = os.path.getsize(path)
        return jsonify({'success': True, **result})
    except Exception as e:
        logger.exception("merge-pdf/validate error")
        return error_response(str(e))


@app.route('/api/merge-pdf/thumbnail', methods=['POST'])
def api_merge_pdf_thumbnail():
    """
    Generate a server-side base64-encoded PNG thumbnail for a PDF page.
    Accepts: file, page (0-based), width, password.
    """
    try:
        file = request.files.get('file')
        if not file:
            return error_response('No file provided.')
        password = request.form.get('password', '')
        page     = int(request.form.get('page', 0))
        width    = min(int(request.form.get('width', 280)), 600)
        path     = save_uploaded_file(file)
        from tools.pdf_merge import generate_thumbnail_b64
        b64 = generate_thumbnail_b64(path, page_num=page, password=password, width=width)
        if b64:
            return jsonify({'success': True, 'thumbnail': b64, 'page': page})
        return jsonify({'success': False, 'error': 'Thumbnail generation failed'})
    except Exception as e:
        logger.exception("merge-pdf/thumbnail error")
        return error_response(str(e))

@app.route('/api/split-pdf', methods=['POST'])
def api_split_pdf():
    """Split a PDF into pages or custom ranges."""
    try:
        file = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        split_mode = request.form.get('mode', 'all')   # all | range | every_n
        ranges     = request.form.get('ranges', '')
        every_n    = int(request.form.get('every_n', 1))
        stem = file_stem(file)
        path       = save_uploaded_file(file)
        out_dir    = tempfile.mkdtemp()
        result_zip = output_path('split_pages.zip')
        split_pdf(path, out_dir, result_zip, mode=split_mode, ranges=ranges, every_n=every_n)
        return send_result(result_zip, f'{stem}_split.zip', 'application/zip')
    except Exception as e:
        logger.exception("split-pdf error")
        return error_response(str(e))

@app.route('/api/compress-pdf', methods=['POST'])
def api_compress_pdf():
    """Compress and reduce PDF file size."""
    try:
        file    = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        quality = request.form.get('quality', 'medium')
        stem = file_stem(file)
        path    = save_uploaded_file(file)
        out     = output_path('compressed.pdf')
        original_size = os.path.getsize(path)
        compress_pdf(path, out, quality=quality)
        new_size = os.path.getsize(out)
        resp = send_result(out, f'{stem}_compressed.pdf')
        resp.headers['X-Original-Size']  = str(original_size)
        resp.headers['X-Compressed-Size'] = str(new_size)
        reduction = round((original_size - new_size) / max(original_size, 1) * 100, 1)
        resp.headers['X-Reduction']      = f"{reduction}%"
        resp.headers['Access-Control-Expose-Headers'] = 'X-Original-Size,X-Compressed-Size,X-Reduction'
        return resp
    except Exception as e:
        logger.exception("compress-pdf error")
        return error_response(str(e))

@app.route('/api/remove-pages', methods=['POST'])
def api_remove_pages():
    """Remove specific pages from a PDF."""
    try:
        file  = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        pages = request.form.get('pages', '')
        if not pages:
            return error_response('Please specify pages to remove (e.g. 1,3,5-8).')
        stem  = file_stem(file)
        path  = save_uploaded_file(file)
        out   = output_path('pages_removed.pdf')
        remove_pages(path, out, page_selector=pages)
        return send_result(out, f'{stem}_pages_removed.pdf')
    except Exception as e:
        logger.exception("remove-pages error")
        return error_response(str(e))

@app.route('/api/extract-pages', methods=['POST'])
def api_extract_pages():
    """Extract specific pages to a new PDF."""
    try:
        file  = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        pages = request.form.get('pages', '')
        if not pages:
            return error_response('Please specify pages to extract (e.g. 1,3,5-8).')
        stem  = file_stem(file)
        path  = save_uploaded_file(file)
        out   = output_path('extracted.pdf')
        extract_pages(path, out, pages=pages)
        return send_result(out, f'{stem}_extracted.pdf')
    except Exception as e:
        logger.exception("extract-pages error")
        return error_response(str(e))

@app.route('/api/organize-pdf', methods=['POST'])
def api_organize_pdf():
    """Reorder pages in a PDF by a given order string."""
    try:
        file  = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        order = request.form.get('order', '')
        if not order:
            return error_response('Please specify the new page order (e.g. 3,1,2).')
        stem  = file_stem(file)
        path  = save_uploaded_file(file)
        out   = output_path('organized.pdf')
        organize_pdf(path, out, order=order)
        return send_result(out, f'{stem}_organized.pdf')
    except Exception as e:
        logger.exception("organize-pdf error")
        return error_response(str(e))

@app.route('/api/repair-pdf', methods=['POST'])
def api_repair_pdf():
    """Attempt to repair a corrupted or damaged PDF."""
    try:
        file = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        stem = file_stem(file)
        path = save_uploaded_file(file)
        out  = output_path('repaired.pdf')
        repair_pdf(path, out)
        return send_result(out, f'{stem}_repaired.pdf')
    except Exception as e:
        logger.exception("repair-pdf error")
        return error_response(str(e))

@app.route('/api/ocr-pdf', methods=['POST'])
def api_ocr_pdf():
    """Extract / make searchable text from scanned PDF using OCR."""
    try:
        file          = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        language      = request.form.get('language', 'eng')
        output_format = request.form.get('output_format', 'pdf')
        stem          = file_stem(file)
        path          = save_uploaded_file(file)
        if output_format == 'txt':
            out = output_path('ocr_output.txt')
            ocr_pdf(path, out, language=language, output_format='txt')
            return send_result(out, f'{stem}_ocr.txt', 'text/plain')
        else:
            out = output_path('ocr_output.pdf')
            ocr_pdf(path, out, language=language, output_format='pdf')
            return send_result(out, f'{stem}_ocr.pdf')
    except Exception as e:
        logger.exception("ocr-pdf error")
        return error_response(str(e))

@app.route('/api/optimize-pdf', methods=['POST'])
def api_optimize_pdf():
    """Optimize PDF for web, print, or screen viewing."""
    try:
        file   = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        target = request.form.get('target', 'web')
        stem   = file_stem(file)
        path   = save_uploaded_file(file)
        out    = output_path('optimized.pdf')
        optimize_pdf(path, out, target=target)
        return send_result(out, f'{stem}_optimized.pdf')
    except Exception as e:
        logger.exception("optimize-pdf error")
        return error_response(str(e))

@app.route('/api/scan-to-pdf', methods=['POST'])
def api_scan_to_pdf():
    """Convert scanned images to a searchable PDF."""
    try:
        files   = request.files.getlist('files')
        if not files or not files[0].filename:
            return error_response('No files uploaded.')
        language = request.form.get('language', 'eng')
        enhance  = request.form.get('enhance', 'true').lower() == 'true'
        paths    = save_uploaded_files(files, '.jpg')
        out      = output_path('scanned.pdf')
        stem = file_stem(files[0]) if files[0].filename else 'scan'
        scan_to_pdf(paths, out, language=language, enhance=enhance)
        return send_result(out, f'{stem}_scanned.pdf')
    except Exception as e:
        logger.exception("scan-to-pdf error")
        return error_response(str(e))

# ══════════════════════════════════════════════════════════════════════════════
# ─────────────── CONVERT TO PDF TOOLS ────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/img-to-pdf', methods=['POST'])
def api_img_to_pdf():
    """Convert images (JPG/PNG/WebP/BMP) to a PDF."""
    try:
        files       = request.files.getlist('files')
        if not files or not files[0].filename:
            return error_response('No images uploaded.')
        page_size   = request.form.get('page_size', 'A4')
        orientation = request.form.get('orientation', 'auto')
        margin      = int(request.form.get('margin', 0))
        paths       = save_uploaded_files(files, '.jpg')
        out         = output_path('images.pdf')
        stem = file_stem(files[0]) if files[0].filename else 'images'
        images_to_pdf(paths, out, page_size=page_size, orientation=orientation,
                      margin_top=margin, margin_bottom=margin, margin_left=margin, margin_right=margin)
        return send_result(out, f'{stem}_converted.pdf')
    except Exception as e:
        logger.exception("img-to-pdf error")
        return error_response(str(e))

@app.route('/api/jpg-to-pdf', methods=['POST'])
def api_jpg_to_pdf():
    """Alias for /api/img-to-pdf — JPG/PNG/WebP images to PDF."""
    return api_img_to_pdf()

@app.route('/api/word-to-pdf', methods=['POST'])
def api_word_to_pdf():
    """Convert Word (.docx/.doc) to PDF."""
    try:
        file        = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        page_size   = request.form.get('page_size', 'A4').lower()
        quality     = request.form.get('quality', 'standard')
        gs_quality  = 'printer' if quality == 'high' else 'ebook'
        stem = file_stem(file)
        path = save_uploaded_file(file, '.docx')
        out  = output_path('converted.pdf')
        word_to_pdf(path, out, page_size=page_size, gs_quality=gs_quality)
        return send_result(out, f'{stem}.pdf')
    except Exception as e:
        logger.exception("word-to-pdf error")
        return error_response(str(e))

@app.route('/api/pptx-to-pdf', methods=['POST'])
def api_pptx_to_pdf():
    """Convert PowerPoint (.pptx) to PDF."""
    try:
        file          = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        slide_size    = request.form.get('slide_size', 'widescreen')
        include_notes = request.form.get('include_notes', 'false') == 'true'
        size_map = {
            'widescreen': 'landscape_a4',
            'standard':   'a4',
            'A4':         'a4',
            'letter':     'letter',
        }
        page_size = size_map.get(slide_size, 'landscape_a4')
        stem = file_stem(file)
        path = save_uploaded_file(file, '.pptx')
        out  = output_path('converted.pdf')
        pptx_to_pdf(path, out, page_size=page_size, add_notes_appendix=include_notes)
        return send_result(out, f'{stem}.pdf')
    except Exception as e:
        logger.exception("pptx-to-pdf error")
        return error_response(str(e))

@app.route('/api/excel-to-pdf', methods=['POST'])
def api_excel_to_pdf():
    """Convert Excel (.xlsx/.xls) to PDF."""
    try:
        file        = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        page_size   = request.form.get('page_size', 'A4')
        orientation = request.form.get('orientation', 'landscape')
        # Build page_size string that excel_to_pdf understands
        if orientation == 'landscape':
            ps = page_size + 'L' if page_size == 'A4' else page_size + '_landscape'
        else:
            ps = page_size
        stem = file_stem(file)
        path = save_uploaded_file(file, '.xlsx')
        out  = output_path('converted.pdf')
        excel_to_pdf(path, out, page_size=ps)
        return send_result(out, f'{stem}.pdf')
    except Exception as e:
        logger.exception("excel-to-pdf error")
        return error_response(str(e))

@app.route('/api/html-to-pdf', methods=['POST'])
def api_html_to_pdf():
    """Convert HTML (URL, file, or raw text) to PDF."""
    try:
        html_content = request.form.get('html_content', '')
        html_url     = request.form.get('html_url', '')
        file         = request.files.get('file')
        if file and file.filename:
            path = save_uploaded_file(file, '.html')
            with open(path, 'r', errors='ignore') as f:
                html_content = f.read()
        if not html_content and not html_url:
            return error_response('Please provide HTML content, a URL, or upload an HTML file.')
        stem   = file_stem(file) if file and file.filename else 'webpage'
        out    = output_path('converted.pdf')
        source = html_url if html_url else html_content
        html_to_pdf(source, out, is_url=bool(html_url))
        return send_result(out, f'{stem}.pdf')
    except Exception as e:
        logger.exception("html-to-pdf error")
        return error_response(str(e))

# ══════════════════════════════════════════════════════════════════════════════
# ─────────────── CONVERT FROM PDF TOOLS ──────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/pdf-to-img', methods=['POST'])
def api_pdf_to_img():
    """Convert PDF pages to images (JPG/PNG) as a ZIP download."""
    try:
        file        = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        format_type = request.form.get('format', 'jpg').lower()
        dpi         = int(request.form.get('dpi', 150))
        pages       = request.form.get('pages', 'all')
        path        = save_uploaded_file(file)
        out_dir     = tempfile.mkdtemp()
        result_zip  = output_path('pdf_images.zip')
        stem = file_stem(file)
        pdf_to_images(path, out_dir, result_zip, format_type=format_type, dpi=dpi, pages=pages)
        return send_result(result_zip, f'{stem}_images.zip', 'application/zip')
    except Exception as e:
        logger.exception("pdf-to-img error")
        return error_response(str(e))

@app.route('/api/pdf-to-word', methods=['POST'])
def api_pdf_to_word():
    """Convert PDF to Microsoft Word (.docx)."""
    try:
        file     = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        pages    = request.form.get('pages', '').strip()
        password = request.form.get('password', '').strip()
        start_page, end_page = 0, None
        if pages:
            parts = pages.replace(' ', '').split('-')
            try:
                start_page = max(0, int(parts[0]) - 1)
                end_page   = int(parts[1]) if len(parts) > 1 else start_page + 1
            except (ValueError, IndexError):
                pass
        stem = file_stem(file)
        path = save_uploaded_file(file)
        out  = output_path('converted.docx')
        pdf_to_word(path, out, password=password, start_page=start_page, end_page=end_page)
        return send_result(out, f'{stem}.docx',
                          'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    except Exception as e:
        logger.exception("pdf-to-word error")
        return error_response(str(e))

@app.route('/api/pdf-to-excel', methods=['POST'])
def api_pdf_to_excel():
    """Extract tables from PDF to an Excel spreadsheet."""
    try:
        file = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        stem = file_stem(file)
        path = save_uploaded_file(file)
        out  = output_path('converted.xlsx')
        pdf_to_excel(path, out)
        return send_result(out, f'{stem}.xlsx',
                          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    except Exception as e:
        logger.exception("pdf-to-excel error")
        return error_response(str(e))

@app.route('/api/pdf-to-pptx', methods=['POST'])
def api_pdf_to_pptx():
    """Convert PDF to PowerPoint presentation."""
    try:
        file = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        dpi  = int(request.form.get('dpi', 150))
        stem = file_stem(file)
        path = save_uploaded_file(file)
        out  = output_path('converted.pptx')
        pdf_to_pptx(path, out, dpi=dpi)
        return send_result(out, f'{stem}.pptx',
                          'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    except Exception as e:
        logger.exception("pdf-to-pptx error")
        return error_response(str(e))

@app.route('/api/pdf-to-pdfa', methods=['POST'])
def api_pdf_to_pdfa():
    """Convert PDF to PDF/A archival format."""
    try:
        file  = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        level = request.form.get('level', '1b')
        stem  = file_stem(file)
        path  = save_uploaded_file(file)
        out   = output_path('pdf_a.pdf')
        pdf_to_pdfa(path, out, level=level)
        return send_result(out, f'{stem}_pdfa.pdf')
    except Exception as e:
        logger.exception("pdf-to-pdfa error")
        return error_response(str(e))

# ══════════════════════════════════════════════════════════════════════════════
# ─────────────── EDIT PDF TOOLS ──────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/rotate-pdf', methods=['POST'])
def api_rotate_pdf():
    """Rotate PDF pages by specified angle."""
    try:
        file  = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        angle = int(request.form.get('angle', 90))
        pages = request.form.get('pages', 'all')
        stem  = file_stem(file)
        path  = save_uploaded_file(file)
        out   = output_path('rotated.pdf')
        rotate_pdf(path, out, angle=angle, pages=pages)
        return send_result(out, f'{stem}_rotated.pdf')
    except Exception as e:
        logger.exception("rotate-pdf error")
        return error_response(str(e))

@app.route('/api/add-page-numbers', methods=['POST'])
def api_add_page_numbers():
    """Add page numbers to a PDF."""
    try:
        file      = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        position  = request.form.get('position', 'bottom-center')
        start_num = int(request.form.get('start_num', 1))
        font_size = int(request.form.get('font_size', 12))
        prefix    = request.form.get('prefix', '')
        stem      = file_stem(file)
        path      = save_uploaded_file(file)
        out       = output_path('numbered.pdf')
        add_page_numbers(path, out, position=position, start_num=start_num,
                        font_size=font_size, prefix=prefix)
        return send_result(out, f'{stem}_numbered.pdf')
    except Exception as e:
        logger.exception("add-page-numbers error")
        return error_response(str(e))

@app.route('/api/add-watermark', methods=['POST'])
def api_add_watermark():
    """Add a text watermark to a PDF."""
    try:
        file      = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        text      = request.form.get('text', 'CONFIDENTIAL')
        opacity   = float(request.form.get('opacity', 0.3))
        color     = request.form.get('color', '#FF0000')
        font_size = int(request.form.get('font_size', 48))
        rotation  = int(request.form.get('rotation', 45))
        position  = request.form.get('position', 'center')
        stem      = file_stem(file)
        path      = save_uploaded_file(file)
        out       = output_path('watermarked.pdf')
        add_watermark(path, out, text=text, opacity=opacity, color=color,
                     font_size=font_size, rotation=rotation, position=position)
        return send_result(out, f'{stem}_watermarked.pdf')
    except Exception as e:
        logger.exception("add-watermark error")
        return error_response(str(e))

@app.route('/api/crop-pdf', methods=['POST'])
def api_crop_pdf():
    """Crop PDF pages to a specific area (percentage-based)."""
    try:
        file   = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        left   = float(request.form.get('left', 0))
        bottom = float(request.form.get('bottom', 0))
        right  = float(request.form.get('right', 100))
        top    = float(request.form.get('top', 100))
        unit   = request.form.get('unit', 'percent')
        stem   = file_stem(file)
        path   = save_uploaded_file(file)
        out    = output_path('cropped.pdf')
        crop_pdf(path, out, left=left, bottom=bottom, right=right, top=top, unit=unit)
        return send_result(out, f'{stem}_cropped.pdf')
    except Exception as e:
        logger.exception("crop-pdf error")
        return error_response(str(e))

@app.route('/api/edit-pdf', methods=['POST'])
def api_edit_pdf():
    """Add text annotations or redact areas in a PDF."""
    try:
        file       = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        action     = request.form.get('action', 'add_text')   # add_text | highlight | note
        text       = request.form.get('text', '')
        page_num   = int(request.form.get('page', 1))
        x          = float(request.form.get('x', 100))
        y          = float(request.form.get('y', 100))
        font_size  = int(request.form.get('font_size', 14))
        color      = request.form.get('color', '#000000')
        stem       = file_stem(file)
        path       = save_uploaded_file(file)
        out        = output_path('edited.pdf')
        edit_pdf(path, out, action=action, text=text, page_num=page_num,
                 x=x, y=y, font_size=font_size, color=color)
        return send_result(out, f'{stem}_edited.pdf')
    except Exception as e:
        logger.exception("edit-pdf error")
        return error_response(str(e))

@app.route('/api/pdf-forms', methods=['POST'])
def api_pdf_forms():
    """Fill PDF form fields."""
    try:
        import json
        file       = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        fields_json = request.form.get('fields', '{}')
        fields      = json.loads(fields_json)
        stem        = file_stem(file)
        path        = save_uploaded_file(file)
        out         = output_path('filled_form.pdf')
        fill_pdf_form(path, out, fields=fields)
        return send_result(out, f'{stem}_filled.pdf')
    except Exception as e:
        logger.exception("pdf-forms error")
        return error_response(str(e))

# ══════════════════════════════════════════════════════════════════════════════
# ─────────────── SECURITY TOOLS ──────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/unlock-pdf', methods=['POST'])
def api_unlock_pdf():
    """Remove password protection from a PDF."""
    try:
        file     = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        password = request.form.get('password', '')
        stem     = file_stem(file)
        path     = save_uploaded_file(file)
        out          = output_path('unlocked.pdf')
        try_common   = request.form.get('try_common_passwords', 'true').lower() != 'false'
        brute_lvl    = request.form.get('brute_force_level', 'medium')
        unlock_pdf(path, out, password=password,
                   try_common_passwords=try_common,
                   brute_force_level=brute_lvl)
        return send_result(out, f'{stem}_unlocked.pdf')
    except Exception as e:
        logger.exception("unlock-pdf error")
        return error_response(str(e))

@app.route('/api/protect-pdf', methods=['POST'])
def api_protect_pdf():
    """Add password protection to a PDF."""
    try:
        file           = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        user_password  = request.form.get('user_password', '')
        owner_password = request.form.get('owner_password', '')
        permissions    = request.form.get('permissions', 'all')
        if not user_password:
            return error_response('Please provide a password.')
        stem = file_stem(file)
        path = save_uploaded_file(file)
        out  = output_path('protected.pdf')
        protect_pdf(path, out, user_password=user_password,
                   owner_password=owner_password or user_password,
                   permissions=permissions)
        return send_result(out, f'{stem}_protected.pdf')
    except Exception as e:
        logger.exception("protect-pdf error")
        return error_response(str(e))

@app.route('/api/sign-pdf', methods=['POST'])
def api_sign_pdf():
    """Add a digital/visual signature to a PDF."""
    try:
        file           = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        signature_text = request.form.get('signature_text', '').strip() or 'Signed'
        style_preset   = request.form.get('style', 'corporate')
        position       = request.form.get('position', 'bottom-right')
        pages_sel      = request.form.get('pages', 'last')
        font_size      = int(request.form.get('font_size', 24))
        color          = request.form.get('color', '#003399')
        stem           = file_stem(file)
        path           = save_uploaded_file(file)
        out = output_path('signed.pdf')
        sign_pdf(path, out, signature_type='text',
                 signature_text=signature_text,
                 page_selection=pages_sel,
                 position_preset=position,
                 font_size=font_size,
                 color=color,
                 style_preset=style_preset)
        return send_result(out, f'{stem}_signed.pdf')
    except Exception as e:
        logger.exception("sign-pdf error")
        return error_response(str(e))

@app.route('/api/redact-pdf', methods=['POST'])
def api_redact_pdf():
    """Permanently redact (black out) sensitive text in a PDF."""
    try:
        file             = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        search_terms_raw = request.form.get('search_terms', '')
        preset           = request.form.get('preset', 'none')
        fill_color       = request.form.get('redaction_color', '#000000')
        strip_meta       = request.form.get('redact_metadata', 'true') == 'true'
        terms = [t.strip() for t in search_terms_raw.replace(',', '\n').split('\n') if t.strip()]
        presets = [] if preset == 'none' else [preset]
        if not terms and not presets:
            return error_response('Please provide text terms to redact or select a preset.')
        stem = file_stem(file)
        path = save_uploaded_file(file)
        out  = output_path('redacted.pdf')
        redact_pdf(path, out, search_terms=terms, pattern_presets=presets,
                   fill_color=fill_color, strip_metadata=strip_meta)
        return send_result(out, f'{stem}_redacted.pdf')
    except Exception as e:
        logger.exception("redact-pdf error")
        return error_response(str(e))

@app.route('/api/compare-pdf', methods=['POST'])
def api_compare_pdf():
    """Compare two PDFs and return a diff summary."""
    try:
        file1 = request.files.get('file1')
        file2 = request.files.get('file2')
        if not file1 or not file2:
            return error_response('Please upload 2 PDF files to compare.')
        path1  = save_uploaded_file(file1)
        path2  = save_uploaded_file(file2)
        out    = output_path('comparison.pdf')
        diff_type        = request.form.get('diff_type', 'word')
        ignore_ws        = request.form.get('ignore_whitespace', 'true') == 'true'
        result           = compare_pdfs(path1, path2, out)
        # Apply diff granularity post-processing
        result['diff_type']        = diff_type
        result['ignore_whitespace'] = ignore_ws
        return jsonify({'success': True, 'differences': result})
    except Exception as e:
        logger.exception("compare-pdf error")
        return error_response(str(e))

# ══════════════════════════════════════════════════════════════════════════════
# ─────────────── AI INTELLIGENCE TOOLS ───────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/summarize-pdf', methods=['POST'])
def api_summarize_pdf():
    """AI-powered extractive PDF summarization."""
    try:
        file           = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        summary_length = request.form.get('length', 'medium')
        path           = save_uploaded_file(file)
        result         = summarize_pdf(path, summary_length=summary_length)
        return jsonify({'success': True, **result})
    except Exception as e:
        logger.exception("summarize-pdf error")
        return error_response(str(e))

@app.route('/api/translate-pdf', methods=['POST'])
def api_translate_pdf():
    """Translate PDF content to another language."""
    try:
        file        = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        target_lang = request.form.get('target_lang', 'hi')
        source_lang = request.form.get('source_lang', 'auto')
        bilingual   = request.form.get('bilingual', 'false').lower() == 'true'
        stem        = file_stem(file)
        path        = save_uploaded_file(file)
        out         = output_path('translated.pdf')
        translate_pdf(path, out, target_lang=target_lang,
                      source_lang=source_lang, bilingual=bilingual)
        return send_result(out, f'{stem}_translated_{target_lang}.pdf')
    except Exception as e:
        logger.exception("translate-pdf error")
        return error_response(str(e))

# ── API: Get PDF Info ────────────────────────────────────────────────────────
@app.route('/api/pdf-info', methods=['POST'])
def api_pdf_info():
    """Return metadata and page count for an uploaded PDF."""
    try:
        file = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        path = save_uploaded_file(file)
        import fitz
        doc  = fitz.open(path)
        meta = doc.metadata or {}
        info = {
            'pages'    : doc.page_count,
            'title'    : meta.get('title', ''),
            'author'   : meta.get('author', ''),
            'creator'  : meta.get('creator', ''),
            'encrypted': doc.is_encrypted,
            'filesize' : os.path.getsize(path),
            'width'    : round(doc[0].rect.width)  if doc.page_count else 0,
            'height'   : round(doc[0].rect.height) if doc.page_count else 0,
        }
        doc.close()
        return jsonify({'success': True, **info})
    except Exception as e:
        logger.exception("pdf-info error")
        return error_response(str(e))

# ── Run Application ──────────────────────────────────────────────────────────
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
