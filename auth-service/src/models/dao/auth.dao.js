import prisma from '../../db/prisma.js';

export class UserDAO {
  static async createUser(user) {
    return prisma.user.create({ data: user });
  }

  static async findByEmail(email) {
    return prisma.user.findUnique({ where: { email } });
  }

  static async findById(id) {
    return prisma.user.findUnique({ where: { id } });
  }

  static async getRefreshTokens(userId) {
    return prisma.refreshToken.findMany({ where: { userId } });
  }
}

export class RefreshTokenDAO {
  static async create(tokenData) {
    return prisma.refreshToken.create({ data: tokenData });
  }

  static async find(token) {
    return prisma.refreshToken.findUnique({ where: { token } });
  }

  static async delete(token) {
    return prisma.refreshToken.delete({ where: { token } });
  }

  static async deleteManyByToken(token) {
    return prisma.refreshToken.deleteMany({ where: { token } });
  }
}
