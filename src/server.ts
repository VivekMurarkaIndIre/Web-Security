import express from 'express';
import { env } from './config/env.js';

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

if (!env.success) {
  throw new Error(`Invalid environment configuration: ${env.error.message}`);
}

app.listen(env.data.PORT, env.data.HOST, () => {
  console.log(`Server listening on http://${env.data.HOST}:${env.data.PORT}`);
});
