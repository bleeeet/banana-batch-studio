import request from 'supertest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
        geminiProxy: expect.any(Boolean)
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

  it('returns 404 when deleting an unknown job', async () => {
    const app = await createApp();
    const response = await request(app).delete('/api/jobs/not-a-real-job').expect(404);
    expect(response.body.error).toMatch(/not found/i);
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
    vi.spyOn(keychain, 'saveApiKey').mockImplementation(async (apiKey, apiProvider) => {
      saved.push({ apiKey, apiProvider });
      return { saved: true };
    });

    try {
      const app = await createApp();
      await request(app).post('/api/settings/key').send({ apiKey: 'official-test-key', apiProvider: 'official' }).expect(200);
      await request(app).post('/api/settings/key').send({ apiKey: 'relay-test-key', apiProvider: 'geminiProxy' }).expect(200);

      expect(saved).toEqual([
        { apiKey: 'official-test-key', apiProvider: 'official' },
        { apiKey: 'relay-test-key', apiProvider: 'geminiProxy' }
      ]);
    } finally {
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
      files: [{ originalName: 'a.png', storedName: 'a.png', mimeType: 'image/png', path: '/tmp/a.png' }]
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
      outputDir: dir
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

  it('exports a selected job zip to the local Downloads folder for the packaged app', async () => {
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
        filename: `${job.id}-gemini-results.zip`
      });
      expect(response.body.path).toContain(path.join('Downloads', `${job.id}-gemini-results.zip`));
      expect((await readFile(response.body.path)).length).toBeGreaterThan(100);
    } finally {
      process.env.HOME = originalHome;
    }
  });
});
