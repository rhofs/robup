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

`DATABASE_URL` is `file:./siqt.db`, i.e. the live database sits in the repo root, and the
Pterodactyl install script ends with `git clean -fd`. `git clean` deletes untracked files but
spares ignored ones, so the `.gitignore` entry for `/siqt.db` is what keeps every Re-install from
wiping production. Never remove it, and never run `git clean -fdx` (the `-x` also removes ignored
files) against a production checkout.
