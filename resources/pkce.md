# PKCE (Proof Key for Code Exchange)

## What it is
PKCE is a security extension to the OAuth 2.0 Authorization Code Flow that cryptographically binds an authorization code to the device that requested it. Before starting the flow, the client generates a random secret (`code_verifier`), hashes it into a `code_challenge`, and sends only the hash to the server. When exchanging the code for tokens, the client proves it holds the original secret by sending the verifier — the server recomputes the hash and compares.

## Business use case
Mobile apps and browser SPAs cannot safely store a `client_secret` — it would be visible in the app binary or source code. Without PKCE, a malicious app that registers the same URI scheme (e.g. `myapp://callback`) on a phone can intercept the redirect and steal the authorization code. With PKCE, the stolen code is useless — the attacker never saw the `code_verifier`, so they cannot pass the server's hash check.

## What this implementation solves
- `/authorize` accepts `code_challenge` and `code_challenge_method=S256` and stores the challenge alongside the pending code
- `/token` accepts `code_verifier`, computes `SHA-256(verifier)` using Node's `createHash`, and compares it to the stored challenge
- If a code was issued with a challenge but no verifier is sent → `400 invalid_grant`
- If the verifier doesn't match the challenge → `400 invalid_grant`
- Flows without PKCE still work — the challenge fields are optional, preserving backwards compatibility

## What it still doesn't solve
- **Optional enforcement** — the server does not require PKCE on every flow; a public client could skip it and the server would still issue tokens. Production should enforce PKCE for all public clients.
- **`code_challenge_method=plain`** — only `S256` is accepted here. The `plain` method (verifier sent as-is) offers no security benefit and should never be used; it is not implemented.
- **Code expiry** — codes still live in memory until used. A stolen code without the verifier is useless, but the map should still expire entries after ~60 seconds using Redis TTLs.
- **No `state` validation** — the `state` parameter is echoed back but not validated against a stored value, leaving a residual CSRF surface on the callback.

## Key insight
The verifier never travels over the network during the authorization step — only its hash does. An attacker intercepting the redirect gets a code and a hash. To redeem the code they need to reverse SHA-256, which is computationally infeasible. The security property is that the hash is a one-way commitment: you can prove you know the preimage without revealing it until the exact moment you need to.
