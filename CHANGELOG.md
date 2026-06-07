# Changelog

## Express server + Zod env validation — 2026-06-07

**What changed:**
- `src/config/env.ts` — Zod schema that validates `PORT`, `NODE_ENV`, and `HOST` from `process.env` using `safeParse`
- `src/server.ts` — Express 5 server with a `/health` endpoint; throws at startup if env validation fails
- `package.json` / `tsconfig.json` — TypeScript project scaffolded with `express`, `zod`, `pino`, and `tsx` for dev
- `.env.example` — Documents the expected environment variables

**What we learned:**
- Zod's `safeParse` returns a discriminated union (`{ success: true, data } | { success: false, error }`), making it ideal for validating env at startup without crashing on first import — you can inspect the error before deciding to throw. Using `z.coerce.number()` handles the fact that all `process.env` values are strings. Failing fast at server boot (rather than at the first request that needs a missing var) is the key reliability win.
