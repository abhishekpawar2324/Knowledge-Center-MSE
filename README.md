# Windows XPI Knowledge Base System

An AI-ready Knowledge Base Search & Management System designed for querying, indexing, and managing Windows XPI technical documentation, troubleshooting guides, and enterprise integration references.

---

## 🚀 Version Roadmap

| Version | Status | Focus / Major Features |
|---|---|---|
| **`v0.1.0-baseline`** | **Completed** | Initial Git Repository Setup, Baseline Codebase Commit & Branching Model |
| **`v0.2.0`** | Planned | Architecture Consolidation, React SPA & FastAPI Decoupling |
| **`v0.3.0`** | Planned | Advanced Search Engine, Indexer Performance & Interactive Document Viewer |
| **`v0.4.0`** | Planned | Admin Suite, Batch Upload Portal & Role-Based Access Control (RBAC) |
| **`v1.0.0`** | Planned | Production Release, UI/UX Glassmorphism Polish & Docker Containerization |

---

## 📁 Repository Structure

```
Windows XPI/
├── backend/                  # FastAPI Backend Services
│   ├── auth.py               # Authentication & Authorization
│   ├── database.py           # SQLite Database Operations
│   ├── indexer.py            # Document Parsing & Indexing Engine
│   └── main.py               # FastAPI App & Endpoints
├── src/                      # React Frontend Source Code
│   ├── components/           # Modern UI Components (SearchPortal, UploadPortal, AdminPanel)
│   ├── App.jsx               # Main React Application Container
│   ├── main.jsx              # React Entry Point
│   └── index.css             # Tailwind / Custom CSS Design Tokens
├── frontend/                 # Legacy Standalone Static UI Files
├── 863301644/                # Seed Knowledge Base HTML Articles
├── package.json              # Frontend Node Dependencies & Scripts
├── vite.config.js            # Vite Build Configuration
├── requirements.txt          # Python Dependencies
├── run.bat                   # Development Launcher Script
└── README.md                 # Project Documentation
```

---

## 🌿 Git Branching Strategy

- **`main`**: Production-ready releases (tagged as `vX.Y.Z`).
- **`develop`**: Main integration branch for active development.
- **`feature/*`**: Feature branches branched off `develop`.
- **`release/*`**: Release preparation branches.
- **`hotfix/*`**: Emergency patch branches off `main`.

---

## 🛠️ Quick Start

### 1. Prerequisites
- Python 3.9+
- Node.js 18+ & npm
- Git

### 2. Backend Setup
```bash
pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
```

### 3. Frontend Setup
```bash
npm install
npm run dev
```

Or run both using `run.bat`.
