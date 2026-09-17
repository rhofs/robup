'use client';

import { useEffect, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import type { AppUser } from '../store/useTaskStore';
import { hapticTap } from '../lib/haptics';

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  taskId: string | null;
  readAt: string | null;
  createdAt: string;
  actor: AppUser | null;
};

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// The bell's own panel. Deliberately the same sheet shape as Settings rather than a dropdown: on a
// phone this is a screen's worth of content, and a dropdown pinned under a 36px icon is a list you
// read through a letterbox.
export default function NotificationsPanel({
  notifications,
  onOpenTask,
  onMarkAllRead,
  onMarkRead,
  onClose,
}: {
  notifications: AppNotification[];
  onOpenTask: (taskId: string) => void;
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
  onClose: () => void;
}) {
  const unread = notifications.filter((n) => !n.readAt).length;

  // Everything on screen is, by definition, seen. Marking read on open rather than per row is the
  // behaviour every app with a bell has taught people to expect — and the alternative, a list that
  // stays bold after you have read it, makes the count a thing you have to clear by hand.
  useEffect(() => {
    if (unread > 0) onMarkAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/70 backdrop-blur-xs p-3" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[440px] max-w-full bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-4 pt-4 pb-3 flex items-center gap-2">
          <h3 className="font-bold text-sm text-app-strong flex-1 min-w-0 truncate">Notifications</h3>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-app-strong hover:bg-neutral-800/60 active:scale-90 transition duration-100 cursor-pointer"
          >
            <Check className="w-4 h-4" />
          </button>
        </div>

        <div className="px-3 pb-4 h-[26rem] overflow-y-auto space-y-0.5">
          {notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center h-full px-6">
              <Bell className="w-7 h-7 text-neutral-700 mb-2" />
              <p className="text-xs text-neutral-500">Nothing yet.</p>
              <p className="text-[11px] text-neutral-600 mt-1">
                You will be told here when someone assigns you a task.
              </p>
            </div>
          )}
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                hapticTap();
                onMarkRead(n.id);
                if (n.taskId) {
                  onOpenTask(n.taskId);
                  onClose();
                }
              }}
              className={`w-full flex items-start gap-2.5 px-3 py-3 rounded-xl text-left transition cursor-pointer hover:bg-neutral-800/50 active:bg-neutral-800 ${
                n.readAt ? '' : 'bg-blue-500/5'
              }`}
            >
              {n.actor ? (
                n.actor.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={n.actor.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                ) : (
                  <span
                    className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: n.actor.color }}
                  >
                    {n.actor.initials}
                  </span>
                )
              ) : (
                <span className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-neutral-800 text-neutral-500">
                  <Bell className="w-4 h-4" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-neutral-200">{n.title}</span>
                {n.body && <span className="block text-[11px] text-neutral-400 truncate">{n.body}</span>}
                <span className="block text-[10px] text-neutral-600 mt-0.5">{timeAgo(n.createdAt)}</span>
              </span>
              {!n.readAt && <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
