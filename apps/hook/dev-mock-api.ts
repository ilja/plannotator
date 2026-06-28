/**
 * Vite plugin that mocks plannotator API endpoints for local development.
 *
 * Two document versions are wired up for local annotation development without
 * running a real hook session.
 */
import type { Plugin } from 'vite';
import { existsSync, readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { isCodeFilePath } from '../../packages/shared/code-file';
import { preloadFile } from '@pierre/diffs/ssr';

// ─── Default plans (Real-time Collaboration) ─────────────────────────────
// What every dev sees when running `bun run dev:annotation` without any flag.
// Matches the pre-branch demo content; kept identical so the project's
// default demo story doesn't change.
const PLAN_V1_DEFAULT = `# Implementation Plan: Real-time Collaboration

## Overview
Add real-time collaboration features to the editor using WebSocket connections.

## Phase 1: Infrastructure

### WebSocket Server
Set up a WebSocket server to handle concurrent connections:

\`\`\`typescript
const server = new WebSocketServer({ port: 8080 });

server.on('connection', (socket) => {
  const sessionId = generateSessionId();
  sessions.set(sessionId, socket);

  socket.on('message', (data) => {
    broadcast(sessionId, data);
  });
});
\`\`\`

### Client Connection
- Establish persistent connection on document load
- Implement reconnection logic with exponential backoff
- Handle offline state gracefully

### Database Schema

\`\`\`sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
\`\`\`

## Phase 2: Operational Transforms

> The key insight is that we need to transform operations against concurrent operations to maintain consistency.

Key requirements:
- Transform insert against insert
- Transform insert against delete
- Transform delete against delete

## Pre-launch Checklist

- [ ] Infrastructure ready
  - [ ] WebSocket server deployed
  - [ ] Database migrations applied
- [ ] Security audit complete
- [ ] Documentation updated

---

**Target:** Ship MVP in next sprint
`;

const PLAN_V2_DEFAULT = `# Implementation Plan: Real-time Collaboration

## Context

This proposal introduces real-time collaborative editing to the Plannotator editor, letting reviewers annotate the same plan simultaneously with sub-second visibility of each other's cursors and edits. We are targeting **early-access concurrency** for up to 25 active collaborators per document, with end-to-end edit-to-visible latency under 300ms at the 95th percentile. The implementation uses operational transforms running on a dedicated Node.js gateway that speaks \`Socket.IO\` to clients and \`REST\` to the storage tier. See [the technical design doc](https://docs.example.com/realtime-v1) for the full rationale and rollout plan.

Runtime parameters for phase one:

\`\`\`typescript
export const COLLAB_CONFIG = {
  maxCollaborators: 25,
  heartbeatIntervalMs: 5_000,
  operationBatchSize: 32,
  gateway: "wss://collab.plannotator.ai",
} as const;
\`\`\`

## Overview
Add real-time collaboration features to the editor using WebSocket connections and operational transforms.

## Phase 1: Infrastructure

### WebSocket Server
Set up a WebSocket server to handle concurrent connections:

\`\`\`typescript
const server = new WebSocketServer({ port: 8080 });

server.on('connection', (socket, request) => {
  const sessionId = generateSessionId();
  sessions.set(sessionId, socket);

  socket.on('message', (data) => {
    broadcast(sessionId, data);
  });
});
\`\`\`

### Client Connection
- Establish persistent connection on document load
  - Initialize WebSocket with authentication token
  - Set up heartbeat ping/pong every 30 seconds
- Implement reconnection logic with exponential backoff
  - Start with 1 second delay
  - Double delay on each retry (max 30 seconds)
- Handle offline state gracefully
  - Queue local changes in IndexedDB
  - Show offline indicator in UI

### Database Schema

\`\`\`sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role VARCHAR(50) DEFAULT 'editor',
  cursor_position JSONB,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_collaborators_document ON collaborators(document_id);
\`\`\`

## Phase 2: Operational Transforms

> The key insight is that we need to transform operations against concurrent operations to maintain consistency.

Key requirements:
- Transform insert against insert
  - Same position: use user ID for deterministic ordering
  - Different positions: adjust offset of later operation
- Transform insert against delete
  - Insert before delete: no change needed
  - Insert inside deleted range: special handling required
- Transform delete against delete
  - Non-overlapping: adjust positions
  - Overlapping: merge or split operations
- Maintain cursor positions across transforms

## Phase 3: UI Updates

1. Show collaborator cursors in real-time
2. Display presence indicators
3. Add conflict resolution UI
4. Implement undo/redo stack per user

## Pre-launch Checklist

- [ ] Infrastructure ready
  - [x] WebSocket server deployed
  - [x] Database migrations applied
  - [ ] Load balancer configured
- [ ] Security audit complete
  - [x] Authentication flow reviewed
  - [ ] Rate limiting implemented
- [x] Documentation updated

---

## Appendix: Diagrams

### Architecture

\`\`\`mermaid
flowchart LR
    subgraph Client["Client Browser"]
        UI[React UI] --> OT[OT Engine]
        OT <--> WS[WebSocket Client]
    end

    subgraph Server["Backend"]
        WSS[WebSocket Server] <--> OTS[OT Transform]
        OTS <--> DB[(PostgreSQL)]
    end

    WS <--> WSS
\`\`\`

---

**Target:** Ship MVP in next sprint
`;

const PLAN_V1 = PLAN_V1_DEFAULT;
const PLAN_V2 = PLAN_V2_DEFAULT;

const now = Date.now();
const versions = [
  { version: 1, timestamp: new Date(now - 3600_000 * 4).toISOString() },
  { version: 2, timestamp: new Date(now - 3600_000 * 2).toISOString() },
  { version: 3, timestamp: new Date(now - 60_000).toISOString() },
];

const versionPlans: Record<number, string> = {
  1: PLAN_V1,
  2: PLAN_V2,
  // Version 3 is the current demo document — served live by the editor.
};

export function devMockApi(): Plugin {
  return {
    name: 'plannotator-dev-mock-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/api/hooks/status') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const { readImprovementHook, getImprovementHookExpectedPath } = await import('@plannotator/shared/improvement-hooks');
            const { loadConfig } = await import('@plannotator/shared/config');
            const { composeImproveContext } = await import('@plannotator/shared/pfm-reminder');
            const config = loadConfig();
            const hook = readImprovementHook('enterplanmode-improve');
            const pfmEnabled = config.pfmReminder === true;
            const composed = composeImproveContext({ pfmEnabled, improvementHookContent: hook?.content ?? null });
            res.end(JSON.stringify({
              pfmReminder: { enabled: pfmEnabled },
              improvementHook: {
                present: !!hook,
                filePath: hook?.filePath ?? getImprovementHookExpectedPath('enterplanmode-improve'),
                fileSize: hook?.content?.length ?? null,
                content: hook?.content ?? null,
              },
              composedLength: composed?.length ?? null,
            }));
          } catch {
            res.end(JSON.stringify({
              pfmReminder: { enabled: false },
              improvementHook: { present: false, filePath: '~/.plannotator/hooks/compound/enterplanmode-improve-hook.txt', fileSize: null, content: null },
              composedLength: null,
            }));
          }
          return;
        }

        if (req.url === '/api/config' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', async () => {
            try {
              const { saveConfig } = await import('@plannotator/shared/config');
              const parsed = JSON.parse(body);
              const toSave: Record<string, unknown> = {};
              if (parsed.pfmReminder !== undefined) toSave.pfmReminder = parsed.pfmReminder;
              if (Object.keys(toSave).length > 0) saveConfig(toSave as any);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid request' }));
            }
          });
          return;
        }

        if (req.url === '/api/plan') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            plan: undefined,
            origin: 'claude-code',
            sharingEnabled: true,
          }));
          return;
        }

        if (req.url === '/api/plan/versions') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            project: 'demo',
            slug: 'auth-service-refactor',
            versions,
          }));
          return;
        }

        if (req.url?.startsWith('/api/plan/version?')) {
          const url = new URL(req.url, 'http://localhost');
          const v = Number(url.searchParams.get('v'));
          const plan = versionPlans[v];
          if (plan) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ plan, version: v }));
          } else {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Version not found' }));
          }
          return;
        }

        if (req.url?.startsWith('/api/doc?')) {
          const url = new URL(req.url, 'http://localhost');
          const reqPath = url.searchParams.get('path');
          if (!reqPath) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing path parameter' }));
            return;
          }
          const base = url.searchParams.get('base');
          const repoRoot = resolve(import.meta.dirname, '../..');
          const resolved = resolve(base || repoRoot, reqPath);
          if (!existsSync(resolved) || statSync(resolved).isDirectory()) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: `File not found: ${reqPath}` }));
            return;
          }
          const contents = readFileSync(resolved, 'utf-8');
          res.setHeader('Content-Type', 'application/json');
          if (isCodeFilePath(reqPath)) {
            const displayName = resolved.split('/').pop() || resolved;
            let prerenderedHTML: string | undefined;
            try {
              const result = await preloadFile({
                file: { name: displayName, contents },
                options: { disableFileHeader: true },
              });
              prerenderedHTML = result.prerenderedHTML;
            } catch { /* fall back to client-side rendering */ }
            res.end(JSON.stringify({ codeFile: true, contents, filepath: resolved, prerenderedHTML }));
          } else {
            res.end(JSON.stringify({ markdown: contents, filepath: resolved }));
          }
          return;
        }

        next();
      });
    },
  };
}
