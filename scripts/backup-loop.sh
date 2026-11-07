#!/bin/sh
# Nightly pg_dump inside the docker "backup" service. Keeps 30 days of dumps.
while true; do
  f="/backups/hecotec_$(date +%Y%m%d_%H%M%S).dump"
  if pg_dump -h db -U hecotec -d hecotec_wms -Fc -f "$f"; then
    echo "backup ok: $f"
  else
    echo "backup FAILED" >&2
  fi
  find /backups -name 'hecotec_*.dump' -mtime +30 -exec rm -- {} \;
  sleep 86400
done
