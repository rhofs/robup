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

        <h2 className={h2}>Price</h2>
        <p className={p}>
          Siqt is free to use for now. If use grows so that running it costs more — servers, storage, services it depends on — Siqt may introduce
          fees or limits. You will be told before any change that costs you anything, and you can stop using Siqt instead.
        </p>

        <h2 className={h2}>No warranty</h2>
        <p className={p}>
          Siqt is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind, express or implied — including that it
          will be available, uninterrupted, secure, free of errors, or fit for any particular purpose. Siqt may change, suspend or stop any part of
          the service at any time.
        </p>

        <h2 className={h2}>Your data and backups</h2>
        <p className={p}>
          You are responsible for keeping your own copies of anything you put into Siqt that you cannot afford to lose. Siqt makes backups, but
          does not promise that they are complete, current or restorable, and does not promise to restore anything.
        </p>

        <h2 className={h2}>Limitation of liability</h2>
        <p className={p}>
          To the fullest extent permitted by law, Siqt and the people behind it are not liable for any loss or damage arising from the use of, or
          the inability to use, the service — including lost, corrupted or leaked data, lost work, lost income or profit, missed deadlines, and any
          indirect or consequential loss — whatever the cause, including errors, downtime, security incidents, and the services Siqt relies on
          (such as hosting, Google and email). You use Siqt at your own risk.
        </p>

        <h2 className={h2}>Ending</h2>
        <p className={p}>
          A workspace&apos;s administrator can remove members, and access can be ended if these terms are broken. These terms may be updated; the
          date above shows the latest version, and continuing to use Siqt after a change means accepting it.
        </p>
      </div>
    </main>
  );
}
