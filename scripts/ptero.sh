#!/usr/bin/env bash
# Controls the production server through Pterodactyl's client API — the same things the panel's own
# buttons do, from a terminal (and so from a Claude session on this machine).
#
#   scripts/ptero.sh status              power state, memory, uptime, and which commit siqt.no runs
#   scripts/ptero.sh restart|start|stop  power signal
#   scripts/ptero.sh reinstall           runs the egg's install script (git sync + build), then waits
#   scripts/ptero.sh wait [commit]       waits until siqt.no answers — and, given a commit, runs it
#
# Credentials are NOT in this repo. They live in ~/.config/siqt/pterodactyl.env (chmod 600):
#   PTERO_URL=https://server.gaminglivet.no     (the panel, without /server/...)
#   PTERO_KEY=ptlc_...                          (Account → API Credentials; IP-restricted)
#   PTERO_SERVER=86c7263c                       (the code after /server/ in the panel's address)
# A client key can do what the panel's server pages can: power, reinstall, files, schedules,
# backups. It cannot change the startup command, mounts or the egg — those are admin-only.
#
# Reinstall runs `git clean -fd` on the production checkout. The live database survives it only
# because /prisma/*.db is gitignored — see AGENTS.md. Expect a few minutes of 521 while it builds.
set -euo pipefail

ENV_FILE="${PTERO_ENV_FILE:-$HOME/.config/siqt/pterodactyl.env}"
SITE="${SIQT_SITE:-https://siqt.no}"

if [[ ! -r "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — see the comment at the top of this script." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${PTERO_URL:?PTERO_URL not set in $ENV_FILE}" "${PTERO_KEY:?PTERO_KEY not set}" "${PTERO_SERVER:?PTERO_SERVER not set}"
PTERO_URL="${PTERO_URL%/}"

api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -m 30 -X "$method" -H "Authorization: Bearer $PTERO_KEY" -H "Accept: application/json" -w '\n%{http_code}')
  [[ -n "$body" ]] && args+=(-H "Content-Type: application/json" -d "$body")
  local out code
  out=$(curl "${args[@]}" "$PTERO_URL/api/client/servers/$PTERO_SERVER$path")
  code="${out##*$'\n'}"
  out="${out%$'\n'*}"
  if [[ "$code" != 2* ]]; then
    echo "Pterodactyl answered HTTP $code for $method $path" >&2
    # The panel serves its HTML login page for a wrong URL, which says nothing useful — only show JSON.
    [[ "$out" == \{* ]] && echo "$out" >&2
    return 1
  fi
  printf '%s' "$out"
}

site_version() {
  curl -sS -m 10 "$SITE/api/version" 2>/dev/null || true
}

status() {
  api GET /resources | python3 -c '
import json, sys
a = json.load(sys.stdin)["attributes"]; r = a["resources"]
state, mb, mins = a["current_state"], r["memory_bytes"] // 2**20, r["uptime"] // 60000
print(f"server:  {state}  |  memory {mb} MB  |  uptime {mins} min")'
  local v
  v=$(site_version)
  echo "site:    ${v:-no answer from $SITE}"
}

# Waits for the site to answer /api/version, optionally with a specific commit. Up to 15 minutes:
# a reinstall runs npm install and a full production build before anything listens again.
wait_up() {
  local want="${1:-}" deadline=$((SECONDS + 900)) v
  echo "Waiting for $SITE${want:+ to run $want}…"
  while ((SECONDS < deadline)); do
    v=$(site_version)
    if [[ "$v" == \{* ]] && { [[ -z "$want" ]] || [[ "$v" == *"\"$want\""* ]]; }; then
      echo "Up: $v"
      return 0
    fi
    sleep 10
  done
  echo "Gave up after 15 minutes. Last answer: ${v:-none}" >&2
  return 1
}

installing() {
  api GET "" | python3 -c 'import json,sys; a=json.load(sys.stdin)["attributes"]; print("yes" if a.get("is_installing") or a.get("status") == "installing" else ("failed" if a.get("status") == "install_failed" else "no"))'
}

# The install script (git sync, npm install, build) runs before the server can be started. Wait for
# it to begin and then to end, up to 20 minutes.
wait_installed() {
  local deadline=$((SECONDS + 1200)) seen=no state
  while ((SECONDS < deadline)); do
    state=$(installing)
    [[ "$state" == failed ]] && { echo "Install FAILED — see the panel's console." >&2; return 1; }
    [[ "$state" == yes ]] && seen=yes
    if [[ "$seen" == yes && "$state" == no ]]; then
      echo "Install finished."
      return 0
    fi
    # If it never showed as installing within the first minute, it was quicker than the first poll.
    if [[ "$seen" == no && "$state" == no ]] && ((SECONDS > 60)); then
      echo "Install finished (never observed running)."
      return 0
    fi
    sleep 10
  done
  echo "Install still running after 20 minutes." >&2
  return 1
}

case "${1:-status}" in
  status) status ;;
  start | stop | restart | kill)
    api POST /power "{\"signal\":\"$1\"}" >/dev/null
    echo "Sent $1."
    ;;
  reinstall)
    api POST /settings/reinstall >/dev/null
    echo "Reinstall started."
    wait_installed
    # Pterodactyl leaves the server OFFLINE after a reinstall — it does not start it again. The first
    # version of this script only waited for the site, which never came back on its own: 15 minutes
    # of 521 on 2026-09-25 before anyone pressed Start.
    api POST /power '{"signal":"start"}' >/dev/null
    echo "Started."
    wait_up "${2:-}"
    ;;
  wait) wait_up "${2:-}" ;;
  *)
    sed -n '4,7p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
