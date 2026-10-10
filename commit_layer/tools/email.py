"""Email tool – send_email with NO inverse."""
from __future__ import annotations
from typing import Any, Optional, Callable

from commit_layer.tools.base import BaseTool
from commit_layer.models import Outcome
from commit_layer import sandbox


class SendEmailTool(BaseTool):
    name = 'send_email'
    description = 'Send an email (no undo possible)'
    has_inverse = False

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        email_data = {
            'to': args.get('to', ''),
            'subject': args.get('subject', ''),
            'body': args.get('body', ''),
        }
        sandbox.email_outbox.append(email_data)
        return {'sent': True, 'to': email_data['to']}

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        before_count = len(before.get('email_outbox', []))
        after_count = len(after.get('email_outbox', []))
        if after_count > before_count:
            return Outcome.OBSERVED_SUCCESS
        return Outcome.OBSERVED_FAILURE

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        return None  # Emails cannot be recalled
