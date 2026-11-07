#!/usr/bin/env bash
# HECOTEC WMS — update to the latest code on the server.
#   cd /opt/hecotec && sudo bash deploy/update.sh
# Takes a backup first, rebuilds, applies migrations, restarts with minimal downtime.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

echo "==> Backup before update"
mkdir -p backups
docker compose exec -T db pg_dump -U hecotec -d hecotec_wms -Fc > "backups/pre-update_$(date +%Y%m%d_%H%M%S).dump"

if [ -d .git ]; then
  echo "==> Pull latest code"
  git pull --ff-only
fi

echo "==> Build new images (old version keeps running meanwhile)"
docker compose --profile full build

echo "==> Apply migrations and restart"
docker compose --profile full up -d

echo "==> Waiting for health check"
for i in $(seq 1 30); do
  if curl -fsS "https://${DOMAIN}/api/health" >/dev/null 2>&1; then echo "OK — https://${DOMAIN}"; docker image prune -f >/dev/null; exit 0; fi
  sleep 3
done
echo "Health check did not pass yet — see: docker compose logs --tail=100 app"
exit 1
