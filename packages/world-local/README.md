# @workflow/world-local

Filesystem-based workflow backend for local development and testing.

Stores workflow data as CBOR files on disk (with legacy JSON read compatibility) and provides in-memory queuing. Automatically detects development server port for queue transport.

Used by default on `next dev` and `next start`.
