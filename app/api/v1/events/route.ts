import { runV1, jsonBody } from '@/lib/agent/http';

// GET /api/v1/events?query=&workspaceId=&from=&to=&attendingMe=true&limit=
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const args: Record<string, unknown> = {};
  for (const key of ['query', 'workspaceId', 'from', 'to']) {
    const v = q.get(key);
    if (v) args[key] = v;
  }
  if (q.has('attendingMe')) args.attendingMe = q.get('attendingMe') === 'true' || q.get('attendingMe') === '1';
  if (q.has('limit')) args.limit = Number(q.get('limit'));
  return runV1(req, 'search_events', args);
}

// POST /api/v1/events — { workspaceId, title, start, end?, location?, description?, attendeeIds?, requestId? }
export async function POST(req: Request) {
  return runV1(req, 'create_event', await jsonBody(req));
}
