import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// The caller's own notification targets and how the last delivery to each went — shown under
// Settings → Notifications, so "varselet kom ikke" can be checked by the person it happened to,
// after the fact. Never the tokens or endpoints themselves: those are credentials to push to them.
// Browsers are named by their push service's host, which is what tells Chrome from Firefox from
// Safari.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const [devices, subs] = await Promise.all([
    prisma.deviceToken.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.pushSubscription.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
  ]);
  const pushService = (endpoint: string) => {
    const host = (() => {
      try {
        return new URL(endpoint).host;
      } catch {
        return '';
      }
    })();
    if (host.includes('googleapis') || host.includes('google.com')) return 'Chrome / Edge';
    if (host.includes('mozilla')) return 'Firefox';
    if (host.includes('apple')) return 'Safari';
    return 'Browser';
  };
  const pick = (r: { createdAt: Date; lastSentAt: Date | null; lastError: string | null; lastErrorAt: Date | null }) => ({
    registeredAt: r.createdAt,
    lastSentAt: r.lastSentAt,
    lastError: r.lastError,
    lastErrorAt: r.lastErrorAt,
  });
  return NextResponse.json({
    targets: [
      ...devices.map((d) => ({ kind: 'app' as const, label: d.platform === 'android' ? 'Android app' : `${d.platform} app`, ...pick(d) })),
      ...subs.map((s) => ({ kind: 'browser' as const, label: pushService(s.endpoint), ...pick(s) })),
    ],
  });
}
