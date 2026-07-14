import { describe, expect, test } from 'bun:test';
import { buildPendingAIContext } from './pendingAIContext';

const file = {
  path: 'src/example.ts',
  patch: `diff --git a/src/example.ts b/src/example.ts
index 1111111..2222222 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,3 +1,3 @@
 const unchanged = true;
-const previous = false;
+const next = true;
 export { unchanged };
`,
};

describe('buildPendingAIContext', () => {
  test('builds added-line context', () => {
    expect(buildPendingAIContext(file, 2, 'additions')).toEqual({
      filePath: 'src/example.ts',
      lineStart: 2,
      lineEnd: 2,
      side: 'new',
      selectedCode: 'const next = true;',
    });
  });

  test('builds removed-line context', () => {
    expect(buildPendingAIContext(file, 2, 'deletions')).toEqual({
      filePath: 'src/example.ts',
      lineStart: 2,
      lineEnd: 2,
      side: 'old',
      selectedCode: 'const previous = false;',
    });
  });

  test('omits unavailable selected code', () => {
    expect(buildPendingAIContext(file, 99, 'additions')).toEqual({
      filePath: 'src/example.ts',
      lineStart: 99,
      lineEnd: 99,
      side: 'new',
    });
  });
});
