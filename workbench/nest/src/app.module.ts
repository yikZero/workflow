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
      // Set workingDir to the bundle directory so the controller can find
      // manifest.json at .nestjs/workflow/manifest.json relative to the bundle.
      ...(process.env.VERCEL ? { workingDir: bundleDir } : {}),
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
