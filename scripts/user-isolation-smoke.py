#!/usr/bin/env python3
from __future__ import annotations

import os
import stat
import tempfile
from pathlib import Path

from latch_platform.config import Settings


def settings(root: Path, state: Path, offset: int) -> Settings:
    return Settings(
        root=root,
        state_dir=state,
        gateway_port=19000 + offset,
        control_port=19100 + offset,
        api_port=19200 + offset,
        token_file=state / "gateway-token",
        local_api_secret_file=state / "local-api-signing-secret",
        receipt_signing_secret_file=state / "receipt-signing-secret",
        hf_token_file=state / "hf-token",
        runtime_file=state / "gateway-runtime.json",
        log_file=state / "gateway.log",
    )


def private_mode(path: Path, expected: int) -> None:
    if os.name == "nt":
        return
    actual = stat.S_IMODE(path.stat().st_mode)
    if actual & 0o077:
        raise AssertionError(f"{path.name} is accessible to group/other: {oct(actual)}")
    if actual != expected:
        raise AssertionError(f"{path.name} mode {oct(actual)} != {oct(expected)}")


def main() -> None:
    root = Path.cwd().resolve()
    with tempfile.TemporaryDirectory(prefix="cieav-user-isolation-") as temp:
        base = Path(temp)
        a = settings(root, base / "user-a" / ".cieav", 1)
        b = settings(root, base / "user-b" / ".cieav", 2)

        a_token = a.token()
        a_api = a.local_api_secret()
        a_receipt = a.receipt_signing_secret()
        b_token = b.token()
        b_api = b.local_api_secret()
        b_receipt = b.receipt_signing_secret()

        # Secrets are persistent for one user/install.
        assert a.token() == a_token
        assert a.local_api_secret() == a_api
        assert a.receipt_signing_secret() == a_receipt
        assert b.token() == b_token
        assert b.local_api_secret() == b_api
        assert b.receipt_signing_secret() == b_receipt

        # Authority must not cross the OS-user/install boundary.
        assert a.state_dir != b.state_dir
        assert a_token != b_token
        assert a_api != b_api
        assert a_receipt != b_receipt
        assert a_api != a_receipt
        assert b_api != b_receipt

        # State files must physically live under the user's own state directory.
        for s in (a, b):
            for p in (s.token_file, s.local_api_secret_file, s.receipt_signing_secret_file):
                assert p.resolve().is_relative_to(s.state_dir.resolve())
                assert p.exists()
                assert len(p.read_text("utf-8").strip()) >= 32
            private_mode(s.state_dir, 0o700)
            private_mode(s.token_file, 0o600)
            private_mode(s.local_api_secret_file, 0o600)
            private_mode(s.receipt_signing_secret_file, 0o600)

        print("CIEAV per-user isolation smoke passed")
        print("user A/B have distinct state, Gateway tokens, API signing secrets, and receipt signing secrets")


if __name__ == "__main__":
    main()
