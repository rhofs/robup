import { runV1, jsonBody } from '@/lib/agent/http';

// GET /api/v1/tasks?query=&listId=&status=&assignedToMe=true&dueFrom=&dueTo=&limit= — search.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const args: Record<string, unknown> = {};
  for (const key of ['query', 'listId', 'workspaceId', 'status', 'assigneeId', 'dueFrom', 'dueTo', 'parentId']) {
    const v = q.get(key);
    if (v) args[key] = v;
  }
  for (const key of ['assignedToMe', 'topLevelOnly', 'includeArchived']) {
    if (q.has(key)) args[key] = q.get(key) === 'true' || q.get(key) === '1';
  }
  if (q.has('limit')) args.limit = Number(q.get('limit'));
  return runV1(req, 'search_tasks', args);
}

// POST /api/v1/tasks — { listId, title, description?, status?, startDate?, dueDate?, assigneeIds?, parentId? }
export async function POST(req: Request) {
  return runV1(req, 'create_task', await jsonBody(req));
}
