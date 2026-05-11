import { execFileSync } from 'node:child_process';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

function valueForKey(scutilOutput, key) {
  const match = new RegExp(`${key}\\s*:\\s*([^\\n]+)`).exec(scutilOutput);
  return match?.[1]?.trim() || '';
}

function enabledForKey(scutilOutput, key) {
  return valueForKey(scutilOutput, key) === '1';
}

export function systemProxyUrlFromScutil(scutilOutput = '') {
  if (enabledForKey(scutilOutput, 'HTTPSEnable')) {
    const host = valueForKey(scutilOutput, 'HTTPSProxy');
    const port = valueForKey(scutilOutput, 'HTTPSPort');
    if (host && port) return `http://${host}:${port}`;
  }

  if (enabledForKey(scutilOutput, 'HTTPEnable')) {
    const host = valueForKey(scutilOutput, 'HTTPProxy');
    const port = valueForKey(scutilOutput, 'HTTPPort');
    if (host && port) return `http://${host}:${port}`;
  }

  return '';
}

export function configureProxyFromEnv() {
  if (process.platform !== 'darwin') return { enabled: false, source: 'none' };

  let proxyUrl = '';
  try {
    proxyUrl = systemProxyUrlFromScutil(execFileSync('scutil', ['--proxy'], { encoding: 'utf8' }));
  } catch {
    return { enabled: false, source: 'macos-system', error: 'Unable to read macOS proxy settings.' };
  }

  if (!proxyUrl) return { enabled: false, source: 'macos-system' };

  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  return { enabled: true, proxyUrl, source: 'macos-system' };
}
