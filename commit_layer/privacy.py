import re
from typing import Any
from commit_layer.models import Action

# Card numbers: 13-19 digit sequence
CARD_REGEX = re.compile(r'\b\d{13,19}\b')

# Standard email regex
EMAIL_REGEX = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')

def redact_text(text: str) -> str:
    """Redacts credit card numbers and emails from text."""
    text = CARD_REGEX.sub("[CARD_REDACTED]", text)
    text = EMAIL_REGEX.sub("[EMAIL_REDACTED]", text)
    return text

def redact_value(key: str, value: Any) -> Any:
    """Redacts sensitive values based on key names, and strings recursively."""
    key_lower = key.lower()
    
    # Redact passwords, secrets, tokens, keys completely
    if any(k in key_lower for k in ['pass', 'secret', 'token', 'key']):
        return "[REDACTED]"
    
    if isinstance(value, str):
        return redact_text(value)
    elif isinstance(value, dict):
        return {k: redact_value(k, v) for k, v in value.items()}
    elif isinstance(value, list):
        return [redact_value(key, v) for v in value]
        
    return value

def reduce(action: Action) -> Action:
    """Redacts the arguments of an action and updates args_redacted."""
    action.args_redacted = {k: redact_value(k, v) for k, v in action.args.items()}
    return action
