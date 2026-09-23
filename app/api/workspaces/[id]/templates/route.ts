import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWorkspaceRole } from '@/lib/auth/access';

// Templates belong to a workspace, so membership is the whole authorisation rule — any member may
// read them and any member may save one. Deliberately not admin-gated: a template is a convenience
// someone made for their own repeated work, and requiring permission to save one is how a feature
// like this ends up unused.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await getWorkspaceRole(id, userId))) {
    return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });
  }

  const templates = await prisma.template.findMany({
    where: { workspaceId: id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(templates);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await getWorkspaceRole(id, userId))) {
    return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  if (!name) return NextResponse.json({ error: 'A name is required' }, { status: 400 });
  if (body.kind !== 'task' && body.kind !== 'doc') {
    return NextResponse.json({ error: "kind must be 'task' or 'doc'" }, { status: 400 });
  }
  // Serialised here rather than trusting a string from the client: the column holds JSON by
  // convention and nothing checks it, so the one place it is written should be the place that makes
  // it valid JSON.
  const payloadJson = JSON.stringify(body.payload ?? {});

  const template = await prisma.template.create({
    data: { workspaceId: id, name, kind: body.kind, payloadJson, createdById: userId },
  });
  return NextResponse.json(template);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await getWorkspaceRole(id, userId))) {
    return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });
  }

  const templateId = new URL(req.url).searchParams.get('templateId');
  if (!templateId) return NextResponse.json({ error: 'templateId required' }, { status: 400 });

  // workspaceId in the where clause as well as the id, so a template cannot be deleted from a
  // workspace the caller is not in by guessing an id.
  await prisma.template.deleteMany({ where: { id: templateId, workspaceId: id } });
  return NextResponse.json({ ok: true });
}
