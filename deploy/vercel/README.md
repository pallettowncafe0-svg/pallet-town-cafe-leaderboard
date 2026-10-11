# Vercel deployment

Deploy GitHub branch `vercel` from the repository root. Keep existing Supabase.
Framework: Next.js. Node: 22.x. Install: npm ci. Build: npm run build.
Output directory: framework default (do not override).
Set Production Branch to vercel in project settings before production deployment.
Enable Fluid Compute, particularly for Excel import's 120-second transaction.
Functions run in iad1 near the existing us-east-1 Supabase project.

Set secure environment variables in Vercel Production and the preview environment
used for testing: DATABASE_URL, AUTH_SECRET, and ADMIN_PASSWORD_HASH (preferred)
or ADMIN_PASSWORD. Never commit credentials. Use a fresh random AUTH_SECRET.
Rotate the previously exposed database password before putting production online.
Use the existing project's Supabase Transaction pooler URI (port 6543), with
sslmode=require&pgbouncer=true&connection_limit=1. Copy its exact host/user from
Supabase Connect. Session mode can exhaust its 15 backend slots in serverless.
The app also limits Prisma to one connection per warm Vercel instance.
Do not run db:push, reset, seed or migration commands against production.

Deploy only within an available Vercel team; code cannot clear an account pause.
Keep the old project until the new production deployment is verified.

Validation after deploy:
- /api/health returns 200 and {ok:true}.
- /api/data is lightweight and contains no data:image/ payloads in image fields.
- Same exact versioned /api/media URL requested twice reaches x-vercel-cache HIT;
  inspect with ordinary requests, without forced cache bypass headers.
- Only versioned media is public cached. Data/admin/Excel remain uncached.
- Check all boards, player/category images, background/logo, PokéCompare and login.
- Verify normal field edits preserve images; replacing images changes URL version.
- Export and inspect Excel. Compression reduces size without dropping images.
- Vercel imposes a 4.5 MB function request/response limit. Existing or future Excel
  files exceeding it cannot be uploaded through this route; do not assume any
  historical backup fits. Large individual image uploads also need to fit the
  complete encoded request. Test import only in an isolated database, since it
  replaces production records. Browser and real Postgres import tests are pending.
- Monitor Fast Origin Transfer, Fast Data Transfer and Supabase egress.

Local checks: npm run typecheck; npm run test:media; npm run build.
These do not prove production credentials, account eligibility or live CDN hits.
