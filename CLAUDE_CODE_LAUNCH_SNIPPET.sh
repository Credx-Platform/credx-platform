#!/usr/bin/env bash
set -euo pipefail

cd /home/ubuntu/.openclaw/workspace/credx-platform

PROMPT_FILE="/home/ubuntu/.openclaw/workspace/credx-platform/CLAUDE_CODE_DEPLOYMENT_RESCUE_PROMPT.md"

claude --permission-mode bypassPermissions --print "$(cat "$PROMPT_FILE")"
