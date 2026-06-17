"""
IshuTools.fun - Main Flask Application
Professional PDF Tools Suite — 35+ Tools
Author: Ishu Kumar (GitHub: ISHUKR41 / ISHUKR75)
Domain: ishutools.fun
"""

import os
import uuid
import tempfile
import logging
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
from werkzeug.exceptions import RequestEntityTooLarge

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

@app.route('/robots.txt')
def robots():
    """Serve robots.txt for SEO crawlers."""
    return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'seo'), 'robots.txt')

# ── Health Check ─────────────────────────────────────────────────────────────
@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'service': 'IshuTools PDF Suite', 'version': '3.0', 'tools': 35})

# ══════════════════════════════════════════════════════════════════════════════
# ─────────────── ORGANIZE PDF TOOLS ─────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/merge-pdf', methods=['POST'])
def api_merge_pdf():
    """Merge multiple PDFs into one combined document."""
    try:
        files = request.files.getlist('files')
        if len(files) < 2:
            return error_response('Please upload at least 2 PDF files.')
        paths = save_uploaded_files(files)
        out   = output_path('merged.pdf')
        merge_pdfs(paths, out)
        return send_result(out, 'merged.pdf')
    except Exception as e:
        logger.exception("merge-pdf error")
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
        path       = save_uploaded_file(file)
        out_dir    = tempfile.mkdtemp()
        result_zip = output_path('split_pages.zip')
        split_pdf(path, out_dir, result_zip, mode=split_mode, ranges=ranges, every_n=every_n)
        return send_result(result_zip, 'split_pages.zip', 'application/zip')
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
        path    = save_uploaded_file(file)
        out     = output_path('compressed.pdf')
        original_size = os.path.getsize(path)
        compress_pdf(path, out, quality=quality)
        new_size = os.path.getsize(out)
        resp = send_result(out, 'compressed.pdf')
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
        path  = save_uploaded_file(file)
        out   = output_path('pages_removed.pdf')
        remove_pages(path, out, pages=pages)
        return send_result(out, 'pages_removed.pdf')
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
        path  = save_uploaded_file(file)
        out   = output_path('extracted.pdf')
        extract_pages(path, out, pages=pages)
        return send_result(out, 'extracted.pdf')
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
        path  = save_uploaded_file(file)
        out   = output_path('organized.pdf')
        organize_pdf(path, out, order=order)
        return send_result(out, 'organized.pdf')
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
        path = save_uploaded_file(file)
        out  = output_path('repaired.pdf')
        repair_pdf(path, out)
        return send_result(out, 'repaired.pdf')
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
        path          = save_uploaded_file(file)
        if output_format == 'txt':
            out = output_path('ocr_output.txt')
            ocr_pdf(path, out, language=language, output_format='txt')
            return send_result(out, 'ocr_output.txt', 'text/plain')
        else:
            out = output_path('ocr_output.pdf')
            ocr_pdf(path, out, language=language, output_format='pdf')
            return send_result(out, 'ocr_output.pdf')
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
        path   = save_uploaded_file(file)
        out    = output_path('optimized.pdf')
        optimize_pdf(path, out, target=target)
        return send_result(out, 'optimized.pdf')
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
        scan_to_pdf(paths, out, language=language, enhance=enhance)
        return send_result(out, 'scanned.pdf')
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
        images_to_pdf(paths, out, page_size=page_size, orientation=orientation, margin=margin)
        return send_result(out, 'converted.pdf')
    except Exception as e:
        logger.exception("img-to-pdf error")
        return error_response(str(e))

@app.route('/api/word-to-pdf', methods=['POST'])
def api_word_to_pdf():
    """Convert Word (.docx/.doc) to PDF."""
    try:
        file = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        path = save_uploaded_file(file, '.docx')
        out  = output_path('converted.pdf')
        word_to_pdf(path, out)
        return send_result(out, 'converted.pdf')
    except Exception as e:
        logger.exception("word-to-pdf error")
        return error_response(str(e))

@app.route('/api/pptx-to-pdf', methods=['POST'])
def api_pptx_to_pdf():
    """Convert PowerPoint (.pptx) to PDF."""
    try:
        file = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        path = save_uploaded_file(file, '.pptx')
        out  = output_path('converted.pdf')
        pptx_to_pdf(path, out)
        return send_result(out, 'converted.pdf')
    except Exception as e:
        logger.exception("pptx-to-pdf error")
        return error_response(str(e))

@app.route('/api/excel-to-pdf', methods=['POST'])
def api_excel_to_pdf():
    """Convert Excel (.xlsx/.xls) to PDF."""
    try:
        file = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        path = save_uploaded_file(file, '.xlsx')
        out  = output_path('converted.pdf')
        excel_to_pdf(path, out)
        return send_result(out, 'converted.pdf')
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
        out = output_path('converted.pdf')
        html_to_pdf(out, html_content=html_content, html_url=html_url)
        return send_result(out, 'converted.pdf')
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
        pdf_to_images(path, out_dir, result_zip, format_type=format_type, dpi=dpi, pages=pages)
        return send_result(result_zip, 'pdf_images.zip', 'application/zip')
    except Exception as e:
        logger.exception("pdf-to-img error")
        return error_response(str(e))

@app.route('/api/pdf-to-word', methods=['POST'])
def api_pdf_to_word():
    """Convert PDF to Microsoft Word (.docx)."""
    try:
        file = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        path = save_uploaded_file(file)
        out  = output_path('converted.docx')
        pdf_to_word(path, out)
        return send_result(out, 'converted.docx',
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
        path = save_uploaded_file(file)
        out  = output_path('converted.xlsx')
        pdf_to_excel(path, out)
        return send_result(out, 'converted.xlsx',
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
        path = save_uploaded_file(file)
        out  = output_path('converted.pptx')
        pdf_to_pptx(path, out, dpi=dpi)
        return send_result(out, 'converted.pptx',
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
        path  = save_uploaded_file(file)
        out   = output_path('pdf_a.pdf')
        pdf_to_pdfa(path, out, level=level)
        return send_result(out, 'pdf_a.pdf')
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
        path  = save_uploaded_file(file)
        out   = output_path('rotated.pdf')
        rotate_pdf(path, out, angle=angle, pages=pages)
        return send_result(out, 'rotated.pdf')
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
        path      = save_uploaded_file(file)
        out       = output_path('numbered.pdf')
        add_page_numbers(path, out, position=position, start_num=start_num,
                        font_size=font_size, prefix=prefix)
        return send_result(out, 'numbered.pdf')
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
        path      = save_uploaded_file(file)
        out       = output_path('watermarked.pdf')
        add_watermark(path, out, text=text, opacity=opacity, color=color,
                     font_size=font_size, rotation=rotation, position=position)
        return send_result(out, 'watermarked.pdf')
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
        path   = save_uploaded_file(file)
        out    = output_path('cropped.pdf')
        crop_pdf(path, out, left=left, bottom=bottom, right=right, top=top, unit=unit)
        return send_result(out, 'cropped.pdf')
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
        path       = save_uploaded_file(file)
        out        = output_path('edited.pdf')
        edit_pdf(path, out, action=action, text=text, page_num=page_num,
                 x=x, y=y, font_size=font_size, color=color)
        return send_result(out, 'edited.pdf')
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
        path        = save_uploaded_file(file)
        out         = output_path('filled_form.pdf')
        fill_pdf_form(path, out, fields=fields)
        return send_result(out, 'filled_form.pdf')
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
        path     = save_uploaded_file(file)
        out      = output_path('unlocked.pdf')
        unlock_pdf(path, out, password=password)
        return send_result(out, 'unlocked.pdf')
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
        path = save_uploaded_file(file)
        out  = output_path('protected.pdf')
        protect_pdf(path, out, user_password=user_password,
                   owner_password=owner_password or user_password,
                   permissions=permissions)
        return send_result(out, 'protected.pdf')
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
        signature_type = request.form.get('signature_type', 'text')
        signature_text = request.form.get('signature_text', 'Signed by IshuTools')
        page_num       = int(request.form.get('page', 1)) - 1
        x_pos          = float(request.form.get('x', 50))
        y_pos          = float(request.form.get('y', 50))
        path           = save_uploaded_file(file)
        sig_image_path = None
        if signature_type == 'image' and 'signature_image' in request.files:
            sig_img        = request.files.get('signature_image')
            sig_image_path = save_uploaded_file(sig_img, '.png')
        out = output_path('signed.pdf')
        sign_pdf(path, out, signature_type=signature_type,
                signature_text=signature_text, page_num=page_num,
                x_pos=x_pos, y_pos=y_pos, sig_image_path=sig_image_path)
        return send_result(out, 'signed.pdf')
    except Exception as e:
        logger.exception("sign-pdf error")
        return error_response(str(e))

@app.route('/api/redact-pdf', methods=['POST'])
def api_redact_pdf():
    """Permanently redact (black out) sensitive text in a PDF."""
    try:
        file         = request.files.get('file')
        if not file:
            return error_response('No file uploaded.')
        search_terms = request.form.get('search_terms', '')
        if not search_terms:
            return error_response('Please provide text terms to redact.')
        path  = save_uploaded_file(file)
        out   = output_path('redacted.pdf')
        terms = [t.strip() for t in search_terms.replace(',', '\n').split('\n') if t.strip()]
        redact_pdf(path, out, search_terms=terms)
        return send_result(out, 'redacted.pdf')
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
        result = compare_pdfs(path1, path2, out)
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
        path        = save_uploaded_file(file)
        out         = output_path('translated.pdf')
        translate_pdf(path, out, target_lang=target_lang, source_lang=source_lang)
        return send_result(out, 'translated.pdf')
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
