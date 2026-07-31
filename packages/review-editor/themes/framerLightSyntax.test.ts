import { describe, expect, test } from 'bun:test';
import { getSharedHighlighter } from '@pierre/diffs';
import { FRAMER_LIGHT_SYNTAX_THEME_NAME } from './framerLightSyntax';

describe('Framer Light Shiki theme', () => {
  test('loads the upstream TypeScript token colors', async () => {
    const highlighter = await getSharedHighlighter({
      themes: [FRAMER_LIGHT_SYNTAX_THEME_NAME],
      langs: ['typescript'],
    });
    const html = highlighter.codeToHtml(`const enabled = true;
if (enabled) {
  const message = "hello";
  console.log(message);
}`, {
      lang: 'typescript',
      theme: FRAMER_LIGHT_SYNTAX_THEME_NAME,
    });

    expect(html).toContain('#0099FF');
    expect(html).toContain('#00BBCC');
    expect(html).toContain('#FF8866');
    expect(html).toContain('#8855FF');
    expect(html).toContain('#FFAA00');
  });
});
