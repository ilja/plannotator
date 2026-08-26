import { describe, expect, test } from 'bun:test';
import { ConfigStore } from './configStore';
import { decodeUiServerConfig, SETTINGS } from './settings';

describe('UI server config decoding', () => {
  test('preserves valid sibling settings when one nested field is malformed', () => {
    const config = decodeUiServerConfig({
      diffOptions: {
        diffStyle: 42,
        overflow: 'wrap',
      },
    });

    expect(SETTINGS.diffStyle.fromServer(config)).toBeUndefined();
    expect(SETTINGS.diffOverflow.fromServer(config)).toBe('wrap');
  });

  test('preserves top-level settings when an options namespace is malformed', () => {
    const config = decodeUiServerConfig({
      displayName: 'Ada',
      diffOptions: 'invalid',
      conventionalComments: true,
    });

    expect(SETTINGS.displayName.fromServer(config)).toBe('Ada');
    expect(SETTINGS.diffStyle.fromServer(config)).toBeUndefined();
    expect(SETTINGS.conventionalComments.fromServer(config)).toBe(true);
  });

  test('migrates the legacy branch diff type to merge-base', () => {
    const config = decodeUiServerConfig({
      diffOptions: { defaultDiffType: 'branch' },
    });

    expect(SETTINGS.defaultDiffType.fromServer(config)).toBe('merge-base');
  });

  test('rejects malformed conventional labels without discarding valid settings', () => {
    const config = decodeUiServerConfig({
      displayName: 'Grace',
      conventionalLabels: [{ label: 'bug', display: 'Bug', blocking: 'yes' }],
    });

    expect(SETTINGS.conventionalLabels.fromServer(config)).toBeUndefined();
    expect(SETTINGS.displayName.fromServer(config)).toBe('Grace');
  });

  test('preserves valid empty and null conventional-label settings', () => {
    expect(SETTINGS.conventionalLabels.fromServer(decodeUiServerConfig({ conventionalLabels: [] }))).toBe('[]');
    expect(SETTINGS.conventionalLabels.fromServer(decodeUiServerConfig({ conventionalLabels: null }))).toBeNull();
    expect(SETTINGS.conventionalLabels.toServer('[]')).toEqual({ conventionalLabels: [] });
    expect(SETTINGS.conventionalLabels.toServer('null')).toEqual({ conventionalLabels: null });
    expect(SETTINGS.conventionalLabels.toServer(null)).toEqual({ conventionalLabels: null });
  });

  test('rejects legacy string booleans atomically during server synchronization', () => {
    expect(SETTINGS.conventionalLabels.toServer(JSON.stringify([
      { label: 'issue', display: 'Issue', blocking: 'true' },
    ]))).toEqual({});
  });
});

describe('ConfigStore', () => {
  test('applies independently decoded settings from an untrusted payload', () => {
    const store = new ConfigStore();
    const initialDiffStyle = store.get('diffStyle');

    store.init({
      displayName: 'Lin',
      diffOptions: {
        diffStyle: 42,
        overflow: 'wrap',
      },
    });

    expect(store.get('displayName')).toBe('Lin');
    expect(store.get('diffStyle')).toBe(initialDiffStyle);
    expect(store.get('diffOverflow')).toBe('wrap');
  });

  test('merges rapid writes across top-level and nested config namespaces', async () => {
    const originalFetch = globalThis.fetch;
    const requests: RequestInit[] = [];
    const fetchStub = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requests.push(init ?? {});
      return new Response(null, { status: 204 });
    };
    fetchStub.preconnect = originalFetch.preconnect;
    globalThis.fetch = fetchStub;

    try {
      const store = new ConfigStore();
      store.set('diffStyle', 'unified');
      store.set('diffOverflow', 'wrap');
      store.set('annotationCodeFontSize', '14px');
      store.set('conventionalComments', true);

      await new Promise(resolve => setTimeout(resolve, 350));

      expect(requests).toHaveLength(1);
      expect(await new Response(requests[0]?.body).json()).toEqual({
        diffOptions: {
          diffStyle: 'unified',
          overflow: 'wrap',
        },
        annotationOptions: {
          codeFontSize: '14px',
        },
        conventionalComments: true,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
