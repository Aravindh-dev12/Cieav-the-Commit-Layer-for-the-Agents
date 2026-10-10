"""Base class for all sandbox tools."""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any, Optional, Callable
from commit_layer.models import Outcome

TOOL_REGISTRY: dict[str, 'BaseTool'] = {}


class BaseTool(ABC):
    name: str = ''
    description: str = ''
    has_inverse: bool = False

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        if hasattr(cls, 'name') and cls.name:
            TOOL_REGISTRY[cls.name] = cls()

    @abstractmethod
    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        """Execute the tool action. Returns result dict."""
        ...

    @abstractmethod
    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        """Compare state before and after to determine outcome."""
        ...

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        """Return a callable that undoes this action, or None."""
        return None
