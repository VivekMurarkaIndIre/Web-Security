import type { Request, Response, NextFunction } from 'express';
import { verifyToken, isTokenRevoked } from '../services/token.js';
import { getContext } from './tenant.js';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  // 1. Bearer token must be present
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing_token' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    // 2. Verify signature, issuer, audience, expiry — jose throws if any fail
    const payload = await verifyToken(token);

    // 3. Check blocklist — catches revoked tokens (logout, stolen token)
    if (await isTokenRevoked(payload.jti)) {
      res.status(401).json({ error: 'token_revoked' });
      return;
    }

    // 4. Attach to request so handlers can read claims
    req.user = payload;

    // 5. Backfill userId into the tenant context seeded by tenantMiddleware
    getContext().userId = payload.sub;

    next();
  } catch {
    // Intentionally vague — don't tell the client which check failed
    res.status(401).json({ error: 'invalid_token' });
  }
}
