import { describe, expect, test } from 'bun:test';
import { decodeHtmlBridgeOutboundMessage } from './bridgeMessages';

const validMessages = [
  { type: 'plannotator-bridge-create-mark', id: 'a', annotationType: 'comment' },
  { type: 'plannotator-bridge-find-and-mark', id: 'a', originalText: 'selected', annotationType: 'deletion' },
  { type: 'plannotator-bridge-remove-mark', id: 'a' },
  { type: 'plannotator-bridge-clear-marks' },
  { type: 'plannotator-bridge-scroll-to', id: 'a' },
  { type: 'plannotator-bridge-focus-mark', id: null },
  { type: 'plannotator-bridge-set-input-method', method: 'pinpoint' },
  { type: 'plannotator-bridge-theme', tokens: { '--background': '#fff' }, isLight: true },
] as const;

describe('decodeHtmlBridgeOutboundMessage', () => {
  test('decodes every outbound message variant', () => {
    for (const message of validMessages) {
      expect(decodeHtmlBridgeOutboundMessage(message)).toEqual(message);
    }
  });

  test('rejects malformed or unsafe outbound values', () => {
    expect(decodeHtmlBridgeOutboundMessage(null)).toBeUndefined();
    expect(decodeHtmlBridgeOutboundMessage({ type: 'unknown' })).toBeUndefined();
    expect(decodeHtmlBridgeOutboundMessage({
      type: 'plannotator-bridge-remove-mark',
      id: '',
    })).toBeUndefined();
    expect(decodeHtmlBridgeOutboundMessage({
      type: 'plannotator-bridge-find-and-mark',
      id: 'a',
      originalText: '',
      annotationType: 'comment',
    })).toBeUndefined();
    expect(decodeHtmlBridgeOutboundMessage({
      type: 'plannotator-bridge-theme',
      tokens: { '--background': 42 },
      isLight: true,
    })).toBeUndefined();
    expect(decodeHtmlBridgeOutboundMessage({
      type: 'plannotator-bridge-set-input-method',
      method: 'unknown',
    })).toBeUndefined();
  });
});
