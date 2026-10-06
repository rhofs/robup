'use client';

import {
  Check,
  X,
  Minus,
  Clock,
  Pause,
  Play,
  Eye,
  Star,
  Flag,
  TriangleAlert,
  Zap,
  Lock,
  Heart,
  Send,
  MessageCircle,
  Ban,
  type LucideIcon,
} from 'lucide-react';

// The picture inside a status's circle — the task row's circle (StatusCircle), its menu, the
// Manage statuses window and a doc List's group pills all draw a status with this.
//
// With no icon chosen, the kind decides: open is an empty dashed ring, done a solid disc and closed a
// solid disc with a tick. Done used to carry the tick too, and looked exactly like "Close task" ("ikke
// ha en 'Checkmark' inne i 'Done', men kun i 'Close'"). A chosen icon (Status.icon) sits inside the
// ring in the status colour when open, or in white on the disc when done or closed.

export const STATUS_ICONS: Record<string, LucideIcon> = {
  check: Check,
  x: X,
  minus: Minus,
  clock: Clock,
  pause: Pause,
  play: Play,
  eye: Eye,
  star: Star,
  flag: Flag,
  alert: TriangleAlert,
  zap: Zap,
  lock: Lock,
  heart: Heart,
  send: Send,
  comment: MessageCircle,
  ban: Ban,
};

export type StatusKind = 'open' | 'done' | 'closed';

export const statusKind = (s: { isDone?: boolean; isClosed?: boolean } | undefined): StatusKind =>
  s?.isClosed ? 'closed' : s?.isDone ? 'done' : 'open';

export default function StatusGlyph({
  kind,
  color,
  icon,
  size,
}: {
  kind: StatusKind;
  color: string;
  icon?: string | null;
  // The circle's diameter in px.
  size: number;
}) {
  const Icon = icon ? STATUS_ICONS[icon] : kind === 'closed' ? Check : undefined;
  const iconPx = Math.round(size * (kind === 'open' ? 0.56 : 0.62));
  if (kind === 'open') {
    return (
      <span
        className="rounded-full border-2 border-dashed shrink-0 flex items-center justify-center"
        style={{ width: size, height: size, borderColor: color, color }}
      >
        {Icon && <Icon style={{ width: iconPx, height: iconPx }} strokeWidth={3} />}
      </span>
    );
  }
  return (
    <span
      className="rounded-full shrink-0 flex items-center justify-center text-white"
      style={{ width: size, height: size, backgroundColor: color }}
    >
      {Icon && <Icon style={{ width: iconPx, height: iconPx }} strokeWidth={3} />}
    </span>
  );
}
