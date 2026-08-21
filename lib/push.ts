import webpush from 'web-push';
import { prisma } from './prisma';

// Real browser push notifications for Chat/DMs — deferred until this app had HTTPS (browsers
// refuse the Push API on an insecure origin), now unblocked by the siqt.no deploy. VAPID_* env
// vars are generated once via `npx web-push generate-vapid-keys` (see .env.local's own comment) —
// if they're unset (a fresh clone, or a machine that hasn't set them up yet), every send below is
// a silent no-op rather than a crash, same "missing secret degrades gracefully" precedent
// CHAT_BROADCAST_SECRET already established.
let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', publicKey, privateKey);
  configured = true;
  return true;
}

export type PushPayload = { title: string; body: string; url?: string };

// Fire-and-forget from a caller's point of view — never throws, so a route sending a chat
// message never has its own response blocked or broken by a push provider being slow/down.
// Sends to every device/browser this user has ever subscribed from; a dead one (the push
// service itself returns 404/410 — uninstalled, browser data cleared, etc.) is deleted here as
// it's discovered, not swept proactively.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error('Push send failed:', err?.statusCode, err?.body || err);
        }
      }
    })
  );
}
