import { describe, expect, it } from 'vitest';
import { GoogleGenAI } from '@google/genai';
import { buildGeminiClientOptions, explainGeminiError, fetchModelList, retryTransient } from '../../src/server/geminiClient.js';

describe('explainGeminiError', () => {
  it('turns fetch failures into actionable network guidance', () => {
    expect(explainGeminiError(new Error('fetch failed'))).toMatch(/网络连接失败/);
  });

  it('turns model not found errors into model-name guidance', () => {
    expect(explainGeminiError(new Error('404 NOT_FOUND: models/bad-model is not found'))).toMatch(/模型名称/);
  });

  it('retries transient failures before succeeding', async () => {
    let attempts = 0;
    const result = await retryTransient(
      async () => {
        attempts += 1;
        if (attempts < 2) throw new Error('429 Too Many Requests');
        return 'ok';
      },
      { retries: 2, delayMs: 0 }
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('builds default SDK options for the official API', () => {
    expect(buildGeminiClientOptions({ apiKey: 'key', settings: { apiProvider: 'official' } })).toEqual({
      apiKey: 'key'
    });
  });

  it('builds SDK options for a Gemini-compatible relay API', () => {
    expect(
      buildGeminiClientOptions({
        apiKey: 'key',
        settings: {
          apiProvider: 'geminiProxy',
          apiBaseUrl: 'https://relay.example.com',
          apiVersion: 'v1beta',
          apiHeaderName: 'X-Relay-Key',
          apiHeaderValue: 'relay-secret'
        }
      })
    ).toEqual({
      apiKey: 'key',
      apiVersion: 'v1beta',
      httpOptions: {
        baseUrl: 'https://relay.example.com',
        apiVersion: 'v1beta',
        headers: {
          'X-Relay-Key': 'relay-secret'
        }
      }
    });
  });

  it('points the SDK client at the relay request URL', () => {
    const options = buildGeminiClientOptions({
      apiKey: 'key',
      settings: {
        apiProvider: 'geminiProxy',
        apiBaseUrl: 'https://relay.example.com',
        apiVersion: 'v1beta'
      }
    });
    const client = new GoogleGenAI(options);

    expect(client.apiClient.getRequestUrl()).toBe('https://relay.example.com/v1beta');
  });

  it('fetches and normalizes relay model lists', async () => {
    const calls = [];
    const models = await fetchModelList({
      apiKey: 'key',
      settings: {
        apiProvider: 'geminiProxy',
        apiBaseUrl: 'https://relay.example.com',
        apiVersion: 'v1beta',
        apiHeaderName: 'X-Relay-Key',
        apiHeaderValue: 'relay-secret'
      },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return new Response(
          JSON.stringify({
            models: [{ name: 'models/gemini-3-pro-image-preview' }, { id: 'claude-sonnet-4-6' }]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    });

    expect(calls[0]).toMatchObject({
      url: 'https://relay.example.com/v1beta/models',
      options: {
        headers: {
          'x-goog-api-key': 'key',
          'X-Relay-Key': 'relay-secret'
        }
      }
    });
    expect(models).toEqual([
      { id: 'gemini-3-pro-image-preview', label: 'gemini-3-pro-image-preview' },
      { id: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6' }
    ]);
  });
});
