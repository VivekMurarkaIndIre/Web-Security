# Role-Based Access Control (RBAC)

## What it is
RBAC is a pattern where access to resources is governed by roles assigned to a user rather than by directly listing every allowed action per user. Roles (e.g. `admin`, `editor`, `viewer`) are stored in the JWT; permissions (e.g. `billing:write`) are derived from those roles at request time by the server, never stored in the token itself.

## Business use case
A SaaS platform needs different users to have different capabilities — a billing manager should be able to write invoices but not audit logs, while an admin can do both. Without RBAC, you'd either hard-code user IDs into route guards (breaks at scale) or put a full permission list in the JWT (bloats the token and requires re-issuing it every time access rules change). RBAC solves this by keeping the token thin (just roles) and centralising permission logic on the server so rules can change without re-authenticating every user.

## What this implementation solves
- `requirePermission(...perms)` middleware derives a `Set<Permission>` from the user's roles at check-time, then rejects with 403 if any required permission is missing — all in one pass
- `requireRole(...roles)` provides a coarser role-level guard for routes that don't map cleanly to resource:action permissions
- The `ROLE_PERMISSIONS` map is the single source of truth: changing what `editor` can do is a one-line change, and the new policy takes effect on the next request without reissuing tokens
- TypeScript template literal types (`\`${Resource}:${Action}\``) make invalid permission strings a compile-time error, not a runtime typo
- The middleware distinguishes 401 (no `req.user` — authentication missing) from 403 (authenticated but not authorised) correctly

## What it still doesn't solve
- The `ROLE_PERMISSIONS` map is hardcoded — a production system would load this from a database or policy store (OPA, Casbin) so non-engineers can manage roles without a deploy
- No multi-tenancy enforcement yet — a user with `billing:write` on tenant A could theoretically hit tenant B's billing route if tenant isolation isn't enforced upstream
- There's no `requirePermission` that supports OR logic (any of these permissions) — only AND (all required permissions must be granted)
- Roles are trusted as-is from the JWT claims; there's no check that the role still exists or hasn't been revoked in a directory service
- No audit trail: denied requests are not logged, so there's no visibility into who is trying to access what they shouldn't

## Key insight
Permissions live on the server, roles live in the token. This is the right split: the JWT tells you *who the user is*, the server decides *what that means*. If you bake permissions into the JWT, you need to re-issue tokens every time access policy changes — which is operationally painful. If you check roles from the database on every request, you've lost most of the benefit of stateless JWTs. The role-in-token / permission-on-server pattern gives you both: stateless verification and flexible, instantly-effective policy changes.
