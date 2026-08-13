from __future__ import annotations

import base64
import ctypes
import os
import shutil
import subprocess
import sys
from ctypes import wintypes
from dataclasses import dataclass
from pathlib import Path


SERVICE = "CIEAV"
_NOT_FOUND = -25300


class SecretStoreError(RuntimeError):
    pass


class _Backend:
    name = "file"
    encrypted_at_rest = False

    def get(self, account: str) -> str | None: raise NotImplementedError
    def set(self, account: str, value: str) -> None: raise NotImplementedError
    def delete(self, account: str) -> bool: raise NotImplementedError


class _FileBackend(_Backend):
    name = "file-0600"
    encrypted_at_rest = False

    def __init__(self, state_dir: Path): self.root = state_dir / "secrets"
    def _path(self, account: str) -> Path: return self.root / account
    def get(self, account: str) -> str | None:
        try: return self._path(account).read_text("utf-8").strip() or None
        except FileNotFoundError: return None
    def set(self, account: str, value: str) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        try: os.chmod(self.root, 0o700)
        except OSError: pass
        p=self._path(account); p.write_text(value,"utf-8")
        try: os.chmod(p,0o600)
        except OSError: pass
    def delete(self, account: str) -> bool:
        try: self._path(account).unlink(); return True
        except FileNotFoundError: return False


if sys.platform == "win32":
    class _DATA_BLOB(ctypes.Structure):
        _fields_=[("cbData",wintypes.DWORD),("pbData",ctypes.POINTER(ctypes.c_ubyte))]

    class _DPAPIBackend(_Backend):
        name="windows-dpapi-current-user"; encrypted_at_rest=True
        _UI_FORBIDDEN=0x1
        def __init__(self,state_dir:Path):
            self.root=state_dir/"secrets-dpapi"; self.crypt32=ctypes.windll.crypt32; self.kernel32=ctypes.windll.kernel32
        def _path(self,account:str)->Path:return self.root/f"{account}.blob"
        @staticmethod
        def _blob(data:bytes):
            buf=ctypes.create_string_buffer(data); return _DATA_BLOB(len(data),ctypes.cast(buf,ctypes.POINTER(ctypes.c_ubyte))),buf
        def _protect(self,data:bytes)->bytes:
            inp,keep=self._blob(data); out=_DATA_BLOB()
            ok=self.crypt32.CryptProtectData(ctypes.byref(inp),"CIEAV per-user secret",None,None,None,self._UI_FORBIDDEN,ctypes.byref(out))
            if not ok: raise SecretStoreError(f"CryptProtectData failed: {ctypes.get_last_error()}")
            try:return ctypes.string_at(out.pbData,out.cbData)
            finally:self.kernel32.LocalFree(out.pbData)
        def _unprotect(self,data:bytes)->bytes:
            inp,keep=self._blob(data); out=_DATA_BLOB()
            ok=self.crypt32.CryptUnprotectData(ctypes.byref(inp),None,None,None,None,self._UI_FORBIDDEN,ctypes.byref(out))
            if not ok: raise SecretStoreError(f"CryptUnprotectData failed: {ctypes.get_last_error()}")
            try:return ctypes.string_at(out.pbData,out.cbData)
            finally:self.kernel32.LocalFree(out.pbData)
        def get(self,account:str)->str|None:
            try: raw=base64.b64decode(self._path(account).read_bytes(),validate=True)
            except FileNotFoundError:return None
            except Exception as exc: raise SecretStoreError(f"invalid DPAPI secret blob for {account}") from exc
            return self._unprotect(raw).decode("utf-8")
        def set(self,account:str,value:str)->None:
            self.root.mkdir(parents=True,exist_ok=True)
            try:os.chmod(self.root,0o700)
            except OSError:pass
            p=self._path(account); p.write_bytes(base64.b64encode(self._protect(value.encode("utf-8"))))
            try:os.chmod(p,0o600)
            except OSError:pass
        def delete(self,account:str)->bool:
            try:self._path(account).unlink();return True
            except FileNotFoundError:return False
else:
    _DPAPIBackend = None


class _MacKeychainBackend(_Backend):
    name="macos-keychain"; encrypted_at_rest=True
    def __init__(self,state_dir:Path):
        self.security=ctypes.cdll.LoadLibrary("/System/Library/Frameworks/Security.framework/Security")
        self.cf=ctypes.cdll.LoadLibrary("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
        self.cf.CFRelease.argtypes=[ctypes.c_void_p]
        for fn in ("SecKeychainFindGenericPassword","SecKeychainAddGenericPassword","SecKeychainItemModifyAttributesAndData","SecKeychainItemDelete","SecKeychainItemFreeContent"):
            getattr(self.security,fn).restype=ctypes.c_int32
    def _release_item(self,item)->None:
        if item and item.value:
            try:self.cf.CFRelease(item)
            except Exception:pass
    def _find(self,account:str):
        service=SERVICE.encode(); acct=account.encode(); length=ctypes.c_uint32(); data=ctypes.c_void_p(); item=ctypes.c_void_p()
        status=self.security.SecKeychainFindGenericPassword(None,len(service),service,len(acct),acct,ctypes.byref(length),ctypes.byref(data),ctypes.byref(item))
        return status,length,data,item
    def get(self,account:str)->str|None:
        status,length,data,item=self._find(account)
        if status==_NOT_FOUND:return None
        if status!=0:raise SecretStoreError(f"Keychain read failed: {status}")
        try:return ctypes.string_at(data,length.value).decode("utf-8")
        finally:
            self.security.SecKeychainItemFreeContent(None,data);self._release_item(item)
    def set(self,account:str,value:str)->None:
        raw=value.encode(); status,length,data,item=self._find(account)
        if status==0:
            try:
                rc=self.security.SecKeychainItemModifyAttributesAndData(item,None,len(raw),raw)
                if rc!=0:raise SecretStoreError(f"Keychain update failed: {rc}")
            finally:
                self.security.SecKeychainItemFreeContent(None,data);self._release_item(item)
            return
        if status!=_NOT_FOUND:raise SecretStoreError(f"Keychain lookup failed: {status}")
        service=SERVICE.encode();acct=account.encode();rc=self.security.SecKeychainAddGenericPassword(None,len(service),service,len(acct),acct,len(raw),raw,None)
        if rc!=0:raise SecretStoreError(f"Keychain add failed: {rc}")
    def delete(self,account:str)->bool:
        status,length,data,item=self._find(account)
        if status==_NOT_FOUND:return False
        if status!=0:raise SecretStoreError(f"Keychain lookup failed: {status}")
        try:
            rc=self.security.SecKeychainItemDelete(item)
            if rc!=0:raise SecretStoreError(f"Keychain delete failed: {rc}")
            return True
        finally:
            self.security.SecKeychainItemFreeContent(None,data);self._release_item(item)


class _SecretServiceBackend(_Backend):
    name="linux-secret-service"; encrypted_at_rest=True
    def __init__(self,state_dir:Path):
        tool=shutil.which("secret-tool")
        if not tool: raise SecretStoreError("secret-tool not available")
        self.tool=tool
        probe=subprocess.run([self.tool,"lookup","service",SERVICE,"account","__cieav_capability_probe__"],capture_output=True,text=True,timeout=5)
        if probe.returncode not in (0,1) or probe.stderr.strip():raise SecretStoreError((probe.stderr or "Secret Service unavailable").strip())
    def _attrs(self,account:str)->list[str]:return["service",SERVICE,"account",account]
    def get(self,account:str)->str|None:
        p=subprocess.run([self.tool,"lookup",*self._attrs(account)],capture_output=True,text=True,timeout=8)
        if p.returncode==1 and not p.stderr.strip():return None
        if p.returncode!=0:raise SecretStoreError((p.stderr or "Secret Service read failed").strip())
        return p.stdout.rstrip("\n") or None
    def set(self,account:str,value:str)->None:
        p=subprocess.run([self.tool,"store",f"--label=CIEAV {account}",*self._attrs(account)],input=value,text=True,capture_output=True,timeout=12)
        if p.returncode!=0:raise SecretStoreError((p.stderr or "Secret Service write failed").strip())
    def delete(self,account:str)->bool:
        existed=self.get(account) is not None
        p=subprocess.run([self.tool,"clear",*self._attrs(account)],capture_output=True,text=True,timeout=8)
        if p.returncode not in (0,1):raise SecretStoreError((p.stderr or "Secret Service delete failed").strip())
        return existed


@dataclass(frozen=True)
class SecretStoreStatus:
    backend: str
    encrypted_at_rest: bool
    fallback: bool


class SecretStore:
    def __init__(self,state_dir:Path):
        self.state_dir=state_dir
        frozen=bool(getattr(sys,"frozen",False))
        requested=os.environ.get("CIEAV_SECRET_BACKEND", "secure" if frozen else "auto").strip().lower() or ("secure" if frozen else "auto")
        if requested not in {"auto","secure","file"}: raise SecretStoreError("CIEAV_SECRET_BACKEND must be auto, secure, or file")
        if frozen and requested=="file" and os.environ.get("CIEAV_ALLOW_INSECURE_SECRET_STORE")!="1":
            raise SecretStoreError("production CIEAV refuses plaintext secret storage; remove CIEAV_SECRET_BACKEND=file or explicitly set CIEAV_ALLOW_INSECURE_SECRET_STORE=1 for diagnostics")
        backend:_Backend
        if requested=="file":
            backend=_FileBackend(state_dir)
        elif sys.platform=="win32" and _DPAPIBackend is not None:
            backend=_DPAPIBackend(state_dir)
        elif sys.platform=="darwin":
            try: backend=_MacKeychainBackend(state_dir)
            except Exception as exc:
                if requested=="secure": raise SecretStoreError("macOS Keychain is required for production CIEAV secret storage") from exc
                backend=_FileBackend(state_dir)
        elif sys.platform.startswith("linux") and shutil.which("secret-tool") and os.environ.get("DBUS_SESSION_BUS_ADDRESS"):
            try: backend=_SecretServiceBackend(state_dir)
            except Exception as exc:
                if requested=="secure": raise SecretStoreError("Linux Secret Service is required for production CIEAV secret storage") from exc
                backend=_FileBackend(state_dir)
        elif requested=="secure":
            if sys.platform.startswith("linux"):
                raise SecretStoreError("Linux Secret Service is required for production CIEAV secret storage (secret-tool and a user D-Bus session are required)")
            raise SecretStoreError(f"no supported OS-backed secret store is available on {sys.platform}")
        else:
            backend=_FileBackend(state_dir)
        if requested=="secure" and not backend.encrypted_at_rest:
            raise SecretStoreError("secure secret-storage policy resolved to an unencrypted backend")
        self.backend=backend
    @property
    def status(self)->SecretStoreStatus:return SecretStoreStatus(self.backend.name,self.backend.encrypted_at_rest,not self.backend.encrypted_at_rest)
    def get(self,account:str,legacy_file:Path|None=None)->str|None:
        value=self.backend.get(account)
        if value is not None:return value
        if legacy_file is not None:
            try: legacy=legacy_file.read_text("utf-8").strip()
            except FileNotFoundError: legacy=""
            if legacy:
                if not self.backend.encrypted_at_rest:return legacy
                self.set(account,legacy);confirmed=self.backend.get(account)
                if confirmed!=legacy:raise SecretStoreError(f"secret migration verification failed for {account}")
                try:legacy_file.unlink()
                except FileNotFoundError:pass
                return confirmed
        return None
    def set(self,account:str,value:str)->None:
        if not isinstance(value,str) or not value:raise SecretStoreError("secret value must be non-empty text")
        self.backend.set(account,value)
        if self.backend.get(account)!=value:raise SecretStoreError(f"secret write verification failed for {account}")
    def delete(self,account:str,legacy_file:Path|None=None)->bool:
        removed=self.backend.delete(account)
        if legacy_file is not None:
            try:legacy_file.unlink();removed=True
            except FileNotFoundError:pass
        return removed
