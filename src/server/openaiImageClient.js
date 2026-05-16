import { readFile, writeFile } from 'node:fs/promises';
import { Blob } from 'node:buffer';
import path from 'node:path';

function extensionForMime(mimeType) {
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/webp') return '.webp';
  return '.png';
}

export function outputNameForOpenAIInput(originalName, mimeType = 'image/png') {
  const parsed = path.parse(originalName);
  return `${parsed.name}_openai${extensionForMime(mimeType)}`;
}

function explainOpenAIError(error) {
  const raw = error?.message || String(error);
  const lower = raw.toLowerCase();
  if (lower.includes('api key') || lower.includes('unauthorized') || lower.includes('401')) {
    return `OpenAI API Key 无法通过验证：请确认 Key 可用于 OpenAI 原生 Images API。原始错误：${raw}`;
  }
  if (lower.includes('size') || lower.includes('model')) {
    return `OpenAI 图片参数不被当前模型接受：请检查模型和尺寸组合。原始错误：${raw}`;
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')) {
    return `OpenAI 额度或频率限制：当前 Key 可能达到限额，或并发请求过多。原始错误：${raw}`;
  }
  return raw;
}

async function appendImage(formData, fieldName, file) {
  const bytes = await readFile(file.path || file.inputPath);
  const blob = new Blob([bytes], { type: file.mimeType || 'image/png' });
  formData.append(fieldName, blob, file.originalName || path.basename(file.path || file.inputPath));
}

function imageFromOpenAIResponse(data) {
  const entry = data?.data?.[0];
  if (entry?.b64_json) {
    return { data: entry.b64_json, mimeType: 'image/png' };
  }
  throw new Error('OpenAI returned no image data.');
}

export class OpenAIImageClient {
  constructor({ apiKey, fetchImpl = fetch } = {}) {
    if (!apiKey) throw new Error('Missing OpenAI API key.');
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async testConnection(model) {
    const response = await this.fetchImpl('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${this.apiKey}` }
    });
    if (!response.ok) {
      const text = await response.text();
      return { ok: false, model, error: explainOpenAIError(new Error(text || `OpenAI test failed: ${response.status}`)) };
    }
    return { ok: true, model };
  }

  async testBatchConnection(model) {
    return { ok: false, model, error: 'OpenAI 原生 API 当前使用实时图片接口，不支持此应用里的 Gemini Batch 检测。' };
  }

  async generateImageFromFile({ inputPath, mimeType, originalName, prompt, settings, outputDir, referenceImages = [], abortSignal }) {
    const formData = new FormData();
    formData.set('model', settings.model);
    formData.set('prompt', prompt);
    formData.set('size', settings.imageSize || 'auto');
    await appendImage(formData, 'image', { inputPath, mimeType, originalName });
    for (const referenceImage of referenceImages) {
      await appendImage(formData, 'image', referenceImage);
    }

    let data;
    try {
      const response = await this.fetchImpl('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: formData,
        signal: abortSignal
      });
      const text = await response.text();
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`OpenAI 返回内容不是 JSON：${text.slice(0, 160)}`);
      }
      if (!response.ok) {
        throw new Error(data.error?.message || data.error || `OpenAI 图片生成失败：${response.status}`);
      }
    } catch (error) {
      throw new Error(explainOpenAIError(error));
    }

    const image = imageFromOpenAIResponse(data);
    const outputName = outputNameForOpenAIInput(originalName, image.mimeType);
    const outputPath = path.join(outputDir, outputName);
    await writeFile(outputPath, Buffer.from(image.data, 'base64'));
    return { outputName, outputPath, mimeType: image.mimeType };
  }

  async createBatchJob() {
    throw new Error('OpenAI 原生 API 当前使用实时图片接口，此应用暂不支持 OpenAI Batch 生图。');
  }
}
