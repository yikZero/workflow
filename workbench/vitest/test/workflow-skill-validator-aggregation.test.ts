import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

/**
 * Guard: every scenario rule-set array defined in workflow-skill-checks.mjs
 * must be spread into the exported `checks` or `allGoldenChecks` aggregates.
 * If someone adds a new array but forgets to wire it into the aggregates,
 * validation silently skips those rules. This test makes that a hard failure.
 */
describe('workflow skill validator aggregation', () => {
  const checksSource = read('scripts/lib/workflow-skill-checks.mjs');
  const validatorSource = read('scripts/validate-workflow-skill-files.mjs');

  const SCENARIO_SKILL_CHECK_ARRAYS = [
    'sagaChecks',
    'timeoutChecks',
    'idempotencyChecks',
    'observeChecks',
  ] as const;

  const SCENARIO_GOLDEN_CHECK_ARRAYS = [
    'sagaGoldenChecks',
    'timeoutGoldenChecks',
    'idempotencyGoldenChecks',
    'observeGoldenChecks',
  ] as const;

  describe('scenario skill rule arrays are exported', () => {
    for (const symbol of SCENARIO_SKILL_CHECK_ARRAYS) {
      it(`exports ${symbol}`, () => {
        expect(checksSource).toContain(`export const ${symbol} = [`);
        console.log(
          JSON.stringify({
            event: 'aggregation_check',
            symbol,
            exported: true,
          })
        );
      });
    }
  });

  describe('scenario golden rule arrays are exported', () => {
    for (const symbol of SCENARIO_GOLDEN_CHECK_ARRAYS) {
      it(`exports ${symbol}`, () => {
        expect(checksSource).toContain(`export const ${symbol} = [`);
        console.log(
          JSON.stringify({
            event: 'aggregation_check',
            symbol,
            exported: true,
          })
        );
      });
    }
  });

  describe('scenario skill rule arrays are spread into `checks` aggregate', () => {
    for (const symbol of SCENARIO_SKILL_CHECK_ARRAYS) {
      it(`spreads ...${symbol} into checks`, () => {
        expect(checksSource).toMatch(
          new RegExp(`export const checks\\s*=\\s*\\[[^\\]]*\\.\\.\\.${symbol}`)
        );
        console.log(
          JSON.stringify({
            event: 'aggregation_spread',
            symbol,
            aggregate: 'checks',
            present: true,
          })
        );
      });
    }
  });

  describe('scenario golden rule arrays are spread into `allGoldenChecks` aggregate', () => {
    for (const symbol of SCENARIO_GOLDEN_CHECK_ARRAYS) {
      it(`spreads ...${symbol} into allGoldenChecks`, () => {
        expect(checksSource).toMatch(
          new RegExp(
            `export const allGoldenChecks\\s*=\\s*\\[[^\\]]*\\.\\.\\.${symbol}`
          )
        );
        console.log(
          JSON.stringify({
            event: 'aggregation_spread',
            symbol,
            aggregate: 'allGoldenChecks',
            present: true,
          })
        );
      });
    }
  });

  describe('validator script consumes exported aggregates', () => {
    it('imports checks and allGoldenChecks from workflow-skill-checks', () => {
      expect(validatorSource).toMatch(
        /import\s*\{[^}]*checks[^}]*\}\s*from\s*['"]\.\/lib\/workflow-skill-checks\.mjs['"]/
      );
      expect(validatorSource).toMatch(
        /import\s*\{[^}]*allGoldenChecks[^}]*\}\s*from\s*['"]\.\/lib\/workflow-skill-checks\.mjs['"]/
      );
      console.log(
        JSON.stringify({
          event: 'validator_import_check',
          imports: ['checks', 'allGoldenChecks'],
          present: true,
        })
      );
    });

    it('combines checks and allGoldenChecks into allChecks', () => {
      expect(validatorSource).toContain(
        'const allChecks = [...checks, ...allGoldenChecks];'
      );
      console.log(
        JSON.stringify({
          event: 'validator_combination_check',
          pattern: '[...checks, ...allGoldenChecks]',
          present: true,
        })
      );
    });
  });
});
