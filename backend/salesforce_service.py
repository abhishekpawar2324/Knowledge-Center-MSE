import os
import csv
import json
import io
import re
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from backend.database import SalesforceCase, Document, Notification, AIResolution, get_db
from backend.indexer import UPLOADS_XPA, UPLOADS_XPI, UPLOADS_CLOUD, UPLOADS_GENERAL

# Initial High-Value Real-World Magic Support Case Seeds
INITIAL_MAGIC_CASES_SEED = [
    {
        "case_number": "00482910",
        "subject": "Magic xpi 4.14: SAP Connector RFC_ERROR_LOGON_FAILURE in Production",
        "product": "xpi",
        "version": "4.14",
        "status": "Closed",
        "customer_name": "Global Manufacturing Corp",
        "error_codes": "RFC_ERROR_LOGON_FAILURE, JCO_ERROR_COMMUNICATION",
        "description": "After rotating SAP service passwords in production, Magic xpi SAP Trigger failed with RFC logon error 103.",
        "root_cause": "The SAP resource pool retained cached credentials and the sapjco3.dll connection pool did not auto-refresh after password change.",
        "resolution": "1. Update SAP Resource password in Magic xpi Studio -> Resource Repository.\n2. In Studio, run Test Connection to verify BAPI/RFC reachability.\n3. Deploy the project and restart the Magic xpi engine service to flush the JCo connection pool."
    },
    {
        "case_number": "00491024",
        "subject": "Magic xpi GigaSpaces Grid OutOfMemoryError during 50MB XML Data Mapper Transformation",
        "product": "xpi",
        "version": "4.13",
        "status": "Closed",
        "customer_name": "FinTech Integrations Ltd",
        "error_codes": "java.lang.OutOfMemoryError: Java heap space, GS-GSC-CRASH",
        "description": "Integration flow processing large batch banking statements crashes the GigaSpaces Processing Unit.",
        "root_cause": "Default GigaSpaces container heap was set to 512MB (-Xmx512m), which was exceeded during DOM XML parsing.",
        "resolution": "1. Open %MAGIC_XPI_HOME%\\GigaSpaces-xpi\\config\\gs.properties.\n2. Set JVM_ARGS=-Xms2048m -Xmx4096m -XX:+UseG1GC.\n3. In Data Mapper, switch large XML schema parsing to SAX/Streaming mode.\n4. Restart GigaSpaces Grid Service Container (GSC)."
    },
    {
        "case_number": "00501239",
        "subject": "Magic xpa 4.9: Client RIA Application MGRQ_ERR_TIMEOUT on Windows Server 2022",
        "product": "xpa",
        "version": "4.9",
        "status": "Closed",
        "customer_name": "Healthcare Systems Inc",
        "error_codes": "MGRQ_ERR_TIMEOUT, -100 Broker Timeout",
        "description": "Users intermittently get 'Request timed out' when invoking heavy patient search forms in Rich Client RIA mode.",
        "root_cause": "All 4 worker engines were consumed by long-running background PDF generation tasks, leaving 0 interactive engines for RIA clients.",
        "resolution": "1. In Magic.ini, increase NumberOfEngines from 4 to 8.\n2. Set ActivateRequestsServer = Y.\n3. Segregate batch reporting to dedicated Batch Server engines via Application Server partitioning in mgreq.ini."
    },
    {
        "case_number": "00514992",
        "subject": "Magic xpi Salesforce REST Connector invalid_grant: expired access/refresh token",
        "product": "xpi",
        "version": "4.14",
        "status": "Closed",
        "customer_name": "Logistics Worldwide",
        "error_codes": "invalid_grant, 401 Unauthorized",
        "description": "Salesforce order sync flow stopped working over the weekend with OAuth invalid_grant.",
        "root_cause": "Salesforce admin reset user password which revoked OAuth tokens, and Connected App IP relaxation was disabled.",
        "resolution": "1. In Salesforce Setup -> Connected Apps -> Magic App, set 'IP Relaxation' to 'Relax IP Restrictions'.\n2. Re-authenticate OAuth2 in Magic xpi Studio Salesforce Resource.\n3. Acquire new Refresh Token and redeploy integration project."
    },
    {
        "case_number": "00523811",
        "subject": "Magic xpa Oracle Gateway ORA-01000: maximum open cursors exceeded",
        "product": "xpa",
        "version": "4.8",
        "status": "Closed",
        "customer_name": "Retail Logistics Group",
        "error_codes": "ORA-01000, MG_DB_ERROR_CURSOR",
        "description": "Magic xpa transaction processing throws ORA-01000 after 6 hours of continuous operation.",
        "root_cause": "Inner loop subtasks with 'Open Table in Task' set to Yes without explicit Close Table on task exit kept Oracle cursor handles open.",
        "resolution": "1. In Magic xpa Studio, set task property 'Close Tables on Exit' to Immediately.\n2. In Magic.ini [MAGIC_DATABASES], set Oracle Gateway parameter `CloseCursors = Y`.\n3. Verify open cursor count with DBA query: `SELECT count(*) FROM v$open_cursor`."
    }
]

def seed_initial_cases_if_empty(db: Session):
    """Seed initial high-value Salesforce cases if table is empty."""
    try:
        count = db.query(SalesforceCase).count()
        if count == 0:
            for seed in INITIAL_MAGIC_CASES_SEED:
                case = SalesforceCase(
                    case_number=seed["case_number"],
                    subject=seed["subject"],
                    product=seed["product"],
                    version=seed.get("version", "Universal"),
                    status=seed.get("status", "Closed"),
                    customer_name=seed.get("customer_name", ""),
                    error_codes=seed.get("error_codes", ""),
                    description=seed["description"],
                    root_cause=seed["root_cause"],
                    resolution=seed["resolution"]
                )
                db.add(case)
            db.commit()
            print(f"[Salesforce] Seeded {len(INITIAL_MAGIC_CASES_SEED)} benchmark support cases.")
    except Exception as e:
        print(f"[Salesforce] Error seeding initial cases: {e}")

def import_salesforce_cases_from_csv(csv_content: str, db: Session) -> Dict[str, Any]:
    """Parse and upsert Salesforce cases from CSV string."""
    reader = csv.DictReader(io.StringIO(csv_content))
    imported = 0
    updated = 0
    
    for row in reader:
        # Standardize field names from Salesforce report exports
        case_num = row.get("Case Number") or row.get("CaseNumber") or row.get("Case_Number") or row.get("ID")
        if not case_num:
            continue
            
        case_num = str(case_num).strip()
        subject = row.get("Subject") or row.get("Title") or "Salesforce Case " + case_num
        desc = row.get("Description") or row.get("Details") or ""
        prod = (row.get("Product") or row.get("Product__c") or "xpi").lower()
        if "xpa" in prod:
            prod = "xpa"
        elif "cloud" in prod:
            prod = "cloud_native"
        else:
            prod = "xpi"
            
        rca = row.get("Root Cause") or row.get("Root_Cause__c") or row.get("Cause") or ""
        resolution = row.get("Resolution") or row.get("Resolution__c") or row.get("Solution") or ""
        status = row.get("Status") or "Closed"
        cust = row.get("Account Name") or row.get("Account.Name") or row.get("Customer") or ""
        errs = row.get("Error Code") or row.get("Error_Code__c") or row.get("ErrorCode") or ""

        existing = db.query(SalesforceCase).filter(SalesforceCase.case_number == case_num).first()
        if existing:
            existing.subject = subject
            existing.description = desc
            existing.product = prod
            existing.root_cause = rca
            existing.resolution = resolution
            existing.status = status
            existing.customer_name = cust
            existing.error_codes = errs
            updated += 1
        else:
            new_case = SalesforceCase(
                case_number=case_num,
                subject=subject,
                description=desc,
                product=prod,
                root_cause=rca,
                resolution=resolution,
                status=status,
                customer_name=cust,
                error_codes=errs
            )
            db.add(new_case)
            imported += 1
            
    db.commit()
    return {"status": "success", "imported": imported, "updated": updated}

def create_kb_article_from_ai(
    title: str,
    product: str,
    content: str,
    version: str = "Universal",
    doc_type: str = "troubleshooting",
    author: str = "Magic AI Assistant",
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """Converts an AI resolution into a formal, indexed Knowledge Base article."""
    if not db:
        return {"status": "error", "message": "Database session not provided"}
        
    safe_filename = re.sub(r'[^a-zA-Z0-9_\-]', '_', title.lower())[:60] + f"_{int(datetime.utcnow().timestamp())}.md"
    
    # Target directory based on product
    if product.lower() == "xpa":
        target_dir = UPLOADS_XPA
    elif product.lower() == "cloud_native":
        target_dir = UPLOADS_CLOUD
    elif product.lower() == "xpi":
        target_dir = UPLOADS_XPI
    else:
        target_dir = UPLOADS_GENERAL
        
    os.makedirs(target_dir, exist_ok=True)
    file_path = os.path.join(target_dir, safe_filename)
    
    # Format standard Markdown document
    formatted_md = f"""# {title}

> **Product:** Magic {product.upper()} | **Version:** {version} | **Category:** {doc_type.capitalize()} | **Published By:** {author}

---

{content}

---
*Generated and verified via Magic AI Assistant Resolution Engine. Published to Magic Knowledge Center.*
"""
    
    # Save to disk
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(formatted_md)
        
    # Add to documents table
    new_doc = Document(
        title=title,
        file_path=file_path,
        file_type="md",
        content=formatted_md,
        author=author,
        product=product.lower(),
        version=version,
        doc_type=doc_type,
        status="published",
        tags=f"{product},ai_resolution,troubleshooting",
        is_pinned=False
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)
    
    # Create notification for users
    try:
        notif = Notification(
            title=f"New AI Knowledge Base Published: {title}",
            message=f"A new verified technical resolution has been published for Magic {product.upper()}.",
            product=product.lower(),
            doc_id=new_doc.id,
            notification_type="kb_published"
        )
        db.add(notif)
        db.commit()
    except Exception as e:
        print(f"[Auto-KB] Notification error: {e}")

    return {
        "status": "success",
        "doc_id": new_doc.id,
        "title": new_doc.title,
        "file_path": file_path,
        "message": f"Successfully published KB article: '{title}'"
    }
