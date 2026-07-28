import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const body = await req.json();
  const user = await prisma.user.create({
    data: {
      name: body.name,
      initials: body.initials,
      color: body.color ?? '#6366F1',
    },
  });
  return NextResponse.json(user);
}