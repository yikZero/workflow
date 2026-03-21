import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { WorkflowModule } from 'workflow/nest';
import { AppController } from './app.controller.js';

// Read manifest from dist/workflow-manifest.json at module load time.
// The workflow-nest build CLI copies it there during the build step.
// On Vercel's Lambda, process.cwd() is the project root and dist/
// is NFT-traced (included in the Lambda automatically).
try {
  const manifestPath = join(process.cwd(), 'dist', 'workflow-manifest.json');
  const data = readFileSync(manifestPath, 'utf-8');
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
