import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

describe('server paths', () => {
  it('stores runtime data inside the current app folder by default', async () => {
    vi.resetModules();
    const module = await import('../../src/server/paths.js');

    expect(module.APP_DATA_DIR).toBe(path.join(process.cwd(), 'app-data'));
    expect(module.KEY_FILE_PATH).toBe(path.join(process.cwd(), 'app-data', 'api-keys.json'));
  });

  it('allows a runtime data directory override', async () => {
    const previous = process.env.GEMINI_BATCH_STUDIO_DATA_DIR;
    process.env.GEMINI_BATCH_STUDIO_DATA_DIR = '/tmp/gemini-batch-studio-data';

    try {
      vi.resetModules();
      const module = await import('../../src/server/paths.js');
      expect(module.APP_DATA_DIR).toBe('/tmp/gemini-batch-studio-data');
      expect(module.UPLOAD_DIR).toBe(path.join('/tmp/gemini-batch-studio-data', 'uploads'));
    } finally {
      if (previous === undefined) {
        delete process.env.GEMINI_BATCH_STUDIO_DATA_DIR;
      } else {
        process.env.GEMINI_BATCH_STUDIO_DATA_DIR = previous;
      }
    }
  });
});
