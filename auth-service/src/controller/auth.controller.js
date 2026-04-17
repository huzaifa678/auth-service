import express from 'express';
import { ApolloServer } from '@apollo/server';
import { makeExecutableSchema } from '@graphql-tools/schema';
import jwt from 'jsonwebtoken';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { trace, context, propagation } from '@opentelemetry/api';
import logger from '../../logger.js' 
import typeDefs from '../schema/auth.schema.js';
import { resolvers } from '../resolvers/auth.resolver.js';

const router = express.Router();
const tracer = trace.getTracer('auth-service');

router.use((req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  req.userId = null;

  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = payload.userId;
    } catch (e) {
      logger.warn('Invalid token', { 
        error: e.message,
        path: req.path,
        service: 'auth-service' 
      });
    }
  }
  next();
});

router.post('/', async (req, res) => {
  const ctx = propagation.extract(context.active(), req.headers);
  const span = tracer.startSpan('AuthGraphQLOperation', undefined, ctx);

  try {
    const schema = makeExecutableSchema({ typeDefs, resolvers });

    const server = new ApolloServer({
      schema,
      plugins: [ApolloServerPluginLandingPageLocalDefault()],
    });

    await server.start();

    const { query, variables } = req.body;

    const result = await context.with(
      trace.setSpan(ctx, span),
      async () => {
        return server.executeOperation({
          query,
          variables,
          context: { userId: req.userId },
        });
      }
    );

    res.json(result);
  } catch (err) {
    logger.warn('GraphQL execution failed', { 
      error: err.message,
      path: req.path,
      service: 'auth-service' 
    });

    res.status(500).json({ error: 'Internal server error' });
  } finally {
    span.end();
  }
});

export default router;