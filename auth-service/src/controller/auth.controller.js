import express from 'express';
import { trace, context, propagation } from '@opentelemetry/api';
import logger from '#utils/logger.js';
import { authenticate } from '#middleware/auth.middleware.js';
import { apolloServer } from '#graphql/apollo.server.js';

const router = express.Router();
const tracer = trace.getTracer('auth-service');

router.use(authenticate);

router.post('/', async (req, res) => {
  const parentContext = propagation.extract(context.active(), req.headers);
  const span = tracer.startSpan('AuthGraphQLOperation', undefined, parentContext);

  try {
    const { query, variables } = req.body;

    const result = await context.with(trace.setSpan(parentContext, span), () =>
      apolloServer.executeOperation({
        query,
        variables,
        context: { userId: req.userId },
      })
    );

    res.json(result);
  } catch (err) {
    logger.warn('GraphQL execution failed', {
      error: err.message,
      path: req.path,
      service: 'auth-service',
    });

    res.status(500).json({ error: 'Internal server error' });
  } finally {
    span.end();
  }
});

export default router;
