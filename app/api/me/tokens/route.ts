import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { actingAs } from '@/lib/auth/actAs';
import { createApiToken, MAX_TOKENS_PER_USER, parseWorkspaceIds } from '@/lib/auth/apiToken';

// A person's own API keys (Settings → "AI agents & API"). Reached with a signed-in session only:
// an API key cannot list, make or revoke keys. Nothing in lib/agent calls these handlers, so
// actingAs() is never set here — the check below is a second lock on a door that is already shut,
// for the day someone adds an operation without reading this.
const sessionUserId = async () => (actingAs() ? null : getCurrentUserId());

const publicFields = { id: true, name: true, scope: true, prefix: true, createdAt: true, lastUsedAt: true, workspaceIdsJson: true } as const;

export async function GET() {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const tokens = await prisma.apiToken.findMany({ where: { userId }, select: publicFields, orderBy: { createdAt: 'asc' } });
  return NextResponse.json(tokens.map(({ workspaceIdsJson, ...t }) => ({ ...t, workspaceIds: parseWorkspaceIds(workspaceIdsJson) })));
}

export async function POST(req: Request) {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 60) : '';
  if (!name) return NextResponse.json({ error: 'Give the key a name, so you can tell later what it is used for.' }, { status: 400 });
  const count = await prisma.apiToken.count({ where: { userId } });
  if (count >= MAX_TOKENS_PER_USER) {
    return NextResponse.json({ error: `You already have ${MAX_TOKENS_PER_USER} keys. Revoke one you no longer use first.` }, { status: 400 });
  }
  // Limited to some workspaces, or (nothing sent) all of them. Only ones the person is in: a key
  // naming a workspace its owner is not a member of would reach nothing there anyway, but the list
  // is shown back in Settings and should not hold ids that mean nothing.
  let workspaceIds: string[] | null = null;
  if (Array.isArray(body?.workspaceIds)) {
    const mine = await prisma.workspaceMembership.findMany({ where: { userId }, select: { workspaceId: true } });
    const allowed = new Set(mine.map((m) => m.workspaceId));
    workspaceIds = (body.workspaceIds as unknown[]).filter((id): id is string => typeof id === 'string' && allowed.has(id));
    if (workspaceIds.length === 0) return NextResponse.json({ error: 'Choose at least one workspace, or all of them.' }, { status: 400 });
  }
  // The one response that ever contains the key itself.
  return NextResponse.json(await createApiToken(userId, name, body?.scope === 'read' ? 'read' : 'write', workspaceIds));
}
