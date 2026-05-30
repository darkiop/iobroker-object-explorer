#!/bin/sh
set -e

# Generate runtime config.js from environment variables.
# IOBROKER_HOST must be set via docker-compose.yml or -e flag.
: "${IOBROKER_HOST:?IOBROKER_HOST is not set. Set it in docker-compose.yml or via -e IOBROKER_HOST=...}"
jq -n \
  --arg host "${IOBROKER_HOST}:${IOBROKER_PORT:-8093}" \
  '{"ioBrokerHost": $host}' \
  | printf 'window.__CONFIG__ = %s;\n' "$(cat)" \
  > /usr/share/nginx/html/config.js

# Hand off to nginx's own entrypoint which processes nginx.conf templates
# (substitutes ${IOBROKER_HOST} and ${IOBROKER_PORT} in default.conf.template)
exec /docker-entrypoint.sh "$@"
