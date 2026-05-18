import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getReplayTimeoutMs,
  MAX_REPLAY_TIMEOUT_MS,
  MIN_REPLAY_TIMEOUT_MS,
  REPLAY_TIMEOUT_MS,
} from './constants.js';

describe('getReplayTimeoutMs', () => {
  const originalEnv = process.env.WORKFLOW_REPLAY_TIMEOUT_MS;

  beforeEach(() => {
    delete process.env.WORKFLOW_REPLAY_TIMEOUT_MS;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WORKFLOW_REPLAY_TIMEOUT_MS;
    } else {
      process.env.WORKFLOW_REPLAY_TIMEOUT_MS = originalEnv;
    }
  });

  it('returns the default when the env var is unset', () => {
    expect(getReplayTimeoutMs()).toBe(REPLAY_TIMEOUT_MS);
  });

  it('returns the default when the env var is empty', () => {
    process.env.WORKFLOW_REPLAY_TIMEOUT_MS = '';
    expect(getReplayTimeoutMs()).toBe(REPLAY_TIMEOUT_MS);
  });

  it('returns the default when the env var is non-numeric', () => {
    process.env.WORKFLOW_REPLAY_TIMEOUT_MS = 'not-a-number';
    expect(getReplayTimeoutMs()).toBe(REPLAY_TIMEOUT_MS);
  });

  it('returns the default when the env var is zero', () => {
    process.env.WORKFLOW_REPLAY_TIMEOUT_MS = '0';
    expect(getReplayTimeoutMs()).toBe(REPLAY_TIMEOUT_MS);
  });

  it('returns the default when the env var is negative', () => {
    process.env.WORKFLOW_REPLAY_TIMEOUT_MS = '-100';
    expect(getReplayTimeoutMs()).toBe(REPLAY_TIMEOUT_MS);
  });

  it('clamps to MIN_REPLAY_TIMEOUT_MS when the env var is below the floor', () => {
    process.env.WORKFLOW_REPLAY_TIMEOUT_MS = '5000';
    expect(getReplayTimeoutMs()).toBe(MIN_REPLAY_TIMEOUT_MS);
  });

  it('clamps to MAX_REPLAY_TIMEOUT_MS when the env var is above the ceiling', () => {
    process.env.WORKFLOW_REPLAY_TIMEOUT_MS = '9999999';
    expect(getReplayTimeoutMs()).toBe(MAX_REPLAY_TIMEOUT_MS);
  });

  it('honors an in-range override', () => {
    process.env.WORKFLOW_REPLAY_TIMEOUT_MS = '600000';
    expect(getReplayTimeoutMs()).toBe(600_000);
  });

  it('accepts the lower-bound value exactly', () => {
    process.env.WORKFLOW_REPLAY_TIMEOUT_MS = String(MIN_REPLAY_TIMEOUT_MS);
    expect(getReplayTimeoutMs()).toBe(MIN_REPLAY_TIMEOUT_MS);
  });

  it('accepts the upper-bound value exactly', () => {
    process.env.WORKFLOW_REPLAY_TIMEOUT_MS = String(MAX_REPLAY_TIMEOUT_MS);
    expect(getReplayTimeoutMs()).toBe(MAX_REPLAY_TIMEOUT_MS);
  });

  it('rejects Infinity and falls back to the default', () => {
    process.env.WORKFLOW_REPLAY_TIMEOUT_MS = 'Infinity';
    expect(getReplayTimeoutMs()).toBe(REPLAY_TIMEOUT_MS);
  });

  it('rejects NaN and falls back to the default', () => {
    process.env.WORKFLOW_REPLAY_TIMEOUT_MS = 'NaN';
    expect(getReplayTimeoutMs()).toBe(REPLAY_TIMEOUT_MS);
  });
});
