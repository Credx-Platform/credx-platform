#!/usr/bin/env bash
set -euo pipefail

cd /home/ubuntu/.openclaw/workspace/credx-platform

PROMPT_FILE="/home/ubuntu/.openclaw/workspace/credx-platform/CLAUDE_CODE_DEPLOYMENT_RESCUE_PROMPT.md"

exec claude --permission-mode bypassPermissions "$(cat "$PROMPT_FILE")"
