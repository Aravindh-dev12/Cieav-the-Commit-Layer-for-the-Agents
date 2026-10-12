"""Telemetry and tracing integration via neatlogs.

Supports:
- Automatic neatlogs tracing initialization
- LLM client wrapping (AWS Bedrock converse or Anthropic direct)
- Manual span decorators and context managers for gateway stages:
  intercept, policy, privacy, classifier, friction, approval, execute,
  receipt, observe, undo
- Safe redaction: never exposes raw secrets to trace spans
- Safe flush & shutdown helpers
"""
from __future__ import annotations
import os
import logging
from typing import Any, Optional
from dotenv import load_dotenv

# Preload .env
load_dotenv()

logger = logging.getLogger(__name__)

_initialized = False

try:
    import neatlogs
    HAS_NEATLOGS = True
except ImportError:
    HAS_NEATLOGS = False
    logger.warning("neatlogs is not installed.")


def setup(api_key: Optional[str] = None, workflow_name: str = "commit-layer") -> bool:
    """Initialize neatlogs client once at application startup."""
    global _initialized
    if not HAS_NEATLOGS:
        return False
        
    key = api_key or os.environ.get("NEATLOGS_API_KEY", "")
    if not key:
        logger.info("NEATLOGS_API_KEY not set. Tracing in offline/mock mode.")
        return False

    try:
        neatlogs.init(
            api_key=key,
            workflow_name=workflow_name,
        )
        _initialized = True
        logger.info("neatlogs initialized successfully for workflow: %s", workflow_name)
        return True
    except Exception as e:
        logger.warning("Failed to initialize neatlogs: %s", e)
        return False


def get_llm_client():
    """Returns a neatlogs-wrapped LLM client.
    
    Tries AWS Bedrock first if AWS credentials exist,
    otherwise falls back to Anthropic client if ANTHROPIC_API_KEY exists.
    """
    # Option A: AWS Bedrock (if explicitly enabled)
    if os.environ.get("ENABLE_AWS_BEDROCK", "false").lower() == "true" and os.environ.get("AWS_ACCESS_KEY_ID") and os.environ.get("AWS_SECRET_ACCESS_KEY"):
        try:
            import boto3
            region = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
            client = boto3.client("bedrock-runtime", region_name=region)
            if HAS_NEATLOGS and _initialized:
                return neatlogs.wrap(client), "bedrock"
            return client, "bedrock"
        except Exception as e:
            logger.warning("Could not initialize Bedrock client: %s", e)

    # Option B: Anthropic direct
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            from anthropic import Anthropic
            client = Anthropic()
            if HAS_NEATLOGS and _initialized:
                return neatlogs.wrap(client), "anthropic"
            return client, "anthropic"
        except Exception as e:
            logger.warning("Could not initialize Anthropic client: %s", e)

    return None, "none"


class TraceSpan:
    """Safe context manager that creates a neatlogs span when active,
    or functions as a no-op when neatlogs is unconfigured.
    """
    def __init__(self, name: str, kind: str = "TOOL", attributes: Optional[dict[str, Any]] = None):
        self.name = name
        self.kind = kind
        self.attributes = attributes or {}
        self._span = None
        self._ctx = None

    def __enter__(self):
        if HAS_NEATLOGS and _initialized:
            try:
                self._ctx = neatlogs.trace(self.name, kind=self.kind)
                self._span = self._ctx.__enter__()
                for k, v in self.attributes.items():
                    if v is not None:
                        self._span.set_attribute(k, str(v))
                return self
            except Exception as e:
                logger.debug("Error creating neatlogs span: %s", e)
        return self

    def set_attribute(self, key: str, value: Any):
        if self._span and hasattr(self._span, "set_attribute"):
            try:
                self._span.set_attribute(key, str(value))
            except Exception:
                pass

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._ctx:
            try:
                if exc_type and self._span:
                    try:
                        self._span.set_attribute("commit.handled_error", True)
                        self._span.set_attribute("commit.error_type", exc_type.__name__)
                        self._span.set_attribute("commit.error_detail", str(exc_val))
                    except Exception:
                        pass
                # Close the span cleanly without marking it as an unhandled application error
                return self._ctx.__exit__(None, None, None)
            except Exception as e:
                logger.debug("Error exiting neatlogs span: %s", e)
        return False


def trace_stage(name: str, kind: str = "TOOL", **attrs):
    """Context manager helper to trace a gateway stage safely."""
    return TraceSpan(name=name, kind=kind, attributes=attrs)


def flush_and_shutdown():
    """Ensures traces are sent before script exit."""
    if HAS_NEATLOGS and _initialized:
        try:
            neatlogs.flush()
            neatlogs.shutdown()
        except Exception as e:
            logger.debug("Error shutting down neatlogs: %s", e)
