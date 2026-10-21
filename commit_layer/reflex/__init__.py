"""
CIEAV Reflex Automation & Self-Repair Subsystem.
=============================================================================
Learn a task once, replay it with checks after every step, and approve anything irreversible:
- Deterministic Trace-to-Procedure Extractor with R0-R3 Risk Classes
- Checked Step Replay against Real Host Drivers (CDP, Win32, CLI)
- Autonomous Self-Repair Agent with Visible-Only Control Guarantees
- Design-Rule Checking (Lint) & Fault-Injection Pre-Deployment Simulation
- Permission-Filtered Versioned RAG with Clearance Levels (Public < Internal < Restricted)
- Directed Acyclic Graph (DAG) Pipeline Orchestration
"""

from commit_layer.reflex.db import get_db
from commit_layer.reflex.extractor import extract_procedure, RISK_MAP
from commit_layer.reflex.engine import reflex_engine, ReflexEngine
from commit_layer.reflex.assurance import (
    lint_procedure,
    simulate_procedure,
    certify_trusted,
    get_outcomes_ledger
)
from commit_layer.reflex.knowledge import reflex_kb, ReflexKnowledgeBase
from commit_layer.reflex.pipeline import reflex_pipeline, ReflexPipelineEngine

__all__ = [
    "get_db",
    "extract_procedure",
    "RISK_MAP",
    "reflex_engine",
    "ReflexEngine",
    "lint_procedure",
    "simulate_procedure",
    "certify_trusted",
    "get_outcomes_ledger",
    "reflex_kb",
    "ReflexKnowledgeBase",
    "reflex_pipeline",
    "ReflexPipelineEngine"
]
