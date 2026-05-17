# Banana Batch Studio

> One prompt. Many images. A local desktop app for BANANA/Gemini batch image generation.

**Languages**: [中文](../../README.md) | [繁體中文](README.zh-Hant.md) | English | [日本語](README.ja.md) | [한국어](README.ko.md)

Current release: `v2.0.2`

![macOS](https://img.shields.io/badge/macOS-12%2B-black)
![Windows](https://img.shields.io/badge/Windows-x64-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![Bun](https://img.shields.io/badge/Bun-runtime-f5f0e8)
![License](https://img.shields.io/badge/license-ISC-lightgrey)

Banana Batch Studio is a local desktop app for a focused production workflow: **run the same prompt and the same reference images across many source images, in parallel**.

It is useful for ecommerce, design, video, media, and AI image workflow users. Drop source images, add optional reference images, enter one shared prompt, choose model settings, and export the results. Images are sent directly from your computer to the Google Gemini API or a compatible relay API that you configure. They do not pass through a third-party app server.

![Banana Batch Studio interface](../images/banana-batch-studio-interface.png)

> Current desktop interface.

![Banana Batch Studio concept](../images/banana-batch-studio-concept.png)

> Product concept image.

## Download

Download the latest desktop build from GitHub Releases:

[Download Banana Batch Studio v2.0.2](https://github.com/bleeeet/banana-batch-studio/releases/tag/v2.0.2)

| Platform | Package | Notes |
|---|---|---|
| macOS Apple Silicon | `Banana Batch Studio (Apple Silicon).app` | For M1/M2/M3/M4 Macs |
| macOS Intel | `Banana Batch Studio (Intel).app` | For Intel Macs |
| Windows x64 | `BananaBatchStudio-Windows-x64/` | Run `start.bat` |

The current release includes:

- Apple Silicon macOS app
- Intel macOS app
- Windows x64 package

## Table of Contents

- [Why I Built This](#why-i-built-this)
- [Who It Is For](#who-it-is-for)
- [Features](#features)
- [Quick Start](#quick-start)
- [API Providers](#api-providers)
- [Realtime and Batch Modes](#realtime-and-batch-modes)
- [Data and Privacy](#data-and-privacy)
- [Development](#development)
- [Packaging](#packaging)
- [Built With](#built-with)
- [FAQ](#faq)

## Why I Built This

I built this app for a very specific need: generating clean ecommerce product images in batches with Banana/Gemini image models.

Single-image tools were not enough for that workflow:

- Convenient platforms can become expensive for batch token usage.
- Uploading, wiring, waiting, and downloading one image at a time is repetitive.
- Chat-style tools are good for one-off calls, but I needed many images running with the same prompt in parallel.

Banana Batch Studio keeps the workflow direct: drop a batch of images, add reference images if needed, configure the prompt and model settings, start parallel generation, then download individual images or export the full results folder.

## Who It Is For

- Ecommerce operators and designers: generate white-background product shots, scene images, and style variants.
- Film, short video, and content teams: apply one style direction to a group of frames or assets.
- AI image workflow users: test the same prompt across many images quickly.
- Anyone who needs parallel processing instead of manual one-by-one uploads.

## Features

| Feature | Description |
|---|---|
| Multi-image upload | Drag many images at once, or choose images / folders |
| Stacked previews | Show real thumbnails in a compact stacked deck |
| Reference images | Apply the same reference set to every source image |
| Image formats | PNG, JPG, JPEG, WEBP |
| Realtime concurrency | Default max concurrency is 10; configurable up to 100 |
| Batch mode | Supports Gemini Batch Job for larger, cost-sensitive runs |
| API providers | Google official API and Gemini-compatible relay API |
| Model list | Relay mode can fetch compatible model names |
| Model settings | Model, aspect ratio, image size, temperature, request delay, and more |
| Presets | Save and import/export prompt and model settings as JSON presets |
| Per-image actions | Download individual results and retry failed items |
| Folder export | Export all successful results into a normal downloads folder |
| Multilingual UI | Simplified Chinese, Traditional Chinese, English, Japanese, and Korean |
| Canvas workflow | Upload, settings, and results are centered in a visual workflow |
| Developer links | Fixed GitHub and X links in the footer |
| Local runtime | Local service listens on `127.0.0.1:4178` |

Current UI capability labels:

- `100 张图片并发处理`
- `BANANA可选模型`
- `原生API接入`
- `中转 API 支持`
- `不接入三方服务器`

Current built-in model options:

- `gemini-3-pro-image-preview`
- `gemini-3.1-flash-image-preview`

Relay API mode can also fetch and use compatible model names from your provider.

## Quick Start

### macOS App

1. Download the app from GitHub Releases.
2. Open `Banana Batch Studio (Apple Silicon).app` or `Banana Batch Studio (Intel).app`.
3. Choose an API provider: Google official API or Gemini-compatible relay API.
4. Save your API key.
5. Drop images into the app, or click the image / folder picker.
6. Optional: add reference images with the reference image button.
7. Enter one shared prompt.
8. Choose model, aspect ratio, image size, temperature, request delay, and concurrency.
9. Click the start generation button.
10. Download one image, retry failed items, edit the saved job prompt, rebuild a task, or export all results as a folder.

If macOS says the developer cannot be verified, right-click the app in Finder, choose `Open`, then confirm.

### Windows

Open the `BananaBatchStudio-Windows-x64` folder and run:

```powershell
start.bat
```

To run without a console window:

```powershell
powershell -ExecutionPolicy Bypass -File start.ps1
```

If the Google official API requires a proxy in your network environment, configure your system proxy or the proxy variables in the startup script.

## API Providers

Banana Batch Studio supports two API providers:

| Provider | Best For |
|---|---|
| Google official API | Direct Google AI Studio / Gemini API key usage |
| Gemini-compatible relay API | Compatible relay services with custom API base URL and model list |

The app does not bundle or force a proxy. Network access follows your system network, VPN, proxy, or routing rules.

The app does not ship with an API key. You need your own Google Gemini API key or relay API key.

In relay mode, you can save an API base URL such as `https://your-relay.example.com`. After saving a key, click `获取模型列表` to fetch compatible models.

## Realtime and Batch Modes

| Mode | Best For | Behavior |
|---|---|---|
| Realtime parallel | Faster feedback for small or medium batches | Runs up to the max concurrency, then fills the next item when one completes |
| Batch saver | Larger batches where speed is less important | Submits a Gemini Batch Job and polls its status |

Max concurrency defaults to 10 and is independent from presets.

When reference images are added, both realtime and Batch modes send the same reference set with each source image.

| Uploaded Images | Max Concurrency | Active Jobs |
|---|---|---|
| 3 | 10 | 3 |
| 11 | 10 | 10 first, 1 queued |
| 11 | 4 | Up to 4 at a time |

## Data and Privacy

Banana Batch Studio runs locally. Job records and generated files are stored on your machine.

**Mac app data path:**

```text
~/Library/Application Support/BananaBatchStudio/
  uploads/       Uploaded source image copies
  outputs/       Generated images
  batch/         Batch mode request files
  zips/          Legacy ZIP export cache
  jobs.json      Job records
  api-keys.json  API keys, stored as plain local JSON
```

**Windows data path:**

```text
%APPDATA%\BananaBatchStudio\
```

**Development mode data path:**

```text
./app-data/
```

Important: API keys are currently stored as plain local JSON. Before sharing logs, screenshots, archives, or local data folders, make sure your key is not included.

Preset import/export files are normal JSON files. They contain prompt text and model settings, but not API keys.

Public release packages do not include your personal API keys or personal saved presets. API keys and saved presets live in the user's local configuration directory and are not bundled into the public desktop app.

## Development

Requirements:

- [Node.js LTS](https://nodejs.org/)
- [Bun](https://bun.sh/)

Install dependencies:

```bash
npm install
```

Run development mode:

```bash
npm run dev
```

Run the local service directly:

```bash
npm start
```

Local service URL:

```text
http://127.0.0.1:4178
```

## Packaging

Build desktop packages:

```bash
npm run package:mac       # Build macOS Apple Silicon + Intel .app bundles
npm run package:windows   # Build Windows x64 package
```

Outputs are created in the project root:

```text
Banana Batch Studio (Apple Silicon).app
Banana Batch Studio (Intel).app
BananaBatchStudio-Windows-x64/
```

For GitHub publishing, commit source code only and upload binary packages to GitHub Releases. The repository `.gitignore` excludes local build outputs, app bundles, dependencies, and runtime data.

## Built With

Banana Batch Studio is built with:

- [Google Gemini / Google AI API](https://ai.google.dev/) for image generation model access.
- [Bun](https://bun.sh/) for the bundled local runtime.
- [React](https://react.dev/) for the desktop web interface.
- [Vite](https://vite.dev/) for frontend development and production builds.

## FAQ

**Is this a cloud service?**  
No. It runs locally. Your images are sent from your computer to the API provider you configure.

**Does it include free Gemini/Banana API usage?**  
No. You need your own Google Gemini API key or compatible relay API key.

**Why do some images fail?**  
Common reasons include API rate limits, network instability, model refusal, unsupported parameters, or provider-side errors. Failed items can be retried individually.

**Can I use the same reference image for a whole batch?**  
Yes. Add one or more files in `参考图 / 垫图`. Every source image in that run will use the same reference set and shared prompt.

**Can I move presets between machines?**  
Yes. Use `导出预设` to save a JSON file, then `导入预设` on another copy of the app.

**Why does macOS say the developer cannot be verified?**  
The app is locally packaged and may not be notarized. Right-click the app in Finder, choose `Open`, then confirm.

**Where is the macOS log file?**

```text
~/Library/Logs/Banana Batch Studio.log
```

**Should I commit built apps to GitHub?**  
No. Commit source code only. Put `.app` bundles and Windows packages in GitHub Releases.

## License

ISC
