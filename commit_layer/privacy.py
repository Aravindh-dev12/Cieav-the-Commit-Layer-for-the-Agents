import re
from typing import Any
from commit_layer.models import Action

# Card numbers: 13-19 digit sequence, optionally separated by spaces or hyphens
CARD_REGEX = re.compile(r'\b(?:\d{4}[ -]?){3}\d{1,7}\b|\b\d{13,19}\b')

# Standard email regex
EMAIL_REGEX = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')

def redact_text(text: str) -> str:
    """Redacts credit card numbers, emails, and sensitive credential tokens from text."""
    text = CARD_REGEX.sub("[CARD_REDACTED]", text)
    text = EMAIL_REGEX.sub("[EMAIL_REDACTED]", text)
    # Redact passwords, secrets, tokens, api keys
    text = re.sub(r'(?i)\b(password|passwd|secret|token|api_key|bearer)\s*[:=]?\s*([A-Za-z0-9_\-]+)', r'\1 [REDACTED]', text)
    text = re.sub(r'(?i)\b(pass(?:word)?\s+is\s+)([A-Za-z0-9_\-]+)', r'\1[REDACTED]', text)
    text = re.sub(r'(?i)\bsecret_[a-z0-9_]+', '[REDACTED]', text)
    return text

def redact_value(key: str, value: Any) -> Any:
    """Redacts sensitive values based on key names, and strings recursively."""
    key_lower = key.lower()
    
    # Redact passwords, secrets, tokens, keys completely
    if any(k in key_lower for k in ['pass', 'secret', 'token', 'key']):
        return "[REDACTED]"
    
    # Redact card numbers and financial credentials by key (avoid false positive in 'company')
    if key_lower == 'pan' or any(k in key_lower for k in ['card', 'cvv', 'cvc', 'pan_number', 'pan_num']):
        return "[CARD_REDACTED]"
    
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
