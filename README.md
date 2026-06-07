# Web Security Lab

A hands-on auth engineering lab built topic by topic.

## Topics

- [AsyncLocalStorage Tenant Context](resources/asynclocalstorage-tenant-context.md)
- [JWT Authentication Middleware](resources/jwt-auth-middleware.md)
- [Role-Based Access Control (RBAC)](resources/role-based-access-control.md)
- [OAuth 2.0 Authorization Code Flow](resources/oauth2-authorization-code-flow.md)
- [PKCE (Proof Key for Code Exchange)](resources/pkce.md)
- [OIDC Discovery Document](resources/oidc-discovery.md)

---

## Running the server

```bash
npm run dev
# Server listening on http://localhost:3000
```

---

## curl Cheatsheet

### Health check

```bash
curl http://localhost:3000/health
```
```json
{ "status": "ok" }
```

---

### Tenant context (AsyncLocalStorage)

```bash
# No header — falls back to 'default'
curl http://localhost:3000/test-context

# With tenant header
curl -H 'x-tenant-id: acme-corp' http://localhost:3000/test-context
```
```json
{ "tenantId": "acme-corp", "userId": "", "requestId": "550e8400-..." }
```

---

### JWT — issue and inspect a token

```bash
curl http://localhost:3000/test-token | jq
```
```json
{
  "tokens": {
    "accessToken": "<jwt>",
    "refreshToken": "<jwt>",
    "expiresIn": 900
  },
  "payload": {
    "sub": "user_001",
    "roles": ["viewer"],
    "tenant_id": "tenant_demo",
    "jti": "<uuid>",
    "iat": 1234567890,
    "exp": 1234568790
  }
}
```

Paste any `accessToken` into [jwt.io](https://jwt.io) to inspect the decoded header and claims.

---

### Authentication middleware

```bash
# No token → 401
curl http://localhost:3000/test-auth

# Tampered token → 401
curl -H "Authorization: Bearer abc.def.ghi" http://localhost:3000/test-auth

# Valid token → 200 with user + context
TOKEN=$(curl -s http://localhost:3000/test-token | jq -r '.tokens.accessToken')
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/test-auth
```
```json
{
  "user": { "sub": "user_001", "roles": ["viewer"], "tenant_id": "tenant_demo", ... },
  "context": { "tenantId": "tenant_demo", "userId": "user_001", "requestId": "..." }
}
```

---

### RBAC — role-based access control

The token from `/test-token` has the `viewer` role, which only has `users:read`.

```bash
TOKEN=$(curl -s http://localhost:3000/test-token | jq -r '.tokens.accessToken')

# viewer has users:read → 200
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/users

# viewer missing billing:write → 403
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/billing

# viewer missing admin role → 403
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/audit

# no token → 401
curl http://localhost:3000/admin/users
```

Expected responses:
```json
// 200
{ "users": [], "requestedBy": "user_001" }

// 403
{ "error": "forbidden", "missing": ["billing:write"] }

// 401
{ "error": "missing_token" }
```

---

### OAuth 2.0 — full authorization code flow

```bash
# Step 1 — get a code
CODE=$(curl -si "http://localhost:3000/auth/authorize?response_type=code&client_id=test&redirect_uri=http://localhost:3000/callback&state=xyz" \
  | grep -i "location:" \
  | sed 's/.*code=\([^& ]*\).*/\1/' \
  | tr -d '\r')

echo "Code: $CODE"

# Step 2 — exchange code for tokens
TOKENS=$(curl -s -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\": \"authorization_code\", \"code\": \"$CODE\", \"redirect_uri\": \"http://localhost:3000/callback\"}")

echo $TOKENS | jq

# Step 3 — rotate refresh token
REFRESH=$(echo $TOKENS | jq -r '.refreshToken')

curl -s -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\": \"refresh_token\", \"refresh_token\": \"$REFRESH\"}" | jq

# Step 4 — reuse the same refresh token → 401 (reuse detection)
curl -s -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\": \"refresh_token\", \"refresh_token\": \"$REFRESH\"}" | jq
```

Expected on Step 4:
```json
{ "error": "invalid_grant" }
```

---

### PKCE flow

```bash
# Generate verifier and challenge
VERIFIER="a_random_string_at_least_43_characters_long_abcdefghij"
CHALLENGE=$(echo -n "$VERIFIER" | openssl dgst -sha256 -binary | openssl base64 | tr '+/' '-_' | tr -d '=')

# Authorize with challenge
CODE=$(curl -si "http://localhost:3000/auth/authorize?response_type=code&client_id=test&redirect_uri=http://localhost:3000/callback&code_challenge=$CHALLENGE&code_challenge_method=S256" \
  | grep -i "location:" \
  | sed 's/.*code=\([^& ]*\).*/\1/' \
  | tr -d '\r')

# Exchange with correct verifier → 200
curl -s -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"authorization_code\",\"code\":\"$CODE\",\"redirect_uri\":\"http://localhost:3000/callback\",\"code_verifier\":\"$VERIFIER\"}" | jq

# Exchange with wrong verifier → 400
CODE2=$(curl -si "http://localhost:3000/auth/authorize?response_type=code&client_id=test&redirect_uri=http://localhost:3000/callback&code_challenge=$CHALLENGE&code_challenge_method=S256" \
  | grep -i "location:" \
  | sed 's/.*code=\([^& ]*\).*/\1/' \
  | tr -d '\r')

curl -s -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"authorization_code\",\"code\":\"$CODE2\",\"redirect_uri\":\"http://localhost:3000/callback\",\"code_verifier\":\"wrong_verifier\"}" | jq
```
```json
{ "error": "invalid_grant" }
```

---

### OIDC discovery

```bash
# Full metadata document
curl -s http://localhost:3000/.well-known/openid-configuration | jq

# JWKS (empty — HS256 has no public key)
curl -s http://localhost:3000/.well-known/jwks.json | jq
```
```json
// openid-configuration
{
  "issuer": "http://localhost:3000",
  "authorization_endpoint": "http://localhost:3000/auth/authorize",
  "token_endpoint": "http://localhost:3000/auth/token",
  "jwks_uri": "http://localhost:3000/.well-known/jwks.json",
  ...
}

// jwks.json
{ "keys": [] }
```

---

### Env validation failure test

```bash
PORT=abc npm run dev
# crashes immediately with a readable Zod error — server never starts
```
