import { describe, expect, it } from 'bun:test';
import {
  decodeReviewAICapabilitiesResponse,
  loadReviewAICapabilitiesState,
} from './ai-capabilities-response';

const capabilities = {
  fork: true,
  resume: true,
  streaming: true,
  tools: false,
};

const validProvider = {
  id: 'pi-local',
  name: 'pi-sdk',
  capabilities,
  models: [
    { id: 'pi-default', label: 'Pi Default', default: true },
    { id: 'pi-fast', label: 'Pi Fast' },
  ],
};

const validResponse = {
  available: true,
  providers: [validProvider],
  defaultProvider: 'pi-local',
};

describe('decodeReviewAICapabilitiesResponse', () => {
  it('decodes a complete capabilities response', () => {
    expect(decodeReviewAICapabilitiesResponse(validResponse)).toEqual(validResponse);
  });

  it('rejects malformed roots and required envelope fields', () => {
    const malformedResponses = [
      null,
      [],
      {},
      { ...validResponse, available: 'yes' },
      { ...validResponse, providers: {} },
      { ...validResponse, providers: null },
    ];

    for (const response of malformedResponses) {
      expect(decodeReviewAICapabilitiesResponse(response)).toBeUndefined();
    }
  });

  it('retains valid providers and models while filtering malformed siblings', () => {
    const decoded = decodeReviewAICapabilitiesResponse({
      ...validResponse,
      providers: [
        validProvider,
        {
          ...validProvider,
          id: 'pi-other',
          models: [
            { id: 'other-valid', label: 'Other valid' },
            { id: 'missing-label' },
            { id: 42, label: 'Bad ID' },
            { id: 'bad-default', label: 'Bad default', default: 'yes' },
          ],
        },
        { ...validProvider, id: 'bad-capabilities', capabilities: { ...capabilities, tools: 'yes' } },
        { ...validProvider, id: 'bad-models', models: 'not an array' },
        { id: 'missing-name', capabilities, models: [] },
      ],
    });

    expect(decoded).toEqual({
      ...validResponse,
      providers: [
        validProvider,
        {
          ...validProvider,
          id: 'pi-other',
          models: [{ id: 'other-valid', label: 'Other valid' }],
        },
      ],
    });
  });

  it('normalizes malformed or missing default providers to null', () => {
    expect(decodeReviewAICapabilitiesResponse({ ...validResponse, defaultProvider: 42 })).toEqual({
      ...validResponse,
      defaultProvider: null,
    });
    expect(decodeReviewAICapabilitiesResponse({ available: true, providers: validResponse.providers })).toEqual({
      ...validResponse,
      defaultProvider: null,
    });
  });
});

describe('loadReviewAICapabilitiesState', () => {
  it('does not update for non-OK responses or invalid JSON', async () => {
    await expect(loadReviewAICapabilitiesState(new Response('not json', { status: 500 }))).resolves.toBeUndefined();
    await expect(loadReviewAICapabilitiesState(new Response('{', { status: 200 }))).resolves.toBeUndefined();
    await expect(loadReviewAICapabilitiesState(new Response(JSON.stringify({ available: 'yes' }), { status: 200 }))).resolves.toBeUndefined();
  });

  it('clears AI state for a valid unavailable response', async () => {
    await expect(loadReviewAICapabilitiesState(new Response(JSON.stringify({
      available: false,
      providers: [validProvider],
      defaultProvider: 'pi-local',
    })))).resolves.toEqual({
      available: false,
      providers: [],
      defaultProvider: null,
    });
  });

  it('keeps only Pi providers and a matching default provider', async () => {
    const response = {
      ...validResponse,
      providers: [
        validProvider,
        { ...validProvider, id: 'other', name: 'other-provider' },
      ],
      defaultProvider: 'other',
    };

    await expect(loadReviewAICapabilitiesState(new Response(JSON.stringify(response)))).resolves.toEqual({
      available: true,
      providers: [validProvider],
      defaultProvider: null,
    });
  });
});
