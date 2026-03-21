import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Module } from '@nestjs/common';
import { WorkflowModule } from 'workflow/nest';
import { AppController } from './app.controller.js';

// On Vercel, the bundled function's CWD differs from the function directory.
// Use import.meta.url to resolve the correct base path for manifest.json.
const bundleDir = dirname(fileURLToPath(import.meta.url));

@Module({
  imports: [
    WorkflowModule.forRoot({
      // On Vercel, workflow routes are handled by separate Build Output API
      // functions (step.func, flow.func, webhook.func) — not the NestJS
      // controller. Skip building bundles that would fail in the serverless
      // function context (no source files available).
      skipBuild: !!process.env.VERCEL,
      // Set outDir to _workflow inside the bundle directory. On Vercel,
      // the manifest is at _workflow/manifest.json relative to the bundle.
      ...(process.env.VERCEL ? { outDir: bundleDir + '/_workflow' } : {}),
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
