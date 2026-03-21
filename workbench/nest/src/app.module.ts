import { readFileSync } from 'node:fs';
import { Module } from '@nestjs/common';
import { WorkflowModule } from 'workflow/nest';
import { AppController } from './app.controller.js';

// Eagerly read the manifest at module load time. This serves two purposes:
// 1. On Vercel, it reads the file before WorkflowController needs it
// 2. The static string '.nestjs/workflow/manifest.json' helps NFT trace the file
//
// We store it on process so the controller can access it without readFileSync.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Read manifest from dist/workflow-manifest.json at module load time.
// Use import.meta.url to resolve the path relative to THIS file (not CWD).
// NFT should trace the readFileSync and include the file.
const __moduleDir = dirname(fileURLToPath(import.meta.url));
try {
  const data = readFileSync(
    join(__moduleDir, 'workflow-manifest.json'),
    'utf-8'
  );
  (globalThis as any).__workflowManifestJson = data;
} catch {
  // File doesn't exist during dev (built at runtime by WorkflowModule)
}

@Module({
  imports: [
    WorkflowModule.forRoot({
      skipBuild: !!process.env.VERCEL,
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
