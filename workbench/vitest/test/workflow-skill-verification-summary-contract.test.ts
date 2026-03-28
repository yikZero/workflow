import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const SKILLS_DIR = resolve(ROOT, 'skills');

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

function extractSection(text: string, heading: string): string | null {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed === `## ${heading}` || trimmed === `### ${heading}`;
  });
  if (start === -1) return null;

  const targetLevel = lines[start].trim().match(/^(#{2,6})\s/)?.[1].length ?? 2;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const match = lines[i].trim().match(/^(#{2,6})\s/);
    if (match && match[1].length <= targetLevel) {
      end = i;
      break;
    }
  }
  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
}

function extractCodeFence(
  sectionText: string,
  language: string
): string | null {
  const lines = sectionText.split('\n');
  const startFence = '```' + language;
  const start = lines.findIndex((line) => line.trim() === startFence);
  if (start === -1) return null;

  const end = lines.findIndex(
    (line, index) => index > start && line.trim() === '```'
  );
  if (end === -1) return null;

  return lines.slice(start + 1, end).join('\n');
}

function extractVerificationSummary(sectionText: string): {
  event: string;
  blueprintName: string;
  fileCount: number;
  testCount: number;
  runtimeCommandCount: number;
  contractVersion: string;
} | null {
  const line = sectionText
    .split('\n')
    .map((value) => value.trim())
    .find((value) => value.startsWith('{"event":"verification_plan_ready"'));
  return line ? JSON.parse(line) : null;
}

function discoverGoldenFiles(): string[] {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const goldensDir = join(SKILLS_DIR, entry.name, 'goldens');
      if (!existsSync(goldensDir)) return [];
      return readdirSync(goldensDir)
        .filter((file) => file.endsWith('.md'))
        .map((file) => `skills/${entry.name}/goldens/${file}`);
    });
}

describe('workflow golden verification summary contract', () => {
  for (const goldenPath of discoverGoldenFiles()) {
    const text = read(goldenPath);
    if (!text.includes('## Verification Artifact')) continue;

    it(`${goldenPath} keeps summary counts aligned with the artifact`, () => {
      const artifactSection = extractSection(text, 'Verification Artifact');
      expect(
        artifactSection,
        'verification artifact section must exist'
      ).toBeTruthy();

      const artifactJson = extractCodeFence(artifactSection!, 'json');
      expect(
        artifactJson,
        'verification artifact must contain json'
      ).toBeTruthy();

      const artifact = JSON.parse(artifactJson!) as {
        contractVersion: string;
        blueprintName: string;
        files: Array<{ kind: string; path: string }>;
        runtimeCommands: Array<{
          name: string;
          command: string;
          expects: string;
        }>;
      };

      const summarySection = extractSection(text, 'Verification Summary');
      expect(
        summarySection,
        'verification summary section must exist'
      ).toBeTruthy();

      const summary = extractVerificationSummary(summarySection!);
      expect(summary, 'verification summary json line must exist').toBeTruthy();

      expect(summary).toEqual({
        event: 'verification_plan_ready',
        blueprintName: artifact.blueprintName,
        fileCount: artifact.files.length,
        testCount: artifact.files.filter((file) => file.kind === 'test').length,
        runtimeCommandCount: artifact.runtimeCommands.length,
        contractVersion: artifact.contractVersion,
      });
    });
  }
});
