"use workflow";

import { FatalError, RetryableError } from "workflow";
import { createHook, sleep } from "workflow";

type ApprovalDecision = { approved: boolean; reason?: string };

const notifyApprover = async (
  poNumber: string,
  approverId: string,
  template: string
) => {
  "use step";
  await notifications.send({
    idempotencyKey: `notify:${template}:${poNumber}`,
    to: approverId,
    template,
  });
};

const recordDecision = async (
  poNumber: string,
  status: string,
  decidedBy: string
) => {
  "use step";
  await db.purchaseOrders.update({
    where: { poNumber },
    data: { status, decidedBy, decidedAt: new Date() },
  });
  return { poNumber, status, decidedBy };
};

export default async function purchaseApproval(
  poNumber: string,
  amount: number,
  managerId: string,
  directorId: string
) {
  // Step 1: Notify manager and wait for approval with 48h timeout
  await notifyApprover(poNumber, managerId, "approval-request");

  const managerHook = createHook<ApprovalDecision>(
    `approval:po-${poNumber}`
  );
  const managerTimeout = sleep("48h");
  const managerResult = await Promise.race([managerHook, managerTimeout]);

  if (managerResult !== undefined) {
    // Manager responded
    return recordDecision(
      poNumber,
      managerResult.approved ? "approved" : "rejected",
      managerId
    );
  }

  // Step 2: Manager timed out — escalate to director with 24h timeout
  await notifyApprover(poNumber, directorId, "escalation-request");

  const directorHook = createHook<ApprovalDecision>(
    `escalation:po-${poNumber}`
  );
  const directorTimeout = sleep("24h");
  const directorResult = await Promise.race([directorHook, directorTimeout]);

  if (directorResult !== undefined) {
    // Director responded
    return recordDecision(
      poNumber,
      directorResult.approved ? "approved" : "rejected",
      directorId
    );
  }

  // Step 3: Full timeout — auto-reject
  await notifyApprover(poNumber, managerId, "auto-rejection-notice");
  return recordDecision(poNumber, "auto-rejected", "system");
}
