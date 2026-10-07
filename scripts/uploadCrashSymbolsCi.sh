#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${CRASH_SSH_HOST:?}" "${CRASH_SSH_USER:?}" "${CRASH_SSH_KEY:?}" "${CRASH_SSH_KNOWN_HOSTS:?}"
: "${SENTRY_AUTH_TOKEN:?}" "${SENTRY_ORG:?}" "${SENTRY_PROJECT:?}" "${EXPO_PUBLIC_SENTRY_RELEASE:?}" "${SENTRY_DIST:?}"
: "${SENTRY_READ_TOKEN:?}"
target_dir="${1:?Export directory is required}"
private_dir="$(mktemp -d)"
cleanup() {
  ssh -S "$private_dir/control" -O exit "$CRASH_SSH_USER@$CRASH_SSH_HOST" >/dev/null 2>&1 || true
  rm -f "$private_dir/key" "$private_dir/known_hosts"
  rmdir "$private_dir" 2>/dev/null || true
}
trap cleanup EXIT
printf '%s\n' "$CRASH_SSH_KEY" > "$private_dir/key"
printf '%s\n' "$CRASH_SSH_KNOWN_HOSTS" > "$private_dir/known_hosts"
ssh -fNT -M -S "$private_dir/control" -i "$private_dir/key" \
  -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$private_dir/known_hosts" -o ExitOnForwardFailure=yes \
  -o ConnectTimeout=15 -o ServerAliveInterval=15 \
  -L 127.0.0.1:19000:127.0.0.1:19001 "$CRASH_SSH_USER@$CRASH_SSH_HOST"
curl --fail --silent --max-time 15 http://127.0.0.1:19000/_health/ >/dev/null
node scripts/uploadCrashSymbols.js "$target_dir"
node scripts/verifyCrashSymbols.js "$target_dir"
