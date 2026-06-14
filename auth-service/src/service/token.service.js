import jwt from 'jsonwebtoken';
import { jwtConfig } from '#config/auth.config.js';

const { sign, verify } = jwt;

/**
 * Encapsulates all JWT signing/verification. The rest of the service layer asks
 * for "an access token for this user" instead of repeating secret + TTL wiring,
 * removing the duplicated `sign(...)` calls that were spread across handlers.
 */
export const TokenService = {
  signAccessToken(userId) {
    return sign({ userId }, jwtConfig.accessSecret, {
      expiresIn: jwtConfig.accessTokenTtl,
    });
  },

  signRefreshToken(userId) {
    return sign({ userId }, jwtConfig.refreshSecret, {
      expiresIn: jwtConfig.refreshTokenTtl,
    });
  },

  /** Issues a fresh access/refresh pair for a user id. */
  issueTokenPair(userId) {
    return {
      accessToken: this.signAccessToken(userId),
      refreshToken: this.signRefreshToken(userId),
    };
  },

  verifyAccessToken(token) {
    return verify(token, jwtConfig.accessSecret);
  },

  verifyRefreshToken(token) {
    return verify(token, jwtConfig.refreshSecret);
  },
};
