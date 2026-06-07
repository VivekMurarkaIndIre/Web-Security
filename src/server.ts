import express from 'express';
import { env } from './config/env.js';
import { signTokenPair, verifyToken } from './services/token.js';
import { tenantMiddleware, getContext } from './middleware/tenant.js';

const app = express();

app.use(express.json());
app.use(tenantMiddleware);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Temporary smoke test — remove after Topic 3
app.get('/test-token', async (_req, res) => {
  const tokens = await signTokenPair('user_001', ['viewer'], 'tenant_demo');
  const payload = await verifyToken(tokens.accessToken);
  res.json({ tokens, payload });
});

// Temporary smoke test — remove after Topic 4
app.get('/test-context', (_req, res) => {
  const ctx = getContext();
  res.json(ctx);
});

app.listen(env.PORT, env.HOST, () => {
  console.log(`Server listening on http://${env.HOST}:${env.PORT}`);
});
