import { strictEqual } from 'node:assert';
import { describe, it } from 'node:test';
import { canEditBoard } from '../../lib/boards/index.js';

describe('canEditBoard', () => {
  it('returns true when user is creator', () => {
    const board = { creator_id: 42 };
    strictEqual(canEditBoard(42, board), true);
  });

  it('returns false when user is not creator', () => {
    const board = { creator_id: 42 };
    strictEqual(canEditBoard(99, board), false);
  });

  it('returns false when userId is undefined', () => {
    const board = { creator_id: 42 };
    strictEqual(canEditBoard(undefined, board), false);
  });

  it('returns false when userId is null', () => {
    const board = { creator_id: 42 };
    strictEqual(canEditBoard(null, board), false);
  });

  it('returns false when userId is 0', () => {
    const board = { creator_id: 42 };
    strictEqual(canEditBoard(0, board), false);
  });
});
