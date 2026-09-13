import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { readFileSync } from 'fs';
import { prisma } from './prisma';
import type { PushPayload } from './push';

// Push to the native Android app, which the web push in ./push.ts cannot reach.
//
// Android's WebView does not implement PushManager at all, so the Capacitor app can never receive a
// browser push no matter what the server does — the panel in Settings correctly reports "not
// supported in this browser" there. Reaching the app means going through Firebase Cloud Messaging,
// which is a different transport with different credentials, which is why this is a separate file
// rather than another branch inside sendPushToUser.
//
// CREDENTIALS ARE A FILE, NOT AN ENV VAR, and that is a deliberate departure from how every other
// secret here is configured. A Firebase service account is ~2.3KB of JSON; the Pterodactyl egg
// variables this project uses are declared `max:191`, and pasting a multi-line PEM private key into
// a panel text field is a poor idea even where it fits. The file lives at the repo root, ignored by
// git — the install script ends in `git clean -fd`, which deletes untracked files but spares ignored
// ones, the same mechanism that keeps the production database alive across re-installs (see
// AGENTS.md). Upload it once through Pterodactyl's file manager and it survives.
//
// Absent or unreadable, every send below is a silent no-op rather than a crash — the same
// "missing secret degrades gracefully" shape VAPID and CHAT_BROADCAST_SECRET already follow, so a
// fresh clone and a machine that has not set this up behave sensibly.
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';

let app: App | null = null;
let initAttempted = false;

function ensureApp(): App | null {
  if (initAttempted) return app;
  initAttempted = true;
  try {
    const raw = readFileSync(SERVICE_ACCOUNT_PATH, 'utf8');
    const serviceAccount = JSON.parse(raw);
    // getApps() guards against re-initialising across hot reloads in dev, which throws.
    app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
  } catch {
    app = null;
  }
  return app;
}

export function isFcmConfigured(): boolean {
  return ensureApp() !== null;
}

// Never throws: a chat message must not fail to send because Google is slow or a credential is
// wrong. Mirrors sendPushToUser's contract exactly, so callers can fire both without either one
// being able to break a request.
export async function sendFcmToUser(userId: string, payload: PushPayload): Promise<void> {
  const initialised = ensureApp();
  if (!initialised) return;

  const devices = await prisma.deviceToken.findMany({ where: { userId } });
  if (devices.length === 0) return;

  const messaging = getMessaging(initialised);

  await Promise.all(
    devices.map(async (device) => {
      try {
        await messaging.send({
          token: device.token,
          // `notification` rather than a data-only message: this makes Android display the
          // notification itself when the app is backgrounded or killed, which is the entire point.
          // A data-only message is delivered to JS instead, and JS is not running then.
          notification: { title: payload.title, body: payload.body },
          // The url rides along as data so a tap can open the right screen. Android does not read
          // it; the app does, via the plugin's pushNotificationActionPerformed listener.
          data: payload.url ? { url: payload.url } : undefined,
          android: {
            priority: 'high',
            notification: {
              // Matches the web notification's own icon treatment and the app's accent.
              color: '#2563EB',
              // Collapse repeated chat notifications from the same conversation rather than
              // stacking a dozen of them; the url is per-conversation.
              tag: payload.url || 'siqt',
            },
          },
        });
      } catch (err: unknown) {
        const code = (err as { errorInfo?: { code?: string } })?.errorInfo?.code;
        // Google's word that this token is dead — the app was uninstalled, its data cleared, or
        // Firebase reissued it. Delete on discovery rather than sweeping on a schedule, exactly as
        // the web path treats a 404/410 from a push service.
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/invalid-argument'
        ) {
          await prisma.deviceToken.delete({ where: { id: device.id } }).catch(() => {});
        } else {
          console.error('FCM send failed:', code, err);
        }
      }
    })
  );
}
