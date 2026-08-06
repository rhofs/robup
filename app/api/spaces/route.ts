import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const body = await req.json();
  const space = await prisma.space.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      workspaceId: body.workspaceId,
      name: body.name,
    },
  });
  return NextResponse.json({ ...space, folders: [], lists: [], statuses: [], customFields: [], docFolders: [], spaceDocs: [] });
}
