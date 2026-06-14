import { TokenService } from '#service/token.service.js';
import logger from '#utils/logger.js';

const BEARER_PREFIX = 'Bearer ';

/**
 * Express middleware that resolves the caller's user id from a Bearer access
 * token and attaches it to `req.userId` (or `null`). Extracted from the
 * controller so the HTTP transport stays free of authentication details.
 */
export const authenticate = (req, _res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith(BEARER_PREFIX)
    ? authHeader.slice(BEARER_PREFIX.length)
    : '';

  req.userId = null;

  if (token) {
    try {
      const payload = TokenService.verifyAccessToken(token);
      req.userId = payload.userId;
    } catch (error) {
      logger.warn('Invalid token', {
        error: error.message,
        path: req.path,
        service: 'auth-service',
      });
    }
  }

  next();
};
