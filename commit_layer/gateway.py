"""The Commit Layer Gateway – main pipeline.

Pipeline stages:
1. intercept(tool_name, args, agent_id) -> normalized Action
2. policy.evaluate(action) -> deterministic risk safety floor
3. privacy.reduce(action) -> redact secrets, minimize evidence
4. crustdata check (optional) -> payee lookup, can raise risk
5. classifier.classify(action) -> optional LLM check, can ONLY RAISE risk
6. merge risks -> final risk = max(policy, classifier, crustdata)
7. friction.decide(risk, history) -> AUTO (LOW only), PREVIEW, PREVIEW_WITH_TYPED_CONFIRMATION
8. on approval: single-use execution token (60s TTL)
9. execute tool inside sandbox
10. write Ed25519 signed, hash-chained receipt (COMMITTED or CANCELLED)
11. observer.verify -> OBSERVED_SUCCESS, OBSERVED_FAILURE, or UNKNOWN
12. undo -> ONLY IF OBSERVED_SUCCESS AND tool defines working inverse

Telemetry:
Instrumented with neatlogs stage spans throughout each lifecycle event.
"""
from __future__ import annotations
import dataclasses
import json
import logging
from typing import Any

from commit_layer.models import Action, RiskLevel, Decision, Status, Outcome, UndoState
from commit_layer import policy
from commit_layer import privacy
from commit_layer import classifier
from commit_layer import friction
from commit_layer import tokens
from commit_layer import receipts
from commit_layer import observer
from commit_layer.tools.base import TOOL_REGISTRY
from commit_layer import sandbox
from commit_layer import crustdata
from commit_layer.telemetry import trace_stage

logger = logging.getLogger(__name__)

# Pending actions awaiting human approval
pending_actions: dict[str, Action] = {}


def _action_to_receipt_dict(action: Action) -> dict[str, Any]:
    """Convert an Action dataclass to the dict format receipts expects."""
    return {
        'id': action.id,
        'agent_id': action.agent_id,
        'tool': action.tool_name,
        'args_redacted': action.args_redacted,
        'risk': action.risk.name,
        'decision': action.decision.value,
        'result': {},
    }


def intercept(tool_name: str, args: dict[str, Any], agent_id: str = 'default-agent') -> Action:
    """Step 1: Intercept and normalize the action."""
    with trace_stage("intercept", kind="TOOL", tool=tool_name, agent=agent_id):
        action = Action(tool_name=tool_name, args=args, agent_id=agent_id)
        logger.info("Intercepted action: %s from %s", tool_name, agent_id)
        return action


def process(action: Action) -> dict[str, Any]:
    """Execute stages 2 through 7: Policy -> Privacy -> Crustdata -> Classifier -> Friction."""
    with trace_stage("gateway_process", kind="WORKFLOW", action_id=action.id, tool=action.tool_name) as wf_span:
        # Step 2: Policy Evaluation (Safety Floor)
        with trace_stage("policy_evaluation", kind="TOOL", tool=action.tool_name) as span:
            policy_risk, reasons = policy.evaluate(action)
            action.risk = policy_risk
            action.reasons = list(reasons)
            span.set_attribute("commit.policy_risk", action.risk.name)

        # Step 3: Privacy Reduction (Secret Redaction)
        with trace_stage("privacy_reduction", kind="TOOL") as span:
            action = privacy.reduce(action)
            span.set_attribute("commit.redacted_keys", list(action.args_redacted.keys()))

        # Step 4: Optional Payee Verification (Crustdata)
        if action.tool_name in ('send_payment', 'flaky_payment', 'payment'):
            payee = str(action.args.get('to', ''))
            if payee:
                with trace_stage("crustdata_lookup", kind="TOOL", payee=payee) as span:
                    lookup = crustdata.lookup_payee(payee)
                    if lookup.get("escalate_risk"):
                        if action.risk < RiskLevel.HIGH:
                            action.risk = RiskLevel.HIGH
                        action.reasons.append(f"Crustdata: {lookup.get('reason')}")
                    span.set_attribute("commit.crustdata_escalated", lookup.get("escalate_risk", False))

        # Step 4b: CFO Financial Governance & Budget Caps
        from commit_layer import cfo
        cfo_viol, cfo_risk, cfo_reason = cfo.evaluate_financial_policy(action)
        if cfo_risk is not None and cfo_risk > action.risk:
            action.risk = cfo_risk
            action.reasons.append(cfo_reason)

        # Step 5: AI Classifier (Can ONLY raise risk, never lower it)
        with trace_stage("ai_classifier", kind="TOOL") as span:
            cls_risk, cls_reason = classifier.classify(action)
            if cls_risk is not None and cls_risk > action.risk:
                action.risk = cls_risk
                action.reasons.append(cls_reason)
                span.set_attribute("commit.classifier_raised", True)
                span.set_attribute("commit.final_risk", action.risk.name)
            else:
                span.set_attribute("commit.classifier_raised", False)

        # Step 6: Friction & Cognitive Debt
        with trace_stage("friction_decision", kind="TOOL", risk=action.risk.name) as span:
            decision = friction.decide(action.risk)
            action.decision = decision
            span.set_attribute("commit.decision", decision.value)

        wf_span.set_attribute("commit.risk", action.risk.name)
        wf_span.set_attribute("commit.decision", action.decision.value)

        # Step 7: Auto-run if LOW and approved, otherwise queue pending approval
        if decision == Decision.AUTO:
            return execute_action(action, approved_by='auto')

        pending_actions[action.id] = action
        return {
            'action_id': action.id,
            'status': 'pending',
            'tool': action.tool_name,
            'args_redacted': action.args_redacted,
            'risk': action.risk.name,
            'reasons': action.reasons,
            'decision': decision.value,
            'requires_typed_confirmation': decision == Decision.PREVIEW_WITH_TYPED_CONFIRMATION,
        }


def approve(action_id: str, approved_by: str = 'human') -> dict[str, Any]:
    """Approve a pending action and execute it."""
    if action_id not in pending_actions:
        return {'error': 'Action not found or already processed'}
    
    with trace_stage("approval", kind="TOOL", action_id=action_id, approved_by=approved_by):
        action = pending_actions.pop(action_id)
        friction.record_approval()
        return execute_action(action, approved_by=approved_by)


def cancel(action_id: str, cancelled_by: str = 'human') -> dict[str, Any]:
    """Cancel a pending action and write a signed cancellation receipt."""
    if action_id not in pending_actions:
        return {'error': 'Action not found or already processed'}
        
    with trace_stage("cancel", kind="TOOL", action_id=action_id, cancelled_by=cancelled_by):
        action = pending_actions.pop(action_id)
        receipt = receipts.create_receipt(
            _action_to_receipt_dict(action),
            Status.CANCELLED.value,
            approved_by=cancelled_by,
        )
        return {
            'action_id': action.id,
            'status': 'cancelled',
            'receipt_id': receipt['id'],
        }


def execute_action(action: Action, approved_by: str = 'human') -> dict[str, Any]:
    """Execute action with single-use token, write receipt, observe, and compute undo availability."""
    with trace_stage("execution_pipeline", kind="WORKFLOW", action_id=action.id, tool=action.tool_name) as span:
        tool = TOOL_REGISTRY.get(action.tool_name)
        if not tool:
            receipt = receipts.create_receipt(
                _action_to_receipt_dict(action),
                Status.CANCELLED.value,
                approved_by=approved_by,
            )
            return {'error': f'Unknown tool: {action.tool_name}', 'receipt_id': receipt['id']}

        # Step 8: Single-use, short-lived token
        token = tokens.create_token(action.id)
        if not tokens.validate_and_consume(token, action.id):
            return {'error': 'Token validation failed'}

        # Snapshot state before execution
        before_state = sandbox.snapshot()

        try:
            with trace_stage("sandbox_execution", kind="TOOL", tool=action.tool_name):
                result = tool.execute(action.args)
        except Exception as e:
            # Handle execution failure / timeout
            rd = _action_to_receipt_dict(action)
            receipt = receipts.create_receipt(rd, Status.COMMITTED.value, approved_by=approved_by)
            outcome_val = Outcome.UNKNOWN.value if isinstance(e, TimeoutError) else Outcome.OBSERVED_FAILURE.value
            receipts.update_receipt_outcome(receipt['id'], outcome_val, UndoState.NONE.value)
            span.set_attribute("commit.outcome", outcome_val)
            return {
                'action_id': action.id,
                'status': 'committed',
                'outcome': outcome_val,
                'error': str(e),
                'receipt_id': receipt['id'],
            }

        # Step 9: Observe state transition
        after_state = sandbox.snapshot()
        with trace_stage("observer_verify", kind="TOOL", tool=action.tool_name) as obs_span:
            outcome = observer.verify(action, tool, before_state, after_state)
            obs_span.set_attribute("commit.outcome", outcome.value)

        # Step 10: Undo state evaluation
        undo_state = UndoState.NONE
        if outcome == Outcome.OBSERVED_SUCCESS and tool.has_inverse:
            undo_state = UndoState.AVAILABLE

        # Step 11: Write signed, hash-chained receipt
        rd = _action_to_receipt_dict(action)
        rd['result'] = result
        rd['_original_args'] = action.args
        with trace_stage("receipt_creation", kind="TOOL") as r_span:
            receipt = receipts.create_receipt(rd, Status.COMMITTED.value, approved_by=approved_by)
            receipts.update_receipt_outcome(receipt['id'], outcome.value, undo_state.value)
            r_span.set_attribute("commit.receipt_id", receipt['id'])

        span.set_attribute("commit.outcome", outcome.value)
        span.set_attribute("commit.undo_state", undo_state.value)

        # Headroom Context Optimization (Compress-Cache-Retrieve)
        from commit_layer.headroom import compress
        comp_summary, chunk_id, savings_pct = compress(result)

        # CFO Accounting: Record spend and unit economics
        from commit_layer import cfo
        if outcome == Outcome.OBSERVED_SUCCESS:
            amt = float(action.args.get("amount", 0.0)) if "amount" in action.args else 0.0
            if amt > 0:
                cfo.record_spend(amt)
            tokens_saved = int(savings_pct * 10)
            cfo.record_protected_action(tokens_saved=tokens_saved)

        return {
            'action_id': action.id,
            'status': 'committed',
            'outcome': outcome.value,
            'undo_state': undo_state.value,
            'result': result,
            'receipt_id': receipt['id'],
            'headroom': {
                'chunk_id': chunk_id,
                'token_savings_pct': savings_pct,
                'compressed_summary': comp_summary,
            }
        }



def undo(receipt_id: str) -> dict[str, Any]:
    """Execute undo inverse operation only if OBSERVED_SUCCESS and inverse exists."""
    with trace_stage("undo_action", kind="WORKFLOW", receipt_id=receipt_id) as span:
        receipt = receipts.get_receipt(receipt_id)
        if not receipt:
            return {'error': 'Receipt not found'}

        if receipt.get('outcome') != Outcome.OBSERVED_SUCCESS.value:
            return {'error': f"Cannot undo: outcome is {receipt.get('outcome')}, must be OBSERVED_SUCCESS"}

        if receipt.get('undo_state') != UndoState.AVAILABLE.value:
            return {'error': f"Cannot undo: undo_state is {receipt.get('undo_state')}"}

        tool = TOOL_REGISTRY.get(receipt.get('tool', ''))
        if not tool or not tool.has_inverse:
            return {'error': 'Tool has no inverse operation'}

        args_raw = receipt.get('args_redacted', '{}')
        args = json.loads(args_raw) if isinstance(args_raw, str) else args_raw
        result_raw = receipt.get('result', '{}')
        result = json.loads(result_raw) if isinstance(result_raw, str) else result_raw

        original_args = result.get('_original_args', args)
        if isinstance(original_args, str):
            original_args = json.loads(original_args)
        if 'amount' not in original_args and 'transferred' in result:
            original_args['amount'] = result['transferred']
        if 'to' not in original_args and 'to' in result:
            original_args['to'] = result['to']

        inverse_fn = tool.inverse(original_args, result)
        if inverse_fn is None:
            return {'error': 'No inverse function available'}

        try:
            with trace_stage("inverse_execution", kind="TOOL", tool=receipt.get('tool', '')):
                inverse_result = inverse_fn()
            receipts.update_receipt_outcome(receipt_id, Outcome.OBSERVED_SUCCESS.value, UndoState.UNDONE.value)
            span.set_attribute("commit.undo_status", "success")
            return {
                'receipt_id': receipt_id,
                'undo_status': 'success',
                'result': inverse_result,
            }
        except Exception as e:
            return {'error': f'Undo failed: {e}'}
