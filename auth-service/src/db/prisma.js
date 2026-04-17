import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 20,                 
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

const shutdown = async (signal) => {

  try {
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('uncaughtException', async (err) => {
  console.error('Uncaught Exception:', err);
  await shutdown('uncaughtException');
});

process.on('unhandledRejection', async (reason) => {
  console.error('Unhandled Rejection:', reason);
  await shutdown('unhandledRejection');
});

export default prisma;
