import { describe, expect, it } from 'vitest';
import { addPreset, buildPreset, DEFAULT_PRESETS, deletePreset } from '../../src/shared/presets.js';

describe('presets', () => {
  it('ships two editable preset slots', () => {
    expect(DEFAULT_PRESETS).toHaveLength(2);
    expect(DEFAULT_PRESETS.map((preset) => preset.name)).toEqual(['预设一', '预设二']);
  });

  it('adds and deletes custom presets', () => {
    const presets = addPreset(DEFAULT_PRESETS, {
      name: '白底商品图',
      mode: 'realtime',
      prompt: 'clean product shot',
      settings: {
        model: 'gemini-3-pro-image-preview',
        aspectRatio: '1:1',
        imageSize: '1K',
          temperature: 1
      }
    });

    expect(presets.map((preset) => preset.name)).toContain('白底商品图');
    expect(deletePreset(presets, presets.at(-1).id)).toHaveLength(DEFAULT_PRESETS.length);
  });

  it('captures mode, prompt, model, ratio, size, and temperature without max concurrency', () => {
    const preset = buildPreset({
      name: '白底商品图',
      mode: 'batch',
      prompt: 'clean product shot',
      settings: {
        model: 'gemini-3-pro-image-preview',
        aspectRatio: '3:4',
        imageSize: '2K',
        temperature: 0.5,
        maxConcurrency: 24
      }
    });

    expect(preset).toMatchObject({
      name: '白底商品图',
      mode: 'batch',
      prompt: 'clean product shot',
      settings: {
        model: 'gemini-3-pro-image-preview',
        aspectRatio: '3:4',
        imageSize: '2K',
        temperature: 0.5
      }
    });
    expect(preset.settings.maxConcurrency).toBeUndefined();
  });
});
