/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/client/App.jsx';

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('App preset selection', () => {
  beforeEach(() => {
    localStorage.clear();
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
    expect(presetSelect.value).toBe('');
    expect(screen.getByText('API 密钥')).toBeTruthy();
    expect(screen.queryByText('Google API Key')).toBeNull();
    expect(screen.getByText('统一提示词')).toBeTruthy();
    expect(screen.getByText('Gemini 3 Pro Image Preview')).toBeTruthy();
    expect(screen.getByLabelText('选择预设').value).toBe('');

    fireEvent.change(presetSelect, { target: { value: 'preset-2' } });

    expect(presetSelect.value).toBe('preset-2');
    expect(screen.getByText('统一提示词')).toBeTruthy();
    expect(screen.getByText('Gemini 3.1 Flash Image Preview')).toBeTruthy();
  });

  it('defaults to Chinese and can switch the interface to English', () => {
    render(<App />);

    expect(screen.getByText('设置')).toBeTruthy();
    expect(screen.getByText('由 bleetchen 开发')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('界面语言'), { target: { value: 'en' } });

    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Developed by bleetchen')).toBeTruthy();
    expect(screen.getByLabelText('Interface Language')).toBeTruthy();
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
      apiProvider: 'geminiProxy'
    });
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
