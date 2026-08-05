import os
import json
import shutil
import re
from typing import List, Optional
from datetime import datetime

from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import func
from bs4 import BeautifulSoup

from backend.database import get_db, init_db, User, Document, IndexLog, SessionLocal, Comment, Favorite
from backend.auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    require_role,
)
from backend.indexer import scan_and_index, index_single_file, CONFLUENCE_DIR, UPLOADS_DIR

# Automatic copy of company logo asset to frontend static directory on startup
try:
    src_logo = r"C:\Users\apawar\.gemini\antigravity-ide\brain\a168cb03-3358-49c6-ba07-089e189ed1d0\media__1784751445167.png"
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dest_logo = os.path.join(base_dir, "frontend", "magic_logo.png")
    
    log_path = os.path.join(base_dir, "copy_log.txt")
    with open(log_path, "w") as lf:
        lf.write(f"Startup Copy Log - {datetime.now()}\n")
        lf.write(f"Source: {src_logo}\n")
        lf.write(f"Source exists: {os.path.exists(src_logo)}\n")
        lf.write(f"Destination: {dest_logo}\n")
        if os.path.exists(src_logo) and not os.path.exists(dest_logo):
            shutil.copy(src_logo, dest_logo)
            lf.write("Copy status: SUCCESS\n")
        elif os.path.exists(dest_logo):
            lf.write("Copy status: SKIPPED (already exists)\n")
        else:
            lf.write("Copy status: SKIPPED (source not found, using existing frontend logo)\n")
except Exception as e:
    try:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        log_path = os.path.join(base_dir, "copy_log.txt")
        with open(log_path, "a") as lf:
            lf.write(f"Error: {e}\n")
    except Exception:
        pass


app = FastAPI(title="Magic Software Knowledge Base API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB tables and seed default admin user
init_db()
db = SessionLocal()
try:
    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
    admin_user = db.query(User).filter(User.username == admin_username).first()
    if not admin_user:
        hashed_pw = get_password_hash(admin_password)
        db.add(User(username=admin_username, hashed_password=hashed_pw, role="Admin"))
        db.commit()
        print(f"Default admin user created: {admin_username} (password sourced from environment/default)")
finally:
    db.close()

# Static mounts with existence checks (prevent app crash if directories are missing)
if os.path.exists(CONFLUENCE_DIR):
    images_dir = os.path.join(CONFLUENCE_DIR, "images")
    attachments_dir = os.path.join(CONFLUENCE_DIR, "attachments")
    styles_dir = os.path.join(CONFLUENCE_DIR, "styles")
    
    if os.path.exists(images_dir):
        app.mount("/images", StaticFiles(directory=images_dir), name="images")
    if os.path.exists(attachments_dir):
        app.mount("/attachments", StaticFiles(directory=attachments_dir), name="attachments")
    if os.path.exists(styles_dir):
        app.mount("/styles", StaticFiles(directory=styles_dir), name="styles")

# ----------------- Auth Endpoints -----------------

@app.post("/api/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user.username, "role": user.role})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user.username,
        "role": user.role
    }

@app.get("/api/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "username": current_user.username,
        "role": current_user.role
    }

# ----------------- Search Endpoints -----------------

def generate_snippet(content: str, query_terms: List[str], window_size: int = 150) -> str:
    """
    Generates a snippet of text from content containing the search query terms,
    with html-style highlights.
    """
    if not content:
        return ""
        
    content_lower = content.lower()
    first_idx = -1
    
    # Find the position of the first matching query term
    for term in query_terms:
        idx = content_lower.find(term)
        if idx != -1:
            if first_idx == -1 or idx < first_idx:
                first_idx = idx
                
    if first_idx == -1:
        # Fallback to first part of document
        snippet = content[:window_size] + ("..." if len(content) > window_size else "")
    else:
        # Create a window around the first match
        start = max(0, first_idx - 40)
        end = min(len(content), start + window_size)
        
        # Adjust start to not cut a word in half
        if start > 0:
            space_idx = content.find(" ", start, start + 15)
            if space_idx != -1:
                start = space_idx + 1
                
        snippet = content[start:end]
        
        if start > 0:
            snippet = "..." + snippet
        if end < len(content):
            snippet = snippet + "..."
            
    # Apply HTML highlighting
    highlighted = snippet
    for term in query_terms:
        # Use regex to do a case-insensitive replacement with formatting preserved
        pattern = re.compile(re.escape(term), re.IGNORECASE)
        highlighted = pattern.sub(lambda m: f"<mark class='search-highlight'>{m.group(0)}</mark>", highlighted)
        
    return highlighted

def levenshtein_distance(s1, s2):
    if len(s1) > len(s2):
        s1, s2 = s2, s1
    distances = range(len(s1) + 1)
    for i2, c2 in enumerate(s2):
        distances_ = [i2+1]
        for i1, c1 in enumerate(s1):
            if c1 == c2:
                distances_.append(distances[i1])
            else:
                distances_.append(1 + min((distances[i1], distances[i1 + 1], distances_[-1])))
        distances = distances_
    return distances[-1]

@app.get("/api/search")
def search(
    q: str, 
    type: Optional[str] = None, 
    author: Optional[str] = None, 
    category: Optional[str] = None,
    match_all: bool = True,
    db: Session = Depends(get_db)
):
    if not q or not q.strip():
        return []
        
    # Check for exact phrase matching (surrounded by quotes)
    is_phrase = q.startswith('"') and q.endswith('"')
    if is_phrase:
        query_phrase = q[1:-1].lower()
        query_terms = [query_phrase]
    else:
        # Split into individual search terms
        query_terms = [term.lower().strip() for term in q.split() if term.strip()]
        
    if not query_terms:
        return []

    # Expand query terms with spelling variants to support typo tolerance
    try:
        all_docs = db.query(Document).all()
        vocab = set()
        for doc in all_docs:
            words = re.findall(r'\b[a-zA-Z]{3,}\b', doc.content + " " + doc.title)
            vocab.update(w.lower() for w in words)
            
        expanded_terms = list(query_terms)
        for term in query_terms:
            if term not in vocab and term.isalpha():
                for word in vocab:
                    dist = levenshtein_distance(term, word)
                    if (len(term) <= 4 and dist <= 1) or (len(term) > 4 and dist <= 2):
                        expanded_terms.append(word)
        query_terms = list(set(expanded_terms))
    except Exception as e:
        print(f"Error executing search query expansions: {e}")
        
    # Retrieve documents from DB
    query = db.query(Document)
    
    # Apply filters
    if type:
        query = query.filter(Document.file_type == type.lower())
    if author:
        query = query.filter(Document.author == author)
        
    docs = query.all()
    results = []
    
    for doc in docs:
        content_lower = doc.content.lower()
        title_lower = doc.title.lower()
        
        # Check matching
        term_matches = []
        all_terms_matched = True
        
        for term in query_terms:
            in_title = term in title_lower
            in_content = term in content_lower
            
            if in_title or in_content:
                term_matches.append(term)
            else:
                all_terms_matched = False
                
        # If match_all is true, we discard documents that don't match ALL terms
        if match_all and not all_terms_matched:
            continue
        # If match_all is false, we need at least ONE term to match
        if not match_all and not term_matches:
            continue
            
        # Calculate relevance score
        score = 0
        
        # 1. Exact phrase boost
        if is_phrase:
            phrase = query_phrase
            title_phrase_count = title_lower.count(phrase)
            content_phrase_count = content_lower.count(phrase)
            score += title_phrase_count * 100
            score += content_phrase_count * 5
        else:
            # 2. Keyword relevance scoring
            for term in query_terms:
                # Title matches (highest relevance)
                if term in title_lower:
                    score += 15 + (title_lower.count(term) * 5)
                # Content matches (based on frequency)
                if term in content_lower:
                    score += content_lower.count(term) * 1.5
                # Breadcrumbs match
                if doc.breadcrumbs and term in doc.breadcrumbs.lower():
                    score += 10
                    
        # Filter by Confluence category if specified
        if category:
            doc_cats = json.loads(doc.breadcrumbs) if doc.breadcrumbs else []
            if not any(category.lower() in cat.lower() for cat in doc_cats):
                continue
                
        # Generate highlight preview
        snippet = generate_snippet(doc.content, query_terms)
        
        results.append({
            "id": doc.id,
            "title": doc.title,
            "file_type": doc.file_type,
            "author": doc.author,
            "breadcrumbs": json.loads(doc.breadcrumbs) if doc.breadcrumbs else [],
            "created_at": doc.created_at.strftime("%d %b, %Y"),
            "snippet": snippet,
            "score": score,
            "views": doc.views or 0,
            "likes": doc.likes or 0,
            "tags": doc.tags or ""
        })

        
    # Sort results by score (descending)
    results.sort(key=lambda x: x["score"], reverse=True)
    return results

@app.post("/api/copilot/ask")
def copilot_ask(question: str = Form(...), db: Session = Depends(get_db)):
    if not question or not question.strip():
        return {"answer": "Please provide a valid question."}
        
    # Extract terms and look for vocabulary spelling variants (typo tolerance)
    question_terms = [t.lower().strip() for t in question.split() if len(t.strip()) > 2]
    if not question_terms:
        return {"answer": "Your question is too short or doesn't contain searchable keywords.", "citations": []}
        
    docs = db.query(Document).all()
    
    # 1. Expand search question terms for typo tolerance
    try:
        vocab = set()
        for doc in docs:
            words = re.findall(r'\b[a-zA-Z]{3,}\b', doc.content + " " + doc.title)
            vocab.update(w.lower() for w in words)
            
        expanded_terms = list(question_terms)
        for term in question_terms:
            if term not in vocab and term.isalpha():
                for word in vocab:
                    dist = levenshtein_distance(term, word)
                    if (len(term) <= 4 and dist <= 1) or (len(term) > 4 and dist <= 2):
                        expanded_terms.append(word)
        question_terms = list(set(expanded_terms))
    except Exception as e:
        print(f"Error executing copilot question expansion: {e}")
        
    # 2. Score and rank documents
    scored_docs = []
    for doc in docs:
        score = 0
        content_lower = doc.content.lower()
        title_lower = doc.title.lower()
        
        for term in question_terms:
            if term in title_lower:
                score += 50
            if term in content_lower:
                score += content_lower.count(term) * 5
                
        if score > 0:
            scored_docs.append((doc, score))
            
    scored_docs.sort(key=lambda x: x[1], reverse=True)
    
    if not scored_docs:
        return {
            "answer": "I searched the entire Magic Unified Knowledge Hub but could not find any matches related to your question. Try adjusting your spelling or searching for general keywords.",
            "citations": []
        }
        
    # Get top 3 matched documents
    top_docs = [item[0] for item in scored_docs[:3]]
    citations = [{"id": d.id, "title": d.title, "file_type": d.file_type} for d in top_docs]
    
    # 3. Local RAG Insight Synthesis: Pull best matching instructions/sentences
    extracted_insights = []
    for doc in top_docs:
        sentences = re.split(r'(?<=[.!?])\s+', doc.content)
        matched_sentences = []
        for s in sentences:
            s_clean = s.strip()
            if not s_clean:
                continue
            matches_count = sum(1 for term in question_terms if term in s_clean.lower())
            if matches_count > 0:
                matched_sentences.append((s_clean, matches_count))
                
        matched_sentences.sort(key=lambda x: x[1], reverse=True)
        extracted_insights.extend([s[0] for s in matched_sentences[:2]])
        
    # Clean unique insights
    unique_insights = []
    seen = set()
    for insight in extracted_insights:
        norm = insight.lower().strip()
        if norm not in seen and len(insight) > 20:
            seen.add(norm)
            unique_insights.append(insight)
            
    if not unique_insights:
        # Fall back to first document body summary
        summary = top_docs[0].content[:350] + "..."
        answer = f"According to **{top_docs[0].title}**:\n\n{summary}"
    else:
        # Generate beautifully organized enterprise-style response
        bullets = "\n".join([f"• {insight}" for insight in unique_insights[:5]])
        answer = f"According to articles inside the knowledge hub (including **{', '.join([d.title for d in top_docs])}**), here is the summarized step-by-step guidance:\n\n{bullets}\n\n*Check the cited articles below for full installation settings and diagrams.*"
        
    return {
        "answer": answer,
        "citations": citations
    }

def highlight_html_text_nodes(soup_element, query_terms):
    import bs4
    text_nodes = soup_element.find_all(string=True)
    for node in text_nodes:
        if isinstance(node, bs4.Comment) or (node.parent and node.parent.name in ['script', 'style', 'title', 'link']):
            continue
        original_text = node.string
        if not original_text:
            continue
            
        has_match = False
        new_text = original_text.lower()
        for term in query_terms:
            if term in new_text:
                has_match = True
                
        if has_match:
            highlighted = original_text
            for term in query_terms:
                pattern = re.compile(re.escape(term), re.IGNORECASE)
                highlighted = pattern.sub(lambda m: f"___MARK_START___{m.group(0)}___MARK_END___", highlighted)
            
            # Simple escape XML to prevent script injection but keep custom mark placeholders
            escaped = highlighted.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            escaped = escaped.replace("___MARK_START___", "<mark class='search-highlight'>").replace("___MARK_END___", "</mark>")
            
            fragment = BeautifulSoup(escaped, "html.parser")
            node.replace_with(fragment)

def highlight_plain_text(text, query_terms):
    escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    for term in query_terms:
        pattern = re.compile(re.escape(term), re.IGNORECASE)
        escaped = pattern.sub(lambda m: f"<mark class='search-highlight'>{m.group(0)}</mark>", escaped)
    return escaped

def reconstruct_pdf_paragraphs(text: str) -> str:
    if not text:
        return ""
        
    lines = text.split("\n")
    paragraphs = []
    current_para = []
    
    for line in lines:
        line_clean = line.strip()
        if not line_clean:
            if current_para:
                paragraphs.append(" ".join(current_para))
                current_para = []
            continue
            
        # List item markers
        is_list_marker = line_clean.startswith(('•', '-', '*', 'o ', '1. ', '2. ', '3. ', '4. ', '5. '))
        
        # Heading markers (starts with digit section like "1.2 ", "2. ", or is short and capitalized)
        is_heading_marker = False
        if re.match(r'^\d+(\.\d+)*\s+[A-Z]', line_clean) and len(line_clean) < 80:
            is_heading_marker = True
            
        if is_list_marker or is_heading_marker:
            if current_para:
                paragraphs.append(" ".join(current_para))
                current_para = []
            paragraphs.append(line_clean)
            continue
            
        current_para.append(line_clean)
        
        # Heuristic ends sentence or paragraph: short line ending with sentence structure
        if line_clean.endswith(('.', ':', '?', '!')) and len(line_clean) < 65:
            paragraphs.append(" ".join(current_para))
            current_para = []
            
    if current_para:
        paragraphs.append(" ".join(current_para))
        
    return "\n\n".join(paragraphs)

def convert_plain_text_to_html_confluence(content: str, query_terms: list = None, file_type: str = None) -> str:
    if not content:
        return ""
        
    if file_type == "pdf":
        content = reconstruct_pdf_paragraphs(content)
    
    # Split content into paragraphs by double newlines
    blocks = re.split(r'\n\s*\n', content)
    html_blocks = []
    
    # Highlight term helper
    def highlight_terms(txt):
        if not txt:
            return ""
        escaped = txt.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        if query_terms:
            for term in query_terms:
                pattern = re.compile(re.escape(term), re.IGNORECASE)
                escaped = pattern.sub(lambda m: f"<mark class='search-highlight'>{m.group(0)}</mark>", escaped)
        return escaped

    for block in blocks:
        block_clean = block.strip()
        if not block_clean:
            continue
            
        lines = [line.strip() for line in block_clean.split('\n') if line.strip()]
        if not lines:
            continue
            
        # 1. Is this block a short section heading?
        if len(lines) == 1 and len(block_clean) < 100 and not block_clean.endswith('.'):
            is_heading = False
            if re.match(r'^\d+(\.\d+)*\s+[A-Z]', block_clean):
                is_heading = True
            elif re.match(r'^[A-Z\d][a-zA-Z\d\s:,\-\'\(\)]+$', block_clean):
                words = block_clean.split()
                if len(words) <= 8:
                    is_heading = True
            
            if is_heading:
                highlighted_title = highlight_terms(block_clean)
                html_blocks.append(f"<h3 class='sop-section-heading' style='color:#fff; font-family:var(--font-display); font-size:1.3rem; font-weight:600; margin-top:2rem; margin-bottom:0.8rem; border-left:4px solid var(--accent-indigo); padding-left:12px; letter-spacing:-0.01em;'>{highlighted_title}</h3>")
                continue

        # 2. Is this a bulleted or numbered list?
        if any(line.startswith(('•', '-', '*', 'o ', 'a. ', 'b. ', 'c. ', '1. ', '2. ', '3. ')) for line in lines):
            list_items = []
            for line in lines:
                is_item = False
                prefix_pattern = r'^([•\-*o]|a\.\s+|b\.\s+|c\.\s+|\d+\.\s+)\s*'
                if re.match(prefix_pattern, line):
                    is_item = True
                    
                if is_item:
                    item_text = re.sub(prefix_pattern, '', line)
                    highlighted_item = highlight_terms(item_text)
                    list_items.append(f"<li style='margin-bottom:0.6rem; line-height:1.7; color:#d1d5db;'>{highlighted_item}</li>")
                else:
                    if list_items:
                        html_blocks.append(f"<ul style='margin-left:1.8rem; margin-bottom:1.2rem; list-style-type:disc;'>{''.join(list_items)}</ul>")
                        list_items = []
                    highlighted_para = highlight_terms(line)
                    html_blocks.append(f"<p style='margin-bottom:1.2rem; color:#d1d5db; line-height:1.8; font-size:0.95rem;'>{highlighted_para}</p>")
            if list_items:
                html_blocks.append(f"<ul style='margin-left:1.8rem; margin-bottom:1.2rem; list-style-type:disc;'>{''.join(list_items)}</ul>")
            continue
            
        # 3. Standard Paragraph block
        paragraph_text = " ".join(lines)
        highlighted_p = highlight_terms(paragraph_text)
        html_blocks.append(f"<p style='margin-bottom:1.4rem; color:#d1d5db; line-height:1.8; font-size:0.96rem; letter-spacing:0.01em;'>{highlighted_p}</p>")
        
    return "\n".join(html_blocks)

# ----------------- Document View Endpoint -----------------

@app.get("/api/document/{doc_id}")
def get_document(doc_id: int, q: Optional[str] = None, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Increment views count
    doc.views = (doc.views or 0) + 1
    db.commit()
    
    query_terms = []
    if q and q.strip():
        is_phrase = q.startswith('"') and q.endswith('"')
        if is_phrase:
            query_terms = [q[1:-1].lower().strip()]
        else:
            query_terms = [t.lower().strip() for t in q.split() if t.strip()]

    html_content = None
    if doc.file_type == "html" and os.path.exists(doc.file_path):
        try:
            with open(doc.file_path, "r", encoding="utf-8", errors="ignore") as f:
                soup = BeautifulSoup(f.read(), "html.parser")
                content_div = soup.find(id="main-content")
                if not content_div:
                    content_div = soup.find(class_="wiki-content")
                if not content_div:
                    content_div = soup.find("body")
                    
                if content_div:
                    # Clean up references to locally hosted confluence CSS if needed
                    for element in content_div(["script", "style"]):
                        element.decompose()
                    
                    # Highlight query terms safely inside text nodes
                    if query_terms:
                        highlight_html_text_nodes(content_div, query_terms)
                        
                    html_content = str(content_div)
        except Exception as e:
            print(f"Error reading raw HTML: {e}")
    elif doc.file_type == "docx" and os.path.exists(doc.file_path + ".html"):
        try:
            with open(doc.file_path + ".html", "r", encoding="utf-8", errors="ignore") as f:
                html_val = f.read()
                # Wrap in confluence-styled div container
                html_content = f'<div class="wiki-content group">{html_val}</div>'
        except Exception as e:
            print(f"Error reading generated DOCX HTML: {e}")
            
    display_content = doc.content
    if not html_content:
        # Dynamically generate beautiful, structured Confluence-style HTML layout for non-HTML pages
        html_content = convert_plain_text_to_html_confluence(doc.content, query_terms, doc.file_type)
        if query_terms:
            display_content = highlight_plain_text(doc.content, query_terms)
        else:
            display_content = doc.content.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            
        # Scan for dynamically extracted images/attachments on disk
        try:
            doc_filename = os.path.basename(doc.file_path)
            doc_dir_name = re.sub(r'\W+', '_', doc_filename)
            attachments_dir = os.path.join(CONFLUENCE_DIR, "attachments", doc_dir_name)
            
            if os.path.exists(attachments_dir):
                files = os.listdir(attachments_dir)
                img_files = [f for f in files if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif'))]
                if img_files:
                    gallery_html = f"""
                    <div class="sop-attachments-gallery" style="margin-top: 3rem; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 24px;">
                        <h4 style="color:#fff; font-family:var(--font-display); font-size:1.15rem; font-weight:600; margin-bottom:16px; display:flex; align-items:center; gap:6px;">
                            <i data-lucide="paperclip" style="width:16px; height:16px;"></i> Embedded Screenshots & Figures ({len(img_files)})
                        </h4>
                        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px;">
                    """
                    for img in sorted(img_files):
                        img_url = f"/attachments/{doc_dir_name}/{img}"
                        gallery_html += f"""
                        <div class="glass-panel attachment-card" style="padding: 10px; border-radius: 12px; background: rgba(255,255,255,0.015); border: 1px solid rgba(255,255,255,0.06); text-align: center; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.15);">
                            <a href="{img_url}" target="_blank" style="display:block; overflow:hidden; border-radius:8px; background:rgba(0,0,0,0.25); height:160px; display:flex; align-items:center; justify-content:center;">
                                <img src="{img_url}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:4px;" />
                            </a>
                            <p style="font-size:0.72rem; color:var(--text-muted); margin-top:8px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; text-align:left; padding-left:4px;">{img}</p>
                        </div>
                        """
                    gallery_html += "</div></div>"
                    html_content += gallery_html
        except Exception as e:
            print(f"Error loading document attachments gallery: {e}")
            
    return {
        "id": doc.id,
        "title": doc.title,
        "file_type": doc.file_type,
        "author": doc.author,
        "breadcrumbs": json.loads(doc.breadcrumbs) if doc.breadcrumbs else [],
        "created_at": doc.created_at.strftime("%Y-%m-%d %H:%M:%S"),
        "content": display_content,
        "html_content": html_content,
        "views": doc.views,
        "likes": doc.likes,
        "tags": doc.tags,
        "is_pinned": bool(doc.is_pinned)
    }


@app.get("/api/document/raw/{doc_id}")
def get_raw_document(doc_id: int, q: Optional[str] = None, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
        
    from fastapi.responses import HTMLResponse, FileResponse
    
    if doc.file_type == "html":
        try:
            with open(doc.file_path, "r", encoding="utf-8", errors="ignore") as f:
                soup = BeautifulSoup(f.read(), "html.parser")
                
                # Prepend <base href="/"> to resolve stylesheets and attachments relative to server root
                head = soup.find("head")
                if not head:
                    head = soup.new_tag("head")
                    if soup.html:
                        soup.html.insert(0, head)
                
                # Inject base tag
                base_tag = soup.new_tag("base", href="/")
                head.insert(0, base_tag)
                
                # Highlight query terms safely inside text nodes
                if q and q.strip():
                    is_phrase = q.startswith('"') and q.endswith('"')
                    if is_phrase:
                        query_terms = [q[1:-1].lower().strip()]
                    else:
                        query_terms = [t.lower().strip() for t in q.split() if t.strip()]
                    highlight_html_text_nodes(soup, query_terms)
                
                return HTMLResponse(content=str(soup))
        except Exception as e:
            print(f"Error processing raw HTML: {e}")
            
    # Default file serving (PDF, TXT, MD, etc.)
    media_type = "application/octet-stream"
    if doc.file_type == "pdf":
        media_type = "application/pdf"
    elif doc.file_type == "txt":
        media_type = "text/plain"
        
    return FileResponse(doc.file_path, media_type=media_type)

@app.get("/magic_logo.png")
def get_magic_logo():
    # Serve directly from the frontend directory (canonical, always reliable)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    logo_path = os.path.join(base_dir, "frontend", "magic_logo.png")
    if os.path.exists(logo_path):
        return FileResponse(logo_path, media_type="image/png")
    # Fallback: try the original source artifact path
    fallback_path = r"C:\Users\apawar\.gemini\antigravity-ide\brain\a168cb03-3358-49c6-ba07-089e189ed1d0\media__1784751445167.png"
    if os.path.exists(fallback_path):
        return FileResponse(fallback_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="Logo not found")

# ----------------- Upload & Creation Endpoints -----------------

def run_scan_and_index_bg():
    db = SessionLocal()
    try:
        scan_and_index(db)
    finally:
        db.close()

@app.post("/api/upload")
def upload_files(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Restrict to Editors and Admins
    if current_user.role not in ["Admin", "Editor"]:
        raise HTTPException(status_code=403, detail="Permission denied")
        
    saved_files = []
    indexed_docs = []
    errors = []
    
    for file in files:
        # Standardize file extension check
        ext = file.filename.split(".")[-1].lower()
        if ext not in ["html", "pdf", "docx", "txt", "md"]:
            errors.append(f"{file.filename}: Invalid format (only HTML, PDF, DOCX, TXT, MD allowed)")
            continue
            
        file_path = os.path.join(UPLOADS_DIR, file.filename)
        try:
            with open(file_path, "wb") as f:
                shutil.copyfileobj(file.file, f)
            saved_files.append(file.filename)
            
            # Immediately parse & index single file into database (under 50ms)
            doc = index_single_file(file_path, ext, db)
            if doc:
                indexed_docs.append({
                    "id": doc.id,
                    "title": doc.title,
                    "file_type": doc.file_type
                })
        except Exception as e:
            errors.append(f"{file.filename}: Failed to save ({e})")
            
    # Trigger full background sync asynchronously
    background_tasks.add_task(run_scan_and_index_bg)
    
    return {
        "message": f"Successfully uploaded and indexed {len(indexed_docs)} file(s).",
        "uploaded": saved_files,
        "indexed_count": len(indexed_docs),
        "indexed_docs": indexed_docs,
        "errors": errors,
        "indexing_message": "Files instantly indexed into Knowledge Hub database."
    }

@app.post("/api/create-article")
def create_article(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    content: str = Form(...),
    category: str = Form("General"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Restrict to Editors and Admins
    if current_user.role not in ["Admin", "Editor"]:
        raise HTTPException(status_code=403, detail="Permission denied")
        
    # Clean file name
    clean_title = re.sub(r'[^\w\s-]', '', title).strip().replace(" ", "-")
    file_name = f"{clean_title}_{int(datetime.utcnow().timestamp())}.html"
    file_path = os.path.join(UPLOADS_DIR, file_name)
    
    # Structure text into Confluence-like HTML format
    html_content = f"""<!DOCTYPE html>
<html>
    <head>
        <title>{title}</title>
        <link rel="stylesheet" href="styles/site.css" type="text/css" />
        <META http-equiv="Content-Type" content="text/html; charset=UTF-8">
    </head>
    <body class="theme-default aui-theme-default">
        <div id="page">
            <div id="main" class="aui-page-panel">
                <div id="main-header">
                    <div id="breadcrumb-section">
                        <ol id="breadcrumbs">
                            <li class="first"><span><a href="index.html">Magic Support</a></span></li>
                            <li><span><a href="#">{category}</a></span></li>
                        </ol>
                    </div>
                    <h1 id="title-heading" class="pagetitle">
                        <span id="title-text">{title}</span>
                    </h1>
                </div>
                <div id="content" class="view">
                    <div class="page-metadata">
                        Created by <span class='author'>{current_user.username}</span> on {datetime.now().strftime("%d, %b, %Y")}
                    </div>
                    <div id="main-content" class="wiki-content group">
                        {content}
                    </div>
                </div>
            </div>
        </div>
    </body>
</html>
"""
    
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(html_content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create file: {e}")
        
    # Immediately index new article into DB
    doc = index_single_file(file_path, "html", db)
    
    # Background full re-scan
    background_tasks.add_task(run_scan_and_index_bg)
    
    return {
        "message": "Article published and indexed successfully",
        "file_name": file_name,
        "doc_id": doc.id if doc else None,
        "indexing_message": "Article instantly indexed and available in Search & Explorer."
    }

# ----------------- Admin Endpoints -----------------

@app.get("/api/admin/users")
def get_users(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    users = db.query(User).all()
    return [{"id": u.id, "username": u.username, "role": u.role} for u in users]

@app.post("/api/admin/users")
def create_user(
    username: str = Form(...),
    password: str = Form(...),
    role: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
        
    # Check if user exists
    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
        
    hashed_pw = get_password_hash(password)
    new_user = User(username=username, hashed_password=hashed_pw, role=role)
    db.add(new_user)
    db.commit()
    return {"message": f"User {username} created successfully"}

@app.delete("/api/admin/users/{user_id}")
def delete_user(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.username == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete default administrator account")
        
    db.delete(user)
    db.commit()
    return {"message": f"User {user.username} deleted"}

@app.post("/api/admin/reindex")
def trigger_reindex(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    try:
        count, msg = scan_and_index(db)
        return {"message": "Reindexing complete", "count": count, "log": msg}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reindexing failed: {e}")

@app.get("/api/admin/logs")
def get_logs(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    logs = db.query(IndexLog).order_by(IndexLog.timestamp.desc()).limit(10).all()
    return [{
        "id": l.id,
        "timestamp": l.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
        "status": l.status,
        "message": l.message,
        "indexed_count": l.indexed_count
    } for l in logs]

@app.get("/api/admin/files")
def get_files(current_user: User = Depends(get_current_user)):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
        
    files_list = []
    if os.path.exists(UPLOADS_DIR):
        for file in os.listdir(UPLOADS_DIR):
            file_path = os.path.join(UPLOADS_DIR, file)
            if os.path.isfile(file_path):
                stat = os.stat(file_path)
                files_list.append({
                    "name": file,
                    "size": stat.st_size,
                    "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
                })
    return files_list

@app.delete("/api/admin/files/{filename}")
def delete_file(filename: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
        
    file_path = os.path.join(UPLOADS_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    try:
        os.remove(file_path)
        # Automatically update index
        scan_and_index(db)
        return {"message": f"Successfully deleted {filename} and reindexed database."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {e}")

# ----------------- Space & Tree Endpoints -----------------

@app.get("/api/spaces")
def get_spaces(db: Session = Depends(get_db)):
    docs = db.query(Document).all()
    spaces = set()
    for doc in docs:
        crumbs = json.loads(doc.breadcrumbs) if doc.breadcrumbs else []
        if crumbs:
            spaces.add(crumbs[0])
        else:
            spaces.add("General")
    # Never expose the internal Uploads space to end users
    spaces.discard("Uploads")
    spaces.discard("uploads")
    return sorted(list(spaces))

@app.get("/api/space/{space_name}/tree")
def get_space_tree(space_name: str, db: Session = Depends(get_db)):
    # Internal-only folders hidden from end users in the tree
    HIDDEN_FOLDERS = {"uploads", "Uploads"}

    docs = db.query(Document).all()
    space_docs = []
    
    for doc in docs:
        crumbs = json.loads(doc.breadcrumbs) if doc.breadcrumbs else []
        # Skip documents whose root breadcrumb is a hidden folder
        if crumbs and crumbs[0] in HIDDEN_FOLDERS:
            continue
        if space_name == "all":
            space_docs.append(doc)
        elif not crumbs and space_name == "General":
            space_docs.append(doc)
        elif crumbs and crumbs[0] == space_name:
            space_docs.append(doc)
            
    tree_map = {}
    root_nodes = []
    
    # Sort docs by breadcrumb list length so parents are processed first
    space_docs.sort(key=lambda d: len(json.loads(d.breadcrumbs) if d.breadcrumbs else []))
    
    for doc in space_docs:
        crumbs = json.loads(doc.breadcrumbs) if doc.breadcrumbs else []
        if space_name == "all":
            # For unified tree, include the space name as the top root directory segment
            if crumbs:
                rel_path = tuple(crumbs + [doc.title])
            else:
                rel_path = ("General", doc.title)
        elif crumbs and crumbs[0] == space_name:
            rel_path = tuple(crumbs[1:] + [doc.title])
        else:
            rel_path = (doc.title,)
            
        current_path = []
        parent_node_children = root_nodes
        
        for i, segment in enumerate(rel_path):
            current_path.append(segment)
            path_key = tuple(current_path)
            is_leaf = (i == len(rel_path) - 1)
            
            if path_key not in tree_map:
                node = {
                    "title": segment,
                    "id": doc.id if is_leaf else None,
                    "children": [],
                    "type": "page" if is_leaf else "folder",
                    "file_type": doc.file_type if is_leaf else None
                }
                tree_map[path_key] = node
                parent_node_children.append(node)
            else:
                if is_leaf:
                    tree_map[path_key]["id"] = doc.id
                    tree_map[path_key]["type"] = "page"
                    tree_map[path_key]["file_type"] = doc.file_type
                    
            parent_node_children = tree_map[path_key]["children"]
            
    return root_nodes


# ----------------- Enterprise Explorer Endpoints -----------------

@app.get("/api/tags")
def get_all_tags(db: Session = Depends(get_db)):
    """Returns all unique tags used across indexed documents, sorted by frequency."""
    docs = db.query(Document.tags).all()
    tag_freq = {}
    for (tags_str,) in docs:
        if tags_str:
            for tag in tags_str.split(','):
                tag = tag.strip().lower()
                if tag:
                    tag_freq[tag] = tag_freq.get(tag, 0) + 1
    # Sort by frequency descending, return top 30
    sorted_tags = sorted(tag_freq.items(), key=lambda x: x[1], reverse=True)
    return [{"tag": t, "count": c} for t, c in sorted_tags[:30]]


@app.get("/api/recently-viewed")
def get_recently_viewed(ids: str, db: Session = Depends(get_db)):
    """Given a comma-separated list of doc IDs (from localStorage), returns stubs in order."""
    if not ids or not ids.strip():
        return []
    try:
        id_list = [int(x.strip()) for x in ids.split(',') if x.strip().isdigit()]
    except Exception:
        return []
    if not id_list:
        return []
    docs_by_id = {}
    docs = db.query(Document).filter(Document.id.in_(id_list)).all()
    for doc in docs:
        docs_by_id[doc.id] = {
            "id": doc.id,
            "title": doc.title,
            "file_type": doc.file_type,
            "breadcrumbs": json.loads(doc.breadcrumbs) if doc.breadcrumbs else []
        }
    # Preserve order from request (most recent first)
    return [docs_by_id[i] for i in id_list if i in docs_by_id]


@app.get("/api/pinned")
def get_pinned(db: Session = Depends(get_db)):
    """Returns all manually pinned documents."""
    docs = db.query(Document).filter(Document.is_pinned == True).all()
    return [{
        "id": d.id,
        "title": d.title,
        "file_type": d.file_type,
        "views": d.views or 0
    } for d in docs]

@app.post("/api/document/{doc_id}/pin")
def toggle_pin(doc_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Toggle pin status of a document (Admin/Editor only)."""
    if current_user.role not in ["Admin", "Editor"]:
        raise HTTPException(status_code=403, detail="Only Admins and Editors can pin pages")
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    doc.is_pinned = not bool(doc.is_pinned)
    db.commit()
    return {
        "id": doc.id,
        "is_pinned": doc.is_pinned,
        "message": f"Document {'pinned' if doc.is_pinned else 'unpinned'} successfully"
    }

# ----------------- Comment Endpoints -----------------

@app.post("/api/document/{doc_id}/comments")
def add_comment(doc_id: int, content: str = Form(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    comment = Comment(document_id=doc_id, username=current_user.username, content=content)
    db.add(comment)
    db.commit()
    return {
        "id": comment.id,
        "username": comment.username,
        "content": comment.content,
        "created_at": comment.created_at.strftime("%Y-%m-%d %H:%M:%S")
    }

@app.get("/api/document/{doc_id}/comments")
def get_comments(doc_id: int, db: Session = Depends(get_db)):
    comments = db.query(Comment).filter(Comment.document_id == doc_id).order_by(Comment.created_at.desc()).all()
    return [{
        "id": c.id,
        "username": c.username,
        "content": c.content,
        "created_at": c.created_at.strftime("%Y-%m-%d %H:%M:%S")
    } for c in comments]

@app.delete("/api/comment/{comment_id}")
def delete_comment(comment_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.username != current_user.username and current_user.role not in ["Admin", "Editor"]:
        raise HTTPException(status_code=403, detail="Permission denied")
    db.delete(comment)
    db.commit()
    return {"message": "Comment deleted successfully"}

# ----------------- Favorites & Social Endpoints -----------------

@app.post("/api/document/{doc_id}/favorite")
def toggle_favorite(doc_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    favorite = db.query(Favorite).filter(Favorite.document_id == doc_id, Favorite.username == current_user.username).first()
    if favorite:
        db.delete(favorite)
        db.commit()
        return {"favorited": False, "message": "Removed from favorites"}
    else:
        new_favorite = Favorite(document_id=doc_id, username=current_user.username)
        db.add(new_favorite)
        db.commit()
        return {"favorited": True, "message": "Added to favorites"}

@app.get("/api/favorites")
def get_favorites(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    favorites = db.query(Favorite).filter(Favorite.username == current_user.username).all()
    doc_ids = [f.document_id for f in favorites]
    docs = db.query(Document).filter(Document.id.in_(doc_ids)).all() if doc_ids else []
    return [{
        "id": d.id,
        "title": d.title,
        "file_type": d.file_type,
        "breadcrumbs": json.loads(d.breadcrumbs) if d.breadcrumbs else []
    } for d in docs]

@app.post("/api/document/{doc_id}/like")
def like_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.likes = (doc.likes or 0) + 1
    db.commit()
    return {"likes": doc.likes}

# ----------------- Edit Document & Stats Endpoints -----------------

@app.put("/api/document/{doc_id}")
def update_document(
    doc_id: int,
    title: str = Form(...),
    content: str = Form(...),
    tags: str = Form(""),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ["Admin", "Editor"]:
        raise HTTPException(status_code=403, detail="Permission denied")
        
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    if doc.file_type in ["html", "txt", "md"] and os.path.exists(doc.file_path):
        try:
            if doc.file_type == "html":
                with open(doc.file_path, "r", encoding="utf-8", errors="ignore") as f:
                    soup = BeautifulSoup(f.read(), "html.parser")
                
                content_div = soup.find(id="main-content")
                if not content_div:
                    content_div = soup.find(class_="wiki-content")
                if not content_div:
                    content_div = soup.find("body")
                    
                title_tag = soup.find(id="title-text")
                if not title_tag:
                    title_tag = soup.find("title")
                    
                if title_tag:
                    title_tag.string = title
                
                if content_div:
                    content_div.clear()
                    new_content_soup = BeautifulSoup(content, "html.parser")
                    content_div.append(new_content_soup)
                else:
                    body = soup.find("body")
                    if body:
                        body.clear()
                        body.append(BeautifulSoup(content, "html.parser"))
                        
                with open(doc.file_path, "w", encoding="utf-8") as f:
                    f.write(str(soup))
            else:
                with open(doc.file_path, "w", encoding="utf-8") as f:
                    f.write(content)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to update file on disk: {e}")
            
    doc.title = title
    if doc.file_type == "html":
        clean_text = BeautifulSoup(content, "html.parser").get_text(separator=" ")
    else:
        clean_text = content
    doc.content = re.sub(r"\s+", " ", clean_text).strip()
    doc.tags = tags
    db.commit()
    
    return {
        "id": doc.id,
        "title": doc.title,
        "file_type": doc.file_type,
        "tags": doc.tags,
        "message": "Document updated and reindexed successfully."
    }

@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    total_docs = db.query(Document).count()
    total_views = db.query(func.sum(Document.views)).scalar() or 0
    total_likes = db.query(func.sum(Document.likes)).scalar() or 0
    total_comments = db.query(Comment).count()
    
    trending = db.query(Document).order_by(Document.views.desc()).limit(5).all()
    
    return {
        "total_documents": total_docs,
        "total_views": total_views,
        "total_likes": total_likes,
        "total_comments": total_comments,
        "trending": [{
            "id": d.id,
            "title": d.title,
            "views": d.views,
            "likes": d.likes,
            "file_type": d.file_type
        } for d in trending]
    }

# Serve static frontend files at the root
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
frontend_dir = os.path.join(BASE_DIR, "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

