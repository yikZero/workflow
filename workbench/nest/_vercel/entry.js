import { readFileSync } from 'node:fs';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import { AppModule } from '../dist/app.module.js';

// Load embedded manifest at import time. The builder writes this file
// alongside the entry point during buildVercelOutput().
// Use new URL() pattern so Vercel's NFT can trace and include the file.
let __manifest;
try {
  __manifest = readFileSync(
    new URL('./__manifest.json', import.meta.url),
    'utf-8'
  );
} catch {}

let ready;

async function createHandler() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  app.use(express.json());
  app.use(express.text({ type: 'text/*' }));
  app.use(express.raw({ type: 'application/octet-stream' }));
  await app.init();
  return app.getHttpAdapter().getInstance();
}

export default async (req, res) => {
  // Serve manifest inline — the WorkflowController can't access the
  // manifest file in the serverless function context
  if (
    __manifest &&
    /\/.well-known\/workflow\/v1\/manifest\.json/.test(req.url || '')
  ) {
    res.setHeader('content-type', 'application/json');
    res.end(__manifest);
    return;
  }
  ready ??= createHandler();
  return (await ready)(req, res);
};
