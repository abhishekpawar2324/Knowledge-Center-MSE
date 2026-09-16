"""
Comprehensive Test for Contributor Attribution & Upload Tracking
"""
import os
import sys
from datetime import datetime, timedelta
import io

# Setup path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from backend.main import app
from backend.database import SessionLocal, User, Document, EnterpriseAuditLog
from backend.auth import create_access_token, SECRET_KEY, ALGORITHM
from jose import jwt

client = TestClient(app)

def run_tests():
    db = SessionLocal()
    try:
        print("=== 1. Testing Unauthenticated /api/upload ===")
        # Attempt upload without token
        test_file = ("test_doc_unauth.txt", io.BytesIO(b"Test unauth content"), "text/plain")
        res = client.post("/api/upload", files={"files": test_file}, data={"product": "xpi", "upload_mode": "publish"})
        print(f"Status: {res.status_code}, Response: {res.json()}")
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"
        assert "Authentication required" in res.json().get("detail", "")
        print("[PASS] Unauthenticated upload correctly blocked with 401.")

        print("\n=== 2. Testing Expired Token /api/upload ===")
        expired_token = create_access_token(
            data={"sub": "abhishek_pawar@magicsoftware.com"},
            expires_delta=timedelta(minutes=-10)
        )
        test_file = ("test_doc_expired.txt", io.BytesIO(b"Test expired content"), "text/plain")
        res = client.post(
            "/api/upload",
            headers={"Authorization": f"Bearer {expired_token}"},
            files={"files": test_file},
            data={"product": "xpi", "upload_mode": "publish"}
        )
        print(f"Status: {res.status_code}, Response: {res.json()}")
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"
        assert "expired" in res.json().get("detail", "").lower()
        print("[PASS] Expired token correctly rejected with 401.")

        print("\n=== 3. Testing Valid Token /api/upload ===")
        # Get or create test user
        user = db.query(User).filter(User.username == "abhishek_pawar@magicsoftware.com").first()
        assert user is not None, "Test user abhishek_pawar@magicsoftware.com should exist"
        valid_token = create_access_token(data={"sub": user.username})
        
        test_filename = f"verify_attrib_{int(datetime.utcnow().timestamp())}.txt"
        test_file = (test_filename, io.BytesIO(b"Valid authenticated contribution test body"), "text/plain")
        res = client.post(
            "/api/upload",
            headers={"Authorization": f"Bearer {valid_token}"},
            files={"files": test_file},
            data={"product": "xpi", "upload_mode": "publish"}
        )
        print(f"Status: {res.status_code}, Response: {res.json()}")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        
        # Verify in DB
        uploaded_doc = db.query(Document).filter(Document.title.like(f"%{test_filename}%")).first()
        if not uploaded_doc:
            # Check by file_path
            uploaded_doc = db.query(Document).filter(Document.file_path.like(f"%{test_filename}%")).first()
        assert uploaded_doc is not None, "Document should be in DB"
        print(f"Uploaded Doc ID: {uploaded_doc.id}, Author: {uploaded_doc.author}")
        assert uploaded_doc.author == user.username, f"Author should be {user.username}, got {uploaded_doc.author}"

        # Verify audit log
        audit = db.query(EnterpriseAuditLog).filter(EnterpriseAuditLog.username == user.username).order_by(EnterpriseAuditLog.id.desc()).first()
        assert audit is not None, "Audit log should be recorded"
        print(f"Audit log recorded: User={audit.username}, Action={audit.action}, Details={audit.details}")
        print("[PASS] Authenticated upload correctly records author and audit trail.")

        print("\n=== 4. Testing Analytics Reconciliation ===")
        # Create an unassigned test doc with author 'Support Contributor'
        dummy_unassigned = Document(
            title=f"Test Unassigned KB {int(datetime.utcnow().timestamp())}",
            file_path=f"dummy_unassigned_{int(datetime.utcnow().timestamp())}.txt",
            file_type="txt",
            content="Dummy content for unassigned test",
            author="Support Contributor",
            product="xpi",
            is_legacy_import=False,
            status="published",
            created_at=datetime.utcnow()
        )
        db.add(dummy_unassigned)
        db.commit()
        db.refresh(dummy_unassigned)

        admin_user = db.query(User).filter(User.role == "Admin").first()
        admin_token = create_access_token(data={"sub": admin_user.username})
        
        res = client.get(
            "/api/analytics/contributor-uploads?scope=live",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        analytics = res.json()
        print(f"Total uploads in analytics: {analytics['summary']['total_uploads']}")
        contributor_names = [c["username"] for c in analytics["contributors"]]
        print(f"Contributors in leaderboard: {contributor_names}")
        assert any("Support Contributor" in c for c in contributor_names), "Support Contributor (Unassigned) should appear in leaderboard"
        
        # Verify sum of uploads matches total_uploads
        breakdown_sum = sum(c["upload_count"] for c in analytics["contributors"])
        print(f"Sum of breakdown uploads: {breakdown_sum}, Total reported uploads: {analytics['summary']['total_uploads']}")
        assert breakdown_sum == analytics["summary"]["total_uploads"], "Breakdown sum must match total uploads!"
        print("[PASS] Analytics leaderboard reconciles perfectly with total uploads.")

        print("\n=== 5. Testing Admin Reassign Endpoint ===")
        reassign_res = client.put(
            f"/api/admin/document/{dummy_unassigned.id}/author",
            headers={"Authorization": f"Bearer {admin_token}"},
            data={"new_author": "abhishek_pawar@magicsoftware.com"}
        )
        print(f"Status: {reassign_res.status_code}, Response: {reassign_res.json()}")
        assert reassign_res.status_code == 200, f"Expected 200, got {reassign_res.status_code}"
        
        db.refresh(dummy_unassigned)
        assert dummy_unassigned.author == "abhishek_pawar@magicsoftware.com", "Author should be reassigned to abhishek_pawar"
        print("[PASS] Admin single document author reassignment works.")

        # Cleanup dummy docs
        db.delete(dummy_unassigned)
        if uploaded_doc:
            db.delete(uploaded_doc)
        db.commit()
        print("\n[ALL TESTS PASSED SUCCESSFULLY!]")
    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
