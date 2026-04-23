import {
  RUN_ERROR_CODES,
  SerializationError,
  StepNotRegisteredError,
  WorkflowRuntimeError,
} from '@workflow/errors';
import { describe, expect, test } from 'vitest';
import {
  NotInStepContextError,
  NotInWorkflowContextError,
} from './context-errors.js';
import { describeError } from './describe-error.js';

describe('describeError', () => {
  test('plain user errors are attributed to the user with no hint', () => {
    const result = describeError(new Error('something user code did'));
    expect(result.attribution).toBe('user');
    expect(result.errorCode).toBe(RUN_ERROR_CODES.USER_ERROR);
    expect(result.hint).toBeUndefined();
  });

  test('non-Error throws are attributed to the user', () => {
    expect(describeError('string').attribution).toBe('user');
    expect(describeError(undefined).attribution).toBe('user');
    expect(describeError(null).attribution).toBe('user');
    expect(describeError({ oops: true }).attribution).toBe('user');
  });

  test('SerializationError is attributed to the user with a hint', () => {
    const result = describeError(
      new SerializationError('Failed to serialize step arguments')
    );
    expect(result.attribution).toBe('user');
    expect(result.hint).toContain('serialized');
  });

  test('context-violation errors are attributed to the user', () => {
    const workflowOnly = describeError(
      new NotInWorkflowContextError(
        'createHook',
        'hooks: https://example.com/hooks'
      )
    );
    expect(workflowOnly.attribution).toBe('user');
    expect(workflowOnly.hint).toContain('wrong context');

    const stepOnly = describeError(
      new NotInStepContextError(
        'respondWith',
        'webhook responses: https://example.com/webhook'
      )
    );
    expect(stepOnly.attribution).toBe('user');
    expect(stepOnly.hint).toContain('wrong context');
  });

  test('WorkflowRuntimeError is attributed to the SDK', () => {
    const result = describeError(
      new WorkflowRuntimeError('corrupted event log')
    );
    expect(result.attribution).toBe('sdk');
    expect(result.errorCode).toBe(RUN_ERROR_CODES.RUNTIME_ERROR);
    expect(result.hint).toContain('internal workflow SDK error');
  });

  test('StepNotRegisteredError (subclass of WorkflowRuntimeError) is attributed to the SDK', () => {
    const result = describeError(new StepNotRegisteredError('missingStep'));
    expect(result.attribution).toBe('sdk');
    expect(result.errorCode).toBe(RUN_ERROR_CODES.RUNTIME_ERROR);
  });
});
