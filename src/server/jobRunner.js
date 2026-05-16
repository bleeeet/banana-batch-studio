import pLimit from 'p-limit';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { GeminiClient } from './geminiClient.js';
import { OpenAIImageClient } from './openaiImageClient.js';
import { getApiKey } from './keychain.js';
import { OUTPUT_DIR } from './paths.js';
import { DEFAULT_REALTIME_CONCURRENCY, DEFAULT_REQUEST_START_DELAY_MS, MAX_REALTIME_CONCURRENCY } from '../shared/settings.js';

const activeRealtimeJobs = new Set();
const activeItemRuns = new Map();

function summarizeJob(store, jobId) {
  const job = store.getJob(jobId);
  const failed = job.items.filter((item) => item.status === 'failed').length;
  const succeeded = job.items.filter((item) => item.status === 'succeeded').length;
  const running = job.items.filter((item) => item.status === 'running').length;
  const queued = job.items.filter((item) => item.status === 'queued').length;
  if (running > 0 || queued > 0) return 'running';
  if (succeeded > 0 && failed > 0) return 'completed_with_errors';
  if (failed > 0) return 'failed';
  return 'completed';
}

export function getRealtimeConcurrency(job) {
  const itemCount = job.items.filter((item) => item.status === 'queued').length || job.items.length || 1;
  const requested = Number(job.settings?.maxConcurrency);
  const maxConcurrency = Number.isFinite(requested)
    ? Math.max(1, Math.min(Math.round(requested), MAX_REALTIME_CONCURRENCY))
    : DEFAULT_REALTIME_CONCURRENCY;
  return Math.max(1, Math.min(maxConcurrency, itemCount));
}

export function getRealtimeStartDelayMs(job) {
  const requested = Number(job.settings?.requestStartDelayMs);
  return Number.isFinite(requested) && requested >= 0 ? Math.round(requested) : DEFAULT_REQUEST_START_DELAY_MS;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createImageClient({ apiKey, settings }) {
  return settings?.apiProvider === 'openai' ? new OpenAIImageClient({ apiKey }) : new GeminiClient({ apiKey, settings });
}

function beginItemRun(itemId) {
  activeItemRuns.get(itemId)?.controller.abort();
  const runId = randomUUID();
  const controller = new AbortController();
  activeItemRuns.set(itemId, { runId, controller });
  return { runId, abortSignal: controller.signal };
}

function isCurrentItemRun(itemId, runId) {
  return activeItemRuns.get(itemId)?.runId === runId;
}

function finishItemRun(itemId, runId) {
  if (isCurrentItemRun(itemId, runId)) activeItemRuns.delete(itemId);
}

export async function runStaggered({ items, concurrency, delayMs, worker, sleep: wait = sleep }) {
  const limit = pLimit(concurrency);
  let hasStarted = false;
  let launchQueue = Promise.resolve();

  async function waitForLaunchTurn() {
    const waitMs = hasStarted ? delayMs : 0;
    hasStarted = true;
    const turn = launchQueue.then(() => wait(waitMs));
    launchQueue = turn.catch(() => {});
    await turn;
  }

  await Promise.all(
    items.map((item) =>
      limit(async () => {
        await waitForLaunchTurn();
        return worker(item);
      })
    )
  );
}

export async function runSingleItemNow({ store, job, item, client, outputDir }) {
  const { runId, abortSignal } = beginItemRun(item.id);
  store.updateJob(job.id, { status: 'running', error: null });
  store.updateItem(item.id, { status: 'running', error: null });
  try {
    const result = await client.generateImageFromFile({
      inputPath: item.inputPath,
      mimeType: item.mimeType,
      originalName: item.originalName,
      prompt: job.prompt,
      settings: job.settings,
      outputDir,
      abortSignal,
      referenceImages: job.referenceImages || []
    });
    if (!isCurrentItemRun(item.id, runId)) return;
    store.updateItem(item.id, {
      status: 'succeeded',
      outputPath: result.outputPath,
      outputName: result.outputName,
      error: null
    });
  } catch (error) {
    if (!isCurrentItemRun(item.id, runId)) return;
    store.updateItem(item.id, {
      status: 'failed',
      error: error.message || String(error)
    });
  } finally {
    if (isCurrentItemRun(item.id, runId)) {
      finishItemRun(item.id, runId);
      store.updateJob(job.id, { status: summarizeJob(store, job.id) });
    }
  }
}

export async function startRealtimeJob({ store, jobId }) {
  if (activeRealtimeJobs.has(jobId)) return;
  activeRealtimeJobs.add(jobId);

  queueMicrotask(async () => {
    try {
      store.updateJob(jobId, { status: 'running' });
      const jobOutputDir = path.join(OUTPUT_DIR, jobId);
      await mkdir(jobOutputDir, { recursive: true });

      while (true) {
        const job = store.getJob(jobId);
        const apiKey = await getApiKey(job.settings?.apiProvider, job.settings?.apiKeyProfileId);
        const client = createImageClient({ apiKey, settings: job.settings });
        const queuedItems = job.items.filter((item) => item.status === 'queued');
        if (!queuedItems.length) break;

        await runStaggered({
          items: queuedItems,
          concurrency: getRealtimeConcurrency(job),
          delayMs: getRealtimeStartDelayMs(job),
          worker: async (item) => {
            const latestJob = store.getJob(jobId);
            const latestItem = latestJob.items.find((entry) => entry.id === item.id);
            if (latestItem?.status !== 'queued') return;
            await runSingleItemNow({ store, job: latestJob, item: latestItem, client, outputDir: jobOutputDir });
          }
        });
      }
      store.updateJob(jobId, { status: summarizeJob(store, jobId) });
    } catch (error) {
      const message = error.message || String(error);
      const job = store.getJob(jobId);
      for (const item of job?.items || []) {
        if (item.status === 'queued' || item.status === 'running') {
          store.updateItem(item.id, { status: 'failed', error: message });
        }
      }
      store.updateJob(jobId, { status: 'failed', error: message });
    } finally {
      activeRealtimeJobs.delete(jobId);
    }
  });
}

export async function submitBatchJob({ store, jobId }) {
  const job = store.getJob(jobId);
  store.updateJob(jobId, { status: 'submitting_batch' });
  const apiKey = await getApiKey(job.settings?.apiProvider, job.settings?.apiKeyProfileId);
  const client = createImageClient({ apiKey, settings: job.settings });
  try {
    const batch = await client.createBatchJob({ job });
    store.updateJob(jobId, {
      status: 'batch_submitted',
      batchName: batch.name,
      batchState: batch.state
    });
  } catch (error) {
    store.updateJob(jobId, { status: 'failed', error: error.message || String(error) });
    throw error;
  }
}

export async function refreshBatchJob({ store, jobId }) {
  const job = store.getJob(jobId);
  if (!job?.batchName) return job;
  const apiKey = await getApiKey(job.settings?.apiProvider, job.settings?.apiKeyProfileId);
  const client = createImageClient({ apiKey, settings: job.settings });
  const batch = await client.getBatchJob(job.batchName);
  const state = batch.state || batch.metadata?.state || job.batchState;

  if (state === 'JOB_STATE_SUCCEEDED' || state === 'SUCCEEDED') {
    const jobOutputDir = path.join(OUTPUT_DIR, jobId);
    await mkdir(jobOutputDir, { recursive: true });
    const results = await client.saveBatchResponses({ batch, job, outputDir: jobOutputDir });
    for (const result of results) {
      store.updateItem(result.itemId, result);
    }
    return store.updateJob(jobId, {
      batchState: state,
      status: summarizeJob(store, jobId)
    });
  }

  if (String(state).includes('FAILED') || String(state).includes('CANCELLED')) {
    return store.updateJob(jobId, {
      batchState: state,
      status: 'failed',
      error: batch.error?.message || `Batch job ended with state ${state}`
    });
  }

  return store.updateJob(jobId, {
    batchState: state,
    status: 'batch_submitted'
  });
}

export async function rerunSingleItem({ store, jobId, itemId }) {
  const preparedJob = store.prepareItemForRerun(jobId, itemId);
  if (!preparedJob) return null;

  queueMicrotask(async () => {
    try {
      const jobOutputDir = path.join(OUTPUT_DIR, jobId);
      await mkdir(jobOutputDir, { recursive: true });
      const job = store.getJob(jobId);
      const apiKey = await getApiKey(job.settings?.apiProvider, job.settings?.apiKeyProfileId);
      const client = createImageClient({ apiKey, settings: job.settings });
      const item = job.items.find((entry) => entry.id === itemId);
      await runSingleItemNow({ store, job, item, client, outputDir: jobOutputDir });
    } catch (error) {
      const message = error.message || String(error);
      store.updateItem(itemId, { status: 'failed', error: message });
      store.updateJob(jobId, { status: summarizeJob(store, jobId), error: message });
    }
  });

  return store.getJob(jobId);
}
