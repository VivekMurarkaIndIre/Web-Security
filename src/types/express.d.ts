import type { JwtPayload } from '../services/token.js';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
