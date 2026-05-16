import cors from 'cors';
import express from 'express';
import multer from 'multer';
import mime from 'mime-types';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { DB_PATH, OUTPUT_DIR, UPLOAD_DIR, ensureAppDirs } from './paths.js';
import { JobStore } from './jobStore.js';
import { deleteApiKeyProfile, getApiKey, getApiKeyProfiles, getApiKeyStatus, hasApiKey, saveApiKey } from './keychain.js';
import { GEMINI_IMAGE_MODELS, OPENAI_IMAGE_MODELS, isKnownApiProvider, isSupportedImage, normalizeGenerationSettings } from '../shared/settings.js';
import { refreshBatchJob, rerunSingleItem, startRealtimeJob, submitBatchJob } from './jobRunner.js';
import { fetchModelList, GeminiClient } from './geminiClient.js';
import { OpenAIImageClient } from './openaiImageClient.js';

const distDir = path.resolve(process.cwd(), 'dist');

function getDefaultSize(model) {
  if (OPENAI_IMAGE_MODELS.some((entry) => entry.id === model)) return 'auto';
  return model === 'gemini-3.1-flash-image-preview' ? '512' : '1K';
}

function safeName(name) {
  return name.replace(/[^\w.\-()\u4e00-\u9fff]+/g, '_');
}

function safeFolderPart(name) {
  return safeName(String(name || '未命名预设').trim()).replace(/^\.+$/, '_') || '未命名预设';
}

function normalizeUploadName(name) {
  const raw = String(name || '');
  if (/[\u4e00-\u9fff]/u.test(raw)) return raw;

  let current = raw;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const decoded = Buffer.from(current, 'latin1').toString('utf8');
    if (decoded === current || decoded.includes('\uFFFD')) break;
    if (/[\u4e00-\u9fff]/u.test(decoded)) return decoded;
    current = decoded;
  }
  return raw;
}

function fileRecord(file) {
  const originalName = normalizeUploadName(file.originalname);
  return {
    originalName,
    storedName: file.filename,
    mimeType: file.mimetype || mime.lookup(originalName) || 'application/octet-stream',
    path: file.path
  };
}

function uniqueFileName(name, usedNames, destinationDir) {
  const parsed = path.parse(safeName(name || 'gemini-image.png') || 'gemini-image.png');
  let candidate = `${parsed.name}${parsed.ext || '.png'}`;
  let index = 2;
  while (usedNames.has(candidate) || (destinationDir && existsSync(path.join(destinationDir, candidate)))) {
    candidate = `${parsed.name}-${index}${parsed.ext || '.png'}`;
    index += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

async function copySuccessfulItemToDir({ item, destinationDir, usedNames }) {
  if (item.status !== 'succeeded' || !item.outputPath || !existsSync(item.outputPath)) return null;
  await mkdir(destinationDir, { recursive: true });
  const filename = uniqueFileName(item.outputName || path.basename(item.outputPath), usedNames, destinationDir);
  const destinationPath = path.join(destinationDir, filename);
  await copyFile(item.outputPath, destinationPath);
  return { filename, path: destinationPath };
}

async function exportJobFolder({ job, downloadsDir }) {
  const successful = job.items.filter((item) => item.status === 'succeeded' && item.outputPath && existsSync(item.outputPath));
  const folderName = `任务-${safeFolderPart(job.presetName)}-${successful.length}`;
  const destinationDir = path.join(downloadsDir, folderName);
  const usedNames = new Set();
  const files = [];
  await mkdir(destinationDir, { recursive: true });
  for (const item of successful) {
    const copied = await copySuccessfulItemToDir({ item, destinationDir, usedNames });
    if (copied) files.push(copied);
  }
  return { folderName, path: destinationDir, count: files.length, files };
}

async function getRequestApiKey(req) {
  const requestKey = String(req.body?.apiKey || '').trim();
  const apiProvider = isKnownApiProvider(req.body?.apiProvider) ? req.body.apiProvider : 'official';
  const profileId = String(req.body?.apiKeyProfileId || '').trim();
  return requestKey || (await getApiKey(apiProvider, profileId));
}

function getRequestApiProvider(req) {
  return isKnownApiProvider(req.body?.apiProvider) ? req.body.apiProvider : 'official';
}

function createConnectionClient({ apiKey, settings }) {
  return settings.apiProvider === 'openai' ? new OpenAIImageClient({ apiKey }) : new GeminiClient({ apiKey, settings });
}

export async function createApp() {
  await ensureAppDirs();
  const store = new JobStore(DB_PATH);
  const app = express();

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${randomUUID()}-${safeName(normalizeUploadName(file.originalname))}`)
  });
  const upload = multer({
    storage,
    limits: { files: 1200, fileSize: 30 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      cb(null, isSupportedImage(file.originalname));
    }
  });
  const jobUpload = upload.fields([
    { name: 'images', maxCount: 1000 },
    { name: 'referenceImages', maxCount: 200 }
  ]);

  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  app.use('/outputs', express.static(OUTPUT_DIR));
  app.use(express.static(distDir));

  app.get('/api/local-image', async (req, res) => {
    try {
      const filePath = String(req.query?.path || '');
      if (!filePath) return res.status(400).json({ error: 'Image path is required.' });
      const bytes = await readFile(filePath);
      res.setHeader('Content-Type', mime.lookup(filePath) || 'application/octet-stream');
      res.send(bytes);
    } catch (error) {
      res.status(404).json({ error: error.message || String(error) });
    }
  });

  app.get('/api/health', async (_req, res) => {
    const apiKeys = await getApiKeyStatus();
    res.json({
      ok: true,
      hasApiKey: apiKeys.official || apiKeys.openai || apiKeys.geminiProxy,
      apiKeys,
      apiKeyProfiles: await getApiKeyProfiles(),
      projectDir: process.cwd()
    });
  });

  app.post('/api/settings/key', async (req, res) => {
    try {
      const apiProvider = getRequestApiProvider(req);
      const result = await saveApiKey(req.body?.apiKey, apiProvider, {
        name: req.body?.name,
        apiBaseUrl: req.body?.apiBaseUrl,
        apiVersion: req.body?.apiVersion,
        apiHeaderName: req.body?.apiHeaderName,
        apiHeaderValue: req.body?.apiHeaderValue
      });
      res.json({
        saved: true,
        hasApiKey: true,
        apiProvider,
        profile: result.profile,
        apiKeys: await getApiKeyStatus(),
        apiKeyProfiles: await getApiKeyProfiles()
      });
    } catch (error) {
      res.status(400).json({ error: error.message || String(error) });
    }
  });

  app.delete('/api/settings/key/:apiProvider/:profileId', async (req, res) => {
    try {
      const apiProvider = isKnownApiProvider(req.params.apiProvider) ? req.params.apiProvider : 'official';
      const deleted = await deleteApiKeyProfile(apiProvider, req.params.profileId);
      if (!deleted) return res.status(404).json({ error: 'API key profile not found.' });
      res.json({
        deleted: true,
        apiProvider,
        apiKeys: await getApiKeyStatus(),
        apiKeyProfiles: await getApiKeyProfiles()
      });
    } catch (error) {
      res.status(400).json({ error: error.message || String(error) });
    }
  });

  app.post('/api/settings/test', async (req, res) => {
    try {
      const apiKey = await getRequestApiKey(req);
      if (!apiKey) throw new Error('请先填写 API 密钥。');
      const apiProvider = getRequestApiProvider(req);
      const model = req.body?.model || (apiProvider === 'openai' ? OPENAI_IMAGE_MODELS[0].id : GEMINI_IMAGE_MODELS[0].id);
      const settings = normalizeGenerationSettings({ ...req.body, model, aspectRatio: '1:1', imageSize: getDefaultSize(model) });
      const client = createConnectionClient({ apiKey, settings });
      const result = await client.testConnection(model);
      res.status(result.ok ? 200 : 400).json(result);
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || String(error) });
    }
  });

  app.post('/api/settings/test-batch', async (req, res) => {
    try {
      const apiKey = await getRequestApiKey(req);
      if (!apiKey) throw new Error('请先填写 API 密钥。');
      const apiProvider = getRequestApiProvider(req);
      const model = req.body?.model || (apiProvider === 'openai' ? OPENAI_IMAGE_MODELS[0].id : GEMINI_IMAGE_MODELS[0].id);
      const settings = normalizeGenerationSettings({ ...req.body, model, aspectRatio: '1:1', imageSize: getDefaultSize(model) });
      const client = createConnectionClient({ apiKey, settings });
      const result = await client.testBatchConnection(model);
      res.status(result.ok ? 200 : 400).json(result);
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || String(error) });
    }
  });

  app.post('/api/settings/models', async (req, res) => {
    try {
      const apiKey = await getRequestApiKey(req);
      if (!apiKey) throw new Error('请先填写 API 密钥。');
      const apiProvider = getRequestApiProvider(req);
      if (apiProvider === 'openai') {
        return res.json({ models: OPENAI_IMAGE_MODELS });
      }
      const model = req.body?.model || GEMINI_IMAGE_MODELS[0].id;
      const settings = normalizeGenerationSettings({ ...req.body, model, aspectRatio: '1:1', imageSize: getDefaultSize(model) });
      const models = await fetchModelList({ apiKey, settings });
      res.json({ models });
    } catch (error) {
      res.status(400).json({ error: error.message || String(error) });
    }
  });

  app.get('/api/options', (_req, res) => {
    res.json({
      models: [
        { id: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image Preview' },
        { id: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image Preview' }
      ]
    });
  });

  app.get('/api/jobs', (_req, res) => {
    res.json({ jobs: store.listJobs() });
  });

  app.post('/api/presets/export', async (req, res) => {
    try {
      const content = String(req.body?.content || '');
      if (!content.trim()) throw new Error('预设内容为空。');
      JSON.parse(content);

      const downloadsDir = path.join(os.homedir(), 'Downloads');
      await mkdir(downloadsDir, { recursive: true });
      const filename = 'banana-batch-studio-presets.json';
      const presetPath = path.join(downloadsDir, filename);
      await writeFile(presetPath, content, 'utf8');
      res.json({ saved: true, filename, path: presetPath });
    } catch (error) {
      res.status(400).json({ error: error.message || String(error) });
    }
  });

  app.post('/api/jobs/realtime', jobUpload, async (req, res) => {
    try {
      const settings = normalizeGenerationSettings(JSON.parse(req.body.settings || '{}'));
      const imageFiles = req.files?.images || [];
      const referenceImageFiles = req.files?.referenceImages || [];
      if (!imageFiles.length) throw new Error('Please add at least one PNG, JPG, JPEG, or WEBP image.');
      if (!(await hasApiKey(settings.apiProvider, settings.apiKeyProfileId))) throw new Error('请先保存当前 API 通道的密钥。');
      const prompt = req.body.prompt?.trim();
      if (!prompt) throw new Error('Please enter the shared prompt.');
      const presetName = String(req.body.presetName || '未命名预设').trim() || '未命名预设';
      const files = imageFiles.map(fileRecord);
      const referenceFiles = referenceImageFiles.map(fileRecord);
      const job = store.createJob({ mode: 'realtime', prompt, settings, files, referenceFiles, presetName });
      await startRealtimeJob({ store, jobId: job.id });
      res.status(201).json({ job: store.getJob(job.id) });
    } catch (error) {
      res.status(400).json({ error: error.message || String(error) });
    }
  });

  app.post('/api/jobs/batch', jobUpload, async (req, res) => {
    try {
      const settings = normalizeGenerationSettings(JSON.parse(req.body.settings || '{}'));
      const imageFiles = req.files?.images || [];
      const referenceImageFiles = req.files?.referenceImages || [];
      if (!imageFiles.length) throw new Error('Please add at least one PNG, JPG, JPEG, or WEBP image.');
      if (!(await hasApiKey(settings.apiProvider, settings.apiKeyProfileId))) throw new Error('请先保存当前 API 通道的密钥。');
      const prompt = req.body.prompt?.trim();
      if (!prompt) throw new Error('Please enter the shared prompt.');
      const presetName = String(req.body.presetName || '未命名预设').trim() || '未命名预设';
      const files = imageFiles.map(fileRecord);
      const referenceFiles = referenceImageFiles.map(fileRecord);
      const job = store.createJob({ mode: 'batch', prompt, settings, files, referenceFiles, presetName });
      await submitBatchJob({ store, jobId: job.id });
      res.status(201).json({ job: store.getJob(job.id) });
    } catch (error) {
      res.status(400).json({ error: error.message || String(error) });
    }
  });

  app.get('/api/jobs/:id', async (req, res) => {
    const job = store.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    if (job.mode === 'batch' && job.batchName) {
      try {
        return res.json({ job: await refreshBatchJob({ store, jobId: job.id }) });
      } catch (error) {
        return res.json({
          job: store.updateJob(job.id, {
            status: 'failed',
            error: error.message || String(error)
          })
        });
      }
    }
    return res.json({ job });
  });

  app.delete('/api/jobs/:id', (req, res) => {
    const deleted = store.deleteJob(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Job not found.' });
    res.json({ deleted: true });
  });

  app.patch('/api/jobs/:id/prompt', (req, res) => {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) return res.status(400).json({ error: 'Please enter the shared prompt.' });
    const job = store.updateJobPrompt(req.params.id, prompt);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    res.json({ job });
  });

  app.post('/api/jobs/:id/rebuild', async (req, res) => {
    try {
      const sourceJob = store.getJob(req.params.id);
      if (!sourceJob) return res.status(404).json({ error: 'Job not found.' });
      if (!(await hasApiKey(sourceJob.settings?.apiProvider, sourceJob.settings?.apiKeyProfileId))) return res.status(400).json({ error: '请先保存当前 API 通道的密钥。' });
      const files = sourceJob.items.map((item) => ({
        originalName: item.originalName,
        storedName: item.storedName,
        mimeType: item.mimeType,
        path: item.inputPath
      }));
      if (!files.length) return res.status(400).json({ error: 'This job has no source images to rebuild.' });
      const referenceFiles = (sourceJob.referenceImages || []).map((file) => ({
        originalName: file.originalName,
        storedName: file.storedName,
        mimeType: file.mimeType,
        path: file.path
      }));
      const job = store.createJob({
        mode: sourceJob.mode,
        prompt: sourceJob.prompt,
        settings: sourceJob.settings,
        files,
        referenceFiles,
        presetName: sourceJob.presetName
      });
      if (job.mode === 'batch') {
        await submitBatchJob({ store, jobId: job.id });
      } else {
        await startRealtimeJob({ store, jobId: job.id });
      }
      res.status(201).json({ job: store.getJob(job.id), sourceJob: store.getJob(sourceJob.id) });
    } catch (error) {
      res.status(500).json({ error: error.message || String(error) });
    }
  });

  app.post('/api/jobs/:id/retry', async (req, res) => {
    const job = store.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    if (job.mode !== 'realtime') return res.status(400).json({ error: 'Retry is available for realtime jobs.' });
    store.resetFailedItems(job.id);
    await startRealtimeJob({ store, jobId: job.id });
    res.json({ job: store.getJob(job.id) });
  });

  app.post('/api/jobs/:jobId/items/:itemId/rerun', async (req, res) => {
    try {
      const job = store.getJob(req.params.jobId);
      if (!job) return res.status(404).json({ error: 'Job not found.' });
      if (!(await hasApiKey(job.settings?.apiProvider, job.settings?.apiKeyProfileId))) return res.status(400).json({ error: '请先保存当前 API 通道的密钥。' });
      const item = job.items.find((entry) => entry.id === req.params.itemId);
      if (!item) return res.status(404).json({ error: 'Item not found.' });
      const updated = await rerunSingleItem({ store, jobId: job.id, itemId: item.id });
      res.json({ job: updated });
    } catch (error) {
      res.status(500).json({ error: error.message || String(error) });
    }
  });

  app.post('/api/jobs/:id/export', async (req, res) => {
    try {
      const job = store.getJob(req.params.id);
      if (!job) return res.status(404).json({ error: 'Job not found.' });
      const downloadsDir = path.join(os.homedir(), 'Downloads');
      await mkdir(downloadsDir, { recursive: true });
      const exported = await exportJobFolder({ job, downloadsDir });
      res.json({ saved: true, folderName: exported.folderName, path: exported.path, count: exported.count, files: exported.files });
    } catch (error) {
      res.status(500).json({ error: error.message || String(error) });
    }
  });

  app.post('/api/jobs/:jobId/items/:itemId/export', async (req, res) => {
    try {
      const job = store.getJob(req.params.jobId);
      if (!job) return res.status(404).json({ error: 'Job not found.' });
      const item = job.items.find((entry) => entry.id === req.params.itemId);
      if (!item) return res.status(404).json({ error: 'Item not found.' });
      if (item.status !== 'succeeded' || !item.outputPath || !existsSync(item.outputPath)) {
        return res.status(400).json({ error: 'This image is not ready for download.' });
      }
      const downloadsDir = path.join(os.homedir(), 'Downloads');
      const copied = await copySuccessfulItemToDir({ item, destinationDir: downloadsDir, usedNames: new Set() });
      res.json({ saved: true, filename: copied.filename, path: copied.path });
    } catch (error) {
      res.status(500).json({ error: error.message || String(error) });
    }
  });

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });

  return app;
}
