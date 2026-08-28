# Audit Log Module

Records security-relevant events (registration, login, etc.) to the `audit_logs` table.

## Explicit-call convention

There is **no interceptor, middleware, or decorator** that captures audit events automatically. Every event is recorded via an explicit call to `AuditLogService.record(...)` from the service that owns the business action.

This is deliberate:

- The call site is exactly where the outcome (success, duplicate, failure) and the relevant context (`userId`, `email`, `metadata`) are known — inferring that generically from a route or interceptor would be lossy or require ad-hoc conventions.
- It keeps audit logging visible in the code that triggers it, instead of hidden behind cross-cutting infrastructure.

If you add a new event, call `AuditLogService.record()` directly from the relevant service, for example:

```typescript
await this.auditLogService.record({
  eventType: 'USER_REGISTERED',
  userId: user.id,
  email: user.email,
  request, // FastifyRequest, if available — used to extract IP/user-agent
});
```

## Fields

| Field       | Type             | Notes                                               |
| ----------- | ---------------- | --------------------------------------------------- |
| `eventType` | `string`         | e.g. `USER_REGISTERED`, `USER_LOGGED_IN`            |
| `userId`    | `string \| null` | No FK to `users` — kept even if the user is deleted |
| `email`     | `string \| null` | Captured at event time (may predate account state)  |
| `ipAddress` | `string \| null` | Extracted from `FastifyRequest.ip`                  |
| `userAgent` | `string \| null` | Extracted from the `user-agent` header              |
| `metadata`  | `jsonb \| null`  | Free-form extra context                             |
