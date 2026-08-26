import { describe, expect, test } from 'bun:test';
import {
  decodeAIChatError,
  decodeAIChatSessionId,
  decodeAIChatStreamMessage,
} from './aiChatStreamMessages';

describe('decodeAIChatStreamMessage', () => {
  test('decodes every stream event used by the chat UI', () => {
    expect(decodeAIChatStreamMessage({ type: 'text_delta', delta: 'Hello' })).toEqual({
      type: 'text_delta',
      delta: 'Hello',
    });
    expect(decodeAIChatStreamMessage({ type: 'text', text: 'Hello' })).toEqual({
      type: 'text',
      text: 'Hello',
    });
    expect(decodeAIChatStreamMessage({ type: 'error', error: 'Unavailable' })).toEqual({
      type: 'error',
      error: 'Unavailable',
    });
    expect(decodeAIChatStreamMessage({ type: 'result', result: 'Complete' })).toEqual({
      type: 'result',
      result: 'Complete',
    });
    expect(decodeAIChatStreamMessage({
      type: 'permission_request',
      requestId: 'request-1',
      toolName: 'Bash',
      toolInput: { command: 'pwd', options: ['-P'] },
      title: 'Run command',
      displayName: 'Terminal',
      description: 'Reads the current directory',
      toolUseId: 'tool-1',
    })).toEqual({
      type: 'permission_request',
      requestId: 'request-1',
      toolName: 'Bash',
      toolInput: { command: 'pwd', options: ['-P'] },
      title: 'Run command',
      displayName: 'Terminal',
      description: 'Reads the current directory',
      toolUseId: 'tool-1',
    });
  });

  test('decodes session identifiers and API error messages', () => {
    expect(decodeAIChatSessionId({ sessionId: 'session-1' })).toBe('session-1');
    expect(decodeAIChatSessionId({ sessionId: 1 })).toBeNull();
    expect(decodeAIChatError({ error: 'Unavailable' })).toBe('Unavailable');
    expect(decodeAIChatError({ error: 503 })).toBeNull();
  });

  test('rejects unknown variants and malformed nested permission requests', () => {
    expect(decodeAIChatStreamMessage({ type: 'tool_use', toolName: 'Bash' })).toBeNull();
    expect(decodeAIChatStreamMessage({ type: 'text_delta', delta: 1 })).toBeNull();
    expect(decodeAIChatStreamMessage({
      type: 'permission_request',
      requestId: 'request-1',
      toolName: 'Bash',
      toolInput: ['not', 'an', 'object'],
      toolUseId: 'tool-1',
    })).toBeNull();
    expect(decodeAIChatStreamMessage({
      type: 'permission_request',
      requestId: 'request-1',
      toolName: 'Bash',
      toolInput: { command: () => {} },
      toolUseId: 'tool-1',
    })).toBeNull();
  });
});
