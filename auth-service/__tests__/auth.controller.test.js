import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import bodyParser from 'body-parser';
import typeDefs  from '../src/schema/auth.schema.js';
import { resolvers } from '../src/resolvers/auth.resolver.js';
import { UserDAO } from '../src/models/dao/auth.dao.js';
import { loginBreaker, refreshTokenBreaker, registerUser } from '../src/service/auth.service.js';

process.env.JWT_SECRET = 'supersecret';

jest.mock('../src/models/dao/auth.dao.js');
jest.mock('../src/service/auth.service.js');
jest.mock('jsonwebtoken');

describe('Auth Controller', () => {
  let app;

  beforeAll(async () => {
    app = express();
    app.use(bodyParser.json());

    app.use((req, _res, next) => {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '');
      req.userId = null;

      if (token) {
        try {
          const payload = jwt.verify(token, process.env.JWT_SECRET);
          req.userId = payload.userId;
        } catch {
          // invalid token
        }
      }
      next();
    });

    const schema = makeExecutableSchema({ typeDefs, resolvers });
    const server = new ApolloServer({ schema });
    await server.start();

    app.use(
      '/api/auth',
      expressMiddleware(server, {
        context: async ({ req }) => ({ userId: req.userId }),
      })
    );
  });


  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('JWT Middleware', () => {
    it('should attach userId to request if token is valid', async () => {
      const token = 'valid-token';
      jwt.verify.mockReturnValue({ userId: '123' });

      await request(app)
        .post('/api/auth')
        .set('Authorization', `Bearer ${token}`)
        .send({ query: '{ me { id } }' });

      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET);
    });

    it('should continue without userId if token is invalid', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const res = await request(app)
        .post('/api/auth')
        .set('Authorization', 'Bearer invalid-token')
        .send({ query: '{ me { id } }' });

      expect(res.body.data.me).toBeNull();
    });
  });

  describe('GraphQL Mutations', () => {
    it('should call registerUser mutation', async () => {
      const mockUser = { id: '1', email: 'test@test.com' };
      registerUser.mockResolvedValue(mockUser);

      const query = `
        mutation {
          register(email: "test@test.com", password: "123456") {
            id
            email
          }
        }
      `;

      const res = await request(app).post('/api/auth').send({ query });

      expect(registerUser).toHaveBeenCalledWith({
        email: 'test@test.com',
        password: '123456',
      });
      expect(res.body.data.register).toEqual(mockUser);
    });

    it('should call loginBreaker mutation', async () => {
      const mockResult = {
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: '1', email: 'user@test.com' },
      };
      loginBreaker.fire.mockResolvedValue(mockResult);

      const query = `
        mutation {
          login(email: "user@test.com", password: "123456") {
            accessToken
            refreshToken
            user { id email }
          }
        }
      `;

      const res = await request(app).post('/api/auth').send({ query });

      expect(loginBreaker.fire).toHaveBeenCalledWith({
        email: 'user@test.com',
        password: '123456',
      });
      expect(res.body.data.login).toEqual(mockResult);
    });

    it('should call refreshTokenBreaker mutation', async () => {
      const mockResult = {
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        user: { id: '1', email: 'user@test.com' },
      };
      refreshTokenBreaker.fire.mockResolvedValue(mockResult);

      const query = `
        mutation {
          refreshToken(token: "old-token") {
            accessToken
            refreshToken
            user { id email }
          }
        }
      `;

      const res = await request(app).post('/api/auth').send({ query });

      expect(refreshTokenBreaker.fire).toHaveBeenCalledWith({ token: 'old-token' });
      expect(res.body.data.refreshToken).toEqual(mockResult);
    });
  });

  describe('GraphQL Query', () => {
    it('should return user for me query', async () => {
      const user = { id: '1', email: 'user@test.com' };
      UserDAO.findById.mockResolvedValue(user);
      jwt.verify.mockReturnValue({ userId: '1' });

      const query = `
        query {
          me {
            id
            email
          }
        }
      `;

      const res = await request(app)
        .post('/api/auth')
        .set('Authorization', 'Bearer token')
        .send({ query });

      expect(UserDAO.findById).toHaveBeenCalledWith('1');
      expect(res.body.data.me).toEqual(user);
    });
  });
});
