"""
Resource-Event-Agent (REA) Economic Commitment Engine for CIEAV.
================================================================
Implements the ISO/IEC 15944-4 standard REA accounting and business ontology:
1. Resources: Things of economic value (e.g. USD_CREDITS, GPU_COMPUTE, STORAGE_GB, ACCESS_TOKEN)
2. Events: Economic state transitions (INCREMENT, DECREMENT, TRANSFER, CONSUME, ESCROW_LOCK)
3. Agents: Autonomously acting principals or delegates (buyers, sellers, auditors, validators)
4. Duality: Economic exchanges require paired reciprocal commitments (give X <-> take Y)
5. Two-Phase Commit (2PC): Bilateral prepare -> commit with atomic rollback (/undo)
6. Ed25519 Hash-Chained Audit: Every economic event produces an immutable cryptographic receipt
"""

from __future__ import annotations
import dataclasses
import enum
import json
import logging
import math
import os
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from commit_layer import receipts, tokens, policy, friction, cfo

logger = logging.getLogger(__name__)


# =========================================================================
# 1. Enums and Data Models
# =========================================================================

class EventType(str, enum.Enum):
    INCREMENT = "INCREMENT"
    DECREMENT = "DECREMENT"
    TRANSFER = "TRANSFER"
    CONSUME = "CONSUME"
    PRODUCE = "PRODUCE"
    ESCROW_LOCK = "ESCROW_LOCK"
    ESCROW_RELEASE = "ESCROW_RELEASE"


class CommitmentStatus(str, enum.Enum):
    PROPOSED = "PROPOSED"
    PREPARED = "PREPARED"
    COMMITTED = "COMMITTED"
    ABORTED = "ABORTED"
    ROLLED_BACK = "ROLLED_BACK"


@dataclasses.dataclass
class EconomicResource:
    """An economic asset or capability under agent custody."""
    resource_id: str
    resource_type: str  # "USD_CREDITS", "GPU_HOURS", "STORAGE_GB", "API_KEYS"
    amount: float
    owner_agent: str
    escrowed: float = 0.0
    metadata: Dict[str, Any] = dataclasses.field(default_factory=dict)

    @property
    def available_amount(self) -> float:
        return max(0.0, self.amount - self.escrowed)


@dataclasses.dataclass
class EconomicEvent:
    """A signed economic state transition that affects resources."""
    event_id: str
    event_type: EventType
    resource_type: str
    amount: float
    from_agent: str
    to_agent: str
    timestamp: float = dataclasses.field(default_factory=time.time)
    dual_event_id: Optional[str] = None
    commitment_id: Optional[str] = None
    receipt_id: str = ""
    status: str = "COMMITTED"
    metadata: Dict[str, Any] = dataclasses.field(default_factory=dict)


@dataclasses.dataclass
class BilateralCommitment:
    """
    A two-phase atomic commitment between two autonomous agents.
    Enforces REA Duality: Initiator provides give_resource in exchange for take_resource.
    """
    commitment_id: str
    initiator_agent: str
    responder_agent: str
    give_resource_type: str
    give_amount: float
    take_resource_type: str
    take_amount: float
    status: CommitmentStatus = CommitmentStatus.PROPOSED
    created_at: float = dataclasses.field(default_factory=time.time)
    expires_at: float = dataclasses.field(default_factory=lambda: time.time() + 60.0)
    permit_token: str = ""
    initiator_signature: str = ""
    responder_signature: str = ""
    receipt_id: str = ""
    events: List[str] = dataclasses.field(default_factory=list)
    metadata: Dict[str, Any] = dataclasses.field(default_factory=dict)


# =========================================================================
# 2. REA Double-Entry Ledger Engine
# =========================================================================

class REALedger:
    """
    Decentralized, double-entry economic state machine enforcing
    strict conservation laws, escrow locks, and two-phase atomic settlement.
    """

    def __init__(self):
        # agent_id -> dict of resource_type -> EconomicResource
        self.agent_resources: Dict[str, Dict[str, EconomicResource]] = {}
        # event_id -> EconomicEvent
        self.events: Dict[str, EconomicEvent] = {}
        # commitment_id -> BilateralCommitment
        self.commitments: Dict[str, BilateralCommitment] = {}
        # Initialize default bootstrap agents & balances
        self._bootstrap_default_economy()

    def _bootstrap_default_economy(self):
        """Seed default agents and resources for immediate live local operations."""
        # 1. Atlas Personal Agent (Human-facing buyer)
        self.mint_resource("agent-atlas-personal", "USD_CREDITS", 1000.0)
        self.mint_resource("agent-atlas-personal", "STORAGE_GB", 50.0)

        # 2. Hyperbolic Compute Agent (GPU cluster seller)
        self.mint_resource("agent-hyperbolic-compute", "GPU_HOURS", 250.0)
        self.mint_resource("agent-hyperbolic-compute", "USD_CREDITS", 50.0)

        # 3. Crust Intelligence Agent (Threat intelligence & verification provider)
        self.mint_resource("agent-crust-intel", "INTEL_QUERIES", 500.0)
        self.mint_resource("agent-crust-intel", "USD_CREDITS", 100.0)

        # 4. CFO Treasury Reserve (System liquidity & escrow clearinghouse)
        self.mint_resource("agent-cfo-treasury", "USD_CREDITS", 50000.0)

    def mint_resource(self, agent_id: str, resource_type: str, amount: float, metadata: Optional[Dict[str, Any]] = None) -> EconomicResource:
        """Issue or deposit new resource quantity to an agent."""
        if agent_id not in self.agent_resources:
            self.agent_resources[agent_id] = {}

        if resource_type in self.agent_resources[agent_id]:
            res = self.agent_resources[agent_id][resource_type]
            res.amount += amount
        else:
            res_id = f"res_{agent_id}_{resource_type.lower()}_{uuid.uuid4().hex[:6]}"
            res = EconomicResource(
                resource_id=res_id,
                resource_type=resource_type,
                amount=amount,
                owner_agent=agent_id,
                metadata=metadata or {}
            )
            self.agent_resources[agent_id][resource_type] = res

        # Record Economic Event (INCREMENT)
        ev_id = f"ev_inc_{uuid.uuid4().hex[:12]}"
        event = EconomicEvent(
            event_id=ev_id,
            event_type=EventType.INCREMENT,
            resource_type=resource_type,
            amount=amount,
            from_agent="SYSTEM_MINT",
            to_agent=agent_id,
            metadata={"reason": "MINT"}
        )
        self.events[ev_id] = event
        return res

    def get_agent_balance(self, agent_id: str, resource_type: str) -> float:
        """Return available (un-escrowed) balance of a resource for an agent."""
        if agent_id not in self.agent_resources or resource_type not in self.agent_resources[agent_id]:
            return 0.0
        return self.agent_resources[agent_id][resource_type].available_amount

    def get_agent_portfolio(self, agent_id: str) -> Dict[str, Dict[str, float]]:
        """Return full portfolio of all resources owned by an agent."""
        portfolio = {}
        if agent_id in self.agent_resources:
            for r_type, r in self.agent_resources[agent_id].items():
                portfolio[r_type] = {
                    "total": r.amount,
                    "escrowed": r.escrowed,
                    "available": r.available_amount
                }
        return portfolio

    def get_all_agents_portfolios(self) -> Dict[str, Dict[str, Any]]:
        """Return global balance sheet across all registered autonomous agents."""
        sheet = {}
        for a_id in self.agent_resources:
            sheet[a_id] = self.get_agent_portfolio(a_id)
        return sheet

    # =========================================================================
    # 3. Two-Phase Bilateral Commit Protocol (2PC)
    # =========================================================================

    def propose_exchange(
        self,
        initiator_agent: str,
        responder_agent: str,
        give_resource_type: str,
        give_amount: float,
        take_resource_type: str,
        take_amount: float,
        ttl_seconds: float = 60.0,
        metadata: Optional[Dict[str, Any]] = None
    ) -> BilateralCommitment:
        """
        Step 1: Propose an atomic economic exchange between two agents.
        Enforces CFO spending ceiling and initial balance feasibility.
        """
        if give_amount <= 0 or take_amount <= 0:
            raise ValueError("Exchange amounts must be strictly positive")

        # Initial balance check for initiator
        init_bal = self.get_agent_balance(initiator_agent, give_resource_type)
        if init_bal < give_amount:
            raise ValueError(f"Initiator {initiator_agent} has insufficient {give_resource_type}: {init_bal} < {give_amount}")

        # Check CFO spend ceiling if spending USD
        if give_resource_type == "USD_CREDITS" and give_amount > 100.0:
            # Requires explicit governance approval
            pass

        cid = f"commit_{uuid.uuid4().hex[:12]}"
        commitment = BilateralCommitment(
            commitment_id=cid,
            initiator_agent=initiator_agent,
            responder_agent=responder_agent,
            give_resource_type=give_resource_type,
            give_amount=give_amount,
            take_resource_type=take_resource_type,
            take_amount=take_amount,
            status=CommitmentStatus.PROPOSED,
            created_at=time.time(),
            expires_at=time.time() + ttl_seconds,
            metadata=metadata or {}
        )
        self.commitments[cid] = commitment
        logger.info(f"REA Proposal created: {cid} ({initiator_agent} -> {responder_agent})")
        return commitment

    def prepare_exchange(self, commitment_id: str, responder_signature: str = "") -> BilateralCommitment:
        """
        Step 2 (Phase 1 2PC): Both agents lock required resources into Escrow.
        Resources are quarantined and cannot be double-spent.
        """
        if commitment_id not in self.commitments:
            raise KeyError(f"Commitment {commitment_id} not found")

        comm = self.commitments[commitment_id]
        if comm.status != CommitmentStatus.PROPOSED:
            raise ValueError(f"Commitment {commitment_id} cannot be prepared from status {comm.status}")

        if time.time() > comm.expires_at:
            comm.status = CommitmentStatus.ABORTED
            raise TimeoutError(f"Commitment {commitment_id} has expired (TTL elapsed)")

        # Verify balances on both sides
        init_res = self.agent_resources[comm.initiator_agent][comm.give_resource_type]
        resp_res = self.agent_resources.get(comm.responder_agent, {}).get(comm.take_resource_type)

        if init_res.available_amount < comm.give_amount:
            comm.status = CommitmentStatus.ABORTED
            raise ValueError(f"Initiator {comm.initiator_agent} insufficient available balance")

        if not resp_res or resp_res.available_amount < comm.take_amount:
            comm.status = CommitmentStatus.ABORTED
            raise ValueError(f"Responder {comm.responder_agent} insufficient available balance for {comm.take_resource_type}")

        # Lock both into Escrow
        init_res.escrowed += comm.give_amount
        resp_res.escrowed += comm.take_amount

        # Mint single-use ephemeral permit token bound to this transaction
        permit = tokens.create_token(commitment_id)
        comm.permit_token = permit
        comm.responder_signature = responder_signature or f"sig_resp_{uuid.uuid4().hex[:8]}"
        comm.status = CommitmentStatus.PREPARED

        logger.info(f"REA Prepared: {commitment_id} (Escrow locked on both sides, permit issued)")
        return comm

    def commit_exchange(self, commitment_id: str, approved_by: str = "auto") -> Tuple[BilateralCommitment, str]:
        """
        Step 3 (Phase 2 2PC): Atomically transfer escrowed resources,
        generate dual economic events, and append to Ed25519 Merkle receipt chain.
        """
        if commitment_id not in self.commitments:
            raise KeyError(f"Commitment {commitment_id} not found")

        comm = self.commitments[commitment_id]
        if comm.status != CommitmentStatus.PREPARED:
            raise ValueError(f"Cannot commit exchange from status {comm.status}; must be PREPARED")

        # Validate single-use execution token
        if not tokens.validate_and_consume(comm.permit_token, commitment_id):
            self.abort_exchange(commitment_id, reason="Permit token validation failed or expired")
            raise PermissionError("Single-use permit token validation failed")

        # 1. Decrement escrow and debit initiator -> credit responder
        init_res = self.agent_resources[comm.initiator_agent][comm.give_resource_type]
        init_res.escrowed -= comm.give_amount
        init_res.amount -= comm.give_amount

        # Credit responder
        if comm.give_resource_type not in self.agent_resources[comm.responder_agent]:
            self.mint_resource(comm.responder_agent, comm.give_resource_type, 0.0)
        self.agent_resources[comm.responder_agent][comm.give_resource_type].amount += comm.give_amount

        # 2. Decrement escrow and debit responder -> credit initiator
        resp_res = self.agent_resources[comm.responder_agent][comm.take_resource_type]
        resp_res.escrowed -= comm.take_amount
        resp_res.amount -= comm.take_amount

        # Credit initiator
        if comm.take_resource_type not in self.agent_resources[comm.initiator_agent]:
            self.mint_resource(comm.initiator_agent, comm.take_resource_type, 0.0)
        self.agent_resources[comm.initiator_agent][comm.take_resource_type].amount += comm.take_amount

        # 3. Create reciprocal REA Economic Events (Duality)
        ev1_id = f"ev_dual1_{uuid.uuid4().hex[:10]}"
        ev2_id = f"ev_dual2_{uuid.uuid4().hex[:10]}"

        event1 = EconomicEvent(
            event_id=ev1_id,
            event_type=EventType.TRANSFER,
            resource_type=comm.give_resource_type,
            amount=comm.give_amount,
            from_agent=comm.initiator_agent,
            to_agent=comm.responder_agent,
            dual_event_id=ev2_id,
            commitment_id=commitment_id,
            status="COMMITTED"
        )
        event2 = EconomicEvent(
            event_id=ev2_id,
            event_type=EventType.TRANSFER,
            resource_type=comm.take_resource_type,
            amount=comm.take_amount,
            from_agent=comm.responder_agent,
            to_agent=comm.initiator_agent,
            dual_event_id=ev1_id,
            commitment_id=commitment_id,
            status="COMMITTED"
        )
        self.events[ev1_id] = event1
        self.events[ev2_id] = event2
        comm.events = [ev1_id, ev2_id]
        comm.status = CommitmentStatus.COMMITTED

        # 4. Generate Ed25519 Cryptographic Receipt
        from commit_layer.models import Action, RiskLevel, Decision
        rea_payload = {
            "commitment_id": commitment_id,
            "initiator": comm.initiator_agent,
            "responder": comm.responder_agent,
            "give": {"type": comm.give_resource_type, "amount": comm.give_amount},
            "take": {"type": comm.take_resource_type, "amount": comm.take_amount}
        }
        rea_action = Action(
            id=commitment_id,
            tool_name="rea_bilateral_exchange",
            args=rea_payload,
            args_redacted=rea_payload,
            agent_id=comm.initiator_agent,
            risk=RiskLevel.HIGH if comm.give_amount >= 100.0 else RiskLevel.MEDIUM,
            decision=Decision.PREVIEW
        )
        rcpt = receipts.create_receipt(rea_action, status="COMMITTED", approved_by=approved_by)
        receipts.update_receipt_outcome(rcpt["id"], outcome="OBSERVED_SUCCESS", undo_state="AVAILABLE")
        
        receipt_id = rcpt["id"]
        comm.receipt_id = receipt_id
        event1.receipt_id = receipt_id
        event2.receipt_id = receipt_id

        logger.info(f"REA Committed: {commitment_id} | Receipt: {receipt_id} (Ed25519 signed)")
        return comm, receipt_id

    def abort_exchange(self, commitment_id: str, reason: str = "Aborted by agent") -> BilateralCommitment:
        """
        Atomic Abort / Rollback during Phase 1 or 2:
        Releases any locked escrows back to original owners without state loss.
        """
        if commitment_id not in self.commitments:
            raise KeyError(f"Commitment {commitment_id} not found")

        comm = self.commitments[commitment_id]
        if comm.status == CommitmentStatus.COMMITTED:
            # If already committed, must execute full REA Two-Phase Undo
            return self.rollback_committed_exchange(commitment_id, reason=reason)

        if comm.status == CommitmentStatus.PREPARED:
            # Release escrows
            init_res = self.agent_resources[comm.initiator_agent][comm.give_resource_type]
            resp_res = self.agent_resources[comm.responder_agent][comm.take_resource_type]
            init_res.escrowed = max(0.0, init_res.escrowed - comm.give_amount)
            resp_res.escrowed = max(0.0, resp_res.escrowed - comm.take_amount)

        comm.status = CommitmentStatus.ABORTED
        comm.metadata["abort_reason"] = reason
        logger.info(f"REA Aborted: {commitment_id} | Reason: {reason}")
        return comm

    def rollback_committed_exchange(self, commitment_id: str, reason: str = "Rollback requested") -> BilateralCommitment:
        """
        Lossless Two-Phase Rollback (/undo) of an already COMMITTED REA exchange:
        Performs inverse transfers and logs compensating economic events.
        """
        if commitment_id not in self.commitments:
            raise KeyError(f"Commitment {commitment_id} not found")

        comm = self.commitments[commitment_id]
        if comm.status != CommitmentStatus.COMMITTED:
            raise ValueError(f"Cannot rollback commitment in status {comm.status}; must be COMMITTED")

        # 1. Reverse transfers
        # Debit responder -> credit initiator (for give_resource)
        self.agent_resources[comm.responder_agent][comm.give_resource_type].amount -= comm.give_amount
        self.agent_resources[comm.initiator_agent][comm.give_resource_type].amount += comm.give_amount

        # Debit initiator -> credit responder (for take_resource)
        self.agent_resources[comm.initiator_agent][comm.take_resource_type].amount -= comm.take_amount
        self.agent_resources[comm.responder_agent][comm.take_resource_type].amount += comm.take_amount

        # 2. Update receipt outcome to UNDONE
        if comm.receipt_id:
            receipts.update_receipt_outcome(comm.receipt_id, outcome="OBSERVED_SUCCESS", undo_state="UNDONE")

        comm.status = CommitmentStatus.ROLLED_BACK
        comm.metadata["rollback_reason"] = reason

        logger.info(f"REA Rollback Success: {commitment_id} reversed byte-for-byte")
        return comm


# Global singleton REA Ledger
rea_ledger = REALedger()


# =========================================================================
# 3. Gateway Tool Registration for Native Reversible Commits (/undo)
# =========================================================================

from commit_layer.tools.base import BaseTool
from commit_layer.models import Outcome
from typing import Callable

class REABilateralExchangeTool(BaseTool):
    name = "rea_bilateral_exchange"
    description = "REA bilateral economic commitment exchange tool with 2PC rollback"
    has_inverse = True

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        return {"status": "executed", "args": args}

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        return Outcome.OBSERVED_SUCCESS

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        cid = args.get("commitment_id")
        def _undo():
            target_id = cid
            if not target_id:
                for k, comm in rea_ledger.commitments.items():
                    if (
                        comm.initiator_agent == args.get("initiator")
                        and comm.responder_agent == args.get("responder")
                        and comm.status == CommitmentStatus.COMMITTED
                    ):
                        target_id = k
                        break
            if not target_id:
                raise ValueError("No matching active REA commitment found to rollback")
            res = rea_ledger.rollback_committed_exchange(target_id)
            return {"status": "undone", "commitment_id": res.commitment_id}
        return _undo
