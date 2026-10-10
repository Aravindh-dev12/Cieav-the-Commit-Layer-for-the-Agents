from __future__ import annotations
import enum
import dataclasses
import time
import uuid
from typing import Any, Optional

class RiskLevel(enum.IntEnum):
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4

class Decision(enum.Enum):
    AUTO = "auto"
    PREVIEW = "preview"
    PREVIEW_WITH_TYPED_CONFIRMATION = "preview_with_typed_confirmation"
    BLOCKED = "blocked"

class Status(enum.Enum):
    PENDING = "PENDING"
    COMMITTED = "COMMITTED"
    CANCELLED = "CANCELLED"

class Outcome(enum.Enum):
    PENDING = "PENDING"
    OBSERVED_SUCCESS = "OBSERVED_SUCCESS"
    OBSERVED_FAILURE = "OBSERVED_FAILURE"
    UNKNOWN = "UNKNOWN"

class UndoState(enum.Enum):
    NONE = "NONE"
    AVAILABLE = "AVAILABLE"
    UNDONE = "UNDONE"

@dataclasses.dataclass
class Action:
    id: str = dataclasses.field(default_factory=lambda: str(uuid.uuid4()))
    tool_name: str = ""
    args: dict[str, Any] = dataclasses.field(default_factory=dict)
    agent_id: str = "default-agent"
    timestamp: float = dataclasses.field(default_factory=time.time)
    risk: RiskLevel = RiskLevel.LOW
    reasons: list[str] = dataclasses.field(default_factory=list)
    decision: Decision = Decision.PREVIEW
    args_redacted: dict[str, Any] = dataclasses.field(default_factory=dict)

@dataclasses.dataclass  
class Receipt:
    id: str = dataclasses.field(default_factory=lambda: str(uuid.uuid4()))
    prev_hash: str = ""
    timestamp: float = dataclasses.field(default_factory=time.time)
    agent_id: str = "default-agent"
    tool: str = ""
    args_redacted: dict[str, Any] = dataclasses.field(default_factory=dict)
    risk: str = "LOW"
    decision: str = "PREVIEW"
    approved_by: str = ""
    status: str = "PENDING"
    outcome: str = "PENDING"
    undo_state: str = "NONE"
    signature: str = ""
    key_id: str = ""
    result: dict[str, Any] = dataclasses.field(default_factory=dict)
