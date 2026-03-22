import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { All, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { join } from 'pathe';

// Module-level state for configuration
let configuredOutDir: string | null = null;
let configuredManifestJson: string | null = null;

/**
 * Configure the workflow controller with the output directory
 */
export function configureWorkflowController(outDir: string): void {
  configuredOutDir = outDir;
}

/**
 * Pre-configure the manifest JSON so the controller doesn't need readFileSync.
 * Useful on Vercel where the manifest file may not be accessible via filesystem.
 */
export function configureManifest(manifestJson: string): void {
  configuredManifestJson = manifestJson;
}

/**
 * Convert Express/Fastify request to Web API Request
 */
function toWebRequest(req: any): Request {
  // Works for both Express and Fastify
  const protocol =
    req.protocol ?? (req.raw?.socket?.encrypted ? 'https' : 'http');
  const host = req.headers.host ?? req.hostname;
  const url = req.originalUrl ?? req.url;
  const fullUrl = `${protocol}://${host}${url}`;

  const headers = req.headers;
  const method = req.method;
  const body = req.body;

  return new globalThis.Request(fullUrl, {
    method,
    headers,
    body:
      method !== 'GET' && method !== 'HEAD'
        ? body === undefined
          ? undefined
          : typeof body === 'string'
            ? body
            : JSON.stringify(body)
        : undefined,
  });
}

/**
 * Send Web API Response back via Express/Fastify response
 */
async function sendWebResponse(
  res: any,
  webResponse: globalThis.Response
): Promise<void> {
  const status = webResponse.status;
  const headers: Record<string, string> = {};
  webResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const body = await webResponse.text();

  // Works for both Express and Fastify
  if (typeof res.code === 'function') {
    // Fastify
    res.code(status).headers(headers).send(body);
  } else {
    // Express - use res.end() instead of res.send() to avoid automatic charset addition
    res.status(status);
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
    // Use res.end() to send the body without Express modifying headers
    res.end(body);
  }
}

function getOutDir(): string {
  if (!configuredOutDir) {
    throw new Error(
      'WorkflowController not configured. Call configureWorkflowController first.'
    );
  }
  return configuredOutDir;
}

/**
 * Load a workflow bundle by name. Tries filesystem first (local dev),
 * then falls back to base64-encoded bundles from globalThis (Vercel).
 */
async function loadBundle(
  filename: string
): Promise<{ POST: (req: Request) => Promise<Response> }> {
  const outDir = getOutDir();
  const filePath = join(outDir, filename);

  // Try filesystem first (works in local dev)
  try {
    return await import(pathToFileURL(filePath).href);
  } catch {
    // File not found — try base64 fallback
  }

  // Fallback: decode base64-encoded bundle from globalThis (set by app.module.ts)
  const bundleName = filename.replace('.mjs', '');
  const base64 = (globalThis as any)[`__workflowBundle_${bundleName}`] as
    | string
    | undefined;
  if (!base64) {
    throw new Error(
      `Workflow bundle ${filename} not found at ${filePath} and no base64 fallback available`
    );
  }

  // Write to /tmp/ but symlink node_modules so package resolution works.
  // The Lambda filesystem is read-only except /tmp/.
  const tmpDir = '/tmp/_wf_bundles';
  const tmpPath = join(tmpDir, filename);
  if (!existsSync(tmpPath)) {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(tmpPath, Buffer.from(base64, 'base64'));
    // Create a node_modules symlink so the bundle can resolve packages
    const nodeModulesLink = join(tmpDir, 'node_modules');
    if (!existsSync(nodeModulesLink)) {
      try {
        const { symlinkSync } = require('node:fs') as typeof import('node:fs');
        symlinkSync(join(process.cwd(), 'node_modules'), nodeModulesLink);
      } catch {
        // Symlink might fail in some environments
      }
    }
  }
  return await import(pathToFileURL(tmpPath).href);
}

/**
 * Controller that handles the well-known workflow endpoints.
 * Dynamically imports the generated bundles and handles request/response conversion.
 */
@Controller('.well-known/workflow/v1')
export class WorkflowController {
  @Post('step')
  async handleStep(@Req() req: any, @Res() res: any) {
    const { POST } = await loadBundle('steps.mjs');
    const webRequest = toWebRequest(req);
    const webResponse = await POST(webRequest);
    await sendWebResponse(res, webResponse);
  }

  @Post('flow')
  async handleFlow(@Req() req: any, @Res() res: any) {
    const { POST } = await loadBundle('workflows.mjs');
    const webRequest = toWebRequest(req);
    const webResponse = await POST(webRequest);
    await sendWebResponse(res, webResponse);
  }

  @All('webhook/:token')
  async handleWebhook(@Req() req: any, @Res() res: any) {
    const { POST } = await loadBundle('webhook.mjs');
    const webRequest = toWebRequest(req);
    const webResponse = await POST(webRequest);
    await sendWebResponse(res, webResponse);
  }

  @Get('manifest.json')
  async handleManifest(@Res() res: any) {
    if (process.env.WORKFLOW_PUBLIC_MANIFEST !== '1') {
      if (typeof res.code === 'function') {
        res.code(404).send('');
      } else {
        res.status(404).end('');
      }
      return;
    }
    let manifest: string;
    try {
      // Check pre-configured manifest, then globalThis, then filesystem
      manifest =
        configuredManifestJson ??
        (globalThis as any).__workflowManifestJson ??
        readFileSync(join(getOutDir(), 'manifest.json'), 'utf-8');
    } catch {
      if (typeof res.code === 'function') {
        res.code(404).send('');
      } else {
        res.status(404).end('');
      }
      return;
    }
    const webResponse = new Response(manifest, {
      headers: { 'content-type': 'application/json' },
    });
    await sendWebResponse(res, webResponse);
  }
}
