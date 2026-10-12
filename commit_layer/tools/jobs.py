"""Autonomous Computer-Use Job Application Tool for CIEAV Commit Layer.

Enables agents to discover local resumes, match live engineering roles,
and dispatch job applications under strict Commit Layer governance with
Two-Phase Undo rollback.
"""
from __future__ import annotations
import os
import re
import json
import time
from typing import Any, Optional, Callable
from commit_layer.tools.base import BaseTool
from commit_layer.models import Outcome

# In-memory application registry in sandbox
APPLICATIONS_DISPATCHED: list[dict[str, Any]] = []


class JobApplicationTool(BaseTool):
    name = "job_application_action"
    description = "Submit candidate job application or profile data with two-phase withdrawal capability"
    has_inverse = True

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        company = args.get("company", "Target Company")
        role = args.get("role", "AI Engineer")
        candidate_name = args.get("candidate_name", "Aravindh B")
        email = args.get("email", "aravindh@cieav.local")
        resume_source = args.get("resume_source", "")

        app_id = f"app_{int(time.time() * 1000)}"
        record = {
            "app_id": app_id,
            "company": company,
            "role": role,
            "candidate_name": candidate_name,
            "email": email,
            "resume_source": resume_source,
            "status": "SUBMITTED",
            "timestamp": time.time()
        }
        APPLICATIONS_DISPATCHED.append(record)
        return {
            "status": "submitted",
            "app_id": app_id,
            "company": company,
            "role": role,
            "message": f"Successfully submitted application for {role} at {company} on behalf of {candidate_name}"
        }

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        if APPLICATIONS_DISPATCHED and APPLICATIONS_DISPATCHED[-1]["status"] == "SUBMITTED":
            return Outcome.OBSERVED_SUCCESS
        return Outcome.OBSERVED_FAILURE

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        app_id = result.get("app_id", "")
        def rollback():
            for app in APPLICATIONS_DISPATCHED:
                if app.get("app_id") == app_id:
                    app["status"] = "WITHDRAWN"
            return {"status": "withdrawn", "app_id": app_id, "message": f"Application {app_id} successfully retracted and withdrawn"}
        return rollback
