# Banana Batch Studio

> 一个提示词，批量处理多张图片。本地运行的 BANANA/Gemini 图片批量生成桌面工具。

**语言**：中文 | [繁體中文](docs/readme/README.zh-Hant.md) | [English](docs/readme/README.en.md) | [日本語](docs/readme/README.ja.md) | [한국어](docs/readme/README.ko.md)

当前版本：`v2.0.2`

![macOS](https://img.shields.io/badge/macOS-12%2B-black)
![Windows](https://img.shields.io/badge/Windows-x64-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![Bun](https://img.shields.io/badge/Bun-runtime-f5f0e8)
![License](https://img.shields.io/badge/license-ISC-lightgrey)

Banana Batch Studio 是一个本地运行的批量图片生成工具，专门解决一个很小众但很刚需的场景：**多张图片使用同一个提示词和同一组参考图，批量并发输出结果**。

它适合电商、设计、影视、短视频和 AI 图像工作流用户。你可以拖入一批主图，添加一组参考图或垫图，填写同一个提示词，选择模型和参数，然后并发生成结果。图片从你的电脑直接发往你配置的 Google Gemini API 或兼容中转 API，不经过第三方服务器。

![Banana Batch Studio 界面](docs/images/banana-batch-studio-interface.png)

> 当前桌面界面。

![Banana Batch Studio 概念图](docs/images/banana-batch-studio-concept.png)

> 产品概念图。

## 下载

请在 GitHub Releases 页面下载最新桌面版本：

[下载 Banana Batch Studio v2.0.2](https://github.com/bleeeet/banana-batch-studio/releases/tag/v2.0.2)

| 平台 | 安装包 | 说明 |
|---|---|---|
| macOS Apple Silicon | `Banana Batch Studio (Apple Silicon).app` | 适用于 M1/M2/M3/M4 Mac |
| macOS Intel | `Banana Batch Studio (Intel).app` | 适用于 Intel Mac |
| Windows x64 | `BananaBatchStudio-Windows-x64/` | 运行 `start.bat` |

当前发布包含三个桌面包：

- Apple Silicon macOS App
- Intel macOS App
- Windows x64 包

## 目录

- [为什么做它](#为什么做它)
- [适合谁用](#适合谁用)
- [功能](#功能)
- [快速开始](#快速开始)
- [API 通道](#api-通道)
- [实时模式和 Batch 模式](#实时模式和-batch-模式)
- [数据和隐私](#数据和隐私)
- [开发](#开发)
- [打包](#打包)
- [使用技术](#使用技术)
- [常见问题](#常见问题)

## 为什么做它

我做这个 App，是因为自己有一个非常具体的需求：用 Banana/Gemini 图像模型批量生成白底商品图。

在这个流程里，单张图片工具往往不够顺手：

- TapNow 这类平台用起来方便，但 token 成本对批量任务不太友好。
- 一张图一张图上传、连线、下载，重复动作很多。
- Cherry Studio 适合聊天和单次调用，但我需要的是多张图片并行跑同一个提示词。

所以 Banana Batch Studio 的目标很明确：**把“同一个提示词处理一批图片”这件事做得直接一点**。拖进去一批图，添加参考图或垫图，设置提示词和模型参数，启动并发任务，最后下载单图或整个结果文件夹。

## 适合谁用

- 电商运营、设计师：批量生成白底图、场景图、商品风格图。
- 影视、短视频、内容团队：对一组剧照、素材、参考图套用统一风格。
- AI 图像工作流用户：快速测试同一套提示词在多张图上的效果。
- 需要并发处理的人：不想在网页或聊天工具里一张一张上传、等待、下载。

## 功能

| 功能 | 说明 |
|---|---|
| 多图拖拽 / 点击选择 | 支持一次拖入多张图片，也可以点击选择图片或整个文件夹 |
| 图片堆叠预览 | 上传后显示真实图片缩略图，并以叠放卡片形式预览 |
| 参考图 / 垫图 | 支持为整批主图添加同一组参考图 |
| 图片格式 | 支持 PNG、JPG、JPEG、WEBP |
| 实时并发 | 默认最大并发 10，可调整，最高 100 |
| Batch 模式 | 支持 Gemini Batch Job，用于更省钱的大批量任务 |
| API 通道 | 支持 Google 官方 API 和 Gemini 兼容中转 API |
| 模型列表 | 中转模式可拉取兼容服务的模型列表并直接选择 |
| 模型参数 | 支持模型、比例、尺寸、Temperature、请求间隔等设置 |
| 预设管理 | 保存模型、提示词、比例、尺寸、Temperature 和处理模式，支持导入 / 导出 JSON 预设 |
| 单图操作 | 每张结果图可单独下载，失败项可单独重试 |
| 文件夹导出 | 一键把全部成功结果图保存到下载文件夹中的普通文件夹 |
| 多语言界面 | 支持简体中文、繁体中文、English、日本語、한국어 |
| 画布式流程 | 上传、设置、结果三个模块居中对齐，生成时连接线会显示能量传递动效 |
| 开发者链接 | 底部固定显示开发者 GitHub 和 X 链接 |
| 本地运行 | 本地服务监听 `127.0.0.1:4178`，不需要上传到自建服务器 |

底部能力标签：

- `100 张图片并发处理`
- `BANANA可选模型`
- `原生API接入`
- `中转 API 支持`
- `不接入三方服务器`

当前界面支持的模型：

- `gemini-3-pro-image-preview`
- `gemini-3.1-flash-image-preview`

中转 API 模式也可以从兼容服务拉取并使用模型名称。

## 快速开始

### macOS App

1. 从 GitHub Releases 下载 App。
2. 打开 `Banana Batch Studio (Apple Silicon).app` 或 `Banana Batch Studio (Intel).app`。
3. 选择 API 通道：Google 官方 API 或 Gemini 兼容中转 API。
4. 保存你的 API key。
5. 拖入图片，或点击 `选图片 / 选文件夹`。
6. 可选：点击 `添加参考图` 添加垫图或参考图。
7. 输入同一个批量提示词。
8. 选择模型、比例、尺寸、Temperature、请求间隔和并发数。
9. 点击 `开始生成`。
10. 下载单张图片、重试失败项、编辑已保存任务的提示词、重建任务，或导出全部结果文件夹。

第一次打开时，如果 macOS 提示无法确认开发者，在 Finder 里右键 App，选择「打开」，再确认一次即可。

### Windows

打开 `BananaBatchStudio-Windows-x64` 文件夹并运行：

```powershell
start.bat
```

如果你不想显示控制台窗口，也可以运行：

```powershell
powershell -ExecutionPolicy Bypass -File start.ps1
```

如果使用 Google 官方 API 时需要代理，请根据自己的网络环境设置系统代理或启动脚本里的代理变量。

## API 通道

Banana Batch Studio 支持两个 API 通道：

| API 通道 | 适合场景 |
|---|---|
| Google 官方 API | 直接使用 Google AI Studio / Gemini API key |
| Gemini 兼容中转 API | 使用兼容 Gemini API 格式的中转服务，自定义 API 地址和模型列表 |

应用不会内置或强制代理。网络连接交给你的系统网络、VPN、代理或分流规则处理。

应用不自带 API key。你需要提供自己的 Google Gemini API key 或中转 API key。

中转模式下可以填写并保存 API 地址，例如 `https://your-relay.example.com`。保存密钥后，点击 `获取模型列表` 可以从兼容服务读取模型并在界面里选择。

## 实时模式和 Batch 模式

| 模式 | 适合场景 | 行为 |
|---|---|---|
| 实时并行 | 想尽快看到结果，图片数量中小 | 按最大并发数同时处理，完成一张补位下一张 |
| Batch 省钱 | 更大批量、对速度不敏感 | 提交 Gemini Batch Job，并轮询任务状态 |

最大并发默认是 10，独立设置，不跟随预设。

如果添加了参考图 / 垫图，实时模式和 Batch 模式都会把同一组参考图随每张主图一起提交。适合统一风格、构图、材质、人物或产品视觉方向。

| 上传张数 | 最大并发 | 实际同时运行 |
|---|---|---|
| 3 张 | 10 | 3 张 |
| 11 张 | 10 | 先跑 10 张，1 张排队 |
| 11 张 | 4 | 每次最多 4 张 |

## 数据和隐私

Banana Batch Studio 在本地运行。任务记录和生成文件会保存在你的电脑上。

**Mac App 数据路径：**

```text
~/Library/Application Support/BananaBatchStudio/
  uploads/       上传图片副本
  outputs/       生成结果
  batch/         Batch 模式请求文件
  zips/          旧版 ZIP 导出缓存
  jobs.json      任务记录
  api-keys.json  API key，本地明文 JSON 保存
```

**Windows 数据路径：**

```text
%APPDATA%\BananaBatchStudio\
```

**开发模式数据路径：**

```text
./app-data/
```

重要说明：API key 当前以本地 JSON 明文保存。分享日志、截图、压缩包或本地数据目录前，请确认没有包含自己的密钥。

预设导入 / 导出文件是普通 JSON 文件。它们包含提示词和模型设置，但不包含 API key。

公开发布包不会包含你的个人 API key，也不会包含你的个人保存预设。API key 和保存预设都在用户自己的本机配置目录里，不会被打进公开桌面包。

## 开发

环境要求：

- [Node.js LTS](https://nodejs.org/)
- [Bun](https://bun.sh/)

安装依赖：

```bash
npm install
```

运行开发模式：

```bash
npm run dev
```

直接运行本地服务：

```bash
npm start
```

本地服务地址：

```text
http://127.0.0.1:4178
```

## 打包

构建桌面包：

```bash
npm run package:mac       # 构建 macOS Apple Silicon + Intel .app
npm run package:windows   # 构建 Windows x64 包
```

输出文件会生成在项目根目录：

```text
Banana Batch Studio (Apple Silicon).app
Banana Batch Studio (Intel).app
BananaBatchStudio-Windows-x64/
```

发布到 GitHub 时，只提交源码，把 `.app` 和 Windows 包上传到 GitHub Releases。仓库 `.gitignore` 已经排除了本地构建产物、App 包、依赖和运行数据。

## 使用技术

Banana Batch Studio 主要基于这些工具和 API：

- [Google Gemini / Google AI API](https://ai.google.dev/)：图片生成模型能力。
- [Bun](https://bun.sh/)：打包后的本地运行时。
- [React](https://react.dev/)：桌面 Web 界面。
- [Vite](https://vite.dev/)：前端开发和生产构建。

## 工作方式

Banana Batch Studio 由五部分组成：

1. **桌面壳**：macOS 使用 Swift + WKWebView，Windows 使用本地服务 + 浏览器。
2. **Web UI**：React 界面负责上传、参考图、提示词、设置、进度、预览和下载。
3. **本地服务**：Express/Bun 服务绑定到 `127.0.0.1:4178`。
4. **任务运行器**：每张图片作为单独任务项追踪；实时模式使用并行 worker。
5. **JSON 存储**：轻量保存任务、条目、文件、API key 和预设。

当前 UI 使用上传、设置、结果三模块画布流程。上传后会显示堆叠缩略图；生成时连接线会显示能量传递动效，让进度更容易被看见。

## 常见问题

**这是云服务吗？**
不是。它在本地运行。你的图片会从你的电脑发送到你配置的 API 服务商。

**它包含免费的 Gemini/Banana API 额度吗？**
不包含。你需要自己的 Google Gemini API key 或兼容中转 API key。

**为什么有些图片会失败？**
常见原因包括 API 限流、网络不稳定、模型拒绝、参数不支持或服务商错误。失败项可以单独重试。

**可以整批使用同一张参考图吗？**
可以。在 `参考图 / 垫图` 添加一张或多张文件。每张主图都会带上同一组参考图和同一个提示词。

**预设能在不同电脑之间迁移吗？**
可以。使用 `导出预设` 保存 JSON 文件，再在另一台电脑里使用 `导入预设`。重复参数的预设会在导入时跳过。

**为什么 macOS 提示无法验证开发者？**
这个 App 是本地打包版本，可能没有经过 notarization。请在 Finder 里右键 App，选择 `打开`，再确认一次。

**macOS 日志在哪里？**

```text
~/Library/Logs/Banana Batch Studio.log
```

**如何卸载？**
删除 App 包。如果不再需要任务记录和生成文件，再手动移除本地数据目录：

```text
~/Library/Application Support/BananaBatchStudio/
```

**要把打包好的 App 提交到 GitHub 吗？**
不要。GitHub 仓库只提交源码，`.app` 和 Windows 包放到 GitHub Releases。

## License

ISC
