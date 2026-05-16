import { describe, expect, it } from 'vitest';
import { addPreset, buildPreset, DEFAULT_PRESETS, deletePreset, importPresets, serializePresets } from '../../src/shared/presets.js';

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

  it('exports editable JSON and imports only presets with new parameters', () => {
    const exported = serializePresets([
      buildPreset({
        name: '白底商品图',
        mode: 'realtime',
        prompt: 'clean product shot',
        settings: {
          model: 'gemini-3-pro-image-preview',
          aspectRatio: '1:1',
          imageSize: '1K',
          temperature: 1
        }
      }),
      buildPreset({
        name: '海报风格',
        mode: 'batch',
        prompt: 'poster style',
        settings: {
          model: 'gemini-3.1-flash-image-preview',
          aspectRatio: '3:4',
          imageSize: '1K',
          temperature: 0.8
        }
      })
    ]);

    const result = importPresets(
      [
        buildPreset({
          name: '已有同参数不同名',
          mode: 'realtime',
          prompt: 'clean product shot',
          settings: {
            model: 'gemini-3-pro-image-preview',
            aspectRatio: '1:1',
            imageSize: '1K',
            temperature: 1
          }
        })
      ],
      exported
    );

    expect(JSON.parse(exported)).toMatchObject({
      schemaVersion: 1,
      app: 'Banana Batch Studio',
      presets: expect.any(Array)
    });
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.presets.map((preset) => preset.name)).toContain('海报风格');
    expect(result.presets.map((preset) => preset.name)).not.toContain('白底商品图');
  });

  it('rejects malformed preset files', () => {
    expect(() => importPresets(DEFAULT_PRESETS, 'not json')).toThrow(/JSON/);
    expect(() => importPresets(DEFAULT_PRESETS, JSON.stringify({ items: [] }))).toThrow(/presets/);
  });
});
