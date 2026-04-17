import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserDAO, RefreshTokenDAO } from '../models/dao/auth.dao.js';
import { LoginDTO, CreateUserDTO, RefreshTokenDTO } from '../models/dto/auth.dto.js';
import { createBreaker } from './circuitBreaker.js';
import promClient from 'prom-client';

const loginSuccessCounter = new promClient.Counter({ name: 'auth_login_success_total', help: 'Total successful login attempts' });
const loginFailureCounter = new promClient.Counter({ name: 'auth_login_failure_total', help: 'Total failed login attempts' });
const loginFallbackCounter = new promClient.Counter({ name: 'auth_login_fallback_total', help: 'Login attempts hit circuit breaker fallback' });

const refreshTokenCounter = new promClient.Counter({ name: 'auth_refresh_token_total', help: 'Total refresh token requests' });
const refreshTokenFailureCounter = new promClient.Counter({ name: 'auth_refresh_token_failure_total', help: 'Total failed refresh token requests' });
const refreshTokenFallbackCounter = new promClient.Counter({ name: 'auth_refresh_token_fallback_total', help: 'Refresh token attempts hit circuit breaker fallback' });

const { sign, verify } = jwt;

const loginHandler = async ({ email, password }) => {
  const dto = new LoginDTO({ email, password });

  const user = await UserDAO.findByEmail(dto.email);
  if (!user) {
    loginFailureCounter.inc();
    throw new Error('Invalid username credential');
  }

  const valid = await bcrypt.compare(dto.password, user.password);
  if (!valid) {
    loginFailureCounter.inc();
    throw new Error('Invalid password credential');
  }

  const accessToken = sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.ACCESS_TOKEN_TTL });
  const refreshToken = sign({ userId: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.REFRESH_TOKEN_TTL });

  await RefreshTokenDAO.create({
    token: refreshToken,
    userId: user.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  loginSuccessCounter.inc();
  return { accessToken, refreshToken, user };
};

const refreshTokenHandler = async ({ token }) => {
  const dto = new RefreshTokenDTO({ token });
  refreshTokenCounter.inc();

  let payload;
  try {
    payload = verify(dto.token, process.env.JWT_REFRESH_SECRET);
  } catch {
    refreshTokenFailureCounter.inc();
    throw new Error('Invalid refresh token');
  }

  const storedToken = await RefreshTokenDAO.find(dto.token);
  if (!storedToken) {
    refreshTokenFailureCounter.inc();
    throw new Error('Refresh token revoked');
  }

  const accessToken = sign({ userId: payload.userId }, process.env.JWT_SECRET, { expiresIn: process.env.ACCESS_TOKEN_TTL });
  const refreshToken = sign({ userId: payload.userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.REFRESH_TOKEN_TTL });

  await RefreshTokenDAO.delete(dto.token);
  await RefreshTokenDAO.create({
    token: refreshToken,
    userId: payload.userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const user = await UserDAO.findById(payload.userId);
  return { accessToken, refreshToken, user };
};

export const loginBreaker = createBreaker(loginHandler, {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 10000,
  fallback: () => {
    loginFallbackCounter.inc();
    return { error: 'Authentication service temporarily unavailable', accessToken: null, refreshToken: null, user: null };
  },
});

export const refreshTokenBreaker = createBreaker(refreshTokenHandler, {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 10000,
  fallback: () => {
    refreshTokenFallbackCounter.inc();
    return { error: 'Refresh token service temporarily unavailable', accessToken: null, refreshToken: null, user: null };
  },
});

export const registerUser = async ({ email, password }) => {
  const dto = new CreateUserDTO({ email, password });
  const hashed = await bcrypt.hash(dto.password, 10);
  return UserDAO.createUser({ email: dto.email, password: hashed });
};
