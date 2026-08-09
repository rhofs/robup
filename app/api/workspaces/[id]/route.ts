import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole } from '@/lib/auth/access';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data: any = {};
  if (body.messageOfTheDay !== undefined) data.messageOfTheDay = body.messageOfTheDay;

  const workspace = await prisma.workspace.update({ where: { id }, data });
  return NextResponse.json(workspace);
}

// Deleting the workspace itself — the one capability Admin deliberately doesn't get (see
// PLANNING.md / lib/auth/access.ts): "gets every Owner capability except this." Didn't exist as
// a route at all before this feature; added now so that distinction is a real, checkable thing
// rather than a rule with nothing to enforce. Cascades through everything hanging off the
// workspace (Spaces, Rooms, WorkspaceMemberships, Roles) via the schema's existing onDelete:
// Cascade FKs, same as every other cascading delete in this app.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const role = await getWorkspaceRole(id, callerId);
  if (role !== 'owner') return NextResponse.json({ error: 'Only the workspace owner can delete it' }, { status: 403 });

  await prisma.workspace.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
