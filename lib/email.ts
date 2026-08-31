import { Resend } from 'resend';

// Transactional email (Resend). This app went its whole life without any mail infrastructure —
// which is why "invite by email" couldn't actually reach someone without an account, and why
// there was no password reset at all: a forgotten password had no recovery path short of editing
// the database by hand. That's fine for one person and a real blocker for a team.
//
// Deliberately degrades instead of throwing when unconfigured. RESEND_API_KEY/EMAIL_FROM are
// production env vars that local development has no reason to hold, and a missing key must never
// take down a request path that is otherwise working — the same reasoning that made the
// deploy-time backup non-blocking. Callers get `{ ok: false, skipped: true }` and decide for
// themselves whether that's fatal.

const FROM = process.env.EMAIL_FROM ?? 'Siqt <noreply@siqt.no>';

export type SendResult = { ok: true } | { ok: false; skipped?: true; error?: string };

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(params: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Logged rather than silent: in development this is the only signal that an email *would*
    // have gone out, and which link it would have carried.
    console.warn(`[email] RESEND_API_KEY not set — skipping send to ${params.to} ("${params.subject}")`);
    return { ok: false, skipped: true };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    if (error) {
      console.error('[email] send failed:', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error('[email] send threw:', err instanceof Error ? err.message : err);
    return { ok: false, error: 'Email service unavailable' };
  }
}

// One shared shell so every email this app sends looks like it came from the same place, without
// pulling in a templating dependency for what is currently two messages. Plain inline styles —
// email clients ignore <style> blocks and stylesheets with wild inconsistency.
export function emailLayout(opts: { heading: string; body: string; cta?: { label: string; url: string }; footer?: string }): string {
  const cta = opts.cta
    ? `<p style="margin:28px 0;">
         <a href="${opts.cta.url}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;display:inline-block;">${opts.cta.label}</a>
       </p>
       <p style="margin:0 0 8px;color:#71717a;font-size:12px;">Or paste this link into your browser:</p>
       <p style="margin:0 0 24px;color:#52525b;font-size:12px;word-break:break-all;">${opts.cta.url}</p>`
    : '';

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:32px;">
    <div style="font-weight:800;font-size:18px;color:#18181b;margin:0 0 24px;">Siqt</div>
    <h1 style="font-size:20px;line-height:1.3;color:#18181b;margin:0 0 12px;">${opts.heading}</h1>
    <div style="font-size:14px;line-height:1.6;color:#3f3f46;">${opts.body}</div>
    ${cta}
    <p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;">
      ${opts.footer ?? 'If you weren&rsquo;t expecting this email, you can safely ignore it.'}
    </p>
  </div>
</body></html>`;
}
