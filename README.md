# Pallet Town Cafe Leaderboard

A full-stack Hall of Fame and battle-records website. Lifetime points and category win/loss standings are deliberately stored and ranked separately.

## Replit artifact

This folder is the runnable web artifact for the leaderboard. Its managed workflow runs Next.js on the Replit-provided `PORT` and serves both the UI and `/api/*` routes.

## Environment

Required:

- `DATABASE_URL` — PostgreSQL connection string.
- `AUTH_SECRET` — at least 32 characters in production.
- Either `ADMIN_PASSWORD_HASH` (bcrypt) or `ADMIN_PASSWORD` for the admin sign-in.

Do not commit `.env` or expose the password hash.

## Run locally

From this folder:

```bash
pnpm install
pnpm run db:push
pnpm run dev
```

The development database schema is synchronized with `prisma db push`. The current Replit development database includes the nullable `Player.image` column.

## Security and data behavior

The admin password is verified server-side and an httpOnly, signed, expiring cookie authorizes every mutation and Excel export/import. All admin actions are protected on the server. Deleting a player is a soft delete, preserving their point history.

Battle matches are the source of truth for category standings: creating, editing, moving, or deleting a match rebuilds the affected category records from the remaining match history. Player images are optional URLs with initials/IGN fallbacks when absent or unavailable.


## Oracle production migration

See [deploy/oracle/README.md](deploy/oracle/README.md) for VM, secure environment,
Nginx/HTTPS, systemd, deployment, rollback and verification steps. Production uses
the existing Supabase database; do **not** run the development `db:push` instructions
above against it. Use the committed lockfile with `npm ci`.

Run `npm run test:media` for route regressions and an Excel export/import round-trip
with isolated in-memory database delegates. These do not access production and do
not replace real PostgreSQL/browser acceptance tests.
