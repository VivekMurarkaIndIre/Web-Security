# OIDC Discovery Document

## What it is
OpenID Connect requires every identity provider to publish a self-describing JSON document at `/.well-known/openid-configuration`. It lists every endpoint the IdP exposes — authorization, token, userinfo, JWKS — along with the algorithms, scopes, and grant types it supports. Clients fetch this one URL at startup and configure themselves automatically from the response.

## Business use case
Without a discovery document, every client integration requires manual configuration: hardcode the token endpoint here, the JWKS URL there, list the supported scopes somewhere else. When you move an endpoint or add a grant type, every client breaks until someone updates their config. With discovery, you hand clients one URL — the issuer — and they self-configure. This is how `OIDC_ISSUER=https://accounts.google.com` in a config file is enough for a library to find every Google endpoint, verify tokens, and handle logout — no other config needed.

## What this implementation solves
- `GET /.well-known/openid-configuration` returns a fully populated metadata document with all endpoints derived from `OIDC_ISSUER` — changing one env var updates every pointer simultaneously
- `GET /.well-known/jwks.json` returns `{ keys: [] }` — the endpoint exists (required by every OIDC client) even though HS256 has no public key to publish
- `OIDC_ISSUER` added to Zod env schema — validated at boot, used as the single source of truth for all URLs in the document
- `oidcRouter` mounted at root (not under `/auth`) so `/.well-known/*` paths are at the standard location OIDC clients expect

## What it still doesn't solve
- **`jwks.json` is empty** — switching to RS256 asymmetric signing would populate this with a real public JWK, enabling external services to verify tokens without a shared secret
- **No caching headers** — discovery documents are meant to be cached aggressively; production should set `Cache-Control: max-age=86400` on the response
- **`userinfo_endpoint` is a stub** — `/api/me` exists but returns only JWT claims, not a full OIDC UserInfo response with standardised claim names (`given_name`, `email_verified`, etc.)
- **`revocation_endpoint` listed but not built** — `/auth/revoke` is advertised in the document but the route doesn't exist yet

## Key insight
The discovery document is a contract, not just documentation. OIDC client libraries treat it as authoritative — they will call `jwks_uri` to fetch signing keys, call `token_endpoint` to exchange codes, and reject tokens whose `iss` claim doesn't match the `issuer` field. Keeping all URLs derived from one `OIDC_ISSUER` value ensures the contract is self-consistent. Hardcoding any URL in the document creates a drift risk — the document says one thing, the server does another, and clients fail silently.
