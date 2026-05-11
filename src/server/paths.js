import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export const APP_DATA_DIR = process.env.GEMINI_BATCH_STUDIO_DATA_DIR || path.join(process.cwd(), 'app-data');
export const UPLOAD_DIR = path.join(APP_DATA_DIR, 'uploads');
export const OUTPUT_DIR = path.join(APP_DATA_DIR, 'outputs');
export const BATCH_DIR = path.join(APP_DATA_DIR, 'batch');
export const ZIP_DIR = path.join(APP_DATA_DIR, 'zips');
export const DB_PATH = path.join(APP_DATA_DIR, 'jobs.sqlite');
export const KEY_FILE_PATH = process.env.GEMINI_BATCH_STUDIO_KEY_FILE || path.join(APP_DATA_DIR, 'api-keys.json');

export async function ensureAppDirs() {
  await Promise.all([UPLOAD_DIR, OUTPUT_DIR, BATCH_DIR, ZIP_DIR].map((dir) => mkdir(dir, { recursive: true })));
}
