#!/usr/bin/env bash
set -euo pipefail

# Copies typedoc-generated API docs from each package into the docs content directory.
# Each package's output goes into an `api/` subdirectory under its API reference section.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTENT_DIR="$SCRIPT_DIR/content/docs/api-reference"

copy_docs() {
  local src="$1" dest="$2"
  if [ ! -d "$src" ]; then
    echo "  [skip] $src (not found)"
    return
  fi
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -r "$src"/* "$dest"
  echo "  [copy] $src -> $dest"
}

echo "Copying typedoc-generated API docs..."

# workflow (main package)
copy_docs "$ROOT_DIR/packages/workflow/typedoc-out"     "$CONTENT_DIR/workflow/api"

# workflow/api
copy_docs "$ROOT_DIR/packages/workflow/typedoc-out-api" "$CONTENT_DIR/workflow-api/api"

# workflow/errors
copy_docs "$ROOT_DIR/packages/errors/typedoc-out"       "$CONTENT_DIR/workflow-errors/api"

# @workflow/serde
copy_docs "$ROOT_DIR/packages/serde/typedoc-out"        "$CONTENT_DIR/workflow-serde/api"

# workflow/next
copy_docs "$ROOT_DIR/packages/next/typedoc-out"         "$CONTENT_DIR/workflow-next/api"

# @workflow/ai
copy_docs "$ROOT_DIR/packages/ai/typedoc-out"           "$CONTENT_DIR/workflow-ai/api"

# @workflow/vitest
copy_docs "$ROOT_DIR/packages/vitest/typedoc-out"       "$CONTENT_DIR/vitest/api"

# Add meta.json to type-aliases directories for clean sidebar labels
find "$CONTENT_DIR" -type d -name "type-aliases" | while read -r dir; do
  echo '{ "title": "Type Aliases" }' > "$dir/meta.json"
done

echo "Done."
