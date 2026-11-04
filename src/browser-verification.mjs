import { isDeepStrictEqual } from 'node:util';
export function classifyBrowserObservation(row) {
  if (
    !row?.after ||
    !Array.isArray(row.after.errors) ||
    !Array.isArray(row.requests) ||
    !Array.isArray(row.exceptions) ||
    row.exceptions.length
  )
    return { passed: false, classification: 'infrastructure_error' };
  const errors = row.after.errors.join('\n'),
    input = row.parameterValues?.['query.parameters'];
  const rejected = (message) =>
    !row.after.loading && row.requests.length === 0 && errors.includes(message);
  let passed = false,
    expectedFailure = false;
  if (row.mode === 'invalid-array') {
    if (row.variant === 'sdk-only') {
      expectedFailure = true;
      passed =
        input === 'not-an-array' &&
        row.observationMs >= 7000 &&
        row.after.loading &&
        row.requests.length === 0 &&
        !errors;
    } else if (row.variant === 'neither-fixed') {
      expectedFailure = true;
      passed =
        input === 'not-an-array' &&
        !errors &&
        ((row.after.loading && row.observationMs >= 7000) ||
          (row.requests.length === 1 && row.after.body.includes('Server response')));
    } else passed = input === 'not-an-array' && rejected('Value must be an array');
  } else if (row.mode === 'missing-array') passed = rejected('Required field is not provided');
  else if (row.mode === 'encoded-union' && ['neither-fixed', 'sdk-only'].includes(row.variant)) {
    expectedFailure = true;
    passed = input === '["a","b"]' && rejected('Required field is not provided');
  } else if (row.mode === 'encoded-union' && row.variant === 'ui-only') {
    expectedFailure = true;
    passed =
      input === '["a","b"]' &&
      !row.after.loading &&
      !errors &&
      row.requests.length === 1 &&
      isDeepStrictEqual(row.requests[0].values, ['["a","b"]']) &&
      row.after.body.includes('Server response');
  } else if (['typed-array', 'encoded-union', 'string-only'].includes(row.mode)) {
    const expected = row.mode === 'string-only' ? ['["a","b"]'] : ['a', 'b'];
    const correctInput =
      row.mode === 'typed-array' ? isDeepStrictEqual(input, ['a', 'b']) : input === '["a","b"]';
    passed =
      correctInput &&
      !row.after.loading &&
      !errors &&
      row.requests.length === 1 &&
      isDeepStrictEqual(row.requests[0].values, expected) &&
      row.after.body.includes('Server response');
  }
  return {
    passed: !!passed,
    classification: passed
      ? expectedFailure
        ? 'expected_partial_failure_observed'
        : 'passed'
      : 'behavioural_failure',
  };
}
