# Plannotator

Plannotator is scoped to the retained Pi review and annotation product: `/plannotator-review`, `/plannotator-annotate`, `/plannotator-last`, the review editor, the document annotation editor, paste sharing, and Pi SDK chat.

## Retained structure

- `apps/pi-extension/` — Pi extension and Node server mirror.
- `apps/review/` — review editor bundle builder.
- `apps/hook/` — temporary annotation bundle builder for `plannotator.html`.
- `apps/paste-service/` — paste/short-link service.
- `packages/editor/` — document annotation editor.
- `packages/review-editor/` — code review UI.
- `packages/ui/`, `packages/shared/`, `packages/server/`, `packages/ai/` — retained shared packages.

## Development

```bash
bun install
bun run dev:annotation
bun run dev:review
bun run build:pi
bun test
bun run typecheck
```

`bun run build:pi` builds review and annotation assets, then copies `plannotator.html` and `review-editor.html` into `apps/pi-extension/`.
