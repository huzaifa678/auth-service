import CircuitBreaker from 'opossum';
import logger from '#utils/logger.js';
import { breakerConfig } from '#config/auth.config.js';

export function createBreaker(fn, options = {}) {
  let lastError = null; // initializing error for message

  const { fallback, ...breakerOptions } = options;
  const breaker = new CircuitBreaker(fn, { ...breakerConfig, ...breakerOptions });

  if (fallback) {
    breaker.fallback(fallback);
  }

  breaker.on('failure', (e) => {
    lastError = e;

    logger.error('Circuit breaker failure', {
      error: e.message,
      service: 'auth-service'
    });
  });

  breaker.on('open', () => {
    logger.warn('Circuit breaker opened', {
      error: lastError?.message,
      service: 'auth-service'
    });
  });

  breaker.on('halfOpen', () => {
    logger.info('Circuit breaker half-open', {
      error: lastError?.message,
      service: 'auth-service'
    });
  });

  return breaker;
}