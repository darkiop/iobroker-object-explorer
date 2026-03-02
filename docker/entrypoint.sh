#!/bin/sh
set -e

# Generate runtime config.js from environment variables.
# IOBROKER_HOST must be set via docker-compose.yml or -e flag.
: "${IOBROKER_HOST:?IOBROKER_HOST is not set. Set it in docker-compose.yml or via -e IOBROKER_HOST=...}"
cat > /usr/share/nginx/html/config.js << EOF
window.__CONFIG__ = {
  ioBrokerHost: '${IOBROKER_HOST}:${IOBROKER_PORT:-8093}',
};
EOF

# Hand off to nginx's own entrypoint which processes nginx.conf templates
# (substitutes ${IOBROKER_HOST} and ${IOBROKER_PORT} in default.conf.template)
exec /docker-entrypoint.sh "$@"
