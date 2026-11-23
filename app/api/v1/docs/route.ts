import { runV1, jsonBody } from '@/lib/agent/http';

// GET /api/v1/docs?query=&workspaceId=&kind=doc|wiki&limit= — Docs and wiki pages.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const args: Record<string, unknown> = {};
  for (const key of ['query', 'workspaceId', 'kind']) {
    const v = q.get(key);
    if (v) args[key] = v;
  }
  if (q.has('limit')) args.limit = Number(q.get('limit'));
  return runV1(req, 'search_docs', args);
}

// POST /api/v1/docs — { title, content (Markdown), taskId | spaceId, requestId? }
export async function POST(req: Request) {
  return runV1(req, 'create_doc', await jsonBody(req));
}
