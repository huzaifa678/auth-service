import { loginBreaker, refreshTokenBreaker, registerUser } from '../service/auth.service.js';
import { UserDAO } from '../models/dao/auth.dao.js';

export const resolvers = {
  Query: {
    me: async (_, __, { userId }) => {
      if (!userId) return null;
      return UserDAO.findById(userId);
    },
  },

  Mutation: {
    register: async (_, { email, password }) => {
      return registerUser({ email, password });
    },

    login: async (_, { email, password }) => {
      const result = await loginBreaker.fire({ email, password });
      if (result.error) throw new Error(result.error);
      return result;
    },

    refreshToken: async (_, { token }) => {
      const result = await refreshTokenBreaker.fire({ token });
      if (result.error) throw new Error(result.error);
      return result;
    },

    logout: async (_, { token }) => {
      await UserDAO.deleteManyByToken(token);
      return true;
    },
  },

  User: {
    refreshTokens: (parent) => UserDAO.getRefreshTokens(parent.id),
  },
};
