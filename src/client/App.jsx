import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CheckCircle2,
  Clock3,
  Cpu,
  Download,
  Edit3,
  FileImage,
  FolderOpen,
  ImagePlus,
  KeyRound,
  Link2,
  ListRestart,
  Play,
  RefreshCw,
  Repeat2,
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
  OPENAI_IMAGE_MODELS,
  SUPPORTED_ASPECT_RATIOS,
  buildApiPreviewUrl,
  getSizeOptionsForSettings,
  isSupportedImage,
  normalizeGenerationSettings
} from '../shared/settings.js';
import { addPreset, deletePreset, importPresets, loadPresetsFromStorage, savePresetsToStorage, serializePresets } from '../shared/presets.js';
import './main.css';
import appLogo from './assets/banana-batch-studio-logo.png';

const RELAY_API_BASE_URL_STORAGE_KEY = 'banana-batch-studio:relay-api-base-url';
const CANVAS_SCALE_STORAGE_KEY = 'banana-batch-studio:canvas-scale';
const EMPTY_API_KEY_PROFILES = { official: [], openai: [], geminiProxy: [] };

function normalizeCanvasScale(value) {
  if (value === null || value === undefined || value === '') return 100;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 100;
  const stepped = Math.round(numeric / 5) * 5;
  return Math.max(70, Math.min(100, stepped));
}

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

function loadStoredCanvasScale(storage = localStorage) {
  try {
    return normalizeCanvasScale(storage.getItem(CANVAS_SCALE_STORAGE_KEY));
  } catch {
    return 100;
  }
}

function saveStoredCanvasScale(value, storage = localStorage) {
  try {
    storage.setItem(CANVAS_SCALE_STORAGE_KEY, String(normalizeCanvasScale(value)));
  } catch {
    // Local storage can be unavailable in restricted browser contexts.
  }
}

function defaultKeyProfileName(apiProvider, count = 0) {
  if (apiProvider === 'openai') return `OpenAI Key ${count + 1}`;
  if (apiProvider === 'geminiProxy') return `中转 Key ${count + 1}`;
  return `官方 Key ${count + 1}`;
}

function makeFormData({ files, referenceFiles = [], prompt, settings, presetName }) {
  const data = new FormData();
  for (const file of files) data.append('images', file, file.webkitRelativePath || file.name);
  for (const file of referenceFiles) data.append('referenceImages', file, file.webkitRelativePath || file.name);
  data.append('prompt', prompt);
  data.append('settings', JSON.stringify(settings));
  data.append('presetName', presetName || '未命名预设');
  return data;
}

function fileKey(file) {
  return `${file.name}:${file.size || 0}:${file.lastModified || file.path || ''}`;
}

function fileDisplayName(file) {
  return file.webkitRelativePath || file.originalName || file.name || 'image';
}

function fileDisplaySize(file) {
  return Number.isFinite(file.size) && file.size > 0 ? `${Math.round(file.size / 1024)} KB` : '已保存';
}

function sourceFileFromItem(item) {
  return {
    name: item.originalName,
    originalName: item.originalName,
    size: 0,
    lastModified: Date.parse(item.updatedAt || item.createdAt || '') || 0,
    path: item.inputPath,
    mimeType: item.mimeType
  };
}

function referenceFileFromRecord(file) {
  return {
    name: file.originalName,
    originalName: file.originalName,
    size: 0,
    lastModified: 0,
    path: file.path,
    mimeType: file.mimeType
  };
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
    traditionalChinese: '繁體中文',
    japanese: '日本語',
    korean: '한국어',
    english: 'English',
    apiKey: 'API 密钥',
    savedOfficialKey: '官方 Key 已保存，可重新填写覆盖',
    savedOpenAIKey: 'OpenAI Key 已保存，可重新填写覆盖',
    savedRelayKey: '中转 Key 已保存，可重新填写覆盖',
    keyName: '密钥名称',
    keyNamePlaceholder: '例如：主力 Key',
    savedKeyProfiles: '已保存密钥',
    noSavedKeyProfiles: '暂无已保存密钥',
    deleteKeyProfile: '删除密钥',
    deleteKeyProfileConfirm: (name) => `确定删除已保存密钥「${name}」吗？`,
    keyProfileDeleted: '已删除保存的密钥。',
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
    importPresets: '导入预设',
    exportPresets: '导出预设',
    presetImportFailed: '导入预设失败',
    presetImportSummary: (imported, skipped) => `已导入 ${imported} 个预设，跳过 ${skipped} 个重复预设。`,
    presetExported: (path) => `预设文件已保存到下载文件夹：${path}`,
    presetExportFailed: '导出预设失败',
    canvasScale: '页面大小',
    prompt: '统一提示词',
    promptPlaceholder: '所有图片都会使用这一套提示词...',
    referenceImages: '参考图 / 垫图',
    referenceDescription: '每张主图都会带上这些参考图和提示词。',
    dropReferenceImages: '拖入参考图',
    chooseReferenceImages: '添加参考图',
    clearReferenceImages: '清空参考图',
    referenceCount: (count) => `${count} 张参考图`,
    noReferenceImages: '未添加参考图',
    realtime: '实时并行',
    batch: 'Batch 省钱',
    apiProvider: 'API 通道',
    apiProviderOptions: {
      official: 'Google 官方 API',
      openai: 'OpenAI 原生 API',
      geminiProxy: '兼容中转 API'
    },
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
    clearCurrentImages: '清空当前图片',
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
    downloadFolder: '下载文件夹',
    deleteJobRecord: '删除任务记录',
    results: '结果',
    refresh: '刷新',
    retryFailed: '重试失败项',
    editJobPrompt: '更改统一提示词',
    rebuildJob: '重建该任务',
    editPromptDialogTitle: '更改统一提示词',
    editPromptLabel: '新的统一提示词',
    savePrompt: '保存提示词',
    promptSaved: '统一提示词已保存，重新生成时会使用新提示词。',
    promptSaveFailed: '保存统一提示词失败',
    rebuildDraftLoaded: (name) => `从任务恢复：${name || '未命名预设'}`,
    rebuildStarted: '已从该任务创建新的生成任务。',
    rebuildFailed: '重建该任务失败',
    folderSaved: (path) => `文件夹已保存到下载文件夹：${path}`,
    download: '下载',
    downloadImage: '下载此图',
    imageSaved: (path) => `图片已保存到下载文件夹：${path}`,
    rerunStop: '中断并再次生成',
    rerun: '再次生成',
    close: '关闭',
    closePreview: '关闭预览',
    errorReason: '错误原因',
    errorHelp: ' 失败信息会显示在这里，方便排查 API、模型名、网络和参数问题。',
    noErrors: '暂无错误。',
    footer: '由 bleetchen 开发',
    capabilities: [
      { title: '100 张图片并发处理', subtitle: '高效批量生成' },
      { title: 'BANANA可选模型', subtitle: 'Nano Banana PRO & 2' },
      { title: '原生API接入', subtitle: '官方稳定，极速响应' },
      { title: '中转 API 支持', subtitle: '灵活接入，稳定可靠' },
      { title: '不接入三方服务器', subtitle: '安全保障，放心使用' }
    ],
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
    traditionalChinese: '繁體中文',
    japanese: '日本語',
    korean: '한국어',
    english: 'English',
    apiKey: 'API Key',
    savedOfficialKey: 'Official key saved. Enter a new one to replace it.',
    savedOpenAIKey: 'OpenAI key saved. Enter a new one to replace it.',
    savedRelayKey: 'Relay key saved. Enter a new one to replace it.',
    keyName: 'Key Name',
    keyNamePlaceholder: 'Example: Main Key',
    savedKeyProfiles: 'Saved Keys',
    noSavedKeyProfiles: 'No saved keys',
    deleteKeyProfile: 'Delete Key',
    deleteKeyProfileConfirm: (name) => `Delete saved key "${name}"?`,
    keyProfileDeleted: 'Saved key deleted.',
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
    importPresets: 'Import Presets',
    exportPresets: 'Export Presets',
    presetImportFailed: 'Failed to import presets',
    presetImportSummary: (imported, skipped) => `Imported ${imported} preset${imported === 1 ? '' : 's'}, skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}.`,
    presetExported: (path) => `Preset file saved to Downloads: ${path}`,
    presetExportFailed: 'Failed to export presets',
    canvasScale: 'Page Size',
    prompt: 'Shared Prompt',
    promptPlaceholder: 'Every image will use this prompt...',
    referenceImages: 'Reference Images',
    referenceDescription: 'Every source image will use these references plus the prompt.',
    dropReferenceImages: 'Drop reference images',
    chooseReferenceImages: 'Add References',
    clearReferenceImages: 'Clear References',
    referenceCount: (count) => `${count} reference image${count === 1 ? '' : 's'}`,
    noReferenceImages: 'No reference images',
    realtime: 'Realtime Parallel',
    batch: 'Batch Saver',
    apiProvider: 'API Channel',
    apiProviderOptions: {
      official: 'Google Official API',
      openai: 'OpenAI Native API',
      geminiProxy: 'Compatible Relay API'
    },
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
    clearCurrentImages: 'Clear Current Images',
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
    downloadFolder: 'Download Folder',
    deleteJobRecord: 'Delete Job Record',
    results: 'Results',
    refresh: 'Refresh',
    retryFailed: 'Retry Failed Items',
    editJobPrompt: 'Edit Shared Prompt',
    rebuildJob: 'Rebuild This Job',
    editPromptDialogTitle: 'Edit Shared Prompt',
    editPromptLabel: 'New shared prompt',
    savePrompt: 'Save Prompt',
    promptSaved: 'Shared prompt saved. Regeneration will use the new prompt.',
    promptSaveFailed: 'Failed to save shared prompt',
    rebuildDraftLoaded: (name) => `Restored from job: ${name || 'Untitled preset'}`,
    rebuildStarted: 'Created a new generation job from this task.',
    rebuildFailed: 'Failed to rebuild this job',
    folderSaved: (path) => `Folder saved to Downloads: ${path}`,
    download: 'Download',
    downloadImage: 'Download Image',
    imageSaved: (path) => `Image saved to Downloads: ${path}`,
    rerunStop: 'Stop and Generate Again',
    rerun: 'Generate Again',
    close: 'Close',
    closePreview: 'Close preview',
    errorReason: 'Error Details',
    errorHelp: ' Failure details appear here for API, model, network, and parameter checks.',
    noErrors: 'No errors yet.',
    footer: 'Developed by bleetchen',
    capabilities: [
      { title: '100-image parallel processing', subtitle: 'Fast batch generation' },
      { title: 'Selectable BANANA models', subtitle: 'Nano Banana PRO & 2' },
      { title: 'Native API access', subtitle: 'Official, stable, and fast' },
      { title: 'Relay API support', subtitle: 'Flexible access, reliable runs' },
      { title: 'No third-party server', subtitle: 'Safe, steady operation' }
    ],
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

COPY['zh-Hant'] = {
  ...COPY.zh,
  keyReady: '目前通道金鑰已就緒',
  keyWaiting: '等待目前通道金鑰',
  settings: '設定',
  interfaceLanguage: '介面語言',
  apiKey: 'API 金鑰',
  savedOfficialKey: '官方 Key 已儲存，可重新填寫覆蓋',
  savedOpenAIKey: 'OpenAI Key 已儲存，可重新填寫覆蓋',
  savedRelayKey: '中轉 Key 已儲存，可重新填寫覆蓋',
  save: '儲存',
  testApi: '檢測 API 金鑰和目前模型',
  testBatch: '檢測 Batch API',
  dropImages: '拖入圖片',
  chooseImages: '選圖片',
  chooseFolder: '選資料夾',
  noImages: '還沒有圖片',
  noImagesPeriod: '還沒有圖片。',
  preset: '選擇預設',
  noPreset: '未選擇預設',
  deletePreset: '刪除目前預設',
  importPresets: '匯入預設',
  exportPresets: '匯出預設',
  canvasScale: '頁面大小',
  prompt: '統一提示詞',
  referenceImages: '參考圖 / 墊圖',
  referenceDescription: '每張主圖都會帶上這些參考圖和提示詞。',
  dropReferenceImages: '拖入參考圖',
  chooseReferenceImages: '添加參考圖',
  clearReferenceImages: '清空參考圖',
  referenceCount: (count) => `${count} 張參考圖`,
  noReferenceImages: '未添加參考圖',
  realtime: '即時並行',
  batch: 'Batch 省錢',
  apiProvider: 'API 通道',
  apiProviderOptions: {
    official: 'Google 官方 API',
    openai: 'OpenAI 原生 API',
    geminiProxy: '相容中轉 API'
  },
  relayApiKey: '中轉 API 金鑰',
  relayApiUrl: '中轉 API 位址',
  modelList: '取得模型列表',
  aspectRatio: '比例',
  maxConcurrency: '最大並發',
  requestDelay: '請求間隔（秒）',
  currentImages: '本次圖片',
  clearCurrentImages: '清空目前圖片',
  saveCurrentConfig: '儲存目前整套配置',
  total: '總數',
  done: '完成',
  processing: '處理中',
  failed: '失敗',
  jobs: '任務',
  noJobs: '任務會出現在這裡。',
  actions: '操作',
  downloadAll: '一鍵下載全部',
  deleteJobRecord: '刪除任務記錄',
  results: '結果',
  refresh: '重新整理',
    retryFailed: '重試失敗項',
    editJobPrompt: '更改統一提示詞',
    rebuildJob: '重建該任務',
    editPromptDialogTitle: '更改統一提示詞',
    editPromptLabel: '新的統一提示詞',
    savePrompt: '儲存提示詞',
    promptSaved: '統一提示詞已儲存，重新生成時會使用新提示詞。',
    promptSaveFailed: '儲存統一提示詞失敗',
    rebuildDraftLoaded: (name) => `從任務恢復：${name || '未命名預設'}`,
    rebuildStarted: '已從該任務建立新的生成任務。',
    rebuildFailed: '重建該任務失敗',
    folderSaved: (path) => `資料夾已儲存到下載資料夾：${path}`,
    imageSaved: (path) => `圖片已儲存到下載資料夾：${path}`,
  footer: '由 bleetchen 開發',
  capabilities: [
    { title: '100 張圖片並發處理', subtitle: '高效批量生成' },
    { title: 'BANANA 可選模型', subtitle: 'Nano Banana PRO & 2' },
    { title: '原生 API 接入', subtitle: '官方穩定，極速回應' },
    { title: '中轉 API 支援', subtitle: '靈活接入，穩定可靠' },
    { title: '不接入第三方伺服器', subtitle: '安全保障，放心使用' }
  ],
  concurrencyHint: (current, total, max) =>
    total ? `目前會同時生成 ${current} 張${total > max ? '，其餘排隊。' : '。'}` : `預設最多同時生成 ${max} 張。`
};

COPY.ja = {
  ...COPY.en,
  keyReady: '現在の API キーは準備済みです',
  keyWaiting: '現在の API キーを待機中',
  settings: '設定',
  interfaceLanguage: '表示言語',
  apiKey: 'API キー',
  savedOfficialKey: '公式キーは保存済みです。入力し直すと上書きされます。',
  savedOpenAIKey: 'OpenAI キーは保存済みです。入力し直すと上書きされます。',
  savedRelayKey: 'リレーキーは保存済みです。入力し直すと上書きされます。',
  save: '保存',
  testApi: 'API キーと現在のモデルをテスト',
  testBatch: 'Batch API をテスト',
  dropImages: '画像をドロップ',
  supportedFormats: 'PNG、JPG、JPEG、WEBP',
  chooseImages: '画像を選択',
  chooseFolder: 'フォルダを選択',
  noImages: '画像はまだありません',
  noImagesPeriod: '画像はまだありません。',
  preset: 'プリセット',
  noPreset: 'プリセット未選択',
  deletePreset: '現在のプリセットを削除',
  importPresets: 'プリセットを読み込み',
  exportPresets: 'プリセットを書き出し',
  canvasScale: 'ページサイズ',
  prompt: '共通プロンプト',
  promptPlaceholder: 'すべての画像にこのプロンプトを使用します...',
  referenceImages: '参照画像',
  referenceDescription: '各元画像に参照画像とプロンプトを付けて処理します。',
  dropReferenceImages: '参照画像をドロップ',
  chooseReferenceImages: '参照画像を追加',
  clearReferenceImages: '参照画像をクリア',
  referenceCount: (count) => `参照画像 ${count} 枚`,
  noReferenceImages: '参照画像なし',
  realtime: 'リアルタイム並列',
  batch: 'Batch 節約',
  apiProvider: 'API チャンネル',
  apiProviderOptions: {
    official: 'Google 公式 API',
    openai: 'OpenAI ネイティブ API',
    geminiProxy: '互換リレー API'
  },
  relayApiKey: 'リレー API キー',
  relayApiUrl: 'リレー API URL',
  preview: 'プレビュー：',
  model: 'モデル',
  modelList: 'モデル一覧を取得',
  modelPlaceholder: 'モデルを入力または下から選択',
  aspectRatio: 'アスペクト比',
  size: 'サイズ',
  maxConcurrency: '最大並列数',
  requestDelay: 'リクエスト間隔（秒）',
  currentImages: '今回の画像',
  clearCurrentImages: '今回の画像をクリア',
  imageCount: (count) => `${count} 枚`,
  start: (count) => `生成開始 ${count ? `(${count})` : ''}`,
  savePreset: '新規プリセットとして保存',
  saveCurrentConfig: '現在の設定を保存',
  total: '合計',
  done: '完了',
  processing: '処理中',
  failed: '失敗',
  jobs: 'ジョブ',
  noJobs: 'ジョブはここに表示されます。',
  batchMode: 'Batch',
  realtimeMode: 'リアルタイム',
  downloadAll: 'すべてダウンロード',
  deleteJobRecord: 'ジョブ記録を削除',
  results: '結果',
  refresh: '更新',
  retryFailed: '失敗項目を再試行',
  editJobPrompt: '共通プロンプトを変更',
  rebuildJob: 'このジョブを再構築',
  editPromptDialogTitle: '共通プロンプトを変更',
  editPromptLabel: '新しい共通プロンプト',
  savePrompt: 'プロンプトを保存',
  promptSaved: '共通プロンプトを保存しました。再生成時に新しいプロンプトを使います。',
  promptSaveFailed: '共通プロンプトの保存に失敗しました',
  rebuildDraftLoaded: (name) => `ジョブから復元：${name || '無名プリセット'}`,
  rebuildStarted: 'このジョブから新しい生成ジョブを作成しました。',
  rebuildFailed: 'このジョブの再構築に失敗しました',
  folderSaved: (path) => `フォルダをダウンロード先に保存しました：${path}`,
  imageSaved: (path) => `画像をダウンロード先に保存しました：${path}`,
  footer: 'bleetchen が開発',
  capabilities: [
    { title: '100 枚の画像を並列処理', subtitle: '高速バッチ生成' },
    { title: 'BANANA モデルを選択可能', subtitle: 'Nano Banana PRO & 2' },
    { title: 'ネイティブ API 接続', subtitle: '公式で安定、高速応答' },
    { title: 'リレー API 対応', subtitle: '柔軟な接続、安定した実行' },
    { title: '第三者サーバー不使用', subtitle: '安全で安心して使える' }
  ],
  concurrencyHint: (current, total, max) =>
    total ? `${current} 枚を同時生成します${total > max ? '。残りは待機します。' : '。'}` : `デフォルト最大 ${max} 枚を同時生成します。`
};

COPY.ko = {
  ...COPY.en,
  keyReady: '현재 채널 API 키가 준비되었습니다',
  keyWaiting: '현재 채널 API 키 대기 중',
  settings: '설정',
  interfaceLanguage: '인터페이스 언어',
  apiKey: 'API 키',
  savedOfficialKey: '공식 키가 저장되었습니다. 다시 입력하면 덮어씁니다.',
  savedOpenAIKey: 'OpenAI 키가 저장되었습니다. 다시 입력하면 덮어씁니다.',
  savedRelayKey: '중계 키가 저장되었습니다. 다시 입력하면 덮어씁니다.',
  save: '저장',
  testApi: 'API 키와 현재 모델 테스트',
  testBatch: 'Batch API 테스트',
  dropImages: '이미지 드롭',
  supportedFormats: 'PNG, JPG, JPEG, WEBP',
  chooseImages: '이미지 선택',
  chooseFolder: '폴더 선택',
  noImages: '아직 이미지가 없습니다',
  noImagesPeriod: '아직 이미지가 없습니다.',
  preset: '프리셋',
  noPreset: '선택한 프리셋 없음',
  deletePreset: '현재 프리셋 삭제',
  importPresets: '프리셋 가져오기',
  exportPresets: '프리셋 내보내기',
  canvasScale: '페이지 크기',
  prompt: '공통 프롬프트',
  promptPlaceholder: '모든 이미지에 이 프롬프트를 사용합니다...',
  referenceImages: '참조 이미지',
  referenceDescription: '각 원본 이미지에 참조 이미지와 프롬프트를 함께 사용합니다.',
  dropReferenceImages: '참조 이미지 드롭',
  chooseReferenceImages: '참조 이미지 추가',
  clearReferenceImages: '참조 이미지 지우기',
  referenceCount: (count) => `참조 이미지 ${count}장`,
  noReferenceImages: '참조 이미지 없음',
  realtime: '실시간 병렬',
  batch: 'Batch 절약',
  apiProvider: 'API 채널',
  apiProviderOptions: {
    official: 'Google 공식 API',
    openai: 'OpenAI 네이티브 API',
    geminiProxy: '호환 중계 API'
  },
  relayApiKey: '중계 API 키',
  relayApiUrl: '중계 API URL',
  preview: '미리보기: ',
  model: '모델',
  modelList: '모델 목록 가져오기',
  modelPlaceholder: '모델을 입력하거나 아래에서 선택',
  aspectRatio: '비율',
  size: '크기',
  maxConcurrency: '최대 동시 실행',
  requestDelay: '요청 간격(초)',
  currentImages: '이번 이미지',
  clearCurrentImages: '현재 이미지 지우기',
  imageCount: (count) => `${count}장`,
  start: (count) => `생성 시작 ${count ? `(${count})` : ''}`,
  savePreset: '새 프리셋으로 저장',
  saveCurrentConfig: '현재 전체 설정 저장',
  total: '전체',
  done: '완료',
  processing: '처리 중',
  failed: '실패',
  jobs: '작업',
  noJobs: '작업이 여기에 표시됩니다.',
  batchMode: 'Batch',
  realtimeMode: '실시간',
  downloadAll: '전체 다운로드',
  deleteJobRecord: '작업 기록 삭제',
  results: '결과',
  refresh: '새로고침',
  retryFailed: '실패 항목 재시도',
  editJobPrompt: '공통 프롬프트 변경',
  rebuildJob: '이 작업 재구성',
  editPromptDialogTitle: '공통 프롬프트 변경',
  editPromptLabel: '새 공통 프롬프트',
  savePrompt: '프롬프트 저장',
  promptSaved: '공통 프롬프트를 저장했습니다. 재생성 시 새 프롬프트를 사용합니다.',
  promptSaveFailed: '공통 프롬프트 저장 실패',
  rebuildDraftLoaded: (name) => `작업에서 복원: ${name || '이름 없는 프리셋'}`,
  rebuildStarted: '이 작업에서 새 생성 작업을 만들었습니다.',
  rebuildFailed: '이 작업 재구성 실패',
  folderSaved: (path) => `폴더가 다운로드 폴더에 저장되었습니다: ${path}`,
  imageSaved: (path) => `이미지가 다운로드 폴더에 저장되었습니다: ${path}`,
  footer: 'bleetchen 개발',
  capabilities: [
    { title: '이미지 100장 병렬 처리', subtitle: '빠른 일괄 생성' },
    { title: 'BANANA 선택 가능 모델', subtitle: 'Nano Banana PRO & 2' },
    { title: '네이티브 API 연결', subtitle: '공식 안정성, 빠른 응답' },
    { title: '중계 API 지원', subtitle: '유연한 연결, 안정적인 실행' },
    { title: '타사 서버 미연결', subtitle: '안전하고 믿고 사용' }
  ],
  concurrencyHint: (current, total, max) =>
    total ? `${current}장을 동시에 생성합니다${total > max ? '. 나머지는 대기합니다.' : '.'}` : `기본 최대 ${max}장을 동시에 생성합니다.`
};

const LANGUAGE_OPTIONS = [
  { id: 'zh', labelKey: 'chinese' },
  { id: 'zh-Hant', labelKey: 'traditionalChinese' },
  { id: 'en', labelKey: 'english' },
  { id: 'ja', labelKey: 'japanese' },
  { id: 'ko', labelKey: 'korean' }
];

function statusLabel(status, language = 'zh') {
  const labels = language === 'en' ? STATUS_LABELS_EN : STATUS_LABELS;
  return labels[status] || status || (COPY[language] || COPY.zh).unknown;
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
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState({ official: false, openai: false, geminiProxy: false });
  const [apiKeyProfiles, setApiKeyProfiles] = useState(EMPTY_API_KEY_PROFILES);
  const [files, setFiles] = useState([]);
  const [referenceFiles, setReferenceFiles] = useState([]);
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
    apiKeyProfileId: '',
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
  const [referenceDragging, setReferenceDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connectionTestStatus, setConnectionTestStatus] = useState('idle');
  const [batchTestStatus, setBatchTestStatus] = useState('idle');
  const [modelListBusy, setModelListBusy] = useState(false);
  const [relayModels, setRelayModels] = useState([]);
  const [rerunningItemId, setRerunningItemId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [pendingDeleteJob, setPendingDeleteJob] = useState(null);
  const [promptEditorJob, setPromptEditorJob] = useState(null);
  const [promptDraft, setPromptDraft] = useState('');
  const [rebuildDraftJob, setRebuildDraftJob] = useState(null);
  const [canvasScale, setCanvasScale] = useState(() => loadStoredCanvasScale());
  const presetImportRef = useRef(null);
  const imageFilePickerRef = useRef(null);
  const imageFolderPickerRef = useRef(null);
  const referenceFilePickerRef = useRef(null);
  const t = COPY[language] || COPY.zh;

  const selectedJob = jobs.find((job) => job.id === selectedJobId) || jobs[0];
  const counts = statusCounts(selectedJob);
  const sizeOptions = getSizeOptionsForSettings(settings);
  const displayedModels =
    settings.apiProvider === 'openai'
      ? OPENAI_IMAGE_MODELS
      : settings.apiProvider === 'geminiProxy' && relayModels.length
        ? relayModels
        : GEMINI_IMAGE_MODELS;
  const apiPreviewUrl = buildApiPreviewUrl(settings);

  const validFiles = useMemo(() => files.filter((file) => isSupportedImage(file.name)), [files]);
  const validReferenceFiles = useMemo(() => referenceFiles.filter((file) => isSupportedImage(file.name)), [referenceFiles]);
  const currentPreset = presets.find((preset) => preset.id === activePresetId);
  const normalizedMaxConcurrency = Math.max(1, Math.min(100, Math.round(Number(settings.maxConcurrency) || 10)));
  const currentParallelCount = validFiles.length ? Math.min(validFiles.length, normalizedMaxConcurrency) : 0;
  const concurrencyHint = t.concurrencyHint(currentParallelCount, validFiles.length, normalizedMaxConcurrency);
  const currentProvider = API_PROVIDER_OPTIONS.some((provider) => provider.id === settings.apiProvider) ? settings.apiProvider : 'official';
  const hasCurrentApiKey = Boolean(apiKeyStatus[currentProvider]);
  const currentKeyProfiles = apiKeyProfiles[currentProvider] || [];
  const selectedKeyProfile = currentKeyProfiles.find((profile) => profile.id === settings.apiKeyProfileId) || null;
  const activeWorkCount = counts.running || (busy ? currentParallelCount || validFiles.length : 0);
  const isGenerating = busy || activeWorkCount > 0 || String(selectedJob?.status || '').toLowerCase().includes('running');
  const canvasScaleValue = canvasScale / 100;
  const uploadPreviewCards = useMemo(
    () =>
      validFiles.slice(0, 3).map((file) => ({
        file,
        key: fileKey(file),
        name: fileDisplayName(file),
        url: file.path ? `/api/local-image?path=${encodeURIComponent(file.path)}` : URL.createObjectURL(file),
        revoke: !file.path
      })),
    [validFiles]
  );

  useEffect(() => {
    return () => {
      for (const card of uploadPreviewCards) {
        if (card.revoke) URL.revokeObjectURL(card.url);
      }
    };
  }, [uploadPreviewCards]);

  function settingsPayload() {
    return {
      ...normalizeGenerationSettings(settings),
      apiKey: apiKey.trim(),
      apiKeyProfileId: settings.apiKeyProfileId || ''
    };
  }

  function changeApiProvider(apiProvider) {
    setSettings((current) => {
      const officialModel = GEMINI_IMAGE_MODELS.some((model) => model.id === current.model) ? current.model : GEMINI_IMAGE_MODELS[0].id;
      const openAIModel = OPENAI_IMAGE_MODELS.some((model) => model.id === current.model) ? current.model : OPENAI_IMAGE_MODELS[0].id;
      const nextModel = apiProvider === 'official' ? officialModel : apiProvider === 'openai' ? openAIModel : current.model;
      const nextSizeOptions = getSizeOptionsForSettings({ ...current, apiProvider, model: nextModel });
      return {
        ...current,
        apiProvider,
        apiKeyProfileId: '',
        model: nextModel,
        imageSize: nextSizeOptions.includes(current.imageSize) ? current.imageSize : nextSizeOptions[0]
      };
    });
    setApiKey('');
    setApiKeyName('');
  }

  async function persistTypedApiKey() {
    const value = apiKey.trim();
    if (!value) return false;
    const name = apiKeyName.trim() || defaultKeyProfileName(currentProvider, currentKeyProfiles.length);
    const response = await fetch('/api/settings/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: value,
        apiProvider: currentProvider,
        name,
        apiBaseUrl: currentProvider === 'geminiProxy' ? settings.apiBaseUrl || '' : '',
        apiVersion: currentProvider === 'geminiProxy' ? settings.apiVersion || '' : '',
        apiHeaderName: currentProvider === 'geminiProxy' ? settings.apiHeaderName || '' : '',
        apiHeaderValue: currentProvider === 'geminiProxy' ? settings.apiHeaderValue || '' : ''
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setApiKeyStatus(data.apiKeys || { ...apiKeyStatus, [currentProvider]: true });
    setApiKeyProfiles(data.apiKeyProfiles || apiKeyProfiles);
    if (data.profile?.id) {
      setSettings((current) => ({
        ...current,
        apiKeyProfileId: data.profile.id,
        ...(currentProvider === 'geminiProxy'
          ? {
              apiBaseUrl: data.profile.apiBaseUrl || current.apiBaseUrl,
              apiVersion: data.profile.apiVersion || current.apiVersion,
              apiHeaderName: data.profile.apiHeaderName || current.apiHeaderName,
              apiHeaderValue: data.profile.apiHeaderValue || current.apiHeaderValue
            }
          : {})
      }));
    }
    setApiKey('');
    setApiKeyName('');
    return true;
  }

  function pushError(text) {
    const value = text || t.unknownError;
    setErrorLog((current) => [{ id: Date.now(), text: value, time: new Date().toLocaleTimeString() }, ...current].slice(0, 8));
  }

  async function loadHealth() {
    const response = await fetch('/api/health');
    const data = await response.json();
    setApiKeyStatus(data.apiKeys || { official: Boolean(data.hasApiKey), openai: Boolean(data.hasApiKey), geminiProxy: Boolean(data.hasApiKey) });
    const profiles = data.apiKeyProfiles || EMPTY_API_KEY_PROFILES;
    setApiKeyProfiles(profiles);
    setSettings((current) => {
      if (current.apiKeyProfileId) return current;
      const provider = API_PROVIDER_OPTIONS.some((entry) => entry.id === current.apiProvider) ? current.apiProvider : 'official';
      const profile = profiles[provider]?.[0];
      if (!profile) return current;
      return {
        ...current,
        apiKeyProfileId: profile.id,
        ...(provider === 'geminiProxy'
          ? {
              apiBaseUrl: profile.apiBaseUrl || current.apiBaseUrl,
              apiVersion: profile.apiVersion || current.apiVersion,
              apiHeaderName: profile.apiHeaderName || current.apiHeaderName,
              apiHeaderValue: profile.apiHeaderValue || current.apiHeaderValue
            }
          : {})
      };
    });
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

  useEffect(() => {
    saveStoredCanvasScale(canvasScale);
  }, [canvasScale]);

  function addUniqueFiles(list, setter) {
    const next = Array.from(list || []).filter((file) => isSupportedImage(file.name));
    setter((current) => {
      const seen = new Set(current.map(fileKey));
      const merged = [...current];
      for (const file of next) {
        const key = fileKey(file);
        if (!seen.has(key)) merged.push(file);
      }
      return merged;
    });
  }

  function addFiles(list) {
    setRebuildDraftJob(null);
    addUniqueFiles(list, setFiles);
  }

  function addReferenceFiles(list) {
    setRebuildDraftJob(null);
    addUniqueFiles(list, setReferenceFiles);
  }

  function readFileEntry(entry) {
    return new Promise((resolve) => {
      entry.file((file) => resolve([file]), () => resolve([]));
    });
  }

  async function readDirectoryEntry(entry) {
    const reader = entry.createReader();
    const files = [];
    while (true) {
      const entries = await new Promise((resolve) => {
        reader.readEntries(resolve, () => resolve([]));
      });
      if (!entries.length) break;
      const nestedFiles = await Promise.all(entries.map(readEntryFiles));
      files.push(...nestedFiles.flat());
    }
    return files;
  }

  async function readEntryFiles(entry) {
    if (!entry) return [];
    if (entry.isFile) return readFileEntry(entry);
    if (entry.isDirectory) return readDirectoryEntry(entry);
    return [];
  }

  async function filesFromDrop(dataTransfer) {
    const itemEntries = Array.from(dataTransfer?.items || [])
      .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
      .filter(Boolean);

    if (itemEntries.length) {
      const entryFiles = await Promise.all(itemEntries.map(readEntryFiles));
      return entryFiles.flat();
    }

    return Array.from(dataTransfer?.files || []);
  }

  async function handleDrop(event, addDroppedFiles, setDropState) {
    event.preventDefault();
    setDropState(false);
    addDroppedFiles(await filesFromDrop(event.dataTransfer));
  }

  function removeReferenceFile(target) {
    setRebuildDraftJob(null);
    const targetKey = fileKey(target);
    setReferenceFiles((current) => current.filter((file) => fileKey(file) !== targetKey));
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

  function applyKeyProfile(profileId) {
    const profile = currentKeyProfiles.find((item) => item.id === profileId);
    setSettings((current) => ({
      ...current,
      apiKeyProfileId: profileId,
      ...(profile && currentProvider === 'geminiProxy'
        ? {
            apiBaseUrl: profile.apiBaseUrl || '',
            apiVersion: profile.apiVersion || current.apiVersion,
            apiHeaderName: profile.apiHeaderName || current.apiHeaderName,
            apiHeaderValue: profile.apiHeaderValue || current.apiHeaderValue
          }
        : {})
    }));
    setApiKey('');
  }

  async function deleteSelectedKeyProfile() {
    if (!selectedKeyProfile) return;
    const ok = window.confirm(t.deleteKeyProfileConfirm?.(selectedKeyProfile.name) || `Delete ${selectedKeyProfile.name}?`);
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/settings/key/${currentProvider}/${selectedKeyProfile.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const nextProfiles = data.apiKeyProfiles || EMPTY_API_KEY_PROFILES;
      const nextProviderProfiles = nextProfiles[currentProvider] || [];
      const nextProfile = nextProviderProfiles[0] || null;
      setApiKeyStatus(data.apiKeys || { ...apiKeyStatus, [currentProvider]: Boolean(nextProfile) });
      setApiKeyProfiles(nextProfiles);
      setSettings((current) => ({
        ...current,
        apiKeyProfileId: nextProfile?.id || '',
        ...(currentProvider === 'geminiProxy' && nextProfile
          ? {
              apiBaseUrl: nextProfile.apiBaseUrl || '',
              apiVersion: nextProfile.apiVersion || current.apiVersion,
              apiHeaderName: nextProfile.apiHeaderName || current.apiHeaderName,
              apiHeaderValue: nextProfile.apiHeaderValue || current.apiHeaderValue
            }
          : {})
      }));
      setMessage({ type: 'ok', text: t.keyProfileDeleted });
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

  async function exportPresetFile() {
    try {
      const response = await fetch('/api/presets/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: serializePresets(presets) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t.presetExportFailed);
      setMessage({ type: 'ok', text: t.presetExported(data.path || data.filename) });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
      pushError(`${t.presetExportFailed}：${error.message}`);
    }
  }

  async function importPresetFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const result = importPresets(presets, text);
      setPresets(result.presets);
      savePresetsToStorage(result.presets);
      setActivePresetId('');
      setMessage({ type: 'ok', text: t.presetImportSummary(result.imported, result.skipped) });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
      pushError(`${t.presetImportFailed}：${error.message}`);
    } finally {
      if (presetImportRef.current) presetImportRef.current.value = '';
    }
  }

  async function startJob() {
    setBusy(true);
    setMessage(null);
    try {
      if (apiKey.trim()) await persistTypedApiKey();
      if (rebuildDraftJob) {
        const response = await fetch(`/api/jobs/${rebuildDraftJob.id}/rebuild`, { method: 'POST' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setSelectedJobId(data.job.id);
        setFiles([]);
        setReferenceFiles([]);
        setRebuildDraftJob(null);
        setActivePresetId('');
        await loadJobs();
        setMessage({ type: 'ok', text: data.job.mode === 'batch' ? t.batchSubmitted : t.realtimeStarted });
        return;
      }
      const normalized = normalizeGenerationSettings(settings);
      const response = await fetch(`/api/jobs/${mode}`, {
        method: 'POST',
        body: makeFormData({
          files: validFiles,
          referenceFiles: validReferenceFiles,
          prompt,
          settings: normalized,
          presetName: currentPreset?.name || '未命名预设'
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSelectedJobId(data.job.id);
      setFiles([]);
      setReferenceFiles([]);
      setRebuildDraftJob(null);
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
      setMessage({ type: 'ok', text: t.folderSaved(data.path || data.folderName) });
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
      const response = await fetch(`/api/jobs/${job.id}/items/${item.id}/export`, { method: 'POST' });
      if (!response.ok) {
        const data = await response.json().catch(async () => ({ error: await response.text() }));
        throw new Error(data.error || t.imageDownloadFailed);
      }
      const data = await response.json();
      setMessage({ type: 'ok', text: t.imageSaved?.(data.path || data.filename) || `${t.download}：${data.path || data.filename}` });
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

  function openPromptEditor(job) {
    setPromptEditorJob(job);
    setPromptDraft(job.prompt || '');
  }

  async function saveJobPrompt() {
    if (!promptEditorJob) return;
    try {
      const response = await fetch(`/api/jobs/${promptEditorJob.id}/prompt`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptDraft })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t.promptSaveFailed);
      setJobs((current) => current.map((job) => (job.id === data.job.id ? data.job : job)));
      setPromptEditorJob(null);
      setPromptDraft('');
      setMessage({ type: 'ok', text: t.promptSaved });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
      pushError(`${t.promptSaveFailed}：${error.message}`);
    }
  }

  function loadRebuildDraft(job) {
    setRebuildDraftJob(job);
    setMode(job.mode === 'batch' ? 'batch' : 'realtime');
    setPrompt(job.prompt || '');
    setSettings((current) => ({
      ...current,
      ...normalizeGenerationSettings({ ...job.settings, maxConcurrency: job.settings?.maxConcurrency ?? current.maxConcurrency })
    }));
    setFiles((job.items || []).map(sourceFileFromItem));
    setReferenceFiles((job.referenceImages || []).map(referenceFileFromRecord));
    setActivePresetId('');
    setMessage({ type: 'ok', text: t.rebuildDraftLoaded(job.presetName) });
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
    <main className="app" style={{ '--canvas-scale': String(canvasScaleValue) }}>
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
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {t[option.labelKey]}
                </option>
              ))}
            </select>
          </label>
          <div className="status-pill">{hasCurrentApiKey ? t.keyReady : t.keyWaiting}</div>
        </div>
      </header>

      <div className="canvas-viewport">
        <div className="canvas-stage">
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
            onDrop={(event) => handleDrop(event, addFiles, setDragging)}
          >
            <div>
              <UploadCloud size={44} />
              <strong>{t.dropImages}</strong>
              <span className="muted">{t.supportedFormats}</span>
            </div>
          </div>
          <div className="file-tools">
            <button className="secondary file-picker-button" type="button" onClick={() => imageFilePickerRef.current?.click()}>
              <ImagePlus size={17} /> {t.chooseImages}
            </button>
            <input
              ref={imageFilePickerRef}
              id="image-file-picker"
              className="file-picker-input"
              name="images"
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.webp"
              hidden
              onChange={(e) => addFiles(e.target.files)}
            />
            <button className="secondary file-picker-button" type="button" onClick={() => imageFolderPickerRef.current?.click()}>
              <FolderOpen size={17} /> {t.chooseFolder}
            </button>
            <input
              ref={imageFolderPickerRef}
              id="image-folder-picker"
              className="file-picker-input"
              data-picker="folder"
              type="file"
              multiple
              webkitdirectory=""
              directory=""
              hidden
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          <div className={`upload-stack ${uploadPreviewCards.length ? 'has-files' : ''}`} aria-live="polite">
            {uploadPreviewCards.length === 0 ? (
              <div className="upload-empty">
                <FileImage size={42} />
                <p>{t.noImagesPeriod}</p>
              </div>
            ) : (
              uploadPreviewCards.map((card, index) => (
                <div className="upload-stack-card" key={card.key} style={{ '--i': index }}>
                  <img src={card.url} alt={card.name} />
                  <span>{card.name}</span>
                </div>
              ))
            )}
            {validFiles.length > uploadPreviewCards.length && <b className="stack-count">+{validFiles.length - uploadPreviewCards.length}</b>}
            {validFiles.length > 0 && <b className="stack-total">{validFiles.length}</b>}
          </div>

          <button
            className="secondary danger wide clear-images-button"
            onClick={() => {
              setFiles([]);
              setRebuildDraftJob(null);
            }}
            disabled={validFiles.length === 0}
          >
            <Trash2 size={17} /> {t.clearCurrentImages}
          </button>

          <div className="file-list">
            {validFiles.length === 0 ? (
              <p className="muted">{t.noImagesPeriod}</p>
            ) : (
              validFiles.map((file) => (
                <div className="file-row" key={`${file.name}-${file.size}-${file.lastModified}`}>
                  <span>{fileDisplayName(file)}</span>
                  <span className="muted">{fileDisplaySize(file)}</span>
                </div>
              ))
            )}
          </div>
          <p className="panel-footnote">
            <Cpu size={16} /> {concurrencyHint}
          </p>
        </section>

        <div className={`flow-link left-link ${validFiles.length ? 'active' : ''}`} aria-hidden="true" />

        <section className="flow-panel control-panel">
          <div className="panel-title">
            <span className="panel-icon blue"><Sparkles size={24} /></span>
            <div>
              <h2>{t.settings}</h2>
              <p>Prompt / Model / API</p>
            </div>
          </div>
          {message && <div className={`toast ${message.type === 'error' ? 'error' : ''}`}>{message.text}</div>}

          <div className="reference-box compact-box">
            <div className="reference-head">
              <div>
                <label>{t.referenceImages}</label>
                <p className="muted">{t.referenceDescription}</p>
              </div>
              <span className="reference-count">
                {validReferenceFiles.length ? t.referenceCount(validReferenceFiles.length) : t.noReferenceImages}
              </span>
            </div>
            <div
              className={`reference-dropzone ${referenceDragging ? 'dragging' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setReferenceDragging(true);
              }}
              onDragLeave={() => setReferenceDragging(false)}
              onDrop={(event) => handleDrop(event, addReferenceFiles, setReferenceDragging)}
            >
              <UploadCloud size={24} />
              <span>{t.dropReferenceImages}</span>
            </div>
            <div className="reference-actions">
              <button className="secondary file-picker-button" type="button" onClick={() => referenceFilePickerRef.current?.click()}>
                <ImagePlus size={17} /> {t.chooseReferenceImages}
              </button>
              <input
                ref={referenceFilePickerRef}
                id="reference-file-picker"
                name="referenceImages"
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.webp"
                className="file-picker-input"
                hidden
                onChange={(event) => addReferenceFiles(event.target.files)}
              />
              <button
                className="secondary danger"
                onClick={() => {
                  setReferenceFiles([]);
                  setRebuildDraftJob(null);
                }}
                disabled={validReferenceFiles.length === 0}
              >
                <Trash2 size={17} /> {t.clearReferenceImages}
              </button>
            </div>
            <div className="reference-list" aria-live="polite">
              {validReferenceFiles.length === 0 ? (
                <p className="muted">{t.noReferenceImages}</p>
              ) : (
                validReferenceFiles.map((file) => (
                  <div className="reference-row" key={fileKey(file)}>
                    <FileImage size={16} />
                    <span>{fileDisplayName(file)}</span>
                    <button className="secondary" title={t.delete} onClick={() => removeReferenceFile(file)}>
                      <X size={14} />
                      <span className="sr-only">{t.delete}</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="field prompt-field">
            <label>{t.prompt}</label>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t.promptPlaceholder} />
          </div>

          {rebuildDraftJob && <div className="rebuild-draft-banner">{t.rebuildDraftLoaded(rebuildDraftJob.presetName)}</div>}

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
            <div className="preset-file-actions">
              <button className="secondary wide" onClick={exportPresetFile} disabled={!presets.length}>
                <Download size={17} /> {t.exportPresets}
              </button>
              <button className="secondary wide" onClick={() => presetImportRef.current?.click()}>
                <UploadCloud size={17} /> {t.importPresets}
              </button>
            </div>
            <input
              ref={presetImportRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => importPresetFile(event.target.files?.[0])}
            />
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
                  {t.apiProviderOptions?.[provider.id] || provider.label}
                </option>
              ))}
            </select>
          </div>

          <div className="api-key-profiles">
            <div className="field compact">
              <label htmlFor="api-key-profile-name">{t.keyName}</label>
              <input
                id="api-key-profile-name"
                value={apiKeyName}
                placeholder={t.keyNamePlaceholder}
                onChange={(event) => setApiKeyName(event.target.value)}
              />
            </div>
            <div className="field compact">
              <label htmlFor="api-key-profile-select">{t.savedKeyProfiles}</label>
              <div className="grid-two">
                <select id="api-key-profile-select" value={settings.apiKeyProfileId || ''} onChange={(event) => applyKeyProfile(event.target.value)}>
                  <option value="">{t.noSavedKeyProfiles}</option>
                  {currentKeyProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
                <button className="secondary danger" onClick={deleteSelectedKeyProfile} disabled={busy || !selectedKeyProfile}>
                  <Trash2 size={17} /> {t.deleteKeyProfile}
                </button>
              </div>
            </div>
          </div>

          <div className="field">
            {settings.apiProvider !== 'geminiProxy' && (
              <>
                <label htmlFor="native-api-key">{t.apiKey}</label>
                <div className="grid-two">
                  <input
                    id="native-api-key"
                    type="password"
                    value={apiKey}
                    placeholder={
                      settings.apiProvider === 'openai'
                        ? apiKeyStatus.openai
                          ? t.savedOpenAIKey
                          : 'sk-...'
                        : apiKeyStatus.official
                          ? t.savedOfficialKey
                          : 'AIza...'
                    }
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
                  <button className="secondary" onClick={saveKey} disabled={busy || !apiKey || !settings.apiBaseUrl}>
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
              <label htmlFor="native-model-select">{t.model}</label>
              <select id="native-model-select" value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })}>
                {(settings.apiProvider === 'openai' ? OPENAI_IMAGE_MODELS : GEMINI_IMAGE_MODELS).map((model) => (
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
            {settings.apiProvider !== 'openai' && (
              <button className="secondary wide" onClick={testBatchConnection} disabled={busy || (!hasCurrentApiKey && !apiKey.trim())}>
                <ShieldCheck size={17} /> {t.testBatch}
                <span className={`test-light ${batchTestStatus}`} aria-hidden="true" />
              </button>
            )}
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

        <div className={`flow-link right-link ${isGenerating ? 'processing' : selectedJob ? 'active' : ''}`} aria-hidden="true" />

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
              <button className="secondary edit-prompt-button" onClick={() => openPromptEditor(selectedJob)}>
                <Edit3 size={17} /> {t.editJobPrompt}
              </button>
              <button
                className="secondary retry-failed-button"
                onClick={() => retryJob(selectedJob.id)}
                disabled={selectedJob.mode !== 'realtime' || counts.failed === 0}
              >
                <RotateCcw size={17} /> {t.retryFailed}
              </button>
              <button className="secondary rebuild-job-button" onClick={() => loadRebuildDraft(selectedJob)}>
                <Repeat2 size={17} /> {t.rebuildJob}
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
                  const selectJob = () => setSelectedJobId(job.id);
                  const handleJobKeyDown = (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      selectJob();
                    }
                  };
                  return (
                    <div
                      className={`job-table-row ${active ? 'active' : ''}`}
                      key={job.id}
                      role="button"
                      tabIndex={0}
                      onClick={selectJob}
                      onKeyDown={handleJobKeyDown}
                    >
                      <span className="job-select">
                        {new Date(job.createdAt).toLocaleString()}
                      </span>
                      <span>{job.mode === 'batch' ? t.batchMode : t.realtimeMode}</span>
                      <span className={`badge ${statusBadgeClass(job.status)}`}>
                        {statusLabel(job.status, language)}
                      </span>
                      <span>
                        {jobCounts.succeeded}/{jobCounts.total}
                      </span>
                      <div className="job-actions">
                        <button
                          className="secondary"
                          title={t.downloadFolder}
                          onClick={(event) => {
                            event.stopPropagation();
                            downloadJob(job);
                          }}
                        >
                          <Download size={17} />
                          <span>{t.download}</span>
                        </button>
                        <button
                          className="secondary danger"
                          title={t.deleteJobRecord}
                          onClick={(event) => {
                            event.stopPropagation();
                            requestDeleteJob(job);
                          }}
                        >
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

        </div>
      </div>

      <section className="capability-bar">
            {[
              { icon: <Zap size={30} />, ...t.capabilities[0] },
              { icon: <Cpu size={30} />, ...t.capabilities[1] },
              { icon: <Sparkles size={30} />, ...t.capabilities[2] },
              { icon: <Server size={30} />, ...t.capabilities[3] },
              { icon: <Link2 size={30} />, ...t.capabilities[4] }
            ].map((item) => (
              <div key={item.title}>
                <span>{item.icon}</span>
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </div>
            ))}
      </section>

      <label className="canvas-scale-control" htmlFor="canvas-scale">
        <span>{t.canvasScale}</span>
        <input
          id="canvas-scale"
          aria-label={t.canvasScale}
          type="range"
          min="70"
          max="100"
          step="5"
          value={canvasScale}
          onChange={(event) => setCanvasScale(normalizeCanvasScale(event.target.value))}
        />
        <b>{canvasScale}%</b>
      </label>

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

      {promptEditorJob && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-prompt-title">
          <div className="confirm-dialog prompt-dialog">
            <h2 id="edit-prompt-title">{t.editPromptDialogTitle}</h2>
            <label className="field prompt-edit-field" htmlFor="job-prompt-draft">
              <span>{t.editPromptLabel}</span>
              <textarea id="job-prompt-draft" value={promptDraft} onChange={(event) => setPromptDraft(event.target.value)} />
            </label>
            <div className="confirm-actions">
              <button className="secondary" onClick={() => setPromptEditorJob(null)}>
                {t.cancel}
              </button>
              <button className="generate-button" onClick={saveJobPrompt} disabled={!promptDraft.trim()}>
                <Save size={17} />
                {t.savePrompt}
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
      <footer className="app-footer">
        <span>{t.footer}</span>
        <nav className="developer-links" aria-label="Developer links">
          <a href="https://github.com/bleeeet" target="_blank" rel="noreferrer" aria-label="GitHub">
            <svg aria-hidden="true" data-brand-icon="github" viewBox="0 0 24 24" width="16" height="16">
              <path
                fill="currentColor"
                d="M12 .5a12 12 0 0 0-3.8 23.38c.6.1.82-.26.82-.58v-2.04c-3.34.73-4.04-1.42-4.04-1.42-.55-1.38-1.34-1.75-1.34-1.75-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.08 1.84 2.82 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.46-1.33-5.46-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.82 1.1.82 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z"
              />
            </svg>
            <span>GitHub</span>
          </a>
          <a href="https://x.com/bleetchen" target="_blank" rel="noreferrer" aria-label="X">
            <svg aria-hidden="true" data-brand-icon="x" viewBox="0 0 24 24" width="16" height="16">
              <path
                fill="currentColor"
                d="M18.9 2h3.3l-7.3 8.34L23.5 22h-6.73l-5.27-6.9L5.47 22H2.16l7.8-8.92L1.7 2h6.9l4.76 6.3L18.9 2Zm-1.16 17.95h1.83L7.6 3.94H5.63l12.11 16.01Z"
              />
            </svg>
            <span>X</span>
          </a>
        </nav>
      </footer>
    </main>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
