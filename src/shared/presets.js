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

function presetFingerprint(preset) {
  const built = buildPreset(preset);
  return JSON.stringify({
    mode: built.mode,
    prompt: built.prompt,
    settings: built.settings
  });
}

export function serializePresets(presets) {
  return JSON.stringify(
    {
      schemaVersion: 1,
      app: 'Banana Batch Studio',
      exportedAt: new Date().toISOString(),
      presets: presets.map((preset) => buildPreset(preset))
    },
    null,
    2
  );
}

export function importPresets(currentPresets, rawText) {
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error('预设文件不是有效 JSON。');
  }

  const entries = Array.isArray(data) ? data : data?.presets;
  if (!Array.isArray(entries)) {
    throw new Error('预设文件需要包含 presets 数组。');
  }

  const seen = new Set(currentPresets.map(presetFingerprint));
  const nextPresets = [...currentPresets];
  let imported = 0;
  let skipped = 0;

  for (const entry of entries) {
    const preset = buildPreset({ ...entry, id: undefined });
    const key = presetFingerprint(preset);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    nextPresets.push(preset);
    imported += 1;
  }

  return { presets: nextPresets, imported, skipped };
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
