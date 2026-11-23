import { runV1, jsonBody } from '@/lib/agent/http';

// POST /api/v1/changes — { summary, changes: [{ type, … }], dryRun?, requestId? }
// Several changes as one action: one log entry, one notification per person, one undo. With
// dryRun it only reports what would change. The change types and their fields are the ones the
// MCP tool apply_changes describes (lib/agent/operations.ts).
export async function POST(req: Request) {
  return runV1(req, 'apply_changes', await jsonBody(req));
}
