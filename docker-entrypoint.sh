#!/bin/sh
set -eu

# Ensure runtime-writable directories exist (and are writable even when mounted as a volume).
mkdir -p /app/data/drafts
mkdir -p /app/.next/cache/images

# The named volume is typically owned by root on first run; fix ownership.
chown -R nextjs /app/data /app/.next/cache

# Drop privileges for the actual app process.
exec su -s /bin/sh nextjs -c "$(printf '%s ' "$@")"

