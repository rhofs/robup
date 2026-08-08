import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// GET previously did a raw findUnique with no `select` and no auth check at all — returning the
// *entire* row (including calendarToken, googleRefreshToken, and now password/email) to any
// anonymous request for any id. This select-based fix is what the old PATCH comment ("the one
// deliberate place calendarToken is returned, to its own owner") always claimed happened but
// never actually implemented — calendarToken now really is owner-only, and password/
// googleRefreshToken/email never leave this route at all, matching how they're already excluded
// from publicUserSelect everywhere else.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callerId = await getCurrentUserId();
  const user = await prisma.user.findUnique({
    where: { id },
    select: callerId === id ? { ...publicUserSelect, calendarToken: true } : publicUserSelect,
  });
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(user);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Not a self-only check: this route is also how the Office directory edits *other* team
  // members' phone/title/status/room/DND inline (app/page.tsx's onUpdatePhone/onUpdateUserField,
  // OfficeRooms.tsx's onToggleDnd all call updateUser with someone else's id) — a legitimate
  // existing feature, not a bug. Same "no admin/owner role model yet" deferral as DELETE below;
  // this only closes the "a fully anonymous request can rewrite anyone's profile" gap.
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

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

// Self-service account deletion only — the Team panel's old "delete anyone's entire account with
// one unconfirmed click" (store/useTaskStore.ts's deleteUser, called with someone *else's* id)
// has been replaced by "remove from workspace" (DELETE /api/workspaces/[id]/members/[userId],
// which already has its own caller-is-a-member check). Deleting a whole account is now something
// only the account's own owner can do, and only after re-proving who they are — a bare "you're
// logged in" check isn't enough friction for something this permanent.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (callerId !== id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { id }, select: { password: true, email: true } });
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (user.password) {
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password || !(await bcrypt.compare(password, user.password))) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 403 });
    }
  } else {
    // Google-only account, no password to check against — require typing the exact email
    // instead, the same "prove you know something only the real owner would" bar.
    const confirmEmail = typeof body.confirmEmail === 'string' ? body.confirmEmail.trim().toLowerCase() : '';
    if (!user.email || confirmEmail !== user.email.toLowerCase()) {
      return NextResponse.json({ error: 'Email confirmation does not match' }, { status: 403 });
    }
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}