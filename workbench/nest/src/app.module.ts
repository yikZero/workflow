import { Module } from '@nestjs/common';
import { WorkflowModule } from 'workflow/nest';
import { AppController } from './app.controller.js';

@Module({
  imports: [
    WorkflowModule.forRoot({
      // On Vercel, workflow routes (step, flow, webhook) are separate Build
      // Output API functions. The manifest is served inline by the wrapper.
      // Skip building bundles that would fail in the serverless context.
      skipBuild: !!process.env.VERCEL,
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
