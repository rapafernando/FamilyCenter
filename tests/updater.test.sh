#!/usr/bin/env bash
# Tests scripts/updater.sh against a real local git "GitHub" and a stand-in for the docker command.
# Run: npm run test:updater
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); echo "  ok   $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL $1"; }
check() { if eval "$2"; then ok "$1"; else bad "$1   [$2]"; fi; }
jsonget() { node -e "const j=JSON.parse(require('fs').readFileSync('$1','utf8'));console.log(j['$2'])"; }

# A stand-in for docker: records what it was asked and fails on request (by files in the working copy).
mkdir -p "$T/bin"
cat > "$T/bin/docker" <<'SHIM'
#!/usr/bin/env bash
echo "docker $* | APP_COMMIT=${APP_COMMIT:-}" >> "$SHIM_LOG"
case "$*" in
  "compose exec -T worker npm run backup") [ -e "$SHIM_DIR/BACKUP_FAIL" ] && exit 1; exit 0 ;;
  "compose build") [ -e BUILD_BREAKS ] && exit 1; exit 0 ;;
  "compose up -d --remove-orphans") [ -e MIGRATE_BREAKS ] && exit 1; exit 0 ;;
  "compose exec -T web node "*) [ -e BROKEN ] && exit 1; exit 0 ;;
  "image prune -f") exit 0 ;;
esac
exit 0
SHIM
chmod +x "$T/bin/docker"
export PATH="$T/bin:$PATH" SHIM_LOG="$T/docker.log" SHIM_DIR="$T"

# "GitHub": a bare repo, and the server's copy cloned from it.
git init -q --bare -b main "$T/origin.git"
git clone -q "$T/origin.git" "$T/work" 2>/dev/null
( cd "$T/work" && git config user.email t@t && git config user.name t && echo v1 > VERSION && git add . && git commit -qm "first" && git push -q origin main 2>/dev/null )
git clone -q -b main "$T/origin.git" "$T/app"
( cd "$T/app" && git config user.email t@t && git config user.name t )
export UPDATE_DIR="$T/app/updates" APP_DIR="$T/app" HEALTH_WAIT=3 HEALTH_STEP=1
mkdir -p "$UPDATE_DIR"
push() { ( cd "$T/work" && for f in "$@"; do echo "$f" > "$f"; git add "$f"; done && git commit -qm "change $*" && git push -q origin main 2>/dev/null ); }
req() { printf 'id=%s\nforce=%s\n' "$1" "${2:-0}" > "$UPDATE_DIR/request"; : > "$T/docker.log"; ( cd "$T/app" && bash "$HERE/scripts/updater.sh" --once ) ; }
state() { jsonget "$UPDATE_DIR/status.json" state; }
msg() { jsonget "$UPDATE_DIR/status.json" message; }
head_of() { git -C "$T/app" rev-parse HEAD; }
origin_head() { git -C "$T/origin.git" rev-parse main; }

echo "UP-S1 nothing new"
req t1
check "state done" '[ "$(state)" = done ]'
check "says already newest" 'msg | grep -q "newest"'
check "docker untouched" '[ ! -s "$T/docker.log" ]'
check "heartbeat is valid json with the checkout head" '[ "$(jsonget "$UPDATE_DIR/heartbeat.json" head)" = "$(head_of)" ]'
check "request file removed" '[ ! -e "$UPDATE_DIR/request" ]'

echo "UP-S2 a new version is installed: backup, then download, build, restart, health"
OLD="$(head_of)"; push NEWFILE
req t2
check "state done" '[ "$(state)" = done ]'
check "copy now equals GitHub" '[ "$(head_of)" = "$(origin_head)" ]'
check "new file arrived" '[ -e "$T/app/NEWFILE" ]'
check "backup came before build, build before up" 'awk "/npm run backup/{b=NR} /compose build/{c=NR} /up -d/{u=NR} END{exit !(b&&c&&u&&b<c&&c<u)}" "$T/docker.log"'
check "the new version number is passed to the build" 'grep "compose build" "$T/docker.log" | grep -q "APP_COMMIT=$(origin_head)"'
check "status names both versions" '[ "$(jsonget "$UPDATE_DIR/status.json" from)" = "$OLD" ] && [ "$(jsonget "$UPDATE_DIR/status.json" to)" = "$(origin_head)" ]'
check "status log is a list" 'node -e "const j=require(\"$UPDATE_DIR/status.json\");process.exit(Array.isArray(j.log)&&j.log.length>0?0:1)"'

echo "UP-S3 hand-edited files stop it before anything is touched"
push SECOND; echo changed >> "$T/app/VERSION"
req t3
check "state failed" '[ "$(state)" = failed ]'
check "message explains" 'msg | grep -q "changed by hand"'
check "copy not moved" '[ "$(head_of)" != "$(origin_head)" ]'
check "docker untouched" '[ ! -s "$T/docker.log" ]'
git -C "$T/app" checkout -q VERSION

echo "UP-S4 a failed backup stops the update"
touch "$T/BACKUP_FAIL"; req t4; rm -f "$T/BACKUP_FAIL"
check "state failed" '[ "$(state)" = failed ]'
check "says backup" 'msg | grep -qi "backup"'
check "copy not moved" '[ "$(head_of)" != "$(origin_head)" ]'
check "no build" '! grep -q "compose build" "$T/docker.log"'

echo "UP-S5 a new version that does not start is rolled back"
GOOD="$(head_of)"; push BROKEN
req t5
check "state rolled_back" '[ "$(state)" = rolled_back ]'
check "copy is back on the old version" '[ "$(head_of)" = "$GOOD" ]'
check "BROKEN file is gone from the copy" '[ ! -e "$T/app/BROKEN" ]'
check "the old version was rebuilt" 'grep "compose build" "$T/docker.log" | tail -1 | grep -q "APP_COMMIT=$(head_of)"'
check "two builds happened" '[ "$(grep -c "compose build" "$T/docker.log")" = 2 ]'
check "message mentions the backup" 'msg | grep -q "backup"'
# put origin right again for the next cases
( cd "$T/work" && git rm -q BROKEN && git commit -qm "fix" && git push -q origin main )

echo "UP-S6 a new version that does not build leaves the old one running"
git -C "$T/app" reset -q --hard "$GOOD"; BEFORE="$(head_of)"; push BUILD_BREAKS
req t6
check "state failed" '[ "$(state)" = failed ]'
check "says it did not build" 'msg | grep -q "did not build"'
check "copy back on the old version" '[ "$(head_of)" = "$BEFORE" ]'
check "containers were not restarted" '! grep -q "up -d" "$T/docker.log"'
( cd "$T/work" && git rm -q BUILD_BREAKS && git commit -qm "unbreak" && git push -q origin main )

echo "UP-S7 GitHub history was replaced"
( cd "$T/work" && git checkout -q --orphan fresh && git rm -rfq . 2>/dev/null; echo other > OTHER && git add OTHER && git commit -qm "replaced" && git push -q --force origin fresh:main 2>/dev/null )
BEFORE="$(head_of)"; req t7
check "state failed" '[ "$(state)" = failed ]'
check "explains the history differs and how to follow" 'msg | grep -q "history is different" && msg | grep -q "git reset --hard"'
check "copy untouched" '[ "$(head_of)" = "$BEFORE" ]'
git -C "$T/app" fetch -q origin main && git -C "$T/app" reset -q --hard FETCH_HEAD

echo "UP-S8 rebuild even when nothing is new (version unknown)"
req t8 1
check "state done" '[ "$(state)" = done ]'
check "built and started" 'grep -q "compose build" "$T/docker.log" && grep -q "up -d" "$T/docker.log"'

echo "UP-S9 an interrupted run is reported, not left looking busy"
printf '{"id":"zz","state":"running","step":"build","message":"x","from":"","to":"","startedAt":"","updatedAt":"","log":[]}' > "$UPDATE_DIR/status.json"
( cd "$T/app" && bash "$HERE/scripts/updater.sh" --once )
check "state failed" '[ "$(state)" = failed ]'
check "says interrupted" 'msg | grep -q "interrupted"'

echo "UP-S10 a request cannot run commands"
mkdir -p "$T/pwn"; printf 'id=$(touch %s/x)\nforce=0\n' "$T/pwn" > "$UPDATE_DIR/request"
( cd "$T/app" && bash "$HERE/scripts/updater.sh" --once )
check "nothing was run" '[ ! -e "$T/pwn/x" ]'
check "status is valid json" '[ -n "$(state)" ]'

echo "UP-S11 the installer writes a service for the right folder and user"
U="$(bash "$HERE/scripts/install-updater.sh" --print)"
check "has the folder" 'grep -q "^WorkingDirectory=$HERE\$" <<<"$U"'
check "restarts on failure" 'grep -q "^Restart=always" <<<"$U"'
check "refuses without sudo" '[ "$(id -u)" = 0 ] || ! bash "$HERE/scripts/install-updater.sh" >/dev/null 2>&1'

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
