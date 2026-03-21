import { Module } from '@nestjs/common';
import { WorkflowModule } from 'workflow/nest';
import { AppController } from './app.controller.js';

@Module({
  imports: [
    WorkflowModule.forRoot({
      // On Vercel, workflow routes are handled by separate Build Output API
      // functions (step.func, flow.func, webhook.func) — not the NestJS
      // controller. Skip building bundles that would fail in the serverless
      // function context (no source files available).
      skipBuild: !!process.env.VERCEL,
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
