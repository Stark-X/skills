#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/install_timer.sh [--on-calendar VALUE] [--no-start]

Examples:
  scripts/install_timer.sh
  scripts/install_timer.sh --on-calendar '*:0/5'

The script installs a user-level systemd oneshot service and timer.
It never prints ZECTRIX_API_KEY.
USAGE
}

on_calendar="*:0/5"
start_timer=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --on-calendar)
      [[ $# -ge 2 ]] || { echo "Error: --on-calendar requires a value." >&2; exit 2; }
      on_calendar="$2"
      shift 2
      ;;
    --no-start)
      start_timer=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
skill_dir="$(cd -- "$script_dir/.." && pwd)"
systemd_src="$skill_dir/systemd"
systemd_user_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
env_dir="${XDG_CONFIG_HOME:-$HOME/.config}/publish-token-costs"
env_file="$env_dir/env"
bun_bin="$(command -v bun || true)"

command -v systemctl >/dev/null || { echo "Error: systemctl is not available." >&2; exit 1; }
[[ -n "$bun_bin" ]] || { echo "Error: bun is not available in PATH." >&2; exit 1; }
command -v convert >/dev/null || { echo "Error: ImageMagick convert is not available in PATH." >&2; exit 1; }

mkdir -p "$systemd_user_dir" "$env_dir"
chmod 700 "$env_dir"

set_env_var() {
  local name="$1"
  local value="$2"
  if grep -q "^${name}=" "$env_file" 2>/dev/null; then
    sed -i "s|^${name}=.*|${name}=${value}|" "$env_file"
  else
    printf '%s=%s\n' "$name" "$value" >> "$env_file"
  fi
}

if [[ ! -f "$env_file" ]]; then
  if [[ -z "${ZECTRIX_DEVICE_ID:-}" || -z "${ZECTRIX_API_KEY:-}" ]]; then
    echo "Error: $env_file does not exist and ZECTRIX_DEVICE_ID/ZECTRIX_API_KEY are not both exported." >&2
    echo "Create it from systemd/env.example, or export both variables and rerun this script." >&2
    exit 1
  fi
  {
    printf 'ZECTRIX_DEVICE_ID=%s\n' "$ZECTRIX_DEVICE_ID"
    printf 'ZECTRIX_API_KEY=%s\n' "$ZECTRIX_API_KEY"
  } > "$env_file"
  chmod 600 "$env_file"
else
  chmod 600 "$env_file"
fi

set_env_var "PUBLISH_TOKEN_COSTS_DIR" "$skill_dir"
set_env_var "BUN_BIN" "$bun_bin"

install -m 0644 "$systemd_src/publish-token-costs.service" "$systemd_user_dir/publish-token-costs.service"
sed "s/^OnCalendar=.*/OnCalendar=${on_calendar//\//\\/}/" \
  "$systemd_src/publish-token-costs.timer" > "$systemd_user_dir/publish-token-costs.timer"
chmod 0644 "$systemd_user_dir/publish-token-costs.timer"

systemctl --user daemon-reload

if [[ "$start_timer" -eq 1 ]]; then
  systemctl --user enable --now publish-token-costs.timer
else
  systemctl --user enable publish-token-costs.timer
fi

systemctl --user list-timers publish-token-costs.timer --no-pager
