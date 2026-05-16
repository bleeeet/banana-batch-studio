import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
    await keychain.saveApiKey('openai-test-key', 'openai');
    await keychain.saveApiKey('relay-test-key', 'geminiProxy');

    const raw = await readFile(keyFile, 'utf8');
    const stored = JSON.parse(raw);
    expect(stored.schemaVersion).toBe(2);
    expect(stored.profiles.official).toEqual([expect.objectContaining({ apiKey: 'official-test-key', name: '默认官方 Key' })]);
    expect(stored.profiles.openai).toEqual([expect.objectContaining({ apiKey: 'openai-test-key', name: '默认 OpenAI Key' })]);
    expect(stored.profiles.geminiProxy).toEqual([expect.objectContaining({ apiKey: 'relay-test-key', name: '默认中转 Key' })]);
    expect(raw).toContain('official-test-key');
    expect(raw).toContain('openai-test-key');
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
      openai: false,
      geminiProxy: false
    });
  });

  it('treats a legacy sk key in the official slot as relay-only', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-keys-'));
    const keyFile = path.join(dir, 'app-data', 'api-keys.json');
    const keychain = await loadKeychain(keyFile);

    await keychain.saveApiKey('sk-legacy-relay-test-key', 'official');

    expect(await keychain.getApiKey('official')).toBe('');
    expect(await keychain.getApiKey('geminiProxy')).toBe('sk-legacy-relay-test-key');
    expect(await keychain.getApiKeyStatus()).toEqual({
      official: false,
      openai: false,
      geminiProxy: true
    });
  });

  it('stores OpenAI native API keys separately from Gemini relay keys', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-keys-'));
    const keyFile = path.join(dir, 'app-data', 'api-keys.json');
    const keychain = await loadKeychain(keyFile);

    await keychain.saveApiKey('sk-openai-native-test-key', 'openai');
    await keychain.saveApiKey('sk-compatible-relay-test-key', 'geminiProxy');

    expect(await keychain.getApiKey('openai')).toBe('sk-openai-native-test-key');
    expect(await keychain.getApiKey('geminiProxy')).toBe('sk-compatible-relay-test-key');
    expect(await keychain.getApiKeyStatus()).toMatchObject({
      openai: true,
      geminiProxy: true
    });
  });

  it('saves multiple named profiles for the same provider including duplicate names', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-keys-'));
    const keyFile = path.join(dir, 'app-data', 'api-keys.json');
    const keychain = await loadKeychain(keyFile);

    const first = await keychain.saveApiKey('official-test-key-one', 'official', { name: '主力 Key' });
    const second = await keychain.saveApiKey('official-test-key-two', 'official', { name: '主力 Key' });

    const raw = JSON.parse(await readFile(keyFile, 'utf8'));
    expect(raw.schemaVersion).toBe(2);
    expect(raw.profiles.official).toHaveLength(2);
    expect(raw.profiles.official.map((profile) => profile.name)).toEqual(['主力 Key', '主力 Key']);
    expect(first.profile.id).not.toBe(second.profile.id);
    expect(await keychain.getApiKey('official', first.profile.id)).toBe('official-test-key-one');
    expect(await keychain.getApiKey('official', second.profile.id)).toBe('official-test-key-two');
  });

  it('stores relay API address together with the named relay profile', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-keys-'));
    const keyFile = path.join(dir, 'app-data', 'api-keys.json');
    const keychain = await loadKeychain(keyFile);

    const saved = await keychain.saveApiKey('relay-test-key', 'geminiProxy', {
      name: '中转一',
      apiBaseUrl: ' https://relay.example.com/ ',
      apiVersion: 'v1beta',
      apiHeaderName: 'X-Relay-Key',
      apiHeaderValue: 'header-secret'
    });

    expect(saved.profile).toMatchObject({
      name: '中转一',
      apiBaseUrl: 'https://relay.example.com',
      apiVersion: 'v1beta',
      apiHeaderName: 'X-Relay-Key',
      apiHeaderValue: 'header-secret'
    });
    expect(await keychain.getApiKey('geminiProxy', saved.profile.id)).toBe('relay-test-key');
    expect(await keychain.getApiKeyProfile('geminiProxy', saved.profile.id)).toMatchObject({
      id: saved.profile.id,
      name: '中转一',
      apiBaseUrl: 'https://relay.example.com'
    });
  });

  it('returns profile metadata without exposing raw API keys', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-keys-'));
    const keyFile = path.join(dir, 'app-data', 'api-keys.json');
    const keychain = await loadKeychain(keyFile);

    await keychain.saveApiKey('official-secret-test-key', 'official', { name: '官方一' });
    await keychain.saveApiKey('relay-secret-test-key', 'geminiProxy', { name: '中转一', apiBaseUrl: 'https://relay.example.com' });

    const profiles = await keychain.getApiKeyProfiles();
    expect(profiles.official[0]).toMatchObject({ name: '官方一', hasApiKey: true });
    expect(profiles.geminiProxy[0]).toMatchObject({ name: '中转一', hasApiKey: true, apiBaseUrl: 'https://relay.example.com' });
    expect(JSON.stringify(profiles)).not.toMatch(/secret-test-key/);
  });

  it('deletes only the requested profile', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-keys-'));
    const keyFile = path.join(dir, 'app-data', 'api-keys.json');
    const keychain = await loadKeychain(keyFile);

    const first = await keychain.saveApiKey('official-test-key-one', 'official', { name: '一' });
    const second = await keychain.saveApiKey('official-test-key-two', 'official', { name: '二' });

    expect(await keychain.deleteApiKeyProfile('official', first.profile.id)).toBe(true);

    expect(await keychain.getApiKey('official', first.profile.id)).toBe('');
    expect(await keychain.getApiKey('official', second.profile.id)).toBe('official-test-key-two');
    expect((await keychain.getApiKeyProfiles()).official).toEqual([
      expect.objectContaining({ id: second.profile.id, name: '二' })
    ]);
  });

  it('migrates legacy single-key JSON into default named profiles', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'gemini-keys-'));
    const keyFile = path.join(dir, 'app-data', 'api-keys.json');
    await mkdir(path.dirname(keyFile), { recursive: true });
    await writeFile(
      keyFile,
      JSON.stringify({
        official: 'AIzaSyLegacyOfficialTestKey1234567890',
        openai: 'sk-legacy-openai-key',
        geminiProxy: 'sk-legacy-relay-key'
      }),
      'utf8'
    );
    const keychain = await loadKeychain(keyFile);

    const profiles = await keychain.getApiKeyProfiles();

    expect(profiles.official).toEqual([expect.objectContaining({ name: '默认官方 Key', hasApiKey: true })]);
    expect(profiles.openai).toEqual([expect.objectContaining({ name: '默认 OpenAI Key', hasApiKey: true })]);
    expect(profiles.geminiProxy).toEqual([expect.objectContaining({ name: '默认中转 Key', hasApiKey: true })]);
    expect(await keychain.getApiKey('official', profiles.official[0].id)).toBe('AIzaSyLegacyOfficialTestKey1234567890');
    expect(await keychain.getApiKey('geminiProxy', profiles.geminiProxy[0].id)).toBe('sk-legacy-relay-key');
  });
});
