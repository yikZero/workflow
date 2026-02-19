import { pluralize } from '@workflow/utils';
import { GitBranch, Workflow } from 'lucide-react';
import { useMemo } from 'react';
import { Card, CardContent } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { useWorkflowGraphManifest } from '~/lib/flow-graph/use-workflow-graph';

/**
 * Displays a summary of workflows and steps from the workflow manifest.
 * Shows the number of workflows and total steps that were built.
 */
export function WorkflowsSummary() {
  const { manifest, loading, error } = useWorkflowGraphManifest();

  const { workflowCount, stepCount } = useMemo(() => {
    if (!manifest) {
      return { workflowCount: 0, stepCount: 0 };
    }

    const workflows = Object.values(manifest.workflows);
    const workflowCount = workflows.length;

    // Count all step nodes across all workflows
    const stepCount = workflows.reduce((total, workflow) => {
      const steps = workflow.nodes.filter(
        (node) => node.data.nodeKind === 'step'
      );
      return total + steps.length;
    }, 0);

    return { workflowCount, stepCount };
  }, [manifest]);

  if (loading) {
    return (
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center gap-6">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-24" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !manifest || workflowCount === 0) {
    // Don't show the section if there's an error or no workflows
    return null;
  }

  return (
    <Card className="mb-6">
      <CardContent className="py-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-sm">
            <Workflow className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{workflowCount}</span>
            <span className="text-muted-foreground">
              {pluralize('Workflow', 'Workflows', workflowCount)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{stepCount}</span>
            <span className="text-muted-foreground">
              {pluralize('Step', 'Steps', stepCount)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
