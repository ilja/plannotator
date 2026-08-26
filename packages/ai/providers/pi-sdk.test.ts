import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PiSDKProvider } from './pi-sdk.ts';

describe('PiSDKProvider', () => {
  test('rejects malformed RPC state responses instead of hanging startup', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'plannotator-pi-sdk-'));
    const executable = join(directory, 'fake-pi');
    writeFileSync(executable, `#!/usr/bin/env node
const readline = require('node:readline');
const input = readline.createInterface({ input: process.stdin });
input.on('line', (line) => {
  const message = JSON.parse(line);
  if (message.type === 'get_state') {
    process.stdout.write(JSON.stringify({
      type: 'response',
      id: message.id,
      success: true,
      data: 'malformed state',
    }) + '\\n');
  } else if (message.type === 'prompt') {
    process.stdout.write(JSON.stringify({
      type: 'response',
      id: message.id,
      success: true,
      data: {},
    }) + '\\n');
    process.stdout.write(JSON.stringify({ type: 'agent_end' }) + '\\n');
  }
});
`, 'utf8');
    chmodSync(executable, 0o755);

    const provider = new PiSDKProvider({
      type: 'pi-sdk',
      cwd: directory,
      piExecutablePath: executable,
    });

    try {
      const session = await provider.createSession({
        cwd: directory,
        context: {
          mode: 'annotate',
          annotate: { content: 'Note', filePath: join(directory, 'note.md') },
        },
      });
      const result = await Promise.race([
        session.query('Hello').next(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Pi startup timed out')), 1_000);
        }),
      ]);
      expect(result.done).toBe(false);
      expect(result.value).toMatchObject({ type: 'result', success: true });
    } finally {
      provider.dispose();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
