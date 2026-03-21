import { createRequire } from 'node:module';
import { Module } from '@nestjs/common';
import { WorkflowModule } from 'workflow/nest';
import { AppController } from './app.controller.js';

// Use createRequire to import the manifest as a JSON module.
// require() resolves relative to the file (not CWD) and NFT traces it.
// The workflow-nest build CLI writes this file to dist/ during postbuild.
const require = createRequire(import.meta.url);
try {
  const data = require('./workflow-manifest.json');
  (globalThis as any).__workflowManifestJson = JSON.stringify(data);
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
