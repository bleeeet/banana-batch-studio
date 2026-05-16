# Banana Batch Studio

> One prompt. Many images. Local batch output for BANANA/Gemini image workflows.

![macOS](https://img.shields.io/badge/macOS-12%2B-black)
![Windows](https://img.shields.io/badge/Windows-x64-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![Bun](https://img.shields.io/badge/Bun-runtime-f5f0e8)
![License](https://img.shields.io/badge/license-ISC-lightgrey)

Banana Batch Studio 是一个本地运行的批量图片生成工具，专门解决一个很小众但很刚需的场景：**多张图片使用同一个提示词和同一组参考图，批量并发输出结果**。

它适合电商和影视从业者处理一组素材：比如把一批商品图统一生成白底图、把多张剧照套同一种风格、用参考图统一视觉方向，或者用 BANANA/Gemini 图像模型批量测试同一套提示词。图片从你的电脑直接发往 Google Gemini API 或兼容中转 API，不经过第三方服务器。

Banana Batch Studio is a local desktop app for batch image generation with BANANA/Gemini-style image models. Drop many source images, optionally add reference images, apply one shared prompt, run them in parallel, and export the results.

![Banana Batch Studio interface](docs/images/banana-batch-studio-interface.png)

> Current desktop interface.

![Banana Batch Studio concept](docs/images/banana-batch-studio-concept.png)

> Product concept image.

## Download

Download the latest desktop build from the repository's GitHub Releases page after publishing.

| Platform            | Package                                   | Notes                |
| ------------------- | ----------------------------------------- | -------------------- |
| macOS Apple Silicon | `Banana Batch Studio (Apple Silicon).app` | For M1/M2/M3/M4 Macs |
| macOS Intel         | `Banana Batch Studio (Intel).app`         | For older Intel Macs |
| Windows x64         | `BananaBatchStudio-Windows-x64/`          | Run with `start.bat` |

The current release packaging produces three desktop builds:

- Apple Silicon macOS app
- Intel macOS app
- Windows x64 package

> Add the real GitHub Releases link here after the repository is published.

## Table of Contents

- [Why I Built This](#why-i-built-this)
- [Who It Is For](#who-it-is-for)
- [Features](#features)
- [Quick Start](#quick-start)
- [API Providers](#api-providers)
- [Realtime vs Batch Mode](#realtime-vs-batch-mode)
- [Data and Privacy](#data-and-privacy)
- [Development](#development)
- [Packaging](#packaging)
- [FAQ](#faq)

## Why I Built This

我做这个 App，是因为自己有一个非常具体的需求：用 Banana/Gemini 图像模型批量生成白底商品图。

在这个流程里，单张图片工具往往不够顺手：

- TapNow 这类平台用起来方便，但 token 成本对批量任务不太友好。
- 一张图一张图上传、连线、下载，重复动作很多。
- Cherry Studio 适合聊天和单次调用，但我需要的是多张图片并行跑同一个提示词。

所以 Banana Batch Studio 的目标很明确：**把“同一个提示词处理一批图片”这件事做得直接一点**。拖进去一批图，添加参考图或垫图，设置提示词和模型参数，启动并发任务，最后下载单图或整个结果文件夹。

English summary: this app was built for a narrow but real production workflow: applying the same image-generation prompt to many source images, especially for ecommerce product shots and media asset processing.

## Who It Is For

- 电商运营、设计师：批量生成白底图、场景图、商品风格图。
- 影视、短视频、内容团队：对一组剧照、素材、参考图套用统一风格。
- AI 图像工作流用户：需要快速测试同一套 prompt 在多张图上的效果。
- 需要并发处理的人：不想在网页或聊天工具里一张一张上传、等待、下载。

For: ecommerce teams, designers, video creators, and anyone who needs repeated image-to-image generation with one shared prompt.

## Features

| 功能 | 说明 |
|---|---|
| 多图拖拽 / 点击选择 | 支持一次拖入多张图片，也可以点击选择图片或整个文件夹 |
| 图片堆叠预览 | 上传后会在拖入区显示真实图片缩略图，并以叠放卡片形式预览 |
| 参考图 / 垫图 | 支持为整批主图添加一组参考图，每张主图都会带上同一组参考图和提示词 |
| 图片格式 | 支持 PNG、JPG、JPEG、WEBP |
| 实时并发 | 默认最大并发 10，可调整，最高 100 |
| Batch 模式 | 支持 Gemini Batch Job，用于更省钱的批量任务 |
| API 通道 | 支持 Google 官方 API 和 Gemini 兼容中转 API，可保存中转 API 地址 |
| 模型列表 | 中转模式可拉取兼容服务的模型列表，并直接选择模型 |
| 模型参数 | 支持模型、比例、尺寸、Temperature、请求间隔等设置 |
| 预设管理 | 保存模型、提示词、比例、尺寸、Temperature 和处理模式，支持导入 / 导出 JSON 预设 |
| 单图操作 | 每张结果图可单独下载，失败项可单独重试 |
| 文件夹导出 | 一键把全部成功结果图保存到下载文件夹中的普通文件夹 |
| 多语言界面 | 支持简体中文、繁体中文、English、日本語、한국어 |
| 画布式流程 | 上传、设置、结果三个模块居中对齐，生成时连接线会显示能量传递动效 |
| 开发者链接 | 底部固定显示开发者 GitHub 和 X 链接 |
| 本地运行 | 本地服务监听 `127.0.0.1:4178`，不需要上传到自建服务器 |

Bottom capability labels in the UI:

- `100 张图片并发处理`
- `BANANA可选模型`
- `原生API接入`
- `中转 API 支持`
- `不接入三方服务器`

Supported models in the current UI:

- `gemini-3-pro-image-preview`
- `gemini-3.1-flash-image-preview`

Relay API mode can also fetch and use compatible model names from your provider.

## Quick Start

### macOS App

1. Download the App from GitHub Releases.
2. Open `Banana Batch Studio (Apple Silicon).app` or `Banana Batch Studio (Intel).app`.
3. Choose an API channel: Google official API or Gemini-compatible relay API.
4. Save your API key.
5. Drop images into the app, or click `选图片 / 选文件夹`.
6. Optional: add reference images with `添加参考图`.
7. Enter one shared prompt.
8. Choose model, aspect ratio, image size, Temperature, request delay, and concurrency.
9. Click `开始生成`.
10. Download one image, retry failed items, edit the saved job prompt, rebuild a task, or export all results as a folder.

第一次打开时，如果 macOS 提示无法确认开发者，在 Finder 里右键 App，选择「打开」，再确认一次即可。

### Windows
windos的配置需要打开env文件，将HTTPS_PROXY= 和HTTP_PROXY= 等号之后的服务代理改成自己的服务代理，才能使用原生api

Open the `BananaBatchStudio-Windows-x64` package folder and run:

```powershell
start.bat
```

If you prefer running without a console window:

```powershell
powershell -ExecutionPolicy Bypass -File start.ps1
```

To stop the service, close the server process that was started by `start.bat` or `start.ps1`.

## API Providers

Banana Batch Studio supports two API channels:

| API 通道            | 适合场景                                                     |
| ------------------- | ------------------------------------------------------------ |
| Google 官方 API     | 直接使用 Google AI Studio / Gemini API key                   |
| Gemini 兼容中转 API | 使用兼容 Gemini API 格式的中转服务，自定义 API 地址和模型列表 |

应用不会内置或强制代理。网络连接交给你的系统网络、VPN、代理或分流规则处理。

The app does not ship with an API key. You need to provide your own Google Gemini API key or relay API key.

中转模式下可以填写并保存 API 地址，例如 `https://your-relay.example.com`。保存密钥后，点击 `获取模型列表` 可以从兼容服务读取模型并在界面里选择。

## Realtime vs Batch Mode

| 模式       | 适合场景                     | 行为                                     |
| ---------- | ---------------------------- | ---------------------------------------- |
| 实时并行   | 想尽快看到结果，图片数量中小 | 按最大并发数同时处理，完成一张补位下一张 |
| Batch 省钱 | 更大批量、对速度不敏感       | 提交 Gemini Batch Job，并轮询任务状态    |

最大并发默认是 10，独立设置，不跟随预设。

如果添加了参考图 / 垫图，实时模式和 Batch 模式都会把同一组参考图随每张主图一起提交。适合统一风格、构图、材质、人物或产品视觉方向。

| 上传张数 | 最大并发 | 实际同时运行 |
|---|---|---|
| 3 张 | 10 | 3 张 |
| 11 张 | 10 | 先跑 10 张，1 张排队 |
| 11 张 | 4 | 每次最多 4 张 |

## Data and Privacy

Banana Batch Studio runs locally. It stores task records and generated files on your machine.

**Mac App data path:**

```text
~/Library/Application Support/BananaBatchStudio/
  uploads/       Uploaded source image copies
  outputs/       Generated images
  batch/         Batch mode request files
  zips/          Legacy ZIP export cache
  jobs.json      Job records
  api-keys.json  API keys, stored as plain JSON
```

**Windows data path:**

```text
%APPDATA%\BananaBatchStudio\
```

**Development mode data path:**

```text
./app-data/
```

Important: API keys are currently stored as plain local JSON. Before sharing logs, screenshots, archives, or your local data folder, make sure your own key is not included.

Preset import/export files are normal JSON files. They contain prompt text and model settings, but not API keys.

## Development

Requirements:

- [Node.js LTS](https://nodejs.org/)
- [Bun](https://bun.sh/)

Install dependencies:

```bash
npm install
```

Run in development mode:

```bash
npm run dev
```

Run the local service directly:

```bash
npm start
```

The local server listens on:

```text
http://127.0.0.1:4178
```

## Packaging

Build desktop packages:

```bash
npm run package:mac       # Build macOS Apple Silicon + Intel .app bundles
npm run package:windows   # Build Windows x64 package
```

Output files are created in the project root.

Current outputs:

```text
Banana Batch Studio (Apple Silicon).app
Banana Batch Studio (Intel).app
BananaBatchStudio-Windows-x64/
```

For GitHub publishing, commit the source code and upload binary packages to GitHub Releases. The repository `.gitignore` already excludes local build outputs, app bundles, dependencies, and runtime data.

## How It Works

Banana Batch Studio has five parts:

1. **Desktop shell**: Swift + WKWebView on macOS, local service + browser on Windows.
2. **Web UI**: React interface for source images, reference images, prompts, settings, progress, previews, and downloads.
3. **Local service**: Express/Bun server bound to `127.0.0.1:4178`.
4. **Job runner**: each image is tracked as a separate task item; realtime mode uses parallel workers.
5. **JSON storage**: lightweight local records for jobs, items, files, and API keys.

The current UI uses a three-panel canvas workflow: upload, settings, and results. Uploaded images are previewed as a compact stacked image deck; while a job is generating, the connecting lines animate from module to module so progress is easier to read at a glance. The background uses a soft colorful glassmorphism treatment instead of a grid.

## FAQ

**Q: Is this a cloud service?**  
No. It runs locally. Your images are sent from your computer to the API provider you configure.

**Q: Does it include free Gemini/Banana API usage?**  
No. You need your own Google Gemini API key or a compatible relay API key.

**Q: Why do some images fail?**  
Common reasons include API rate limits, network instability, model refusal, unsupported parameters, or provider-side errors. Failed items can be retried individually.

**Q: Can I use the same reference image for a whole batch?**  
Yes. Add one or more files in `参考图 / 垫图`. Every source image in that run will use the same reference set plus the shared prompt.

**Q: Can I move presets between machines?**  
Yes. Use `导出预设` to save a JSON file, then `导入预设` on another copy of the app. Duplicate preset parameters are skipped during import.

**Q: Why does macOS say the developer cannot be verified?**  
The app is locally packaged and may not be notarized. Right-click the App in Finder, choose `Open`, then confirm.

**Q: Where is the log file on macOS?**  

```text
~/Library/Logs/Banana Batch Studio.log
```

**Q: How do I uninstall it?**  
Delete the App bundle, then remove the local data folder if you no longer need the task records and generated files:

```text
~/Library/Application Support/BananaBatchStudio/
```

**Q: Should I commit the built App to GitHub?**  
No. Commit source code only. Put `.app` bundles and Windows packages in GitHub Releases.

## License

ISC
