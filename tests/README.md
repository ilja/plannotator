# Tests

This directory contains retained automated coverage for the Pi review and annotation surfaces.

## Automated suites

```bash
bun test
bun test tests/parity/route-parity.test.ts tests/parity/vendor-parity.test.ts
```

The parity tests compare retained Bun/Pi server route surfaces and generated Pi vendor files. Markdown fixtures under `tests/test-fixtures/` are parser regression inputs for the annotation editor.
