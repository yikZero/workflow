import { readFileSync } from 'node:fs';
import { Module } from '@nestjs/common';
import { WorkflowModule } from 'workflow/nest';
import { AppController } from './app.controller.js';

// Read manifest using the new URL() + import.meta.url pattern that
// @vercel/nft traces statically AND resolves correctly at runtime.
// The workflow-nest build CLI copies manifest.json to dist/ during postbuild.
try {
  const data = readFileSync(
    new URL('./workflow-manifest.json', import.meta.url),
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
