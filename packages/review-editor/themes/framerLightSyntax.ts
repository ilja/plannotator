import { registerCustomTheme } from '@pierre/diffs';

export const FRAMER_LIGHT_SYNTAX_THEME_NAME = 'plannotator-framer-light';

const framerLightSyntaxTheme = {
  name: FRAMER_LIGHT_SYNTAX_THEME_NAME,
  type: 'light' as const,
  colors: {
    'editor.background': '#fdfdfd',
    'editor.foreground': '#666666',
    foreground: '#666666',
    'editor.lineHighlightBackground': '#fafafa',
    'editor.selectionBackground': '#dfdfdf',
    'editorCursor.foreground': '#ff3377',
    'editorLineNumber.foreground': '#d5d5d5',
    'editorLineNumber.activeForeground': '#777777',
    'focusBorder': '#0099ff',
    'gitDecoration.addedResourceForeground': '#00bbcc',
    'gitDecoration.deletedResourceForeground': '#ff3377',
    'gitDecoration.modifiedResourceForeground': '#0099ff',
    'terminal.ansiRed': '#ff3377',
    'terminal.ansiGreen': '#00bbcc',
    'terminal.ansiYellow': '#ffaa00',
    'terminal.ansiBlue': '#0099ff',
    'terminal.ansiMagenta': '#dd88ff',
    'terminal.ansiCyan': '#00bbcc',
  },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#bbbbbb', fontStyle: 'italic' } },
    { scope: ['keyword', 'keyword.control', 'keyword.operator.new', 'variable.other.property'], settings: { foreground: '#0099ff' } },
    { scope: ['storage', 'storage.type', 'entity.name.type', 'entity.name.class', 'support.type', 'support.class', 'variable.other.object'], settings: { foreground: '#00bbcc' } },
    { scope: ['entity.name.function', 'support.function', 'variable.function', 'meta.function-call', 'entity.name.tag', 'entity.other.attribute-name'], settings: { foreground: '#ffaa00' } },
    { scope: ['string', 'constant.other.symbol', 'punctuation.definition.string'], settings: { foreground: '#8855ff' } },
    { scope: ['constant.numeric', 'constant.language.boolean', 'constant.language.null', 'constant.character'], settings: { foreground: '#ff8866' } },
    { scope: ['keyword.operator', 'punctuation', 'meta.brace'], settings: { foreground: '#999999' } },
    { scope: ['variable.language', 'invalid', 'invalid.illegal'], settings: { foreground: '#ff3377' } },
    { scope: ['meta.interpolation', 'punctuation.section.embedded', 'meta.annotation'], settings: { foreground: '#dd88ff' } },
  ],
};

// Based on https://github.com/balanceiskey/vim-framer-syntax by Sundeep Malladi (MIT).
registerCustomTheme(FRAMER_LIGHT_SYNTAX_THEME_NAME, async () => framerLightSyntaxTheme);
