#!/usr/bin/env bash
# Deploys PrintBook (asks first), turns on-chain writes on, and starts the service. Run as root after funding the wallet.
set -euo pipefail
APP=/opt/last-print
sudo -u lastprint bash -c "cd $APP/server && npm run -s deploy" < /dev/tty
grep -q '^PRINTBOOK_ADDRESS=0x' $APP/.env || { echo "PrintBook isn't deployed; stopping."; exit 1; }
sed -i 's/^WRITES_ENABLED=.*/WRITES_ENABLED=true/' $APP/.env
systemctl restart lastprint
sleep 20
sudo -u lastprint bash -c "cd $APP/server && npm run -s status"
echo; echo "Logs: journalctl -u lastprint -f   (Ctrl+C to stop watching)"
