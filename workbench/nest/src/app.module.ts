import { createRequire } from 'node:module';
import { Module } from '@nestjs/common';
import { WorkflowModule } from 'workflow/nest';
import { AppController } from './app.controller.js';

// Force-enable manifest serving on Vercel
if (process.env.VERCEL) {
  process.env.WORKFLOW_PUBLIC_MANIFEST = '1';
}

// Load manifest synchronously using createRequire. The workflow-nest build
// CLI writes dist/workflow-manifest.js during postbuild. On Vercel, the
// NestJS preset copies all of dist/ to the Lambda, so the file is available.
const _require = createRequire(import.meta.url);
try {
  const manifest = _require('./workflow-manifest.js');
  (globalThis as any).__workflowManifestJson =
    typeof manifest === 'string' ? manifest : JSON.stringify(manifest);
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
