"""File tools – delete_file with restore from trash."""
from __future__ import annotations
from typing import Any, Optional, Callable

from commit_layer.tools.base import BaseTool
from commit_layer.models import Outcome
from commit_layer import sandbox


class DeleteFileTool(BaseTool):
    name = 'delete_file'
    description = 'Move a file from the fake filesystem to the trash'
    has_inverse = True

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        filename = args.get('filename', '')
        if filename in sandbox.fake_filesystem:
            content = sandbox.fake_filesystem.pop(filename)
            sandbox.fake_trash[filename] = content
            return {'deleted': filename}
        return {'deleted': None, 'error': 'File not found'}

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        before_files = set(before.get('filesystem', {}).keys())
        after_files = set(after.get('filesystem', {}).keys())
        after_trash = set(after.get('trash', {}).keys())
        deleted = before_files - after_files
        if deleted and deleted.issubset(after_trash):
            return Outcome.OBSERVED_SUCCESS
        return Outcome.OBSERVED_FAILURE

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        def restore():
            filename = args.get('filename', '')
            if filename in sandbox.fake_trash:
                content = sandbox.fake_trash.pop(filename)
                sandbox.fake_filesystem[filename] = content
                return {'restored': filename}
            return {'error': 'File not in trash'}
        return restore
