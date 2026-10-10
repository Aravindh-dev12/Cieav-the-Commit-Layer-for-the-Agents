"""Payment tools – send_payment and flaky_payment."""
from __future__ import annotations
import random
from typing import Any, Optional, Callable

from commit_layer.tools.base import BaseTool
from commit_layer.models import Outcome
from commit_layer import sandbox


class SendPaymentTool(BaseTool):
    name = 'send_payment'
    description = 'Transfer money from agent account to a target account'
    has_inverse = True

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        amount = float(args.get('amount', 0))
        to_account = args.get('to', '')
        sandbox.transfer('agent', to_account, amount)
        return {'transferred': amount, 'to': to_account}

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        before_bal = before.get('bank_ledger', {}).get('agent', 0)
        after_bal = after.get('bank_ledger', {}).get('agent', 0)
        if before_bal > after_bal:
            return Outcome.OBSERVED_SUCCESS
        return Outcome.OBSERVED_FAILURE

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        def refund():
            amount = float(args.get('amount', 0))
            to_account = args.get('to', '')
            sandbox.transfer(to_account, 'agent', amount)
            return {'refunded': amount, 'from': to_account}
        return refund


class FlakyPaymentTool(BaseTool):
    name = 'flaky_payment'
    description = 'Transfer money but randomly times out (50% chance)'
    has_inverse = True

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        if random.random() < 0.5:
            raise TimeoutError("Connection to bank timed out")
        amount = float(args.get('amount', 0))
        to_account = args.get('to', '')
        sandbox.transfer('agent', to_account, amount)
        return {'transferred': amount, 'to': to_account}

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        before_bal = before.get('bank_ledger', {}).get('agent', 0)
        after_bal = after.get('bank_ledger', {}).get('agent', 0)
        if before_bal > after_bal:
            return Outcome.OBSERVED_SUCCESS
        # Could be timeout – we don't know for sure
        return Outcome.UNKNOWN

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        def refund():
            amount = float(args.get('amount', 0))
            to_account = args.get('to', '')
            sandbox.transfer(to_account, 'agent', amount)
            return {'refunded': amount, 'from': to_account}
        return refund
