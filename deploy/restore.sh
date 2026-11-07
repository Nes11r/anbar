#!/usr/bin/env bash
# Restore the database from a backup file:   sudo bash deploy/restore.sh backups/hecotec_YYYYMMDD_HHMMSS.dump
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?usage: restore.sh <backup.dump>}"
[ -f "$FILE" ] || { echo "File not found: $FILE"; exit 1; }
read -rp "This REPLACES the current database with $FILE. Type YES to continue: " OK
[ "$OK" = "YES" ] || exit 1
docker compose stop app
docker compose exec -T db pg_restore -U hecotec -d hecotec_wms --clean --if-exists < "$FILE"
docker compose --profile full up -d app
echo "Restored. Check: /api/health?deep=1 → ledgerMismatches must be 0"
