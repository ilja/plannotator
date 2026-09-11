# anti-slop provenance

- Source repository: https://github.com/dmmulroy/anti-slop
- Source revision: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b` (`main`, 2026-09-11)
- Vendored entry point: `tools/oxlint/anti-slop/index.ts`
- Oxlint pair: `oxlint@1.78.0` and `@oxlint/plugins@1.78.0`

## Update notes

This repository adopted the generic rules and shared helpers from the source revision, including:

- `no-array-filter-map`
- `no-reduce-accumulator-copy`
- `require-readable-spacing`
- the vendored ESLint Stylistic padding implementation and license

All generic rules are enabled as errors in `oxlint.config.ts`, alongside native `oxc/no-accumulating-spread`.

The upstream Effect plugin is intentionally not vendored or enabled because this update was scoped to generic rules; Effect is declared directly in the workspace packages and can be adopted separately. The original local installation matches upstream revision `446268e5d15baa968eaec669ff65358d36ae6259` after whitespace normalization, so that revision is the recovered baseline. Its prior source was preserved in `/tmp/plannotator-anti-slop-backup.QBQvbe` during this update; future updates should use the current revision as the baseline while preserving repository-owned changes.

## Verification

- `bun run lint` passes.
- `bun run typecheck` passes.
- Targeted second spacing-fix/format pass passes; the changed refactor and vendored files format cleanly.
- `bun run build:pi` passes.
- All upstream generic RuleTester suites pass under Node 26; the CLI spacing test passed with a temporary harness invoking the installed Oxlint binary directly.
- `bun test` reports 1,596 passing, 183 skipped, and 23 failures. All 23 failures are blocked by the local untrusted `mise` config (`/Users/ilja/.config/mise/config.toml`); generated-file errors from the initial run were resolved by the required build.
- `bun run lint`, `bun run typecheck`, `bun run build:pi`, repository-wide `bun run format:check`, and the final spacing-fix/format stability pass pass.
