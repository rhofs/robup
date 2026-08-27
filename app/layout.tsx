import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { MotionConfig } from "framer-motion";
import ServiceWorkerRegistrar from "../components/ServiceWorkerRegistrar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Siqt",
  description: "Siqt — task management, docs, planning, and chat in one place.",
  // iOS ignores the Web App Manifest for "Add to Home Screen" launch behavior — these are what
  // actually make a Home Screen–launched Siqt open in its own standalone window (no Safari
  // chrome) instead of just opening Safari to the page.
  appleWebApp: {
    title: "Siqt",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Matches manifest.ts's theme_color/background_color — the same dark surface color, not a new
  // brand color, so the OS status bar/task-switcher chrome reads as a continuation of the app's
  // own header rather than a mismatched colored bar.
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistrar />
        {/* framer-motion defaults to skipping animations outright (instant end-state, no tween)
            whenever the OS "Reduce Motion" accessibility setting is on — every animation this
            session iterated on (popup menu fade/slide/clip-path, nav pill spring, etc.) would
            render as a hard cut under that setting regardless of which technique was used, which
            is exactly what was reported after ruling out an actual fade. This app leans on motion
            for its own UI legibility (revealing panels, active-tab indicators), not incidental
            decoration, so it opts out of the OS preference here rather than leaving every
            animation silently at the mercy of a per-device setting. */}
        <MotionConfig reducedMotion="never">
          <SessionProvider>{children}</SessionProvider>
        </MotionConfig>
      </body>
    </html>
  );
}
