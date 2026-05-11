import { describe, expect, it } from 'vitest';
import {
  API_PROVIDER_OPTIONS,
  buildApiPreviewUrl,
  getSizeOptionsForModel,
  isSupportedImage,
  normalizeGenerationSettings,
  SUPPORTED_ASPECT_RATIOS
} from '../../src/shared/settings.js';

describe('generation settings', () => {
  it('adds 512 only for the Flash image model', () => {
    expect(getSizeOptionsForModel('gemini-3.1-flash-image-preview')).toContain('512');
    expect(getSizeOptionsForModel('gemini-3-pro-image-preview')).not.toContain('512');
  });

  it('includes the two requested Gemini image models', async () => {
    const { GEMINI_IMAGE_MODELS } = await import('../../src/shared/settings.js');
    expect(GEMINI_IMAGE_MODELS.map((model) => model.id)).toEqual([
      'gemini-3-pro-image-preview',
      'gemini-3.1-flash-image-preview'
    ]);
  });

  it('rejects unsupported model size combinations', () => {
    expect(() =>
      normalizeGenerationSettings({
        model: 'gemini-3-pro-image-preview',
        aspectRatio: '1:1',
        imageSize: '512',
        temperature: 0.7
      })
    ).toThrow(/not supported/i);
  });

  it('normalizes valid settings with fast safe defaults', () => {
    expect(
      normalizeGenerationSettings({
        model: 'gemini-3.1-flash-image-preview',
        aspectRatio: '16:9',
        imageSize: '512'
      })
    ).toMatchObject({
      model: 'gemini-3.1-flash-image-preview',
      aspectRatio: '16:9',
      imageSize: '512',
      temperature: 1,
      requestStartDelayMs: 0
    });
  });

  it('defaults to no artificial request start delay', () => {
    const settings = normalizeGenerationSettings({
      model: 'gemini-3-pro-image-preview',
      aspectRatio: '1:1',
      imageSize: '1K'
    });

    expect(settings.requestStartDelayMs).toBe(0);
  });

  it('normalizes maximum realtime concurrency and request stagger interval', () => {
    const settings = normalizeGenerationSettings({
      model: 'gemini-3-pro-image-preview',
      aspectRatio: '1:1',
      imageSize: '1K',
      maxConcurrency: 24,
      requestStartDelayMs: 1500
    });

    expect(settings).toMatchObject({ maxConcurrency: 24, requestStartDelayMs: 1500 });
  });

  it('defaults maximum realtime concurrency to ten and clamps invalid values', () => {
    expect(
      normalizeGenerationSettings({
        model: 'gemini-3-pro-image-preview',
        aspectRatio: '1:1',
        imageSize: '1K'
      }).maxConcurrency
    ).toBe(10);
    expect(
      normalizeGenerationSettings({
        model: 'gemini-3-pro-image-preview',
        aspectRatio: '1:1',
        imageSize: '1K',
        maxConcurrency: 0
      }).maxConcurrency
    ).toBe(1);
  });

  it('keeps the official API provider as the default', () => {
    const settings = normalizeGenerationSettings({
      model: 'gemini-3-pro-image-preview',
      aspectRatio: '1:1',
      imageSize: '1K'
    });

    expect(API_PROVIDER_OPTIONS.map((provider) => provider.id)).toEqual(['official', 'geminiProxy']);
    expect(settings).toMatchObject({
      apiProvider: 'official',
      apiBaseUrl: '',
      apiVersion: '',
      apiHeaderName: '',
      apiHeaderValue: ''
    });
  });

  it('normalizes Gemini-compatible relay API settings', () => {
    expect(
      normalizeGenerationSettings({
        model: 'gemini-3-pro-image-preview',
        aspectRatio: '1:1',
        imageSize: '1K',
        apiProvider: 'geminiProxy',
        apiBaseUrl: ' https://relay.example.com/gemini/ ',
        apiVersion: ' v1beta ',
        apiHeaderName: ' X-Relay-Key ',
        apiHeaderValue: ' relay-secret '
      })
    ).toMatchObject({
      apiProvider: 'geminiProxy',
      apiBaseUrl: 'https://relay.example.com/gemini',
      apiVersion: 'v1beta',
      apiHeaderName: 'X-Relay-Key',
      apiHeaderValue: 'relay-secret'
    });
  });

  it('defaults relay API settings to the Gemini v1beta path', () => {
    expect(
      normalizeGenerationSettings({
        model: 'gemini-3.1-flash-image-preview',
        aspectRatio: '1:1',
        imageSize: '512',
        apiProvider: 'geminiProxy',
        apiBaseUrl: 'https://api.vectorengine.ai'
      })
    ).toMatchObject({
      apiProvider: 'geminiProxy',
      apiBaseUrl: 'https://api.vectorengine.ai',
      apiVersion: 'v1beta'
    });
  });

  it('allows relay models that are not bundled in the official picker', () => {
    expect(
      normalizeGenerationSettings({
        model: 'gemini-2.5-flash-image-preview',
        aspectRatio: '1:1',
        imageSize: '1K',
        apiProvider: 'geminiProxy',
        apiBaseUrl: 'https://api.vectorengine.ai'
      })
    ).toMatchObject({
      model: 'gemini-2.5-flash-image-preview',
      imageSize: '1K',
      apiProvider: 'geminiProxy'
    });
  });

  it('requires a valid relay base URL when the relay provider is selected', () => {
    expect(() =>
      normalizeGenerationSettings({
        model: 'gemini-3-pro-image-preview',
        aspectRatio: '1:1',
        imageSize: '1K',
        apiProvider: 'geminiProxy',
        apiBaseUrl: 'not-a-url'
      })
    ).toThrow(/中转 API 地址/);
  });

  it('previews the relay model-list endpoint', () => {
    expect(
      buildApiPreviewUrl({
        apiProvider: 'geminiProxy',
        apiBaseUrl: 'https://api.vectorengine.ai/',
        apiVersion: 'v1beta'
      })
    ).toBe('https://api.vectorengine.ai/v1beta/models');
  });

  it('keeps the official aspect-ratio set available to the UI', () => {
    expect(SUPPORTED_ASPECT_RATIOS).toEqual([
      '1:1',
      '1:4',
      '1:8',
      '2:3',
      '3:2',
      '3:4',
      '4:1',
      '4:3',
      '4:5',
      '5:4',
      '8:1',
      '9:16',
      '16:9',
      '21:9'
    ]);
  });
});

describe('image file filtering', () => {
  it('accepts png, jpeg, jpg, and webp files only', () => {
    expect(isSupportedImage('cover.PNG')).toBe(true);
    expect(isSupportedImage('shot.jpeg')).toBe(true);
    expect(isSupportedImage('photo.jpg')).toBe(true);
    expect(isSupportedImage('render.webp')).toBe(true);
    expect(isSupportedImage('notes.txt')).toBe(false);
    expect(isSupportedImage('phone.heic')).toBe(false);
  });
});
