"""Outcome verification per tool."""
from __future__ import annotations
import logging
import threading
from typing import Any

from commit_layer.models import Action, Outcome
from commit_layer.tools.base import BaseTool

logger = logging.getLogger(__name__)

def verify(action: Action, tool: BaseTool, before_state: dict[str, Any], after_state: dict[str, Any]) -> Outcome:
    """
    Verify the outcome of an action using the tool's observe method.
    Returns Outcome.OBSERVED_SUCCESS, OBSERVED_FAILURE, or UNKNOWN.
    If observe raises an exception or times out, returns UNKNOWN.
    Store only generic evidence (no secrets).
    """
    timeout = 5.0 # seconds
    result_outcome = [Outcome.UNKNOWN]
    
    def run_observe():
        try:
            if tool.observe(before_state, after_state):
                result_outcome[0] = Outcome.OBSERVED_SUCCESS
            else:
                result_outcome[0] = Outcome.OBSERVED_FAILURE
        except Exception as e:
            logger.warning(f"Observe failed for {action.tool_name}: {e}")
            result_outcome[0] = Outcome.UNKNOWN

    thread = threading.Thread(target=run_observe)
    thread.start()
    thread.join(timeout=timeout)
    
    if thread.is_alive():
        logger.warning(f"Observe timed out for {action.tool_name}")
        return Outcome.UNKNOWN
        
    return result_outcome[0]
