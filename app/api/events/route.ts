import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getAccessContext } from '@/lib/auth/access';

// No isPrivate/accessJson concept on Event (unlike Task/Space/Folder/List) — not asked for, and
// an Event has no natural "owning" hierarchy level to inherit privacy from the way a Task does
// via its List. Visibility is just "any workspace this identity is a member of." Identity comes
// from the real session (getCurrentUserId), not a client-supplied query param — same rule
// GET /api/tasks and GET /api/workspaces already enforce, since trusting a client-passed userId
// here would let anyone read anyone else's events just by changing the query string.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json([]);

  const events = await prisma.event.findMany({
    where: { deletedAt: null, workspace: { memberships: { some: { userId } } } },
    include: { assignees: { select: publicUserSelect } },
    orderBy: { startDate: 'asc' },
  });

  return NextResponse.json(events);
}

export async function POST(req: Request) {
  const body = await req.json();
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const ctx = await getAccessContext(body.workspaceId, userId);
  if (!ctx.isMember) return NextResponse.json({ error: 'Not a workspace member' }, { status: 403 });

  const event = await prisma.event.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      title: body.title,
      description: body.description ?? null,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      allDay: body.allDay ?? true,
      color: body.color ?? null,
      spaceId: body.spaceId ?? null,
      workspaceId: body.workspaceId,
      ...(body.assigneeIds ? { assignees: { connect: body.assigneeIds.map((id: string) => ({ id })) } } : {}),
    },
    include: { assignees: { select: publicUserSelect } },
  });
  return NextResponse.json(event);
}
