#!/usr/bin/env bash
# HECOTEC WMS — one-time setup on a fresh Hetzner Ubuntu 24.04 server.
# Run as root from the project folder:   cd /opt/hecotec && sudo bash deploy/server-setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)."; exit 1; }

say "System updates + Docker"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

say "Firewall: only SSH, HTTP, HTTPS"
apt-get install -y ufw fail2ban unattended-upgrades
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

say "Swap (protects against out-of-memory during builds)"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "Configuration (.env)"
if [ ! -f .env ]; then
  read -rp "Domain (e.g. anbar.hecotec.az): " DOMAIN
  read -rp "E-mail for certificate notices: " ACME_EMAIL
  PGPASS="$(openssl rand -hex 24)"
  cat > .env <<EOF
POSTGRES_PASSWORD="${PGPASS}"
DOMAIN="${DOMAIN}"
ACME_EMAIL="${ACME_EMAIL}"
APP_URL="https://${DOMAIN}"
COOKIE_SECURE="true"
SESSION_TTL_HOURS=12
EOF
  chmod 600 .env
  echo "Created .env (database password generated randomly)."
else
  echo ".env already exists — kept."
fi
set -a; . ./.env; set +a

say "Checking DNS: ${DOMAIN} → this server"
SERVER_IP="$(curl -4fsS https://api.ipify.org || true)"
DNS_IP="$(getent ahostsv4 "${DOMAIN}" | awk 'NR==1{print $1}' || true)"
echo "Server IP: ${SERVER_IP:-?}   DNS ${DOMAIN}: ${DNS_IP:-not found}"
if [ -n "${SERVER_IP}" ] && [ "${SERVER_IP}" != "${DNS_IP}" ]; then
  echo "WARNING: DNS does not point here yet. HTTPS certificate will be issued automatically once it does."
fi

say "Build and start (db → migrations → app → HTTPS proxy → nightly backups)"
mkdir -p backups
docker compose --profile full up -d --build

say "Base configuration (units, categories, approval route, warehouses)"
docker compose --profile tools run --rm tools npm run db:seed

say "First Super Admin"
read -rp "Admin e-mail: " ADMIN_EMAIL
while true; do
  read -rsp "Admin password (min 10 chars, letters + digits): " ADMIN_PASSWORD; echo
  read -rsp "Repeat password: " ADMIN_PASSWORD2; echo
  [ "$ADMIN_PASSWORD" = "$ADMIN_PASSWORD2" ] && break
  echo "Passwords do not match, try again."
done
docker compose --profile tools run --rm -e ADMIN_EMAIL="$ADMIN_EMAIL" -e ADMIN_PASSWORD="$ADMIN_PASSWORD" tools npm run admin:create
unset ADMIN_PASSWORD ADMIN_PASSWORD2

say "Auto-start after reboot"
cat > /etc/systemd/system/hecotec.service <<EOF
[Unit]
Description=HECOTEC WMS (docker compose)
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/docker compose --profile full up -d
ExecStop=/usr/bin/docker compose --profile full stop
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable hecotec.service

say "Done"
docker compose --profile full ps
echo
echo "Open: https://${DOMAIN}   (health: https://${DOMAIN}/api/health?deep=1)"
echo "Backups: ${APP_DIR}/backups (daily, 30 days kept)"
