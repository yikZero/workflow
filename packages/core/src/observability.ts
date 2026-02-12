/**
 * Observability utilities for workflow inspection.
 * Shared between CLI and Web UI for consistent behavior.
 */

import { inspect } from 'node:util';
import { parseClassName } from '@workflow/utils/parse-name';
import { unflatten } from 'devalue';
import { runtimeLogger } from './logger.js';
import {
  getCommonRevivers,
  hydrateStepArguments,
  hydrateStepReturnValue,
  hydrateWorkflowArguments,
  hydrateWorkflowReturnValue,
} from './serialization.js';

const STREAM_ID_PREFIX = 'strm_';

/**
 * Marker for stream reference objects that can be rendered as links
 */
export const STREAM_REF_TYPE = '__workflow_stream_ref__';

/**
 * A stream reference object that contains the stream ID and can be
 * detected in the UI to render as a clickable link
 */
export interface StreamRef {
  __type: typeof STREAM_REF_TYPE;
  streamId: string;
}

/**
 * Marker for custom class instance references.
 * Used in observability to represent serialized class instances
 * that cannot be fully deserialized (because the class is not registered).
 */
export const CLASS_INSTANCE_REF_TYPE = '__workflow_class_instance_ref__';

/**
 * A class instance reference that contains the class name and serialized data.
 * This is used during o11y hydration when a custom class instance is encountered
 * but the class is not registered for deserialization.
 *
 * Provides a custom `util.inspect.custom` representation for nice CLI output:
 * `Point { x: 1, y: 2 } [class//path/to/file.ts//Point]`
 */
export class ClassInstanceRef {
  readonly __type = CLASS_INSTANCE_REF_TYPE;

  constructor(
    public readonly className: string,
    public readonly classId: string,
    public readonly data: unknown
  ) {}

  /**
   * Custom inspect for Node.js util.inspect (used by console.log, CLI, etc.)
   * Renders as: ClassName@filename { ...data }
   * The @filename portion is styled gray (like undefined in Node.js)
   */
  [inspect.custom](
    _depth: number,
    options: import('node:util').InspectOptionsStylized
  ): string {
    const dataStr = inspect(this.data, { ...options, depth: options.depth });
    const parsed = parseClassName(this.classId);
    const moduleSpecifier = parsed?.moduleSpecifier ?? this.classId;
    // Extract just the module name from the specifier
    const fileName = moduleSpecifier.split('/').pop() ?? moduleSpecifier;
    // Style the @filename portion gray using the 'undefined' style
    const styledFileName = options.stylize
      ? options.stylize(`@${fileName}`, 'undefined')
      : `@${fileName}`;
    return `${this.className}${styledFileName} ${dataStr}`;
  }

  /**
   * For JSON.stringify - returns a plain object representation
   */
  toJSON(): {
    __type: string;
    className: string;
    classId: string;
    data: unknown;
  } {
    return {
      __type: this.__type,
      className: this.className,
      classId: this.classId,
      data: this.data,
    };
  }
}

/**
 * Check if a value is a ClassInstanceRef object
 */
export const isClassInstanceRef = (
  value: unknown
): value is ClassInstanceRef => {
  return (
    value instanceof ClassInstanceRef ||
    (value !== null &&
      typeof value === 'object' &&
      '__type' in value &&
      value.__type === CLASS_INSTANCE_REF_TYPE &&
      'className' in value &&
      typeof value.className === 'string')
  );
};

/**
 * Check if a value is a stream ID string
 */
export const isStreamId = (value: unknown): boolean => {
  return typeof value === 'string' && value.startsWith(STREAM_ID_PREFIX);
};

/**
 * Check if a value is a StreamRef object
 */
export const isStreamRef = (value: unknown): value is StreamRef => {
  return (
    value !== null &&
    typeof value === 'object' &&
    '__type' in value &&
    value.__type === STREAM_REF_TYPE &&
    'streamId' in value &&
    typeof value.streamId === 'string'
  );
};

/**
 * Create a StreamRef object from a stream value.
 * This is used during hydration to convert serialized streams into
 * objects that can be rendered as links in the UI.
 */
const streamToStreamRef = (value: any): StreamRef => {
  let streamId: string;
  if ('name' in value) {
    const name = String(value.name);
    if (!name.startsWith(STREAM_ID_PREFIX)) {
      streamId = `${STREAM_ID_PREFIX}${name}`;
    } else {
      streamId = name;
    }
  } else {
    streamId = `${STREAM_ID_PREFIX}null`;
  }
  return {
    __type: STREAM_REF_TYPE,
    streamId,
  };
};

const serializedStepFunctionToString = (value: unknown): string => {
  if (!value) return 'null';
  if (typeof value !== 'object') return 'null';
  if ('stepId' in value) {
    const stepId = value.stepId;
    // TODO: Add closure vars to the string representation.
    // value.closureVars
    return `<step:${stepId}>`;
  }
  return '<function>';
};

/**
 * Extract the class name from a classId.
 * The classId format is typically "path/to/file/ClassName" so we extract the last segment.
 */
const extractClassName = (classId: string): string => {
  if (!classId) return 'Unknown';
  const parts = classId.split('/');
  return parts[parts.length - 1] || classId;
};

/**
 * Convert a serialized class instance to a ClassInstanceRef for o11y display.
 * This allows viewing custom class instances in the UI without needing
 * the class to be registered for deserialization.
 */
const serializedInstanceToRef = (value: {
  classId: string;
  data: unknown;
}): ClassInstanceRef => {
  return new ClassInstanceRef(
    extractClassName(value.classId),
    value.classId,
    value.data
  );
};

/**
 * Convert a serialized class reference to a string representation.
 * This is used for Class type (the constructor reference itself, not an instance).
 */
const serializedClassToString = (value: { classId: string }): string => {
  const className = extractClassName(value.classId);
  return `<class:${className}>`;
};

/**
 * This is an extra reviver for devalue that takes any streams that would be converted,
 * into actual streams, and instead formats them as StreamRef objects for display in the UI.
 *
 * This is mainly because we don't want to open any streams that we aren't going to read from,
 * and so we can get the string ID/name, which the serializer stream doesn't provide.
 *
 * Also handles custom class instances (Instance) and class references (Class) by converting
 * them to opaque markers, since the custom classes are not registered for deserialization
 * in the o11y context.
 */
const streamPrintRevivers: Record<string, (value: any) => any> = {
  ReadableStream: streamToStreamRef,
  WritableStream: streamToStreamRef,
  TransformStream: streamToStreamRef,
  StepFunction: serializedStepFunctionToString,
  Instance: serializedInstanceToRef,
  Class: serializedClassToString,
};

/**
 * Combined revivers for observability hydration.
 * Merges common revivers with stream print revivers.
 */
const getObservabilityRevivers = () => ({
  ...getCommonRevivers(globalThis),
  ...streamPrintRevivers,
});

/**
 * Check if data is in legacy format (devalue parsed array).
 * Legacy specVersion 1 runs stored data as JSON arrays from devalue.
 */
const isLegacyFormat = (data: unknown): data is any[] => {
  return Array.isArray(data);
};

/**
 * Check if data is in binary format (Uint8Array).
 * specVersion 2+ runs store data as binary Uint8Array with a format prefix.
 */
const isBinaryFormat = (data: unknown): data is Uint8Array => {
  return data instanceof Uint8Array;
};

/**
 * Reconstitute a JSON-degraded Uint8Array back to a real Uint8Array.
 *
 * When a Uint8Array passes through JSON serialization (e.g. the Vercel API
 * returns JSON instead of CBOR, or an intermediate layer stringifies), it
 * becomes a plain object with sequential numeric string keys:
 *   { "0": 100, "1": 101, "2": 118, "3": 108, … }
 *
 * This function detects that pattern and converts it back so that the
 * downstream `isBinaryFormat` check succeeds and normal hydration runs.
 */
const reconstituteBinary = (data: unknown): unknown => {
  if (!data || typeof data !== 'object' || data instanceof Uint8Array) {
    return data;
  }

  // Only match plain objects (not arrays, Dates, etc.)
  if (Array.isArray(data) || Object.getPrototypeOf(data) !== Object.prototype) {
    return data;
  }

  const record = data as Record<string, unknown>;
  const keys = Object.keys(record);
  const len = keys.length;

  // Need a reasonable number of bytes to be worth reconstituting
  if (len < 4) {
    return data;
  }

  // Quick check: first key must be "0" and all values must be byte-range numbers
  for (let i = 0; i < len; i++) {
    if (keys[i] !== String(i)) {
      return data;
    }
    const val = record[keys[i]!];
    if (
      typeof val !== 'number' ||
      val < 0 ||
      val > 255 ||
      !Number.isInteger(val)
    ) {
      return data;
    }
  }

  return new Uint8Array(keys.map((k) => record[k] as number));
};

/**
 * Hydrate legacy format data (array) using unflatten.
 */
const hydrateLegacyData = (data: any[]): unknown => {
  return unflatten(data, getObservabilityRevivers());
};

const hydrateStepIO = <
  T extends { stepId?: string; input?: any; output?: any; runId?: string },
>(
  step: T
): T => {
  // Reconstitute JSON-degraded byte objects before format checks
  let hydratedInput = reconstituteBinary(step.input);
  let hydratedOutput = reconstituteBinary(step.output);

  // Hydrate input - handle both binary (specVersion 2) and legacy (specVersion 1) formats
  if (isBinaryFormat(hydratedInput) && hydratedInput.byteLength > 0) {
    hydratedInput = hydrateStepArguments(
      hydratedInput,
      [],
      step.runId as string,
      globalThis,
      streamPrintRevivers
    );
  } else if (isLegacyFormat(hydratedInput) && hydratedInput.length > 0) {
    hydratedInput = hydrateLegacyData(hydratedInput);
  }

  // Hydrate output - handle both binary (specVersion 2) and legacy (specVersion 1) formats
  if (isBinaryFormat(hydratedOutput)) {
    hydratedOutput = hydrateStepReturnValue(
      hydratedOutput,
      globalThis,
      streamPrintRevivers
    );
  } else if (isLegacyFormat(hydratedOutput) && hydratedOutput.length > 0) {
    hydratedOutput = hydrateLegacyData(hydratedOutput);
  }

  return {
    ...step,
    input: hydratedInput,
    output: hydratedOutput,
  };
};

const hydrateWorkflowIO = <
  T extends { runId?: string; input?: any; output?: any },
>(
  workflow: T
): T => {
  // Reconstitute JSON-degraded byte objects before format checks
  let hydratedInput = reconstituteBinary(workflow.input);
  let hydratedOutput = reconstituteBinary(workflow.output);

  // Hydrate input - handle both binary (specVersion 2) and legacy (specVersion 1) formats
  if (isBinaryFormat(hydratedInput) && hydratedInput.byteLength > 0) {
    hydratedInput = hydrateWorkflowArguments(
      hydratedInput,
      globalThis,
      streamPrintRevivers
    );
  } else if (isLegacyFormat(hydratedInput) && hydratedInput.length > 0) {
    hydratedInput = hydrateLegacyData(hydratedInput);
  }

  // Hydrate output - handle both binary (specVersion 2) and legacy (specVersion 1) formats
  if (isBinaryFormat(hydratedOutput)) {
    hydratedOutput = hydrateWorkflowReturnValue(
      hydratedOutput,
      [],
      workflow.runId as string,
      globalThis,
      streamPrintRevivers
    );
  } else if (isLegacyFormat(hydratedOutput) && hydratedOutput.length > 0) {
    hydratedOutput = hydrateLegacyData(hydratedOutput);
  }

  return {
    ...workflow,
    input: hydratedInput,
    output: hydratedOutput,
  };
};

const hydrateEventData = <
  T extends { eventId?: string; eventData?: any; runId?: string },
>(
  event: T
): T => {
  if (!event.eventData) {
    return event;
  }
  const eventData = { ...event.eventData };
  try {
    // Hydrate eventData.result (step output / return value)
    if ('result' in eventData && typeof eventData.result === 'object') {
      const result = reconstituteBinary(eventData.result);
      if (isBinaryFormat(result)) {
        eventData.result = hydrateStepReturnValue(
          result,
          globalThis,
          streamPrintRevivers
        );
      } else if (isLegacyFormat(result) && result.length > 0) {
        eventData.result = hydrateLegacyData(result);
      }
    }

    // Hydrate eventData.input (step input / arguments)
    if ('input' in eventData && typeof eventData.input === 'object') {
      const input = reconstituteBinary(eventData.input);
      if (isBinaryFormat(input) && input.byteLength > 0) {
        eventData.input = hydrateStepArguments(
          input,
          [],
          event.runId as string,
          globalThis,
          streamPrintRevivers
        );
      } else if (isLegacyFormat(input) && input.length > 0) {
        eventData.input = hydrateLegacyData(input);
      }
    }
  } catch (error) {
    runtimeLogger.error('Error hydrating event data', { error });
  }
  return {
    ...event,
    eventData,
  };
};

const hydrateHookMetadata = <T extends { hookId?: string; metadata?: any }>(
  hook: T
): T => {
  // Reconstitute JSON-degraded byte objects before format checks
  let hydratedMetadata = reconstituteBinary(hook.metadata);

  if (hydratedMetadata && 'runId' in hook) {
    // Handle both binary (specVersion 2) and legacy (specVersion 1) formats
    if (isBinaryFormat(hydratedMetadata)) {
      hydratedMetadata = hydrateStepArguments(
        hydratedMetadata,
        [],
        hook.runId as string,
        globalThis,
        streamPrintRevivers
      );
    } else if (
      isLegacyFormat(hydratedMetadata) &&
      hydratedMetadata.length > 0
    ) {
      hydratedMetadata = hydrateLegacyData(hydratedMetadata);
    }
  }

  return {
    ...hook,
    metadata: hydratedMetadata,
  };
};

export const hydrateResourceIO = <
  T extends {
    stepId?: string;
    hookId?: string;
    eventId?: string;
    input?: any;
    output?: any;
    metadata?: any;
    eventData?: any;
    executionContext?: any;
  },
>(
  resource: T
): T => {
  if (!resource) {
    return resource;
  }
  let hydrated: T;
  if ('stepId' in resource) {
    hydrated = hydrateStepIO(resource);
  } else if ('hookId' in resource) {
    hydrated = hydrateHookMetadata(resource);
  } else if ('eventId' in resource) {
    hydrated = hydrateEventData(resource);
  } else {
    hydrated = hydrateWorkflowIO(resource);
  }
  if ('executionContext' in hydrated) {
    const { executionContext, ...rest } = hydrated;
    // Preserve workflowCoreVersion from executionContext for observability
    const workflowCoreVersion =
      executionContext &&
      typeof executionContext === 'object' &&
      'workflowCoreVersion' in executionContext
        ? executionContext.workflowCoreVersion
        : undefined;
    if (workflowCoreVersion) {
      return { ...rest, workflowCoreVersion } as unknown as T;
    }
    return rest as T;
  }
  return hydrated;
};

/**
 * Extract all stream IDs from a value (recursively traverses objects/arrays)
 */
export function extractStreamIds(obj: unknown): string[] {
  const streamIds: string[] = [];

  function traverse(value: unknown): void {
    if (isStreamId(value)) {
      streamIds.push(value as string);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        traverse(item);
      }
    } else if (value && typeof value === 'object') {
      for (const val of Object.values(value)) {
        traverse(val);
      }
    }
  }

  traverse(obj);
  return Array.from(new Set(streamIds)); // Remove duplicates
}

/**
 * Truncate a string to a maximum length, adding ellipsis if needed
 */
export function truncateId(id: string, maxLength = 12): string {
  if (id.length <= maxLength) return id;
  return `${id.slice(0, maxLength)}...`;
}
