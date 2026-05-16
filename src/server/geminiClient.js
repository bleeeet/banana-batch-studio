import { GoogleGenAI } from '@google/genai';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildApiPreviewUrl } from '../shared/settings.js';
import { BATCH_DIR } from './paths.js';

export function buildGeminiClientOptions({ apiKey, settings = {} }) {
  const options = { apiKey };
  if (settings.apiProvider !== 'geminiProxy') return options;

  const apiVersion = settings.apiVersion || 'v1beta';
  const httpOptions = {
    baseUrl: settings.apiBaseUrl
  };
  if (apiVersion) httpOptions.apiVersion = apiVersion;
  if (settings.apiHeaderName && settings.apiHeaderValue) {
    httpOptions.headers = {
      [settings.apiHeaderName]: settings.apiHeaderValue
    };
  }

  return {
    ...options,
    apiVersion,
    httpOptions
  };
}

function modelIdFromEntry(entry) {
  const raw = entry?.id || entry?.name || entry?.model || '';
  return String(raw).replace(/^models\//, '').trim();
}

export async function fetchModelList({ apiKey, settings = {}, fetchImpl = fetch }) {
  const url = buildApiPreviewUrl(settings);
  const headers = {
    'x-goog-api-key': apiKey
  };
  if (settings.apiHeaderName && settings.apiHeaderValue) {
    headers[settings.apiHeaderName] = settings.apiHeaderValue;
  }

  const response = await fetchImpl(url, { headers });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`模型列表返回内容不是 JSON：${text.slice(0, 160)}`);
  }
  if (!response.ok) {
    throw new Error(data.error?.message || data.error || `获取模型列表失败：${response.status}`);
  }

  const entries = Array.isArray(data.models) ? data.models : Array.isArray(data.data) ? data.data : [];
  return entries
    .map((entry) => {
      const id = modelIdFromEntry(entry);
      return id ? { id, label: entry.displayName || entry.label || id } : null;
    })
    .filter(Boolean);
}

export function explainGeminiError(error) {
  const raw = error?.message || String(error);
  const lower = raw.toLowerCase();

  if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('econnreset') || lower.includes('etimedout')) {
    return `网络连接失败：本机没有连通 Google Gemini API。请检查网络、代理/VPN、DNS，或确认当前地区可以访问 generativelanguage.googleapis.com。原始错误：${raw}`;
  }

  if (lower.includes('not_found') || lower.includes('not found') || lower.includes('404')) {
    return `模型名称或接口路径不正确：请使用界面里的官方模型选项，不要手动输入旧模型名。原始错误：${raw}`;
  }

  if (lower.includes('api key') || lower.includes('permission') || lower.includes('unauthorized') || lower.includes('403') || lower.includes('401')) {
    return `API Key 无法通过验证：请确认 Key 属于 Google AI Studio，并且项目已启用 Gemini API。原始错误：${raw}`;
  }

  if (lower.includes('quota') || lower.includes('429')) {
    return `额度或频率限制：当前 API Key 可能达到限额，或本次上传图片过多导致并发请求太多。可以减少单次上传图片数后重试。原始错误：${raw}`;
  }

  if (lower.includes('imageconfig') || lower.includes('image size') || lower.includes('aspect')) {
    return `图片参数不被当前模型接受：请换一个比例/尺寸组合后重试。原始错误：${raw}`;
  }

  return raw;
}

function getImageDataFromResponse(response) {
  const candidates = response?.candidates || [];
  for (const candidate of candidates) {
    for (const part of candidate?.content?.parts || []) {
      if (part?.inlineData?.data) {
        return {
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png'
        };
      }
    }
  }
  throw new Error('Gemini returned no image data.');
}

function extensionForMime(mimeType) {
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/webp') return '.webp';
  return '.png';
}

function getTransientRetryDelay(attempt) {
  return Math.min(1500, 250 * (attempt + 1));
}

function isTransientError(error) {
  const raw = String(error?.message || error || '');
  const lower = raw.toLowerCase();
  return (
    lower.includes('fetch failed') ||
    lower.includes('network') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('temporarily unavailable') ||
    lower.includes('internal server error')
  );
}

export async function retryTransient(fn, { retries = 2, delayMs = 250 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isTransientError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs ? delayMs * (attempt + 1) : getTransientRetryDelay(attempt)));
    }
  }
  throw lastError;
}

export function outputNameForInput(originalName, mimeType = 'image/png') {
  const parsed = path.parse(originalName);
  return `${parsed.name}_gemini${extensionForMime(mimeType)}`;
}

function imagePartFromBytes({ mimeType, bytes }) {
  return {
    inlineData: {
      mimeType,
      data: bytes.toString('base64')
    }
  };
}

async function imagePartFromFile(file) {
  const bytes = await readFile(file.path || file.inputPath);
  return imagePartFromBytes({ mimeType: file.mimeType, bytes });
}

async function buildImagePromptParts({ prompt, inputPath, mimeType, referenceImages = [] }) {
  const mainBytes = await readFile(inputPath);
  const referenceParts = await Promise.all(referenceImages.map((file) => imagePartFromFile(file)));
  return [{ text: prompt }, imagePartFromBytes({ mimeType, bytes: mainBytes }), ...referenceParts];
}

export class GeminiClient {
  constructor({ apiKey, settings = {} }) {
    if (!apiKey) throw new Error('Missing Google API key.');
    this.ai = new GoogleGenAI(buildGeminiClientOptions({ apiKey, settings }));
  }

  async generateImageFromFile({ inputPath, mimeType, originalName, prompt, settings, outputDir, abortSignal, referenceImages = [] }) {
    const parts = await buildImagePromptParts({ prompt, inputPath, mimeType, referenceImages });
    let response;
    try {
      response = await retryTransient(
        () =>
          this.ai.models.generateContent({
            model: settings.model,
            contents: [
              {
                role: 'user',
                parts
              }
            ],
            config: {
              responseModalities: ['IMAGE'],
              temperature: settings.temperature,
              abortSignal,
              imageConfig: {
                aspectRatio: settings.aspectRatio,
                imageSize: settings.imageSize
              }
            }
          }),
        { retries: 2 }
      );
    } catch (error) {
      throw new Error(explainGeminiError(error));
    }

    const image = getImageDataFromResponse(response);
    const outputName = outputNameForInput(originalName, image.mimeType);
    const outputPath = path.join(outputDir, outputName);
    await writeFile(outputPath, Buffer.from(image.data, 'base64'));
    return { outputName, outputPath, mimeType: image.mimeType };
  }

  async createBatchJob({ job, files }) {
    const requests = [];
    const referenceImages = job.referenceImages || [];
    for (const item of job.items) {
      const parts = await buildImagePromptParts({
        prompt: job.prompt,
        inputPath: item.inputPath,
        mimeType: item.mimeType,
        referenceImages
      });
      requests.push({
        metadata: {
          itemId: item.id,
          originalName: item.originalName
        },
        contents: [
          {
            role: 'user',
            parts
          }
        ],
        config: {
          responseModalities: ['IMAGE'],
          temperature: job.settings.temperature,
          imageConfig: {
            aspectRatio: job.settings.aspectRatio,
            imageSize: job.settings.imageSize
          }
        }
      });
    }

    const jsonl = requests.map((request) => JSON.stringify(request)).join('\n');
    const jsonlPath = path.join(BATCH_DIR, `${job.id}.jsonl`);
    await writeFile(jsonlPath, jsonl);

    if (!this.ai.batches?.create) {
      throw new Error('当前 @google/genai SDK 没有暴露 Batch API 方法，请更新依赖后重试。');
    }

    let batch;
    try {
      batch = await retryTransient(
        () =>
          this.ai.batches.create({
            model: job.settings.model,
            src: { inlinedRequests: requests }
          }),
        { retries: 2 }
      );
    } catch (error) {
      throw new Error(explainGeminiError(error));
    }

    return {
      name: batch.name,
      state: batch.state || batch.metadata?.state || 'SUBMITTED',
      jsonlPath,
      files
    };
  }

  async getBatchJob(name) {
    if (!this.ai.batches?.get) {
      throw new Error('The installed @google/genai SDK does not expose Batch API status helpers in this environment.');
    }
    try {
      return await retryTransient(() => this.ai.batches.get({ name }), { retries: 2 });
    } catch (error) {
      const raw = error?.message || String(error);
      if (String(error?.status) === '404' || raw.includes('"code":404') || raw.includes('NOT_FOUND')) {
        throw new Error(`Batch 查询失败：Google 找不到这个 Batch 任务。它可能已经失效、被清理，或者提交时返回的任务不再可查。任务名：${name}。原始错误：${raw}`);
      }
      throw new Error(`Batch 查询失败：${explainGeminiError(error)}`);
    }
  }

  async saveBatchResponses({ batch, job, outputDir }) {
    const responses = batch?.dest?.inlinedResponses || batch?.destination?.inlinedResponses || [];
    const results = [];

    for (let index = 0; index < responses.length; index += 1) {
      const entry = responses[index];
      const item = job.items[index];
      if (!item) continue;
      if (entry.error) {
        results.push({
          itemId: item.id,
          status: 'failed',
          error: entry.error.message || JSON.stringify(entry.error)
        });
        continue;
      }

      try {
        const image = getImageDataFromResponse(entry.response);
        const outputName = outputNameForInput(item.originalName, image.mimeType);
        const outputPath = path.join(outputDir, outputName);
        await writeFile(outputPath, Buffer.from(image.data, 'base64'));
        results.push({
          itemId: item.id,
          status: 'succeeded',
          outputName,
          outputPath
        });
      } catch (error) {
        results.push({
          itemId: item.id,
          status: 'failed',
          error: explainGeminiError(error)
        });
      }
    }

    return results;
  }

  async testConnection(model) {
    try {
      const response = await this.ai.models.generateContent({
        model,
        contents: 'Reply with OK only.',
        config: {
          temperature: 0
        }
      });

      return {
        ok: true,
        model,
        message: response?.text || 'OK'
      };
    } catch (error) {
      return {
        ok: false,
        model,
        message: explainGeminiError(error)
      };
    }
  }

  async testBatchConnection(model) {
    try {
      const batch = await retryTransient(
        () =>
          this.ai.batches.create({
            model,
            src: [
              {
                contents: 'Reply with OK only.',
                config: { temperature: 0 }
              }
            ],
            config: { displayName: `batch-probe-${Date.now()}` }
          }),
        { retries: 2 }
      );
      const checked = await retryTransient(() => this.ai.batches.get({ name: batch.name }), { retries: 2 });
      return {
        ok: true,
        model,
        batchName: batch.name,
        state: checked.state || batch.state || 'UNKNOWN'
      };
    } catch (error) {
      return {
        ok: false,
        model,
        message: explainGeminiError(error)
      };
    }
  }
}
