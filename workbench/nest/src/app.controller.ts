import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Body, Controller, Get, Post } from '@nestjs/common';

const bundleDir = dirname(fileURLToPath(import.meta.url));

@Controller('api')
export class AppController {
  @Get('debug')
  debug() {
    const cwd = process.cwd();
    const outDir = process.env.VERCEL
      ? bundleDir + '/_workflow'
      : join(cwd, '.nestjs/workflow');
    const manifestPath = join(outDir, 'manifest.json');
    return {
      cwd,
      bundleDir,
      outDir,
      manifestPath,
      manifestExists: existsSync(manifestPath),
      VERCEL: process.env.VERCEL,
      WORKFLOW_PUBLIC_MANIFEST: process.env.WORKFLOW_PUBLIC_MANIFEST,
      cwdContents: readdirSync(cwd).slice(0, 20),
      bundleDirContents: (() => {
        try {
          return readdirSync(bundleDir).slice(0, 20);
        } catch {
          return 'error';
        }
      })(),
    };
  }

  @Post('test-direct-step-call')
  async invokeStepDirectly(@Body() body: { x: number; y: number }) {
    // This route tests calling step functions directly outside of any workflow context
    // After the SWC compiler changes, step functions in client mode have their directive removed
    // and keep their original implementation, allowing them to be called as regular async functions
    const { add } = await import('./workflows/98_duplicate_case.js');

    const { x, y } = body;

    console.log(`Calling step function directly with x=${x}, y=${y}`);

    // Call step function directly as a regular async function (no workflow context)
    const result = await add(x, y);
    console.log(`add(${x}, ${y}) = ${result}`);

    return { result };
  }
}
