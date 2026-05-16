import request from 'supertest';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { DB_PATH } from '../../src/server/paths.js';
import * as keychain from '../../src/server/keychain.js';
import { getRealtimeConcurrency, getRealtimeStartDelayMs, runSingleItemNow, runStaggered } from '../../src/server/jobRunner.js';
import { JobStore } from '../../src/server/jobStore.js';

describe('API', () => {
  it('reports health without exposing secrets', async () => {
    const app = await createApp();
    const response = await request(app).get('/api/health').expect(200);

    expect(response.body).toEqual({
      ok: true,
      hasApiKey: expect.any(Boolean),
      apiKeys: {
        official: expect.any(Boolean),
        openai: expect.any(Boolean),
        geminiProxy: expect.any(Boolean)
      },
      apiKeyProfiles: {
        official: expect.any(Array),
        openai: expect.any(Array),
        geminiProxy: expect.any(Array)
      },
      projectDir: process.cwd()
    });
    expect(JSON.stringify(response.body)).not.toMatch(/AIza/);
  });

  it('rejects jobs when no supported image is uploaded', async () => {
    const app = await createApp();
    const response = await request(app)
      .post('/api/jobs/realtime')
      .field('prompt', 'make it crisp')
      .field('settings', JSON.stringify({ model: 'gemini-3-pro-image-preview', aspectRatio: '1:1', imageSize: '1K' }))
      .expect(400);

    expect(response.body.error).toMatch(/png|jpg|webp/i);
  });

  it('stores reference images at the job level without increasing realtime item count', async () => {
    vi.spyOn(keychain, 'hasApiKey').mockResolvedValue(true);
    vi.spyOn(keychain, 'getApiKey').mockResolvedValue('');

    try {
      const app = await createApp();
      const response = await request(app)
        .post('/api/jobs/realtime')
        .field('prompt', 'use these references')
        .field('settings', JSON.stringify({ model: 'gemini-3-pro-image-preview', aspectRatio: '1:1', imageSize: '1K' }))
        .attach('images', Buffer.from('main-a'), 'main-a.png')
        .attach('images', Buffer.from('main-b'), 'main-b.png')
        .attach('referenceImages', Buffer.from('ref-a'), 'ref-a.png')
        .attach('referenceImages', Buffer.from('ref-b'), 'ref-b.png')
        .expect(201);

      expect(response.body.job.items).toHaveLength(2);
      expect(response.body.job.referenceImages).toEqual([
        expect.objectContaining({ originalName: 'ref-a.png', mimeType: 'image/png' }),
        expect.objectContaining({ originalName: 'ref-b.png', mimeType: 'image/png' })
      ]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('stores the selected preset name when creating a realtime job', async () => {
    vi.spyOn(keychain, 'hasApiKey').mockResolvedValue(true);
    vi.spyOn(keychain, 'getApiKey').mockResolvedValue('');

    try {
      const app = await createApp();
      const response = await request(app)
        .post('/api/jobs/realtime')
        .field('prompt', 'make it crisp')
        .field('presetName', '白底商品图')
        .field('settings', JSON.stringify({ model: 'gemini-3-pro-image-preview', aspectRatio: '1:1', imageSize: '1K' }))
        .attach('images', Buffer.from('main'), 'main.png')
        .expect(201);

      expect(response.body.job).toMatchObject({
        presetName: '白底商品图',
        prompt: 'make it crisp'
      });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('restores mojibake upload filenames to UTF-8 Chinese names', async () => {
    vi.spyOn(keychain, 'hasApiKey').mockResolvedValue(true);
    vi.spyOn(keychain, 'getApiKey').mockResolvedValue('');
    const mojibakeName = Buffer.from('中文商品图126.jpg', 'utf8').toString('latin1');

    try {
      const app = await createApp();
      const response = await request(app)
        .post('/api/jobs/realtime')
        .field('prompt', 'make it clean')
        .field('settings', JSON.stringify({ model: 'gemini-3-pro-image-preview', aspectRatio: '1:1', imageSize: '1K' }))
        .attach('images', Buffer.from('main'), mojibakeName)
        .expect(201);

      expect(response.body.job.items[0]).toMatchObject({
        originalName: '中文商品图126.jpg',
        mimeType: 'image/jpeg'
      });
      expect(response.body.job.items[0].storedName).toContain('中文商品图126.jpg');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('returns 404 when deleting an unknown job', async () => {
    const app = await createApp();
    const response = await request(app).delete('/api/jobs/not-a-real-job').expect(404);
    expect(response.body.error).toMatch(/not found/i);
  });

  it('exports presets directly to the local Downloads folder', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'preset-export-'));
    const originalHome = process.env.HOME;
    process.env.HOME = dir;
    try {
      const app = await createApp();
      const content = JSON.stringify({
        schemaVersion: 1,
        app: 'Banana Batch Studio',
        presets: [{ name: '预设一', mode: 'realtime', prompt: '', settings: { model: 'gemini-3-pro-image-preview' } }]
      });
      const response = await request(app).post('/api/presets/export').send({ content }).expect(200);

      expect(response.body).toEqual({
        saved: true,
        filename: 'banana-batch-studio-presets.json',
        path: path.join(dir, 'Downloads', 'banana-batch-studio-presets.json')
      });
      expect(await readFile(response.body.path, 'utf8')).toBe(content);
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it('fetches relay models without exposing the saved API key', async () => {
    vi.spyOn(keychain, 'getApiKey').mockResolvedValue('secret-key');
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ models: [{ name: 'models/gemini-3-pro-image-preview' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    try {
      const app = await createApp();
      const response = await request(app)
        .post('/api/settings/models')
        .send({
          model: 'gemini-3-pro-image-preview',
          aspectRatio: '1:1',
          imageSize: '1K',
          apiProvider: 'geminiProxy',
          apiBaseUrl: 'https://relay.example.com',
          apiVersion: 'v1beta'
        })
        .expect(200);

      expect(response.body).toEqual({
        models: [{ id: 'gemini-3-pro-image-preview', label: 'gemini-3-pro-image-preview' }]
      });
      expect(JSON.stringify(response.body)).not.toMatch(/secret-key/);
    } finally {
      global.fetch = originalFetch;
      vi.restoreAllMocks();
    }
  });

  it('prefers a request API key when testing relay settings', async () => {
    vi.spyOn(keychain, 'getApiKey').mockResolvedValue('saved-key');
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    const app = await createApp();
    try {
      const response = await request(app)
        .post('/api/settings/test')
        .send({
          apiKey: 'relay-request-test-key',
          model: 'gemini-3-pro-image-preview',
          apiProvider: 'geminiProxy',
          apiBaseUrl: 'https://relay.example.com'
        })
        .expect(200);

      expect(response.body.model).toBe('gemini-3-pro-image-preview');
    } finally {
      global.fetch = originalFetch;
      vi.restoreAllMocks();
    }
  });

  it('stores official and relay API keys separately', async () => {
    const saved = [];
    vi.spyOn(keychain, 'saveApiKey').mockImplementation(async (apiKey, apiProvider, options) => {
      saved.push({ apiKey, apiProvider, options });
      return { saved: true, profile: { id: `${apiProvider}-1`, name: options.name, hasApiKey: true } };
    });
    vi.spyOn(keychain, 'getApiKeyStatus').mockResolvedValue({ official: true, openai: false, geminiProxy: true });
    vi.spyOn(keychain, 'getApiKeyProfiles').mockResolvedValue({ official: [], openai: [], geminiProxy: [] });

    try {
      const app = await createApp();
      await request(app).post('/api/settings/key').send({ apiKey: 'official-test-key', apiProvider: 'official', name: '官方一' }).expect(200);
      await request(app)
        .post('/api/settings/key')
        .send({
          apiKey: 'relay-test-key',
          apiProvider: 'geminiProxy',
          name: '中转一',
          apiBaseUrl: 'https://relay.example.com'
        })
        .expect(200);

      expect(saved).toEqual([
        { apiKey: 'official-test-key', apiProvider: 'official', options: expect.objectContaining({ name: '官方一' }) },
        {
          apiKey: 'relay-test-key',
          apiProvider: 'geminiProxy',
          options: expect.objectContaining({ name: '中转一', apiBaseUrl: 'https://relay.example.com' })
        }
      ]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('deletes a saved key profile through the settings API', async () => {
    vi.spyOn(keychain, 'deleteApiKeyProfile').mockResolvedValue(true);
    vi.spyOn(keychain, 'getApiKeyStatus').mockResolvedValue({ official: false, openai: false, geminiProxy: false });
    vi.spyOn(keychain, 'getApiKeyProfiles').mockResolvedValue({ official: [], openai: [], geminiProxy: [] });

    try {
      const app = await createApp();
      const response = await request(app).delete('/api/settings/key/geminiProxy/profile-1').expect(200);

      expect(keychain.deleteApiKeyProfile).toHaveBeenCalledWith('geminiProxy', 'profile-1');
      expect(response.body).toMatchObject({ deleted: true });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('uses the selected saved key profile when testing relay settings', async () => {
    vi.spyOn(keychain, 'getApiKey').mockImplementation(async (apiProvider, profileId) => (apiProvider === 'geminiProxy' && profileId === 'relay-profile-1' ? 'selected-relay-key' : ''));
    const originalFetch = global.fetch;
    const calls = [];
    global.fetch = vi.fn(async (url, options) => {
      calls.push({ url, headers: options.headers });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    try {
      const app = await createApp();
      await request(app)
        .post('/api/settings/test')
        .send({
          apiKeyProfileId: 'relay-profile-1',
          model: 'gemini-3-pro-image-preview',
          apiProvider: 'geminiProxy',
          apiBaseUrl: 'https://relay.example.com'
        })
        .expect(200);

      expect(keychain.getApiKey).toHaveBeenCalledWith('geminiProxy', 'relay-profile-1');
      expect(calls[0].url).toContain('relay.example.com');
    } finally {
      global.fetch = originalFetch;
      vi.restoreAllMocks();
    }
  });

  it('does not use a saved relay key for official API checks', async () => {
    vi.spyOn(keychain, 'getApiKey').mockImplementation(async (apiProvider) => (apiProvider === 'geminiProxy' ? 'relay-test-key' : ''));

    try {
      const app = await createApp();
      const response = await request(app)
        .post('/api/settings/test')
        .send({
          model: 'gemini-3-pro-image-preview',
          apiProvider: 'official'
        })
        .expect(400);

      expect(response.body.error).toMatch(/API 密钥/);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('uses uploaded image count for realtime concurrency and caps it at the configured maximum', async () => {
    expect(
      getRealtimeConcurrency({
        settings: { maxConcurrency: 10 },
        items: Array.from({ length: 30 }, () => ({ status: 'queued' }))
      })
    ).toBe(10);
    expect(
      getRealtimeConcurrency({
        settings: { maxConcurrency: 10 },
        items: Array.from({ length: 6 }, () => ({ status: 'queued' }))
      })
    ).toBe(6);
    expect(
      getRealtimeConcurrency({
        settings: { maxConcurrency: 3 },
        items: Array.from({ length: 6 }, () => ({ status: 'queued' }))
      })
    ).toBe(3);
  });

  it('reads the configured request start delay', async () => {
    expect(getRealtimeStartDelayMs({ settings: {} })).toBe(0);
    expect(getRealtimeStartDelayMs({ settings: { requestStartDelayMs: 1500 } })).toBe(1500);
  });

  it('starts parallel work immediately when no launch delay is configured', async () => {
    const sleepCalls = [];

    await runStaggered({
      items: ['a', 'b', 'c'],
      concurrency: 3,
      delayMs: 0,
      sleep: async (ms) => sleepCalls.push(ms),
      worker: async () => {}
    });

    expect(sleepCalls).toEqual([0, 0, 0]);
  });

  it('stagger-starts parallel work without exceeding concurrency', async () => {
    let running = 0;
    let maxRunning = 0;
    const sleepCalls = [];

    await runStaggered({
      items: ['a', 'b', 'c'],
      concurrency: 2,
      delayMs: 1000,
      sleep: async (ms) => sleepCalls.push(ms),
      worker: async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        running -= 1;
      }
    });

    expect(maxRunning).toBeLessThanOrEqual(2);
    expect(sleepCalls).toEqual([0, 1000, 1000]);
  });

  it('regenerates one item immediately with its original prompt and settings', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-rerun-item-'));
    const store = new JobStore(DB_PATH);
    const job = store.createJob({
      mode: 'realtime',
      prompt: 'make it sharper',
      settings: {
        model: 'gemini-3-pro-image-preview',
        aspectRatio: '1:1',
        imageSize: '1K',
        temperature: 1,
        concurrency: 10,
        requestStartDelayMs: 1000
      },
      files: [{ originalName: 'a.png', storedName: 'a.png', mimeType: 'image/png', path: '/tmp/a.png' }],
      referenceFiles: [{ originalName: 'ref.png', storedName: 'ref.png', mimeType: 'image/png', path: '/tmp/ref.png' }]
    });
    const item = job.items[0];
    const calls = [];

    await runSingleItemNow({
      store,
      job,
      item,
      outputDir: dir,
      client: {
        async generateImageFromFile(input) {
          calls.push(input);
          return { outputPath: path.join(dir, 'a_new.png'), outputName: 'a_new.png' };
        }
      }
    });

    const updated = store.getJob(job.id);
    expect(calls[0]).toMatchObject({
      inputPath: '/tmp/a.png',
      mimeType: 'image/png',
      originalName: 'a.png',
      prompt: 'make it sharper',
      settings: job.settings,
      outputDir: dir,
      referenceImages: [{ originalName: 'ref.png', storedName: 'ref.png', mimeType: 'image/png', path: '/tmp/ref.png' }]
    });
    expect(updated.items[0]).toMatchObject({
      status: 'succeeded',
      outputName: 'a_new.png'
    });
  });

  it('interrupts an in-flight item generation and keeps only the restarted result', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-rerun-interrupt-'));
    const store = new JobStore(path.join(dir, 'jobs.sqlite'));
    const job = store.createJob({
      mode: 'realtime',
      prompt: 'make it sharper',
      settings: {
        model: 'gemini-3-pro-image-preview',
        aspectRatio: '1:1',
        imageSize: '1K',
        temperature: 1,
        concurrency: 10,
        requestStartDelayMs: 1000
      },
      files: [{ originalName: 'a.png', storedName: 'a.png', mimeType: 'image/png', path: '/tmp/a.png' }]
    });
    const item = job.items[0];
    const calls = [];
    let resolveSecond;

    const client = {
      async generateImageFromFile(input) {
        calls.push(input);
        if (calls.length === 1) {
          return new Promise((resolve, reject) => {
            input.abortSignal.addEventListener('abort', () => reject(new Error('aborted')));
          });
        }
        return new Promise((resolve) => {
          resolveSecond = () => resolve({ outputPath: path.join(dir, 'latest.png'), outputName: 'latest.png' });
        });
      }
    };

    const first = runSingleItemNow({ store, job, item, outputDir: dir, client });
    const second = runSingleItemNow({ store, job, item, outputDir: dir, client });
    resolveSecond();
    await Promise.all([first, second]);

    expect(calls).toHaveLength(2);
    expect(calls[0].abortSignal.aborted).toBe(true);
    expect(store.getJob(job.id).items[0]).toMatchObject({
      status: 'succeeded',
      outputName: 'latest.png',
      error: null
    });
  });

  it('returns an immediately running item after a rerun request', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-rerun-return-'));
    const store = new JobStore(path.join(dir, 'jobs.sqlite'));
    const job = store.createJob({
      mode: 'realtime',
      prompt: 'make it sharper',
      settings: {
        model: 'gemini-3-pro-image-preview',
        aspectRatio: '1:1',
        imageSize: '1K',
        temperature: 1,
        concurrency: 10,
        requestStartDelayMs: 1000
      },
      files: [{ originalName: 'a.png', storedName: 'a.png', mimeType: 'image/png', path: '/tmp/a.png' }]
    });
    const item = job.items[0];
    store.updateItem(item.id, {
      status: 'succeeded',
      outputPath: '/tmp/old.png',
      outputName: 'old.png'
    });

    const updated = store.prepareItemForRerun(job.id, item.id);

    expect(updated.items[0]).toMatchObject({
      status: 'running',
      outputPath: null,
      outputName: null,
      error: null
    });
  });

  it('updates a job prompt without changing item statuses', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-update-prompt-'));
    const store = new JobStore(DB_PATH);
    const job = store.createJob({
      mode: 'realtime',
      prompt: 'old prompt',
      settings: { model: 'gemini-3-pro-image-preview', aspectRatio: '1:1', imageSize: '1K', temperature: 1 },
      files: [{ originalName: 'a.png', storedName: 'a.png', mimeType: 'image/png', path: path.join(dir, 'a.png') }]
    });
    store.updateItem(job.items[0].id, {
      status: 'failed',
      error: 'quota'
    });
    const app = await createApp();

    const response = await request(app).patch(`/api/jobs/${job.id}/prompt`).send({ prompt: 'new prompt' }).expect(200);

    expect(response.body.job).toMatchObject({ id: job.id, prompt: 'new prompt' });
    expect(response.body.job.items[0]).toMatchObject({ status: 'failed', error: 'quota' });
  });

  it('rebuilds a job as a new task with the saved prompt and original inputs', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-rebuild-job-'));
    const sourcePath = path.join(dir, 'source.png');
    const referencePath = path.join(dir, 'ref.png');
    await writeFile(sourcePath, 'source');
    await writeFile(referencePath, 'ref');
    vi.spyOn(keychain, 'hasApiKey').mockResolvedValue(true);
    vi.spyOn(keychain, 'getApiKey').mockResolvedValue('');

    try {
      const store = new JobStore(DB_PATH);
      const original = store.createJob({
        mode: 'realtime',
        prompt: 'updated prompt',
        presetName: '预设名字',
        settings: { model: 'gemini-3-pro-image-preview', aspectRatio: '3:4', imageSize: '1K', temperature: 0.7 },
        files: [{ originalName: 'source.png', storedName: 'source.png', mimeType: 'image/png', path: sourcePath }],
        referenceFiles: [{ originalName: 'ref.png', storedName: 'ref.png', mimeType: 'image/png', path: referencePath }]
      });
      store.updateItem(original.items[0].id, {
        status: 'succeeded',
        outputPath: path.join(dir, 'old-output.png'),
        outputName: 'old-output.png'
      });
      const app = await createApp();

      const response = await request(app).post(`/api/jobs/${original.id}/rebuild`).expect(201);

      expect(response.body.job.id).not.toBe(original.id);
      expect(response.body.job).toMatchObject({
        mode: 'realtime',
        prompt: 'updated prompt',
        presetName: '预设名字',
        settings: { aspectRatio: '3:4', temperature: 0.7 },
        referenceImages: [{ originalName: 'ref.png', path: referencePath }]
      });
      expect(response.body.job.items[0]).toMatchObject({
        originalName: 'source.png',
        inputPath: sourcePath,
        status: 'queued'
      });
      expect(response.body.sourceJob.items[0]).toMatchObject({
        status: 'succeeded',
        outputName: 'old-output.png'
      });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('exports one generated image directly to the local Downloads folder', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-export-item-'));
    const originalHome = process.env.HOME;
    process.env.HOME = dir;
    try {
      const store = new JobStore(DB_PATH);
      const outputPath = path.join(dir, 'result.png');
      await writeFile(outputPath, 'png-bytes');
      const job = store.createJob({
        mode: 'realtime',
        prompt: 'make it clean',
        settings: {
          model: 'gemini-3-pro-image-preview',
          aspectRatio: '1:1',
          imageSize: '1K',
          temperature: 1
        },
        files: [{ originalName: 'a.png', storedName: 'a.png', mimeType: 'image/png', path: '/tmp/a.png' }]
      });
      store.updateItem(job.items[0].id, {
        status: 'succeeded',
        outputPath,
        outputName: 'result.png'
      });

      const app = await createApp();
      const response = await request(app).post(`/api/jobs/${job.id}/items/${job.items[0].id}/export`).expect(200);

      expect(response.body).toMatchObject({
        saved: true,
        filename: 'result.png',
        path: path.join(dir, 'Downloads', 'result.png')
      });
      expect(await readFile(response.body.path, 'utf8')).toBe('png-bytes');
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it('exports a selected job folder to the local Downloads folder for the packaged app', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-export-job-'));
    const originalHome = process.env.HOME;
    process.env.HOME = dir;
    try {
      const store = new JobStore(DB_PATH);
      const outputPath = path.join(dir, 'result.png');
      await writeFile(outputPath, 'png-bytes');
      const job = store.createJob({
        mode: 'realtime',
        prompt: 'make it clean',
        presetName: '预设名字',
        settings: {
          model: 'gemini-3-pro-image-preview',
          aspectRatio: '1:1',
          imageSize: '1K',
          temperature: 1
        },
        files: [{ originalName: 'a.png', storedName: 'a.png', mimeType: 'image/png', path: '/tmp/a.png' }]
      });
      store.updateItem(job.items[0].id, {
        status: 'succeeded',
        outputPath,
        outputName: 'result.png'
      });

      const app = await createApp();
      const response = await request(app).post(`/api/jobs/${job.id}/export`).expect(200);

      expect(response.body).toMatchObject({
        saved: true,
        folderName: '任务-预设名字-1',
        count: 1
      });
      expect(response.body.path).toBe(path.join(dir, 'Downloads', '任务-预设名字-1'));
      expect(await readdir(response.body.path)).toEqual(['result.png']);
      expect(await readFile(path.join(response.body.path, 'result.png'), 'utf8')).toBe('png-bytes');
    } finally {
      process.env.HOME = originalHome;
    }
  });
});
