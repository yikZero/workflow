import { WorkflowRuntimeError } from '@workflow/errors';
import { describe, expect, it } from 'vitest';
import {
  getWorkflowRuntimeFromEnv,
  WORKFLOW_RUNTIMES,
} from './runtime-mode.js';

describe('getWorkflowRuntimeFromEnv', () => {
  it('returns undefined when WORKFLOW_RUNTIME is not set', () => {
    expect(getWorkflowRuntimeFromEnv({})).toBeUndefined();
  });

  it('returns undefined when WORKFLOW_RUNTIME is empty', () => {
    expect(getWorkflowRuntimeFromEnv({ WORKFLOW_RUNTIME: '' })).toBeUndefined();
  });

  it('returns "snapshot" when WORKFLOW_RUNTIME=snapshot', () => {
    expect(getWorkflowRuntimeFromEnv({ WORKFLOW_RUNTIME: 'snapshot' })).toBe(
      'snapshot'
    );
  });

  it('returns "replay" when WORKFLOW_RUNTIME=replay', () => {
    expect(getWorkflowRuntimeFromEnv({ WORKFLOW_RUNTIME: 'replay' })).toBe(
      'replay'
    );
  });

  it('throws WorkflowRuntimeError on unknown values', () => {
    expect(() =>
      getWorkflowRuntimeFromEnv({ WORKFLOW_RUNTIME: 'bogus' })
    ).toThrow(WorkflowRuntimeError);
    expect(() =>
      getWorkflowRuntimeFromEnv({ WORKFLOW_RUNTIME: 'bogus' })
    ).toThrow(/Invalid WORKFLOW_RUNTIME value: "bogus"/);
  });

  it('is case-sensitive: uppercase values are rejected', () => {
    expect(() =>
      getWorkflowRuntimeFromEnv({ WORKFLOW_RUNTIME: 'SNAPSHOT' })
    ).toThrow(WorkflowRuntimeError);
    expect(() =>
      getWorkflowRuntimeFromEnv({ WORKFLOW_RUNTIME: 'Replay' })
    ).toThrow(WorkflowRuntimeError);
  });

  it('rejects leading/trailing whitespace', () => {
    expect(() =>
      getWorkflowRuntimeFromEnv({ WORKFLOW_RUNTIME: ' snapshot' })
    ).toThrow(WorkflowRuntimeError);
    expect(() =>
      getWorkflowRuntimeFromEnv({ WORKFLOW_RUNTIME: 'replay ' })
    ).toThrow(WorkflowRuntimeError);
  });

  it('error message lists valid options', () => {
    try {
      getWorkflowRuntimeFromEnv({ WORKFLOW_RUNTIME: 'bogus' });
      expect.fail('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(WorkflowRuntimeError);
      for (const mode of WORKFLOW_RUNTIMES) {
        expect((err as Error).message).toContain(mode);
      }
    }
  });
});
