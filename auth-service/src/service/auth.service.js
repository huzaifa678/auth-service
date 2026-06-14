import bcrypt from 'bcrypt';
import { UserDAO, RefreshTokenDAO } from '#dao/auth.dao.js';
import { LoginDTO, CreateUserDTO, RefreshTokenDTO } from '#dto/auth.dto.js';
import { TokenService } from '#service/token.service.js';
import { authMetrics } from '#metrics/auth.metrics.js';
import { refreshTokenExpiryDate } from '#config/auth.config.js';
import { createBreaker } from './circuitBreaker.js';

const BCRYPT_SALT_ROUNDS = 10;

/** Persists a freshly issued refresh token for a user. */
const persistRefreshToken = (token, userId) =>
  RefreshTokenDAO.create({
    token,
    userId,
    expiresAt: refreshTokenExpiryDate(),
  });

const loginHandler = async ({ email, password }) => {
  const { email: validEmail, password: validPassword } = new LoginDTO({ email, password });

  const user = await UserDAO.findByEmail(validEmail);
  if (!user) {
    authMetrics.loginFailure.inc();
    throw new Error('Invalid username credential');
  }

  const passwordMatches = await bcrypt.compare(validPassword, user.password);
  if (!passwordMatches) {
    authMetrics.loginFailure.inc();
    throw new Error('Invalid password credential');
  }

  const { accessToken, refreshToken } = TokenService.issueTokenPair(user.id);
  await persistRefreshToken(refreshToken, user.id);

  authMetrics.loginSuccess.inc();
  return { accessToken, refreshToken, user };
};

const refreshTokenHandler = async ({ token }) => {
  const { token: validToken } = new RefreshTokenDTO({ token });
  authMetrics.refreshToken.inc();

  let payload;
  try {
    payload = TokenService.verifyRefreshToken(validToken);
  } catch {
    authMetrics.refreshTokenFailure.inc();
    throw new Error('Invalid refresh token');
  }

  const storedToken = await RefreshTokenDAO.find(validToken);
  if (!storedToken) {
    authMetrics.refreshTokenFailure.inc();
    throw new Error('Refresh token revoked');
  }

  const { accessToken, refreshToken } = TokenService.issueTokenPair(payload.userId);

  await RefreshTokenDAO.delete(validToken);
  await persistRefreshToken(refreshToken, payload.userId);

  const user = await UserDAO.findById(payload.userId);
  return { accessToken, refreshToken, user };
};

const unavailableResponse = (error) => ({
  error,
  accessToken: null,
  refreshToken: null,
  user: null,
});

export const loginBreaker = createBreaker(loginHandler, {
  fallback: () => {
    authMetrics.loginFallback.inc();
    return unavailableResponse('Authentication service temporarily unavailable');
  },
});

export const refreshTokenBreaker = createBreaker(refreshTokenHandler, {
  fallback: () => {
    authMetrics.refreshTokenFallback.inc();
    return unavailableResponse('Refresh token service temporarily unavailable');
  },
});

export const registerUser = async ({ email, password }) => {
  const { email: validEmail, password: validPassword } = new CreateUserDTO({ email, password });
  const hashedPassword = await bcrypt.hash(validPassword, BCRYPT_SALT_ROUNDS);
  return UserDAO.createUser({ email: validEmail, password: hashedPassword });
};
