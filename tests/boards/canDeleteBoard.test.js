import { strictEqual } from 'node:assert';
import { describe, it } from 'node:test';
import { canDeleteBoard } from '../../lib/boards/index.js';

describe('canDeleteBoard', () => {
  it('returns true when user is creator and board is not general', () => {
    const board = { creator_id: 42, name: 'apeuro' };
    strictEqual(canDeleteBoard(42, board), true);
  });

  it('returns false when user is not creator', () => {
    const board = { creator_id: 42, name: 'apeuro' };
    strictEqual(canDeleteBoard(99, board), false);
  });

  it('returns false when board is general', () => {
    const board = { creator_id: 42, name: 'general' };
    strictEqual(canDeleteBoard(42, board), false);
  });

  it('returns false when user is not creator and board is general', () => {
    const board = { creator_id: 42, name: 'general' };
    strictEqual(canDeleteBoard(99, board), false);
  });

  it('returns false when userId is undefined', () => {
    const board = { creator_id: 42, name: 'apeuro' };
    strictEqual(canDeleteBoard(undefined, board), false);
  });

  it('returns false when userId is null', () => {
    const board = { creator_id: 42, name: 'apeuro' };
    strictEqual(canDeleteBoard(null, board), false);
  });

  it('returns false for general board even with matching creator', () => {
    const board = { creator_id: 1, name: 'general' };
    strictEqual(canDeleteBoard(1, board), false);
  });
});
