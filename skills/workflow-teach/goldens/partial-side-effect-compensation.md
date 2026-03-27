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

## Expected `.workflow.md` Sections

### Project Context

SaaS tenant onboarding system. Needs durable workflows because provisioning involves multiple external services that must be orchestrated with compensation on failure.

### Business Rules

- A tenant must not exist in a half-provisioned state — either fully provisioned or fully rolled back.
- Email failure does not block tenant provisioning.
- Database schema creation uses `CREATE SCHEMA IF NOT EXISTS`.
- Storage provisioning uses deterministic bucket name from tenant ID.

### External Systems

- Database (schema creation, teardown). Supports idempotent creation. Trigger: API call from admin dashboard.
- Cloud storage (bucket provisioning). Idempotent by naming convention.
- Email service (welcome email). Retryable, non-critical.

### Failure Expectations

- Schema creation failure: retryable (transient DB errors).
- Storage quota exceeded: permanent (fatal).
- Email failure: retryable, non-critical — does not block provisioning.
- Compensation: drop database schema if storage provisioning fails after schema creation.
- No compensation for email failure — tenant is considered provisioned.
- Entire onboarding must complete within 5 minutes.

### Observability Needs

- Log provision.schema with tenant ID and status.
- Log provision.storage with tenant ID and status.
- Log compensation.schema_drop with tenant ID when rollback triggers.
- Stream onboarding progress to admin dashboard.

### Open Questions

(none for this scenario)

## Downstream Expectations

### workflow-build

When building this workflow, the build skill should:

- Include a compensation step that drops the schema on storage failure
- Classify email failure as retryable and non-blocking
- Flag the 5-minute overall timeout
- Produce tests for: happy path, storage failure triggering schema compensation, email failure not triggering compensation, overall timeout

## Verification Criteria

- [ ] Interview distinguishes compensable failures (storage) from non-compensable ones (email)
- [ ] `.workflow.md` Failure Expectations captures both the positive case (schema drop) and the negative case (no email compensation)
- [ ] `.workflow.md` Business Rules captures the no-half-provisioned-state rule
- [ ] `.workflow.md` Observability Needs includes compensation action logging
- [ ] Next skill recommendation is `workflow-build`
