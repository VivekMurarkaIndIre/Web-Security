import type { Request, Response, NextFunction } from 'express';

type Resource   = 'users' | 'billing' | 'audit';
type Action     = 'read' | 'write';
export type Permission = `${Resource}:${Action}`;

// Roles are stored in the JWT. Permissions are derived here at check-time,
// so changing what a role can do never requires re-issuing tokens.
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin:  ['users:read', 'users:write', 'billing:read', 'billing:write', 'audit:read'],
  editor: ['users:read', 'billing:read'],
  viewer: ['users:read'],
};

export function requirePermission(...required: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }

    const granted = new Set(
      req.user.roles.flatMap((role) => ROLE_PERMISSIONS[role] ?? []),
    );

    const missing = required.filter((p) => !granted.has(p));

    if (missing.length > 0) {
      res.status(403).json({ error: 'forbidden', missing });
      return;
    }

    next();
  };
}

export function requireRole(...allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }

    const hasRole = allowed.some((role) => req.user!.roles.includes(role));

    if (!hasRole) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    next();
  };
}
