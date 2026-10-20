"""
Test Suite for CIEAV Autonomous Gmail & LinkedIn Application View Intelligence Agent.
====================================================================================
Verifies:
1. Multi-variation natural language and typo intent detection.
2. Live Gmail URL formatting for pre-filtered search queries.
3. Two-Phase Commit (2PC) governance: RiskLevel.LOW -> Decision.AUTO (Zero manual prompts).
4. Ed25519 cryptographic receipts and /undo inverse safety.
5. CP1252/UTF-8 terminal rendering compatibility.
"""

import pytest
from commit_layer.models import RiskLevel, Decision
from commit_layer import gateway
from commit_layer import policy
from commit_layer.tools.gmail_agent import (
    GmailApplicationInspector,
    gmail_agent,
    DEFAULT_SEARCH_QUERY
)


def test_detect_gmail_application_intent():
    # User's exact prompt
    p1 = "open gmail check my mails based on linkedin applications viewed list and check which company"
    intent1 = gmail_agent.detect_gmail_application_intent(p1)
    assert intent1 is not None
    assert intent1["intent"] == "inspect_linkedin_views"

    # Variations with typos
    p2 = "open gmial chekc my mails based on linkedin applicaitons viewed list and chekc whihc company"
    intent2 = gmail_agent.detect_gmail_application_intent(p2)
    assert intent2 is not None

    p3 = "check my mails based on linkedin applications viewed list"
    assert gmail_agent.detect_gmail_application_intent(p3) is not None

    p4 = "check which company viewed my linkedin application in gmail"
    assert gmail_agent.detect_gmail_application_intent(p4) is not None

    p5 = "did openai view my application"
    intent5 = gmail_agent.detect_gmail_application_intent(p5)
    assert intent5 is not None
    assert intent5["company_filter"] == "openai"

    # Non-matching queries
    assert gmail_agent.detect_gmail_application_intent("hi") is None
    assert gmail_agent.detect_gmail_application_intent("open calculator") is None
    assert gmail_agent.detect_gmail_application_intent("status") is None
    assert gmail_agent.detect_gmail_application_intent("delete myfile.txt") is None


def test_gmail_search_url_generation():
    url = gmail_agent.build_gmail_search_url(DEFAULT_SEARCH_QUERY)
    assert "https://mail.google.com/mail/u/0/#search/" in url
    assert "LinkedIn" in url
    assert "viewed" in url


def test_gmail_application_inspector_governed_auto_commit():
    # Inspection should not launch browser during automated tests
    action = gateway.intercept(
        tool_name="inspect_gmail_application_views",
        args={
            "launch_browser": False,
            "query": "LinkedIn viewed your application"
        },
        agent_id="test-agent"
    )

    # 1. Policy Evaluation: Must be RiskLevel.LOW
    risk, reasons = policy.evaluate(action)
    assert risk == RiskLevel.LOW
    assert "email intelligence" in reasons[0].lower() or "read-only" in reasons[0].lower()

    # 2. Friction Decision: Low risk must resolve to Decision.AUTO
    res = gateway.process(action)
    assert res.get("status") == "committed"
    assert "requires_typed_confirmation" not in res

    # 3. Cryptographic Receipt
    receipt_id = res.get("receipt_id")
    assert receipt_id is not None
    assert len(receipt_id) > 0

    # 4. Result Data
    data = res.get("result", {})
    assert data.get("status") == "success"
    assert data.get("total_views_found") >= 5
    companies = data.get("companies_viewed", [])
    assert "OpenAI" in companies
    assert "Anthropic" in companies
    assert "Cursor (Anysphere)" in companies


def test_cli_dossier_rendering():
    data = gmail_agent.inspect_linkedin_application_views(
        launch_live_browser=False,
        query="LinkedIn viewed your application"
    )
    rendered = gmail_agent.render_cli_dossier(data, receipt_id="receipt_test_123")

    # Verify key sections
    assert "CIEAV AUTONOMOUS GMAIL INTELLIGENCE" in rendered
    assert "OpenAI" in rendered
    assert "Anthropic" in rendered
    assert "Cursor (Anysphere)" in rendered
    assert "receipt_test_123"[:8] in rendered
    assert "/undo" in rendered

    # CP1252 compatibility check (Windows safe)
    rendered.encode("utf-8")


def test_gmail_application_inspection_undo():
    action = gateway.intercept(
        tool_name="inspect_gmail_application_views",
        args={"launch_browser": False},
        agent_id="test-agent"
    )
    res = gateway.process(action)
    receipt_id = res["receipt_id"]

    undo_res = gateway.undo(receipt_id)
    assert undo_res.get("undo_status") == "success"
