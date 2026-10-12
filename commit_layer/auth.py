"""SQL-Backed Authentication & Session Management.

Uses the local SQLite database (commit_layer.db) to manage users,
passwords (salted SHA-256), and active authentication sessions.
"""
from __future__ import annotations
import os
import sqlite3
import hashlib
import secrets
import time
import uuid
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

PACKAGE_DIR = os.path.dirname(os.path.abspath(__file__))

def _resolve_safe_auth_db() -> str:
    env_p = os.environ.get("COMMIT_LAYER_DB")
    if env_p:
        return os.path.abspath(env_p)
    try:
        os.makedirs(PACKAGE_DIR, exist_ok=True)
        test_file = os.path.join(PACKAGE_DIR, ".write_test_auth")
        with open(test_file, "w") as f:
            f.write("ok")
        os.remove(test_file)
        return os.path.join(PACKAGE_DIR, "commit_layer.db")
    except (PermissionError, OSError):
        user_dir = os.path.join(os.path.expanduser("~"), ".cieav")
        os.makedirs(user_dir, exist_ok=True)
        return os.path.join(user_dir, "commit_layer.db")

DB_PATH = _resolve_safe_auth_db()


def _hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return f"{salt}:{hashed}", salt


def _verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, _ = stored_hash.split(":", 1)
        expected, _ = _hash_password(password, salt)
        return secrets.compare_digest(stored_hash, expected)
    except Exception:
        return False


def init_auth_db() -> None:
    """Initialize the users and sessions tables in SQLite."""
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'operator',
                created_at REAL NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS auth_sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                email TEXT NOT NULL,
                role TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        conn.commit()

        # Seed default admin user if table empty
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM users")
        count = cur.fetchone()[0]
        if count == 0:
            pw_hash, _ = _hash_password("admin123")
            cur.execute("""
                INSERT INTO users (id, email, password_hash, role, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (str(uuid.uuid4()), "admin@cieav.local", pw_hash, "admin", time.time()))
            conn.commit()
            logger.info("Seeded default admin user in SQLite (admin@cieav.local)")


def authenticate_or_register(email: str, password: str) -> dict[str, Any]:
    """Authenticates existing user or automatically registers new user in SQLite.
    
    Returns session dict with user info and token.
    """
    init_auth_db()
    email_clean = email.strip().lower()
    now = time.time()

    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, email, password_hash, role FROM users WHERE email = ?", (email_clean,))
        row = cur.fetchone()

        if row:
            user_id, u_email, p_hash, role = row
            if not _verify_password(password, p_hash):
                # If password mismatch for existing user, return error
                return {"error": "Invalid password for existing user."}
        else:
            # New user registration
            user_id = str(uuid.uuid4())
            p_hash, _ = _hash_password(password)
            role = "admin" if "admin" in email_clean else "operator"
            cur.execute("""
                INSERT INTO users (id, email, password_hash, role, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (user_id, email_clean, p_hash, role, now))
            conn.commit()

        # Create session (valid 24h)
        token = secrets.token_urlsafe(32)
        expires_at = now + 86400.0
        cur.execute("""
            INSERT INTO auth_sessions (token, user_id, email, role, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (token, user_id, email_clean, role, now, expires_at))
        conn.commit()

        return {
            "token": token,
            "user": {
                "id": user_id,
                "email": email_clean,
                "role": role,
                "created_at": now
            },
            "expires_at": expires_at
        }


def verify_session(token: str) -> Optional[dict[str, Any]]:
    """Verifies active session in SQLite."""
    if not token:
        return None
    init_auth_db()
    now = time.time()
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT user_id, email, role, expires_at FROM auth_sessions
            WHERE token = ? AND expires_at > ?
        """, (token, now))
        row = cur.fetchone()
        if not row:
            return None
        return {
            "user_id": row[0],
            "email": row[1],
            "role": row[2],
            "expires_at": row[3]
        }


def terminate_session(token: str) -> bool:
    """Invalidates active session from SQLite."""
    if not token:
        return False
    init_auth_db()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("DELETE FROM auth_sessions WHERE token = ?", (token,))
        conn.commit()
    return True


def get_all_users() -> list[dict[str, Any]]:
    """Lists registered users from SQLite."""
    init_auth_db()
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, email, role, created_at FROM users ORDER BY created_at ASC")
        return [
            {"id": row[0], "email": row[1], "role": row[2], "created_at": row[3]}
            for row in cur.fetchall()
        ]
