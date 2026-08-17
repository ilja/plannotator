import { describe, expect, it } from 'bun:test';
import { formatToolInput } from './PermissionCard';

describe('formatToolInput', () => {
  it('returns the command for Bash tools', () => {
    expect(formatToolInput('Bash', { command: 'ls -la' })).toBe('ls -la');
  });

  it('returns the file path for Read/Write/Edit tools', () => {
    expect(formatToolInput('Read', { file_path: 'src/app.ts' })).toBe('src/app.ts');
    expect(formatToolInput('Write', { file_path: 'src/app.ts' })).toBe('src/app.ts');
    expect(formatToolInput('Edit', { file_path: 'src/app.ts' })).toBe('src/app.ts');
  });

  it('returns the pattern for Glob/Grep tools', () => {
    expect(formatToolInput('Glob', { pattern: '*.ts' })).toBe('*.ts');
    expect(formatToolInput('Grep', { pattern: 'useEffect' })).toBe('useEffect');
  });

  it('falls back to a JSON snippet when the expected field is not a string', () => {
    const out = formatToolInput('Bash', { command: { nested: true } });
    expect(out.startsWith('{"command":')).toBe(true);
  });

  it('falls back to a JSON snippet for other tools', () => {
    const out = formatToolInput('WebSearch', { query: 'effect' });
    expect(out).toBe('{"query":"effect"}');
  });
});