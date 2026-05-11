import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function createEmptyState() {
  return { version: 1, jobs: [], items: [] };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class JobStore {
  constructor(dbPath) {
    this.dbPath = dbPath.endsWith('.json') ? dbPath : dbPath.replace(/\.sqlite(?:[.-].*)?$/, '.json');
    this.state = this.load();
  }

  load() {
    try {
      return JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
    } catch {
      return createEmptyState();
    }
  }

  persist() {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    const tempPath = `${this.dbPath}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(this.state, null, 2)}\n`);
    fs.renameSync(tempPath, this.dbPath);
  }

  createJob({ mode, prompt, settings, files }) {
    const now = new Date().toISOString();
    const jobId = randomUUID();
    this.state.jobs.push({
      id: jobId,
      mode,
      status: 'queued',
      prompt,
      settings: clone(settings),
      batchName: null,
      batchState: null,
      error: null,
      createdAt: now,
      updatedAt: now
    });
    for (const file of files) {
      this.state.items.push({
        id: randomUUID(),
        jobId,
        originalName: file.originalName,
        storedName: file.storedName,
        mimeType: file.mimeType,
        inputPath: file.path,
        status: 'queued',
        outputPath: null,
        outputName: null,
        error: null,
        createdAt: now,
        updatedAt: now
      });
    }
    this.persist();
    return this.getJob(jobId);
  }

  listJobs() {
    return this.state.jobs
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30)
      .map((job) => this.inflateJob(job, this.getItems(job.id)));
  }

  getJob(id) {
    const job = this.state.jobs.find((entry) => entry.id === id);
    if (!job) return null;
    return this.inflateJob(job, this.getItems(id));
  }

  getItems(jobId) {
    return this.state.items
      .filter((item) => item.jobId === jobId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((item) => clone(item));
  }

  updateJob(id, patch) {
    const job = this.state.jobs.find((entry) => entry.id === id);
    if (!job) return null;
    Object.assign(job, {
      ...patch,
      batchName: patch.batchName ?? job.batchName ?? null,
      batchState: patch.batchState ?? job.batchState ?? null,
      error: patch.error ?? job.error ?? null,
      updatedAt: new Date().toISOString()
    });
    this.persist();
    return this.getJob(id);
  }

  updateItem(id, patch) {
    const item = this.state.items.find((entry) => entry.id === id);
    if (!item) return null;
    Object.assign(item, {
      status: patch.status || item.status,
      outputPath: patch.outputPath ?? item.outputPath,
      outputName: patch.outputName ?? item.outputName,
      error: patch.error ?? item.error,
      updatedAt: new Date().toISOString()
    });
    this.persist();
    return { job_id: item.jobId };
  }

  resetFailedItems(jobId) {
    const now = new Date().toISOString();
    for (const item of this.state.items) {
      if (item.jobId === jobId && item.status === 'failed') {
        Object.assign(item, {
          status: 'queued',
          outputPath: null,
          outputName: null,
          error: null,
          updatedAt: now
        });
      }
    }
    this.persist();
    return this.getJob(jobId);
  }

  resetItem(jobId, itemId) {
    const item = this.state.items.find((entry) => entry.id === itemId && entry.jobId === jobId);
    if (!item) return null;
    Object.assign(item, {
      status: 'queued',
      outputPath: null,
      outputName: null,
      error: null,
      updatedAt: new Date().toISOString()
    });
    this.updateJob(jobId, { status: 'queued', error: null });
    return this.getJob(jobId);
  }

  prepareItemForRerun(jobId, itemId) {
    const item = this.state.items.find((entry) => entry.id === itemId && entry.jobId === jobId);
    if (!item) return null;
    Object.assign(item, {
      status: 'running',
      outputPath: null,
      outputName: null,
      error: null,
      updatedAt: new Date().toISOString()
    });
    this.updateJob(jobId, { status: 'running', error: null });
    return this.getJob(jobId);
  }

  deleteJob(jobId) {
    const exists = this.state.jobs.some((job) => job.id === jobId);
    if (!exists) return false;
    this.state.jobs = this.state.jobs.filter((job) => job.id !== jobId);
    this.state.items = this.state.items.filter((item) => item.jobId !== jobId);
    this.persist();
    return true;
  }

  inflateJob(job, items) {
    return {
      ...clone(job),
      items
    };
  }
}
