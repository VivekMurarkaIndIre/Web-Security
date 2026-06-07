# Changelog

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
