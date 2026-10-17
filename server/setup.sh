#!/usr/bin/env bash
# Last Print server setup for a fresh Ubuntu 24.04 server. Run as root:
#   curl -fsSL https://raw.githubusercontent.com/tradernuel/last-print/main/server/setup.sh -o setup.sh && bash setup.sh
# Safe to run again: it skips what's already done.
set -euo pipefail
APP=/opt/last-print
REPO=https://github.com/tradernuel/last-print.git
say() { printf "\n\033[1;35m==> %s\033[0m\n" "$*"; }

say "Installing system packages (Node 22, Caddy, SQLite tools)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ufw sqlite3 debian-keyring debian-archive-keyring apt-transport-https gnupg >/dev/null
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi
echo "node $(node -v), caddy $(caddy version | cut -d' ' -f1)"

say "Firewall: allow SSH and web traffic only"
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null

say "App user and code"
id lastprint >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin lastprint
if [ ! -d "$APP/.git" ]; then git clone -q "$REPO" "$APP"; else git -C "$APP" pull -q; fi
chown -R lastprint:lastprint "$APP"
sudo -u lastprint bash -c "cd $APP && npm ci --no-audit --no-fund --loglevel=error"

say "Settings (.env)"
ENV=$APP/.env
touch "$ENV"; chown lastprint:lastprint "$ENV"; chmod 600 "$ENV"
setvar() { grep -q "^$1=" "$ENV" || echo "$1=$2" >> "$ENV"; }
ask() { # ask NAME "question" secret?
  if ! grep -q "^$1=." "$ENV"; then
    if [ "${3:-}" = secret ]; then read -rsp "$2: " v < /dev/tty; echo; else read -rp "$2: " v < /dev/tty; fi
    sed -i "/^$1=/d" "$ENV"; echo "$1=$v" >> "$ENV"
  fi
}
ask HYPERSYNC_TOKEN "Paste your HyperSync token (input hidden)" secret
ask OPENSEA_API_KEY "Paste your OpenSea API key (input hidden)" secret
ask CORS_ORIGINS "Your Vercel site address, e.g. https://last-print-xxxx.vercel.app"
setvar MONAD_RPC_HTTP https://rpc.monad.xyz
setvar DB_PATH $APP/data/lastprint.db
setvar PORT 8787
setvar WRITES_ENABLED false

say "Server wallet"
sudo -u lastprint bash -c "cd $APP/server && npm run -s wallet:new"

say "Import the verified history"
sudo -u lastprint bash -c "cd $APP/server && npm run -s import:history"

say "Background service"
cat > /etc/systemd/system/lastprint.service <<UNIT
[Unit]
Description=Last Print server
After=network-online.target
Wants=network-online.target

[Service]
User=lastprint
WorkingDirectory=$APP/server
ExecStart=/usr/bin/npm run -s start
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable lastprint >/dev/null 2>&1

say "HTTPS address"
IP=$(curl -fsS -4 https://api.ipify.org)
HOST="$(echo "$IP" | tr . -).sslip.io"
cat > /etc/caddy/Caddyfile <<CADDY
$HOST {
  encode gzip
  handle /api/* {
    reverse_proxy 127.0.0.1:8787 {
      flush_interval -1
    }
  }
  respond "Last Print API. Try /api/health" 200
}
CADDY
systemctl reload caddy || systemctl restart caddy

say "Nightly database backup (kept 14 days)"
cat > /etc/cron.daily/lastprint-backup <<'CRON'
#!/bin/sh
mkdir -p /var/backups/lastprint
sqlite3 /opt/last-print/data/lastprint.db ".backup /var/backups/lastprint/lastprint-$(date +%F).db"
find /var/backups/lastprint -name '*.db' -mtime +14 -delete
CRON
chmod +x /etc/cron.daily/lastprint-backup

say "Done"
echo "Your API address: https://$HOST/api/health"
echo "Next: send about 10 MON to the server wallet shown above, then run:  bash $APP/server/go-live.sh"
