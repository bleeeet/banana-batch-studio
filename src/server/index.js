import dotenv from 'dotenv';
import { createApp } from './app.js';
import { configureProxyFromEnv } from './proxy.js';

dotenv.config();
const proxy = configureProxyFromEnv();

const port = Number(process.env.PORT || 4178);
const app = await createApp();

app.listen(port, '127.0.0.1', () => {
  console.log(`Banana Batch Studio is running at http://127.0.0.1:${port}`);
  if (proxy.enabled) console.log(`Gemini requests use macOS system proxy: ${proxy.proxyUrl}`);
});
