import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// Your notifications, newest first. Scoped to the signed-in user by the query itself rather than by
// a filter applied afterwards — there is no "whose notifications" parameter to get wrong.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    // Capped. A bell is for what happened recently; anything older than fifty entries is history
    // nobody scrolls to, and an uncapped list grows without limit on a phone.
    take: 50,
    include: { actor: { select: publicUserSelect } },
  });

  return NextResponse.json(notifications);
}
