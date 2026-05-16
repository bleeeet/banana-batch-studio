/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/client/App.jsx';

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function readClientCss() {
  return readFileSync(resolve(process.cwd(), 'src/client/main.css'), 'utf8');
}

function lastCssBlock(css, selector) {
  const start = css.lastIndexOf(selector);
  if (start === -1) return '';
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('App preset selection', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(URL, 'createObjectURL').mockImplementation((file) => `blob:preview-${file.name}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const path = String(url);
        if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: false });
        if (path.includes('/api/jobs')) return jsonResponse({ jobs: [] });
        return jsonResponse({});
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens with a blank preset while keeping one-off parameters available', () => {
    render(<App />);

    const presetSelect = screen.getByLabelText('选择预设');
    const referenceTitle = screen.getByText('参考图 / 垫图');
    const promptTitle = screen.getByText('统一提示词');
    expect(presetSelect.value).toBe('');
    expect(screen.getByText('API 密钥')).toBeTruthy();
    expect(screen.queryByText('Google API Key')).toBeNull();
    expect(promptTitle).toBeTruthy();
    expect(referenceTitle.compareDocumentPosition(promptTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('导入预设')).toBeTruthy();
    expect(screen.getByText('导出预设')).toBeTruthy();
    expect(screen.getByText('Gemini 3 Pro Image Preview')).toBeTruthy();
    expect(screen.getByLabelText('选择预设').value).toBe('');

    fireEvent.change(presetSelect, { target: { value: 'preset-2' } });

    expect(presetSelect.value).toBe('preset-2');
    expect(screen.getByText('统一提示词')).toBeTruthy();
    expect(screen.getByText('Gemini 3.1 Flash Image Preview')).toBeTruthy();
  });

  it('exports presets through the local app server instead of a browser download', async () => {
    const calls = [];
    fetch.mockImplementation(async (url, options = {}) => {
      const path = String(url);
      calls.push({ path, body: options.body ? JSON.parse(options.body) : null });
      if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: false });
      if (path.includes('/api/presets/export')) {
        return jsonResponse({
          saved: true,
          filename: 'banana-batch-studio-presets.json',
          path: '/Users/test/Downloads/banana-batch-studio-presets.json'
        });
      }
      if (path.includes('/api/jobs')) return jsonResponse({ jobs: [] });
      return jsonResponse({});
    });

    render(<App />);
    fireEvent.click(screen.getByText('导出预设'));

    await screen.findByText('预设文件已保存到下载文件夹：/Users/test/Downloads/banana-batch-studio-presets.json');
    const exportCall = calls.find((call) => call.path.includes('/api/presets/export'));
    expect(JSON.parse(exportCall.body.content)).toMatchObject({
      schemaVersion: 1,
      app: 'Banana Batch Studio',
      presets: expect.any(Array)
    });
  });

  it('imports preset files while skipping duplicate parameters', async () => {
    render(<App />);
    const importInput = document.querySelector('input[accept=".json,application/json"]');
    const file = new File(
      [
        JSON.stringify({
          schemaVersion: 1,
          app: 'Banana Batch Studio',
          presets: [
            {
              name: '重复参数',
              mode: 'realtime',
              prompt: '',
              settings: {
                model: 'gemini-3-pro-image-preview',
                aspectRatio: '1:1',
                imageSize: '1K',
                temperature: 1,
                requestStartDelayMs: 0
              }
            },
            {
              name: '新预设',
              mode: 'batch',
              prompt: 'new preset prompt',
              settings: {
                model: 'gemini-3.1-flash-image-preview',
                aspectRatio: '3:4',
                imageSize: '1K',
                temperature: 0.7,
                requestStartDelayMs: 500
              }
            }
          ]
        })
      ],
      'presets.json',
      { type: 'application/json' }
    );

    fireEvent.change(importInput, { target: { files: [file] } });

    await screen.findByText('已导入 1 个预设，跳过 1 个重复预设。');
    expect(screen.getByText('新预设')).toBeTruthy();
    expect(screen.queryByText('重复参数')).toBeNull();
  });

  it('defaults to Chinese and can switch the interface to English', () => {
    render(<App />);

    expect(screen.getByText('设置')).toBeTruthy();
    expect(screen.getByText('参考图 / 垫图')).toBeTruthy();
    expect(screen.getByText('由 bleetchen 开发')).toBeTruthy();
    expect(screen.getByText('BANANA可选模型')).toBeTruthy();
    expect(screen.getByText('原生API接入')).toBeTruthy();
    expect(screen.getByText('不接入三方服务器')).toBeTruthy();
    expect(screen.getByText('繁體中文')).toBeTruthy();
    expect(screen.getByText('日本語')).toBeTruthy();
    expect(screen.getByText('한국어')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('界面语言'), { target: { value: 'en' } });

    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Reference Images')).toBeTruthy();
    expect(screen.getByText('Developed by bleetchen')).toBeTruthy();
    expect(screen.getByLabelText('Interface Language')).toBeTruthy();
    expect(screen.getByText('100-image parallel processing')).toBeTruthy();
    expect(screen.getByText('Fast batch generation')).toBeTruthy();
    expect(screen.getByText('Google Official API')).toBeTruthy();
    expect(screen.getByText('Compatible Relay API')).toBeTruthy();
  });

  it('can switch to Traditional Chinese, Japanese, and Korean', () => {
    render(<App />);
    const languageSelect = screen.getByLabelText('界面语言');

    fireEvent.change(languageSelect, { target: { value: 'zh-Hant' } });
    expect(screen.getByText('設定')).toBeTruthy();
    expect(screen.getByLabelText('介面語言')).toBeTruthy();
    expect(screen.getByText('Google 官方 API')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('介面語言'), { target: { value: 'ja' } });
    expect(screen.getByText('設定')).toBeTruthy();
    expect(screen.getByLabelText('表示言語')).toBeTruthy();
    expect(screen.getByText('Google 公式 API')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('表示言語'), { target: { value: 'ko' } });
    expect(screen.getByText('설정')).toBeTruthy();
    expect(screen.getByLabelText('인터페이스 언어')).toBeTruthy();
    expect(screen.getByText('Google 공식 API')).toBeTruthy();
  });

  it('shows developer GitHub and X links in the footer', () => {
    const { container } = render(<App />);

    expect(screen.getByRole('link', { name: /GitHub/i })).toMatchObject({
      href: 'https://github.com/bleeeet',
      target: '_blank'
    });
    expect(screen.getByRole('link', { name: 'X' })).toMatchObject({
      href: 'https://x.com/bleetchen',
      target: '_blank'
    });
    expect(container.querySelector('[data-brand-icon="github"]')).toBeTruthy();
    expect(container.querySelector('[data-brand-icon="x"]')).toBeTruthy();
  });

  it('uses overlaying file inputs for chooser controls', () => {
    const { container } = render(<App />);

    for (const id of ['image-file-picker', 'image-folder-picker', 'reference-file-picker']) {
      const picker = container.querySelector(`#${id}`);
      expect(picker.hasAttribute('hidden')).toBe(true);
    }
  });

  it('opens the native picker when chooser buttons are clicked', () => {
    const { container } = render(<App />);
    const imagePicker = container.querySelector('#image-file-picker');
    const folderPicker = container.querySelector('#image-folder-picker');
    const referencePicker = container.querySelector('#reference-file-picker');
    const imageClick = vi.spyOn(imagePicker, 'click').mockImplementation(() => {});
    const folderClick = vi.spyOn(folderPicker, 'click').mockImplementation(() => {});
    const referenceClick = vi.spyOn(referencePicker, 'click').mockImplementation(() => {});

    fireEvent.click(screen.getByText('选图片'));
    fireEvent.click(screen.getByText('选文件夹'));
    fireEvent.click(screen.getByText('添加参考图'));

    expect(imageClick).toHaveBeenCalledTimes(1);
    expect(folderClick).toHaveBeenCalledTimes(1);
    expect(referenceClick).toHaveBeenCalledTimes(1);
  });

  it('accepts image files from a dropped folder entry', async () => {
    const { container } = render(<App />);
    const file = new File(['folder-image'], 'folder-image.png', { type: 'image/png' });
    let directoryReadCount = 0;
    const directoryEntry = {
      isDirectory: true,
      createReader: () => ({
        readEntries: (callback) => {
          directoryReadCount += 1;
          callback(
            directoryReadCount === 1
              ? [
                  {
                    isFile: true,
                    file: (resolveFile) => resolveFile(file)
                  }
                ]
              : []
          );
        }
      })
    };

    fireEvent.drop(container.querySelector('.dropzone'), {
      dataTransfer: {
        files: [],
        items: [{ webkitGetAsEntry: () => directoryEntry }]
      }
    });

    expect(await screen.findAllByText('folder-image.png')).not.toHaveLength(0);
  });

  it('renders the flow as connected canvas nodes with animated processing lines', () => {
    const css = readClientCss();
    const { container } = render(<App />);
    const connectorBlock = lastCssBlock(css, '.flow-link::before');
    const flowBlock = lastCssBlock(css, '.studio-flow');
    const bodyBeforeBlock = lastCssBlock(css, 'body::before');

    expect(css).toContain('--flow-anchor-y: 50%;');
    expect(css).toContain('align-items: center;');
    expect(css).toContain('--connector-flow');
    expect(css).toContain('--connector-energy');
    expect(css).toContain('animation: connector-energy 1.25s linear infinite;');
    expect(css).toContain('@keyframes connector-flow');
    expect(css).toContain('@keyframes connector-energy');
    expect(css).toContain('.upload-panel,\n.results-panel');
    expect(css).toContain('top: var(--flow-anchor-y);');
    expect(connectorBlock).toContain('height: 2px;');
    expect(connectorBlock).toContain('border: 0;');
    expect(connectorBlock).toContain('background-size: 100% 100%, 260% 100%;');
    expect(connectorBlock).not.toContain('repeating-linear-gradient');
    expect(lastCssBlock(css, '.flow-link.active::before')).not.toContain('animation:');
    expect(lastCssBlock(css, '.flow-link::after')).toContain('display: none;');
    expect(flowBlock).toContain('backdrop-filter: blur(34px) saturate(1.35);');
    expect(flowBlock).toContain('border: 0;');
    expect(flowBlock).toContain('box-shadow: none;');
    expect(flowBlock).not.toContain('border-color: rgba(255, 255, 255, 0.52);');
    expect(flowBlock).not.toContain('background-size: 28px 28px, 56px 56px, 56px 56px, auto;');
    expect(flowBlock).not.toContain('linear-gradient(rgba(60, 60, 67, 0.045) 1px, transparent 1px)');
    expect(bodyBeforeBlock).toContain('filter: blur(42px);');
    expect(bodyBeforeBlock).not.toContain('background-size: 42px 42px;');
    expect(container.querySelectorAll('.flow-link span')).toHaveLength(0);
  });

  it('styles job name hover without the blue button fill', () => {
    const css = readClientCss();
    const hoverBlock = lastCssBlock(css, '.job-select:hover:not(:disabled)');

    expect(css).toContain('.job-select:hover:not(:disabled)');
    expect(hoverBlock).toContain('color: var(--ink);');
    expect(hoverBlock).not.toContain('text-decoration: underline;');
    expect(hoverBlock).not.toContain('color: var(--accent-strong);');
    expect(hoverBlock).not.toContain('background: linear-gradient(180deg, #2392ff, #007aff);');
  });

  it('shows a bottom-right canvas zoom slider that only scales the three-panel workspace', () => {
    const css = readClientCss();
    const { container } = render(<App />);
    const slider = screen.getByLabelText('页面大小');
    const viewport = container.querySelector('.canvas-viewport');

    expect(slider).toMatchObject({
      type: 'range',
      min: '70',
      max: '100',
      step: '5',
      value: '100'
    });
    expect(screen.getByText('100%')).toBeTruthy();
    expect(viewport).toBeTruthy();
    expect(viewport.querySelector('.studio-flow')).toBeTruthy();
    expect(viewport.querySelector('.topbar')).toBeNull();
    expect(viewport.querySelector('.capability-bar')).toBeNull();
    expect(container.querySelector('.canvas-stage')).toBeTruthy();
    expect(container.querySelector('.app').style.getPropertyValue('--canvas-scale')).toBe('1');
    expect(css).toContain('.canvas-scale-control');
    expect(css).toContain('position: fixed;');
    expect(css).toContain('transform: scale(var(--canvas-scale));');
    expect(css).toContain('width: calc(100% / var(--canvas-scale));');
  });

  it('persists canvas zoom changes for the next launch', () => {
    const { unmount } = render(<App />);
    fireEvent.change(screen.getByLabelText('页面大小'), { target: { value: '85' } });

    expect(screen.getByText('85%')).toBeTruthy();
    expect(localStorage.getItem('banana-batch-studio:canvas-scale')).toBe('85');

    unmount();
    render(<App />);

    expect(screen.getByLabelText('页面大小').value).toBe('85');
    expect(screen.getByText('85%')).toBeTruthy();
  });

  it('places the retry failed action on its own result action row', async () => {
    const css = readClientCss();
    fetch.mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: true });
      if (path.includes('/api/jobs')) {
        return jsonResponse({
          jobs: [
            {
              id: 'job-1',
              mode: 'realtime',
              status: 'failed',
              createdAt: '2026-05-11T06:00:00.000Z',
              updatedAt: '2026-05-11T06:00:00.000Z',
              items: [
                {
                  id: 'item-1',
                  originalName: 'a.png',
                  status: 'failed',
                  outputName: null
                }
              ]
            }
          ]
        });
      }
      return jsonResponse({});
    });
    const { container } = render(<App />);

    await screen.findByText('重试失败项');
    expect(container.querySelector('.retry-failed-button')).toBeTruthy();
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) minmax(112px, 0.7fr);');
    expect(css).toContain('.retry-failed-button');
    expect(css).toContain('grid-column: 1 / -1;');
  });

  it('places prompt editing above retry and rebuild below retry in result actions', async () => {
    fetch.mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: true });
      if (path.includes('/api/jobs')) {
        return jsonResponse({
          jobs: [
            {
              id: 'job-1',
              mode: 'realtime',
              status: 'failed',
              prompt: 'old prompt',
              createdAt: '2026-05-11T06:00:00.000Z',
              updatedAt: '2026-05-11T06:00:00.000Z',
              items: [{ id: 'item-1', originalName: 'a.png', status: 'failed', outputName: null }]
            }
          ]
        });
      }
      return jsonResponse({});
    });

    render(<App />);

    const editPrompt = await screen.findByText('更改统一提示词');
    const retry = screen.getByText('重试失败项');
    const rebuild = screen.getByText('重建该任务');
    expect(editPrompt.compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(retry.compareDocumentPosition(rebuild) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('selects a job from the whole job row instead of only the title', async () => {
    fetch.mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: true });
      if (path.includes('/api/jobs')) {
        return jsonResponse({
          jobs: [
            {
              id: 'job-1',
              mode: 'realtime',
              status: 'completed',
              createdAt: '2026-05-11T06:00:00.000Z',
              updatedAt: '2026-05-11T06:00:00.000Z',
              items: [
                {
                  id: 'item-1',
                  originalName: 'first.png',
                  status: 'succeeded',
                  outputName: 'first_gemini.png'
                }
              ]
            },
            {
              id: 'job-2',
              mode: 'realtime',
              status: 'completed',
              createdAt: '2026-05-12T06:00:00.000Z',
              updatedAt: '2026-05-12T06:00:00.000Z',
              items: [
                {
                  id: 'item-2',
                  originalName: 'second.png',
                  status: 'succeeded',
                  outputName: 'second_gemini.png'
                },
                {
                  id: 'item-3',
                  originalName: 'third.png',
                  status: 'succeeded',
                  outputName: 'third_gemini.png'
                }
              ]
            }
          ]
        });
      }
      return jsonResponse({});
    });

    render(<App />);

    const secondRow = (await screen.findByText('2/2')).closest('.job-table-row');
    fireEvent.click(secondRow);

    await waitFor(() => expect(screen.getByText('2/2').closest('.job-table-row').className).toContain('active'));
  });

  it('limits the job history to three visible rows with internal scrolling', () => {
    const css = readClientCss();
    const tableBlock = lastCssBlock(css, '.job-table');

    expect(css).toContain('--job-row-height:');
    expect(tableBlock).toContain('max-height: calc(var(--job-row-height) * 3 + 20px);');
    expect(tableBlock).toContain('overflow-y: auto;');
    expect(tableBlock).toContain('overscroll-behavior: contain;');
  });

  it('keeps text labels visible on chooser controls', () => {
    render(<App />);

    expect(screen.getByText('选图片').closest('button.file-picker-button')).toBeTruthy();
    expect(screen.getByText('选文件夹').closest('button.file-picker-button')).toBeTruthy();
    expect(screen.getByText('添加参考图').closest('button.file-picker-button')).toBeTruthy();
  });

  it('previews selected images as a controlled stacked image deck', () => {
    const css = readClientCss();
    const { container } = render(<App />);
    const imageInput = container.querySelector('input[name="images"]');

    fireEvent.change(imageInput, {
      target: {
        files: [
          new File(['one'], 'one.png', { type: 'image/png' }),
          new File(['two'], 'two.jpg', { type: 'image/jpeg' }),
          new File(['three'], 'three.webp', { type: 'image/webp' }),
          new File(['four'], 'four.png', { type: 'image/png' })
        ]
      }
    });

    const previews = container.querySelectorAll('.upload-stack-card img');
    expect(previews).toHaveLength(3);
    expect(previews[0].getAttribute('src')).toBe('blob:preview-one.png');
    expect(previews[0].getAttribute('alt')).toBe('one.png');
    expect(screen.getByText('+1')).toBeTruthy();
    expect(screen.getByText('four.png')).toBeTruthy();
    expect(css).toContain('min-height: 156px;');
    expect(css).toContain('margin: 22px 0 20px;');
    expect(css).toContain('width: min(58%, 214px);');
  });

  it('clears only current source images without removing reference images', () => {
    const { container } = render(<App />);
    const imageInput = container.querySelector('input[name="images"]');
    const referenceInput = container.querySelector('input[name="referenceImages"]');

    fireEvent.change(imageInput, {
      target: {
        files: [new File(['one'], 'one.png', { type: 'image/png' })]
      }
    });
    fireEvent.change(referenceInput, {
      target: {
        files: [new File(['ref'], 'ref.png', { type: 'image/png' })]
      }
    });

    fireEvent.click(screen.getByText('清空当前图片'));

    expect(container.querySelectorAll('.upload-stack-card img')).toHaveLength(0);
    expect(screen.getByText('1 张参考图')).toBeTruthy();
  });

  it('lets the user set maximum realtime concurrency without following the uploaded image count', () => {
    const { container } = render(<App />);
    const imageInput = container.querySelector('input[type="file"]');
    const files = Array.from({ length: 12 }, (_, index) => new File(['x'], `image-${index}.png`, { type: 'image/png' }));

    fireEvent.change(imageInput, { target: { files } });

    const concurrency = screen.getByLabelText('最大并发');
    expect(concurrency.value).toBe('10');
    expect(concurrency.disabled).toBe(false);
    expect(screen.getByText('当前会同时生成 10 张，其余排队。')).toBeTruthy();

    fireEvent.change(concurrency, { target: { value: '4' } });

    expect(screen.getByText('当前会同时生成 4 张，其余排队。')).toBeTruthy();
  });

  it('shows relay API key and address together when relay mode is selected', () => {
    render(<App />);

    expect(screen.queryByLabelText('中转 API 地址')).toBeNull();

    fireEvent.change(screen.getByLabelText('API 通道'), { target: { value: 'geminiProxy' } });

    expect(screen.getByLabelText('中转 API 密钥')).toBeTruthy();
    expect(screen.getByLabelText('中转 API 地址')).toBeTruthy();
    expect(screen.queryByLabelText('API 版本')).toBeNull();
    expect(screen.queryByLabelText('额外请求头')).toBeNull();
    expect(screen.queryByLabelText('请求头内容')).toBeNull();
    expect(screen.getByText(/预览：/).textContent).toContain('/v1beta/models');
  });

  it('shows OpenAI native API models and OpenAI size options', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('API 通道'), { target: { value: 'openai' } });

    expect(screen.getByLabelText('API 密钥')).toBeTruthy();
    expect(screen.getByText('GPT Image 2')).toBeTruthy();
    expect(screen.getByLabelText('模型').value).toBe('gpt-image-2');
    const sizeOptions = Array.from(screen.getByText('尺寸').parentElement.querySelectorAll('option')).map((option) => option.value);
    expect(sizeOptions).toEqual(['auto', '1024x1024', '1536x1024', '1024x1536']);
    expect(screen.queryByText('检测 Batch API')).toBeNull();
  });

  it('restores the last relay API address on the next launch', () => {
    localStorage.setItem('banana-batch-studio:relay-api-base-url', 'https://api.vectorengine.ai');

    render(<App />);
    fireEvent.change(screen.getByLabelText('API 通道'), { target: { value: 'geminiProxy' } });

    expect(screen.getByLabelText('中转 API 地址').value).toBe('https://api.vectorengine.ai');
    expect(screen.getByText(/预览：/).textContent).toContain('https://api.vectorengine.ai/v1beta/models');
  });

  it('saves relay API address edits for later launches', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('API 通道'), { target: { value: 'geminiProxy' } });
    fireEvent.change(screen.getByLabelText('中转 API 地址'), { target: { value: 'https://relay.example.com/' } });

    expect(localStorage.getItem('banana-batch-studio:relay-api-base-url')).toBe('https://relay.example.com/');
  });

  it('loads relay models and lets the user choose one', async () => {
    fetch.mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: true });
      if (path.includes('/api/settings/models')) {
        return jsonResponse({
          models: [
            { id: 'gemini-3-pro-image-preview', label: 'gemini-3-pro-image-preview' },
            { id: 'gemini-3.1-flash-image-preview', label: 'gemini-3.1-flash-image-preview' }
          ]
        });
      }
      if (path.includes('/api/jobs')) return jsonResponse({ jobs: [] });
      return jsonResponse({});
    });
    render(<App />);

    fireEvent.change(screen.getByLabelText('API 通道'), { target: { value: 'geminiProxy' } });
    fireEvent.change(screen.getByLabelText('中转 API 密钥'), { target: { value: 'sk-live' } });
    fireEvent.change(screen.getByLabelText('中转 API 地址'), { target: { value: 'https://api.vectorengine.ai' } });
    await waitFor(() => expect(screen.getByText(/预览：/).textContent).toContain('https://api.vectorengine.ai/v1beta/models'));
    await waitFor(() => expect(screen.getByText('获取模型列表').closest('button').disabled).toBe(false));
    fireEvent.click(screen.getByText('获取模型列表'));

    const model = await screen.findByText('gemini-3.1-flash-image-preview');
    fireEvent.click(model);

    expect(screen.getByDisplayValue('gemini-3.1-flash-image-preview')).toBeTruthy();
  });

  it('keeps size options available after choosing a relay-only model', async () => {
    fetch.mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: true });
      if (path.includes('/api/settings/models')) {
        return jsonResponse({
          models: [{ id: 'gemini-2.5-flash-image-preview', label: 'Gemini 2.5 Flash Image Preview' }]
        });
      }
      if (path.includes('/api/jobs')) return jsonResponse({ jobs: [] });
      return jsonResponse({});
    });
    render(<App />);

    fireEvent.change(screen.getByLabelText('API 通道'), { target: { value: 'geminiProxy' } });
    fireEvent.change(screen.getByLabelText('中转 API 地址'), { target: { value: 'https://api.vectorengine.ai' } });
    await waitFor(() => expect(screen.getByText(/预览：/).textContent).toContain('https://api.vectorengine.ai/v1beta/models'));
    fireEvent.click(screen.getByText('获取模型列表'));
    fireEvent.click(await screen.findByText('gemini-2.5-flash-image-preview'));

    expect(screen.getByText('尺寸').parentElement.querySelectorAll('option')).toHaveLength(4);
    expect(screen.getByDisplayValue('1K')).toBeTruthy();
  });

  it('submits an official model after switching back from a relay-only model', async () => {
    const calls = [];
    fetch.mockImplementation(async (url, options = {}) => {
      const path = String(url);
      calls.push({ path, body: options.body instanceof FormData ? options.body : options.body ? JSON.parse(options.body) : null });
      if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: true });
      if (path.includes('/api/jobs/realtime') && options.method === 'POST') {
        return jsonResponse(
          {
            job: {
              id: 'job-official',
              mode: 'realtime',
              status: 'running',
              createdAt: '2026-05-11T06:00:00.000Z',
              updatedAt: '2026-05-11T06:00:00.000Z',
              items: []
            }
          },
          { status: 201 }
        );
      }
      if (path.includes('/api/jobs')) return jsonResponse({ jobs: [] });
      return jsonResponse({});
    });
    const { container } = render(<App />);
    const imageInput = container.querySelector('input[type="file"]');

    fireEvent.change(screen.getByLabelText('API 通道'), { target: { value: 'geminiProxy' } });
    fireEvent.change(screen.getByLabelText('模型'), { target: { value: 'gemini-2.5-flash-image-preview' } });
    expect(screen.getByDisplayValue('gemini-2.5-flash-image-preview')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('API 通道'), { target: { value: 'official' } });
    await waitFor(() => expect(screen.getByDisplayValue('Gemini 3 Pro Image Preview')).toBeTruthy());
    fireEvent.change(screen.getByText('统一提示词').nextElementSibling, { target: { value: 'make it clean' } });
    fireEvent.change(imageInput, { target: { files: [new File(['x'], 'image.png', { type: 'image/png' })] } });
    fireEvent.click(screen.getByText(/开始生成/));

    await screen.findByText('实时并行任务已开始。');
    const submitted = calls.find((call) => call.path.includes('/api/jobs/realtime')).body;
    expect(JSON.parse(submitted.get('settings'))).toMatchObject({
      model: 'gemini-3-pro-image-preview',
      apiProvider: 'official'
    });
  });

  it('sends the typed relay key when testing before saving', async () => {
    const calls = [];
    fetch.mockImplementation(async (url, options = {}) => {
      const path = String(url);
      calls.push({ path, body: options.body ? JSON.parse(options.body) : null });
      if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: false });
      if (path.includes('/api/settings/test')) return jsonResponse({ ok: true, model: 'gemini-3.1-flash-image-preview' });
      if (path.includes('/api/jobs')) return jsonResponse({ jobs: [] });
      return jsonResponse({});
    });
    render(<App />);

    fireEvent.change(screen.getByLabelText('API 通道'), { target: { value: 'geminiProxy' } });
    fireEvent.change(screen.getByLabelText('中转 API 密钥'), { target: { value: 'sk-live' } });
    fireEvent.change(screen.getByLabelText('中转 API 地址'), { target: { value: 'https://api.vectorengine.ai' } });
    fireEvent.click(screen.getByText('检测 API 密钥和当前模型'));

    await screen.findByText('连接正常：gemini-3.1-flash-image-preview');
    expect(calls.find((call) => call.path.includes('/api/settings/test')).body).toMatchObject({
      apiKey: 'sk-live',
      apiProvider: 'geminiProxy',
      apiBaseUrl: 'https://api.vectorengine.ai'
    });
  });

  it('saves a typed key before starting a job', async () => {
    const calls = [];
    fetch.mockImplementation(async (url, options = {}) => {
      const path = String(url);
      calls.push({ path, body: options.body instanceof FormData ? options.body : options.body ? JSON.parse(options.body) : null });
      if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: false });
      if (path.includes('/api/settings/key')) return jsonResponse({ saved: true, hasApiKey: true });
      if (path.includes('/api/jobs/realtime') && options.method === 'POST') {
        return jsonResponse(
          {
            job: {
              id: 'job-new',
              mode: 'realtime',
              status: 'running',
              createdAt: '2026-05-11T06:00:00.000Z',
              updatedAt: '2026-05-11T06:00:00.000Z',
              items: []
            }
          },
          { status: 201 }
        );
      }
      if (path.includes('/api/jobs')) return jsonResponse({ jobs: [] });
      return jsonResponse({});
    });
    const { container } = render(<App />);
    const imageInput = container.querySelector('input[type="file"]');

    fireEvent.change(screen.getByLabelText('API 通道'), { target: { value: 'geminiProxy' } });
    fireEvent.change(screen.getByLabelText('中转 API 密钥'), { target: { value: 'relay-test-key-unsaved' } });
    fireEvent.change(screen.getByLabelText('中转 API 地址'), { target: { value: 'https://api.vectorengine.ai' } });
    fireEvent.change(screen.getByText('统一提示词').nextElementSibling, { target: { value: 'make it clean' } });
    fireEvent.change(imageInput, { target: { files: [new File(['x'], 'image.png', { type: 'image/png' })] } });
    fireEvent.click(screen.getByText(/开始生成/));

    await screen.findByText('实时并行任务已开始。');
    expect(calls.find((call) => call.path.includes('/api/settings/key')).body).toEqual({
      apiKey: 'relay-test-key-unsaved',
      apiProvider: 'geminiProxy',
      name: expect.any(String),
      apiBaseUrl: 'https://api.vectorengine.ai',
      apiVersion: '',
      apiHeaderName: '',
      apiHeaderValue: ''
    });
  });

  it('saves a named relay key profile with its relay API address', async () => {
    const calls = [];
    fetch.mockImplementation(async (url, options = {}) => {
      const path = String(url);
      calls.push({ path, body: options.body ? JSON.parse(options.body) : null });
      if (path.includes('/api/health')) {
        return jsonResponse({
          ok: true,
          hasApiKey: false,
          apiKeys: { official: false, openai: false, geminiProxy: false },
          apiKeyProfiles: { official: [], openai: [], geminiProxy: [] }
        });
      }
      if (path.includes('/api/settings/key')) {
        return jsonResponse({
          saved: true,
          hasApiKey: true,
          apiProvider: 'geminiProxy',
          profile: { id: 'relay-profile-1', name: '中转一', hasApiKey: true, apiBaseUrl: 'https://relay.example.com' },
          apiKeys: { official: false, openai: false, geminiProxy: true },
          apiKeyProfiles: {
            official: [],
            openai: [],
            geminiProxy: [{ id: 'relay-profile-1', name: '中转一', hasApiKey: true, apiBaseUrl: 'https://relay.example.com' }]
          }
        });
      }
      if (path.includes('/api/jobs')) return jsonResponse({ jobs: [] });
      return jsonResponse({});
    });
    render(<App />);

    fireEvent.change(screen.getByLabelText('API 通道'), { target: { value: 'geminiProxy' } });
    fireEvent.change(screen.getByLabelText('密钥名称'), { target: { value: '中转一' } });
    fireEvent.change(screen.getByLabelText('中转 API 密钥'), { target: { value: 'relay-test-key' } });
    fireEvent.change(screen.getByLabelText('中转 API 地址'), { target: { value: 'https://relay.example.com/' } });
    fireEvent.click(screen.getByText('保存'));

    await screen.findByText('API 密钥已保存到此 App 的本地文件。');
    expect(calls.find((call) => call.path.includes('/api/settings/key')).body).toEqual({
      apiKey: 'relay-test-key',
      apiProvider: 'geminiProxy',
      name: '中转一',
      apiBaseUrl: 'https://relay.example.com/',
      apiVersion: '',
      apiHeaderName: '',
      apiHeaderValue: ''
    });
    expect(screen.getByLabelText('已保存密钥').value).toBe('relay-profile-1');
  });

  it('restores the relay API address when selecting a saved relay profile', async () => {
    fetch.mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes('/api/health')) {
        return jsonResponse({
          ok: true,
          hasApiKey: true,
          apiKeys: { official: false, openai: false, geminiProxy: true },
          apiKeyProfiles: {
            official: [],
            openai: [],
            geminiProxy: [
              { id: 'relay-profile-1', name: '中转一', hasApiKey: true, apiBaseUrl: 'https://relay-one.example.com' },
              { id: 'relay-profile-2', name: '中转二', hasApiKey: true, apiBaseUrl: 'https://relay-two.example.com' }
            ]
          }
        });
      }
      if (path.includes('/api/jobs')) return jsonResponse({ jobs: [] });
      return jsonResponse({});
    });
    render(<App />);

    fireEvent.change(screen.getByLabelText('API 通道'), { target: { value: 'geminiProxy' } });
    await screen.findByText('中转二');
    fireEvent.change(screen.getByLabelText('已保存密钥'), { target: { value: 'relay-profile-2' } });

    expect(screen.getByLabelText('中转 API 地址').value).toBe('https://relay-two.example.com');
  });

  it('deletes the selected saved key profile from the current channel', async () => {
    const calls = [];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fetch.mockImplementation(async (url, options = {}) => {
      const path = String(url);
      calls.push({ path, method: options.method || 'GET' });
      if (path.includes('/api/health')) {
        return jsonResponse({
          ok: true,
          hasApiKey: true,
          apiKeys: { official: true, openai: false, geminiProxy: false },
          apiKeyProfiles: {
            official: [{ id: 'official-profile-1', name: '官方一', hasApiKey: true }],
            openai: [],
            geminiProxy: []
          }
        });
      }
      if (path.includes('/api/settings/key/official/official-profile-1')) {
        return jsonResponse({
          deleted: true,
          apiKeys: { official: false, openai: false, geminiProxy: false },
          apiKeyProfiles: { official: [], openai: [], geminiProxy: [] }
        });
      }
      if (path.includes('/api/jobs')) return jsonResponse({ jobs: [] });
      return jsonResponse({});
    });
    render(<App />);

    await screen.findByText('官方一');
    fireEvent.click(screen.getByText('删除密钥'));

    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE' && call.path.includes('/api/settings/key/official/official-profile-1'))).toBe(true));
    expect(screen.queryByText('官方一')).toBeNull();
  });

  it('starts a job with a selected saved key profile without typing the key again', async () => {
    const calls = [];
    fetch.mockImplementation(async (url, options = {}) => {
      const path = String(url);
      calls.push({ path, body: options.body instanceof FormData ? options.body : options.body ? JSON.parse(options.body) : null });
      if (path.includes('/api/health')) {
        return jsonResponse({
          ok: true,
          hasApiKey: true,
          apiKeys: { official: false, openai: false, geminiProxy: true },
          apiKeyProfiles: {
            official: [],
            openai: [],
            geminiProxy: [{ id: 'relay-profile-1', name: '中转一', hasApiKey: true, apiBaseUrl: 'https://relay.example.com' }]
          }
        });
      }
      if (path.includes('/api/jobs/realtime') && options.method === 'POST') {
        return jsonResponse(
          {
            job: {
              id: 'job-profile',
              mode: 'realtime',
              status: 'running',
              createdAt: '2026-05-11T06:00:00.000Z',
              updatedAt: '2026-05-11T06:00:00.000Z',
              items: []
            }
          },
          { status: 201 }
        );
      }
      if (path.includes('/api/jobs')) return jsonResponse({ jobs: [] });
      return jsonResponse({});
    });
    const { container } = render(<App />);
    const imageInput = container.querySelector('input[type="file"]');

    fireEvent.change(screen.getByLabelText('API 通道'), { target: { value: 'geminiProxy' } });
    await screen.findByText('中转一');
    fireEvent.change(screen.getByText('统一提示词').nextElementSibling, { target: { value: 'make it clean' } });
    fireEvent.change(imageInput, { target: { files: [new File(['x'], 'image.png', { type: 'image/png' })] } });
    fireEvent.click(screen.getByText(/开始生成/));

    await screen.findByText('实时并行任务已开始。');
    const submitted = calls.find((call) => call.path.includes('/api/jobs/realtime')).body;
    expect(JSON.parse(submitted.get('settings'))).toMatchObject({
      apiProvider: 'geminiProxy',
      apiKeyProfileId: 'relay-profile-1',
      apiBaseUrl: 'https://relay.example.com'
    });
    expect(calls.some((call) => call.path.includes('/api/settings/key'))).toBe(false);
  });

  it('submits reference images separately from source images', async () => {
    const calls = [];
    fetch.mockImplementation(async (url, options = {}) => {
      const path = String(url);
      calls.push({ path, body: options.body instanceof FormData ? options.body : options.body ? JSON.parse(options.body) : null });
      if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: true });
      if (path.includes('/api/jobs/realtime') && options.method === 'POST') {
        return jsonResponse(
          {
            job: {
              id: 'job-with-references',
              mode: 'realtime',
              status: 'running',
              createdAt: '2026-05-11T06:00:00.000Z',
              updatedAt: '2026-05-11T06:00:00.000Z',
              items: []
            }
          },
          { status: 201 }
        );
      }
      if (path.includes('/api/jobs')) return jsonResponse({ jobs: [] });
      return jsonResponse({});
    });
    const { container } = render(<App />);
    const imageInput = container.querySelector('input[name="images"]');
    const referenceInput = container.querySelector('input[name="referenceImages"]');

    fireEvent.change(screen.getByText('统一提示词').nextElementSibling, { target: { value: 'use the reference style' } });
    fireEvent.change(imageInput, {
      target: {
        files: [
          new File(['main-a'], 'main-a.png', { type: 'image/png' }),
          new File(['main-b'], 'main-b.png', { type: 'image/png' })
        ]
      }
    });
    fireEvent.change(referenceInput, {
      target: {
        files: [
          new File(['ref-a'], 'ref-a.png', { type: 'image/png' }),
          new File(['ref-b'], 'ref-b.png', { type: 'image/png' })
        ]
      }
    });

    expect(screen.getByText('2 张参考图')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/开始生成/).closest('button').disabled).toBe(false));
    fireEvent.click(screen.getByText(/开始生成/));

    await screen.findByText('实时并行任务已开始。');
    const submitted = calls.find((call) => call.path.includes('/api/jobs/realtime')).body;
    expect(submitted.getAll('images')).toHaveLength(2);
    expect(submitted.getAll('referenceImages')).toHaveLength(2);
    expect(submitted.get('prompt')).toBe('use the reference style');
  });

  it('renders job and item statuses in Chinese', async () => {
    fetch.mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: true });
      if (path.includes('/api/jobs')) {
        return jsonResponse({
          jobs: [
            {
              id: 'job-1',
              mode: 'realtime',
              status: 'completed',
              createdAt: '2026-05-11T06:00:00.000Z',
              updatedAt: '2026-05-11T06:00:00.000Z',
              items: [
                {
                  id: 'item-1',
                  originalName: 'a.png',
                  status: 'succeeded',
                  outputName: 'a_gemini.png'
                }
              ]
            }
          ]
        });
      }
      return jsonResponse({});
    });

    render(<App />);

    expect(await screen.findByText('已完成')).toBeTruthy();
    expect(screen.getByText('成功')).toBeTruthy();
    expect(screen.queryByText('completed')).toBeNull();
    expect(screen.queryByText('succeeded')).toBeNull();
  });

  it('deletes a job after the in-app confirmation is accepted', async () => {
    const calls = [];
    fetch.mockImplementation(async (url, options = {}) => {
      const path = String(url);
      calls.push({ path, method: options.method || 'GET' });
      if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: true });
      if (path.includes('/api/jobs/job-1') && options.method === 'DELETE') {
        return jsonResponse({ deleted: true });
      }
      if (path.includes('/api/jobs')) {
        const deleted = calls.some((call) => call.path.includes('/api/jobs/job-1') && call.method === 'DELETE');
        return jsonResponse({
          jobs: deleted
            ? []
            : [
                {
                  id: 'job-1',
                  mode: 'realtime',
                  status: 'completed',
                  createdAt: '2026-05-11T06:00:00.000Z',
                  updatedAt: '2026-05-11T06:00:00.000Z',
                  items: [
                    {
                      id: 'item-1',
                      originalName: 'a.png',
                      status: 'succeeded',
                      outputName: 'a_gemini.png'
                    }
                  ]
                }
              ]
        });
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByText('删除任务记录'));
    expect(screen.getByRole('dialog', { name: '删除任务记录' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    await screen.findByText('任务记录已删除。');
    expect(calls).toContainEqual({ path: '/api/jobs/job-1', method: 'DELETE' });
    expect(screen.getAllByText('任务会出现在这里。').length).toBeGreaterThan(0);
  });

  it('saves a changed job prompt without retrying immediately', async () => {
    const calls = [];
    let currentPrompt = 'old prompt';
    fetch.mockImplementation(async (url, options = {}) => {
      const path = String(url);
      calls.push({ path, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
      if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: true });
      if (path.includes('/api/jobs/job-1/prompt') && options.method === 'PATCH') {
        currentPrompt = JSON.parse(options.body).prompt;
        return jsonResponse({
          job: {
            id: 'job-1',
            mode: 'realtime',
            status: 'failed',
            prompt: currentPrompt,
            createdAt: '2026-05-11T06:00:00.000Z',
            updatedAt: '2026-05-11T06:00:01.000Z',
            items: [{ id: 'item-1', originalName: 'a.png', status: 'failed', outputName: null }]
          }
        });
      }
      if (path.includes('/api/jobs')) {
        return jsonResponse({
          jobs: [
            {
              id: 'job-1',
              mode: 'realtime',
              status: 'failed',
              prompt: currentPrompt,
              createdAt: '2026-05-11T06:00:00.000Z',
              updatedAt: '2026-05-11T06:00:00.000Z',
              items: [{ id: 'item-1', originalName: 'a.png', status: 'failed', outputName: null }]
            }
          ]
        });
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByText('更改统一提示词'));
    const textarea = screen.getByLabelText('新的统一提示词');
    expect(textarea.value).toBe('old prompt');
    fireEvent.change(textarea, { target: { value: 'new prompt' } });
    fireEvent.click(screen.getByRole('button', { name: '保存提示词' }));

    await screen.findByText('统一提示词已保存，重新生成时会使用新提示词。');
    expect(calls).toContainEqual({
      path: '/api/jobs/job-1/prompt',
      method: 'PATCH',
      body: { prompt: 'new prompt' }
    });
    expect(calls.some((call) => call.path === '/api/jobs/job-1/retry')).toBe(false);
  });

  it('restores a selected job into the editor and starts rebuild as a new task', async () => {
    const calls = [];
    fetch.mockImplementation(async (url, options = {}) => {
      const path = String(url);
      calls.push({ path, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
      if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: true });
      if (path.includes('/api/jobs/job-1/rebuild') && options.method === 'POST') {
        return jsonResponse(
          {
            job: {
              id: 'job-new',
              mode: 'realtime',
              status: 'running',
              prompt: 'restore prompt',
              createdAt: '2026-05-11T06:10:00.000Z',
              updatedAt: '2026-05-11T06:10:00.000Z',
              items: []
            }
          },
          { status: 201 }
        );
      }
      if (path.includes('/api/jobs')) {
        return jsonResponse({
          jobs: [
            {
              id: 'job-1',
              mode: 'realtime',
              status: 'completed',
              prompt: 'restore prompt',
              presetName: '预设名字',
              settings: {
                model: 'gemini-3.1-flash-image-preview',
                aspectRatio: '3:4',
                imageSize: '1K',
                temperature: 0.7,
                requestStartDelayMs: 500,
                maxConcurrency: 4,
                apiProvider: 'official'
              },
              referenceImages: [{ originalName: 'ref.png', mimeType: 'image/png', path: '/tmp/ref.png' }],
              createdAt: '2026-05-11T06:00:00.000Z',
              updatedAt: '2026-05-11T06:00:00.000Z',
              items: [
                {
                  id: 'item-1',
                  originalName: 'main.png',
                  mimeType: 'image/png',
                  inputPath: '/tmp/main.png',
                  status: 'succeeded',
                  outputName: 'main_gemini.png'
                }
              ]
            }
          ]
        });
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByText('重建该任务'));
    expect(screen.getAllByText('main.png').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ref.png').length).toBeGreaterThan(0);
    expect(screen.getAllByText('从任务恢复：预设名字').length).toBeGreaterThan(0);
    expect(screen.getByText('统一提示词').nextElementSibling.value).toBe('restore prompt');
    expect(screen.getByDisplayValue('Gemini 3.1 Flash Image Preview')).toBeTruthy();
    fireEvent.click(screen.getByText(/开始生成/));

    await screen.findByText('实时并行任务已开始。');
    expect(calls).toContainEqual({ path: '/api/jobs/job-1/rebuild', method: 'POST', body: null });
    expect(calls.some((call) => call.path === '/api/jobs/realtime')).toBe(false);
  });

  it('exports a single image through the local app server without browser blob download', async () => {
    const calls = [];
    fetch.mockImplementation(async (url, options = {}) => {
      const path = String(url);
      calls.push({ path, method: options.method || 'GET' });
      if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: true });
      if (path.includes('/api/jobs/job-1/items/item-1/export')) {
        return jsonResponse({ saved: true, filename: 'a_gemini.png', path: '/Users/test/Downloads/a_gemini.png' });
      }
      if (path.includes('/api/jobs')) {
        return jsonResponse({
          jobs: [
            {
              id: 'job-1',
              mode: 'realtime',
              status: 'completed',
              prompt: 'prompt',
              createdAt: '2026-05-11T06:00:00.000Z',
              updatedAt: '2026-05-11T06:00:00.000Z',
              items: [{ id: 'item-1', originalName: 'a.png', status: 'succeeded', outputName: 'a_gemini.png' }]
            }
          ]
        });
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByTitle('下载此图'));

    await screen.findByText('图片已保存到下载文件夹：/Users/test/Downloads/a_gemini.png');
    expect(calls).toContainEqual({ path: '/api/jobs/job-1/items/item-1/export', method: 'POST' });
    expect(URL.createObjectURL).not.toHaveBeenCalledWith(expect.any(Blob));
  });

  it('shows the saved folder path when downloading all results', async () => {
    fetch.mockImplementation(async (url, options = {}) => {
      const path = String(url);
      if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: true });
      if (path.includes('/api/jobs/job-1/export')) {
        return jsonResponse({ saved: true, folderName: '任务-预设名字-1', path: '/Users/test/Downloads/任务-预设名字-1', count: 1 });
      }
      if (path.includes('/api/jobs')) {
        return jsonResponse({
          jobs: [
            {
              id: 'job-1',
              mode: 'realtime',
              status: 'completed',
              prompt: 'prompt',
              presetName: '预设名字',
              createdAt: '2026-05-11T06:00:00.000Z',
              updatedAt: '2026-05-11T06:00:00.000Z',
              items: [{ id: 'item-1', originalName: 'a.png', status: 'succeeded', outputName: 'a_gemini.png' }]
            }
          ]
        });
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByText('一键下载全部'));

    await screen.findByText('文件夹已保存到下载文件夹：/Users/test/Downloads/任务-预设名字-1');
  });

  it('shows rerun failures in the error area', async () => {
    fetch.mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: false });
      if (path.includes('/rerun')) return jsonResponse({ error: '请先保存 Google API Key。' }, { status: 400 });
      if (path.includes('/api/jobs')) {
        return jsonResponse({
          jobs: [
            {
              id: 'job-1',
              mode: 'realtime',
              status: 'completed',
              createdAt: '2026-05-11T06:00:00.000Z',
              updatedAt: '2026-05-11T06:00:00.000Z',
              items: [
                {
                  id: 'item-1',
                  originalName: 'a.png',
                  status: 'succeeded',
                  outputName: 'a_gemini.png'
                }
              ]
            }
          ]
        });
      }
      return jsonResponse({});
    });

    render(<App />);

    fireEvent.click(await screen.findByText('再次生成'));

    expect(await screen.findByText('再次生成失败：请先保存 Google API Key。')).toBeTruthy();
  });

  it('keeps rerun available while an item is generating', async () => {
    fetch.mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes('/api/health')) return jsonResponse({ ok: true, hasApiKey: true });
      if (path.includes('/api/jobs')) {
        return jsonResponse({
          jobs: [
            {
              id: 'job-1',
              mode: 'realtime',
              status: 'running',
              createdAt: '2026-05-11T06:00:00.000Z',
              updatedAt: '2026-05-11T06:00:00.000Z',
              items: [
                {
                  id: 'item-1',
                  originalName: 'a.png',
                  status: 'running',
                  outputName: null
                }
              ]
            }
          ]
        });
      }
      return jsonResponse({});
    });

    render(<App />);

    const button = await screen.findByText('中断并再次生成');
    expect(button.closest('button').disabled).toBe(false);
  });
});
