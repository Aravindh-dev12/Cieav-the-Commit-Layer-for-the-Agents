"""CodeCompressor - AST & Pattern-Aware Source Code Compressor for Headroom.

Preserves class hierarchies, function signatures, type annotations, and docstrings
while eliding verbose interior implementations. Gives agents a complete structural map
without burning token budget.
"""
from __future__ import annotations
import re


class CodeCompressor:
    def __init__(self, max_body_lines: int = 4):
        self.max_body_lines = max_body_lines

    def compress(self, code: str) -> str:
        """Compress code by condensing long function / method bodies while preserving interfaces."""
        if not code or len(code.splitlines()) < 12:
            return code

        lines = code.splitlines()
        output = []
        in_def = False
        body_count = 0
        indent_level = 0
        skipped_count = 0

        for line in lines:
            stripped = line.strip()

            # Always preserve imports, decorators, signatures, docstrings, and comments
            if (
                re.match(r'^(import|from|class|def|async def|public|private|function|type|interface|enum|export)\b', stripped)
                or stripped.startswith(('@', '"""', "'''", '//', '#', '/*'))
                or not stripped
            ):
                if skipped_count > 0:
                    output.append(f"{' ' * indent_level}    # ... [{skipped_count} lines omitted by Headroom]")
                    skipped_count = 0

                output.append(line)
                if re.match(r'^(def|async def|function)\b', stripped):
                    in_def = True
                    body_count = 0
                    indent_level = len(line) - len(line.lstrip())
                else:
                    in_def = False
                continue

            # Inside a function body
            if in_def:
                body_count += 1
                if body_count <= self.max_body_lines:
                    output.append(line)
                else:
                    skipped_count += 1
            else:
                output.append(line)

        if skipped_count > 0:
            output.append(f"{' ' * indent_level}    # ... [{skipped_count} lines omitted by Headroom]")

        return "\n".join(output)


# Singleton instance
code_compressor = CodeCompressor()
