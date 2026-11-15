#!/usr/bin/env bash
set +x
set -eo pipefail
cd /home/xdjzyshp/king-auth
source /home/xdjzyshp/nodevenv/king-auth/24/bin/activate
set -u
IFS= read -r -s -p 'Database password (hidden): ' king_auth_db_password
printf '\n'
if [ -z "$king_auth_db_password" ]; then
  printf 'No password entered. Nothing changed.\n' >&2
  exit 1
fi
printf '%s' "$king_auth_db_password" | node scripts/configure-database.mjs
unset king_auth_db_password
