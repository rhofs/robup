import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// Every API route that needs to know "who is asking" calls this instead of trusting a
// client-supplied ?userId= — proxy.ts only gates page routes, so this is each Route Handler's
// own independent verification (the Next.js docs are explicit that proxy/middleware-only
// protection isn't sufficient on its own).
//
// Sessions are JWT-only (see auth.ts) — the cookie itself stays cryptographically valid even if
// the User row it points at is later deleted (or a dev DB gets reset/reseeded), since nothing
// server-side is consulted to validate it beyond the signature. Without this existence check, a
// stale session's id would flow straight into a Prisma `connect`/relation write and throw a raw
// P2025 ("Expected 1 records to be connected, found only 0") instead of behaving like "not
// signed in" — which is what actually happened the first time this shipped (create-workspace
// crashed with an unhandled 500, surfacing to the client as a JSON-parse error on an empty body).
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, sessionsValidFrom: true },
  });
  if (!existing) return null;

  // "Sign out everywhere": a session minted before this timestamp is refused. Enforced here rather
  // than in auth.ts's jwt callback deliberately — this route already makes exactly one lookup per
  // request, so the check rides along on a query that was happening anyway, whereas the jwt
  // callback runs on page renders too and would add a database round trip to all of them.
  //
  // A session with no `issuedAt` predates this feature and is allowed through: rejecting those
  // would sign every existing user out the moment this deploys, which is a worse outcome than
  // briefly honouring sessions that were never revoked in the first place. `iat` is in seconds.
  if (existing.sessionsValidFrom && typeof session?.user?.issuedAt === 'number') {
    if (session.user.issuedAt * 1000 < existing.sessionsValidFrom.getTime()) return null;
  }

  return userId;
}
