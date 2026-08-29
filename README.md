# Pallet Town Cafe Leaderboard

A full-stack, responsive Hall of Fame and battle-records website. Lifetime points and category win/loss standings are deliberately stored and ranked separately.

## Run locally

1. Install Node.js 20+.
2. Copy `.env.example` to `.env`. Generate a bcrypt hash for the admin password and place it in `ADMIN_PASSWORD_HASH`; set a unique `AUTH_SECRET`.
3. Run `npm install`, `npm run db:push`, `npm run dev`.

## Deploy safely

Deploy to Vercel with your Supabase PostgreSQL database. Copy the Supabase connection URI into Vercel as `DATABASE_URL`, run `npx prisma db push` once from a local terminal or database migration workflow, and set all environment variables in the Vercel dashboard. Do not commit `.env` or expose the password hash.

## Security model

The password is never shipped to the browser. A server-side bcrypt hash verifies login and an httpOnly, signed, expiring cookie authorizes every mutation and Excel export/import. Deleting a player is a soft delete, preserving their point history.

## GitHub

This workspace has no repository accessible through the connected GitHub account. Create an empty GitHub repository, upload this folder, then connect that repository to your host. The complete project is ready at `outputs/pallet-town-cafe-leaderboard`.

