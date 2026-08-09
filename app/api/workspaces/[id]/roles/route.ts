import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole, canManageWorkspace } from '@/lib/auth/access';

// Creating a Role — Owner/Admin only, same gate as toggling isPrivate on a Space/Folder/List/Task
// (both are "manage who can see what" capabilities). Listing roles isn't a separate route — they
// already come back as part of GET /api/workspaces' per-workspace `roles` include.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = await params;
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const role = await getWorkspaceRole(workspaceId, callerId);
  if (!canManageWorkspace(role)) return NextResponse.json({ error: 'Only the workspace owner/admins can manage roles' }, { status: 403 });

  const body = await req.json();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const created = await prisma.role.create({
    data: { workspaceId, name, color: body.color || '#6366F1' },
    include: { members: { select: { id: true } } },
  });
  return NextResponse.json({ id: created.id, name: created.name, color: created.color, memberIds: created.members.map((m) => m.id) });
}
