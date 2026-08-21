import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole, canManageWorkspace } from '@/lib/auth/access';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  // Genuinely had no auth check at all before this — any caller, member or not, could PATCH any
  // workspace's messageOfTheDay. Membership is the floor for any edit here; name/orgType/
  // workEmail (workspace identity, not a shared scratch note) additionally need Owner/Admin,
  // same tier every other workspace-identity change in this app already requires.
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const role = await getWorkspaceRole(id, callerId);
  if (!role) return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });

  const data: any = {};
  if (body.messageOfTheDay !== undefined) data.messageOfTheDay = body.messageOfTheDay;

  if (body.name !== undefined || body.orgType !== undefined || body.workEmail !== undefined) {
    if (!canManageWorkspace(role)) {
      return NextResponse.json({ error: 'Only the workspace owner/admins can change this' }, { status: 403 });
    }
    if (body.name !== undefined) data.name = body.name;
    if (body.orgType !== undefined) data.orgType = body.orgType === 'personal_project' ? 'personal_project' : body.orgType === 'company' ? 'company' : null;
    if (body.workEmail !== undefined) data.workEmail = typeof body.workEmail === 'string' && body.workEmail.trim() ? body.workEmail.trim() : null;
  }

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
