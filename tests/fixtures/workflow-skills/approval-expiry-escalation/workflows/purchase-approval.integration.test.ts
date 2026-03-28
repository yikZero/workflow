import { describe, it, expect } from 'vitest';
import { start, resumeHook, getRun } from 'workflow/api';
import { waitForHook, waitForSleep } from '@workflow/vitest';
import purchaseApproval from '../workflows/purchase-approval';

describe('purchaseApproval', () => {
  it('manager approves before timeout', async () => {
    const run = await start(purchaseApproval, [
      'PO-1001',
      7500,
      'manager-1',
      'director-1',
    ]);

    await waitForHook(run, { token: 'approval:po-PO-1001' });
    await resumeHook('approval:po-PO-1001', { approved: true });

    await expect(run.returnValue).resolves.toEqual({
      poNumber: 'PO-1001',
      status: 'approved',
      decidedBy: 'manager-1',
    });
  });

  it('escalates to director when manager times out', async () => {
    const run = await start(purchaseApproval, [
      'PO-1002',
      10000,
      'manager-2',
      'director-2',
    ]);

    // Manager timeout
    const sleepId1 = await waitForSleep(run);
    await getRun(run.runId).wakeUp({ correlationIds: [sleepId1] });

    // Director approves
    await waitForHook(run, { token: 'escalation:po-PO-1002' });
    await resumeHook('escalation:po-PO-1002', { approved: true });

    await expect(run.returnValue).resolves.toEqual({
      poNumber: 'PO-1002',
      status: 'approved',
      decidedBy: 'director-2',
    });
  });

  it('auto-rejects when all approvers time out', async () => {
    const run = await start(purchaseApproval, [
      'PO-1003',
      6000,
      'manager-3',
      'director-3',
    ]);

    // Manager timeout
    const sleepId1 = await waitForSleep(run);
    await getRun(run.runId).wakeUp({ correlationIds: [sleepId1] });

    // Director timeout
    const sleepId2 = await waitForSleep(run);
    await getRun(run.runId).wakeUp({ correlationIds: [sleepId2] });

    await expect(run.returnValue).resolves.toEqual({
      poNumber: 'PO-1003',
      status: 'auto-rejected',
      decidedBy: 'system',
    });
  });
});
