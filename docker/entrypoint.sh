#!/bin/sh
set -e

# Generate runtime config.js from environment variables.
# Falls back to the defaults from public/config.js if env vars are not set.
cat > /usr/share/nginx/html/config.js << EOF
window.__CONFIG__ = {
  ioBrokerHost: '${IOBROKER_HOST:-10.4.0.20}:${IOBROKER_PORT:-8093}',
};
EOF

# Hand off to nginx's own entrypoint which processes nginx.conf templates
# (substitutes ${IOBROKER_HOST} and ${IOBROKER_PORT} in default.conf.template)
exec /docker-entrypoint.sh "$@"
