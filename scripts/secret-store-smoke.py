#!/usr/bin/env python3
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from _repo_python import bootstrap_repo_pythonpath

bootstrap_repo_pythonpath()

from latch_platform.config import Settings
from latch_platform.secret_store import SecretStore, SecretStoreError, _Backend


class MemorySecureBackend(_Backend):
    name="test-secure"; encrypted_at_rest=True
    def __init__(self): self.values={}
    def get(self,account:str)->str|None:return self.values.get(account)
    def set(self,account:str,value:str)->None:self.values[account]=value
    def delete(self,account:str)->bool:return self.values.pop(account,None) is not None


def settings_for(root:Path,state:Path)->Settings:
    return Settings(root=root,state_dir=state,gateway_port=8791,control_port=8790,api_port=8787,token_file=state/"gateway-token",local_api_secret_file=state/"local-api-signing-secret",receipt_signing_secret_file=state/"receipt-signing-secret",hf_token_file=state/"hf-token",runtime_file=state/"runtime.json",log_file=state/"gateway.log")


def main()->int:
    root=Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix="cieav-secrets-") as td:
        state=Path(td)
        legacy=state/"legacy-token";legacy.write_text("legacy_"+"x"*48,"utf-8")
        store=SecretStore(state);store.backend=MemorySecureBackend()
        migrated=store.get("gateway-token",legacy)
        assert migrated=="legacy_"+"x"*48
        assert store.backend.get("gateway-token")==migrated
        assert not legacy.exists(),"verified secure migration must remove plaintext legacy file"
        assert store.delete("gateway-token") is True and store.get("gateway-token") is None

    with tempfile.TemporaryDirectory(prefix="cieav-file-secrets-") as td, patch.dict(os.environ,{"CIEAV_SECRET_BACKEND":"file"},clear=False):
        state=Path(td);s=settings_for(root,state)
        token=s.token();api=s.local_api_secret();receipt=s.receipt_signing_secret()
        assert len(token)>=32 and len(api)>=32 and len(receipt)>=32 and len({token,api,receipt})==3
        assert s.secret_storage_status()=={"backend":"file-0600","encryptedAtRest":False,"fallback":True}
        for p in (s.token_file,s.local_api_secret_file,s.receipt_signing_secret_file):
            assert p.exists()
            if os.name!="nt": assert p.stat().st_mode & 0o077 == 0
        s.write_hf_token("hf_"+"z"*40);assert s.read_hf_token()=="hf_"+"z"*40;assert s.delete_hf_token() is True;assert s.read_hf_token() is None

    with tempfile.TemporaryDirectory(prefix="cieav-secure-policy-") as td, patch.dict(os.environ,{"CIEAV_SECRET_BACKEND":"secure"},clear=False), patch("latch_platform.secret_store.sys.platform","linux"), patch("latch_platform.secret_store.shutil.which",return_value=None):
        try: SecretStore(Path(td))
        except SecretStoreError as exc: assert "Secret Service" in str(exc)
        else: raise AssertionError("secure production policy must reject plaintext fallback")

    with tempfile.TemporaryDirectory(prefix="cieav-frozen-policy-") as td, patch.dict(os.environ,{"CIEAV_SECRET_BACKEND":"file"},clear=False), patch.object(__import__("latch_platform.secret_store",fromlist=["sys"]).sys,"frozen",True,create=True):
        try: SecretStore(Path(td))
        except SecretStoreError as exc: assert "refuses plaintext" in str(exc)
        else: raise AssertionError("frozen production runtime must reject file backend without explicit diagnostic override")

    print("CIEAV secret-store smoke passed: verified secure migration + explicit file fallback + production fail-closed policy")
    return 0


if __name__=="__main__":raise SystemExit(main())
