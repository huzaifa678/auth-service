import promClient from 'prom-client';

/**
 * Auth-related Prometheus counters, grouped in one module so the service layer
 * depends on a small metrics surface instead of constructing instrumentation
 * inline (Single Responsibility).
 */
export const authMetrics = {
  loginSuccess: new promClient.Counter({
    name: 'auth_login_success_total',
    help: 'Total successful login attempts',
  }),
  loginFailure: new promClient.Counter({
    name: 'auth_login_failure_total',
    help: 'Total failed login attempts',
  }),
  loginFallback: new promClient.Counter({
    name: 'auth_login_fallback_total',
    help: 'Login attempts hit circuit breaker fallback',
  }),
  refreshToken: new promClient.Counter({
    name: 'auth_refresh_token_total',
    help: 'Total refresh token requests',
  }),
  refreshTokenFailure: new promClient.Counter({
    name: 'auth_refresh_token_failure_total',
    help: 'Total failed refresh token requests',
  }),
  refreshTokenFallback: new promClient.Counter({
    name: 'auth_refresh_token_fallback_total',
    help: 'Refresh token attempts hit circuit breaker fallback',
  }),
};
