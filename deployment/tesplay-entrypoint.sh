#!/bin/sh
set -eu

node /opt/tesplay/tesplay-relay.mjs &
relay_pid=$!
/docker-entrypoint.sh "$@" &
nginx_pid=$!
trap 'kill -TERM "$nginx_pid" "$relay_pid" 2>/dev/null || true' TERM INT
# Alpine BusyBox supports waiting for the first child to exit.
# shellcheck disable=SC3045
wait -n || true
kill -TERM "$nginx_pid" "$relay_pid" 2>/dev/null || true
wait || true
