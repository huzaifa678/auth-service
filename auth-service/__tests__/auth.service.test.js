import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserDAO, RefreshTokenDAO } from '../src/models/dao/auth.dao.js';
import { loginBreaker, refreshTokenBreaker, registerUser } from '../src/service/auth.service.js';

jest.mock('bcrypt');
jest.mock('jsonwebtoken');
jest.mock('../src/models/dao/auth.dao.js');

describe('Auth Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerUser', () => {
    it('should hash password and create user', async () => {
      bcrypt.hash.mockResolvedValue('hashed-password');
      UserDAO.createUser.mockResolvedValue({ id: '1', email: 'test@test.com' });

      const result = await registerUser({ email: 'test@test.com', password: '123456' });

      expect(bcrypt.hash).toHaveBeenCalledWith('123456', 10);
      expect(UserDAO.createUser).toHaveBeenCalledWith({ email: 'test@test.com', password: 'hashed-password' });
      expect(result).toEqual({ id: '1', email: 'test@test.com' });
    });
  });

  describe('loginBreaker', () => {
    it('should return tokens and user on successful login', async () => {
      const user = { id: '1', email: 'user@test.com', password: 'hashed' };
      UserDAO.findByEmail.mockResolvedValue(user);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockImplementation((payload) => `${payload.userId}-token`);

      const result = await loginBreaker.fire({ email: 'user@test.com', password: '123456' });

      expect(UserDAO.findByEmail).toHaveBeenCalledWith('user@test.com');
      expect(bcrypt.compare).toHaveBeenCalledWith('123456', 'hashed');
      expect(result.accessToken).toBe('1-token');
      expect(result.refreshToken).toBe('1-token');
      expect(result.user).toEqual(user);
      expect(RefreshTokenDAO.create).toHaveBeenCalled();
    });

    it('should throw error if email not found', async () => {
      UserDAO.findByEmail.mockResolvedValue(null);

      const result = await loginBreaker.fire({ email: 'noone@test.com', password: '123456' });
      expect(result.error).toBe('Authentication service temporarily unavailable'); // fallback triggered
    });

    it('should throw error if password invalid', async () => {
      const user = { id: '1', email: 'user@test.com', password: 'hashed' };
      UserDAO.findByEmail.mockResolvedValue(user);
      bcrypt.compare.mockResolvedValue(false);

      const result = await loginBreaker.fire({ email: 'user@test.com', password: 'wrong' });
      expect(result.error).toBe('Authentication service temporarily unavailable'); // fallback triggered
    });
  });

  describe('refreshTokenBreaker', () => {
    it('should return new tokens and user on successful refresh', async () => {
      const payload = { userId: '1' };
      jwt.verify.mockReturnValue(payload);
      RefreshTokenDAO.find.mockResolvedValue({ token: 'old-token' });
      RefreshTokenDAO.delete.mockResolvedValue(true);
      RefreshTokenDAO.create.mockResolvedValue(true);
      UserDAO.findById.mockResolvedValue({ id: '1', email: 'user@test.com' });
      jwt.sign.mockImplementation((payload) => `${payload.userId}-token`);

      const result = await refreshTokenBreaker.fire({ token: 'old-token' });

      expect(jwt.verify).toHaveBeenCalledWith('old-token', process.env.JWT_REFRESH_SECRET);
      expect(RefreshTokenDAO.find).toHaveBeenCalledWith('old-token');
      expect(result.accessToken).toBe('1-token');
      expect(result.refreshToken).toBe('1-token');
      expect(result.user).toEqual({ id: '1', email: 'user@test.com' });
    });

    it('should trigger fallback if token invalid', async () => {
      jwt.verify.mockImplementation(() => { throw new Error('Invalid token'); });

      const result = await refreshTokenBreaker.fire({ token: 'bad-token' });
      expect(result.error).toBe('Refresh token service temporarily unavailable');
    });

    it('should trigger fallback if token revoked', async () => {
      jwt.verify.mockReturnValue({ userId: '1' });
      RefreshTokenDAO.find.mockResolvedValue(null);

      const result = await refreshTokenBreaker.fire({ token: 'revoked-token' });
      expect(result.error).toBe('Refresh token service temporarily unavailable');
    });
  });
});
