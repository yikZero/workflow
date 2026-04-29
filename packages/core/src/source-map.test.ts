import { describe, expect, it } from 'vitest';
import { stripInlineSourceMap } from './source-map.js';

describe('stripInlineSourceMap', () => {
  it('returns the input unchanged when there is no inline map', () => {
    const code = 'const x = 1;\nconsole.log(x);\n';
    expect(stripInlineSourceMap(code)).toBe(code);
  });

  it('strips a trailing inline source map comment', () => {
    const code =
      'var workflow = { name: "test" };\nconst result = workflow.name;\n' +
      '//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozfQ==\n';
    const stripped = stripInlineSourceMap(code);
    expect(stripped).not.toMatch(/sourceMappingURL/);
    expect(stripped).toContain('var workflow');
    expect(stripped).toContain('workflow.name');
  });

  it('strips a long source map comment without trailing newline', () => {
    // Many bundlers emit the comment as the very last line with no
    // trailing newline. The regex must match end-of-input too.
    const longBase64 = 'A'.repeat(4 * 1024 * 1024); // 4 MB of payload
    const code = `globalThis.x = 1;\n//# sourceMappingURL=data:application/json;base64,${longBase64}`;
    const stripped = stripInlineSourceMap(code);
    expect(stripped).not.toMatch(/sourceMappingURL/);
    expect(stripped.length).toBeLessThan(code.length);
    // The bundle proper is preserved — only the trailing comment is gone.
    expect(stripped).toContain('globalThis.x = 1;');
  });

  it('only strips the trailing inline map (not embedded substrings)', () => {
    // A workflow could legitimately contain the literal string
    // "sourceMappingURL" inside JS code (e.g. inside a string literal
    // for an unrelated reason). The regex anchors to end-of-line/end
    // and only matches the comment form, so non-comment occurrences
    // are preserved.
    const code = `
const literal = "sourceMappingURL=foo";
console.log(literal);
//# sourceMappingURL=data:application/json;base64,Zm9v
`;
    const stripped = stripInlineSourceMap(code);
    expect(stripped).toContain(`"sourceMappingURL=foo"`);
    expect(stripped).not.toMatch(/\/\/# sourceMappingURL/);
  });
});
