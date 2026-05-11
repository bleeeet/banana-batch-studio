import { execFile } from 'node:child_process';
import { chmod, cp, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(import.meta.dirname, '..');
const buildTempDir = path.join(os.tmpdir(), `banana-batch-studio-build-${process.pid}`);
const appName = 'Banana Batch Studio.app';

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

  // Bun zip extracts to bun-<platform>/bun
  const extractedBin = path.join(extractDir, `bun-${platform}`, 'bun');
  await execFileAsync('mv', [extractedBin, destPath]);
  await chmod(destPath, 0o755);
}

const swiftSource = String.raw`import AppKit
import CFNetwork
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var serverProcess: Process?
    private let basePort = 4178
    private var port = 4178

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        setupMenus()
        setupWindow()
        startServerAndLoad()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        serverProcess?.terminate()
    }

    private func setupWindow() {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1320, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Banana Batch Studio"
        window.isMovableByWindowBackground = true
        window.setFrameAutosaveName("Banana Batch Studio Main Window")
        window.center()
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func setupMenus() {
        let mainMenu = NSMenu()

        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(NSMenuItem(title: "About Banana Batch Studio", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: ""))
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(NSMenuItem(title: "Hide Banana Batch Studio", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h"))
        appMenu.addItem(NSMenuItem(title: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h"))
        appMenu.items.last?.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(NSMenuItem(title: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: ""))
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(NSMenuItem(title: "Quit Banana Batch Studio", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        let editMenuItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(NSMenuItem(title: "Undo", action: Selector(("undo:")), keyEquivalent: "z"))
        editMenu.addItem(NSMenuItem(title: "Redo", action: Selector(("redo:")), keyEquivalent: "Z"))
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(NSMenuItem(title: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
        editMenu.addItem(NSMenuItem(title: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
        editMenu.addItem(NSMenuItem(title: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v"))
        editMenu.addItem(NSMenuItem(title: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))
        editMenuItem.submenu = editMenu
        mainMenu.addItem(editMenuItem)

        NSApp.mainMenu = mainMenu
    }

    private func appDirectory() -> URL {
        Bundle.main.resourceURL!.appendingPathComponent("server", isDirectory: true)
    }

    private func bunURL() -> URL {
        appDirectory().appendingPathComponent("bun")
    }

    private func numberString(_ value: Any?) -> String? {
        if let number = value as? NSNumber {
            return number.stringValue
        }
        if let string = value as? String, !string.isEmpty {
            return string
        }
        return nil
    }

    private func systemWebProxyEnvironment() -> [String: String] {
        guard let unmanagedSettings = CFNetworkCopySystemProxySettings(),
              let settings = unmanagedSettings.takeRetainedValue() as? [String: Any] else {
            return [:]
        }

        var environment: [String: String] = [:]
        if (settings[kCFNetworkProxiesHTTPSEnable as String] as? NSNumber)?.boolValue == true,
           let host = settings[kCFNetworkProxiesHTTPSProxy as String] as? String,
           let port = numberString(settings[kCFNetworkProxiesHTTPSPort as String]) {
            let proxyURL = "http://\(host):\(port)"
            environment["HTTPS_PROXY"] = proxyURL
            environment["https_proxy"] = proxyURL
        }

        if (settings[kCFNetworkProxiesHTTPEnable as String] as? NSNumber)?.boolValue == true,
           let host = settings[kCFNetworkProxiesHTTPProxy as String] as? String,
           let port = numberString(settings[kCFNetworkProxiesHTTPPort as String]) {
            let proxyURL = "http://\(host):\(port)"
            environment["HTTP_PROXY"] = proxyURL
            environment["http_proxy"] = proxyURL
        }

        return environment
    }

    private func healthProjectDir(for candidatePort: Int) -> String? {
        guard let url = URL(string: "http://127.0.0.1:\(candidatePort)/api/health"),
              let data = try? Data(contentsOf: url, options: []) else {
            return nil
        }
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return object["projectDir"] as? String
    }

    private func choosePort() -> Int? {
        let appPath = appDirectory().standardizedFileURL.path
        for candidate in basePort..<(basePort + 20) {
            if let projectDir = healthProjectDir(for: candidate) {
                let runningPath = URL(fileURLWithPath: projectDir).standardizedFileURL.path
                if runningPath == appPath {
                    return candidate
                }
                continue
            }
            return candidate
        }
        return nil
    }

    private func startServerAndLoad() {
        guard let selectedPort = choosePort() else {
            showError("没有找到可用端口，请先关闭其他正在运行的 Banana Batch Studio。")
            return
        }
        port = selectedPort

        if healthProjectDir(for: port) == nil {
            let dataDir = FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Library/Application Support/BananaBatchStudio")
                .path

            let process = Process()
            process.executableURL = bunURL()
            process.currentDirectoryURL = appDirectory()
            process.arguments = ["server-bundle.js"]
            var environment = [
                "PORT": "\(port)",
                "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
                "GEMINI_BATCH_STUDIO_DATA_DIR": dataDir
            ]
            for (key, value) in systemWebProxyEnvironment() {
                environment[key] = value
            }
            process.environment = environment

            let logURL = FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Library/Logs/Banana Batch Studio.log")
            FileManager.default.createFile(atPath: logURL.path, contents: nil)
            if let handle = try? FileHandle(forWritingTo: logURL) {
                process.standardOutput = handle
                process.standardError = handle
            }

            do {
                try process.run()
                serverProcess = process
            } catch {
                showError("启动本地服务失败：\(error.localizedDescription)")
                return
            }
        }

        loadWhenReady(attempt: 0)
    }

    private func loadWhenReady(attempt: Int) {
        if healthProjectDir(for: port) != nil {
            webView.load(URLRequest(url: URL(string: "http://127.0.0.1:\(port)")!))
            return
        }
        if attempt > 80 {
            showError("本地服务启动超时，请重新打开 App。")
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            self.loadWhenReady(attempt: attempt + 1)
        }
    }

    private func showError(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "Banana Batch Studio"
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.runModal()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
`;

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Banana Batch Studio</string>
  <key>CFBundleDisplayName</key>
  <string>Banana Batch Studio</string>
  <key>CFBundleIdentifier</key>
  <string>local.gemini-batch-studio</string>
  <key>CFBundleVersion</key>
  <string>1.0.0</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleExecutable</key>
  <string>BananaBatchStudio</string>
  <key>CFBundleIconFile</key>
  <string>BananaBatchStudio</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
</dict>
</plist>
`;

async function main() {
  await mkdir(buildTempDir, { recursive: true });

  // Detect installed Bun version
  const { stdout: bunVersion } = await execFileAsync(bunBin, ['--version'], { maxBuffer: 1024 * 1024 });
  const version = bunVersion.trim();
  console.log(`Using Bun ${version}`);

  // Build frontend
  console.log('\nBuilding frontend...');
  await execFileAsync('npm', ['run', 'build'], { cwd: rootDir, maxBuffer: 1024 * 1024 * 10 });

  // Bundle server JS (single file, no node_modules needed at runtime)
  console.log('Bundling server...');
  const bundlePath = path.join(buildTempDir, 'server-bundle.js');
  await execFileAsync(
    bunBin,
    ['build', '--target=bun', `--outfile=${bundlePath}`, path.join(rootDir, 'src/server/index.js')],
    { cwd: rootDir, maxBuffer: 1024 * 1024 * 10 }
  );

  // Compile Swift launcher (universal: arm64 + x86_64)
  console.log('Compiling Swift launcher...');
  const swiftSourcePath = path.join(buildTempDir, 'BananaBatchStudioApp.swift');
  const arm64Bin = path.join(buildTempDir, 'launcher-arm64');
  const x64Bin = path.join(buildTempDir, 'launcher-x86_64');
  const universalLauncher = path.join(buildTempDir, 'launcher');
  await writeFile(swiftSourcePath, swiftSource);
  await execFileAsync('swiftc', [swiftSourcePath, '-o', arm64Bin, '-framework', 'AppKit', '-framework', 'CFNetwork', '-framework', 'WebKit', '-target', 'arm64-apple-macos12.0'], { maxBuffer: 1024 * 1024 * 10 });
  await execFileAsync('swiftc', [swiftSourcePath, '-o', x64Bin, '-framework', 'AppKit', '-framework', 'CFNetwork', '-framework', 'WebKit', '-target', 'x86_64-apple-macos12.0'], { maxBuffer: 1024 * 1024 * 10 });
  await execFileAsync('lipo', ['-create', '-output', universalLauncher, arm64Bin, x64Bin], { maxBuffer: 1024 * 1024 * 10 });
  await chmod(universalLauncher, 0o755);

  // Build app icon
  console.log('Building icon...');
  const sourceLogoPath = path.join(rootDir, 'src/client/assets/banana-batch-studio-logo.png');
  const iconsetDir = path.join(buildTempDir, 'BananaBatchStudio.iconset');
  const iconPath = path.join(buildTempDir, 'BananaBatchStudio.icns');
  await mkdir(iconsetDir, { recursive: true });
  for (const [filename, size] of [
    ['icon_16x16.png', 16], ['icon_16x16@2x.png', 32], ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64], ['icon_128x128.png', 128], ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256], ['icon_256x256@2x.png', 512], ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ]) {
    await execFileAsync('sips', ['-z', String(size), String(size), sourceLogoPath, '--out', path.join(iconsetDir, filename)], { maxBuffer: 1024 * 1024 * 10 });
  }
  await execFileAsync('iconutil', ['-c', 'icns', iconsetDir, '-o', iconPath], { maxBuffer: 1024 * 1024 * 10 });

  // Prepare Bun binaries (arm64 from local install, x86_64 downloaded)
  const bunArm64Path = path.join(buildTempDir, 'bun-arm64');
  const bunX64Path = path.join(buildTempDir, 'bun-x86_64');
  await cp(getBunBin(), bunArm64Path);
  await chmod(bunArm64Path, 0o755);
  await downloadBunBinary(version, 'darwin-x64', bunX64Path);

  // Build both .app bundles
  for (const [arch, appName, bunPath] of [
    ['arm64', 'Banana Batch Studio (Apple Silicon).app', bunArm64Path],
    ['x86_64', 'Banana Batch Studio (Intel).app', bunX64Path],
  ]) {
    console.log(`\nBuilding ${appName}...`);
    const appDir = path.join(rootDir, appName);

    const contentsDir = path.join(appDir, 'Contents');
    const macosDir = path.join(contentsDir, 'MacOS');
    const resourcesDir = path.join(contentsDir, 'Resources');
    const serverDir = path.join(resourcesDir, 'server');

    await mkdir(macosDir, { recursive: true });
    await mkdir(serverDir, { recursive: true });

    await cp(bunPath, path.join(serverDir, 'bun'));
    await chmod(path.join(serverDir, 'bun'), 0o755);
    await cp(bundlePath, path.join(serverDir, 'server-bundle.js'));
    await cp(path.join(rootDir, 'dist'), path.join(serverDir, 'dist'), { recursive: true });
    await cp(universalLauncher, path.join(macosDir, 'BananaBatchStudio'));
    await chmod(path.join(macosDir, 'BananaBatchStudio'), 0o755);
    await cp(iconPath, path.join(resourcesDir, 'BananaBatchStudio.icns'));
    await writeFile(path.join(contentsDir, 'Info.plist'), plist);
    await writeFile(path.join(contentsDir, 'PkgInfo'), 'APPL????');

    await execFileAsync('codesign', ['--force', '--deep', '--sign', '-', appDir], { maxBuffer: 1024 * 1024 * 10 });

    const { stdout: size } = await execFileAsync('du', ['-sh', appDir], { maxBuffer: 1024 * 1024 });
    console.log(`  ${size.trim()}`);
  }

  console.log('\nDone. Apps at project root:');
  console.log('  Banana Batch Studio (Apple Silicon).app');
  console.log('  Banana Batch Studio (Intel).app');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
