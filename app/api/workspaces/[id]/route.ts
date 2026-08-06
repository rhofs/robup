import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data: any = {};
  if (body.messageOfTheDay !== undefined) data.messageOfTheDay = body.messageOfTheDay;

  const workspace = await prisma.workspace.update({ where: { id }, data });
  return NextResponse.json(workspace);
}
