import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

# Default Super Admin Email
SUPER_ADMIN_EMAIL = os.getenv("SUPER_ADMIN_EMAIL", "abhishek_pawar@magicsoftware.com")
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply-knowledgecenter@magicsoftware.com")

def send_superadmin_alert(subject: str, html_body: str, recipient: str = SUPER_ADMIN_EMAIL):
    """
    Dispatches formatted email alerts to Super Admin.
    Falls back gracefully to structured system audit log if external SMTP relay is not configured.
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n[SUPER ADMIN EMAIL NOTIFICATION - {timestamp}]")
    print(f"To: {recipient}")
    print(f"Subject: {subject}")
    print("=" * 60)
    
    # If SMTP server credentials are provided in environment
    if SMTP_HOST and SMTP_USER:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = FROM_EMAIL
            msg["To"] = recipient
            msg.attach(MIMEText(html_body, "html"))
            
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(FROM_EMAIL, recipient, msg.as_string())
            print(f"[OK] Email successfully delivered via SMTP to {recipient}")
            return True
        except Exception as e:
            print(f"[WARN] Failed to dispatch email via SMTP: {e}")
            return False
    else:
        print(f"[INFO] [SMTP Relay Simulated] In-app notification and email payload generated for {recipient}")
        return True

def notify_document_uploaded(doc_title: str, product_space: str, author: str, file_type: str):
    subject = f"[Magic Knowledge Center] New Document Uploaded: {doc_title}"
    body = f"""
    <div style="font-family:Arial,sans-serif; max-width:600px; padding:20px; border:1px solid #008DC7; border-radius:10px; background:#0f172a; color:#f8fafc;">
        <h2 style="color:#38bdf8; margin-top:0;">Magic Knowledge Center Alert</h2>
        <p>A new document has been uploaded and submitted for ingestion:</p>
        <table style="width:100%; border-collapse:collapse; margin:16px 0; color:#e2e8f0;">
            <tr><td style="padding:6px; color:#94a3b8;"><strong>Document:</strong></td><td style="padding:6px;">{doc_title}</td></tr>
            <tr><td style="padding:6px; color:#94a3b8;"><strong>Product Space:</strong></td><td style="padding:6px; color:#fbbf24; text-transform:uppercase;">{product_space}</td></tr>
            <tr><td style="padding:6px; color:#94a3b8;"><strong>Uploaded By:</strong></td><td style="padding:6px;">{author}</td></tr>
            <tr><td style="padding:6px; color:#94a3b8;"><strong>Format:</strong></td><td style="padding:6px; text-transform:uppercase;">{file_type}</td></tr>
        </table>
        <p style="font-size:0.85rem; color:#94a3b8;">You can manage, reassign product space, or re-index this document from your Super Admin Suite.</p>
        <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1);" />
        <p style="font-size:0.75rem; color:#64748b;">Magic Software Enterprises Knowledge Center • Super Admin: Abhishek Pawar</p>
    </div>
    """
    return send_superadmin_alert(subject, body)



def notify_new_comment(doc_title: str, username: str, comment_text: str):
    subject = f"[Magic Knowledge Center] User Feedback on: {doc_title}"
    body = f"""
    <div style="font-family:Arial,sans-serif; max-width:600px; padding:20px; border:1px solid #008DC7; border-radius:10px; background:#0f172a; color:#f8fafc;">
        <h2 style="color:#38bdf8; margin-top:0;">New Technical Discussion / Comment</h2>
        <p>A user submitted feedback on a knowledge document:</p>
        <div style="background:rgba(255,255,255,0.05); padding:12px; border-radius:8px; margin:12px 0;">
            <p style="margin:0; font-weight:bold; color:#38bdf8;">{username}:</p>
            <p style="margin:6px 0 0 0; color:#e2e8f0;">"{comment_text}"</p>
        </div>
        <p style="font-size:0.85rem; color:#94a3b8;">Article: <strong>{doc_title}</strong></p>
    </div>
    """
    return send_superadmin_alert(subject, body)
