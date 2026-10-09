# Oracle migration — existing Supabase database

Target: Ubuntu 24.04, Ampere A1 ARM64, a non-root `ubuntu` SSH account,
Next.js behind Nginx, and systemd. No new production database or schema changes.

## 1. Account and VM

In OCI Console confirm the tenancy's actual Always Free allowance. Use an eligible
Ubuntu image and A1 Flex shape in your home region (current documentation lists a
total allowance of 2 OCPUs and 12 GB RAM). A 50 GB boot disk is sufficient to start.
Do not use trial-only paid shapes. Free capacity may be unavailable. Idle free VMs
may be reclaimed; retain backups and these reproducible deployment instructions.

Create a public subnet with internet gateway and default route. Assign a public IP.
OCI security list/NSG: allow TCP 80 and 443 publicly; TCP 22 only from your access IP.
Apply corresponding guest firewall rules without flushing Oracle's existing rules.
Do not expose port 3000. Verify outbound connectivity to Supabase and external sprites.

From Windows PowerShell connect with your own SSH key:

```powershell
ssh -i "$env:USERPROFILE\.ssh\your-oracle-key" ubuntu@YOUR_VM_IP
```

Keep the private key, database URI/password and auth secrets out of chats and GitHub.

## 2. Prepare Ubuntu

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates xz-utils nginx certbot python3-certbot-nginx
sudo install -d -o ubuntu -g ubuntu -m 750 /opt/ptc /opt/ptc/releases
sudo install -d -o root -g ubuntu -m 750 /etc/ptc
git clone --branch oracle-migration https://github.com/pallettowncafe0-svg/pallet-town-cafe-leaderboard.git /opt/ptc/repo
bash /opt/ptc/repo/deploy/oracle/install-node.sh
```

The service expects `/usr/bin/node`. `install-node.sh` installs Node 22 from
nodejs.org for the VM architecture and verifies the official published checksum.
If a different SSH user or Node location is used, update the service and ownership.

## 3. Back up and configure secrets

Before changing credentials take a full PostgreSQL backup from existing Supabase
and securely retain it. Excel export is a supplemental backup, not a complete
snapshot: existing export does not include every database field (for example
background/logo settings and player notes). Record actual production table counts.
Rotate the exposed DB password and update any retained deployment credentials.

```bash
sudo install -o root -g ubuntu -m 640 /dev/null /etc/ptc/leaderboard.env
sudoedit /etc/ptc/leaderboard.env
```

Use `.env.example` for the variable names. Populate the SAME existing Supabase
project's `DATABASE_URL`, a new random `AUTH_SECRET` (at least 32 characters),
and a strong `ADMIN_PASSWORD_HASH` or `ADMIN_PASSWORD`. Prefer the bcrypt hash;
leave the plain password unset if using the hash. Never print/share this file.
Generate a secret locally with `openssl rand -hex 32`.

Confirm connection method from your Supabase project: direct connectivity may
require IPv6; the session pooler is an alternative for a persistent server if
IPv6 is unavailable. Use the exact URI supplied for your project, with SSL.
URL-encode special password characters. This migration uses no `db:push`, reset,
seed or migration command against production.

## 4. Install service and make first release

```bash
sudo cp /opt/ptc/repo/deploy/oracle/ptc.service /etc/systemd/system/ptc.service
sudo systemctl daemon-reload
sudo systemctl enable ptc
bash /opt/ptc/repo/deploy/oracle/deploy.sh
sudo systemctl status ptc --no-pager
```

The script builds a new directory, verifies code with synthetic tests, switches the
`current` symlink only after success, restarts systemd and checks database health.
A failed health check restores the previous release when one exists. Keep old
release directories until verification; they are not deleted automatically.
Do not run simultaneous deployments. Health checks execute only `SELECT 1`.

## 5. Nginx and HTTPS

Use a hostname you control, initially a test subdomain if possible. The old
`*.vercel.app` address cannot be pointed at Oracle using your own DNS settings.

```bash
sudo cp /opt/ptc/repo/deploy/oracle/nginx.conf /etc/nginx/sites-available/ptc
sudoedit /etc/nginx/sites-available/ptc
```

Replace `leaderboard.example.com` with your hostname. Point its DNS A record at
the VM IP. Add an AAAA record only if IPv6 is configured and reachable.

```bash
sudo install -d -o www-data -g www-data /var/cache/nginx/ptc-media
sudo ln -s /etc/nginx/sites-available/ptc /etc/nginx/sites-enabled/ptc
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d YOUR_HOSTNAME --redirect
sudo certbot renew --dry-run
```

Nginx permits uploads up to 50 MB for Excel backups; raise this intentionally if
real backups require it. Import timeout is 180 seconds (existing transaction
limit: 120 seconds). Only versioned `/api/media` responses are cached. Errors,
unversioned images, `/api/data`, admin and Excel routes are not shared-cached.
The cache key includes the full query string. `X-Media-Cache` shows MISS/HIT.
HTTPS is necessary for production admin cookies. Do not test admin login over HTTP.

Optional Cloudflare DNS/proxy can be added later; use Full (strict) TLS and never
apply a blanket cache rule to API/admin routes. Oracle works without Cloudflare.

## 6. Verification and cutover

Check homepage, Hall of Fame, battle boards, players/PFPs, category art,
background/logo, match history, points and PokéCompare including scores.
Test login and image updates, create/edit player/category, points and match edits
first on an isolated database restored from a backup. Test actual PostgreSQL
Excel export/import round-trip there. The importer REPLACES records; do not use
production import as a migration test.

Once the production VM uses existing Supabase, verify reads, existing media,
login and export; make only deliberate admin changes. Compare production counts
against the recorded baseline. Restart the service, then reboot the VM to confirm
autostart and persistence. Retain Vercel until production verification passes.

Measure payload and caching from your own computer:

```bash
curl --fail --silent https://YOUR_HOSTNAME/api/data -o /tmp/ptc-data.json
wc -c /tmp/ptc-data.json
```

Confirm `data:image/` is absent from image fields throughout JSON. Request an exact
versioned image URL from that JSON twice and inspect `X-Media-Cache`: first MISS,
then HIT (if already cached both can be HIT). Change an image and verify a new `v`
and new bytes. A stale version absent from cache returns 404 with `no-store`.

Normal leaderboard queries now exclude stored image fields, including nested
players/categories. PostgreSQL computes image hashes and returns small metadata
rows; the blobs remain in the existing database. Media cache misses and Excel
backups still retrieve original images, so monitor Supabase usage. On 9 October
2026, the production metadata query returned 42 rows totalling 5,073 JSON bytes
with no base64 image payloads. This is metadata size, not the full API size.

The production read-only audit also found RLS disabled and anonymous read/write
grants on all six application tables. Review `deploy/supabase/enable-rls.sql`
before applying it. Confirm that no other client depends on direct anonymous
Data API access and that the deployed Prisma database role bypasses RLS. This
security script is deliberately not part of deployment and has not been applied.

## 7. Updates and rollback

GitHub remains the source of truth. The repo checkout is for fetching commits;
release contents come from `git archive`, so local edits are not deployed.

```bash
bash /opt/ptc/repo/deploy/oracle/deploy.sh origin/oracle-migration
```

To pin a deployment, supply a known commit SHA instead of a branch. To roll back,
redeploy a known previously healthy SHA. Build failures leave the running release
untouched. Repeated failed starts may need `sudo systemctl reset-failed ptc`
after the underlying issue is corrected. View logs with `sudo journalctl -u ptc`;
redact credentials before sharing logs. Monitor disk growth and remove confirmed
obsolete releases intentionally, preserving at least one healthy rollback release.

References:
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://nextjs.org/docs/15/app/guides/self-hosting
- https://nginx.org/en/docs/http/ngx_http_proxy_module.html
