from __future__ import annotations

from typing import Any


def completion_text(completion: Any) -> str:
    """Extract model text from TRL standard or conversational GRPO completions."""
    if isinstance(completion, str):
        return completion
    if isinstance(completion, dict):
        content = completion.get("content")
        if isinstance(content, str):
            return content
        raise ValueError("GRPO completion message is missing string content")
    if isinstance(completion, list):
        if not completion:
            raise ValueError("GRPO conversational completion is empty")
        # Current TRL conversational completions are lists of message dictionaries.
        # Prefer the last assistant message so multi-message rollouts cannot cause an
        # earlier tool/system message to be scored as the final CIEAV decision.
        for message in reversed(completion):
            if isinstance(message, dict) and message.get("role") == "assistant" and isinstance(message.get("content"), str):
                return message["content"]
        if len(completion) == 1 and isinstance(completion[0], dict) and isinstance(completion[0].get("content"), str):
            return completion[0]["content"]
        raise ValueError("GRPO conversational completion has no assistant content")
    raise ValueError(f"unsupported GRPO completion type: {type(completion).__name__}")
