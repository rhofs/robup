import { PrismaClient } from '@prisma/client';

// Singleton-mønster: hindrer at Next.js sin hot-reload i dev
// oppretter en ny PrismaClient (og dermed nye DB-connections) for hver fil-endring.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// calendarToken and googleRefreshToken are bearer secrets (the .ics feed / Google Docs export) —
// never select them through a Task's assignees or a Comment's author, only via GET
// /api/users/[id] for the user they belong to. googleEmail is display-only ("Connected as ..."),
// not sensitive, so — unlike the two tokens above — it stays in this list, same as phone.
export const publicUserSelect = {
  id: true,
  name: true,
  username: true,
  initials: true,
  color: true,
  phone: true,
  title: true,
  status: true,
  isDnd: true,
  roomId: true,
  googleEmail: true,
  avatarUrl: true,
  bio: true,
  linkedinUrl: true,
  websiteUrl: true,
  createdAt: true,
} as const;