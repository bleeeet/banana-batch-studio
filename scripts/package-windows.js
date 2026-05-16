import { execFile } from 'node:child_process';
import { chmod, cp, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(import.meta.dirname, '..');
const buildTempDir = path.join(os.tmpdir(), `banana-batch-studio-windows-build-${process.pid}`);
const outputDir = path.join(rootDir, 'BananaBatchStudio-Windows-x64');

function getBunBin() {
  const candidates = [
    process.env.BUN_PATH,
    path.join(os.homedir(), '.bun/bin/bun'),
    '/usr/local/bin/bun',
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return 'bun';
}

const bunBin = getBunBin();

async function downloadBunBinary(version, platform, destPath) {
  if (existsSync(destPath)) {
    console.log(`  Using cached Bun binary at ${destPath}`);
    return;
  }
  const zipName = `bun-${platform}.zip`;
  const url = `https://github.com/oven-sh/bun/releases/download/bun-v${version}/${zipName}`;
  const zipPath = path.join(buildTempDir, zipName);
  const extractDir = path.join(buildTempDir, `bun-${platform}`);

  console.log(`  Downloading Bun ${version} (${platform})...`);
  await execFileAsync('curl', ['-L', '--progress-bar', '-o', zipPath, url], { maxBuffer: 1024 * 1024 * 10 });
  await mkdir(extractDir, { recursive: true });
  await execFileAsync('unzip', ['-o', zipPath, '-d', extractDir], { maxBuffer: 1024 * 1024 * 10 });

  const bunExe = path.join(extractDir, `bun-${platform}`, 'bun.exe');
  await execFileAsync('mv', [bunExe, destPath]);
}

const startBat = `@echo off
cd /d "%~dp0"
set GEMINI_BATCH_STUDIO_DATA_DIR=%APPDATA%\\BananaBatchStudio
echo Starting Banana Batch Studio...
start "" /b "%~dp0bun.exe" "server-bundle.js"
timeout /t 2 /nobreak > nul
start http://localhost:4178
`;

const startPs1 = `# Run with: powershell -ExecutionPolicy Bypass -File start.ps1
$env:GEMINI_BATCH_STUDIO_DATA_DIR = "$env:APPDATA\\BananaBatchStudio"
$process = Start-Process -FilePath (Join-Path $PSScriptRoot "bun.exe") -ArgumentList "server-bundle.js" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 2
Start-Process "http://localhost:4178"
$process.WaitForExit()
`;

async function main() {
  await mkdir(buildTempDir, { recursive: true });

  const { stdout: bunVersion } = await execFileAsync(bunBin, ['--version'], { maxBuffer: 1024 * 1024 });
  const version = bunVersion.trim();
  console.log(`Using Bun ${version}`);

  // Build frontend if needed
  if (!existsSync(path.join(rootDir, 'dist', 'index.html'))) {
    console.log('Building frontend...');
    await execFileAsync('npm', ['run', 'build'], { cwd: rootDir, maxBuffer: 1024 * 1024 * 10 });
  }

  // Bundle server JS
  console.log('Bundling server...');
  const bundlePath = path.join(buildTempDir, 'server-bundle.js');
  await execFileAsync(
    bunBin,
    ['build', '--target=bun', `--outfile=${bundlePath}`, path.join(rootDir, 'src/server/index.js')],
    { cwd: rootDir, maxBuffer: 1024 * 1024 * 10 }
  );

  // Download Windows Bun binary
  const bunExePath = path.join(buildTempDir, 'bun.exe');
  await downloadBunBinary(version, 'windows-x64', bunExePath);

  // Create output directory. Do not recursively delete existing packages; project policy forbids bulk deletion.
  await mkdir(outputDir, { recursive: true });

  // Copy files
  await cp(bunExePath, path.join(outputDir, 'bun.exe'));
  await cp(bundlePath, path.join(outputDir, 'server-bundle.js'));
  await cp(path.join(rootDir, 'dist'), path.join(outputDir, 'dist'), { recursive: true });
  await writeFile(path.join(outputDir, 'start.bat'), startBat, 'utf8');
  await writeFile(path.join(outputDir, 'start.ps1'), startPs1, 'utf8');

  const { stdout: size } = await execFileAsync('du', ['-sh', outputDir], { maxBuffer: 1024 * 1024 });
  console.log(`\nDone: ${size.trim()}`);
  console.log('Windows package: BananaBatchStudio-Windows-x64/');
  console.log('  Run start.bat  or  powershell -ExecutionPolicy Bypass -File start.ps1');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
