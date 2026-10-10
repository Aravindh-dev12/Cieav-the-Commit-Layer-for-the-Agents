import secrets
import time
from typing import Dict, Tuple

# Dictionary mapping token to (action_id, creation_time)
_TOKENS: Dict[str, Tuple[str, float]] = {}
TOKEN_TTL = 60  # seconds

def create_token(action_id: str) -> str:
    """Creates a single-use token valid for 60 seconds for the given action_id."""
    token = secrets.token_urlsafe(32)
    _TOKENS[token] = (action_id, time.time())
    return token

def validate_and_consume(token: str, action_id: str) -> bool:
    """Validates that a token is unused, valid for the action_id, and unexpired. Consumes it."""
    if token not in _TOKENS:
        return False
        
    stored_action_id, creation_time = _TOKENS.pop(token)
    
    if stored_action_id != action_id:
        return False
        
    if time.time() - creation_time > TOKEN_TTL:
        return False
        
    return True
