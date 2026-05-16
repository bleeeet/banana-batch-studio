import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import { createJobZip } from '../../src/server/zip.js';

describe('createJobZip', () => {
  it('packages only successful output images at the zip root', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-zip-'));
    const outputPath = path.join(dir, 'first.png');
    const chineseOutputPath = path.join(dir, '中文商品图.png');
    await writeFile(outputPath, Buffer.from('fake-png'));
    await writeFile(chineseOutputPath, Buffer.from('fake-chinese-png'));

    const zipPath = await createJobZip({
      job: {
        id: 'job_123',
        mode: 'realtime',
        prompt: 'same prompt',
        settings: { model: 'gemini-3-pro-image-preview' },
        items: [
          { originalName: 'first.png', status: 'succeeded', outputPath, outputName: 'first_gemini.png' },
          { originalName: '中文商品图.png', status: 'succeeded', outputPath: chineseOutputPath, outputName: '中文商品图_gemini.png' },
          { originalName: 'second.png', status: 'failed', error: 'quota exceeded' }
        ]
      },
      destinationDir: dir
    });

    const zipBytes = await readFile(zipPath);
    expect(zipBytes.length).toBeGreaterThan(100);
    const entries = new AdmZip(zipBytes).getEntries().map((entry) => entry.entryName).sort();
    expect(entries).toEqual(['first_gemini.png', '中文商品图_gemini.png'].sort());
    expect(entries).not.toContain('outputs/first_gemini.png');
    expect(entries).not.toContain('failures.json');
    expect(entries).not.toContain('run-config.json');
  });

  it('keeps duplicate output names unique in the zip root', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-zip-dupes-'));
    const firstPath = path.join(dir, 'first.png');
    const secondPath = path.join(dir, 'second.png');
    await writeFile(firstPath, Buffer.from('first'));
    await writeFile(secondPath, Buffer.from('second'));

    const zipPath = await createJobZip({
      job: {
        id: 'job_456',
        items: [
          { originalName: 'a.png', status: 'succeeded', outputPath: firstPath, outputName: 'same_gemini.png' },
          { originalName: 'b.png', status: 'succeeded', outputPath: secondPath, outputName: 'same_gemini.png' }
        ]
      },
      destinationDir: dir
    });

    const entries = new AdmZip(await readFile(zipPath)).getEntries().map((entry) => entry.entryName).sort();
    expect(entries).toEqual(['same_gemini-2.png', 'same_gemini.png']);
  });
});
