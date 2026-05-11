import cors from 'cors';
import express from 'express';
import multer from 'multer';
import mime from 'mime-types';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { createJobZip } from './zip.js';
import { DB_PATH, OUTPUT_DIR, UPLOAD_DIR, ZIP_DIR, ensureAppDirs } from './paths.js';
import { JobStore } from './jobStore.js';
import { getApiKey, getApiKeyStatus, hasApiKey, saveApiKey } from './keychain.js';
import { GEMINI_IMAGE_MODELS, isSupportedImage, normalizeGenerationSettings } from '../shared/settings.js';
import { refreshBatchJob, rerunSingleItem, startRealtimeJob, submitBatchJob } from './jobRunner.js';
import { fetchModelList, GeminiClient } from './geminiClient.js';

const distDir = path.resolve(process.cwd(), 'dist');

function getDefaultSize(model) {
  return model === 'gemini-3.1-flash-image-preview' ? '512' : '1K';
}

function safeName(name) {
  return name.replace(/[^\w.\-()\u4e00-\u9fff]+/g, '_');
}

async function getRequestApiKey(req) {
  const requestKey = String(req.body?.apiKey || '').trim();
  const apiProvider = req.body?.apiProvider === 'geminiProxy' ? 'geminiProxy' : 'official';
  return requestKey || (await getApiKey(apiProvider));
}

export async function createApp() {
  await ensureAppDirs();
  const store = new JobStore(DB_PATH);
  const app = express();

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${randomUUID()}-${safeName(file.originalname)}`)
  });
  const upload = multer({
    storage,
    limits: { files: 1000, fileSize: 30 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      cb(null, isSupportedImage(file.originalname));
    }
  });

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use('/outputs', express.static(OUTPUT_DIR));
  app.use(express.static(distDir));

  app.get('/api/health', async (_req, res) => {
    const apiKeys = await getApiKeyStatus();
    res.json({ ok: true, hasApiKey: apiKeys.official || apiKeys.geminiProxy, apiKeys, projectDir: process.cwd() });
  });

  app.post('/api/settings/key', async (req, res) => {
    try {
      const apiProvider = req.body?.apiProvider === 'geminiProxy' ? 'geminiProxy' : 'official';
      await saveApiKey(req.body?.apiKey, apiProvider);
      res.json({ saved: true, hasApiKey: true, apiProvider, apiKeys: await getApiKeyStatus() });
    } catch (error) {
      res.status(400).json({ error: error.message || String(error) });
    }
  });

  app.post('/api/settings/test', async (req, res) => {
    try {
      const apiKey = await getRequestApiKey(req);
      if (!apiKey) throw new Error('请先填写 API 密钥。');
      const model = req.body?.model || GEMINI_IMAGE_MODELS[0].id;
      const settings = normalizeGenerationSettings({ ...req.body, model, aspectRatio: '1:1', imageSize: getDefaultSize(model) });
      const client = new GeminiClient({ apiKey, settings });
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
      const model = req.body?.model || GEMINI_IMAGE_MODELS[0].id;
      const settings = normalizeGenerationSettings({ ...req.body, model, aspectRatio: '1:1', imageSize: getDefaultSize(model) });
      const client = new GeminiClient({ apiKey, settings });
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

  app.post('/api/jobs/realtime', upload.array('images'), async (req, res) => {
    try {
      const settings = normalizeGenerationSettings(JSON.parse(req.body.settings || '{}'));
      if (!req.files?.length) throw new Error('Please add at least one PNG, JPG, JPEG, or WEBP image.');
      if (!(await hasApiKey(settings.apiProvider))) throw new Error('请先保存当前 API 通道的密钥。');
      const prompt = req.body.prompt?.trim();
      if (!prompt) throw new Error('Please enter the shared prompt.');
      const files = req.files.map((file) => ({
        originalName: file.originalname,
        storedName: file.filename,
        mimeType: file.mimetype || mime.lookup(file.originalname) || 'application/octet-stream',
        path: file.path
      }));
      const job = store.createJob({ mode: 'realtime', prompt, settings, files });
      await startRealtimeJob({ store, jobId: job.id });
      res.status(201).json({ job: store.getJob(job.id) });
    } catch (error) {
      res.status(400).json({ error: error.message || String(error) });
    }
  });

  app.post('/api/jobs/batch', upload.array('images'), async (req, res) => {
    try {
      const settings = normalizeGenerationSettings(JSON.parse(req.body.settings || '{}'));
      if (!req.files?.length) throw new Error('Please add at least one PNG, JPG, JPEG, or WEBP image.');
      if (!(await hasApiKey(settings.apiProvider))) throw new Error('请先保存当前 API 通道的密钥。');
      const prompt = req.body.prompt?.trim();
      if (!prompt) throw new Error('Please enter the shared prompt.');
      const files = req.files.map((file) => ({
        originalName: file.originalname,
        storedName: file.filename,
        mimeType: file.mimetype || mime.lookup(file.originalname) || 'application/octet-stream',
        path: file.path
      }));
      const job = store.createJob({ mode: 'batch', prompt, settings, files });
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
      if (!(await hasApiKey(job.settings?.apiProvider))) return res.status(400).json({ error: '请先保存当前 API 通道的密钥。' });
      const item = job.items.find((entry) => entry.id === req.params.itemId);
      if (!item) return res.status(404).json({ error: 'Item not found.' });
      const updated = await rerunSingleItem({ store, jobId: job.id, itemId: item.id });
      res.json({ job: updated });
    } catch (error) {
      res.status(500).json({ error: error.message || String(error) });
    }
  });

  app.get('/api/jobs/:id/download', async (req, res) => {
    try {
      const job = store.getJob(req.params.id);
      if (!job) return res.status(404).json({ error: 'Job not found.' });
      const zipPath = await createJobZip({ job, destinationDir: ZIP_DIR });
      const bytes = await readFile(zipPath);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${job.id}-gemini-results.zip"`);
      res.send(bytes);
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
      const filename = `${job.id}-gemini-results.zip`;
      const zipPath = await createJobZip({ job, destinationDir: downloadsDir, fileName: filename });
      res.json({ saved: true, filename, path: zipPath });
    } catch (error) {
      res.status(500).json({ error: error.message || String(error) });
    }
  });

  app.get('/api/jobs/:jobId/items/:itemId/download', async (req, res) => {
    try {
      const job = store.getJob(req.params.jobId);
      if (!job) return res.status(404).json({ error: 'Job not found.' });
      const item = job.items.find((entry) => entry.id === req.params.itemId);
      if (!item) return res.status(404).json({ error: 'Item not found.' });
      if (item.status !== 'succeeded' || !item.outputPath) {
        return res.status(400).json({ error: 'This image is not ready for download.' });
      }
      const bytes = await readFile(item.outputPath);
      res.setHeader('Content-Type', item.outputName?.endsWith('.webp') ? 'image/webp' : item.outputName?.endsWith('.jpg') ? 'image/jpeg' : 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="${item.outputName || 'gemini-image.png'}"`);
      res.send(bytes);
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
