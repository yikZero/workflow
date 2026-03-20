import { NestLocalBuilder } from '@workflow/nest/builder';

const builder = new NestLocalBuilder({
  workingDir: process.cwd(),
  dirs: ['src'],
  moduleType: 'es6',
});

await builder.buildVercelOutput({ entryPoint: 'api/index.js' });
