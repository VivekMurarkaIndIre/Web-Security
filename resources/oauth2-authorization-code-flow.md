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

## Key insight
The code exists because the redirect URL is public — it appears in browser history, server logs, and referrer headers. Putting an access token directly in a redirect URL would expose it immediately. The code is a throwaway placeholder that is worthless without a second server-side request. This is the "airlock" pattern: one door closes before the next opens.
