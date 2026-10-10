"""LogCompressor - Terminal and Execution Log Optimizer for Headroom.

Strips ANSI color codes, collapses repetitive logging loops, and condenses
massive stack traces down to the root cause and final failure frame.
"""
from __future__ import annotations
import re


ANSI_REGEX = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')


class LogCompressor:
    def __init__(self, max_duplicate_lines: int = 2):
        self.max_duplicate_lines = max_duplicate_lines

    def compress(self, text: str) -> str:
        """Strip ANSI escapes and collapse redundant log outputs."""
        if not text:
            return text

        # 1. Strip ANSI escape sequences
        clean = ANSI_REGEX.sub('', text)

        lines = clean.splitlines()
        if len(lines) < 6:
            return clean

        # 2. Collapse repetitive lines
        collapsed = []
        prev_line = None
        repeat_count = 0

        for line in lines:
            normalized = line.strip()
            if normalized == prev_line:
                repeat_count += 1
                if repeat_count < self.max_duplicate_lines:
                    collapsed.append(line)
            else:
                if repeat_count >= self.max_duplicate_lines:
                    collapsed.append(f"    ... [Repeated {repeat_count} more times]")
                collapsed.append(line)
                prev_line = normalized
                repeat_count = 0

        if repeat_count >= self.max_duplicate_lines:
            collapsed.append(f"    ... [Repeated {repeat_count} more times]")

        # 3. Stack trace compaction if very large (> 40 lines)
        if len(collapsed) > 40 and any("Traceback" in l for l in collapsed):
            top_part = collapsed[:15]
            bottom_part = collapsed[-15:]
            omitted = len(collapsed) - 30
            return "\n".join(top_part + [f"\n--- [Headroom: {omitted} intermediate trace lines omitted] ---\n"] + bottom_part)

        return "\n".join(collapsed)


# Singleton instance
log_compressor = LogCompressor()
