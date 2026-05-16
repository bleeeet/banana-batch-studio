import AdmZip from 'adm-zip';
import { existsSync } from 'node:fs';
import path from 'node:path';

function uniqueZipName(name, usedNames) {
  const parsed = path.parse(name || 'gemini-image.png');
  let candidate = `${parsed.name}${parsed.ext}`;
  let index = 2;
  while (usedNames.has(candidate)) {
    candidate = `${parsed.name}-${index}${parsed.ext}`;
    index += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

export async function createJobZip({ job, destinationDir, fileName = `${job.id}.zip` }) {
  const zipPath = path.join(destinationDir, fileName);
  const zip = new AdmZip();

  const successful = job.items.filter((item) => item.status === 'succeeded' && item.outputPath);
  const usedNames = new Set();
  for (const item of successful) {
    if (existsSync(item.outputPath)) {
      zip.addLocalFile(item.outputPath, '', uniqueZipName(item.outputName || path.basename(item.outputPath), usedNames));
    }
  }

  zip.writeZip(zipPath);
  return zipPath;
}
