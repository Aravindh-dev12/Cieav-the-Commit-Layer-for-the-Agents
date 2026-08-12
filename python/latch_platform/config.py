from __future__ import annotations

import json
import os
import secrets
from dataclasses import dataclass
from pathlib import Path


def _env(primary: str, legacy: str | None = None) -> str | None:
    value = os.environ.get(primary, "").strip()
    if value:
        return value
    if legacy:
        value = os.environ.get(legacy, "").strip()
        if value:
            return value
    return None


def _repo_root() -> Path:
    configured = _env("CIEAV_HOME", "LATCH_HOME")
    if configured:
        return Path(configured).expanduser().resolve()
    candidates = [Path.cwd(), Path(__file__).resolve()]
    for start in candidates:
        for p in [start, *start.parents]:
            if (p / "package.json").exists() and (p / "apps" / "browser" / "main.mjs").exists():
                return p
    raise RuntimeError("Cannot locate CIEAV runtime. Set CIEAV_HOME to the repository/install root.")


def _state_dir() -> Path:
    configured = _env("CIEAV_STATE_DIR", "LATCH_STATE_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    cieav = (Path.home() / ".cieav").resolve()
    legacy = (Path.home() / ".latch").resolve()
    if legacy.exists() and not cieav.exists():
        return legacy
    return cieav


def _port(primary: str, legacy: str, default: str) -> int:
    return int(_env(primary, legacy) or default)


def _chmod_private(path: Path, mode: int) -> None:
    try:
        os.chmod(path, mode)
    except OSError:
        pass


def _private_secret(path: Path, *, bytes_count: int = 48) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    _chmod_private(path.parent, 0o700)
    try:
        value = path.read_text("utf-8").strip()
        if len(value) >= 32:
            return value
    except FileNotFoundError:
        pass
    value = secrets.token_urlsafe(bytes_count)
    path.write_text(value, "utf-8")
    _chmod_private(path, 0o600)
    return value


@dataclass(frozen=True)
class Settings:
    root: Path
    state_dir: Path
    gateway_port: int
    control_port: int
    api_port: int
    token_file: Path
    local_api_secret_file: Path
    receipt_signing_secret_file: Path
    hf_token_file: Path
    runtime_file: Path
    log_file: Path

    @classmethod
    def load(cls) -> "Settings":
        state = _state_dir()
        return cls(
            root=_repo_root(),
            state_dir=state,
            gateway_port=_port("CIEAV_GATEWAY_PORT", "LATCH_GATEWAY_PORT", "8791"),
            control_port=_port("CIEAV_CONTROL_PORT", "LATCH_CONTROL_PORT", "8790"),
            api_port=_port("CIEAV_API_PORT", "LATCH_API_PORT", "8787"),
            token_file=state / "gateway-token",
            local_api_secret_file=state / "local-api-signing-secret",
            receipt_signing_secret_file=state / "receipt-signing-secret",
            hf_token_file=state / "hf-token",
            runtime_file=state / "gateway-runtime.json",
            log_file=state / "gateway.log",
        )

    def ensure(self) -> None:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        _chmod_private(self.state_dir, 0o700)

    def token(self) -> str:
        self.ensure()
        try:
            value = self.token_file.read_text("utf-8").strip()
            if len(value) >= 32:
                return value
        except FileNotFoundError:
            pass
        value = secrets.token_urlsafe(32)
        self.token_file.write_text(value, "utf-8")
        _chmod_private(self.token_file, 0o600)
        return value

    def local_api_secret(self) -> str:
        self.ensure()
        return _private_secret(self.local_api_secret_file)

    def receipt_signing_secret(self) -> str:
        self.ensure()
        return _private_secret(self.receipt_signing_secret_file)

    def read_hf_token(self) -> str | None:
        value = os.environ.get("HF_TOKEN", "").strip()
        if value:
            return value
        try:
            value = self.hf_token_file.read_text("utf-8").strip()
            return value or None
        except FileNotFoundError:
            return None

    def write_hf_token(self, value: str) -> None:
        token = value.strip()
        if not token.startswith("hf_") or len(token) < 20:
            raise ValueError("This does not look like a Hugging Face access token")
        self.ensure()
        self.hf_token_file.write_text(token, "utf-8")
        _chmod_private(self.hf_token_file, 0o600)

    def delete_hf_token(self) -> bool:
        try:
            self.hf_token_file.unlink()
            return True
        except FileNotFoundError:
            return False

    def write_runtime(self, payload: dict) -> None:
        self.ensure()
        self.runtime_file.write_text(json.dumps(payload, indent=2), "utf-8")
        _chmod_private(self.runtime_file, 0o600)
