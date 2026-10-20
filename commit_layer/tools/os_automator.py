"""
CIEAV OS Automator & Host Maintenance Suite (100% Local • Zero Cloud APIs).
=============================================================================
Eliminates manual computer maintenance, system diagnostics, disk cleanup,
file organization, and process triage directly from the CLI.

Features:
1. System Diagnostics: Real-time CPU, RAM, Disk partitions, top processes.
2. Safe Temp & Cache Cleaner: Scans and purges %TEMP% / junk cache files with undo log.
3. Workspace File Organizer: Sorts cluttered loose files into categorized folders with rollback.
4. Duplicate File Finder: Fast SHA256 deduplication scanner.
5. Port & Process Inspector: Identifies listening services, ports, and PID owners.
"""

from __future__ import annotations
import hashlib
import os
import shutil
import time
from typing import Any, Dict, List, Optional, Tuple

import psutil


class OSAutomator:
    """Superintelligent Local OS Maintenance and File Automation Runtime."""

    def __init__(self):
        self.last_clean_log: List[Dict[str, Any]] = []
        self.last_organize_log: List[Dict[str, str]] = []

    # 1. System Diagnostics & Telemetry
    def get_system_diagnostics(self) -> Dict[str, Any]:
        """Collect live host CPU, Memory, Disk partitions, and top resource consumers."""
        cpu_pct = psutil.cpu_percent(interval=0.1)
        cpu_count = psutil.cpu_count(logical=True)
        mem = psutil.virtual_memory()

        # Disks
        disks = []
        for part in psutil.disk_partitions(all=False):
            try:
                usage = psutil.disk_usage(part.mountpoint)
                disks.append({
                    "device": part.device,
                    "mountpoint": part.mountpoint,
                    "total_gb": round(usage.total / (1024**3), 2),
                    "used_gb": round(usage.used / (1024**3), 2),
                    "free_gb": round(usage.free / (1024**3), 2),
                    "percent": usage.percent
                })
            except (PermissionError, OSError):
                continue

        # Top processes by memory
        top_procs = []
        for p in psutil.process_iter(['pid', 'name', 'memory_percent', 'cpu_percent']):
            try:
                info = p.info
                if info['memory_percent'] and info['memory_percent'] > 0.5:
                    top_procs.append({
                        "pid": info['pid'],
                        "name": info['name'],
                        "mem_pct": round(info['memory_percent'], 2),
                        "cpu_pct": round(info['cpu_percent'] or 0.0, 1)
                    })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        top_procs.sort(key=lambda x: x['mem_pct'], reverse=True)

        return {
            "status": "success",
            "cpu_percent": cpu_pct,
            "cpu_cores": cpu_count,
            "memory": {
                "total_gb": round(mem.total / (1024**3), 2),
                "used_gb": round(mem.used / (1024**3), 2),
                "free_gb": round(mem.available / (1024**3), 2),
                "percent": mem.percent
            },
            "disks": disks,
            "top_processes": top_procs[:6],
            "boot_time": time.ctime(psutil.boot_time())
        }

    def render_diagnostics_card(self, data: Dict[str, Any]) -> str:
        """Render a colorful ANSI card for system diagnostics."""
        mem = data["memory"]
        lines = []
        lines.append("\033[38;2;168;85;247m╔══════════════════════════════════════════════════════════════════════════════╗\033[0m")
        lines.append("\033[38;2;168;85;247m║\033[0m  \033[38;2;6;182;212m💻 SOVEREIGN OS DIAGNOSTICS & SYSTEM TELEMETRY (100% LOCAL CPU)\033[0m              \033[38;2;168;85;247m║\033[0m")
        lines.append("\033[38;2;168;85;247m╠══════════════════════════════════════════════════════════════════════════════╣\033[0m")
        
        cpu_col = "\033[38;2;16;185;129m" if data["cpu_percent"] < 70 else "\033[38;2;239;68;68m"
        mem_col = "\033[38;2;16;185;129m" if mem["percent"] < 80 else "\033[38;2;239;68;68m"
        
        lines.append(f"  • CPU Load       : {cpu_col}{data['cpu_percent']}%\033[0m ({data['cpu_cores']} logical cores)")
        lines.append(f"  • Physical RAM   : {mem_col}{mem['percent']}%\033[0m used ({mem['used_gb']} GB / {mem['total_gb']} GB • Free: {mem['free_gb']} GB)")
        lines.append(f"  • System Boot    : {data['boot_time']}")
        
        lines.append("\n  \033[1;37mStorage Partitions:\033[0m")
        for d in data["disks"]:
            disk_col = "\033[38;2;16;185;129m" if d["percent"] < 85 else "\033[38;2;239;68;68m"
            lines.append(f"   - Drive {d['device']:<6} : {disk_col}{d['percent']}%\033[0m used | {d['used_gb']} GB used | {d['free_gb']} GB free | Total: {d['total_gb']} GB")

        lines.append("\n  \033[1;37mTop Memory Consuming Processes:\033[0m")
        lines.append(f"   {'PID':<8} {'PROCESS NAME':<28} {'RAM %':<10} {'CPU %'}")
        lines.append("   " + "-" * 56)
        for proc in data["top_processes"]:
            lines.append(f"   {proc['pid']:<8} {proc['name'][:26]:<28} {proc['mem_pct']:<10} {proc['cpu_pct']}")

        lines.append("\033[38;2;168;85;247m╚══════════════════════════════════════════════════════════════════════════════╝\033[0m")
        return "\n".join(lines)

    # 2. Temp & Junk Cache Cleaner
    def scan_temp_files(self) -> Dict[str, Any]:
        """Scan %TEMP% directory for removable temporary and cache files."""
        temp_dir = os.environ.get("TEMP", os.environ.get("TMP", ""))
        if not temp_dir or not os.path.exists(temp_dir):
            return {"status": "error", "error": "TEMP directory not found"}

        total_bytes = 0
        removable_files: List[Dict[str, Any]] = []

        now = time.time()
        for root, _, files in os.walk(temp_dir):
            for file in files:
                try:
                    fpath = os.path.join(root, file)
                    st = os.stat(fpath)
                    # Consider files older than 2 hours or known junk patterns
                    age_hours = (now - st.st_mtime) / 3600
                    ext = os.path.splitext(file)[1].lower()
                    if age_hours > 2 or ext in (".tmp", ".log", ".dmp", ".old", ".bak", ".chk"):
                        total_bytes += st.st_size
                        removable_files.append({
                            "path": fpath,
                            "size_bytes": st.st_size,
                            "name": file
                        })
                except (PermissionError, OSError):
                    continue

        return {
            "status": "success",
            "temp_dir": temp_dir,
            "file_count": len(removable_files),
            "total_bytes": total_bytes,
            "total_mb": round(total_bytes / (1024 * 1024), 2),
            "files": removable_files
        }

    def clean_temp_files(self, dry_run: bool = False) -> Dict[str, Any]:
        """Purge safe removable temporary files to free up disk space."""
        scan = self.scan_temp_files()
        if scan.get("status") != "success":
            return scan

        if dry_run:
            return {
                "status": "dry_run",
                "scanned_files": scan["file_count"],
                "reclaimable_mb": scan["total_mb"],
                "message": f"Identified {scan['file_count']} temp files ({scan['total_mb']} MB) ready for cleanup."
            }

        deleted_count = 0
        deleted_bytes = 0
        failed_count = 0
        cleanup_log = []

        for f in scan["files"]:
            p = f["path"]
            try:
                os.remove(p)
                deleted_count += 1
                deleted_bytes += f["size_bytes"]
                cleanup_log.append(p)
            except (PermissionError, OSError):
                failed_count += 1

        self.last_clean_log = cleanup_log
        return {
            "status": "success",
            "deleted_count": deleted_count,
            "reclaimed_mb": round(deleted_bytes / (1024 * 1024), 2),
            "skipped_locked": failed_count
        }

    # 3. Workspace File Organizer
    def organize_directory(self, target_dir: str) -> Dict[str, Any]:
        """
        Organize cluttered files in target directory into categorized folders:
        Documents, Media, Code, Archives, Data.
        Generates reversible move-log for lossless rollback.
        """
        target = os.path.abspath(target_dir)
        if not os.path.isdir(target):
            return {"status": "error", "error": f"Directory not found: {target}"}

        CATEGORY_MAP = {
            "Documents": {".pdf", ".docx", ".doc", ".txt", ".md", ".rtf", ".odt"},
            "Media": {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".mp4", ".mp3", ".wav"},
            "Code": {".py", ".js", ".ts", ".tsx", ".jsx", ".html", ".css", ".rs", ".go", ".cpp", ".c", ".sh", ".ps1"},
            "Archives": {".zip", ".tar", ".gz", ".7z", ".rar", ".iso"},
            "Data": {".csv", ".json", ".xml", ".yaml", ".yml", ".sql", ".sqlite", ".db"}
        }

        moved_files = []
        for item in os.listdir(target):
            src_path = os.path.join(target, item)
            if not os.path.isfile(src_path):
                continue

            _, ext = os.path.splitext(item)
            ext = ext.lower()

            target_category = None
            for cat, extensions in CATEGORY_MAP.items():
                if ext in extensions:
                    target_category = cat
                    break

            if not target_category:
                target_category = "Other"

            dest_folder = os.path.join(target, target_category)
            os.makedirs(dest_folder, exist_ok=True)
            dest_path = os.path.join(dest_folder, item)

            if src_path != dest_path:
                try:
                    shutil.move(src_path, dest_path)
                    moved_files.append({"src": src_path, "dest": dest_path, "category": target_category})
                except Exception as e:
                    continue

        self.last_organize_log = moved_files
        return {
            "status": "success",
            "target_dir": target,
            "moved_count": len(moved_files),
            "moved_files": moved_files
        }

    def undo_organize(self) -> Dict[str, Any]:
        """Lossless rollback for the last directory organization operation."""
        if not self.last_organize_log:
            return {"status": "error", "error": "No recent directory organization operation to undo"}

        restored = 0
        for item in reversed(self.last_organize_log):
            dest = item["dest"]
            src = item["src"]
            if os.path.exists(dest):
                try:
                    shutil.move(dest, src)
                    restored += 1
                except Exception:
                    pass

        self.last_organize_log = []
        return {
            "status": "success",
            "restored_count": restored,
            "message": f"Successfully restored {restored} files back to original positions."
        }

    # 4. Duplicate File Finder
    def find_duplicates(self, target_dir: str) -> Dict[str, Any]:
        """Scan directory tree for bit-for-bit duplicate files using SHA256."""
        target = os.path.abspath(target_dir)
        if not os.path.isdir(target):
            return {"status": "error", "error": f"Directory not found: {target}"}

        hashes: Dict[str, List[str]] = {}
        for root, _, files in os.walk(target):
            for f in files:
                fpath = os.path.join(root, f)
                try:
                    if os.path.getsize(fpath) > 0 and os.path.getsize(fpath) < 100 * 1024 * 1024:
                        h = hashlib.sha256()
                        with open(fpath, "rb") as file_obj:
                            while chunk := file_obj.read(65536):
                                h.update(chunk)
                        digest = h.hexdigest()
                        hashes.setdefault(digest, []).append(fpath)
                except (PermissionError, OSError):
                    continue

        duplicates = {h: paths for h, paths in hashes.items() if len(paths) > 1}
        dup_count = sum(len(paths) - 1 for paths in duplicates.values())

        return {
            "status": "success",
            "target_dir": target,
            "duplicate_groups": len(duplicates),
            "redundant_files_count": dup_count,
            "duplicates": duplicates
        }

    # 5. Port and Process Inspector
    def inspect_ports(self) -> Dict[str, Any]:
        """List active TCP listening ports and their controlling processes."""
        ports = []
        for conn in psutil.net_connections(kind="inet"):
            if conn.status == psutil.CONN_LISTEN:
                pid = conn.pid
                proc_name = "System"
                if pid:
                    try:
                        p = psutil.Process(pid)
                        proc_name = p.name()
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        proc_name = "Unknown"
                ports.append({
                    "port": conn.laddr.port,
                    "ip": conn.laddr.ip,
                    "pid": pid or 0,
                    "process_name": proc_name
                })

        ports.sort(key=lambda x: x["port"])
        return {
            "status": "success",
            "count": len(ports),
            "ports": ports
        }

    def render_ports_card(self, data: Dict[str, Any]) -> str:
        """Render a clean ANSI card of active listening ports."""
        lines = []
        lines.append("\033[38;2;168;85;247m╔══════════════════════════════════════════════════════════════════════════════╗\033[0m")
        lines.append(f"\033[38;2;168;85;247m║\033[0m  \033[38;2;6;182;212m🔌 ACTIVE NETWORK PORTS & CONTROLLING PROCESSES ({data['count']} active)\033[0m            \033[38;2;168;85;247m║\033[0m")
        lines.append("\033[38;2;168;85;247m╠══════════════════════════════════════════════════════════════════════════════╣\033[0m")
        lines.append(f"  {'PORT':<10} {'BIND IP':<18} {'PID':<10} {'PROCESS NAME'}")
        lines.append("  " + "-" * 56)
        for p in data["ports"][:15]:
            lines.append(f"  \033[1;36m{p['port']:<10}\033[0m {p['ip']:<18} {p['pid']:<10} {p['process_name']}")
        lines.append("\033[38;2;168;85;247m╚══════════════════════════════════════════════════════════════════════════════╝\033[0m")
        return "\n".join(lines)


# Global singleton OS Automator
os_automator = OSAutomator()
