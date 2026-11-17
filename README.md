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



## Excel data backups and reviewed imports (1.1)

Excel export excludes all image bytes at the database query level, including nested player/category relations and PokéCompare artwork. It includes stable Player ID and Category ID columns to preserve identity when names change. Keep those IDs intact when editing an export. This is a data-only backup; images need a separate full database/media backup for recovery into an empty database.

Import is a two-step admin workflow under Backup & Restore: choose a file and import mode, generate a preview, optionally select sheets and refresh, then review per-field current/after values before applying. The preview supports additions/changes/removals filters and search.

- Merge (default) upserts history rows by their IDs and preserves rows absent from the workbook. History rows without IDs are new entries, so importing them repeatedly adds entries.
- Replace selected histories removes match/point history rows missing from the selected sheets. Empty selected history sheets clear those histories; omitted/unselected sheets are untouched.
- Players/categories are updated in place and never deleted by import, including those absent from the file. Stable IDs take priority, with IGN/name fallback for older backups. Non-image fields on listed rows may be cleared by blank cells.
- Category standings are recomputed from match history for affected boards. Pokémon sets and supported non-image settings are included in the preview. Selected high-score sheets replace that score list.
- Every image field and all unrelated settings are excluded by a shared read/write allowlist. Legacy image columns are ignored. Image editing remains available through normal site controls.
- Preview is read-only. Confirmation uses a signed 15-minute token bound to the exact file, options and non-image database snapshot. Stale previews require a refresh; application runs atomically in a serializable transaction.

Validation: `npm run test:media`, `npm run test:import`, `npm run test:backup`, `npm run typecheck`, and `npm run build`. Tests use isolated synthetic database delegates and never connect to Supabase. To check a real backup locally, pass its path to `npm run test:import -- /path/to/backup.xlsx`.

Backup round-trip checks cover unedited exports (zero changes) and a one-point lifetime edit (exactly one change), including native Excel date cells, milliseconds, high-score timestamps and null/empty Pokémon lineups. New exports use exact ISO UTC date text. Legacy native date cells are decoded as UTC numeric serials; only floating point drift within 2 ms retains the existing instant. Explicit ISO timestamp edits are compared exactly. Equivalent empty lineups retain their original stored representation.


## Loading screen and searchable history

Admin Controls → Loading Screen GIF accepts GIF uploads up to 2 MB. Admins can replace/remove the animation and toggle white-background blending, with a preview of the current GIF. The original bytes are stored in the existing Setting table; no schema migration is needed. A default animation is shown until a GIF is configured. The initial loading screen lasts at least 1.5 seconds and waits for leaderboard data. Data failures show a retry action, and broken GIFs fall back to the default animation.

The initial page fetches only GIF version metadata from `/api/loading`; GIF bytes use `/api/media`'s versioned cache. Browser storage contains only the small versioned URL/appearance to display the GIF promptly on repeat visits. Excel export/import never reads or writes the loading GIF or its appearance setting.

History provides Points & Matches, Points only, and Matches only search. Each section shows its latest 10 entries, with older entries behind an expandable section and a Load 10 More button. `/api/history` searches all records by player name/IGN, category, point reason/action/admin or match notes; integer searches also match point changes and totals. It fetches only ten entries plus a pagination lookahead per type, with no image columns or embedded image data. Existing admin edit/delete controls are retained.

Validation: `npm run test:loading-history` uses synthetic delegates to verify paging, searches beyond the previous 100-entry limit, upload authorization/validation, GIF preservation/removal, and cache headers.
