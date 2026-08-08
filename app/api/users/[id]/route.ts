import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(user);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.initials !== undefined) data.initials = body.initials;
  if (body.color !== undefined) data.color = body.color;
  if (body.phone !== undefined) data.phone = body.phone;
  if (body.title !== undefined) data.title = body.title;
  if (body.status !== undefined) data.status = body.status;
  if (body.isDnd !== undefined) data.isDnd = body.isDnd;
  if (body.roomId !== undefined) data.roomId = body.roomId;
  if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl;
  if (body.bio !== undefined) data.bio = body.bio;
  if (body.linkedinUrl !== undefined) data.linkedinUrl = body.linkedinUrl;
  if (body.websiteUrl !== undefined) data.websiteUrl = body.websiteUrl;

  // Unlike GET (the one deliberate place calendarToken is returned, to its own owner), PATCH is
  // called by anyone editing a name/color/phone — select the public shape so it doesn't leak here.
  const user = await prisma.user.update({ where: { id }, data, select: publicUserSelect });
  return NextResponse.json(user);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}