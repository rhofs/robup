// A plain in-memory sliding-window limiter — no Redis/external store, matching this app's own
// "skip infra a single-instance app doesn't need" precedent (see e.g. pdfkit over Puppeteer in
// PLANNING.md). Single Pterodactyl instance, one process, so an in-memory Map is genuinely
// sufficient here; would need a shared store if this app ever ran multiple instances behind a
// load balancer, but it doesn't.
const attempts = new Map<string, number[]>();

// Sweeps entries whose whole window has expired so this Map doesn't grow forever under sustained
// traffic — cheap to run on every check rather than a separate timer, since this only touches
// keys actually being looked up right now.
function prune(key: string, windowMs: number, now: number) {
  const timestamps = attempts.get(key);
  if (!timestamps) return [];
  const kept = timestamps.filter((t) => now - t < windowMs);
  if (kept.length === 0) attempts.delete(key);
  else attempts.set(key, kept);
  return kept;
}

// Returns true if the caller is still within `limit` attempts inside `windowMs`, and records this
// attempt. Callers should call this once per real attempt (e.g. once per submitted login/signup),
// not once per request in general.
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const kept = prune(key, windowMs, now);
  if (kept.length >= limit) return false;
  kept.push(now);
  attempts.set(key, kept);
  return true;
}

// Cloudflare's own header takes priority (this app deploys behind it — see PLANNING.md's
// deployment sessions); x-forwarded-for is the general reverse-proxy convention as a fallback.
// Never trust these for anything auth-decision-worthy beyond rate-limiting keys (a client can
// send its own X-Forwarded-For directly if it reaches the origin without going through
// Cloudflare/Pterodactyl's own proxy at all — worst case here is just a shared rate-limit bucket,
// not a security bypass, since this is a throttle, not an identity check).
export function getClientIp(req: Request): string {
  const h = req.headers;
  return h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}
