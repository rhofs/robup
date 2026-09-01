# Keep PLANNING.md current — it is this project's memory

`PLANNING.md` is the running record of the project: what is built, what each session actually did,
what is still open, and the hard-won lessons ("Known bugs / things to remember") that no amount of
reading the code would reveal. Sessions are short and start with no memory of the last one; this
file is the only reason the next one begins informed instead of re-deriving the same conclusions
or repeating a mistake that has already been paid for once.

**Every session that changes anything updates it before finishing, without being asked:**

- a dated session entry — what was done and *why*, including approaches tried and rejected, and
  anything left unverified
- the "Next steps / not built yet" notes and the latest checkpoint, so what is open stays true
- a new "Known bugs / things to remember" entry for any lesson that cost real debugging time and
  would not be obvious from the code afterwards

Write for a reader who was not in the conversation. State plainly what is *not* done and what is
*not* confirmed — an entry that makes something sound more finished than it is costs more than no
entry at all.

Infrastructure that lives outside this repo belongs here too — the Pterodactyl egg config, cron
jobs on the host, panel settings. None of it appears in `git log`, and there is nowhere else it is
written down. An automated job nobody remembers exists is one nobody notices has stopped working.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Schema changes go through migrations, not `db push`

This project used `prisma db push` for its whole history, and production's deploy ran
`db push --accept-data-loss` on every start — meaning any schema change that dropped or narrowed
a column applied itself to live data automatically, with Prisma's own data-loss warning
suppressed and no way back. That is now replaced:

- **Locally**, make schema changes with `npx prisma migrate dev --name <what-changed>`. It writes
  a reviewable SQL file under `prisma/migrations/` that goes into git with the change.
- **Production** runs `npx prisma migrate deploy` (see `deploy:prod`), which only ever applies
  migrations that are actually committed. It will refuse to run a migration that would lose data
  unless that migration says so explicitly — which is the point.
- **Do not run `prisma db push` against production**, and avoid it locally too once a change is
  meant to ship: it mutates the database without leaving a migration behind, so production and
  the migration history silently drift apart.

`prisma/migrations/0_init/` is a baseline generated from the schema as it stood when migrations
were introduced; it was verified with `migrate diff` to produce byte-identical structure to the
then-current schema.

# The production database lives inside the git working tree

`DATABASE_URL` is `file:./siqt.db`, which reads like the repo root but is not: **Prisma resolves a
relative SQLite path against the schema file's directory**, so the live database is at
`prisma/siqt.db`. A first attempt at protecting it ignored `/siqt.db` and therefore protected
nothing at all — verify the real path on the server (`find … -name '*.db'`) rather than trusting
how the URL reads.

The Pterodactyl install script ends with `git clean -fd`, which deletes untracked files but spares
ignored ones, so the `/prisma/*.db` entry in `.gitignore` is what keeps every Re-install from
wiping production. Never remove it, and never run `git clean -fdx` (the `-x` also removes ignored
files) against a production checkout.
