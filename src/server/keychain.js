import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { KEY_FILE_PATH } from './paths.js';

const memoryKeys = {
  official: process.env.GEMINI_API_KEY || '',
  geminiProxy: process.env.GEMINI_PROXY_API_KEY || ''
};

function providerName(apiProvider = 'official') {
  return apiProvider === 'geminiProxy' ? 'geminiProxy' : 'official';
}

function looksLikeRelayKey(apiKey = '') {
  return String(apiKey).trim().startsWith('sk-');
}

async function readKeyFile() {
  try {
    const data = JSON.parse(await readFile(KEY_FILE_PATH, 'utf8'));
    return {
      official: String(data.official || ''),
      geminiProxy: String(data.geminiProxy || '')
    };
  } catch {
    return { official: '', geminiProxy: '' };
  }
}

async function writeKeyFile(keys) {
  await mkdir(path.dirname(KEY_FILE_PATH), { recursive: true });
  const tempPath = `${KEY_FILE_PATH}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(keys, null, 2)}\n`, 'utf8');
  await rename(tempPath, KEY_FILE_PATH);
}

async function readStoredApiKey(apiProvider = 'official') {
  const provider = providerName(apiProvider);
  const fileKeys = await readKeyFile();
  return fileKeys[provider] || memoryKeys[provider] || '';
}

export async function saveApiKey(apiKey, apiProvider = 'official') {
  if (!apiKey || apiKey.trim().length < 10) {
    throw new Error('Please enter a valid API key.');
  }
  const provider = providerName(apiProvider);
  const keys = await readKeyFile();
  keys[provider] = apiKey.trim();
  memoryKeys[provider] = keys[provider];
  await writeKeyFile(keys);
  return { saved: true };
}

export async function getApiKey(apiProvider = 'official') {
  const provider = providerName(apiProvider);
  const apiKey = await readStoredApiKey(provider);

  if (provider === 'official') {
    return looksLikeRelayKey(apiKey) ? '' : apiKey;
  }

  if (apiKey) return apiKey;
  const legacyOfficialKey = await readStoredApiKey('official');
  return looksLikeRelayKey(legacyOfficialKey) ? legacyOfficialKey : '';
}

export async function hasApiKey(apiProvider = 'official') {
  return Boolean(await getApiKey(apiProvider));
}

export async function getApiKeyStatus() {
  return {
    official: await hasApiKey('official'),
    geminiProxy: await hasApiKey('geminiProxy')
  };
}
