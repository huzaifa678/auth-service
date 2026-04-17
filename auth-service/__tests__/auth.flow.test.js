import request from 'supertest';
import jwt from 'jsonwebtoken'
import express from 'express';
import bodyParser from 'body-parser';
import { ApolloServer } from '@apollo/server';
import typeDefs from '../src/schema/auth.schema.js';
import { resolvers } from '../src/resolvers/auth.resolver.js';
import { expressMiddleware } from '@as-integrations/express5';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { UserDAO } from '../src/models/dao/auth.dao.js';
import { loginBreaker, refreshTokenBreaker, registerUser } from '../src/service/auth.service.js';


process.env.JWT_SECRET = 'supersecret';

jest.mock('../src/models/dao/auth.dao.js');
jest.mock('../src/service/auth.service.js');
jest.mock('jsonwebtoken');
jest.mock('bcrypt');

describe('Auth Integration Flow', () => {
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
        context: async ({ req }) => ({ userId: req.userId || null }),
      })
    );
  });


  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should register, login, fetch me, and refresh token successfully', async () => {
    const mockUser = { id: '1', email: 'test@test.com' };

    registerUser.mockResolvedValue(mockUser);
    const registerQuery = `
      mutation {
        register(email: "test@test.com", password: "123456") {
          id
          email
        }
      }
    `;

    const registerRes = await request(app)
      .post('/api/auth')
      .send({ query: registerQuery });

    expect(registerUser).toHaveBeenCalledWith({ email: 'test@test.com', password: '123456' });
    expect(registerRes.body.data.register).toEqual(mockUser);

    const loginTokens = { accessToken: 'access-token', refreshToken: 'refresh-token', user: mockUser };
    loginBreaker.fire.mockResolvedValue(loginTokens);

    const loginQuery = `
      mutation {
        login(email: "test@test.com", password: "123456") {
          accessToken
          refreshToken
          user { id email }
        }
      }
    `;

    const loginRes = await request(app)
      .post('/api/auth')
      .send({ query: loginQuery });

    expect(loginBreaker.fire).toHaveBeenCalledWith({ email: 'test@test.com', password: '123456' });
    expect(loginRes.body.data.login).toEqual(loginTokens);

    jwt.verify.mockReturnValue({ userId: '1' });
    UserDAO.findById.mockResolvedValue(mockUser);

    const meQuery = `
      query {
        me {
          id
          email
        }
      }
    `;

    const meRes = await request(app)
      .post('/api/auth')
      .set('Authorization', `Bearer ${loginTokens.accessToken}`)
      .send({ query: meQuery });

    expect(jwt.verify).toHaveBeenCalledWith('access-token', process.env.JWT_SECRET);
    expect(UserDAO.findById).toHaveBeenCalledWith('1');
    expect(meRes.body.data.me).toEqual(mockUser);

    const refreshedTokens = { accessToken: 'new-access', refreshToken: 'new-refresh', user: mockUser };
    refreshTokenBreaker.fire.mockResolvedValue(refreshedTokens);

    const refreshQuery = `
      mutation {
        refreshToken(token: "refresh-token") {
          accessToken
          refreshToken
          user { id email }
        }
      }
    `;

    const refreshRes = await request(app)
      .post('/api/auth')
      .send({ query: refreshQuery });

    expect(refreshTokenBreaker.fire).toHaveBeenCalledWith({ token: 'refresh-token' });
    expect(refreshRes.body.data.refreshToken).toEqual(refreshedTokens);
  });

  it('should return null for me query if JWT invalid', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('Invalid token'); });

    const meQuery = `
      query {
        me {
          id
          email
        }
      }
    `;

    const res = await request(app)
      .post('/api/auth')
      .set('Authorization', 'Bearer bad-token')
      .send({ query: meQuery });

    expect(res.body.data.me).toBeNull();
  });
});
