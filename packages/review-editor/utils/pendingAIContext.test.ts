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

  test('uses the exact supplied file for added lines with duplicate line numbers', () => {
    const firstFile = {
      path: 'src/first.ts',
      patch: `diff --git a/src/first.ts b/src/first.ts
index 1111111..2222222 100644
--- a/src/first.ts
+++ b/src/first.ts
@@ -1,3 +1,3 @@
 const shared = true;
-const beforeFirst = false;
+const afterFirst = true;
 export { shared };
`,
    };
    const secondFile = {
      path: 'src/second.ts',
      patch: `diff --git a/src/second.ts b/src/second.ts
index 3333333..4444444 100644
--- a/src/second.ts
+++ b/src/second.ts
@@ -1,3 +1,3 @@
 const shared = true;
-const beforeSecond = false;
+const afterSecond = true;
 export { shared };
`,
    };

    expect(buildPendingAIContext(secondFile, 2, 'additions')).toEqual({
      filePath: 'src/second.ts',
      lineStart: 2,
      lineEnd: 2,
      side: 'new',
      selectedCode: 'const afterSecond = true;',
    });
  });

  test('uses the exact supplied file for removed lines with duplicate line numbers', () => {
    const firstFile = {
      path: 'src/first.ts',
      patch: `diff --git a/src/first.ts b/src/first.ts
index 1111111..2222222 100644
--- a/src/first.ts
+++ b/src/first.ts
@@ -1,3 +1,3 @@
 const shared = true;
-const beforeFirst = false;
+const afterFirst = true;
 export { shared };
`,
    };
    const secondFile = {
      path: 'src/second.ts',
      patch: `diff --git a/src/second.ts b/src/second.ts
index 3333333..4444444 100644
--- a/src/second.ts
+++ b/src/second.ts
@@ -1,3 +1,3 @@
 const shared = true;
-const beforeSecond = false;
+const afterSecond = true;
 export { shared };
`,
    };

    expect(buildPendingAIContext(firstFile, 2, 'deletions')).toEqual({
      filePath: 'src/first.ts',
      lineStart: 2,
      lineEnd: 2,
      side: 'old',
      selectedCode: 'const beforeFirst = false;',
    });
  });
});
