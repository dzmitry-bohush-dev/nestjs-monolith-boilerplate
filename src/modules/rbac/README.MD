# RBAC Module

Centralized, DB-backed role/permission/grant management with a dynamic in-memory cache, admin CRUD endpoints, and user-role assignment.

## Model

- **Role** — a named collection of grants (e.g. `admin`).
- **Permission** — a resource with a declared set of allowed `actions` (e.g. `rbac` → `['create', 'read', 'update', 'delete']`).
- **Grant** — links a role to a permission, optionally restricted to a subset of that permission's actions (`null`/empty `actions` = all of them).
- **UserRole** (`users_roles`) — many-to-many between users and roles.

Deleting a role or permission cascades to its grants; deleting a role also cascades to `users_roles`; deleting a user cascades to their `users_roles` rows. All via DB `ON DELETE CASCADE` — no "reject if referenced" checks.

## Access-check contract

Protect a route with:

```typescript
@UseGuards(JwtAuthGuard, PermissionGuard)
@CheckPermission('rbac', 'read')
```

`JwtAuthGuard` must run first — `PermissionGuard` reads `request.user` and throws if it's absent. `PermissionGuard` then calls `RbacCacheService.hasPermission(userId, permission, action)`, which is a pure in-memory lookup (no DB hit per request). A denial is recorded to `audit_logs` as `RBAC_ACCESS_DENIED` before the `ForbiddenException` is thrown.

A module outside `rbac/` that wants to reuse this needs `imports: [AuthModule, RbacModule]`.

## Caching

`RbacCacheService` holds the entire grants/user-roles graph in memory and reloads it in full on every mutation (`RBAC_CACHE_RELOADED` audit event) and on app startup (`OnModuleInit`). There is no Redis and no partial invalidation — this is a deliberate tradeoff for a monolith with a single instance; it does not survive multi-instance deployment without adding pub/sub invalidation (see `RBAC_IMPLEMENTATION_PLAN.md` non-goals).

If a reload fails after a mutation's DB write already committed, the write is not rolled back — the failure is logged (`console.error`) and swallowed, and the cache keeps serving its last-known-good state until the next successful reload.

## Endpoints

All under `/admin/rbac/*`, guarded by `@CheckPermission('rbac', <action>)` matching the HTTP verb (`GET` → `read`, `POST` → `create`, `PUT` → `update`, `DELETE` → `delete`):

| Resource        | Routes                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| Roles            | `GET/POST /admin/rbac/roles`, `PUT/DELETE /admin/rbac/roles/:roleId` |
| Permissions      | `GET/POST /admin/rbac/permissions`, `PUT/DELETE /admin/rbac/permissions/:permissionId` |
| Grants           | `GET/POST /admin/rbac/grants`, `PUT/DELETE /admin/rbac/grants/:grantId` |
| User roles       | `GET/POST /admin/rbac/users/:userId/roles`, `DELETE /admin/rbac/users/:userId/roles/:roleId` |

These endpoints are self-hosted: they're protected by the same `rbac` permission they let admins manage. A seed migration inserts the `admin` role, the `rbac` permission (`actions: ['create', 'read', 'update', 'delete']`), and a grant linking them (all actions) — but no user is assigned the `admin` role automatically. See below.

## Bootstrapping the first admin

There is no self-serve bootstrap endpoint. The very first admin must be assigned manually via a direct DB insert:

```sql
INSERT INTO users_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.email = '<first-admin-email>' AND r.name = 'admin';
```

Then restart the app (or otherwise trigger `RbacCacheService.reload()`) to pick up the assignment. This is the one case in this feature that genuinely needs a restart, since no admin session exists yet to trigger a reload via a mutation. Once at least one admin exists, all further role/permission/grant/user-role management happens through the `/admin/rbac/*` endpoints and reloads the cache automatically.
