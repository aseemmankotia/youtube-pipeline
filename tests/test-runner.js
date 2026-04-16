#!/usr/bin/env node
'use strict';
/**
 * test-runner.js — Entry point for the YouTube Pipeline test suite.
 * Runs tests/e2e.test.js via Node's built-in test runner and reports results.
 *
 * Usage:
 *   node tests/test-runner.js
 *   npm test
 */

const { execSync } = require('child_process');

console.log('\n🧪 YouTube Pipeline — End-to-End Test Suite');
console.log('='.repeat(52));
console.log(`Running at: ${new Date().toLocaleString()}`);
console.log('Node.js:    ' + process.version);
console.log('='.repeat(52) + '\n');

const startTime = Date.now();

try {
  execSync(
    'node --test tests/e2e.test.js',
    { encoding: 'utf8', stdio: 'inherit' },
  );

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n' + '='.repeat(52));
  console.log(`✅ All tests passed in ${duration}s`);
  console.log('='.repeat(52) + '\n');
  process.exit(0);

} catch (e) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n' + '='.repeat(52));
  console.log(`❌ Tests failed after ${duration}s`);
  console.log('='.repeat(52));

  if (e.stdout) {
    const failures = e.stdout
      .split('\n')
      .filter(l => l.includes('✗') || l.includes('FAIL') || l.includes('not ok'));
    if (failures.length > 0) {
      console.log('\nFailed tests:');
      failures.forEach(l => console.log('  ' + l.trim()));
    }
  }

  console.log('');
  process.exit(1);
}
