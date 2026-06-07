import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

export interface JwtPayload {
  sub: string;
  roles: string[];
  tenant_id: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// jose requires Uint8Array, not a raw string
const secret = new TextEncoder().encode(env.JWT_SECRET);

export async function signTokenPair(
  sub: string,
  roles: string[],
  tenantId: string,
): Promise<TokenPair> {
  const now = Math.floor(Date.now() / 1000);

  const accessToken = await new SignJWT({ roles, tenant_id: tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setJti(randomUUID())
    .setIssuedAt(now)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setExpirationTime(now + env.JWT_ACCESS_TTL)
    .sign(secret);

  const refreshToken = await new SignJWT({ roles, tenant_id: tenantId, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setJti(randomUUID())
    .setIssuedAt(now)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setExpirationTime(now + env.JWT_REFRESH_TTL)
    .sign(secret);

  return { accessToken, refreshToken, expiresIn: env.JWT_ACCESS_TTL };
}

// In-memory stub — replace with Redis SADD/SISMEMBER in production
const revokedSet = new Set<string>();

export async function isTokenRevoked(jti: string): Promise<boolean> {
  return revokedSet.has(jti);
}

export async function revokeToken(jti: string): Promise<void> {
  revokedSet.add(jti);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });

  return payload as unknown as JwtPayload;
}
