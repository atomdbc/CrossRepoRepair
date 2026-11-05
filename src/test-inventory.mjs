const sdk = 'CrossRepoRepair independent SDK acceptance ';
const ui = 'CrossRepoRepair independent UI acceptance ';
export const canonicalNames = {
  sdk: [
    ...['B01 union', 'B02 anyOf', 'B02 oneOf', 'B02 nested'].map(
      (n) => sdk + n + ' decodes an array representation before form/explode serialization'
    ),
    sdk + 'B03 preserves an ordinary string under a string-only schema',
    sdk + 'B04 preserves a JSON-looking string under a string-only schema',
    sdk + 'regression: an already-typed array is still serialized correctly',
  ],
  ui: [
    ui + 'B05 rejects a non-array string under an array-only schema',
    ui + 'B06 retains the missing-required-array error',
    ui + 'regression: accepts a valid Immutable array value',
    ui + 'regression: preserves required validation for an empty string',
    ui + 'B04 does not reject a JSON-looking string under a string-only schema',
  ],
};
export const minimumRegressions = { sdk: 36, ui: 137 };
export function inventorySatisfied(report, { names = null, minimum = 1 } = {}) {
  const assertions = report?.testResults?.flatMap((s) => s.assertionResults || []);
  if (
    !Array.isArray(assertions) ||
    !Number.isInteger(report.numTotalTests) ||
    report.numTotalTests < minimum ||
    assertions.length !== report.numTotalTests ||
    assertions.some((a) => !['passed', 'failed'].includes(a.status)) ||
    report.numPassedTests + report.numFailedTests !== report.numTotalTests
  )
    return false;
  if (
    report.numPassedTests !== assertions.filter((a) => a.status === 'passed').length ||
    report.numFailedTests !== assertions.filter((a) => a.status === 'failed').length
  )
    return false;
  return (
    !names ||
    (assertions.length === names.length &&
      names.every((name) => assertions.filter((a) => a.fullName === name).length === 1))
  );
}
