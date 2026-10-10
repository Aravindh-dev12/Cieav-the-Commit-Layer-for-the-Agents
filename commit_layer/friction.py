"""Cognitive debt tracking and friction level decisions."""
from __future__ import annotations
import time
from collections import defaultdict
from commit_layer.models import RiskLevel, Decision

# History of approvals: user_id -> list of timestamps
_approval_history: dict[str, list[float]] = defaultdict(list)

def record_approval(user_id: str = 'default') -> None:
    """Record a user approval to track cognitive debt."""
    _approval_history[user_id].append(time.time())

def get_cognitive_debt(user_id: str = 'default') -> float:
    """
    Calculate cognitive debt based on approvals in the last 60 seconds.
    Returns 0.0 to 1.0. If >= 3 approvals in 60s, returns 1.0.
    """
    now = time.time()
    history = _approval_history[user_id]
    
    # Prune old entries (older than 60s)
    history = [t for t in history if now - t <= 60]
    _approval_history[user_id] = history
    
    if len(history) >= 3:
        return 1.0
    return len(history) / 3.0

def decide(risk: RiskLevel, user_id: str = 'default') -> Decision:
    """
    Decide the required friction based on risk and cognitive debt.
    HIGH and CRITICAL risk never become AUTO.
    """
    debt = get_cognitive_debt(user_id)
    has_debt = debt >= 1.0
    
    if risk == RiskLevel.LOW:
        if has_debt:
            return Decision.PREVIEW
        return Decision.AUTO
    elif risk == RiskLevel.MEDIUM:
        return Decision.PREVIEW
    elif risk in (RiskLevel.HIGH, RiskLevel.CRITICAL):
        return Decision.PREVIEW_WITH_TYPED_CONFIRMATION
        
    # Fail safe
    return Decision.PREVIEW_WITH_TYPED_CONFIRMATION
