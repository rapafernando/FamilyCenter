#!/usr/bin/env bash
# The helper behind Settings, Software updates. It runs on the server itself (installed once with scripts/install-updater.sh),
# because the web app inside Docker is not allowed to control Docker. It does nothing until the web app drops a request file
# in ./updates, and then it: checks the copy is clean, saves a backup, downloads the new version from GitHub, builds it,
# restarts, checks the app comes up, and puts the old version back if it does not. Progress goes to ./updates/status.json.
#
#   scripts/updater.sh          run forever (this is what the service does)
#   scripts/updater.sh --once   handle one waiting request, then exit (used by tests)
set -uo pipefail
APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$APP_DIR" || exit 1

envval() { [ -f .env ] && grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '"' || true; }
UPDATES="${UPDATE_DIR:-$APP_DIR/updates}"
REMOTE="${UPDATE_REMOTE:-origin}"
BRANCH="${UPDATE_BRANCH:-$(envval UPDATE_BRANCH)}"; BRANCH="${BRANCH:-main}"
COMPOSE="${COMPOSE_CMD:-docker compose}"
HEALTH_WAIT="${HEALTH_WAIT:-240}"
POLL="${POLL_SECONDS:-4}"
LOG="$UPDATES/update.log"
mkdir -p "$UPDATES"
chmod 777 "$UPDATES" 2>/dev/null || true

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
jline() { printf '%s' "$1" | tr -d '\000-\037' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*" >> "$LOG"; }

ID=""; FROM=""; TO=""; STARTED=""
status() { # state step message
  local tmp="$UPDATES/status.json.tmp.$$"
  {
    printf '{"id":"%s","state":"%s","step":"%s","message":"%s","from":"%s","to":"%s","startedAt":"%s","updatedAt":"%s","log":' \
      "$(jline "$ID")" "$1" "$2" "$(jline "$3")" "$FROM" "$TO" "$STARTED" "$(now)"
    tail -n 30 "$LOG" 2>/dev/null | tr -d '\000-\010\013-\037' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' \
      | awk 'BEGIN{printf "["} {printf "%s\"%s\"", (NR>1?",":""), $0} END{printf "]"}'
    printf '}\n'
  } > "$tmp" && chmod 666 "$tmp" 2>/dev/null; mv -f "$tmp" "$UPDATES/status.json"
  log "[$1/$2] $3"
}

heartbeat() {
  local tmp="$UPDATES/heartbeat.json.tmp.$$"
  printf '{"at":"%s","head":"%s","branch":"%s"}\n' "$(now)" "$(git rev-parse HEAD 2>/dev/null || echo unknown)" "$BRANCH" > "$tmp" && chmod 666 "$tmp" 2>/dev/null
  mv -f "$tmp" "$UPDATES/heartbeat.json"
}

fail() { status failed "$1" "$2"; }

healthy() { $COMPOSE exec -T web node -e "fetch('http://127.0.0.1:3000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; }
wait_healthy() { local t=0; while [ "$t" -lt "$HEALTH_WAIT" ]; do healthy && return 0; sleep "${HEALTH_STEP:-3}"; t=$((t + ${HEALTH_STEP:-3})); done; return 1; }

# Build (the old version keeps running meanwhile), start, and wait until the app answers.
deploy() {
  export APP_COMMIT; APP_COMMIT="$(git rev-parse HEAD)"
  status running build "Building the new version. This takes a few minutes; the app keeps running meanwhile."
  $COMPOSE build >> "$LOG" 2>&1 || return 10
  status running restart "Restarting with the new version."
  $COMPOSE up -d --remove-orphans >> "$LOG" 2>&1 || return 11
  status running health "Checking that the new version started."
  wait_healthy || return 12
  return 0
}

run_update() {
  ID="$1"; local force="$2"; STARTED="$(now)"; : > "$LOG"; chmod 666 "$LOG" 2>/dev/null || true
  FROM="$(git rev-parse HEAD 2>/dev/null || echo)"; TO=""
  status running check "Looking for a new version."
  if [ -z "$FROM" ]; then fail check "This folder is not a git copy of the project, so it cannot be updated from here."; return; fi
  if [ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]; then
    fail check "Files in this folder were changed by hand, so nothing was touched. Look with: git status. Undo your changes (git checkout .) or save them, then try again."; return
  fi
  git fetch "$REMOTE" "$BRANCH" >> "$LOG" 2>&1 || { fail check "Could not download from GitHub. Check that the server has internet access, then try again."; return; }
  TO="$(git rev-parse FETCH_HEAD 2>/dev/null || echo)"
  if [ -z "$TO" ]; then fail check "GitHub did not return the branch $BRANCH."; return; fi
  if [ "$TO" = "$FROM" ] && [ "$force" != 1 ]; then status done check "Already on the newest version."; return; fi
  if [ "$TO" != "$FROM" ]; then
    if git merge-base --is-ancestor "$TO" "$FROM" 2>/dev/null; then
      TO="$FROM"; [ "$force" = 1 ] || { status done check "This copy is already newer than GitHub, so nothing was changed."; return; }
    elif ! git merge-base --is-ancestor "$FROM" "$TO" 2>/dev/null; then
      fail check "This copy's history is different from GitHub's (the project may have been replaced there). Nothing was changed. To follow GitHub, run on the server: git fetch && git reset --hard $REMOTE/$BRANCH   then try again."; return
    fi
  fi

  if [ "${UPDATE_SKIP_BACKUP:-0}" != 1 ]; then
    status running backup "Saving a backup first."
    $COMPOSE exec -T worker npm run backup >> "$LOG" 2>&1 || { fail backup "The backup could not be made, so nothing was changed. Is the app running? Check with: docker compose ps"; return; }
  fi

  if [ "$TO" != "$FROM" ]; then
    status running download "Downloading the new version."
    git merge --ff-only "$TO" >> "$LOG" 2>&1 || { git merge --abort >/dev/null 2>&1; fail download "The new version could not be put in place. Nothing was changed."; return; }
  fi

  deploy; local rc=$?
  if [ "$rc" -eq 0 ]; then
    docker image prune -f >> "$LOG" 2>&1 || true
    local now_head; now_head="$(git rev-parse HEAD)"; TO="$now_head"
    status done done "Now running ${now_head:0:7}."
    return
  fi

  # Something went wrong. Go back to the version that was running.
  log "update failed at step code $rc; going back to $FROM"
  if [ "$TO" != "$FROM" ]; then git reset --hard "$FROM" >> "$LOG" 2>&1; fi
  if [ "$rc" -eq 10 ]; then
    fail build "The new version did not build, so the old version was left running. Nothing else was changed."; return
  fi
  status running rollback "The new version did not start. Putting the old version back."
  if deploy; then
    status rolled_back rollback "The new version did not start, so the old version (${FROM:0:7}) is running again. A backup from just before is in the backups folder. The log below shows what went wrong."
  else
    fail rollback "The new version did not start and the old one did not come back either. Look at it on the server: docker compose ps and docker compose logs web. A backup from just before is in the backups folder."
  fi
}

process_request() {
  local req="$UPDATES/request" id force
  id="$(sed -n 's/^id=//p' "$req" | head -1)"; force="$(sed -n 's/^force=//p' "$req" | head -1)"
  rm -f "$req"
  [[ "$id" =~ ^[A-Za-z0-9-]{1,64}$ ]] || id="manual"
  run_update "$id" "${force:-0}"
}

# A previous run that never finished (server restarted in the middle) must not look as if it is still going.
if [ -f "$UPDATES/status.json" ] && grep -q '"state":"running"' "$UPDATES/status.json" 2>/dev/null; then
  ID="$(sed -n 's/.*"id":"\([^"]*\)".*/\1/p' "$UPDATES/status.json" | head -1)"; STARTED="$(now)"
  fail interrupted "The last update was interrupted, probably by a restart of this computer. Check that the app is running: docker compose ps. Then try again."
fi

if [ "${1:-}" = "--once" ]; then
  heartbeat
  [ -e "$UPDATES/request" ] && process_request
  exit 0
fi

heartbeat
( while true; do sleep 10; heartbeat; done ) &
HB=$!
trap 'kill $HB 2>/dev/null; exit 0' TERM INT EXIT
while true; do
  [ -e "$UPDATES/request" ] && process_request
  sleep "$POLL"
done
