import { PrismaClient } from '@prisma/client';

// Singleton-mønster: hindrer at Next.js sin hot-reload i dev
// oppretter en ny PrismaClient (og dermed nye DB-connections) for hver fil-endring.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;