/**
 * Workflow-mode serialization utilities for the workflow VM bundle.
 *
 * Re-exports the workflow-mode serialize/deserialize from @workflow/core.
 * The serialize/deserialize functions are synchronous and do not use
 * encryption — encryption is handled on the host side outside the VM.
 *
 * Note: The current implementation has Node.js dependencies (`node:util`
 * for `types.isNativeError()` and `Buffer` for base64 encoding). When
 * used inside the Node.js `vm.Context` sandbox (the current runtime),
 * these are available. For the QuickJS WASM VM (snapshot runtime), these
 * dependencies will need to be replaced with polyfills or alternative
 * implementations — that work is tracked on the snapshot-runtime branch.
 */
export { serialize, deserialize } from '@workflow/core/serialization/workflow';
