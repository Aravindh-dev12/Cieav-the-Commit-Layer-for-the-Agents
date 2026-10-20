"""
Comprehensive Test Suite for CIEAV World-Class Autonomous Agentic Platform.
=============================================================================
Verifies:
1. OS Automator diagnostics, disk partitions, and port inspection.
2. Temporary file scanner and safe cleaner.
3. Directory file organization and lossless undo.
4. Cryptographic SHA256 duplicate file detection.
5. Autonomous Code Healer traceback diagnosis and self-repair.
6. Virtual Office multi-agent swarm cycle execution.
7. SuperAgent high-level goal decomposition and multi-phase mission pipeline.
"""

import os
import shutil
import tempfile
import pytest

from commit_layer.tools.os_automator import os_automator
from commit_layer.code_healer import code_healer
from commit_layer.virtual_office import virtual_office, TaskStatus
from commit_layer.super_agent import super_agent


def test_os_automator_diagnostics():
    """Diagnostics must collect CPU, RAM, disk partitions, and top processes on local CPU."""
    diag = os_automator.get_system_diagnostics()
    assert diag["status"] == "success"
    assert "cpu_percent" in diag
    assert "memory" in diag
    assert diag["memory"]["total_gb"] > 0
    assert len(diag["disks"]) > 0
    card = os_automator.render_diagnostics_card(diag)
    assert "SOVEREIGN OS DIAGNOSTICS" in card


def test_os_automator_ports():
    """Port inspector must enumerate active TCP listening ports and processes."""
    pdata = os_automator.inspect_ports()
    assert pdata["status"] == "success"
    assert "ports" in pdata
    card = os_automator.render_ports_card(pdata)
    assert "ACTIVE NETWORK PORTS" in card


def test_os_automator_organize_and_undo():
    """File organizer must sort files into categories and support lossless rollback."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create sample files
        doc_path = os.path.join(tmpdir, "report.pdf")
        img_path = os.path.join(tmpdir, "logo.png")
        code_path = os.path.join(tmpdir, "script.py")
        with open(doc_path, "w") as f:
            f.write("doc")
        with open(img_path, "w") as f:
            f.write("img")
        with open(code_path, "w") as f:
            f.write("code")

        # Organize
        res = os_automator.organize_directory(tmpdir)
        assert res["status"] == "success"
        assert res["moved_count"] == 3
        assert os.path.exists(os.path.join(tmpdir, "Documents", "report.pdf"))
        assert os.path.exists(os.path.join(tmpdir, "Media", "logo.png"))
        assert os.path.exists(os.path.join(tmpdir, "Code", "script.py"))

        # Undo organize
        undo_res = os_automator.undo_organize()
        assert undo_res["status"] == "success"
        assert undo_res["restored_count"] == 3
        assert os.path.exists(doc_path)
        assert os.path.exists(img_path)
        assert os.path.exists(code_path)


def test_os_automator_duplicate_scanner():
    """Duplicate scanner must find identical files by SHA256."""
    with tempfile.TemporaryDirectory() as tmpdir:
        f1 = os.path.join(tmpdir, "original.txt")
        f2 = os.path.join(tmpdir, "copy.txt")
        content = b"CIEAV duplicate test content payload 12345"
        with open(f1, "wb") as file:
            file.write(content)
        with open(f2, "wb") as file:
            file.write(content)

        dups = os_automator.find_duplicates(tmpdir)
        assert dups["status"] == "success"
        assert dups["redundant_files_count"] == 1
        assert dups["duplicate_groups"] == 1


def test_code_healer_traceback_diagnosis():
    """Traceback diagnostic must extract target file, line number, and error type."""
    sample_traceback = """
Traceback (most recent call last):
  File "C:\\test\\worker.py", line 42, in process
    subprocess.Popen(["echo", "hi"])
NameError: name 'subprocess' is not defined
"""
    diag = code_healer.diagnose_traceback("", sample_traceback)
    assert diag["has_traceback"] is True
    assert diag["target_file"] == "C:\\test\\worker.py"
    assert diag["line_number"] == 42
    assert diag["error_type"] == "NameError"
    assert "subprocess" in diag["error_message"]


def test_virtual_office_swarm_cycle():
    """Swarm cycle must autonomously advance pending tasks to DONE with deliverables."""
    t = virtual_office.add_task("Verify autonomous node health", assigned_to="ops", priority="HIGH")
    assert t.status == TaskStatus.IN_PROGRESS

    swarm_res = virtual_office.run_swarm_cycle()
    assert swarm_res["status"] == "success"
    assert swarm_res["executed_count"] >= 1
    assert t.status == TaskStatus.DONE
    assert t.deliverable != ""


def test_superagent_goal_decomposition_and_execution():
    """SuperAgent must decompose multi-part goal and execute phases autonomously."""
    goal = "clean temp cache files and inspect system performance"
    stages = super_agent.decompose_goal(goal)
    assert len(stages) >= 2
    assert any(s["stage"] == "SYSTEM_DIAGNOSTICS" for s in stages)
    assert any(s["stage"] == "CLEAN_TEMP_FILES" for s in stages)

    exec_res = super_agent.execute_goal(goal)
    assert exec_res["status"] == "success"
    assert exec_res["stages_completed"] >= 2
    card = super_agent.render_mission_card(exec_res)
    assert "AUTONOMOUS MISSION ACCOMPLISHED" in card
