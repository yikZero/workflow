/**
 * Workflow-mode serialization for the VM bundle.
 *
 * Re-exports the VM-compatible serialize/deserialize from @workflow/core.
 * These functions have NO Node.js dependencies and are safe to bundle
 * into both the Node.js vm.Context and the QuickJS WASM VM.
 */
export {
  serialize,
  deserialize,
} from '@workflow/core/serialization/workflow-vm';
