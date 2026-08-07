import { PrismaClient } from '@prisma/client';

// Singleton-mønster: hindrer at Next.js sin hot-reload i dev
// oppretter en ny PrismaClient (og dermed nye DB-connections) for hver fil-endring.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// calendarToken is a bearer secret for that user's .ics feed — never select it through a Task's
// assignees or a Comment's author, only via GET /api/users/[id] for the user it belongs to.
export const publicUserSelect = {
  id: true,
  name: true,
  initials: true,
  color: true,
  phone: true,
  title: true,
  status: true,
  isDnd: true,
  roomId: true,
  createdAt: true,
} as const;