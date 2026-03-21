import { readFileSync } from 'node:fs';
import { Module } from '@nestjs/common';
import { WorkflowModule } from 'workflow/nest';
import { AppController } from './app.controller.js';

// Eagerly read the manifest at module load time. This serves two purposes:
// 1. On Vercel, it reads the file before WorkflowController needs it
// 2. The static string '.nestjs/workflow/manifest.json' helps NFT trace the file
//
// We store it on process so the controller can access it without readFileSync.
// Eagerly read manifest from dist/workflow-manifest.json. Using a path
// inside dist/ ensures @vercel/nft includes it (NFT always traces dist/).
// The workflow-nest build CLI copies the manifest here during postbuild.
try {
  // Relative to THIS file after compilation: dist/workflow-manifest.json
  const data = readFileSync('./workflow-manifest.json', 'utf-8');
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
