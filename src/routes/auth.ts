import { Router } from 'express';
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
}
const pendingCodes = new Map<string, PendingCode>();

// ─── Schemas ────────────────────────────────────────────────────────────────

const authorizeSchema = z.object({
  response_type: z.literal('code'),
  client_id: z.string(),
  redirect_uri: z.url(),
  scope: z.string().default('openid'),
  state: z.string().optional(),
});

const tokenSchema = z.discriminatedUnion('grant_type', [
  z.object({
    grant_type: z.literal('authorization_code'),
    code: z.string(),
    redirect_uri: z.url(),
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

  const { client_id, redirect_uri, state } = result.data;

  // Generate a single-use random code
  const code = randomCode();
  pendingCodes.set(code, {
    clientId: client_id,
    redirectUri: redirect_uri,
    sub: 'user_001',       // stub — real IdP resolves from login session
    roles: ['viewer'],
    tenantId: 'tenant_demo',
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
