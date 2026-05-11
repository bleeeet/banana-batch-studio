import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createJobZip } from '../../src/server/zip.js';

describe('createJobZip', () => {
  it('packages outputs, failures, and run config', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-zip-'));
    const outputPath = path.join(dir, 'first.png');
    await writeFile(outputPath, Buffer.from('fake-png'));

    const zipPath = await createJobZip({
      job: {
        id: 'job_123',
        mode: 'realtime',
        prompt: 'same prompt',
        settings: { model: 'gemini-3-pro-image-preview' },
        items: [
          { originalName: 'first.png', status: 'succeeded', outputPath, outputName: 'first_gemini.png' },
          { originalName: 'second.png', status: 'failed', error: 'quota exceeded' }
        ]
      },
      destinationDir: dir
    });

    const zipBytes = await readFile(zipPath);
    expect(zipBytes.length).toBeGreaterThan(100);
  });
});
