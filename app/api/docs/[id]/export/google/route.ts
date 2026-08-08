import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { createGoogleOAuthClient } from '@/lib/google/oauthClient';
import { loadDocJSONForExport } from '@/lib/collab/loadDocForExport';
import { docJSONToGoogleRequests } from '@/lib/collab/docJSONToGoogleRequests';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const userId = body.userId as string | undefined;
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  const doc = await prisma.doc.findUnique({ where: { id } });
  if (!doc || doc.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.googleRefreshToken) {
    return NextResponse.json({ error: 'Google account not connected for this person.' }, { status: 400 });
  }

  try {
    const oauth2Client = createGoogleOAuthClient();
    oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
    const docsApi = google.docs({ version: 'v1', auth: oauth2Client });

    const created = await docsApi.documents.create({ requestBody: { title: doc.title || 'Untitled' } });
    const documentId = created.data.documentId;
    if (!documentId) return NextResponse.json({ error: 'Google did not return a document id.' }, { status: 502 });

    const json = loadDocJSONForExport(doc);
    const requests = docJSONToGoogleRequests(json);
    await docsApi.documents.batchUpdate({ documentId, requestBody: { requests } });

    return NextResponse.json({ url: `https://docs.google.com/document/d/${documentId}/edit` });
  } catch (err) {
    // A revoked/expired refresh token surfaces here as a Google API error (invalid_grant) — clear
    // it so the "Connect Google" UI correctly offers to reconnect instead of silently failing
    // the same way on every future export attempt.
    await prisma.user.update({ where: { id: userId }, data: { googleRefreshToken: null, googleEmail: null } }).catch(() => {});
    const message = err instanceof Error ? err.message : 'Google export failed.';
    return NextResponse.json({ error: `Google export failed — please reconnect your Google account. (${message})` }, { status: 502 });
  }
}
