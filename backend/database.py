import os
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Database path in workspace root
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "kb_system.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="Viewer") # Admin, Editor, Viewer

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    file_path = Column(String, unique=True, index=True, nullable=False)
    file_type = Column(String, nullable=False) # html, pdf, docx, txt, md
    content = Column(Text, nullable=False) # Clean raw text for searching
    author = Column(String, default="System")
    breadcrumbs = Column(String, default="") # JSON list or separated categories
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

def init_db():
    Base.metadata.create_all(bind=engine)
    # Manual schema migrations for existing SQLite databases
    import sqlite3
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
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


