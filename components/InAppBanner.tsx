'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, Bell, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useTaskStore } from '../store/useTaskStore';
import { useChatStore } from '../store/useChatStore';
import { hapticTap } from '../lib/haptics';

// A notification that arrives while the app is open, shown as a banner that slides in at the top.
//
// Android does not put an app's push in the notification tray while that app is on screen, and a
// focused browser tab now gets its pushes handed over instead of an OS notification (public/sw.js).
// So without this, a message from someone while you are in the Planner arrived as nothing but a
// number on the chat icon. Asked for 2026-09-28: "Så vi får varsel mens vi er inne".
//
// Tapping it goes where the notification points (lib/pushTargets.ts). It is not shown for the
// conversation already open on screen — there the message itself is the notification.
//
// Also handles a tap on a system notification (the app in the background, or a browser tab behind
// others): both arrive as a URL of the app's own, and are opened the same way.

type Banner = { id: number; title: string; body: string; url: string };

// The app's own URLs are navigation state (lib/navUrl.ts). history.pushState is how the page itself
// records where you are; Next keeps useSearchParams in step with it, and the page's URL→state effect
// treats a URL it did not push itself as a navigation and goes there — no reload, no request.
// (Deliberately no synthetic popstate: Next's router reads one without its own history state as an
// outside navigation and may reload the page.)
export function openAppUrl(url: string) {
  if (!url.startsWith('/')) return;
  window.history.pushState(null, '', url);
}

function isAlreadyShowing(url: string): boolean {
  if (document.hidden) return false;
  const params = new URL(url, window.location.origin).searchParams;
  const chat = params.get('chat');
  if (chat) {
    const view = useTaskStore.getState().activeView;
    return view === 'chat' && useChatStore.getState().activeChannelId === chat;
  }
  return false;
}

let nativeListenersAdded = false;

export default function InAppBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);
  const counter = useRef(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const show = (title: string, body: string, url: string) => {
      if (isAlreadyShowing(url)) return;
      counter.current += 1;
      setBanner({ id: counter.current, title, body, url });
      hapticTap();
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setBanner(null), 6000);
    };

    // Browser: the service worker hands over a push for a focused tab, and says where to go when a
    // system notification is clicked.
    const onSwMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; title?: string; body?: string; url?: string } | null;
      if (d?.type === 'siqt-push') show(d.title || 'Siqt', d.body || '', d.url || '/');
      if (d?.type === 'siqt-open' && d.url) openAppUrl(d.url);
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    // The app: a push received while on screen, and a tap on one from the tray. Added once for the
    // life of the app — the plugin keeps a tap that launched the app until a listener exists, so a
    // cold start from a notification still lands in the right place.
    if (Capacitor.isNativePlatform() && !nativeListenersAdded) {
      nativeListenersAdded = true;
      void import('@capacitor/push-notifications').then(({ PushNotifications }) => {
        void PushNotifications.addListener('pushNotificationReceived', (n) => {
          const url = (n.data as { url?: string } | undefined)?.url || '/';
          window.dispatchEvent(new CustomEvent('siqt-native-push', { detail: { title: n.title || 'Siqt', body: n.body || '', url } }));
        });
        void PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
          const url = (a.notification.data as { url?: string } | undefined)?.url;
          if (url) openAppUrl(url);
        });
      });
    }
    const onNative = (e: Event) => {
      const d = (e as CustomEvent<{ title: string; body: string; url: string }>).detail;
      show(d.title, d.body, d.url);
    };
    window.addEventListener('siqt-native-push', onNative);

    return () => {
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
      window.removeEventListener('siqt-native-push', onNative);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const isChat = banner ? new URL(banner.url, 'http://x').searchParams.has('chat') : false;
  const Icon = isChat ? MessageCircle : Bell;

  return (
    <div className="fixed inset-x-0 top-0 z-[120] flex justify-center px-3 pointer-events-none" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner.id}
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            onDragEnd={(_, info) => info.offset.y < -30 && setBanner(null)}
            className="pointer-events-auto w-full max-w-sm flex items-start gap-3 rounded-2xl bg-neutral-900/95 backdrop-blur border border-neutral-700/80 shadow-2xl px-3.5 py-3 cursor-pointer"
            onClick={() => {
              openAppUrl(banner.url);
              setBanner(null);
            }}
          >
            <span className="w-8 h-8 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-semibold text-app-strong truncate">{banner.title}</span>
              {banner.body && <span className="block text-[12.5px] text-neutral-400 leading-snug line-clamp-2">{banner.body}</span>}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setBanner(null);
              }}
              title="Dismiss"
              className="shrink-0 p-1 -mr-1 text-neutral-500 hover:text-app-strong cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
