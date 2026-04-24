import { Ansi } from '@workflow/errors';

export interface WorkflowMetadata {
  /**
   * The name of the workflow.
   */
  workflowName: string;

  /**
   * Unique identifier for the workflow run.
   */
  workflowRunId: string;

  /**
   * Timestamp when the workflow run started.
   */
  workflowStartedAt: Date;

  /**
   * The URL where the workflow can be triggered.
   */
  url: string;

  /**
   * Feature flags indicating which capabilities are active for this workflow run.
   */
  features: {
    /**
     * Whether encryption is enabled for this workflow run.
     * When `true`, step inputs, outputs, and other serialized data
     * are encrypted at rest.
     */
    encryption: boolean;
  };
}

export const WORKFLOW_CONTEXT_SYMBOL =
  /* @__PURE__ */ Symbol.for('WORKFLOW_CONTEXT');

export function getWorkflowMetadata(): WorkflowMetadata {
  // Inside the workflow VM, the context is stored in the globalThis object behind a symbol
  const ctx = (globalThis as any)[WORKFLOW_CONTEXT_SYMBOL] as WorkflowMetadata;
  if (!ctx) {
    // Avoid importing NotInWorkflowOrStepContextError here — that module
    // imports from this file, so bringing it in eagerly would create a
    // module-init cycle. Render the same Ansi framing inline to match the
    // sibling `step/get-workflow-metadata.ts` path which uses the structured
    // class.
    throw new Error(
      Ansi.frame(
        `${Ansi.code('getWorkflowMetadata()')} can only be called inside a workflow or step function`,
        [
          Ansi.note(
            'Read more about getWorkflowMetadata(): https://workflow-sdk.dev/docs/api-reference/workflow/get-workflow-metadata'
          ),
        ]
      )
    );
  }
  return ctx;
}
