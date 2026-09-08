#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'EOF'
Direct workstation/VPS production deployments are disabled.

CredX releases must run through the protected GitHub production environment
after CI passes, a restore-tested backup is attested, and a human approves the
deployment. See docs/PRODUCTION_SAFETY.md.
EOF

exit 1
