import express from 'express';
import { env } from './config/env.js';
import { signTokenPair, verifyToken } from './services/token.js';
import { tenantMiddleware, getContext } from './middleware/tenant.js';
import { authenticate } from './middleware/authenticate.js';
import { requirePermission, requireRole } from './middleware/rbac.js';
import { authRouter } from './routes/auth.js';

const app = express();

app.use(express.json());
app.use(tenantMiddleware);
app.use('/auth', authRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Temporary — remove after Topic 3
app.get('/test-token', async (_req, res) => {
  const tokens = await signTokenPair('user_001', ['viewer'], 'tenant_demo');
  const payload = await verifyToken(tokens.accessToken);
  res.json({ tokens, payload });
});

// Temporary — remove after Topic 4
app.get('/test-context', (_req, res) => {
  const ctx = getContext();
  res.json(ctx);
});

// Temporary — remove after Topic 5
app.get('/test-auth', authenticate, (req, res) => {
  res.json({ user: req.user, context: getContext() });
});

// Temporary — remove after Topic 6
app.get('/admin/users', authenticate, requirePermission('users:read'), (req, res) => {
  res.json({ users: [], requestedBy: req.user?.sub });
});

app.get('/admin/billing', authenticate, requirePermission('billing:write'), (_req, res) => {
  res.json({ billing: [] });
});

app.get('/admin/audit', authenticate, requireRole('admin'), (_req, res) => {
  res.json({ events: [] });
});

app.listen(env.PORT, env.HOST, () => {
  console.log(`Server listening on http://${env.HOST}:${env.PORT}`);
});
