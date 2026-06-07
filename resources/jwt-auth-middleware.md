# JWT Authentication Middleware

## What it is
An Express middleware that sits in front of protected routes and enforces that every request carries a valid JWT Bearer token. It verifies the token's signature, issuer, audience, and expiry via `jose`, checks the token against an in-memory revocation list, then attaches the decoded claims to `req.user` so downstream handlers can read them without re-parsing the token.

## Business use case
A SaaS API can't trust that the caller is who they claim to be without verifying a credential on every request. Without this layer, any request with a well-formed (but forged or expired) token would reach business logic. Worse, once a user logs out or a token is stolen, there's no way to stop it being replayed until it naturally expires. This middleware closes both gaps: it rejects bad tokens at the edge and can block specific JTI values immediately via the revocation list.

## What this implementation solves
- Extracts Bearer tokens from the `Authorization` header and rejects requests that lack one
- Delegates signature/issuer/audience/expiry checks to `verifyToken` (which uses `jose`'s `jwtVerify`) — a single call handles all four failure modes
- Checks a JTI-based revocation list so tokens can be invalidated before their TTL expires (e.g. logout, credential rotation)
- Attaches the decoded `JwtPayload` to `req.user` via a module-augmented Express `Request` type so handlers are fully typed
- Backfills `userId` into the per-request `AsyncLocalStorage` tenant context so downstream code that calls `getContext()` always has a populated `userId`

## What it still doesn't solve
- The revocation store is an in-memory `Set` — it is lost on restart and not shared across horizontally-scaled instances; production requires Redis (`SADD`/`SISMEMBER`) with TTL-matching token expiry
- No refresh token flow yet — the middleware only handles access tokens; token renewal is a separate endpoint
- Role/permission enforcement is not included — `req.user.roles` is available but no route-level RBAC guard exists yet
- The 401 responses are intentionally vague (`invalid_token`) — a logging layer should capture the real reason internally for debugging without leaking it to the client

## Key insight
The error response is deliberately generic: `{ error: 'invalid_token' }` for every failure mode after the token is extracted. Returning distinct errors per failure (`expired`, `bad_signature`, `wrong_issuer`) gives an attacker a precise oracle to probe. Log the real reason server-side; lie to the client.
