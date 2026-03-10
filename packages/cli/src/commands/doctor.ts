import { readFile, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { Flags } from '@oclif/core';
import { BaseCommand } from '../base.js';
import chalk from 'chalk';

interface TsConfig {
  compilerOptions?: {
    plugins?: Array<{ name: string }>;
  };
  extends?: string;
}

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  fix?: string;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findUp(
  filename: string,
  startDir: string
): Promise<string | null> {
  let dir = startDir;
  while (true) {
    const candidate = join(dir, filename);
    if (await fileExists(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export default class Doctor extends BaseCommand {
  static description =
    'Diagnose common setup issues with the Workflow DevKit TypeScript plugin and editor integration.';

  static examples = ['$ workflow doctor', '$ workflow doctor --dir ./my-app'];

  static flags = {
    dir: Flags.string({
      char: 'd',
      description: 'project directory to check',
      default: '.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Doctor);
    const projectDir = resolve(process.cwd(), flags.dir);

    this.log('');
    this.log(chalk.bold('Workflow DevKit — Doctor'));
    this.log(chalk.dim('Checking your project setup...\n'));

    const results: CheckResult[] = [];

    // ---------------------------------------------------------------
    // 1. Check that tsconfig.json exists and has the plugin configured
    // ---------------------------------------------------------------
    const tsconfigPath = await findUp('tsconfig.json', projectDir);
    if (!tsconfigPath) {
      results.push({
        name: 'tsconfig.json',
        status: 'fail',
        message: 'No tsconfig.json found.',
        fix: 'Create a tsconfig.json in your project root.',
      });
    } else {
      const tsconfig = await readJson<TsConfig>(tsconfigPath);
      if (!tsconfig) {
        results.push({
          name: 'tsconfig.json',
          status: 'fail',
          message: `Failed to parse ${tsconfigPath}.`,
        });
      } else {
        const plugins = tsconfig.compilerOptions?.plugins ?? [];
        const hasWorkflowPlugin = plugins.some(
          (p) =>
            p.name === 'workflow' || p.name === '@workflow/typescript-plugin'
        );

        if (hasWorkflowPlugin) {
          results.push({
            name: 'tsconfig.json plugin',
            status: 'pass',
            message:
              'Workflow TypeScript plugin is configured in compilerOptions.plugins.',
          });
        } else {
          results.push({
            name: 'tsconfig.json plugin',
            status: 'fail',
            message:
              'Workflow TypeScript plugin is not configured in compilerOptions.plugins.',
            fix: 'Add to tsconfig.json:\n\n  "compilerOptions": {\n    "plugins": [{ "name": "workflow" }]\n  }',
          });
        }
      }
    }

    // ---------------------------------------------------------------
    // 2. Check that the "workflow" package is installed
    // ---------------------------------------------------------------
    const workflowPkgPath = await findUp(
      join('node_modules', 'workflow', 'package.json'),
      projectDir
    );
    if (workflowPkgPath) {
      results.push({
        name: 'workflow package',
        status: 'pass',
        message: 'The "workflow" package is installed.',
      });
    } else {
      results.push({
        name: 'workflow package',
        status: 'fail',
        message: 'The "workflow" package is not installed.',
        fix: 'Run: npm install workflow',
      });
    }

    // ---------------------------------------------------------------
    // 3. Check that TypeScript is installed in the workspace
    // ---------------------------------------------------------------
    const tsPkgPath = await findUp(
      join('node_modules', 'typescript', 'package.json'),
      projectDir
    );
    if (tsPkgPath) {
      const tsPkg = await readJson<{ version?: string }>(tsPkgPath);
      const version = tsPkg?.version ?? 'unknown';
      results.push({
        name: 'workspace TypeScript',
        status: 'pass',
        message: `TypeScript ${version} is installed in the workspace.`,
      });
    } else {
      results.push({
        name: 'workspace TypeScript',
        status: 'fail',
        message: 'TypeScript is not installed in the workspace.',
        fix: 'Run: npm install -D typescript\n\nThe TypeScript plugin requires a workspace-local TypeScript for most editors to load it correctly.',
      });
    }

    // ---------------------------------------------------------------
    // 4. Check VS Code settings
    // ---------------------------------------------------------------
    const vscodeDirPath = join(
      tsconfigPath ? dirname(tsconfigPath) : projectDir,
      '.vscode'
    );
    const vscodeSettingsPath = join(vscodeDirPath, 'settings.json');
    const hasVscodeSettings = await fileExists(vscodeSettingsPath);

    // Check if the VS Code extension is likely installed (best effort)
    const hasVscodeExtension = await checkVscodeExtension();

    if (hasVscodeExtension) {
      results.push({
        name: 'VS Code extension',
        status: 'pass',
        message:
          'Workflow DevKit VS Code extension is installed. The TypeScript plugin will load automatically.',
      });
    } else {
      // No extension — check if they have useLocalTsdk or workspace TS version configured
      if (hasVscodeSettings) {
        const settings =
          await readJson<Record<string, unknown>>(vscodeSettingsPath);
        const tsdk = settings?.['typescript.tsdk'];
        if (tsdk) {
          results.push({
            name: 'VS Code TypeScript SDK',
            status: 'pass',
            message: `VS Code is configured to use a custom TypeScript SDK: ${tsdk}`,
          });
        } else {
          results.push({
            name: 'VS Code TypeScript SDK',
            status: 'warn',
            message:
              'VS Code is using the bundled TypeScript, which will not load compilerOptions.plugins from your workspace.',
            fix: 'Install the "Workflow DevKit" VS Code extension (recommended), or set the workspace TypeScript version:\n\n  Open Command Palette → "TypeScript: Select TypeScript Version" → "Use Workspace Version"',
          });
        }
      } else {
        results.push({
          name: 'VS Code setup',
          status: 'warn',
          message:
            'No .vscode/settings.json found. If using VS Code, the bundled TypeScript will not load the Workflow plugin.',
          fix: 'Install the "Workflow DevKit" VS Code extension (recommended), or set the workspace TypeScript version:\n\n  Open Command Palette → "TypeScript: Select TypeScript Version" → "Use Workspace Version"',
        });
      }
    }

    // ---------------------------------------------------------------
    // 5. Check CoC / Vim settings
    // ---------------------------------------------------------------
    const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
    if (homeDir) {
      const cocSettingsPath = join(homeDir, '.vim', 'coc-settings.json');
      const hasCocSettings = await fileExists(cocSettingsPath);

      if (hasCocSettings) {
        const cocSettings =
          await readJson<Record<string, unknown>>(cocSettingsPath);
        const useLocal = cocSettings?.['tsserver.useLocalTsdk'] === true;

        if (useLocal) {
          results.push({
            name: 'CoC (Vim) config',
            status: 'pass',
            message: 'coc-settings.json has tsserver.useLocalTsdk enabled.',
          });
        } else {
          results.push({
            name: 'CoC (Vim) config',
            status: 'warn',
            message:
              'coc-settings.json exists but tsserver.useLocalTsdk is not enabled. The Workflow plugin may not load.',
            fix: 'Add to ~/.vim/coc-settings.json:\n\n  { "tsserver.useLocalTsdk": true }',
          });
        }
      }
      // Don't warn if no CoC settings — user might not use Vim
    }

    // ---------------------------------------------------------------
    // Print results
    // ---------------------------------------------------------------
    this.log('');
    let hasFailures = false;
    let hasWarnings = false;

    for (const result of results) {
      const icon =
        result.status === 'pass'
          ? chalk.green('PASS')
          : result.status === 'warn'
            ? chalk.yellow('WARN')
            : chalk.red('FAIL');

      this.log(`  ${icon}  ${chalk.bold(result.name)}`);
      this.log(`        ${result.message}`);

      if (result.fix) {
        this.log('');
        for (const line of result.fix.split('\n')) {
          this.log(`        ${chalk.dim(line)}`);
        }
      }

      this.log('');

      if (result.status === 'fail') hasFailures = true;
      if (result.status === 'warn') hasWarnings = true;
    }

    // Summary
    this.log(chalk.dim('—'.repeat(50)));
    if (hasFailures) {
      this.log(
        chalk.red.bold(
          '\nSome checks failed. Fix the issues above for the best experience.'
        )
      );
    } else if (hasWarnings) {
      this.log(
        chalk.yellow.bold(
          '\nAll critical checks passed, but there are warnings above.'
        )
      );
    } else {
      this.log(
        chalk.green.bold(
          '\nAll checks passed. Your Workflow DevKit setup looks good!'
        )
      );
    }
    this.log('');
  }
}

/**
 * Best-effort check for the Workflow DevKit VS Code extension.
 * Looks in the default VS Code extensions directory.
 */
async function checkVscodeExtension(): Promise<boolean> {
  const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
  if (!homeDir) return false;

  const extensionDirs = [
    join(homeDir, '.vscode', 'extensions'),
    join(homeDir, '.vscode-insiders', 'extensions'),
  ];

  for (const dir of extensionDirs) {
    if (!(await fileExists(dir))) continue;
    try {
      const { readdir } = await import('node:fs/promises');
      const entries = await readdir(dir);
      if (entries.some((e) => e.startsWith('vercel.workflow-vscode'))) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  return false;
}
