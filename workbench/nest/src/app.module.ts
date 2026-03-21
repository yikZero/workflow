import { readFileSync } from 'node:fs';
import { Module } from '@nestjs/common';
import { WorkflowModule } from 'workflow/nest';
import { AppController } from './app.controller.js';

// Eagerly read the manifest at module load time. This serves two purposes:
// 1. On Vercel, it reads the file before WorkflowController needs it
// 2. The static string '.nestjs/workflow/manifest.json' helps NFT trace the file
//
// We store it on process so the controller can access it without readFileSync.
// Use a non-dotted output dir so @vercel/nft doesn't skip it.
// NFT may ignore dotfile directories like .nestjs/.
const WORKFLOW_OUT_DIR = 'workflow-out';

try {
  // Path relative to dist/app.module.js → ../workflow-out/manifest.json
  const data = readFileSync(`../${WORKFLOW_OUT_DIR}/manifest.json`, 'utf-8');
  (globalThis as any).__workflowManifestJson = data;
} catch {
  // File doesn't exist during dev (built at runtime by WorkflowModule)
}

@Module({
  imports: [
    WorkflowModule.forRoot({
      skipBuild: !!process.env.VERCEL,
      outDir: `./${WORKFLOW_OUT_DIR}`,
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
