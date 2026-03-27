# Golden Scenario: Partial Side-Effect Compensation

## Scenario

A SaaS onboarding workflow provisions a new tenant: creates a database schema, provisions cloud storage, seeds default configuration, and sends a welcome email. If cloud storage provisioning fails after the database schema is created, the database schema must be torn down. If email fails after everything else succeeds, the tenant is still considered provisioned (email is retried asynchronously).

## Interview Context

The workflow-teach interview should surface these answers:

| Bucket | Expected Answer |
|--------|----------------|
| Workflow starter/emitter | API call from admin dashboard when a new tenant signs up |
| Repeat-safe side effects | Database schema creation uses `CREATE SCHEMA IF NOT EXISTS`; storage provisioning is idempotent by bucket naming convention |
| Permanent vs retryable | Schema creation failure is retryable (transient DB errors); storage quota exceeded is permanent; email failure is retryable |
| Approval actors | No human approval required |
| Timeout/expiry rules | Entire onboarding must complete within 5 minutes or be marked as failed |
| Compensation requirements | If storage provisioning fails after DB schema creation, drop the schema; if email fails, do not compensate — tenant is provisioned, email retried separately |
| Operator observability | Log each provisioning step with tenant ID, log compensation actions, stream progress to admin dashboard |

## Expected Context Fields

```json
{
  "businessInvariants": [
    "A tenant must not exist in a half-provisioned state — either fully provisioned or fully rolled back",
    "Email failure does not block tenant provisioning"
  ],
  "idempotencyRequirements": [
    "Database schema creation uses CREATE SCHEMA IF NOT EXISTS",
    "Storage provisioning uses deterministic bucket name from tenant ID"
  ],
  "approvalRules": [],
  "timeoutRules": [
    "Entire onboarding workflow must complete within 5 minutes"
  ],
  "compensationRules": [
    "Drop database schema if storage provisioning fails after schema creation",
    "No compensation for email failure — tenant is considered provisioned"
  ],
  "observabilityRequirements": [
    "Log provision.schema with tenant ID and status",
    "Log provision.storage with tenant ID and status",
    "Log compensation.schema_drop with tenant ID when rollback triggers",
    "Stream onboarding progress to admin dashboard"
  ]
}
```

## Downstream Expectations

### workflow-design

The blueprint must include:

- `compensationPlan` with schema teardown for storage failure
- `compensationPlan` explicitly noting email has no compensation
- `invariants` echoing the no-half-provisioned-state rule
- `operatorSignals` including compensation action logging

### workflow-stress

Must flag:

- Missing compensation step if storage failure lacks schema rollback
- Timeout policy for the entire workflow
- Whether email step failure mode is correctly classified as retryable (not fatal)

### workflow-verify

Must generate:

- Test for happy path (all steps succeed)
- Test for storage failure triggering schema compensation
- Test for email failure not triggering any compensation
- Test for overall timeout

## Verification Criteria

- [ ] Interview distinguishes compensable failures (storage) from non-compensable ones (email)
- [ ] `compensationRules` captures both the positive case (schema drop) and the negative case (no email compensation)
- [ ] `businessInvariants` captures the no-half-provisioned-state rule
- [ ] `observabilityRequirements` includes compensation action logging
- [ ] Downstream stress test flags missing compensation for the storage→schema path
