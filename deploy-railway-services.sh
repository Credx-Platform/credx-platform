#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

cp railway.json railway.web.json.runtime.bak
cleanup() {
  if [ -f railway.web.json.runtime.bak ]; then
    mv railway.web.json.runtime.bak railway.json
  fi
}
trap cleanup EXIT

cp railway.api.json railway.json
railway up --service @credx/api --detach --message "CredX API deploy via standalone service config"

cp railway.web.json railway.json
railway up --service @credx/web --detach --message "CredX web deploy via standalone service config"

echo "Triggered Railway deployments for @credx/api and @credx/web"
