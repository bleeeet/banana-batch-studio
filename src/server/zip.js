import AdmZip from 'adm-zip';
import { existsSync } from 'node:fs';
import path from 'node:path';

export async function createJobZip({ job, destinationDir, fileName = `${job.id}.zip` }) {
  const zipPath = path.join(destinationDir, fileName);
  const zip = new AdmZip();

  const successful = job.items.filter((item) => item.status === 'succeeded' && item.outputPath);
  const missing = [];
  for (const item of successful) {
    if (existsSync(item.outputPath)) {
      zip.addLocalFile(item.outputPath, 'outputs', item.outputName || path.basename(item.outputPath));
    } else {
      missing.push({
        originalName: item.originalName,
        error: `Output file is missing: ${item.outputPath}`
      });
    }
  }

  const failures = [
    ...missing,
    ...job.items
      .filter((item) => item.status === 'failed')
      .map((item) => ({
        originalName: item.originalName,
        error: item.error || 'Unknown error'
      }))
  ];

  zip.addFile('failures.json', Buffer.from(JSON.stringify(failures, null, 2)));
  zip.addFile(
    'run-config.json',
    Buffer.from(
      JSON.stringify(
        {
          id: job.id,
          mode: job.mode,
          prompt: job.prompt,
          settings: job.settings,
          status: job.status,
          createdAt: job.createdAt,
          completed: successful.length,
          failed: failures.length
        },
        null,
        2
      )
    )
  );

  zip.writeZip(zipPath);
  return zipPath;
}
