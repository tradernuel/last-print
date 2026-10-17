#!/usr/bin/env bash
# Pulls the latest code from GitHub and restarts the service. Run as root.
set -euo pipefail
APP=/opt/last-print
sudo -u lastprint bash -c "cd $APP && git pull -q && npm ci --no-audit --no-fund --loglevel=error"
systemctl restart lastprint
sleep 10
sudo -u lastprint bash -c "cd $APP/server && npm run -s status"
