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
    const checkPaths = [
      '/tmp/_wf_manifest/manifest.json',
      join(cwd, '_workflow/manifest.json'),
      join(cwd, '.nestjs/workflow/manifest.json'),
    ];
    const found = checkPaths.filter((p) => existsSync(p));
    // Search for manifest.json recursively in common dirs
    const searchDirs = ['/tmp', '/var/task'];
    const manifestFiles: string[] = [];
    const walkDir = (dir: string, depth: number) => {
      if (depth > 3) return;
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          if (
            entry.name === 'manifest.json' &&
            !full.includes('node_modules')
          ) {
            manifestFiles.push(full);
          }
          if (
            entry.isDirectory() &&
            !['node_modules', '.git', 'packages'].includes(entry.name)
          ) {
            walkDir(full, depth + 1);
          }
        }
      } catch {}
    };
    for (const d of searchDirs) walkDir(d, 0);

    return {
      cwd,
      bundleDir,
      found,
      manifestFiles,
      cwdContents: readdirSync(cwd).slice(0, 20),
      vcContents: (() => {
        try {
          return readdirSync('/var/task/___vc').slice(0, 20);
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
