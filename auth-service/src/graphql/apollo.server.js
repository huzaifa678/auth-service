import { ApolloServer } from '@apollo/server';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import typeDefs from '#schema/auth.schema.js';
import { resolvers } from '#resolvers/auth.resolver.js';

/**
 * Builds and starts a single Apollo Server instance for the lifetime of the
 * process. Previously a new server was constructed and started on every
 * request, which is both wasteful and a correctness hazard; building the schema
 * once here keeps the request path cheap and stateless.
 */
const schema = makeExecutableSchema({ typeDefs, resolvers });

const apolloServer = new ApolloServer({
  schema,
  plugins: [ApolloServerPluginLandingPageLocalDefault()],
});

await apolloServer.start();

export { apolloServer };
