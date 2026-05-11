import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CheckCircle2,
  Clock3,
  Cpu,
  Download,
  FileImage,
  FolderOpen,
  ImagePlus,
  KeyRound,
  Link2,
  ListRestart,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  Zap
} from 'lucide-react';
import {
  API_PROVIDER_OPTIONS,
  GEMINI_IMAGE_MODELS,
  SUPPORTED_ASPECT_RATIOS,
  buildApiPreviewUrl,
  getSizeOptionsForSettings,
  isSupportedImage,
  normalizeGenerationSettings
} from '../shared/settings.js';
import { addPreset, deletePreset, loadPresetsFromStorage, savePresetsToStorage } from '../shared/presets.js';
import './main.css';
import appLogo from './assets/banana-batch-studio-logo.png';

const RELAY_API_BASE_URL_STORAGE_KEY = 'banana-batch-studio:relay-api-base-url';

function loadStoredRelayApiBaseUrl(storage = localStorage) {
  try {
    return String(storage.getItem(RELAY_API_BASE_URL_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

function saveStoredRelayApiBaseUrl(value, storage = localStorage) {
  try {
    storage.setItem(RELAY_API_BASE_URL_STORAGE_KEY, String(value || '').trim());
  } catch {
    // Local storage can be unavailable in restricted browser contexts.
  }
}

function makeFormData({ files, prompt, settings }) {
  const data = new FormData();
  for (const file of files) data.append('images', file, file.webkitRelativePath || file.name);
  data.append('prompt', prompt);
  data.append('settings', JSON.stringify(settings));
  return data;
}

function statusCounts(job) {
  const items = job?.items || [];
  return {
    total: items.length,
    succeeded: items.filter((item) => item.status === 'succeeded').length,
    failed: items.filter((item) => item.status === 'failed').length,
    running: items.filter((item) => item.status === 'running' || item.status === 'queued').length
  };
}

const STATUS_LABELS = {
  queued: '排队中',
  running: '生成中',
  succeeded: '成功',
  failed: '失败',
  completed: '已完成',
  completed_with_errors: '部分完成',
  submitting_batch: '正在提交批量任务',
  batch_submitted: '批量任务已提交',
  JOB_STATE_PENDING: '批量任务排队中',
  JOB_STATE_RUNNING: '批量任务生成中',
  JOB_STATE_SUCCEEDED: '批量任务成功',
  JOB_STATE_FAILED: '批量任务失败',
  JOB_STATE_CANCELLED: '批量任务已取消'
};

const STATUS_LABELS_EN = {
  queued: 'Queued',
  running: 'Generating',
  succeeded: 'Done',
  failed: 'Failed',
  completed: 'Completed',
  completed_with_errors: 'Partly Completed',
  submitting_batch: 'Submitting Batch',
  batch_submitted: 'Batch Submitted',
  JOB_STATE_PENDING: 'Batch Queued',
  JOB_STATE_RUNNING: 'Batch Running',
  JOB_STATE_SUCCEEDED: 'Batch Succeeded',
  JOB_STATE_FAILED: 'Batch Failed',
  JOB_STATE_CANCELLED: 'Batch Cancelled'
};

const COPY = {
  zh: {
    unknown: '未知',
    unknownError: '未知错误',
    eyebrow: 'LOCAL BANANA IMAGE PIPELINE',
    keyReady: '当前通道密钥已就绪',
    keyWaiting: '等待当前通道密钥',
    settings: '设置',
    interfaceLanguage: '界面语言',
    chinese: '中文',
    english: 'English',
    apiKey: 'API 密钥',
    savedOfficialKey: '官方 Key 已保存，可重新填写覆盖',
    savedRelayKey: '中转 Key 已保存，可重新填写覆盖',
    save: '保存',
    testApi: '检测 API 密钥和当前模型',
    testBatch: '检测 Batch API',
    dropImages: '拖入图片',
    supportedFormats: 'PNG、JPG、JPEG、WEBP',
    chooseImages: '选图片',
    chooseFolder: '选文件夹',
    noImages: '还没有图片',
    noImagesPeriod: '还没有图片。',
    preset: '选择预设',
    noPreset: '未选择预设',
    deletePreset: '删除当前预设',
    prompt: '统一提示词',
    promptPlaceholder: '所有图片都会使用这一套提示词...',
    realtime: '实时并行',
    batch: 'Batch 省钱',
    apiProvider: 'API 通道',
    relayApiKey: '中转 API 密钥',
    relayApiUrl: '中转 API 地址',
    preview: '预览：',
    model: '模型',
    modelList: '获取模型列表',
    modelPlaceholder: '输入或从下方选择模型',
    aspectRatio: '比例',
    size: '尺寸',
    maxConcurrency: '最大并发',
    requestDelay: '请求间隔（秒）',
    currentImages: '本次图片',
    imageCount: (count) => `${count} 张`,
    start: (count) => `开始生成 ${count ? `(${count})` : ''}`,
    savePreset: '保存为新预设',
    presetPlaceholder: '例如：白底商品图 3:4',
    saveCurrentConfig: '保存当前整套配置',
    presetNote: '保存模型、提示词、比例、尺寸、Temperature、请求间隔和处理模式。最大并发是独立设置，不会跟随预设。',
    total: '总数',
    done: '完成',
    processing: '处理中',
    failed: '失败',
    jobs: '任务',
    noJobs: '任务会出现在这里。',
    time: '时间',
    mode: '模式',
    status: '状态',
    images: '图片',
    actions: '操作',
    batchMode: '批量',
    realtimeMode: '实时',
    downloadAll: '一键下载全部',
    downloadZip: '下载 ZIP',
    deleteJobRecord: '删除任务记录',
    results: '结果',
    refresh: '刷新',
    retryFailed: '重试失败项',
    download: '下载',
    downloadImage: '下载此图',
    rerunStop: '中断并再次生成',
    rerun: '再次生成',
    close: '关闭',
    closePreview: '关闭预览',
    errorReason: '错误原因',
    errorHelp: ' 失败信息会显示在这里，方便排查 API、模型名、网络和参数问题。',
    noErrors: '暂无错误。',
    footer: '由 bleetchen 开发',
    concurrencyHint: (current, total, max) =>
      total ? `当前会同时生成 ${current} 张${total > max ? '，其余排队。' : '。'}` : `默认最多同时生成 ${max} 张。`,
    keySaved: 'API 密钥已保存到此 App 的本地文件。',
    connectionFailed: '连接检测失败',
    batchFailed: 'Batch 检测失败',
    loadedModels: (count) => `已获取 ${count} 个模型。`,
    loadModelsFailed: '获取模型列表失败',
    loadedPreset: (name) => `已载入：${name}`,
    newPreset: (count) => `预设 ${count}`,
    addedPreset: (name) => `已新增预设：${name}`,
    deletePresetConfirm: (name) => `确定删除预设「${name}」吗？`,
    presetDeleted: '预设已删除。',
    batchSubmitted: 'Batch 任务已提交。',
    realtimeStarted: '实时并行任务已开始。',
    retryFailedItemsFallback: '重试失败项失败',
    retryQueued: '失败项已加入重新生成队列。',
    downloadFailed: '下载失败',
    zipStarted: 'ZIP 已开始下载。',
    zipSaved: (path) => `ZIP 已保存到下载文件夹：${path}`,
    deleteFailed: '删除失败',
    jobDeleted: '任务记录已删除。',
    cancel: '取消',
    delete: '删除',
    deleteJobDialogTitle: '删除任务记录',
    deleteJobDialogBody: (job) =>
      `${new Date(job.createdAt).toLocaleString()} · ${job.items.length} 张图片\n这会从后台任务列表删除该条记录。`,
    imageDownloadFailed: '单图下载失败',
    rerunFailed: '再次生成失败',
    rerunning: (name) => `正在重新生成：${name}`,
    jobStatusError: (label, error) => `任务${label}：${error}`
  },
  en: {
    unknown: 'Unknown',
    unknownError: 'Unknown error',
    eyebrow: 'LOCAL BANANA IMAGE PIPELINE',
    keyReady: 'Current API key is ready',
    keyWaiting: 'Waiting for current API key',
    settings: 'Settings',
    interfaceLanguage: 'Interface Language',
    chinese: '中文',
    english: 'English',
    apiKey: 'API Key',
    savedOfficialKey: 'Official key saved. Enter a new one to replace it.',
    savedRelayKey: 'Relay key saved. Enter a new one to replace it.',
    save: 'Save',
    testApi: 'Test API key and current model',
    testBatch: 'Test Batch API',
    dropImages: 'Drop images here',
    supportedFormats: 'PNG, JPG, JPEG, WEBP',
    chooseImages: 'Choose Images',
    chooseFolder: 'Choose Folder',
    noImages: 'No images yet',
    noImagesPeriod: 'No images yet.',
    preset: 'Preset',
    noPreset: 'No preset selected',
    deletePreset: 'Delete Current Preset',
    prompt: 'Shared Prompt',
    promptPlaceholder: 'Every image will use this prompt...',
    realtime: 'Realtime Parallel',
    batch: 'Batch Saver',
    apiProvider: 'API Channel',
    relayApiKey: 'Relay API Key',
    relayApiUrl: 'Relay API URL',
    preview: 'Preview: ',
    model: 'Model',
    modelList: 'Fetch Model List',
    modelPlaceholder: 'Type a model or choose one below',
    aspectRatio: 'Aspect Ratio',
    size: 'Size',
    maxConcurrency: 'Max Concurrency',
    requestDelay: 'Request Delay (sec)',
    currentImages: 'Images This Run',
    imageCount: (count) => `${count} images`,
    start: (count) => `Start Generation ${count ? `(${count})` : ''}`,
    savePreset: 'Save as New Preset',
    presetPlaceholder: 'Example: white product shot 3:4',
    saveCurrentConfig: 'Save Current Configuration',
    presetNote: 'Saves model, prompt, aspect ratio, size, Temperature, request delay, and mode. Max concurrency is independent and does not follow presets.',
    total: 'Total',
    done: 'Done',
    processing: 'Processing',
    failed: 'Failed',
    jobs: 'Jobs',
    noJobs: 'Jobs will appear here.',
    time: 'Time',
    mode: 'Mode',
    status: 'Status',
    images: 'Images',
    actions: 'Actions',
    batchMode: 'Batch',
    realtimeMode: 'Realtime',
    downloadAll: 'Download All',
    downloadZip: 'Download ZIP',
    deleteJobRecord: 'Delete Job Record',
    results: 'Results',
    refresh: 'Refresh',
    retryFailed: 'Retry Failed Items',
    download: 'Download',
    downloadImage: 'Download Image',
    rerunStop: 'Stop and Generate Again',
    rerun: 'Generate Again',
    close: 'Close',
    closePreview: 'Close preview',
    errorReason: 'Error Details',
    errorHelp: ' Failure details appear here for API, model, network, and parameter checks.',
    noErrors: 'No errors yet.',
    footer: 'Developed by bleetchen',
    concurrencyHint: (current, total, max) =>
      total ? `${current} image${current === 1 ? '' : 's'} will run now${total > max ? '; the rest will queue.' : '.'}` : `Default max is ${max} concurrent images.`,
    keySaved: 'API key saved to this App local file.',
    connectionFailed: 'Connection test failed',
    batchFailed: 'Batch test failed',
    loadedModels: (count) => `Loaded ${count} models.`,
    loadModelsFailed: 'Failed to fetch model list',
    loadedPreset: (name) => `Loaded: ${name}`,
    newPreset: (count) => `Preset ${count}`,
    addedPreset: (name) => `Added preset: ${name}`,
    deletePresetConfirm: (name) => `Delete preset "${name}"?`,
    presetDeleted: 'Preset deleted.',
    batchSubmitted: 'Batch job submitted.',
    realtimeStarted: 'Realtime parallel job started.',
    retryFailedItemsFallback: 'Failed to retry failed items',
    retryQueued: 'Failed items were added to the regeneration queue.',
    downloadFailed: 'Download failed',
    zipStarted: 'ZIP download started.',
    zipSaved: (path) => `ZIP saved to Downloads: ${path}`,
    deleteFailed: 'Delete failed',
    jobDeleted: 'Job record deleted.',
    cancel: 'Cancel',
    delete: 'Delete',
    deleteJobDialogTitle: 'Delete Job Record',
    deleteJobDialogBody: (job) =>
      `${new Date(job.createdAt).toLocaleString()} · ${job.items.length} images\nThis removes the record from the job list.`,
    imageDownloadFailed: 'Image download failed',
    rerunFailed: 'Generate again failed',
    rerunning: (name) => `Generating again: ${name}`,
    jobStatusError: (label, error) => `Job ${label}: ${error}`
  }
};

function statusLabel(status, language = 'zh') {
  const labels = language === 'en' ? STATUS_LABELS_EN : STATUS_LABELS;
  return labels[status] || status || COPY[language].unknown;
}

function statusBadgeClass(status) {
  const value = String(status || '').toLowerCase();
  if (value.includes('failed') || value.includes('cancelled')) return 'fail';
  if (value.includes('succeeded') || value.includes('completed')) return 'ok';
  return '';
}

async function readErrorMessage(response, fallback) {
  const text = await response.text();
  if (!text) return fallback;
  try {
    const data = JSON.parse(text);
    return data.error || data.message || fallback;
  } catch {
    return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
  }
}

export function App() {
  const [language, setLanguage] = useState('zh');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState({ official: false, geminiProxy: false });
  const [files, setFiles] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState('realtime');
  const [settings, setSettings] = useState({
    model: 'gemini-3-pro-image-preview',
    aspectRatio: '1:1',
    imageSize: '1K',
    temperature: 1,
    requestStartDelayMs: 0,
    maxConcurrency: 10,
    apiProvider: 'official',
    apiBaseUrl: loadStoredRelayApiBaseUrl(),
    apiVersion: '',
    apiHeaderName: '',
    apiHeaderValue: ''
  });
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [message, setMessage] = useState(null);
  const [errorLog, setErrorLog] = useState([]);
  const [presets, setPresets] = useState(() => loadPresetsFromStorage());
  const [activePresetId, setActivePresetId] = useState('');
  const [newPresetName, setNewPresetName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connectionTestStatus, setConnectionTestStatus] = useState('idle');
  const [batchTestStatus, setBatchTestStatus] = useState('idle');
  const [modelListBusy, setModelListBusy] = useState(false);
  const [relayModels, setRelayModels] = useState([]);
  const [rerunningItemId, setRerunningItemId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [pendingDeleteJob, setPendingDeleteJob] = useState(null);
  const fileRef = useRef(null);
  const folderRef = useRef(null);
  const t = COPY[language];

  const selectedJob = jobs.find((job) => job.id === selectedJobId) || jobs[0];
  const counts = statusCounts(selectedJob);
  const sizeOptions = getSizeOptionsForSettings(settings);
  const displayedModels = settings.apiProvider === 'geminiProxy' && relayModels.length ? relayModels : GEMINI_IMAGE_MODELS;
  const apiPreviewUrl = buildApiPreviewUrl(settings);

  const validFiles = useMemo(() => files.filter((file) => isSupportedImage(file.name)), [files]);
  const currentPreset = presets.find((preset) => preset.id === activePresetId);
  const normalizedMaxConcurrency = Math.max(1, Math.min(100, Math.round(Number(settings.maxConcurrency) || 10)));
  const currentParallelCount = validFiles.length ? Math.min(validFiles.length, normalizedMaxConcurrency) : 0;
  const concurrencyHint = t.concurrencyHint(currentParallelCount, validFiles.length, normalizedMaxConcurrency);
  const currentProvider = settings.apiProvider === 'geminiProxy' ? 'geminiProxy' : 'official';
  const hasCurrentApiKey = Boolean(apiKeyStatus[currentProvider]);
  const activeWorkCount = counts.running || (busy ? currentParallelCount || validFiles.length : 0);
  const isGenerating = busy || activeWorkCount > 0 || String(selectedJob?.status || '').toLowerCase().includes('running');
  const uploadPreviewFiles = validFiles.slice(0, 6);

  function settingsPayload() {
    return {
      ...normalizeGenerationSettings(settings),
      apiKey: apiKey.trim()
    };
  }

  function changeApiProvider(apiProvider) {
    setSettings((current) => {
      const officialModel = GEMINI_IMAGE_MODELS.some((model) => model.id === current.model) ? current.model : GEMINI_IMAGE_MODELS[0].id;
      return {
        ...current,
        apiProvider,
        model: apiProvider === 'official' ? officialModel : current.model,
        imageSize:
          apiProvider === 'official' && !getSizeOptionsForSettings({ ...current, apiProvider, model: officialModel }).includes(current.imageSize)
            ? getSizeOptionsForSettings({ ...current, apiProvider, model: officialModel })[0]
            : current.imageSize
      };
    });
  }

  async function persistTypedApiKey() {
    const value = apiKey.trim();
    if (!value) return false;
      const response = await fetch('/api/settings/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: value, apiProvider: currentProvider })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setApiKeyStatus(data.apiKeys || { ...apiKeyStatus, [currentProvider]: true });
    setApiKey('');
    return true;
  }

  function pushError(text) {
    const value = text || t.unknownError;
    setErrorLog((current) => [{ id: Date.now(), text: value, time: new Date().toLocaleTimeString() }, ...current].slice(0, 8));
  }

  async function loadHealth() {
    const response = await fetch('/api/health');
    const data = await response.json();
    setApiKeyStatus(data.apiKeys || { official: Boolean(data.hasApiKey), geminiProxy: Boolean(data.hasApiKey) });
  }

  async function loadJobs() {
    const response = await fetch('/api/jobs');
    const data = await response.json();
    const nextJobs = data.jobs || [];
    setJobs(nextJobs);
    setSelectedJobId((current) => {
      if (current && nextJobs.some((job) => job.id === current)) return current;
      return nextJobs[0]?.id || null;
    });
  }

  useEffect(() => {
    loadHealth();
    loadJobs();
    const timer = setInterval(loadJobs, 1500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (sizeOptions.length && !sizeOptions.includes(settings.imageSize)) {
      setSettings((current) => ({ ...current, imageSize: sizeOptions[0] }));
    }
  }, [settings.model, settings.apiProvider]);

  useEffect(() => {
    saveStoredRelayApiBaseUrl(settings.apiBaseUrl);
  }, [settings.apiBaseUrl]);

  function addFiles(list) {
    const next = Array.from(list || []).filter((file) => isSupportedImage(file.name));
    setFiles((current) => {
      const seen = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      const merged = [...current];
      for (const file of next) {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (!seen.has(key)) merged.push(file);
      }
      return merged;
    });
  }

  async function saveKey() {
    setBusy(true);
    setMessage(null);
    try {
      await persistTypedApiKey();
      setMessage({ type: 'ok', text: t.keySaved });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
      pushError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setBusy(true);
    setMessage(null);
    setConnectionTestStatus('checking');
    try {
      const response = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsPayload())
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || t.connectionFailed);
      setConnectionTestStatus('ok');
      setMessage({ type: 'ok', text: `连接正常：${data.model}` });
    } catch (error) {
      setConnectionTestStatus('fail');
      setMessage({ type: 'error', text: error.message });
      pushError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function testBatchConnection() {
    setBusy(true);
    setMessage(null);
    setBatchTestStatus('checking');
    try {
      const response = await fetch('/api/settings/test-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsPayload())
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || t.batchFailed);
      setBatchTestStatus('ok');
      setMessage({ type: 'ok', text: `Batch API 正常：${data.state} · ${data.batchName}` });
    } catch (error) {
      setBatchTestStatus('fail');
      setMessage({ type: 'error', text: error.message });
      pushError(`Batch 检测失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function loadRelayModels() {
    setModelListBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          apiKey: apiKey.trim(),
          apiVersion: settings.apiVersion || 'v1beta'
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t.loadModelsFailed);
      setRelayModels(data.models || []);
      setMessage({ type: 'ok', text: t.loadedModels(data.models?.length || 0) });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
      pushError(`${t.loadModelsFailed}：${error.message}`);
    } finally {
      setModelListBusy(false);
    }
  }

  function applyPreset(presetId) {
    if (!presetId) {
      setActivePresetId('');
      setMessage(null);
      return;
    }
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    setActivePresetId(presetId);
    setMode(preset.mode || 'realtime');
    setPrompt(preset.prompt);
    setSettings((current) => ({
      ...normalizeGenerationSettings({ ...preset.settings, maxConcurrency: current.maxConcurrency }),
      maxConcurrency: current.maxConcurrency
    }));
    setMessage({ type: 'ok', text: t.loadedPreset(preset.name) });
  }

  function saveNewPreset() {
    try {
      const nextPresets = addPreset(presets, {
        name: newPresetName || t.newPreset(presets.length + 1),
        mode,
        prompt,
        settings
      });
      setPresets(nextPresets);
      savePresetsToStorage(nextPresets);
      setActivePresetId(nextPresets.at(-1).id);
      setNewPresetName('');
      setMessage({ type: 'ok', text: t.addedPreset(nextPresets.at(-1).name) });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
      pushError(error.message);
    }
  }

  function deleteActivePreset() {
    if (!currentPreset) return;
    const ok = window.confirm(t.deletePresetConfirm(currentPreset.name));
    if (!ok) return;
    const nextPresets = deletePreset(presets, activePresetId);
    setPresets(nextPresets);
    savePresetsToStorage(nextPresets);
    setActivePresetId('');
    setMessage({ type: 'ok', text: t.presetDeleted });
  }

  async function startJob() {
    setBusy(true);
    setMessage(null);
    try {
      if (apiKey.trim()) await persistTypedApiKey();
      const normalized = normalizeGenerationSettings(settings);
      const response = await fetch(`/api/jobs/${mode}`, {
        method: 'POST',
        body: makeFormData({ files: validFiles, prompt, settings: normalized })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSelectedJobId(data.job.id);
      setFiles([]);
      await loadJobs();
      setMessage({ type: 'ok', text: mode === 'batch' ? t.batchSubmitted : t.realtimeStarted });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
      pushError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function retryJob(jobId) {
    try {
      const response = await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST' });
      if (!response.ok) throw new Error(await readErrorMessage(response, t.retryFailedItemsFallback));
      await loadJobs();
      setMessage({ type: 'ok', text: t.retryQueued });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
      pushError(`${t.retryFailedItemsFallback}：${error.message}`);
    }
  }

  async function refreshSelectedJob() {
    if (!selectedJob) {
      await loadJobs();
      return;
    }
    const response = await fetch(`/api/jobs/${selectedJob.id}`);
    const data = await response.json();
    if (response.ok && data.job) {
      setJobs((current) => current.map((job) => (job.id === data.job.id ? data.job : job)));
    } else {
      await loadJobs();
    }
  }

  async function downloadJob(job) {
    try {
      const response = await fetch(`/api/jobs/${job.id}/export`, { method: 'POST' });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || t.downloadFailed);
      }
      const data = await response.json();
      setMessage({ type: 'ok', text: t.zipSaved(data.path || data.filename || t.zipStarted) });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
      pushError(`${t.downloadFailed}：${error.message}`);
    }
  }

  function requestDeleteJob(job) {
    setPendingDeleteJob(job);
  }

  async function confirmDeleteJob() {
    const job = pendingDeleteJob;
    if (!job) return;
    try {
      const response = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t.deleteFailed);
      setJobs((current) => current.filter((entry) => entry.id !== job.id));
      if (selectedJobId === job.id) setSelectedJobId(null);
      setPendingDeleteJob(null);
      setMessage({ type: 'ok', text: t.jobDeleted });
      await loadJobs();
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
      pushError(`${t.deleteFailed}：${error.message}`);
    }
  }

  async function downloadItem(job, item) {
    try {
      const response = await fetch(`/api/jobs/${job.id}/items/${item.id}/download`);
      if (!response.ok) {
        const data = await response.json().catch(async () => ({ error: await response.text() }));
        throw new Error(data.error || t.imageDownloadFailed);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = item.outputName || `${item.originalName}_gemini.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
      pushError(`${t.imageDownloadFailed}：${error.message}`);
    }
  }

  async function rerunItem(job, item) {
    setRerunningItemId(item.id);
    setJobs((current) =>
      current.map((entry) =>
        entry.id === job.id
          ? {
              ...entry,
              status: 'running',
              items: entry.items.map((candidate) =>
                candidate.id === item.id
                  ? { ...candidate, status: 'running', outputName: null, outputPath: null, error: null }
                  : candidate
              )
            }
          : entry
      )
    );
    setMessage({ type: 'ok', text: t.rerunning(item.originalName) });
    try {
      const response = await fetch(`/api/jobs/${job.id}/items/${item.id}/rerun`, { method: 'POST' });
      if (!response.ok) throw new Error(await readErrorMessage(response, t.rerunFailed));
      const data = await response.json();
      setJobs((current) => current.map((entry) => (entry.id === job.id ? data.job : entry)));
      setSelectedJobId(job.id);
      setMessage({ type: 'ok', text: t.rerunning(item.originalName) });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
      pushError(`${t.rerunFailed}：${error.message}`);
    } finally {
      setRerunningItemId(null);
    }
  }

  useEffect(() => {
    const hasActiveSelectedJob = selectedJob?.items?.some((item) => item.status === 'queued' || item.status === 'running');
    if (!hasActiveSelectedJob) return;
    const timer = window.setInterval(refreshSelectedJob, 500);
    return () => window.clearInterval(timer);
  }, [selectedJob?.id, selectedJob?.updatedAt]);

  useEffect(() => {
    const failures = (selectedJob?.items || []).filter((item) => item.status === 'failed' && item.error);
    const jobError = selectedJob?.error ? [t.jobStatusError(statusLabel(selectedJob.status, language), selectedJob.error)] : [];
    const failureTexts = failures.map((item) => `${item.originalName}: ${item.error}`);
    const entries = [...jobError, ...failureTexts];
    if (!entries.length) return;
    setErrorLog((current) => {
      const known = new Set(current.map((item) => item.text));
      const next = entries
        .filter((text) => !known.has(text))
        .map((text) => ({ id: `${selectedJob.id}-${text}`, text, time: new Date().toLocaleTimeString() }));
      return [...next, ...current].slice(0, 8);
    });
  }, [selectedJob?.id, selectedJob?.updatedAt, selectedJob?.error, language]);

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand-lockup">
          <img className="app-logo" src={appLogo} alt="Banana Batch Studio" />
          <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h1>Banana Batch Studio</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <label className="language-switch" htmlFor="language-select">
            <span>{t.interfaceLanguage}</span>
            <select id="language-select" value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="zh">{t.chinese}</option>
              <option value="en">{t.english}</option>
            </select>
          </label>
          <div className="status-pill">{hasCurrentApiKey ? t.keyReady : t.keyWaiting}</div>
        </div>
      </header>

      <section className="studio-flow">
        <section className="flow-panel upload-panel">
          <div className="panel-title">
            <span className="panel-icon violet"><FolderOpen size={24} /></span>
            <div>
              <h2>{t.dropImages}</h2>
              <p>{t.supportedFormats}</p>
            </div>
          </div>

          <div
            className={`dropzone ${dragging ? 'dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              addFiles(event.dataTransfer.files);
            }}
          >
            <div>
              <UploadCloud size={44} />
              <strong>{t.dropImages}</strong>
              <span className="muted">{t.supportedFormats}</span>
            </div>
          </div>
          <div className="file-tools">
            <button className="secondary" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={17} /> {t.chooseImages}
            </button>
            <button className="secondary" onClick={() => folderRef.current?.click()}>
              <FolderOpen size={17} /> {t.chooseFolder}
            </button>
          </div>
          <input ref={fileRef} type="file" multiple accept=".png,.jpg,.jpeg,.webp" hidden onChange={(e) => addFiles(e.target.files)} />
          <input
            ref={folderRef}
            type="file"
            multiple
            webkitdirectory="true"
            hidden
            onChange={(e) => addFiles(e.target.files)}
          />

          <div className={`upload-stack ${uploadPreviewFiles.length ? 'has-files' : ''}`} aria-live="polite">
            {uploadPreviewFiles.length === 0 ? (
              <div className="upload-empty">
                <FileImage size={42} />
                <p>{t.noImagesPeriod}</p>
              </div>
            ) : (
              uploadPreviewFiles.map((file, index) => (
                <div className="upload-stack-card" key={`${file.name}-${file.size}-${file.lastModified}`} style={{ '--i': index }}>
                  <FileImage size={20} />
                  <span>{file.webkitRelativePath || file.name}</span>
                </div>
              ))
            )}
            {validFiles.length > uploadPreviewFiles.length && <b className="stack-count">+{validFiles.length - uploadPreviewFiles.length}</b>}
            {validFiles.length > 0 && <b className="stack-total">{validFiles.length}</b>}
          </div>

          <div className="file-list">
            {validFiles.length === 0 ? (
              <p className="muted">{t.noImagesPeriod}</p>
            ) : (
              validFiles.map((file) => (
                <div className="file-row" key={`${file.name}-${file.size}-${file.lastModified}`}>
                  <span>{file.webkitRelativePath || file.name}</span>
                  <span className="muted">{Math.round(file.size / 1024)} KB</span>
                </div>
              ))
            )}
          </div>
          <p className="panel-footnote">
            <Cpu size={16} /> {concurrencyHint}
          </p>
        </section>

        <div className={`flow-link left-link ${validFiles.length ? 'active' : ''}`}>
          <span>{validFiles.length ? `1~${validFiles.length}` : '0'}</span>
        </div>

        <section className="flow-panel control-panel">
          <div className="panel-title">
            <span className="panel-icon blue"><Sparkles size={24} /></span>
            <div>
              <h2>{t.settings}</h2>
              <p>Prompt / Model / API</p>
            </div>
          </div>
          {message && <div className={`toast ${message.type === 'error' ? 'error' : ''}`}>{message.text}</div>}

          <div className="field prompt-field">
            <label>{t.prompt}</label>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t.promptPlaceholder} />
          </div>

          <div className="preset-box compact-box">
            <div className="field compact">
              <label htmlFor="preset-select">{t.preset}</label>
              <select id="preset-select" value={activePresetId} onChange={(event) => applyPreset(event.target.value)}>
                <option value="" aria-label={t.noPreset}></option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="secondary danger wide" onClick={deleteActivePreset} disabled={!currentPreset}>
              <Trash2 size={17} /> {t.deletePreset}
            </button>
          </div>

          <div className="mode-switch">
            <button className={mode === 'realtime' ? 'active' : 'secondary'} onClick={() => setMode('realtime')}>
              {t.realtime}
            </button>
            <button className={mode === 'batch' ? 'active' : 'secondary'} onClick={() => setMode('batch')}>
              {t.batch}
            </button>
          </div>

          <div className="field">
            <label htmlFor="api-provider">{t.apiProvider}</label>
            <select
              id="api-provider"
              value={settings.apiProvider || 'official'}
              onChange={(event) => changeApiProvider(event.target.value)}
            >
              {API_PROVIDER_OPTIONS.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            {settings.apiProvider !== 'geminiProxy' && (
              <>
                <label>{t.apiKey}</label>
                <div className="grid-two">
                  <input
                    type="password"
                    value={apiKey}
                    placeholder={apiKeyStatus.official ? t.savedOfficialKey : 'AIza...'}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                  <button className="secondary" onClick={saveKey} disabled={busy || !apiKey}>
                    <KeyRound size={17} /> {t.save}
                  </button>
                </div>
              </>
            )}
          </div>

          {settings.apiProvider === 'geminiProxy' && (
            <div className="relay-settings">
              <div className="field">
                <label htmlFor="relay-api-key">{t.relayApiKey}</label>
                <div className="grid-two">
                  <input
                    id="relay-api-key"
                    type="password"
                    value={apiKey}
                    placeholder={apiKeyStatus.geminiProxy ? t.savedRelayKey : 'sk-...'}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                  <button className="secondary" onClick={saveKey} disabled={busy || !apiKey}>
                    <KeyRound size={17} /> {t.save}
                  </button>
                </div>
              </div>
              <div className="field">
                <label htmlFor="api-base-url">{t.relayApiUrl}</label>
                <input
                  id="api-base-url"
                  value={settings.apiBaseUrl || ''}
                  placeholder="https://your-relay.example.com"
                  onChange={(event) => setSettings({ ...settings, apiBaseUrl: event.target.value })}
                />
                <p className="muted preview-url">{t.preview}{apiPreviewUrl}</p>
              </div>
            </div>
          )}

          {settings.apiProvider === 'geminiProxy' ? (
            <div className="model-picker">
              <div className="model-picker-head">
                <div>
                  <label htmlFor="relay-model-input">{t.model}</label>
                  <span className="model-count">{relayModels.length}</span>
                </div>
                <button className="secondary" onClick={loadRelayModels} disabled={modelListBusy || (!hasCurrentApiKey && !apiKey.trim())}>
                  <ListRestart size={17} /> {t.modelList}
                </button>
              </div>
              <input
                id="relay-model-input"
                value={settings.model}
                onChange={(event) => setSettings({ ...settings, model: event.target.value })}
                placeholder={t.modelPlaceholder}
              />
              <div className="model-list">
                {displayedModels.map((model) => (
                  <button
                    className={settings.model === model.id ? 'model-row active' : 'model-row'}
                    key={model.id}
                    onClick={() => setSettings({ ...settings, model: model.id })}
                  >
                    <span>{model.label || model.id}</span>
                    <small>{model.id}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="field">
              <label>{t.model}</label>
              <select value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })}>
                {GEMINI_IMAGE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid-two">
            <div className="field">
              <label>{t.aspectRatio}</label>
              <select value={settings.aspectRatio} onChange={(event) => setSettings({ ...settings, aspectRatio: event.target.value })}>
                {SUPPORTED_ASPECT_RATIOS.map((ratio) => (
                  <option key={ratio}>{ratio}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t.size}</label>
              <select value={settings.imageSize} onChange={(event) => setSettings({ ...settings, imageSize: event.target.value })}>
                {sizeOptions.map((size) => (
                  <option key={size}>{size}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid-two">
            <div className="field">
              <label>Temperature</label>
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={settings.temperature}
                onChange={(event) => setSettings({ ...settings, temperature: Number(event.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor="max-concurrency">{t.maxConcurrency}</label>
              <input
                id="max-concurrency"
                type="number"
                min="1"
                max="100"
                step="1"
                value={settings.maxConcurrency}
                onChange={(event) => setSettings({ ...settings, maxConcurrency: Number(event.target.value) })}
              />
            </div>
          </div>

          <div className="grid-two">
            <div className="field">
              <label>{t.requestDelay}</label>
              <input
                type="number"
                min="0"
                max="10"
                step="0.5"
                value={settings.requestStartDelayMs / 1000}
                onChange={(event) => setSettings({ ...settings, requestStartDelayMs: Number(event.target.value) * 1000 })}
              />
            </div>
            <div className="field">
              <label>{t.currentImages}</label>
              <input type="text" value={validFiles.length ? t.imageCount(validFiles.length) : t.noImages} disabled />
            </div>
          </div>

          <div className="grid-two api-checks">
            <button className="secondary wide" onClick={testConnection} disabled={busy || (!hasCurrentApiKey && !apiKey.trim())}>
              <ShieldCheck size={17} /> {t.testApi}
              <span className={`test-light ${connectionTestStatus}`} aria-hidden="true" />
            </button>
            <button className="secondary wide" onClick={testBatchConnection} disabled={busy || (!hasCurrentApiKey && !apiKey.trim())}>
              <ShieldCheck size={17} /> {t.testBatch}
              <span className={`test-light ${batchTestStatus}`} aria-hidden="true" />
            </button>
          </div>

          <div className="actions">
            <button className="generate-button" onClick={startJob} disabled={busy || (!hasCurrentApiKey && !apiKey.trim()) || !prompt.trim() || validFiles.length === 0}>
              <Play size={18} /> {t.start(validFiles.length)}
            </button>
          </div>

          <div className="preset-save-box compact-box">
            <div className="field compact">
              <label>{t.savePreset}</label>
              <input value={newPresetName} onChange={(event) => setNewPresetName(event.target.value)} placeholder={t.presetPlaceholder} />
            </div>
            <button className="secondary wide" onClick={saveNewPreset}>
              <Save size={17} /> {t.saveCurrentConfig}
            </button>
            <p className="muted">{t.presetNote}</p>
          </div>
        </section>

        <div className={`flow-link right-link ${isGenerating ? 'processing' : selectedJob ? 'active' : ''}`}>
          <span>{isGenerating ? t.processing : t.results}</span>
        </div>

        <section className="flow-panel results-panel">
          <div className="panel-title">
            <span className="panel-icon cyan"><FileImage size={24} /></span>
            <div>
              <h2>{t.results}</h2>
              <p>
                {counts.total ? `${counts.succeeded}/${counts.total} ${t.done}` : t.noJobs}
              </p>
            </div>
          </div>

          <div className="summary-grid result-summary">
            <div className="metric"><span className="muted">{t.total}</span><b>{counts.total}</b></div>
            <div className="metric"><span className="muted">{t.done}</span><b>{counts.succeeded}</b></div>
            <div className="metric"><span className="muted">{t.processing}</span><b>{counts.running}</b></div>
            <div className="metric"><span className="muted">{t.failed}</span><b>{counts.failed}</b></div>
          </div>

          {selectedJob && (
            <div className="result-actions">
              <button className="download-all-button" onClick={() => downloadJob(selectedJob)} disabled={counts.succeeded === 0}>
                <Download size={17} /> {t.downloadAll}
              </button>
              <button className="secondary" onClick={refreshSelectedJob}>
                <RefreshCw size={17} /> {t.refresh}
              </button>
              <button className="secondary" onClick={() => retryJob(selectedJob.id)} disabled={selectedJob.mode !== 'realtime' || counts.failed === 0}>
                <RotateCcw size={17} /> {t.retryFailed}
              </button>
            </div>
          )}

          <div className="items result-stack-list">
            {!selectedJob && <p className="muted result-empty">{t.noJobs}</p>}
            {selectedJob?.items.map((item, index) => {
              const itemBusy = item.status === 'queued' || item.status === 'running';
              return (
                <div className={`item-card result-card ${itemBusy ? 'is-generating' : ''}`} key={item.id}>
                  <span className="result-index">{String(index + 1).padStart(2, '0')}</span>
                  <div className="result-media">
                    {item.outputName ? (
                      <button
                        className="image-preview-button"
                        onClick={() =>
                          setPreview({
                            job: selectedJob,
                            item,
                            src: `/outputs/${selectedJob.id}/${item.outputName}`
                          })
                        }
                      >
                        <img src={`/outputs/${selectedJob.id}/${item.outputName}`} alt={item.outputName} />
                      </button>
                    ) : (
                      <div className="generating-placeholder">
                        <Sparkles size={24} />
                      </div>
                    )}
                  </div>
                  <div className="result-meta">
                    <strong>{item.originalName}</strong>
                    <div className={`badge ${statusBadgeClass(item.status)}`}>{statusLabel(item.status, language)}</div>
                    {item.error && <p className="muted">{item.error}</p>}
                  </div>
                  <div className="result-card-actions">
                    {item.outputName && (
                      <button className="secondary" title={t.downloadImage} onClick={() => downloadItem(selectedJob, item)}>
                        <Download size={16} />
                        <span className="sr-only">{t.downloadImage}</span>
                      </button>
                    )}
                    <button
                      className="secondary"
                      title={item.status === 'queued' || item.status === 'running' ? t.rerunStop : t.rerun}
                      onClick={() => rerunItem(selectedJob, item)}
                      disabled={rerunningItemId === item.id}
                    >
                      <RotateCcw size={16} />
                      <span className="sr-only">{item.status === 'queued' || item.status === 'running' ? t.rerunStop : t.rerun}</span>
                    </button>
                    {item.status === 'succeeded' && <CheckCircle2 className="result-check" size={22} />}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="job-history">
            <h2>{t.jobs}</h2>
            {jobs.length === 0 ? (
              <p className="muted">{t.noJobs}</p>
            ) : (
              <div className="job-table">
                <div className="job-table-head">
                  <span>{t.time}</span>
                  <span>{t.mode}</span>
                  <span>{t.status}</span>
                  <span>{t.images}</span>
                  <span>{t.actions}</span>
                </div>
                {jobs.map((job) => {
                  const jobCounts = statusCounts(job);
                  const active = selectedJob?.id === job.id;
                  return (
                    <div className={`job-table-row ${active ? 'active' : ''}`} key={job.id}>
                      <button className="job-select" onClick={() => setSelectedJobId(job.id)}>
                        {new Date(job.createdAt).toLocaleString()}
                      </button>
                      <span>{job.mode === 'batch' ? t.batchMode : t.realtimeMode}</span>
                      <span className={`badge ${statusBadgeClass(job.status)}`}>
                        {statusLabel(job.status, language)}
                      </span>
                      <span>
                        {jobCounts.succeeded}/{jobCounts.total}
                      </span>
                      <div className="job-actions">
                        <button className="secondary" title={t.downloadZip} onClick={() => downloadJob(job)}>
                          <Download size={17} />
                          <span>{t.download}</span>
                        </button>
                        <button className="secondary danger" title={t.deleteJobRecord} onClick={() => requestDeleteJob(job)}>
                          <Trash2 size={17} />
                          <span>{t.deleteJobRecord}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </section>

      <section className="capability-bar">
        <div><span><Zap size={30} /></span><strong>100 张图片并发处理</strong><small>高效批量生成</small></div>
        <div><span><Cpu size={30} /></span><strong>Gemini 原生模型</strong><small>Nano Banana PRO & 2</small></div>
        <div><span><Sparkles size={30} /></span><strong>Gemini 原生 API</strong><small>官方稳定，极速响应</small></div>
        <div><span><Server size={30} /></span><strong>中转 API 支持</strong><small>灵活接入，稳定可靠</small></div>
        <div><span><Link2 size={30} /></span><strong>企业级稳定性</strong><small>安全保障，放心使用</small></div>
      </section>

      {preview && (
        <div className="preview-overlay" role="dialog" aria-modal="true">
          <div className="preview-toolbar">
            <strong>{preview.item.outputName || preview.item.originalName}</strong>
            <div>
              <button className="secondary" onClick={() => downloadItem(preview.job, preview.item)}>
                <Download size={17} /> {t.download}
              </button>
              <button className="secondary" onClick={() => setPreview(null)}>
                <X size={17} /> {t.close}
              </button>
            </div>
          </div>
          <button className="preview-backdrop" onClick={() => setPreview(null)} aria-label={t.closePreview}>
            <img src={preview.src} alt={preview.item.outputName || preview.item.originalName} />
          </button>
        </div>
      )}

      {pendingDeleteJob && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-job-title">
          <div className="confirm-dialog">
            <h2 id="delete-job-title">{t.deleteJobDialogTitle}</h2>
            <p>{t.deleteJobDialogBody(pendingDeleteJob)}</p>
            <div className="confirm-actions">
              <button className="secondary" onClick={() => setPendingDeleteJob(null)}>
                {t.cancel}
              </button>
              <button className="danger" onClick={confirmDeleteJob}>
                <Trash2 size={17} />
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="error-dock">
        <div>
          <strong>{t.errorReason}</strong>
          <span className="muted">{t.errorHelp}</span>
        </div>
        {errorLog.length === 0 ? (
          <p className="muted">{t.noErrors}</p>
        ) : (
          errorLog.map((item) => (
            <div className="error-line" key={item.id}>
              <span>{item.time}</span>
              <p>{item.text}</p>
            </div>
          ))
        )}
      </section>
      <footer className="app-footer">{t.footer}</footer>
    </main>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
