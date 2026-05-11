import { normalizeGenerationSettings } from './settings.js';

export const DEFAULT_PRESETS = [
  {
    id: 'preset-1',
    name: '预设一',
    mode: 'realtime',
    prompt: '',
    settings: {
      model: 'gemini-3-pro-image-preview',
      aspectRatio: '1:1',
      imageSize: '1K',
      temperature: 1,
      requestStartDelayMs: 0
    }
  },
  {
    id: 'preset-2',
    name: '预设二',
    mode: 'realtime',
    prompt: '',
    settings: {
      model: 'gemini-3.1-flash-image-preview',
      aspectRatio: '1:1',
      imageSize: '1K',
      temperature: 1,
      requestStartDelayMs: 0
    }
  }
];

export function buildPreset({ id, name, mode, prompt, settings }) {
  const { maxConcurrency, concurrency, ...presetSettings } = normalizeGenerationSettings(settings);
  return {
    id: id || crypto.randomUUID?.() || `preset-${Date.now()}`,
    name: (name || '未命名预设').trim(),
    mode: mode === 'batch' ? 'batch' : 'realtime',
    prompt: prompt || '',
    settings: presetSettings
  };
}

export function addPreset(presets, input) {
  return [...presets, buildPreset(input)];
}

export function deletePreset(presets, presetId) {
  const next = presets.filter((preset) => preset.id !== presetId);
  return next.length ? next : DEFAULT_PRESETS;
}

export function loadPresetsFromStorage(storage = localStorage) {
  try {
    const stored = JSON.parse(storage.getItem('gemini-batch-studio-presets') || 'null');
    if (Array.isArray(stored) && stored.length) return stored;
  } catch {
    // Fall back to defaults when local data is malformed.
  }
  return DEFAULT_PRESETS;
}

export function savePresetsToStorage(presets, storage = localStorage) {
  storage.setItem('gemini-batch-studio-presets', JSON.stringify(presets));
}
