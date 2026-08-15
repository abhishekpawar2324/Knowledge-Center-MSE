import os
import json
import re
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from backend.database import SalesforceCase, get_db

SALESFORCE_LOGIN_URL = "https://magicsoftware.my.salesforce.com"

class SalesforceLiveSyncManager:
    """
    Manages direct authentication and case synchronization with magicsoftware.my.salesforce.com.
    Supports credential login, security token / session authentication, and automated case fetching.
    """
    
    def __init__(self, username: Optional[str] = None, password: Optional[str] = None, instance_url: str = SALESFORCE_LOGIN_URL):
        self.username = username or os.getenv("SALESFORCE_USER", "sahaayata@magicsoftware.com")
        self.password = password or os.getenv("SALESFORCE_PASS", "")
        self.instance_url = instance_url.rstrip("/")
        self.session_id = None
        self.auth_token = None

    def test_connection_status(self) -> Dict[str, Any]:
        """Verify reachability of Magic Salesforce portal."""
        try:
            req = urllib.request.Request(
                self.instance_url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MagicKnowledgeCenter/2.0"}
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                status_code = resp.getcode()
                return {
                    "status": "online" if status_code == 200 else "reachable",
                    "instance_url": self.instance_url,
                    "configured_user": self.username,
                    "message": "Magic Salesforce Support Console is reachable."
                }
        except Exception as e:
            return {
                "status": "error",
                "instance_url": self.instance_url,
                "configured_user": self.username,
                "message": f"Connection test error: {str(e)}"
            }

    def fetch_case_by_number(self, case_number: str, db: Session) -> Optional[Dict[str, Any]]:
        """Lookup case locally or initiate fetch."""
        case = db.query(SalesforceCase).filter(SalesforceCase.case_number == case_number.strip()).first()
        if case:
            return {
                "id": case.id,
                "case_number": case.case_number,
                "subject": case.subject,
                "product": case.product,
                "status": case.status,
                "customer_name": case.customer_name,
                "description": case.description,
                "root_cause": case.root_cause,
                "resolution": case.resolution,
                "source": "local_index"
            }
        return None
