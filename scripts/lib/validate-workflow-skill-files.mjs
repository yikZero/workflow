/**
 * Pure validation logic for workflow skill files.
 * No filesystem access — accepts file contents as a map.
 */

/**
 * @param {string} text
 * @param {string} [language='json']
 * @returns {string|null}
 */
function extractCodeFence(text, language = 'json') {
  const lines = text.split('\n');
  const startFence = `\`\`\`${language}`;
  const start = lines.findIndex((line) => line.trim() === startFence);

  if (start === -1) return null;

  const end = lines.findIndex(
    (line, index) => index > start && line.trim() === '```'
  );
  if (end === -1) return null;

  return lines.slice(start + 1, end).join('\n');
}

/**
 * @param {{
 *   language?: string,
 *   requiredKeys?: string[],
 *   nonEmptyKeys?: string[],
 * } | undefined} jsonFence
 * @param {string} text
 * @returns {{
 *   jsonFenceError?: 'missing_code_fence' | 'invalid_json',
 *   missingJsonKeys?: string[],
 *   emptyJsonKeys?: string[],
 * }}
 */
function validateJsonFence(jsonFence, text) {
  if (!jsonFence) return {};

  const raw = extractCodeFence(text, jsonFence.language ?? 'json');
  if (!raw) {
    return {
      jsonFenceError: 'missing_code_fence',
      missingJsonKeys: [...(jsonFence.requiredKeys ?? [])],
      emptyJsonKeys: [],
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      jsonFenceError: 'invalid_json',
      missingJsonKeys: [...(jsonFence.requiredKeys ?? [])],
      emptyJsonKeys: [],
    };
  }

  const missingJsonKeys = (jsonFence.requiredKeys ?? []).filter(
    (key) => !(key in parsed)
  );

  const emptyJsonKeys = (jsonFence.nonEmptyKeys ?? []).filter((key) => {
    const value = parsed[key];
    return value == null || (Array.isArray(value) && value.length === 0);
  });

  return { missingJsonKeys, emptyJsonKeys };
}

/**
 * @param {string} text
 * @param {string} headingLine
 * @returns {string}
 */
function extractSection(text, headingLine) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === headingLine.trim());
  if (start === -1) return '';

  // Determine heading level of the target (count leading '#' characters)
  const targetLevel = headingLine.trim().match(/^(#{2,6})\s/)?.[1]?.length ?? 2;

  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const match = lines[i].match(/^(#{2,6})\s/);
    if (match && match[1].length <= targetLevel) break;
    body.push(lines[i]);
  }

  return body.join('\n');
}

/**
 * @param {{ sectionHeading?: string, mustIncludeWithinSection?: string[] }} check
 * @param {string} text
 * @returns {{ missingSectionTokens?: string[] }}
 */
function validateSectionTokens(check, text) {
  if (!check.sectionHeading || !check.mustIncludeWithinSection?.length) {
    return {};
  }

  const section = extractSection(text, check.sectionHeading);
  const missingSectionTokens = check.mustIncludeWithinSection.filter(
    (token) => !section.includes(token)
  );

  return { missingSectionTokens };
}

function findOutOfOrder(text, values = []) {
  if (!Array.isArray(values) || values.length < 2) return null;

  const positions = values.map((value) => ({
    value,
    index: text.indexOf(value),
  }));

  if (positions.some((item) => item.index === -1)) return null;

  for (let i = 1; i < positions.length; i += 1) {
    if (positions[i].index < positions[i - 1].index) {
      return {
        expected: values,
        positions,
        firstInversion: {
          before: positions[i - 1],
          after: positions[i],
        },
      };
    }
  }

  return null;
}

/**
 * @param {string} text
 * @param {string} needle
 * @param {number} [radius=80]
 * @returns {string|null}
 */
function excerptAround(text, needle, radius = 80) {
  const index = text.indexOf(needle);
  if (index === -1) return null;
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + needle.length + radius);
  return text.slice(start, end);
}

function classifyFailureReason(missing, forbidden, orderFailure, extra) {
  if (missing.length > 0) return 'missing_required_content';
  if (forbidden.length > 0) return 'forbidden_content_present';
  if (orderFailure) return 'content_out_of_order';
  if (
    extra.jsonFenceError ||
    extra.missingJsonKeys?.length ||
    extra.emptyJsonKeys?.length ||
    extra.missingSectionTokens?.length
  ) {
    return 'structured_validation_failed';
  }
  return 'validation_failed';
}

function buildFailureResult(
  check,
  missing,
  forbidden,
  orderFailure = null,
  extra = {},
  text = ''
) {
  const reason = classifyFailureReason(missing, forbidden, orderFailure, extra);
  return {
    ruleId: check.ruleId ?? `text.${check.file}`,
    severity: check.severity ?? 'error',
    file: check.file,
    status: 'fail',
    reason,
    ...(missing.length > 0 ? { missing } : {}),
    ...(forbidden.length > 0 ? { forbidden } : {}),
    ...(forbidden.length > 0
      ? {
          forbiddenContext: Object.fromEntries(
            forbidden.map((token) => [token, excerptAround(text, token)])
          ),
        }
      : {}),
    ...(orderFailure
      ? {
          outOfOrder: orderFailure.expected,
          orderDetails: orderFailure,
        }
      : {}),
    ...extra,
    ...(check.suggestedFix ? { suggestedFix: check.suggestedFix } : {}),
  };
}

function validateSingleCheck(check, text) {
  const missing = (check.mustInclude ?? []).filter(
    (value) => !text.includes(value)
  );
  const forbidden = (check.mustNotInclude ?? []).filter((value) =>
    text.includes(value)
  );
  const orderFailure =
    missing.length === 0 ? findOutOfOrder(text, check.mustAppearInOrder) : null;

  const structured = validateJsonFence(check.jsonFence, text);
  const sectionValidation = validateSectionTokens(check, text);

  const hasFailure =
    missing.length > 0 ||
    forbidden.length > 0 ||
    !!orderFailure ||
    !!structured.jsonFenceError ||
    (structured.missingJsonKeys?.length ?? 0) > 0 ||
    (structured.emptyJsonKeys?.length ?? 0) > 0 ||
    (sectionValidation.missingSectionTokens?.length ?? 0) > 0;

  if (hasFailure) {
    return buildFailureResult(
      check,
      missing,
      forbidden,
      orderFailure,
      {
        ...structured,
        ...sectionValidation,
        ...(check.sectionHeading
          ? { sectionHeading: check.sectionHeading }
          : {}),
      },
      text
    );
  }

  return {
    ruleId: check.ruleId ?? `text.${check.file}`,
    severity: check.severity ?? 'error',
    file: check.file,
    status: 'pass',
  };
}

export function validateWorkflowSkillText(checks, filesByPath) {
  const results = [];
  let failed = false;

  for (const check of checks) {
    const text = filesByPath[check.file];
    if (typeof text !== 'string') {
      failed = true;
      results.push({
        ruleId: check.ruleId ?? `text.${check.file}`,
        severity: check.severity ?? 'error',
        file: check.file,
        status: 'error',
        error: 'file_not_found',
      });
      continue;
    }

    const result = validateSingleCheck(check, text);
    if (result.status === 'fail') failed = true;
    results.push(result);
  }

  return {
    ok: !failed,
    checked: checks.length,
    results,
  };
}
