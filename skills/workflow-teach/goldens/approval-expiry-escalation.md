# Golden Scenario: Approval Expiry Escalation

## Scenario

A procurement system requires manager approval for purchase orders over $5,000. If the assigned manager does not approve within 48 hours, the request escalates to a director. If the director does not respond within 24 hours, the request is auto-rejected and the requester is notified. Each approval step uses a deterministic hook token tied to the PO number.

## Interview Context

The workflow-teach interview should surface these answers:

| Bucket | Expected Answer |
|--------|----------------|
| Workflow starter/emitter | Internal API call when a purchase order is submitted |
| Repeat-safe side effects | Notification emails are safe to retry (informational only) |
| Permanent vs retryable | Approval timeout is permanent (escalate or reject); email delivery failure is retryable |
| Approval actors | Manager approves first; director is escalation approver; token strategy is `approval:po-${poNumber}` and `escalation:po-${poNumber}` |
| Timeout/expiry rules | Manager approval expires after 48 hours; director escalation expires after 24 hours |
| Compensation requirements | No compensation needed — approval flow is read-only until final decision; if auto-rejected, requester is notified but no side effects to undo |
| Operator observability | Log approval request with PO number and assigned approver, log escalation trigger, log final decision (approved/rejected/auto-rejected) |

## Expected `.workflow.md` Sections

### Project Context

Procurement approval system. Needs durable workflows because approval chains span hours to days and must survive server restarts.

### Business Rules

- A purchase order must receive exactly one final decision: approved, rejected, or auto-rejected.
- Escalation must only trigger after the primary approval window expires.
- Notification emails use PO number as deduplication key.

### External Systems

- Internal notification service (email). Trigger: API call when PO is submitted.

### Failure Expectations

- Approval timeout is permanent — escalate to director or auto-reject.
- Email delivery failure is retryable.
- Manager approval: `approval:po-${poNumber}` hook, 48-hour timeout.
- Director escalation: `escalation:po-${poNumber}` hook, 24-hour timeout.
- No compensation needed — approval flow is read-only until final decision.

### Observability Needs

- Log approval.requested with PO number and assigned manager.
- Log approval.escalated with PO number and director.
- Log approval.decided with final status and decision maker.

### Open Questions

(none for this scenario)

## Downstream Expectations

### workflow-build

When building this workflow, the build skill should:

- Use two hook suspensions with deterministic tokens: `approval:po-${poNumber}` and `escalation:po-${poNumber}`
- Pair each hook with a sleep timeout (48h and 24h) using `Promise.race`
- Produce tests for: manager-approves (happy path), manager-timeout → director-approves, full-timeout → auto-rejection
- Each test uses `waitForHook`, `resumeHook`, `waitForSleep`, `wakeUp`

## Verification Criteria

- [ ] Interview captures both approval actors with their token strategies
- [ ] `.workflow.md` Business Rules includes the single-decision invariant
- [ ] `.workflow.md` Failure Expectations captures both timeout windows
- [ ] `.workflow.md` Observability Needs covers the full approval lifecycle
- [ ] Next skill recommendation is `workflow-build`
