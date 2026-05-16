import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { KEY_FILE_PATH } from './paths.js';

const memoryKeys = {
  official: process.env.GEMINI_API_KEY || '',
  openai: process.env.OPENAI_API_KEY || '',
  geminiProxy: process.env.GEMINI_PROXY_API_KEY || ''
};

function providerName(apiProvider = 'official') {
  if (apiProvider === 'openai') return 'openai';
  if (apiProvider === 'geminiProxy') return 'geminiProxy';
  return 'official';
}

function looksLikeRelayKey(apiKey = '') {
  return String(apiKey).trim().startsWith('sk-');
}

function emptyProfileStore() {
  return {
    schemaVersion: 2,
    profiles: {
      official: [],
      openai: [],
      geminiProxy: []
    }
  };
}

function defaultProfileName(provider) {
  if (provider === 'openai') return '默认 OpenAI Key';
  if (provider === 'geminiProxy') return '默认中转 Key';
  return '默认官方 Key';
}

function normalizeProfile(profile = {}, provider = 'official') {
  const now = new Date().toISOString();
  const id = String(profile.id || randomUUID());
  const name = String(profile.name || defaultProfileName(provider)).trim() || defaultProfileName(provider);
  const apiKey = String(profile.apiKey || '').trim();
  const normalized = {
    id,
    name,
    apiKey,
    createdAt: String(profile.createdAt || now),
    updatedAt: String(profile.updatedAt || profile.createdAt || now)
  };
  if (provider === 'geminiProxy') {
    normalized.apiBaseUrl = String(profile.apiBaseUrl || '').trim().replace(/\/+$/, '');
    normalized.apiVersion = String(profile.apiVersion || '').trim();
    normalized.apiHeaderName = String(profile.apiHeaderName || '').trim();
    normalized.apiHeaderValue = String(profile.apiHeaderValue || '').trim();
  }
  return normalized;
}

function metadataForProfile(profile, provider) {
  const metadata = {
    id: profile.id,
    name: profile.name,
    hasApiKey: Boolean(profile.apiKey),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  };
  if (provider === 'geminiProxy') {
    metadata.apiBaseUrl = profile.apiBaseUrl || '';
    metadata.apiVersion = profile.apiVersion || '';
    metadata.apiHeaderName = profile.apiHeaderName || '';
    metadata.apiHeaderValue = profile.apiHeaderValue || '';
  }
  return metadata;
}

function migrateLegacyKey(data, provider, store) {
  const apiKey = String(data?.[provider] || '').trim();
  if (!apiKey) return;
  store.profiles[provider].push(normalizeProfile({ id: `legacy-${provider}`, name: defaultProfileName(provider), apiKey }, provider));
}

function normalizeKeyStore(data = {}) {
  const store = emptyProfileStore();
  if (data?.schemaVersion === 2 && data.profiles) {
    for (const provider of Object.keys(store.profiles)) {
      store.profiles[provider] = Array.isArray(data.profiles[provider])
        ? data.profiles[provider].map((profile) => normalizeProfile(profile, provider)).filter((profile) => profile.apiKey)
        : [];
    }
    return store;
  }

  migrateLegacyKey(data, 'official', store);
  migrateLegacyKey(data, 'openai', store);
  migrateLegacyKey(data, 'geminiProxy', store);
  return store;
}

async function readKeyFile() {
  try {
    return normalizeKeyStore(JSON.parse(await readFile(KEY_FILE_PATH, 'utf8')));
  } catch {
    return emptyProfileStore();
  }
}

async function writeKeyFile(store) {
  await mkdir(path.dirname(KEY_FILE_PATH), { recursive: true });
  const tempPath = `${KEY_FILE_PATH}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  await rename(tempPath, KEY_FILE_PATH);
}

function firstProfileWithKey(store, provider) {
  return store.profiles[provider].find((profile) => profile.apiKey);
}

function findProfile(store, provider, profileId) {
  if (!profileId) return firstProfileWithKey(store, provider);
  return store.profiles[provider].find((profile) => profile.id === profileId);
}

async function readStoredApiKey(apiProvider = 'official', profileId = '') {
  const provider = providerName(apiProvider);
  const store = await readKeyFile();
  const profile = findProfile(store, provider, profileId);
  if (profileId) return profile?.apiKey || '';
  return profile?.apiKey || memoryKeys[provider] || '';
}

export async function saveApiKey(apiKey, apiProvider = 'official', options = {}) {
  if (!apiKey || apiKey.trim().length < 10) {
    throw new Error('Please enter a valid API key.');
  }
  const provider = providerName(apiProvider);
  const store = await readKeyFile();
  const profile = normalizeProfile({ ...options, apiKey }, provider);
  store.profiles[provider].push(profile);
  memoryKeys[provider] = profile.apiKey;
  await writeKeyFile(store);
  return { saved: true, profile: metadataForProfile(profile, provider) };
}

export async function getApiKey(apiProvider = 'official', profileId = '') {
  const provider = providerName(apiProvider);
  const apiKey = await readStoredApiKey(provider, profileId);

  if (provider === 'official') {
    return looksLikeRelayKey(apiKey) ? '' : apiKey;
  }

  if (provider === 'openai') return apiKey;

  if (apiKey) return apiKey;
  const legacyOfficialKey = await readStoredApiKey('official');
  return looksLikeRelayKey(legacyOfficialKey) ? legacyOfficialKey : '';
}

export async function getApiKeyProfile(apiProvider = 'official', profileId = '') {
  const provider = providerName(apiProvider);
  const store = await readKeyFile();
  const profile = findProfile(store, provider, profileId);
  if (!profile) return null;
  return metadataForProfile(profile, provider);
}

export async function getApiKeyProfiles() {
  const store = await readKeyFile();
  return {
    official: store.profiles.official.map((profile) => metadataForProfile(profile, 'official')),
    openai: store.profiles.openai.map((profile) => metadataForProfile(profile, 'openai')),
    geminiProxy: store.profiles.geminiProxy.map((profile) => metadataForProfile(profile, 'geminiProxy'))
  };
}

export async function deleteApiKeyProfile(apiProvider = 'official', profileId = '') {
  const provider = providerName(apiProvider);
  const store = await readKeyFile();
  const before = store.profiles[provider].length;
  store.profiles[provider] = store.profiles[provider].filter((profile) => profile.id !== profileId);
  const deleted = store.profiles[provider].length !== before;
  if (deleted) await writeKeyFile(store);
  return deleted;
}

export async function hasApiKey(apiProvider = 'official', profileId = '') {
  return Boolean(await getApiKey(apiProvider, profileId));
}

export async function getApiKeyStatus() {
  return {
    official: await hasApiKey('official'),
    openai: await hasApiKey('openai'),
    geminiProxy: await hasApiKey('geminiProxy')
  };
}
