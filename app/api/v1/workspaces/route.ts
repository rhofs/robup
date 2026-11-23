import { runV1 } from '@/lib/agent/http';

// GET /api/v1/workspaces — workspaces, Spaces, Lists (with their statuses) and members.
export async function GET(req: Request) {
  return runV1(req, 'list_workspaces', {});
}
