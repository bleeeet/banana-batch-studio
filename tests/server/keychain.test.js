import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

async function loadKeychain(keyFile) {
  process.env.GEMINI_BATCH_STUDIO_KEY_FILE = keyFile;
  vi.resetModules();
  return import('../../src/server/keychain.js');
}

describe('API key storage', () => {
  it('stores API keys as plain JSON in the configured app file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-keys-'));
    const keyFile = path.join(dir, 'app-data', 'api-keys.json');
    const keychain = await loadKeychain(keyFile);

    await keychain.saveApiKey('official-test-key', 'official');
    await keychain.saveApiKey('relay-test-key', 'geminiProxy');

    const raw = await readFile(keyFile, 'utf8');
    expect(JSON.parse(raw)).toEqual({
      official: 'official-test-key',
      geminiProxy: 'relay-test-key'
    });
    expect(raw).toContain('official-test-key');
    expect(raw).toContain('relay-test-key');
  });

  it('loads saved keys after the module is reloaded', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-keys-'));
    const keyFile = path.join(dir, 'app-data', 'api-keys.json');
    let keychain = await loadKeychain(keyFile);

    await keychain.saveApiKey('AIza-persisted-key', 'official');
    keychain = await loadKeychain(keyFile);

    expect(await keychain.getApiKey('official')).toBe('AIza-persisted-key');
    expect(await keychain.getApiKeyStatus()).toEqual({
      official: true,
      geminiProxy: false
    });
  });

  it('treats a legacy sk key in the official slot as relay-only', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-keys-'));
    const keyFile = path.join(dir, 'app-data', 'api-keys.json');
    const keychain = await loadKeychain(keyFile);

    await keychain.saveApiKey('legacy-relay-test-key', 'official');

    expect(await keychain.getApiKey('official')).toBe('');
    expect(await keychain.getApiKey('geminiProxy')).toBe('legacy-relay-test-key');
    expect(await keychain.getApiKeyStatus()).toEqual({
      official: false,
      geminiProxy: true
    });
  });
});
