import type { NextConfig } from 'next';
import path from 'node:path';
import { withWorkflow } from 'workflow/next';

const turbopackRoot = path.resolve(process.cwd(), '../..');

const nextConfig: NextConfig = {
  serverExternalPackages: ['@node-rs/xxhash'],
  turbopack: {
    root: turbopackRoot,
  },
};

export default withWorkflow(nextConfig, {
  workflows: { lazyDiscovery: false },
});
