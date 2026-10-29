#!/usr/bin/env bash
# Installs the helper that lets Settings, Software updates update this server. Run once, on the server:
#   sudo ./scripts/install-updater.sh              install and start
#   sudo ./scripts/install-updater.sh --uninstall  stop and remove
#   ./scripts/install-updater.sh --print           show what would be installed, change nothing
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_USER="$(stat -c %U "$APP_DIR/.git" 2>/dev/null || stat -c %U "$APP_DIR")"
UNIT=familycenter-updater
FILE="/etc/systemd/system/$UNIT.service"
unit() {
cat <<UNITEOF
[Unit]
Description=FamilyCenter updater (Settings, Software updates)
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/env bash $APP_DIR/scripts/updater.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNITEOF
}

case "${1:-}" in
  --print) unit; exit 0 ;;
  --uninstall)
    [ "$(id -u)" = 0 ] || { echo "Run with sudo: sudo $0 --uninstall" >&2; exit 1; }
    systemctl disable --now "$UNIT" 2>/dev/null || true; rm -f "$FILE"; systemctl daemon-reload
    echo "Removed. Software updates in Settings will say the helper is not installed."; exit 0 ;;
esac

[ "$(id -u)" = 0 ] || { echo "This needs administrator rights once. Run: sudo $0" >&2; exit 1; }
command -v systemctl >/dev/null || { echo "systemd was not found. Run scripts/updater.sh yourself in the background instead." >&2; exit 1; }
[ -d "$APP_DIR/.git" ] || { echo "$APP_DIR is not a git copy of the project (no .git folder), so it cannot be updated from GitHub." >&2; exit 1; }
id -nG "$RUN_USER" | tr ' ' '\n' | grep -qx docker || { echo "User $RUN_USER is not in the docker group. Run: sudo usermod -aG docker $RUN_USER   then try again." >&2; exit 1; }
command -v git >/dev/null || { echo "git is needed: sudo apt install git" >&2; exit 1; }

install -d -o "$RUN_USER" "$APP_DIR/updates" "$APP_DIR/backups"
# The app inside Docker runs as user id 1000 and must be able to write the request file here.
if [ "$(id -u "$RUN_USER")" = 1000 ]; then chmod 775 "$APP_DIR/updates"; else chmod 777 "$APP_DIR/updates"; fi
unit > "$FILE"
systemctl daemon-reload
systemctl enable --now "$UNIT"
sleep 2
systemctl --no-pager --lines=0 status "$UNIT" | head -4 || true
echo
echo "Installed. In the app: Settings, Software updates. It may take up to a minute to show as ready."
echo "If docker compose is not yet using the updates folder, run:  ./scripts/deploy.sh"
