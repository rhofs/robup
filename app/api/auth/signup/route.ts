import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

// Hand-rolled validation rather than adding zod for something this small — matches the project's
// existing "skip a dependency for a small need" precedent (pdfkit over Puppeteer).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : email.split('@')[0];

  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
  }

  // Same initials-from-name derivation as auth.ts's events.createUser (Google sign-in path) —
  // kept in sync so both paths produce the same style of avatar-fallback initials.
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.length
    ? ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] ?? '')).toUpperCase()
    : '?';

  await prisma.user.create({
    data: { email, password: await bcrypt.hash(password, 10), name, initials },
  });

  return NextResponse.json({ ok: true });
}
