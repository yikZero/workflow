'use client';

import { parseWorkflowName } from '@workflow/utils/parse-name';
import {
  ErrorBoundary,
  EventListView,
  StreamViewer,
  WorkflowTraceViewer,
} from '@workflow/web-shared';
import type { SpanSelectionInfo } from '@workflow/web-shared';
import type { Event, Step, WorkflowRun } from '@workflow/world';
import {
  AlertCircle,
  Check,
  Copy,
  GitBranch,
  HelpCircle,
  List,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { mapRunToExecution } from '@/lib/flow-graph/graph-execution-mapper';
import { useWorkflowGraphManifest } from '@/lib/flow-graph/use-workflow-graph';
import {
  cancelRun,
  recreateRun,
  resumeHook,
  unwrapServerActionResult,
  useWorkflowResourceData,
  useWorkflowStreams,
  useWorkflowTraceViewerData,
  wakeUpRun,
} from '@/lib/workflow-api-client';
import type { EnvMap } from '@/server/workflow-server-actions';
import { fetchEventsByCorrelationId } from '@/server/workflow-server-actions';
import { useStreamReader } from '@/lib/hooks/use-stream-reader';
import { useServerConfig } from '@/lib/world-config-context';

import { CopyableText } from './display-utils/copyable-text';
import { RelativeTime } from './display-utils/relative-time';
import { StatusBadge } from './display-utils/status-badge';
import { WorkflowGraphExecutionViewer } from './flow-graph/workflow-graph-execution-viewer';
import { RunActionsButtons } from './run-actions';
import { Skeleton } from './ui/skeleton';

/**
 * Graph tab content component that fetches the manifest internally
 * This ensures the manifest is only fetched when the Graph tab is mounted
 */
function GraphTabContent({
  run,
  allSteps,
  allEvents,
  env,
}: {
  run: WorkflowRun;
  allSteps: Step[] | null;
  allEvents: Event[] | null;
  env: EnvMap;
}) {
  // Fetch workflow graph manifest only when this tab is mounted
  const {
    manifest: graphManifest,
    loading: graphLoading,
    error: graphError,
  } = useWorkflowGraphManifest();

  // Find the workflow graph for this run
  const workflowGraph = useMemo(() => {
    if (!graphManifest || !run.workflowName) return null;
    return graphManifest.workflows[run.workflowName] ?? null;
  }, [graphManifest, run.workflowName]);

  // Map run data to execution overlay
  const execution = useMemo(() => {
    if (!workflowGraph || !run.runId) return null;

    return mapRunToExecution(
      run,
      allSteps || [],
      allEvents || [],
      workflowGraph
    );
  }, [workflowGraph, run, allSteps, allEvents]);

  if (graphLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-4 text-muted-foreground">
          Loading workflow graph...
        </span>
      </div>
    );
  }

  if (graphError) {
    return (
      <div className="flex items-center justify-center w-full h-full p-4">
        <Alert variant="destructive" className="max-w-lg">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Workflow Graph</AlertTitle>
          <AlertDescription>{graphError.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!workflowGraph) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <Alert className="max-w-lg">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Workflow Graph Not Found</AlertTitle>
          <AlertDescription>
            Could not find the workflow graph for this run. The workflow may
            have been deleted or the graph manifest may need to be regenerated.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <WorkflowGraphExecutionViewer
      workflow={workflowGraph}
      execution={execution || undefined}
      env={env}
    />
  );
}

interface RunDetailViewProps {
  runId: string;
  selectedId?: string;
}

type Tab = 'trace' | 'graph' | 'streams' | 'events';

function StreamSidebarItem({
  streamId,
  isSelected,
  onSelect,
}: {
  streamId: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(streamId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="group/stream flex items-center rounded-md transition-colors cursor-pointer"
      style={{
        backgroundColor: isSelected ? 'var(--ds-gray-200)' : undefined,
      }}
      onClick={onSelect}
      onMouseEnter={(e) => {
        if (!isSelected)
          e.currentTarget.style.backgroundColor = 'var(--ds-gray-100)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = '';
      }}
    >
      <span
        className="flex-1 min-w-0 text-left px-3 py-2 text-xs font-mono truncate"
        style={{ color: 'var(--ds-gray-1000)' }}
        title={streamId}
      >
        {streamId}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="flex-shrink-0 mr-1 p-1 rounded opacity-0 group-hover/stream:opacity-100 transition-opacity"
        style={{ color: copied ? 'var(--ds-green-700)' : 'var(--ds-gray-700)' }}
        title="Copy stream ID"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

export function RunDetailView({
  runId,
  // TODO: This should open the right sidebar within the trace viewer
  selectedId: _selectedId,
}: RunDetailViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { serverConfig } = useServerConfig();
  const [cancelling, setCancelling] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showRerunDialog, setShowRerunDialog] = useState(false);
  // Empty env object - server actions read from process.env
  const env: EnvMap = useMemo(() => ({}), []);

  // Read tab and streamId from URL search params
  const activeTab = (searchParams.get('tab') as Tab) || 'trace';
  const selectedStreamId = searchParams.get('streamId');

  // Helper to update URL search params
  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const setActiveTab = useCallback(
    (tab: Tab) => {
      // When switching to trace or graph tab, clear streamId
      if (tab === 'trace' || tab === 'graph') {
        updateSearchParams({ tab, streamId: null });
      } else {
        updateSearchParams({ tab });
      }
    },
    [updateSearchParams]
  );

  const setSelectedStreamId = useCallback(
    (streamId: string | null) => {
      updateSearchParams({ streamId });
    },
    [updateSearchParams]
  );

  // Handler for clicking on stream refs in the trace viewer
  const handleStreamClick = useCallback(
    (streamId: string) => {
      updateSearchParams({ tab: 'streams', streamId });
    },
    [updateSearchParams]
  );

  const handleWakeUpSleep = useCallback(
    async (runId: string, correlationId: string) => {
      return wakeUpRun(env, runId, { correlationIds: [correlationId] });
    },
    [env]
  );

  const handleResolveHook = useCallback(
    async (hookToken: string, payload: unknown) => {
      await resumeHook(env, hookToken, payload);
    },
    [env]
  );

  const handleLoadEventData = useCallback(
    async (event: Event) => {
      if (!event.correlationId) {
        return null;
      }
      const { error, result } = await unwrapServerActionResult(
        fetchEventsByCorrelationId(env, event.correlationId, {
          sortOrder: 'asc',
          limit: 100,
          withData: true,
        })
      );
      if (error) {
        throw error;
      }
      const fullEvent = result.data.find((e) => e.eventId === event.eventId);
      if (fullEvent && 'eventData' in fullEvent) {
        return fullEvent.eventData;
      }
      return null;
    },
    [env]
  );

  // Only show graph tab for local backend
  const isLocalBackend =
    serverConfig.backendId === 'local' ||
    serverConfig.backendId === '@workflow/world-local';

  // Fetch all run data with live updates
  const {
    run: runData,
    steps: allSteps,
    hooks: allHooks,
    events: allEvents,
    loading,
    auxiliaryDataLoading,
    error,
    update,
  } = useWorkflowTraceViewerData(env, runId, { live: true });
  const run = runData ?? ({} as WorkflowRun);

  const handleCancelRunFromContext = useCallback(
    async (targetRunId: string) => {
      await cancelRun(env, targetRunId);
      await update();
      toast.success('Run cancelled successfully');
    },
    [env, update]
  );

  const [spanSelection, setSpanSelection] = useState<SpanSelectionInfo | null>(
    null
  );
  const {
    data: spanDetailData,
    loading: spanDetailLoading,
    error: spanDetailError,
  } = useWorkflowResourceData(
    env,
    spanSelection?.resource ?? 'run',
    spanSelection?.resourceId ?? '',
    {
      runId: spanSelection?.runId,
      enabled: Boolean(spanSelection?.resource && spanSelection?.resourceId),
    }
  );

  const handleSpanSelect = useCallback((info: SpanSelectionInfo) => {
    setSpanSelection(info);
  }, []);

  // Fetch streams for this run
  const {
    streams,
    loading: streamsLoading,
    error: streamsError,
  } = useWorkflowStreams(env, runId);

  const [streamSearchQuery, setStreamSearchQuery] = useState('');
  const filteredStreams = useMemo(() => {
    const q = streamSearchQuery.trim().toLowerCase();
    if (!q) return streams;
    return streams.filter((id) => id.toLowerCase().includes(q));
  }, [streams, streamSearchQuery]);

  const {
    chunks: streamChunks,
    isLive: streamIsLive,
    error: streamError,
  } = useStreamReader(env, selectedStreamId);

  const handleCancelClick = () => {
    setShowCancelDialog(true);
  };

  const handleConfirmCancel = async () => {
    if (cancelling) return;

    try {
      setCancelling(true);
      setShowCancelDialog(false);
      await cancelRun(env, runId);
      // Trigger a refresh of the data
      await update();
      toast.success('Run cancelled successfully');
    } catch (err) {
      console.error('Failed to cancel run:', err);
      toast.error('Failed to cancel run', {
        description:
          err instanceof Error ? err.message : 'An unknown error occurred',
      });
    } finally {
      setCancelling(false);
    }
  };

  const handleRerunClick = () => {
    setShowRerunDialog(true);
  };

  const handleConfirmRerun = async () => {
    if (rerunning) return;

    try {
      setRerunning(true);
      setShowRerunDialog(false);
      // Start a new run with the same workflow and input arguments
      const newRunId = await recreateRun(env, run.runId);
      toast.success('New run started successfully', {
        description: `Run ID: ${newRunId}`,
      });
      // Radix AlertDialog sets pointer-events:none on document.body while open.
      // Navigating before its cleanup runs leaves the new page unclickable.
      // Ensure pointer-events are restored before client-side navigation.
      document.body.style.pointerEvents = '';
      router.push(`/run/${newRunId}`);
    } catch (err) {
      console.error('Failed to re-run workflow:', err);
      toast.error('Failed to start new run', {
        description:
          err instanceof Error ? err.message : 'An unknown error occurred',
      });
    } finally {
      setRerunning(false);
      setShowRerunDialog(false);
    }
  };

  if (error && !runData) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error loading workflow run</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  const workflowName = parseWorkflowName(run.workflowName)?.shortName;

  return (
    <>
      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Workflow Run?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop the workflow execution immediately, and no further
              steps will be executed. Partial workflow execution may occur. Are
              you sure you want to cancel the run?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Running</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel Run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Replay Run Confirmation Dialog */}
      <AlertDialog open={showRerunDialog} onOpenChange={setShowRerunDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replay Run?</AlertDialogTitle>
            <AlertDialogDescription>
              This can potentially re-run code that is meant to only execute
              once. Are you sure you want to replay the workflow run?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRerun}>
              Replay Run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col h-[calc(100vh-97px)]">
        <div className="flex-none space-y-2">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/">Runs</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              {workflowName && (
                <>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="text-sm font-medium">
                      {workflowName}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </>
              )}
              <BreadcrumbItem>
                <BreadcrumbPage className="font-mono text-xs">
                  {runId}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Compact Run Info Bar */}
          <div className="flex items-center gap-4 px-3 py-2 text-xs">
            {/* Status */}
            {run.status ? (
              <StatusBadge status={run.status} context={run} />
            ) : (
              <Skeleton className="w-[55px] h-[16px]" />
            )}

            <span className="text-border">|</span>

            {/* Duration */}
            <span className="text-muted-foreground">
              {run.runId ? (
                run.startedAt ? (
                  (() => {
                    const ms =
                      (run.completedAt
                        ? new Date(run.completedAt).getTime()
                        : Date.now()) - new Date(run.startedAt).getTime();
                    const seconds = Math.floor(ms / 1000);
                    if (seconds < 60) return `${seconds}s`;
                    const minutes = Math.floor(seconds / 60);
                    const remainingSeconds = seconds % 60;
                    if (minutes < 60) {
                      return remainingSeconds > 0
                        ? `${minutes}m ${remainingSeconds}s`
                        : `${minutes}m`;
                    }
                    const hours = Math.floor(minutes / 60);
                    const remainingMinutes = minutes % 60;
                    return remainingMinutes > 0
                      ? `${hours}h ${remainingMinutes}m`
                      : `${hours}h`;
                  })()
                ) : (
                  '-'
                )
              ) : (
                <Skeleton className="w-[40px] h-[16px] inline-block" />
              )}
            </span>

            <span className="text-border">|</span>

            {/* Run ID */}
            {run.runId ? (
              <CopyableText text={run.runId}>
                <span className="font-mono text-muted-foreground">
                  {run.runId}
                </span>
              </CopyableText>
            ) : (
              <Skeleton className="w-[220px] h-[16px]" />
            )}

            <span className="text-border">|</span>

            {/* Timestamps */}
            <div className="flex items-center gap-3 text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground/60">Queued</span>
                {run.createdAt ? (
                  <RelativeTime date={run.createdAt} />
                ) : (
                  <Skeleton className="w-[80px] h-[16px] inline-block" />
                )}
              </span>
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground/60">Started</span>
                {run.runId ? (
                  run.startedAt ? (
                    <RelativeTime date={run.startedAt} />
                  ) : (
                    '-'
                  )
                ) : (
                  <Skeleton className="w-[80px] h-[16px] inline-block" />
                )}
              </span>
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground/60">Completed</span>
                {run.runId ? (
                  run.completedAt ? (
                    <RelativeTime date={run.completedAt} />
                  ) : (
                    '-'
                  )
                ) : (
                  <Skeleton className="w-[80px] h-[16px] inline-block" />
                )}
              </span>
              {run.expiredAt != null && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1 cursor-help">
                      <span className="text-muted-foreground/60">Expired</span>
                      <RelativeTime date={run.expiredAt} />
                      <HelpCircle className="w-3 h-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      The storage data for this run has expired and is no longer
                      available.
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2 flex-1 flex flex-col min-h-0">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as Tab)}
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="flex items-center justify-between mb-2 flex-none">
              <TabsList>
                <TabsTrigger value="trace" className="gap-2">
                  <List className="h-4 w-4" />
                  Trace
                </TabsTrigger>
                <TabsTrigger value="events" className="gap-2">
                  <List className="h-4 w-4" />
                  Events
                </TabsTrigger>
                {isLocalBackend && (
                  <TabsTrigger value="graph" className="gap-2">
                    <GitBranch className="h-4 w-4" />
                    Graph
                  </TabsTrigger>
                )}
                <TabsTrigger value="streams" className="gap-2">
                  <List className="h-4 w-4" />
                  Streams
                </TabsTrigger>
              </TabsList>
              <RunActionsButtons
                env={env}
                runId={runId}
                runStatus={run.status}
                events={allEvents}
                eventsLoading={auxiliaryDataLoading}
                loading={loading}
                onRerunClick={handleRerunClick}
                onCancelClick={handleCancelClick}
                callbacks={{ onSuccess: update }}
              />
            </div>

            <TabsContent value="trace" className="mt-0 flex-1 min-h-0">
              <ErrorBoundary title="Failed to load trace viewer">
                <div className="h-full">
                  <WorkflowTraceViewer
                    error={error}
                    steps={allSteps}
                    events={allEvents}
                    hooks={allHooks}
                    run={run}
                    isLoading={loading}
                    spanDetailData={spanDetailData}
                    spanDetailLoading={spanDetailLoading}
                    spanDetailError={spanDetailError}
                    onSpanSelect={handleSpanSelect}
                    onStreamClick={handleStreamClick}
                    onWakeUpSleep={handleWakeUpSleep}
                    onResolveHook={handleResolveHook}
                    onCancelRun={handleCancelRunFromContext}
                  />
                </div>
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="events" className="mt-0 flex-1 min-h-0">
              <ErrorBoundary title="Failed to load events list">
                <div className="h-full">
                  <EventListView
                    events={allEvents}
                    steps={allSteps}
                    run={run}
                    onLoadEventData={handleLoadEventData}
                  />
                </div>
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="streams" className="mt-0 flex-1 min-h-0">
              <ErrorBoundary title="Failed to load stream data">
                <div className="h-full flex gap-4">
                  {/* Stream list sidebar */}
                  <div
                    className="w-64 flex-shrink-0 border rounded-lg overflow-hidden flex flex-col"
                    style={{
                      borderColor: 'var(--ds-gray-300)',
                      backgroundColor: 'var(--ds-background-100)',
                    }}
                  >
                    <div
                      className="px-3 py-2 text-xs font-medium"
                      style={{
                        color: 'var(--ds-gray-900)',
                      }}
                    >
                      {streams.length}{' '}
                      {streams.length === 1 ? 'stream' : 'streams'} total
                    </div>
                    {/* Search bar */}
                    {streams.length > 0 && (
                      <div style={{ padding: 6 }}>
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 6,
                            boxShadow: '0 0 0 1px var(--ds-gray-alpha-400)',
                            background: 'var(--ds-background-100)',
                            height: 32,
                          }}
                        >
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--ds-gray-800)',
                              flexShrink: 0,
                            }}
                          >
                            <svg
                              width={14}
                              height={14}
                              viewBox="0 0 16 16"
                              fill="none"
                              aria-hidden="true"
                              focusable="false"
                            >
                              <circle
                                cx="7"
                                cy="7"
                                r="4.5"
                                stroke="currentColor"
                                strokeWidth="1.5"
                              />
                              <path
                                d="M11.5 11.5L14 14"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              />
                            </svg>
                          </div>
                          <input
                            type="search"
                            placeholder="Search streams…"
                            value={streamSearchQuery}
                            onChange={(e) =>
                              setStreamSearchQuery(e.target.value)
                            }
                            style={{
                              marginLeft: -14,
                              paddingInline: 10,
                              fontFamily: 'inherit',
                              fontSize: 12,
                              background: 'transparent',
                              border: 'none',
                              outline: 'none',
                              height: 32,
                              width: '100%',
                            }}
                          />
                        </label>
                      </div>
                    )}
                    <div className="overflow-auto flex-1 px-1.5 pb-1.5">
                      {streamsLoading ? (
                        <div className="p-4 flex items-center justify-center">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : streamsError ? (
                        <div className="p-4 text-xs text-destructive">
                          {streamsError.message}
                        </div>
                      ) : streams.length === 0 ? (
                        <div
                          className="p-4 text-xs"
                          style={{ color: 'var(--ds-gray-600)' }}
                        >
                          No streams found for this run
                        </div>
                      ) : filteredStreams.length === 0 ? (
                        <div
                          className="p-4 text-xs"
                          style={{ color: 'var(--ds-gray-600)' }}
                        >
                          No matching streams
                        </div>
                      ) : (
                        filteredStreams.map((sid) => (
                          <StreamSidebarItem
                            key={sid}
                            streamId={sid}
                            isSelected={selectedStreamId === sid}
                            onSelect={() => setSelectedStreamId(sid)}
                          />
                        ))
                      )}
                    </div>
                  </div>

                  {/* Stream viewer */}
                  <div className="flex-1 min-w-0">
                    {selectedStreamId ? (
                      <StreamViewer
                        streamId={selectedStreamId}
                        chunks={streamChunks}
                        isLive={streamIsLive}
                        error={streamError}
                        isLoading={streamIsLive && streamChunks.length === 0}
                      />
                    ) : (
                      <div
                        className="h-full flex items-center justify-center rounded-lg border"
                        style={{
                          borderColor: 'var(--ds-gray-300)',
                          backgroundColor: 'var(--ds-gray-100)',
                        }}
                      >
                        <div
                          className="text-sm"
                          style={{ color: 'var(--ds-gray-600)' }}
                        >
                          {streams.length > 0
                            ? 'Select a stream to view its data'
                            : 'No streams available'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </ErrorBoundary>
            </TabsContent>

            {isLocalBackend && (
              <TabsContent value="graph" className="mt-0 flex-1 min-h-0">
                <ErrorBoundary title="Failed to load execution graph">
                  <div className="h-full min-h-[500px]">
                    <GraphTabContent
                      run={run}
                      allSteps={allSteps}
                      allEvents={allEvents}
                      env={env}
                    />
                  </div>
                </ErrorBoundary>
              </TabsContent>
            )}
          </Tabs>

          {auxiliaryDataLoading && (
            <div className="fixed flex items-center gap-2 left-8 bottom-8 bg-background border rounded-md px-4 py-2 shadow-lg">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm">Fetching data...</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
