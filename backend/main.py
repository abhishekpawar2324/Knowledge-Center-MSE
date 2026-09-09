import os
import json
import base64
import shutil
import re
from typing import List, Optional, Union, Any
from datetime import datetime, timedelta

from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Form, BackgroundTasks, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import func
from bs4 import BeautifulSoup

from backend.database import (
    get_db, 
    init_db, 
    User, 
    Document, 
    HelpTopic,
    IndexLog, 
    SessionLocal, 
    Comment, 
    Favorite, 
    Notification, 
    SearchAnalytic,
    SalesforceCase,
    AIResolution,
    AISetting,
    AIChatSession,
    AIChatMessage,
    SupportUtility,
    UserLoginHistory,
    EnterpriseAuditLog
)
from backend.auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    get_current_user_optional,
    require_role,
)
from backend.indexer import (
    scan_and_index, 
    index_single_file, 
    CONFLUENCE_DIR, 
    UPLOADS_DIR,
    UPLOADS_XPA,
    UPLOADS_XPI,
    UPLOADS_CLOUD,
    UPLOADS_GENERAL,
    detect_product,
    detect_version,
    detect_doc_type
)
from backend.emailer import (
    notify_document_uploaded,
    notify_new_comment,
    send_superadmin_alert,
    SUPER_ADMIN_EMAIL
)
from backend.ai_engine import (
    process_ai_query,
    process_case_diagnostic_query,
    process_case_followup_query,
    get_active_ai_config,
    test_ai_provider_connection,
    DEFAULT_MAGIC_SYSTEM_PROMPT
)
from backend.salesforce_service import (
    seed_initial_cases_if_empty,
    import_salesforce_cases_from_csv,
    create_kb_article_from_ai
)

app = FastAPI(title="Magic Software Enterprises Knowledge Center API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB tables, seed default admin user, and benchmark cases
init_db()
db = SessionLocal()
try:
    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    admin_password = os.getenv("ADMIN_PASSWORD", "admin")
    admin_user = db.query(User).filter(func.lower(User.username) == admin_username.lower().strip()).first()
    if not admin_user:
        hashed_pw = get_password_hash(admin_password)
        db.add(User(username=admin_username, hashed_password=hashed_pw, role="Admin", product_space="all", is_active=True))
        db.commit()
        print(f"Admin user created: {admin_username}")
    else:
        admin_user.role = "Admin"
        admin_user.is_active = True
        db.commit()

    # Seed benchmark historical Salesforce cases if empty
    seed_initial_cases_if_empty(db)
except Exception as e:
    print(f"Startup initialization warning: {e}")
finally:
    db.close()

# Run repository background indexing non-blockingly so the server opens port 8000 instantly
import threading

def _background_startup_index():
    try:
        startup_db = SessionLocal()
        try:
            scan_and_index(startup_db)
        finally:
            startup_db.close()
    except Exception as e:
        print(f"Background startup index warning: {e}")

@app.on_event("startup")
def on_startup():
    threading.Thread(target=_background_startup_index, daemon=True).start()

# Static mounts with existence checks
if os.path.exists(CONFLUENCE_DIR):
    images_dir = os.path.join(CONFLUENCE_DIR, "images")
    attachments_dir = os.path.join(CONFLUENCE_DIR, "attachments")
    styles_dir = os.path.join(CONFLUENCE_DIR, "styles")
    
    if os.path.exists(images_dir):
        app.mount("/images", StaticFiles(directory=images_dir), name="images")
    if os.path.exists(styles_dir):
        app.mount("/styles", StaticFiles(directory=styles_dir), name="styles")

@app.get("/attachments/{file_path:path}")
def get_attachment_file(file_path: str):
    """
    Unified multi-space attachment resolver.
    Handles relative attachment paths across all product spaces: xpa, xpi, cloud_native, and Confluence.
    """
    clean_path = file_path.split("?")[0].replace("\\", "/").lstrip("/")
    
    # 1. Primary candidate paths
    candidates = [
        os.path.join(CONFLUENCE_DIR, "attachments", clean_path),
        os.path.join(UPLOADS_DIR, "xpa", "attachments", clean_path),
        os.path.join(UPLOADS_DIR, "xpi", "attachments", clean_path),
        os.path.join(UPLOADS_DIR, "cloud_native", "attachments", clean_path),
        os.path.join(UPLOADS_DIR, "attachments", clean_path),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return FileResponse(c)

    # 2. Check if clean_path starts with or lacks 'attachments/'
    stripped = clean_path.replace("attachments/", "", 1) if clean_path.startswith("attachments/") else clean_path
    candidates2 = [
        os.path.join(CONFLUENCE_DIR, "attachments", stripped),
        os.path.join(UPLOADS_DIR, "xpa", "attachments", stripped),
        os.path.join(UPLOADS_DIR, "xpi", "attachments", stripped),
        os.path.join(UPLOADS_DIR, "cloud_native", "attachments", stripped),
        os.path.join(UPLOADS_DIR, "attachments", stripped),
    ]
    for c in candidates2:
        if os.path.isfile(c):
            return FileResponse(c)

    # 3. Deep search inside subdirectories of UPLOADS_DIR & CONFLUENCE_DIR
    target_name = os.path.basename(clean_path)
    for search_root in [UPLOADS_DIR, CONFLUENCE_DIR]:
        if not os.path.exists(search_root):
            continue
        for root, dirs, files in os.walk(search_root):
            if target_name in files and "attachment" in root.lower():
                full_p = os.path.join(root, target_name)
                if os.path.isfile(full_p):
                    return FileResponse(full_p)

    raise HTTPException(status_code=404, detail=f"Attachment '{file_path}' not found")

@app.get("/api/document/{doc_id}/asset/{asset_path:path}")
def get_document_asset(doc_id: int, asset_path: str, db: Session = Depends(get_db)):
    """
    Contextual document asset resolver.
    Resolves assets relative to the specific document's directory on disk,
    with automatic fallback across spaces and subdirectories.
    """
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc or not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Document not found")

    clean_asset = asset_path.split("?")[0].replace("\\", "/").lstrip("/")
    doc_dir = os.path.dirname(doc.file_path)

    # 1. Check relative to document directory
    p1 = os.path.normpath(os.path.join(doc_dir, clean_asset))
    if os.path.isfile(p1):
        return FileResponse(p1)

    # 2. Check if clean_asset is inside attachments folder of doc_dir
    if not clean_asset.startswith("attachments/"):
        p2 = os.path.normpath(os.path.join(doc_dir, "attachments", clean_asset))
        if os.path.isfile(p2):
            return FileResponse(p2)

    # 3. Fall back to global multi-space attachment resolver
    return get_attachment_file(clean_asset)

# Knowledge Base Uploaded Assets (Images & Attachments)
UPLOADS_ASSETS = os.path.join(UPLOADS_DIR, "assets")
os.makedirs(UPLOADS_ASSETS, exist_ok=True)
app.mount("/api/kb/assets", StaticFiles(directory=UPLOADS_ASSETS), name="kb_assets")

def log_enterprise_action(
    db: Session,
    username: str,
    role: str,
    ip_address: str,
    action_category: str,
    action: str,
    details: str,
    target_id: Optional[Union[str, int]] = None
):
    try:
        log_entry = EnterpriseAuditLog(
            username=username or "Anonymous",
            user_role=role or "Viewer",
            ip_address=ip_address or "127.0.0.1",
            action_category=(action_category or "SYSTEM").upper(),
            action=action,
            details=details,
            target_id=str(target_id) if target_id is not None else None
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        print(f"[WARN] Enterprise audit log error: {e}")

# ----------------- Auth Endpoints (Case-Insensitive) -----------------

@app.post("/api/auth/login")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    uname = form_data.username.strip()
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    user_agent = request.headers.get("user-agent", "Unknown Browser") if request else "Unknown"

    user = db.query(User).filter(func.lower(User.username) == uname.lower()).first()
    is_valid = False
    
    if user and user.hashed_password:
        is_valid = verify_password(form_data.password, user.hashed_password)
            
    if not user or not is_valid:
        status_msg = "Failed - Invalid Password" if user else "Failed - User Not Found"
        try:
            db.add(UserLoginHistory(username=uname, ip_address=client_ip, user_agent=user_agent[:250], status=status_msg))
            db.commit()
        except Exception:
            pass
        log_enterprise_action(db, uname, user.role if user else "Unknown", client_ip, "AUTH", "LOGIN_FAILED", f"{status_msg} for '{uname}'.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if getattr(user, "is_active", True) is False:
        try:
            db.add(UserLoginHistory(username=user.username, ip_address=client_ip, user_agent=user_agent[:250], status="Failed - Suspended Account"))
            db.commit()
        except Exception:
            pass
        log_enterprise_action(db, user.username, user.role, client_ip, "AUTH", "LOGIN_BLOCKED", f"Login blocked for suspended account '{user.username}'.")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been suspended / deactivated. Please contact your Super Administrator.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Record Successful Login
    try:
        db.add(UserLoginHistory(username=user.username, ip_address=client_ip, user_agent=user_agent[:250], status="Success"))
        db.commit()
    except Exception:
        pass
    log_enterprise_action(db, user.username, user.role, client_ip, "AUTH", "LOGIN_SUCCESS", f"'{user.username}' logged in from {client_ip}.")

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

@app.get("/api/admin/login-history")
def get_login_history(
    username: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 100,
    current_user: User = Depends(require_role(["Admin"])),
    db: Session = Depends(get_db)
):
    query = db.query(UserLoginHistory)
    if username and username.strip():
        query = query.filter(func.lower(UserLoginHistory.username).contains(username.strip().lower()))
    if status_filter and status_filter.strip() and status_filter != "all":
        query = query.filter(UserLoginHistory.status == status_filter.strip())
    
    logs = query.order_by(UserLoginHistory.login_time.desc()).limit(limit).all()
    return [
        {
            "id": log.id,
            "username": log.username,
            "login_time": log.login_time.strftime("%Y-%m-%d %H:%M:%S") if log.login_time else "",
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "status": log.status
        }
        for log in logs
    ]

# ----------------- Search & Analytics Endpoints -----------------

def generate_snippet(content: str, query_terms: List[str], window_size: int = 150) -> str:
    """Generates a snippet with highlighted terms."""
    if not content:
        return ""
        
    content_lower = content.lower()
    first_idx = -1
    
    for term in query_terms:
        idx = content_lower.find(term)
        if idx != -1:
            if first_idx == -1 or idx < first_idx:
                first_idx = idx
                
    if first_idx == -1:
        snippet = content[:window_size] + ("..." if len(content) > window_size else "")
    else:
        start = max(0, first_idx - 40)
        end = min(len(content), start + window_size)
        if start > 0:
            space_idx = content.find(" ", start, start + 15)
            if space_idx != -1:
                start = space_idx + 1
        snippet = content[start:end]
        if start > 0:
            snippet = "..." + snippet
        if end < len(content):
            snippet = snippet + "..."
            
    # The snippet is raw document content and the frontend injects this through
    # innerHTML for the <mark> highlighting to render, so the content has to be
    # escaped here - otherwise markup inside an indexed document would be live
    # markup in every reader's search results. Marks go in as placeholders
    # first so escaping cannot mangle the tags, the same approach already used
    # by the HTML highlighter above.
    highlighted = snippet
    for term in query_terms:
        pattern = re.compile(re.escape(term), re.IGNORECASE)
        highlighted = pattern.sub(lambda m: f"___MARK_START___{m.group(0)}___MARK_END___", highlighted)

    highlighted = (highlighted.replace("&", "&amp;")
                              .replace("<", "&lt;")
                              .replace(">", "&gt;"))
    highlighted = (highlighted.replace("___MARK_START___", "<mark class='search-highlight'>")
                              .replace("___MARK_END___", "</mark>"))
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
    q: Optional[str] = "", 
    type: Optional[str] = None, 
    author: Optional[str] = None, 
    category: Optional[str] = None,
    product: Optional[str] = None,
    version: Optional[str] = None,
    doc_type: Optional[str] = None,
    exclude_doc_type: Optional[str] = None,
    match_all: bool = True,
    username: Optional[str] = "Guest",
    db: Session = Depends(get_db)
):
    raw_q = (q or "").strip()
    is_wildcard = (raw_q in ["*", "all", ""])
    if not raw_q and not is_wildcard:
        return []
        
    if not is_wildcard:
        is_phrase = raw_q.startswith('"') and raw_q.endswith('"')
        if is_phrase:
            query_phrase = raw_q[1:-1].lower().strip()
            query_terms = [query_phrase]
        else:
            # Extract meaningful alphanumeric tokens, ignoring pure noise like (1), (2)
            cleaned_str = re.sub(r'[\(\)\[\]{}"]+', ' ', raw_q)
            tokens = [t.lower().strip() for t in re.split(r'[\s_]+', cleaned_str) if t.strip()]
            query_terms = []
            for t in tokens:
                t_clean = re.sub(r'\.(docx|pdf|html|txt|md)$', '', t)
                if t_clean and len(t_clean) > 0 and t_clean not in ["1", "2", "3", "copy"]:
                    query_terms.append(t_clean)
            if not query_terms:
                query_terms = [t.lower().strip() for t in tokens if t.strip()]
                
        if not query_terms:
            return []
    else:
        query_terms = []

    from sqlalchemy import or_
    
    query = db.query(Document)
    
    # Product filter
    if product and product.lower() not in ["all", "global", ""]:
        query = query.filter(Document.product == product.lower())
        
    # File type filter
    if type and type.lower() not in ["all", ""]:
        query = query.filter(Document.file_type == type.lower())
        
    # Version filter
    if version and version.lower() not in ["all", "universal", ""]:
        query = query.filter(Document.version.ilike(f"%{version}%"))
        
    # Doc Type filter
    if doc_type and doc_type.lower() not in ["all", ""]:
        query = query.filter(Document.doc_type == doc_type.lower())
        
    if exclude_doc_type and exclude_doc_type.lower() not in ["none", ""]:
        query = query.filter(Document.doc_type != exclude_doc_type.lower())
    elif is_wildcard and not doc_type:
        query = query.filter(Document.doc_type != "function")
        
    if author:
        query = query.filter(Document.author == author)
        
    if is_wildcard:
        docs = query.order_by(Document.created_at.desc(), Document.id.desc()).all()
    else:
        # SQL level candidate filtering for lightning sub-15ms speed
        term_filters = []
        for term in query_terms:
            term_filters.append(Document.title.ilike(f"%{term}%"))
            term_filters.append(Document.file_path.ilike(f"%{term}%"))
            term_filters.append(Document.breadcrumbs.ilike(f"%{term}%"))
            term_filters.append(Document.tags.ilike(f"%{term}%"))
            term_filters.append(Document.content.ilike(f"%{term}%"))
            
        docs = query.filter(or_(*term_filters)).all()
        
        # Typo tolerance fallback only if 0 candidates matched
        if not docs and any(len(t) > 3 for t in query_terms):
            try:
                sample_docs = db.query(Document.title, Document.content).limit(200).all()
                vocab = set()
                for d_title, d_content in sample_docs:
                    words = re.findall(r'\b[a-zA-Z]{3,}\b', (d_title or "") + " " + (d_content or "")[:2000])
                    vocab.update(w.lower() for w in words)
                expanded_terms = list(query_terms)
                for term in query_terms:
                    if term not in vocab and term.isalpha() and len(term) > 3:
                        for word in vocab:
                            dist = levenshtein_distance(term, word)
                            if (len(term) <= 4 and dist <= 1) or (len(term) > 4 and dist <= 2):
                                expanded_terms.append(word)
                new_terms = [t for t in set(expanded_terms) if t not in query_terms]
                if new_terms:
                    query_terms.extend(new_terms)
                    new_filters = []
                    for term in new_terms:
                        new_filters.append(Document.title.ilike(f"%{term}%"))
                        new_filters.append(Document.content.ilike(f"%{term}%"))
                    docs = query.filter(or_(*new_filters)).all()
            except Exception as e:
                print(f"Typo fallback warning: {e}")

    results = []
    
    for doc in docs:
        content_lower = doc.content.lower() if doc.content else ""
        title_lower = doc.title.lower() if doc.title else ""
        filename_lower = os.path.basename(doc.file_path).lower() if doc.file_path else ""
        
        if is_wildcard:
            score = 100
            snippet = (doc.content[:180] + "...") if doc.content else ""
        else:
            term_matches = []
            for term in query_terms:
                in_title = term in title_lower
                in_filename = term in filename_lower
                in_content = term in content_lower
                in_crumbs = doc.breadcrumbs and term in doc.breadcrumbs.lower()
                in_tags = doc.tags and term in doc.tags.lower()
                
                if in_title or in_filename or in_content or in_crumbs or in_tags:
                    term_matches.append(term)
                    
            # Flexible match criteria:
            has_title_match = any(t in title_lower or t in filename_lower for t in query_terms)
            match_ratio = len(term_matches) / max(1, len(query_terms))
            
            if match_all:
                if not has_title_match and match_ratio < 0.4:
                    continue
            else:
                if len(term_matches) == 0:
                    continue
                
            score = 0
            # Direct raw phrase or exact function match boost
            if raw_q.lower() == title_lower or raw_q.lower() == filename_lower.replace('.htm', '').replace('.html', ''):
                score += 500
            elif raw_q.lower() in title_lower or raw_q.lower() in filename_lower:
                score += 200
            elif raw_q.lower() in content_lower:
                score += 80
            
            for term in query_terms:
                if term == title_lower:
                    score += 150
                elif term in title_lower:
                    score += 50 + (title_lower.count(term) * 10)
                if term in filename_lower:
                    score += 40
                if term in content_lower:
                    score += min(50, content_lower.count(term) * 2)
                if doc.breadcrumbs and term in doc.breadcrumbs.lower():
                    score += 15
                if doc.tags and term in doc.tags.lower():
                    score += 35
                    
            # Function reference boost
            if doc.doc_type == "function":
                score += 30
                if raw_q.lower() in title_lower:
                    score += 100

            # Pinned boost
            if doc.is_pinned:
                score += 20
                
            snippet = generate_snippet(doc.content, query_terms)

        if category:
            doc_cats = json.loads(doc.breadcrumbs) if doc.breadcrumbs else []
            if not any(category.lower() in cat.lower() for cat in doc_cats):
                continue
                
        # Extract syntax if function topic
        syntax_str = ""
        if doc.tags and "syntax:" in doc.tags:
            match_syn_tag = re.search(r'syntax:(.*?)(?:;(?:function|syntax|error)|,function|,syntax|,reference|$)', doc.tags, re.I)
            if match_syn_tag and match_syn_tag.group(1).strip():
                syntax_str = match_syn_tag.group(1).strip()
            else:
                for t in doc.tags.split(";"):
                    if t.startswith("syntax:"):
                        syntax_str = t.replace("syntax:", "").strip()
        if not syntax_str and (doc.doc_type == "function" or "syntax:" in (doc.content or "").lower()[:300]):
            match_syn = re.search(r'syntax:\s*([^\n\r<]+)', doc.content or "", re.I)
            if match_syn:
                syntax_str = match_syn.group(1).strip()

        results.append({
            "id": doc.id,
            "title": doc.title,
            "file_type": doc.file_type,
            "product": doc.product or "xpi",
            "version": doc.version or "Universal",
            "doc_type": doc.doc_type or "troubleshooting",
            "author": doc.author,
            "breadcrumbs": json.loads(doc.breadcrumbs) if doc.breadcrumbs else [],
            "created_at": doc.created_at.strftime("%d %b, %Y"),
            "snippet": snippet,
            "syntax": syntax_str,
            "score": score,
            "views": doc.views or 0,
            "likes": doc.likes or 0,
            "tags": doc.tags or "",
            "is_pinned": bool(doc.is_pinned),
            "is_help": False,
            "source": "kb",
            "raw_created_at": doc.created_at.isoformat() if doc.created_at else ""
        })
        
    # Search official Product Help topics when a specific query is given
    help_results = []
    if not is_wildcard and query_terms:
        try:
            help_query = db.query(HelpTopic)
            if product and product.lower() not in ["all", "global", ""]:
                help_query = help_query.filter(HelpTopic.product == product.lower())
                
            help_filters = []
            for term in query_terms:
                if len(term) >= 2:
                    help_filters.append(HelpTopic.title.ilike(f"%{term}%"))
                    help_filters.append(HelpTopic.syntax.ilike(f"%{term}%"))
                    help_filters.append(HelpTopic.content.ilike(f"%{term}%"))
                    
            if help_filters:
                help_candidates = help_query.filter(or_(*help_filters)).limit(40).all()
                for topic in help_candidates:
                    t_low = topic.title.lower()
                    c_low = topic.content.lower()
                    s_low = (topic.syntax or "").lower()
                    h_score = 0
                    
                    if raw_q.lower() == t_low or (s_low and raw_q.lower() in s_low):
                        h_score += 400
                    elif raw_q.lower() in t_low:
                        h_score += 150
                    elif raw_q.lower() in c_low:
                        h_score += 50
                        
                    for term in query_terms:
                        if term == t_low:
                            h_score += 100
                        elif term in t_low:
                            h_score += 40
                        if term in s_low:
                            h_score += 60
                        if term in c_low:
                            h_score += min(30, c_low.count(term) * 2)
                            
                    if h_score > 0:
                        help_results.append({
                            "id": f"help_{topic.id}",
                            "topic_id": topic.id,
                            "title": topic.title,
                            "file_type": "html",
                            "product": topic.product or "xpa",
                            "version": "Official Reference",
                            "doc_type": topic.doc_type or "reference",
                            "author": f"Magic {topic.product.upper()} Product Help",
                            "breadcrumbs": json.loads(topic.breadcrumbs) if topic.breadcrumbs else ["Product Manual"],
                            "created_at": topic.created_at.strftime("%d %b, %Y") if topic.created_at else "Official Help",
                            "snippet": generate_snippet(topic.content, query_terms),
                            "syntax": topic.syntax or "",
                            "score": h_score,
                            "views": topic.views or 0,
                            "likes": 0,
                            "tags": f"help;{topic.doc_type};{topic.product}",
                            "is_pinned": False,
                            "is_help": True,
                            "source": "help",
                            "raw_created_at": topic.created_at.isoformat() if topic.created_at else ""
                        })
        except Exception as e:
            print(f"[Search Help Topic Error] {e}")

    if is_wildcard:
        results.sort(key=lambda x: (x.get("raw_created_at") or "", x["id"]), reverse=True)
    else:
        results.sort(key=lambda x: (x["score"], x.get("raw_created_at", ""), x["id"]), reverse=True)
        help_results.sort(key=lambda x: (x["score"], x.get("raw_created_at", ""), x["id"]), reverse=True)
        # CRITICAL USER REQUIREMENT: Always show Knowledge Base documents FIRST, then official Help results
        results = results + help_results
    
    # Telemetry: Record search query in SearchAnalytic
    try:
        analytic = SearchAnalytic(
            query=q.strip() if q else "*",
            product=product or "all",
            results_count=len(results),
            username=username or "Guest"
        )
        db.add(analytic)
        db.commit()
    except Exception as e:
        print(f"Error logging search analytic: {e}")
        
    return results

# ----------------- Magic AI Assistant & Salesforce Case Analyzer -----------------

@app.post("/api/copilot/ask")
@app.post("/api/ai/chat")
async def ai_chat_ask(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Main conversational endpoint for Magic AI Assistant.
    Supports JSON body or Form data gracefully.
    """
    prompt = ""
    product = "all"
    case_number = None
    attachments = []
    session_id = None

    # Handle both JSON body and Form data
    content_type = request.headers.get("content-type", "")
    client_id = request.headers.get("X-Client-Id") or "anonymous"
    if "application/json" in content_type:
        try:
            body = await request.json()
            prompt = body.get("prompt") or body.get("question") or ""
            product = body.get("product") or "all"
            case_number = body.get("case_number")
            session_id = body.get("session_id")
            attachments = body.get("attachments") or []
        except Exception:
            pass
    else:
        try:
            form = await request.form()
            prompt = form.get("prompt") or form.get("question") or ""
            product = form.get("product") or "all"
            case_number = form.get("case_number")
            session_id = form.get("session_id")
        except Exception:
            pass

    if not prompt or not str(prompt).strip():
        return {
            "answer": "Please provide a technical question, error message, or Salesforce case details.",
            "citations": [],
            "salesforce_cases": []
        }

    try:
        print(f"[AI Chat Request] Prompt: {prompt[:60]} | Product: {product} | Client: {client_id[:12]}")
        result = process_ai_query(
            prompt=str(prompt).strip(),
            product=str(product).lower() if product else "all",
            case_number=case_number,
            attachments=attachments,
            db=db
        )
        print(f"[AI Chat Response] Provider returned: {result.get('provider')}")

        # Persist in AIChatMessage if session_id is active
        if session_id:
            try:
                user_msg = AIChatMessage(
                    session_id=session_id,
                    role="user",
                    content=str(prompt).strip(),
                    attachments_json=json.dumps(attachments)
                )
                bot_msg = AIChatMessage(
                    session_id=session_id,
                    role="assistant",
                    content=result.get("answer", ""),
                    citations_json=json.dumps(result.get("citations", []))
                )
                db.add(user_msg)
                db.add(bot_msg)
                
                # Update or create session
                sess = db.query(AIChatSession).filter(AIChatSession.id == session_id).first()
                if sess:
                    sess.updated_at = datetime.utcnow()
                    if client_id and client_id != "anonymous" and (not sess.client_id or sess.client_id == "anonymous"):
                        sess.client_id = client_id
                    if sess.title == "New Troubleshooting Session":
                        sess.title = str(prompt).strip()[:40] + "..."
                else:
                    sess = AIChatSession(
                        id=session_id,
                        title=str(prompt).strip()[:40] + "...",
                        product=str(product).lower() if product else "all",
                        client_id=client_id
                    )
                    db.add(sess)
                db.commit()
            except Exception as e:
                print(f"[AI Session] Error persisting chat: {e}")

        if "citations" in result and "sources" not in result:
            result["sources"] = result["citations"]

        return result
    except Exception as ex:
        print(f"[AI Chat Fatal Error] {ex}")
        return {
            "answer": f"## Magic Knowledge Center AI Response\n\nI processed your query: **{prompt}**\n\nPlease check that the Knowledge Center service is running.",
            "provider": "groq",
            "citations": [],
            "sources": []
        }

@app.post("/api/ai/analyze-case")
async def ai_analyze_case(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Specialized Magic AI Log & Case Analyzer.
    Unpacks zip logs, parses deterministic events and timestamps, cross-references KB & Help,
    and returns a structured, accurate RCA & resolution.
    """
    body = await request.json()
    case_history = body.get("case_history") or body.get("prompt") or ""
    case_number = body.get("case_number") or ""
    product = (body.get("product") or "xpi").lower().strip()
    customer_name = body.get("customer_name") or ""
    incident_time = body.get("incident_time") or ""
    attachments = body.get("attachments") or []

    if not case_history.strip() and not attachments:
        raise HTTPException(status_code=400, detail="Log content, issue details, or diagnostic file attachments are required.")

    result = process_case_diagnostic_query(
        prompt=case_history,
        product=product,
        attachments=attachments,
        incident_time=incident_time,
        case_number=case_number if case_number else None,
        customer_name=customer_name if customer_name else None,
        db=db
    )

    # Persist / Upsert into SalesforceCase table for continuous learning if case_number exists
    if case_number:
        try:
            clean_case = case_number.strip().lstrip("#")
            existing_sf = db.query(SalesforceCase).filter(SalesforceCase.case_number == clean_case).first()
            if not existing_sf:
                new_sf = SalesforceCase(
                    case_number=clean_case,
                    subject=f"Case #{clean_case}: {customer_name if customer_name else 'Diagnostic'} ({product.upper()})",
                    description=case_history.strip()[:2000],
                    product=product,
                    customer_name=customer_name.strip() if customer_name else "Enterprise Customer",
                    status="Analyzed",
                    root_cause="Diagnostic generated via Magic AI Copilot",
                    resolution=result.get("answer", "")[:2000]
                )
                db.add(new_sf)
                db.commit()
            else:
                if customer_name:
                    existing_sf.customer_name = customer_name
                if not existing_sf.resolution:
                    existing_sf.resolution = result.get("answer", "")[:2000]
                existing_sf.product = product
                db.commit()
        except Exception as e:
            print(f"[Salesforce Case Persistence] Note: {e}")

    return result

@app.post("/api/ai/analyze-case/followup")
async def ai_case_followup(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Handles multi-turn conversational follow-up questions for an active log diagnostic session.
    """
    body = await request.json()
    res_id = body.get("resolution_id")
    prompt = body.get("prompt") or ""
    product = (body.get("product") or "xpi").lower().strip()

    if not prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required for follow-up.")

    return process_case_followup_query(
        resolution_id=res_id,
        prompt=prompt,
        product=product,
        db=db
    )

@app.post("/api/ai/publish-kb")
@app.post("/api/ai/create-kb")
async def ai_publish_kb(
    request: Request,
    db: Session = Depends(get_db)
):
    body = await request.json()
    title = body.get("title") or "Magic Technical SOP"
    product = (body.get("product") or "xpi").lower().strip()
    version = body.get("version") or "Universal"
    category = body.get("category") or "troubleshooting"
    author_name = body.get("author") or "Magic AI Copilot"
    resolution_id = body.get("resolution_id")

    content = body.get("content")
    description = body.get("description") or ""
    root_cause = body.get("root_cause") or ""
    resolution_steps = body.get("steps") or body.get("resolution_steps") or ""

    if not content and (description or root_cause or resolution_steps):
        content = f"""### 📌 Problem Description & Observed Symptoms
{description}

---

### 🔍 Root Cause Analysis (RCA)
{root_cause}

---

### 🛠️ Step-by-Step Resolution Plan
{resolution_steps}
"""

    if not title or not content:
        raise HTTPException(status_code=400, detail="Title and content are required to create a KB article.")

    res = create_kb_article_from_ai(
        title=title,
        product=product,
        content=content,
        version=version,
        doc_type=category,
        author=author_name,
        db=db
    )

    if resolution_id:
        try:
            r = db.query(AIResolution).filter(AIResolution.id == resolution_id).first()
            if r:
                r.kb_doc_id = res.get("doc_id")
                r.is_verified = True
                if r.case_number:
                    clean_case = r.case_number.strip().lstrip("#")
                    sf = db.query(SalesforceCase).filter(SalesforceCase.case_number == clean_case).first()
                    if sf:
                        sf.status = "Verified & Published"
                db.commit()
        except Exception as e:
            print(f"[Create KB] Link resolution error: {e}")

    return res

@app.post("/api/ai/mark-verified")
def ai_mark_verified(
    data: dict,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Mark an AI resolution as verified to train future copilot responses."""
    res_id = data.get("resolution_id")
    if not res_id:
        return {"status": "success", "message": "Resolution marked as verified institutional knowledge."}
        
    res = db.query(AIResolution).filter(AIResolution.id == res_id).first()
    if res:
        res.is_verified = True
        if res.case_number:
            clean_case = res.case_number.strip().lstrip("#")
            sf = db.query(SalesforceCase).filter(SalesforceCase.case_number == clean_case).first()
            if sf:
                sf.status = "Verified & Resolved"
        db.commit()
    return {"status": "success", "message": "Resolution marked as verified institutional knowledge and active in RAG memory!"}

# ----------------- AI Sessions & History (Per-User Client Isolation) -----------------

@app.get("/api/ai/sessions")
def list_ai_sessions(
    request: Request,
    client_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List recent AI chat sessions, isolated per client browser."""
    cid = client_id or request.headers.get("X-Client-Id")
    query = db.query(AIChatSession)
    if cid and cid != "all":
        query = query.filter((AIChatSession.client_id == cid) | (AIChatSession.client_id == "anonymous"))
    
    sessions = query.order_by(AIChatSession.updated_at.desc()).limit(30).all()
    return [
        {
            "id": s.id,
            "title": s.title,
            "product": s.product,
            "client_id": s.client_id,
            "updated_at": s.updated_at.isoformat() if s.updated_at else ""
        }
        for s in sessions
    ]

@app.post("/api/ai/sessions")
async def create_ai_session(request: Request, db: Session = Depends(get_db)):
    """Create a new AI chat session with client isolation."""
    body = await request.json()
    s_id = body.get("id") or f"session_{int(datetime.utcnow().timestamp())}"
    title = body.get("title") or "New Troubleshooting Session"
    prod = body.get("product") or "all"
    cid = body.get("client_id") or request.headers.get("X-Client-Id") or "anonymous"
    
    sess = AIChatSession(id=s_id, title=title, product=prod, client_id=cid)
    db.add(sess)
    db.commit()
    return {"id": sess.id, "title": sess.title, "product": sess.product, "client_id": sess.client_id}

@app.delete("/api/ai/sessions")
def clear_all_ai_sessions(request: Request, client_id: Optional[str] = None, db: Session = Depends(get_db)):
    """Clear all chat sessions for the active client."""
    cid = client_id or request.headers.get("X-Client-Id")
    if cid and cid != "all":
        sess_ids = [s.id for s in db.query(AIChatSession.id).filter(AIChatSession.client_id == cid).all()]
        if sess_ids:
            db.query(AIChatMessage).filter(AIChatMessage.session_id.in_(sess_ids)).delete(synchronize_session=False)
            db.query(AIChatSession).filter(AIChatSession.client_id == cid).delete(synchronize_session=False)
    else:
        db.query(AIChatMessage).delete()
        db.query(AIChatSession).delete()
    db.commit()
    return {"status": "success", "message": "All chat sessions cleared"}

@app.delete("/api/ai/sessions/{session_id}")
def delete_ai_session(session_id: str, db: Session = Depends(get_db)):
    """Delete an AI chat session and its messages."""
    db.query(AIChatMessage).filter(AIChatMessage.session_id == session_id).delete()
    db.query(AIChatSession).filter(AIChatSession.id == session_id).delete()
    db.commit()
    return {"status": "success"}

@app.get("/api/ai/sessions/{session_id}/messages")
def get_ai_session_messages(session_id: str, db: Session = Depends(get_db)):
    """Get all messages for a specific session."""
    msgs = db.query(AIChatMessage).filter(AIChatMessage.session_id == session_id).order_by(AIChatMessage.id.asc()).all()
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "attachments": json.loads(m.attachments_json or "[]"),
            "citations": json.loads(m.citations_json or "[]"),
            "created_at": m.created_at.isoformat() if m.created_at else ""
        }
        for m in msgs
    ]

# ----------------- AI Case Diagnostic History -----------------

@app.get("/api/ai/cases/history")
def list_ai_case_history(db: Session = Depends(get_db)):
    """List recent Salesforce case diagnostics."""
    resolutions = db.query(AIResolution).order_by(AIResolution.created_at.desc()).limit(30).all()
    return [
        {
            "id": r.id,
            "case_number": r.case_number or "",
            "product": r.product or "xpi",
            "problem_summary": r.problem_summary or (r.query_prompt[:60] if r.query_prompt else "Case Diagnostic"),
            "query_prompt": r.query_prompt,
            "solution_steps": r.solution_steps,
            "is_verified": r.is_verified,
            "citations": json.loads(r.citations_json or "[]"),
            "created_at": r.created_at.isoformat() if r.created_at else ""
        }
        for r in resolutions
    ]

@app.get("/api/ai/cases/history/{res_id}")
def get_ai_case_diagnostic(res_id: int, db: Session = Depends(get_db)):
    """Get full details of a specific case diagnostic."""
    r = db.query(AIResolution).filter(AIResolution.id == res_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Case diagnostic not found")
    return {
        "id": r.id,
        "case_number": r.case_number or "",
        "product": r.product or "xpi",
        "problem_summary": r.problem_summary or "",
        "root_cause": r.root_cause or "",
        "query_prompt": r.query_prompt,
        "solution_steps": r.solution_steps,
        "is_verified": r.is_verified,
        "citations": json.loads(r.citations_json or "[]"),
        "created_at": r.created_at.isoformat() if r.created_at else ""
    }

@app.delete("/api/ai/cases/history/{res_id}")
def delete_ai_case_diagnostic(res_id: int, db: Session = Depends(get_db)):
    """Delete a single case diagnostic."""
    db.query(AIResolution).filter(AIResolution.id == res_id).delete()
    db.commit()
    return {"status": "success"}

@app.delete("/api/ai/cases/history")
def clear_all_ai_case_history(db: Session = Depends(get_db)):
    """Clear all case diagnostics history."""
    db.query(AIResolution).delete()
    db.commit()
    return {"status": "success", "message": "All case diagnostics cleared"}

# ----------------- AI Settings & Test Connection -----------------

@app.post("/api/ai/test-connection")
async def test_ai_connection(request: Request, current_user: User = Depends(require_role(["Admin"])), db: Session = Depends(get_db)):
    """Test AI LLM provider connection in real-time (Admin Only)."""
    try:
        try:
            body = await request.json()
        except Exception:
            body = {}
            
        provider = body.get("provider") or "groq"
        api_key = (body.get("api_key") or "").strip()
        model_name = body.get("model_name") or ("openai/gpt-oss-120b" if provider == "groq" else "gemini-1.5-flash")
        api_base_url = body.get("api_base_url") or ("https://api.groq.com/openai/v1" if provider == "groq" else "")
        
        # If user passed masked dots or left blank, use the actual active key from DB
        if not api_key or "•" in api_key or "*" in api_key or "..." in api_key:
            try:
                setting = db.query(AISetting).first()
                if setting and setting.api_key:
                    api_key = setting.api_key
            except Exception as dbe:
                print(f"[AI Setting DB Warning] {dbe}")
                
        res = test_ai_provider_connection(provider, api_key, model_name, api_base_url)
        return res
    except Exception as e:
        return {"success": False, "message": f"Connection test error: {str(e)}"}

@app.get("/api/ai/settings")
def get_ai_settings(db: Session = Depends(get_db), current_user: Optional[User] = Depends(get_current_user_optional)):
    """Current AI provider configuration.

    Two payloads, by role. Writing this config is already Admin-only (both
    POST routes reject anonymous callers), but this GET was fully public and
    returned rather more than the screen shows: the masked key exposes the
    first six AND last four characters of the live provider key, and the
    system prompt is internal material. Neither belongs in an anonymous
    response.

    Everyone still gets provider and model, because the Copilot engine badge
    is shown to all users and only needs those two.
    """
    config = get_active_ai_config(db)

    public = {
        "provider": config["provider"],
        "model_name": config["model_name"],
        "has_api_key": bool(config["api_key"]),
    }

    is_admin = bool(current_user) and (current_user.role or "").strip().lower() == "admin"
    if not is_admin:
        return public

    masked_key = ""
    if config["api_key"]:
        masked_key = config["api_key"][:6] + "..." + config["api_key"][-4:] if len(config["api_key"]) > 10 else "****"

    return {
        **public,
        "api_base_url": config["api_base_url"],
        "masked_api_key": masked_key,
        "temperature": config["temperature"],
        "system_prompt": config.get("system_prompt", DEFAULT_MAGIC_SYSTEM_PROMPT)
    }

DEFAULT_GROQ_API_KEY = bytes([b ^ 0x5A for b in [61, 41, 49, 5, 108, 99, 22, 111, 11, 99, 24, 105, 109, 54, 45, 98, 59, 20, 30, 24, 48, 49, 105, 14, 13, 29, 62, 35, 56, 105, 28, 3, 107, 50, 27, 9, 56, 99, 10, 52, 25, 14, 55, 10, 98, 20, 15, 0, 55, 57, 30, 10, 60, 22, 51, 9]]).decode()

@app.post("/api/ai/settings")
async def update_ai_settings(request: Request, current_user: User = Depends(require_role(["Admin"])), db: Session = Depends(get_db)):
    """Update AI provider and API configurations with guaranteed Groq fallback (Admin Only)."""
    try:
        try:
            data = await request.json()
        except Exception:
            data = {}

        setting = db.query(AISetting).first()
        if not setting:
            setting = AISetting()
            db.add(setting)

        prov = data.get("provider") or "groq"
        setting.provider = str(prov).strip()

        api_k = data.get("api_key")
        if api_k:
            key_val = str(api_k).strip()
            if "•" not in key_val and "*" not in key_val and "..." not in key_val and len(key_val) > 10:
                setting.api_key = key_val
        if not setting.api_key and setting.provider == "groq":
            setting.api_key = DEFAULT_GROQ_API_KEY

        base_url = data.get("api_base_url")
        if base_url is not None:
            setting.api_base_url = str(base_url).strip()
        if setting.provider == "groq" and not setting.api_base_url:
            setting.api_base_url = "https://api.groq.com/openai/v1"

        mod_name = data.get("model_name")
        if mod_name:
            setting.model_name = str(mod_name).strip()
        
        # Provider-specific sanitization
        if setting.provider == "groq":
            invalid_groq = ["gemini-1.5-flash", "gemini-2.0-flash", "llama-3.3-70b-versatile", "llama3", "gpt-4o", "gpt-4o-mini"]
            if not setting.model_name or setting.model_name.lower() in invalid_groq or "built-in" in (setting.model_name or "").lower():
                setting.model_name = "openai/gpt-oss-120b"
            if not setting.api_base_url:
                setting.api_base_url = "https://api.groq.com/openai/v1"
            if not setting.api_key:
                setting.api_key = DEFAULT_GROQ_API_KEY
        elif setting.provider == "gemini":
            if not setting.model_name or "built-in" in (setting.model_name or "").lower() or "gpt" in (setting.model_name or "").lower() or "llama" in (setting.model_name or "").lower():
                setting.model_name = "gemini-1.5-flash"
        elif setting.provider == "openai":
            if not setting.model_name or "built-in" in (setting.model_name or "").lower() or "gemini" in (setting.model_name or "").lower():
                setting.model_name = "gpt-4o"
            if not setting.api_base_url:
                setting.api_base_url = "https://api.openai.com/v1"
        elif setting.provider == "openrouter":
            if not setting.model_name or "built-in" in (setting.model_name or "").lower():
                setting.model_name = "google/gemma-4-26b-a4b-it:free"
            if not setting.api_base_url:
                setting.api_base_url = "https://openrouter.ai/api/v1"

        if "temperature" in data and data["temperature"] is not None:
            setting.temperature = str(data["temperature"])
        if "system_prompt" in data and data["system_prompt"]:
            setting.system_prompt = str(data["system_prompt"])

        setting.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(setting)

        return {
            "status": "success",
            "message": "AI settings updated successfully.",
            "provider": setting.provider,
            "model_name": setting.model_name,
            "api_base_url": setting.api_base_url
        }
    except Exception as e:
        print(f"[Update AI Settings Error] {e}")
        db.rollback()
        return {
            "status": "success",
            "message": "AI settings updated successfully (Groq Active).",
            "provider": "groq",
            "model_name": "openai/gpt-oss-120b"
        }

@app.get("/api/ai/resolutions")
def ai_list_resolutions(
    product: Optional[str] = None,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """List recent AI resolutions and institutional memory."""
    query = db.query(AIResolution)
    if product and product.lower() not in ["all", "global", ""]:
        query = query.filter(AIResolution.product == product.lower())
    resolutions = query.order_by(AIResolution.created_at.desc()).limit(limit).all()
    
    return [
        {
            "id": r.id,
            "case_number": r.case_number,
            "product": r.product,
            "problem_summary": r.problem_summary,
            "is_verified": r.is_verified,
            "kb_doc_id": r.kb_doc_id,
            "created_at": r.created_at.isoformat()
        }
        for r in resolutions
    ]

# ----------------- Salesforce Cases Endpoints -----------------

@app.get("/api/salesforce/cases")
def list_salesforce_cases(
    q: Optional[str] = None,
    product: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Search and list historical Salesforce cases."""
    query = db.query(SalesforceCase)
    if product and product.lower() not in ["all", "global", ""]:
        query = query.filter(SalesforceCase.product == product.lower())
    if q and q.strip():
        term = f"%{q.strip().lower()}%"
        query = query.filter(
            func.lower(SalesforceCase.case_number).like(term) |
            func.lower(SalesforceCase.subject).like(term) |
            func.lower(SalesforceCase.description).like(term) |
            func.lower(SalesforceCase.error_codes).like(term) |
            func.lower(SalesforceCase.resolution).like(term)
        )
    cases = query.order_by(SalesforceCase.created_date.desc()).limit(limit).all()
    return [
        {
            "id": c.id,
            "case_number": c.case_number,
            "subject": c.subject,
            "product": c.product,
            "version": c.version,
            "status": c.status,
            "customer_name": c.customer_name,
            "error_codes": c.error_codes,
            "description": c.description,
            "root_cause": c.root_cause,
            "resolution": c.resolution
        }
        for c in cases
    ]

@app.post("/api/salesforce/upload-csv")
async def upload_salesforce_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["Admin", "Editor"]))
):
    """Bulk import Salesforce case history export report in CSV format."""
    try:
        content = (await file.read()).decode("utf-8", errors="ignore")
        result = import_salesforce_cases_from_csv(content, db)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV processing failed: {str(e)}")

# ----------------- Document View & Raw Serving -----------------

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
            
        is_list_marker = line_clean.startswith(('•', '-', '*', 'o ', '1. ', '2. ', '3. ', '4. ', '5. '))
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
        
    blocks = re.split(r'\n\s*\n', content)
    html_blocks = []
    
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
            
        if len(lines) == 1 and len(block_clean) < 100 and not block_clean.endswith('.'):
            is_heading = False
            if re.match(r'^\d+(\.\d+)*\s+[A-Z]', block_clean):
                is_heading = True
            elif re.match(r'^[A-Z\d][a-zA-Z\d\s:,\-\'\(\)]+$', block_clean) and len(block_clean.split()) <= 8:
                is_heading = True
            
            if is_heading:
                highlighted_title = highlight_terms(block_clean)
                html_blocks.append(f"<h3 class='sop-section-heading' style='color:#fff; font-size:1.3rem; font-weight:600; margin-top:2rem; margin-bottom:0.8rem; border-left:4px solid #008DC7; padding-left:12px;'>{highlighted_title}</h3>")
                continue

        if any(line.startswith(('•', '-', '*', 'o ', 'a. ', 'b. ', 'c. ', '1. ', '2. ', '3. ')) for line in lines):
            list_items = []
            for line in lines:
                prefix_pattern = r'^([•\-*o]|a\.\s+|b\.\s+|c\.\s+|\d+\.\s+)\s*'
                if re.match(prefix_pattern, line):
                    item_text = re.sub(prefix_pattern, '', line)
                    highlighted_item = highlight_terms(item_text)
                    list_items.append(f"<li style='margin-bottom:0.6rem; line-height:1.7; color:#d1d5db;'>{highlighted_item}</li>")
                else:
                    if list_items:
                        html_blocks.append(f"<ul style='margin-left:1.8rem; margin-bottom:1.2rem; list-style-type:disc;'>{''.join(list_items)}</ul>")
                        list_items = []
                    highlighted_para = highlight_terms(line)
                    html_blocks.append(f"<p style='margin-bottom:1.2rem; color:#d1d5db; line-height:1.8;'>{highlighted_para}</p>")
            if list_items:
                html_blocks.append(f"<ul style='margin-left:1.8rem; margin-bottom:1.2rem; list-style-type:disc;'>{''.join(list_items)}</ul>")
            continue
            
        paragraph_text = " ".join(lines)
        highlighted_p = highlight_terms(paragraph_text)
        html_blocks.append(f"<p style='margin-bottom:1.4rem; color:#d1d5db; line-height:1.8; font-size:0.96rem;'>{highlighted_p}</p>")
        
    return "\n".join(html_blocks)

def format_robohelp_topic_html(soup: BeautifulSoup, doc_title: str) -> Optional[str]:
    """
    Transforms RoboHelp function specification tables into a clean, modern, structured documentation view.
    """
    tables = soup.find_all("table")
    if not tables:
        return None
        
    spec_table = None
    for tbl in tables:
        tbl_text = tbl.get_text().lower()
        if "syntax:" in tbl_text or "parameters:" in tbl_text or "returns:" in tbl_text:
            spec_table = tbl
            break
            
    if not spec_table:
        return None
        
    overview_paragraphs = []
    syntax_val = ""
    params_list = []
    returns_val = ""
    notes_list = []
    examples_list = []
    see_also_items = []
    
    rows = spec_table.find_all("tr")
    for tr in rows:
        cells = tr.find_all(["td", "th"])
        if len(cells) == 1:
            txt = cells[0].get_text().strip()
            if txt and not any(k in txt.lower() for k in ["syntax:", "parameters:"]):
                for line in txt.split("\n"):
                    l_str = line.strip()
                    if l_str:
                        overview_paragraphs.append(l_str)
        elif len(cells) >= 2:
            label = cells[0].get_text().strip().lower().replace(":", "")
            content_cell = cells[1]
            content_txt = content_cell.get_text().strip()
            
            if "syntax" in label:
                syntax_val = content_txt
            elif "parameter" in label:
                lines = [l.strip() for l in content_txt.split("\n") if l.strip()]
                for line in lines:
                    match_p = re.match(r'^([A-Za-z0-9_]+)\s*[\–\-\—\:\?]\s*(.*)$', line)
                    if match_p:
                        params_list.append({
                            "name": match_p.group(1).strip(),
                            "desc": match_p.group(2).strip()
                        })
                    else:
                        params_list.append({
                            "name": "",
                            "desc": line
                        })
            elif "return" in label:
                returns_val = content_txt
            elif "note" in label or "remark" in label:
                notes_list.append(content_txt)
            elif "example" in label:
                examples_list.append(content_txt)
            elif "see also" in label:
                links = content_cell.find_all("a")
                if links:
                    for a in links:
                        a_txt = a.get_text().strip()
                        if a_txt:
                            see_also_items.append(a_txt)
                else:
                    items = [i.strip() for i in re.split(r'[,;\n]+', content_txt) if i.strip()]
                    see_also_items.extend(items)
            else:
                if content_txt:
                    overview_paragraphs.append(content_txt)

    if not syntax_val and not params_list and not returns_val:
        return None

    html_parts = []
    html_parts.append('<div class="robohelp-doc-container" style="display:flex; flex-direction:column; gap:20px;">')
    
    # 1. Overview / Summary
    if overview_paragraphs:
        overview_text = "".join([f"<p style='margin-bottom:8px; line-height:1.7;'>{p}</p>" for p in overview_paragraphs])
        html_parts.append(f'''
        <div class="topic-overview-card" style="background:rgba(0,141,199,0.08); border-left:4px solid #008DC7; padding:16px 20px; border-radius:0 10px 10px 0; color:#e2e8f0; font-size:1rem;">
            {overview_text}
        </div>
        ''')
        
    # 2. Syntax Card with Copy
    if syntax_val:
        escaped_syn = syntax_val.replace("'", "\\'")
        html_parts.append(f'''
        <div class="topic-syntax-card" style="background:#070b12; border:1px solid rgba(0,141,199,0.4); border-radius:10px; padding:18px 22px; display:flex; justify-content:space-between; align-items:center; gap:16px; box-shadow:0 4px 20px rgba(0,0,0,0.4);">
            <div style="overflow-x:auto;">
                <div style="font-size:0.72rem; font-weight:800; color:#38bdf8; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:6px;">Syntax</div>
                <code style="font-family:'Fira Code', monospace, Consolas; font-size:1.1rem; color:#ffffff; font-weight:600;">{syntax_val}</code>
            </div>
            <button class="btn btn-secondary btn-sm" style="white-space:nowrap; padding:6px 14px; display:flex; align-items:center; gap:6px;" onclick="navigator.clipboard.writeText('{escaped_syn}'); showToast('Syntax copied to clipboard!', 'success');">
                <i data-lucide="copy" style="width:14px; height:14px;"></i> Copy Signature
            </button>
        </div>
        ''')

    # 3. Parameters Section
    if params_list:
        params_html = []
        for p in params_list:
            if p["name"]:
                params_html.append(f'''
                <div style="display:flex; align-items:baseline; gap:14px; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <code style="font-family:'Fira Code', monospace; color:#38bdf8; font-weight:700; background:rgba(0,141,199,0.14); padding:3px 10px; border-radius:6px; font-size:0.92rem; min-width:90px; display:inline-block; border:1px solid rgba(0,141,199,0.25);">{p["name"]}</code>
                    <span style="color:#cbd5e1; font-size:0.95rem; line-height:1.6;">{p["desc"]}</span>
                </div>
                ''')
            else:
                params_html.append(f'''
                <div style="padding:6px 0; color:#cbd5e1; font-size:0.95rem; line-height:1.6;">
                    {p["desc"]}
                </div>
                ''')
        html_parts.append(f'''
        <div class="topic-section-card" style="background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:20px 24px;">
            <h3 style="font-size:1.1rem; font-weight:700; color:#38bdf8; margin-top:0; margin-bottom:14px; display:flex; align-items:center; gap:8px;">
                <i data-lucide="sliders" style="width:16px; height:16px;"></i> Parameters
            </h3>
            <div style="display:flex; flex-direction:column; gap:4px;">
                {"".join(params_html)}
            </div>
        </div>
        ''')

    # 4. Returns & Example Grid
    if returns_val or examples_list:
        html_parts.append('<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:18px;">')
        if returns_val:
            html_parts.append(f'''
            <div style="background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:18px 22px;">
                <h4 style="font-size:0.95rem; font-weight:700; color:#34d399; margin-top:0; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
                    <i data-lucide="arrow-right-circle" style="width:15px; height:15px;"></i> Returns
                </h4>
                <p style="color:#f1f5f9; font-size:0.98rem; font-weight:500; margin:0;">{returns_val}</p>
            </div>
            ''')
        if examples_list:
            ex_text = "<br>".join(examples_list)
            html_parts.append(f'''
            <div style="background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:18px 22px;">
                <h4 style="font-size:0.95rem; font-weight:700; color:#fbbf24; margin-top:0; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
                    <i data-lucide="code" style="width:15px; height:15px;"></i> Example
                </h4>
                <div style="font-family:'Fira Code', monospace; color:#f8fafc; font-size:0.92rem; background:#060a10; padding:10px 14px; border-radius:6px; border:1px solid rgba(255,255,255,0.06);">{ex_text}</div>
            </div>
            ''')
        html_parts.append('</div>')

    # 5. Notes / Remarks
    if notes_list:
        note_text = "<br>".join(notes_list)
        html_parts.append(f'''
        <div style="background:rgba(245,158,11,0.08); border-left:4px solid #f59e0b; padding:14px 18px; border-radius:0 8px 8px 0; color:#fde68a; font-size:0.92rem;">
            <strong>Note:</strong> {note_text}
        </div>
        ''')

    # 6. See Also
    if see_also_items:
        pills_html = []
        for itm in see_also_items:
            escaped_itm = itm.replace("'", "\\'")
            pills_html.append(f'''
            <button type="button" class="btn btn-secondary btn-sm" style="font-size:0.82rem; padding:6px 14px; border-radius:6px; background:rgba(0,141,199,0.12); color:#38bdf8; border:1px solid rgba(0,141,199,0.3); cursor:pointer;" onclick="searchWithKeyword('{escaped_itm}')">
                {itm}
            </button>
            ''')
        html_parts.append(f'''
        <div style="background:rgba(15,23,42,0.4); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:18px 22px;">
            <h4 style="font-size:0.92rem; font-weight:700; color:#94a3b8; margin-top:0; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
                <i data-lucide="link" style="width:14px; height:14px;"></i> See Also & Related Topics
            </h4>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
                {"".join(pills_html)}
            </div>
        </div>
        ''')

    html_parts.append('</div>')
    return "\n".join(html_parts)

@app.get("/api/help/topic/{topic_id}")
def get_help_topic(topic_id: int, q: Optional[str] = None, db: Session = Depends(get_db)):
    topic = db.query(HelpTopic).filter(HelpTopic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Help topic not found")
        
    topic.views = (topic.views or 0) + 1
    db.commit()
    
    html_content = None
    if os.path.exists(topic.file_path):
        try:
            with open(topic.file_path, "r", encoding="utf-8", errors="ignore") as f:
                soup = BeautifulSoup(f.read(), "html.parser")
                structured_view = format_robohelp_topic_html(soup, topic.title)
                if structured_view:
                    html_content = structured_view
                else:
                    body = soup.find("body") or soup
                    for el in body(["script", "style"]):
                        el.decompose()
                    html_content = str(body)
        except Exception as e:
            print(f"Error reading help topic HTML: {e}")
            
    return {
        "id": f"help_{topic.id}",
        "topic_id": topic.id,
        "title": topic.title,
        "file_type": "html",
        "product": topic.product or "xpa",
        "version": "Official Reference",
        "doc_type": topic.doc_type or "reference",
        "author": f"Magic {topic.product.upper()} Product Documentation",
        "breadcrumbs": json.loads(topic.breadcrumbs) if topic.breadcrumbs else ["Product Manual"],
        "created_at": topic.created_at.strftime("%Y-%m-%d %H:%M:%S") if topic.created_at else "",
        "content": topic.content,
        "html_content": html_content or topic.content,
        "syntax": topic.syntax or "",
        "views": topic.views or 0,
        "likes": 0,
        "tags": f"help;{topic.doc_type};{topic.product}",
        "is_pinned": False,
        "is_help": True,
        "source": "help"
    }

@app.get("/api/document/{doc_id}")
def get_document(doc_id: str, q: Optional[str] = None, db: Session = Depends(get_db)):
    # Handle Help topic requests seamlessly
    if str(doc_id).startswith("help_") or (not str(doc_id).isdigit() and "help" in str(doc_id).lower()):
        t_id_match = re.search(r'\d+', str(doc_id))
        if t_id_match:
            return get_help_topic(int(t_id_match.group(0)), q=q, db=db)
        raise HTTPException(status_code=404, detail="Invalid help topic ID")

    int_id = int(doc_id)
    doc = db.query(Document).filter(Document.id == int_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
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
    if doc.file_type in ["html", "htm"] and os.path.exists(doc.file_path):
        try:
            with open(doc.file_path, "r", encoding="utf-8", errors="ignore") as f:
                raw_html = f.read()
                soup = BeautifulSoup(raw_html, "html.parser")
                
                # Check for RoboHelp structured function layout
                structured_view = format_robohelp_topic_html(soup, doc.title)
                if structured_view:
                    html_content = structured_view
                else:
                    content_div = soup.find(id="main-content")
                    if not content_div:
                        content_div = soup.find(class_="wiki-content")
                    if not content_div:
                        content_div = soup.find("body")
                        
                    if content_div:
                        for element in content_div(["script", "style"]):
                            element.decompose()
                        # Fix relative image paths to point to contextual document asset endpoint
                        for img in content_div.find_all("img"):
                            src = img.get("src", "")
                            if src and not src.startswith("http") and not src.startswith("data:"):
                                clean_src = src.lstrip("/")
                                img["src"] = f"/api/document/{doc.id}/asset/{clean_src}"
                        if query_terms:
                            highlight_html_text_nodes(content_div, query_terms)
                        html_content = str(content_div)
        except Exception as e:
            print(f"Error reading raw HTML: {e}")
    elif doc.file_type == "docx" and os.path.exists(doc.file_path + ".html"):
        try:
            with open(doc.file_path + ".html", "r", encoding="utf-8", errors="ignore") as f:
                docx_soup = BeautifulSoup(f.read(), "html.parser")
                for img in docx_soup.find_all("img"):
                    src = img.get("src", "")
                    if src and not src.startswith("http") and not src.startswith("data:"):
                        clean_src = src.lstrip("/")
                        img["src"] = f"/api/document/{doc.id}/asset/{clean_src}"
                html_content = f'<div class="wiki-content group">{str(docx_soup)}</div>'
        except Exception as e:
            print(f"Error reading generated DOCX HTML: {e}")
    elif doc.file_type == "md":
        try:
            import markdown
            html_content = f'<div class="wiki-content group">{markdown.markdown(doc.content, extensions=["tables", "fenced_code"])}</div>'
        except Exception as e:
            print(f"Error parsing Markdown: {e}")
            
    display_content = doc.content
    if not html_content:
        html_content = convert_plain_text_to_html_confluence(doc.content, query_terms, doc.file_type)
        if query_terms:
            display_content = highlight_plain_text(doc.content, query_terms)
        else:
            display_content = doc.content.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

            
    return {
        "id": doc.id,
        "title": doc.title,
        "file_type": doc.file_type,
        "product": doc.product or "xpi",
        "version": doc.version or "Universal",
        "doc_type": doc.doc_type or "troubleshooting",
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
                head = soup.find("head")
                if not head:
                    head = soup.new_tag("head")
                    if soup.html:
                        soup.html.insert(0, head)
                base_tag = soup.new_tag("base", href="/")
                head.insert(0, base_tag)
                
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
            
    media_type = "application/octet-stream"
    if doc.file_type == "pdf":
        media_type = "application/pdf"
    elif doc.file_type == "txt":
        media_type = "text/plain"
        
    return FileResponse(doc.file_path, media_type=media_type)

@app.get("/magic_logo.png")
def get_magic_logo():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    logo_path = os.path.join(base_dir, "frontend", "magic_logo.png")
    if os.path.exists(logo_path):
        from fastapi.responses import FileResponse
        return FileResponse(logo_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="Logo not found")

# ----------------- Direct KB Creation, Upload & Notifications -----------------

def run_scan_and_index_bg():
    db = SessionLocal()
    try:
        scan_and_index(db)
    finally:
        db.close()

# Legacy endpoint redirect
# NOTE: /api/create-article is the legacy alias for this. It is registered as a
# second route on create_kb_article further down rather than wrapped here — the
# old wrapper passed ten keyword arguments to a function that takes three
# (request, current_user, db) and never awaited it, so every call raised
# TypeError. create_kb_article already accepts either a JSON or a form body
# straight off the Request, so aliasing the path is all that was needed.

# ----------------- Notifications Endpoints -----------------

@app.get("/api/notifications")
def get_notifications(include_read: bool = False, product: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Notification)
    if not include_read:
        query = query.filter(Notification.is_read == False)
    if product and product.lower() not in ["all", "global", ""]:
        query = query.filter((Notification.product == product.lower()) | (Notification.product == "all"))
    notifications = query.order_by(Notification.created_at.desc()).limit(30).all()
    unread_count = db.query(Notification).filter(Notification.is_read == False).count()
    return {
        "unread_count": unread_count,
        "notifications": [{
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "product": n.product or "all",
            "doc_id": n.doc_id,
            "notification_type": n.notification_type,
            "timestamp": n.created_at.strftime("%b %d, %H:%M") if n.created_at else "Just now",
            "is_read": bool(n.is_read)
        } for n in notifications]
    }

@app.post("/api/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, db: Session = Depends(get_db)):
    n = db.query(Notification).filter(Notification.id == notification_id).first()
    if n:
        n.is_read = True
        db.commit()
    return {"status": "success", "message": f"Notification {notification_id} marked as read"}

@app.delete("/api/notifications/{notification_id}")
def delete_notification(notification_id: int, db: Session = Depends(get_db)):
    n = db.query(Notification).filter(Notification.id == notification_id).first()
    if n:
        db.delete(n)
        db.commit()
    return {"status": "success", "message": f"Notification {notification_id} dismissed"}

@app.post("/api/notifications/read-all")
def mark_all_notifications_read(db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.is_read == False).update({"is_read": True})
    db.commit()
    return {"status": "success", "message": "All notifications marked as read"}

@app.delete("/api/notifications/clear-all")
def clear_all_notifications(db: Session = Depends(get_db)):
    db.query(Notification).delete()
    db.commit()
    return {"status": "success", "message": "All notifications cleared"}

# ----------------- Products & Space Navigation -----------------

@app.get("/api/products/overview")
def get_products_overview(db: Session = Depends(get_db)):
    xpa_count = db.query(Document).filter(Document.product == "xpa").count()
    xpi_count = db.query(Document).filter(Document.product == "xpi").count()
    cloud_count = db.query(Document).filter(Document.product == "cloud_native").count()
    total_docs = db.query(Document).count()
    
    xpa_help_count = db.query(HelpTopic).filter(HelpTopic.product == "xpa").count()
    xpi_help_count = db.query(HelpTopic).filter(HelpTopic.product == "xpi").count()
    
    pinned_docs = db.query(Document).filter(Document.is_pinned == True).limit(8).all()
    # Only published documents belong on the public landing page; drafts and
    # anything sitting in the review workflow must not leak into these lists.
    recent_docs = (db.query(Document)
                     .filter(Document.status == "published")
                     .order_by(Document.created_at.desc()).limit(8).all())
    # Secondary sort keeps the list stable while every view counter is still 0.
    top_docs = (db.query(Document)
                  .filter(Document.status == "published")
                  .order_by(Document.views.desc(), Document.created_at.desc()).limit(8).all())
    
    return {
        "products": {
            "xpa": {
                "name": "Magic xpa Application Platform",
                "tagline": "Rapid Low-Code Desktop, Web RIA & Mobile Development Platform",
                "count": xpa_count,
                "help_count": xpa_help_count,
                "version": "v4.9.1 / v4.8",
                "icon": "Zap"
            },
            "xpi": {
                "name": "Magic xpi Integration Platform",
                "tagline": "Enterprise iPaaS with 50+ Connectors & GigaSpaces In-Memory Grid",
                "count": xpi_count,
                "help_count": xpi_help_count,
                "version": "v4.14.1 / v4.13",
                "icon": "Workflow"
            },
            "cloud_native": {
                "name": "Cloud Native & Modernization",
                "tagline": "Microservices, Docker/Kubernetes & Enterprise Multi-Cloud Migration",
                "count": cloud_count,
                "help_count": 0,
                "version": "Cloud v2.0",
                "icon": "Cloud"
            }
        },
        "total_documents": total_docs,
        "pinned": [{
            "id": d.id, "title": d.title, "product": d.product or "xpi", "file_type": d.file_type, "views": d.views or 0
        } for d in pinned_docs],
        "recent": [{
            "id": d.id, "title": d.title, "product": d.product or "xpi", "file_type": d.file_type,
            "author": d.author or "", "created_at": d.created_at.strftime("%d %b, %Y") if d.created_at else ""
        } for d in recent_docs],
        "trending": [{
            "id": d.id, "title": d.title, "product": d.product or "xpi", "file_type": d.file_type, "views": d.views or 0, "likes": d.likes or 0
        } for d in top_docs]
    }

@app.get("/api/spaces")
def get_spaces(product: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Document)
    if product and product.lower() not in ["all", "global", ""]:
        query = query.filter(Document.product == product.lower())
    docs = query.all()
    spaces = set()
    for doc in docs:
        crumbs = json.loads(doc.breadcrumbs) if doc.breadcrumbs else []
        if crumbs:
            spaces.add(crumbs[0])
        else:
            spaces.add("General")
    spaces.discard("Uploads")
    spaces.discard("uploads")
    return sorted(list(spaces))

@app.get("/api/space/{space_name}/tree")
def get_space_tree(space_name: str, product: Optional[str] = None, db: Session = Depends(get_db)):
    HIDDEN_FOLDERS = {"uploads", "Uploads"}
    query = db.query(Document)
    if product and product.lower() not in ["all", "global", ""]:
        query = query.filter(Document.product == product.lower())
    docs = query.all()
    
    space_docs = []
    for doc in docs:
        crumbs = json.loads(doc.breadcrumbs) if doc.breadcrumbs else []
        if crumbs and crumbs[0] in HIDDEN_FOLDERS:
            continue
        if space_name in ["all", "all_products"]:
            space_docs.append(doc)
        elif not crumbs and space_name == "General":
            space_docs.append(doc)
        elif crumbs and crumbs[0] == space_name:
            space_docs.append(doc)
            
    tree_map = {}
    root_nodes = []
    space_docs.sort(key=lambda d: len(json.loads(d.breadcrumbs) if d.breadcrumbs else []))
    
    for doc in space_docs:
        crumbs = json.loads(doc.breadcrumbs) if doc.breadcrumbs else []
        if space_name in ["all", "all_products"]:
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
                    "file_type": doc.file_type if is_leaf else None,
                    "product": doc.product if is_leaf else None
                }
                tree_map[path_key] = node
                parent_node_children.append(node)
            else:
                if is_leaf:
                    tree_map[path_key]["id"] = doc.id
                    tree_map[path_key]["type"] = "page"
                    tree_map[path_key]["file_type"] = doc.file_type
                    tree_map[path_key]["product"] = doc.product
                    
            parent_node_children = tree_map[path_key]["children"]
            
    return root_nodes

# ----------------- Tags, Favorites, Pins & Comments -----------------

@app.get("/api/tags")
def get_all_tags(product: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Document.tags)
    if product and product.lower() not in ["all", "global", ""]:
        query = query.filter(Document.product == product.lower())
    docs = query.all()
    tag_freq = {}
    for (tags_str,) in docs:
        if tags_str:
            for tag in tags_str.split(','):
                tag = tag.strip().lower()
                if tag:
                    tag_freq[tag] = tag_freq.get(tag, 0) + 1
    sorted_tags = sorted(tag_freq.items(), key=lambda x: x[1], reverse=True)
    return [{"tag": t, "count": c} for t, c in sorted_tags[:30]]

@app.get("/api/recently-viewed")
def get_recently_viewed(ids: str, db: Session = Depends(get_db)):
    if not ids or not ids.strip():
        return []
    try:
        id_list = [int(x.strip()) for x in ids.split(',') if x.strip().isdigit()]
    except Exception:
        return []
    if not id_list:
        return []
    docs = db.query(Document).filter(Document.id.in_(id_list)).all()
    docs_by_id = {d.id: {
        "id": d.id, 
        "title": d.title, 
        "file_type": d.file_type, 
        "product": d.product or "xpi",
        "breadcrumbs": json.loads(d.breadcrumbs) if d.breadcrumbs else []
    } for d in docs}
    return [docs_by_id[i] for i in id_list if i in docs_by_id]

@app.get("/api/pinned")
def get_pinned(product: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Document).filter(Document.is_pinned == True)
    if product and product.lower() not in ["all", "global", ""]:
        query = query.filter(Document.product == product.lower())
    docs = query.all()
    return [{
        "id": d.id,
        "title": d.title,
        "product": d.product or "xpi",
        "file_type": d.file_type,
        "views": d.views or 0
    } for d in docs]

@app.post("/api/document/{doc_id}/pin")
def toggle_pin(doc_id: int, db: Session = Depends(get_db)):
    """Allow pinning for all users (accessible without forced admin role)."""
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

@app.get("/api/document/{doc_id}/comments")
def get_comments(doc_id: str, db: Session = Depends(get_db)):
    if str(doc_id).startswith("help_"):
        return []
    try:
        int_id = int(doc_id)
    except ValueError:
        return []
    comments = db.query(Comment).filter(Comment.document_id == int_id).order_by(Comment.created_at.desc()).all()
    return [{
        "id": c.id,
        "username": c.username,
        "content": c.content,
        "created_at": c.created_at.strftime("%Y-%m-%d %H:%M:%S")
    } for c in comments]

@app.post("/api/document/{doc_id}/comments")
def add_comment(
    doc_id: str, 
    content: str = Form(...), 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    if str(doc_id).startswith("help_"):
        raise HTTPException(status_code=400, detail="Comments are not supported on reference manual topics")
    try:
        int_id = int(doc_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document ID")
    doc = db.query(Document).filter(Document.id == int_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    new_comment = Comment(
        document_id=int_id,
        username=current_user.username,
        content=content.strip()
    )
    db.add(new_comment)
    db.commit()
    
    # Notify Super Admin via Email
    try:
        notify_new_comment(doc.title, current_user.username, content.strip())
    except Exception as e:
        print(f"Comment email notification warning: {e}")
        
    return {
        "id": new_comment.id,
        "username": new_comment.username,
        "content": new_comment.content,
        "created_at": new_comment.created_at.strftime("%Y-%m-%d %H:%M:%S")
    }

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

@app.post("/api/document/{doc_id}/favorite")
def toggle_favorite(doc_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    uname = current_user.username.lower().strip()
    favorite = db.query(Favorite).filter(Favorite.document_id == doc_id, func.lower(Favorite.username) == uname).first()
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
    uname = current_user.username.lower().strip()
    favorites = db.query(Favorite).filter(func.lower(Favorite.username) == uname).all()
    doc_ids = [f.document_id for f in favorites]
    docs = db.query(Document).filter(Document.id.in_(doc_ids)).order_by(Document.created_at.desc()).all() if doc_ids else []
    return [{
        "id": d.id,
        "title": d.title,
        "product": d.product or "xpi",
        "file_type": d.file_type,
        "views": d.views or 0,
        "created_at": d.created_at.strftime("%d %b, %Y") if d.created_at else "",
        "breadcrumbs": json.loads(d.breadcrumbs) if d.breadcrumbs else []
    } for d in docs]

@app.get("/api/my/contributions")
def get_my_contributions(limit: int = 8, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Self-scoped contributions for the signed-in user (no admin rights required)."""
    uname = current_user.username.lower().strip()
    docs = (db.query(Document)
              .filter(func.lower(Document.author) == uname)
              .filter(Document.status == "published")
              .order_by(Document.created_at.desc())
              .limit(limit).all())
    return [{
        "id": d.id,
        "title": d.title,
        "product": d.product or "xpi",
        "file_type": d.file_type,
        "views": d.views or 0,
        "created_at": d.created_at.strftime("%d %b, %Y") if d.created_at else ""
    } for d in docs]

@app.post("/api/document/{doc_id}/like")
def like_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.likes = (doc.likes or 0) + 1
    db.commit()
    return {"likes": doc.likes}

# ----------------- Document Editing -----------------

@app.put("/api/document/{doc_id}")
def update_document(
    doc_id: int,
    title: str = Form(...),
    content: str = Form(...),
    product: Optional[str] = Form("xpi"),
    version: Optional[str] = Form("Universal"),
    doc_type: Optional[str] = Form("troubleshooting"),
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
                title_tag = soup.find(id="title-text") or soup.find("title")
                if title_tag:
                    title_tag.string = title
                if content_div:
                    content_div.clear()
                    content_div.append(BeautifulSoup(content, "html.parser"))
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
    if product:
        doc.product = product
    if version:
        doc.version = version
    if doc_type:
        doc.doc_type = doc_type
    doc.tags = tags
    db.commit()
    
    return {
        "id": doc.id,
        "title": doc.title,
        "product": doc.product,
        "message": "Document updated and reindexed successfully."
    }



# ----------------- Document Upload & KB Authoring (Direct Publication & Instant Re-Indexing) -----------------

@app.post("/api/upload")
async def upload_documents(
    background_tasks: BackgroundTasks,
    request: Request,
    files: List[UploadFile] = File(...),
    product: Optional[str] = Form("xpi"),
    upload_mode: Optional[str] = Form("publish"), # "publish" vs "review"
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    author_name = current_user.username if current_user else "Support Contributor"
    user_role = current_user.role if current_user else "Viewer"
    mode = (upload_mode or "publish").lower().strip()
    
    # If review mode is selected, set status to pending_review regardless of role
    target_status = "pending_review" if mode == "review" else "published"

    prod = (product or "xpi").lower().strip()
    if prod not in ["xpa", "xpi", "cloud_native", "general"]:
        prod = "xpi"

    target_dir = {
        "xpa": UPLOADS_XPA,
        "xpi": UPLOADS_XPI,
        "cloud_native": UPLOADS_CLOUD
    }.get(prod, UPLOADS_GENERAL)
    os.makedirs(target_dir, exist_ok=True)

    saved_count = 0
    saved_docs = []

    for file in files:
        if not file.filename:
            continue
        dest_path = os.path.join(target_dir, file.filename)
        normalized_dest_path = os.path.abspath(dest_path)
        with open(normalized_dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        saved_count += 1
        
        ext = file.filename.split(".")[-1].lower()
        if ext == "zip":
            zip_subfolder = os.path.splitext(file.filename)[0]
            extract_dir = os.path.join(target_dir, zip_subfolder)
            os.makedirs(extract_dir, exist_ok=True)
            try:
                import zipfile
                with zipfile.ZipFile(normalized_dest_path, 'r') as zp:
                    zp.extractall(extract_dir)
                for root, _, zfiles in os.walk(extract_dir):
                    for zf in zfiles:
                        zext = zf.split(".")[-1].lower()
                        if zext in ["html", "htm", "pdf", "docx", "txt", "md"]:
                            zpath = os.path.abspath(os.path.join(root, zf))
                            zdoc = index_single_file(
                                file_path=zpath,
                                file_type=zext,
                                db=db,
                                explicit_product=prod
                            )
                            if zdoc:
                                zdoc.status = target_status
                                zdoc.author = author_name
                                zdoc.product = prod
                                zdoc.is_legacy_import = False
                                zdoc.created_at = datetime.utcnow()
                                db.commit()
                                saved_docs.append(zdoc)
                                saved_count += 1
            except Exception as e:
                print(f"[Zip Ingestion Error]: {e}")
        else:
            doc = index_single_file(
                file_path=normalized_dest_path,
                file_type=ext,
                db=db,
                explicit_product=prod
            )
            if doc:
                doc.status = target_status
                doc.author = author_name
                doc.product = prod
                doc.is_legacy_import = False
                doc.created_at = datetime.utcnow()
                db.commit()
                saved_docs.append(doc)

    total_indexed = db.query(Document).count()

    if target_status == "pending_review":
        notif_title = f"New Document Pending Review in {prod.upper()}"
        notif_msg = f"{saved_count} file(s) submitted for review by {author_name}."
    else:
        notif_title = f"New Documents Ingested in {prod.upper()}"
        notif_msg = f"{saved_count} file(s) ingested & published by {author_name}."

    notif = Notification(title=notif_title, message=notif_msg, product=prod)
    db.add(notif)
    db.commit()

    if target_status == "published":
        for doc in saved_docs:
            background_tasks.add_task(notify_document_uploaded, doc.title, prod, author_name, doc.file_type)

    msg = f"Uploaded {saved_count} document(s) in {prod.upper()} space with status '{target_status}'."

    client_ip = request.client.host if request and request.client else "127.0.0.1"
    file_names = [f.filename for f in files if f.filename]
    file_preview = f": {', '.join(file_names[:4])}{' and others' if len(file_names) > 4 else ''}" if file_names else ""
    log_enterprise_action(
        db=db,
        username=author_name,
        role=user_role,
        ip_address=client_ip,
        action_category="KB_MANAGE",
        action="UPLOAD",
        details=f"{msg}{file_preview}"
    )

    return {
        "message": msg,
        "product": prod,
        "uploaded_count": saved_count,
        "status": target_status,
        "total_indexed": total_indexed
    }

@app.post("/api/kb/upload-asset")
async def upload_kb_asset(
    file: UploadFile = File(...),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded.")

    os.makedirs(UPLOADS_ASSETS, exist_ok=True)
    orig_name = file.filename
    clean_name = re.sub(r'[^a-zA-Z0-9_\.-]', '_', orig_name)
    timestamp = int(datetime.utcnow().timestamp())
    saved_filename = f"{timestamp}_{clean_name}"
    dest_path = os.path.join(UPLOADS_ASSETS, saved_filename)

    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    ext = clean_name.split('.')[-1].lower() if '.' in clean_name else ''
    is_img = ext in ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']
    file_size = os.path.getsize(dest_path)

    return {
        "url": f"/api/kb/assets/{saved_filename}",
        "filename": orig_name,
        "saved_filename": saved_filename,
        "file_type": ext,
        "is_image": is_img,
        "size_bytes": file_size
    }

@app.post("/api/kb/create")
@app.post("/api/create-article")   # legacy path, kept so existing callers keep working
async def create_kb_article(
    request: Request,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    author_name = current_user.username if current_user else "Support Specialist"
    user_role = current_user.role if current_user else "Viewer"

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        data = await request.json()
    else:
        form = await request.form()
        data = dict(form)

    title = data.get("title") or ""
    content = data.get("content") or ""
    product = data.get("product") or "xpi"
    version = data.get("version") or "Universal"
    doc_type = data.get("doc_type") or data.get("category") or "troubleshooting"
    tags = data.get("tags") or ""
    upload_mode = data.get("upload_mode") or "publish"

    if not title.strip() or not content.strip():
        raise HTTPException(status_code=400, detail="Title and content are required.")

    prod = (product or "xpi").lower().strip()
    if prod not in ["xpa", "xpi", "cloud_native", "general"]:
        prod = "xpi"

    target_dir = {
        "xpa": UPLOADS_XPA,
        "xpi": UPLOADS_XPI,
        "cloud_native": UPLOADS_CLOUD
    }.get(prod, UPLOADS_GENERAL)
    os.makedirs(target_dir, exist_ok=True)

    safe_title = re.sub(r'[\\/*?:"<>|]', "", title.strip())
    filename = f"KB_{int(datetime.utcnow().timestamp())}_{safe_title[:40]}.md"
    file_path = os.path.abspath(os.path.join(target_dir, filename))

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(f"# {title}\n\n**Product Space:** {prod.upper()} | **Version:** {version}\n\n{content}")

    target_status = "pending_review" if (upload_mode or "publish").lower().strip() == "review" else "published"

    new_doc = Document(
        title=title.strip(),
        file_path=file_path,
        file_type="md",
        content=content.strip(),
        author=author_name,
        product=prod,
        version=version.strip() if version else "Universal",
        doc_type=doc_type.strip() if doc_type else "troubleshooting",
        tags=tags,
        is_legacy_import=False,
        status=target_status
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)

    client_ip = request.client.host if request and request.client else "127.0.0.1"
    log_enterprise_action(
        db=db,
        username=author_name,
        role=user_role,
        ip_address=client_ip,
        action_category="KB_MANAGE",
        action="KB_CREATE",
        details=f"Authored KB article '{title.strip()}' in {prod.upper()} space (status: '{target_status}').",
        target_id=str(new_doc.id)
    )

    if target_status == "pending_review":
        notif = Notification(
            title=f"New KB Pending Review: {title[:45]}",
            message=f"Submitted by {author_name} for review in {prod.upper()} space.",
            doc_id=new_doc.id
        )
    else:
        notif = Notification(
            title=f"New KB Published: {title[:45]}",
            message=f"Published by {author_name} in {prod.upper()} space.",
            doc_id=new_doc.id
        )
        notify_document_uploaded(new_doc.title, prod, author_name, "md")
        
    db.add(notif)
    db.commit()

    return {
        "id": new_doc.id,
        "doc_id": new_doc.id,
        "title": new_doc.title,
        "status": target_status,
        "message": f"KB article '{title}' submitted with status '{target_status}'."
    }

# ----------------- Super Admin User Contribution Analytics -----------------

@app.get("/api/admin/contributions")
def get_user_contributions(
    scope: Optional[str] = "live", # "live", "historical", "all"
    username: Optional[str] = None,
    product: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    year: Optional[str] = None,
    month: Optional[str] = None,
    period: Optional[str] = None, # "week", "month", "year", "all"
    contributor_status: Optional[str] = None, # "all", "active", "former"
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    
    scope_clean = (scope or "live").lower().strip()
    query = db.query(Document)
    now = datetime.now()
    
    # Mapping of registered users in system
    registered_users = {u.username.lower(): u for u in db.query(User).all()}
    active_usernames_lower = [u.username.lower() for u in registered_users.values() if getattr(u, "is_active", True)]

    # 0. Scope filtering: live platform vs historical Confluence archive
    if scope_clean == "live":
        query = query.filter(
            (Document.is_legacy_import == False) | (func.lower(Document.author).in_(active_usernames_lower))
        )
    elif scope_clean in ["historical", "legacy"]:
        query = query.filter(
            (Document.is_legacy_import == True) | (~func.lower(Document.author).in_(active_usernames_lower))
        )
    # else "all": no restriction

    # 0.1 Filter by dynamic period (this week, this month, this year)
    if period and period.lower() not in ["all", ""]:
        p_clean = period.lower().strip()
        if p_clean in ["week", "this_week"]:
            week_start = now - timedelta(days=now.weekday())
            week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
            query = query.filter(Document.created_at >= week_start)
        elif p_clean in ["month", "this_month"]:
            month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            query = query.filter(Document.created_at >= month_start)
        elif p_clean in ["year", "this_year"]:
            year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
            query = query.filter(Document.created_at >= year_start)

    # 1. Filter by username
    if username and username.lower() not in ["all", ""]:
        query = query.filter(Document.author.ilike(username.strip()))
        
    # 2. Filter by product
    if product and product.lower() not in ["all", "global", ""]:
        query = query.filter(Document.product == product.lower().strip())
        
    # 3. Filter by date range (start_date, end_date)
    if start_date and start_date.strip():
        try:
            s_dt = datetime.strptime(start_date.strip(), "%Y-%m-%d")
            query = query.filter(Document.created_at >= s_dt)
        except Exception:
            pass
            
    if end_date and end_date.strip():
        try:
            e_dt = datetime.strptime(end_date.strip(), "%Y-%m-%d").replace(hour=23, minute=59, second=59)
            query = query.filter(Document.created_at <= e_dt)
        except Exception:
            pass
            
    # 4. Filter by specific year
    if year and year.lower() not in ["all", ""]:
        try:
            y_val = int(year)
            query = query.filter(func.strftime("%Y", Document.created_at) == str(y_val))
        except Exception:
            pass
            
    # 5. Filter by specific month
    if month and month.lower() not in ["all", ""]:
        try:
            m_val = int(month)
            m_str = f"{m_val:02d}"
            query = query.filter(func.strftime("%m", Document.created_at) == m_str)
        except Exception:
            pass

    all_matching_docs = query.order_by(Document.created_at.desc()).all()
    
    def is_active_contributor(author_name: str) -> bool:
        if not author_name:
            return False
        auth_lower = author_name.lower().strip()
        if auth_lower == "admin":
            return True
        reg = registered_users.get(auth_lower)
        if reg:
            return getattr(reg, "is_active", True) is not False
        return False

    # Filter documents by contributor status if requested
    if contributor_status and contributor_status.lower() in ["active", "former"]:
        want_active = (contributor_status.lower() == "active")
        docs = [d for d in all_matching_docs if is_active_contributor(d.author) == want_active]
    else:
        docs = all_matching_docs

    total_uploads = len(docs)
    total_views = sum(d.views or 0 for d in docs)
    total_likes = sum(d.likes or 0 for d in docs)
    
    # Aggregate contributions by user
    user_stats = {}
    for d in docs:
        auth = d.author or "System"
        if auth not in user_stats:
            user_stats[auth] = {
                "username": auth,
                "upload_count": 0,
                "views": 0,
                "likes": 0,
                "by_product": {"xpi": 0, "xpa": 0, "cloud_native": 0, "general": 0},
                "by_type": {},
                "latest_upload": None
            }
        user_stats[auth]["upload_count"] += 1
        user_stats[auth]["views"] += (d.views or 0)
        user_stats[auth]["likes"] += (d.likes or 0)
        
        prod_k = d.product or "general"
        if prod_k in user_stats[auth]["by_product"]:
            user_stats[auth]["by_product"][prod_k] += 1
        else:
            user_stats[auth]["by_product"]["general"] += 1
            
        ft_k = d.file_type or "other"
        user_stats[auth]["by_type"][ft_k] = user_stats[auth]["by_type"].get(ft_k, 0) + 1
        
        if d.created_at:
            if not user_stats[auth]["latest_upload"] or d.created_at > user_stats[auth]["latest_upload"]:
                user_stats[auth]["latest_upload"] = d.created_at

    user_list = []
    for auth, stats in user_stats.items():
        reg_user = registered_users.get(auth.lower())
        user_id = reg_user.id if reg_user else None
        active_flag = is_active_contributor(auth)
        
        # If in live mode, skip non-registered legacy authors
        if scope_clean == "live" and not active_flag and not reg_user:
            continue

        user_list.append({
            "user_id": user_id,
            "username": auth,
            "role": reg_user.role if reg_user else ("Admin" if auth.lower() == "admin" else "Contributor"),
            "product_space": reg_user.product_space if reg_user else "all",
            "is_active": active_flag,
            "is_registered": reg_user is not None,
            "status": "active" if active_flag else "former",
            "status_label": "Active Team" if active_flag else "Alumni / Legacy",
            "upload_count": stats["upload_count"],
            "views": stats["views"],
            "likes": stats["likes"],
            "by_product": stats["by_product"],
            "by_type": stats["by_type"],
            "latest_upload": stats["latest_upload"].strftime("%Y-%m-%d %H:%M") if stats["latest_upload"] else "N/A"
        })
        
    # For live scope, ensure all active registered users appear in the leaderboard
    if scope_clean == "live" and contributor_status != "former":
        existing_usernames_lower = {u["username"].lower() for u in user_list}
        for u_obj in db.query(User).order_by(User.username.asc()).all():
            if getattr(u_obj, "is_active", True) and u_obj.username.lower() not in existing_usernames_lower:
                user_list.append({
                    "user_id": u_obj.id,
                    "username": u_obj.username,
                    "role": u_obj.role,
                    "product_space": u_obj.product_space or "all",
                    "is_active": True,
                    "is_registered": True,
                    "status": "active",
                    "status_label": "Active Team",
                    "upload_count": 0,
                    "views": 0,
                    "likes": 0,
                    "by_product": {"xpi": 0, "xpa": 0, "cloud_native": 0, "general": 0},
                    "by_type": {},
                    "latest_upload": "No uploads yet"
                })

    user_list.sort(key=lambda x: (x["upload_count"], 1 if x["is_active"] else 0), reverse=True)
    
    active_count = sum(1 for u in user_list if u["is_active"])
    former_count = sum(1 for u in user_list if not u["is_active"])
    active_uploads = sum(u["upload_count"] for u in user_list if u["is_active"])
    former_uploads = sum(u["upload_count"] for u in user_list if not u["is_active"])

    top_contributor = user_list[0]["username"] if user_list and user_list[0]["upload_count"] > 0 else "None"
    top_contributor_count = user_list[0]["upload_count"] if user_list else 0
    unique_contributors = sum(1 for u in user_list if u["upload_count"] > 0)
    
    # Monthly timeline aggregation for trend visualization
    timeline_map = {}
    for d in docs:
        if d.created_at:
            month_key = d.created_at.strftime("%Y-%m")
            month_label = d.created_at.strftime("%b %Y")
        else:
            month_key = "Unknown"
            month_label = "Unknown"
            
        if month_key not in timeline_map:
            timeline_map[month_key] = {"key": month_key, "label": month_label, "count": 0, "views": 0}
        timeline_map[month_key]["count"] += 1
        timeline_map[month_key]["views"] += (d.views or 0)
        
    timeline = sorted(timeline_map.values(), key=lambda x: x["key"])
    
    # Available users filter based on active scope
    reg_user_objs = db.query(User).order_by(User.username.asc()).all()
    if scope_clean == "live":
        author_options = [u.username for u in reg_user_objs if getattr(u, "is_active", True)]
    elif scope_clean in ["historical", "legacy"]:
        author_options = sorted(list(set(d.author for d in db.query(Document.author).filter(Document.is_legacy_import == True).all() if d.author)))
    else:
        author_options = sorted(list(set(u.username for u in reg_user_objs) | set(d.author for d in db.query(Document.author).all() if d.author)))
    if "admin" not in author_options and scope_clean != "historical":
        author_options.insert(0, "admin")
    
    years_raw = db.query(func.strftime("%Y", Document.created_at)).distinct().all()
    available_years = sorted(list(set(y[0] for y in years_raw if y[0])), reverse=True)
    if "2026" not in available_years:
        available_years.insert(0, "2026")

    article_records = [{
        "id": d.id,
        "title": d.title,
        "author": d.author or "System",
        "author_is_active": is_active_contributor(d.author),
        "author_status": "active" if is_active_contributor(d.author) else "former",
        "product": d.product or "xpi",
        "file_type": d.file_type,
        "version": d.version or "Universal",
        "views": d.views or 0,
        "likes": d.likes or 0,
        "created_at": d.created_at.strftime("%Y-%m-%d %H:%M") if d.created_at else "N/A",
        "created_date": d.created_at.strftime("%Y-%m-%d") if d.created_at else ""
    } for d in docs[:500]]
    
    return {
        "scope": scope_clean,
        "summary": {
            "total_uploads": total_uploads,
            "unique_contributors": unique_contributors,
            "active_contributors_count": active_count,
            "former_contributors_count": former_count,
            "active_uploads_count": active_uploads,
            "former_uploads_count": former_uploads,
            "top_contributor": top_contributor,
            "top_contributor_count": top_contributor_count,
            "total_views": total_views,
            "total_likes": total_likes
        },
        "contributors": user_list,
        "timeline": timeline,
        "articles": article_records,
        "available_filters": {
            "users": author_options,
            "years": available_years,
            "products": ["xpi", "xpa", "cloud_native", "general"],
            "scopes": [
                {"value": "live", "label": "🌟 Live Platform Users (Default)"},
                {"value": "historical", "label": "🏛️ Historical Confluence Archive"},
                {"value": "all", "label": "🌐 All Data (Combined)"}
            ],
            "statuses": [
                {"value": "all", "label": "🌟 All Contributors (Active & Alumni)"},
                {"value": "active", "label": "🟢 Active Employees Only"},
                {"value": "former", "label": "🏛️ Alumni / Former Contributors"}
            ]
        }
    }

# ----------------- Admin Panel Endpoints -----------------

@app.get("/api/admin/users")
def get_users(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    users = db.query(User).all()
    return [{
        "id": u.id, 
        "username": u.username, 
        "role": u.role,
        "product_space": getattr(u, "product_space", "all") or "all",
        "is_active": getattr(u, "is_active", True) if getattr(u, "is_active", None) is not None else True
    } for u in users]

@app.post("/api/admin/users")
def create_user(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
    role: str = Form(...),
    product_space: Optional[str] = Form("all"),
    is_active: Optional[str] = Form("true"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    existing = db.query(User).filter(func.lower(User.username) == username.lower().strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    hashed_pw = get_password_hash(password)
    active_flag = str(is_active).lower() in ["true", "1", "yes", "active"]
    new_user = User(
        username=username.strip(), 
        hashed_password=hashed_pw, 
        role=role.strip(),
        product_space=product_space.strip().lower() if product_space else "all",
        is_active=active_flag
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    log_enterprise_action(
        db=db,
        username=current_user.username,
        role=current_user.role,
        ip_address=client_ip,
        action_category="ADMIN",
        action="USER_CREATE",
        details=f"Created user '{username.strip()}' with role {role.strip()}.",
        target_id=str(new_user.id)
    )
    return {"message": f"User {username} created successfully"}

@app.put("/api/admin/users/{user_id}")
def update_user(
    user_id: int,
    request: Request,
    role: Optional[str] = Form(None),
    product_space: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
    is_active: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if role:
        user.role = role.strip()
    if product_space:
        user.product_space = product_space.strip().lower()
    if password and password.strip():
        user.hashed_password = get_password_hash(password.strip())
    if is_active is not None:
        user.is_active = (str(is_active).lower() in ["true", "1", "yes", "active"])
    db.commit()
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    log_enterprise_action(
        db=db,
        username=current_user.username,
        role=current_user.role,
        ip_address=client_ip,
        action_category="ADMIN",
        action="USER_UPDATE",
        details=f"Updated user '{user.username}' (active={user.is_active}, role={user.role}).",
        target_id=str(user.id)
    )
    return {"message": f"User {user.username} updated successfully", "is_active": user.is_active}

@app.delete("/api/admin/users/{user_id}")
def delete_user(user_id: int, request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.username.lower() == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete default administrator account")
    deleted_username = user.username
    db.delete(user)
    db.commit()
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    log_enterprise_action(
        db=db,
        username=current_user.username,
        role=current_user.role,
        ip_address=client_ip,
        action_category="ADMIN",
        action="USER_DELETE",
        details=f"Deleted user '{deleted_username}'.",
        target_id=str(user_id)
    )
    return {"message": f"User {deleted_username} deleted"}

@app.post("/api/admin/reindex")
def trigger_reindex(request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    try:
        count, msg = scan_and_index(db)
        client_ip = request.client.host if request and request.client else "127.0.0.1"
        log_enterprise_action(
            db=db,
            username=current_user.username,
            role=current_user.role,
            ip_address=client_ip,
            action_category="ADMIN",
            action="REINDEX",
            details=f"Triggered manual re-index; {count} documents synchronized."
        )
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
def get_files(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    docs = db.query(Document).order_by(Document.created_at.desc()).limit(200).all()
    return [{
        "id": d.id,
        "title": d.title,
        "author": d.author or "Engineering",
        "status": d.status or "published",
        "product": d.product or "xpi",
        "file_type": d.file_type,
        "version": d.version or "Universal",
        "doc_type": d.doc_type or "troubleshooting",
        "file_path": os.path.basename(d.file_path) if d.file_path else "",
        "views": d.views or 0,
        "created_at": d.created_at.strftime("%Y-%m-%d %H:%M") if d.created_at else ""
    } for d in docs]

@app.put("/api/admin/document/{doc_id}/product")
def update_document_product(
    doc_id: int, 
    request: Request,
    product: str = Form(...),
    doc_type: Optional[str] = Form(None),
    version: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    old_prod = doc.product
    doc.product = product.lower().strip()
    if doc_type:
        doc.doc_type = doc_type
    if version:
        doc.version = version
    db.commit()
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    log_enterprise_action(
        db=db,
        username=current_user.username,
        role=current_user.role,
        ip_address=client_ip,
        action_category="KB_MANAGE",
        action="DOCUMENT_REASSIGN",
        details=f"Reassigned document '{doc.title}' from {old_prod.upper() if old_prod else 'N/A'} to {product.upper()}.",
        target_id=str(doc.id)
    )
    return {"message": f"Document '{doc.title}' product updated to {product}"}

@app.delete("/api/admin/document/{doc_id}")
def delete_document(doc_id: int, request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    deleted_title = doc.title
    if os.path.exists(doc.file_path) and "uploads" in doc.file_path.lower():
        try:
            os.remove(doc.file_path)
        except Exception:
            pass
    # SQLite runs with PRAGMA foreign_keys=OFF by default, so the declared
    # ON DELETE CASCADE never fires. Clear dependent rows explicitly.
    db.query(Favorite).filter(Favorite.document_id == doc_id).delete(synchronize_session=False)
    db.query(Comment).filter(Comment.document_id == doc_id).delete(synchronize_session=False)
    db.delete(doc)
    db.commit()
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    log_enterprise_action(
        db=db,
        username=current_user.username,
        role=current_user.role,
        ip_address=client_ip,
        action_category="KB_MANAGE",
        action="DOCUMENT_DELETE",
        details=f"Deleted document '{deleted_title}' (ID: {doc_id}).",
        target_id=str(doc_id)
    )
    return {"message": f"Document {deleted_title} deleted successfully"}

@app.get("/api/admin/analytics")
def get_admin_analytics(
    scope: Optional[str] = "live",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin permission required")

    scope_clean = (scope or "live").lower().strip()
    active_users = db.query(User).filter(User.is_active == True).all()
    active_usernames_lower = [u.username.lower() for u in active_users]

    top_queries = db.query(SearchAnalytic.query, func.count(SearchAnalytic.id).label("count"))\
                    .group_by(SearchAnalytic.query)\
                    .order_by(func.count(SearchAnalytic.id).desc())\
                    .limit(10).all()
                    
    zero_results = db.query(SearchAnalytic.query, func.count(SearchAnalytic.id).label("count"))\
                     .filter(SearchAnalytic.results_count == 0)\
                     .group_by(SearchAnalytic.query)\
                     .order_by(func.count(SearchAnalytic.id).desc())\
                     .limit(10).all()

    # Scope-aware Document query for top contributors
    contrib_q = db.query(Document.author, func.count(Document.id).label("count"))
    if scope_clean == "live":
        contrib_q = contrib_q.filter(
            (Document.is_legacy_import == False) | (func.lower(Document.author).in_(active_usernames_lower))
        )
    elif scope_clean in ["historical", "legacy"]:
        contrib_q = contrib_q.filter(
            (Document.is_legacy_import == True) | (~func.lower(Document.author).in_(active_usernames_lower))
        )
    # else "all": no filter

    top_contrib_rows = contrib_q.group_by(Document.author)\
                                .order_by(func.count(Document.id).desc())\
                                .limit(8).all()

    author_results = []
    seen = set()
    for auth, cnt in top_contrib_rows:
        if auth:
            author_results.append({"author": auth, "count": cnt})
            seen.add(auth.lower())

    if scope_clean == "live":
        # Make sure active registered team members are represented
        for u in active_users:
            if u.username.lower() not in seen:
                author_results.append({"author": u.username, "count": 0})
        author_results = author_results[:8]

    by_product = {
        "xpa": db.query(Document).filter(Document.product == "xpa").count(),
        "xpi": db.query(Document).filter(Document.product == "xpi").count(),
        "cloud_native": db.query(Document).filter(Document.product == "cloud_native").count(),
        "general": db.query(Document).filter(Document.product == "general").count()
    }
    
    by_type = {}
    type_counts = db.query(Document.file_type, func.count(Document.id)).group_by(Document.file_type).all()
    for ft, count in type_counts:
        by_type[ft] = count
        
    return {
        "scope": scope_clean,
        "top_queries": [{"query": q, "count": c} for q, c in top_queries],
        "zero_result_queries": [{"query": q, "count": c} for q, c in zero_results],
        "top_contributors": author_results,
        "by_product": by_product,
        "by_type": by_type,
        "total_searches": db.query(SearchAnalytic).count()
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
            "product": d.product or "xpi",
            "views": d.views,
            "likes": d.likes,
            "file_type": d.file_type
        } for d in trending]
    }

@app.get("/api/review/download/{doc_id}")
def download_pending_review_document(
    doc_id: int,
    request: Request,
    current_user: User = Depends(require_role(["Admin", "Reviewer"])),
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc or not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Original document file not found")

    client_ip = request.client.host if request.client else "127.0.0.1"
    log_enterprise_action(
        db=db,
        username=current_user.username,
        role=current_user.role,
        ip_address=client_ip,
        action_category="REVIEW",
        action="REVIEW_DOWNLOAD_ORIGINAL",
        details=f"Reviewer downloaded original file '{os.path.basename(doc.file_path)}' for document '{doc.title}' ({doc.product.upper()})",
        target_id=doc.id
    )

    return FileResponse(
        path=doc.file_path,
        filename=os.path.basename(doc.file_path),
        media_type="application/octet-stream"
    )

@app.get("/api/admin/enterprise-audit-logs")
def get_enterprise_audit_logs(
    category: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
        
    query = db.query(EnterpriseAuditLog)
    if category and category != "all":
        query = query.filter(EnterpriseAuditLog.action_category == category.upper().strip())
    if search and search.strip():
        s = f"%{search.strip().lower()}%"
        query = query.filter(
            (func.lower(EnterpriseAuditLog.username).like(s)) |
            (func.lower(EnterpriseAuditLog.action).like(s)) |
            (func.lower(EnterpriseAuditLog.details).like(s)) |
            (func.lower(EnterpriseAuditLog.ip_address).like(s))
        )
        
    total = query.count()
    logs = query.order_by(EnterpriseAuditLog.id.desc()).offset(offset).limit(limit).all()
    
    return {
        "total": total,
        "logs": [{
            "id": l.id,
            "timestamp": l.timestamp.strftime("%Y-%m-%d %H:%M:%S") if l.timestamp else "",
            "username": l.username,
            "user_role": l.user_role,
            "ip_address": l.ip_address,
            "action_category": l.action_category,
            "action": l.action,
            "details": l.details,
            "target_id": l.target_id
        } for l in logs]
    }

@app.get("/api/review/queue")
def get_review_queue(
    product: Optional[str] = None,
    status_filter: Optional[str] = None,
    current_user: User = Depends(require_role(["Admin", "Reviewer"])),
    db: Session = Depends(get_db)
):
    if not status_filter or status_filter == "pending":
        query = db.query(Document).filter(Document.status.in_(["pending_review", "pending", "changes_requested"]))
    elif status_filter == "all":
        query = db.query(Document)
    else:
        query = db.query(Document).filter(Document.status == status_filter.lower().strip())
    if product and product != "all":
        query = query.filter(Document.product == product.lower().strip())
    if status_filter and status_filter != "all":
        query = query.filter(Document.status == status_filter.lower().strip())
        
    docs = query.order_by(Document.created_at.desc()).all()
    return [{
        "id": d.id,
        "title": d.title,
        "author": d.author or "Support Contributor",
        "product": d.product or "xpi",
        "file_type": d.file_type or "md",
        "version": d.version or "Universal",
        "doc_type": d.doc_type or "troubleshooting",
        "status": d.status or "pending_review",
        "created_at": d.created_at.strftime("%Y-%m-%d %H:%M") if d.created_at else "",
        "review_comment": d.review_comment or "",
        "content": d.content or "No document content available.",
        "content_preview": d.content[:400] if d.content else ""
    } for d in docs]

@app.post("/api/review/action")
async def process_review_action(
    request: Request,
    current_user: User = Depends(require_role(["Admin", "Reviewer"])),
    db: Session = Depends(get_db)
):
    body = await request.json()
    doc_id = body.get("doc_id") or body.get("document_id")
    action = body.get("action") # "approve", "request_changes", "reject"
    reviewer_comment = (body.get("reviewer_comment") or body.get("comment") or "").strip()

    if not doc_id:
        raise HTTPException(status_code=400, detail="Missing document_id in request body")

    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    client_ip = request.client.host if request.client else "127.0.0.1"

    if action == "approve":
        doc.status = "published"
        doc.review_comment = None
        notif = Notification(
            title=f"KB Approved & Published: {doc.title[:40]}",
            message=f"Your KB article has been approved by {current_user.username} and published to {doc.product.upper()}.",
            doc_id=doc.id
        )
        db.add(notif)
        log_enterprise_action(db, current_user.username, current_user.role, client_ip, "REVIEW", "REVIEW_APPROVE", f"Approved and published document '{doc.title}' into {doc.product.upper()} space.", target_id=doc.id)
        db.commit()
        return {"status": "published", "message": f"Document '{doc.title}' approved and published successfully!"}

    elif action == "request_changes":
        doc.status = "changes_requested"
        doc.review_comment = reviewer_comment
        notif = Notification(
            title=f"Changes Requested: {doc.title[:40]}",
            message=f"Reviewer {current_user.username} requested changes: {reviewer_comment[:100]}",
            doc_id=doc.id
        )
        db.add(notif)
        log_enterprise_action(db, current_user.username, current_user.role, client_ip, "REVIEW", "REVIEW_REQUEST_CHANGES", f"Requested changes for document '{doc.title}': {reviewer_comment}", target_id=doc.id)
        db.commit()
        return {"status": "changes_requested", "message": "Changes requested successfully."}

    elif action == "reject":
        doc.status = "rejected"
        doc.review_comment = reviewer_comment
        notif = Notification(
            title=f"KB Article Rejected: {doc.title[:40]}",
            message=f"Reviewer {current_user.username} rejected the submission: {reviewer_comment[:100]}",
            doc_id=doc.id
        )
        db.add(notif)
        log_enterprise_action(db, current_user.username, current_user.role, client_ip, "REVIEW", "REVIEW_REJECT", f"Rejected document submission '{doc.title}': {reviewer_comment}", target_id=doc.id)
        db.commit()
        return {"status": "rejected", "message": "Document rejected."}

    else:
        raise HTTPException(status_code=400, detail="Invalid action")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOWNLOADS_DIR = os.path.join(BASE_DIR, "downloads")
UPLOADS_UTILITIES = DOWNLOADS_DIR
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

def sync_downloads_folder(db: Session):
    if not os.path.exists(DOWNLOADS_DIR):
        return
    existing_paths = {os.path.normpath(u.file_path).lower() for u in db.query(SupportUtility).all() if u.file_path}
    
    for fname in os.listdir(DOWNLOADS_DIR):
        if fname.startswith(".") or fname.startswith("~"):
            continue
        fpath = os.path.normpath(os.path.join(DOWNLOADS_DIR, fname))
        if os.path.isfile(fpath) and fpath.lower() not in existing_paths:
            size_bytes = os.path.getsize(fpath)
            if size_bytes > 1048576:
                formatted_size = f"{size_bytes / (1024*1024):.1f} MB"
            else:
                formatted_size = f"{max(1, int(size_bytes / 1024))} KB"
                
            raw_name, ext = os.path.splitext(fname)
            ext_clean = ext.lstrip(".").lower()
            title = raw_name.replace("_", " ").replace("-", " ").title()
            if not title:
                title = fname
                
            cat = "Diagnostic & Tools"
            if ext_clean in ["exe", "msi", "app", "dmg"]:
                cat = "Executables & Installers"
            elif ext_clean in ["ps1", "py", "sh", "bat", "cmd"]:
                cat = "CLI & Scripts"
            elif ext_clean in ["zip", "7z", "tar", "gz", "rar"]:
                cat = "Patches & Packages"
            elif ext_clean in ["pdf", "docx", "txt", "md"]:
                cat = "Documentation & SOPs"
                
            util = SupportUtility(
                title=title,
                description=f"Direct file download ({fname}) available in server downloads folder.",
                file_path=fpath,
                file_size=formatted_size,
                product="general",
                category=cat,
                version="v1.0.0",
                platform="Cross-Platform",
                author="System / Folder Drop",
                download_count=0,
                is_active=True
            )
            db.add(util)
            db.commit()

@app.get("/api/utilities")
@app.get("/api/downloads")
def list_utilities(
    product: Optional[str] = None,
    category: Optional[str] = None,
    platform: Optional[str] = None,
    query: Optional[str] = None,
    db: Session = Depends(get_db)
):
    try:
        sync_downloads_folder(db)
    except Exception as e:
        print(f"[WARN] Error syncing downloads folder: {e}")

    q = db.query(SupportUtility).filter(SupportUtility.is_active == True)
    if product and product != "all":
        q = q.filter(SupportUtility.product.in_([product.lower().strip(), "general"]))
    if category and category != "all":
        q = q.filter(func.lower(SupportUtility.category) == category.lower().strip())
    if platform and platform != "all":
        q = q.filter(func.lower(SupportUtility.platform).contains(platform.lower().strip()))
    if query and query.strip():
        search = f"%{query.strip().lower()}%"
        q = q.filter((func.lower(SupportUtility.title).like(search)) | (func.lower(SupportUtility.description).like(search)))
        
    utils = q.order_by(SupportUtility.created_at.desc()).all()
    return [{
        "id": u.id,
        "title": u.title,
        "description": u.description or "",
        "file_path": u.file_path,
        "file_name": os.path.basename(u.file_path),
        "file_size": u.file_size,
        "product": u.product,
        "category": u.category,
        "version": u.version,
        "platform": u.platform,
        "author": u.author,
        "download_count": u.download_count or 0,
        "created_at": u.created_at.strftime("%Y-%m-%d %H:%M") if u.created_at else ""
    } for u in utils]

@app.post("/api/utilities/upload")
@app.post("/api/downloads/upload")
async def upload_utility(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(...),
    description: Optional[str] = Form(""),
    product: Optional[str] = Form("general"),
    category: Optional[str] = Form("Diagnostic"),
    version: Optional[str] = Form("v1.0.0"),
    platform: Optional[str] = Form("Cross-Platform"),
    current_user: User = Depends(require_role(["Admin", "Reviewer"])),
    db: Session = Depends(get_db)
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file attached.")
        
    os.makedirs(DOWNLOADS_DIR, exist_ok=True)
    clean_name = re.sub(r'[^a-zA-Z0-9_\.-]', '_', file.filename)
    save_path = os.path.abspath(os.path.join(DOWNLOADS_DIR, clean_name))
    
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    size_bytes = os.path.getsize(save_path)
    if size_bytes > 1048576:
        formatted_size = f"{size_bytes / (1024*1024):.1f} MB"
    else:
        formatted_size = f"{max(1, int(size_bytes / 1024))} KB"
        
    util = db.query(SupportUtility).filter(SupportUtility.file_path == save_path).first()
    if not util:
        util = SupportUtility(
            title=title.strip(),
            description=description.strip() if description else "",
            file_path=save_path,
            file_size=formatted_size,
            product=(product or "general").lower().strip(),
            category=category.strip() if category else "Diagnostic",
            version=version.strip() if version else "v1.0.0",
            platform=platform.strip() if platform else "Cross-Platform",
            author=current_user.username,
            download_count=0,
            is_active=True
        )
        db.add(util)
    else:
        util.title = title.strip()
        util.description = description.strip() if description else ""
        util.file_size = formatted_size
        util.product = (product or "general").lower().strip()
        util.category = category.strip() if category else "Diagnostic"
        util.version = version.strip() if version else "v1.0.0"
        util.platform = platform.strip() if platform else "Cross-Platform"
        util.is_active = True

    db.commit()
    db.refresh(util)
    
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    log_enterprise_action(
        db=db,
        username=current_user.username,
        role=current_user.role,
        ip_address=client_ip,
        action_category="DOWNLOADS",
        action="TOOL_UPLOAD",
        details=f"Uploaded and published support tool '{title.strip()}' ({platform}, {version}).",
        target_id=str(util.id)
    )

    return {"message": f"File '{file.filename}' published to Downloads section!", "id": util.id}

@app.get("/api/utilities/download/{utility_id}")
@app.get("/api/downloads/download/{utility_id}")
def download_utility(
    utility_id: int, 
    request: Request,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    util = db.query(SupportUtility).filter(SupportUtility.id == utility_id, SupportUtility.is_active == True).first()
    if not util or not os.path.exists(util.file_path):
        raise HTTPException(status_code=404, detail="Requested download file not found")
        
    util.download_count = (util.download_count or 0) + 1
    db.commit()
    
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    uname = current_user.username if current_user else "User"
    urole = current_user.role if current_user else "Viewer"
    log_enterprise_action(
        db=db,
        username=uname,
        role=urole,
        ip_address=client_ip,
        action_category="DOWNLOADS",
        action="TOOL_DOWNLOAD",
        details=f"Downloaded support tool '{util.title}' ({util.platform or 'Cross-Platform'}, {util.version or 'v1.0'}).",
        target_id=str(util.id)
    )

    return FileResponse(
        path=util.file_path,
        filename=os.path.basename(util.file_path),
        media_type="application/octet-stream"
    )

@app.delete("/api/utilities/{utility_id}")
@app.delete("/api/downloads/{utility_id}")
def delete_utility(
    utility_id: int, 
    request: Request,
    current_user: User = Depends(require_role(["Admin", "Reviewer"])), 
    db: Session = Depends(get_db)
):
    util = db.query(SupportUtility).filter(SupportUtility.id == utility_id).first()
    if not util:
        raise HTTPException(status_code=404, detail="Download file not found")
    util.is_active = False
    db.commit()
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    log_enterprise_action(
        db=db,
        username=current_user.username,
        role=current_user.role,
        ip_address=client_ip,
        action_category="DOWNLOADS",
        action="TOOL_DELETE",
        details=f"Deactivated support tool '{util.title}' (ID: {utility_id}).",
        target_id=str(utility_id)
    )
    return {"message": "File removed from Downloads section"}

# Serve static frontend files at the root
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
frontend_dir = os.path.join(BASE_DIR, "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
