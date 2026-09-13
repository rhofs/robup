import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';

const run = promisify(execFile);

// Which commit production is actually running.
//
// This exists because "has the server been redeployed yet?" has repeatedly been unanswerable from
// outside, and guessing wrong sent debugging down the wrong path twice in one session: a fix that
// had shipped correctly and a fix that had never been deployed look identical from a phone. The
// only signal available was indirect (the byte size of a static file), and it says nothing at all
// about changes that do not touch that file.
//
// Read from git at request time rather than baked in at build time, deliberately: a build-time
// constant tells you what was compiled, while this tells you what the running checkout is — and the
// deploy is a `git pull` + build, so the two can disagree if a build fails and the old process keeps
// serving. The failure being diagnosed is exactly that kind.
//
// Public on purpose. It is excluded from the auth gate along with the rest of /api (see proxy.ts),
// and it needs to be readable when something is broken enough that signing in is not possible. A
// commit hash of a private repository is not a secret worth protecting at that cost.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [hash, date] = await Promise.all([
      run('git', ['rev-parse', '--short', 'HEAD']),
      run('git', ['log', '-1', '--format=%cI']),
    ]);
    return NextResponse.json({
      commit: hash.stdout.trim(),
      committedAt: date.stdout.trim(),
      startedAt: startedAt.toISOString(),
      ...notificationConfig(),
    });
  } catch {
    // No git in the container, or not a checkout — say so plainly rather than 500ing, since the
    // whole point of this route is to be readable when things are wrong.
    return NextResponse.json({ commit: null, startedAt: startedAt.toISOString(), ...notificationConfig() });
  }
}

// Captured at module load, which for a long-running server is effectively process start. Together
// with the commit it distinguishes "the code is old" from "the code is new but this process has been
// up since before it landed".
const startedAt = new Date();

// Whether each notification transport is configured, as plain booleans.
//
// Every missing-secret path in this codebase degrades to silence on purpose — a chat message must
// never fail because a push provider is unconfigured. The cost is that "notifications do not
// arrive" looks exactly the same whether a key is missing, a file was uploaded under the wrong
// name, or something is genuinely broken. This session lost several rounds to that ambiguity in
// other forms, so the state is readable rather than inferred.
//
// Booleans only, never the values: the point is to answer "did the upload land?" without putting
// anything worth stealing on a public endpoint. The service account file in particular is checked
// by existence rather than by parsing it, so a malformed file still reports true — it is a check on
// the step a human just performed, not on the credential's validity.
function notificationConfig() {
  return {
    webPush: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    nativePush: existsSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json'),
  };
}
