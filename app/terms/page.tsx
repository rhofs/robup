import type { Metadata } from 'next';

// Terms of service — the optional "Application Terms of Service link" on Google's OAuth branding page
// (2026-11-11), kept short and true to how Siqt is used: an invite-only tool for teams. Public, like
// /privacy (proxy.ts).
export const metadata: Metadata = { title: 'Terms — Siqt' };

const h2 = 'text-[15px] font-semibold text-neutral-100 mt-8 mb-2';
const p = 'text-[14px] leading-relaxed text-neutral-300 mb-3';

export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-neutral-950 text-neutral-100 px-5 py-12 select-text">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold">Terms of service</h1>
        <p className="text-[12px] text-neutral-500 mt-1">Siqt (siqt.no) · Last updated 11 November 2026</p>

        <h2 className={h2}>The service</h2>
        <p className={p}>
          Siqt is a project and task management app for teams, used by invitation. An account is personal; keep your sign-in details to
          yourself.
        </p>

        <h2 className={h2}>Your content</h2>
        <p className={p}>
          What you and your team put into Siqt belongs to you and your team. Siqt stores it to provide the service and shows it only to the members
          of the workspace it belongs to. Do not upload anything you do not have the right to share, or anything unlawful.
        </p>

        <h2 className={h2}>Google and other connections</h2>
        <p className={p}>
          Connecting Google is optional. How Siqt uses a connected Google account is described in the{' '}
          <a href="/privacy" className="text-blue-400 underline">
            privacy policy
          </a>
          . You can disconnect at any time.
        </p>

        <h2 className={h2}>Availability</h2>
        <p className={p}>
          Siqt is provided as it is. It is backed up regularly, but there is no guarantee that it is always available or free of errors, and Siqt
          is not liable for losses caused by downtime or lost data. Keep your own copy of anything you cannot afford to lose.
        </p>

        <h2 className={h2}>Ending</h2>
        <p className={p}>
          A workspace&apos;s administrator can remove members, and access can be ended if these terms are broken. These terms may be updated; the
          date above shows the latest version.
        </p>
      </div>
    </main>
  );
}
