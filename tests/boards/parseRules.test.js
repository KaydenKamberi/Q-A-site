import { strictEqual, deepStrictEqual } from 'node:assert';
import { describe, it } from 'node:test';
import { parseRules } from '../../lib/boards/index.js';

describe('parseRules', () => {
  it('returns empty array for null', () => {
    deepStrictEqual(parseRules(null), []);
  });

  it('returns empty array for undefined', () => {
    deepStrictEqual(parseRules(undefined), []);
  });

  it('returns empty array for empty string', () => {
    deepStrictEqual(parseRules(''), []);
  });

  it('returns empty array for whitespace only', () => {
    deepStrictEqual(parseRules('   \n\n  '), []);
  });

  it('splits on newlines', () => {
    deepStrictEqual(parseRules('Rule 1\nRule 2\nRule 3'), ['Rule 1', 'Rule 2', 'Rule 3']);
  });

  it('trims each line', () => {
    deepStrictEqual(parseRules('  Rule 1  \n  Rule 2  '), ['Rule 1', 'Rule 2']);
  });

  it('filters out empty lines', () => {
    deepStrictEqual(parseRules('Rule 1\n\nRule 2\n\n'), ['Rule 1', 'Rule 2']);
  });

  it('filters out blank lines with spaces', () => {
    deepStrictEqual(parseRules('Rule 1\n   \nRule 2\n  \n'), ['Rule 1', 'Rule 2']);
  });

  it('handles Windows line endings', () => {
    deepStrictEqual(parseRules('Rule 1\r\nRule 2\r\nRule 3'), ['Rule 1', 'Rule 2', 'Rule 3']);
  });

  it('handles mixed line endings', () => {
    deepStrictEqual(parseRules('Rule 1\nRule 2\r\nRule 3'), ['Rule 1', 'Rule 2', 'Rule 3']);
  });

  it('preserves order', () => {
    deepStrictEqual(parseRules('Zebra\nApple\nMango'), ['Zebra', 'Apple', 'Mango']);
  });

  it('handles single rule', () => {
    deepStrictEqual(parseRules('Be nice'), ['Be nice']);
  });
});
