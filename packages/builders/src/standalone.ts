import { BaseBuilder } from './base-builder.js';
import type { WorkflowConfig } from './types.js';

export class StandaloneBuilder extends BaseBuilder {
  constructor(config: WorkflowConfig) {
    super({
      ...config,
      dirs: ['.'],
    });
  }

  async build(): Promise<void> {
    const inputFiles = await this.getInputFiles();
    const tsconfigPath = await this.findTsConfigPath();

    const stepsBundlePath = this.resolvePath(this.config.stepsBundlePath);
    const workflowBundlePath = this.resolvePath(
      this.config.workflowsBundlePath
    );
    await this.ensureDirectory(stepsBundlePath);
    await this.ensureDirectory(workflowBundlePath);

    // Build step registrations and workflow bundles separately (not combined)
    // so they share the Node.js module cache at runtime. Re-bundling with
    // createCombinedBundle would create duplicate @workflow/core/private
    // instances, making step registrations invisible to the runtime.
    const { manifest: stepsManifest } = await this.createStepsBundle({
      outfile: stepsBundlePath,
      inputFiles,
      tsconfigPath,
    });

    const { manifest: workflowsManifest } = await this.createWorkflowsBundle({
      outfile: workflowBundlePath,
      inputFiles,
      tsconfigPath,
    });

    await this.buildWebhookFunction();

    const manifest = {
      steps: { ...stepsManifest.steps, ...workflowsManifest.steps },
      workflows: {
        ...stepsManifest.workflows,
        ...workflowsManifest.workflows,
      },
      classes: { ...stepsManifest.classes, ...workflowsManifest.classes },
    };

    const manifestDir = this.resolvePath('.well-known/workflow/v1');
    await this.createManifest({
      workflowBundlePath,
      manifestDir,
      manifest,
    });

    await this.createClientLibrary();
  }

  private async buildWebhookFunction(): Promise<void> {
    console.log('Creating webhook bundle at', this.config.webhookBundlePath);

    const webhookBundlePath = this.resolvePath(this.config.webhookBundlePath);
    await this.ensureDirectory(webhookBundlePath);

    await this.createWebhookBundle({
      outfile: webhookBundlePath,
    });
  }
}
