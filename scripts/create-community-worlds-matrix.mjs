#!/usr/bin/env node

/**
 * Generates a GitHub Actions matrix for community world testing.
 * Reads from worlds-manifest.json and filters to testable community worlds
 * whose specVersion matches the current SDK spec version.
 *
 * Usage: node scripts/create-community-worlds-matrix.mjs
 *
 * Output format (JSON):
 * {
 *   "world": [
 *     {
 *       "id": "starter",
 *       "name": "Starter",
 *       "package": "@workflow-worlds/starter",
 *       "service-type": "none",
 *       "env-vars": "{\"WORKFLOW_TARGET_WORLD\":\"@workflow-worlds/starter\"}"
 *     },
 *     ...
 *   ]
 * }
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Read SPEC_VERSION_CURRENT from spec-version.ts
const specVersionPath = path.join(
  rootDir,
  'packages/world/src/spec-version.ts'
);
const specVersionSrc = fs.readFileSync(specVersionPath, 'utf-8');
const currentVersionMatch = specVersionSrc.match(
  /SPEC_VERSION_CURRENT\s*=\s*\n?\s*(\w+)\s+as\s+SpecVersion/
);
if (!currentVersionMatch) {
  // Fallback: try to resolve the numeric alias
  const aliasMatch = specVersionSrc.match(
    /SPEC_VERSION_CURRENT\s*=\s*(\d+)\s+as\s+SpecVersion/
  );
  if (!aliasMatch) {
    throw new Error(
      'Could not parse SPEC_VERSION_CURRENT from spec-version.ts'
    );
  }
}
// Resolve the constant that SPEC_VERSION_CURRENT points to
let currentSpecVersion;
if (currentVersionMatch) {
  const alias = currentVersionMatch[1];
  const aliasValueMatch = specVersionSrc.match(
    new RegExp(`${alias}\\s*=\\s*(\\d+)\\s+as\\s+SpecVersion`)
  );
  if (!aliasValueMatch) {
    throw new Error(`Could not resolve value of ${alias} from spec-version.ts`);
  }
  currentSpecVersion = Number(aliasValueMatch[1]);
} else {
  currentSpecVersion = Number(
    specVersionSrc.match(
      /SPEC_VERSION_CURRENT\s*=\s*(\d+)\s+as\s+SpecVersion/
    )[1]
  );
}

// Read the manifest
const manifestPath = path.join(rootDir, 'worlds-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

// Filter to community worlds that can be tested in CI
const testableWorlds = manifest.worlds.filter((world) => {
  // Only community worlds
  if (world.type !== 'community') return false;

  // Skip worlds that require external credentials (e.g., Jazz needs API keys)
  if (world.requiresCredentials) return false;

  // Skip worlds whose specVersion doesn't match the current SDK version.
  // Community worlds built against an older @workflow/world will fail e2e tests
  // because the world interface has changed in breaking ways.
  if (
    world.specVersion !== undefined &&
    world.specVersion !== currentSpecVersion
  ) {
    console.error(
      `Skipping ${world.id}: specVersion ${world.specVersion} !== current ${currentSpecVersion}`
    );
    return false;
  }

  return true;
});

// Build the matrix
const matrix = {
  world: testableWorlds.map((world) => {
    // Determine service type based on services array
    let serviceType = 'none';
    if (world.services && world.services.length > 0) {
      // Use the first service's name as the service type
      // Currently supports: mongodb, redis
      const serviceName = world.services[0].name;
      if (['mongodb', 'redis'].includes(serviceName)) {
        serviceType = serviceName;
      }
    }

    return {
      id: world.id,
      name: world.name,
      package: world.package,
      'service-type': serviceType,
      'env-vars': JSON.stringify(world.env || {}),
      'setup-command': world.setup || '',
    };
  }),
};

// Output JSON for GitHub Actions
console.log(JSON.stringify(matrix));
