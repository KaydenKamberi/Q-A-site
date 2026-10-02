import { strictEqual, deepStrictEqual } from 'node:assert';
import { describe, it } from 'node:test';
import { validateBoardInput } from '../../lib/boards/index.js';

describe('validateBoardInput', () => {
  it('accepts valid input', () => {
    const result = validateBoardInput({
      name: 'apeuro',
      title: 'AP European History',
      description: 'A board for AP Euro',
      rules: 'Be nice\nNo spam'
    });
    strictEqual(result.ok, true);
    deepStrictEqual(result.value, {
      name: 'apeuro',
      title: 'AP European History',
      description: 'A board for AP Euro',
      rules: 'Be nice\nNo spam'
    });
  });

  it('lowercases name', () => {
    const result = validateBoardInput({
      name: 'APEuro',
      title: 'AP European History'
    });
    strictEqual(result.ok, true);
    strictEqual(result.value.name, 'apeuro');
  });

  it('trims all fields', () => {
    const result = validateBoardInput({
      name: '  apeuro  ',
      title: '  AP European History  ',
      description: '  A board for AP Euro  ',
      rules: '  Be nice  \n  No spam  '
    });
    strictEqual(result.ok, true);
    deepStrictEqual(result.value, {
      name: 'apeuro',
      title: 'AP European History',
      description: 'A board for AP Euro',
      rules: 'Be nice  \n  No spam'
    });
  });

  it('sets optional empty fields to null', () => {
    const result = validateBoardInput({
      name: 'apeuro',
      title: 'AP European History',
      description: '',
      rules: ''
    });
    strictEqual(result.ok, true);
    strictEqual(result.value.description, null);
    strictEqual(result.value.rules, null);
  });

  it('sets undefined optional fields to null', () => {
    const result = validateBoardInput({
      name: 'apeuro',
      title: 'AP European History'
    });
    strictEqual(result.ok, true);
    strictEqual(result.value.description, null);
    strictEqual(result.value.rules, null);
  });

  it('rejects name shorter than 3 chars', () => {
    const result = validateBoardInput({ name: 'ab', title: 'Test' });
    strictEqual(result.ok, false);
    strictEqual(result.errors.name, 'Name must be at least 3 characters');
  });

  it('rejects name longer than 30 chars', () => {
    const longName = 'a'.repeat(31);
    const result = validateBoardInput({ name: longName, title: 'Test' });
    strictEqual(result.ok, false);
    strictEqual(result.errors.name, 'Name must be at most 30 characters');
  });

  it('rejects name with uppercase (after lowercasing)', () => {
    const result = validateBoardInput({ name: 'New', title: 'Test' });
    strictEqual(result.ok, false);
    strictEqual(result.errors.name, 'That name is reserved');
  });

  it('rejects name with spaces', () => {
    const result = validateBoardInput({ name: 'has space', title: 'Test' });
    strictEqual(result.ok, false);
    strictEqual(result.errors.name, 'Name must contain only lowercase letters, digits, and underscores');
  });

  it('rejects reserved names', () => {
    const reserved = ['new', 'edit', 'delete', 'admin', 'settings', 'mod', 'api'];
    for (const name of reserved) {
      const result = validateBoardInput({ name, title: 'Test' });
      strictEqual(result.ok, false);
      strictEqual(result.errors.name, 'That name is reserved');
    }
  });

  it('rejects name with special chars', () => {
    const result = validateBoardInput({ name: 'bad-name', title: 'Test' });
    strictEqual(result.ok, false);
    strictEqual(result.errors.name, 'Name must contain only lowercase letters, digits, and underscores');
  });

  it('rejects missing name', () => {
    const result = validateBoardInput({ title: 'Test' });
    strictEqual(result.ok, false);
    strictEqual(result.errors.name, 'Name is required');
  });

  it('rejects empty name', () => {
    const result = validateBoardInput({ name: '', title: 'Test' });
    strictEqual(result.ok, false);
    strictEqual(result.errors.name, 'Name is required');
  });

  it('rejects title shorter than 1 char', () => {
    const result = validateBoardInput({ name: 'test', title: '' });
    strictEqual(result.ok, false);
    strictEqual(result.errors.title, 'Title is required');
  });

  it('rejects title longer than 100 chars', () => {
    const longTitle = 'a'.repeat(101);
    const result = validateBoardInput({ name: 'test', title: longTitle });
    strictEqual(result.ok, false);
    strictEqual(result.errors.title, 'Title must be at most 100 characters');
  });

  it('rejects missing title', () => {
    const result = validateBoardInput({ name: 'test' });
    strictEqual(result.ok, false);
    strictEqual(result.errors.title, 'Title is required');
  });

  it('rejects description longer than 500 chars', () => {
    const longDesc = 'a'.repeat(501);
    const result = validateBoardInput({ name: 'test', title: 'Test', description: longDesc });
    strictEqual(result.ok, false);
    strictEqual(result.errors.description, 'Description must be at most 500 characters');
  });

  it('rejects rules longer than 5000 chars', () => {
    const longRules = 'a'.repeat(5001);
    const result = validateBoardInput({ name: 'test', title: 'Test', rules: longRules });
    strictEqual(result.ok, false);
    strictEqual(result.errors.rules, 'Rules must be at most 5000 characters');
  });

  it('in edit mode ignores name', () => {
    const result = validateBoardInput(
      { title: 'AP European History' },
      { isEdit: true }
    );
    strictEqual(result.ok, true);
    strictEqual(result.value.name, undefined);
  });

  it('in edit mode still validates title', () => {
    const result = validateBoardInput({ title: '' }, { isEdit: true });
    strictEqual(result.ok, false);
    strictEqual(result.errors.title, 'Title is required');
  });

  it('returns multiple errors', () => {
    const result = validateBoardInput({ name: 'ab', title: '', description: 'a'.repeat(501) });
    strictEqual(result.ok, false);
    strictEqual(result.errors.name, 'Name must be at least 3 characters');
    strictEqual(result.errors.title, 'Title is required');
    strictEqual(result.errors.description, 'Description must be at most 500 characters');
  });
});
