'use client';

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type InstallPromptState = {
  // Chrome/Edge (desktop and Android) fire `beforeinstallprompt` once the page satisfies their
  // installability criteria (valid manifest + icons + a registered service worker — see
  // ServiceWorkerRegistrar.tsx) — calling preventDefault() on it (done below) suppresses their own
  // automatic mini-infobar, which is what lets an app offer its own "Install" button instead.
  canInstall: boolean;
  // True once already running as an installed PWA (either browser reports `display-mode:
  // standalone`, or iOS Safari's own legacy `navigator.standalone` flag) — nothing to offer here.
  isStandalone: boolean;
  // iOS Safari never fires `beforeinstallprompt` at all — there's no programmatic install prompt
  // there, only the user's own manual Share -> Add to Home Screen. Callers use this to show that
  // instruction instead of a button that would otherwise silently do nothing.
  isIOS: boolean;
  promptInstall: () => Promise<void>;
};

export function useInstallPrompt(): InstallPromptState {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    setIsStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
    setIsIOS(/iphone|ipad|ipod/i.test(window.navigator.userAgent));

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsStandalone(true);
      setDeferredEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    await deferredEvent.userChoice;
    setDeferredEvent(null);
  };

  return { canInstall: !!deferredEvent, isStandalone, isIOS, promptInstall };
}
