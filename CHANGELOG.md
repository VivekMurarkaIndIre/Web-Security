# Changelog

## Role-Based Access Control (RBAC) — 2026-06-07

**What changed:**
- `src/middleware/rbac.ts` — new middleware with `requirePermission` and `requireRole` guards; a static `ROLE_PERMISSIONS` map derives `Resource:Action` permissions from JWT roles at check-time
- `src/server.ts` — three new protected routes wiring `authenticate` + `requirePermission`/`requireRole` together (`/admin/users`, `/admin/billing`, `/admin/audit`)

**What we learned:**
- Permissions belong on the server, roles belong in the token. Baking permissions into the JWT means re-issuing tokens every time policy changes; checking the database on every request throws away the benefit of stateless auth. The role-in-token / permission-on-server split buys both: stateless verification and instantly-effective policy updates. TypeScript template literal types (`\`${Resource}:${Action}\``) also make invalid permission strings a compile-time error, not a runtime typo.

## JWT Authentication Middleware — 2026-06-07

**What changed:**
- `src/middleware/authenticate.ts` — new middleware that extracts and verifies Bearer JWTs, checks a JTI revocation list, attaches decoded claims to `req.user`, and backfills `userId` into the `AsyncLocalStorage` tenant context
- `src/types/express.d.ts` — module augmentation extending Express `Request` with `user?: JwtPayload` for full type safety in handlers
- `src/services/token.ts` — added in-memory `revokedSet` with `isTokenRevoked` and `revokeToken` helpers (Redis stub for production)
- `src/server.ts` — wired `authenticate` middleware to a `/test-auth` smoke-test route; minor comment cleanup
- `src/middleware/tenant.ts` — added an explanatory comment describing why `AsyncLocalStorage` is safe for per-request context

**What we learned:**
- The 401 error body should be deliberately vague (`invalid_token`) regardless of which check failed — returning distinct codes per failure gives an attacker a precise oracle. Log the real reason internally; lie to the client. The other key pattern: the JTI claim exists precisely so you can revoke individual tokens without invalidating the whole signing key.

## AsyncLocalStorage Tenant Context — 2026-06-07

**What changed:**
- `src/middleware/tenant.ts` — new middleware that uses `AsyncLocalStorage` to scope `tenantId`, `userId`, and `requestId` to each request's async call tree
- `src/server.ts` — wired in `tenantMiddleware` globally and added a `/test-context` smoke-test route that calls `getContext()`
- `.claude/commands/commit.md` — updated commit command to generate topic resource files and update README

**What we learned:**
- `AsyncLocalStorage.run(value, callback)` scopes the store only to the async subtree inside the callback — making it safe for concurrent requests. The footgun is `enterWith()`, which mutates the current context and can bleed across concurrent requests; never use it in Express middleware.

## JWT signing + verification with jose — 2026-06-07

**What changed:**
- `src/services/token.ts` — new service using the `jose` library to sign HS256 access and refresh token pairs, and verify tokens with issuer/audience checks
- `src/config/env.ts` — added `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` env vars; switched from `safeParse` return value to `process.exit(1)` on failure so `env` is exported as a plain validated object
- `src/server.ts` — added a temporary `/test-token` smoke-test route; updated `app.listen` to use the now-direct `env.PORT` / `env.HOST`
- `package.json` — added `jose` dependency

**What we learned:**
- `jose` requires the secret as a `Uint8Array`, not a raw string — wrapping with `new TextEncoder().encode()` is the idiom. Separating access and refresh tokens at signing time (different TTLs, a `type: 'refresh'` claim) keeps verification simple: the server can reject a refresh token used as an access token by checking claims, not by maintaining a separate token store. Failing fast with `process.exit(1)` during env validation (rather than throwing inside the module) avoids partially-initialised module state that can cause confusing downstream errors.

## Express server + Zod env validation — 2026-06-07

**What changed:**
- `src/config/env.ts` — Zod schema that validates `PORT`, `NODE_ENV`, and `HOST` from `process.env` using `safeParse`
- `src/server.ts` — Express 5 server with a `/health` endpoint; throws at startup if env validation fails
- `package.json` / `tsconfig.json` — TypeScript project scaffolded with `express`, `zod`, `pino`, and `tsx` for dev
- `.env.example` — Documents the expected environment variables

**What we learned:**
- Zod's `safeParse` returns a discriminated union (`{ success: true, data } | { success: false, error }`), making it ideal for validating env at startup without crashing on first import — you can inspect the error before deciding to throw. Using `z.coerce.number()` handles the fact that all `process.env` values are strings. Failing fast at server boot (rather than at the first request that needs a missing var) is the key reliability win.
