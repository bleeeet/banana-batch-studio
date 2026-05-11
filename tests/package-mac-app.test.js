import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('Mac app packaging', () => {
  it('packages Banana Batch Studio as the visible app name', async () => {
    const script = await readFile(path.join(repoRoot, 'scripts/package-mac-app.js'), 'utf8');

    expect(script).toContain("const appName = 'Banana Batch Studio.app'");
    expect(script).toContain('<string>Banana Batch Studio</string>');
    expect(script).toContain('window.title = "Banana Batch Studio"');
  });

  it('keeps the native window draggable and enables standard edit actions for paste', async () => {
    const script = await readFile(path.join(repoRoot, 'scripts/package-mac-app.js'), 'utf8');

    expect(script).toContain('window.isMovableByWindowBackground = true');
    expect(script).toContain('setFrameAutosaveName("Banana Batch Studio Main Window")');
    expect(script).toContain('action: #selector(NSText.paste(_:))');
    expect(script).toContain('action: #selector(NSText.copy(_:))');
    expect(script).toContain('action: #selector(NSText.selectAll(_:))');
  });

  it('bundles the Banana app icon for Finder and Dock', async () => {
    const script = await readFile(path.join(repoRoot, 'scripts/package-mac-app.js'), 'utf8');

    expect(script).toContain('src/client/assets/banana-batch-studio-logo.png');
    expect(script).toContain('BananaBatchStudio.icns');
    expect(script).toContain('<key>CFBundleIconFile</key>');
    expect(script).toContain('<string>BananaBatchStudio</string>');
  });
});
