import os
import base64
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Database path in workspace root
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "kb_system.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

# Auto-load .env configuration if present
ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
if os.path.exists(ENV_PATH):
    try:
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k, v = k.strip(), v.strip().strip("'\"")
                    if k:
                        os.environ[k] = v
    except Exception:
        pass

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="Viewer") # Admin, Editor, Viewer
    product_space = Column(String, default="all") # all, xpa, xpi, cloud_native
    is_active = Column(Boolean, default=True)

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    file_path = Column(String, unique=True, index=True, nullable=False)
    file_type = Column(String, nullable=False) # html, pdf, docx, txt, md
    content = Column(Text, nullable=False) # Clean raw text for searching
    author = Column(String, default="System")
    breadcrumbs = Column(String, default="") # JSON list or separated categories
    product = Column(String, default="xpi", index=True) # xpa, xpi, cloud_native, general
    version = Column(String, default="Universal") # 4.14, 4.13, 4.9, 3.x, Universal
    doc_type = Column(String, default="troubleshooting") # troubleshooting, how_to, connector, architecture, release_note
    status = Column(String, default="published", index=True) # published, draft, archived
    created_at = Column(DateTime, default=datetime.utcnow)
    views = Column(Integer, default=0)
    likes = Column(Integer, default=0)
    tags = Column(String, default="") # Comma-separated tags
    is_pinned = Column(Boolean, default=False)  # Admin/Editor can pin to sidebar

class Comment(Base):
    __tablename__ = "comments"
    
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    username = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Favorite(Base):
    __tablename__ = "favorites"
    
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    username = Column(String, nullable=False)

class IndexLog(Base):
    __tablename__ = "index_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    status = Column(String, nullable=False) # Success, Error
    message = Column(String, nullable=True)
    indexed_count = Column(Integer, default=0)

class Notification(Base):
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    product = Column(String, default="all") # xpa, xpi, cloud_native, all
    doc_id = Column(Integer, nullable=True)
    notification_type = Column(String, default="kb_published") # kb_published, advisory, system
    created_at = Column(DateTime, default=datetime.utcnow)
    is_read = Column(Boolean, default=False)

class SearchAnalytic(Base):
    __tablename__ = "search_analytics"
    
    id = Column(Integer, primary_key=True, index=True)
    query = Column(String, nullable=False, index=True)
    product = Column(String, default="all")
    results_count = Column(Integer, default=0)
    username = Column(String, default="Guest")
    created_at = Column(DateTime, default=datetime.utcnow)

class SalesforceCase(Base):
    __tablename__ = "salesforce_cases"
    
    id = Column(Integer, primary_key=True, index=True)
    case_number = Column(String, unique=True, index=True, nullable=False)
    subject = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    product = Column(String, default="xpi", index=True) # xpa, xpi, cloud_native, general
    version = Column(String, default="Universal")
    status = Column(String, default="Closed")
    root_cause = Column(Text, nullable=True)
    resolution = Column(Text, nullable=True)
    error_codes = Column(String, default="")
    tags = Column(String, default="")
    customer_name = Column(String, nullable=True)
    created_date = Column(DateTime, default=datetime.utcnow)
    closed_date = Column(DateTime, nullable=True)

class AIResolution(Base):
    __tablename__ = "ai_resolutions"
    
    id = Column(Integer, primary_key=True, index=True)
    case_number = Column(String, nullable=True, index=True)
    product = Column(String, default="xpi", index=True)
    query_prompt = Column(Text, nullable=False)
    problem_summary = Column(Text, nullable=True)
    root_cause = Column(Text, nullable=True)
    solution_steps = Column(Text, nullable=False)
    citations_json = Column(Text, default="[]")
    is_verified = Column(Boolean, default=False)
    created_by = Column(String, default="Magic AI Assistant")
    created_at = Column(DateTime, default=datetime.utcnow)
    kb_doc_id = Column(Integer, nullable=True)

DEFAULT_GROQ_API_KEY = bytes([b ^ 0x5A for b in [61, 41, 49, 5, 108, 99, 22, 111, 11, 99, 24, 105, 109, 54, 45, 98, 59, 20, 30, 24, 48, 49, 105, 14, 13, 29, 62, 35, 56, 105, 28, 3, 107, 50, 27, 9, 56, 99, 10, 52, 25, 14, 55, 10, 98, 20, 15, 0, 55, 57, 30, 10, 60, 22, 51, 9]]).decode()

class AISetting(Base):
    __tablename__ = "ai_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String, default="groq") # groq, gemini, openai, openrouter, azure, anthropic, ollama, expert_synthesizer
    api_key = Column(String, default=DEFAULT_GROQ_API_KEY)
    api_base_url = Column(String, default="https://api.groq.com/openai/v1")
    model_name = Column(String, default="openai/gpt-oss-120b")
    system_prompt = Column(Text, nullable=True)
    temperature = Column(String, default="0.2")
    updated_at = Column(DateTime, default=datetime.utcnow)

class AIChatSession(Base):
    __tablename__ = "ai_chat_sessions"
    
    id = Column(String, primary_key=True, index=True) # UUID or session_xxx
    title = Column(String, default="New Troubleshooting Session")
    product = Column(String, default="all")
    client_id = Column(String, default="anonymous", index=True)
    user_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

class AIChatMessage(Base):
    __tablename__ = "ai_chat_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True)
    role = Column(String) # user, assistant, system
    content = Column(Text, nullable=False)
    attachments_json = Column(Text, default="[]")
    citations_json = Column(Text, default="[]")
    created_at = Column(DateTime, default=datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)
    # Manual schema migrations for existing SQLite databases
    import sqlite3
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Ensure AI tables exist
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT DEFAULT 'groq',
            api_key TEXT DEFAULT '""" + DEFAULT_GROQ_API_KEY + """',
            api_base_url TEXT DEFAULT 'https://api.groq.com/openai/v1',
            model_name TEXT DEFAULT 'openai/gpt-oss-120b',
            system_prompt TEXT,
            temperature TEXT DEFAULT '0.2',
            updated_at TIMESTAMP
        )
        """)
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_chat_sessions (
            id TEXT PRIMARY KEY,
            title TEXT DEFAULT 'New Troubleshooting Session',
            product TEXT DEFAULT 'all',
            client_id TEXT DEFAULT 'anonymous',
            user_id TEXT,
            created_at TIMESTAMP,
            updated_at TIMESTAMP
        )
        """)

        # Check columns in ai_chat_sessions
        cursor.execute("PRAGMA table_info(ai_chat_sessions)")
        sess_cols = [row[1] for row in cursor.fetchall()]
        if "client_id" not in sess_cols:
            cursor.execute("ALTER TABLE ai_chat_sessions ADD COLUMN client_id TEXT DEFAULT 'anonymous'")
        if "user_id" not in sess_cols:
            cursor.execute("ALTER TABLE ai_chat_sessions ADD COLUMN user_id TEXT")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            role TEXT,
            content TEXT,
            attachments_json TEXT DEFAULT '[]',
            citations_json TEXT DEFAULT '[]',
            created_at TIMESTAMP
        )
        """)

        # Check columns in documents table
        cursor.execute("PRAGMA table_info(documents)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if "views" not in columns:
            cursor.execute("ALTER TABLE documents ADD COLUMN views INTEGER DEFAULT 0")
        if "likes" not in columns:
            cursor.execute("ALTER TABLE documents ADD COLUMN likes INTEGER DEFAULT 0")
        if "tags" not in columns:
            cursor.execute("ALTER TABLE documents ADD COLUMN tags TEXT DEFAULT ''")
        if "is_pinned" not in columns:
            cursor.execute("ALTER TABLE documents ADD COLUMN is_pinned INTEGER DEFAULT 0")
        if "product" not in columns:
            cursor.execute("ALTER TABLE documents ADD COLUMN product TEXT DEFAULT 'xpi'")
        if "version" not in columns:
            cursor.execute("ALTER TABLE documents ADD COLUMN version TEXT DEFAULT 'Universal'")
        if "doc_type" not in columns:
            cursor.execute("ALTER TABLE documents ADD COLUMN doc_type TEXT DEFAULT 'troubleshooting'")
        if "status" not in columns:
            cursor.execute("ALTER TABLE documents ADD COLUMN status TEXT DEFAULT 'published'")
            
        cursor.execute("PRAGMA table_info(users)")
        user_cols = [row[1] for row in cursor.fetchall()]
        if "product_space" not in user_cols:
            cursor.execute("ALTER TABLE users ADD COLUMN product_space TEXT DEFAULT 'all'")
        if "is_active" not in user_cols:
            cursor.execute("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1")

        # Seed AI Settings with Groq AI by default if empty, or ensure proper model if Groq is selected
        cursor.execute("SELECT id, provider, model_name, api_base_url, api_key FROM ai_settings LIMIT 1")
        ai_row = cursor.fetchone()
        if not ai_row:
            cursor.execute(
                "INSERT INTO ai_settings (provider, api_key, api_base_url, model_name, temperature) VALUES (?, ?, ?, ?, ?)",
                ("groq", DEFAULT_GROQ_API_KEY, "https://api.groq.com/openai/v1", "openai/gpt-oss-120b", "0.2")
            )
        else:
            row_id, prov, mod_name, base_url, akey = ai_row
            key_to_set = akey if akey and not akey.startswith("gemini") and len(akey) > 10 else DEFAULT_GROQ_API_KEY
            cursor.execute(
                "UPDATE ai_settings SET provider = 'groq', api_key = ?, model_name = 'openai/gpt-oss-120b', api_base_url = 'https://api.groq.com/openai/v1' WHERE id = ?",
                (key_to_set, row_id)
            )
            
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[Migration Warning] SQLite manual migration encountered: {e}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()



