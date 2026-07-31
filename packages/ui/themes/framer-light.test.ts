import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

const themeCSS = readFileSync(new URL('./framer-light.css', import.meta.url), 'utf8');

describe('Framer Light Highlight.js styles', () => {
  test('uses Framer semantic colors for diff additions and deletions', () => {
    expect(themeCSS).toMatch(
      /\.theme-framer-light\.light \.hljs-addition\s*\{\s*color: var\(--foreground\) !important;\s*background-color: color-mix\(in oklab, var\(--success\) 20%, transparent\) !important;/,
    );
    expect(themeCSS).toMatch(
      /\.theme-framer-light\.light \.hljs-deletion\s*\{\s*color: var\(--foreground\) !important;\s*background-color: color-mix\(in oklab, var\(--destructive\) 15%, transparent\) !important;/,
    );
  });
});
