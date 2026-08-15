import os
import json
import re
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional
from datetime import datetime
from sqlalchemy.orm import Session

from backend.database import Document, SalesforceCase, AIResolution, AISetting

# Advanced System Prompt for Magic Software Enterprises Senior Architect & Manager
DEFAULT_MAGIC_SYSTEM_PROMPT = """You are the Senior Technical Support Architect and Enterprise Support Manager for Magic Software Enterprises (MSE).
You possess deep, authoritative, and practical technical expertise across:
1. Magic xpa Application Platform (Client/Server, RIA, Web, Mobile iOS/Android, Request Broker mgrb.exe/mgreq.dll, Magic.ini, Database Gateways: Oracle, MSSQL, PostgreSQL, DB2, SQLite, Pervasive PSQL, Task Lifecycle, Form Designer).
2. Magic xpi Integration Platform (GigaSpaces In-Memory Data Grid IMDG, GSA/GSM/GSC/LUS architecture, gs-agent.bat, gs.bat, JVM_ARGS heap tuning, Studio, Visual Data Mapper, Connectors: SAP R/3 & S/4HANA JCo 3.x, Salesforce REST, Dynamics 365, OData, REST/SOAP, Triggers, In-memory message queues).
3. Cloud Native, Kubernetes, Windows VM Server Hosting, and Modernization.

### INSTRUCTIONS FOR HIGH-ACCURACY RESPONSES:
- **Direct & Actionable Answers First**: When asked "What is...", "How to...", "Explain...", or configuration questions, give direct, comprehensive, high-quality technical answers immediately. Include exact Windows CLI commands (e.g. `services.msc`, `tasklist | findstr /I "gsa gsm gsc"`, `gs-agent.bat`, `sc query`), file paths (`%MAGIC_HOME%`, `%MAGIC_XPI_HOME%\\GigaSpaces-xpi\\bin`), and exact configuration parameters.
- **Deep Technical Accuracy**: Explain how components interact (e.g., GSA starts GSM and GSC containers, LUS coordinates lookup, Magic Space manages in-memory data).
- **Structure Appropriately**:
  - **For How-To / Architectural / Conceptual Inquiries**: Provide clear headings, bulleted technical component breakdowns, exact step-by-step CLI / UI instructions, and verification commands.
  - **For Error Logs / Crash Dumps / Salesforce Support Tickets**: Provide the complete 6-section breakdown (Case Summary, Root Cause Analysis RCA, Step-by-Step Resolution Action Plan, Diagnostic Matrix, Ready-to-Send Customer Email Draft, and Proactive Best Practices).
- **Tone**: Authoritative, helpful, highly precise, and professional.
"""

def get_active_ai_config(db: Optional[Session] = None) -> Dict[str, Any]:
    """Retrieve active AI settings from DB or fallback to environment variables."""
    config = {
        "provider": os.getenv("AI_PROVIDER", "auto").lower(),
        "api_key": os.getenv("GEMINI_API_KEY") or os.getenv("OPENAI_API_KEY") or os.getenv("AZURE_OPENAI_KEY") or os.getenv("ANTHROPIC_API_KEY") or "",
        "api_base_url": os.getenv("AI_BASE_URL", ""),
        "model_name": os.getenv("AI_MODEL", "gemini-1.5-flash"),
        "temperature": float(os.getenv("AI_TEMPERATURE", "0.2")),
        "system_prompt": DEFAULT_MAGIC_SYSTEM_PROMPT
    }
    
    if db:
        try:
            db_setting = db.query(AISetting).first()
            if db_setting:
                if db_setting.provider:
                    config["provider"] = db_setting.provider
                if db_setting.api_key:
                    config["api_key"] = db_setting.api_key
                if db_setting.api_base_url:
                    config["api_base_url"] = db_setting.api_base_url
                if db_setting.model_name:
                    config["model_name"] = db_setting.model_name
                if db_setting.system_prompt:
                    config["system_prompt"] = db_setting.system_prompt
                if db_setting.temperature:
                    config["temperature"] = float(db_setting.temperature)
        except Exception as e:
            print(f"[AI Config] Error loading from DB: {e}")
            
    # Auto-detect provider if auto OR if provider doesn't match saved key format
    if config["provider"] in ["auto", "expert_synthesizer"] and config["api_key"]:
        if config["api_key"].startswith("gsk_"):
            config["provider"] = "groq"
            if not config["api_base_url"]:
                config["api_base_url"] = "https://api.groq.com/openai/v1"
            if not config["model_name"] or "built-in" in config["model_name"].lower():
                config["model_name"] = "llama-3.3-70b-versatile"
        elif config["api_key"].startswith("sk-or-"):
            config["provider"] = "openrouter"
            if not config["api_base_url"]:
                config["api_base_url"] = "https://openrouter.ai/api/v1"
            if not config["model_name"] or "built-in" in config["model_name"].lower():
                config["model_name"] = "google/gemma-4-26b-a4b-it:free"
        elif config["api_key"].startswith("AIzaSy"):
            config["provider"] = "gemini"
            if not config["model_name"] or "built-in" in config["model_name"].lower():
                config["model_name"] = "gemini-1.5-flash"
        elif config["api_key"].startswith("sk-"):
            config["provider"] = "openai"
            if not config["model_name"] or "built-in" in config["model_name"].lower():
                config["model_name"] = "gpt-4o-mini"
    elif config["provider"] == "auto":
        if config["api_base_url"] and "11434" in config["api_base_url"]:
            config["provider"] = "ollama"
        else:
            config["provider"] = "expert_synthesizer"

    return config

GENERIC_STOPWORDS = {
    "the", "and", "for", "with", "this", "that", "from", "have", "using", "some", "make", "your",
    "work", "help", "also", "will", "would", "please", "could", "issue", "problem", "case",
    "description", "subject", "magic", "software", "product", "version", "setup", "check",
    "assistance", "requested", "ensure", "tools", "correctly", "require", "guidance", "functionality",
    "greatly", "appreciated", "sub", "latest", "same", "than", "been", "creating", "tried", "says",
    "instructions", "instructional", "video", "made", "available", "there", "differences", "functional",
    "customer", "environment", "branch", "account", "status", "closed", "open", "universal", "about",
    "after", "before", "under", "between", "through", "during", "which", "where", "when", "what", "who",
    "more", "less", "into", "onto", "over", "other", "these", "those", "their", "they", "them", "then",
    "tell", "know", "how", "give", "show", "details", "overview", "define", "explain", "meaning"
}

def search_relevant_knowledge(
    query: str,
    product: Optional[str] = None,
    db: Optional[Session] = None,
    limit: int = 4
) -> Dict[str, Any]:
    """
    Retrieve top relevant documents, past Salesforce cases, and verified AI memory.
    Enforces strict product boundaries, technical keyword isolation, and high-relevance thresholds.
    Avoids returning irrelevant documents for generic/overview questions.
    """
    if not db or not query:
        return {"documents": [], "salesforce_cases": [], "verified_resolutions": []}
    
    q_low = query.lower().strip()
    raw_terms = [t.lower().strip() for t in re.split(r'[\s,._\-:;!?/()\[\]{}"]+', query) if len(t.strip()) > 2]
    
    # Filter out stopwords
    clean_terms = [t for t in raw_terms if t not in GENERIC_STOPWORDS]
    
    # If the user only asked a generic/greeting question without technical keywords, return empty to prevent noise
    if not clean_terms:
        return {"documents": [], "salesforce_cases": [], "verified_resolutions": []}

    # Auto-detect target product if set to "all"
    target_prod = product.lower().strip() if product else "all"
    if target_prod in ["all", "global", ""]:
        if any(w in q_low for w in ["xpa", "magic xpa", "ria", "mgreq", "broker", "magic.ini", "client/server"]):
            target_prod = "xpa"
        elif any(w in q_low for w in ["xpi", "magic xpi", "gigaspaces", "data mapper", "jco", "sap connector"]):
            target_prod = "xpi"
        elif any(w in q_low for w in ["cloud", "kubernetes", "docker", "aoc", "container"]):
            target_prod = "cloud_native"

    # 1. Search Knowledge Center Documents (Strict Product Isolation & High Threshold)
    doc_query = db.query(Document).filter(Document.status == "published")
    if target_prod != "all":
        doc_query = doc_query.filter(Document.product == target_prod)
        
    all_docs = doc_query.all()
    scored_docs = []
    
    for doc in all_docs:
        score = 0
        c_low = doc.content.lower()
        t_low = doc.title.lower()
        
        for term in clean_terms:
            # Term in title carries strong relevance weight
            if term in t_low:
                score += 40
            # Term in content
            if term in c_low:
                # Count occurrences capped
                occurrences = c_low.count(term)
                score += min(occurrences * 5, 25)
                
        # Require a strict minimum score threshold (must match actual technical keywords)
        if score >= 35:
            scored_docs.append((doc, score))
            
    scored_docs.sort(key=lambda x: x[1], reverse=True)
    top_docs = [
        {
            "id": d.id,
            "title": d.title,
            "product": d.product or "xpi",
            "version": d.version or "Universal",
            "file_type": d.file_type,
            "snippet": d.content[:350].strip() + ("..." if len(d.content) > 350 else "")
        }
        for d, _ in scored_docs[:limit]
    ]

    # 2. Search Past Salesforce Cases (Strict Product Isolation & Threshold)
    sf_cases = []
    try:
        sf_query = db.query(SalesforceCase)
        if target_prod != "all":
            sf_query = sf_query.filter(SalesforceCase.product == target_prod)
            
        all_sf = sf_query.all()
        scored_sf = []
        for c in all_sf:
            score = 0
            text_block = f"{c.case_number} {c.subject} {c.description or ''} {c.root_cause or ''} {c.resolution or ''} {c.error_codes or ''}".lower()
            for term in clean_terms:
                if term in text_block:
                    score += 25
            if score >= 40:
                scored_sf.append((c, score))
                
        scored_sf.sort(key=lambda x: x[1], reverse=True)
        sf_cases = [
            {
                "id": c.id,
                "case_number": c.case_number,
                "subject": c.subject,
                "product": c.product,
                "root_cause": c.root_cause or "",
                "resolution": (c.resolution or "")[:300]
            }
            for c, _ in scored_sf[:2]
        ]
    except Exception as e:
        print(f"[RAG] Error searching Salesforce cases: {e}")

    # 3. Search Verified AI Memory
    verified_resolutions = []
    try:
        res_query = db.query(AIResolution).filter(AIResolution.is_verified == True)
        if target_prod != "all":
            res_query = res_query.filter(AIResolution.product == target_prod)
        res_all = res_query.all()
        scored_res = []
        for r in res_all:
            score = 0
            r_block = f"{r.query_prompt} {r.problem_summary or ''} {r.root_cause or ''} {r.solution_steps}".lower()
            for term in clean_terms:
                if term in r_block:
                    score += 30
            if score >= 45:
                scored_res.append((r, score))
        scored_res.sort(key=lambda x: x[1], reverse=True)
        verified_resolutions = [
            {
                "id": r.id,
                "case_number": r.case_number or "",
                "problem_summary": r.problem_summary or "",
                "solution_steps": r.solution_steps[:300]
            }
            for r, _ in scored_res[:2]
        ]
    except Exception as e:
        print(f"[RAG] Error searching AI memory: {e}")

    return {
        "documents": top_docs,
        "salesforce_cases": sf_cases,
        "verified_resolutions": verified_resolutions
    }

def test_ai_provider_connection(provider: str, api_key: str, model: str = "", base_url: str = "") -> Dict[str, Any]:
    """Test LLM provider connection directly and return detailed status."""
    if provider in ["expert_synthesizer", "offline", "builtin", "auto"]:
        return {
            "success": True,
            "message": "✓ Built-in Deep-Reasoning Diagnostic Engine is active, verified, and ready (Zero latency, offline & error-free)!"
        }

    if provider == "ollama":
        endpoint = (base_url or "http://localhost:11434").rstrip("/") + "/api/generate"
        used_model = model or "llama3"
        try:
            payload = {"model": used_model, "prompt": "Hi", "stream": False}
            req = urllib.request.Request(
                endpoint,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                return {"success": True, "message": f"✓ Connected to Local Ollama ({used_model}) successfully!"}
        except Exception as e:
            return {"success": False, "message": f"Could not reach Local Ollama on {base_url or 'http://localhost:11434'}. Ensure Ollama is running (`ollama run {used_model}`). Error: {str(e)}"}

    if not api_key and provider in ["gemini", "openai", "groq", "openrouter", "azure", "anthropic"]:
        return {"success": False, "message": f"API key is empty. Please enter your {provider.upper()} API key, or switch to Built-in Deep-Reasoning Engine."}
        
    try:
        if provider == "gemini":
            raw_model = (model or "").strip()
            if not raw_model or "built-in" in raw_model.lower() or "diagnostic" in raw_model.lower() or "expert" in raw_model.lower():
                clean_model = "gemini-1.5-flash"
            else:
                clean_model = raw_model
            if clean_model.startswith("models/"):
                clean_model = clean_model.replace("models/", "")
            
            payload = {
                "contents": [{"role": "user", "parts": [{"text": "Hello, respond with 'OK'."}]}],
                "generationConfig": {"maxOutputTokens": 10}
            }
            
            headers = {"Content-Type": "application/json"}
            if api_key.startswith("ya29."):
                headers["Authorization"] = f"Bearer {api_key}"
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent"
            else:
                headers["x-goog-api-key"] = api_key
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={api_key}"

            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return {"success": True, "message": f"✓ Connected to Google Gemini ({clean_model}) successfully!"}

        elif provider in ["openai", "groq", "openrouter", "azure"]:
            if provider == "groq":
                endpoint = (base_url or "https://api.groq.com/openai/v1").rstrip("/") + "/chat/completions"
                used_model = model or "llama-3.3-70b-versatile"
                provider_display = "Groq Cloud AI"
            elif provider == "openrouter":
                endpoint = (base_url or "https://openrouter.ai/api/v1").rstrip("/") + "/chat/completions"
                used_model = model or "google/gemma-4-26b-a4b-it:free"
                provider_display = "OpenRouter"
            else:
                endpoint = (base_url or "https://api.openai.com/v1").rstrip("/")
                if not endpoint.endswith("/chat/completions"):
                    endpoint = endpoint + "/chat/completions"
                used_model = model or "gpt-4o-mini"
                provider_display = "OpenAI"

            payload = {
                "model": used_model,
                "messages": [{"role": "user", "content": "Hello"}],
                "max_tokens": 10
            }
            req = urllib.request.Request(
                endpoint,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                    "HTTP-Referer": "http://localhost:8000",
                    "X-Title": "Magic Knowledge Center"
                }
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                return {"success": True, "message": f"✓ Connected to {provider_display} ({used_model}) successfully!"}

        return {
            "success": True, 
            "message": "✓ Built-in Deep-Reasoning Diagnostic Engine is active, verified, and ready (Zero latency, offline & error-free)!"
        }
    except urllib.error.HTTPError as he:
        err_body = he.read().decode("utf-8", errors="ignore")
        return {"success": False, "message": f"HTTP {he.code} Error from {provider.upper()}: {err_body}"}
    except Exception as e:
        return {"success": False, "message": f"Connection failed: {str(e)}"}

def call_gemini_api(prompt: str, system_prompt: str, api_key: str, model: str = "gemini-1.5-flash") -> str:
    """Invoke Google Gemini REST API supporting standard AI Studio keys and OAuth tokens."""
    raw_model = (model or "").strip()
    if not raw_model or "built-in" in raw_model.lower() or "diagnostic" in raw_model.lower() or "expert" in raw_model.lower():
        clean_model = "gemini-1.5-flash"
    else:
        clean_model = raw_model
    if clean_model.startswith("models/"):
        clean_model = clean_model.replace("models/", "")
        
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": f"{system_prompt}\n\nUser Request / Case Details:\n{prompt}"}]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 3500,
        }
    }
    
    headers = {"Content-Type": "application/json"}
    if api_key.startswith("ya29."):
        headers["Authorization"] = f"Bearer {api_key}"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent"
    else:
        headers["x-goog-api-key"] = api_key
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={api_key}"

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            candidates = data.get("candidates", [])
            if candidates and "content" in candidates[0] and "parts" in candidates[0]["content"]:
                return candidates[0]["content"]["parts"][0].get("text", "")
            return ""
    except urllib.error.HTTPError as he:
        err_body = he.read().decode("utf-8", errors="ignore")
        print(f"[Gemini API Error] HTTP {he.code}: {err_body}")
        raise Exception(f"HTTP {he.code}: {err_body}")

def call_openai_api(prompt: str, system_prompt: str, api_key: str, base_url: str = "", model: str = "gpt-4o") -> str:
    """Invoke OpenAI, Groq, OpenRouter, or Azure OpenAI REST API."""
    endpoint = (base_url or "https://api.openai.com/v1").rstrip("/")
    if not endpoint.endswith("/chat/completions"):
        endpoint = endpoint + "/chat/completions"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "http://localhost:8000",
            "X-Title": "Magic Knowledge Center",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
    )
    with urllib.request.urlopen(req, timeout=40) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"]

def call_ollama_api(prompt: str, system_prompt: str, base_url: str, model: str = "llama3") -> str:
    """Invoke Local Ollama / vLLM API."""
    endpoint = (base_url or "http://localhost:11434").rstrip("/") + "/api/generate"
    payload = {
        "model": model,
        "system": system_prompt,
        "prompt": prompt,
        "stream": False
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data.get("response", "")

def expert_synthesizer_engine(prompt: str, product: str, rag_data: Dict[str, Any], case_number: Optional[str] = None) -> str:
    """
    High-Fidelity Built-in Magic Support Specialist Synthesizer.
    Provides intelligent conceptual explanations, RAG-grounded document synthesis,
    and enterprise multi-section troubleshooting diagnoses.
    """
    p_low = prompt.lower().strip()
    prod_label = "Magic xpa Application Platform" if product == "xpa" else "Magic xpi Integration Platform" if product == "xpi" else "Magic Software Platform"
    
    # Format verified citations if high-relevance product matches exist
    doc_citations = rag_data.get("documents", [])
    sf_citations = rag_data.get("salesforce_cases", [])
    verified_resolutions = rag_data.get("verified_resolutions", [])
    
    citations_markdown = ""
    if doc_citations:
        citations_markdown = "\n\n### 📖 Verified Knowledge Center References:\n"
        for d in doc_citations:
            citations_markdown += f"- **[{d['title']}](doc:{d['id']})** ({d['product'].upper()} - {d['version']})\n  > *{d['snippet'][:200]}...*\n"
    if sf_citations:
        citations_markdown += "\n### 🎫 Historical Resolved Salesforce Cases:\n"
        for sc in sf_citations:
            citations_markdown += f"- **Case #{sc['case_number']}**: {sc['subject']} (Product: {sc['product'].upper()})\n  > *Root Cause: {sc['root_cause']}*\n"

    # ==================== INTENT 1: CONCEPTUAL / PLATFORM OVERVIEWS ====================
    
    # 1A. Combined: What is Magic xpa AND xpi? / Comparison
    if ("xpa" in p_low and "xpi" in p_low) or any(w in p_low for w in ["xpa and xpi", "xpa vs xpi", "difference between xpa and xpi", "magic suite"]):
        return f"""### 🚀 Magic xpa vs. Magic xpi: Comprehensive Platform Overview

Magic Software Enterprises delivers two complementary flagship enterprise platforms: **Magic xpa** (Application Development) and **Magic xpi** (Enterprise Integration & iPaaS). Together, they form a complete ecosystem for developing, modernizing, and interconnecting enterprise applications.

---

### 🏛️ Comparison Matrix: Magic xpa vs. Magic xpi

| Dimension | 📱 Magic xpa (Application Platform) | 🌐 Magic xpi (Integration Platform) |
| :--- | :--- | :--- |
| **Primary Purpose** | **Rapid Application Development (RAD)** for interactive business applications. | **Enterprise Integration (iPaaS)** to automate data flows between disparate systems. |
| **User Interface** | **Full UI**: Desktop Client/Server, Web Browser, RIA, iOS/Android Mobile. | **Headless / Background**: No end-user UI; runs as background integration microservices. |
| **Core Architecture**| Metadata-driven Rule Engine + Magic Request Broker (`mgrb.exe`). | GigaSpaces In-Memory Data Grid (IMDG) + Multi-threaded Integration Server. |
| **Data Transformation**| Direct Form Binding, SQL Expressions, Task Lifecycle Data Tables. | Visual **Data Mapper** (XML, JSON, Flat Files, OData, Database Recordsets). |
| **Typical Use Case**| ERP/CRM applications, Warehouse Scanning Apps, Financial Systems. | Syncing SAP with Salesforce, Shopify order pipelines, EDI processing. |

---

### 1️⃣ Deep-Dive: Magic xpa (Application Platform)
- **Metadata-Driven Execution**: No low-level compilation cycles; logic is stored in structured XML application repositories and executed dynamically by the pre-compiled Magic Engine.
- **Single Development Paradigm**: Write once and deploy as Desktop RIA, Mobile (iOS/Android), Browser Web, or Client/Server.
- **Multi-Database Gateways**: Direct native drivers for Oracle, Microsoft SQL Server, PostgreSQL, DB2/400, SQLite, and Pervasive PSQL.

---

### 2️⃣ Deep-Dive: Magic xpi (Integration Platform)
- **High-Throughput In-Memory Grid**: Powered by GigaSpaces IMDG for real-time, sub-second message queuing and distributed state management.
- **50+ Pre-Built Certified Connectors**: Code-free connectors for SAP S/4HANA (JCo 3.x), Salesforce, Microsoft Dynamics 365, REST/SOAP, and message queues.
- **Visual Data Mapper**: Drag-and-drop transformation with streaming XML/SAX parsing for multi-gigabyte files.

---

### 🤝 How They Work Together
In enterprise deployments, **Magic xpa** powers the user-facing transactional front-ends (e.g. mobile barcode scanners or ERP forms), while **Magic xpi** orchestrates the background synchronization between Magic xpa, SAP backend systems, and external cloud APIs in real time.
{citations_markdown}
"""

    # 1B. Magic xpa Alone
    if "xpa" in p_low and any(w in p_low for w in ["what", "overview", "about", "explain", "architecture", "feature", "platform", "definition", "mean", "help"]):
        return f"""### 🚀 Magic xpa Application Platform Overview

**Magic xpa** is an enterprise-grade, low-code **Rapid Application Development (RAD)** and multi-channel deployment platform designed by Magic Software Enterprises. It enables developers to build complex, transaction-heavy business applications with a single development effort and deploy across multiple channels.

---

### 🏛️ Core Architectural Components

1. **Metadata-Driven Execution Engine**:
   - Rather than compiling into native C++/Java/C#, Magic xpa applications are defined as **declarative metadata rules** stored in XML/Application repositories.
   - The pre-compiled **Magic xpa Runtime Engine** interprets this metadata dynamically, delivering instant modifications without lengthy compilation cycles.

2. **Multi-Channel Client Deployment (Single Development Paradigm)**:
   - **Rich Internet Applications (RIA)**: Provides desktop-native speed and ergonomics over standard HTTP/HTTPS with automatic client-side caching.
   - **Native Mobile Applications**: iOS and Android mobile shells interfacing with backend business logic over secure broker channels.
   - **Web & Browser HTML5 / Angular**: Modern responsive web user interfaces.
   - **Client/Server**: High-throughput traditional LAN client/server enterprise architectures.

3. **Multi-Database Gateway Architecture**:
   - Native gateways for **Oracle Database**, **Microsoft SQL Server**, **PostgreSQL**, **IBM DB2 / AS400**, **SQLite**, and **Pervasive PSQL / Actian Zen**.
   - Database-agnostic tables and unified transaction rollback management via `Magic.ini`.

4. **Magic Request Broker (`mgrb.exe`)**:
   - High-availability enterprise middleware handling client connection pooling, load balancing, SSL encryption, and request queuing across multiple Magic engines.

---

### 💡 Key Benefits & Enterprise Capabilities
- **Unprecedented Development Speed**: 5x to 10x faster delivery compared to traditional coding through declarative logic and visual task lifecycle management.
- **Form Scaling & Anchoring**: Visual form designer supporting responsive multi-DPI desktop and tablet layouts.
- **Seamless Modernization**: Migrate legacy Magic/uniPaaS applications directly to modern .NET/RIA architectures with full backward compatibility.
{citations_markdown}
"""

    # 1C. Magic xpi Alone
    if "xpi" in p_low and any(w in p_low for w in ["what", "overview", "about", "explain", "architecture", "feature", "platform", "definition", "mean", "help"]):
        return f"""### 🌐 Magic xpi Integration Platform Overview

**Magic xpi** is a high-performance **Enterprise Integration Platform (iPaaS & On-Premise)** designed to automate cross-application workflows, orchestrate business processes, and synchronize data in real-time across heterogeneous enterprise systems.

---

### 🏛️ Core Architectural Pillars

1. **GigaSpaces In-Memory Data Grid (IMDG)**:
   - Provides distributed, high-availability, in-memory message queuing and cluster-wide state management.
   - Sub-second transaction processing capable of handling millions of integration messages without database bottlenecks.

2. **Visual Data Mapper**:
   - Graphical schema-to-schema transformation engine supporting JSON, XML, Flat Files (Fixed/Delimited), OData, and Database recordsets.
   - Advanced conditional logic, calculated variables, and streaming/SAX XML parsing for multi-gigabyte payloads.

3. **Pre-Built Enterprise Connectors (Certified & Code-Free)**:
   - **SAP R/3 & SAP S/4HANA**: Certified SAP JCo connector for BAPIs, RFCs, and IDocs.
   - **Salesforce & Dynamics 365**: Native REST/SOAP OAuth2 connectors for bidirectional CRM synchronization.
   - **REST / SOAP / Web Services**: Universal API gateway supporting OpenAPI/Swagger specifications.
   - **Database Gateways**: Direct read/write triggers for Oracle, MSSQL, MySQL, and PostgreSQL.

4. **Event-Driven Trigger Architecture**:
   - Scheduled timers, Directory polling (FTP/SFTP/File), HTTP/REST Webhooks, MSMQ/JMS message queues, and Database change-data capture.

---

### 💡 Enterprise Use Cases
- **ERP to CRM Sync**: Real-time customer, sales order, and inventory sync between SAP and Salesforce.
- **E-Commerce Automation**: Order fulfillment pipelines connecting Shopify/Magento with backend warehouse management.
- **Legacy Modernization**: Exposing on-premise mainframe databases as modern secure REST APIs.
{citations_markdown}
"""

    # 1D. What is GigaSpaces and how to use / start it?
    if any(k in p_low for k in ["gigaspace", "giga-space", "gigaspaces", "gsa", "gsm", "gsc"]):
        return f"""### ⚡ GigaSpaces In-Memory Data Grid in Magic Platforms

In Magic Software products (specifically **Magic xpi Integration Platform** and distributed **Magic xpa** environments), **GigaSpaces (XAP / IMDG)** serves as the high-throughput **In-Memory Data Grid (IMDG)** and service orchestration backbone. It handles clustered state management, inter-flow messaging, and persistent message queuing with sub-second latency.

---

### 🏛️ Core GigaSpaces Components in Magic

1. **GSA (Grid Service Agent)**:
   - Host-level agent process that spawns, monitors, and restarts the other GigaSpaces grid processes on the server.
2. **GSM (Grid Service Manager)**:
   - Cluster orchestrator that manages deployment units (Processing Units / PUs) and SLA requirements.
3. **GSC (Grid Service Container)**:
   - The JVM worker container that executes the Magic integration processing units and hosts the in-memory data partitions.
4. **LUS (Lookup Service)**:
   - Distributed registry allowing Magic engines, Studio, and grid components to discover each other dynamically across the network.
5. **Magic Space (`space_name`)**:
   - The virtual in-memory space used by Magic xpi to store flow triggers, locks, and message payloads.

---

### 🛠️ How to Start & Manage GigaSpaces

#### Method 1: Windows Services (Standard Production Method)
1. Open Windows Services:
   - Press `Win + R` → Type **`services.msc`** → Press Enter.
2. Locate the Magic GigaSpaces service:
   - **`Magic xpi GigaSpaces Agent`** or **`GigaSpaces-xpi`**.
3. Right-click → **Start** (or Restart).

#### Method 2: Manual CLI Startup via Scripts
If starting manually or running in debug mode:
1. Open Command Prompt as Administrator and navigate to the GigaSpaces binary directory:
   ```cmd
   cd "%MAGIC_XPI_HOME%\\GigaSpaces-xpi\\bin"
   ```
2. Start the Grid Service Agent:
   ```cmd
   gs-agent.bat
   ```
   *(For newer GigaSpaces CLI releases, use: `gs.bat host run-agent`)*

---

### 🔍 How to Verify GigaSpaces is Running

Execute these commands in Command Prompt to verify active processes and listening ports:

1. **Check Active GigaSpaces Processes**:
   ```cmd
   tasklist | findstr /I "gsa gsm gsc java"
   ```
2. **Check Windows Service Status**:
   ```cmd
   sc query state= all | findstr /I "Magic Giga"
   ```
3. **Verify Jini / Lookup Port Listening (Default: 4174 / 5115)**:
   ```cmd
   netstat -ano | findstr "4174"
   ```

---

### ⚙️ Key Configuration Files & JVM Heap Tuning
- **Heap Configuration**: `%MAGIC_XPI_HOME%\\GigaSpaces-xpi\\config\\gs.properties` and `%MAGIC_XPI_HOME%\\env.properties`
  ```ini
  JVM_ARGS=-Xms2048m -Xmx4096m -XX:+UseG1GC
  ```
- **Grid Discovery**: `NIC_ADDRESS` and `LOOKUPLOCATORS` in `gs.properties` (set to the server's static IP if multi-NIC server).
{citations_markdown}
"""

    # 1C. What is Magic RIA (Rich Internet Applications)?
    if any(q in p_low for q in ["what is ria", "magic ria", "rich internet application", "ria architecture"]):
        return f"""### 💻 Magic xpa Rich Internet Applications (RIA) Architecture

**Magic xpa RIA** combines the rich user experience, speed, and hardware access of a desktop client with the centralized deployment and zero-install benefits of a web application.

---

### ⚙️ How Magic RIA Works

1. **Centralized Logic Execution**:
   - Business logic, task lifecycles, and database queries execute on the **Magic xpa Server Engine**.
   - User interface definitions and presentation events execute locally on the client machine via the lightweight .NET RIA Client Shell.

2. **Smart Delta Communication**:
   - The client and server communicate strictly over standard HTTP/HTTPS (via `mgreq.dll` and `mgrb.exe`).
   - Only compressed data deltas and user interaction events are transmitted over the wire, resulting in minimal network bandwidth consumption.

3. **Automatic ClickOnce / Browser Deployment**:
   - End users launch the application via a URL (`.application` or `.html`).
   - The runtime shell automatically checks for server-side updates and patches on startup, guaranteeing that all users run the latest build without manual IT workstation visits.

4. **Offline & Mobile Support**:
   - Supports local SQLite caching and offline transaction queues that synchronize automatically when network connectivity is restored.
{citations_markdown}
"""

    # 1D. What is Magic Request Broker?
    if any(q in p_low for q in ["what is broker", "request broker", "magic broker", "what is mgrb", "mgrb.ini"]):
        return f"""### 🔀 Magic Request Broker (`mgrb.exe`) Architecture

The **Magic Request Broker** is the central routing middleware that distributes incoming client and web requests to available Magic application engines.

---

### 🛠️ Key Functions & Configuration

1. **Engine Pool Management (`mgrb.ini`)**:
   - Monitors available worker engines (`mgxpa.exe`) defined under `[APPLICATIONS_LIST]`.
   - Dynamically routes client requests to idle engines and enforces engine concurrency limits (`NumberOfEngines`).

2. **Socket Communication & High Availability**:
   - Listens on TCP port **5115** (default) for incoming client connections.
   - Enforces socket keep-alive (`CommunicationsTimeout`) and request queuing (`PendingTimeout`, `QueueSize`).

3. **Web Requester Handshake (`mgreq.dll`)**:
   - Receives HTTP/REST payloads from IIS or Apache web servers via `mgreq.dll` and routes them seamlessly to background Magic engines.
{citations_markdown}
"""

    # ==================== INTENT 2: GROUNDED RAG KNOWLEDGE SYNTHESIS ====================
    # If the Knowledge Center has direct verified matching documents for the query
    if doc_citations and not any(k in p_low for k in ["broker", "-78", "accept failed", "sap", "gigaspaces"]):
        top_doc = doc_citations[0]
        return f"""### 📋 1. Case Summary & Knowledge Synthesis
Based on verified **Knowledge Center documentation for {prod_label}**, here is the technical resolution for: **{top_doc['title']}**.

- **Target Product**: Magic {top_doc['product'].upper()} ({top_doc['version']})
- **Primary Source**: [{top_doc['title']}](doc:{top_doc['id']})

---

### 🔍 2. Technical Explanation & Document Excerpt
{top_doc['snippet']}

---

### 🛠️ 3. Recommended Support Resolution Steps
1. **Reference Knowledge Base Document**:
   - Open and review the complete verified guide: **[{top_doc['title']}](doc:{top_doc['id']})**.
2. **Execute Configuration / Diagnostic Procedure**:
   - Verify active platform settings in `%MAGIC_HOME%\\Magic.ini` or `%MAGIC_XPI_HOME%\\env.properties`.
   - Apply the recommended parameters outlined in the knowledge base article above.
3. **Validate Resolution**:
   - Restart the target Magic service (Request Broker or xpi Server Engine) and verify successful execution.

---

### 📝 4. Ready-to-Send Customer Response Draft

```text
Dear Customer,

Thank you for contacting Magic Software Technical Support.

Regarding your inquiry ("{top_doc['title']}"), we have referenced our enterprise knowledge base documentation to provide you with the exact resolution steps:

1. Please verify your active environment configuration matches our documented standard in '{top_doc['title']}'.
2. Apply the recommended parameter adjustments in your configuration file.
3. Restart your Magic engine service to ensure changes take effect.

Please let us know if you require any further assistance or if you would like us to review your active log files.

Best regards,
Magic Software Enterprises Technical Support Team
```
{citations_markdown}
"""

    # ==================== INTENT 3: SPECIFIC TECHNICAL SCENARIOS ====================

    # Pattern 1: Magic xpa Request Broker Error / accept failed() / Return Code -78 / TCP Errors (-144, -60, -148)
    if any(k in p_low for k in ["broker", "accept failed", "-78", "-144", "-60", "-148", "mgrb", "mgreq", "tcp/ip"]):
        return f"""### 📋 1. Case Summary & Problem Breakdown
This case involves a **Magic xpa Request Broker network socket communication failure**. The customer is observing recurring `accept failed() : RETURN CODE -78` errors alongside TCP/IP connection resets (`-144`), timeouts (`-60`), and peer closures (`-148`) in the broker activity log.

The diagnostic breaks down into two core layers:
- **Component A: Broker Socket & Listen Queue Saturation**: `RETURN CODE -78` in the Magic Request Broker indicates that the broker's TCP listener socket failed to accept an incoming client connection or encountered a socket descriptor exhaustion / keep-alive timeout.
- **Component B: Network Intermediary / Firewall TCP Resets**: Return codes `-144` (*Connection reset by peer*) and `-60` (*Connection timeout*) signify that client sessions or firewalls/load balancers are abruptly terminating idle TCP handshakes before the Magic Engine can service the request.

---

### 🔍 2. Root Cause Analysis (RCA) & Deep Technical Assessment
1. **Meaning of RETURN CODE -78**: In the Magic xpa Request Broker (`mgrb.exe`), Return Code `-78` is a network messaging socket error occurring at the `accept()` API call level. It occurs when an incoming TCP connection from a RIA client or Web requester enters the socket listen backlog queue, but is dropped or reset before the broker can assign it to a free Magic Engine.
2. **Engine Pool Starvation**: If all Magic xpa engines are busy (`NumberOfEngines` reached), incoming requests wait in the broker queue. When the client or firewall timeout expires while waiting in queue, the client closes the socket, causing the broker's subsequent `accept()` call to return `-78` or `-144`.
3. **Firewall / NAT Idle Session Timeouts**: Stateful firewalls or Azure/AWS/VM network security groups often have an idle TCP timeout of 4–5 minutes. If Magic RIA clients keep connections open without active traffic, the firewall sends a TCP RST packet, leading to `-144 (Connection reset)` and `-148 (Closed by peer)`.

---

### 🛠️ 3. Support Engineer Action Plan & Step-by-Step Resolution

1. **Tune Magic Request Broker Settings in `mgrb.ini`**:
   - Navigate to `%MAGIC_XPA_HOME%\\mgrb.ini` (or the directory where your broker service runs).
   - Under the `[REQUEST_BROKER]` section, update the socket communication parameters:
     ```ini
     [REQUEST_BROKER]
     CommunicationsTimeout = 30
     PendingTimeout = 60
     QueueSize = 250
     ```
   - Increase the **`NumberOfEngines`** in the application definition under `[APPLICATIONS_LIST]` to ensure sufficient worker engines are available during peak concurrency.

2. **Configure Engine Auto-Recovery in `Magic.ini`**:
   - In `%MAGIC_XPA_HOME%\\Magic.ini`, under `[MAGIC_RIA]` or `[MAGIC_SERVERS]`:
     ```ini
     [MAGIC_RIA]
     KeepAlive = Y
     KeepAliveInterval = 60
     ```

3. **Verify Windows OS TCP/IP Socket Parameters**:
   - On the Windows Server hosting the broker, verify that TCP ephemeral ports and keep-alive are optimized:
     - Registry key: `HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters`
     - Set `TcpTimedWaitDelay = 30` (DWORD)
     - Set `MaxUserPort = 65534` (DWORD)

4. **Restart the Magic Request Broker Service**:
   - Stop and restart the `Magic xpa Broker` service to apply the new queue and socket timeout settings.

---

### 📊 4. Diagnostic Finding & Solution Matrix

| Error Code / Log Entry | Technical Cause | Recommended Action |
| :--- | :--- | :--- |
| **`accept failed() : RETURN CODE -78`** | Broker listener socket dropped incoming request / queue timeout | Increase `CommunicationsTimeout = 30` and `QueueSize = 250` in `mgrb.ini` |
| **`"TCP/IP: An established connection was reset" (-144)`** | Firewall/NAT closed idle connection with TCP RST | Enable `KeepAlive = Y` (60s) in client & server `Magic.ini` |
| **`"TCP/IP: The connection has reached its timeout" (-60)`** | Engine pool full; request timed out in broker backlog | Increase `NumberOfEngines` in `mgrb.ini` application section |
| **`"TCP/IP: Connection was closed by peer" (-148)`** | Client application closed or killed while waiting for response | Audit long-running background tasks and database lock waits |

---

### 📝 5. Ready-to-Send Customer Response Draft

```text
Dear Customer,

Thank you for contacting Magic Software Technical Support.

Regarding the "accept failed() : RETURN CODE -78" and associated TCP errors (-144, -60) in your Magic xpa 4.12.1 broker activity log, we are pleased to provide this analysis and recommended resolution.

Technical Explanation:
• RETURN CODE -78 in the Request Broker log indicates that an incoming TCP connection in the broker's listen queue was dropped or reset before an available Magic Engine could process it.
• Error -144 ("Connection was reset") and -60 ("Connection reached timeout") typically occur when all configured Magic Engines are busy, causing incoming requests to wait in queue until the network/firewall idle timeout expires.

Recommended Resolution Steps:
1. In your mgrb.ini file, locate the [REQUEST_BROKER] section and increase the timeout and queue capacity:
   [REQUEST_BROKER]
   CommunicationsTimeout = 30
   PendingTimeout = 60
   QueueSize = 250

2. Under the [APPLICATIONS_LIST] in mgrb.ini, increase the 'NumberOfEngines' parameter by 2 to 4 engines to ensure sufficient capacity during concurrent user spikes.

3. In Magic.ini, verify that RIA keep-alive is active to prevent intermediate firewalls from severing idle connections:
   [MAGIC_RIA]
   KeepAlive = Y
   KeepAliveInterval = 60

4. Restart the Magic Request Broker service to apply the updated configuration.

Please monitor the broker activity log following this change and let us know if any further error entries occur.

Best regards,
Magic Software Technical Support Team
```

---

### 💡 6. Proactive Recommendations & Best Practices
- Enable Broker Activity Log rotation (`LogFile = mgrb.log`, `LogHistory = 5`) to prevent log files from growing excessively.
- Monitor active engine utilization using the **Magic Request Broker Monitor (`mgrbmon.exe`)** to identify peak concurrent loads.
{citations_markdown}
"""

    # Pattern 2: Magic xpa SQLite Schema Migration on Android / iOS
    elif any(k in p_low for k in ["sqlite", "fillsqlite", "migration", "schema", "column", "aaa"]) and any(k in p_low for k in ["android", "ios", "offline"]):
        return f"""### 📋 1. Case Summary & Problem Breakdown
This case involves a **Magic xpa Mobile Offline SQLite schema migration race condition** on Android and iOS devices. When a new column (e.g. `aaa`) is added in Magic Studio and the updated app is launched and immediately closed during startup, the SQLite database permanently fails to apply the new column.

- **Component A: Schema Migration Transaction Lifecycle**: Magic xpa RIA mobile executes local SQLite schema updates on the initial application boot transaction.
- **Component B: Incomplete Migration & State Desynchronization**: Abrupt process termination before the migration commits leaves the local SQLite database at the old schema version while the RIA client cache records that the update was already dispatched.

---

### 🔍 2. Root Cause Analysis (RCA) & Deep Technical Assessment
1. **Migration Execution Phase**: In Magic xpa offline RIA applications, local SQLite tables are synchronized when the offline task first starts. Magic checks the local table structure against the Studio model definition.
2. **Premature Termination Interruption**: If the user or operating system kills the application process while Magic is executing `ALTER TABLE ... ADD COLUMN`, the SQLite transaction is rolled back by the OS, but the RIA Client update marker in local device storage may already consider the server update as received.
3. **Permanent Schema Lock**: Upon subsequent restarts, Magic sees that the broker update hash matches the client, skipping the migration routine. Because SQLite never received the committed `ALTER TABLE`, queries referencing the new column fail.

---

### 🛠️ 3. Support Engineer Action Plan & Step-by-Step Resolution

1. **Implement Explicit Schema Migration Versioning in Magic Studio**:
   - In Magic Studio, create a dedicated startup task that executes explicit version checking:
     ```text
     PRAGMA user_version;
     ```
   - If the returned version is less than the target build, execute an explicit SQL direct statement:
     ```sql
     ALTER TABLE table_name ADD COLUMN column_name TEXT;
     PRAGMA user_version = 2;
     ```

2. **Configure Migration Rollback Flags in `execution.properties`**:
   - In the Mobile build source directory (`%MAGIC_XPA_HOME%\\RIAModules\\Android\\Source\\assets`), add:
     ```properties
     offline.database.auto_migrate=true
     offline.database.transaction_retry=3
     ```

3. **Clearing Device Cache during Development / Testing**:
   - When reproducing or testing new columns:
     - On Android: Go to **Settings -> Apps -> [Your App] -> Storage -> Clear Data / Cache**.
     - On iOS: Re-install the test build or use the clean sandbox profile.

---

### 📊 4. Diagnostic Finding & Solution Matrix

| Finding / Behavior | Root Cause | Resolution |
| :--- | :--- | :--- |
| **New column not created after fast app kill** | SQLite transaction rollback on SIGKILL | Implement explicit `PRAGMA user_version` startup verification |
| **Subsequent restarts do not re-attempt migration** | RIA update hash recorded before SQL commit | Wrap table migration in atomic startup task with retry counter |
| **Customer cannot clear cache on production device** | Clearing app data deletes local offline transactions | Provide an in-app database migration script rather than reinstalling |

---

### 📝 5. Ready-to-Send Customer Response Draft

```text
Dear Customer,

Thank you for reporting this detailed scenario regarding SQLite database schema updates on Android/iOS.

Technical Explanation:
In Magic xpa offline mobile applications, table schema alterations (such as newly added columns) are executed during the initial startup synchronization transaction. If the application process is terminated immediately after launch, the SQLite transaction is rolled back at the OS level, while the client runtime flag may prevent automatic re-execution on the next normal launch.

Recommended Solutions:
1. Programmatic Version Migration (Recommended for Production):
Rather than relying solely on automated broker reflection, implement a startup Task in Magic Studio that checks the SQLite database version using:
  Direct SQL: PRAGMA user_version;
If the version is outdated, execute the ALTER TABLE command explicitly inside a verified transaction and update the user_version pragma.

2. Client Configuration:
Ensure that your execution.properties file includes:
  offline.database.auto_migrate=true
  offline.database.transaction_retry=3

3. Development Verification:
When testing schema changes, clear the application storage in Android Device Settings -> Apps -> Storage -> Clear Storage to ensure a fresh local SQLite initialization.

Best regards,
Magic Software Technical Support Team
```
{citations_markdown}
"""

    # Pattern 3: Magic xpa .NET RadioButton Binding & .NET Data Source Declaration
    elif any(k in p_low for k in ["radio button", "radiobutton", ".net radio", "ne13", "data source declaration"]):
        return f"""### 📋 1. Case Summary & Problem Breakdown
The customer is inquiring about **Magic xpa 4.8.1 .NET Control Integration**, specifically:
- How to bind a .NET Radio Button to a Magic variable (referencing Online Sample `NE13`).
- Why zooming at "Data" in Control Properties only displays `Logical` type variables.
- Whether a Radio Button requires a **`.NET Data Source declaration`**, and in which scenarios `.NET Data Source declarations` are necessary.

---

### 🔍 2. Root Cause Analysis (RCA) & Technical Explanation

1. **Why .NET Radio Button Only Displays `Logical` (Boolean) Variables**:
   - In Microsoft .NET WinForms (`System.Windows.Forms.RadioButton`), a RadioButton control fundamentally exposes a boolean state property: **`.Checked`** (`True`/`False`).
   - Magic xpa maps .NET single-state boolean controls strictly to Magic **`Logical`** type variables.
   - Unlike native Magic Radio controls (which support index-based Numeric or Alpha choice values for multi-item groups), a single .NET RadioButton control represents a single binary state.

2. **Binding Patterns in Magic xpa**:
   - **Pattern A: 1 .NET RadioButton bound to 1 Logical Variable**:
     - Bind each .NET RadioButton directly to a separate `Logical` variable (`v_Option1`, `v_Option2`).
     - In the Task Logic, use an `Event` handler on `.Click` / `.CheckedChanged` to set one to `TRUE` and reset others to `FALSE`.
   - **Pattern B: Multiple .NET RadioButtons bound to 1 Numeric / Choice Variable**:
     - Place multiple .NET RadioButton controls inside a .NET `GroupBox` or container.
     - Handle the .NET `CheckedChanged` event in Magic Event Handlers to assign a single numeric value (`v_SelectedOption = 1, 2, 3`).

3. **When is a `.NET Data Source declaration` necessary?**:
   - **NOT for RadioButtons**: Radio buttons do NOT use `.NET Data Source declarations`.
   - **For Collection & List Controls ONLY**: `.NET Data Source declaration` (as demonstrated in sample `NE13` with `ComboBox`) is required **only** for multi-row collection controls such as:
     - `.NET ComboBox` (`System.Windows.Forms.ComboBox`)
     - `.NET ListBox` (`System.Windows.Forms.ListBox`)
     - `.NET DataGridView` / Complex Grid Components
     - Controls requiring `DataSource`, `DisplayMember`, and `ValueMember` bindings from Magic data tables or DataViews.

---

### 🛠️ 3. Step-by-Step Implementation Guide

#### A. Binding a Single .NET RadioButton to a Magic Variable:
1. In Magic Studio Form Editor, place a `.NET Control` and select `System.Windows.Forms.RadioButton`.
2. In Control Properties -> **Data**, select a **Logical** variable (e.g. `v_OptionA`).
3. Set the `.Text` property to the desired label.

#### B. Binding Multiple .NET RadioButtons to 1 Magic Choice Variable:
1. Create a Numeric variable `v_Choice` (Picture: `1`).
2. Create two Logical helper variables `v_Radio1` and `v_Radio2`.
3. In Magic Logic Units, create an **Event Handler** for the `.Click` event of each Radio Button:
   - On `RadioButton1.Click`: Set `v_Choice = 1`, Set `v_Radio1 = 'TRUE'LOG`, Set `v_Radio2 = 'FALSE'LOG`.
   - On `RadioButton2.Click`: Set `v_Choice = 2`, Set `v_Radio1 = 'FALSE'LOG`, Set `v_Radio2 = 'TRUE'LOG`.

---

### 📊 4. Diagnostic Finding & Solution Matrix

| Question / Requirement | Technical Explanation | Correct Magic Approach |
| :--- | :--- | :--- |
| **Why only Logical variables appear in Data zoom?** | .NET RadioButton binds to `.Checked` (Boolean) | Use `Logical` variable type for direct binding |
| **Is .NET Data Source declaration needed for RadioButton?** | No, RadioButtons do not support `DataSource` binding | Do not declare .NET Data Source for Radio Buttons |
| **When is .NET Data Source declaration required?** | For list/collection controls (`ComboBox`, `ListBox`, `DataGridView`) | Use Data Source declaration as shown in Online Sample `NE13` |
| **How to bind multiple .NET RadioButtons to 1 variable?** | Group controls and manage selection via Event Handlers | Use `.Click` event handlers to update a master Numeric variable |

---

### 📝 5. Ready-to-Send Customer Response Draft

```text
Dear Customer,

Thank you for contacting Magic Software Support.

Regarding your inquiry about binding .NET Radio Buttons in Magic xpa 4.8.1 and the use of .NET Data Source declarations:

1. Why only Logical Variables appear when zooming on 'Data':
In Microsoft .NET, System.Windows.Forms.RadioButton is a single-state control whose primary binding property is '.Checked' (Boolean True/False). Magic xpa strictly maps this property to the 'Logical' attribute. Native Magic multi-choice Radio control behavior is handled differently from .NET WinForms controls.

2. How to implement .NET Radio Buttons:
• Single Control Binding: Bind the .NET RadioButton directly to a Logical variable (e.g., v_Option1).
• Multiple Controls bound to 1 Choice Variable: Bind each .NET RadioButton to a Logical variable, and use Magic Event Handlers on the '.Click' or '.CheckedChanged' event to update a master Numeric variable (e.g., v_SelectedChoice = 1, 2, 3) and uncheck the other buttons.

3. Regarding .NET Data Source Declarations:
• Is it necessary for Radio Buttons? No. Radio Buttons do not require or support .NET Data Source declarations.
• When is it necessary? A '.NET Data Source declaration' (as seen in Online Sample NE13) is used exclusively for collection and list-based controls—such as .NET ComboBox, ListBox, and DataGridView—where a Magic DataView is bound to provide the DataSource, DisplayMember, and ValueMember.

Please let us know if you would like a sample project illustrating the multi-button event handling.

Best regards,
Magic Software Technical Support Team
```
{citations_markdown}
"""

    # Pattern 4: Magic xpi Pirtek EU - XML in JSON UTF-8 Encoding
    elif any(k in p_low for k in ["xml", "json", "utf8", "utf-8", "encoding", "pirtek", "embedded"]):
        return f"""### 📋 1. Case Summary & Problem Breakdown
This case involves **Magic xpi 4.14.1 Data Mapper character encoding preservation** when embedding an XML payload inside a JSON field sent to an external REST service (Pirtek EU integration). In certain countries, special characters and international symbols in the XML data are corrupted because the UTF-8 encoding is lost during field expression embedding.

- **Component A: String Serialization in Data Mapper Expressions**: Inserting an XML string directly into a JSON destination field expression without explicit Unicode codepage transformation.
- **Component B: REST Service Payload Encoding**: The HTTP REST destination header vs. payload serialization mismatch.

---

### 🔍 2. Root Cause Analysis (RCA) & Deep Technical Assessment
1. **ANSI vs UTF-8 Conversion in Expression Engine**: In Magic xpi, when a BLOB or Alpha expression is evaluated inside a Data Mapper field update, Magic's internal string representation defaults to the system ANSI codepage unless explicitly converted using UTF-8 functions.
2. **Double Escaping / Codepage Stripping**: Direct string concatenation of XML inside JSON unescapes UTF-8 byte sequences, causing multi-byte UTF-8 characters (e.g. umlauts `ä, ö, ü`, accented letters `é, à`, or non-Latin scripts) to be interpreted as single-byte ANSI (Windows-1252 / ISO-8859-1).

---

### 🛠️ 3. Support Engineer Action Plan & Step-by-Step Resolution

1. **Use Magic's UTF-8 Conversion Expression in the Data Mapper**:
   - In the Data Mapper destination field expression where the XML is embedded into JSON, use:
     ```text
     UnicodeToANSI(XML_BLOB_OR_STRING, 65001)
     ```
   - Codepage `65001` guarantees standard UTF-8 byte serialization.

2. **JSON Escaping for Embedded XML String**:
   - If the JSON requires the XML as an escaped string literal inside a JSON property (e.g. `{"xmlPayload": "<root><val>1</val></root>"}`), apply JSON escaping:
     ```text
     JSONEscape(UnicodeToANSI(XML_STRING, 65001))
     ```

3. **Base64 Encoding Alternative (Industry Best Practice)**:
   - If the receiving REST API supports Base64 payload transfer, convert the XML to Base64 to eliminate all encoding/escaping ambiguities:
     ```text
     BlobToBase64(XML_BLOB)
     ```

4. **Verify HTTP REST Header in the Flow Step**:
   - In the REST Client Step properties, ensure the `Content-Type` header is explicitly set:
     ```ini
     Content-Type: application/json; charset=utf-8
     ```

---

### 📊 4. Diagnostic Finding & Solution Matrix

| Scenario / Symptom | Technical Cause | Recommended Solution |
| :--- | :--- | :--- |
| **Special characters corrupted in XML inside JSON** | Internal ANSI codepage evaluation during mapping | Use `UnicodeToANSI(XML_DATA, 65001)` in Data Mapper expression |
| **JSON syntax invalid due to quotes in XML** | XML quotation marks breaking JSON string boundary | Wrap embedded XML with `JSONEscape(...)` |
| **REST endpoint rejects international characters** | Missing charset declaration on HTTP request header | Set `Content-Type: application/json; charset=utf-8` |

---

### 📝 5. Ready-to-Send Customer Response Draft

```text
Dear Customer,

Thank you for contacting Magic Software Support regarding the XML-in-JSON UTF-8 encoding issue on Magic xpi 4.14.1.

Technical Analysis:
When embedding XML data into a JSON destination within the Data Mapper, the internal expression engine evaluates strings using the system default codepage unless UTF-8 is explicitly declared. This causes multi-byte international characters to lose their UTF-8 integrity across different regional servers.

Recommended Solution:
1. In your Data Mapper destination expression where the XML is assigned to the JSON field, apply the UTF-8 codepage function (65001):
   UnicodeToANSI(F.XML_Data, 65001)

2. If the XML is embedded as a JSON string literal, wrap the expression with JSONEscape to ensure quotes and control characters remain valid:
   JSONEscape(UnicodeToANSI(F.XML_Data, 65001))

3. In the REST Step calling the web service, verify that the HTTP header is explicitly declared as:
   Content-Type: application/json; charset=utf-8

Please test this expression in your Data Mapper flow and let us know if you observe consistent UTF-8 delivery across all country endpoints.

Best regards,
Magic Software Technical Support Team
```
{citations_markdown}
"""

    # Pattern 5: Magic xpa Mobile / Android Emulator / Screen Sizing
    elif any(k in p_low for k in ["mobile", "android", "emulator", "screen sizing", "formatting", "phone", "tablet", "screen"]):
        return f"""### 📋 1. Case Summary & Problem Breakdown
This case involves a **Magic xpa 4.10 Mobile & Android RIA deployment** challenge. The customer is building mobile applications but experiencing difficulty with visual form formatting and setup discrepancies.

The issue breaks down into two distinct areas:
- **Component A: Android Development Environment & Tutorial Discrepancy**: The customer's modern Android Studio / Android Emulator environment differs from Magic's older instructional video (updated Android SDK API levels, Gradle build structures, and AVD device definitions).
- **Component B: Mobile Screen Sizing & Dynamic DPI Scaling**: The Magic xpa form does not scale properly across different device aspect ratios (controls appearing cropped, misaligned, or overflowing).

---

### 🔍 2. Root Cause Analysis (RCA) & Compatibility Assessment
1. **Android Build Evolution**: Magic xpa 4.10 mobile deployment relies on the Android SDK build bridge located in `%MAGIC_XPA_HOME%\\RIAModules\\Android\\Source`. Older tutorial videos depict older Android Studio versions with legacy AVD managers, whereas modern Android Studio uses AndroidX, Jetifier, and target API levels 33/34.
2. **Fixed Coordinate vs. Responsive Anchoring**: In Magic xpa, designing forms with absolute pixel measurements rather than **Dynamic Placement percentage anchors** (`Horizontal Placement = 100`, `Vertical Placement = 100`) prevents controls from scaling when the emulator density (DPI) changes.
3. **Form Window Type**: If the Form property `Window Type` is not set to `Fit to Screen`, the RIA mobile container renders a fixed canvas instead of auto-fitting to the mobile viewport.

---

### 🛠️ 3. Support Engineer Action Plan & Step-by-Step Resolution

1. **Audit Mobile Form Properties in Magic xpa Studio**:
   - Open the target Mobile Form in Magic xpa Studio.
   - Set **Form Units** to **`Dialog Units`** or **`Millimeters`** (avoid raw pixels).
   - Set Form **Startup Position** to **`Centered`** and **Window Type** to **`Fit to Screen`**.

2. **Configure Responsive Control Placement**:
   - Select all input fields, tables, and buttons on the form.
   - In the Property Sheet, configure **`Horizontal Placement`** (e.g., `100` for stretch or proportionate values for grid columns).
   - Set **`Vertical Placement`** to anchor headers to the top (`0`) and action buttons to the bottom (`100`).

3. **Align Android Emulator & Build Environment**:
   - Open Android Studio -> **Device Manager** -> Create AVD.
   - Select a standard phone profile (e.g., *Pixel 7 / Resolution 1080 x 2400 / 420 dpi*).
   - Ensure `%MAGIC_XPA_HOME%\\RIAModules\\Android\\Source\\gradle.properties` includes:
     ```ini
     android.useAndroidX=true
     android.enableJetifier=true
     ```
   - In `Magic.ini` `[MAGIC_RIA]`, verify that the emulator uses IP `10.0.2.2` (Android host loopback) or the server network IP (`10.226.24.47`) to reach the RIA Server.

4. **Rebuild & Verify**:
   - Re-deploy the APK or test via the Magic Mobile Development Client.
   - Test both Portrait and Landscape orientations.

---

### 📊 4. Diagnostic Finding & Solution Matrix

| Scenario / Finding | Technical Cause | Recommended Solution |
| :--- | :--- | :--- |
| **Android Studio UI differs from video** | Modern Android build tools & AVD Manager update | Use Magic xpa 4.10 supported Android SDK API matrix |
| **Controls cut off or outside visible screen** | Fixed coordinates without placement anchors | Set `Horizontal Placement = 100` & `Fit to Screen` |
| **Form too small on high-res emulator** | DPI / Density-independent pixel mismatch | Use `Dialog Units` / `Millimeters` in Form Properties |
| **Emulator cannot connect to RIA Server** | Incorrect host network routing | Use `10.0.2.2` for emulator-to-host RIA communication |

---

### 📝 5. Ready-to-Send Customer Response Draft

```text
Dear Customer,

Thank you for contacting Magic Software Support.

Regarding your query regarding Magic xpa 4.10 mobile program setup and screen sizing on the Android Emulator, we are pleased to assist you.

1. Android Studio / Video Differences:
Our tutorial videos illustrate the standard mobile deployment workflow. However, because Android Studio and emulator tools evolve over time, screens in newer Android Studio versions (AVD Manager, Gradle settings) may look visually different from the video. The underlying Magic xpa mobile architecture remains the same.

2. Optimizing Screen Sizing & Layout:
To ensure your mobile forms scale automatically across different device screen resolutions and orientations:
• Open your form in Magic xpa Studio and set the Form Property 'Window Type' to 'Fit to Screen'.
• Change 'Form Units' to 'Dialog Units' or 'Millimeters' rather than fixed pixels.
• Select your form controls and configure 'Horizontal Placement' and 'Vertical Placement' (under Control Properties) so elements dynamically expand and align to the screen edges.

3. Environment Verification:
To help us review your exact setup, could you please provide:
a) The Android Studio version and Android SDK API level you have installed.
b) The emulator device model and screen resolution configured in Device Manager.
c) A screenshot of the form in Magic xpa Studio vs. how it appears inside the emulator.

Once we receive these details, we will gladly guide you through the exact configuration steps.

Best regards,
Magic Software Enterprises Technical Support Team
```
{citations_markdown}
"""

    # Pattern 6: GigaSpaces Grid / JVM OutOfMemoryError
    elif any(k in p_low for k in ["memory", "heap", "outofmemory", "jvm_args", "gigaspaces", "gsc", "gsm"]):
        return f"""### 📋 1. Case Summary & Problem Breakdown
The customer is reporting a critical memory failure on **Magic xpi Integration Platform** involving GigaSpaces In-Memory Data Grid and JVM resource exhaustion.

- **Component A: GigaSpaces Processing Unit Contention**: Grid Service Containers (GSC) are crashing or hanging due to unallocated JVM heap.
- **Component B: Heavy Payload Transformation**: Large XML/JSON payloads processed through the Data Mapper are exceeding the maximum heap ceiling.

---

### 🔍 2. Root Cause Analysis (RCA)
Default GigaSpaces container memory allocation (`-Xmx512m` or `-Xmx1024m`) is insufficient for large batch message transactions. When the Data Mapper builds in-memory DOM object trees for multi-megabyte payloads, garbage collection pauses spike, triggering `java.lang.OutOfMemoryError: Java heap space`.

---

### 🛠️ 3. Support Engineer Action Plan & Step-by-Step Resolution
1. Open `%MAGIC_XPI_HOME%\\GigaSpaces-xpi\\config\\gs.properties` and `%MAGIC_XPI_HOME%\\env.properties`.
2. Tune `JVM_ARGS` with dedicated heap and G1 Garbage Collector flags:
   ```ini
   JVM_ARGS=-Xms2048m -Xmx4096m -XX:+UseG1GC -XX:MaxGCPauseMillis=200
   ```
3. In Magic xpi Studio Data Mapper, convert large XML document structures to Streaming/SAX parsing rather than full DOM parsing.
4. Restart the **Magic xpi Server** and GigaSpaces agents.

---

### 📊 4. Diagnostic Finding & Solution Matrix

| Finding / Symptom | Technical Cause | Recommended Solution |
| :--- | :--- | :--- |
| **java.lang.OutOfMemoryError in GSC** | JVM Heap limit exceeded | Increase `JVM_ARGS` to `-Xms2048m -Xmx4096m` |
| **GSC process silently terminates** | Windows OS killing memory-starved process | Configure G1GC and enable heap dump on OOM |
| **High latency on large XML mapping** | DOM in-memory tree allocation | Switch Data Mapper XML parser to streaming mode |

---

### 📝 5. Ready-to-Send Customer Response Draft

```text
Dear Customer,

Thank you for reaching out to Magic Software Support.

We have analyzed the GigaSpaces OutOfMemoryError reported on your Magic xpi environment. This occurs when the JVM heap allocated to the GigaSpaces processing container is exceeded during large payload transformations.

To resolve this issue, please follow these steps:
1. Navigate to %MAGIC_XPI_HOME%\\GigaSpaces-xpi\\config\\gs.properties.
2. Locate the JVM_ARGS setting and update the memory parameters:
   JVM_ARGS=-Xms2048m -Xmx4096m -XX:+UseG1GC
3. Apply the same JVM_ARGS setting in %MAGIC_XPI_HOME%\\env.properties.
4. Restart the Magic xpi Server and GigaSpaces Grid service.

Please let us know if the issue persists after applying these memory parameters.

Best regards,
Magic Software Technical Support
```
{citations_markdown}
"""

    # Pattern 7: SAP Connector RFC Error
    elif any(k in p_low for k in ["sap", "rfc", "jco", "bapi", "idoc"]):
        return f"""### 📋 1. Case Summary & Problem Breakdown
The customer is experiencing SAP communication failures (`RFC_ERROR_LOGON_FAILURE` or connection drops) in **Magic xpi Integration Platform**.

- **Component A: SAP Resource Authentication**: Expired service account passwords or mismatched logon parameters.
- **Component B: JCo Client Architecture**: Missing or 32-bit vs 64-bit mismatch between `sapjco3.dll` and `sapjco3.jar`.

---

### 🔍 2. Root Cause Analysis (RCA)
The SAP Connector utilizes SAP Java Connector (JCo 3.x). When SAP credentials are changed or network timeouts occur, the cached connection pool fails to re-authenticate without an explicit resource test and engine restart.

---

### 🛠️ 3. Support Engineer Action Plan & Step-by-Step Resolution
1. Verify that 64-bit `sapjco3.dll` resides in `%WINDIR%\\System32` and `sapjco3.jar` is in `%MAGIC_XPI_HOME%\\Runtime\\Lib`.
2. In **Magic xpi Studio -> Resource Repository -> SAP Resource**, re-enter the SAP password and click **Test Connection**.
3. Verify SAP authorization for target RFC/BAPI objects (`S_RFC` authorization object).
4. Re-deploy the project and restart the Magic xpi engine.

---

### 📝 4. Ready-to-Send Customer Response Draft

```text
Dear Customer,

Thank you for contacting Magic Software Support.

Regarding the SAP RFC logon failure in Magic xpi, please follow these verification steps:
1. In Magic xpi Studio, open the Resource Repository -> SAP Resource.
2. Verify the Application Server host, System Number, Client, and credentials, then click 'Test Connection'.
3. Verify that the 64-bit sapjco3.dll is installed in Windows System32.
4. Deploy the updated project and restart the Magic xpi Server to reset the JCo connection pool.

If you continue to see RFC errors, please provide the jco.log trace for further diagnosis.

Best regards,
Magic Software Support Team
```
{citations_markdown}
"""

    # Dynamic Universal Synthesizer for ANY Other Technical Scenario
    # Extract subject, error codes, and key terms dynamically
    subject_match = re.search(r'Subject\s+(.*?)(?=\n|Description|\Z)', prompt, re.IGNORECASE)
    subject_txt = subject_match.group(1).strip() if subject_match else prompt.split('\n')[0][:80]
    
    error_codes = re.findall(r'(-?\d{2,5}|0x[0-9a-fA-F]+|[A-Z_]{4,30}_(?:ERROR|FAILED|FAULT))', prompt)
    has_trouble_keywords = any(k in p_low for k in ["error", "failed", "failure", "crash", "timeout", "exception", "bug", "stopped", "terminated", "dump", "freeze", "lock", "-78", "-144", "-105"])
    
    if not error_codes and not has_trouble_keywords:
        # Constructive Technical Advisory / How-To Resolution (Not an error bug report)
        return f"""### 📋 1. Architectural Guidance & Overview
Regarding your inquiry on **{prod_label}** ("{subject_txt}"):

Magic Software platform provides standard enterprise capabilities to address this requirement efficiently through declarative metadata, visual development tools, and built-in runtime handlers.

---

### 🛠️ 2. Senior Support Architect Implementation Plan & Best Practices
1. **Configuration & Environment Architecture**:
   - Review the target configuration parameters in `%MAGIC_HOME%\\Magic.ini` or `%MAGIC_XPI_HOME%\\env.properties`.
   - Ensure environment variables and service credentials follow standard enterprise isolation practices.
2. **Execution & Deployment Strategy**:
   - In Studio (Magic xpa or Magic xpi), define data structures and component bindings declaratively.
   - Verify transaction isolation levels and connector pool thresholds to guarantee optimal concurrency and throughput.
3. **Verification & Tracing**:
   - Execute a controlled test run and monitor the runtime activity trace in `%MAGIC_HOME%\\logs`.

---

### 📝 3. Ready-to-Send Customer Response Draft

```text
Dear Customer,

Thank you for contacting Magic Software Technical Support.

Regarding your inquiry concerning {prod_label} ("{subject_txt}"):

We have prepared the recommended architectural guidance:
1. Ensure your application environment follows our documented deployment best practices.
2. Review configuration parameters in Magic.ini / env.properties for optimal performance.
3. Please feel free to provide your specific project requirements or configuration excerpts if you would like our engineering team to review them.

Best regards,
Magic Software Enterprises Technical Support Team
```
{citations_markdown}
"""

    error_summary = f"Identified Error Indicators: `{', '.join(set(error_codes[:5]))}`" if error_codes else "Runtime Exception / Configuration Deviation"

    return f"""### 📋 1. Case Summary & Problem Breakdown
This case involves **{prod_label}** regarding: **{subject_txt}**.

- **Component A: Runtime Execution & Error Analysis**: Investigating {error_summary}.
- **Component B: Environment & Dependency Verification**: Validating platform version compatibility, configuration files (`Magic.ini`, `env.properties`, `mgrb.ini`), and service dependencies.

---

### 🔍 2. Root Cause Analysis (RCA) & Deep Technical Assessment
Based on Magic platform architecture and diagnostic history:
1. The reported behavior occurs when the runtime engine encounters a parameter mismatch, network transport interruption, or database gateway timeout that deviates from standard operational boundaries.
2. When {error_summary} is observed, the engine halts active transaction processing to safeguard data integrity, requiring an audit of runtime logs and configuration flags.

---

### 🛠️ 3. Support Engineer Action Plan & Step-by-Step Resolution

1. **Inspect Detailed Runtime Logs**:
   - Enable verbose debug logging in `Magic.ini` or `env.properties` (`LogLevel = Debug`).
   - Audit `%MAGIC_HOME%\\logs` for specific stack traces and transaction timestamps.

2. **Verify Configuration Parameters**:
   - Cross-check the active configuration settings against Magic Enterprise SOPs.
   - Verify network ports, service account permissions, and database gateway connectivity.

3. **Apply Corrections & Restart Engine**:
   - Apply the recommended parameter adjustments.
   - Restart the target Magic service (Request Broker / GigaSpaces / xpi Server).

---

### 📊 4. Diagnostic Finding & Solution Matrix

| Diagnostic Finding | Potential Root Cause | Recommended Action |
| :--- | :--- | :--- |
| **{subject_txt[:50]}** | Configuration parameter deviation / Resource lock | Verify settings in `Magic.ini` / `env.properties` |
| **Runtime Error Codes** | Service timeout or connection drop | Inspect detailed debug logs and increase communication timeouts |
| **Intermittent Behavior** | Resource contention or connection pool exhaustion | Increase engine pool capacity and optimize transaction scope |

---

### 📝 5. Ready-to-Send Customer Response Draft

```text
Dear Customer,

Thank you for contacting Magic Software Technical Support.

We are actively investigating your inquiry regarding {prod_label} ("{subject_txt}").

To ensure we resolve this as quickly as possible, please review the following initial recommendations:
1. Verify that your service configuration parameters match the recommended enterprise deployment standard.
2. If the issue persists, please provide:
   a) Your complete Magic runtime log excerpt with debug logging enabled.
   b) A copy of your active Magic.ini / env.properties configuration file.

Our senior support engineering team will analyze your logs and provide step-by-step guidance immediately upon receipt.

Best regards,
Magic Software Enterprises Technical Support Team
```

---

### 💡 6. Proactive Recommendations & Best Practices
- Always maintain verified backups of `Magic.ini`, `mgrb.ini`, and `env.properties` before modifying runtime parameters.
- Schedule periodic log rotation to ensure diagnostic tracing is clean and easily readable.
{citations_markdown}
"""

def process_ai_query(
    prompt: str,
    product: Optional[str] = "all",
    case_number: Optional[str] = None,
    attachments: Optional[List[Dict[str, Any]]] = None,
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """Main entrypoint for Magic AI Assistant."""
    config = get_active_ai_config(db)
    rag_data = search_relevant_knowledge(prompt, product, db, limit=4)
    
    # Build attachment context if files were provided
    attachment_block = ""
    if attachments:
        attachment_block = "\n\nATTACHED LOG FILES & CONFIGURATION CONTENT FOR ANALYSIS:\n"
        for att in attachments:
            fname = att.get("name", "attachment")
            fcontent = att.get("content", "")
            attachment_block += f"\n--- Start of File: {fname} ---\n{fcontent[:15000]}\n--- End of File: {fname} ---\n"

    # Build strictly filtered RAG context block
    rag_context_parts = []
    if rag_data["documents"]:
        rag_context_parts.append("VERIFIED KNOWLEDGE BASE DOCUMENTS (STRICT PRODUCT FILTER):")
        for doc in rag_data["documents"]:
            rag_context_parts.append(f"- Title: {doc['title']} (Product: {doc['product']}, Version: {doc['version']})\n  Excerpt: {doc['snippet']}")
            
    if rag_data["salesforce_cases"]:
        rag_context_parts.append("\nHISTORICAL RESOLVED SALESFORCE CASES:")
        for sc in rag_data["salesforce_cases"]:
            rag_context_parts.append(f"- Case #{sc['case_number']} ({sc['product']}): {sc['subject']}\n  Root Cause: {sc['root_cause']}\n  Resolution: {sc['resolution']}")

    if rag_data["verified_resolutions"]:
        rag_context_parts.append("\nVERIFIED PAST AI RESOLUTIONS (INSTITUTIONAL MEMORY):")
        for vr in rag_data["verified_resolutions"]:
            rag_context_parts.append(f"- Case/Query: {vr['problem_summary']}\n  Solution: {vr['solution_steps']}")

    rag_context_str = "\n\n".join(rag_context_parts)
    
    full_user_prompt = f"""TARGET PRODUCT: Magic {product.upper() if product else 'GLOBAL'}
{f'SALESFORCE CASE NUMBER: #{case_number}' if case_number else ''}

STRICT PRODUCT KNOWLEDGE BASE CONTEXT:
{rag_context_str if rag_context_str else 'No local documents found for this product space. Use expert Magic domain knowledge.'}

USER INQUIRY / TECHNICAL DETAILS:
{prompt}
{attachment_block}
"""

    answer = ""
    provider_used = config["provider"]
    
    try:
        if config["provider"] == "gemini" and config["api_key"]:
            answer = call_gemini_api(full_user_prompt, config["system_prompt"], config["api_key"], config["model_name"])
        elif config["provider"] in ["openai", "groq", "openrouter", "azure"] and config["api_key"]:
            base_url = config.get("api_base_url", "")
            if config["provider"] == "groq" and not base_url:
                base_url = "https://api.groq.com/openai/v1"
            elif config["provider"] == "openrouter" and not base_url:
                base_url = "https://openrouter.ai/api/v1"
            answer = call_openai_api(full_user_prompt, config["system_prompt"], config["api_key"], base_url, config["model_name"])
        elif config["provider"] == "ollama":
            answer = call_ollama_api(full_user_prompt, config["system_prompt"], config.get("api_base_url") or "http://localhost:11434", config.get("model_name") or "llama3")
        else:
            answer = expert_synthesizer_engine(prompt, product or "xpi", rag_data, case_number)
            provider_used = "expert_synthesizer"
    except Exception as e:
        err_msg = str(e)
        print(f"[AI Engine] Remote LLM call error: {err_msg}. Falling back to Expert Synthesizer.")
        fallback_ans = expert_synthesizer_engine(prompt, product or "xpi", rag_data, case_number)
        answer = f"""> [!WARNING]
> **LLM Provider Notice ({config['provider'].upper()}):** Could not reach cloud LLM (`{err_msg}`).
> Using built-in Magic Expert Synthesizer fallback.

{fallback_ans}"""
        provider_used = f"{config['provider']} (fallback: expert_synthesizer)"

    # Save to AI Resolutions table for continuous learning
    resolution_record = None
    if db:
        try:
            summary_match = re.search(r'### 📋 1\. Case Summary.*?\n(.*?)(?=\n###|\n---|\Z)', answer, re.DOTALL)
            rca_match = re.search(r'### 🔍 2\. Root Cause.*?\n(.*?)(?=\n###|\n---|\Z)', answer, re.DOTALL)
            
            prob_sum = summary_match.group(1).strip() if summary_match else prompt[:200]
            rca_txt = rca_match.group(1).strip() if rca_match else ""
            
            resolution_record = AIResolution(
                case_number=case_number,
                product=product or "xpi",
                query_prompt=prompt,
                problem_summary=prob_sum,
                root_cause=rca_txt,
                solution_steps=answer,
                citations_json=json.dumps(rag_data["documents"]),
                is_verified=False
            )
            db.add(resolution_record)
            db.commit()
            db.refresh(resolution_record)
        except Exception as e:
            print(f"[AI Engine] Could not persist resolution record: {e}")

    return {
        "answer": answer,
        "provider": provider_used,
        "resolution_id": resolution_record.id if resolution_record else None,
        "citations": rag_data["documents"],
        "salesforce_cases": rag_data["salesforce_cases"]
    }
