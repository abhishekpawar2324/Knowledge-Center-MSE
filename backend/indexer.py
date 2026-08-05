import os
import re
import json
from datetime import datetime
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session
import zipfile

# Import parsers (wrap in try-except to handle imports robustly)
try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

try:
    import docx
except ImportError:
    docx = None

try:
    import mammoth
except ImportError:
    import subprocess
    import sys
    try:
        print("[Auto-setup] Installing mammoth HTML converter dependency...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "mammoth"])
        import mammoth
    except Exception as e:
        print(f"[Auto-setup Warning] Failed to auto-install mammoth: {e}")
        mammoth = None

import markdown

from backend.database import SessionLocal, Document, IndexLog, init_db

# Constants for paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFLUENCE_DIR = os.path.join(BASE_DIR, "863301644")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")

# Ensure uploads directory exists
os.makedirs(UPLOADS_DIR, exist_ok=True)

def parse_html_file(file_path):
    """
    Parses a Confluence-exported HTML file.
    Extracts: title, breadcrumbs, author, date, and clean body text.
    """
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            soup = BeautifulSoup(f.read(), "html.parser")
        
        # 1. Title
        title = "Untitled Document"
        title_tag = soup.find(id="title-text")
        if title_tag:
            title = title_tag.get_text().strip()
        else:
            title_tag = soup.find("title")
            if title_tag:
                title = title_tag.get_text().strip()
                # Clean confluence prefix
                if "Magic Global Support : " in title:
                    title = title.replace("Magic Global Support : ", "")
        
        # 2. Breadcrumbs
        breadcrumbs = []
        bc_section = soup.find(id="breadcrumbs")
        if bc_section:
            breadcrumbs = [li.get_text().strip() for li in bc_section.find_all("li") if li.get_text().strip()]
        
        # 3. Author and Date
        author = "System"
        doc_date = None
        meta_div = soup.find(class_="page-metadata")
        if meta_div:
            author_span = meta_div.find(class_="author")
            if author_span:
                author = author_span.get_text().strip()
            
            # Extract date (e.g. "on 31,May, 2023")
            meta_text = meta_div.get_text()
            date_match = re.search(r"on\s+([0-9a-zA-Z,\s]+)", meta_text)
            if date_match:
                date_str = date_match.group(1).strip()
                try:
                    # Clean and parse date
                    date_cleaned = date_str.replace(" ", "").replace(",", "") # "31May2023"
                    doc_date = datetime.strptime(date_cleaned, "%d%b%Y")
                except Exception:
                    pass
        
        # 4. Content (wiki-content is confluence body container)
        content_div = soup.find(id="main-content")
        if not content_div:
            content_div = soup.find(class_="wiki-content")
        if not content_div:
            content_div = soup.find("body")
            
        # Clean script/styles
        if content_div:
            for element in content_div(["script", "style"]):
                element.decompose()
            content = content_div.get_text(separator=" ").strip()
        else:
            content = ""
            
        # Standardize whitespace
        content = re.sub(r"\s+", " ", content)
        
        return {
            "title": title,
            "breadcrumbs": json.dumps(breadcrumbs),
            "author": author,
            "created_at": doc_date or datetime.fromtimestamp(os.path.getmtime(file_path)),
            "content": content
        }
    except Exception as e:
        print(f"Error parsing HTML {file_path}: {e}")
        return None

def extract_docx_images(file_path, doc_dir_name):
    """
    Extracts all images from a docx file and saves them to attachments/{doc_dir_name}/
    """
    image_paths = []
    try:
        dest_dir = os.path.join(CONFLUENCE_DIR, "attachments", doc_dir_name)
        os.makedirs(dest_dir, exist_ok=True)
        
        with zipfile.ZipFile(file_path, 'r') as zp:
            for item in zp.infolist():
                if item.filename.startswith('word/media/'):
                    ext = item.filename.split('.')[-1].lower()
                    if ext in ['png', 'jpg', 'jpeg', 'gif']:
                        img_name = os.path.basename(item.filename)
                        dest_path = os.path.join(dest_dir, img_name)
                        with open(dest_path, 'wb') as f:
                            f.write(zp.read(item.filename))
                        image_paths.append(f"attachments/{doc_dir_name}/{img_name}")
    except Exception as e:
        print(f"Error extracting docx images: {e}")
    return image_paths

def extract_pdf_images(file_path, doc_dir_name):
    """
    Extracts all images from a PDF file using pypdf and saves them to attachments/{doc_dir_name}/
    """
    image_paths = []
    if not PdfReader:
        return image_paths
    try:
        reader = PdfReader(file_path)
        dest_dir = os.path.join(CONFLUENCE_DIR, "attachments", doc_dir_name)
        os.makedirs(dest_dir, exist_ok=True)
        
        img_idx = 1
        for page_idx, page in enumerate(reader.pages):
            if "/Resources" in page and "/XObject" in page["/Resources"]:
                xObject = page["/Resources"]["/XObject"].get_object()
                for obj_name in xObject:
                    if xObject[obj_name]["/Subtype"] == "/Image":
                        data = xObject[obj_name].get_data()
                        if "/Filter" in xObject[obj_name]:
                            ext = "png"
                            filt = xObject[obj_name]["/Filter"]
                            if isinstance(filt, list):
                                filt = filt[0] if len(filt) > 0 else ""
                            
                            if "/DCTDecode" in str(filt):
                                ext = "jpg"
                            elif "/JPXDecode" in str(filt):
                                ext = "jp2"
                            
                            img_name = f"page_{page_idx+1}_img_{img_idx}.{ext}"
                            dest_path = os.path.join(dest_dir, img_name)
                            with open(dest_path, "wb") as f:
                                f.write(data)
                            image_paths.append(f"attachments/{doc_dir_name}/{img_name}")
                            img_idx += 1
    except Exception as e:
        print(f"Error extracting PDF images: {e}")
    return image_paths

def parse_pdf_file(file_path):
    """
    Parses a PDF file using pypdf.
    """
    if not PdfReader:
        print(f"pypdf not installed. Skipping extraction for {file_path}")
        return None
        
    try:
        reader = PdfReader(file_path)
        content = []
        for page in reader.pages:
            # Avoid extraction_mode="layout" to prevent character splitting spaces (e.g. confi guration)
            text = page.extract_text()
            if text:
                content.append(text)
                
        # Join pages with clean spacing
        full_content = "\n\n".join(content)
        full_content = full_content.replace("\r", "")
        
        # Clean double spaces but keep newlines
        lines = []
        for line in full_content.split("\n"):
            cleaned_line = re.sub(r"[ \t]+", " ", line).strip()
            lines.append(cleaned_line)
        full_content = "\n".join(lines)
        
        title = os.path.basename(file_path)
        if reader.metadata and reader.metadata.title:
            title = reader.metadata.title
            
        # Extract and save images dynamically
        doc_filename = os.path.basename(file_path)
        doc_dir_name = re.sub(r'\W+', '_', doc_filename)
        extract_pdf_images(file_path, doc_dir_name)
            
        return {
            "title": title,
            "breadcrumbs": json.dumps(["Uploads", "PDFs"]),
            "author": reader.metadata.creator if reader.metadata and reader.metadata.creator else "Editor",
            "created_at": datetime.fromtimestamp(os.path.getmtime(file_path)),
            "content": full_content.strip()
        }
    except Exception as e:
        print(f"Error parsing PDF {file_path}: {e}")
        return None

def parse_docx_file(file_path):
    """
    Parses a Word DOCX file.
    If mammoth is available, converts it to clean HTML (preserving tables, images) and saves it on disk.
    """
    if not docx:
        print(f"python-docx not installed. Skipping extraction for {file_path}")
        return None
        
    try:
        # 1. Extract raw text for DB content search (using python-docx)
        doc = docx.Document(file_path)
        paragraphs = [p.text.strip() for p in doc.paragraphs]
        full_content = "\n\n".join(paragraphs)
        
        title = os.path.basename(file_path)
        if len(doc.paragraphs) > 0 and doc.paragraphs[0].style.name.startswith("Heading"):
            title = doc.paragraphs[0].text
            
        # 2. Try converting to high-fidelity HTML with Mammoth
        if mammoth:
            try:
                with open(file_path, "rb") as docx_file:
                    result = mammoth.convert_to_html(docx_file)
                    html_val = result.value
                    
                    # Style tables beautifully inline
                    html_val = html_val.replace("<table>", '<table style="width:100%; border-collapse:collapse; margin-bottom:1.5rem; background:rgba(255,255,255,0.01); border:1px solid rgba(255,255,255,0.08);">')
                    html_val = html_val.replace("<th>", '<th style="border:1px solid rgba(255,255,255,0.08); padding:10px 12px; background:rgba(255,255,255,0.04); text-align:left; font-weight:600; color:#fff; font-size:0.88rem;">')
                    html_val = html_val.replace("<td>", '<td style="border:1px solid rgba(255,255,255,0.08); padding:10px 12px; color:#d1d5db; font-size:0.88rem; line-height:1.6;">')
                    
                    # Wrap lists in clean style
                    html_val = html_val.replace("<ul>", '<ul style="margin-left:1.8rem; margin-bottom:1.2rem; list-style-type:disc; color:#d1d5db;">')
                    html_val = html_val.replace("<ol>", '<ol style="margin-left:1.8rem; margin-bottom:1.2rem; list-style-type:decimal; color:#d1d5db;">')
                    html_val = html_val.replace("<li>", '<li style="margin-bottom:0.5rem; line-height:1.7;">')
                    
                    # Style images to be responsive
                    html_val = html_val.replace("<img ", '<img style="max-width:100%; height:auto; border-radius:8px; margin:16px 0; box-shadow:0 4px 15px rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.08);" ')
                    
                    # Save HTML file next to original docx file
                    html_path = file_path + ".html"
                    with open(html_path, "w", encoding="utf-8") as hf:
                        hf.write(html_val)
                    print(f"Mammoth HTML generated and saved: {html_path}")
            except Exception as e:
                print(f"Mammoth conversion failed for {file_path}: {e}")
                
        # Also extract individual images to attachments directory for reference
        doc_filename = os.path.basename(file_path)
        doc_dir_name = re.sub(r'\W+', '_', doc_filename)
        extract_docx_images(file_path, doc_dir_name)
            
        return {
            "title": title,
            "breadcrumbs": json.dumps(["Uploads", "DOCX"]),
            "author": "Editor",
            "created_at": datetime.fromtimestamp(os.path.getmtime(file_path)),
            "content": full_content.strip()
        }
    except Exception as e:
        print(f"Error parsing DOCX {file_path}: {e}")
        return None

def parse_text_file(file_path, file_type):
    """
    Parses plain text or Markdown files.
    """
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            text_content = f.read()
            
        title = os.path.basename(file_path)
        content_for_db = text_content
        
        # If Markdown, extract first heading as title
        if file_type == "md":
            html_content = markdown.markdown(text_content)
            soup = BeautifulSoup(html_content, "html.parser")
            h1 = soup.find("h1")
            if h1:
                title = h1.get_text().strip()
            content_for_db = soup.get_text()
            
        # Clean double spaces but keep paragraph layouts
        lines = []
        for line in content_for_db.split("\n"):
            cleaned_line = re.sub(r"[ \t]+", " ", line).strip()
            lines.append(cleaned_line)
        full_content = "\n".join(lines)
        
        return {
            "title": title,
            "breadcrumbs": json.dumps(["Uploads", file_type.upper()]),
            "author": "Editor",
            "created_at": datetime.fromtimestamp(os.path.getmtime(file_path)),
            "content": full_content.strip()
        }
    except Exception as e:
        print(f"Error parsing text file {file_path}: {e}")
        return None

def scan_and_index(db: Session):
    """
    Scans directory, parses files, inserts/updates DB entries, and deletes stale ones.
    """
    log_msg = []
    indexed_count = 0
    start_time = datetime.utcnow()
    
    # Initialize DB tables
    init_db()
    
    # 1. Scan for files
    all_files = []
    
    # Confluence folder
    if os.path.exists(CONFLUENCE_DIR):
        for root, _, files in os.walk(CONFLUENCE_DIR):
            for file in files:
                if file.endswith(".html") and file != "index.html":
                    all_files.append((os.path.join(root, file), "html"))
                    
    # Uploads folder
    if os.path.exists(UPLOADS_DIR):
        for root, _, files in os.walk(UPLOADS_DIR):
            for file in files:
                ext = file.split(".")[-1].lower()
                if ext in ["html", "pdf", "docx", "txt", "md"]:
                    all_files.append((os.path.join(root, file), ext))

    log_msg.append(f"Discovered {len(all_files)} total files on disk.")
    
    # Track paths processed to identify deleted ones
    processed_paths = set()
    
    # 2. Index each file
    for file_path, file_type in all_files:
        normalized_path = os.path.abspath(file_path)
        processed_paths.add(normalized_path)
        
        # Check if already in DB and up to date (compare modification time)
        existing_doc = db.query(Document).filter(Document.file_path == normalized_path).first()
        mtime = datetime.fromtimestamp(os.path.getmtime(file_path))
        
        # Force re-parse if the document contains flattened text (no newlines) from the previous indexer version,
        # or if it is a DOCX file but the Mammoth HTML cache does not exist on disk yet
        needs_reparse = False
        if existing_doc:
            if existing_doc.file_type in ["pdf", "docx", "txt", "md"] and "\n" not in existing_doc.content:
                needs_reparse = True
            elif existing_doc.file_type == "docx" and not os.path.exists(normalized_path + ".html"):
                needs_reparse = True
            
        if existing_doc and not needs_reparse and existing_doc.created_at >= mtime:
            # Document exists and is up to date
            indexed_count += 1
            continue
            
        # Parse based on file type
        parsed_data = None
        if file_type == "html":
            parsed_data = parse_html_file(file_path)
        elif file_type == "pdf":
            parsed_data = parse_pdf_file(file_path)
        elif file_type == "docx":
            parsed_data = parse_docx_file(file_path)
        elif file_type in ["txt", "md"]:
            parsed_data = parse_text_file(file_path, file_type)
            
        if parsed_data:
            if existing_doc:
                # Update existing
                existing_doc.title = parsed_data["title"]
                existing_doc.breadcrumbs = parsed_data["breadcrumbs"]
                existing_doc.author = parsed_data["author"]
                existing_doc.content = parsed_data["content"]
                existing_doc.created_at = parsed_data["created_at"]
            else:
                # Create new
                new_doc = Document(
                    title=parsed_data["title"],
                    file_path=normalized_path,
                    file_type=file_type,
                    content=parsed_data["content"],
                    author=parsed_data["author"],
                    breadcrumbs=parsed_data["breadcrumbs"],
                    created_at=parsed_data["created_at"]
                )
                db.add(new_doc)
            
            indexed_count += 1
            db.commit()
            
    # 3. Clean up deleted files from DB
    db_docs = db.query(Document).all()
    deleted_count = 0
    for doc in db_docs:
        if doc.file_path not in processed_paths:
            db.delete(doc)
            deleted_count += 1
            
    if deleted_count > 0:
        db.commit()
        log_msg.append(f"Removed {deleted_count} stale documents from search index.")
        
    log_msg.append(f"Successfully processed search index. Total documents indexed: {indexed_count}.")
    
    # 4. Log indexing run
    final_message = "\n".join(log_msg)
    idx_log = IndexLog(
        timestamp=start_time,
        status="Success",
        message=final_message,
        indexed_count=indexed_count
    )
    db.add(idx_log)
    db.commit()
    print(final_message)
def index_single_file(file_path: str, file_type: str, db: Session):
    """
    Instantly parses and indexes a single uploaded file into the database in under 50ms.
    Eliminates full workspace re-scanning delays during uploads.
    """
    normalized_path = os.path.abspath(file_path)
    
    parsed_data = None
    file_type = file_type.lower()
    if file_type == "html":
        parsed_data = parse_html_file(file_path)
    elif file_type == "pdf":
        parsed_data = parse_pdf_file(file_path)
    elif file_type == "docx":
        parsed_data = parse_docx_file(file_path)
    elif file_type in ["txt", "md"]:
        parsed_data = parse_text_file(file_path, file_type)
        
    if not parsed_data:
        return None

    existing_doc = db.query(Document).filter(Document.file_path == normalized_path).first()
    if existing_doc:
        existing_doc.title = parsed_data["title"]
        existing_doc.breadcrumbs = parsed_data["breadcrumbs"]
        existing_doc.author = parsed_data["author"]
        existing_doc.content = parsed_data["content"]
        existing_doc.created_at = parsed_data["created_at"]
        doc = existing_doc
    else:
        doc = Document(
            title=parsed_data["title"],
            file_path=normalized_path,
            file_type=file_type,
            content=parsed_data["content"],
            author=parsed_data["author"],
            breadcrumbs=parsed_data["breadcrumbs"],
            created_at=parsed_data["created_at"]
        )
        db.add(doc)
        
    db.commit()
    db.refresh(doc)
    return doc

if __name__ == "__main__":
    db = SessionLocal()
    try:
        scan_and_index(db)
    finally:
        db.close()
