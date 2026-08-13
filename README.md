# Magic Software Enterprises (MSE) Knowledge Center

An enterprise-grade Knowledge Management and AI Search Portal designed for **Magic Software Enterprises Pvt Ltd (MSE)** products, including **Magic xpa**, **Magic xpi (iPaaS)**, and **Cloud Native & Modernization**.

---

## 🚀 Core Platform Features

1. **🏢 Corporate Brand Identity & Logo**
   - Official Magic Software logo with teardrop gradient, wordmark, and *"a Matrix company"* tagline.
   - Vector-crisp inline SVG scaling across all screen sizes.

2. **⚡ Multi-Product Space Architecture**
   - **🌐 All Products (Global Hub)**: Cross-product search and aggregate analytics.
   - **⚡ Magic xpa Space**: Dedicated to Magic xpa Application Studio, Web RIA, Mobile deployment, and Server configurations.
   - **🔗 Magic xpi Space**: Dedicated to Magic xpi Integration Platform, 50+ Connectors (SAP, Salesforce, Oracle, SugarCRM), Data Mapper, and GigaSpaces In-Memory Grid.
   - **☁️ Cloud Native Space**: Dedicated to Microservices, Docker/Kubernetes containerization, and modernization SOPs.

3. **🔍 Intelligent Omnibox Search & Telemetry**
   - Fast full-text typo-tolerant search with Levenshtein expansion and phrase boosting.
   - Dynamic query term highlighting.
   - **Documentation Gap Telemetry**: Automatic tracking of zero-result searches to identify missing KBs.

4. **🤖 Magic AI Copilot (ROVO-Style Assistant)**
   - Conversational RAG assistant trained on Magic documentation, error codes, connectors, and configuration flags.
   - Step-by-step technical guidance with verified source citation cards.

5. **✍️ Direct In-App KB Authoring & Notification Engine**
   - Rich WYSIWYG / Markdown authoring studio with code blocks, checklists, and callout boxes.
   - Instant sub-50ms indexing into `uploads/{product}/`.
   - Real-time in-app notification feed for support teams.

6. **🛡️ Enterprise Admin & Governance Control Suite**
   - **User Management**: Role-based access control (`Viewer`, `Editor`, `Admin`).
   - **Taxonomy Governance**: One-click product reassignment.
   - **Diagnostics & Re-indexing**: One-click repository sync with live audit logs.

---

## 📁 Architecture & Directory Layout

```
Knowledge-Center-MSE/
├── backend/                  # FastAPI Backend Services
│   ├── auth.py               # JWT Authentication & RBAC
│   ├── database.py           # SQLAlchemy DB Models (Products, Notifications, Analytics)
│   ├── indexer.py            # Multi-Format Parser & Product-Aware Auto-Indexer
│   └── main.py               # FastAPI App & Endpoints
├── src/                      # React 18 + Vite Frontend Source Code
│   ├── components/
│   │   ├── ProductTabs.jsx      # Product Navigation Switcher (xpa, xpi, Cloud Native)
│   │   ├── ProductHub.jsx       # Space Overview, Pinned SOPs & Trending Guides
│   │   ├── SearchPortal.jsx     # Omnibox Search with Product Scopes & Filters
│   │   ├── AICopilotModal.jsx   # ROVO-Style AI Knowledge Assistant
│   │   ├── KBAuthorModal.jsx    # In-App Article Authoring Studio
│   │   ├── NotificationFeed.jsx # Real-Time Notification Center
│   │   ├── UploadPortal.jsx     # Multi-File Drag-and-Drop Ingestion
│   │   └── AdminPanel.jsx       # User Management, Analytics & Diagnostics
│   ├── App.jsx               # Main React Application Container
│   ├── main.jsx              # Entry Point
│   └── index.css             # Glassmorphism Design System (MSE Cyan/Blue Palette)
├── uploads/                  # Product-Segregated File Storage
│   ├── xpa/                  # Magic xpa documents & attachments
│   ├── xpi/                  # Magic xpi documents & connector manuals
│   ├── cloud_native/         # Cloud Native articles & guides
│   └── general/              # General enterprise SOPs
├── 863301644/                # Seed Confluence Knowledge Base repository
├── package.json              # Frontend Node Dependencies
├── vite.config.js            # Vite Build & Proxy Configuration
├── requirements.txt          # Python Backend Dependencies
├── run.bat                   # 1-Click Launch Script
└── README.md                 # Project Documentation
```

---

## 🛠️ Quick Start

### 1. Prerequisites
- Python 3.9+
- Node.js 18+ & npm

### 2. Launching the Application
Simply double-click `run.bat` or run:

```bash
# Terminal 1 - Backend
python -m uvicorn backend.main:app --reload --port 8000

# Terminal 2 - Frontend
npm run dev:frontend
```

Open your browser at:
- **Frontend Portal**: `http://localhost:5173`
- **Backend API Docs**: `http://localhost:8000/docs`
- **Default Administrator**: `superadmin` / `admin@123`
