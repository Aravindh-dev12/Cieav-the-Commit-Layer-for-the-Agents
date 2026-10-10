"""Access control tool – grant_access with revoke inverse."""
from __future__ import annotations
from typing import Any, Optional, Callable

from commit_layer.tools.base import BaseTool
from commit_layer.models import Outcome
from commit_layer import sandbox


class GrantAccessTool(BaseTool):
    name = 'grant_access'
    description = 'Grant a permission to a user'
    has_inverse = True

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        user = args.get('user', '')
        permission = args.get('permission', '')
        if user not in sandbox.access_list:
            sandbox.access_list[user] = set()
        sandbox.access_list[user].add(permission)
        return {'user': user, 'granted': permission}

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        before_access = before.get('access_list', {})
        after_access = after.get('access_list', {})
        # Check if any new permissions were added
        for user, perms in after_access.items():
            old_perms = before_access.get(user, set())
            if isinstance(perms, set) and isinstance(old_perms, set):
                if perms - old_perms:
                    return Outcome.OBSERVED_SUCCESS
        return Outcome.OBSERVED_FAILURE

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        def revoke():
            user = args.get('user', '')
            permission = args.get('permission', '')
            if user in sandbox.access_list and permission in sandbox.access_list[user]:
                sandbox.access_list[user].discard(permission)
                return {'user': user, 'revoked': permission}
            return {'error': 'Permission not found'}
        return revoke
