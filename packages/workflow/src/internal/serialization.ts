/**
 * Workflow-mode serialization utilities for the workflow VM bundle.
 *
 * This module re-exports the workflow-mode serialize/deserialize from
 * @workflow/core. It is designed to be imported by the compiled workflow
 * bundle (via the SWC plugin or VM bootstrap code) and executed inside
 * the sandboxed VM environment.
 *
 * The serialize/deserialize functions are synchronous and do not use
 * encryption — encryption is handled on the host side outside the VM.
 */
export { serialize, deserialize } from '@workflow/core/serialization/workflow';
