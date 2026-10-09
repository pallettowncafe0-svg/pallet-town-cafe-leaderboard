#!/usr/bin/env bash
# Run as ubuntu. Repo: /opt/ptc/repo. Secrets: /etc/ptc/leaderboard.env.
set -euo pipefail
umask 027
repo=/opt/ptc/repo
releases=/opt/ptc/releases
current=/opt/ptc/current
ref=${1:-origin/oracle-migration}
exec 9>/opt/ptc/deploy.lock
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
test -r /etc/ptc/leaderboard.env || { echo 'Configure the private environment file first.' >&2; exit 1; }
sudo -v
# Ref is resolved to an immutable commit before building.
git -C "$repo" fetch origin
commit=$(git -C "$repo" rev-parse --verify "${ref}^{commit}")
release="$releases/$(date -u +%Y%m%dT%H%M%SZ)-${commit:0:12}"
mkdir -p "$release"
git -C "$repo" archive "$commit" | tar -x -C "$release"
ln -s /etc/ptc/leaderboard.env "$release/.env"
cd "$release"
npm ci
npm exec -- prisma generate
npm run typecheck
npm run test:media
npm run build
previous=$(readlink -f "$current" || true)
ln -s "$release" /opt/ptc/current.next
mv -Tf /opt/ptc/current.next "$current"
sudo systemctl restart ptc
healthy=0
for attempt in $(seq 1 15); do
    if curl --fail --silent --max-time 5 http://127.0.0.1:3000/api/health >/dev/null; then healthy=1; break; fi
    sleep 2
done
if [ "$healthy" -ne 1 ]; then
    if [ -n "$previous" ] && [ -d "$previous" ]; then
        ln -s "$previous" /opt/ptc/current.next
        mv -Tf /opt/ptc/current.next "$current"
        sudo systemctl restart ptc
        echo 'Health check failed; restored previous release.' >&2
    else
        echo 'First deployment health check failed; inspect journalctl -u ptc.' >&2
    fi
    exit 1
fi
printf 'Deployed commit %s\n' "$commit"
