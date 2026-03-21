import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import { AppModule } from '../dist/app.module.js';
import { manifest as __manifest } from './__manifest.js';

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
  // DEBUG: return manifest info for /__wf_test endpoint
  if ((req.url || '').includes('__wf_test')) {
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        hasManifest: !!__manifest,
        manifestLength: __manifest?.length || 0,
        manifestStart: (__manifest || '').substring(0, 100),
        url: req.url,
      })
    );
    return;
  }
  // Serve manifest inline — the manifest JSON is imported from a
  // generated file that workflow-nest build populates during postbuild
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
