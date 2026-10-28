#!/usr/bin/env bash
# Creates .env for Docker from .env.example with fresh random secrets.
# Usage: ./scripts/make-env.sh https://family.example.com     (or http://192.168.0.50:3000 on a home network)
# Refuses to overwrite an existing .env, so it is safe to run twice. Keep the result private: it holds every secret.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${1:-}"
if [ -z "$BASE" ]; then echo "Usage: $0 <public address>, for example https://family.example.com" >&2; exit 1; fi
BASE="${BASE%/}"
if [ -e .env ]; then echo ".env already exists. Move it away first if you really want a new one." >&2; exit 1; fi
command -v openssl >/dev/null || { echo "openssl is needed (sudo apt install openssl)" >&2; exit 1; }
hex() { openssl rand -hex "$1"; }
cp .env.example .env
chmod 600 .env
set_var() { # name value : replaces the first "NAME=" line, keeping any comment-only lines
  local v="${2//\\/\\\\}"; v="${v//&/\\&}"; v="${v//|/\\|}"
  sed -i "s|^$1=.*|$1=$v|" .env
}
set_var POSTGRES_USER family
set_var POSTGRES_DB family
set_var POSTGRES_PASSWORD "$(hex 24)"
set_var APP_USER_PASSWORD "$(hex 24)"
set_var APP_WORKER_PASSWORD "$(hex 24)"
set_var AUTH_SECRET "$(hex 32)"
set_var APP_ENCRYPTION_KEYS "1:$(openssl rand -base64 32)"
set_var BASE_URL "$BASE"
case "$BASE" in
  https://*) set_var TRUST_PROXY true; set_var COOKIE_SECURE true ;;
  *) echo "Note: $BASE is not https. Fine for a home network; Google Calendar sign-in needs https (or localhost)." ;;
esac
set_var GOOGLE_OAUTH_STATUS testing
set_var AI_DAILY_CALL_CAP 50
set_var ALLOW_PRIVATE_AI_URLS false
set_var BACKUP_KEEP_DAYS 14
echo "Created .env. Open it to add Google or email settings if you want them. Back it up somewhere safe (a password manager):"
echo "if APP_ENCRYPTION_KEYS is lost, saved Google and AI keys cannot be read again."
