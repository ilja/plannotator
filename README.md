# Plannotator

Plannotator is a Pi extension for browser-based code review and document annotation. It keeps three Pi commands:

- `/plannotator-review` — review local changes or a PR URL in a browser diff UI, then approve or send feedback back to Pi.
- `/plannotator-annotate <file|folder|url>` — annotate Markdown, HTML, folders of documents, or fetched URLs.
- `/plannotator-last` — annotate the last assistant response and send anchored feedback back to Pi.

Ask AI remains available in review and annotation sessions through the Pi SDK provider. Paste sharing remains available for short URL sharing.

## Retained apps

- `apps/pi-extension/` — published Pi extension and Node server mirror.
- `apps/review/` — review-editor bundle builder.
- `apps/hook/` — temporary annotation bundle builder for `plannotator.html`.
- `apps/paste-service/` — self-hostable paste/short-link service.

## Development

```bash
bun install

bun run dev:annotation
bun run dev:review
bun run build:pi
bun test
bun run typecheck
```

`bun run build:pi` builds the review bundle, builds the annotation bundle, then copies `plannotator.html` and `review-editor.html` into `apps/pi-extension/`.

## Pi usage

Install the extension with Pi's package installer, then use:

```text
/plannotator-review
/plannotator-annotate README.md
/plannotator-annotate docs/
/plannotator-annotate https://example.com
/plannotator-last
```

## Paste service

The paste service lives in `apps/paste-service/` and can be run independently:

```bash
bun run --cwd apps/paste-service dev
```

## License

Copyright 2025-2026 backnotprop

Dual-licensed under [Apache 2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT) at your option.
