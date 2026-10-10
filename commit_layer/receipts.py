import sqlite3
import json
import hashlib
import os
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives import serialization


DB_PATH = os.environ.get("COMMIT_LAYER_DB", "commit_layer/commit_layer.db")
KEY_PATH = os.environ.get("COMMIT_LAYER_KEY", "commit_layer/signing_key.pem")


def init_db() -> None:
    """Initialize the receipts SQLite database and create the table if it does not exist."""
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        # Use rowid for ordering, allowing duplicate ids for append-only updates
        conn.execute("""
            CREATE TABLE IF NOT EXISTS receipts (
                rowid INTEGER PRIMARY KEY AUTOINCREMENT,
                id TEXT,
                prev_hash TEXT,
                timestamp REAL,
                agent_id TEXT,
                tool TEXT,
                args_redacted TEXT,
                risk TEXT,
                decision TEXT,
                approved_by TEXT,
                status TEXT,
                outcome TEXT,
                undo_state TEXT,
                signature TEXT,
                key_id TEXT,
                result TEXT
            )
        """)
        conn.commit()


def get_signing_key() -> Tuple[Ed25519PrivateKey, Ed25519PublicKey, str]:
    """
    Load the Ed25519 signing key from KEY_PATH or generate a new one if it doesn't exist.
    Returns: (private_key, public_key, key_id)
    """
    os.makedirs(os.path.dirname(os.path.abspath(KEY_PATH)), exist_ok=True)
    
    if os.path.exists(KEY_PATH):
        with open(KEY_PATH, "rb") as f:
            private_key = serialization.load_pem_private_key(
                f.read(),
                password=None
            )
            if not isinstance(private_key, Ed25519PrivateKey):
                raise ValueError("Key is not an Ed25519 private key")
    else:
        private_key = Ed25519PrivateKey.generate()
        with open(KEY_PATH, "wb") as f:
            f.write(private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            ))
            
    public_key = private_key.public_key()
    pub_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw
    )
    key_id = pub_bytes.hex()[:8]
    
    return private_key, public_key, key_id


def _canonical_json(data: Dict[str, Any]) -> bytes:
    """Return the canonical JSON byte representation of a receipt dictionary."""
    d = data.copy()
    d.pop("signature", None)
    d.pop("rowid", None)
    return json.dumps(d, sort_keys=True, separators=(',', ':')).encode('utf-8')


def compute_hash(receipt_dict: Dict[str, Any]) -> str:
    """Compute the SHA256 hash of a receipt's canonical JSON."""
    return hashlib.sha256(_canonical_json(receipt_dict)).hexdigest()


def get_last_hash() -> str:
    """Get the hash of the last receipt in the chain, or 'GENESIS' if empty."""
    init_db()
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM receipts ORDER BY rowid DESC LIMIT 1")
        row = cur.fetchone()
        if row:
            receipt = dict(row)
            return compute_hash(receipt)
        return "GENESIS"


def _sign_receipt(receipt_dict: Dict[str, Any]) -> str:
    """Sign a receipt dictionary and return the hex signature."""
    private_key, _, key_id = get_signing_key()
    receipt_dict["key_id"] = key_id
    canonical = _canonical_json(receipt_dict)
    signature = private_key.sign(canonical)
    return signature.hex()


def verify_signature(receipt_dict: Dict[str, Any]) -> bool:
    """Verify the signature of a receipt dictionary."""
    try:
        # In a real system we would look up the public key by key_id
        # For now we verify against our local key pair
        _, public_key, key_id = get_signing_key()
        if receipt_dict.get("key_id") != key_id:
            return False
            
        signature_hex = receipt_dict.get("signature")
        if not signature_hex:
            return False
            
        canonical = _canonical_json(receipt_dict)
        public_key.verify(bytes.fromhex(signature_hex), canonical)
        return True
    except Exception:
        return False


def create_receipt(action: Dict[str, Any], status: str, approved_by: str = '') -> Dict[str, Any]:
    """Create a new receipt and append it to the ledger."""
    prev_hash = get_last_hash()
    receipt_id = action.get("id", str(uuid.uuid4()))
    
    receipt = {
        "id": receipt_id,
        "prev_hash": prev_hash,
        "timestamp": time.time(),
        "agent_id": action.get("agent_id", ""),
        "tool": action.get("tool", ""),
        "args_redacted": json.dumps(action.get("args_redacted", {})),
        "risk": action.get("risk", "UNKNOWN"),
        "decision": action.get("decision", ""),
        "approved_by": approved_by,
        "status": status,
        "outcome": "UNKNOWN",
        "undo_state": "",
        "result": json.dumps(action.get("result", {})),
    }
    
    # Generate signature
    receipt["signature"] = _sign_receipt(receipt)
    
    # Store to append-only ledger
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            INSERT INTO receipts (
                id, prev_hash, timestamp, agent_id, tool, args_redacted,
                risk, decision, approved_by, status, outcome, undo_state,
                signature, key_id, result
            ) VALUES (
                :id, :prev_hash, :timestamp, :agent_id, :tool, :args_redacted,
                :risk, :decision, :approved_by, :status, :outcome, :undo_state,
                :signature, :key_id, :result
            )
        """, receipt)
        conn.commit()
        
    return receipt


def get_receipt(receipt_id: str) -> Optional[Dict[str, Any]]:
    """Get the latest state of a receipt by its ID."""
    init_db()
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM receipts WHERE id = ? ORDER BY rowid DESC LIMIT 1", (receipt_id,))
        row = cur.fetchone()
        if row:
            return dict(row)
        return None


def update_receipt_outcome(receipt_id: str, outcome: str, undo_state: str) -> Optional[Dict[str, Any]]:
    """Append a new receipt entry updating the outcome of an existing receipt."""
    receipt = get_receipt(receipt_id)
    if not receipt:
        return None
        
    # Build updated entry
    new_receipt = receipt.copy()
    new_receipt.pop("rowid", None)
    new_receipt["prev_hash"] = get_last_hash()
    new_receipt["timestamp"] = time.time()
    new_receipt["outcome"] = outcome
    new_receipt["undo_state"] = undo_state
    
    # Sign new entry
    new_receipt["signature"] = _sign_receipt(new_receipt)
    
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            INSERT INTO receipts (
                id, prev_hash, timestamp, agent_id, tool, args_redacted,
                risk, decision, approved_by, status, outcome, undo_state,
                signature, key_id, result
            ) VALUES (
                :id, :prev_hash, :timestamp, :agent_id, :tool, :args_redacted,
                :risk, :decision, :approved_by, :status, :outcome, :undo_state,
                :signature, :key_id, :result
            )
        """, new_receipt)
        conn.commit()
        
    return new_receipt


def get_all_receipts() -> List[Dict[str, Any]]:
    """Return all receipt entries in chronological order."""
    init_db()
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM receipts ORDER BY rowid ASC")
        return [dict(row) for row in cur.fetchall()]


def verify_chain() -> Tuple[bool, List[str]]:
    """Verify the hash chain and signatures of the entire ledger."""
    receipts = get_all_receipts()
    errors = []
    
    expected_prev = "GENESIS"
    for idx, r in enumerate(receipts):
        rowid = r.get('rowid', idx)
        
        # Verify hash link
        if r["prev_hash"] != expected_prev:
            errors.append(f"Chain broken at rowid {rowid}: expected prev_hash {expected_prev}, got {r['prev_hash']}")
            
        # Verify signature
        if not verify_signature(r):
            errors.append(f"Invalid signature at rowid {rowid}")
            
        expected_prev = compute_hash(r)
        
    return len(errors) == 0, errors
