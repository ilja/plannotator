# Annotation bundle builder

This app is retained temporarily to build the document annotation single-file HTML bundle used by the Pi extension.

```bash
bun run dev:annotation
bun run build:annotation
```

The Pi build copies `apps/hook/dist/index.html` to `apps/pi-extension/plannotator.html` and `apps/hook/dist/review.html` to `apps/pi-extension/review-editor.html`.
