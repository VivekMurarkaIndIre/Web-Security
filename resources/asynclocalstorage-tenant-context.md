# AsyncLocalStorage Tenant Context

## What it is
`AsyncLocalStorage` (from Node's `async_hooks` module) lets you attach a value to the current asynchronous execution context — similar to thread-local storage in other languages. Any code that runs inside the callback passed to `storage.run(value, callback)` can retrieve that value with `storage.getStore()`, without needing to pass it through every function argument.

## Business use case
A SaaS app serving multiple tenants handles thousands of concurrent requests. Every database query, logger call, and audit event needs to know which tenant it belongs to — but threading `tenantId` through every function signature is tedious and error-prone. Without a scoped context, you either pass the data everywhere or risk mixing up tenant data under high concurrency, which is a serious data-isolation bug.

## What this implementation solves
- Scopes `tenantId`, `userId`, and `requestId` to each incoming HTTP request automatically via Express middleware
- Makes context available anywhere in the request's async call tree via `getContext()` — no prop-drilling required
- Generates a unique `requestId` per request for correlation across logs and downstream calls
- Reads `x-tenant-id` from the request header so the caller declares their tenant identity

## What it still doesn't solve
- `userId` is seeded as an empty string — it needs to be populated after JWT verification (a later middleware step)
- The `x-tenant-id` header is trusted blindly; in production it should be validated against a list of known tenants or derived from the verified JWT claim, not taken raw from the header
- No structured logging wires the `requestId` into log output yet
- No test coverage — the middleware relies on the async call tree being correctly maintained, which is worth an integration test with concurrent requests

## Key insight
Never use `tenantStorage.enterWith()` in Express middleware. Unlike `run()`, which scopes the store only to the async subtree spawned inside its callback, `enterWith()` mutates the current context in place — meaning it can bleed into other concurrent requests. Always use `run(value, next)` in middleware.
