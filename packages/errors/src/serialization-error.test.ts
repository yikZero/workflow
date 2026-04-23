import { describe, expect, test } from 'vitest';
import { SerializationError, WorkflowError } from './index.js';

describe('SerializationError', () => {
  test('sets the name and extends WorkflowError', () => {
    const err = new SerializationError('boom');
    expect(err.name).toBe('SerializationError');
    expect(err).toBeInstanceOf(WorkflowError);
    expect(err).toBeInstanceOf(SerializationError);
  });

  test('includes the serialization-failed docs link', () => {
    const err = new SerializationError('boom');
    expect(err.message).toContain('boom');
    expect(err.message).toContain(
      'https://workflow-sdk.dev/err/serialization-failed'
    );
  });

  test('appends hint before the docs link', () => {
    const err = new SerializationError('boom', {
      hint: 'Register the class with WORKFLOW_SERIALIZE.',
    });
    expect(err.hint).toBe('Register the class with WORKFLOW_SERIALIZE.');
    expect(err.message).toMatchInlineSnapshot(`
      "boom

      Register the class with WORKFLOW_SERIALIZE.

      Learn more: https://workflow-sdk.dev/err/serialization-failed"
    `);
  });

  test('preserves cause for debugging', () => {
    const cause = new TypeError('underlying');
    const err = new SerializationError('boom', { cause });
    expect(err.cause).toBe(cause);
  });

  test('SerializationError.is discriminates by name', () => {
    const err = new SerializationError('boom');
    const other = new Error('boom');
    expect(SerializationError.is(err)).toBe(true);
    expect(SerializationError.is(other)).toBe(false);
    expect(SerializationError.is(null)).toBe(false);
  });
});
