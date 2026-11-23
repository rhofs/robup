import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';

// API keys: how a person's AI agent proves it is acting for them (schema: ApiToken).
//
// Accepted by /api/mcp and /api/v1 ONLY. Deliberately not by getCurrentUserId(), which would have
// opened every route in the app to a key at once — account settings, deleting, privacy, creating
// more keys. An agent gets a short list of things it can do (lib/agent/operations.ts), and anything
// not on that list is unreachable with a key rather than merely undocumented.

const PREFIX = 'siqt_';

// SHA-256, not bcrypt — same reasoning as lib/passwordReset.ts: the key is looked up by its hash,
// and it is 32 random bytes, not something a person chose.
const hash = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

export type TokenScope = 'read' | 'write';
// `workspaceIds`: the workspaces the key was limited to when it was made, or null for all of its
// owner's. What it actually reaches is narrower still — see lib/agent/shared.ts's openWorkspaceIds.
export type VerifiedToken = { tokenId: string; userId: string; name: string; scope: TokenScope; workspaceIds: string[] | null };

export const parseWorkspaceIds = (json: string | null): string[] | null => {
  if (!json) return null;
  try {
    const ids = JSON.parse(json);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : null;
  } catch {
    return null;
  }
};

export const MAX_TOKENS_PER_USER = 10;

// The key is returned here and nowhere else, ever: only its hash is kept.
export async function createApiToken(userId: string, name: string, scope: TokenScope, workspaceIds: string[] | null) {
  const raw = PREFIX + crypto.randomBytes(32).toString('base64url');
  const row = await prisma.apiToken.create({
    data: {
      userId,
      name,
      scope,
      tokenHash: hash(raw),
      prefix: raw.slice(0, PREFIX.length + 4),
      workspaceIdsJson: workspaceIds ? JSON.stringify(workspaceIds) : null,
    },
    select: { id: true, name: true, scope: true, prefix: true, createdAt: true, lastUsedAt: true, workspaceIdsJson: true },
  });
  const { workspaceIdsJson, ...rest } = row;
  return { ...rest, workspaceIds: parseWorkspaceIds(workspaceIdsJson), token: raw };
}

export type TokenCheck =
  | { ok: true; token: VerifiedToken }
  | { ok: false; status: 401 | 429; error: string };

// Reads `Authorization: Bearer siqt_…`. Rate-limited per key: an agent stuck in a loop should hit a
// wall here, not the database.
export async function verifyApiToken(req: Request): Promise<TokenCheck> {
  const header = req.headers.get('authorization') ?? '';
  const raw = header.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!raw || !raw.startsWith(PREFIX)) {
    return { ok: false, status: 401, error: 'Missing API key. Send "Authorization: Bearer <key>" — keys are made in Siqt under Settings.' };
  }
  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hash(raw) },
    select: { id: true, userId: true, name: true, scope: true, lastUsedAt: true, workspaceIdsJson: true },
  });
  if (!row) return { ok: false, status: 401, error: 'Unknown or revoked API key.' };
  if (!checkRateLimit(`api-token:${row.id}`, 120, 60_000)) {
    return { ok: false, status: 429, error: 'Too many requests with this key — at most 120 a minute. Wait a moment.' };
  }
  // "Last used" is for a person deciding which key to revoke; to the minute is plenty, and it keeps
  // a busy agent from writing a row on every call.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return {
    ok: true,
    token: {
      tokenId: row.id,
      userId: row.userId,
      name: row.name,
      scope: row.scope === 'read' ? 'read' : 'write',
      workspaceIds: parseWorkspaceIds(row.workspaceIdsJson),
    },
  };
}
