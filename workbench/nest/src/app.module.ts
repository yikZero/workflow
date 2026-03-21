import { Module } from '@nestjs/common';
import { WorkflowModule } from 'workflow/nest';
import { AppController } from './app.controller.js';

@Module({
  imports: [
    WorkflowModule.forRoot({
      skipBuild: !!process.env.VERCEL,
      // On Vercel, the esbuild banner writes manifest.json to /tmp/_wf_manifest/
      // at import time. Point the controller's outDir there so it can serve it.
      ...(process.env.VERCEL ? { outDir: '/tmp/_wf_manifest' } : {}),
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
