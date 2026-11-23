import { runV1 } from '@/lib/agent/http';

// GET /api/v1/actions?limit= — what this user's agents have changed recently.
export async function GET(req: Request) {
  const limit = new URL(req.url).searchParams.get('limit');
  return runV1(req, 'list_my_actions', limit ? { limit: Number(limit) } : {});
}
