import type * as vscode from 'vscode';

/**
 * VS Code extension for Workflow DevKit.
 *
 * This extension is intentionally minimal — its primary purpose is to
 * activate the "workflow" TypeScript Language Service Plugin via the
 * `typescriptServerPlugins` contribution in package.json. This ensures
 * the plugin loads automatically in VS Code without requiring the user
 * to configure `tsserver.useLocalTsdk` or any other manual setup.
 *
 * The actual diagnostics, completions, hover info, and code fixes are
 * implemented in `@workflow/typescript-plugin`.
 */

export function activate(_context: vscode.ExtensionContext): void {
  // The TypeScript plugin is contributed declaratively via package.json.
  // No programmatic activation is needed.
}

export function deactivate(): void {
  // Nothing to clean up.
}
