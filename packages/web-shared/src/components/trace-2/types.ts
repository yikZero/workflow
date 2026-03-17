export type {
  Span,
  SpanEvent,
  Trace,
  Resource,
  SpanNode,
  RootNode,
} from '../trace-viewer/types';

export type ResourceType = 'run' | 'step' | 'hook' | 'sleep' | 'default';

export interface FlatSpan {
  spanId: string;
  name: string;
  depth: number;
  /** Whether this row draws a new branch connector from its parent level */
  hasParentConnector: boolean;
  resourceType: ResourceType;
  startTime: number;
  endTime: number;
  duration: number;
  activeStartTime?: number;
  /** Whether this span has an error status */
  isErrored: boolean;
  /** Whether this is the last child of its parent at the same depth */
  isLastChild: boolean;
  /** Depth values of ancestors that are NOT last children (for drawing vertical connector lines) */
  activeConnectors: number[];
  attributes: Record<string, unknown>;
  events: Array<{
    name: string;
    timestamp: number;
    attributes: Record<string, unknown>;
  }>;
}
