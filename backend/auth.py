from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, ExpiredSignatureError, jwt
import hashlib
import hmac
import os
import secrets
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.database import get_db, User

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SECRET_FILE = os.path.join(_BASE_DIR, ".jwt_secret")


def _load_secret_key() -> str:
    """Signing key for session tokens.

    Taken from KC_JWT_SECRET when set; otherwise a random key is generated once
    and kept in .jwt_secret (git-ignored) so sessions survive a server restart
    but the key never lives in source control.
    """
    env_key = os.getenv("KC_JWT_SECRET", "").strip()
    if env_key:
        return env_key
    try:
        if os.path.isfile(_SECRET_FILE):
            with open(_SECRET_FILE, "r", encoding="utf-8") as f:
                key = f.read().strip()
            if len(key) >= 32:
                return key
        key = secrets.token_hex(32)
        with open(_SECRET_FILE, "w", encoding="utf-8") as f:
            f.write(key)
        return key
    except OSError:
        # Read-only install: fall back to a per-process key (users re-login after restart).
        return secrets.token_hex(32)


SECRET_KEY = _load_secret_key()
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("KC_SESSION_MINUTES", "480"))  # 8 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        salt_hex, hash_hex = hashed_password.split("$")
        salt = bytes.fromhex(salt_hex)
        db_hash = hashlib.pbkdf2_hmac('sha256', plain_password.encode('utf-8'), salt, 100000)
        return hmac.compare_digest(db_hash.hex(), hash_hex)
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = os.urandom(16)
    db_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return salt.hex() + "$" + db_hash.hex()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _clean_token(token: Optional[str]) -> Optional[str]:
    if not token or token.strip() in ("undefined", "null", ""):
        return None
    return token.strip()


def get_current_user(request: Request, token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    # Tokens are only accepted in the Authorization header. Query-string tokens
    # leak into access logs and browser history.
    token = _clean_token(token)
    if not token:
        raise _unauthorized("Authentication required. Please sign in.")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise _unauthorized("Invalid session. Please sign in again.")
    except ExpiredSignatureError:
        raise _unauthorized("Your session has expired. Please sign in again.")
    except JWTError:
        raise _unauthorized("Invalid session. Please sign in again.")

    user = db.query(User).filter(func.lower(User.username) == username.lower().strip()).first()
    if user is None:
        raise _unauthorized("Your account no longer exists. Please sign in again.")
    if getattr(user, "is_active", True) is False:
        raise _unauthorized("Your account has been suspended. Please contact your administrator.")
    return user

def get_current_user_optional(request: Request, token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Optional[User]:
    """Gracefully returns the authenticated user if token is valid, or None if guest / unauthenticated."""
    token = _clean_token(token)
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username:
            user = db.query(User).filter(func.lower(User.username) == username.lower().strip()).first()
            if user is not None and getattr(user, "is_active", True) is False:
                return None
            return user
    except Exception:
        pass
    return None

def require_role(allowed_roles: list):
    allowed = {r.lower() for r in allowed_roles}
    def dependency(current_user: User = Depends(get_current_user)):
        if (current_user.role or "").lower() not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource"
            )
        return current_user
    return dependency
