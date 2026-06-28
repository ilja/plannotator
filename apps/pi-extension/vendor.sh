#!/usr/bin/env bash
# Vendor shared modules into generated/ for Pi extension.
# Single source of truth — used by both `npm run build` and CI test workflow.
set -euo pipefail
cd "$(dirname "$0")"

rm -rf generated
mkdir -p generated generated/ai/providers

for f in feedback-templates prompts review-core diff-paths cli-pagination jj-core vcs-core review-args draft project pr-types pr-provider pr-stack pr-github pr-gitlab integrations-common repo reference-common favicon code-file resolve-file annotate-reference-roots-node config external-annotation agent-terminal worktree worktree-pool html-to-markdown html-assets html-assets-node url-to-markdown annotate-args at-reference review-workspace-node review-workspace code-nav data-dir semantic-diff-types semantic-diff source-save source-save-node workspace-status open-in-apps; do
  src="../../packages/shared/$f.ts"
  printf '// @generated — DO NOT EDIT. Source: packages/shared/%s.ts\n' "$f" | cat - "$src" > "generated/$f.ts"
done

for f in index types provider session-manager endpoints context base-session; do
  src="../../packages/ai/$f.ts"
  printf '// @generated — DO NOT EDIT. Source: packages/ai/%s.ts\n' "$f" | cat - "$src" > "generated/ai/$f.ts"
done

for f in command-path pi-sdk pi-sdk-node pi-events; do
  src="../../packages/ai/providers/$f.ts"
  printf '// @generated — DO NOT EDIT. Source: packages/ai/providers/%s.ts\n' "$f" | cat - "$src" > "generated/ai/providers/$f.ts"
done
