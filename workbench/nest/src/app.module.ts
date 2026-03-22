import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { WorkflowModule } from 'workflow/nest';
import { AppController } from './app.controller.js';

// Force-enable manifest serving on Vercel
if (process.env.VERCEL) {
  process.env.WORKFLOW_PUBLIC_MANIFEST = '1';
}

// Static imports of generated bundle data. These are compiled by nest
// build and NFT traces static imports. The @ts-ignore is needed because
// the files are generated during prebuild and don't exist at typecheck time.

// @ts-ignore — generated at build time
import { manifestJson } from './_manifest-data.js';
// @ts-ignore — generated at build time
import { bundleBase64 as stepsBundleBase64 } from './_steps-bundle.js';
// @ts-ignore — generated at build time
import { bundleBase64 as workflowsBundleBase64 } from './_workflows-bundle.js';
// @ts-ignore — generated at build time
import { bundleBase64 as webhookBundleBase64 } from './_webhook-bundle.js';

// Set bundles on globalThis for the WorkflowController's loadBundle() fallback
if (stepsBundleBase64) {
  (globalThis as any).__workflowBundle_steps = stepsBundleBase64;
}
if (workflowsBundleBase64) {
  (globalThis as any).__workflowBundle_workflows = workflowsBundleBase64;
}
if (webhookBundleBase64) {
  (globalThis as any).__workflowBundle_webhook = webhookBundleBase64;
}

@Module({
  imports: [
    WorkflowModule.forRoot({
      skipBuild: !!process.env.VERCEL,
      ...(process.env.VERCEL
        ? { outDir: join(process.cwd(), 'dist', 'workflow') }
        : {}),
      ...(manifestJson ? { manifestJson } : {}),
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
