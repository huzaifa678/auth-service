/**
 * Centralized configuration derived from the environment.
 *
 * Keeping every `process.env` read and tuning constant in one place means the
 * rest of the codebase depends on a typed-ish config object rather than on
 * scattered, stringly-typed environment lookups (Dependency Inversion).
 */

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const jwtConfig = {
  accessSecret: process.env.JWT_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL,
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL,
};

/** How long a persisted refresh token remains valid. */
export const refreshTokenLifetimeMs = 7 * DAY_IN_MS;

/** Shared circuit-breaker tuning for the auth handlers. */
export const breakerConfig = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 10000,
};

/** Returns the absolute expiry date for a newly issued refresh token. */
export const refreshTokenExpiryDate = () =>
  new Date(Date.now() + refreshTokenLifetimeMs);
