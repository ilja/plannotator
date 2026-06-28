# Plannotator for Pi

Plannotator integration for the [Pi coding agent](https://github.com/earendil-works/pi). It provides browser-based code review and document annotation surfaces for Pi sessions.

## Install

**From npm** (recommended):

```bash
pi install npm:@plannotator/pi-extension
```

**From source:**

```bash
git clone https://github.com/backnotprop/plannotator.git
pi install ./plannotator/apps/pi-extension
```

**Try without installing:**

```bash
pi -e npm:@plannotator/pi-extension
```

## Build from source

If installing from a local clone, build the HTML assets first:

```bash
cd plannotator
bun install
bun run build:pi
```

This builds the annotation and code review UIs and copies them into `apps/pi-extension/`.

## Commands

| Command | Description |
|---------|-------------|
| `/plannotator-review` | Open code review UI for current changes or a PR URL |
| `/plannotator-annotate <file\|folder\|url>` | Open a document, folder, or URL in the annotation UI |
| `/plannotator-last` | Annotate the last assistant message |

## Code review

Run `/plannotator-review` to open your current git changes in the code review UI. Annotate specific lines, switch between diff views, and submit feedback that gets sent to the agent. You can also pass a PR/MR URL or `--git` to force Git in JJ workspaces.

## Markdown, text, HTML, folder, and URL annotation

Run `/plannotator-annotate <file>` to open a supported file in the annotation UI. Supported inputs include `.md`, `.mdx`, `.txt`, `.html`, `.htm`, folders, and `https://` URLs.

Examples:

```bash
/plannotator-annotate README.md
/plannotator-annotate docs/
/plannotator-annotate https://example.com/design-note
/plannotator-annotate page.html --markdown
/plannotator-annotate https://example.com/design-note --no-jina
```

Use `--gate` to enable the review-gate approval UX.

## Annotate last message

Run `/plannotator-last` to annotate the agent's most recent response. The message opens in the annotation UI where you can highlight text, add comments, and send structured feedback back to the agent.

## Shared Plannotator event API

Plannotator listens on the shared `plannotator:request` event channel so other extensions can reuse retained browser flows.

Supported actions and payloads:

- `code-review`: `{ cwd?, defaultBranch?, diffType?, vcsType?, useLocal?, prUrl? }`
- `annotate`: `{ filePath, markdown?, mode?, folderPath?, gate? }`
- `annotate-last`: `{ markdown?, gate? }`

Each action is a request/response flow. Responses have one of these shapes:

```ts
{ status: "handled", result: unknown }
{ status: "unavailable", error?: string }
{ status: "error", error: string }
```

## Requirements

- [Pi](https://github.com/earendil-works/pi) >= 0.74.0
