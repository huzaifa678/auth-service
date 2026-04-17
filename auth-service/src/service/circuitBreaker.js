import CircuitBreaker from 'opossum';
import logger from '../../logger.js' 

export function createBreaker(fn, options = {}) {
  let lastError = null; // initializing error for message 

  const defaultOptions = {
    timeout: 5000,      
    errorThresholdPercentage: 50, 
    resetTimeout: 10000, 
  };
  
  const { fallback, ...breakerOptions } = options;
  const breaker = new CircuitBreaker(fn, { ...defaultOptions, ...breakerOptions });

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