# FamilyCenter

A free family calendar and chore board for a wall screen or tablet, with a phone view for the grown-ups. Calendar (with Google Calendar sync), chores and star rewards, lists, recipes and meal plan, a photo screensaver (upload pictures, or choose them in Google Photos), and an optional AI helper that uses your own API key. Settings are protected by a parent PIN, and the server can update itself from GitHub with one button. Your family's data stays on your own server.

Built with Next.js 15 and Postgres 16, run with Docker Compose. The screensaver can show a small labelled card after every few photos; each household can switch this off.

This guide installs it on a fresh **Ubuntu Server 24.04** (22.04 works the same). Every command is meant to be pasted one at a time.

> **Honest status:** the app and its tests (111 browser tests, 83 database-isolation checks, 42 checks of the update helper) were run against stand-in servers for Google, Google Photos, GitHub, email and AI. The Docker files and the update helper's real `docker` calls were written and checked for syntax but were **not run end to end** where this was built (the helper's logic was tested with a stand-in for `docker`), so your first install and your first update are the real test. The troubleshooting section at the end lists what to look at if something fails.

## What you need

- An Ubuntu server with Docker (step 1) and about 2 GB of free memory and 5 GB of disk.
- For use only at home: nothing else. You reach it at `http://<server-ip>:3000`.
- For use from anywhere, and for Google Calendar: a web address with https (a domain, or a free DuckDNS name) pointing at your home, and ports 80 and 443 forwarded to the server. Google refuses to sign in over plain `http` except on `localhost`.

## 1. Install Docker and Git

```bash
sudo apt update
sudo apt install -y git openssl ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Log out and back in (so the `docker` group applies), then check:

```bash
docker --version
docker compose version
```

If Docker is already installed on this server (for example for other apps), skip the `get.docker.com` line.

## 2. Download the app

```bash
cd ~
git clone https://github.com/rapafernando/FamilyCenter.git
cd FamilyCenter
mkdir -p backups updates
```

`mkdir backups updates` matters: the nightly backup is written to the first, and the second is how Settings talks to the updater (step 9). Both have to be owned by your normal user (user id 1000 on Ubuntu) so the app can write to them.

## 3. Create the settings file

One command writes `.env` with fresh random passwords and keys. Give it the address people will type.

**At home only** (replace the number with your server's address; find it with `hostname -I`):

```bash
./scripts/make-env.sh http://192.168.0.50:3000
echo 'WEB_BIND=0.0.0.0:3000' >> .env
```

**With a domain or DuckDNS name behind https** (see step 5):

```bash
./scripts/make-env.sh https://family.example.com
```

The script refuses to overwrite an existing `.env`. Open the result with `nano .env` if you want to look. **Back up `.env` in your password manager.** It holds every secret, and if `APP_ENCRYPTION_KEYS` is lost, saved Google and AI keys cannot be read again (people would just reconnect them).

If something else on the server already uses port 3000, add `WEB_BIND=127.0.0.1:3010` (any free port) to `.env`, and use that port wherever this guide says 3000.

## 4. Start it

```bash
./scripts/deploy.sh
```

`deploy.sh` is `docker compose up -d --build` plus a note of which version is being built, so Settings can later tell whether GitHub has something newer.

The first build takes a few minutes. It starts four things: the database, a one-time database setup job, the web app and a background worker (Google sync, the daily Google sign-in check, cleanup, nightly backup). Check them:

```bash
docker compose ps
curl http://127.0.0.1:3000/api/health
```

`db`, `web` and `worker` should be running, `migrate` should say "Exited (0)", and the second command should answer `{"ok":true}`.

Open the address from step 3 in a browser and choose **Create a household** (`/signup`). Sign-up asks for a **parent PIN** (4 digits). The first person to sign up becomes the owner of the household and also **the person who runs the server**: only that account can change the Google connection and update the server. Then:

- **Add the wall screen:** on the tablet or screen, open `<your address>/pair`. It shows a code. On your phone open More, Screens, link a screen, and type the code.
- **Invite family:** More, Household, Invite. Without email set up the app shows a link to copy and send yourself.
- **The parent PIN:** Settings always ask for it, for everyone, on every device (the wall screen and also a phone where a parent is already signed in). It is remembered for five minutes and then asked again. Change it under Settings, Display and ads. If it is forgotten, reset it on the server with the owner's email (it prints a new one): `docker compose exec web npm run reset-pin -- you@example.com`.

## 5. Put it on the internet with https (optional)

Skip this for home-only use. You need: a name pointing at your home internet address, ports 80 and 443 forwarded to the server, and the server's firewall open for them (`sudo ufw allow 80,443/tcp` if you use ufw).

Choose one of the two ways. Use the first if the server already runs Caddy for other apps (for example one that serves several subdomains); use the second on a server with nothing else on ports 80 and 443.

### A. You already run Caddy on the server

Keep `WEB_BIND` at its default (`127.0.0.1:3000`) so the app is reachable only through Caddy. Add a block to `/etc/caddy/Caddyfile`:

```
family.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000 {
		flush_interval -1
	}
}
```

`flush_interval -1` lets the live updates (a chore ticked on one screen appearing on the others) through at once. Then:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

If you use DuckDNS, create the new subdomain on duckdns.org first and add it to the list your IP updater script refreshes.

### B. Let the included Caddy do it

In `.env` set `DOMAIN=family.example.com` (the same name as in `BASE_URL`), then:

```bash
docker compose --profile https up -d --build
```

This runs Caddy in Docker on ports 80 and 443 and gets the certificate automatically. Do not use this if something else on the server already listens on those ports.

Either way, `BASE_URL` in `.env` must be the exact https address and `./scripts/make-env.sh https://…` already sets `TRUST_PROXY=true` and `COOKIE_SECURE=true`. If you change `BASE_URL` later: `docker compose up -d`.

## 6. Connect Google Calendar (optional)

Done once, by you, in your own Google account. The app never sees your Google password, and you enter the Google details **in the app**, not in a file.

1. Sign in to the app with the first account (the one that runs the server) and open **Settings, Google connection**. It shows the exact redirect address to give Google and has a Copy button.
2. In [Google Cloud Console](https://console.cloud.google.com/) create a project and turn on the **Google Calendar API** and the **Google Photos Picker API** (the second is for step 7).
3. Configure the **OAuth consent screen** (External). Add your own Google account as a **test user**.
4. Create an **OAuth client ID** of type **Web application**. Under Authorised redirect URIs paste the address from step 1. It is your `BASE_URL` plus `/api/v1/sync/oauth/google/callback`, and Google only accepts it when it starts with `https://` (or is `localhost`).
5. Back in the app, paste the **client ID** and **client secret** and press **Save and check**. The app asks Google right away whether it accepts them, so a typo shows up now and not later. The secret is stored encrypted and never shown again.
6. Open **Settings, Calendars** and press **Connect Google**.

Putting `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` still works; what you save in the app wins over `.env`.

While the Google app is in "Testing", Google ends the sign-in every **7 days**. The app notices (the daily check marks the connection "needs sign-in", shows a Reconnect button and emails you if email is set up), and Reconnect takes one tap. To stop the weekly lapse, publish the consent screen and submit it to Google for verification (a privacy page is already at `/privacy`); that review takes weeks. Then switch the app status to "Published" in Settings, Google connection.

## 7. Photos from Google Photos for the screensaver (optional)

Needs step 6 done first. **Settings, Photos** has a Google Photos card:

1. Pick which album the photos should go into and press **Choose photos in Google Photos**.
2. Sign in to Google when asked. Back in the app press **Open Google Photos**, choose the photos in Google's own window, and press Done there.
3. The app copies them into the album (pictures it already has are skipped) and lets go of Google: the access is revoked straight afterwards.

Since March 2025 Google no longer lets apps read a person's albums; apps may only see photos the person picks, one time. So this is **a copy of the pictures you pick, not a live link to an album**: a photo added to the Google album later does not appear until you choose it again. Videos are skipped.

## 8. Email (optional)

Without email everything works; invitations show a link to copy and reminders are not sent. To send mail, fill these in `.env` from any provider that offers SMTP (Resend, Postmark, Mailgun, your own) and run `docker compose up -d`:

```
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=Family <family@example.com>
```

Use an address on a domain you own and set up SPF and DKIM at the provider, or mail will land in spam.

## 9. AI helper (optional)

Nothing to install. In the app, More, AI helper, choose a provider (OpenAI, Anthropic, Google, or any OpenAI-compatible server) and paste your own key. The key is stored encrypted and is never shown again. With no key the AI section stays hidden. `AI_DAILY_CALL_CAP` in `.env` limits calls per household per day. If you point the app at an AI server on your own network (for example Ollama), set `ALLOW_PRIVATE_AI_URLS=true`.

## 10. Updating from Settings (optional)

**Settings, Software updates** (shown to the account that runs the server, after the PIN) checks your GitHub project for something newer, lists what changed, and updates this server when you press **Update now**. It saves a backup first, builds the new version while the old one keeps running, restarts, and checks that the app came up. If it did not, the old version is put back and the page says so.

The web app is not allowed to control Docker, so a small helper on the server does the work. Install it once:

```bash
cd ~/FamilyCenter
sudo ./scripts/install-updater.sh
```

That makes a service called `familycenter-updater` (look at it with `systemctl status familycenter-updater`; remove it with `sudo ./scripts/install-updater.sh --uninstall`). It only wakes up when Settings drops a request in the `updates` folder; the request carries no commands, and the helper itself runs `git fetch` and `git merge --ff-only` on the project folder.

Good to know:

- The server must have been started with `./scripts/deploy.sh` (or by the helper) to know its own version. Otherwise Settings says the version is unknown; press **Rebuild now** once.
- It will not touch a folder where files were edited by hand (`git status` must be clean), and it stops if GitHub's history no longer contains your copy (for example after the project was replaced there). It says what to run; for the replaced case: `git fetch && git reset --hard origin/main`, then `./scripts/deploy.sh`.
- Database changes made by a new version are not undone by going back. The backup taken just before is in `./backups` if you ever need it (see Restore below).
- Screens go blank for about a minute while the server restarts.
- The check uses GitHub's public API, so the repository has to be public. It can be pointed elsewhere with `UPDATE_REPO` and `UPDATE_BRANCH` in `.env`.
- Whoever can push to your GitHub project controls what your server runs after an update. Keep two-step sign-in on for that GitHub account.

If you prefer to update by hand: `git pull && ./scripts/deploy.sh`.

## Moving an existing server to this version

If the server already runs an older copy:

```bash
cd ~/FamilyCenter
git pull
mkdir -p updates
./scripts/deploy.sh
sudo ./scripts/install-updater.sh
```

- A household that never set a parent PIN is asked to choose one the first time Settings is opened.
- The **account that runs the server** (and so can change the Google connection and update) is the oldest account on the server.
- Google details already in `.env` keep working and show as "set through the server's settings file".

## Everyday commands

Run these inside the `FamilyCenter` folder.

| What | Command |
| --- | --- |
| See what is running | `docker compose ps` |
| Follow the logs | `docker compose logs -f web worker` |
| Restart | `docker compose restart web worker` |
| Stop everything | `docker compose down` (your data stays) |
| Update to the newest version | Settings, Software updates, or `git pull && ./scripts/deploy.sh` |
| Reset a forgotten parent PIN | `docker compose exec web npm run reset-pin -- you@example.com` (prints a new PIN once) |
| Reset a forgotten password | `docker compose exec web npm run reset-password -- you@example.com` (prints a new password once) |
| Failed background jobs | `docker compose exec db psql -U family -d family -c "select * from job_failures order by id desc limit 10"` |

Do not run `docker compose down -v`: the `-v` deletes the database and the photos.

## Backups

The worker backs up every night at 03:00 UTC into `./backups`: `family-<date+time>.dump` (the database) and `photos-<date+time>.tar.gz` (the pictures). Files older than `BACKUP_KEEP_DAYS` (14) are removed. To make one now:

```bash
docker compose exec worker npm run backup
```

**Copy `./backups` to another computer or a cloud drive regularly**: a backup on the same disk does not survive the disk. Also keep `.env`, because backups do not contain the encryption key.

### Restore

On the same or a new server (after steps 1 to 3, with your saved `.env`), with the database running:

```bash
docker compose up -d db
docker compose stop web worker
docker compose exec -T db psql -U family -d postgres -c "drop database if exists family" -c "create database family"
docker compose exec -T db pg_restore -U family -d family --no-owner < backups/family-YYYYMMDDHHMM.dump
docker compose run --rm migrate
docker compose run --rm --no-deps -v "$PWD/backups:/backups" web tar -xzf /backups/photos-YYYYMMDDHHMM.tar.gz -C /data/photos
docker compose up -d
```

Use the file names you actually have (`ls backups`). `migrate` recreates the two limited database roles the app logs in as.

## Troubleshooting

- **`permission denied` on the `docker` command:** log out and back in after step 1, or prefix with `sudo`.
- **`migrate` shows an error, or `web` never starts:** `docker compose logs migrate db`. A password mismatch happens if you edited the database passwords in `.env` after the first start; the database keeps the old ones. For a brand new install with nothing worth keeping, `docker compose down -v` and start again. Otherwise change them back.
- **Port 3000 is already in use:** set `WEB_BIND=127.0.0.1:3010` in `.env`, then `docker compose up -d`.
- **Nightly backups fail with "permission denied":** the `backups` folder was created by Docker as root. `sudo chown -R 1000:1000 backups`.
- **Can reach it on the server but not from the tablet:** the app listens only on the server itself by default. For plain http on your network add `WEB_BIND=0.0.0.0:3000` to `.env` and check `sudo ufw allow 3000/tcp` if you use ufw.
- **Signed in, then immediately signed out, behind https:** `BASE_URL` must match the address you type exactly, and `TRUST_PROXY=true` and `COOKIE_SECURE=true` must be set.
- **Live updates arrive late:** your proxy is buffering. In Caddy use `flush_interval -1` (step 5); in nginx `proxy_buffering off`.
- **Software updates says the helper is not installed:** run `sudo ./scripts/install-updater.sh`, then wait a minute. If it is installed, look at `systemctl status familycenter-updater` and make sure `./updates` exists and is owned by user 1000 (`sudo chown -R 1000:1000 updates`).
- **An update stops with "changed by hand":** run `git status` in the project folder; undo (`git checkout .`) or keep your changes elsewhere.
- **Google says `redirect_uri_mismatch`:** the redirect address in Google Cloud must equal `BASE_URL` + `/api/v1/sync/oauth/google/callback`, character for character.
- **A VPN with a kill switch on the server** can block incoming connections or Google. Whitelist your home network and the Docker network, or leave the VPN off for this app.

## Security notes

- Passwords are stored hashed; Google and AI keys are encrypted with `APP_ENCRYPTION_KEYS`; pictures are served only to signed-in members.
- Keep `.env` private and out of git (it is ignored). Only `.env.example`, which has no values, is in the repository.
- Settings need the parent PIN every time (remembered for five minutes), the PIN is checked on the server, and it is rate-limited.
- Sign-up is open to anyone who can reach the address. If the server is on the internet and you want only your family, create your household, then block `/signup` at your proxy or share the address only with them.
- The sign-in rate limiter lives in the web process's memory, which is fine for the single web container this setup runs.

## Developing

```bash
npm ci
cp .env.example .env.local     # fill in; Postgres 16 must be running
npm run migrate
npm run dev                    # http://localhost:3000, worker: npm run worker
npm run seed                   # a fake household (prints a password once)
npm run test:isolation         # database access-rule checks
npm run test:updater           # the update helper, against a local git and a stand-in for docker
npx playwright install chromium && npm run build && npx playwright test
```

Tests run against local stand-ins for Google (and its photo picker), GitHub, email and AI (in `tests/`: `fake-google.mjs` :4010, `fake-ai.mjs` :4011, `fake-github.mjs` :4012, `fake-smtp.mjs` :1025; the settings they need are listed in `.env.example`) and never touch real accounts.
