/**
 * Source snippets for the Scheduling registry entry.
 *
 * Schedule any future action minutes / hours / days / weeks ahead using
 * durable sleep. Race the sleep against a defineHook() so external events
 * (user converts, unsubscribes, snoozes) can cancel or reschedule the
 * pending action without ever touching a database flag. Generic shape —
 * customise the runAction step for emails, push notifications, webhooks,
 * Slack messages, etc.
 */

export const schedulingWorkflowSource = `import { defineHook, sleep } from "workflow";

// Hook fired by your app to cancel an in-flight scheduled action.
// Token format is up to you — we use \`schedule:<id>\` here so the
// caller doesn't need to know the run ID.
export const cancelSchedule = defineHook<{ reason?: string }>();

export interface ScheduledAction {
  id: string;
  /** Duration string ("2d", "1h"), millis, or absolute Date. */
  delay: string | number | Date;
  /** Action payload — passed straight to runAction. */
  payload: Record<string, unknown>;
}

export async function scheduleAction(action: ScheduledAction) {
  "use workflow";

  // Race the durable sleep against the cancel hook. Whoever resolves first
  // wins — no manual flag-checking, no extra database tables.
  const hook = cancelSchedule.create({ token: \`schedule:\${action.id}\` });
  const cancelled = await Promise.race([
    sleep(action.delay as any).then(() => false as const),
    hook.then(() => true as const),
  ]);

  if (cancelled) {
    return { id: action.id, status: "cancelled" as const };
  }

  await runAction(action);
  return { id: action.id, status: "executed" as const };
}

// Replace the body of this step with your real action — send an email,
// post to Slack, fire a webhook, write to your DB. The step has full
// Node.js access and is automatically retried on failure.
async function runAction(action: ScheduledAction): Promise<void> {
  "use step";
  await fetch("https://api.example.com/scheduled-action", {
    method: "POST",
    body: JSON.stringify(action),
  });
}
`;

export const schedulingWorkflowInstallSource = `/**
 * Scheduling — defer any action with a cancellable durable sleep.
 *
 * THE PATTERN:
 *   1. sleep() suspends the workflow until the delay elapses — no cron
 *      jobs, no DB flags, no scheduler infrastructure required.
 *   2. A cancelSchedule hook races against the sleep. Whichever resolves
 *      first wins: the action executes or is cancelled.
 *   3. The hook token is keyed by the schedule ID, not the run ID, so the
 *      cancel API only needs the ID you provided at schedule time.
 *
 * USEFUL WHEN:
 *   - Sending a reminder email N days after signup.
 *   - Triggering a follow-up notification if a user hasn't acted yet.
 *   - Scheduling a deferred webhook call or Slack message.
 *   - Implementing "send later" / snooze / retry-after patterns.
 *
 * TO ADAPT THIS TO YOUR USE CASE:
 *   - Replace the runAction step body with your real action — send an email
 *     via Resend, post to Slack, fire a webhook, write to your database.
 *   - The delay field accepts a duration string ("2d", "1h", "30m"), millis,
 *     or an absolute Date for scheduling to a specific timestamp.
 *   - Add payload fields to ScheduledAction for everything your action needs.
 *   - For recurring schedules, loop back and sleep again after runAction.
 *
 * DOCS: https://workflow-sdk.dev/patterns/scheduling
 */
import { defineHook, sleep } from "workflow";

// Exported so the cancel API route can resume it with just the schedule ID.
export const cancelSchedule = defineHook<{ reason?: string }>();

export interface ScheduledAction {
  id: string;
  /** Duration string ("2d", "1h"), millis, or absolute Date. */
  delay: string | number | Date;
  /** Action payload — passed straight to runAction. */
  payload: Record<string, unknown>;
}

export async function scheduleAction(action: ScheduledAction) {
  "use workflow";

  // Race: sleep fires when the delay elapses; hook fires when cancelled.
  // No manual flag-checking or extra DB tables — the runtime handles it.
  const hook = cancelSchedule.create({ token: \`schedule:\${action.id}\` });
  const cancelled = await Promise.race([
    sleep(action.delay as any).then(() => false as const),
    hook.then(() => true as const),
  ]);

  if (cancelled) {
    return { id: action.id, status: "cancelled" as const };
  }

  await runAction(action);
  return { id: action.id, status: "executed" as const };
}

// Replace the body of this step with your real action. The step has full
// Node.js access and is automatically retried on transient failure (3x).
async function runAction(action: ScheduledAction): Promise<void> {
  "use step";
  await fetch("https://api.example.com/scheduled-action", {
    method: "POST",
    body: JSON.stringify(action),
  });
}
`;

export const schedulingStartRouteSource = `import { start } from "workflow/api";
import { NextResponse } from "next/server";
import { scheduleAction, type ScheduledAction } from "@/app/workflows/scheduling";

// POST /api/scheduling { id, delay, payload }
export async function POST(request: Request) {
  const action = (await request.json()) as ScheduledAction;
  if (!action.id || action.delay === undefined) {
    return NextResponse.json(
      { error: "id and delay are required" },
      { status: 400 },
    );
  }

  const run = await start(scheduleAction, [action]);
  return NextResponse.json({ runId: run.runId, scheduleId: action.id });
}
`;

export const schedulingCancelRouteSource = `import { NextResponse } from "next/server";
import { cancelSchedule } from "@/app/workflows/scheduling";

// POST /api/scheduling/cancel { scheduleId, reason? }
// Idempotent: returns success even if the hook has already fired or expired.
export async function POST(request: Request) {
  const { scheduleId, reason } = await request.json();
  if (!scheduleId) {
    return NextResponse.json(
      { error: "scheduleId is required" },
      { status: 400 },
    );
  }

  try {
    await cancelSchedule.resume(\`schedule:\${scheduleId}\`, {
      reason: reason ?? "Cancelled by user",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("not found") || message.includes("expired")) {
      return NextResponse.json({
        success: true,
        scheduleId,
        note: "No active schedule found (already executed or cancelled)",
      });
    }
    throw error;
  }

  return NextResponse.json({ success: true, scheduleId });
}
`;
