'use client';

import { ListChecks, FileText, UserCircle, Paperclip, Users, UserCheck, Shield } from 'lucide-react';
import { useTaskStore } from '../store/useTaskStore';
import { parseMentions, resolveMentionEntity, type MentionKind } from '../lib/mentions';

export const MENTION_KIND_ICON: Record<MentionKind, typeof ListChecks> = {
  task: ListChecks,
  doc: FileText,
  user: UserCircle,
  file: Paperclip,
  group: Users,
  role: Shield,
};

// The icon for one mention, which for a group depends on which group it is: @assignee is about the
// people on a task, @everyone about the whole room, and the one shared icon made them look alike.
export function MentionIcon({ kind, id, className }: { kind: MentionKind; id: string; className?: string }) {
  if (kind === 'group' && id === 'assignee') return <UserCheck className={className} />;
  const Icon = MENTION_KIND_ICON[kind];
  return <Icon className={className} />;
}

// No natural per-entity color for tasks/docs the way assignees already have `user.color` — fixed
// accent per kind, pulled from the app's existing muted/pastel FIELD_COLOR_CHOICES palette.
const KIND_COLOR: Record<MentionKind, string> = {
  task: '#618cd1',
  doc: '#349f7c',
  user: '#8d97a5',
  // Warmer than the rest on purpose: a file is the one kind here that leaves the app when you tap
  // it, and it should not read as just another internal link.
  file: '#b9834a',
  // Louder than a person on purpose — a group pings many people at once, and the message should
  // show that before anyone wonders why their phone went off.
  group: '#b45fa8',
  // Fallback only; a role is drawn in its own colour, the same one the Team settings show it in.
  role: '#6366f1',
};

type MentionTextProps = {
  text: string;
  onJump: (kind: MentionKind, id: string) => void;
  className?: string;
};

// One mention, rendered inline. Extracted so chat messages can put a chip between two runs of
// formatted text — they need it interleaved with code/bold/italic rather than as its own block,
// which is what MentionText below renders. Also the chip the editors draw (components/collab/
// MentionChip.tsx wraps it in a node view), so there is one chip in this app and not three copies.
export function MentionChip({ kind, id, label, onJump }: { kind: MentionKind; id: string; label: string; onJump?: (kind: MentionKind, id: string) => void }) {
  const tasks = useTaskStore((s) => s.tasks);
  const users = useTaskStore((s) => s.users);
  const workspaces = useTaskStore((s) => s.workspaces);
  const resolved = resolveMentionEntity(kind, id, label, { tasks, users, workspaces });
  const color =
    kind === 'user'
      ? users.find((u) => u.id === id)?.color ?? KIND_COLOR.user
      : kind === 'doc' || kind === 'role'
        ? resolved.color ?? KIND_COLOR[kind]
        : KIND_COLOR[kind];
  // Written with the @ for the kinds that address people as a group, because that is how they are
  // typed and how every chat app shows them; a task or a doc chip is a link and reads as its name.
  const text = kind === 'group' || kind === 'role' ? `@${resolved.label}` : resolved.label;
  if (!resolved.found) {
    return (
      <span
        title="No longer exists"
        className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-medium text-neutral-500 bg-neutral-800/60 line-through align-middle"
      >
        <MentionIcon kind={kind} id={id} className="w-3 h-3 shrink-0" />
        {text}
      </span>
    );
  }
  // A group or a role goes nowhere when tapped — there is no one place "everyone" lives — so it is a
  // label, not a button that looks pressable and does nothing.
  if (kind === 'group' || kind === 'role' || !onJump) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-semibold text-white align-middle"
        style={{ backgroundColor: color }}
      >
        <MentionIcon kind={kind} id={id} className="w-3 h-3 shrink-0" />
        {text}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onJump(kind, id);
      }}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-semibold text-white cursor-pointer hover:brightness-110 transition align-middle"
      style={{ backgroundColor: color }}
    >
      <MentionIcon kind={kind} id={id} className="w-3 h-3 shrink-0" />
      {text}
    </button>
  );
}

// Read-only renderer for text containing @-mention tokens (`@[Label](kind:id)`) — used for posted
// comment bodies and the Doc editor's view-mode. Renders a <div>, not <p>, so it works in both spots.
export default function MentionText({ text, onJump, className }: MentionTextProps) {
  const segments = parseMentions(text);
  return (
    <div className={className}>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <span key={i}>{seg.value}</span>
        ) : (
          <MentionChip key={i} kind={seg.kind} id={seg.id} label={seg.label} onJump={onJump} />
        )
      )}
    </div>
  );
}
