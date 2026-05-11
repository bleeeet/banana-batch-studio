import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { JobStore } from '../../src/server/jobStore.js';

describe('JobStore', () => {
  it('creates a job and tracks each item status', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-job-store-'));
    const store = new JobStore(path.join(dir, 'jobs.sqlite'));

    const job = store.createJob({
      mode: 'realtime',
      prompt: 'make it cinematic',
      settings: { model: 'gemini-3-pro-image-preview' },
      files: [
        { originalName: 'a.png', storedName: 'a.png', mimeType: 'image/png', path: '/tmp/a.png' },
        { originalName: 'b.jpg', storedName: 'b.jpg', mimeType: 'image/jpeg', path: '/tmp/b.jpg' }
      ]
    });

    expect(job.status).toBe('queued');
    expect(job.items).toHaveLength(2);
    expect(job.items.map((item) => item.status)).toEqual(['queued', 'queued']);

    store.updateItem(job.items[0].id, {
      status: 'succeeded',
      outputPath: '/tmp/out.png',
      outputName: 'a_gemini.png'
    });
    const refreshed = store.getJob(job.id);
    expect(refreshed.items[0]).toMatchObject({
      status: 'succeeded',
      outputPath: '/tmp/out.png',
      outputName: 'a_gemini.png'
    });
  });

  it('persists jobs to a portable JSON file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-job-store-'));
    const storePath = path.join(dir, 'jobs.json');
    const store = new JobStore(storePath);
    const job = store.createJob({
      mode: 'realtime',
      prompt: 'keep this job',
      settings: { model: 'gemini-3-pro-image-preview' },
      files: [{ originalName: 'a.png', storedName: 'a.png', mimeType: 'image/png', path: '/tmp/a.png' }]
    });

    store.updateJob(job.id, { status: 'succeeded' });
    const raw = JSON.parse(await readFile(storePath, 'utf8'));
    const restored = new JobStore(storePath);

    expect(raw.version).toBe(1);
    expect(restored.getJob(job.id)).toMatchObject({
      id: job.id,
      status: 'succeeded',
      prompt: 'keep this job',
      items: [{ originalName: 'a.png', status: 'queued' }]
    });
  });

  it('deletes a job and its item records', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-job-store-'));
    const store = new JobStore(path.join(dir, 'jobs.sqlite'));

    const job = store.createJob({
      mode: 'realtime',
      prompt: 'remove this job',
      settings: { model: 'gemini-3-pro-image-preview' },
      files: [{ originalName: 'a.png', storedName: 'a.png', mimeType: 'image/png', path: '/tmp/a.png' }]
    });

    expect(store.deleteJob(job.id)).toBe(true);
    expect(store.getJob(job.id)).toBeNull();
    expect(store.getItems(job.id)).toEqual([]);
  });

  it('resets a single item for regeneration', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-job-store-'));
    const store = new JobStore(path.join(dir, 'jobs.sqlite'));
    const job = store.createJob({
      mode: 'realtime',
      prompt: 'try again',
      settings: { model: 'gemini-3-pro-image-preview' },
      files: [{ originalName: 'a.png', storedName: 'a.png', mimeType: 'image/png', path: '/tmp/a.png' }]
    });

    store.updateItem(job.items[0].id, {
      status: 'succeeded',
      outputPath: '/tmp/a_gemini.png',
      outputName: 'a_gemini.png'
    });

    const reset = store.resetItem(job.id, job.items[0].id);
    expect(reset.items[0]).toMatchObject({
      status: 'queued',
      outputPath: null,
      outputName: null,
      error: null
    });
  });

  it('prepares a single item for immediate regeneration', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-job-store-'));
    const store = new JobStore(path.join(dir, 'jobs.sqlite'));
    const job = store.createJob({
      mode: 'realtime',
      prompt: 'try again now',
      settings: { model: 'gemini-3-pro-image-preview' },
      files: [{ originalName: 'a.png', storedName: 'a.png', mimeType: 'image/png', path: '/tmp/a.png' }]
    });

    store.updateItem(job.items[0].id, {
      status: 'succeeded',
      outputPath: '/tmp/a_gemini.png',
      outputName: 'a_gemini.png'
    });

    const prepared = store.prepareItemForRerun(job.id, job.items[0].id);
    expect(prepared).toMatchObject({ status: 'running' });
    expect(prepared.items[0]).toMatchObject({
      status: 'running',
      outputPath: null,
      outputName: null,
      error: null
    });
  });
});
