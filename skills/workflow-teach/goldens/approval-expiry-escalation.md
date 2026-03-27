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

## Expected Context Fields

```json
{
  "businessInvariants": [
    "A purchase order must receive exactly one final decision: approved, rejected, or auto-rejected",
    "Escalation must only trigger after the primary approval window expires"
  ],
  "idempotencyRequirements": [
    "Notification emails use PO number as deduplication key"
  ],
  "approvalRules": [
    "Manager approves POs over $5,000 with token approval:po-${poNumber}",
    "Director is escalation approver with token escalation:po-${poNumber}",
    "Manager timeout: 48 hours triggers escalation",
    "Director timeout: 24 hours triggers auto-rejection"
  ],
  "timeoutRules": [
    "Manager approval expires after 48 hours",
    "Director escalation expires after 24 hours",
    "Total approval window is 72 hours maximum"
  ],
  "compensationRules": [],
  "observabilityRequirements": [
    "Log approval.requested with PO number and assigned manager",
    "Log approval.escalated with PO number and director",
    "Log approval.decided with final status and decision maker"
  ]
}
```

## Downstream Expectations

### workflow-design

The blueprint must include:

- Two hook suspensions with deterministic tokens: `approval:po-${poNumber}` and `escalation:po-${poNumber}`
- Sleep suspensions for 48h and 24h timeouts
- `invariants` echoing the single-decision and escalation-ordering rules
- `operatorSignals` for each approval lifecycle event

### workflow-stress

Must flag:

- Missing expiry behavior if approval hooks lack paired sleep timeouts
- Missing test for the escalation path
- Missing test for the auto-rejection path

### workflow-verify

Must generate:

- Test for manager-approves-within-window (happy path)
- Test for manager-timeout → director-escalation → director-approves
- Test for full-timeout → auto-rejection
- Each test must use `waitForHook`, `resumeHook`, `waitForSleep`, `wakeUp`

## Verification Criteria

- [ ] Interview captures both approval actors with their token strategies
- [ ] `approvalRules` includes timeout behavior for each actor
- [ ] `timeoutRules` captures both the 48h and 24h windows
- [ ] `observabilityRequirements` covers the full approval lifecycle
- [ ] Downstream blueprint pairs every approval hook with a timeout sleep
