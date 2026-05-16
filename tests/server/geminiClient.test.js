import { describe, expect, it } from 'vitest';
import { GoogleGenAI } from '@google/genai';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildGeminiClientOptions, explainGeminiError, fetchModelList, GeminiClient, retryTransient } from '../../src/server/geminiClient.js';
import { OpenAIImageClient } from '../../src/server/openaiImageClient.js';
import { BATCH_DIR } from '../../src/server/paths.js';

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

  it('adds shared reference images after the prompt and source image for realtime requests', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-reference-realtime-'));
    const inputPath = path.join(dir, 'main.png');
    const outputDir = path.join(dir, 'out');
    const referenceImages = [
      { originalName: 'ref-a.png', mimeType: 'image/png', path: path.join(dir, 'ref-a.png') },
      { originalName: 'ref-b.png', mimeType: 'image/png', path: path.join(dir, 'ref-b.png') }
    ];
    await mkdir(outputDir, { recursive: true });
    await writeFile(inputPath, 'main-bytes');
    await writeFile(referenceImages[0].path, 'ref-a-bytes');
    await writeFile(referenceImages[1].path, 'ref-b-bytes');

    const calls = [];
    const client = new GeminiClient({ apiKey: 'key' });
    client.ai = {
      models: {
        async generateContent(payload) {
          calls.push(payload);
          return {
            candidates: [
              {
                content: {
                  parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from('output').toString('base64') } }]
                }
              }
            ]
          };
        }
      }
    };

    await client.generateImageFromFile({
      inputPath,
      mimeType: 'image/png',
      originalName: 'main.png',
      prompt: 'match the references',
      settings: { model: 'gemini-3-pro-image-preview', temperature: 1, aspectRatio: '1:1', imageSize: '1K' },
      outputDir,
      referenceImages
    });

    const parts = calls[0].contents[0].parts;
    expect(parts).toHaveLength(4);
    expect(parts[0]).toEqual({ text: 'match the references' });
    expect(Buffer.from(parts[1].inlineData.data, 'base64').toString()).toBe('main-bytes');
    expect(Buffer.from(parts[2].inlineData.data, 'base64').toString()).toBe('ref-a-bytes');
    expect(Buffer.from(parts[3].inlineData.data, 'base64').toString()).toBe('ref-b-bytes');
    expect(await readFile(path.join(outputDir, 'main_gemini.png'), 'utf8')).toBe('output');
  });

  it('includes the same shared reference images in each batch request', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-reference-batch-'));
    const referenceImages = [
      { originalName: 'ref-a.png', mimeType: 'image/png', path: path.join(dir, 'ref-a.png') },
      { originalName: 'ref-b.png', mimeType: 'image/png', path: path.join(dir, 'ref-b.png') }
    ];
    await mkdir(BATCH_DIR, { recursive: true });
    await writeFile(path.join(dir, 'main.png'), 'main-bytes');
    await writeFile(referenceImages[0].path, 'ref-a-bytes');
    await writeFile(referenceImages[1].path, 'ref-b-bytes');

    const calls = [];
    const client = new GeminiClient({ apiKey: 'key' });
    client.ai = {
      batches: {
        async create(payload) {
          calls.push(payload);
          return { name: 'batch-1', state: 'SUBMITTED' };
        }
      }
    };

    await client.createBatchJob({
      job: {
        id: 'job-with-references',
        prompt: 'match the references',
        settings: { model: 'gemini-3-pro-image-preview', temperature: 1, aspectRatio: '1:1', imageSize: '1K' },
        referenceImages,
        items: [
          {
            id: 'item-1',
            originalName: 'main.png',
            mimeType: 'image/png',
            inputPath: path.join(dir, 'main.png')
          }
        ]
      }
    });

    const parts = calls[0].src.inlinedRequests[0].contents[0].parts;
    expect(parts).toHaveLength(4);
    expect(parts[0]).toEqual({ text: 'match the references' });
    expect(Buffer.from(parts[1].inlineData.data, 'base64').toString()).toBe('main-bytes');
    expect(Buffer.from(parts[2].inlineData.data, 'base64').toString()).toBe('ref-a-bytes');
    expect(Buffer.from(parts[3].inlineData.data, 'base64').toString()).toBe('ref-b-bytes');
  });
});

describe('OpenAIImageClient', () => {
  it('sends image edits to the native OpenAI images API with OpenAI size parameters', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'openai-image-edit-'));
    const inputPath = path.join(dir, 'main.png');
    const outputDir = path.join(dir, 'out');
    const referenceImage = { originalName: 'ref.png', mimeType: 'image/png', path: path.join(dir, 'ref.png') };
    await mkdir(outputDir, { recursive: true });
    await writeFile(inputPath, 'main-bytes');
    await writeFile(referenceImage.path, 'ref-bytes');

    const calls = [];
    const client = new OpenAIImageClient({
      apiKey: 'sk-openai-test-key',
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return new Response(
          JSON.stringify({
            data: [{ b64_json: Buffer.from('openai-output').toString('base64') }]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    });

    const result = await client.generateImageFromFile({
      inputPath,
      mimeType: 'image/png',
      originalName: 'main.png',
      prompt: 'make a studio product image',
      settings: { model: 'gpt-image-1.5', imageSize: '1536x1024' },
      outputDir,
      referenceImages: [referenceImage]
    });

    expect(calls[0].url).toBe('https://api.openai.com/v1/images/edits');
    expect(calls[0].options.headers.Authorization).toBe('Bearer sk-openai-test-key');
    const body = calls[0].options.body;
    expect(body.get('model')).toBe('gpt-image-1.5');
    expect(body.get('prompt')).toBe('make a studio product image');
    expect(body.get('size')).toBe('1536x1024');
    expect(body.getAll('image')).toHaveLength(2);
    expect(result).toMatchObject({
      outputName: 'main_openai.png',
      outputPath: path.join(outputDir, 'main_openai.png'),
      mimeType: 'image/png'
    });
    expect(await readFile(result.outputPath, 'utf8')).toBe('openai-output');
  });
});
