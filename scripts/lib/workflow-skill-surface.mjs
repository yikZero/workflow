/**
 * workflow-skill-surface.mjs
 *
 * Canonical source of truth for the workflow skill surface.
 * Both the builder and test suites import from here so scenario
 * inventory, install directory count, and total output math
 * are defined in exactly one place.
 */

export const CORE_SKILLS = ['workflow', 'workflow-teach', 'workflow-build'];

export const OPTIONAL_SKILLS = ['workflow-init', 'workflow-audit'];

export const SCENARIO_SKILLS = [
  'workflow-approval',
  'workflow-webhook',
  'workflow-saga',
  'workflow-timeout',
  'workflow-idempotency',
  'workflow-observe',
];

export const USER_INVOKABLE_SKILLS = [
  ...SCENARIO_SKILLS,
  'workflow-audit',
];

/**
 * Summarize the discovered skill surface for structured logging,
 * --check output, and test assertions.
 *
 * @param {Array<{dir: string, goldens: string[]}>} skills — discovered skills
 * @param {string[] | Record<string, unknown>} providers — provider names or map
 * @returns {{
 *   core: string[],
 *   scenario: string[],
 *   optional: string[],
 *   discovered: string[],
 *   counts: {
 *     core: number,
 *     scenarios: number,
 *     optional: number,
 *     skills: number,
 *     installDirectories: number,
 *     goldensPerProvider: number,
 *     providers: number,
 *     outputsPerProvider: number,
 *     totalOutputs: number,
 *   }
 * }}
 */
export function summarizeSkillSurface(skills, providers) {
  const providerNames = Array.isArray(providers)
    ? providers
    : Object.keys(providers);
  const discovered = skills.map((skill) => skill.dir);
  const discoveredSet = new Set(discovered);

  const core = CORE_SKILLS.filter((name) => discoveredSet.has(name));
  const scenario = SCENARIO_SKILLS.filter((name) => discoveredSet.has(name));
  const optional = OPTIONAL_SKILLS.filter((name) => discoveredSet.has(name));

  const goldensPerProvider = skills.reduce(
    (sum, skill) => sum + skill.goldens.length,
    0,
  );

  return {
    core,
    scenario,
    optional,
    discovered,
    counts: {
      core: core.length,
      scenarios: scenario.length,
      optional: optional.length,
      skills: discovered.length,
      installDirectories: discovered.length,
      goldensPerProvider,
      providers: providerNames.length,
      outputsPerProvider: discovered.length + goldensPerProvider,
      totalOutputs:
        providerNames.length * (discovered.length + goldensPerProvider),
    },
  };
}
