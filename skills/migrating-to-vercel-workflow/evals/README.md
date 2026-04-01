# Migration skill acceptance

A response passes only if it:

1. removes all source-framework API symbols from final migrated code
2. uses `"use workflow"` for orchestration
3. uses `"use step"` for side effects
4. keeps `sleep()` in workflow context only
5. keeps `getWritable()` in step context only
6. uses step-wrapped `start()` / `getRun()` for child workflows
7. adds `getStepMetadata().stepId` for external idempotent writes
8. adds hooks/webhooks when the source used signals, wait-for-event, or task tokens
9. stays framework-agnostic when the target framework is unspecified
10. does not claim Vercel-managed execution when the prompt says the target is self-hosted or non-Vercel
