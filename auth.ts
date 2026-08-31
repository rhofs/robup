import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { ensurePersonalWorkspace } from '@/lib/personalWorkspace';

// Single config file, not split into an Edge-safe auth.config.ts + a full auth.ts like most
// Auth.js tutorials show — that split exists to keep OAuth-only checks usable in an Edge-runtime
// middleware. Next 16 renamed middleware.ts to proxy.ts and made it default to the Node.js
// runtime (see node_modules/next/dist/docs/.../file-conventions/proxy.md), so proxy.ts can just
// re-export this whole config directly. Revisit only if a future host forces Edge for proxy.ts.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' }, // required — Credentials + the adapter can't use 'database' sessions
  pages: { signIn: '/login' },
  // No AUTH_URL/NEXTAUTH_URL is set *locally* (this app is reachable from more than one origin
  // during dev — localhost:3000 AND whatever LAN IP a second machine uses, see next.config.ts's
  // allowedDevOrigins) — trustHost makes Auth.js construct callback/redirect URLs from the
  // incoming request's own Host header instead of a single hardcoded origin. Without this,
  // someone reaching the app via a LAN IP got redirected to `localhost:3000` post-login — an
  // address that resolves to *their own machine*, not this server, so the page just looked dead
  // after clicking any sign-in button.
  // Now that the app is actually deployed behind Cloudflare (siqt.no), a bare Host-header-derived
  // origin would be a real Host-header-injection risk (the Pterodactyl origin is also reachable
  // directly by IP, not only through Cloudflare) — production's own `AUTH_URL=https://siqt.no`
  // env var is what closes that gap: when set, it *fully* overrides Host-header-based URL
  // construction regardless of trustHost (see the 2026-08-10 sessions in PLANNING.md, and its own
  // confirmed-working record once deployed). trustHost itself stays on since dev still needs it —
  // just confirm AUTH_URL is genuinely still set on the production server if this ever comes into
  // question again, don't assume from this comment alone.
  trustHost: true,
  providers: [
    Google({
      // Reuses the SAME Google Cloud OAuth Client ID/Secret as the unrelated Docs-export feature
      // (lib/google/oauthClient.ts) — just needed one more Authorized redirect URI registered in
      // Google Cloud Console (see PLANNING.md). Default scopes only (openid email profile), never
      // GOOGLE_EXPORT_SCOPES's `documents` scope. This flow's tokens land in the new Account
      // table via the adapter; they never touch User.googleRefreshToken/googleEmail, which stay
      // exclusively owned by the export feature's own /api/google/oauth/start|callback routes.
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Lets someone who signed up with email/password also sign in with Google using the same
      // address and land on the same account, instead of Auth.js's default
      // OAuthAccountNotLinked error. Accepted here because Google itself verifies the email —
      // this app has no other provider whose email claim would be untrustworthy.
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const email = typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';
        if (!email || !password) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        // Explicit reject, not a crash — also covers a Google-only account (password: null)
        // attempting Credentials sign-in.
        if (!user?.password) return null;
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return null;
        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
  callbacks: {
    // Auth.js doesn't attach the app's own user id onto the session by default — this closes
    // that gap (see types/next-auth.d.ts for the matching Session.user.id type augmentation).
    async jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
    // Backs proxy.ts (re-exported as `auth as proxy`) — true/false decides allow vs. redirect to
    // pages.signIn ('/login').
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
  events: {
    // User.initials has a "" DB default so the adapter's bare createUser() insert never fails
    // (it only ever supplies id/name/email/emailVerified/image) — backfill a real value
    // immediately after, invisible to the user in practice.
    async createUser({ user }) {
      if (!user.id) return;
      const name = user.name ?? user.email?.split('@')[0] ?? '';
      const parts = name.trim().split(/\s+/).filter(Boolean);
      const initials = parts.length
        ? ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] ?? '')).toUpperCase()
        : '?';
      await prisma.user.update({ where: { id: user.id }, data: { initials } }).catch(() => {});
      // Same up-front personal workspace the email/password signup route creates — this is the
      // *other* account-creation path (first-ever Google sign-in), and a new account arriving
      // through it would otherwise land in the app with zero workspaces and almost everything
      // gated off. See lib/personalWorkspace.ts.
      await ensurePersonalWorkspace(user.id).catch(() => {});
    },
  },
});
