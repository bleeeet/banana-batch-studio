export const GEMINI_IMAGE_MODELS = [
  {
    id: 'gemini-3-pro-image-preview',
    label: 'Gemini 3 Pro Image Preview',
    sizes: ['1K', '2K', '4K']
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    label: 'Gemini 3.1 Flash Image Preview',
    sizes: ['512', '1K', '2K', '4K']
  }
];

export const SUPPORTED_ASPECT_RATIOS = [
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
];

export const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
export const DEFAULT_REALTIME_CONCURRENCY = 10;
export const MAX_REALTIME_CONCURRENCY = 100;
export const DEFAULT_REQUEST_START_DELAY_MS = 0;
export const MAX_REQUEST_START_DELAY_MS = 10000;
export const RELAY_IMAGE_SIZE_OPTIONS = ['512', '1K', '2K', '4K'];
export const API_PROVIDER_OPTIONS = [
  {
    id: 'official',
    label: 'Google 官方 API'
  },
  {
    id: 'geminiProxy',
    label: 'Gemini 兼容中转'
  }
];

function trimSlashes(value) {
  return String(value || '').trim().replace(/^\/+|\/+$/g, '');
}

function normalizeApiProvider(input = {}) {
  const apiProvider = API_PROVIDER_OPTIONS.some((provider) => provider.id === input.apiProvider)
    ? input.apiProvider
    : 'official';
  const apiBaseUrl = String(input.apiBaseUrl || '').trim().replace(/\/+$/, '');
  const apiVersion = String(input.apiVersion || 'v1beta').trim() || 'v1beta';
  const apiHeaderName = String(input.apiHeaderName || '').trim();
  const apiHeaderValue = String(input.apiHeaderValue || '').trim();

  if (apiProvider === 'official') {
    return {
      apiProvider,
      apiBaseUrl: '',
      apiVersion: '',
      apiHeaderName: '',
      apiHeaderValue: ''
    };
  }

  try {
    const parsed = new URL(apiBaseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid protocol');
  } catch {
    throw new Error('中转 API 地址必须是完整的 http 或 https URL。');
  }

  return {
    apiProvider,
    apiBaseUrl,
    apiVersion,
    apiHeaderName,
    apiHeaderValue
  };
}

export function buildApiPreviewUrl(input = {}) {
  const apiProvider = API_PROVIDER_OPTIONS.some((provider) => provider.id === input.apiProvider)
    ? input.apiProvider
    : 'official';
  if (apiProvider === 'official') return 'https://generativelanguage.googleapis.com/v1beta/models';

  const apiBaseUrl = String(input.apiBaseUrl || '').trim().replace(/\/+$/, '');
  const apiVersion = trimSlashes(input.apiVersion || 'v1beta') || 'v1beta';
  if (!apiBaseUrl) return `/${apiVersion}/models`;
  return `${apiBaseUrl}/${apiVersion}/models`;
}

export function getSizeOptionsForModel(modelId) {
  const model = GEMINI_IMAGE_MODELS.find((item) => item.id === modelId);
  return model ? model.sizes : [];
}

export function getSizeOptionsForSettings(input = {}) {
  if (input.apiProvider === 'geminiProxy') {
    const officialOptions = getSizeOptionsForModel(input.model);
    return officialOptions.length ? officialOptions : RELAY_IMAGE_SIZE_OPTIONS;
  }
  return getSizeOptionsForModel(input.model);
}

export function isSupportedImage(fileName = '') {
  const lower = fileName.toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function normalizeGenerationSettings(input = {}) {
  const provider = normalizeApiProvider(input);
  const model = input.model || GEMINI_IMAGE_MODELS[0].id;
  const aspectRatio = input.aspectRatio || '1:1';
  const sizeOptions = getSizeOptionsForSettings({ ...input, ...provider, model });
  const imageSize = input.imageSize || sizeOptions[0];
  const temperature = Number.isFinite(Number(input.temperature)) ? Number(input.temperature) : 1;
  const rawRequestStartDelayMs = Number(input.requestStartDelayMs);
  const requestStartDelayMs = Number.isFinite(rawRequestStartDelayMs)
    ? Math.max(0, Math.min(Math.round(rawRequestStartDelayMs), MAX_REQUEST_START_DELAY_MS))
    : DEFAULT_REQUEST_START_DELAY_MS;
  const rawMaxConcurrency = Number(input.maxConcurrency);
  const maxConcurrency = Number.isFinite(rawMaxConcurrency)
    ? Math.max(1, Math.min(Math.round(rawMaxConcurrency), MAX_REALTIME_CONCURRENCY))
    : DEFAULT_REALTIME_CONCURRENCY;

  if (provider.apiProvider === 'official' && !GEMINI_IMAGE_MODELS.some((item) => item.id === model)) {
    throw new Error(`Model ${model} is not supported by this app.`);
  }

  if (!SUPPORTED_ASPECT_RATIOS.includes(aspectRatio)) {
    throw new Error(`Aspect ratio ${aspectRatio} is not supported.`);
  }

  if (!sizeOptions.includes(imageSize)) {
    throw new Error(`Image size ${imageSize} is not supported for ${model}.`);
  }

  if (temperature < 0 || temperature > 2) {
    throw new Error('Temperature must be between 0 and 2.');
  }

  return {
    model,
    aspectRatio,
    imageSize,
    temperature,
    maxConcurrency,
    requestStartDelayMs,
    ...provider
  };
}
