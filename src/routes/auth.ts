import { Router } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { signTokenPair, rotateRefreshToken } from '../services/token.js';

export const authRouter = Router();

// In-memory code store — maps code → { clientId, redirectUri, sub, roles, tenantId }
// In production: short TTL in Redis (60 seconds max)
interface PendingCode {
  clientId: string;
  redirectUri: string;
  sub: string;
  roles: string[];
  tenantId: string;
  codeChallenge?: string; // SHA-256(code_verifier), base64url — present only for PKCE flows
}
const pendingCodes = new Map<string, PendingCode>();

// ─── Schemas ────────────────────────────────────────────────────────────────

const authorizeSchema = z.object({
  response_type: z.literal('code'),
  client_id: z.string(),
  redirect_uri: z.url(),
  scope: z.string().default('openid'),
  state: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.literal('S256').optional(),
});

const tokenSchema = z.discriminatedUnion('grant_type', [
  z.object({
    grant_type: z.literal('authorization_code'),
    code: z.string(),
    redirect_uri: z.url(),
    code_verifier: z.string().optional(),
  }),
  z.object({
    grant_type: z.literal('refresh_token'),
    refresh_token: z.string(),
  }),
]);

// ─── GET /auth/authorize ─────────────────────────────────────────────────────
// Real IdP: validate client_id, show login UI, then redirect after auth.
// Lab stub: skip login, issue a code immediately.

authRouter.get('/authorize', (req, res) => {
  const result = authorizeSchema.safeParse(req.query);

  if (!result.success) {
    res.status(400).json({ error: 'invalid_request', issues: result.error.issues });
    return;
  }

  const { client_id, redirect_uri, state, code_challenge } = result.data;

  // Generate a single-use random code
  const code = randomCode();
  pendingCodes.set(code, {
    clientId: client_id,
    redirectUri: redirect_uri,
    sub: 'user_001',       // stub — real IdP resolves from login session
    roles: ['viewer'],
    tenantId: 'tenant_demo',
    codeChallenge: code_challenge,
  });

  const dest = new URL(redirect_uri);
  dest.searchParams.set('code', code);
  if (state) dest.searchParams.set('state', state);

  res.redirect(dest.toString());
});

// ─── POST /auth/token ────────────────────────────────────────────────────────

authRouter.post('/token', async (req, res) => {
  const result = tokenSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({ error: 'invalid_request', issues: result.error.issues });
    return;
  }

  const body = result.data;

  if (body.grant_type === 'authorization_code') {
    const pending = pendingCodes.get(body.code);

    // Code not found, already used, or redirect_uri mismatch
    if (!pending || pending.redirectUri !== body.redirect_uri) {
      res.status(400).json({ error: 'invalid_grant' });
      return;
    }

    // PKCE check — if the code was issued with a challenge, the verifier is required
    if (pending.codeChallenge) {
      if (!body.code_verifier) {
        res.status(400).json({ error: 'invalid_grant', detail: 'code_verifier required' });
        return;
      }
      if (!verifyChallengeHash(body.code_verifier, pending.codeChallenge)) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
    }

    // One-time use — delete immediately
    pendingCodes.delete(body.code);

    const tokens = await signTokenPair(pending.sub, pending.roles, pending.tenantId);
    res.json(tokens);
    return;
  }

  // grant_type === 'refresh_token'
  try {
    const tokens = await rotateRefreshToken(body.refresh_token);
    res.json(tokens);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    // Reuse detection — invalidate the session entirely
    const status = message === 'refresh_token_reuse_detected' ? 401 : 400;
    res.status(status).json({ error: 'invalid_grant' });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// SHA-256(verifier) in base64url must match the stored challenge
function verifyChallengeHash(verifier: string, storedChallenge: string): boolean {
  const hash = createHash('sha256').update(verifier).digest('base64url');
  return hash === storedChallenge;
}
