import { describe, expect, it } from 'vitest';
import { systemProxyUrlFromScutil } from '../../src/server/proxy.js';

describe('systemProxyUrlFromScutil', () => {
  it('uses the enabled macOS HTTPS proxy for outbound API requests', () => {
    expect(
      systemProxyUrlFromScutil(`<dictionary> {
  HTTPEnable : 1
  HTTPPort : 6152
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 6152
  HTTPSProxy : 127.0.0.1
}`)
    ).toBe('http://127.0.0.1:6152');
  });

  it('does not configure a proxy when macOS HTTP and HTTPS proxies are disabled', () => {
    expect(
      systemProxyUrlFromScutil(`<dictionary> {
  HTTPEnable : 0
  HTTPSEnable : 0
  SOCKSEnable : 1
  SOCKSPort : 6153
  SOCKSProxy : 127.0.0.1
}`)
    ).toBe('');
  });
});
