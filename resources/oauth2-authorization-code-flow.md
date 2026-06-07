# OAuth 2.0 Authorization Code Flow

## What it is
OAuth 2.0 is a delegation protocol — it lets a client obtain tokens representing a user's identity without ever seeing the user's password. The Authorization Code Flow is the most secure variant: the server issues a short-lived, single-use code first, and the client exchanges it for tokens in a second step. This double-door design keeps tokens out of URLs and browser history.

## Business use case
Any app that needs "Login with X" or issues its own session tokens uses this flow. Without it, clients would need to handle raw credentials, and a single leaked access token in a browser URL or server log would give an attacker unlimited access. The code-then-token exchange means intercepting the redirect gives you a worthless throwaway; only the party that knows the `redirect_uri` and `client_secret` can turn it into real tokens.

## What this implementation solves
- `GET /auth/authorize` validates query params with Zod and issues a one-time random code stored in memory
- `POST /auth/token` handles two grant types via a Zod discriminated union: `authorization_code` (code → token pair) and `refresh_token` (old refresh → new token pair)
- Codes are single-use — deleted from the map immediately on exchange
- `rotateRefreshToken` revokes the incoming refresh token's `jti` before issuing a new pair, making every refresh token one-time use
- Reuse detection: if a refresh token is used a second time, it returns `401` — the attacker's use invalidates the session

## What it still doesn't solve
- **No real client authentication** — any `client_id` string is accepted; a real IdP validates against a registered client registry
- **No code expiry** — codes live in the in-memory map until used; production codes should expire in 60 seconds (Redis TTL)
- **No user authentication** — the `/authorize` endpoint skips the login step entirely; a real IdP would show a login form and only issue a code after credential verification
- **No PKCE** — codes can be intercepted in mobile/SPA flows without Proof Key for Code Exchange (next topic)
- **In-memory revocation** — `revokedSet` is per-process; across multiple containers, a revoked token on Container A is still valid on Container B until Redis is wired in

## The three-token system — why not just one?

The naive approach: user logs in → server gives back one token → client uses it forever.

**Problem 1:** If the token is stolen, the attacker has access forever.
**Problem 2:** Making the token short-lived means the user has to log in every 15 minutes.
**Problem 3:** You can't revoke one token without also locking out the real user.

The three-token system solves all three.

### Full request flow

```
┌──────────┐                          ┌─────────────────────────────┐
│  Client  │                          │          Your Server         │
│  (curl)  │                          │  (IdP + Resource Server)     │
└────┬─────┘                          └──────────────┬──────────────┘
     │                                               │
     │  1. GET /auth/authorize                       │
     │  ?response_type=code                          │
     │  &client_id=test                              │
     │  &redirect_uri=.../callback                   │
     │  &state=xyz                                   │
     │──────────────────────────────────────────────>│
     │                                               │  generates short-lived
     │                                               │  one-time CODE
     │  2. 302 redirect to                           │
     │     /callback?code=abc123&state=xyz           │
     │<──────────────────────────────────────────────│
     │                                               │
     │  3. POST /auth/token                          │
     │  { grant_type: authorization_code,            │
     │    code: abc123,                              │
     │    redirect_uri: .../callback }               │
     │──────────────────────────────────────────────>│
     │                                               │  validates code
     │                                               │  deletes code (one-time)
     │                                               │  signs access token (15 min)
     │                                               │  signs refresh token (7 days)
     │  4. { accessToken, refreshToken }             │
     │<──────────────────────────────────────────────│
     │                                               │
     │  5. GET /admin/users                          │
     │  Authorization: Bearer <accessToken>          │
     │──────────────────────────────────────────────>│
     │                                               │  verifies signature
     │                                               │  checks expiry
     │                                               │  checks jti not revoked
     │                                               │  checks RBAC
     │  6. { users: [] }                             │
     │<──────────────────────────────────────────────│
     │                                               │
     │  ... 15 minutes later, access token expires...│
     │                                               │
     │  7. POST /auth/token                          │
     │  { grant_type: refresh_token,                 │
     │    refresh_token: <refreshToken> }            │
     │──────────────────────────────────────────────>│
     │                                               │  verifies refresh token
     │                                               │  revokes old jti
     │                                               │  issues new token PAIR
     │  8. { new accessToken, new refreshToken }     │
     │<──────────────────────────────────────────────│
```

### What each token actually is

**The Code (`abc123`)**
- Lives for ~60 seconds (our lab: lives until used)
- Single-use — deleted the moment it's exchanged
- Worthless on its own — can only be exchanged at `/token`
- Exists because the redirect URL is visible in browser history, server logs, and referrer headers. The code is a throwaway placeholder — even if it leaks, it can only be used once and only by the party that knows the `redirect_uri`

**The Access Token (JWT, 15 min)**
- Short-lived — expires in 900 seconds
- Sent on **every API request** as `Authorization: Bearer ...`
- Self-contained — validated by checking the signature, no DB lookup needed
- Short TTL means a stolen token has a limited blast radius — 15 minutes max

**The Refresh Token (JWT, 7 days)**
- Long-lived — the user's "stay logged in" credential
- **Never sent to the API** — only ever sent to `/auth/token`
- Single-use — each use rotates it (old jti revoked, new pair issued)
- Kept separate so even if an API server is compromised, it never sees the refresh token

### Security properties

| Threat | Mitigation |
|---|---|
| Access token stolen | Expires in 15 min — limited blast radius |
| Refresh token stolen | Rotation detects reuse — attacker's use invalidates the legitimate session |
| User logs out | Revoke both the access token jti and the refresh token jti |
| API server compromised | Refresh tokens never reach API servers — they only go to `/auth/token` |

## Replacing this with a real third-party OAuth provider

When you integrate Auth0, Google, GitHub, or any other IdP, your server stops being the token issuer and becomes a **Resource Server** — it only validates tokens, never signs them.

### What changes

**Everything in `src/routes/auth.ts` gets deleted.**
The `/authorize` and `/token` endpoints are replaced by the provider's own URLs. You redirect users there; the provider handles login UI, MFA, social login, etc.

**What replaces it on your server:**

```
┌──────────┐        ┌──────────────┐        ┌─────────────────────┐
│  Browser │        │  Auth0/Google│        │    Your Server      │
│          │        │  (real IdP)  │        │  (Resource Server)  │
└────┬─────┘        └──────┬───────┘        └──────────┬──────────┘
     │                     │                           │
     │  1. GET /login       │                           │
     │─────────────────────────────────────────────────>│
     │                     │                           │  redirect to provider
     │  2. redirect to Auth0/authorize                 │
     │<─────────────────────────────────────────────────│
     │                     │                           │
     │  3. login at Auth0  │                           │
     │────────────────────>│                           │
     │                     │  issues code              │
     │  4. redirect to     │                           │
     │  /auth/callback     │                           │
     │     ?code=abc123    │                           │
     │<────────────────────│                           │
     │                     │                           │
     │  5. GET /auth/callback?code=abc123              │
     │─────────────────────────────────────────────────>│
     │                     │                           │  POST to Auth0 /token
     │                     │<──────────────────────────│  { code, client_secret }
     │                     │──────────────────────────>│  { id_token, access_token }
     │                     │                           │
     │                     │                           │  validate provider token
     │                     │                           │  extract sub, email, etc.
     │                     │                           │  issue YOUR OWN internal JWT
     │  6. { your accessToken, your refreshToken }     │
     │<─────────────────────────────────────────────────│
```

### Two patterns — which to use

**Pattern A: Use the provider's tokens directly**

Your server validates incoming tokens against the provider's JWKS endpoint (`/.well-known/jwks.json`). No token issuance on your side at all.

```
src/plugins/jwt.ts  →  point JWKS_URI at Auth0's JWKS endpoint
src/routes/auth.ts  →  delete entirely
src/services/token.ts  →  delete signTokenPair, keep verifyToken
```

✓ Simple — zero token issuance code to maintain  
✗ Your internal claims (`tenant_id`, `roles`) have to live in the provider's token, which means configuring custom claims in their dashboard  
✗ Every microservice needs to reach the provider's JWKS endpoint

**Pattern B: Token exchange (most common in production)**

Validate the provider's token on the callback, then issue your own internal JWT with your own claims and TTLs. Your internal services only ever see your token — the provider token is a one-time bootstrap.

```
GET /auth/callback:
  1. Exchange code with provider → get provider's id_token
  2. Verify id_token against provider's JWKS
  3. Extract sub + email
  4. Look up or create user in your DB
  5. Call signTokenPair(sub, roles, tenantId)  ← your own token
  6. Set cookie or return to client
```

✓ Full control over claims, TTLs, and token format  
✓ Internal services don't depend on the provider at runtime  
✓ Provider is only involved at login, not on every API call  
✗ You maintain the token issuance logic (which is what this lab is teaching)

### What stays exactly the same

All of this code is **unchanged** regardless of which provider you use:

| File | Why it stays |
|---|---|
| `src/middleware/authenticate.ts` | Still verifies a JWT — just from a different issuer |
| `src/middleware/rbac.ts` | Roles are in your token regardless of who issued it |
| `src/middleware/tenant.ts` | AsyncLocalStorage is request-scoped — provider-agnostic |
| `src/services/token.ts` | If using Pattern B, you still sign your own tokens |
| `src/config/env.ts` | `JWKS_URI` already supports pointing at an external endpoint |

### Concrete example — swapping in Auth0

```bash
# .env changes only:
JWKS_URI=https://your-tenant.auth0.com/.well-known/jwks.json
JWT_ISSUER=https://your-tenant.auth0.com/
JWT_AUDIENCE=https://your-api.com
```

Point `JWKS_URI` at Auth0, update `JWT_ISSUER` and `JWT_AUDIENCE` to match what Auth0 puts in its tokens — and your `authenticate` middleware works without a single line change. The `verifyToken` function already uses `JWKS_URI` when set (remote key fetch) and falls back to the symmetric secret when it's not.

## Key insight
The code exists because the redirect URL is public — it appears in browser history, server logs, and referrer headers. Putting an access token directly in a redirect URL would expose it immediately. The code is a throwaway placeholder that is worthless without a second server-side request. This is the "airlock" pattern: one door closes before the next opens.
