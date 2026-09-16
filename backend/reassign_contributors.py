"""
KB Document Author Re-attribution Utility
Magic Software Enterprises Knowledge Center

Usage:
  # 1. List all documents with 'Support Contributor' or unassigned author
  python backend/reassign_contributors.py --list

  # 2. Reassign a specific document ID to a user
  python backend/reassign_contributors.py --doc-id 15 --to "balaji_karagir@magicsoftware.com"

  # 3. Reassign ALL documents authored by 'Support Contributor' to a user
  python backend/reassign_contributors.py --from "Support Contributor" --to "balaji_karagir@magicsoftware.com"
"""

import sys
import os
import argparse
from datetime import datetime

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal, Document, User, EnterpriseAuditLog

def list_unassigned_documents(from_author="Support Contributor"):
    db = SessionLocal()
    try:
        query = db.query(Document)
        if from_author:
            docs = query.filter(Document.author.ilike(f"%{from_author.strip()}%")).order_by(Document.id.asc()).all()
        else:
            docs = query.order_by(Document.id.desc()).limit(30).all()
            
        print(f"\nFound {len(docs)} document(s) matching author pattern '{from_author}':")
        print("-" * 90)
        print(f"{'ID':<6} | {'Author':<25} | {'Product':<8} | {'Status':<12} | {'Title'}")
        print("-" * 90)
        for d in docs:
            print(f"{d.id:<6} | {(d.author or 'N/A'):<25} | {(d.product or 'N/A'):<8} | {(d.status or 'N/A'):<12} | {d.title[:35]}")
        print("-" * 90)
    finally:
        db.close()

def reassign_author(doc_ids=None, from_author=None, to_author=None, dry_run=False):
    if not to_author:
        print("[ERROR] Please specify --to <username_or_email> for the new author.")
        return

    db = SessionLocal()
    try:
        # Check target user
        user = db.query(User).filter(User.username.ilike(to_author.strip())).first()
        canonical_author = user.username if user else to_author.strip()
        if not user:
            print(f"[WARNING] Note: '{to_author}' is not currently in the users table. Document author will still be updated.")

        query = db.query(Document)
        if doc_ids:
            docs = query.filter(Document.id.in_(doc_ids)).all()
        elif from_author:
            docs = query.filter(Document.author.ilike(f"%{from_author.strip()}%")).all()
        else:
            print("[ERROR] Please provide either --doc-id or --from.")
            return

        if not docs:
            print("[INFO] No matching documents found to reassign.")
            return

        print(f"\nFound {len(docs)} document(s) to reassign to '{canonical_author}':")
        for d in docs:
            print(f"  - Doc #{d.id}: '{d.title}' (current: '{d.author}') -> new: '{canonical_author}'")

        if dry_run:
            print("\n[DRY RUN] No changes were committed.")
            return

        for d in docs:
            old_author = d.author
            d.author = canonical_author
            # Log audit trail
            audit = EnterpriseAuditLog(
                username="Admin (CLI Script)",
                user_role="Admin",
                ip_address="127.0.0.1",
                action_category="KB_MANAGE",
                action="REASSIGN_AUTHOR",
                details=f"CLI Script: Reassigned document #{d.id} '{d.title}' from '{old_author}' to '{canonical_author}'.",
                target_id=str(d.id),
                timestamp=datetime.utcnow()
            )
            db.add(audit)

        db.commit()
        print(f"\n[SUCCESS] Successfully reassigned {len(docs)} document(s) to '{canonical_author}'!")
        print("The contributor dashboard and leaderboard will reflect this immediately.")
    finally:
        db.close()

def main():
    parser = argparse.ArgumentParser(description="Reassign KB document authors in Knowledge Center database.")
    parser.add_argument("--list", action="store_true", help="List all documents matching from-author (default: 'Support Contributor')")
    parser.add_argument("--doc-id", type=int, nargs="+", help="One or more specific Document IDs to reassign")
    parser.add_argument("--from", dest="from_author", default="Support Contributor", help="Author name or pattern to replace (default: 'Support Contributor')")
    parser.add_argument("--to", dest="to_author", help="New username / email to assign as author")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without modifying the database")

    args = parser.parse_args()

    if args.list:
        list_unassigned_documents(args.from_author)
    elif args.to_author:
        reassign_author(doc_ids=args.doc_id, from_author=args.from_author, to_author=args.to_author, dry_run=args.dry_run)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
