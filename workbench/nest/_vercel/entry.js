import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import { AppModule } from '../dist/app.module.js';

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
  ready ??= createHandler();
  return (await ready)(req, res);
};
