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
├── frontend/                 # The application UI (served by FastAPI at /)
│   ├── index.html            # All screens and modals
│   ├── app.js                # Application logic
│   ├── styles.css            # Design tokens + light/dark themes
│   └── magic_logo.png        # Official Magic Software logo
├── uploads/                  # Product-Segregated File Storage
│   ├── cso/                  # Cloud Service Ops runbooks -> Cloud Native space
│   ├── xpa-windows/          # Magic xpa documents (any *xpa* folder maps to xpa)
│   ├── xpi-windows/          # Magic xpi documents (any *xpi* folder maps to xpi)
│   └── isolated-fix-xpa/     # Isolated fixes, split per product
├── 863301644/                # Seed Confluence Knowledge Base repository
├── requirements.txt          # Python Backend Dependencies
├── run.bat                   # 1-Click Launch Script
└── README.md                 # Project Documentation
```

> **Note on the UI.** The interface is plain HTML/CSS/JS in `frontend/`, served
> directly by FastAPI. There is no build step and no Node toolchain — do not add
> one that outputs into `frontend/`, as that folder *is* the running application.
> An earlier React prototype under `src/` was removed once it had fallen well
> behind the live UI; it remains in git history if ever needed.

---

## 🛠️ Quick Start

### 1. Prerequisites
- Python 3.9+ — or nothing at all: `run.bat` sets up a self-contained portable
  runtime automatically if no interpreter is found.

### 2. Launching the Application
Double-click `run.bat`, or run the server directly:

```bash
python -m uvicorn backend.main:app --reload --port 8000
```

The UI is served by the same process, so there is nothing else to start.

Open your browser at:
- **Knowledge Center**: `http://localhost:8000`
- **Backend API Docs**: `http://localhost:8000/docs`
- **Default Administrator**: `superadmin` / `admin@123`
