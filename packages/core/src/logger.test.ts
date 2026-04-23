import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { runtimeLogger } from './logger.js';

describe('logger', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('error logs go to console.error with [workflow-sdk] prefix', () => {
    runtimeLogger.error('boom', { foo: 'bar' });
    expect(errorSpy).toHaveBeenCalledWith('[workflow-sdk] boom', {
      foo: 'bar',
    });
  });

  test('warn logs go to console.warn with [workflow-sdk] prefix', () => {
    runtimeLogger.warn('watch out', { foo: 'bar' });
    expect(warnSpy).toHaveBeenCalledWith('[workflow-sdk] watch out', {
      foo: 'bar',
    });
  });

  test('info and debug do not print to console by default', () => {
    runtimeLogger.info('quiet');
    runtimeLogger.debug('quieter');
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('child() merges parent metadata into every call', () => {
    const child = runtimeLogger.child({ workflowRunId: 'run-1' });
    child.error('boom', { stepId: 'step-1' });
    expect(errorSpy).toHaveBeenCalledWith('[workflow-sdk] boom', {
      workflowRunId: 'run-1',
      stepId: 'step-1',
    });
  });

  test('call-site metadata wins over child metadata on conflict', () => {
    const child = runtimeLogger.child({ workflowRunId: 'parent-id' });
    child.error('boom', { workflowRunId: 'override' });
    expect(errorSpy).toHaveBeenCalledWith('[workflow-sdk] boom', {
      workflowRunId: 'override',
    });
  });

  test('child can be chained', () => {
    const runLogger = runtimeLogger.child({ workflowRunId: 'run-1' });
    const stepLogger = runLogger.child({ stepId: 'step-1' });
    stepLogger.error('boom');
    expect(errorSpy).toHaveBeenCalledWith('[workflow-sdk] boom', {
      workflowRunId: 'run-1',
      stepId: 'step-1',
    });
  });

  test('forRun attaches workflowRunId and workflowName', () => {
    const runLogger = runtimeLogger.forRun('run-1', 'myWorkflow');
    runLogger.error('boom');
    expect(errorSpy).toHaveBeenCalledWith('[workflow-sdk] boom', {
      workflowRunId: 'run-1',
      workflowName: 'myWorkflow',
    });
  });

  test('forRun without workflowName omits the key', () => {
    const runLogger = runtimeLogger.forRun('run-1');
    runLogger.error('boom');
    expect(errorSpy).toHaveBeenCalledWith('[workflow-sdk] boom', {
      workflowRunId: 'run-1',
    });
  });

  test('forRun accepts extra metadata', () => {
    const runLogger = runtimeLogger.forRun('run-1', 'myWorkflow', {
      stepId: 'step-1',
    });
    runLogger.error('boom');
    expect(errorSpy).toHaveBeenCalledWith('[workflow-sdk] boom', {
      workflowRunId: 'run-1',
      workflowName: 'myWorkflow',
      stepId: 'step-1',
    });
  });

  test('no metadata omits the argument object', () => {
    runtimeLogger.error('boom');
    expect(errorSpy).toHaveBeenCalledWith('[workflow-sdk] boom', '');
  });
});
