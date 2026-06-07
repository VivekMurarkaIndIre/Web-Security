import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export interface TenantContext {
  tenantId: string;
  userId: string;
  requestId: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getContext(): TenantContext {
  const ctx = tenantStorage.getStore();
  if (!ctx) throw new Error('TenantContext accessed outside request scope');
  return ctx;
}

export function tenantMiddleware(req: Request, _res: Response, next: NextFunction) {
  const tenantId = (req.headers['x-tenant-id'] as string) ?? 'default';
  const requestId = randomUUID();

  // run() scopes the context to this request's async tree only.
  // enterWith() would leak across concurrent requests — never use it in middleware.
  tenantStorage.run({ tenantId, userId: '', requestId }, next);
}
