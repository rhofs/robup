import type { Metadata } from 'next';

// The privacy policy Google asks for before the OAuth app ("RobUp" in Google Cloud) may be set to
// "In production" (2026-11-11) — and the honest description of what Siqt does with a Google account.
// Public: proxy.ts lets /privacy through without a session, as Google's reviewers have none.
export const metadata: Metadata = { title: 'Privacy — Siqt' };

const h2 = 'text-[15px] font-semibold text-neutral-100 mt-8 mb-2';
const p = 'text-[14px] leading-relaxed text-neutral-300 mb-3';

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-neutral-950 text-neutral-100 px-5 py-12 select-text">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold">Privacy policy</h1>
        <p className="text-[12px] text-neutral-500 mt-1">Siqt (siqt.no) · Last updated 11 November 2026</p>

        <p className={`${p} mt-6`}>
          Siqt is a project and task management app used by invited teams. This page explains what information Siqt stores, and what it does when
          you connect your Google account.
        </p>

        <h2 className={h2}>What Siqt stores</h2>
        <p className={p}>
          Your name, email address and profile picture, and the content you and your team create in Siqt: tasks, events, documents, comments, chat
          messages and uploaded files. This is stored on Siqt&apos;s own server and is visible only to the members of the workspaces it belongs to.
        </p>

        <h2 className={h2}>Google account (optional)</h2>
        <p className={p}>Connecting Google is optional. If you do, Siqt asks for these permissions and uses them only as described:</p>
        <ul className="list-disc pl-5 space-y-2 text-[14px] text-neutral-300 mb-3">
          <li>
            <strong className="text-neutral-100">Your email address</strong> — to show which Google account is connected.
          </li>
          <li>
            <strong className="text-neutral-100">Calendars created by Siqt</strong> (calendar.app.created) — Siqt creates one calendar per workspace
            in your Google Calendar and puts the tasks and events you are assigned to in it, and reads changes you make to those calendars back
            into Siqt. It cannot see or change any of your other calendars.
          </li>
          <li>
            <strong className="text-neutral-100">Files created by Siqt</strong> (drive.file) — when you export a document to Google Docs, Siqt
            creates that file in your Drive. It cannot see any other files in your Drive.
          </li>
        </ul>
        <p className={p}>
          Siqt stores a refresh token so that this keeps working without signing in again. Data from Google is used only to provide these features
          to you. It is not sold, not shared with anyone else, not used for advertising, and not used to train AI models. Siqt&apos;s use of
          information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.
        </p>

        <h2 className={h2}>Removing access and data</h2>
        <p className={p}>
          You can disconnect Google at any time at myaccount.google.com/permissions; Siqt then stops syncing and the stored token no longer works.
          The calendars and documents Siqt created stay in your Google account until you delete them. To have your Siqt account and its data
          deleted, ask the administrator of your workspace or contact Siqt.
        </p>

        <h2 className={h2}>Cookies</h2>
        <p className={p}>Siqt uses only the cookies needed to keep you signed in. There is no tracking or advertising.</p>
      </div>
    </main>
  );
}
